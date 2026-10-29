use std::cell::Cell;

use tempfile::tempdir;
use warframe_acquisition::{
    Bounty, Cycle, CycleState, Era, Hub, Node, Place, Rotation, WorldNames, WorldNamesCache,
    WorldState,
};

/// `api.warframe.com/cdn/worldState.php` as served at 2026-10-28T17:01:55Z.
const WORLD: &[u8] = include_bytes!("fixtures/world-state-2026-10-28.json");
/// WFCD's tables the same day; `sortieData.json` cut down to the `bosses` it is read for.
const SOL_NODES: &[u8] = include_bytes!("fixtures/wfcd-sol-nodes.json");
const MISSION_TYPES: &[u8] = include_bytes!("fixtures/wfcd-mission-types.json");
const SORTIE_BOSSES: &[u8] = include_bytes!("fixtures/wfcd-sortie-bosses.json");
/// The document's own `Time`, in milliseconds.
const NOW: u64 = 1_793_206_915_000;
/// When the Ostron bounty cycle running at `NOW` ends, and the one after it.
const CETUS_END: u64 = 1_793_207_482_819;
const NEXT_CETUS_END: u64 = 1_793_216_481_693;

fn names() -> WorldNames {
    WorldNames::from_wfcd(SOL_NODES, MISSION_TYPES, SORTIE_BOSSES).unwrap()
}

fn world() -> WorldState {
    WorldState::parse(WORLD, &names()).unwrap()
}

fn node(name: &str, planet: &str, enemy: &str) -> Node {
    Node {
        name: name.to_owned(),
        planet: Some(planet.to_owned()),
        enemy: Some(enemy.to_owned()),
    }
}

fn cycle(place: Place, state: CycleState, expiry: u64) -> Cycle {
    Cycle {
        place,
        state,
        expiry,
    }
}

#[test]
fn lists_open_fissures_soonest_first_with_steel_path_marked() {
    let view = world().view(NOW);
    assert_eq!(view.fissures.len(), 23);
    assert_eq!(view.fissures.iter().filter(|f| f.steel_path).count(), 11);
    let first = &view.fissures[0];
    assert_eq!(first.id, "6ae21b12468a9e8093cfc186");
    assert_eq!(first.era, Era::Meso);
    assert_eq!(first.mission_type, "Mobile Defense");
    assert_eq!(first.node, node("Keeler", "Saturn", "Grineer"));
    assert_eq!(first.expiry, 1_793_207_150_327);
    assert!(view.fissures.windows(2).all(|w| w[0].expiry <= w[1].expiry));
    // Every tier of the day is known, Omnia included.
    assert!(view.fissures.iter().any(|f| f.era == Era::Omnia));
    assert!(view.fissures.iter().any(|f| f.era == Era::Requiem));
}

#[test]
fn drops_a_fissure_once_it_has_expired() {
    let view = world().view(1_793_207_150_327);
    assert_eq!(view.fissures.len(), 22);
    assert!(
        view.fissures
            .iter()
            .all(|f| f.id != "6ae21b12468a9e8093cfc186")
    );
}

#[test]
fn names_void_storms_by_their_node_mission() {
    let storms = world().view(NOW).storms;
    assert_eq!(storms.len(), 6);
    assert_eq!(storms[0].era, Era::Lith);
    assert_eq!(storms[0].mission_type, "Skirmish");
    assert_eq!(storms[0].node, node("Ogal Cluster", "Earth", "Grineer"));
    assert!(storms.iter().all(|storm| !storm.steel_path));
    assert!(storms.iter().any(|storm| storm.mission_type == "Spy"));
}

#[test]
fn reads_cetus_from_the_bounty_cycle_and_computes_earth_and_vallis() {
    assert_eq!(
        world().view(NOW).cycles,
        [
            // 17:01:55 lies in [16:00, 20:00), an even four-hour state from the epoch.
            cycle(Place::Earth, CycleState::Day, 1_793_217_600_000),
            // The bounty cycle ends at 17:11:22.819; its last 50 minutes are night.
            cycle(Place::Cetus, CycleState::Night, CETUS_END),
            cycle(Place::Vallis, CycleState::Cold, 1_793_207_208_000),
            cycle(Place::Cambion, CycleState::Vome, CETUS_END),
        ]
    );
}

