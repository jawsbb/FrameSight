//! What a mission run can give that warframe.market buys: the catalogue's drop lists read the other
//! way round, from the place to what falls there. The Farm page ranks places by it.
//!
//! Only mods, arcanes and relics are read. A Prime part drops from relics alone, so it reaches a
//! mission through the relic that holds it, and the page values that relic by its opening.

use std::collections::BTreeMap;

use warframe_domain::Category;

use crate::catalog::WfcdItem;
use crate::world_state::{BountyTier, Hub, Rotation};

/// One item at one place, per run.
#[derive(Clone, Debug, PartialEq)]
pub struct RunDrop {
    /// As the catalogue spells it: "Void/Mot (Survival), Rotation C".
    pub location: String,
    /// Percent per run, as published for mods, arcanes and relics.
    pub chance: f64,
    /// warframe.market's name for it: "Arcane Energize", "Axi A21 Relic".
    pub item: String,
    /// Its inventory path; for a relic, its intact refinement's, which keys the relic tables. A
    /// mission gives intact relics.
    pub path: String,
    /// A mod, an arcane or a relic.
    pub category: Category,
    /// For a bounty table that rotates with the cycle, its tier and letter.
    pub bounty: Option<(BountyTier, Rotation)>,
}

/// A rotating bounty table from how the catalogue names it,
/// "Earth/Cetus (Level 5 - 15 Cetus Bounty), Rotation C". Only the hubs' own bounties and the
/// Isolation Vaults rotate: a Ghoul, a Plague Star or a Höllvania table keeps one letter.
fn bounty_table(location: &str) -> Option<(BountyTier, Rotation)> {
    let (table, letter) = location.rsplit_once(", Rotation ")?;
    let rotation = Rotation::from_letter(letter)?;
    Hub::ALL.into_iter().find_map(|hub| {
        let (zone, bounty) = hub.zone();
        let levels = table
            .strip_prefix(zone)?
            .strip_prefix(" (Level ")?
            .strip_suffix(')')?;
        let (min, rest) = levels.split_once(" - ")?;
        let (max, label) = rest.split_once(' ')?;
        let vault = match label {
            "Isolation Vault" | "Arcana Isolation Vault" => true,
            _ if label == bounty => false,
            _ => return None,
        };
        let tier = BountyTier {
            hub,
            vault,
            min_level: min.parse().ok()?,
            max_level: max.parse().ok()?,
        };
        Some((tier, rotation))
    })
}

/// A rotation, a bounty stage or a single-reward node is a run. A bare name ("Scorpion",
/// "Profit-Taker", "Void Storm (Neptune)") is a kill or some other kind of source whose chance is
/// not per run, so it is left out rather than ranked on a unit it does not have.
fn is_run(location: &str) -> bool {
    location.contains('/') || location.contains(", Rotation ")
}

