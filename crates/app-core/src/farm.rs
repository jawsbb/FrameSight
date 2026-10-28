//! The Farm & sales page: what to sell, which relics to open and where to farm, each ranked by the
//! platinum the market will actually take.
//!
//! A price is half of what an item is worth; how many copies the market takes in a month is the
//! other half. An item at 50p that sells three times a month must not be recommended over one at
//! 20p that sells three hundred times, which is the question this page exists to answer. So every
//! value here is weighed by `sale_flow`, except Sell, which already caps the copies at the month's
//! sales (the Collection's `sellableValue`, so an item is worth the same on both pages).
//!
//! Built on demand from what is already loaded: the collection, the daily price table and the one a
//! week before it, the catalogue's drop lists and WFCD's relic tables. Nothing here asks the network.

use std::collections::{BTreeMap, HashMap};

use serde::Serialize;

use crate::{AppCore, AppError, Refinement};

/// Sales a month at which an item keeps its whole price in the ranking: about one a day. Below it,
/// the price is scaled down in proportion, so three sales a month weigh a tenth.
pub const BRISK_SALES: f64 = 30.0;
/// Rows kept per list: far more than anyone acts on, few enough to send every view.
const ROWS: usize = 50;
/// What falls at one place, shown under its row.
const DROPS_SHOWN: usize = 8;
const TRENDS: usize = 5;
/// The risers a trend is chosen among, the account's own first.
const TREND_POOL: usize = 20;
/// A move from 2p to 3p is +50% of nothing.
// ponytail: a flat floor; a test against the day's spread if cheap items still crowd the carousel.
const TREND_FLOOR: u32 = 10;

/// The share of a price the ranking keeps for an item sold this many times a month.
pub fn sale_flow(monthly_trades: Option<u32>) -> f64 {
    (f64::from(monthly_trades.unwrap_or(0)) / BRISK_SALES).min(1.0)
}

/// What a stack sells for within a month: the Collection's `sellableValue`, floor aside.
pub fn sell_value(platinum: u32, quantity: u32, monthly_trades: Option<u32>) -> u32 {
    platinum.saturating_mul(quantity.min(monthly_trades.unwrap_or(0)))
}

/// How fast it sells, in the page's three words.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Pace {
    /// At least `BRISK_SALES` a month.
    Fast,
    /// At least a third of that.
    Fair,
    Slow,
}

impl Pace {
    fn of(flow: f64) -> Self {
        if flow >= 1.0 - 1e-9 {
            Self::Fast
        } else if flow >= 1.0 / 3.0 {
            Self::Fair
        } else {
            Self::Slow
        }
    }
}

/// An average over chances, kept twice: with each item's sales counted (`value`, what ranks) and
/// at its plain price (`raw`), so the share sales leave standing says how fast the lot sells.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Expected {
    pub value: f64,
    pub raw: f64,
}

impl Expected {
    pub fn item(platinum: u32, monthly_trades: Option<u32>) -> Self {
        let raw = f64::from(platinum);
        Self {
            value: raw * sale_flow(monthly_trades),
            raw,
        }
    }

    fn add(&mut self, percent: f64, unit: Self) {
        self.value += percent / 100.0 * unit.value;
        self.raw += percent / 100.0 * unit.raw;
    }

    fn pace(self) -> Pace {
        Pace::of(if self.raw > 0.0 {
            self.value / self.raw
        } else {
            0.0
        })
    }
}

/// One solo opening on average: each reward's chance times its price, weighed by its sales. A
/// reward without a price counts as nothing, so the figure is a floor; one without a chance leaves
/// the average unknown.
pub fn opening_value(
    rewards: impl IntoIterator<Item = (Option<f64>, Option<u32>, Option<u32>)>,
) -> Option<Expected> {
    let mut total = Expected::default();
    for (chance, platinum, monthly_trades) in rewards {
        let chance = chance?;
        if let Some(platinum) = platinum {
            total.add(chance, Expected::item(platinum, monthly_trades));
        }
    }
    Some(total)
}

