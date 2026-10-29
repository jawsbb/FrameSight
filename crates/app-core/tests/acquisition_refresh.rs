use app_core::{AcquisitionPort, AppCore, HealthState, InventoryRefreshOutcome};
use local_store::{SnapshotInstant, SnapshotMeta};
use warframe_acquisition::{
    AcquisitionError, AcquisitionFailure, AcquisitionHealth, AcquisitionResult, CatalogLoadSource,
    GameProcess,
};
use warframe_domain::{CatalogItem, Category, InventoryEntry, InventorySnapshot, ItemId};

fn snapshot(id: &str) -> InventorySnapshot {
    InventorySnapshot::coherent(vec![InventoryEntry::new(
        CatalogItem::new(ItemId::new(id).unwrap(), id, Category::Weapon).unwrap(),
        1,
    )])
    .unwrap()
}

#[test]
fn failed_refresh_preserves_the_prior_persisted_snapshot_and_records_stage_health() {
    let mut core = AppCore::in_memory().unwrap();
    core.apply_inventory_snapshot(snapshot("prior"), SnapshotMeta::fake("old").unwrap())
        .unwrap();
    let failure = AcquisitionFailure::for_test(AcquisitionError::AuthorizationNotFound);

    let view = core.finish_inventory_refresh(Err(failure), None).unwrap();

    assert_eq!(view.collection().items()[0].id(), "prior");
    assert_eq!(view.health().game_reader().state(), HealthState::Degraded);
    assert!(
        view.health()
            .game_reader()
            .message()
            .contains("authorization")
    );
    assert_eq!(view.health().acquisition_stages().len(), 1);
    assert!(!view.health().game_reader().message().contains("accountId"));
}

#[test]
fn successful_refresh_atomically_replaces_snapshot_and_reports_catalog_freshness() {
    let mut core = AppCore::in_memory().unwrap();
    core.apply_inventory_snapshot(snapshot("prior"), SnapshotMeta::fake("old").unwrap())
        .unwrap();
    let result = AcquisitionResult::new(snapshot("new"), AcquisitionHealth::successful()).unwrap();
    let meta = SnapshotMeta::new(
        SnapshotInstant::parse_rfc_3339("2026-07-24T20:00:00Z").unwrap(),
        "unknown".into(),
        "warframe-memory".into(),
    )
    .unwrap();

    let view = core
        .finish_inventory_refresh(
            Ok((result, meta)),
            Some((CatalogLoadSource::StaleCache, 123)),
        )
        .unwrap();

    assert_eq!(view.collection().items()[0].id(), "new");
    assert_eq!(view.health().game_reader().state(), HealthState::Ready);
    assert_eq!(view.health().catalog().state(), HealthState::Degraded);
    assert!(view.health().catalog().message().contains("cached"));
    assert_eq!(view.health().acquisition_stages().len(), 5);
}

struct FakePort(InventoryRefreshOutcome);
impl AcquisitionPort for FakePort {
    fn refresh(&self) -> InventoryRefreshOutcome {
        self.0.clone()
    }
}

#[test]
fn acquisition_port_is_the_single_refresh_seam_and_failure_keeps_last_success() {
    let mut core = AppCore::in_memory().unwrap();
    let meta = SnapshotMeta::new(
        SnapshotInstant::from_unix_seconds(1_000_000_123).unwrap(),
        "build".into(),
        "warframe-memory".into(),
    )
    .unwrap();
    let result =
        AcquisitionResult::new(snapshot("prior"), AcquisitionHealth::successful()).unwrap();
    core.refresh_from(&FakePort(InventoryRefreshOutcome::success(
        result,
        meta,
        CatalogLoadSource::Network,
        100,
    )))
    .unwrap();

    let failed = FakePort(InventoryRefreshOutcome::acquisition_failed(
        AcquisitionFailure::from_error(AcquisitionError::GameNotRunning),
    ));
    let view = core.refresh_from(&failed).unwrap();

    assert_eq!(view.collection().items()[0].id(), "prior");
    assert_eq!(view.health().game_reader().state(), HealthState::Idle);
    assert_eq!(
        view.health().game_reader().last_success(),
        Some("1000000123")
    );
}

#[test]
fn a_transient_game_discovery_stage_clears_once_the_process_reconnects() {
    let mut core = AppCore::in_memory().unwrap();
    let failure = AcquisitionFailure::for_test(AcquisitionError::GameNotRunning);
    core.finish_inventory_refresh(Err(failure), None).unwrap();
    assert_eq!(
        core.current_view()
            .unwrap()
            .health()
            .acquisition_stages()
            .len(),
        1
    );

    let view = core.record_game_process_ready().unwrap();

    assert!(
        view.health().acquisition_stages().is_empty(),
        "a stale 'game not found' stage from before the process was seen again must not linger"
    );
}

#[test]
fn an_unrelated_stage_failure_survives_the_process_reconnecting() {
    let mut core = AppCore::in_memory().unwrap();
    let failure = AcquisitionFailure::for_test(AcquisitionError::AuthorizationNotFound);
    core.finish_inventory_refresh(Err(failure), None).unwrap();

    let view = core.record_game_process_ready().unwrap();

    assert_eq!(
        view.health().acquisition_stages().len(),
        1,
        "authorization was never found for reasons unrelated to the process reappearing"
    );
}

