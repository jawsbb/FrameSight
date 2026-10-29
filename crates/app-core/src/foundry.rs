//! The foundry: which Prime builds the account can start now, which are a piece or two away, and
//! which sets it has started. Built at request time from the saved collection, the recipe
//! catalogue and the daily price table, all already in memory: nothing here downloads.

use serde::Serialize;
use warframe_acquisition::{CatalogIndex, ComponentKind, Holdings, Recipe, RecipeComponent};
use warframe_domain::Category;

use crate::{AppCore, AppError, wfcd_image_url};

/// A build "almost" there lacks at most this many pieces, copies counted.
const ALMOST: u32 = 2;

/// Why the foundry has nothing to say yet, or that it has.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum FoundryStatus {
    /// The recipe catalogue has not loaded.
    NoCatalog,
    /// No inventory has ever been read, so nothing is held as far as anyone knows.
    NoInventory,
    Ready,
}

/// How far a build is from the foundry.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum FoundryStage {
    /// Every piece and every resource the inventory can vouch for is held.
    Ready,
    /// One or two pieces short, or only resources short.
    Almost,
    /// Started (some piece is held) but further away.
    Set,
}

#[derive(Clone, Debug, Serialize)]
pub struct FoundryView {
    pub status: FoundryStatus,
    pub items: Vec<FoundryItem>,
}

/// One Prime build the account holds at least one piece of.
#[derive(Clone, Debug, Serialize)]
pub struct FoundryItem {
    /// The built item's catalog path.
    pub id: String,
    pub name: String,
    /// Absent for builds that are no equipment, such as the Kavasa collar.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub category: Option<Category>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image_url: Option<String>,
    pub masterable: bool,
    pub mastered: bool,
    pub stage: FoundryStage,
    /// Copies of pieces still to find: two Guandao Prime blades short is two.
    pub missing: u32,
    pub pieces: Vec<FoundryPiece>,
    /// Resources live in the inventory sections the decoder reads whole, so one the snapshot
    /// does not hold is held at zero.
    pub resources: Vec<FoundryResource>,
    /// What warframe.market trades the whole set for.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub set_platinum: Option<u32>,
    /// The tradable pieces sold one by one, copies counted. Absent unless every one has a price,
    /// since a partial sum would read as a cheaper set.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pieces_platinum: Option<u32>,
}

/// One slot of the recipe: the blueprint, a part, or a whole item consumed by the build.
#[derive(Clone, Debug, Serialize)]
pub struct FoundryPiece {
    /// WFCD's slot name: "Blueprint", "Blade", "Bronco Prime".
    pub name: String,
    /// The game's part art file name, for the bundled silhouettes.
    pub image: Option<String>,
    pub kind: ComponentKind,
    pub uses: u32,
    pub held: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub platinum: Option<u32>,
    /// Relics the current drop tables give this piece from.
    pub drops: Vec<String>,
}

#[derive(Clone, Debug, Serialize)]
pub struct FoundryResource {
    pub name: String,
    pub uses: u32,
    pub held: u32,
}

impl AppCore {
    /// The foundry, as the saved collection stands. Under Companion and Overlay that collection is
    /// a snapshot, which the page says; the counts are the snapshot's either way.
    pub fn foundry_view(&self) -> Result<FoundryView, AppError> {
        let Some(catalog) = self.mastery_catalog.as_deref() else {
            return Ok(FoundryView {
                status: FoundryStatus::NoCatalog,
                items: Vec::new(),
            });
        };
        if self.store.latest_snapshot_meta()?.is_none() {
            return Ok(FoundryView {
                status: FoundryStatus::NoInventory,
                items: Vec::new(),
            });
        }
        let holdings = Holdings::from_entries(self.store.load_collection()?.entries());
        let price = |name: &str| self.prices.as_ref()?.price_for(name);
        Ok(FoundryView {
            status: FoundryStatus::Ready,
            items: foundry_items(catalog, &holdings, &price),
        })
    }
}

/// Every Prime recipe the account holds a blueprint or part of, by name.
fn foundry_items(
    catalog: &CatalogIndex,
    holdings: &Holdings,
    price: &dyn Fn(&str) -> Option<u32>,
) -> Vec<FoundryItem> {
    let mut items = catalog
        .recipes()
        .filter_map(|recipe| foundry_item(catalog, recipe, holdings, price))
        .collect::<Vec<_>>();
    items.sort_by(|left, right| left.name.cmp(&right.name));
    items
}

