//! Tauri commands that expose the `tsk` module and settings to the UI.

use std::ffi::OsString;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, RwLock};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::settings::{self, Settings};
use crate::tsk::args::{self, CaptureInput, EditInput, ListOptions, Scope, StatusChange, StepOp};
use crate::tsk::locate;
use crate::tsk::model::{AddResult, TaskDetail, TaskRow};
use crate::tsk::runner::{Tsk, TskError};
use crate::tsk::version::{MIN_TSK, parse_version};
use crate::updates::{UPDATE_PROGRESS_EVENT, UpdateInfo, UpdateManager};
use crate::watch::StoreWatcher;

/// The event every window receives with the settings just saved.
pub const SETTINGS_CHANGED: &str = "settings-changed";

pub struct AppState {
    pub tsk: RwLock<Option<Tsk>>,
    pub settings: Mutex<Settings>,
    pub settings_path: PathBuf,
    pub watcher: StoreWatcher,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TskInfo {
    pub path: String,
    pub version: String,
    pub supported: bool,
    pub minimum: String,
}

/// Finds the `tsk` binary from the user's setting, the login-shell `PATH` and the
/// default install locations.
pub fn locate_tsk(setting: Option<&std::path::Path>) -> Option<Tsk> {
    let login_path = locate::login_shell_path();
    let local_app_data = std::env::var_os("LOCALAPPDATA").map(PathBuf::from);
    let candidates =
        locate::default_candidates(dirs::home_dir().as_deref(), local_app_data.as_deref());
    let bin = locate::locate(setting, login_path.as_deref(), &candidates)?;
    Some(tsk_with_path(bin, login_path))
}

/// A `Tsk` that runs with the login-shell `PATH`, when there is one, so the commands
/// it spawns resolve the same way as in a terminal.
fn tsk_with_path(bin: PathBuf, login_path: Option<OsString>) -> Tsk {
    let env = login_path
        .map(|path| vec![(OsString::from("PATH"), path)])
        .unwrap_or_default();
    Tsk { bin, env }
}

/// Locates `tsk` again from the saved path setting and caches the result.
/// Finding nothing clears the cache, so later commands report tsk as not found.
pub fn relocate(
    settings: &Mutex<Settings>,
    slot: &RwLock<Option<Tsk>>,
    locate: impl FnOnce(Option<&std::path::Path>) -> Option<Tsk>,
) -> Result<(), String> {
    let setting = settings.lock().map_err(|e| e.to_string())?.tsk_path.clone();
    let located = locate(setting.as_deref());
    *slot.write().unwrap_or_else(|e| e.into_inner()) = located;
    Ok(())
}

/// A copy of the current `Tsk` that can move into a blocking task.
fn current_tsk(state: &AppState) -> Result<Tsk, TskError> {
    let guard = state.tsk.read().unwrap_or_else(|e| e.into_inner());
    let tsk = guard.as_ref().ok_or(TskError::NotFound)?;
    Ok(Tsk {
        bin: tsk.bin.clone(),
        env: tsk.env.clone(),
    })
}

async fn blocking<T, F>(tsk: Tsk, work: F) -> Result<T, TskError>
where
    T: Send + 'static,
    F: FnOnce(Tsk) -> Result<T, TskError> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(move || work(tsk))
        .await
        .map_err(|e| TskError::Unexpected {
            exit: None,
            message: e.to_string(),
        })?
}

/// Runs `work` with the current `tsk`, then starts the store watch if this
/// command created the store directory.
async fn with_tsk<T, F>(state: &AppState, work: F) -> Result<T, TskError>
where
    T: Send + 'static,
    F: FnOnce(Tsk) -> Result<T, TskError> + Send + 'static,
{
    let tsk = current_tsk(state)?;
    let result = blocking(tsk, work).await;
    if result.is_ok() {
        state.watcher.ensure();
    }
    result
}