/// A relic picked up in a mission is worth the better of opening it and selling it intact.
pub fn relic_worth(opening: Option<Expected>, sale: Option<Expected>) -> Option<Expected> {
    // On a tie, opening: `max_by` keeps the last of equals.
    sale.into_iter()
        .chain(opening)
        .max_by(|left, right| left.value.total_cmp(&right.value))
}

#[derive(Clone, Debug, Serialize)]
pub struct FarmView {
    /// The dump in use, `None` while no prices have loaded.
    pub prices_date: Option<String>,
    /// The dump the 7-day change compares against, `None` until it has loaded.
    pub earlier_date: Option<String>,
    /// Whether the catalogue's drop lists are loaded; without them nothing is known of where
    /// anything drops.
    pub drops: bool,
    /// Whether WFCD's relic tables are loaded; without them a relic cannot be valued by opening.
    pub relic_tables: bool,
    pub sell: Vec<SellRow>,
    pub open: Vec<OpenRow>,
    pub farm: Vec<FarmRow>,
    pub trends: Vec<Trend>,
}

/// A held stack, ranked by what the month's sales would take of it.
#[derive(Clone, Debug, Serialize)]
pub struct SellRow {
    /// The collection row, which is what the sell form lists.
    pub id: String,
    pub name: String,
    pub quantity: u32,
    pub platinum: u32,
    pub monthly_trades: Option<u32>,
    pub value: u32,
    pub pace: Pace,
    pub change: Option<f64>,
    /// warframe.market's name, for the price history.
    pub market: Option<String>,
}

/// A held relic, ranked by one solo opening.
#[derive(Clone, Debug, Serialize)]
pub struct OpenRow {
    pub id: String,
    /// "Axi A1", without the refinement.
    pub name: String,
    pub refinement: Option<Refinement>,
    pub quantity: u32,
    pub vaulted: Option<bool>,
    /// One opening, sales counted. An average.
    pub value: f64,
    pub pace: Pace,
    /// The relic's own price change.
    pub change: Option<f64>,
    pub market: Option<String>,
}

/// One run of one place: a mission rotation, a bounty stage or a single-reward node.
#[derive(Clone, Debug, Serialize)]
pub struct FarmRow {
    pub location: String,
    /// Platinum expected from one run, sales counted. An average.
    pub value: f64,
    pub pace: Pace,
    /// What falls there, the most valuable first.
    pub drops: Vec<FarmDrop>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct FarmDrop {
    /// warframe.market's name.
    pub name: String,
    /// Percent per run.
    pub chance: f64,
    /// One copy at its plain price; for a relic, the better of an average opening and its price.
    pub unit: f64,
    /// Its share of the run's value, sales counted.
    pub value: f64,
    pub relic: bool,
    pub monthly_trades: Option<u32>,
    pub change: Option<f64>,
}

/// A rise among items that sell briskly.
#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct Trend {
    pub name: String,
    pub change: f64,
    pub platinum: u32,
    pub monthly_trades: u32,
    /// Copies the collection holds.
    pub held: u32,
}

/// What can drop at a place, priced, before the places are ranked.
pub struct PricedDrop<'a> {
    pub location: &'a str,
    pub name: &'a str,
    pub chance: f64,
    pub unit: Expected,
    pub relic: bool,
    pub monthly_trades: Option<u32>,
    pub change: Option<f64>,
}

