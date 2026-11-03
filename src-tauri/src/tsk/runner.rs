//! Running the `tsk` binary and mapping its exit codes to typed errors.

use std::ffi::OsString;
use std::io::{self, Read};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::mpsc::{self, Receiver};
use std::thread;
use std::time::{Duration, Instant};

use serde::Serialize;
use serde::de::DeserializeOwned;

/// How long a `tsk` command may run before it is killed.
const RUN_TIMEOUT: Duration = Duration::from_secs(60);

/// How long to keep reading output after `tsk` exits, for when a process it started
/// still holds the pipes.
const PIPE_GRACE: Duration = Duration::from_secs(2);

#[derive(Debug, Clone, PartialEq, Serialize, thiserror::Error)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum TskError {
    #[error("tsk was not found")]
    NotFound,
    #[error("could not run tsk: {message}")]
    Spawn { message: String },
    #[error("tsk refused ({code}): {message}")]
    Refused { code: String, message: String },
    #[error("tsk usage error: {message}")]
    Usage { message: String },
    #[error("tsk store error: {message}")]
    Store { message: String },
    #[error("tsk failed unexpectedly (exit {exit:?}): {message}")]
    Unexpected { exit: Option<i32>, message: String },
    #[error("tsk did not finish within {seconds} seconds")]
    Timeout { seconds: u64 },
    #[error("could not read tsk output: {message}")]
    Parse { message: String },
}

/// Splits a first line shaped `tsk <cmd>: <code>: <message>` into `(code, message)`.
/// Anything else yields `("unknown", trimmed stderr)`.
pub fn parse_refusal(stderr: &str) -> (String, String) {
    let first = stderr.lines().next().unwrap_or("");
    if let Some(rest) = first.strip_prefix("tsk ") {
        let mut parts = rest.splitn(3, ": ");
        if let (Some(cmd), Some(code), Some(message)) = (parts.next(), parts.next(), parts.next())
        {
            let code_ok = !code.is_empty() && !code.contains(char::is_whitespace);
            if !cmd.is_empty() && code_ok {
                return (code.to_string(), message.trim().to_string());
            }
        }
    }
    ("unknown".to_string(), stderr.trim().to_string())
}

/// Reads a pipe to its end on a helper thread so a full pipe never stalls the child.
fn read_in_thread(pipe: Option<impl Read + Send + 'static>) -> Receiver<Vec<u8>> {
    let (tx, rx) = mpsc::channel();
    thread::spawn(move || {
        let mut buf = Vec::new();
        if let Some(mut pipe) = pipe {
            let _ = pipe.read_to_end(&mut buf);
        }
        let _ = tx.send(buf);
    });
    rx
}

/// The text a helper thread read, or what it has when a grandchild keeps the pipe
/// open past `wait`.
fn collect(rx: &Receiver<Vec<u8>>, wait: Duration) -> String {
    let bytes = rx.recv_timeout(wait).unwrap_or_default();
    String::from_utf8_lossy(&bytes).into_owned()
}

pub struct Tsk {
    pub bin: PathBuf,
    pub env: Vec<(OsString, OsString)>,
}

impl Tsk {
    pub fn run(&self, args: &[String]) -> Result<String, TskError> {
        self.run_within(args, RUN_TIMEOUT)
    }

