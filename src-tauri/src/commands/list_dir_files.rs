// Lists the data files in a directory, for the "Scan a folder…" entry into the
// file-filter table.
//
// This exists so the native dialog can ask "where?" instead of "which?" — the
// filter table then answers "which?". Before it, both dialogs asked the same
// question: you picked files in the OS dialog, then picked them again in the
// table.
//
// Extension filtering happens here rather than in the frontend so a folder with
// 50,000 unrelated files doesn't cross the IPC boundary just to be discarded.
// The list is supplied BY the frontend (`extensions`), so `lib.ts` remains the
// single source of truth for what tsmap can open.

use std::path::{Path, PathBuf};

/// Result of one directory listing.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirListing {
    /// Absolute paths of matching files, sorted.
    pub files: Vec<String>,
    /// Whether the directory contains at least one subdirectory. The frontend
    /// uses this to decide whether asking about subfolders is even relevant —
    /// there's no point prompting for a flat folder.
    pub has_subdirs: bool,
    /// True when the walk stopped early on `MAX_FILES` or `MAX_DEPTH`, so the
    /// caller can say the listing is partial rather than presenting it as
    /// complete.
    pub truncated: bool,
}

/// A recursive scan is bounded on two axes, because the user can point this at
/// any directory — including `/` or a network mount. Both caps are deliberately
/// generous relative to a real lot directory (a big load is a few hundred
/// files) and small relative to a filesystem.
const MAX_FILES: usize = 5000;
const MAX_DEPTH: usize = 3;

fn matches(path: &Path, extensions: &[String]) -> bool {
    // Compare on the full lowercased filename rather than `Path::extension`, so
    // a double extension like `.stdf.gz` matches `stdf.gz` as well as `gz`.
    let Some(name) = path.file_name().and_then(|n| n.to_str()) else { return false };
    let lower = name.to_ascii_lowercase();
    extensions.iter().any(|e| lower.ends_with(&format!(".{}", e.trim_start_matches('.').to_ascii_lowercase())))
}

fn walk(dir: &Path, extensions: &[String], recursive: bool, depth: usize,
        out: &mut Vec<PathBuf>, has_subdirs: &mut bool, truncated: &mut bool) {
    if out.len() >= MAX_FILES { *truncated = true; return; }
    let Ok(entries) = std::fs::read_dir(dir) else { return };

    for entry in entries.flatten() {
        if out.len() >= MAX_FILES { *truncated = true; return; }
        let path = entry.path();
        // `file_type()` rather than `metadata()`: it does not follow symlinks,
        // so a link pointing back up the tree can't send this into a loop.
        let Ok(ft) = entry.file_type() else { continue };
        if ft.is_dir() {
            if depth == 0 { *has_subdirs = true; }
            if recursive {
                if depth + 1 > MAX_DEPTH { *truncated = true; continue; }
                walk(&path, extensions, recursive, depth + 1, out, has_subdirs, truncated);
            }
        } else if ft.is_file() && matches(&path, extensions) {
            out.push(path);
        }
    }
}

#[tauri::command]
pub async fn list_dir_files(
    path: String,
    extensions: Vec<String>,
    recursive: bool,
) -> Result<DirListing, String> {
    let dir = PathBuf::from(&path);
    if !dir.is_dir() {
        return Err(format!("Not a directory: {path}"));
    }
    let mut files = Vec::new();
    let mut has_subdirs = false;
    let mut truncated = false;
    walk(&dir, &extensions, recursive, 0, &mut files, &mut has_subdirs, &mut truncated);
    files.sort();
    Ok(DirListing {
        files: files.into_iter().map(|p| p.to_string_lossy().into_owned()).collect(),
        has_subdirs,
        truncated,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn tmp(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("tsmap-listdir-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }
    const EXTS: [&str; 3] = ["stdf", "csv", "stdf.gz"];
    fn exts() -> Vec<String> { EXTS.iter().map(|s| s.to_string()).collect() }
    fn run(dir: &Path, recursive: bool) -> DirListing {
        let mut files = Vec::new();
        let (mut sub, mut trunc) = (false, false);
        walk(dir, &exts(), recursive, 0, &mut files, &mut sub, &mut trunc);
        files.sort();
        DirListing {
            files: files.into_iter().map(|p| p.file_name().unwrap().to_string_lossy().into_owned()).collect(),
            has_subdirs: sub, truncated: trunc,
        }
    }

    #[test]
    fn lists_only_matching_extensions() {
        let d = tmp("ext");
        for f in ["a.stdf", "b.csv", "c.txt", "d.png"] { fs::write(d.join(f), b"x").unwrap(); }
        let r = run(&d, false);
        assert_eq!(r.files, vec!["a.stdf", "b.csv"]);
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn matches_double_extensions() {
        // `.stdf.gz` must match, which `Path::extension` alone ("gz") would miss
        // if the caller only listed "stdf".
        let d = tmp("double");
        fs::write(d.join("a.stdf.gz"), b"x").unwrap();
        assert_eq!(run(&d, false).files, vec!["a.stdf.gz"]);
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn is_case_insensitive() {
        let d = tmp("case");
        fs::write(d.join("A.STDF"), b"x").unwrap();
        assert_eq!(run(&d, false).files, vec!["A.STDF"]);
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn non_recursive_skips_subdirs_but_reports_them() {
        let d = tmp("flat");
        fs::write(d.join("top.stdf"), b"x").unwrap();
        fs::create_dir(d.join("sub")).unwrap();
        fs::write(d.join("sub").join("deep.stdf"), b"x").unwrap();
        let r = run(&d, false);
        assert_eq!(r.files, vec!["top.stdf"]);
        assert!(r.has_subdirs, "must report subdirs so the caller knows whether to offer recursion");
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn recursive_descends() {
        let d = tmp("deep");
        fs::write(d.join("top.stdf"), b"x").unwrap();
        fs::create_dir(d.join("sub")).unwrap();
        fs::write(d.join("sub").join("deep.stdf"), b"x").unwrap();
        let mut got = run(&d, true).files;
        got.sort();
        assert_eq!(got, vec!["deep.stdf", "top.stdf"]);
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn recursion_stops_at_max_depth_and_flags_truncation() {
        let d = tmp("depth");
        let mut p = d.clone();
        // One level deeper than MAX_DEPTH allows.
        for i in 0..=MAX_DEPTH + 1 {
            p = p.join(format!("l{i}"));
            fs::create_dir(&p).unwrap();
            fs::write(p.join(format!("f{i}.stdf")), b"x").unwrap();
        }
        let r = run(&d, true);
        assert!(r.truncated, "hitting the depth cap must be reported, not silently partial");
        assert!(r.files.len() <= MAX_DEPTH + 1);
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn a_directory_named_like_a_data_file_is_not_listed() {
        // A folder called `lot.csv` is a directory, not a file to parse.
        let d = tmp("dirname");
        fs::create_dir(d.join("lot.csv")).unwrap();
        fs::write(d.join("real.csv"), b"x").unwrap();
        assert_eq!(run(&d, false).files, vec!["real.csv"]);
        let _ = fs::remove_dir_all(&d);
    }
}