#[test]
fn catalog_port_failure_is_published_without_replacing_collection() {
    let mut core = AppCore::in_memory().unwrap();
    core.apply_inventory_snapshot(snapshot("prior"), SnapshotMeta::fake("old").unwrap())
        .unwrap();
    let view = core
        .refresh_from(&FakePort(InventoryRefreshOutcome::catalog_failed()))
        .unwrap();
    assert_eq!(view.collection().items()[0].id(), "prior");
    assert_eq!(view.health().catalog().state(), HealthState::Failed);
}

#[test]
fn log_monitor_failure_never_overwrites_successful_acquisition_health() {
    let mut core = AppCore::in_memory().unwrap();
    let meta = SnapshotMeta::new(
        SnapshotInstant::from_unix_seconds(1_000_000_123).unwrap(),
        "build".into(),
        "warframe-memory".into(),
    )
    .unwrap();
    let result =
        AcquisitionResult::new(snapshot("owned"), AcquisitionHealth::successful()).unwrap();
    core.refresh_from(&FakePort(InventoryRefreshOutcome::success(
        result,
        meta,
        CatalogLoadSource::Network,
        100,
    )))
    .unwrap();

    let view = core
        .record_log_monitor_failure("EE.log could not be read")
        .unwrap();

    assert_eq!(view.health().game_reader().state(), HealthState::Ready);
    assert_eq!(view.health().acquisition_stages().len(), 5);
    assert!(
        view.health()
            .acquisition_stages()
            .iter()
            .all(|stage| stage.state() == HealthState::Ready)
    );
    assert_eq!(view.health().log_monitor().state(), HealthState::Failed);
    assert!(view.health().log_monitor().message().contains("EE.log"));
}

#[test]
fn catalog_without_a_load_keeps_the_prior_fetch_stamp() {
    let mut core = AppCore::in_memory().unwrap();
    let meta = SnapshotMeta::new(
        SnapshotInstant::from_unix_seconds(1_000_000_123).unwrap(),
        "build".into(),
        "warframe-memory".into(),
    )
    .unwrap();
    let result =
        AcquisitionResult::new(snapshot("prior"), AcquisitionHealth::successful()).unwrap();
    let view = core
        .finish_inventory_refresh(Ok((result, meta)), Some((CatalogLoadSource::Network, 100)))
        .unwrap();
    assert_eq!(view.health().catalog().last_success(), Some("100"));

    let result =
        AcquisitionResult::new(snapshot("prior"), AcquisitionHealth::successful()).unwrap();
    let meta = SnapshotMeta::new(
        SnapshotInstant::from_unix_seconds(1_000_000_123).unwrap(),
        "build".into(),
        "warframe-memory".into(),
    )
    .unwrap();
    let view = core
        .finish_inventory_refresh(Ok((result, meta)), None)
        .unwrap();
    assert_eq!(view.health().catalog().state(), HealthState::Degraded);
    assert!(
        view.health().catalog().message().contains("unavailable"),
        "no catalog load reads as unavailable"
    );
    assert_eq!(
        view.health().catalog().last_success(),
        Some("100"),
        "a refresh with no catalog keeps the last fetched stamp"
    );
}

/// A game run's gains are what its snapshots hold beyond what the previous run left, so they
/// survive the run's own later snapshots and give way when the next run starts.
#[test]
fn a_game_session_counts_what_it_added_since_the_last_one() {
    let mut core = AppCore::in_memory().unwrap();
    let refresh = |core: &mut AppCore, pid: u32, at: i64, forma: u32| {
        let snapshot = InventorySnapshot::coherent(vec![
            InventoryEntry::new(
                CatalogItem::new(ItemId::new("forma").unwrap(), "Forma", Category::Resource)
                    .unwrap(),
                forma,
            ),
            InventoryEntry::new(
                CatalogItem::new(ItemId::new("braton").unwrap(), "Braton", Category::Weapon)
                    .unwrap(),
                1,
            ),
        ])
        .unwrap();
        let result = AcquisitionResult::new(snapshot, AcquisitionHealth::successful())
            .unwrap()
            .with_process(GameProcess::new(pid));
        let meta = SnapshotMeta::new(
            SnapshotInstant::from_unix_seconds(at).unwrap(),
            "build".into(),
            "warframe-memory".into(),
        )
        .unwrap();
        core.finish_inventory_refresh(Ok((result, meta)), None)
            .unwrap()
    };
    let gained = |view: &app_core::AppView, id: &str| {
        view.collection()
            .items()
            .iter()
            .find(|item| item.id() == id)
            .and_then(|item| item.gained())
    };

    refresh(&mut core, 41, 1_800_000_000, 2);
    let view = refresh(&mut core, 42, 1_800_090_000, 4);
    assert_eq!(gained(&view, "forma"), Some(2));
    assert_eq!(gained(&view, "braton"), None);

    let view = refresh(&mut core, 42, 1_800_090_600, 5);
    assert_eq!(gained(&view, "forma"), Some(3));

    let view = refresh(&mut core, 43, 1_800_200_000, 5);
    assert_eq!(gained(&view, "forma"), None);
}
