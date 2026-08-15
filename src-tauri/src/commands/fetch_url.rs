// Backs the `--url`/`--url-format` CLI flags and the web build's
// `?dataUrl=&dataFormat=` query param — a caller application hands tsmap a
// URL instead of a local file. No auth is ever sent (see
// plans/open-from-url-ingestion.md's successor design): the URL itself must
// be self-authenticating (e.g. a presigned link).
//
// Unlike the JSON-only "Open from URL…" modal design in that plan doc, this
// fetches raw bytes for *any* of tsmap's formats and writes them to a temp
// file rather than returning bytes over IPC — Tauri never carries file bytes
// over IPC (see `FileHandle` in platform.ts), so the frontend already expects
// a `path` for every native-side parse call. Materializing to disk lets a
// URL-sourced file reuse the *entire* existing load pipeline (mapping
// overlay, binary two-pass scan, test selector, rename, splits) completely
// unmodified — the same trick `extract_archive.rs` already uses for zip
// contents.
//
// This is resolved entirely in Rust, before the webview/frontend ever runs —
// not via a Tauri IPC command invoked from JS. An earlier version did exactly
// that (an async `#[tauri::command]` called from `applyCliArgs`, chained
// directly off `getStartupFiles()`'s own IPC resolution): the Rust side
// completed correctly every time (confirmed via direct logging — full byte
// count written, `Ok(path)` returned), but the frontend's `invoke()` promise
// reproducibly never resolved or rejected. The exact same command invoked
// standalone from devtools — at any other time, in any window — always
// resolved immediately; only chaining it synchronously inside another
// command's own resolution callback, right at frontend cold start, hit this.
// Resolving the URL to a real file path here instead means `--url` has
// already become an ordinary `CliArgs.files` entry by the time
// `get_startup_files` is ever invoked — indistinguishable from a path the
// user typed directly, with no IPC call and no chaining for the frontend to
// get wrong.

use futures_util::StreamExt;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;
use tokio::io::AsyncWriteExt;

const SUPPORTED_FORMATS: &[&str] = &["stdf", "atdf", "csv", "json", "parquet"];

/// Sanity backstop against a runaway/misbehaving URL, not a real-world limit —
/// the app's own large-lot benchmark fixture is ~340 MB (see CLAUDE.md's
/// Performance Benchmarks section).
const MAX_DOWNLOAD_BYTES: u64 = 2 * 1024 * 1024 * 1024;

/// This resolution runs before any window exists — a hung/unresponsive
/// server would otherwise leave the app appearing to never start at all,
/// with nothing on screen to explain why. 30s comfortably covers a slow
/// connection to a real server without leaving a bad URL looking like a
/// frozen launch for an unbounded time.
const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);

fn temp_dir() -> PathBuf {
    std::env::temp_dir().join("tsmap_url_fetch")
}

static UNIQUE_COUNTER: AtomicU64 = AtomicU64::new(0);

/// A filename unique within this process's lifetime — no `uuid` dependency
/// needed for a value that only has to avoid colliding with other downloads
/// from the same run.
fn unique_file_name(format: &str) -> String {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let n = UNIQUE_COUNTER.fetch_add(1, Ordering::Relaxed);
    format!("url-import-{nanos}-{n}.{format}")
}

/// If `args.url` is set (always paired with `args.url_format` — enforced by
/// `cli_files::resolve`), fetches it and pushes the resulting local path
/// onto `args.files`, clearing `url`/`url_format`/`url_headers` so a URL
/// launch is indistinguishable from a plain file-path launch by the time the
/// frontend ever sees `CliArgs`. On failure — including a bad `url_headers`
/// file — sets `args.url_error` instead — surfaced by the frontend the same
/// non-fatal way a bad `--splits`/`--tests` file already is, via
/// `log('error', ...)` rather than aborting the launch.
///
/// Called from `run()`'s initial-launch path and the single-instance
/// relaunch callback in `lib.rs` — both run outside the webview's own
/// lifecycle (the callback specifically runs on a background thread per the
/// `tauri-plugin-single-instance` docs), so blocking here is safe and, per
/// this module's doc comment above, is the whole point.
pub fn resolve_cli_url(args: &mut crate::cli_files::CliArgs) {
    let (Some(url), Some(format)) = (args.url.take(), args.url_format.take()) else { return };
    let headers_path = args.url_headers.take();
    let headers = match headers_path.as_deref().map(parse_headers_file) {
        Some(Ok(h)) => h,
        Some(Err(e)) => {
            args.url_error = Some(e);
            return;
        }
        None => Vec::new(),
    };
    match fetch_url_to_temp_file_blocking(&url, &format, &headers) {
        Ok(path) => args.files.push(path),
        Err(e) => args.url_error = Some(e),
    }
}

