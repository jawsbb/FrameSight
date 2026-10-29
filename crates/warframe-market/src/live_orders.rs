//! Who is trading one item right now: the public top of its order book.
//!
//! `GET /v2/orders/item/{slug}/top` answers with at most five sell and five buy orders, already
//! limited to traders who are online or in game, at about 5 KB against 180 KB for the full book.
//! Anonymous on purpose: nothing here concerns the player's own account.

use serde::{Deserialize, Serialize};

use crate::{API_V2, MarketError, MarketRequest, MarketTransport, Method, valid_slug};

/// The cap on one top-of-book response, generous against the measured 5 KB.
pub const MAX_TOP_BYTES: usize = 256 * 1024;

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum TraderStatus {
    Ingame,
    Online,
}

/// One live order, with the trader's in-game name, which is what a whisper addresses.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct LiveOrder {
    pub user: String,
    pub status: TraderStatus,
    /// The price of one trade, which moves `per_trade` units.
    pub platinum: u32,
    pub quantity: u32,
    pub per_trade: u32,
    pub rank: Option<u32>,
    pub subtype: Option<String>,
}

#[derive(Clone, Debug, Default, Eq, PartialEq, Serialize)]
pub struct ItemOrders {
    /// In game first, then online; each the cheapest unit price first.
    pub sell: Vec<LiveOrder>,
    /// In game first, then online; each the best unit price first.
    pub buy: Vec<LiveOrder>,
}

#[derive(Deserialize)]
struct TopResponse {
    data: TopOrders,
}

#[derive(Deserialize)]
struct TopOrders {
    #[serde(default)]
    sell: Vec<TopOrder>,
    #[serde(default)]
    buy: Vec<TopOrder>,
}

fn one() -> u32 {
    1
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct TopOrder {
    platinum: u32,
    #[serde(default = "one")]
    quantity: u32,
    #[serde(default = "one")]
    per_trade: u32,
    #[serde(default)]
    rank: Option<u32>,
    #[serde(default)]
    subtype: Option<String>,
    #[serde(default)]
    visible: bool,
    user: TopUser,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct TopUser {
    #[serde(default)]
    ingame_name: String,
    #[serde(default)]
    status: String,
}

fn live(order: TopOrder) -> Option<LiveOrder> {
    let status = match order.user.status.as_str() {
        "ingame" => TraderStatus::Ingame,
        "online" => TraderStatus::Online,
        // Offline traders cannot answer a whisper; the endpoint should not send them, and a
        // hidden order is not one anybody can trade against.
        _ => return None,
    };
    (order.visible && !order.user.ingame_name.is_empty()).then(|| LiveOrder {
        user: order.user.ingame_name,
        status,
        platinum: order.platinum,
        quantity: order.quantity,
        per_trade: order.per_trade.max(1),
        rank: order.rank,
        subtype: order.subtype,
    })
}

/// `left` costs less per unit than `right`, compared without rounding: a bulk listing's price
/// buys `per_trade` units.
fn unit_price(left: &LiveOrder, right: &LiveOrder) -> std::cmp::Ordering {
    (u64::from(left.platinum) * u64::from(right.per_trade))
        .cmp(&(u64::from(right.platinum) * u64::from(left.per_trade)))
}

/// In game sorts before online: that trader can answer a whisper without leaving a mission.
fn presence(order: &LiveOrder) -> u8 {
    match order.status {
        TraderStatus::Ingame => 0,
        TraderStatus::Online => 1,
    }
}

pub fn parse_top(body: &[u8]) -> Result<ItemOrders, MarketError> {
    let response =
        serde_json::from_slice::<TopResponse>(body).map_err(|_| MarketError::Malformed)?;
    let mut sell: Vec<_> = response.data.sell.into_iter().filter_map(live).collect();
    let mut buy: Vec<_> = response.data.buy.into_iter().filter_map(live).collect();
    sell.sort_by(|left, right| {
        presence(left)
            .cmp(&presence(right))
            .then_with(|| unit_price(left, right))
    });
    buy.sort_by(|left, right| {
        presence(left)
            .cmp(&presence(right))
            .then_with(|| unit_price(right, left))
    });
    Ok(ItemOrders { sell, buy })
}

/// The live top of one item's book. `slug` must come from the item table: anything else is
/// refused before a request is spent on it.
pub fn item_orders(transport: &dyn MarketTransport, slug: &str) -> Result<ItemOrders, MarketError> {
    if !valid_slug(slug) {
        return Err(MarketError::Malformed);
    }
    let response = transport.send(MarketRequest {
        method: Method::Get,
        url: format!("{API_V2}/orders/item/{slug}/top"),
        language: None,
        token: None,
        body: None,
    })?;
    match response.status {
        200..=299 if response.body.len() <= MAX_TOP_BYTES => parse_top(&response.body),
        200..=299 => Err(MarketError::Malformed),
        429 => Err(MarketError::RateLimited),
        _ => Err(MarketError::Unreachable),
    }
}