#[test]
fn moves_cetus_to_the_next_listed_bounty_cycle() {
    let cycles = world().view(CETUS_END + 1_000).cycles;
    let night = NEXT_CETUS_END - 50 * 60 * 1000;
    assert_eq!(cycles[1], cycle(Place::Cetus, CycleState::Day, night));
    assert_eq!(cycles[3], cycle(Place::Cambion, CycleState::Fass, night));
}

#[test]
fn leaves_cetus_and_cambion_out_once_every_listed_bounty_cycle_is_over() {
    let places: Vec<Place> = world()
        .view(NEXT_CETUS_END)
        .cycles
        .into_iter()
        .map(|cycle| cycle.place)
        .collect();
    assert_eq!(places, [Place::Earth, Place::Vallis]);
}

fn tiers(bounties: &[Bounty], hub: Hub) -> Vec<(bool, u32, u32, Rotation)> {
    bounties
        .iter()
        .filter(|bounty| bounty.tier.hub == hub)
        .map(|Bounty { tier, rotation, .. }| {
            (tier.vault, tier.min_level, tier.max_level, *rotation)
        })
        .collect()
}

#[test]
fn reads_each_bounty_tier_rotation_off_its_reward_table() {
    let bounties = world().view(NOW).bounties;
    assert!(bounties.iter().all(|bounty| bounty.expiry == CETUS_END));
    use Rotation::{A, B, C};
    assert_eq!(
        tiers(&bounties, Hub::Cetus),
        [
            (false, 5, 15, C),
            (false, 10, 30, C),
            (false, 20, 40, C),
            (false, 30, 50, C),
            (false, 40, 60, C),
            (false, 50, 70, C),
            (false, 100, 100, C),
        ]
    );
    // The Cambion Drift's tiers do not share one letter, whatever the wiki says.
    assert_eq!(
        tiers(&bounties, Hub::Cambion),
        [
            (false, 5, 15, C),
            (false, 15, 25, C),
            (false, 25, 30, A),
            (false, 30, 40, B),
            (false, 40, 60, A),
            (false, 100, 100, A),
            (true, 30, 40, B),
            (true, 40, 50, B),
            (true, 50, 60, B),
        ]
    );
}

#[test]
fn moves_the_bounties_to_the_next_listed_cycle() {
    let bounties = world().view(CETUS_END).bounties;
    assert!(
        bounties
            .iter()
            .all(|bounty| bounty.expiry == NEXT_CETUS_END)
    );
    assert!(
        tiers(&bounties, Hub::Vallis)
            .iter()
            .all(|tier| tier.3 == Rotation::A)
    );
    assert!(world().view(NEXT_CETUS_END).bounties.is_empty());
}

#[test]
fn computes_earth_and_vallis_at_known_instants() {
    // 2026-10-28T20:00:00Z starts an odd state: night until midnight.
    let cycles = world().view(1_793_217_600_000).cycles;
    assert_eq!(
        cycles[0],
        cycle(Place::Earth, CycleState::Night, 1_793_232_000_000)
    );
    // WFCD's anchor, 2026-02-04T19:46:48Z, opens a warm phase of 6m40s, then 20 minutes cold.
    let anchor = 1_770_234_408_000;
    let vallis = |now| {
        let cycles = world().view(now).cycles;
        cycles
            .into_iter()
            .find(|c| c.place == Place::Vallis)
            .unwrap()
    };
    assert_eq!(
        vallis(anchor),
        cycle(Place::Vallis, CycleState::Warm, anchor + 400_000)
    );
    assert_eq!(
        vallis(anchor + 400_000),
        cycle(Place::Vallis, CycleState::Cold, anchor + 1_600_000)
    );
    // Before the anchor the loop runs backwards the same way.
    assert_eq!(
        vallis(anchor - 1),
        cycle(Place::Vallis, CycleState::Cold, anchor)
    );
}