#[tauri::command]
pub async fn tsk_info(state: State<'_, AppState>) -> Result<TskInfo, TskError> {
    with_tsk(&state, |tsk| {
        let output = tsk.run(&["--version".to_string()])?;
        let parsed = parse_version(&output).ok_or_else(|| TskError::Parse {
            message: format!("unrecognised version output: {}", output.trim()),
        })?;
        Ok(TskInfo {
            path: tsk.bin.to_string_lossy().into_owned(),
            version: format!("{}.{}.{}", parsed.0, parsed.1, parsed.2),
            supported: parsed >= MIN_TSK,
            minimum: format!("{}.{}.{}", MIN_TSK.0, MIN_TSK.1, MIN_TSK.2),
        })
    })
    .await
}

#[tauri::command]
pub async fn list_scope(
    state: State<'_, AppState>,
    scope: Scope,
    options: ListOptions,
) -> Result<Vec<TaskRow>, TskError> {
    with_tsk(&state, move |tsk| {
        tsk.json(&args::list_args(&scope, &options))
    })
    .await
}

#[tauri::command]
pub async fn get_task(state: State<'_, AppState>, number: u64) -> Result<TaskDetail, TskError> {
    with_tsk(&state, move |tsk| {
        let details: Vec<TaskDetail> = tsk.json(&args::task_args(number))?;
        details.into_iter().next().ok_or_else(|| TskError::Parse {
            message: format!("tsk returned no task for T{number}"),
        })
    })
    .await
}

#[tauri::command]
pub async fn capture(state: State<'_, AppState>, input: CaptureInput) -> Result<u64, TskError> {
    with_tsk(&state, move |tsk| {
        let added: AddResult = tsk.json(&args::add_args(&input))?;
        Ok(added.number)
    })
    .await
}

#[tauri::command]
pub async fn set_status(
    state: State<'_, AppState>,
    number: u64,
    change: StatusChange,
) -> Result<(), TskError> {
    with_tsk(&state, move |tsk| {
        tsk.run(&args::status_args(number, &change)).map(drop)
    })
    .await
}

#[tauri::command]
pub async fn edit_task(
    state: State<'_, AppState>,
    number: u64,
    input: EditInput,
) -> Result<(), TskError> {
    with_tsk(&state, move |tsk| {
        tsk.run(&args::edit_args(number, &input)).map(drop)
    })
    .await
}

#[tauri::command]
pub async fn step(state: State<'_, AppState>, number: u64, op: StepOp) -> Result<(), TskError> {
    with_tsk(&state, move |tsk| {
        tsk.run(&args::steps_args(number, &op)).map(drop)
    })
    .await
}

#[tauri::command]
pub async fn reply(
    state: State<'_, AppState>,
    number: u64,
    text: String,
    send: bool,
) -> Result<(), TskError> {
    with_tsk(&state, move |tsk| {
        tsk.run(&args::reply_args(number, &text, send)).map(drop)
    })
    .await
}

#[tauri::command]
pub async fn set_archived(
    state: State<'_, AppState>,
    number: u64,
    archived: bool,
) -> Result<(), TskError> {
    with_tsk(&state, move |tsk| {
        tsk.run(&args::archive_args(number, archived)).map(drop)
    })
    .await
}

#[tauri::command]
pub async fn get_settings(state: State<'_, AppState>) -> Result<Settings, String> {
    let guard = state.settings.lock().map_err(|e| e.to_string())?;
    Ok(guard.clone())
}

/// Writes the settings file and keeps the settings in `slot`. Returns whether
/// `tsk_path` changed. A `tsk_path` must be absolute.
pub fn store_settings(
    slot: &Mutex<Settings>,
    path: &std::path::Path,
    settings: Settings,
) -> Result<bool, String> {
    if settings
        .tsk_path
        .as_deref()
        .is_some_and(|p| !p.is_absolute())
    {
        return Err("The tsk path must be absolute.".to_string());
    }
    let mut guard = slot.lock().map_err(|e| e.to_string())?;
    let changed = guard.tsk_path != settings.tsk_path;
    settings::save(path, &settings).map_err(|e| e.to_string())?;
    *guard = settings;
    Ok(changed)
}

