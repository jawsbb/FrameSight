use std::sync::Arc;

use app_core::AppCore;
use local_store::SnapshotMeta;
use serde_json::{Value, json};
use warframe_acquisition::CatalogIndex;
use warframe_domain::{CatalogItem, Category, InventoryEntry, InventorySnapshot, ItemId};

const RHINO_PRIME: &str = "/Lotus/Powersuits/Rhino/RhinoPrime";
const CHASSIS: &str = "/Lotus/Types/Recipes/WarframeRecipes/RhinoPrimeChassisComponent";
const CHASSIS_BLUEPRINT: &str = "/Lotus/Types/Recipes/WarframeRecipes/RhinoPrimeChassisBlueprint";
const SERRATION: &str = "/Lotus/Upgrades/Mods/Rifle/WeaponDamageAmountMod";

/// A vaulted Prime frame with one relic part, the relic it drops from, and a mod with no recipe.
const CATALOG: &[u8] = br#"[
  {"uniqueName":"/Lotus/Powersuits/Rhino/RhinoPrime","name":"Rhino Prime","type":"Warframe","category":"Warframes",
   "masterable":true,"isPrime":true,"vaulted":true,"masteryReq":0,"imageName":"RhinoPrime.png",
   "description":"Takes Rhino's abilities to the next level.","health":270,"shield":455,"armor":290,"power":100,"sprintSpeed":1,
   "introduced":{"name":"Update 12.4","date":"2014-03-05","url":"https://wiki.warframe.com/w/Update_12"},
   "wikiaUrl":"https://wiki.warframe.com/w/Rhino%2FPrime",
   "abilities":[{"name":"Rhino Charge","description":"Rhino charges towards a target.","imageName":"RhinoDash.png"}],
   "components":[
     {"uniqueName":"/Lotus/Types/Recipes/WarframeRecipes/RhinoPrimeBlueprint","name":"Blueprint","itemCount":1,"tradable":true,"ducats":45,"imageName":"blueprint.png"},
     {"uniqueName":"/Lotus/Types/Recipes/WarframeRecipes/RhinoPrimeChassisComponent","name":"Chassis","itemCount":1,"tradable":true,"ducats":45,
      "imageName":"GenericWarframePrimeChassis.png","description":"Chassis component of the Rhino Prime Warframe.",
      "drops":[
        {"chance":11,"location":"Lith E1 Relic","rarity":"Uncommon","type":"Rhino Prime Chassis Blueprint","uniqueName":"/Lotus/Types/Game/Projections/T1VoidProjectionEmberRhinoVaultABronze"},
        {"chance":13,"location":"Lith E1 Relic (Exceptional)","rarity":"Uncommon","type":"Rhino Prime Chassis Blueprint","uniqueName":"/Lotus/Types/Game/Projections/T1VoidProjectionEmberRhinoVaultABronze"},
        {"chance":25.33,"location":"Meso N6 Relic","rarity":"Common","type":"Rhino Prime Chassis Blueprint"}
      ]},
     {"uniqueName":"/Lotus/Types/Items/MiscItems/OrokinCell","name":"Orokin Cell","itemCount":1,"tradable":false,"imageName":"OrokinCell.png"},
     {"uniqueName":"/Lotus/Types/Items/MiscItems/OrokinCell","name":"Orokin Cell","itemCount":1,"tradable":false,"imageName":"OrokinCell.png"}
   ]},
  {"uniqueName":"/Lotus/Types/Game/Projections/T1VoidProjectionEmberRhinoVaultABronze","name":"Lith E1 Intact","type":"Relic","category":"Relics","vaulted":true,"imageName":"RelicLithD.png"},
  {"uniqueName":"/Lotus/Types/Items/MiscItems/OrokinCell","name":"Orokin Cell","type":"Resource","category":"Resources","imageName":"OrokinCell.png"},
  {"uniqueName":"/Lotus/Upgrades/Mods/Rifle/WeaponDamageAmountMod","name":"Serration","type":"Rifle Mod","category":"Mods",
   "masterable":false,"tradable":true,"fusionLimit":10,"imageName":"RifleDamageAmountMod.jpg","description":"Increases damage.",
   "drops":[
     {"chance":0.17,"location":"Electric Crawler","rarity":"Rare","type":"Serration"},
     {"chance":0.09,"location":"Scaldra Eradicator","rarity":"Rare","type":"Spectral Serration"}
   ]}
]"#;

fn entry(id: &str, name: &str, category: Category, quantity: u32) -> InventoryEntry {
    InventoryEntry::new(
        CatalogItem::new(ItemId::new(id).expect("valid id"), name, category).expect("valid item"),
        quantity,
    )
}

fn core(entries: Vec<InventoryEntry>) -> AppCore {
    let mut core = AppCore::in_memory().expect("in-memory core");
    core.apply_inventory_snapshot(
        InventorySnapshot::coherent(entries).expect("coherent snapshot"),
        SnapshotMeta::fake("synced").expect("meta"),
    )
    .expect("snapshot applies");
    core.set_mastery_catalog(Arc::new(
        CatalogIndex::from_wfcd_json(CATALOG).expect("catalog parses"),
    ));
    core
}

fn detail(core: &AppCore, id: &str) -> Value {
    let view = core
        .item_detail(id)
        .expect("detail builds")
        .unwrap_or_else(|| panic!("{id} has a sheet"));
    serde_json::to_value(view).expect("serializes")
}

