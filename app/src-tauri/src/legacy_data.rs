//! The first launch after the rename from TennoScope: the application identifier changed, and with
//! it every directory Tauri resolves (the database, setup and preferences, the webview's local
//! storage, the logs). Before any of them is opened, a directory the old identifier left is copied
//! once to the new identifier's place, so the player keeps their collection, access level,
//! settings and market link. The old directory is left as it was.

use std::{
    fs, io,
    path::{Path, PathBuf},
};

/// The identifier TennoScope shipped under.
const LEGACY_IDENTIFIER: &str = "io.github.deftera186.tennoscope";

/// Copies each legacy directory under `bases` that has no counterpart under `identifier` yet, and
/// returns the directories it created.
///
/// Called with the platform's data and local data directories, the two bases Tauri builds its
/// paths on: one directory on Linux, Roaming and Local on Windows. The copy goes to a sibling first
/// and is renamed into place, so a launch interrupted halfway leaves no half-filled directory that
/// would stop the next one from trying again.
pub fn adopt(bases: &[PathBuf], identifier: &str) -> io::Result<Vec<PathBuf>> {
    let mut adopted = Vec::new();
    for base in bases {
        let legacy = base.join(LEGACY_IDENTIFIER);
        let current = base.join(identifier);
        if !legacy.is_dir() || current.exists() {
            continue;
        }
        let staging = base.join(format!("{identifier}.adopting"));
        if staging.exists() {
            fs::remove_dir_all(&staging)?;
        }
        copy_tree(&legacy, &staging)?;
        fs::rename(&staging, &current)?;
        adopted.push(current);
    }
    Ok(adopted)
}

fn copy_tree(from: &Path, to: &Path) -> io::Result<()> {
    fs::create_dir(to)?;
    for entry in fs::read_dir(from)? {
        let entry = entry?;
        let target = to.join(entry.file_name());
        let kind = entry.file_type()?;
        if kind.is_dir() {
            copy_tree(&entry.path(), &target)?;
        } else if kind.is_file() {
            fs::copy(entry.path(), target)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    const IDENTIFIER: &str = "io.github.jawsbb.framesight";

    fn legacy_under(base: &Path) {
        let legacy = base.join(LEGACY_IDENTIFIER);
        fs::create_dir_all(legacy.join("localstorage")).unwrap();
        fs::write(legacy.join("tennoscope.sqlite3"), b"db").unwrap();
        fs::write(legacy.join("localstorage/origin"), b"prefs").unwrap();
    }

    #[test]
    fn copies_the_legacy_directory_and_leaves_it_in_place() {
        let base = tempfile::tempdir().unwrap();
        legacy_under(base.path());

        let adopted = adopt(&[base.path().to_owned()], IDENTIFIER).unwrap();

        let current = base.path().join(IDENTIFIER);
        assert_eq!(adopted, vec![current.clone()]);
        assert_eq!(fs::read(current.join("tennoscope.sqlite3")).unwrap(), b"db");
        assert_eq!(
            fs::read(current.join("localstorage/origin")).unwrap(),
            b"prefs"
        );
        assert!(
            base.path()
                .join(LEGACY_IDENTIFIER)
                .join("tennoscope.sqlite3")
                .is_file()
        );
        assert!(!base.path().join(format!("{IDENTIFIER}.adopting")).exists());
    }

    #[test]
    fn never_overwrites_a_directory_the_new_identifier_already_has() {
        let base = tempfile::tempdir().unwrap();
        legacy_under(base.path());
        let current = base.path().join(IDENTIFIER);
        fs::create_dir(&current).unwrap();
        fs::write(current.join("tennoscope.sqlite3"), b"newer").unwrap();

        assert!(
            adopt(&[base.path().to_owned()], IDENTIFIER)
                .unwrap()
                .is_empty()
        );
        assert_eq!(
            fs::read(current.join("tennoscope.sqlite3")).unwrap(),
            b"newer"
        );
    }

    #[test]
    fn retries_over_a_copy_an_earlier_launch_left_unfinished() {
        let base = tempfile::tempdir().unwrap();
        legacy_under(base.path());
        let staging = base.path().join(format!("{IDENTIFIER}.adopting"));
        fs::create_dir(&staging).unwrap();
        fs::write(staging.join("partial"), b"").unwrap();

        adopt(&[base.path().to_owned()], IDENTIFIER).unwrap();

        let current = base.path().join(IDENTIFIER);
        assert!(current.join("tennoscope.sqlite3").is_file());
        assert!(!current.join("partial").exists());
    }

    #[test]
    fn a_fresh_install_has_nothing_to_adopt() {
        let base = tempfile::tempdir().unwrap();
        assert!(
            adopt(&[base.path().to_owned()], IDENTIFIER)
                .unwrap()
                .is_empty()
        );
        assert!(!base.path().join(IDENTIFIER).exists());
    }
}
