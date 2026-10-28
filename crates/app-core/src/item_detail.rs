//! The item sheet: what the catalogue already in memory says about one item, joined with what the
//! collection holds of its recipe. Nothing here fetches; an item the catalogue does not describe
//! gets a sheet with its art and nothing invented around it.

use serde::Serialize;
use warframe_acquisition::{
    Ability, CatalogIndex, DropSource, Holdings, Introduced, ItemFacts, StatValue,
};
use warframe_domain::{Category, InventoryEntry};

const WFCD_IMAGE_BASE: &str =
    "https://raw.githubusercontent.com/WFCD/warframe-items/master/data/img/";
/// The wiki redirects this to the file itself, scaled to about twice the sheet's art at its widest.
const WIKI_IMAGE_BASE: &str = "https://wiki.warframe.com/w/Special:FilePath/";
const WIKI_IMAGE_WIDTH: u32 = 600;

/// WFCD's small icon for this art.
pub(crate) fn wfcd_image_url(image_name: &str) -> String {
    format!("{WFCD_IMAGE_BASE}{image_name}")
}

/// The art a card draws for this entry. Every blueprint looks the same in game, so one the
/// catalogue has no art for takes WFCD's generic blueprint rather than no art at all.
pub(crate) fn entry_image_name(entry: &InventoryEntry) -> Option<&str> {
    entry
        .item
        .image_name
        .as_deref()
        .or((entry.item.category == Category::Blueprint).then_some("blueprint.png"))
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct ItemDetailView {
    /// The wiki's render of the whole model, where the wiki has one under this name.
    #[serde(skip_serializing_if = "Option::is_none")]
    wiki_image_url: Option<String>,
    /// WFCD's icon: what to draw when the wiki has nothing under the name.
    #[serde(skip_serializing_if = "Option::is_none")]
    image_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    mastery_req: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    vaulted: Option<bool>,
    prime: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    introduced: Option<Introduced>,
    #[serde(skip_serializing_if = "Option::is_none")]
    wiki_url: Option<String>,
    /// The English name Overframe files this item's builds under; absent for what has none.
    #[serde(skip_serializing_if = "Option::is_none")]
    builds_for: Option<String>,
    abilities: Vec<Ability>,
    stats: Vec<StatValue>,
    components: Vec<ComponentView>,
    drops: Vec<DropSource>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub(crate) struct ComponentView {
    name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    image_url: Option<String>,
    count: u32,
    /// Copies the collection holds, a part's blueprint and the built part together. Absent when
    /// there is no collection to count from, which is not the same as none.
    #[serde(skip_serializing_if = "Option::is_none")]
    held: Option<u32>,
    drops: Vec<DropSource>,
}

/// What Overframe lists builds for: equipment, never parts, mods, relics or resources.
fn has_builds(category: Category) -> bool {
    matches!(
        category,
        Category::Frame | Category::Weapon | Category::Companion
    )
}

/// The name to ask Overframe for this item's builds by. A Prime part or blueprint is asked for by
/// the item its recipe builds; anything else by its own name, when its category has builds.
pub(crate) fn builds_name(
    path: &str,
    entry: Option<&InventoryEntry>,
    catalog: Option<&CatalogIndex>,
) -> Option<String> {
    if let Some(catalog) = catalog
        && let Some((recipe, _)) = catalog.part_parent(path)
    {
        let parent = catalog.resolve(&recipe.parent)?;
        return parent
            .category()
            .is_some_and(has_builds)
            .then(|| recipe.parent_name.clone());
    }
    // The saved row, as enrichment named it; the catalogue only for a Mastery row never held.
    // Companion never loads the catalogue, so this is all it has.
    let (name, category) = match entry {
        Some(entry) => (entry.item.name.as_str(), entry.item.category),
        None => {
            let metadata = catalog?.resolve(path)?;
            (metadata.name(), metadata.category()?)
        }
    };
    has_builds(category).then(|| name.to_owned())
}

/// The sheet for the item at `path`.
pub(crate) fn item_detail(
    path: &str,
    image_name: Option<&str>,
    builds_for: Option<String>,
    catalog: Option<&CatalogIndex>,
    holdings: Option<&Holdings>,
) -> ItemDetailView {
    let empty = ItemFacts::default();
    let facts = catalog
        .and_then(|catalog| catalog.facts(path))
        .unwrap_or(&empty);
    let components = facts
        .components
        .iter()
        .map(|slot| ComponentView {
            name: slot.name.clone(),
            image_url: slot.image_name.as_deref().map(wfcd_image_url),
            count: slot.count,
            held: holdings.map(|holdings| holdings.slot_quantity(&slot.path)),
            drops: catalog
                .and_then(|catalog| catalog.facts(&slot.path))
                .map(|facts| facts.drops.clone())
                .unwrap_or_default(),
        })
        .collect();
    ItemDetailView {
        wiki_image_url: image_name
            .map(|name| format!("{WIKI_IMAGE_BASE}{name}?width={WIKI_IMAGE_WIDTH}")),
        image_url: image_name.map(wfcd_image_url),
        description: facts.description.clone(),
        mastery_req: facts.mastery_req,
        vaulted: facts.vaulted,
        prime: facts.prime,
        introduced: facts.introduced.clone(),
        wiki_url: facts.wiki_url.clone(),
        builds_for,
        abilities: facts.abilities.clone(),
        stats: facts.stats.clone(),
        components,
        drops: facts.drops.clone(),
    }
}
