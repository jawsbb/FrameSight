use std::io::Write as _;
use std::path::Path;

use atomicwrites::{AtomicFile, OverwriteBehavior};
use serde::{Deserialize, Serialize};

/// Preferences the backend owns, so the overlays never read browser storage for them.
#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct Preferences {
    #[serde(default = "marks_on")]
    pub mastery_marks: bool,
    /// The interface language the player chose. `None` follows the system language; a file
    /// written before the setting existed has no key and reads as `None`.
    #[serde(default)]
    pub language: Option<Language>,
    /// Whether an inventory read goes on to repair the account's flagged orders: take down a
    /// listing for something no longer held, lower one listing more than is held. Off unless the
    /// player turns it on, because it writes to a real account without a press per order.
    #[serde(default)]
    pub sync_orders: bool,
}

/// The interface languages the frontend ships catalogs for. An enum rather than a string so a
/// value outside the list is refused when the command's arguments are read, before any save.
#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Language {
    En,
    Fr,
}

fn marks_on() -> bool {
    true
}

impl Default for Preferences {
    fn default() -> Self {
        Self {
            mastery_marks: true,
            language: None,
            sync_orders: false,
        }
    }
}

/// A missing, unreadable, or corrupt file reads as marks on. The marks are the default
/// experience, and a broken file must not silently turn a feature off.
pub fn load_preferences(path: &Path) -> Preferences {
    std::fs::read(path)
        .ok()
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .unwrap_or_default()
}

/// Written atomically like the setup status: a crash mid-write leaves the previous file,
/// never half a JSON document.
pub fn save_preferences(path: &Path, preferences: Preferences) -> std::io::Result<()> {
    let serialized = serde_json::to_vec(&preferences).map_err(std::io::Error::other)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    AtomicFile::new(path, OverwriteBehavior::AllowOverwrite)
        .write(|file| file.write_all(&serialized).and_then(|_| file.sync_all()))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_missing_or_corrupt_file_reads_as_marks_on() {
        let dir = tempfile::tempdir().expect("temp dir");
        let path = dir.path().join("tennoscope-preferences.json");
        assert!(load_preferences(&path).mastery_marks);
        std::fs::write(&path, b"{not json").unwrap();
        assert!(load_preferences(&path).mastery_marks);
        std::fs::write(&path, b"{}").unwrap();
        assert!(
            load_preferences(&path).mastery_marks,
            "a missing key keeps the default"
        );
    }

    #[test]
    fn a_saved_choice_reads_back() {
        let dir = tempfile::tempdir().expect("temp dir");
        let path = dir.path().join("tennoscope-preferences.json");
        save_preferences(
            &path,
            Preferences {
                mastery_marks: false,
                language: Some(Language::Fr),
                sync_orders: true,
            },
        )
        .unwrap();
        let read = load_preferences(&path);
        assert!(!read.mastery_marks);
        assert_eq!(read.language, Some(Language::Fr));
        assert!(read.sync_orders);
        assert_eq!(
            std::fs::read_to_string(&path).unwrap(),
            r#"{"mastery_marks":false,"language":"fr","sync_orders":true}"#,
            "the language is stored as the code the frontend sends"
        );
    }

    #[test]
    fn a_file_from_before_the_language_setting_follows_the_system() {
        let dir = tempfile::tempdir().expect("temp dir");
        let path = dir.path().join("tennoscope-preferences.json");
        std::fs::write(&path, br#"{"mastery_marks":false}"#).unwrap();
        assert_eq!(
            load_preferences(&path),
            Preferences {
                mastery_marks: false,
                language: None,
                sync_orders: false,
            },
            "the old choice survives, the language follows the system and orders are not synced"
        );
    }

    #[test]
    fn only_english_french_or_none_is_a_language() {
        let parse = |json: &str| serde_json::from_str::<Option<Language>>(json);
        assert_eq!(parse(r#""en""#).unwrap(), Some(Language::En));
        assert_eq!(parse(r#""fr""#).unwrap(), Some(Language::Fr));
        assert_eq!(parse("null").unwrap(), None);
        for refused in [r#""de""#, r#""FR""#, r#""fr-FR""#, r#""""#, "1"] {
            assert!(parse(refused).is_err(), "{refused} must be refused");
        }
    }
}
