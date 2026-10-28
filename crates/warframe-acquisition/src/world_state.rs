//! The game's public world state: the open-world cycles, void fissures and storms, the sortie, the
//! archon hunt and Baro Ki'Teer.
//!
//! Read from Digital Extremes' own `worldState.php`, the document the game client reads, rather
//! than from a mirror: `api.warframestat.us` was measured over two hours behind on 2026-10-28,
//! serving expired fissures as open. Node and boss names come from WFCD's tables, cached on disk
//! like the item catalogue; a code those tables do not know is shown as the code.
//!
//! Cycle rules follow `WFCD/warframe-worldstate-parser` (`lib/models/*Cycle.ts`):
//! - Cetus is read: night is the last 50 minutes of the Ostron bounty cycle, which ends at the
//!   `CetusSyndicate` expiry. The parser truncates that expiry to the minute; it is kept exact here.
//! - The Cambion Drift follows Cetus, Fass by day and Vome by night.
//! - Earth is computed: four-hour states from the Unix epoch, day first.
//! - Orb Vallis is computed: a 26m40s loop, 6m40s warm then 20 minutes cold, from the anchor the
//!   parser re-measured in February 2026 because the old one had drifted.
//!
//! Zariman and Duviri are left out: the parser's Zariman rule counts from a 2022 epoch against
//! bounty periods that run about a second short of 2.5 hours, so it has drifted by hours since,
//! and its Duviri rule is a bare clock with an unexplained offset nothing in the world state
//! confirms.

use std::{collections::HashMap, fs, io::Write, path::PathBuf, time::Duration};

use atomicwrites::{AtomicFile, OverwriteBehavior};
use reqwest::blocking::Client;
use serde::{Deserialize, Deserializer, Serialize};

use crate::catalog_cache::fetch_bounded;
use crate::collection_prices::USER_AGENT;

const WORLD_STATE_URL: &str = "https://api.warframe.com/cdn/worldState.php";
const WFCD_SOL_NODES_URL: &str =
    "https://raw.githubusercontent.com/WFCD/warframe-worldstate-data/master/data/solNodes.json";
const WFCD_MISSION_TYPES_URL: &str =
    "https://raw.githubusercontent.com/WFCD/warframe-worldstate-data/master/data/missionTypes.json";
const WFCD_SORTIE_DATA_URL: &str =
    "https://raw.githubusercontent.com/WFCD/warframe-worldstate-data/master/data/sortieData.json";

/// Names change with a game update, not by the hour.
const NAMES_MAX_AGE_SECS: u64 = 7 * 24 * 60 * 60;

