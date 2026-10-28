//! What the item sheet says about an item beyond its card, read from the same WFCD catalogue the
//! index parses: description, build, where it drops, abilities and headline stats. Kept apart from
//! the index's lookup tables because nothing else reads it, and shared behind an `Arc` because the
//! runtime clones the index for every consumer.

use std::collections::{BTreeMap, btree_map::Entry};

use serde::{Deserialize, Serialize};

use crate::catalog::{
    WfcdComponent, WfcdItem, component_order, grouped_components, is_prime_parent,
};

/// Drop rows kept per source list. A Prime part drops from three to eight relics; a resource lists
/// dozens of missions, of which the best few are what a player acts on.
const MAX_DROPS: usize = 8;

/// The update an item arrived in, as WFCD names it: "Update 12.4", dated.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct Introduced {
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub date: Option<String>,
}

/// A Warframe ability: its name and the catalogue's one-line description.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct Ability {
    pub name: String,
    #[serde(default)]
    pub description: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WfcdDrop {
    location: String,
    #[serde(default)]
    chance: Option<f64>,
    #[serde(default)]
    rarity: Option<String>,
    #[serde(rename = "type", default)]
    item: Option<String>,
    #[serde(default)]
    unique_name: Option<String>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Rarity {
    Common,
    Uncommon,
    Rare,
    Legendary,
}

/// One place an item drops: a relic, a mission rotation, an enemy.
#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct DropSource {
    pub location: String,
    /// In percent, as WFCD publishes it. Absent where the catalogue gives none.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub chance: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rarity: Option<Rarity>,
    /// Whether the relic this drops from is out of the drop tables. Known for relics only.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub vaulted: Option<bool>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum StatKey {
    Health,
    Shield,
    Armor,
    Energy,
    SprintSpeed,
    Damage,
    CriticalChance,
    CriticalMultiplier,
    StatusChance,
    FireRate,
    Magazine,
    Reload,
}

/// One headline stat at the catalogue's base values: chances as fractions, times in seconds.
#[derive(Clone, Copy, Debug, PartialEq, Serialize)]
pub struct StatValue {
    pub key: StatKey,
    pub value: f64,
}

/// One slot of an item's recipe, Prime or not: the copies a build takes.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ComponentSlot {
    pub path: String,
    /// WFCD's slot name: "Blueprint", "Chassis", "Orokin Cell".
    pub name: String,
    pub image_name: Option<String>,
    pub count: u32,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct ItemFacts {
    pub description: Option<String>,
    pub image_name: Option<String>,
    pub mastery_req: Option<u32>,
    pub vaulted: Option<bool>,
    pub prime: bool,
    pub introduced: Option<Introduced>,
    pub wiki_url: Option<String>,
    pub abilities: Vec<Ability>,
    pub stats: Vec<StatValue>,
    pub components: Vec<ComponentSlot>,
    pub drops: Vec<DropSource>,
}

/// Every item and every recipe component the catalogue describes, keyed by path. A component that
/// is also an item (Orokin Cell) keeps the item's facts, and borrows the component's drops only
/// when the item lists none.
pub(crate) fn facts_from(
    raw: &[WfcdItem],
    image_name: impl Fn(Option<&str>) -> Option<String>,
) -> BTreeMap<String, ItemFacts> {
    let relic_vaulted: BTreeMap<&str, bool> = raw
        .iter()
        .filter_map(|item| Some((item.unique_name.as_str(), item.vaulted?)))
        .collect();
    let mut facts = BTreeMap::new();
    for item in raw {
        facts.insert(
            item.unique_name.clone(),
            item_facts(item, &image_name, &relic_vaulted),
        );
    }
    for parent in raw {
        let prime = parent.is_prime || is_prime_parent(&parent.name);
        for component in &parent.components {
            // Shared components (Orokin Cell) recur hundreds of times: their drops are read once.
            let drops = || {
                drop_sources(
                    component.drops.as_deref().unwrap_or(&[]),
                    None,
                    &relic_vaulted,
                )
            };
            match facts.entry(component.unique_name.clone()) {
                Entry::Occupied(mut known) => {
                    if known.get().drops.is_empty() {
                        known.get_mut().drops = drops();
                    }
                }
                Entry::Vacant(slot) => {
                    slot.insert(component_facts(
                        component,
                        prime.then_some(parent),
                        drops(),
                        &image_name,
                    ));
                }
            }
        }
    }
    facts
}

