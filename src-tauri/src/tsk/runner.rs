//! Running the `tsk` binary and mapping its exit codes to typed errors.

use std::ffi::OsString;
use std::path::PathBuf;
use std::process::Command;

use serde::Serialize;
use serde::de::DeserializeOwned;

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

pub struct Tsk {
    pub bin: PathBuf,
    pub env: Vec<(OsString, OsString)>,
}

impl Tsk {
    pub fn run(&self, args: &[String]) -> Result<String, TskError> {
        let mut cmd = Command::new(&self.bin);
        cmd.args(args);
        for (key, value) in &self.env {
            cmd.env(key, value);
        }
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x0800_0000);
        }
        let output = cmd.output().map_err(|e| TskError::Spawn {
            message: e.to_string(),
        })?;
        let stdout = String::from_utf8_lossy(&output.stdout).into_owned();
        let stderr = String::from_utf8_lossy(&output.stderr).into_owned();
        match output.status.code() {
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
    fn missing_binary_is_spawn_error() {
        let tsk = Tsk {
            bin: "/nonexistent/tsk".into(),
            env: vec![],
        };
        assert!(matches!(tsk.run(&[]), Err(TskError::Spawn { .. })));
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