const EARTH_STATE_MS: u64 = 4 * 60 * 60 * 1000;
const CETUS_NIGHT_MS: u64 = 50 * 60 * 1000;
/// 2026-02-04T19:46:48Z, the start of a warm phase.
const VALLIS_ANCHOR_MS: i64 = 1_770_234_408_000;
const VALLIS_LOOP_MS: i64 = 1_600_000;
const VALLIS_WARM_MS: i64 = 400_000;

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Place {
    Earth,
    Cetus,
    Vallis,
    Cambion,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum CycleState {
    Day,
    Night,
    Warm,
    Cold,
    Fass,
    Vome,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct Cycle {
    pub place: Place,
    pub state: CycleState,
    /// Unix milliseconds at which this state ends.
    pub expiry: u64,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Era {
    Lith,
    Meso,
    Neo,
    Axi,
    Requiem,
    Omnia,
}

impl Era {
    fn from_modifier(modifier: &str) -> Option<Self> {
        Some(match modifier {
            "VoidT1" => Self::Lith,
            "VoidT2" => Self::Meso,
            "VoidT3" => Self::Neo,
            "VoidT4" => Self::Axi,
            "VoidT5" => Self::Requiem,
            "VoidT6" => Self::Omnia,
            _ => return None,
        })
    }
}

/// A star-chart node: "Brugia (Eris)" split into its name and planet.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct Node {
    pub name: String,
    pub planet: Option<String>,
    pub enemy: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct Fissure {
    pub id: String,
    pub era: Era,
    /// In English as WFCD names it ("Mobile Defense"), the way the frontend translates it. A void
    /// storm lists no mission type, so it is the node's ("Skirmish").
    pub mission_type: String,
    pub node: Node,
    pub steel_path: bool,
    pub expiry: u64,
    #[serde(skip)]
    activation: u64,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct Mission {
    pub mission_type: String,
    pub node: Node,
}

/// A sortie or an archon hunt.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct Sortie {
    pub boss: String,
    pub faction: Option<String>,
    pub missions: Vec<Mission>,
    pub expiry: u64,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct Baro {
    pub activation: u64,
    pub expiry: u64,
    pub relay: Node,
}

/// What the dashboard draws, at one instant.
#[derive(Clone, Debug, Serialize)]
pub struct WorldView {
    pub cycles: Vec<Cycle>,
    pub fissures: Vec<Fissure>,
    pub storms: Vec<Fissure>,
    pub sortie: Option<Sortie>,
    pub archon_hunt: Option<Sortie>,
    pub baro: Option<Baro>,
}

/// One world state document, parsed. Cycles and expiries are worked out by [`WorldState::view`] at
/// the instant asked, so a copy kept a minute still answers for now.
#[derive(Clone, Debug)]
pub struct WorldState {
    /// The Ostron bounty cycles listed, as (activation, expiry): the current one and the next.
    cetus: Vec<(u64, u64)>,
    fissures: Vec<Fissure>,
    storms: Vec<Fissure>,
    sortie: Option<Sortie>,
    archon_hunt: Option<Sortie>,
    baro: Option<Baro>,
}

impl WorldState {
    /// `None` for anything that is not a world state document.
    pub fn parse(bytes: &[u8], names: &WorldNames) -> Option<Self> {
        let raw: Raw = serde_json::from_slice(bytes).ok()?;
        // A tier the app does not know is left out rather than guessed.
        let fissures = |list: Vec<RawFissure>| -> Vec<Fissure> {
            list.into_iter()
                .filter_map(|raw| {
                    Some(Fissure {
                        id: raw.id.oid,
                        era: Era::from_modifier(&raw.modifier)?,
                        mission_type: names.mission(&raw.mission_type, &raw.node),
                        node: names.node(&raw.node),
                        steel_path: raw.hard,
                        expiry: raw.expiry,
                        activation: raw.activation,
                    })
                })
                .collect()
        };
        Some(Self {
            cetus: raw
                .syndicate_missions
                .into_iter()
                .filter(|syndicate| syndicate.tag == "CetusSyndicate")
                .map(|syndicate| (syndicate.activation, syndicate.expiry))
                .collect(),
            fissures: fissures(raw.active_missions),
            storms: fissures(raw.void_storms),
            sortie: raw.sorties.into_iter().next().map(|s| s.resolve(names)),
            archon_hunt: raw
                .lite_sorties
                .into_iter()
                .next()
                .map(|s| s.resolve(names)),
            baro: raw.void_traders.into_iter().next().map(|trader| Baro {
                activation: trader.activation,
                expiry: trader.expiry,
                relay: names.node(&trader.node),
            }),
        })
    }

    /// The world at `now` (Unix milliseconds): its cycles, and what is open and not yet over.
    pub fn view(&self, now: u64) -> WorldView {
        let open = |fissures: &[Fissure]| {
            let mut open: Vec<Fissure> = fissures
                .iter()
                .filter(|fissure| fissure.activation <= now && now < fissure.expiry)
                .cloned()
                .collect();
            open.sort_by_key(|fissure| fissure.expiry);
            open
        };
        let cetus = cetus_cycle(now, &self.cetus);
        let cambion = cetus.as_ref().map(|cetus| Cycle {
            place: Place::Cambion,
            state: if cetus.state == CycleState::Day {
                CycleState::Fass
            } else {
                CycleState::Vome
            },
            expiry: cetus.expiry,
        });
        WorldView {
            cycles: [
                Some(earth_cycle(now)),
                cetus,
                Some(vallis_cycle(now)),
                cambion,
            ]
            .into_iter()
            .flatten()
            .collect(),
            fissures: open(&self.fissures),
            storms: open(&self.storms),
            sortie: self.sortie.clone().filter(|sortie| now < sortie.expiry),
            archon_hunt: self.archon_hunt.clone().filter(|hunt| now < hunt.expiry),
            baro: self.baro.clone().filter(|baro| now < baro.expiry),
        }
    }
}

fn earth_cycle(now: u64) -> Cycle {
    let phase = now / EARTH_STATE_MS;
    Cycle {
        place: Place::Earth,
        state: if phase % 2 == 0 {
            CycleState::Day
        } else {
            CycleState::Night
        },
        expiry: (phase + 1) * EARTH_STATE_MS,
    }
}

/// The bounty cycle running at `now` decides: day until its last 50 minutes, night through them.
/// Absent when the document lists none running then.
fn cetus_cycle(now: u64, bounties: &[(u64, u64)]) -> Option<Cycle> {
    let &(_, end) = bounties
        .iter()
        .find(|&&(activation, expiry)| activation <= now && now < expiry)?;
    let night = end.saturating_sub(CETUS_NIGHT_MS);
    let (state, expiry) = if now < night {
        (CycleState::Day, night)
    } else {
        (CycleState::Night, end)
    };
    Some(Cycle {
        place: Place::Cetus,
        state,
        expiry,
    })
}

fn vallis_cycle(now: u64) -> Cycle {
    let now = now as i64;
    let since = (now - VALLIS_ANCHOR_MS).rem_euclid(VALLIS_LOOP_MS);
    let (state, end) = if since < VALLIS_WARM_MS {
        (CycleState::Warm, VALLIS_WARM_MS)
    } else {
        (CycleState::Cold, VALLIS_LOOP_MS)
    };
    Cycle {
        place: Place::Vallis,
        state,
        expiry: (now - since + end) as u64,
    }
}

/// WFCD's node and boss tables, reduced to what the dashboard names.
#[derive(Clone, Debug, Default, Deserialize, Serialize)]
pub struct WorldNames {
    nodes: HashMap<String, WfcdNode>,
    missions: HashMap<String, WfcdValue>,
    bosses: HashMap<String, WfcdBoss>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
struct WfcdNode {
    value: String,
    #[serde(default)]
    enemy: Option<String>,
    #[serde(default, rename = "type")]
    kind: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
struct WfcdValue {
    value: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
struct WfcdBoss {
    name: String,
    #[serde(default)]
    faction: Option<String>,
}

impl WorldNames {
    /// `solNodes.json`, `missionTypes.json` and `sortieData.json` from
    /// `WFCD/warframe-worldstate-data`.
    pub fn from_wfcd(sol_nodes: &[u8], mission_types: &[u8], sortie_data: &[u8]) -> Option<Self> {
        #[derive(Deserialize)]
        struct SortieData {
            bosses: HashMap<String, WfcdBoss>,
        }
        Some(Self {
            nodes: serde_json::from_slice(sol_nodes).ok()?,
            missions: serde_json::from_slice(mission_types).ok()?,
            bosses: serde_json::from_slice::<SortieData>(sortie_data)
                .ok()?
                .bosses,
        })
    }

    pub fn is_empty(&self) -> bool {
        self.nodes.is_empty()
    }

    fn node(&self, code: &str) -> Node {
        let Some(node) = self.nodes.get(code) else {
            return Node {
                name: code.to_owned(),
                planet: None,
                enemy: None,
            };
        };
        let (name, planet) = node
            .value
            .strip_suffix(')')
            .and_then(|value| value.rsplit_once(" ("))
            .map_or((node.value.as_str(), None), |(name, planet)| {
                (name, Some(planet.to_owned()))
            });
        Node {
            name: name.to_owned(),
            planet,
            enemy: node.enemy.clone(),
        }
    }

    /// A mission type's name, else the node's mission, else the code itself.
    fn mission(&self, code: &str, node: &str) -> String {
        self.missions
            .get(code)
            .map(|mission| mission.value.clone())
            .or_else(|| self.nodes.get(node)?.kind.clone())
            .unwrap_or_else(|| code.to_owned())
    }

    fn boss(&self, code: &str) -> (String, Option<String>) {
        self.bosses.get(code).map_or_else(
            || (code.to_owned(), None),
            |boss| (boss.name.clone(), boss.faction.clone()),
        )
    }
}

#[derive(Deserialize, Serialize)]
struct NamesGeneration {
    fetched_unix: u64,
    names: WorldNames,
}

/// WFCD's names on disk, refreshed when a week old.
pub struct WorldNamesCache {
    path: PathBuf,
}

impl WorldNamesCache {
    pub fn new(directory: impl Into<PathBuf>) -> Self {
        Self {
            path: directory.into().join("world-names.json"),
        }
    }

    /// The cached tables while younger than a week; otherwise `fetch`, stored; failing that the
    /// cache however old, and failing that no names at all, so every node shows as its code.
    pub fn load(&self, fetch: impl FnOnce() -> Option<WorldNames>, now_unix: u64) -> WorldNames {
        let cached = fs::read(&self.path)
            .ok()
            .and_then(|bytes| serde_json::from_slice::<NamesGeneration>(&bytes).ok());
        let cached = match cached {
            Some(generation)
                if now_unix.saturating_sub(generation.fetched_unix) < NAMES_MAX_AGE_SECS =>
            {
                return generation.names;
            }
            stale => stale,
        };
        if let Some(names) = fetch() {
            // A cache that cannot be written only means the tables are fetched again next time.
            if let Ok(bytes) = serde_json::to_vec(&NamesGeneration {
                fetched_unix: now_unix,
                names: names.clone(),
            }) && let Some(directory) = self.path.parent()
                && fs::create_dir_all(directory).is_ok()
            {
                let _ = AtomicFile::new(&self.path, OverwriteBehavior::AllowOverwrite)
                    .write(|file| file.write_all(&bytes).and_then(|_| file.sync_all()));
            }
            return names;
        }
        cached
            .map(|generation| generation.names)
            .unwrap_or_default()
    }
}

pub struct WorldStateHttp {
    client: Client,
}

impl WorldStateHttp {
    pub fn new() -> Option<Self> {
        Client::builder()
            .connect_timeout(Duration::from_secs(5))
            .timeout(Duration::from_secs(15))
            .user_agent(USER_AGENT)
            .build()
            .ok()
            .map(|client| Self { client })
    }

    pub fn world_state(&self) -> Option<Vec<u8>> {
        fetch_bounded(&self.client, WORLD_STATE_URL).ok()
    }

    pub fn names(&self) -> Option<WorldNames> {
        let get = |url| fetch_bounded(&self.client, url).ok();
        WorldNames::from_wfcd(
            &get(WFCD_SOL_NODES_URL)?,
            &get(WFCD_MISSION_TYPES_URL)?,
            &get(WFCD_SORTIE_DATA_URL)?,
        )
    }
}

// The document's own shape. Dates are Mongo extended JSON: `{"$date":{"$numberLong":"…"}}`.

#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct Raw {
    #[serde(rename = "Time")]
    _time: u64,
    #[serde(default)]
    active_missions: Vec<RawFissure>,
    #[serde(default)]
    void_storms: Vec<RawFissure>,
    #[serde(default)]
    syndicate_missions: Vec<RawSyndicate>,
    #[serde(default)]
    sorties: Vec<RawSortie>,
    #[serde(default)]
    lite_sorties: Vec<RawSortie>,
    #[serde(default)]
    void_traders: Vec<RawTrader>,
}

#[derive(Deserialize)]
struct Oid {
    #[serde(rename = "$oid")]
    oid: String,
}

fn mongo_date<'de, D: Deserializer<'de>>(deserializer: D) -> Result<u64, D::Error> {
    #[derive(Deserialize)]
    struct Date {
        #[serde(rename = "$date")]
        date: NumberLong,
    }
    #[derive(Deserialize)]
    struct NumberLong {
        #[serde(rename = "$numberLong")]
        millis: String,
    }
    Date::deserialize(deserializer)?
        .date
        .millis
        .parse()
        .map_err(serde::de::Error::custom)
}

#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct RawFissure {
    #[serde(rename = "_id")]
    id: Oid,
    #[serde(deserialize_with = "mongo_date")]
    activation: u64,
    #[serde(deserialize_with = "mongo_date")]
    expiry: u64,
    node: String,
    /// A void storm lists none.
    #[serde(default)]
    mission_type: String,
    /// A void storm calls it `ActiveMissionTier`.
    #[serde(alias = "ActiveMissionTier")]
    modifier: String,
    #[serde(default)]
    hard: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct RawSyndicate {
    tag: String,
    #[serde(deserialize_with = "mongo_date")]
    activation: u64,
    #[serde(deserialize_with = "mongo_date")]
    expiry: u64,
}

/// A sortie lists `Variants`, an archon hunt `Missions`; both are `{missionType, node}`.
#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct RawSortie {
    #[serde(deserialize_with = "mongo_date")]
    expiry: u64,
    boss: String,
    #[serde(default)]
    variants: Vec<RawMission>,
    #[serde(default)]
    missions: Vec<RawMission>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawMission {
    mission_type: String,
    node: String,
}

impl RawSortie {
    fn resolve(self, names: &WorldNames) -> Sortie {
        let (boss, faction) = names.boss(&self.boss);
        Sortie {
            boss,
            faction,
            missions: self
                .variants
                .into_iter()
                .chain(self.missions)
                .map(|mission| Mission {
                    mission_type: names.mission(&mission.mission_type, &mission.node),
                    node: names.node(&mission.node),
                })
                .collect(),
            expiry: self.expiry,
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct RawTrader {
    #[serde(deserialize_with = "mongo_date")]
    activation: u64,
    #[serde(deserialize_with = "mongo_date")]
    expiry: u64,
    node: String,
}
