//! The Relics page: the relics the account holds, what one opening returns on average, and what
//! the relic itself sells for.
//!
//! Built on demand from what is already loaded (the stored collection, WFCD's relic tables, the
//! daily price table, the catalogue's ducats and this run's mastery facts); nothing here asks the
//! network.

use std::sync::Arc;

use serde::Serialize;
use warframe_acquisition::{
    Holdings, MasteryLedger, RelicRewardIndex, holding_matches_reward, reward_name_matches,
};
use warframe_domain::{Category, MasteryMark};

use crate::{AppCore, AppError};

/// A relic's refinement, read off WFCD's name for it: "Axi A1 Exceptional".
#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Refinement {
    Intact,
    Exceptional,
    Flawless,
    Radiant,
}

impl Refinement {
    const ALL: [(Self, &'static str); 4] = [
        (Self::Intact, " Intact"),
        (Self::Exceptional, " Exceptional"),
        (Self::Flawless, " Flawless"),
        (Self::Radiant, " Radiant"),
    ];

    /// What follows the relic's name: " Radiant".
    pub(crate) fn suffix(self) -> &'static str {
        Self::ALL
            .iter()
            .find(|(refinement, _)| *refinement == self)
            .map_or("", |(_, suffix)| suffix)
    }

    /// The relic's name without its refinement, and the refinement, when the name carries one.
    fn split(name: &str) -> (&str, Option<Self>) {
        Self::ALL
            .iter()
            .find_map(|(refinement, suffix)| Some((name.strip_suffix(suffix)?, Some(*refinement))))
            .unwrap_or((name, None))
    }

