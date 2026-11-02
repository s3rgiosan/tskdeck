//! Finding the `tsk` binary.

use std::ffi::{OsStr, OsString};
use std::path::{Path, PathBuf};
#[cfg(unix)]
use std::time::Duration;

#[cfg(unix)]
const LOGIN_SHELL_TIMEOUT: Duration = Duration::from_secs(2);

/// First existing of: the user's setting, `tsk` on `login_path`, then each candidate.
pub fn locate(
    setting: Option<&Path>,
    login_path: Option<&OsStr>,
    candidates: &[PathBuf],
) -> Option<PathBuf> {
    if let Some(path) = setting.filter(|p| p.is_file()) {
        return Some(path.to_path_buf());
    }
    if let Some(login_path) = login_path
        && let Ok(found) = which::which_in("tsk", Some(login_path), ".")
    {
        return Some(found);
    }
    candidates.iter().find(|c| c.is_file()).cloned()
}

pub fn default_candidates(home: Option<&Path>, local_app_data: Option<&Path>) -> Vec<PathBuf> {
    let mut out = Vec::new();
    if let Some(home) = home {
        out.push(home.join(".local").join("bin").join("tsk"));
    }
    out.push(PathBuf::from("/opt/homebrew/bin/tsk"));
    out.push(PathBuf::from("/usr/local/bin/tsk"));
    out.push(PathBuf::from("/home/linuxbrew/.linuxbrew/bin/tsk"));
    if cfg!(windows)
        && let Some(base) = local_app_data
    {
        out.push(base.join("Programs").join("tsk").join("bin").join("tsk.exe"));
    }
    out
}

/// The `PATH` a login shell would give a terminal, which a GUI app launched from
/// the Dock or Finder does not inherit. Gives up after two seconds.
#[cfg(unix)]
pub fn login_shell_path() -> Option<OsString> {
    let shell = std::env::var_os("SHELL")
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| OsString::from("/bin/sh"));
    shell_path_from(Path::new(&shell), LOGIN_SHELL_TIMEOUT)
}

/// Runs `shell -lc 'printf %s "$PATH"'` and returns its output, or `None` when the
/// shell fails or the whole read does not finish within `timeout`.
#[cfg(unix)]
fn shell_path_from(shell: &Path, timeout: Duration) -> Option<OsString> {
    use std::io::Read;
    use std::os::unix::ffi::OsStringExt;
    use std::process::{Command, Stdio};
    use std::sync::mpsc;
    use std::thread;
    use std::time::Instant;

    let mut child = Command::new(shell)
        .args(["-lc", "printf %s \"$PATH\""])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .ok()?;
    let mut stdout = child.stdout.take()?;
    let (tx, rx) = mpsc::channel();
    thread::spawn(move || {
        let mut buf = Vec::new();
        let _ = stdout.read_to_end(&mut buf);
        let _ = tx.send(buf);
    });

    let deadline = Instant::now() + timeout;
    let bytes = rx.recv_timeout(timeout);
    let remaining = deadline.saturating_duration_since(Instant::now());
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break Some(status),
            Ok(None) if !remaining.is_zero() && Instant::now() < deadline => {
                thread::sleep(Duration::from_millis(20))
            }
            _ => break None,
        }
    };
    let (Ok(bytes), Some(status)) = (bytes, status) else {
        let _ = child.kill();
        let _ = child.wait();
        return None;
    };
    if !status.success() || bytes.is_empty() {
        return None;
    }
    Some(OsString::from_vec(bytes))
}

#[cfg(not(unix))]
pub fn login_shell_path() -> Option<OsString> {
    std::env::var_os("PATH")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    /// The binary's file name: Windows finds `tsk` through its `.exe` extension.
    const TSK_FILE: &str = if cfg!(windows) { "tsk.exe" } else { "tsk" };

    fn make_tsk(dir: &Path) -> PathBuf {
        fs::create_dir_all(dir).unwrap();
        let file = dir.join(TSK_FILE);
        fs::write(&file, "#!/bin/sh\n").unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&file, fs::Permissions::from_mode(0o755)).unwrap();
        }
        file
    }

    /// The file on disk that `path` names. On Windows the lookup spells the extension the way
    /// `PATHEXT` does, and temporary folders can come back as 8.3 short names.
    fn on_disk(path: Option<PathBuf>) -> Option<PathBuf> {
        path.map(|p| fs::canonicalize(p).unwrap())
    }

    #[test]
    fn locate_prefers_setting_then_path_then_candidates() {
        let tmp = tempfile::tempdir().unwrap();
        let a = make_tsk(&tmp.path().join("a"));
        let b = make_tsk(&tmp.path().join("b"));
        let c = make_tsk(&tmp.path().join("c"));
        let candidates = vec![tmp.path().join("missing").join("tsk"), c.clone()];
        let b_dir: OsString = tmp.path().join("b").into_os_string();

        assert_eq!(locate(Some(&a), Some(&b_dir), &candidates), Some(a));
        assert_eq!(on_disk(locate(None, Some(&b_dir), &candidates)), on_disk(Some(b)));
        assert_eq!(locate(None, None, &candidates), Some(c));
        assert_eq!(locate(None, None, &[tmp.path().join("nope")]), None);
    }

    #[test]
    fn missing_setting_falls_through() {
        let tmp = tempfile::tempdir().unwrap();
        let c = make_tsk(&tmp.path().join("c"));
        let missing = tmp.path().join("gone").join("tsk");
        assert_eq!(locate(Some(&missing), None, std::slice::from_ref(&c)), Some(c));
    }

    #[test]
    fn default_candidates_cover_unix_locations() {
        let list = default_candidates(Some(Path::new("/home/u")), None);
        assert_eq!(list[0], PathBuf::from("/home/u/.local/bin/tsk"));
        assert!(list.contains(&PathBuf::from("/opt/homebrew/bin/tsk")));
        assert!(list.contains(&PathBuf::from("/usr/local/bin/tsk")));
        assert!(list.contains(&PathBuf::from("/home/linuxbrew/.linuxbrew/bin/tsk")));
    }

    #[cfg(unix)]
    #[test]
    fn login_shell_path_returns_a_path() {
        let path = login_shell_path().expect("login shell PATH");
        assert!(!path.is_empty());
    }

    #[cfg(unix)]
    #[test]
    fn login_shell_path_gives_up_when_a_child_holds_stdout() {
        use std::os::unix::fs::PermissionsExt;
        use std::sync::mpsc;
        use std::time::Instant;

        let tmp = tempfile::tempdir().unwrap();
        let shell = tmp.path().join("fake-shell");
        fs::write(&shell, "#!/bin/sh\nsleep 10 &\nprintf %s /bin\n").unwrap();
        fs::set_permissions(&shell, fs::Permissions::from_mode(0o755)).unwrap();

        let (tx, rx) = mpsc::channel();
        std::thread::spawn(move || {
            let started = Instant::now();
            let result = shell_path_from(&shell, Duration::from_secs(1));
            let _ = tx.send((result, started.elapsed()));
        });
        let (result, elapsed) = rx
            .recv_timeout(Duration::from_secs(4))
            .expect("shell_path_from hung past the bound");
        assert_eq!(result, None);
        assert!(elapsed < Duration::from_secs(3), "took {elapsed:?}");
    }
}