/// A Prime frame's sheet carries its catalogue facts, its recipe with what is held of each slot,
/// and where each part drops: one row per relic, at the intact chance, with the relic's vault.
#[test]
fn a_prime_frame_lists_its_recipe_what_is_held_and_where_parts_drop() {
    let core = core(vec![
        entry(RHINO_PRIME, "Rhino Prime", Category::Frame, 0).with_mastered(true),
        entry(
            CHASSIS_BLUEPRINT,
            "Rhino Prime Chassis Blueprint",
            Category::PrimePart,
            1,
        ),
        entry(CHASSIS, "Rhino Prime Chassis", Category::PrimePart, 1),
        entry(
            "/Lotus/Types/Items/MiscItems/OrokinCell",
            "Orokin Cell",
            Category::Resource,
            7,
        ),
    ]);

    let sheet = detail(&core, RHINO_PRIME);

    assert_eq!(
        sheet["description"],
        "Takes Rhino's abilities to the next level."
    );
    assert_eq!(sheet["vaulted"], true);
    assert_eq!(sheet["prime"], true);
    assert_eq!(sheet["mastery_req"], 0);
    assert_eq!(
        sheet["introduced"],
        json!({"name": "Update 12.4", "date": "2014-03-05"})
    );
    assert_eq!(
        sheet["wiki_url"],
        "https://wiki.warframe.com/w/Rhino%2FPrime"
    );
    assert_eq!(
        sheet["abilities"],
        json!([{"name": "Rhino Charge", "description": "Rhino charges towards a target."}])
    );
    assert_eq!(sheet["stats"][0], json!({"key": "health", "value": 270.0}));
    assert_eq!(sheet["stats"][3], json!({"key": "energy", "value": 100.0}));
    // Rendered from the item's own art name, by the wiki and by WFCD.
    assert_eq!(
        sheet["wiki_image_url"],
        "https://wiki.warframe.com/w/Special:FilePath/RhinoPrime.png?width=600"
    );
    assert_eq!(
        sheet["image_url"],
        "https://raw.githubusercontent.com/WFCD/warframe-items/master/data/img/RhinoPrime.png"
    );

    let components = sheet["components"].as_array().expect("components");
    let names: Vec<&str> = components
        .iter()
        .map(|slot| slot["name"].as_str().unwrap())
        .collect();
    assert_eq!(names, ["Blueprint", "Chassis", "Orokin Cell"]);
    // The blueprint held and the part built from it are both copies of the slot.
    assert_eq!(components[1]["held"], 2);
    assert_eq!(components[0]["held"], 0);
    // Listed twice by WFCD, counted once with both copies.
    assert_eq!(components[2]["count"], 2);
    assert_eq!(components[2]["held"], 7);
    assert_eq!(
        components[1]["drops"],
        json!([
            {"location": "Meso N6 Relic", "chance": 25.33, "rarity": "common"},
            {"location": "Lith E1 Relic", "chance": 11.0, "rarity": "uncommon", "vaulted": true},
        ])
    );
}

/// A part answers for its blueprint: the sheet of a held Chassis Blueprint is the Chassis's own.
#[test]
fn a_prime_part_blueprint_reads_the_part_it_builds() {
    let core = core(vec![entry(
        CHASSIS_BLUEPRINT,
        "Rhino Prime Chassis Blueprint",
        Category::PrimePart,
        1,
    )]);

    let sheet = detail(&core, CHASSIS_BLUEPRINT);

    assert_eq!(
        sheet["description"],
        "Chassis component of the Rhino Prime Warframe."
    );
    assert_eq!(sheet["vaulted"], true);
    assert_eq!(sheet["drops"].as_array().map(Vec::len), Some(2));
}

/// No recipe, so no components; its own drops keep only rows for the item itself.
#[test]
fn a_mod_has_no_recipe_and_keeps_only_its_own_drops() {
    let core = core(vec![entry(
        &format!("{SERRATION}#3"),
        "Serration",
        Category::Mod,
        1,
    )]);

    let sheet = detail(&core, &format!("{SERRATION}#3"));

    assert_eq!(sheet["components"], json!([]));
    assert_eq!(sheet["abilities"], json!([]));
    assert_eq!(
        sheet["drops"],
        json!([{"location": "Electric Crawler", "chance": 0.17, "rarity": "rare"}])
    );
}

/// An id no list holds has no sheet; a row the catalogue never heard of gets its art and nothing
/// invented: a blueprint without art of its own draws the generic blueprint.
#[test]
fn an_unknown_item_has_no_sheet_and_an_uncatalogued_row_only_its_art() {
    let core = core(vec![entry(
        "/Lotus/Types/Recipes/AbilityOverrides/RhinoRoarBlueprint",
        "Rhino Roar Blueprint",
        Category::Blueprint,
        1,
    )]);

    assert!(
        core.item_detail("/Lotus/Types/Unknown/Thing")
            .expect("detail")
            .is_none()
    );

    let sheet = detail(
        &core,
        "/Lotus/Types/Recipes/AbilityOverrides/RhinoRoarBlueprint",
    );
    assert_eq!(
        sheet["image_url"],
        "https://raw.githubusercontent.com/WFCD/warframe-items/master/data/img/blueprint.png"
    );
    assert!(sheet.get("description").is_none());
    assert_eq!(sheet["components"], json!([]));
    assert_eq!(sheet["drops"], json!([]));
}

/// A Mastery row never held is the catalogue's, not the store's, and still has a sheet.
#[test]
fn a_mastery_row_never_held_has_a_sheet_from_the_catalogue() {
    let core = core(vec![entry(SERRATION, "Serration", Category::Mod, 1)]);

    let sheet = detail(&core, RHINO_PRIME);

    assert_eq!(
        sheet["image_url"],
        "https://raw.githubusercontent.com/WFCD/warframe-items/master/data/img/RhinoPrime.png"
    );
    assert_eq!(sheet["components"][1]["held"], 0);
}
