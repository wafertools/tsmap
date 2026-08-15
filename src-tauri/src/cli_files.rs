// Parses tsmap's command-line file arguments — positional data-file paths,
// `--list <file>` (one path per line), `--tests <file>` (test-selection CSV),
// `--splits <file>` (wafer-splits CSV) — into absolute paths. Used identically
// for the initial launch's own `std::env::args()` and for argv forwarded by
// `tauri_plugin_single_instance` on a relaunch, so there is exactly one place
// that understands this syntax regardless of which process saw it.
//
// Argument *syntax* is validated unconditionally, before any Tauri/GTK/
// single-instance machinery runs (see `strip_snap_gtk_env_vars`'s sibling
// checks at the top of `run()` in lib.rs) — an unrecognized flag or a missing
// flag value is a hard error printed to the invoking terminal, never silently
// swallowed or misread as a data-file path. Because this happens before a
// process ever decides whether it's the primary instance or a forwarded one,
// a second `tsmap --typo`'d launch reports its own error in its own terminal
// rather than being silently forwarded (or dropped) into a running instance.

use serde::{Deserialize, Serialize};
use std::io::{BufRead, IsTerminal};
use std::path::Path;

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CliArgs {
    pub files: Vec<String>,
    pub tests: Option<String>,
    pub splits: Option<String>,
    pub url: Option<String>,
    pub url_format: Option<String>,
    /// Path to a `Header-Name: value` per line file (blank lines/`#` comments
    /// skipped) — headers to send with the `--url` fetch, e.g. an
    /// `Authorization` bearer token. Optional; only meaningful paired with
    /// `--url`. Kept out of argv/process-list/shell-history on purpose,
    /// mirroring `--tests`/`--splits` rather than accepting the header value
    /// directly as a flag argument.
    pub url_headers: Option<String>,
    /// Set instead of consuming `url`/`url_format`/`url_headers` into `files`
    /// when `commands::fetch_url::resolve_cli_url` (`lib.rs`) fails to fetch
    /// the URL — surfaced by the frontend via `log('error', ...)`, the same
    /// non-fatal treatment a bad `--splits`/`--tests` file already gets.
    pub url_error: Option<String>,
}

impl CliArgs {
    /// `--url` is a file source in its own right — used *without* any
    /// positional FILE args by design, since the URL supplies the data. If
    /// this only checked `files` (as it used to, back when `url` didn't
    /// exist), a `--url`-only launch would be misreported as empty and
    /// silently dropped by `set_startup_args` before the frontend ever saw
    /// it — and the same for `url_error`: a failed fetch with no other files
    /// given must still reach the frontend so the failure is visible, not
    /// silently dropped. `tests`/`splits` are deliberately not checked here
    /// — they're modifiers applied to files/url, not a data source on their
    /// own, and have no defined meaning in isolation.
    pub fn is_empty(&self) -> bool {
        self.files.is_empty() && self.url.is_none() && self.url_error.is_none()
    }
}

pub const USAGE: &str = "\
tsmap [OPTIONS] [FILE...]

Open one or more wafer-map data files (STDF, ATDF, CSV, JSON, or a .zip/.gz
of one of those). If tsmap is already running, files are handed to that
window instead of opening a new one.

Arguments:
  FILE...              One or more data files to open.

