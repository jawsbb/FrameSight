//! The Market page: find any tradeable item, then ask who is trading it right now.
//!
//! Search is local. It reads warframe.market's item table, the one the Orders page already keeps
//! (downloaded once, 1.6 MB, only if nothing has fetched it yet this session), and the daily price
//! table already in memory. Only the choice of an item spends a request, one, through the pacer
//! every other warframe.market caller shares, and its answer is kept a minute.
//!
//! The Farm page's curve is the same bargain: one request for the item the player picked, through
//! the same pacer, kept for hours because it describes whole days.

use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

use serde::Serialize;
use tauri::State;
use warframe_acquisition::{PriceTable, slug_and_subtype};
use warframe_market::{DayTrades, ItemOrders, ItemSummary, MarketHttp, MarketItems};

use crate::{SharedRuntime, market_account::failure_message};

const SEARCH_LIMIT: usize = 10;
/// How long one item's live orders are reused. Long enough that going back and forth between two
/// items costs nothing, short enough that "live" still means this minute.
const ORDERS_TTL: Duration = Duration::from_secs(60);
/// How long one item's daily curve is reused: its newest point is a whole day.
const HISTORY_TTL: Duration = Duration::from_secs(6 * 60 * 60);
const NOT_AN_ITEM: &str = "That is not an item warframe.market lists";
const STATE_UNAVAILABLE: &str = "application state is unavailable";

/// Answers by key, each with when it was asked.
type Answers<T> = Arc<Mutex<HashMap<String, (Instant, T)>>>;

#[derive(Clone, Default)]
pub struct MarketLookup {
    orders: Answers<MarketItemOrders>,
    history: Answers<Vec<DayTrades>>,
    /// Held while the item table downloads, so two quick searches do not fetch it twice.
    table: Arc<Mutex<()>>,
}