    /// Runs `tsk` and kills it when it has not exited within `timeout`.
    fn run_within(&self, args: &[String], timeout: Duration) -> Result<String, TskError> {
        let mut cmd = Command::new(&self.bin);
        cmd.args(args)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        for (key, value) in &self.env {
            cmd.env(key, value);
        }
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x0800_0000);
        }
        let mut child = cmd.spawn().map_err(|e| match e.kind() {
            io::ErrorKind::NotFound => TskError::NotFound,
            _ => TskError::Spawn {
                message: e.to_string(),
            },
        })?;
        let stdout_rx = read_in_thread(child.stdout.take());
        let stderr_rx = read_in_thread(child.stderr.take());

        let deadline = Instant::now() + timeout;
        let status = loop {
            match child.try_wait() {
                Ok(Some(status)) => break status,
                Ok(None) if Instant::now() < deadline => {
                    thread::sleep(Duration::from_millis(10));
                }
                Ok(None) => {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err(TskError::Timeout {
                        seconds: timeout.as_secs(),
                    });
                }
                Err(e) => {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err(TskError::Spawn {
                        message: e.to_string(),
                    });
                }
            }
        };
        let remaining = deadline
            .saturating_duration_since(Instant::now())
            .min(PIPE_GRACE);
        let stdout = collect(&stdout_rx, remaining);
        let stderr = collect(&stderr_rx, remaining);
        match status.code() {
            Some(0) => Ok(stdout),
            Some(1) => {
                let (code, message) = parse_refusal(&stderr);
                Err(TskError::Refused { code, message })
            }
            Some(2) => Err(TskError::Usage {
                message: stderr.trim().to_string(),
            }),
            Some(3) => Err(TskError::Store {
                message: stderr.trim().to_string(),
            }),
            exit => Err(TskError::Unexpected {
                exit,
                message: stderr.trim().to_string(),
            }),
        }
    }

    pub fn json<T: DeserializeOwned>(&self, args: &[String]) -> Result<T, TskError> {
        let stdout = self.run(args)?;
        serde_json::from_str(&stdout).map_err(|e| TskError::Parse {
            message: e.to_string(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_refusal_code() {
        assert_eq!(
            parse_refusal("tsk status: unknown-task: T12 is not on the board\n"),
            ("unknown-task".into(), "T12 is not on the board".into())
        );
    }

    #[test]
    fn unrecognised_stderr_is_unknown() {
        assert_eq!(
            parse_refusal("tsk list: --group project and --sort project need --all\n"),
            (
                "unknown".into(),
                "tsk list: --group project and --sort project need --all".into()
            )
        );
        assert_eq!(parse_refusal(""), ("unknown".into(), String::new()));
    }

    #[test]
    fn missing_binary_is_not_found() {
        let tsk = Tsk {
            bin: "/nonexistent/tsk".into(),
            env: vec![],
        };
        assert_eq!(tsk.run(&[]), Err(TskError::NotFound));
    }

    #[cfg(unix)]
    #[test]
    fn unrunnable_binary_is_spawn_error() {
        let tmp = tempfile::tempdir().unwrap();
        let file = tmp.path().join("tsk");
        std::fs::write(&file, "#!/bin/sh\n").unwrap();
        let tsk = Tsk {
            bin: file,
            env: vec![],
        };
        assert!(matches!(tsk.run(&[]), Err(TskError::Spawn { .. })));
    }

    #[cfg(unix)]
    #[test]
    fn a_hung_tsk_is_killed_after_the_deadline() {
        use std::os::unix::fs::PermissionsExt;
        use std::time::Instant;

        let tmp = tempfile::tempdir().unwrap();
        let script = tmp.path().join("tsk");
        std::fs::write(&script, "#!/bin/sh\nsleep 30\n").unwrap();
        std::fs::set_permissions(&script, std::fs::Permissions::from_mode(0o755)).unwrap();
        let tsk = Tsk {
            bin: script,
            env: vec![],
        };
        let started = Instant::now();
        let result = tsk.run_within(&[], Duration::from_millis(300));
        assert_eq!(result, Err(TskError::Timeout { seconds: 0 }));
        assert!(started.elapsed() < Duration::from_secs(5));
    }

    #[cfg(unix)]
    #[test]
    fn output_larger_than_a_pipe_buffer_is_read_in_full() {
        let big = "x".repeat(100_000);
        assert_eq!(fake(&big, "", 0).run(&[]).unwrap().len(), big.len());
    }

    #[test]
    fn timeout_error_serialises_with_kind_tag() {
        let json = serde_json::to_string(&TskError::Timeout { seconds: 60 }).unwrap();
        assert_eq!(json, r#"{"kind":"timeout","seconds":60}"#);
    }

    #[cfg(unix)]
    fn fake(stdout: &str, stderr: &str, exit: i32) -> Tsk {
        Tsk {
            bin: PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/fake-tsk.sh"),
            env: vec![
                ("FAKE_STDOUT".into(), stdout.into()),
                ("FAKE_STDERR".into(), stderr.into()),
                ("FAKE_EXIT".into(), exit.to_string().into()),
            ],
        }
    }

    #[cfg(unix)]
    #[test]
    fn maps_exit_codes() {
        assert_eq!(fake("hello", "", 0).run(&[]), Ok("hello".to_string()));
        assert_eq!(
            fake("", "tsk add: empty-title: title is empty", 1).run(&[]),
            Err(TskError::Refused {
                code: "empty-title".into(),
                message: "title is empty".into()
            })
        );
        assert!(matches!(fake("", "bad flag", 2).run(&[]), Err(TskError::Usage { .. })));
        assert!(matches!(fake("", "disk", 3).run(&[]), Err(TskError::Store { .. })));
        assert_eq!(
            fake("", "boom", 9).run(&[]),
            Err(TskError::Unexpected {
                exit: Some(9),
                message: "boom".into()
            })
        );
    }

    #[cfg(unix)]
    #[test]
    fn json_parse_error_is_reported() {
        let result: Result<Vec<u32>, _> = fake("not json", "", 0).json(&[]);
        assert!(matches!(result, Err(TskError::Parse { .. })));
        let ok: Vec<u32> = fake("[1,2]", "", 0).json(&[]).unwrap();
        assert_eq!(ok, vec![1, 2]);
    }

    #[test]
    fn error_serialises_with_kind_tag() {
        let json = serde_json::to_string(&TskError::NotFound).unwrap();
        assert_eq!(json, r#"{"kind":"notFound"}"#);
    }
}