Options:
  --list <FILE>         A text file of data-file paths, one per line
                         (blank lines and '#' comments skipped).
  --tests <FILE>        A test-selection list (same CSV the test selector's
                         \"Save list\" button produces) — pre-fills the
                         selector; it is still always shown for confirmation.
  --splits <FILE>       A wafer-splits CSV (same format the Splits… dialog
                         saves/loads) — applied automatically once loaded.
  --url <URL>           A data URL to fetch and open, in place of (or
                         alongside) FILE/--list. Must be paired with
                         --url-format. Without --url-headers, the URL must be
                         self-authenticating (e.g. a presigned link) — tsmap
                         sends no auth of its own by default.
  --url-format <FORMAT> The format of --url's data: one of stdf, atdf, csv,
                         json, parquet. Required whenever --url is given.
  --url-headers <FILE>  Headers to send with the --url fetch, one
                         'Header-Name: value' per line (blank lines and '#'
                         comments skipped) — e.g. an Authorization bearer
                         token. Optional; only meaningful with --url.
  --new-instance         Open a new, independent window even if tsmap is
                         already running.
  -h, --help             Show this help and exit.
  -V, --version          Print the version and exit.

With no FILE/--list given, tsmap reads a newline-delimited list of data-file
paths from stdin, but only if stdin is piped (never when run interactively).

A tsmap://open?url=<URL>&format=<FORMAT> link, registered as this app's URL
scheme handler, is equivalent to --url/--url-format together (e.g. a link on
a web page can launch tsmap this way) — cannot be combined with --url,
--url-format, or another tsmap:// link.
";

/// True if `args` (raw, unfiltered) requests help — checked first, before any
/// other parsing, so `--help` always wins even alongside other/bad flags.
pub fn wants_help(args: &[String]) -> bool {
    args.iter().any(|a| a == "--help" || a == "-h")
}

/// True if `args` (raw, unfiltered) requests the version. Checked alongside
/// `wants_help`, before any other parsing, for the same reason: without it the
/// unrecognized-flag rule below would reject `--version` outright, which is
/// what it did until v0.1.24.
pub fn wants_version(args: &[String]) -> bool {
    args.iter().any(|a| a == "--version" || a == "-V")
}

/// The string printed by `--version`. `CARGO_PKG_VERSION` comes from
/// `src-tauri/Cargo.toml`, which `scripts/check-version-sync.js` already keeps
/// in step with `package.json` and `Cargo.lock` — so this cannot drift from the
/// version shown in the app's own banner.
pub fn version_string() -> String {
    format!("tsmap {}", env!("CARGO_PKG_VERSION"))
}

fn resolve_path(raw: &str, cwd: &Path) -> String {
    let p = Path::new(raw);
    if p.is_absolute() { raw.to_string() } else { cwd.join(p).to_string_lossy().into_owned() }
}

fn is_content_line(line: &str) -> bool {
    !line.is_empty() && !line.starts_with('#')
}

/// A `tsmap://...?url=<data url>&format=<format>` deep-link URI, as
/// registered via `tauri-plugin-deep-link` (`lib.rs`'s `.setup()` and
/// `tauri.conf.json`'s `plugins.deep-link.desktop.schemes`). On Linux and
/// Windows — the platforms this app targets — clicking such a link makes the
/// OS launch tsmap with the *whole URI* as a single plain argv entry, no
/// different in kind from a file path; this is the one place that recognizes
/// that shape and turns it into the same `url`/`format` pair `--url`/
/// `--url-format` would set, so everything downstream (`resolve_cli_url` and
/// the entire single-instance-forwarding path) needs no separate handling for
/// it at all. Deliberately carries no header/auth parameter — a deep-link URI
/// has nowhere safe to carry a credential, the same reasoning that already
/// rules out headers on the web `?dataUrl=` path (see `fetch_url.rs`'s module
/// doc); `--url-headers` remains a *local file* the launcher already has.
fn parse_deep_link(uri: &str) -> Result<(String, String), String> {
    let parsed = reqwest::Url::parse(uri).map_err(|e| format!("Malformed tsmap:// link \"{uri}\": {e}"))?;
    let mut url = None;
    let mut format = None;
    for (key, value) in parsed.query_pairs() {
        match key.as_ref() {
            "url" => url = Some(value.into_owned()),
            "format" => format = Some(value.into_owned()),
            _ => {}
        }
    }
    match (url, format) {
        (Some(url), Some(format)) => Ok((url, format)),
        (None, _) => Err(format!("tsmap:// link \"{uri}\" is missing its \"url\" parameter")),
        (_, None) => Err(format!("tsmap:// link \"{uri}\" is missing its \"format\" parameter")),
    }
}

fn read_list_lines(path: &str, cwd: &Path) -> Result<Vec<String>, String> {
    let list_path = resolve_path(path, cwd);
    let text = std::fs::read_to_string(&list_path)
        .map_err(|e| format!("Failed to read list file {list_path}: {e}"))?;
    Ok(text.lines().map(str::trim).filter(|l| is_content_line(l)).map(|l| resolve_path(l, cwd)).collect())
}

struct RawArgs {
    files: Vec<String>,
    list: Option<String>,
    tests: Option<String>,
    splits: Option<String>,
    url: Option<String>,
    url_format: Option<String>,
    url_headers: Option<String>,
}

/// Recognized flags that take a value — `--list`/`--tests`/`--splits`/`--url`/
/// `--url-format`/`--url-headers`.
const VALUE_FLAGS: &[&str] =
    &["--list", "--tests", "--splits", "--url", "--url-format", "--url-headers"];
/// Recognized flags that take no value — handled elsewhere (`--new-instance`
/// before this point, `--help`/`-h` and `--version`/`-V` via `wants_help`/
/// `wants_version` before this point too) but still accepted here so they're
/// never misreported as unrecognized.
const BARE_FLAGS: &[&str] = &["--new-instance", "--help", "-h", "--version", "-V"];

/// Splits raw argv (already excluding argv[0]) into its parts. A token
/// starting with `-` that isn't one of the flags above is a hard error
/// (`unrecognized option`), never silently dropped or treated as a file path
/// — that includes single-dash typos of a double-dash flag. A value flag with
/// nothing after it, or with another flag immediately after it, is also an
/// error rather than one flag silently swallowing the next flag as its value.
fn parse_args(args: &[String]) -> Result<RawArgs, String> {
    let mut files = Vec::new();
    let mut list = None;
    let mut tests = None;
    let mut splits = None;
    let mut url = None;
    let mut url_format = None;
    let mut url_headers = None;
    let mut iter = args.iter().peekable();
    while let Some(arg) = iter.next() {
        if let Some(pos) = VALUE_FLAGS.iter().position(|&f| f == arg.as_str()) {
            let looks_like_flag = iter.peek().is_some_and(|v| v.starts_with('-') && v.len() > 1);
            let value = if looks_like_flag { None } else { iter.next() };
            let value = value.ok_or_else(|| format!("{arg} requires a value"))?;
            match pos {
                0 => list = Some(value.clone()),
                1 => tests = Some(value.clone()),
                2 => splits = Some(value.clone()),
                3 => url = Some(value.clone()),
                4 => url_format = Some(value.clone()),
                _ => url_headers = Some(value.clone()),
            }
        } else if BARE_FLAGS.contains(&arg.as_str()) {
            // No-op here — handled earlier (`--help`/`-h`) or by the caller
            // (`--new-instance`, stripped from `args` before this is called).
        } else if arg.starts_with('-') && arg.len() > 1 {
            return Err(format!(
                "unrecognized option '{arg}'\n\nRun 'tsmap --help' for usage."
            ));
        } else if arg.starts_with("tsmap://") {
            // Checks both fields, not just `url` — otherwise `--url-format
            // json tsmap://...&format=stdf` would silently let the link
            // overwrite an explicitly-given --url-format with no error at all.
            if url.is_some() || url_format.is_some() {
                return Err(
                    "a tsmap:// link cannot be combined with --url/--url-format or another \
                     tsmap:// link — only one URL fetch is supported per launch"
                        .to_string(),
                );
            }
            let (link_url, link_format) = parse_deep_link(arg)?;
            url = Some(link_url);
            url_format = Some(link_format);
        } else {
            files.push(arg.clone());
        }
    }
    Ok(RawArgs { files, list, tests, splits, url, url_format, url_headers })
}

/// Parses and resolves `args` against `cwd`: `--list`'s lines are folded into
/// `files` alongside any positional paths, and `--tests`/`--splits` are
/// resolved to absolute paths. `cwd` is the *invoking* process's working
/// directory — `std::env::current_dir()` on the initial launch, or the `cwd`
/// the single-instance plugin forwards on a relaunch (never the already-running
/// process's own cwd, which would silently resolve paths wrong).
pub fn resolve(args: &[String], cwd: &Path) -> Result<CliArgs, String> {
    let raw = parse_args(args)?;
    let mut files: Vec<String> = raw.files.iter().map(|f| resolve_path(f, cwd)).collect();
    if let Some(list_path) = raw.list {
        files.extend(read_list_lines(&list_path, cwd)?);
    }
    // --url/--url-format must be given together — each is meaningless alone
    // (a URL with no declared format, or a format hint with nothing to fetch).
    match (&raw.url, &raw.url_format) {
        (Some(_), None) => return Err("--url requires --url-format".to_string()),
        (None, Some(_)) => return Err("--url-format requires --url".to_string()),
        _ => {}
    }
    // --url-headers modifies a --url fetch — meaningless without one.
    if raw.url_headers.is_some() && raw.url.is_none() {
        return Err("--url-headers requires --url".to_string());
    }
    Ok(CliArgs {
        files,
        tests: raw.tests.map(|t| resolve_path(&t, cwd)),
        splits: raw.splits.map(|s| resolve_path(&s, cwd)),
        // Not resolved against cwd like the file-path flags above — a URL
        // (and its format tag) is not a local path.
        url: raw.url,
        url_format: raw.url_format,
        // A local file path like tests/splits, so it *is* resolved against cwd.
        url_headers: raw.url_headers.map(|h| resolve_path(&h, cwd)),
        url_error: None,
    })
}

/// True when stdin is piped/redirected rather than an interactive terminal —
/// gates whether `read_stdin_paths` should be attempted at all, so a bare
/// `tsmap` launched from a terminal never blocks waiting on stdin.
pub fn stdin_is_piped() -> bool {
    !std::io::stdin().is_terminal()
}

/// Reads newline-delimited file paths from stdin (blank/`#`-comment lines
/// skipped), resolved against `cwd`. Only ever called for the initial launch's
/// own stdin — a forwarded relaunch's stdin is never seen by the running
/// instance (the single-instance plugin only forwards argv and cwd).
pub fn read_stdin_paths(cwd: &Path) -> Vec<String> {
    std::io::stdin()
        .lock()
        .lines()
        .map_while(Result::ok)
        .map(|l| l.trim().to_string())
        .filter(|l| is_content_line(l))
        .map(|l| resolve_path(&l, cwd))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(items: &[&str]) -> Vec<String> {
        items.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn empty_input_yields_empty_args() {
        let cwd = Path::new("/cwd");
        let resolved = resolve(&args(&[]), cwd).unwrap();
        assert_eq!(resolved, CliArgs::default());
        assert!(resolved.is_empty());
    }

    #[test]
    fn positional_files_resolved_against_cwd() {
        let cwd = Path::new("/cwd");
        let resolved = resolve(&args(&["a.stdf", "/abs/b.stdf"]), cwd).unwrap();
        assert_eq!(resolved.files, vec!["/cwd/a.stdf".to_string(), "/abs/b.stdf".to_string()]);
    }

    #[test]
    fn tests_and_splits_flags_resolved() {
        let cwd = Path::new("/cwd");
        let resolved = resolve(&args(&["--tests", "t.csv", "--splits", "/abs/s.csv"]), cwd).unwrap();
        assert_eq!(resolved.tests.as_deref(), Some("/cwd/t.csv"));
        assert_eq!(resolved.splits.as_deref(), Some("/abs/s.csv"));
        assert!(resolved.files.is_empty());
    }

    #[test]
    fn new_instance_flag_does_not_error() {
        let cwd = Path::new("/cwd");
        let resolved = resolve(&args(&["--new-instance", "a.stdf"]), cwd).unwrap();
        assert_eq!(resolved.files, vec!["/cwd/a.stdf".to_string()]);
    }

    #[test]
    fn version_flag_is_recognized_in_both_spellings() {
        assert!(wants_version(&args(&["--version"])));
        assert!(wants_version(&args(&["-V"])));
        assert!(!wants_version(&args(&["a.stdf"])));
        // Lowercase -v is NOT the version flag; it must stay an unrecognized
        // option rather than quietly becoming an alias.
        assert!(!wants_version(&args(&["-v"])));
    }

    #[test]
    fn version_flag_does_not_error_as_unrecognized() {
        // The regression this guards: --version used to hit the
        // unrecognized-option rule and exit(1) with usage text.
        let cwd = Path::new("/cwd");
        assert!(resolve(&args(&["--version"]), cwd).is_ok());
        assert!(resolve(&args(&["-V"]), cwd).is_ok());
        assert!(resolve(&args(&["-v"]), cwd).is_err());
    }

    #[test]
    fn version_string_matches_the_crate_version() {
        assert_eq!(version_string(), format!("tsmap {}", env!("CARGO_PKG_VERSION")));
        assert!(version_string().starts_with("tsmap "));
    }

    #[test]
    fn unknown_double_dash_flag_is_an_error() {
        let cwd = Path::new("/cwd");
        let err = resolve(&args(&["--future-flag", "a.stdf"]), cwd).unwrap_err();
        assert!(err.contains("--future-flag"), "error was: {err}");
    }

    #[test]
    fn unknown_single_dash_flag_is_an_error_not_a_file() {
        // A typo'd `-tests` (single dash) must not silently become a "file"
        // named "-tests" — it should be rejected the same as an unknown `--` flag.
        let cwd = Path::new("/cwd");
        let err = resolve(&args(&["-tests", "t.csv"]), cwd).unwrap_err();
        assert!(err.contains("-tests"), "error was: {err}");
    }

    #[test]
    fn value_flag_with_no_value_is_an_error() {
        let cwd = Path::new("/cwd");
        let err = resolve(&args(&["--tests"]), cwd).unwrap_err();
        assert!(err.contains("--tests"), "error was: {err}");
    }

    #[test]
    fn value_flag_followed_by_another_flag_does_not_swallow_it() {
        let cwd = Path::new("/cwd");
        let err = resolve(&args(&["--tests", "--splits", "s.csv"]), cwd).unwrap_err();
        assert!(err.contains("--tests"), "error was: {err}");
    }

    #[test]
    fn wants_help_detects_long_and_short_form() {
        assert!(wants_help(&args(&["--help"])));
        assert!(wants_help(&args(&["-h"])));
        assert!(wants_help(&args(&["a.stdf", "--help"])));
        assert!(!wants_help(&args(&["a.stdf"])));
    }

    #[test]
    fn list_file_combines_with_positional_and_skips_blanks_and_comments() {
        let dir = tempfile::tempdir().unwrap();
        let list_path = dir.path().join("list.txt");
        std::fs::write(&list_path, "# a comment\n\nrel.stdf\n/abs/other.stdf\n").unwrap();

        let resolved = resolve(
            &args(&["first.stdf", "--list", list_path.to_str().unwrap()]),
            dir.path(),
        )
        .unwrap();

        assert_eq!(
            resolved.files,
            vec![
                dir.path().join("first.stdf").to_string_lossy().into_owned(),
                dir.path().join("rel.stdf").to_string_lossy().into_owned(),
                "/abs/other.stdf".to_string(),
            ]
        );
    }

    #[test]
    fn missing_list_file_is_an_error() {
        let cwd = Path::new("/cwd");
        let err = resolve(&args(&["--list", "/no/such/file.txt"]), cwd).unwrap_err();
        assert!(err.contains("/no/such/file.txt"));
    }

    #[test]
    fn url_and_url_format_together_are_kept_as_is_not_resolved_against_cwd() {
        let cwd = Path::new("/cwd");
        let resolved = resolve(
            &args(&["--url", "https://example.com/lot.stdf?sig=abc", "--url-format", "stdf"]),
            cwd,
        )
        .unwrap();
        assert_eq!(resolved.url.as_deref(), Some("https://example.com/lot.stdf?sig=abc"));
        assert_eq!(resolved.url_format.as_deref(), Some("stdf"));
        assert!(resolved.files.is_empty());
    }

    #[test]
    fn url_without_url_format_is_an_error() {
        let cwd = Path::new("/cwd");
        let err = resolve(&args(&["--url", "https://example.com/lot.stdf"]), cwd).unwrap_err();
        assert!(err.contains("--url-format"), "error was: {err}");
    }

    #[test]
    fn url_format_without_url_is_an_error() {
        let cwd = Path::new("/cwd");
        let err = resolve(&args(&["--url-format", "stdf"]), cwd).unwrap_err();
        assert!(err.contains("--url"), "error was: {err}");
    }

    #[test]
    fn serializes_as_camel_case_for_the_frontend() {
        // Regression test: CliArgs used to have no `rename_all`, invisible
        // for `tests`/`splits` (single words, unaffected by casing) until
        // `url_format` — it serialized to the literal key "url_format",
        // silently mismatching the frontend's `CliStartupArgs.urlFormat`
        // (platform.ts), so a `--url`-only launch reached get_startup_files
        // with `url` set but `urlFormat` always undefined and did nothing,
        // with no error anywhere in the chain.
        let args = CliArgs {
            url: Some("https://example.com/lot.stdf".to_string()),
            url_format: Some("stdf".to_string()),
            ..Default::default()
        };
        let json = serde_json::to_value(&args).unwrap();
        assert_eq!(json["url"], "https://example.com/lot.stdf");
        assert_eq!(json["urlFormat"], "stdf");
        assert!(json.get("url_format").is_none(), "must not also emit the snake_case key");
    }

    #[test]
    fn url_only_launch_is_not_reported_empty() {
        // Regression test: `set_startup_args` (get_startup_files.rs) only
        // stores args when `!is_empty()` — a `--url`-only launch (the normal
        // way it's used, with no positional FILE args) must not be
        // misreported as empty, or the frontend never sees it at all.
        let cwd = Path::new("/cwd");
        let resolved = resolve(
            &args(&["--url", "https://example.com/lot.stdf", "--url-format", "stdf"]),
            cwd,
        )
        .unwrap();
        assert!(!resolved.is_empty());
    }

    #[test]
    fn url_error_with_no_files_is_not_reported_empty() {
        // Sibling regression to url_only_launch_is_not_reported_empty: once
        // commands::fetch_url::resolve_cli_url consumes url/url_format and a
        // fetch fails, only url_error is left set (files stays empty) — that
        // must still reach the frontend so the failure is visible.
        let mut args = CliArgs { url_error: Some("boom".to_string()), ..CliArgs::default() };
        assert!(!args.is_empty());
        args.url_error = None;
        assert!(args.is_empty());
    }

    #[test]
    fn url_combines_with_positional_files() {
        let cwd = Path::new("/cwd");
        let resolved = resolve(
            &args(&["a.stdf", "--url", "https://example.com/b.stdf", "--url-format", "stdf"]),
            cwd,
        )
        .unwrap();
        assert_eq!(resolved.files, vec!["/cwd/a.stdf".to_string()]);
        assert_eq!(resolved.url.as_deref(), Some("https://example.com/b.stdf"));
    }

    #[test]
    fn deep_link_sets_url_and_url_format() {
        let cwd = Path::new("/cwd");
        let resolved = resolve(
            &args(&["tsmap://open?url=https%3A%2F%2Fexample.com%2Flot.stdf&format=stdf"]),
            cwd,
        )
        .unwrap();
        assert_eq!(resolved.url.as_deref(), Some("https://example.com/lot.stdf"));
        assert_eq!(resolved.url_format.as_deref(), Some("stdf"));
        assert!(resolved.files.is_empty());
        assert!(!resolved.is_empty());
    }

    #[test]
    fn deep_link_combines_with_positional_files() {
        let cwd = Path::new("/cwd");
        let resolved = resolve(
            &args(&["a.stdf", "tsmap://open?url=https%3A%2F%2Fexample.com%2Fb.stdf&format=stdf"]),
            cwd,
        )
        .unwrap();
        assert_eq!(resolved.files, vec!["/cwd/a.stdf".to_string()]);
        assert_eq!(resolved.url.as_deref(), Some("https://example.com/b.stdf"));
    }

    #[test]
    fn deep_link_missing_url_param_is_an_error() {
        let cwd = Path::new("/cwd");
        let err = resolve(&args(&["tsmap://open?format=stdf"]), cwd).unwrap_err();
        assert!(err.contains("\"url\""), "error was: {err}");
    }

    #[test]
    fn deep_link_missing_format_param_is_an_error() {
        let cwd = Path::new("/cwd");
        let err = resolve(&args(&["tsmap://open?url=https%3A%2F%2Fexample.com%2Flot.stdf"]), cwd).unwrap_err();
        assert!(err.contains("\"format\""), "error was: {err}");
    }

    #[test]
    fn malformed_deep_link_is_a_clean_error_not_a_panic() {
        let cwd = Path::new("/cwd");
        // No scheme-appropriate structure after "tsmap://" for url::Url to parse.
        let err = resolve(&args(&["tsmap://"]), cwd).unwrap_err();
        assert!(err.contains("tsmap://"), "error was: {err}");
    }

    #[test]
    fn deep_link_cannot_combine_with_explicit_url_flag() {
        let cwd = Path::new("/cwd");
        let err = resolve(
            &args(&[
                "--url", "https://example.com/a.stdf", "--url-format", "stdf",
                "tsmap://open?url=https%3A%2F%2Fexample.com%2Fb.stdf&format=stdf",
            ]),
            cwd,
        )
        .unwrap_err();
        assert!(err.contains("tsmap://"), "error was: {err}");
    }

    #[test]
    fn deep_link_cannot_combine_with_explicit_url_format_flag_alone() {
        // Regression test: the conflict check used to only look at `url`, so
        // a lone --url-format (no --url) before a tsmap:// link would let the
        // link silently overwrite the explicitly-given format with no error.
        let cwd = Path::new("/cwd");
        let err = resolve(
            &args(&["--url-format", "json", "tsmap://open?url=https%3A%2F%2Fexample.com%2Fb.stdf&format=stdf"]),
            cwd,
        )
        .unwrap_err();
        assert!(err.contains("tsmap://"), "error was: {err}");
    }

    #[test]
    fn two_deep_links_is_an_error() {
        let cwd = Path::new("/cwd");
        let err = resolve(
            &args(&[
                "tsmap://open?url=https%3A%2F%2Fexample.com%2Fa.stdf&format=stdf",
                "tsmap://open?url=https%3A%2F%2Fexample.com%2Fb.stdf&format=stdf",
            ]),
            cwd,
        )
        .unwrap_err();
        assert!(err.contains("tsmap://"), "error was: {err}");
    }

    #[test]
    fn url_headers_is_resolved_against_cwd_like_tests_and_splits() {
        let cwd = Path::new("/cwd");
        let resolved = resolve(
            &args(&[
                "--url", "https://example.com/lot.stdf", "--url-format", "stdf",
                "--url-headers", "headers.txt",
            ]),
            cwd,
        )
        .unwrap();
        assert_eq!(resolved.url_headers.as_deref(), Some("/cwd/headers.txt"));
    }

    #[test]
    fn url_headers_without_url_is_an_error() {
        let cwd = Path::new("/cwd");
        let err = resolve(&args(&["--url-headers", "headers.txt"]), cwd).unwrap_err();
        assert!(err.contains("--url"), "error was: {err}");
    }
}
