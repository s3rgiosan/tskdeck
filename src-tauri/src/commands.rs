//! Tauri commands that expose the `tsk` module and settings to the UI.

use std::path::PathBuf;
use std::sync::{Mutex, RwLock};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::settings::{self, Settings};
use crate::tsk::args::{self, CaptureInput, EditInput, ListOptions, Scope, StatusChange, StepOp};
use crate::tsk::locate;
use crate::tsk::model::{AddResult, TaskDetail, TaskRow};
use crate::tsk::runner::{Tsk, TskError};
use crate::tsk::version::{MIN_TSK, parse_version};
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
    Some(Tsk {
        bin,
        env: Vec::new(),
    })
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

/// Writes the settings file, keeps the settings in `slot` and passes the saved settings
/// to `notify`. Returns whether `tsk_path` changed.
pub fn store_settings(
    slot: &Mutex<Settings>,
    path: &std::path::Path,
    settings: Settings,
    notify: impl FnOnce(&Settings),
) -> Result<bool, String> {
    let mut guard = slot.lock().map_err(|e| e.to_string())?;
    let changed = guard.tsk_path != settings.tsk_path;
    settings::save(path, &settings).map_err(|e| e.to_string())?;
    notify(&settings);
    *guard = settings;
    Ok(changed)
}

/// Saves the settings, tells every window with a `settings-changed` event and, when
/// `tsk_path` changed, locates `tsk` again.
#[tauri::command]
pub async fn save_settings(
    app: AppHandle,
    state: State<'_, AppState>,
    settings: Settings,
) -> Result<(), String> {
    let path_changed = store_settings(&state.settings, &state.settings_path, settings, |saved| {
        let _ = app.emit(SETTINGS_CHANGED, saved);
    })?;
    if path_changed {
        relocate(&state.settings, &state.tsk, locate_tsk)?;
    }
    Ok(())
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

#[cfg(test)]
mod tests {
    use super::*;

    fn fake(bin: &str) -> Tsk {
        Tsk {
            bin: PathBuf::from(bin),
            env: Vec::new(),
        }
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
    fn storing_settings_saves_them_and_hands_them_to_notify() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("settings.json");
        let slot = Mutex::new(Settings::default());
        let next = Settings {
            sidebar_hidden: true,
            ..Settings::default()
        };
        let mut seen = None;
        let changed =
            store_settings(&slot, &path, next.clone(), |s| seen = Some(s.clone())).unwrap();
        assert!(!changed);
        assert_eq!(seen, Some(next.clone()));
        assert_eq!(settings::load(&path), next);
        assert_eq!(*slot.lock().unwrap(), next);
    }

    #[test]
    fn storing_settings_reports_a_changed_tsk_path() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("settings.json");
        let slot = Mutex::new(Settings::default());
        let next = Settings {
            tsk_path: Some(PathBuf::from("/opt/test/tsk")),
            ..Settings::default()
        };
        assert!(store_settings(&slot, &path, next, |_| {}).unwrap());
    }

    #[test]
    fn storing_settings_that_cannot_be_written_notifies_nobody() {
        let tmp = tempfile::tempdir().unwrap();
        let blocker = tmp.path().join("file");
        std::fs::write(&blocker, "").unwrap();
        let slot = Mutex::new(Settings::default());
        let mut notified = false;
        let result = store_settings(
            &slot,
            &blocker.join("settings.json"),
            Settings::default(),
            |_| notified = true,
        );
        assert!(result.is_err());
        assert!(!notified);
    }

    #[test]
    fn relocate_clears_the_cache_when_nothing_is_found() {
        let slot = RwLock::new(Some(fake("/gone/tsk")));
        relocate(&settings_with(None), &slot, |_| None).unwrap();
        assert_eq!(cached(&slot), None);
    }
}