#[test]
fn names_the_sortie_the_archon_hunt_and_baro() {
    let view = world().view(NOW);
    let sortie = view.sortie.unwrap();
    assert_eq!(
        (sortie.boss.as_str(), sortie.faction.as_deref()),
        ("Nef Anyo", Some("Corpus"))
    );
    let missions: Vec<(&str, &str)> = sortie
        .missions
        .iter()
        .map(|m| (m.mission_type.as_str(), m.node.name.as_str()))
        .collect();
    assert_eq!(
        missions,
        [
            ("Survival", "Tycho"),
            ("Spy", "Hydra"),
            ("Assassination", "Iliad")
        ]
    );
    assert_eq!(sortie.expiry, 1_793_289_600_000);

    let hunt = view.archon_hunt.unwrap();
    assert_eq!(
        (hunt.boss.as_str(), hunt.faction.as_deref()),
        ("Archon Nira", Some("Narmer"))
    );
    let missions: Vec<(&str, &str)> = hunt
        .missions
        .iter()
        .map(|m| (m.mission_type.as_str(), m.node.name.as_str()))
        .collect();
    assert_eq!(
        missions,
        [
            ("Rescue", "Carme"),
            ("Interception", "Metis"),
            ("Assassination", "Themisto")
        ]
    );

    let baro = view.baro.unwrap();
    assert_eq!(
        (baro.activation, baro.expiry),
        (1_793_365_200_000, 1_793_538_000_000)
    );
    assert_eq!(baro.relay, node("Larunda Relay", "Mercury", "Grineer"));
}

#[test]
fn shows_an_unknown_node_mission_and_boss_by_its_code() {
    let document = br#"{"Time":1,
        "ActiveMissions":[{"_id":{"$oid":"a"},"Activation":{"$date":{"$numberLong":"0"}},"Expiry":{"$date":{"$numberLong":"9000"}},"Node":"SolNode99999","MissionType":"MT_NEW","Modifier":"VoidT2","Hard":true},
                          {"_id":{"$oid":"b"},"Activation":{"$date":{"$numberLong":"0"}},"Expiry":{"$date":{"$numberLong":"9000"}},"Node":"SolNode1","MissionType":"MT_CAPTURE","Modifier":"VoidT9"}],
        "Sorties":[{"Activation":{"$date":{"$numberLong":"0"}},"Expiry":{"$date":{"$numberLong":"9000"}},"Boss":"SORTIE_BOSS_NEW","Variants":[]}]}"#;
    let view = WorldState::parse(document, &names()).unwrap().view(1_000);
    // A tier the app does not know is left out rather than guessed.
    assert_eq!(view.fissures.len(), 1);
    let fissure = &view.fissures[0];
    assert_eq!(fissure.mission_type, "MT_NEW");
    assert_eq!(
        fissure.node,
        Node {
            name: "SolNode99999".to_owned(),
            planet: None,
            enemy: None
        }
    );
    assert!(fissure.steel_path);
    let sortie = view.sortie.unwrap();
    assert_eq!(
        (sortie.boss.as_str(), sortie.faction),
        ("SORTIE_BOSS_NEW", None)
    );

    // With no names at all, everything still reads, by code.
    let bare = WorldState::parse(WORLD, &WorldNames::default())
        .unwrap()
        .view(NOW);
    assert_eq!(bare.fissures[0].mission_type, "MT_MOBILE_DEFENSE");
    assert_eq!(bare.fissures[0].node.name, "SolNode93");
}

#[test]
fn refuses_a_document_that_is_not_a_world_state() {
    assert!(WorldState::parse(b"<html>maintenance</html>", &names()).is_none());
    assert!(WorldState::parse(br#"{"items":[]}"#, &names()).is_none());
}

#[test]
fn keeps_names_a_week_and_falls_back_to_the_stale_copy() {
    let dir = tempdir().unwrap();
    let cache = WorldNamesCache::new(dir.path());
    let calls = Cell::new(0);
    let fetch = |result: Option<WorldNames>| {
        let calls = &calls;
        move || {
            calls.set(calls.get() + 1);
            result
        }
    };
    let day = 24 * 60 * 60;

    assert!(cache.load(fetch(None), 0).is_empty());
    assert!(!cache.load(fetch(Some(names())), 0).is_empty());
    assert!(!cache.load(fetch(None), 6 * day).is_empty());
    assert_eq!(calls.get(), 2, "a cache under a week old is not refreshed");
    assert!(!cache.load(fetch(None), 8 * day).is_empty());
    assert_eq!(
        calls.get(),
        3,
        "a week-old cache is refreshed, and kept when that fails"
    );
}
