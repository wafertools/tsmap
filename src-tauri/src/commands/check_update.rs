// Backs the opt-in "new version available" notice on desktop.
//
// Asks GitHub for the newest published release of tsmap and returns its version
// and release-page address. That is the whole of it: nothing is downloaded, and
// nothing about the user or their machine is sent beyond what any HTTPS request
// carries plus a `tsmap/<version>` User-Agent (GitHub's API refuses requests
// without one). The release page itself is opened by the user, in their own browser.
//
// Done here rather than in the webview because the webview's CSP deliberately
// has no `connect-src` for the internet (see tauri.conf.json): the app's promise
// is that parsing happens on this machine, and a request origin that cannot be
// widened by a frontend bug is part of keeping it.

use serde::Serialize;
use std::time::Duration;

const LATEST_RELEASE_API: &str = "https://api.github.com/repos/wafertools/tsmap/releases/latest";
const RELEASE_PAGE: &str = "https://github.com/wafertools/tsmap/releases/tag/";

/// A total deadline, unlike the download in `fetch_url.rs`: the body is a few
/// kilobytes of JSON, and a hung request must not leave the check pending forever.
const TIMEOUT: Duration = Duration::from_secs(10);

#[derive(Debug, Serialize, PartialEq)]
pub struct LatestRelease {
    /// The release's version without any leading `v` ("0.1.31").
    pub version: String,
    /// The release page on github.com, built here from the tag rather than taken from
    /// the response, so the address the frontend opens is always under this repository.
    pub url: String,
}

/// Reads `tag_name` from a GitHub "latest release" response.
///
/// The tag is kept to the characters a version can contain, because it becomes
/// part of an address the user is sent to.
fn parse_latest_release(body: &str) -> Result<LatestRelease, String> {
    let json: serde_json::Value =
        serde_json::from_str(body).map_err(|e| format!("Unreadable release response: {e}"))?;
    let tag = json
        .get("tag_name")
        .and_then(|t| t.as_str())
        .ok_or("The release response has no tag_name")?;
    let version = tag.strip_prefix('v').unwrap_or(tag);
    let plausible = !version.is_empty()
        && version.len() <= 40
        && version.starts_with(|c: char| c.is_ascii_digit())
        && version.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '+'));
    if !plausible {
        return Err(format!("Unrecognised release tag \"{tag}\""));
    }
    Ok(LatestRelease { version: version.to_string(), url: format!("{RELEASE_PAGE}{tag}") })
}

#[tauri::command]
pub async fn check_latest_release() -> Result<LatestRelease, String> {
    let client = reqwest::Client::builder()
        .timeout(TIMEOUT)
        .user_agent(concat!("tsmap/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|e| format!("Could not start the update check: {e}"))?;
    let response = client
        .get(LATEST_RELEASE_API)
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| format!("Could not reach GitHub: {e}"))?;
    let status = response.status();
    if !status.is_success() {
        return Err(format!("GitHub answered {status}"));
    }
    let body = response.text().await.map_err(|e| format!("Could not read GitHub's answer: {e}"))?;
    parse_latest_release(&body)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_version_and_builds_the_release_page() {
        let r = parse_latest_release(r#"{"tag_name":"v0.1.31","html_url":"https://evil.example/"}"#).unwrap();
        assert_eq!(r.version, "0.1.31");
        assert_eq!(r.url, "https://github.com/wafertools/tsmap/releases/tag/v0.1.31");
    }

    #[test]
    fn accepts_a_tag_without_the_v_prefix() {
        assert_eq!(parse_latest_release(r#"{"tag_name":"0.2.0"}"#).unwrap().version, "0.2.0");
    }

    #[test]
    fn refuses_a_tag_that_could_redirect_the_address() {
        for tag in ["v1.0/../../x", "v1.0?x=1", "v1 .0", "latest", "v", ""] {
            let body = format!(r#"{{"tag_name":"{tag}"}}"#);
            assert!(parse_latest_release(&body).is_err(), "accepted {tag:?}");
        }
    }

    #[test]
    fn refuses_a_response_that_is_not_a_release() {
        assert!(parse_latest_release("not json").is_err());
        assert!(parse_latest_release(r#"{"message":"Not Found"}"#).is_err());
    }
}