fn foundry_item(
    catalog: &CatalogIndex,
    recipe: &Recipe,
    holdings: &Holdings,
    price: &dyn Fn(&str) -> Option<u32>,
) -> Option<FoundryItem> {
    let pieces = recipe
        .components
        .iter()
        .map(|slot| piece(catalog, slot, holdings, price))
        .collect::<Vec<_>>();
    // Holding Bronco Prime alone has not started an Akbronco.
    if !pieces
        .iter()
        .any(|piece| piece.kind != ComponentKind::Ingredient && piece.held > 0)
    {
        return None;
    }
    let resources = recipe
        .resources
        .iter()
        .map(|resource| FoundryResource {
            name: resource.name.clone(),
            uses: resource.per_build,
            held: holdings.quantity(&resource.path),
        })
        .collect::<Vec<_>>();
    let missing = pieces
        .iter()
        .map(|piece| piece.uses.saturating_sub(piece.held))
        .sum::<u32>();
    let resources_short = resources
        .iter()
        .any(|resource| resource.held < resource.uses);
    let stage = match missing {
        0 if !resources_short => FoundryStage::Ready,
        0..=ALMOST => FoundryStage::Almost,
        _ => FoundryStage::Set,
    };
    let pieces_platinum = pieces
        .iter()
        .filter(|piece| piece.kind != ComponentKind::Ingredient)
        .map(|piece| Some(piece.platinum?.saturating_mul(piece.uses)))
        .sum::<Option<u32>>();
    let metadata = catalog.resolve(&recipe.parent);
    Some(FoundryItem {
        id: recipe.parent.clone(),
        name: recipe.parent_name.clone(),
        category: metadata.and_then(|metadata| metadata.category()),
        image_url: metadata
            .and_then(|metadata| metadata.image_name())
            .map(wfcd_image_url),
        masterable: metadata.is_some_and(|metadata| metadata.masterable()),
        mastered: holdings.mastered(&recipe.parent),
        stage,
        missing,
        pieces,
        resources,
        set_platinum: price(&format!("{} Set", recipe.parent_name)),
        pieces_platinum,
    })
}

/// A slot as the inventory holds it. A part counts its blueprint sibling, which is what a relic
/// gives; builds already in the foundry are not counted, since they are not in hand.
fn piece(
    catalog: &CatalogIndex,
    slot: &RecipeComponent,
    holdings: &Holdings,
    price: &dyn Fn(&str) -> Option<u32>,
) -> FoundryPiece {
    let sibling = slot.blueprint_sibling();
    let held = holdings.slot_quantity(&slot.path);
    // The market sells a Warframe part under its blueprint's name, a weapon part under its own.
    let platinum = (slot.kind != ComponentKind::Ingredient)
        .then(|| {
            [sibling.as_deref(), Some(slot.path.as_str())]
                .into_iter()
                .flatten()
                .filter_map(|path| catalog.resolve(path))
                .find_map(|metadata| price(metadata.name()))
        })
        .flatten();
    FoundryPiece {
        name: slot.name.clone(),
        image: slot.image_name.clone(),
        kind: slot.kind,
        uses: slot.per_build,
        held,
        platinum,
        drops: slot.drops.clone(),
    }
}

#[cfg(test)]
mod tests {
    use std::collections::{BTreeMap, BTreeSet};

    use super::*;

    const ASH: &str = "/Lotus/Powersuits/Ninja/AshPrime";
    const ASH_BP: &str = "/Lotus/Types/Recipes/WarframeRecipes/AshPrimeBlueprint";
    const ASH_NEURO_BP: &str = "/Lotus/Types/Recipes/WarframeRecipes/AshPrimeHelmetBlueprint";
    const ASH_CHASSIS: &str = "/Lotus/Types/Recipes/WarframeRecipes/AshPrimeChassisComponent";
    const ASH_SYSTEMS_BP: &str = "/Lotus/Types/Recipes/WarframeRecipes/AshPrimeSystemsBlueprint";
    const GUANDAO: &str = "/Lotus/Weapons/Tenno/Melee/Polearms/GuandaoPrime";
    const GUANDAO_BP: &str = "/Lotus/Types/Recipes/Weapons/GuandaoPrimeBlueprint";
    const GUANDAO_BLADE: &str = "/Lotus/Types/Recipes/Weapons/WeaponParts/GuandaoPrimeBlade";
    const GUANDAO_HANDLE: &str = "/Lotus/Types/Recipes/Weapons/WeaponParts/GuandaoPrimeHandle";
    const OROKIN_CELL: &str = "/Lotus/Types/Items/MiscItems/OrokinCell";
    const BRONCO: &str = "/Lotus/Weapons/Tenno/Pistol/BroncoPrime";

