//! Window chrome state the webview cannot read on its own: full screen and Reduce Transparency.

use std::collections::HashMap;
use std::sync::Mutex;

use tauri::{Emitter, Manager, Runtime, Window, WindowEvent};

/// Sent to a window with `true` when it enters full screen and `false` when it leaves.
pub const FULLSCREEN_EVENT: &str = "fullscreen-changed";

/// Each window's last announced full-screen state, so a change is sent once.
#[derive(Default)]
pub struct FullscreenStates(Mutex<HashMap<String, bool>>);

impl FullscreenStates {
    /// Records a window's full-screen state; true when it differs from the last one recorded.
    /// A window starts out windowed.
    pub fn record(&self, label: &str, fullscreen: bool) -> bool {
        let mut states = self.0.lock().unwrap_or_else(|e| e.into_inner());
        states.insert(label.to_owned(), fullscreen).unwrap_or(false) != fullscreen
    }
}

/// Tells a window when it enters or leaves full screen, which shows as a resize.
pub fn on_window_event<R: Runtime>(window: &Window<R>, event: &WindowEvent) {
    if !matches!(event, WindowEvent::Resized(_)) {
        return;
    }
    let Ok(fullscreen) = window.is_fullscreen() else {
        return;
    };
    let Some(states) = window.try_state::<FullscreenStates>() else {
        return;
    };
    if states.record(window.label(), fullscreen) {
        let _ = window.emit_to(window.label(), FULLSCREEN_EVENT, fullscreen);
    }
}

/// Whether the system asks apps to replace translucent materials with opaque ones.
#[tauri::command]
pub fn reduce_transparency() -> bool {
    #[cfg(target_os = "macos")]
    {
        objc2_app_kit::NSWorkspace::sharedWorkspace().accessibilityDisplayShouldReduceTransparency()
    }
    #[cfg(not(target_os = "macos"))]
    {
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_window_starts_windowed() {
        let states = FullscreenStates::default();
        assert!(!states.record("main", false));
    }

    #[test]
    fn reports_each_change_once() {
        let states = FullscreenStates::default();
        assert!(states.record("main", true));
        assert!(!states.record("main", true));
        assert!(states.record("main", false));
        assert!(!states.record("main", false));
    }

    #[test]
    fn keeps_windows_apart() {
        let states = FullscreenStates::default();
        assert!(states.record("main", true));
        assert!(!states.record("settings", false));
    }
}