/// Parses a `--url-headers` file: one `Header-Name: value` per line, blank
/// lines and `#` comments skipped — same convention as `--list`'s file
/// (`cli_files.rs`). Unlike that file's line-level leniency, a malformed
/// *content* line here (no `:` separator) is a hard error rather than a
/// silently-skipped line: this is the one config file in the app that can
/// carry a credential, so a typo silently sending an unauthenticated request
/// (likely surfacing as a confusing 401 from the server instead) is worse
/// than a clear, immediate failure naming the bad line.
fn parse_headers_file(path: &str) -> Result<Vec<(String, String)>, String> {
    let text = std::fs::read_to_string(path)
        .map_err(|e| format!("Failed to read --url-headers file {path}: {e}"))?;
    text.lines()
        .map(str::trim)
        .filter(|l| !l.is_empty() && !l.starts_with('#'))
        .map(|line| {
            let (name, value) = line.split_once(':').ok_or_else(|| {
                format!("Malformed line in --url-headers file {path}: \"{line}\" (expected \"Header-Name: value\")")
            })?;
            Ok((name.trim().to_string(), value.trim().to_string()))
        })
        .collect()
}

/// Fetches `url` (with `headers` attached, if any) and streams its body to a
/// new temp file, returning the absolute path, by building a dedicated
/// single-threaded tokio runtime and blocking on it. Streaming straight to
/// disk (rather than buffering into a `Vec<u8>` first) means there's no
/// in-memory size cap standing in the way of a large lot file —
/// `MAX_DOWNLOAD_BYTES` only bounds how much is ever written to disk, as a
/// backstop against a misbehaving/runaway URL.
fn fetch_url_to_temp_file_blocking(
    url: &str,
    format: &str,
    headers: &[(String, String)],
) -> Result<String, String> {
    let rt = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .map_err(|e| format!("Failed to start fetch runtime: {e}"))?;
    rt.block_on(fetch_impl(url.to_string(), format.to_string(), headers.to_vec()))
}

async fn fetch_impl(url: String, format: String, headers: Vec<(String, String)>) -> Result<String, String> {
    let format = format.to_lowercase();
    if !SUPPORTED_FORMATS.contains(&format.as_str()) {
        return Err(format!(
            "Unsupported --url-format \"{format}\" — expected one of: {}",
            SUPPORTED_FORMATS.join(", ")
        ));
    }

    let client = reqwest::Client::builder()
        .timeout(REQUEST_TIMEOUT)
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {e}"))?;
    let mut request = client.get(&url);
    for (name, value) in &headers {
        request = request.header(name, value);
    }
    let response = request
        .send()
        .await
        .map_err(|e| format!("Failed to fetch {url}: {e}"))?;
    let status = response.status();
    if !status.is_success() {
        return Err(format!("Failed to fetch {url}: HTTP {status}"));
    }

    let out_dir = temp_dir();
    std::fs::create_dir_all(&out_dir).map_err(|e| e.to_string())?;
    let out_path = out_dir.join(unique_file_name(&format));

    let mut file = tokio::fs::File::create(&out_path)
        .await
        .map_err(|e| e.to_string())?;
    let mut stream = response.bytes_stream();
    let mut written: u64 = 0;
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Download of {url} failed: {e}"))?;
        written += chunk.len() as u64;
        if written > MAX_DOWNLOAD_BYTES {
            drop(file);
            let _ = tokio::fs::remove_file(&out_path).await;
            return Err(format!(
                "{url} exceeded the {} MB download size limit",
                MAX_DOWNLOAD_BYTES / (1024 * 1024)
            ));
        }
        file.write_all(&chunk).await.map_err(|e| e.to_string())?;
    }
    file.flush().await.map_err(|e| e.to_string())?;

    Ok(out_path.to_string_lossy().into_owned())
}

/// Deletes all files previously downloaded to the temp dir. Called once at
/// app startup (alongside `extract_archive::cleanup_extract`) to clear stale
/// downloads left over from a previous run — the current session's own
/// fetched file is not cleaned up mid-session since it may be re-read (e.g.
/// the "Filter tests…" re-scan on a fetched STDF/ATDF file).
#[tauri::command]
pub fn cleanup_url_fetch() {
    cleanup_url_fetch_at(&temp_dir());
}

