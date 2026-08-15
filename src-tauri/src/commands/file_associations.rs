// Backs the "File associations…" row in the Help menu (main.ts) — lets the
// user opt in/out of tsmap being the default handler for STDF/ATDF/Parquet
// files, so double-clicking one in a file manager opens it in tsmap.
//
// Deliberately excludes CSV/JSON: those extensions are already claimed by
// dozens of unrelated apps on a typical machine, and silently becoming their
// default handler would be an unwelcome surprise even behind a checkbox, since
// most people don't read installer/settings screens carefully.
//
// This is an in-app setting, not an installer option, for two reasons: (1)
// Windows installer UIs (NSIS/WiX) can support per-item checkboxes, but there
// is no equivalent for a `.deb`/`.rpm`/AppImage install on Linux, so an
// installer-only mechanism would be Windows-only; (2) a setting can be
// changed any time, not locked in once at install.
//
// macOS is out of scope (client hosts are Linux or Windows per the current
// requirement) — the fallback module below simply reports "not supported"
// rather than attempting anything, so this at least compiles everywhere.

pub const ASSOCIABLE_EXTENSIONS: &[&str] = &["stdf", "atdf", "parquet"];

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileAssociationStatus {
    pub extension: String,
    pub associated: bool,
    /// The executable path currently registered for this extension (Windows
    /// registry `shell\open\command`, or the Linux `.desktop` file's `Exec=`
    /// line) — `None` when not associated, or when it can't be read. This is
    /// the path the OS will actually launch on a cold double-click, which is
    /// not necessarily `current_exe_path`: `set_association` bakes in
    /// whichever binary happened to be running at the moment the checkbox
    /// was last toggled on, so a debug build toggled on once leaves a stale
    /// registration even after the user goes back to running the release
    /// build — exactly the bug this field exists to make visible.
    pub registered_exe_path: Option<String>,
    /// The path of the binary currently running (`std::env::current_exe()`),
    /// shown alongside `registered_exe_path` so the user can spot a mismatch
    /// without having to already know what to look for.
    pub current_exe_path: Option<String>,
}

/// Reports current association status for every extension in
/// `ASSOCIABLE_EXTENSIONS`. A per-extension query failure (e.g. registry
/// access denied) is folded into `Err` for that whole call — the frontend
/// shows one status/error region for the dialog, not per-row query errors.
#[tauri::command]
pub fn get_file_association_status() -> Result<Vec<FileAssociationStatus>, String> {
    let current_exe_path = std::env::current_exe().ok().map(|p| p.to_string_lossy().into_owned());
    ASSOCIABLE_EXTENSIONS
        .iter()
        .map(|ext| {
            platform_impl::is_associated(ext).map(|associated| FileAssociationStatus {
                extension: ext.to_string(),
                associated,
                registered_exe_path: platform_impl::registered_exe_path(ext),
                current_exe_path: current_exe_path.clone(),
            })
        })
        .collect()
}

/// Associates (or un-associates) `extension` with tsmap. `extension` must be
/// one of `ASSOCIABLE_EXTENSIONS` — checked here rather than trusted from the
/// frontend, since this ends up in registry paths / shell commands.
#[tauri::command]
pub fn set_file_association(extension: String, associate: bool) -> Result<(), String> {
    if !ASSOCIABLE_EXTENSIONS.contains(&extension.as_str()) {
        return Err(format!("Unsupported extension \"{extension}\""));
    }
    platform_impl::set_association(&extension, associate)
}

#[cfg(target_os = "windows")]
mod platform_impl {
    use std::io;
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;

    fn prog_id(ext: &str) -> String {
        format!("tsmap.{ext}")
    }

    /// Registry access on a locked-down/managed machine can fail with
    /// `PermissionDenied` even under `HKEY_CURRENT_USER` (no admin elevation
    /// needed for that hive normally, but IT policy can still restrict
    /// write/create access to it) — reported by name, since Paul has seen
    /// exactly this at a previous company. Surfaced as a clear, specific
    /// message rather than a raw OS error code.
    fn describe_error(e: &io::Error) -> String {
        if e.kind() == io::ErrorKind::PermissionDenied {
            "Couldn't write to the Windows registry (access denied) — this is often restricted \
             by IT/Group Policy on managed machines. File-type association isn't available here."
                .to_string()
        } else {
            format!("Failed to update file association: {e}")
        }
    }

