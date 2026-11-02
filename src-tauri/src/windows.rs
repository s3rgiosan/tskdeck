//! Windows other than the main one.

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

pub const SETTINGS_LABEL: &str = "settings";

/// Opens the settings window, or shows and focuses it when it is already open.
/// The page reads `#settings` to render only the settings view, and titles the window after
/// the pane it shows. On macOS the page draws the title bar: the window title, hidden from the
/// frame, sits centred above the pane toolbar, with the window controls in the corner.
pub fn open_settings(app: &AppHandle) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window(SETTINGS_LABEL) {
        window.unminimize()?;
        window.show()?;
        return window.set_focus();
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
    builder.build()?;
    Ok(())
}