/// Stores the settings, locates `tsk` again when `tsk_path` changed, and only then
/// passes the saved settings to `notify`, so listeners see the new `tsk` already in place.
pub fn apply_settings(
    slot: &Mutex<Settings>,
    path: &std::path::Path,
    settings: Settings,
    tsk_slot: &RwLock<Option<Tsk>>,
    locate: impl FnOnce(Option<&std::path::Path>) -> Option<Tsk>,
    notify: impl FnOnce(&Settings),
) -> Result<(), String> {
    let saved = settings.clone();
    let path_changed = store_settings(slot, path, settings)?;
    if path_changed {
        relocate(slot, tsk_slot, locate)?;
    }
    notify(&saved);
    Ok(())
}

/// Saves the settings, locates `tsk` again when `tsk_path` changed and tells every
/// window with a `settings-changed` event.
#[tauri::command]
pub async fn save_settings(app: AppHandle, settings: Settings) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        apply_settings(
            &state.settings,
            &state.settings_path,
            settings,
            &state.tsk,
            locate_tsk,
            |saved| {
                let _ = app.emit(SETTINGS_CHANGED, saved);
            },
        )
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Opens the settings window, or brings it to the front when it is already open.
/// Async because building a window from a synchronous command deadlocks on Windows.
#[tauri::command]
pub async fn open_settings(app: AppHandle) -> Result<(), String> {
    crate::windows::open_settings(&app).map_err(|e| e.to_string())
}

