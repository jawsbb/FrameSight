use std::sync::Arc;

use app_core::{AppCore, MarketAccountView, SetPartHeld};
use local_store::SnapshotMeta;
use warframe_acquisition::CatalogIndex;
use warframe_domain::{CatalogItem, Category, InventoryEntry, InventorySnapshot, ItemId};
use warframe_market::{CredentialBacking, MarketItems};

const GUANDAO: &str = "/Lotus/Weapons/Tenno/Melee/Polearms/GuandaoPrime";
const BLUEPRINT: &str = "/Lotus/Types/Recipes/Weapons/GuandaoPrimeBlueprint";
const BLADE: &str = "/Lotus/Types/Recipes/Weapons/WeaponParts/GuandaoPrimeBlade";
const HANDLE: &str = "/Lotus/Types/Recipes/Weapons/WeaponParts/GuandaoPrimeHandle";
/// Two blades per build, as the live set endpoint also lists them, and a whole Bronco Prime the
/// build consumes, which no set includes.
const CATALOG: &str = r#"[{"uniqueName": "/Lotus/Weapons/Tenno/Melee/Polearms/GuandaoPrime",
  "name": "Guandao Prime", "category": "Melee", "type": "Melee", "masterable": true,
  "tradable": false, "masteryReq": 12, "maxLevelCap": 30, "components": [
  {"uniqueName": "/Lotus/Types/Recipes/Weapons/GuandaoPrimeBlueprint", "name": "Blueprint",
   "itemCount": 1, "tradable": true, "ducats": 45},
  {"uniqueName": "/Lotus/Types/Recipes/Weapons/WeaponParts/GuandaoPrimeBlade", "name": "Blade",
   "itemCount": 2, "tradable": true, "ducats": 15},
  {"uniqueName": "/Lotus/Types/Recipes/Weapons/WeaponParts/GuandaoPrimeHandle", "name": "Handle",
   "itemCount": 1, "tradable": true, "ducats": 100},
  {"uniqueName": "/Lotus/Weapons/Tenno/Shotgun/BroncoPrime", "name": "Bronco Prime",
   "itemCount": 1, "tradable": false}]},
  {"uniqueName": "/Lotus/Weapons/Tenno/Shotgun/BroncoPrime", "name": "Bronco Prime",
   "category": "Secondary", "type": "Secondary", "masterable": true, "tradable": false,
   "masteryReq": 0, "maxLevelCap": 30, "components": []}]"#;
const ITEMS: &str = r#"{"data":[
  {"id":"5f986cf89dbdce024971b0b6","slug":"guandao_prime_set",
   "gameRef":"/Lotus/Weapons/Tenno/Melee/Polearms/GuandaoPrime","tags":["set"],
   "i18n":{"en":{"name":"Guandao Prime Set","thumb":"items/images/en/thumbs/guandao.png"}}}
]}"#;

fn entry(path: &str, quantity: u32) -> InventoryEntry {
    InventoryEntry::new(
        CatalogItem::new(ItemId::new(path).unwrap(), path, Category::PrimePart).unwrap(),
        quantity,
    )
}

fn core_holding(entries: Vec<InventoryEntry>) -> AppCore {
    let mut core = AppCore::in_memory().unwrap();
    core.apply_inventory_snapshot(
        InventorySnapshot::coherent(entries).unwrap(),
        SnapshotMeta::fake("live").unwrap(),
    )
    .unwrap();
    core.set_mastery_catalog(Arc::new(
        CatalogIndex::from_wfcd_json(CATALOG.as_bytes()).unwrap(),
    ));
    core
}

#[test]
fn a_set_counts_the_whole_sets_its_scarcest_slot_allows() {
    let core = core_holding(vec![entry(BLUEPRINT, 2), entry(BLADE, 3), entry(HANDLE, 2)]);
    let sets = core.held_sets(&core.collection_for_reconciliation().unwrap());

    assert_eq!(sets.len(), 1);
    assert_eq!(sets[0].path, GUANDAO);
    assert_eq!(sets[0].name, "Guandao Prime Set");
    // Three blades make one pair: the blades decide, not the blueprints.
    assert_eq!(sets[0].complete, 1);
    assert_eq!(
        sets[0].parts,
        vec![
            SetPartHeld {
                name: "Blueprint".into(),
                uses: 1,
                held: 2
            },
            SetPartHeld {
                name: "Blade".into(),
                uses: 2,
                held: 3
            },
            SetPartHeld {
                name: "Handle".into(),
                uses: 1,
                held: 2
            },
        ]
    );
}

#[test]
fn a_part_held_alone_shows_its_set_incomplete_and_nothing_held_shows_none() {
    let core = core_holding(vec![entry(HANDLE, 1)]);
    let sets = core.held_sets(&core.collection_for_reconciliation().unwrap());
    assert_eq!(sets.len(), 1);
    assert_eq!(sets[0].complete, 0);

    let empty = core_holding(vec![entry("/Lotus/Upgrades/Mods/Rifle/Serration", 1)]);
    assert!(
        empty
            .held_sets(&empty.collection_for_reconciliation().unwrap())
            .is_empty()
    );
}

#[test]
fn only_the_sets_the_market_lists_are_offered_under_its_id() {
    let core = core_holding(vec![entry(BLUEPRINT, 1), entry(BLADE, 2), entry(HANDLE, 1)]);
    let sets = core.held_sets(&core.collection_for_reconciliation().unwrap());
    let items = MarketItems::from_response(ITEMS.as_bytes()).unwrap();

    let view = MarketAccountView::linked(CredentialBacking::Keyring, Vec::new(), "0".into())
        .with_sets(&items, sets.clone());
    assert_eq!(view.sets.len(), 1);
    assert_eq!(view.sets[0].item_id, "5f986cf89dbdce024971b0b6");
    assert_eq!(view.sets[0].slug, "guandao_prime_set");
    assert_eq!(view.sets[0].complete, 1);

    let unlisted = MarketItems::from_response(br#"{"data":[]}"#).unwrap();
    let view = MarketAccountView::linked(CredentialBacking::Keyring, Vec::new(), "0".into())
        .with_sets(&unlisted, sets);
    assert!(view.sets.is_empty());
}