    const CATALOG: &str = r#"[
      {"uniqueName":"/Lotus/Powersuits/Ninja/AshPrime","name":"Ash Prime","category":"Warframes",
       "type":"Warframe","masterable":true,"imageName":"ash-prime.png","components":[
        {"uniqueName":"/Lotus/Types/Recipes/WarframeRecipes/AshPrimeBlueprint","name":"Blueprint",
         "tradable":true,"ducats":45,"imageName":"blueprint.png"},
        {"uniqueName":"/Lotus/Types/Recipes/WarframeRecipes/AshPrimeChassisComponent","name":"Chassis",
         "tradable":true,"ducats":15,"imageName":"GenericWarframePrimeChassis.png",
         "drops":[{"location":"Axi B1 Relic (Radiant)"},{"location":"Axi B1 Relic (Intact)"}]},
        {"uniqueName":"/Lotus/Types/Recipes/WarframeRecipes/AshPrimeHelmetComponent","name":"Neuroptics",
         "tradable":true,"ducats":45,"imageName":"GenericWarframePrimeHelmet.png"},
        {"uniqueName":"/Lotus/Types/Recipes/WarframeRecipes/AshPrimeSystemsComponent","name":"Systems",
         "tradable":true,"ducats":65,"imageName":"GenericWarframePrimeSystem.png"},
        {"uniqueName":"/Lotus/Types/Items/MiscItems/OrokinCell","name":"Orokin Cell","tradable":false,
         "type":"Resource"},
        {"uniqueName":"/Lotus/Types/Gameplay/Eidolon/Resources/SentientShard","name":"Eidolon Shard",
         "tradable":false,"type":"Resource"}]},
      {"uniqueName":"/Lotus/Weapons/Tenno/Melee/Polearms/GuandaoPrime","name":"Guandao Prime",
       "category":"Melee","type":"Melee","masterable":true,"components":[
        {"uniqueName":"/Lotus/Types/Recipes/Weapons/GuandaoPrimeBlueprint","name":"Blueprint",
         "tradable":true,"ducats":45},
        {"uniqueName":"/Lotus/Types/Recipes/Weapons/WeaponParts/GuandaoPrimeBlade","name":"Blade",
         "itemCount":2,"tradable":true,"ducats":15},
        {"uniqueName":"/Lotus/Types/Recipes/Weapons/WeaponParts/GuandaoPrimeHandle","name":"Handle",
         "tradable":true,"ducats":100},
        {"uniqueName":"/Lotus/Types/Items/MiscItems/OrokinCell","name":"Orokin Cell","itemCount":15,
         "tradable":false,"type":"Resource"}]},
      {"uniqueName":"/Lotus/Weapons/Tenno/Pistol/BroncoPrime","name":"Bronco Prime",
       "category":"Secondary","type":"Pistol","masterable":true,"components":[]},
      {"uniqueName":"/Lotus/Weapons/Tenno/Pistols/AkBroncoPrime","name":"Akbronco Prime",
       "category":"Secondary","type":"Pistol","masterable":true,"components":[
        {"uniqueName":"/Lotus/Types/Recipes/Weapons/AkbroncoPrimeBlueprint","name":"Blueprint",
         "tradable":true,"ducats":15},
        {"uniqueName":"/Lotus/Weapons/Tenno/Pistol/BroncoPrime","name":"Bronco Prime","tradable":false},
        {"uniqueName":"/Lotus/Weapons/Tenno/Pistol/BroncoPrime","name":"Bronco Prime","tradable":false},
        {"uniqueName":"/Lotus/Types/Recipes/Weapons/WeaponParts/AkbroncoPrimeLink","name":"Link",
         "tradable":true,"ducats":45}]}
    ]"#;

    fn catalog() -> CatalogIndex {
        CatalogIndex::from_wfcd_json(CATALOG.as_bytes()).unwrap()
    }

    fn holdings(held: &[(&str, u32)], mastered: &[&str]) -> Holdings {
        Holdings::from_parts(
            held.iter()
                .map(|(path, count)| ((*path).to_owned(), *count))
                .collect::<BTreeMap<_, _>>(),
            mastered
                .iter()
                .map(|path| (*path).to_owned())
                .collect::<BTreeSet<_>>(),
        )
    }

    fn no_prices(_: &str) -> Option<u32> {
        None
    }

    fn item<'a>(items: &'a [FoundryItem], id: &str) -> &'a FoundryItem {
        items.iter().find(|item| item.id == id).expect("listed")
    }

    #[test]
    fn a_build_with_every_piece_and_its_resources_is_ready() {
        let held = holdings(
            &[
                (GUANDAO_BP, 1),
                (GUANDAO_BLADE, 2),
                (GUANDAO_HANDLE, 1),
                (OROKIN_CELL, 20),
            ],
            &[],
        );
        let items = foundry_items(&catalog(), &held, &no_prices);
        let guandao = item(&items, GUANDAO);
        assert_eq!(guandao.stage, FoundryStage::Ready);
        assert_eq!(guandao.missing, 0);
        assert!(guandao.masterable && !guandao.mastered);
        assert_eq!(guandao.category, Some(Category::Weapon));
    }

    #[test]
    fn a_second_copy_of_one_piece_is_still_missing() {
        let held = holdings(
            &[
                (GUANDAO_BP, 1),
                (GUANDAO_BLADE, 1),
                (GUANDAO_HANDLE, 1),
                (OROKIN_CELL, 20),
            ],
            &[GUANDAO],
        );
        let items = foundry_items(&catalog(), &held, &no_prices);
        let guandao = item(&items, GUANDAO);
        assert_eq!(guandao.stage, FoundryStage::Almost);
        assert_eq!(guandao.missing, 1);
        let blade = &guandao.pieces[1];
        assert_eq!(
            (blade.name.as_str(), blade.uses, blade.held),
            ("Blade", 2, 1)
        );
        assert!(guandao.mastered);
    }

    #[test]
    fn resources_short_keep_a_complete_set_almost() {
        let held = holdings(
            &[
                (ASH_BP, 1),
                (ASH_NEURO_BP, 1),
                (ASH_CHASSIS, 1),
                (ASH_SYSTEMS_BP, 1),
            ],
            &[],
        );
        let items = foundry_items(&catalog(), &held, &no_prices);
        let ash = item(&items, ASH);
        assert_eq!(ash.missing, 0, "a part's blueprint counts as the part");
        assert_eq!(ash.stage, FoundryStage::Almost);
        let resources: Vec<_> = ash
            .resources
            .iter()
            .map(|resource| (resource.name.as_str(), resource.uses, resource.held))
            .collect();
        assert_eq!(
            resources,
            vec![("Eidolon Shard", 1, 0), ("Orokin Cell", 1, 0)]
        );
    }

    #[test]
    fn a_started_set_lists_its_prices_and_where_the_missing_pieces_drop() {
        let held = holdings(&[(ASH_SYSTEMS_BP, 1)], &[]);
        let prices = |name: &str| match name {
            "Ash Prime Set" => Some(120),
            "Ash Prime Blueprint" => Some(30),
            "Ash Prime Chassis Blueprint" => Some(10),
            "Ash Prime Neuroptics Blueprint" => Some(25),
            "Ash Prime Systems Blueprint" => Some(40),
            _ => None,
        };
        let items = foundry_items(&catalog(), &held, &prices);
        let ash = item(&items, ASH);
        assert_eq!(ash.stage, FoundryStage::Set);
        assert_eq!(ash.missing, 3);
        assert_eq!(ash.set_platinum, Some(120));
        assert_eq!(ash.pieces_platinum, Some(105));
        let chassis = ash
            .pieces
            .iter()
            .find(|piece| piece.name == "Chassis")
            .unwrap();
        assert_eq!(
            chassis.platinum,
            Some(10),
            "priced under its blueprint's name"
        );
        assert_eq!(chassis.drops, vec!["Axi B1 Relic"]);
        assert_eq!(
            ash.image_url.as_deref(),
            Some(
                "https://raw.githubusercontent.com/WFCD/warframe-items/master/data/img/ash-prime.png"
            )
        );
    }

    #[test]
    fn an_unpriced_piece_withholds_the_sum_of_the_pieces() {
        let held = holdings(&[(ASH_SYSTEMS_BP, 1)], &[]);
        let prices = |name: &str| (name == "Ash Prime Set").then_some(120);
        let items = foundry_items(&catalog(), &held, &prices);
        assert_eq!(item(&items, ASH).pieces_platinum, None);
    }

    #[test]
    fn an_ingredient_alone_starts_nothing_and_counts_as_a_piece_once_started() {
        let catalog = catalog();
        let only_bronco = holdings(&[(BRONCO, 2)], &[]);
        assert!(foundry_items(&catalog, &only_bronco, &no_prices).is_empty());

        let started = holdings(
            &[
                (BRONCO, 1),
                ("/Lotus/Types/Recipes/Weapons/AkbroncoPrimeBlueprint", 1),
            ],
            &[],
        );
        let items = foundry_items(&catalog, &started, &no_prices);
        let akbronco = item(&items, "/Lotus/Weapons/Tenno/Pistols/AkBroncoPrime");
        assert_eq!(akbronco.missing, 2, "the Link and the second Bronco Prime");
        assert_eq!(akbronco.stage, FoundryStage::Almost);
    }

    #[test]
    fn the_view_says_what_it_waits_for_before_listing_anything() {
        let mut core = AppCore::in_memory().unwrap();
        assert_eq!(
            core.foundry_view().unwrap().status,
            FoundryStatus::NoCatalog
        );
        core.set_mastery_catalog(std::sync::Arc::new(catalog()));
        assert_eq!(
            core.foundry_view().unwrap().status,
            FoundryStatus::NoInventory
        );
        core.load_fake_session().unwrap();
        assert_eq!(core.foundry_view().unwrap().status, FoundryStatus::Ready);
    }
}
