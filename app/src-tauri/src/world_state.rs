//! The Dashboard's world state: asked for by the page while it is on screen, never in the
//! background, and kept a minute so the page's own minute poll and a quick revisit cost nothing.
//! A failed fetch answers with the last state read, marked stale with its age. The Farm page reads
//! that last copy for its bounty tiers and never downloads.

use std::{
    sync::{Arc, Mutex},
    time::{SystemTime, UNIX_EPOCH},
};

use serde::Serialize;
use tauri::State;
use warframe_acquisition::{
    Bounty, WorldNames, WorldNamesCache, WorldState, WorldStateHttp, WorldView,
};

use crate::SharedRuntime;

const TTL_MS: u64 = 60_000;
const UNREACHABLE: &str = "The game's world state could not be reached";
const STATE_UNAVAILABLE: &str = "application state is unavailable";

#[derive(Clone, Default)]
pub struct WorldCache(Arc<Mutex<Cached>>);

#[derive(Default)]
struct Cached {
    /// One client for the session, so each minute's request reuses its connection.
    http: Option<WorldStateHttp>,
    /// Loaded once a session, from disk or WFCD; empty when neither answered, so nodes show as
    /// codes until the next launch rather than costing three failing downloads a minute.
    names: Option<WorldNames>,
    last: Option<Fetched>,
}

struct Fetched {
    unix_ms: u64,
    state: WorldState,
}

#[derive(Serialize)]
pub struct WorldAnswer {
    #[serde(flatten)]
    view: WorldView,
    /// Unix milliseconds: when the state shown was downloaded.
    fetched_at: u64,
    /// The download just attempted failed; this is the last one that did not.
    stale: bool,
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |since| since.as_millis() as u64)
}

fn answer(fetched: &Fetched, stale: bool) -> WorldAnswer {
    WorldAnswer {
        view: fetched.state.view(now_ms()),
        fetched_at: fetched.unix_ms,
        stale,
    }
}

fn fetch(shared: &SharedRuntime, cached: &mut Cached) -> Option<Fetched> {
    if cached.http.is_none() {
        cached.http = WorldStateHttp::new();
    }
    let Cached { http, names, .. } = cached;
    let http = http.as_ref()?;
    let bytes = http.world_state()?;
    let unix_ms = now_ms();
    if names.is_none() {
        let app_data = shared.lock().ok()?.app_data.clone();
        *names = Some(
            WorldNamesCache::new(app_data.join("catalog")).load(|| http.names(), unix_ms / 1000),
        );
    }
    let state = WorldState::parse(&bytes, names.as_ref()?)?;
    Some(Fetched { unix_ms, state })
}

/// The world now: the copy kept under a minute, else a fresh download, else the last one, stale.
fn read(shared: &SharedRuntime, cache: &WorldCache) -> Result<WorldAnswer, String> {
    // Held across the download, so two quick asks share one request.
    let mut cached = cache.0.lock().map_err(|_| STATE_UNAVAILABLE)?;
    if let Some(last) = &cached.last
        && now_ms().saturating_sub(last.unix_ms) < TTL_MS
    {
        return Ok(answer(last, false));
    }
    match fetch(shared, &mut cached) {
        Some(fresh) => {
            let fresh = cached.last.insert(fresh);
            Ok(answer(fresh, false))
        }
        None => cached
            .last
            .as_ref()
            .map(|last| answer(last, true))
            .ok_or_else(|| UNREACHABLE.to_owned()),
    }
}

/// The bounty tiers running now, for the Farm page, from the last state the Dashboard read, of any
/// age: a document lists the running cycle and the next, so one read holds for hours. Never
/// downloads; `None` while the Dashboard has read nothing, or what it read has run out.
pub fn running_bounties(cache: &WorldCache) -> Option<Vec<Bounty>> {
    let cached = cache.0.lock().ok()?;
    let bounties = cached.last.as_ref()?.state.bounties(now_ms());
    (!bounties.is_empty()).then_some(bounties)
}

#[tauri::command]
pub async fn get_world_state(
    runtime: State<'_, SharedRuntime>,
    cache: State<'_, WorldCache>,
) -> Result<WorldAnswer, String> {
    let shared = Arc::clone(runtime.inner());
    let cache = cache.inner().clone();
    tauri::async_runtime::spawn_blocking(move || read(&shared, &cache))
        .await
        .map_err(|_| "world state task failed".to_owned())?
}
