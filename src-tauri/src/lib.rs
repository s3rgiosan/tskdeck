pub mod chrome;
pub mod commands;
pub mod menu;
pub mod settings;
pub mod tsk;
pub mod watch;
pub mod windows;

use std::path::PathBuf;
use std::sync::{Mutex, RwLock};

use tauri::{Emitter, Manager};

use commands::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        // The main window reopens at its last size and position; settings always opens centred.
        .plugin(
            tauri_plugin_window_state::Builder::new()
                .with_denylist(&[windows::SETTINGS_LABEL])
                .build(),
        );
    #[cfg(target_os = "macos")]
    let builder = builder.menu(menu::build);
    builder
        .on_menu_event(menu::handle)
        .manage(chrome::FullscreenStates::default())
        .manage(menu::MenuMemory::default())
        .manage(menu::PullDown::default())
        .manage(menu::ZoomLevels::default())
        .on_window_event(|window, event| {
            chrome::on_window_event(window, event);
            menu::on_window_event(window, event);
        })
        .setup(|app| {
            let settings_path = app.path().app_config_dir()?.join("settings.json");
            let loaded = settings::load(&settings_path);
            let tsk = commands::locate_tsk(loaded.tsk_path.as_deref());

            let store = tsk::store_dir::store_dir(
                std::env::var_os("TSK_STATE_DIR"),
                dirs::home_dir(),
                std::env::var_os("LOCALAPPDATA").map(PathBuf::from),
            );
            let handle = app.handle().clone();
            let watcher = watch::StoreWatcher::new(store, move || {
                let _ = handle.emit("board-changed", ());
            });
            watcher.ensure();

            app.manage(menu::task_menu(app.handle())?);

            app.manage(AppState {
                tsk: RwLock::new(tsk),
                settings: Mutex::new(loaded),
                settings_path,
                watcher,
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::tsk_info,
            commands::list_scope,
            commands::get_task,
            commands::capture,
            commands::set_status,
            commands::edit_task,
            commands::step,
            commands::reply,
            commands::set_archived,
            commands::get_settings,
            commands::save_settings,
            commands::relocate_tsk,
            commands::open_settings,
            chrome::reduce_transparency,
            menu::menu_state,
            menu::show_task_menu,
            menu::show_pull_down,
            menu::zoom,
            menu::open_docs,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
