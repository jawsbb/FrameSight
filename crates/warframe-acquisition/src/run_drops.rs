//! What a mission run can give that warframe.market buys: the catalogue's drop lists read the other
//! way round, from the place to what falls there. The Farm page ranks places by it.
//!
//! Only mods, arcanes and relics are read. A Prime part drops from relics alone, so it reaches a
//! mission through the relic that holds it, and the page values that relic by its opening.

use std::collections::BTreeMap;

use crate::catalog::WfcdItem;

/// One item at one place, per run.
#[derive(Clone, Debug, PartialEq)]
pub struct RunDrop {
    /// As the catalogue spells it: "Void/Mot (Survival), Rotation C".
    pub location: String,
    /// Percent per run, as published for mods, arcanes and relics.
    pub chance: f64,
    /// warframe.market's name for it: "Arcane Energize", "Axi A21 Relic".
    pub item: String,
    /// For a relic, its intact refinement's inventory path, which keys the relic tables. A mission
    /// gives intact relics.
    pub relic: Option<String>,
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
    let mut best: BTreeMap<(&str, String), (f64, Option<&str>)> = BTreeMap::new();
    for item in raw {
        let (wanted, relic) = match item.category.as_str() {
            "Mods" | "Arcanes" => (item.name.clone(), None),
            // The four refinements list the same drops; the intact one stands for the relic.
            "Relics" => match item.name.strip_suffix(" Intact") {
                Some(base) => (format!("{base} Relic"), Some(item.unique_name.as_str())),
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
                .or_insert((chance, relic));
            held.0 = held.0.max(chance);
        }
    }
    best.into_iter()
        .map(|((location, item), (chance, relic))| RunDrop {
            location: location.to_owned(),
            chance,
            item,
            relic: relic.map(str::to_owned),
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
                relic: None,
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
        assert_eq!(
            drops[0].relic.as_deref(),
            Some("/Lotus/Types/Game/Projections/AxiBronze")
        );
    }
}
