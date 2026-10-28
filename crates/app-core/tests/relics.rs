use std::sync::Arc;

use app_core::{AppCore, Rarity, Refinement};
use local_store::SnapshotMeta;
use warframe_acquisition::{PriceTable, RelicRewardIndex};
use warframe_domain::{CatalogItem, Category, InventoryEntry, InventorySnapshot, ItemId};

const RADIANT: &str = "/Lotus/Types/Game/Projections/T1VoidProjectionTestAPlatinum";

/// One radiant relic as WFCD's Relics.json spells it, `rarity` labels and all.
const RELICS: &str = r#"[{
  "uniqueName": "/Lotus/Types/Game/Projections/T1VoidProjectionTestAPlatinum",
  "name": "Lith T1 Radiant", "vaulted": true,
  "rewards": [
    {"chance": 16.67, "rarity": "Uncommon", "item": {"name": "Braton Prime Stock"}},
    {"chance": 16.67, "rarity": "Uncommon", "item": {"name": "Paris Prime String"}},
    {"chance": 16.67, "rarity": "Uncommon", "item": {"name": "Forma Blueprint"}},
    {"chance": 20, "rarity": "Uncommon", "item": {"name": "Lex Prime Barrel"}},
    {"chance": 20, "rarity": "Uncommon", "item": {"name": "Akstiletto Prime Link"}},
    {"chance": 10, "rarity": "Rare", "item": {"name": "Nikana Prime Blueprint"}}
  ]
}]"#;

/// A relic is priced from `closed` records only; everything else may be priced from its ask.
const DUMP: &str = r#"{
  "Braton Prime Stock": [{"order_type":"sell","median":3.0,"volume":40}],
  "Paris Prime String": [{"order_type":"sell","median":6.0,"volume":40}],
  "Lex Prime Barrel": [{"order_type":"sell","median":10.0,"volume":40}],
  "Akstiletto Prime Link": [{"order_type":"sell","median":10.0,"volume":40}],
  "Nikana Prime Blueprint": [{"order_type":"sell","median":50.0,"volume":40}],
  "Lith T1 Relic": [{"order_type":"closed","median":9.0,"volume":6,"subtype":"radiant"}]
}"#;

fn item(id: &str, name: &str, category: Category, quantity: u32) -> InventoryEntry {
    InventoryEntry::new(
        CatalogItem::new(ItemId::new(id).unwrap(), name, category).unwrap(),
        quantity,
    )
}

fn core() -> AppCore {
    let mut core = AppCore::in_memory().unwrap();
    core.apply_inventory_snapshot(
        InventorySnapshot::coherent(vec![
            item(RADIANT, "Lith T1 Radiant", Category::Relic, 4),
            item(
                "/Lotus/Types/Recipes/Weapons/WeaponParts/PrimeBowString",
                "Paris Prime String",
                Category::PrimePart,
                2,
            ),
        ])
        .unwrap(),
        SnapshotMeta::fake("build").unwrap(),
    )
    .unwrap();
    core
}

#[test]
fn a_held_relic_is_valued_from_its_tables_and_the_prices_in_hand() {
    let mut core = core();
    core.set_relic_index(Arc::new(
        RelicRewardIndex::from_wfcd_json(RELICS.as_bytes()).unwrap(),
    ));
    core.set_collection_prices(Arc::new(
        PriceTable::from_dump_json(DUMP.as_bytes(), "2026-10-27").unwrap(),
    ));

    let view = core.relics_view().unwrap();
    assert!(view.catalog);
    assert_eq!(view.prices_date.as_deref(), Some("2026-10-27"));
    let [relic] = view.relics.as_slice() else {
        panic!("one relic held: {view:?}");
    };
    assert_eq!(
        (relic.name.as_str(), relic.era.as_str()),
        ("Lith T1", "Lith")
    );
    assert_eq!(relic.refinement, Some(Refinement::Radiant));
    assert_eq!((relic.quantity, relic.vaulted), (4, Some(true)));
    assert_eq!(relic.platinum, Some(9), "the radiant tier's own trades");

    let opening = relic.opening.expect("every chance is published");
    // Forma has no market: it is left out of the average and said to be.
    let expected = 0.1667 * (3.0 + 6.0) + 0.2 * (10.0 + 10.0) + 0.1 * 50.0;
    assert!((opening.platinum - expected).abs() < 1e-9, "{opening:?}");
    assert_eq!(opening.unpriced, 1);
    assert_eq!(opening.ducats, None, "no catalogue, so no ducat values");

    let string = relic
        .rewards
        .iter()
        .find(|reward| reward.name == "Paris Prime String")
        .unwrap();
    assert_eq!((string.owned, string.platinum), (2, Some(6)));
    assert_eq!(
        relic
            .rewards
            .iter()
            .map(|reward| reward.rarity)
            .collect::<Vec<_>>(),
        [
            Some(Rarity::Common),
            Some(Rarity::Common),
            Some(Rarity::Common),
            Some(Rarity::Uncommon),
            Some(Rarity::Uncommon),
            Some(Rarity::Rare)
        ],
        "from the radiant table, not WFCD's labels"
    );
}

#[test]
fn without_relic_tables_a_held_relic_is_still_listed_but_not_valued() {
    let view = core().relics_view().unwrap();
    assert!(!view.catalog);
    assert_eq!(view.prices_date, None);
    let [relic] = view.relics.as_slice() else {
        panic!("one relic held: {view:?}");
    };
    assert_eq!(relic.refinement, Some(Refinement::Radiant));
    assert_eq!(relic.vaulted, None);
    assert!(relic.opening.is_none() && relic.rewards.is_empty());
}