    /// The game's chance for one common, one uncommon and one rare reward, in percent. Used only to
    /// name a reward's rarity: WFCD's own `rarity` field calls the commons "Uncommon".
    const fn chances(self) -> [f64; 3] {
        match self {
            Self::Intact => [25.33, 11.0, 2.0],
            Self::Exceptional => [23.33, 13.0, 4.0],
            Self::Flawless => [20.0, 17.0, 6.0],
            Self::Radiant => [16.67, 20.0, 10.0],
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Rarity {
    Common,
    Uncommon,
    Rare,
}

/// The rarity whose standard chance at this refinement is nearest the published one.
fn rarity(refinement: Option<Refinement>, chance: Option<f64>) -> Option<Rarity> {
    let (chances, chance) = (refinement?.chances(), chance?);
    [Rarity::Common, Rarity::Uncommon, Rarity::Rare]
        .into_iter()
        .zip(chances)
        .min_by(|(_, left), (_, right)| (left - chance).abs().total_cmp(&(right - chance).abs()))
        .map(|(rarity, _)| rarity)
}

#[derive(Clone, Debug, Serialize)]
pub struct RelicsView {
    /// Whether WFCD's relic tables are loaded. Without them nothing is known of what a relic drops.
    pub catalog: bool,
    /// The date of the price dump in use, or `None` while no prices have loaded.
    pub prices_date: Option<String>,
    /// Whether the catalogue's ducat values are loaded.
    pub ducats: bool,
    pub relics: Vec<RelicView>,
}

#[derive(Clone, Debug, Serialize)]
pub struct RelicView {
    /// The inventory path, which names the refinement too.
    pub id: String,
    /// "Axi A1", without the refinement.
    pub name: String,
    /// "Lith", "Meso", "Neo", "Axi", "Requiem", or whatever first word the relic carries.
    pub era: String,
    pub refinement: Option<Refinement>,
    pub quantity: u32,
    pub vaulted: Option<bool>,
    /// What one copy of the relic sells for.
    pub platinum: Option<u32>,
    pub monthly_trades: Option<u32>,
    /// `None` when the relic tables are not loaded, do not know this relic, or give no chances.
    pub opening: Option<Opening>,
    pub rewards: Vec<RelicRewardView>,
}

#[derive(Clone, Debug, Serialize)]
pub struct RelicRewardView {
    pub name: String,
    pub rarity: Option<Rarity>,
    /// Percent at this refinement.
    pub chance: Option<f64>,
    pub platinum: Option<u32>,
    /// `None` both for a reward Baro does not take and while the ducat values are not loaded.
    pub ducats: Option<u32>,
    pub owned: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mastery: Option<MasteryMark>,
}

/// What one opening returns on average. An estimate by construction: the chances are the game's,
/// the prices are a market's middle.
#[derive(Clone, Copy, Debug, PartialEq, Serialize)]
pub struct Opening {
    /// The sum of chance times price over the rewards that have a price.
    pub platinum: f64,
    /// The same sum in ducats, a reward Baro does not take counting as none. `None` while the
    /// ducat values are not loaded.
    pub ducats: Option<f64>,
    /// Rewards left out of `platinum` for want of a price, so the figure is a floor and says so.
    pub unpriced: u32,
    /// Their combined chance, in percent.
    pub unpriced_chance: f64,
}

/// The average one opening returns, or `None` when a reward's chance is unknown.
///
/// A reward without a price is left out rather than counted at zero and the count of them is
/// kept, so the page can say the figure is a floor. Ducats are known or not as a whole.
pub fn opening(rewards: &[RelicRewardView], ducats_known: bool) -> Option<Opening> {
    let mut opening = Opening {
        platinum: 0.0,
        ducats: ducats_known.then_some(0.0),
        unpriced: 0,
        unpriced_chance: 0.0,
    };
    for reward in rewards {
        let percent = reward.chance?;
        let chance = percent / 100.0;
        match reward.platinum {
            Some(platinum) => opening.platinum += chance * f64::from(platinum),
            None => {
                opening.unpriced += 1;
                opening.unpriced_chance += percent;
            }
        }
        if let Some(ducats) = opening.ducats.as_mut() {
            *ducats += chance * f64::from(reward.ducats.unwrap_or(0));
        }
    }
    Some(opening)
}

impl AppCore {
    /// WFCD's relic tables, once something has loaded them. Held like the price table.
    pub fn set_relic_index(&mut self, relics: Arc<RelicRewardIndex>) {
        self.relics = Some(relics);
    }

    pub fn has_relic_index(&self) -> bool {
        self.relics.is_some()
    }

    /// The held relics, valued. A saved snapshot answers the same way a live one does; the page
    /// says which it is.
    pub fn relics_view(&self) -> Result<RelicsView, AppError> {
        let collection = self.store.load_collection()?;
        let holdings = Holdings::from_entries(collection.entries());
        let ledger = self
            .mastery_catalog
            .as_deref()
            .map(|catalog| MasteryLedger::new(catalog, &holdings, self.mastery_facts.as_ref()));
        let reward_ducats = self
            .mastery_catalog
            .as_deref()
            .map(|catalog| catalog.reward_entries())
            .unwrap_or_default();
        let platinum = |name: &str| {
            let prices = self.prices.as_ref()?;
            let live = prices
                .market_name(name)
                .zip(self.live.as_ref())
                .and_then(|(market_name, cache)| cache.get(&market_name));
            live.or_else(|| prices.price_for(name))
        };
        let owned = |reward: &str| {
            collection
                .entries()
                .filter(|entry| holding_matches_reward(&entry.item.name, reward))
                .map(|entry| entry.quantity)
                .sum()
        };
        let relics = collection
            .entries()
            .filter(|entry| entry.item.category == Category::Relic && entry.quantity > 0)
            .map(|entry| {
                let relic = self
                    .relics
                    .as_deref()
                    .and_then(|index| index.relic(entry.item.id.catalog_path()));
                let full_name = relic
                    .map(|relic| relic.name.as_str())
                    .filter(|name| !name.is_empty())
                    .unwrap_or(&entry.item.name);
                let (name, refinement) = Refinement::split(full_name);
                let rewards = relic
                    .map(|relic| relic.drops.as_slice())
                    .unwrap_or_default()
                    .iter()
                    .map(|drop| RelicRewardView {
                        name: drop.name.clone(),
                        rarity: rarity(refinement, drop.chance),
                        chance: drop.chance,
                        platinum: platinum(&drop.name),
                        ducats: reward_ducats
                            .iter()
                            .find(|entry| reward_name_matches(&entry.name, &drop.name))
                            .map(|entry| entry.ducats)
                            .filter(|ducats| *ducats > 0),
                        owned: owned(&drop.name),
                        mastery: ledger
                            .as_ref()
                            .and_then(|ledger| ledger.reward_mark(&drop.name)),
                    })
                    .collect::<Vec<_>>();
                RelicView {
                    id: entry.item.id.as_str().to_owned(),
                    era: name.split(' ').next().unwrap_or(name).to_owned(),
                    name: name.to_owned(),
                    refinement,
                    quantity: entry.quantity,
                    vaulted: relic.and_then(|relic| relic.vaulted),
                    platinum: platinum(full_name),
                    monthly_trades: self
                        .prices
                        .as_ref()
                        .and_then(|prices| prices.monthly_trades(full_name)),
                    opening: (!rewards.is_empty())
                        .then(|| opening(&rewards, self.mastery_catalog.is_some()))
                        .flatten(),
                    rewards,
                }
            })
            .collect();
        Ok(RelicsView {
            catalog: self.relics.is_some(),
            prices_date: self
                .prices
                .as_ref()
                .map(|prices| prices.dump_date().to_owned()),
            ducats: self.mastery_catalog.is_some(),
            relics,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn reward(chance: f64, platinum: Option<u32>, ducats: Option<u32>) -> RelicRewardView {
        RelicRewardView {
            name: String::new(),
            rarity: None,
            chance: Some(chance),
            platinum,
            ducats,
            owned: 0,
            mastery: None,
        }
    }

    /// An intact relic's six rewards: three commons, two uncommons, one rare.
    fn intact(platinum: [Option<u32>; 6]) -> Vec<RelicRewardView> {
        [25.33, 25.33, 25.33, 11.0, 11.0, 2.0]
            .into_iter()
            .zip(platinum)
            .map(|(chance, platinum)| reward(chance, platinum, Some(15)))
            .collect()
    }

    fn close(left: f64, right: f64) -> bool {
        (left - right).abs() < 1e-9
    }

    #[test]
    fn the_average_opening_is_each_chance_times_its_price() {
        let opening = opening(
            &intact([Some(1), Some(2), Some(3), Some(10), Some(20), Some(100)]),
            true,
        )
        .expect("every chance is known");
        // 0.2533 × (1 + 2 + 3) + 0.11 × (10 + 20) + 0.02 × 100
        assert!(close(opening.platinum, 1.5198 + 3.3 + 2.0), "{opening:?}");
        // The six published chances sum to 99.99%, so a flat 15 ducats averages just under 15.
        assert!(close(opening.ducats.unwrap(), 15.0 * 0.9999), "{opening:?}");
        assert_eq!(opening.unpriced, 0);
    }

    #[test]
    fn an_unpriced_reward_is_left_out_and_counted() {
        let opening = opening(
            &intact([None, Some(2), Some(3), Some(10), Some(20), None]),
            true,
        )
        .unwrap();
        assert!(close(opening.platinum, 0.2533 * 5.0 + 3.3), "{opening:?}");
        assert_eq!(opening.unpriced, 2);
        assert!(close(opening.unpriced_chance, 27.33), "{opening:?}");
    }

    #[test]
    fn ducats_are_unknown_until_their_values_load_and_zero_for_a_reward_baro_refuses() {
        let mut rewards = intact([Some(1); 6]);
        rewards[0].ducats = None;
        assert_eq!(opening(&rewards, false).unwrap().ducats, None);
        assert!(close(
            opening(&rewards, true).unwrap().ducats.unwrap(),
            15.0 * (99.99 - 25.33) / 100.0
        ));
    }

    #[test]
    fn a_reward_without_a_chance_leaves_the_average_unknown() {
        let mut rewards = intact([Some(1); 6]);
        rewards[2].chance = None;
        assert_eq!(opening(&rewards, true), None);
    }

    #[test]
    fn rarity_is_named_from_the_refinement_table_not_from_wfcd_labels() {
        let radiant = Some(Refinement::Radiant);
        assert_eq!(rarity(radiant, Some(16.67)), Some(Rarity::Common));
        assert_eq!(rarity(radiant, Some(20.0)), Some(Rarity::Uncommon));
        assert_eq!(rarity(radiant, Some(10.0)), Some(Rarity::Rare));
        assert_eq!(
            rarity(Some(Refinement::Intact), Some(25.33)),
            Some(Rarity::Common)
        );
        assert_eq!(rarity(None, Some(25.33)), None);
    }

    #[test]
    fn a_relic_name_splits_into_its_name_and_refinement() {
        assert_eq!(
            Refinement::split("Axi A1 Exceptional"),
            ("Axi A1", Some(Refinement::Exceptional))
        );
        assert_eq!(
            Refinement::split("Requiem Eterna Relic"),
            ("Requiem Eterna Relic", None)
        );
    }
}