    pub fn is_associated(ext: &str) -> Result<bool, String> {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let key = match hkcu.open_subkey(format!("Software\\Classes\\.{ext}")) {
            Ok(k) => k,
            Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(false),
            Err(e) => return Err(describe_error(&e)),
        };
        let current: String = key.get_value("").unwrap_or_default();
        Ok(current == prog_id(ext))
    }

    /// Reads back the exe path baked into `shell\open\command` by a prior
    /// `set_association` call. `None` if never associated or unreadable —
    /// deliberately swallowed rather than surfaced as an error, since this is
    /// informational display, not a precondition for anything.
    pub fn registered_exe_path(ext: &str) -> Option<String> {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let cmd_key = hkcu.open_subkey(format!("Software\\Classes\\{}\\shell\\open\\command", prog_id(ext))).ok()?;
        let command: String = cmd_key.get_value("").ok()?;
        Some(extract_command_exe(&command))
    }

    /// Pulls the executable path back out of a `"<exe>" "%1"`-shaped command
    /// string (the exact format `set_association` writes above).
    fn extract_command_exe(command: &str) -> String {
        let trimmed = command.trim();
        if let Some(rest) = trimmed.strip_prefix('"') {
            if let Some(end) = rest.find('"') {
                return rest[..end].to_string();
            }
        }
        trimmed.split_whitespace().next().unwrap_or(trimmed).to_string()
    }

    pub fn set_association(ext: &str, associate: bool) -> Result<(), String> {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);

        if !associate {
            // Only remove the extension's own claim, and only if it's still
            // ours — never clobber whatever another app registered there.
            if is_associated(ext)? {
                let _ = hkcu.delete_subkey_all(format!("Software\\Classes\\.{ext}"));
                let _ = hkcu.delete_subkey_all(format!("Software\\Classes\\{}", prog_id(ext)));
            }
            return Ok(());
        }

        let id = prog_id(ext);
        let exe = std::env::current_exe().map_err(|e| format!("Failed to locate tsmap.exe: {e}"))?;
        let exe = exe.to_string_lossy();

        let (ext_key, _) =
            hkcu.create_subkey(format!("Software\\Classes\\.{ext}")).map_err(|e| describe_error(&e))?;
        ext_key.set_value("", &id).map_err(|e| describe_error(&e))?;

        let (cmd_key, _) = hkcu
            .create_subkey(format!("Software\\Classes\\{id}\\shell\\open\\command"))
            .map_err(|e| describe_error(&e))?;
        cmd_key.set_value("", &format!("\"{exe}\" \"%1\"")).map_err(|e| describe_error(&e))?;

        Ok(())
    }
}

#[cfg(target_os = "linux")]
mod platform_impl {
    use std::path::{Path, PathBuf};

    // Deliberately *not* "tsmap.desktop": a `.deb`/`.rpm` install already
    // provides a system-level `/usr/share/applications/tsmap.desktop` (via
    // Tauri's own bundler, so tsmap appears in the application launcher) —
    // confirmed present in tauri.conf.json's bundle config, with no
    // `MimeType=` of its own. Per the XDG spec, a user-level `.desktop` file
    // with the *same* ID takes precedence over — shadows — the system one
    // entirely, not just for MIME lookups. Since this file sets
    // `NoDisplay=true` (so toggling an association doesn't also create a
    // second, confusing "tsmap" launcher icon), reusing that ID would make
    // tsmap silently vanish from the application launcher menu the moment
    // any file association is turned on. A distinct ID means this file can
    // never collide with — or override — the packaged one, regardless of
    // install method.
    const APP_ID: &str = "tsmap-file-associations.desktop";

    fn mime_type(ext: &str) -> String {
        format!("application/x-tsmap-{ext}")
    }