fn item_facts(
    item: &WfcdItem,
    image_name: &impl Fn(Option<&str>) -> Option<String>,
    relic_vaulted: &BTreeMap<&str, bool>,
) -> ItemFacts {
    let stats = [
        (StatKey::Health, item.health),
        (StatKey::Shield, item.shield),
        (StatKey::Armor, item.armor),
        (StatKey::Energy, item.power),
        (StatKey::SprintSpeed, item.sprint_speed),
        (StatKey::Damage, item.total_damage),
        (StatKey::CriticalChance, item.critical_chance),
        (StatKey::CriticalMultiplier, item.critical_multiplier),
        (StatKey::StatusChance, item.proc_chance),
        (StatKey::FireRate, item.fire_rate),
        (StatKey::Magazine, item.magazine_size),
        (StatKey::Reload, item.reload_time),
    ]
    .into_iter()
    .filter_map(|(key, value)| Some(StatValue { key, value: value? }))
    .collect();
    ItemFacts {
        description: non_blank(item.description.as_deref()),
        image_name: image_name(item.image_name.as_deref()),
        mastery_req: item.mastery_req,
        vaulted: item.vaulted,
        prime: item.is_prime,
        introduced: item.introduced.clone(),
        // Opened in the system browser, so only ever the official wiki.
        wiki_url: item
            .wikia_url
            .clone()
            .filter(|url| url.starts_with("https://wiki.warframe.com/")),
        abilities: item.abilities.clone(),
        stats,
        components: recipe_slots(&item.components, &image_name),
        drops: drop_sources(&item.drops, Some(&item.name), relic_vaulted),
    }
}

/// A recipe component that is not an item of its own: a Prime part, a Warframe's Neuroptics. A
/// Prime part shares its parent's vault status, since it drops from nothing but relics.
fn component_facts(
    component: &WfcdComponent,
    prime_parent: Option<&WfcdItem>,
    drops: Vec<DropSource>,
    image_name: &impl Fn(Option<&str>) -> Option<String>,
) -> ItemFacts {
    ItemFacts {
        description: non_blank(component.description.as_deref()),
        image_name: image_name(component.image_name.as_deref()),
        vaulted: prime_parent.and_then(|parent| parent.vaulted),
        prime: prime_parent.is_some(),
        drops,
        ..ItemFacts::default()
    }
}

/// One slot per path, in the foundry's order, resources last.
fn recipe_slots(
    components: &[WfcdComponent],
    image_name: &impl Fn(Option<&str>) -> Option<String>,
) -> Vec<ComponentSlot> {
    let mut slots: Vec<ComponentSlot> = grouped_components(components)
        .into_iter()
        .map(|(path, (count, first))| ComponentSlot {
            path: path.to_owned(),
            name: first.name.clone(),
            image_name: image_name(first.image_name.as_deref()),
            count: count.max(1),
        })
        .collect();
    slots.sort_by(|left, right| {
        (component_order(&left.name), &left.name).cmp(&(component_order(&right.name), &right.name))
    });
    slots
}

/// The best few places to find it. A relic's four refinements are one relic: the intact chance
/// stands for it. An item's own list also names its variants (Serration lists Spectral
/// Serration), so `name`, when given, keeps only rows for the item itself.
fn drop_sources(
    drops: &[WfcdDrop],
    name: Option<&str>,
    relic_vaulted: &BTreeMap<&str, bool>,
) -> Vec<DropSource> {
    let mut sources: Vec<DropSource> = drops
        .iter()
        .filter(|drop| name.is_none_or(|name| drop.item.as_deref() == Some(name)))
        .filter(|drop| {
            ![" (Exceptional)", " (Flawless)", " (Radiant)"]
                .iter()
                .any(|refinement| drop.location.ends_with(refinement))
        })
        .map(|drop| DropSource {
            location: drop.location.clone(),
            chance: drop.chance,
            rarity: drop.rarity.as_deref().and_then(rarity),
            vaulted: drop
                .unique_name
                .as_deref()
                .and_then(|relic| relic_vaulted.get(relic).copied()),
        })
        .collect();
    sources.sort_by(|left, right| {
        right
            .chance
            .unwrap_or(-1.0)
            .total_cmp(&left.chance.unwrap_or(-1.0))
    });
    sources.truncate(MAX_DROPS);
    sources
}

fn rarity(word: &str) -> Option<Rarity> {
    match word {
        "Common" => Some(Rarity::Common),
        "Uncommon" => Some(Rarity::Uncommon),
        "Rare" => Some(Rarity::Rare),
        "Legendary" => Some(Rarity::Legendary),
        _ => None,
    }
}

fn non_blank(text: Option<&str>) -> Option<String> {
    text.map(str::trim)
        .filter(|text| !text.is_empty())
        .map(str::to_owned)
}
