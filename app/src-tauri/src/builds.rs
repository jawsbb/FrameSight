//! The item sheet's Overframe builds: asked for when a sheet opens on an item that has builds, and
//! kept for the session by name, so walking back over an item costs nothing. A failed fetch is
//! not kept: the next opening asks again.

use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
};

use tauri::State;
use warframe_acquisition::{Build, OverframeHttp};

const UNREACHABLE: &str = "Overframe could not be reached";
const STATE_UNAVAILABLE: &str = "application state is unavailable";

#[derive(Clone, Default)]
pub struct BuildsCache(Arc<Mutex<Cached>>);

#[derive(Default)]
struct Cached {
    http: Option<OverframeHttp>,
    builds: HashMap<String, Vec<Build>>,
}

#[tauri::command]
pub async fn get_item_builds(
    cache: State<'_, BuildsCache>,
    item_name: String,
) -> Result<Vec<Build>, String> {
    let cache = cache.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        // Released over the download, so a slow answer for one item never holds up the next.
        let http = {
            let mut cached = cache.0.lock().map_err(|_| STATE_UNAVAILABLE)?;
            if let Some(builds) = cached.builds.get(&item_name) {
                return Ok(builds.clone());
            }
            if cached.http.is_none() {
                cached.http = OverframeHttp::new();
            }
            cached.http.clone().ok_or(UNREACHABLE)?
        };
        let builds = http.builds(&item_name).ok_or(UNREACHABLE)?;
        cache
            .0
            .lock()
            .map_err(|_| STATE_UNAVAILABLE)?
            .builds
            .insert(item_name, builds.clone());
        Ok(builds)
    })
    .await
    .map_err(|_| "builds task failed".to_owned())?
}