    fn default_data_home() -> PathBuf {
        std::env::var_os("XDG_DATA_HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from(std::env::var_os("HOME").unwrap_or_default()).join(".local/share"))
    }

    fn default_config_home() -> PathBuf {
        std::env::var_os("XDG_CONFIG_HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from(std::env::var_os("HOME").unwrap_or_default()).join(".config"))
    }

    fn describe_error(e: &std::io::Error, what: &str) -> String {
        if e.kind() == std::io::ErrorKind::PermissionDenied {
            format!("Couldn't write to {what} (permission denied) — file-type association isn't available on this machine.")
        } else {
            format!("Failed to update file association ({what}): {e}")
        }
    }

    /// Writes the shared-mime-info XML defining tsmap's custom MIME types
    /// (harmless to always define all of them — a *definition* isn't a
    /// handler claim, unlike the `.desktop` file's `MimeType=` below) and
    /// refreshes the mime database. Idempotent; self-heals a dev/unpacked
    /// binary that was never installed via a `.deb`/`.rpm` that would
    /// normally provide this.
    fn ensure_mime_info(data_home: &Path) -> Result<(), String> {
        let mime_dir = data_home.join("mime/packages");
        std::fs::create_dir_all(&mime_dir).map_err(|e| describe_error(&e, "~/.local/share/mime/packages"))?;
        let mut xml = String::from(
            "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<mime-info xmlns=\"http://www.freedesktop.org/standards/shared-mime-info\">\n",
        );
        for ext in super::ASSOCIABLE_EXTENSIONS {
            xml.push_str(&format!(
                "  <mime-type type=\"{}\">\n    <comment>tsmap {} file</comment>\n    <glob pattern=\"*.{}\"/>\n  </mime-type>\n",
                mime_type(ext),
                ext.to_uppercase(),
                ext
            ));
        }
        xml.push_str("</mime-info>\n");
        std::fs::write(mime_dir.join("tsmap-formats.xml"), xml)
            .map_err(|e| describe_error(&e, "~/.local/share/mime/packages/tsmap-formats.xml"))?;

        let status = std::process::Command::new("update-mime-database")
            .arg(data_home.join("mime"))
            .status()
            .map_err(|e| format!("Failed to run update-mime-database: {e}"))?;
        if !status.success() {
            return Err("update-mime-database failed — file-type association may not take effect.".to_string());
        }
        Ok(())
    }

    /// Writes tsmap's `.desktop` file with `MimeType=` set to exactly
    /// `associated`, no more and no less — this is what makes an extension
    /// genuinely *un*associated. `xdg-mime query default` falls back to
    /// whichever `.desktop` file's own `MimeType=` list claims a given type
    /// when no explicit preference is set in `mimeapps.list` (confirmed by
    /// direct reproduction, not assumed); since tsmap is the sole registered
    /// handler for these custom types, merely clearing the `mimeapps.list`
    /// preference line is not enough on its own — the type must stop being
    /// *claimed* here too, or every query still falls back to "the only app
    /// that says it can open this."
    fn write_desktop_file(data_home: &Path, associated: &[&str]) -> Result<(), String> {
        let exe = std::env::current_exe().map_err(|e| format!("Failed to locate the tsmap binary: {e}"))?;
        let apps_dir = data_home.join("applications");
        std::fs::create_dir_all(&apps_dir).map_err(|e| describe_error(&e, "~/.local/share/applications"))?;
        let mime_list = associated.iter().map(|e| mime_type(e)).collect::<Vec<_>>().join(";");
        let mime_line = if mime_list.is_empty() { String::new() } else { format!("MimeType={mime_list};\n") };
        let desktop_contents =
            format!("[Desktop Entry]\nType=Application\nName=tsmap\nExec=\"{}\" %f\nNoDisplay=true\n{}", exe.display(), mime_line);
        std::fs::write(apps_dir.join(APP_ID), desktop_contents)
            .map_err(|e| describe_error(&e, &format!("~/.local/share/applications/{APP_ID}")))?;

        // A nicety (speeds up desktop-file lookups by some file managers);
        // not every distro ships it, and xdg-mime itself doesn't need it —
        // don't fail the whole operation just because it's missing.
        let _ = std::process::Command::new("update-desktop-database").arg(&apps_dir).status();
        Ok(())
    }

    /// The source of truth for "is `ext` currently associated with tsmap":
    /// reads `mimeapps.list`'s `[Default Applications]` section directly,
    /// rather than asking `xdg-mime query default` — which, per
    /// `write_desktop_file`'s doc comment above, can report tsmap as the
    /// default via its `.desktop` file fallback even once the explicit
    /// preference here has been removed. Reading the preference file
    /// directly has no such ambiguity.
    fn associated_extensions(config_home: &Path) -> Vec<&'static str> {
        let Ok(text) = std::fs::read_to_string(config_home.join("mimeapps.list")) else { return Vec::new() };
        super::ASSOCIABLE_EXTENSIONS
            .iter()
            .copied()
            .filter(|ext| {
                let prefix = format!("{}=", mime_type(ext));
                text.lines().any(|line| {
                    let line = line.trim();
                    line.strip_prefix(&prefix).is_some_and(|rest| rest.trim() == APP_ID)
                })
            })
            .collect()
    }

    fn is_associated_at(config_home: &Path, ext: &str) -> Result<bool, String> {
        Ok(associated_extensions(config_home).contains(&ext))
    }

    fn set_association_at(data_home: &Path, config_home: &Path, ext: &str, associate: bool) -> Result<(), String> {
        // `xdg-mime`'s own script touches `$XDG_CONFIG_HOME/mimeapps.list`
        // directly without creating the directory first — confirmed by
        // direct reproduction, not assumed. Harmless on a normal desktop
        // (`~/.config` essentially always exists already) but a real failure
        // on a from-scratch `XDG_CONFIG_HOME` otherwise.
        std::fs::create_dir_all(config_home).map_err(|e| describe_error(&e, "the XDG config directory"))?;
        ensure_mime_info(data_home)?;

        if associate {
            let status = std::process::Command::new("xdg-mime")
                .args(["default", APP_ID, &mime_type(ext)])
                .env("XDG_DATA_HOME", data_home)
                .env("XDG_CONFIG_HOME", config_home)
                .status()
                .map_err(|e| format!("Failed to run xdg-mime: {e}"))?;
            if !status.success() {
                return Err("xdg-mime failed to set the default application.".to_string());
            }
        } else {
            // xdg-mime has no "unset default" subcommand — the standard
            // workaround is editing the mimeapps.list entry directly.
            let path = config_home.join("mimeapps.list");
            if let Ok(text) = std::fs::read_to_string(&path) {
                let prefix = format!("{}=", mime_type(ext));
                let filtered: String =
                    text.lines().filter(|line| !line.trim_start().starts_with(&prefix)).collect::<Vec<_>>().join("\n");
                std::fs::write(&path, filtered + "\n").map_err(|e| describe_error(&e, "~/.config/mimeapps.list"))?;
            }
        }

        // Regenerate the .desktop file's MimeType= from the post-edit
        // mimeapps.list state — see write_desktop_file's doc comment for why
        // this, not just the mimeapps.list edit above, is what actually
        // makes "unassociate" take effect.
        write_desktop_file(data_home, &associated_extensions(config_home))
    }

    pub fn is_associated(ext: &str) -> Result<bool, String> {
        is_associated_at(&default_config_home(), ext)
    }

    pub fn set_association(ext: &str, associate: bool) -> Result<(), String> {
        set_association_at(&default_data_home(), &default_config_home(), ext, associate)
    }

    pub fn registered_exe_path(ext: &str) -> Option<String> {
        registered_exe_path_at(&default_data_home(), ext)
    }

    /// Reads the `Exec=` line back out of our own `.desktop` file — the
    /// registration `xdg-mime`/the desktop environment will actually launch
    /// on a cold double-click. Only returned when that file currently claims
    /// `ext` in its `MimeType=` list; a stale file left over from a prior
    /// association (or one that never claimed this extension) reports `None`
    /// rather than a path that isn't actually in effect.
    fn registered_exe_path_at(data_home: &Path, ext: &str) -> Option<String> {
        let contents = std::fs::read_to_string(data_home.join("applications").join(APP_ID)).ok()?;
        if !contents.contains(&mime_type(ext)) {
            return None;
        }
        let exec_line = contents.lines().find_map(|l| l.strip_prefix("Exec="))?;
        Some(extract_exec_exe(exec_line))
    }

    /// Pulls the executable path back out of a `"<exe>" %f`-shaped `Exec=`
    /// value (the exact format `write_desktop_file` writes above).
    fn extract_exec_exe(exec: &str) -> String {
        let trimmed = exec.trim();
        if let Some(rest) = trimmed.strip_prefix('"') {
            if let Some(end) = rest.find('"') {
                return rest[..end].to_string();
            }
        }
        trimmed.split_whitespace().next().unwrap_or(trimmed).to_string()
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        #[test]
        fn associate_then_query_reports_associated() {
            let dir = tempfile::tempdir().unwrap();
            let data_home = dir.path().join("data");
            let config_home = dir.path().join("config");

            set_association_at(&data_home, &config_home, "stdf", true).unwrap();
            assert!(is_associated_at(&config_home, "stdf").unwrap());

            // The .desktop file and mime-info XML should exist now, and the
            // .desktop file should claim exactly the associated type.
            let desktop = std::fs::read_to_string(data_home.join("applications").join(APP_ID)).unwrap();
            assert!(desktop.contains("MimeType=application/x-tsmap-stdf;"), "desktop file was: {desktop}");
            assert!(data_home.join("mime/packages/tsmap-formats.xml").exists());
        }

        #[test]
        fn unassociate_removes_the_mimeapps_list_entry_and_the_desktop_file_claim() {
            let dir = tempfile::tempdir().unwrap();
            let data_home = dir.path().join("data");
            let config_home = dir.path().join("config");

            set_association_at(&data_home, &config_home, "atdf", true).unwrap();
            assert!(is_associated_at(&config_home, "atdf").unwrap());

            set_association_at(&data_home, &config_home, "atdf", false).unwrap();
            assert!(!is_associated_at(&config_home, "atdf").unwrap());
            // The regression this guards: xdg-mime query default still
            // reported tsmap as the default after only the mimeapps.list
            // line was removed, because tsmap's own .desktop file still
            // claimed the type — verified by direct reproduction. The
            // .desktop file must no longer claim it either.
            let desktop = std::fs::read_to_string(data_home.join("applications").join(APP_ID)).unwrap();
            assert!(!desktop.contains("application/x-tsmap-atdf"), "desktop file was: {desktop}");
        }

        #[test]
        fn unassociating_one_extension_leaves_another_associated_extension_alone() {
            let dir = tempfile::tempdir().unwrap();
            let data_home = dir.path().join("data");
            let config_home = dir.path().join("config");

            set_association_at(&data_home, &config_home, "stdf", true).unwrap();
            set_association_at(&data_home, &config_home, "atdf", true).unwrap();
            set_association_at(&data_home, &config_home, "atdf", false).unwrap();

            assert!(is_associated_at(&config_home, "stdf").unwrap());
            assert!(!is_associated_at(&config_home, "atdf").unwrap());
            let desktop = std::fs::read_to_string(data_home.join("applications").join(APP_ID)).unwrap();
            assert!(desktop.contains("application/x-tsmap-stdf"), "desktop file was: {desktop}");
            assert!(!desktop.contains("application/x-tsmap-atdf"), "desktop file was: {desktop}");
        }

        #[test]
        fn querying_before_ever_associating_is_false_not_an_error() {
            let dir = tempfile::tempdir().unwrap();
            let config_home = dir.path().join("config");
            assert!(!is_associated_at(&config_home, "parquet").unwrap());
        }

        #[test]
        fn registered_exe_path_reports_the_exec_line_only_for_a_claimed_extension() {
            let dir = tempfile::tempdir().unwrap();
            let data_home = dir.path().join("data");
            let config_home = dir.path().join("config");

            set_association_at(&data_home, &config_home, "stdf", true).unwrap();

            let exe = std::env::current_exe().unwrap().to_string_lossy().into_owned();
            assert_eq!(registered_exe_path_at(&data_home, "stdf").as_deref(), Some(exe.as_str()));
            // Never associated, so the desktop file doesn't claim it — no path.
            assert_eq!(registered_exe_path_at(&data_home, "atdf"), None);
        }

        #[test]
        fn registered_exe_path_is_none_once_unassociated() {
            let dir = tempfile::tempdir().unwrap();
            let data_home = dir.path().join("data");
            let config_home = dir.path().join("config");

            set_association_at(&data_home, &config_home, "parquet", true).unwrap();
            assert!(registered_exe_path_at(&data_home, "parquet").is_some());

            set_association_at(&data_home, &config_home, "parquet", false).unwrap();
            assert_eq!(registered_exe_path_at(&data_home, "parquet"), None);
        }

        #[test]
        fn mime_info_xml_defines_every_associable_extension() {
            let dir = tempfile::tempdir().unwrap();
            let data_home = dir.path().join("data");
            ensure_mime_info(&data_home).unwrap();
            let xml = std::fs::read_to_string(data_home.join("mime/packages/tsmap-formats.xml")).unwrap();
            for ext in super::super::ASSOCIABLE_EXTENSIONS {
                assert!(xml.contains(&mime_type(ext)), "missing {ext} in: {xml}");
            }
        }
    }
}

#[cfg(not(any(target_os = "windows", target_os = "linux")))]
mod platform_impl {
    pub fn is_associated(_ext: &str) -> Result<bool, String> {
        Ok(false)
    }
    pub fn set_association(_ext: &str, _associate: bool) -> Result<(), String> {
        Err("File-type association isn't supported on this platform.".to_string())
    }
    pub fn registered_exe_path(_ext: &str) -> Option<String> {
        None
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn set_file_association_rejects_an_unknown_extension() {
        let err = super::set_file_association("exe".to_string(), true).unwrap_err();
        assert!(err.contains("exe"), "error was: {err}");
    }
}
