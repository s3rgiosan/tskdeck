//! Watching the tsk store directory for changes.

use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use notify::{RecommendedWatcher, RecursiveMode};
use notify_debouncer_mini::{DebounceEventResult, Debouncer, new_debouncer};

pub const DEBOUNCE: Duration = Duration::from_millis(150);

/// True when any path is the store file itself.
pub fn is_store_change(paths: &[PathBuf]) -> bool {
    paths
        .iter()
        .any(|p| p.file_name().is_some_and(|n| n == "tsk.json"))
}

/// Calls `on_change` after each debounced burst of events that touches `tsk.json`.
/// The watch is non-recursive and on the directory, so it survives the store
/// file being replaced by rename. Dropping the returned value stops the watch.
pub fn watch_store(
    dir: &Path,
    on_change: impl Fn() + Send + 'static,
) -> notify::Result<Debouncer<RecommendedWatcher>> {
    let mut debouncer = new_debouncer(DEBOUNCE, move |result: DebounceEventResult| {
        if let Ok(events) = result {
            let paths: Vec<PathBuf> = events.into_iter().map(|e| e.path).collect();
            if is_store_change(&paths) {
                on_change();
            }
        }
    })?;
    debouncer
        .watcher()
        .watch(dir, RecursiveMode::NonRecursive)?;
    Ok(debouncer)
}

/// Watches the store directory once it exists. A store directory that is missing
/// at launch, or removed and created again, is picked up by a later `ensure`, for
/// example after the next tsk command creates it.
pub struct StoreWatcher {
    dir: Option<PathBuf>,
    on_change: Arc<dyn Fn() + Send + Sync>,
    watcher: Mutex<Option<Debouncer<RecommendedWatcher>>>,
}

impl StoreWatcher {
    pub fn new(dir: Option<PathBuf>, on_change: impl Fn() + Send + Sync + 'static) -> Self {
        Self {
            dir,
            on_change: Arc::new(on_change),
            watcher: Mutex::new(None),
        }
    }

    /// Starts the watch when it is not running and the directory exists.
    /// Returns whether the watch is running afterwards.
    pub fn ensure(&self) -> bool {
        let mut guard = self.watcher.lock().unwrap_or_else(|e| e.into_inner());
        if self.keep_live(&mut guard) {
            return true;
        }
        let Some(dir) = self.dir.as_deref().filter(|d| d.is_dir()) else {
            return false;
        };
        let on_change = Arc::clone(&self.on_change);
        *guard = watch_store(dir, move || on_change()).ok();
        guard.is_some()
    }

    pub fn is_running(&self) -> bool {
        let mut guard = self.watcher.lock().unwrap_or_else(|e| e.into_inner());
        self.keep_live(&mut guard)
    }

    /// Whether the watch is running on a directory that still exists. A watch whose
    /// directory is gone is dropped, so `ensure` can watch the directory once it is
    /// created again.
    fn keep_live(&self, watcher: &mut Option<Debouncer<RecommendedWatcher>>) -> bool {
        let dir_exists = self.dir.as_deref().is_some_and(Path::is_dir);
        if !dir_exists {
            *watcher = None;
        }
        watcher.is_some()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::time::Instant;

    #[test]
    fn store_change_filter() {
        assert!(is_store_change(&["/s/tsk.json".into()]));
        assert!(!is_store_change(&[
            "/s/tsk.json.lock".into(),
            "/s/update.json".into()
        ]));
    }

    #[test]
    fn store_watcher_starts_once_the_directory_appears() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path().join("store");
        let count = Arc::new(AtomicUsize::new(0));
        let seen = Arc::clone(&count);
        let watcher = StoreWatcher::new(Some(dir.clone()), move || {
            seen.fetch_add(1, Ordering::SeqCst);
        });

        assert!(!watcher.ensure());
        assert!(!watcher.is_running());

        std::fs::create_dir(&dir).unwrap();
        assert!(watcher.ensure());
        assert!(watcher.is_running());

        std::fs::write(dir.join("tsk.json"), "{}").unwrap();
        let deadline = Instant::now() + Duration::from_secs(3);
        while count.load(Ordering::SeqCst) == 0 && Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(50));
        }
        assert!(count.load(Ordering::SeqCst) >= 1);
    }

    #[test]
    fn store_watcher_watches_a_recreated_directory_again() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path().join("store");
        std::fs::create_dir(&dir).unwrap();
        let count = Arc::new(AtomicUsize::new(0));
        let seen = Arc::clone(&count);
        let watcher = StoreWatcher::new(Some(dir.clone()), move || {
            seen.fetch_add(1, Ordering::SeqCst);
        });
        assert!(watcher.ensure());

        std::fs::remove_dir_all(&dir).unwrap();
        assert!(!watcher.is_running());

        std::fs::create_dir(&dir).unwrap();
        assert!(watcher.ensure());
        std::fs::write(dir.join("tsk.json"), "{}").unwrap();
        let deadline = Instant::now() + Duration::from_secs(3);
        while count.load(Ordering::SeqCst) == 0 && Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(50));
        }
        assert!(count.load(Ordering::SeqCst) >= 1);
    }

    #[test]
    fn store_watcher_without_a_directory_never_runs() {
        let watcher = StoreWatcher::new(None, || {});
        assert!(!watcher.ensure());
        assert!(!watcher.is_running());
    }

    #[test]
    fn watcher_survives_repeated_replace() {
        let tmp = tempfile::tempdir().unwrap();
        let count = Arc::new(AtomicUsize::new(0));
        let seen = Arc::clone(&count);
        let _watcher = watch_store(tmp.path(), move || {
            seen.fetch_add(1, Ordering::SeqCst);
        })
        .unwrap();

        for i in 0..5 {
            let tmp_file = tmp.path().join("tsk.json.tmp");
            std::fs::write(&tmp_file, format!("{{\"n\":{i}}}")).unwrap();
            std::fs::rename(&tmp_file, tmp.path().join("tsk.json")).unwrap();
            std::thread::sleep(Duration::from_millis(300));
        }

        let deadline = Instant::now() + Duration::from_secs(3);
        while count.load(Ordering::SeqCst) < 5 && Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(50));
        }
        assert!(
            count.load(Ordering::SeqCst) >= 5,
            "got {}",
            count.load(Ordering::SeqCst)
        );
    }
}
