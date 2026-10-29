mod common;

use common::{FakeTransport, ok};
use warframe_market::{
    ItemOrders, MarketError, MarketResponse, Method, TraderStatus, item_orders, parse_top,
};

/// Recorded from `GET /v2/orders/item/braton_prime_set/top` on 2026-10-28, unmodified.
const BRATON: &str = include_str!("fixtures/top_braton_prime_set.json");
/// Recorded from `GET /v2/orders/item/serration/top` on 2026-10-28, unmodified.
const SERRATION: &str = include_str!("fixtures/top_serration.json");

fn users(orders: &[warframe_market::LiveOrder]) -> Vec<(&str, u32)> {
    orders
        .iter()
        .map(|order| (order.user.as_str(), order.platinum))
        .collect()
}

#[test]
fn sellers_in_game_come_first_cheapest_first_then_online() {
    let orders = parse_top(BRATON.as_bytes()).expect("real body parses");

    // The API sends 7 ingame, 8 online, 8 ingame, 9, 10: the online seller drops behind every
    // seller who can answer from inside the game.
    assert_eq!(
        users(&orders.sell),
        [
            ("JhowSlayer", 7),
            ("-GrT-ShadowOfDeath99", 8),
            ("Badows", 9),
            ("Grossout", 10),
            ("brother_natherius", 8),
        ]
    );
    assert_eq!(orders.sell[4].status, TraderStatus::Online);
}

#[test]
fn buyers_come_best_offer_first() {
    let orders = parse_top(BRATON.as_bytes()).expect("real body parses");

    assert_eq!(
        orders
            .buy
            .iter()
            .map(|order| order.platinum)
            .collect::<Vec<_>>(),
        [8, 7, 6, 6, 6]
    );
    assert_eq!(orders.buy[0].user, "Littleboy9x");
    assert_eq!(orders.buy[0].quantity, 91);
}

#[test]
fn a_mod_order_keeps_the_rank_it_is_quoted_at() {
    let orders = parse_top(SERRATION.as_bytes()).expect("real body parses");

    assert_eq!(orders.sell[0].user, "Portarto");
    assert_eq!(orders.sell[0].rank, Some(0));
    assert_eq!(orders.sell[0].quantity, 46);
    assert!(orders.buy.iter().all(|order| order.rank == Some(10)));
    assert_eq!(
        orders.buy.last().map(|order| order.platinum),
        Some(1),
        "the lowball offer sorts last"
    );
}

#[test]
fn bulk_lots_sort_by_unit_price_and_untradeable_orders_are_dropped() {
    let body = r#"{"data":{"sell":[
        {"platinum":18,"perTrade":6,"visible":true,"user":{"ingameName":"Lot","status":"ingame"}},
        {"platinum":4,"visible":true,"user":{"ingameName":"Single","status":"ingame"}},
        {"platinum":1,"visible":true,"user":{"ingameName":"Gone","status":"offline"}},
        {"platinum":1,"visible":false,"user":{"ingameName":"Hidden","status":"ingame"}}
    ],"buy":[
        {"platinum":30,"visible":true,"user":{"ingameName":"Away","status":"online"}},
        {"platinum":20,"visible":true,"user":{"ingameName":"Here","status":"ingame"}}
    ]}}"#;
    let orders = parse_top(body.as_bytes()).expect("parses");

    // 18p for six is 3p each, under the single at 4p.
    assert_eq!(users(&orders.sell), [("Lot", 18), ("Single", 4)]);
    assert_eq!(orders.sell[0].per_trade, 6);
    assert_eq!(users(&orders.buy), [("Here", 20), ("Away", 30)]);
}

#[test]
fn an_unreadable_body_is_malformed_not_empty() {
    assert_eq!(parse_top(b"<html>"), Err(MarketError::Malformed));
    assert_eq!(
        parse_top(br#"{"data":{"sell":[],"buy":[]}}"#),
        Ok(ItemOrders::default())
    );
}

#[test]
fn the_request_is_anonymous_and_names_the_item() {
    let transport = FakeTransport::new(vec![ok(BRATON)]);

    item_orders(&transport, "braton_prime_set").expect("orders");

    let seen = transport.seen();
    assert_eq!(seen.len(), 1);
    assert_eq!(seen[0].method, Method::Get);
    assert_eq!(
        seen[0].url,
        "https://api.warframe.market/v2/orders/item/braton_prime_set/top"
    );
    assert!(seen[0].token.is_none());
}

#[test]
fn rate_limiting_is_reported_as_such() {
    let transport = FakeTransport::new(vec![Ok(MarketResponse {
        status: 429,
        authorization: None,
        body: Vec::new(),
    })]);

    assert_eq!(
        item_orders(&transport, "serration"),
        Err(MarketError::RateLimited)
    );
}

#[test]
fn a_slug_that_could_address_another_route_spends_no_request() {
    let transport = FakeTransport::new(vec![ok(BRATON)]);

    for slug in ["", "../orders/my", "braton prime", "Braton"] {
        assert_eq!(
            item_orders(&transport, slug),
            Err(MarketError::Malformed),
            "{slug}"
        );
    }
    assert!(transport.seen().is_empty());
}