/// One suggestion: the item, what the daily dump says it is worth and how fast it sells, and the
/// collection rows that hold it.
#[derive(Debug, Serialize)]
pub struct MarketHit {
    #[serde(flatten)]
    item: ItemSummary,
    median: Option<u32>,
    /// The maxed quote, for a mod or an arcane.
    median_max_rank: Option<u32>,
    /// The median was replaced by a price checked live from the Collection page.
    checked_live: bool,
    monthly_trades: Option<u32>,
    held: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct MarketSearch {
    hits: Vec<MarketHit>,
    /// The day the price table describes, absent until it has loaded.
    dump_date: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
pub struct MarketItemOrders {
    #[serde(flatten)]
    orders: ItemOrders,
    /// Unix seconds: when warframe.market answered, which a cached answer keeps.
    fetched_at: u64,
}

pub fn hits(
    items: &MarketItems,
    prices: Option<&PriceTable>,
    rows: &[&str],
    query: &str,
) -> Vec<MarketHit> {
    items
        .search(query, SEARCH_LIMIT)
        .into_iter()
        .map(|item| {
            let name = item.name.as_str();
            let median = prices.and_then(|table| table.price_for(name));
            let median_max_rank = item.max_rank.and_then(|max| {
                prices?
                    .ranked_price_for(name, Some(max), Some(true))
                    .platinum
                    .filter(|maxed| Some(*maxed) != median)
            });
            let checked_live = prices
                .and_then(|table| Some(table.has_checked_price(&table.market_name(name)?)))
                .unwrap_or(false);
            MarketHit {
                median,
                median_max_rank,
                checked_live,
                monthly_trades: prices.and_then(|table| table.monthly_trades(name)),
                held: items
                    .rows_of(&item.id, rows.iter().copied())
                    .into_iter()
                    .map(str::to_owned)
                    .collect(),
                item,
            }
        })
        .collect()
}

/// The item table, from the session if it holds one, downloaded once otherwise.
fn item_table(shared: &SharedRuntime, lookup: &MarketLookup) -> Result<Arc<MarketItems>, String> {
    let _downloading = lookup.table.lock().map_err(|_| STATE_UNAVAILABLE)?;
    let pacer = {
        let runtime = shared.lock().map_err(|_| STATE_UNAVAILABLE)?;
        if let Some(items) = runtime.market.cached_items() {
            return Ok(items);
        }
        runtime.live_prices.pacer()
    };
    let transport = MarketHttp::new(pacer).map_err(|error| failure_message(error).to_owned())?;
    let items = Arc::new(
        MarketItems::fetch(&transport).map_err(|error| failure_message(error).to_owned())?,
    );
    shared
        .lock()
        .map_err(|_| STATE_UNAVAILABLE)?
        .market
        .set_items(Arc::clone(&items));
    Ok(items)
}

fn search_blocking(
    shared: &SharedRuntime,
    lookup: &MarketLookup,
    query: &str,
) -> Result<MarketSearch, String> {
    let items = item_table(shared, lookup)?;
    let (prices, collection) = {
        let runtime = shared.lock().map_err(|_| STATE_UNAVAILABLE)?;
        (
            runtime.core.collection_prices(),
            runtime
                .core
                .collection_for_reconciliation()
                .map_err(|_| "the collection could not be read")?,
        )
    };
    let rows: Vec<&str> = collection
        .entries()
        .map(|entry| entry.item.id.as_str())
        .collect();
    Ok(MarketSearch {
        hits: hits(&items, prices.as_deref(), &rows, query),
        dump_date: prices.map(|table| table.dump_date().to_owned()),
    })
}

/// A remembered answer while it is younger than `ttl`; otherwise `fetch` over a paced transport,
/// for a slug the item table publishes and nothing else, remembered.
fn cached<T: Clone>(
    shared: &SharedRuntime,
    lookup: &MarketLookup,
    answers: &Answers<T>,
    key: &str,
    slug: &str,
    ttl: Duration,
    fetch: impl FnOnce(&MarketHttp) -> Result<T, warframe_market::MarketError>,
) -> Result<T, String> {
    if let Some((asked, answer)) = answers.lock().map_err(|_| STATE_UNAVAILABLE)?.get(key)
        && asked.elapsed() < ttl
    {
        return Ok(answer.clone());
    }
    if item_table(shared, lookup)?.by_slug(slug).is_none() {
        return Err(NOT_AN_ITEM.to_owned());
    }
    let pacer = shared
        .lock()
        .map_err(|_| STATE_UNAVAILABLE)?
        .live_prices
        .pacer();
    let transport = MarketHttp::new(pacer).map_err(|error| failure_message(error).to_owned())?;
    let fresh = fetch(&transport).map_err(|error| failure_message(error).to_owned())?;
    let mut cache = answers.lock().map_err(|_| STATE_UNAVAILABLE)?;
    cache.retain(|_, (asked, _)| asked.elapsed() < ttl);
    cache.insert(key.to_owned(), (Instant::now(), fresh.clone()));
    Ok(fresh)
}

fn orders_blocking(
    shared: &SharedRuntime,
    lookup: &MarketLookup,
    slug: &str,
) -> Result<MarketItemOrders, String> {
    cached(
        shared,
        lookup,
        &lookup.orders,
        slug,
        slug,
        ORDERS_TTL,
        |transport| {
            Ok(MarketItemOrders {
                orders: warframe_market::item_orders(transport, slug)?,
                fetched_at: SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .map_or(0, |since| since.as_secs()),
            })
        },
    )
}

/// The daily curve of an item the price table names, resolved to a slug here.
fn history_blocking(
    shared: &SharedRuntime,
    lookup: &MarketLookup,
    name: &str,
) -> Result<Vec<DayTrades>, String> {
    let (slug, subtype) = slug_and_subtype(name);
    cached(
        shared,
        lookup,
        &lookup.history,
        name,
        &slug,
        HISTORY_TTL,
        |transport| warframe_market::item_statistics(transport, &slug, subtype.as_deref()),
    )
}

#[tauri::command]
pub async fn market_item_history(
    name: String,
    state: State<'_, SharedRuntime>,
    lookup: State<'_, MarketLookup>,
) -> Result<Vec<DayTrades>, String> {
    let (shared, lookup) = (Arc::clone(state.inner()), lookup.inner().clone());
    tauri::async_runtime::spawn_blocking(move || history_blocking(&shared, &lookup, &name))
        .await
        .map_err(|_| "market history task failed".to_owned())?
}

#[tauri::command]
pub async fn market_search(
    query: String,
    state: State<'_, SharedRuntime>,
    lookup: State<'_, MarketLookup>,
) -> Result<MarketSearch, String> {
    let (shared, lookup) = (Arc::clone(state.inner()), lookup.inner().clone());
    tauri::async_runtime::spawn_blocking(move || search_blocking(&shared, &lookup, &query))
        .await
        .map_err(|_| "market search task failed".to_owned())?
}

#[tauri::command]
pub async fn market_item_orders(
    slug: String,
    state: State<'_, SharedRuntime>,
    lookup: State<'_, MarketLookup>,
) -> Result<MarketItemOrders, String> {
    let (shared, lookup) = (Arc::clone(state.inner()), lookup.inner().clone());
    tauri::async_runtime::spawn_blocking(move || orders_blocking(&shared, &lookup, &slug))
        .await
        .map_err(|_| "market orders task failed".to_owned())?
}

#[cfg(test)]
mod tests {
    use super::*;

    const ITEMS: &str = r#"{"data":[
        {"id":"54a74454e779892d5e515596","slug":"serration","maxRank":10,
         "gameRef":"/Lotus/Upgrades/Mods/Rifle/WeaponDamageAmountMod",
         "i18n":{"en":{"name":"Serration"}}},
        {"id":"5a2feeb1c2c9e90cbdaa23d2","slug":"sweeping_serration","maxRank":10,
         "gameRef":"/Lotus/Upgrades/Mods/Shotgun/WeaponDamageAmountMod",
         "i18n":{"en":{"name":"Sweeping Serration"}}}
    ]}"#;
    const DUMP: &str = r#"{"Serration":[
        {"order_type":"closed","median":2,"mod_rank":0,"volume":40},
        {"order_type":"closed","median":20,"mod_rank":10,"volume":20}
    ]}"#;

    #[test]
    fn a_hit_joins_the_daily_price_the_trade_rate_and_the_rows_that_hold_it() {
        let items = MarketItems::from_response(ITEMS.as_bytes()).expect("items");
        let prices = PriceTable::from_dump_json(DUMP.as_bytes(), "2026-10-28").expect("dump");
        let rows = [
            "/Lotus/Upgrades/Mods/Rifle/WeaponDamageAmountMod#10",
            "/Lotus/Powersuits/Excalibur/Excalibur",
        ];

        let found = hits(&items, Some(&prices), &rows, "serra");

        assert_eq!(found.len(), 2);
        assert_eq!(found[0].item.name, "Serration");
        assert_eq!(found[0].median, Some(2));
        assert_eq!(found[0].median_max_rank, Some(20));
        assert_eq!(found[0].monthly_trades, Some(1800));
        assert!(!found[0].checked_live);
        assert_eq!(found[0].held, [rows[0]]);
        // Not in the dump: no price is made up for it.
        assert_eq!(found[1].median, None);
        assert_eq!(found[1].monthly_trades, None);
        assert!(found[1].held.is_empty());
    }

    #[test]
    fn without_a_price_table_the_search_still_answers() {
        let items = MarketItems::from_response(ITEMS.as_bytes()).expect("items");

        let found = hits(&items, None, &[], "sweeping");

        assert_eq!(found.len(), 1);
        assert_eq!(found[0].median, None);
    }
}
