use app_core::{BoardRow, MIN_DAY_SALES, market_board};
use warframe_acquisition::{PriceTable, unix_days_before};

/// Eleven listings cut from the real 2026-10-27 and 2026-10-20 dumps, `closed` and `sell` records
/// only, each figure as published.
fn dump(date: &str) -> PriceTable {
    let bytes = std::fs::read(format!(
        "{}/tests/fixtures/price-dump-{date}.json",
        env!("CARGO_MANIFEST_DIR")
    ))
    .expect("fixture");
    PriceTable::from_dump_json(&bytes, date).expect("fixture parses")
}

fn names(rows: &[BoardRow]) -> Vec<(&str, Option<&str>, Option<u32>)> {
    rows.iter()
        .map(|row| (row.name.as_str(), row.subtype.as_deref(), row.rank))
        .collect()
}

#[test]
fn the_most_sold_count_each_variant_on_its_own() {
    let board = market_board(&dump("2026-10-27"), None);

    assert_eq!(board.date.as_deref(), Some("2026-10-27"));
    assert_eq!(
        names(&board.most_sold)[..5],
        [
            ("Melee Riven Mod (Veiled)", Some("unrevealed"), None),
            ("Arcane Sculptor", None, Some(0)),
            ("Citrine Prime Set", None, None),
            // A relic's tier is named as the price table names it.
            ("Meso I3 Relic", None, None),
            ("Arcane Sculptor", None, Some(5)),
        ]
    );
    assert_eq!(
        (board.most_sold[0].sales, board.most_sold[0].median),
        (926, 9)
    );
    assert_eq!(board.most_sold.len(), 10);
}

#[test]
fn the_fastest_need_enough_sales_to_be_more_than_one_trade() {
    let board = market_board(&dump("2026-10-27"), None);

    // 78 radiant copies sold against 36 listed.
    assert_eq!(
        names(&board.fastest)[..3],
        [
            ("Meso I3 Relic (Radiant)", None, None),
            ("Arcane Sculptor", None, Some(5)),
            ("Primary Compression", None, Some(5)),
        ]
    );
    // Six sales against one listing is the fastest ratio in the file, and noise.
    assert!(board.fastest.iter().all(|row| row.sales >= MIN_DAY_SALES));
    assert!(
        !board
            .fastest
            .iter()
            .any(|row| row.name.starts_with("Meso V13"))
    );
}

#[test]
fn the_platinum_traded_weighs_each_variant_at_its_own_median() {
    let board = market_board(&dump("2026-10-27"), None);

    let first = &board.most_platinum[0];
    assert_eq!(
        (first.name.as_str(), first.rank, first.traded),
        ("Arcane Sculptor", Some(5), 243 * 199)
    );
    assert_eq!(board.most_platinum[1].name, "Citrine Prime Set");
}

#[test]
fn the_weeks_change_ranks_only_items_that_sell_and_cost_something() {
    let earlier = dump("2026-10-20");
    let board = market_board(&dump("2026-10-27"), Some(&earlier));

    assert_eq!(board.earlier_date.as_deref(), Some("2026-10-20"));
    let rising = &board.rising[0];
    assert_eq!(
        (rising.name.as_str(), rising.median),
        ("Ballistica Prime Set", 135)
    );
    assert!((rising.change.unwrap() - 0.35).abs() < 1e-9);
    let falling = &board.falling[0];
    // 50p to 20p, on 40 sales of both ranks.
    assert_eq!(
        (falling.name.as_str(), falling.rank, falling.sales),
        ("Primed Point Blank", Some(0), 40)
    );
    assert!((falling.change.unwrap() + 0.6).abs() < 1e-9);
    let changed: Vec<&str> = board
        .rising
        .iter()
        .chain(&board.falling)
        .map(|row| row.name.as_str())
        .collect();
    // +300% on 12 sales, and +100% from 2p to 4p.
    assert!(!changed.contains(&"Meso V1 Relic"), "{changed:?}");
    assert!(!changed.contains(&"Zaw Riven Mod (Veiled)"), "{changed:?}");
}

#[test]
fn without_the_earlier_dump_there_is_no_change_to_rank() {
    let board = market_board(&dump("2026-10-27"), None);

    assert_eq!(board.earlier_date, None);
    assert!(board.rising.is_empty() && board.falling.is_empty());
}

#[test]
fn a_table_saved_before_the_days_trades_were_kept_has_no_day_to_show() {
    let fresh = dump("2026-10-27");
    let mut saved = serde_json::to_value(&fresh).expect("serialises");
    saved.as_object_mut().expect("object").remove("day_sales");
    let table: PriceTable = serde_json::from_value(saved).expect("still loads");

    let board = market_board(&table, None);

    assert_eq!(board.date, None);
    assert!(board.most_sold.is_empty());
    // Its dump is downloaded again, though its date alone would keep it.
    let that_day = unix_days_before("2026-10-27", 0).expect("a date");
    assert!(fresh.is_current(that_day));
    assert!(!table.is_current(that_day));
}
