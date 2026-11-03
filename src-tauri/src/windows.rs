//! Windows other than the main one.

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

pub const SETTINGS_LABEL: &str = "settings";

/// Opens the settings window, or shows and focuses it when it is already open.
/// The page reads `#settings` to render only the settings view, and titles the window after
/// the pane it shows. On macOS the page draws the title bar: the window title, hidden from the
/// frame, sits centred above the pane toolbar, with the window controls in the corner.
pub fn open_settings(app: &AppHandle) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window(SETTINGS_LABEL) {
        return focus(&window);
    }
    let builder = WebviewWindowBuilder::new(
        app,
        SETTINGS_LABEL,
        WebviewUrl::App("index.html#settings".into()),
    )
    .title("General")
    .inner_size(560.0, 520.0)
    .resizable(false)
    .minimizable(false)
    .maximizable(false)
    .center();
    #[cfg(target_os = "macos")]
    let builder = builder
        .title_bar_style(tauri::TitleBarStyle::Overlay)
        .hidden_title(true)
        .traffic_light_position(tauri::LogicalPosition::new(9.0, 18.0));
    let Err(error) = builder.build() else {
        return Ok(());
    };
    // Two calls racing to create the window: the loser focuses the winner's window.
    match app.get_webview_window(SETTINGS_LABEL) {
        Some(window) => focus(&window),
        None => Err(error),
    }
}

fn focus(window: &tauri::WebviewWindow) -> tauri::Result<()> {
    window.unminimize()?;
    window.show()?;
    window.set_focus()
}
