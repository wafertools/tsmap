// One-time move of application data written under an older location.
//
// Two things changed at once and both move where tsmap's data lives:
//
//   1. The bundle identifier became `com.wafertools.tsmap` (it was
//      `com.paul.tsmap`, predating the move to the wafertools org). Every
//      platform derives its per-application data directory from that string, so
//      changing it points the app at an empty directory.
//   2. `last_dir` stopped hardcoding `$HOME/.local/share/tsmap` — see
//      `commands/last_dir.rs` for why that was broken on Windows.
//
// Without this, both changes present to a user as "the app forgot everything":
// recent files gone, theme reset, saved column mappings gone. Nothing would
// report it, because from the app's point of view it is simply a first run.
//
// The migration copies the whole legacy directory rather than named files. The
// WebView keeps its own storage — which is where localStorage lives, and so
// where the theme, recent files, column mappings, splits and the rest are — in
// a layout that is the WebView's business, not ours. Copying the tree carries
// it without this module needing to understand it — but it has to copy the
// directory the webview actually uses, which is not always the app data
// directory (see `plan`).
//
// It must run before the webview is created: on Linux and Windows the webview
// creates its data directory as it starts, which makes the destination look
// in use and the migration skip. Tauri creates `create: true` config windows
// before the app's setup hook, so the main window is `create: false` and built
// by lib.rs after this has run.
//
// Best-effort throughout: a failed copy leaves the user with default settings,
// which is the same outcome as not migrating and is never worth aborting
// startup for.

use std::path::{Path, PathBuf};

/// Identifiers this app has shipped under, oldest first, excluding the current
/// one. Kept as a list so a future rename appends rather than replaces.
const LEGACY_IDENTIFIERS: &[&str] = &["com.paul.tsmap"];

/// Directories that may hold data from an older build, most likely first.
///
/// `current` is the app data directory in use now; the legacy identifiers'
/// directories are its siblings, since every platform lays them out as
/// `<data root>/<identifier>`. The bare `tsmap` entry is `last_dir`'s old
/// hardcoded Linux path, which never had an identifier in it at all.
fn legacy_dirs_in(current: &Path, home: Option<PathBuf>) -> Vec<PathBuf> {
    let mut out = Vec::new();
    if let Some(root) = current.parent() {
        for id in LEGACY_IDENTIFIERS {
            out.push(root.join(id));
        }
    }
    if let Some(home) = home {
        out.push(home.join(".local/share/tsmap"));
    }
    out
}

/// True when a directory is absent or holds nothing — the only case in which
/// migrating is safe. An existing, non-empty directory is this build's own
/// data, and copying over it would overwrite newer settings with older ones.
fn is_unused(dir: &Path) -> bool {
    match std::fs::read_dir(dir) {
        Ok(mut entries) => entries.next().is_none(),
        Err(_) => true, // absent, or unreadable — nothing to lose either way
    }
}

fn copy_tree(from: &Path, to: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(to)?;
    for entry in std::fs::read_dir(from)? {
        let entry = entry?;
        let target = to.join(entry.file_name());
        let kind = entry.file_type()?;
        if kind.is_dir() {
            copy_tree(&entry.path(), &target)?;
        } else if kind.is_file() {
            // Symlinks are deliberately not followed: a link in a data
            // directory could point anywhere, including back up the tree.
            std::fs::copy(entry.path(), &target)?;
        }
    }
    Ok(())
}

/// Every directory this build writes, each paired with the older locations to
/// fill it from. They differ by platform, and the webview's is not ours to pick:
///
///   * `app_data` holds `last_dir`. The bare-`tsmap` HOME path is offered only
///     here, since `last_dir` was all it ever held.
///   * `local_data` is where Tauri points the webview's store (localStorage) on
///     Linux and Windows (tauri `manager/webview.rs`: `BaseDirectory::LocalData`
///     + identifier). On Linux that is the same directory as `app_data`; on
///     Windows it is `%LOCALAPPDATA%`, not the Roaming `%APPDATA%` — migrating
///     only `app_data` there carried `last_dir` and lost every other setting.
///   * On macOS, WKWebView keeps its store in `~/Library/WebKit/<identifier>`,
///     outside every Tauri path.
fn plan(
    app_data: Option<PathBuf>,
    local_data: Option<PathBuf>,
    home: Option<PathBuf>,
    identifier: &str,
    macos: bool,
) -> Vec<(PathBuf, Vec<PathBuf>)> {
    let mut out: Vec<(PathBuf, Vec<PathBuf>)> = Vec::new();
    let mut add = |dir: PathBuf, home: Option<PathBuf>| {
        if !out.iter().any(|(d, _)| *d == dir) {
            let candidates = legacy_dirs_in(&dir, home);
            out.push((dir, candidates));
        }
    };
    if let Some(d) = app_data {
        add(d, home.clone());
    }
    if let Some(d) = local_data {
        add(d, None);
    }
    if macos {
        if let Some(h) = &home {
            add(h.join("Library/WebKit").join(identifier), None);
        }
    }
    out
}