/// Locates `tsk` again, for example after it was installed or removed while
/// tskdeck was running.
#[tauri::command]
pub async fn relocate_tsk(app: AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        relocate(&state.settings, &state.tsk, locate_tsk)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Looks for a newer release now; resolves to it, or to `None` when tskdeck is current.
#[tauri::command]
pub async fn check_for_updates(
    updates: State<'_, Arc<UpdateManager>>,
) -> Result<Option<UpdateInfo>, String> {
    updates.check_now().await.map_err(|e| e.to_string())
}

/// The release the last successful check found.
#[tauri::command]
pub fn pending_update(updates: State<'_, Arc<UpdateManager>>) -> Option<UpdateInfo> {
    updates.pending()
}

/// Downloads and installs the pending update, emitting `update-progress` along the way, then
/// relaunches the app.
#[tauri::command]
pub async fn install_update(
    app: AppHandle,
    updates: State<'_, Arc<UpdateManager>>,
) -> Result<(), String> {
    let emitter = app.clone();
    let progress = move |progress| {
        let _ = emitter.emit(UPDATE_PROGRESS_EVENT, progress);
    };
    updates
        .install(&progress)
        .await
        .map_err(|e| e.to_string())?;
    app.request_restart();
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fake(bin: &str) -> Tsk {
        Tsk {
            bin: PathBuf::from(bin),
            env: Vec::new(),
        }
    }

    /// A `tsk` path that is absolute on every platform.
    fn abs_tsk() -> PathBuf {
        std::env::temp_dir().join("test").join("tsk")
    }

    fn cached(slot: &RwLock<Option<Tsk>>) -> Option<PathBuf> {
        slot.read().unwrap().as_ref().map(|t| t.bin.clone())
    }

    fn settings_with(path: Option<&str>) -> Mutex<Settings> {
        Mutex::new(Settings {
            tsk_path: path.map(PathBuf::from),
            ..Settings::default()
        })
    }

    #[test]
    fn relocate_looks_up_the_saved_path_and_caches_the_result() {
        let slot = RwLock::new(None);
        relocate(&settings_with(Some("/opt/test/tsk")), &slot, |setting| {
            assert_eq!(setting, Some(std::path::Path::new("/opt/test/tsk")));
            Some(fake("/opt/test/tsk"))
        })
        .unwrap();
        assert_eq!(cached(&slot), Some(PathBuf::from("/opt/test/tsk")));
    }

    #[test]
    fn storing_settings_saves_them() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("settings.json");
        let slot = Mutex::new(Settings::default());
        let next = Settings {
            sidebar_hidden: true,
            ..Settings::default()
        };
        let changed = store_settings(&slot, &path, next.clone()).unwrap();
        assert!(!changed);
        assert_eq!(settings::load(&path), next);
        assert_eq!(*slot.lock().unwrap(), next);
    }

    #[test]
    fn storing_settings_reports_a_changed_tsk_path() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("settings.json");
        let slot = Mutex::new(Settings::default());
        let next = Settings {
            tsk_path: Some(abs_tsk()),
            ..Settings::default()
        };
        assert!(store_settings(&slot, &path, next).unwrap());
    }

    #[test]
    fn storing_a_relative_tsk_path_is_rejected() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("settings.json");
        let slot = Mutex::new(Settings::default());
        let next = Settings {
            tsk_path: Some(PathBuf::from("bin/tsk")),
            ..Settings::default()
        };
        assert_eq!(
            store_settings(&slot, &path, next),
            Err("The tsk path must be absolute.".to_string())
        );
        assert!(!path.exists());
        assert_eq!(*slot.lock().unwrap(), Settings::default());
    }

    #[test]
    fn storing_settings_that_cannot_be_written_fails() {
        let tmp = tempfile::tempdir().unwrap();
        let blocker = tmp.path().join("file");
        std::fs::write(&blocker, "").unwrap();
        let slot = Mutex::new(Settings::default());
        let result = store_settings(&slot, &blocker.join("settings.json"), Settings::default());
        assert!(result.is_err());
    }

    #[test]
    fn applying_settings_locates_tsk_before_notifying() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("settings.json");
        let slot = Mutex::new(Settings::default());
        let tsk_slot = RwLock::new(None);
        let next = Settings {
            tsk_path: Some(abs_tsk()),
            ..Settings::default()
        };
        let mut seen_at_notify = None;
        apply_settings(
            &slot,
            &path,
            next.clone(),
            &tsk_slot,
            |_| Some(fake(abs_tsk().to_str().unwrap())),
            |saved| {
                assert_eq!(saved, &next);
                seen_at_notify = Some(cached(&tsk_slot));
            },
        )
        .unwrap();
        assert_eq!(seen_at_notify, Some(Some(abs_tsk())));
    }

    #[test]
    fn applying_settings_that_cannot_be_written_notifies_nobody() {
        let tmp = tempfile::tempdir().unwrap();
        let blocker = tmp.path().join("file");
        std::fs::write(&blocker, "").unwrap();
        let slot = Mutex::new(Settings::default());
        let tsk_slot = RwLock::new(None);
        let mut notified = false;
        let result = apply_settings(
            &slot,
            &blocker.join("settings.json"),
            Settings::default(),
            &tsk_slot,
            |_| None,
            |_| notified = true,
        );
        assert!(result.is_err());
        assert!(!notified);
    }

    #[test]
    fn tsk_runs_with_the_login_shell_path() {
        let tsk = tsk_with_path(PathBuf::from("/opt/test/tsk"), Some("/a:/b".into()));
        assert_eq!(
            tsk.env,
            vec![(OsString::from("PATH"), OsString::from("/a:/b"))]
        );
        assert!(
            tsk_with_path(PathBuf::from("/opt/test/tsk"), None)
                .env
                .is_empty()
        );
    }

    #[test]
    fn relocate_clears_the_cache_when_nothing_is_found() {
        let slot = RwLock::new(Some(fake("/gone/tsk")));
        relocate(&settings_with(None), &slot, |_| None).unwrap();
        assert_eq!(cached(&slot), None);
    }
}