/// Places by the platinum one run brings, sales counted.
pub fn farm_rows<'a>(drops: impl IntoIterator<Item = PricedDrop<'a>>) -> Vec<FarmRow> {
    let mut places: BTreeMap<&str, (Expected, Vec<FarmDrop>)> = BTreeMap::new();
    for drop in drops {
        let (total, listed) = places.entry(drop.location).or_default();
        total.add(drop.chance, drop.unit);
        listed.push(FarmDrop {
            name: drop.name.to_owned(),
            chance: drop.chance,
            unit: drop.unit.raw,
            value: drop.chance / 100.0 * drop.unit.value,
            relic: drop.relic,
            monthly_trades: drop.monthly_trades,
            change: drop.change,
        });
    }
    let mut rows = places
        .into_iter()
        .filter(|(_, (total, _))| total.value > 0.0)
        .map(|(location, (total, mut drops))| {
            drops.sort_by(|left, right| right.value.total_cmp(&left.value));
            drops.truncate(DROPS_SHOWN);
            FarmRow {
                location: location.to_owned(),
                value: total.value,
                pace: total.pace(),
                drops,
            }
        })
        .collect::<Vec<_>>();
    rows.sort_by(|left, right| right.value.total_cmp(&left.value));
    rows.truncate(ROWS);
    rows
}

fn sort_sell(rows: &mut Vec<SellRow>) {
    rows.sort_by(|left, right| {
        right
            .value
            .cmp(&left.value)
            .then(right.platinum.cmp(&left.platinum))
            .then_with(|| left.name.cmp(&right.name))
    });
    rows.truncate(ROWS);
}

fn sort_open(rows: &mut Vec<OpenRow>) {
    rows.sort_by(|left, right| {
        right
            .value
            .total_cmp(&left.value)
            .then_with(|| left.name.cmp(&right.name))
    });
    rows.truncate(ROWS);
}

/// The strongest risers among what sells briskly, the account's own first.
fn pick_trends(mut risers: Vec<Trend>) -> Vec<Trend> {
    risers.sort_by(|left, right| right.change.total_cmp(&left.change));
    risers.truncate(TREND_POOL);
    risers.sort_by_key(|trend| trend.held == 0);
    risers.truncate(TRENDS);
    risers
}

impl AppCore {
    /// The dump a week before the one in use, for the 7-day change.
    pub fn set_earlier_prices(&mut self, prices: std::sync::Arc<warframe_acquisition::PriceTable>) {
        self.earlier_prices = Some(prices);
    }

