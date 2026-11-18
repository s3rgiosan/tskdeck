//! Parsing of `tsk --version` output.

pub const MIN_TSK: (u32, u32, u32) = (0, 13, 0);

/// The first tsk that keeps project titles (`tsk project title`, `project_title` on rows).
pub const PROJECT_TITLES_TSK: (u32, u32, u32) = (0, 14, 0);

/// Reads `tsk 0.13.0` into `(0, 13, 0)`.
pub fn parse_version(output: &str) -> Option<(u32, u32, u32)> {
    let token = output.trim().strip_prefix("tsk ")?.split_whitespace().next()?;
    let mut parts = token.split('.');
    let major = parts.next()?.parse().ok()?;
    let minor = parts.next()?.parse().ok()?;
    let patch_part = parts.next()?;
    let digits: String = patch_part.chars().take_while(char::is_ascii_digit).collect();
    let patch = digits.parse().ok()?;
    Some((major, minor, patch))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_version() {
        assert_eq!(parse_version("tsk 0.13.0\n"), Some((0, 13, 0)));
        assert_eq!(parse_version("nope"), None);
    }

    #[test]
    fn ignores_prerelease_suffix() {
        assert_eq!(parse_version("tsk 1.2.3-rc1"), Some((1, 2, 3)));
    }

    #[test]
    fn min_version_ordering() {
        assert!((0, 12, 9) < MIN_TSK);
        assert!((0, 13, 1) >= MIN_TSK);
    }

    #[test]
    fn project_titles_start_at_0_14_0() {
        assert!((0, 13, 9) < PROJECT_TITLES_TSK);
        assert!((0, 14, 0) >= PROJECT_TITLES_TSK);
    }
}
