//! Where tsk keeps its store.

use std::ffi::OsString;
use std::path::PathBuf;

/// `TSK_STATE_DIR` if set; else `~/.tsk` (macOS, Linux) or `%LOCALAPPDATA%\tsk`
/// (Windows, falling back to `~/.tsk` when `LOCALAPPDATA` is unset).
pub fn store_dir(
    state_env: Option<OsString>,
    home: Option<PathBuf>,
    local_app_data: Option<PathBuf>,
) -> Option<PathBuf> {
    if let Some(dir) = state_env.filter(|v| !v.is_empty()) {
        return Some(PathBuf::from(dir));
    }
    if cfg!(windows)
        && let Some(base) = local_app_data
    {
        return Some(base.join("tsk"));
    }
    home.map(|h| h.join(".tsk"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn store_dir_honours_env() {
        assert_eq!(
            store_dir(Some("/x".into()), Some("/home/u".into()), None),
            Some("/x".into())
        );
    }

    #[cfg(not(windows))]
    #[test]
    fn store_dir_unix_default() {
        assert_eq!(
            store_dir(None, Some("/home/u".into()), None),
            Some("/home/u/.tsk".into())
        );
    }

    #[cfg(windows)]
    #[test]
    fn store_dir_windows_default() {
        assert_eq!(
            store_dir(None, Some("C:\\Users\\u".into()), Some("C:\\L".into())),
            Some(PathBuf::from("C:\\L").join("tsk"))
        );
        assert_eq!(
            store_dir(None, Some("C:\\Users\\u".into()), None),
            Some(PathBuf::from("C:\\Users\\u").join(".tsk"))
        );
    }
}
