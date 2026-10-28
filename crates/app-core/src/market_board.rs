//! The Market page's board: what traded on the day the dump in use covers, ranked five ways.
//!
//! Built from the two dumps already in hand, the latest (whose day's trades it reads) and the one a
//! week before it (for the 7-day change, as on Farm & sales). Nothing here asks the network.

use std::collections::HashMap;

use serde::Serialize;
use warframe_acquisition::PriceTable;

use crate::AppCore;
use crate::farm::TREND_FLOOR;

/// Rows per ranking.
const ROWS: usize = 10;

/// Sales a row needs on the day before its pace or its price change is ranked at all.
///
/// Measured on the 2026-10-27 dump: 3,119 variants traded, half of them 9 times or fewer. Below
/// the floor the fastest are single trades against single listings (`Meso V13 Relic` radiant, six
/// sales against one listing; `Axi I2 Relic`, three against two). At 20 every one of the ten
/// fastest sold 25 times or more, on that dump and on the 2026-10-20 one, and 998 variants remain.
/// With the Farm page's 10p floor, 487 items qualify for a change and the 2p-to-3p moves that read
/// +50% are gone.
pub const MIN_DAY_SALES: u32 = 20;

#[derive(Clone, Debug, Default, Serialize)]
pub struct MarketBoard {
    /// The day the figures describe, `None` until a dump carrying its day's trades has loaded.
    pub date: Option<String>,
    /// The dump the change compares against, `None` until it has loaded.
    pub earlier_date: Option<String>,
    pub most_sold: Vec<BoardRow>,
    /// By sales per listing, from `MIN_DAY_SALES`.
    pub fastest: Vec<BoardRow>,
    pub most_platinum: Vec<BoardRow>,
    /// By the 7-day change, from `MIN_DAY_SALES` and `TREND_FLOOR`.
    pub rising: Vec<BoardRow>,
    pub falling: Vec<BoardRow>,
}

/// One variant on the day: a relic's tier, a mod's rank, a fish's size are each their own row.
/// The two change rankings are by item instead, which is what the 7-day change is measured on.
#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct BoardRow {
    /// warframe.market's name: the listing, or a relic's tier (`Meso I3 Relic (Radiant)`).
    pub name: String,
    pub subtype: Option<String>,
    pub rank: Option<u32>,
    pub sales: u32,
    pub listings: u32,
    /// What it traded at; on a change row, the item's price, which the change is measured on.
    pub median: u32,
    /// The platinum that changed hands: each variant's sales times its median.
    pub traded: u32,
    pub change: Option<f64>,
}

/// The board for one dump, against the one a week before it when that has loaded.
pub fn market_board(now: &PriceTable, earlier: Option<&PriceTable>) -> MarketBoard {
    let rows: Vec<BoardRow> = now
        .day_sales()
        .iter()
        .map(|day| BoardRow {
            name: day.name.clone(),
            subtype: day.subtype.clone(),
            rank: day.rank,
            sales: day.sales,
            listings: day.listings,
            median: (day.median.round() as u32).max(1),
            traded: (f64::from(day.sales) * day.median).round() as u32,
            change: None,
        })
        .collect();

    let mut items: HashMap<&str, BoardRow> = HashMap::new();
    for row in &rows {
        let item = items.entry(&row.name).or_insert_with(|| BoardRow {
            subtype: None,
            // The item's price is its unranked copy's.
            rank: row.rank.map(|_| 0),
            sales: 0,
            listings: 0,
            traded: 0,
            ..row.clone()
        });
        item.sales += row.sales;
        item.listings += row.listings;
        item.traded += row.traded;
    }
    let changed: Vec<BoardRow> = earlier
        .map(|earlier| {
            items
                .into_values()
                .filter(|item| item.sales >= MIN_DAY_SALES)
                .filter_map(|item| {
                    let median = now.price_for(&item.name).filter(|p| *p >= TREND_FLOOR)?;
                    let change = now.change_since(earlier, &item.name)?;
                    Some(BoardRow {
                        median,
                        change: Some(change),
                        ..item
                    })
                })
                .collect()
        })
        .unwrap_or_default();
    let change = |row: &BoardRow| row.change.unwrap_or(0.0);

    MarketBoard {
        date: (!rows.is_empty()).then(|| now.dump_date().to_owned()),
        earlier_date: earlier.map(|table| table.dump_date().to_owned()),
        most_sold: top(rows.iter(), |row| f64::from(row.sales)),
        fastest: top(
            rows.iter()
                .filter(|row| row.sales >= MIN_DAY_SALES && row.listings > 0),
            |row| f64::from(row.sales) / f64::from(row.listings),
        ),
        most_platinum: top(rows.iter(), |row| f64::from(row.traded)),
        rising: top(changed.iter().filter(|row| change(row) > 0.0), change),
        falling: top(changed.iter().filter(|row| change(row) < 0.0), |row| {
            -change(row)
        }),
    }
}

/// The `ROWS` highest by `score`, ties by name.
fn top<'a>(
    rows: impl Iterator<Item = &'a BoardRow>,
    score: impl Fn(&BoardRow) -> f64,
) -> Vec<BoardRow> {
    let mut picked: Vec<&BoardRow> = rows.collect();
    picked.sort_by(|left, right| {
        score(right)
            .total_cmp(&score(left))
            .then_with(|| (&left.name, left.rank).cmp(&(&right.name, right.rank)))
    });
    picked.into_iter().take(ROWS).cloned().collect()
}

impl AppCore {
    pub fn market_board(&self) -> MarketBoard {
        self.prices
            .as_deref()
            .map(|now| market_board(now, self.earlier_prices.as_deref()))
            .unwrap_or_default()
    }
}
