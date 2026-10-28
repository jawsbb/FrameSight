use std::sync::Arc;

use app_core::{AppCore, Pace};
use local_store::SnapshotMeta;
use warframe_acquisition::{CatalogIndex, PriceTable, RelicRewardIndex};
use warframe_domain::{CatalogItem, Category, InventoryEntry, InventorySnapshot, ItemId};

const LITH: &str = "/Lotus/Types/Game/Projections/T1VoidProjectionTestABronze";

/// A mod that drops on a rotation and from an enemy, and a relic that drops on another.
const CATALOG: &str = r#"[
  {"uniqueName":"/Lotus/Upgrades/Mods/Rifle/Serration","name":"Serration","category":"Mods","drops":[
    {"location":"Earth/Mantle (Capture)","chance":10,"type":"Serration"},
    {"location":"Scorpion","chance":50,"type":"Serration"}
  ]},
  {"uniqueName":"/Lotus/Types/Game/Projections/T1VoidProjectionTestABronze","name":"Lith T1 Intact","category":"Relics","drops":[
    {"location":"Void/Mot (Survival), Rotation C","chance":20,"type":"Lith T1 Relic"}
  ]}
]"#;

const RELICS: &str = r#"[{
  "uniqueName": "/Lotus/Types/Game/Projections/T1VoidProjectionTestABronze", "name": "Lith T1 Intact",
  "rewards": [
    {"chance": 75.99, "item": {"name": "Braton Prime Stock"}},
    {"chance": 22, "item": {"name": "Forma Blueprint"}},
    {"chance": 2, "item": {"name": "Nikana Prime Blueprint"}}
  ]
}]"#;

fn dump(stock: f64, serration: f64) -> String {
    format!(
        r#"{{
      "Braton Prime Stock": [{{"order_type":"closed","median":{stock},"volume":3}}],
      "Nikana Prime Blueprint": [{{"order_type":"closed","median":200.0,"volume":3}}],
      "Serration": [{{"order_type":"closed","median":{serration},"volume":3}}],
      "Scan Matter": [{{"order_type":"sell","median":240.0,"volume":3}}]
    }}"#
    )
}

fn item(id: &str, name: &str, category: Category, quantity: u32) -> InventoryEntry {
    InventoryEntry::new(
        CatalogItem::new(ItemId::new(id).unwrap(), name, category).unwrap(),
        quantity,
    )
}

#[test]
fn the_farm_view_ranks_what_sells_and_chains_a_mission_through_its_relic() {
    let mut core = AppCore::in_memory().unwrap();
    core.apply_inventory_snapshot(
        InventorySnapshot::coherent(vec![
            item(LITH, "Lith T1 Intact", Category::Relic, 3),
            item(
                "/Lotus/Upgrades/Mods/Rifle/Serration",
                "Serration",
                Category::Mod,
                4,
            ),
            item(
                "/Lotus/Upgrades/Mods/Misc/ScanMatter",
                "Scan Matter",
                Category::Mod,
                5,
            ),
        ])
        .unwrap(),
        SnapshotMeta::fake("build").unwrap(),
    )
    .unwrap();
    core.set_mastery_catalog(Arc::new(
        CatalogIndex::from_wfcd_json(CATALOG.as_bytes()).unwrap(),
    ));
    core.set_relic_index(Arc::new(
        RelicRewardIndex::from_wfcd_json(RELICS.as_bytes()).unwrap(),
    ));
    core.set_collection_prices(Arc::new(
        PriceTable::from_dump_json(dump(10.0, 30.0).as_bytes(), "2026-10-27").unwrap(),
    ));
    core.set_earlier_prices(Arc::new(
        PriceTable::from_dump_json(dump(10.0, 24.0).as_bytes(), "2026-10-20").unwrap(),
    ));

    let view = core.farm_view().unwrap();
    assert_eq!(view.prices_date.as_deref(), Some("2026-10-27"));
    assert_eq!(view.earlier_date.as_deref(), Some("2026-10-20"));

    // Three trades a day is ninety a month: Serration sells its four; Scan Matter nobody buys.
    let names: Vec<_> = view.sell.iter().map(|row| row.name.as_str()).collect();
    assert_eq!(names[0], "Serration");
    assert_eq!(view.sell[0].value, 120);
    assert_eq!(view.sell[0].change, Some(0.25));
    let scan = view
        .sell
        .iter()
        .find(|row| row.name == "Scan Matter")
        .unwrap();
    assert_eq!((scan.value, scan.pace), (0, Pace::Slow));

    // Solo intact opening: the stock sells, Forma has no price, the Nikana blueprint does.
    let [relic] = view.open.as_slice() else {
        panic!("one relic held: {:?}", view.open);
    };
    assert_eq!(relic.name, "Lith T1");
    assert!((relic.value - (0.7599 * 10.0 + 0.02 * 200.0)).abs() < 1e-9);

    // The enemy is per kill, so it is not a run; the relic reaches Mot through its opening.
    let locations: Vec<_> = view.farm.iter().map(|row| row.location.as_str()).collect();
    assert_eq!(
        locations,
        ["Earth/Mantle (Capture)", "Void/Mot (Survival), Rotation C"]
    );
    assert!((view.farm[0].value - 3.0).abs() < 1e-9);
    assert!(view.farm[1].drops[0].relic);
    assert!((view.farm[1].value - 0.2 * relic.value).abs() < 1e-9);

    // Serration rose 25% and sells ninety a month, and the account holds four.
    assert_eq!(view.trends.len(), 1);
    assert_eq!(
        (view.trends[0].name.as_str(), view.trends[0].held),
        ("Serration", 4)
    );
}
