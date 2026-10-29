use std::collections::{BTreeMap, BTreeSet};

use serde::{Deserialize, Serialize};

use crate::{CatalogError, CatalogIndex, RewardNeedle};

#[derive(Clone, Debug, Default)]
pub struct RelicRewardIndex {
    relics: BTreeMap<String, Relic>,
}

/// One refinement of one relic as WFCD's Relics.json publishes it: "Axi A1 Exceptional".
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Relic {
    /// WFCD's name, refinement included. Empty when the record has none.
    pub name: String,
    /// `None` when WFCD does not say.
    pub vaulted: Option<bool>,
    pub drops: Vec<RelicDrop>,
}

/// One reward of a relic refinement, with the chance WFCD gives it at that refinement.
#[derive(Clone, Debug, PartialEq)]
pub struct RelicDrop {
    /// Spelled as the relic tables and the reward screen spell it: "2X Forma Blueprint".
    pub name: String,
    /// Percent, as published: 25.33 for an intact common. `None` when the record has none.
    pub chance: Option<f64>,
}

impl RelicRewardIndex {
    pub fn from_wfcd_json(bytes: &[u8]) -> Result<Self, CatalogError> {
        let records: Vec<RelicRecord> =
            serde_json::from_slice(bytes).map_err(|_| CatalogError::InvalidJson)?;
        let mut relics = BTreeMap::new();
        for record in records {
            if !record
                .unique_name
                .starts_with("/Lotus/Types/Game/Projections/")
            {
                continue;
            }
            let mut seen = BTreeSet::new();
            let drops = record
                .rewards
                .into_iter()
                .map(|reward| RelicDrop {
                    name: reward.item.name.trim().to_owned(),
                    chance: reward.chance,
                })
                .filter(|drop| !drop.name.is_empty() && seen.insert(drop.name.clone()))
                .collect::<Vec<_>>();
            if !drops.is_empty() {
                relics.insert(
                    record.unique_name,
                    Relic {
                        name: record.name.trim().to_owned(),
                        vaulted: record.vaulted,
                        drops,
                    },
                );
            }
        }
        Ok(Self { relics })
    }

    /// Every reward a relic in the index can drop, spelled as the relic tables and the reward
    /// screen spell it: "2X Forma Blueprint", "Lavos Prime Chassis Blueprint". A reward several
    /// relics share comes once per relic.
    pub fn reward_names(&self) -> impl Iterator<Item = &str> {
        self.relics
            .values()
            .flat_map(|relic| &relic.drops)
            .map(|drop| drop.name.as_str())
    }

    /// The relic refinement held at an inventory path: `/Lotus/Types/Game/Projections/…Silver`.
    pub fn relic(&self, projection_path: &str) -> Option<&Relic> {
        self.relics.get(projection_path)
    }

    pub fn candidates_for_projection_paths(
        &self,
        projection_paths: &[String],
        catalog: &CatalogIndex,
    ) -> Vec<RewardNeedle> {
        projection_paths
            .iter()
            .filter_map(|path| self.relics.get(path))
            .flat_map(|relic| relic.drops.iter().map(|drop| &drop.name))
            .collect::<BTreeSet<_>>()
            .into_iter()
            .filter_map(|name| {
                RewardNeedle::from_paths(name.clone(), reward_catalog_paths(name, catalog)).ok()
            })
            .collect()
    }
}

/// WFCD's Relics.json in the shape [`RelicRewardIndex::from_wfcd_json`] reads, put together from
/// the two files WFCD keeps current. Its Relics.json stopped carrying rewards, and the last copy
/// that did predates the Citrine Prime relics, so a squad opening one was matched against no pool.
/// The relics give each projection path its name ("Axi C12 Intact"); the drop tables give the
/// rewards under that same name. A relic no drop location lists any more is vaulted.
pub fn join_wfcd_drop_tables(relics: &[u8], drop_tables: &[u8]) -> Result<Vec<u8>, CatalogError> {
    let relics: Vec<CurrentRelicRecord> =
        serde_json::from_slice(relics).map_err(|_| CatalogError::InvalidJson)?;
    let tables: DropTables =
        serde_json::from_slice(drop_tables).map_err(|_| CatalogError::InvalidJson)?;
    let mut rewards = BTreeMap::new();
    for table in tables.relics {
        rewards.insert(
            format!("{} {} {}", table.tier, table.relic_name, table.state),
            table.rewards,
        );
    }
    let joined = relics
        .into_iter()
        .filter_map(|relic| {
            let drops = rewards.get(relic.name.trim())?;
            Some(JoinedRelic {
                vaulted: relic.drops.is_empty(),
                rewards: drops
                    .iter()
                    .map(|drop| JoinedReward {
                        item: JoinedItem {
                            name: &drop.item_name,
                        },
                        chance: drop.chance,
                    })
                    .collect(),
                unique_name: relic.unique_name,
                name: relic.name,
            })
        })
        .collect::<Vec<_>>();
    if joined.is_empty() {
        return Err(CatalogError::InvalidMetadata);
    }
    serde_json::to_vec(&joined).map_err(|_| CatalogError::InvalidJson)
}

fn reward_catalog_paths(name: &str, catalog: &CatalogIndex) -> Vec<String> {
    // Relic rewards conventionally add ` Blueprint` to component names. Prefer the component
    // identity even when the catalog also has an exact inventory-recipe alias for that wording.
    if let Some(component_name) = name.strip_suffix(" Blueprint") {
        let paths = catalog.paths_for_name(component_name);
        if !paths.is_empty() {
            return paths;
        }
    }
    let exact = catalog.paths_for_name(name);
    if !exact.is_empty() {
        return exact;
    }

    for alias in [
        crate::catalog::without_quantity(name),
        name.strip_suffix(" Blueprint"),
    ]
    .into_iter()
    .flatten()
    {
        let paths = catalog.paths_for_name(alias);
        if !paths.is_empty() {
            return paths;
        }
        if let Some(component_name) = alias.strip_suffix(" Blueprint") {
            let paths = catalog.paths_for_name(component_name);
            if !paths.is_empty() {
                return paths;
            }
        }
    }
    Vec::new()
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RelicRecord {
    unique_name: String,
    #[serde(default)]
    name: String,
    #[serde(default)]
    vaulted: Option<bool>,
    #[serde(default)]
    rewards: Vec<RelicReward>,
}

#[derive(Deserialize)]
struct RelicReward {
    item: RelicRewardItem,
    #[serde(default)]
    chance: Option<f64>,
}

#[derive(Deserialize)]
struct RelicRewardItem {
    name: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CurrentRelicRecord {
    unique_name: String,
    #[serde(default)]
    name: String,
    #[serde(default)]
    drops: Vec<serde::de::IgnoredAny>,
}

#[derive(Deserialize)]
struct DropTables {
    relics: Vec<DropTable>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DropTable {
    tier: String,
    #[serde(default)]
    relic_name: String,
    state: String,
    rewards: Vec<DropTableReward>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DropTableReward {
    item_name: String,
    #[serde(default)]
    chance: Option<f64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct JoinedRelic<'a> {
    unique_name: String,
    name: String,
    vaulted: bool,
    rewards: Vec<JoinedReward<'a>>,
}

#[derive(Serialize)]
struct JoinedReward<'a> {
    item: JoinedItem<'a>,
    chance: Option<f64>,
}

#[derive(Serialize)]
struct JoinedItem<'a> {
    name: &'a str,
}