/// `temp_dir()` is a single OS-wide directory shared by every test in this
/// module (they rely on it *staying alive* while other tests concurrently
/// write/read their own uniquely-named files under it) — a test that wants
/// to exercise this deletion must point it at an isolated directory instead,
/// or it races `remove_dir_all` against every other test in the suite under
/// `cargo test`'s default parallel execution.
fn cleanup_url_fetch_at(dir: &Path) {
    let _ = std::fs::remove_dir_all(dir);
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cli_files::CliArgs;
    use std::io::{Read, Write};
    use std::net::TcpListener;

    /// Spawns a one-shot HTTP server on an ephemeral port that replies with
    /// `response` (a full raw HTTP response, status line included) to the
    /// first request it receives, then exits. Returns the `http://127.0.0.1:PORT/`
    /// base URL. Mirrors the mock-server style already used for STDF/ATDF
    /// truncated-input tests elsewhere in this workspace — no new test dep.
    fn spawn_one_shot_server(response: &'static [u8]) -> String {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        std::thread::spawn(move || {
            if let Ok((mut stream, _)) = listener.accept() {
                let mut buf = [0u8; 1024];
                let _ = stream.read(&mut buf); // drain the request, ignore it
                let _ = stream.write_all(response);
            }
        });
        format!("http://127.0.0.1:{port}/")
    }

    /// Like `spawn_one_shot_server`, but hands the raw received request bytes
    /// back via `received` (a shared cell) so a test can assert on what was
    /// actually sent — e.g. that a header made it onto the wire.
    fn spawn_capturing_server(response: &'static [u8]) -> (String, std::sync::Arc<std::sync::Mutex<Vec<u8>>>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let received = std::sync::Arc::new(std::sync::Mutex::new(Vec::new()));
        let received_clone = received.clone();
        std::thread::spawn(move || {
            if let Ok((mut stream, _)) = listener.accept() {
                let mut buf = [0u8; 4096];
                if let Ok(n) = stream.read(&mut buf) {
                    received_clone.lock().unwrap().extend_from_slice(&buf[..n]);
                }
                let _ = stream.write_all(response);
            }
        });
        (format!("http://127.0.0.1:{port}/"), received)
    }

    fn ok_response(body: &[u8]) -> Vec<u8> {
        let header = format!(
            "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
            body.len()
        );
        let mut full = header.into_bytes();
        full.extend_from_slice(body);
        full
    }

    #[test]
    fn blocking_wrapper_fetches_and_writes_body_to_a_temp_file() {
        let body = b"FAR:A|4\n";
        let url = spawn_one_shot_server(Box::leak(ok_response(body).into_boxed_slice()));

        let path = fetch_url_to_temp_file_blocking(&url, "atdf", &[]).unwrap();
        assert!(path.ends_with(".atdf"));
        let written = std::fs::read(&path).unwrap();
        assert_eq!(written, body);
        let _ = std::fs::remove_file(&path);
    }

    #[tokio::test]
    async fn fetches_and_writes_body_to_a_temp_file() {
        let body = b"FAR:A|4\n";
        let url = spawn_one_shot_server(Box::leak(ok_response(body).into_boxed_slice()));

        let path = fetch_impl(url, "atdf".to_string(), vec![]).await.unwrap();
        assert!(path.ends_with(".atdf"));
        let written = std::fs::read(&path).unwrap();
        assert_eq!(written, body);
        let _ = std::fs::remove_file(&path);
    }

    #[tokio::test]
    async fn unsupported_format_is_rejected_before_any_fetch() {
        // Deliberately bogus URL — if the format check didn't short-circuit
        // before the fetch, this would fail with a connection error instead.
        let err = fetch_impl("http://127.0.0.1:1/x".to_string(), "xlsx".to_string(), vec![])
            .await
            .unwrap_err();
        assert!(err.contains("xlsx"), "error was: {err}");
    }

    #[tokio::test]
    async fn format_is_case_insensitive() {
        let url = spawn_one_shot_server(Box::leak(ok_response(b"{}").into_boxed_slice()));

        let path = fetch_impl(url, "JSON".to_string(), vec![]).await.unwrap();
        assert!(path.ends_with(".json"));
        let _ = std::fs::remove_file(&path);
    }

    #[tokio::test]
    async fn non_2xx_status_is_a_clean_error() {
        let response = b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
        let url = spawn_one_shot_server(response);

        let err = fetch_impl(url, "json".to_string(), vec![]).await.unwrap_err();
        assert!(err.contains("404"), "error was: {err}");
    }

    #[tokio::test]
    async fn headers_are_sent_with_the_request() {
        let (url, received) = spawn_capturing_server(Box::leak(ok_response(b"{}").into_boxed_slice()));

        let path = fetch_impl(
            url,
            "json".to_string(),
            vec![
                ("Authorization".to_string(), "Bearer secret-token".to_string()),
                ("X-Api-Key".to_string(), "abc123".to_string()),
            ],
        )
        .await
        .unwrap();
        let _ = std::fs::remove_file(&path);

        let raw = String::from_utf8_lossy(&received.lock().unwrap()).to_lowercase();
        assert!(raw.contains("authorization: bearer secret-token"), "request was: {raw}");
        assert!(raw.contains("x-api-key: abc123"), "request was: {raw}");
    }

    #[test]
    fn parse_headers_file_reads_name_value_pairs_and_skips_blanks_and_comments() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("headers.txt");
        std::fs::write(
            &path,
            "# a comment\n\nAuthorization: Bearer xyz\nX-Api-Key:   abc123  \n",
        )
        .unwrap();

        let headers = parse_headers_file(path.to_str().unwrap()).unwrap();

        assert_eq!(
            headers,
            vec![
                ("Authorization".to_string(), "Bearer xyz".to_string()),
                ("X-Api-Key".to_string(), "abc123".to_string()),
            ]
        );
    }

    #[test]
    fn parse_headers_file_rejects_a_line_with_no_colon() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("headers.txt");
        std::fs::write(&path, "Authorization Bearer xyz\n").unwrap();

        let err = parse_headers_file(path.to_str().unwrap()).unwrap_err();
        assert!(err.contains("Authorization Bearer xyz"), "error was: {err}");
    }

    #[test]
    fn parse_headers_file_missing_file_is_a_clean_error() {
        let err = parse_headers_file("/no/such/headers.txt").unwrap_err();
        assert!(err.contains("/no/such/headers.txt"), "error was: {err}");
    }

    #[test]
    fn cleanup_removes_the_temp_dir() {
        // Isolated directory, not the shared temp_dir() every other test in
        // this file writes into — see cleanup_url_fetch_at's doc comment.
        let dir = tempfile::tempdir().unwrap();
        let target = dir.path().join("tsmap_url_fetch");
        std::fs::create_dir_all(&target).unwrap();
        std::fs::write(target.join("leftover.json"), b"{}").unwrap();
        cleanup_url_fetch_at(&target);
        assert!(!target.exists());
    }

    #[test]
    fn resolve_cli_url_pushes_resolved_path_into_files() {
        let url = spawn_one_shot_server(Box::leak(ok_response(b"{}").into_boxed_slice()));
        let mut args = CliArgs { url: Some(url), url_format: Some("json".to_string()), ..Default::default() };

        resolve_cli_url(&mut args);

        assert!(args.url.is_none());
        assert!(args.url_format.is_none());
        assert!(args.url_error.is_none());
        assert_eq!(args.files.len(), 1);
        assert!(args.files[0].ends_with(".json"));
        let _ = std::fs::remove_file(&args.files[0]);
    }

    #[test]
    fn resolve_cli_url_sets_url_error_on_failure_without_touching_files() {
        let mut args = CliArgs { url: Some("http://127.0.0.1:1/x".to_string()), url_format: Some("json".to_string()), ..Default::default() };

        resolve_cli_url(&mut args);

        assert!(args.files.is_empty());
        assert!(args.url_error.is_some());
    }

    #[test]
    fn resolve_cli_url_is_a_no_op_when_url_is_absent() {
        let mut args = CliArgs::default();
        resolve_cli_url(&mut args);
        assert_eq!(args, CliArgs::default());
    }

    #[test]
    fn resolve_cli_url_reads_and_sends_url_headers() {
        let (url, received) = spawn_capturing_server(Box::leak(ok_response(b"{}").into_boxed_slice()));
        let dir = tempfile::tempdir().unwrap();
        let headers_path = dir.path().join("headers.txt");
        std::fs::write(&headers_path, "Authorization: Bearer secret-token\n").unwrap();
        let mut args = CliArgs {
            url: Some(url),
            url_format: Some("json".to_string()),
            url_headers: Some(headers_path.to_string_lossy().into_owned()),
            ..Default::default()
        };

        resolve_cli_url(&mut args);

        assert!(args.url_headers.is_none(), "url_headers must be consumed like url/url_format");
        assert!(args.url_error.is_none());
        assert_eq!(args.files.len(), 1);
        let _ = std::fs::remove_file(&args.files[0]);
        let raw = String::from_utf8_lossy(&received.lock().unwrap()).to_lowercase();
        assert!(raw.contains("authorization: bearer secret-token"), "request was: {raw}");
    }

    #[test]
    fn resolve_cli_url_sets_url_error_when_headers_file_is_missing_and_never_fetches() {
        // No mock server at all — if this fetched anyway (ignoring the
        // headers-file failure), it would hang/error on a real connection
        // attempt instead of failing cleanly and immediately.
        let mut args = CliArgs {
            url: Some("http://127.0.0.1:1/x".to_string()),
            url_format: Some("json".to_string()),
            url_headers: Some("/no/such/headers.txt".to_string()),
            ..Default::default()
        };

        resolve_cli_url(&mut args);

        assert!(args.files.is_empty());
        assert!(args.url_error.unwrap().contains("/no/such/headers.txt"));
    }
}