pub(crate) fn run_drops(raw: &[WfcdItem]) -> Vec<RunDrop> {
    // A bounty lists one item once per stage under the same label; the best stage stands for it,
    // since summing them would call one run every stage at once.
    let mut best: BTreeMap<(&str, String), (f64, &str, Category)> = BTreeMap::new();
    for item in raw {
        let (wanted, category) = match item.category.as_str() {
            "Mods" => (item.name.clone(), Category::Mod),
            "Arcanes" => (item.name.clone(), Category::Arcane),
            // The four refinements list the same drops; the intact one stands for the relic.
            "Relics" => match item.name.strip_suffix(" Intact") {
                Some(base) => (format!("{base} Relic"), Category::Relic),
                None => continue,
            },
            _ => continue,
        };
        for drop in &item.drops {
            // An item's list also names its variants: Serration lists Spectral Serration.
            let Some(chance) = drop.chance.filter(|chance| *chance > 0.0) else {
                continue;
            };
            if drop.item.as_deref() != Some(wanted.as_str()) || !is_run(&drop.location) {
                continue;
            }
            let held = best
                .entry((drop.location.as_str(), wanted.clone()))
                .or_insert((chance, &item.unique_name, category));
            held.0 = held.0.max(chance);
        }
    }
    best.into_iter()
        .map(|((location, item), (chance, path, category))| RunDrop {
            bounty: bounty_table(location),
            location: location.to_owned(),
            chance,
            item,
            path: path.to_owned(),
            category,
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse(json: &str) -> Vec<RunDrop> {
        run_drops(&serde_json::from_str::<Vec<WfcdItem>>(json).expect("fixture"))
    }

    #[test]
    fn only_runs_of_the_item_itself_are_kept() {
        let drops = parse(
            r#"[{"uniqueName":"/Lotus/Upgrades/Mods/Rifle/Serration","name":"Serration","category":"Mods","drops":[
                {"location":"Scorpion","chance":0.22,"type":"Serration"},
                {"location":"Earth/Mantle (Capture)","chance":0.5,"type":"Spectral Serration"},
                {"location":"Void/Mot (Survival), Rotation C","chance":2.5,"type":"Serration"}
            ]}]"#,
        );
        assert_eq!(
            drops,
            [RunDrop {
                location: "Void/Mot (Survival), Rotation C".to_owned(),
                chance: 2.5,
                item: "Serration".to_owned(),
                path: "/Lotus/Upgrades/Mods/Rifle/Serration".to_owned(),
                category: Category::Mod,
                bounty: None,
            }]
        );
    }

    #[test]
    fn a_relic_drops_as_its_intact_listing_and_a_bounty_stage_counts_once() {
        let drops = parse(
            r#"[
              {"uniqueName":"/Lotus/Types/Game/Projections/AxiBronze","name":"Axi A21 Intact","category":"Relics","drops":[
                {"location":"Earth/Cetus (Level 15 - 25 Plague Star), Rotation A","chance":0.42,"type":"Axi A21 Relic"},
                {"location":"Earth/Cetus (Level 15 - 25 Plague Star), Rotation A","chance":0.67,"type":"Axi A21 Relic"}
              ]},
              {"uniqueName":"/Lotus/Types/Game/Projections/AxiGold","name":"Axi A21 Radiant","category":"Relics","drops":[
                {"location":"Void/Mot (Survival), Rotation C","chance":0.29,"type":"Axi A21 Relic"}
              ]}
            ]"#,
        );
        assert_eq!(drops.len(), 1);
        assert_eq!(drops[0].item, "Axi A21 Relic");
        assert_eq!(drops[0].chance, 0.67);
        assert_eq!(drops[0].path, "/Lotus/Types/Game/Projections/AxiBronze");
        assert_eq!(drops[0].category, Category::Relic);
        // Plague Star is an event under Cetus, not one of its rotating bounties.
        assert_eq!(drops[0].bounty, None);
    }

    #[test]
    fn a_rotating_bounty_table_is_read_into_its_tier_and_letter() {
        let tier = |hub, vault, min_level, max_level| BountyTier {
            hub,
            vault,
            min_level,
            max_level,
        };
        assert_eq!(
            bounty_table("Earth/Cetus (Level 5 - 15 Cetus Bounty), Rotation C"),
            Some((tier(Hub::Cetus, false, 5, 15), Rotation::C))
        );
        assert_eq!(
            bounty_table("Deimos/Cambion Drift (Level 30 - 40 Arcana Isolation Vault), Rotation B"),
            Some((tier(Hub::Cambion, true, 30, 40), Rotation::B))
        );
        for fixed in [
            "Earth/Cetus (Level 15 - 25 Ghoul Bounty), Rotation A",
            "Earth/Cetus (Level 15 - 25 Plague Star), Rotation A",
            "Höllvania (Level  115 - 120 WF1999 Bounty), Rotation A",
            "Void/Mot (Survival), Rotation C",
            "Earth/Cetus (Level 5 - 15 Cetus Bounty)",
        ] {
            assert_eq!(bounty_table(fixed), None, "{fixed}");
        }
    }
}
