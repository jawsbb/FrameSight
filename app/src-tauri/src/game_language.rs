//! The language the game draws its screens in, and what it calls each reward in it.
//!
//! The screen readers match cards against English names, so a game running in French read nothing
//! at all: `Braton Prime - Canon` is not near enough to `Braton Prime Barrel` to name it, and no
//! overlay ever showed. The game says its language at the top of EE.log, and warframe.market
//! publishes the game's own names in it, so a card can be read in either spelling and still be
//! named by its English one, which is what every price, ducat and mastery lookup keys on.

use std::{
    collections::HashMap,
    io::Read,
    path::Path,
    sync::{Arc, RwLock},
};

/// A game language whose names the readers can match: the market's code for it, and what the game
/// writes for ` Blueprint` after a name. French only: the readers run Tesseract's English model and
/// fold accents away, which was checked for French names and is not known to hold for any other.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct Language {
    code: &'static str,
    /// `Braton Prime Blueprint` is `Braton Prime (Schéma)` on the market, as every Prime blueprint
    /// it names is. It spells the blueprints the market does not trade, Forma's first.
    blueprint: &'static str,
}

pub(crate) const FRENCH: Language = Language {
    code: "fr",
    blueprint: " (Schéma)",
};

fn readable(code: &str) -> Option<Language> {
    (code == FRENCH.code).then_some(FRENCH)
}

/// What the game calls each reward in the language it runs in, by its English name.
#[derive(Debug)]
pub struct Spellings {
    language: Language,
    names: HashMap<String, String>,
}

impl Spellings {
    pub fn new(language: Language, names: HashMap<String, String>) -> Self {
        Self { language, names }
    }

    /// The game's name for `english`, when it is known or can be put together.
    pub fn of(&self, english: &str) -> Option<String> {
        if let Some(localized) = self.names.get(english) {
            return Some(localized.clone());
        }
        let base = english.strip_suffix(" Blueprint")?;
        Some(format!(
            "{}{}",
            self.names.get(base).map_or(base, String::as_str),
            self.language.blueprint
        ))
    }
}

static SPELLINGS: RwLock<Option<Arc<Spellings>>> = RwLock::new(None);

/// The names the readers match besides English, while the game runs in another language.
pub fn spellings() -> Option<Arc<Spellings>> {
    SPELLINGS
        .read()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .clone()
}

fn use_spellings(spellings: Option<Spellings>) {
    *SPELLINGS
        .write()
        .unwrap_or_else(|poisoned| poisoned.into_inner()) = spellings.map(Arc::new);
}

/// How much of EE.log to look through. Both markers sit in its first few kilobytes: the command
/// line on its first line, `Using language` some 5 KB in.
const HEAD_BYTES: u64 = 64 * 1024;

/// The game's language code, from the top of an EE.log: the `-language:` switch on the command
/// line the log opens with, or the engine's own `Using language: _fr` a little later.
pub fn parse(head: &[u8]) -> Option<String> {
    let head = String::from_utf8_lossy(head);
    let after = |marker: &str| {
        let start = head.find(marker)? + marker.len();
        let code = head[start..]
            .split(|character: char| !character.is_ascii_alphanumeric() && character != '-')
            .next()?;
        (!code.is_empty()).then(|| code.to_ascii_lowercase())
    };
    after("-language:").or_else(|| after("Using language: _"))
}

/// Read the game's language from its EE.log and make the readers match its names, loading them
/// from warframe.market in the background. English, or a language the readers cannot match,
/// leaves them on English alone. Names already loaded for the language are kept; a load that
/// failed leaves none, so the next attach asks again.
pub fn follow(log: &Path, pacer: warframe_acquisition::RequestPacer) {
    let mut head = Vec::new();
    if std::fs::File::open(log)
        .and_then(|file| file.take(HEAD_BYTES).read_to_end(&mut head))
        .is_err()
    {
        return;
    }
    let Some(code) = parse(&head) else {
        return;
    };
    let Some(language) = readable(&code) else {
        log::info!("ocr: the game runs in {code}; reading English names only");
        use_spellings(None);
        return;
    };
    if spellings().is_some_and(|spellings| spellings.language == language) {
        return;
    }
    let _ = std::thread::Builder::new()
        .name("game-language".to_owned())
        .spawn(move || {
            let names = warframe_market::MarketHttp::new(pacer)
                .and_then(|transport| warframe_market::localized_names(&transport, language.code));
            match names {
                Ok(names) => {
                    log::info!(
                        "ocr: the game runs in {}; reading {} names in it",
                        language.code,
                        names.len()
                    );
                    use_spellings(Some(Spellings::new(language, names)));
                }
                Err(error) => log::warn!(
                    "ocr: the game's {} names could not be loaded: {error:?}",
                    language.code
                ),
            }
        });
}

#[cfg(test)]
mod tests {
    use super::{FRENCH, Spellings, parse};
    use std::collections::HashMap;

    /// The first line of a real EE.log, 2026-10-28.
    #[test]
    fn the_command_line_names_the_language() {
        let head = b"0.227 Sys [Diag]: Process Command-line: -windowMode:2 -shaderCache:1 \
            -graphicsDriver:dx11 -gpuPreference:2 -cluster:public -language:fr -clienttype:Steam\n";
        assert_eq!(parse(head).as_deref(), Some("fr"));
    }

    #[test]
    fn the_engine_line_names_it_without_the_switch() {
        let head = b"0.227 Sys [Diag]: Process Command-line: -cluster:public\n\
            3.628 Sys [Info]: Using language: _fr\n";
        assert_eq!(parse(head).as_deref(), Some("fr"));
        assert_eq!(parse(b"0.227 Sys [Diag]: nothing here\n"), None);
    }

    fn french() -> Spellings {
        Spellings::new(
            FRENCH,
            HashMap::from([
                (
                    "Braton Prime Barrel".to_owned(),
                    "Braton Prime - Canon".to_owned(),
                ),
                (
                    "Braton Prime Blueprint".to_owned(),
                    "Braton Prime (Schéma)".to_owned(),
                ),
                (
                    "Styanax Prime Chassis Blueprint".to_owned(),
                    "Styanax Prime - Châssis (Schéma)".to_owned(),
                ),
            ]),
        )
    }

    #[test]
    fn a_traded_name_is_the_markets() {
        assert_eq!(
            french().of("Braton Prime Barrel").as_deref(),
            Some("Braton Prime - Canon")
        );
        assert_eq!(french().of("Lex Prime Receiver"), None);
    }

    /// Forma blueprints are not traded, so the market has no name for them; they are spelled the
    /// way every Prime blueprint the market does name is.
    #[test]
    fn an_untraded_blueprint_is_spelled_as_the_traded_ones() {
        assert_eq!(
            french().of("Forma Blueprint").as_deref(),
            Some("Forma (Schéma)")
        );
        assert_eq!(
            french().of("2X Forma Blueprint").as_deref(),
            Some("2X Forma (Schéma)")
        );
    }
}