    pub fn farm_view(&self) -> Result<FarmView, AppError> {
        let prices = self.prices.as_deref();
        let earlier = self.earlier_prices.as_deref();
        let market = |name: &str| prices?.market_name(name);
        let change = |name: &str| prices?.change_since(earlier?, name);
        let trades = |name: &str| prices?.monthly_trades(name);
        let price = |name: &str| prices?.price_for(name);

        let collection = self.current_view()?.collection;
        let held = collection.items.iter().filter(|item| item.quantity() > 0);
        let mut sell = held
            .clone()
            .filter_map(|item| {
                let platinum = item.platinum()?;
                Some(SellRow {
                    id: item.id().to_owned(),
                    name: item.name().to_owned(),
                    quantity: item.quantity(),
                    platinum,
                    monthly_trades: item.monthly_trades(),
                    value: sell_value(platinum, item.quantity(), item.monthly_trades()),
                    pace: Pace::of(sale_flow(item.monthly_trades())),
                    change: change(item.name()),
                    market: market(item.name()),
                })
            })
            .collect();
        sort_sell(&mut sell);

        let mut open = self
            .relics_view()?
            .relics
            .into_iter()
            .filter_map(|relic| {
                let opening = opening_value(
                    relic
                        .rewards
                        .iter()
                        .map(|reward| (reward.chance, reward.platinum, trades(&reward.name))),
                )
                .filter(|_| !relic.rewards.is_empty())?;
                Some(OpenRow {
                    id: relic.id,
                    name: relic.name,
                    refinement: relic.refinement,
                    quantity: relic.quantity,
                    vaulted: relic.vaulted,
                    value: opening.value,
                    pace: opening.pace(),
                    change: change(&relic.full_name),
                    market: market(&relic.full_name),
                })
            })
            .collect();
        sort_open(&mut open);

        let run_drops = self
            .mastery_catalog
            .as_deref()
            .map(|catalog| catalog.run_drops())
            .unwrap_or_default();
        let mut relics: HashMap<&str, Option<Expected>> = HashMap::new();
        let priced = run_drops.iter().filter_map(|drop| {
            let unit = match drop.relic.as_deref() {
                Some(path) => {
                    (*relics.entry(path).or_insert_with(|| {
                        let opening = self
                            .relics
                            .as_deref()
                            .and_then(|index| index.relic(path))
                            .and_then(|relic| {
                                opening_value(relic.drops.iter().map(|reward| {
                                    (reward.chance, price(&reward.name), trades(&reward.name))
                                }))
                            });
                        let sale = price(&drop.item).map(|p| Expected::item(p, trades(&drop.item)));
                        relic_worth(opening, sale)
                    }))?
                }
                None => Expected::item(price(&drop.item)?, trades(&drop.item)),
            };
            Some(PricedDrop {
                location: &drop.location,
                name: &drop.item,
                chance: drop.chance,
                unit,
                relic: drop.relic.is_some(),
                monthly_trades: trades(&drop.item),
                change: change(&drop.item),
            })
        });
        let farm = farm_rows(priced.collect::<Vec<_>>());

        let mut holdings: HashMap<String, u32> = HashMap::new();
        for item in held {
            if let Some(name) = market(item.name()) {
                *holdings.entry(name).or_default() += item.quantity();
            }
        }
        let risers = prices
            .zip(earlier)
            .map(|(now, before)| {
                now.dump_names()
                    .filter_map(|name| {
                        let platinum = now.price_for(name)?;
                        let monthly_trades = now.monthly_trades(name)?;
                        let change = now.change_since(before, name)?;
                        (f64::from(monthly_trades) >= BRISK_SALES
                            && platinum >= TREND_FLOOR
                            && change > 0.0)
                            .then(|| Trend {
                                name: name.to_owned(),
                                change,
                                platinum,
                                monthly_trades,
                                held: holdings.get(name).copied().unwrap_or(0),
                            })
                    })
                    .collect()
            })
            .unwrap_or_default();

        Ok(FarmView {
            prices_date: prices.map(|table| table.dump_date().to_owned()),
            earlier_date: earlier.map(|table| table.dump_date().to_owned()),
            drops: !run_drops.is_empty(),
            relic_tables: self.relics.is_some(),
            sell,
            open,
            farm,
            trends: pick_trends(risers),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn close(left: f64, right: f64) -> bool {
        (left - right).abs() < 1e-9
    }

    fn drop<'a>(location: &'a str, name: &'a str, chance: f64, unit: Expected) -> PricedDrop<'a> {
        PricedDrop {
            location,
            name,
            chance,
            unit,
            relic: false,
            monthly_trades: None,
            change: None,
        }
    }

    #[test]
    fn a_dear_item_nobody_buys_does_not_outrank_a_cheaper_one_that_sells() {
        // 50p three times a month against 20p three hundred times, at the same chance.
        let rows = farm_rows([
            drop("Dear", "Rare mod", 10.0, Expected::item(50, Some(3))),
            drop(
                "Brisk",
                "Common arcane",
                10.0,
                Expected::item(20, Some(300)),
            ),
        ]);
        assert_eq!(rows[0].location, "Brisk");
        assert!(close(rows[0].value, 2.0), "{rows:?}");
        assert!(close(rows[1].value, 0.5), "{rows:?}");
        assert_eq!((rows[0].pace, rows[1].pace), (Pace::Fast, Pace::Slow));
    }

    #[test]
    fn a_stack_is_worth_only_what_a_months_sales_take() {
        assert_eq!(sell_value(240, 5, Some(0)), 0);
        assert_eq!(sell_value(240, 5, None), 0);
        assert_eq!(sell_value(2, 182, Some(100)), 200);
        assert_eq!(sell_value(20, 3, Some(100)), 60);
        let row = |name: &str, platinum, quantity, trades| SellRow {
            id: name.to_owned(),
            name: name.to_owned(),
            quantity,
            platinum,
            monthly_trades: Some(trades),
            value: sell_value(platinum, quantity, Some(trades)),
            pace: Pace::of(sale_flow(Some(trades))),
            change: None,
            market: None,
        };
        let mut rows = vec![row("Scan Matter", 240, 5, 0), row("Quickdraw", 2, 182, 100)];
        sort_sell(&mut rows);
        assert_eq!(rows[0].name, "Quickdraw");
        // Never hidden: it sinks, and says it sells slowly.
        assert_eq!(
            (rows[1].name.as_str(), rows[1].pace),
            ("Scan Matter", Pace::Slow)
        );
    }

    #[test]
    fn an_opening_weighs_each_reward_by_its_sales() {
        // A 100p rare nobody buys against three 5p commons that sell daily.
        let opening = opening_value([
            (Some(25.33), Some(5), Some(90)),
            (Some(25.33), Some(5), Some(90)),
            (Some(25.33), Some(5), Some(90)),
            (Some(11.0), None, None),
            (Some(11.0), None, None),
            (Some(2.0), Some(100), Some(3)),
        ])
        .expect("every chance is known");
        assert!(
            close(opening.value, 0.7599 * 5.0 + 0.02 * 10.0),
            "{opening:?}"
        );
        assert!(close(opening.raw, 0.7599 * 5.0 + 2.0), "{opening:?}");
        assert_eq!(opening_value([(None, Some(5), Some(90))]), None);
    }

    #[test]
    fn a_relic_from_a_mission_is_worth_the_better_of_opening_and_selling_it() {
        let opened = Expected {
            value: 4.0,
            raw: 6.0,
        };
        let opening = Some(opened);
        let sale = Some(Expected::item(9, Some(60)));
        assert_eq!(relic_worth(opening, sale), sale);
        assert_eq!(
            relic_worth(opening, Some(Expected::item(9, Some(3)))),
            opening
        );
        assert_eq!(relic_worth(None, sale), sale);
        // A relic chained through its opening ranks its mission like any other drop.
        let rows = farm_rows([
            PricedDrop {
                relic: true,
                ..drop(
                    "Void/Mot (Survival), Rotation C",
                    "Axi A1 Relic",
                    50.0,
                    opened,
                )
            },
            drop(
                "Earth/E Prime (Exterminate)",
                "Mod",
                50.0,
                Expected::item(6, Some(3)),
            ),
        ]);
        assert_eq!(rows[0].location, "Void/Mot (Survival), Rotation C");
        assert!(close(rows[0].value, 2.0));
        assert!(close(rows[0].drops[0].unit, 6.0));
    }

    #[test]
    fn sales_count_in_full_from_one_a_day_and_pace_reads_in_thirds() {
        assert!(close(sale_flow(Some(3)), 0.1));
        assert!(close(sale_flow(Some(30)), 1.0));
        assert!(close(sale_flow(Some(3000)), 1.0));
        assert_eq!(Pace::of(sale_flow(Some(30))), Pace::Fast);
        assert_eq!(Pace::of(sale_flow(Some(10))), Pace::Fair);
        assert_eq!(Pace::of(sale_flow(Some(9))), Pace::Slow);
    }

    #[test]
    fn trends_put_the_accounts_own_risers_first() {
        let trend = |name: &str, change, held| Trend {
            name: name.to_owned(),
            change,
            platinum: 20,
            monthly_trades: 100,
            held,
        };
        let picked = pick_trends(
            (0..30)
                .map(|step| {
                    trend(
                        &format!("item {step}"),
                        f64::from(step),
                        u32::from(step == 12),
                    )
                })
                .collect(),
        );
        assert_eq!(picked.len(), TRENDS);
        assert_eq!(picked[0].name, "item 12");
        assert_eq!(picked[1].name, "item 29");
        // Within the pool, holding it beats a stronger rise.
        let picked = pick_trends(vec![trend("held", 0.01, 3), trend("a", 0.5, 0)]);
        assert_eq!(picked[0].name, "held");
    }
}
