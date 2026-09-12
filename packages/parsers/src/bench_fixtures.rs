//! Where the `bench` benches look for their generated fixtures.
//!
//! These benches read files produced by the Python generators under
//! `scripts/`, so both sides have to agree on one location. That location
//! used to be a hardcoded `/tmp/<name>` in each bench — but /tmp is a tmpfs
//! on systemd distros, meaning multi-hundred-megabyte fixtures were held in
//! RAM and could only spill to swap. See `scripts/fixture_paths.py`, which
//! implements this same resolution order for the generator side; keep the
//! two in step.
//!
//! Resolution order:
//!   1. `$WAFERTOOLS_FIXTURES`          — explicit override, wins outright
//!   2. `$XDG_CACHE_HOME/wafertools/fixtures`
//!   3. `~/.cache/wafertools/fixtures`  — the XDG default
//!
//! Read-only: the directory is never created here. A bench whose fixture is
//! missing prints a SKIP naming the generator to run, which is the existing
//! behaviour and the reason these are `#[test]`s rather than hard failures.

use std::path::PathBuf;

/// Directory fixtures are read from.
pub fn fixture_dir() -> PathBuf {
    if let Some(dir) = std::env::var_os("WAFERTOOLS_FIXTURES") {
        if !dir.is_empty() {
            return PathBuf::from(dir);
        }
    }
    let cache = match std::env::var_os("XDG_CACHE_HOME") {
        Some(x) if !x.is_empty() => PathBuf::from(x),
        // No HOME is a broken environment, but a bench must not panic for it:
        // fall back to a relative path so the caller reports a clean SKIP.
        _ => match std::env::var_os("HOME") {
            Some(h) => PathBuf::from(h).join(".cache"),
            None => PathBuf::from(".cache"),
        },
    };
    cache.join("wafertools").join("fixtures")
}

/// Full path for a fixture basename, e.g. `fixture("bench.stdf")`.
pub fn fixture(name: &str) -> PathBuf {
    fixture_dir().join(name)
}
