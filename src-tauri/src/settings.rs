//! tskdeck's own settings file.

use std::collections::BTreeMap;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Copy, Debug, Default, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum OpenMode {
    Overlay,
    #[default]
    #[serde(other)]
    Beside,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub open_mode: OpenMode,
    pub keymap: BTreeMap<String, Vec<String>>,
    pub tsk_path: Option<PathBuf>,
    pub sidebar_hidden: bool,
    /// Names given to projects in tskdeck, keyed by the project's full path.
    pub project_names: BTreeMap<String, String>,
}

/// A missing file gives the defaults. An unreadable or invalid file is moved to
/// `<name>.<unix-seconds>.bad` and the defaults are returned.
pub fn load(path: &Path) -> Settings {
    let text = match fs::read_to_string(path) {
        Ok(text) => text,
        Err(e) if e.kind() == io::ErrorKind::NotFound => return Settings::default(),
        Err(_) => return quarantine(path),
    };
    serde_json::from_str(&text).unwrap_or_else(|_| quarantine(path))
}

/// Writes `<name>.tmp` next to the file, then renames it into place.
pub fn save(path: &Path, settings: &Settings) -> io::Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let json = serde_json::to_string_pretty(settings).map_err(io::Error::other)?;
    let tmp = sibling(path, ".tmp");
    fs::write(&tmp, json)?;
    fs::rename(&tmp, path)
}

fn quarantine(path: &Path) -> Settings {
    let seconds = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_secs());
    let mut target = sibling(path, &format!(".{seconds}.bad"));
    let mut n = 1;
    while target.exists() {
        target = sibling(path, &format!(".{seconds}-{n}.bad"));
        n += 1;
    }
    let _ = fs::rename(path, target);
    Settings::default()
}

fn sibling(path: &Path, suffix: &str) -> PathBuf {
    let mut name = path
        .file_name()
        .map(|n| n.to_os_string())
        .unwrap_or_default();
    name.push(suffix);
    path.with_file_name(name)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn settings_round_trip() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("settings.json");
        let mut keymap = BTreeMap::new();
        keymap.insert("status.done".to_string(), vec!["ctrl+enter".to_string()]);
        let mut project_names = BTreeMap::new();
        project_names.insert(
            "/example/site/wp-content".to_string(),
            "Example".to_string(),
        );
        let settings = Settings {
            open_mode: OpenMode::Overlay,
            keymap,
            tsk_path: Some(PathBuf::from("/example/bin/tsk")),
            sidebar_hidden: true,
            project_names,
        };
        save(&path, &settings).unwrap();
        assert_eq!(load(&path), settings);
        assert!(!tmp.path().join("settings.json.tmp").exists());
    }

    #[test]
    fn missing_file_gives_default() {
        let tmp = tempfile::tempdir().unwrap();
        assert_eq!(load(&tmp.path().join("settings.json")), Settings::default());
    }

    #[test]
    fn corrupt_settings_fall_back_and_are_kept() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("settings.json");
        std::fs::write(&path, "{").unwrap();
        assert_eq!(load(&path), Settings::default());
        assert_eq!(bad_files(tmp.path()).len(), 1);
        assert!(!path.exists());
    }

    #[test]
    fn a_second_corrupt_file_keeps_the_first_quarantined_copy() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("settings.json");
        std::fs::write(&path, "{first").unwrap();
        load(&path);
        std::fs::write(&path, "{second").unwrap();
        load(&path);
        let mut contents: Vec<String> = bad_files(tmp.path())
            .iter()
            .map(|p| std::fs::read_to_string(p).unwrap())
            .collect();
        contents.sort();
        assert_eq!(contents, vec!["{first", "{second"]);
    }

    #[test]
    fn an_unknown_open_mode_falls_back_without_losing_other_settings() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("settings.json");
        std::fs::write(&path, r#"{"openMode":"sideways","sidebarHidden":true}"#).unwrap();
        let loaded = load(&path);
        assert_eq!(loaded.open_mode, OpenMode::Beside);
        assert!(loaded.sidebar_hidden);
        assert!(bad_files(tmp.path()).is_empty());
    }

    fn bad_files(dir: &Path) -> Vec<PathBuf> {
        std::fs::read_dir(dir)
            .unwrap()
            .map(|e| e.unwrap().path())
            .filter(|p| {
                let name = p.file_name().unwrap().to_string_lossy();
                name.starts_with("settings.json.") && name.ends_with(".bad")
            })
            .collect()
    }

    #[test]
    fn partial_settings_fill_defaults() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("settings.json");
        std::fs::write(&path, r#"{"openMode":"overlay"}"#).unwrap();
        let loaded = load(&path);
        assert_eq!(loaded.open_mode, OpenMode::Overlay);
        assert!(loaded.keymap.is_empty());
        assert!(!loaded.sidebar_hidden);
        assert!(loaded.project_names.is_empty());
    }

    #[test]
    fn project_names_are_stored_by_path() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("settings.json");
        std::fs::write(
            &path,
            r#"{"projectNames":{"/example/site/wp-content":"Example"}}"#,
        )
        .unwrap();
        let loaded = load(&path);
        assert_eq!(
            loaded.project_names.get("/example/site/wp-content"),
            Some(&"Example".to_string())
        );
    }
}