/// Fill each of this build's directories from its older location, where the
/// directory is still unused. Returns the directories migrated from, for
/// logging. Must run before any webview is created — see lib.rs's setup.
pub fn migrate_legacy_app_data<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Vec<PathBuf> {
    use tauri::Manager;
    let path = app.path();
    let steps = plan(
        path.app_data_dir().ok(),
        path.app_local_data_dir().ok(),
        std::env::var_os("HOME").map(PathBuf::from),
        &app.config().identifier,
        cfg!(target_os = "macos"),
    );
    steps
        .iter()
        .filter_map(|(dir, candidates)| migrate_from(dir, candidates))
        .collect()
}

/// The migration proper, with its candidates supplied — so the tests can drive
/// it without depending on the machine they run on. The first version of these
/// tests did read the real `$HOME`, and failed on a developer box that happened
/// to have the legacy directory: a test that passes or fails on the state of
/// the user's home directory is testing the wrong thing.
fn migrate_from(current: &Path, candidates: &[PathBuf]) -> Option<PathBuf> {
    if !is_unused(current) {
        return None;
    }
    for legacy in candidates {
        let legacy = legacy.clone();
        if legacy == current || is_unused(&legacy) {
            continue;
        }
        return match copy_tree(&legacy, current) {
            Ok(()) => Some(legacy),
            // Leave the old directory in place either way: a half-copied
            // migration that also deleted the source would lose the data
            // outright, and a stale directory costs only disk.
            Err(_) => None,
        };
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write(path: &Path, body: &str) {
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, body).unwrap();
    }

    /// Drive the migration with explicit candidates. The public entry point
    /// reads the real `$HOME`, which made the first version of these tests fail
    /// on a machine that genuinely had the legacy directory — the tests were
    /// then measuring the developer's home directory, not the code.
    fn migrate(current: &Path) -> Option<PathBuf> {
        let candidates = legacy_dirs_in(current, None);
        migrate_from(current, &candidates)
    }

    #[test]
    fn copies_a_legacy_identifier_directory_into_an_empty_current_one() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();
        write(&root.join("com.paul.tsmap").join("last_dir"), "/lots");
        write(&root.join("com.paul.tsmap").join("store").join("db"), "data");

        let current = root.join("com.wafertools.tsmap");
        let from = migrate(&current);

        assert_eq!(from.as_deref(), Some(root.join("com.paul.tsmap").as_path()));
        assert_eq!(std::fs::read_to_string(current.join("last_dir")).unwrap(), "/lots");
        // Nested directories come too — that is what carries the WebView store.
        assert_eq!(std::fs::read_to_string(current.join("store").join("db")).unwrap(), "data");
    }

    #[test]
    fn leaves_the_legacy_directory_in_place() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();
        write(&root.join("com.paul.tsmap").join("last_dir"), "/lots");
        migrate(&root.join("com.wafertools.tsmap"));
        assert!(root.join("com.paul.tsmap").join("last_dir").exists());
    }

    #[test]
    fn never_overwrites_a_directory_this_build_is_already_using() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();
        write(&root.join("com.paul.tsmap").join("last_dir"), "/old");
        let current = root.join("com.wafertools.tsmap");
        write(&current.join("last_dir"), "/new");

        assert_eq!(migrate(&current), None);
        assert_eq!(std::fs::read_to_string(current.join("last_dir")).unwrap(), "/new");
    }

    #[test]
    fn does_nothing_when_there_is_no_legacy_directory() {
        let tmp = tempfile::tempdir().unwrap();
        assert_eq!(migrate(&tmp.path().join("com.wafertools.tsmap")), None);
    }

    #[test]
    fn ignores_an_empty_legacy_directory() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();
        std::fs::create_dir_all(root.join("com.paul.tsmap")).unwrap();
        assert_eq!(migrate(&root.join("com.wafertools.tsmap")), None);
    }

    #[test]
    fn is_idempotent() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();
        write(&root.join("com.paul.tsmap").join("last_dir"), "/lots");
        let current = root.join("com.wafertools.tsmap");
        assert!(migrate(&current).is_some());
        // Second run sees a populated current directory and declines.
        assert_eq!(migrate(&current), None);
    }

    #[test]
    fn offers_both_the_old_identifier_and_the_pre_identifier_home_path() {
        let current = PathBuf::from("/data/com.wafertools.tsmap");
        let dirs = legacy_dirs_in(&current, Some(PathBuf::from("/home/u")));
        assert_eq!(dirs, vec![
            PathBuf::from("/data/com.paul.tsmap"),
            PathBuf::from("/home/u/.local/share/tsmap"),
        ]);
        // The identifier directory is tried first: it is this app's own data,
        // where the bare `tsmap` path only ever held last_dir.
        assert_eq!(dirs[0], PathBuf::from("/data/com.paul.tsmap"));
    }

    const ID: &str = "com.wafertools.tsmap";
    fn p(s: &str) -> PathBuf { PathBuf::from(s) }

    #[test]
    fn linux_migrates_its_single_data_directory_once() {
        // app_data and local_data coincide on Linux; migrating it twice would
        // be harmless but the second pass must not be planned at all.
        let d = p("/home/u/.local/share/com.wafertools.tsmap");
        let steps = plan(Some(d.clone()), Some(d.clone()), Some(p("/home/u")), ID, false);
        assert_eq!(steps, vec![(d, vec![
            p("/home/u/.local/share/com.paul.tsmap"),
            p("/home/u/.local/share/tsmap"),
        ])]);
    }

    #[test]
    fn windows_migrates_the_local_directory_the_webview_uses() {
        // WebView2's store (localStorage) is under %LOCALAPPDATA%, not the
        // Roaming %APPDATA% that app_data_dir names.
        let roaming = p("C:/Users/u/AppData/Roaming/com.wafertools.tsmap");
        let local = p("C:/Users/u/AppData/Local/com.wafertools.tsmap");
        let steps = plan(Some(roaming.clone()), Some(local.clone()), None, ID, false);
        assert_eq!(steps.len(), 2);
        assert_eq!(steps[0], (roaming, vec![p("C:/Users/u/AppData/Roaming/com.paul.tsmap")]));
        assert_eq!(steps[1], (local, vec![p("C:/Users/u/AppData/Local/com.paul.tsmap")]));
    }

    #[test]
    fn macos_also_migrates_the_wkwebview_store() {
        let d = p("/Users/u/Library/Application Support/com.wafertools.tsmap");
        let steps = plan(Some(d.clone()), Some(d), Some(p("/Users/u")), ID, true);
        assert_eq!(steps.len(), 2);
        assert_eq!(steps[1], (
            p("/Users/u/Library/WebKit/com.wafertools.tsmap"),
            vec![p("/Users/u/Library/WebKit/com.paul.tsmap")],
        ));
    }

    #[test]
    fn a_migrated_webview_store_survives_end_to_end() {
        // The Windows shape through migrate_from: the Local store is carried,
        // not only the Roaming last_dir.
        let tmp = tempfile::tempdir().unwrap();
        let roaming = tmp.path().join("Roaming");
        let local = tmp.path().join("Local");
        write(&roaming.join("com.paul.tsmap").join("last_dir"), "/lots");
        write(&local.join("com.paul.tsmap").join("EBWebView").join("ls"), "theme");
        let steps = plan(Some(roaming.join(ID)), Some(local.join(ID)), None, ID, false);
        let migrated: Vec<_> = steps.iter().filter_map(|(d, c)| migrate_from(d, c)).collect();
        assert_eq!(migrated.len(), 2);
        assert_eq!(std::fs::read_to_string(local.join(ID).join("EBWebView").join("ls")).unwrap(), "theme");
    }
}
