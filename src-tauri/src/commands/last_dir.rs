// Remembers the directory the last file/folder picker landed in, so the next
// dialog opens where the user was rather than wherever the OS defaults to.
//
// This is the one preference NOT kept in localStorage: the pickers are native,
// so the path never reaches JavaScript in the desktop build.
//
// It previously resolved its state file as `$HOME/.local/share/tsmap/last_dir`,
// which is wrong on two of the three platforms it ships to:
//
//   * **Windows** does not set `HOME` for a normally-launched GUI process — it
//     sets `USERPROFILE`. `std::env::var("HOME")` therefore returned `Err`, the
//     whole function returned `None`, and the feature silently did nothing.
//     No error, no log; the picker just always opened at the default. It had
//     been that way since it was written, while `docs/web.md` promised
//     "Last used directory — Remembered between sessions" for desktop.
//   * **macOS** has `HOME`, so it worked, but wrote to a Linux XDG path rather
//     than `~/Library/Application Support`.
//
// It also ignored `XDG_DATA_HOME` on Linux, which its sibling
// `file_associations.rs` honours — two files in one directory disagreeing about
// where application data lives.
//
// Now it asks Tauri, which resolves the right per-platform directory from the
// bundle identifier. `migrate::migrate_legacy_app_data` moves anything written
// under the old paths across on first launch, so a Linux user who had one does
// not lose it.

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use tauri::{AppHandle, Manager};

static LAST_DIR: Mutex<Option<PathBuf>> = Mutex::new(None);

fn state_file(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_data_dir().ok().map(|d| d.join("last_dir"))
}

/// Reads a state file, returning the path only if it still names a real
/// directory — a remembered directory that has since been deleted or unmounted
/// must not be handed to a file dialog as its starting point.
fn read_state(file: &Path) -> Option<PathBuf> {
    let text = std::fs::read_to_string(file).ok()?;
    let dir = PathBuf::from(text.trim());
    if dir.is_dir() { Some(dir) } else { None }
}

fn write_state(file: &Path, dir: &Path) {
    if let Some(parent) = file.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let _ = std::fs::write(file, dir.to_string_lossy().as_bytes());
}

/// The directory to remember for a picked path: the path itself when it is a
/// directory, otherwise its parent. A file picker returns a file; a folder
/// picker returns a folder; both arrive here.
fn dir_of(path: &str) -> PathBuf {
    let p = PathBuf::from(path);
    if p.is_dir() {
        p
    } else {
        p.parent().map(Path::to_path_buf).unwrap_or(p)
    }
}

#[tauri::command]
pub fn get_last_dir(app: AppHandle) -> Option<String> {
    {
        let guard = LAST_DIR.lock().ok()?;
        if let Some(ref p) = *guard {
            return Some(p.to_string_lossy().into_owned());
        }
    }
    let dir = read_state(&state_file(&app)?)?;
    if let Ok(mut guard) = LAST_DIR.lock() {
        *guard = Some(dir.clone());
    }
    Some(dir.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn set_last_dir(app: AppHandle, path: String) {
    let dir = dir_of(&path);
    if let Ok(mut guard) = LAST_DIR.lock() {
        *guard = Some(dir.clone());
    }
    if let Some(f) = state_file(&app) {
        write_state(&f, &dir);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trips_a_directory() {
        let tmp = tempfile::tempdir().unwrap();
        let file = tmp.path().join("state").join("last_dir");
        write_state(&file, tmp.path());
        assert_eq!(read_state(&file).as_deref(), Some(tmp.path()));
    }

    #[test]
    fn creates_the_parent_directory_it_needs() {
        let tmp = tempfile::tempdir().unwrap();
        let file = tmp.path().join("a").join("b").join("last_dir");
        write_state(&file, tmp.path());
        assert!(file.exists());
    }

    #[test]
    fn refuses_a_remembered_directory_that_no_longer_exists() {
        let tmp = tempfile::tempdir().unwrap();
        let gone = tmp.path().join("removed");
        std::fs::create_dir(&gone).unwrap();
        let file = tmp.path().join("last_dir");
        write_state(&file, &gone);
        std::fs::remove_dir(&gone).unwrap();
        // A deleted or unmounted directory must not become a dialog's start point.
        assert_eq!(read_state(&file), None);
    }

    #[test]
    fn missing_or_empty_state_reads_as_nothing_remembered() {
        let tmp = tempfile::tempdir().unwrap();
        assert_eq!(read_state(&tmp.path().join("absent")), None);
        let empty = tmp.path().join("empty");
        std::fs::write(&empty, "").unwrap();
        assert_eq!(read_state(&empty), None);
    }

    #[test]
    fn tolerates_trailing_whitespace_from_the_file() {
        let tmp = tempfile::tempdir().unwrap();
        let file = tmp.path().join("last_dir");
        std::fs::write(&file, format!("{}\n", tmp.path().display())).unwrap();
        assert_eq!(read_state(&file).as_deref(), Some(tmp.path()));
    }

    #[test]
    fn remembers_the_folder_of_a_picked_file_and_the_folder_itself() {
        let tmp = tempfile::tempdir().unwrap();
        let f = tmp.path().join("lot.stdf");
        std::fs::write(&f, b"x").unwrap();
        assert_eq!(dir_of(&f.to_string_lossy()), tmp.path());
        assert_eq!(dir_of(&tmp.path().to_string_lossy()), tmp.path());
    }
}
