//! The best player builds Overframe lists for an item, read from the JSON its own pages use:
//! `overframe.gg/api/v1/builds/?item_name=…`. Undocumented; measured on 2026-10-28: the name is
//! the item's English name, any case; results come sorted by score, highest first; an item with
//! no builds (a part, a resource, an unknown name) answers `count: 0`.
//!
//! Overframe's `robots.txt` asks for `use=reference`, so only what points at a build is kept
//! (its title, author, score, Forma count, last update and address), never its mods: the player
//! opens the build on Overframe itself.

use std::time::Duration;

use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use url::Url;

use crate::catalog_cache::fetch_bounded;
use crate::collection_prices::USER_AGENT;

const BUILDS_URL: &str = "https://overframe.gg/api/v1/builds/";
const ORIGIN: &str = "https://overframe.gg";
/// The item sheet shows five; Overframe caps a page at 25 anyway.
const SHOWN: &str = "5";

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct Build {
    pub title: String,
    /// None for an account Overframe no longer names.
    pub author: Option<String>,
    pub score: i64,
    pub formas: u32,
    /// ISO 8601, as Overframe sends it.
    pub updated: String,
    /// The build's page on overframe.gg.
    pub url: String,
}

#[derive(Deserialize)]
struct Page {
    results: Vec<RawBuild>,
}

#[derive(Deserialize)]
struct RawBuild {
    title: String,
    author: Option<RawAuthor>,
    score: i64,
    formas: u32,
    updated: String,
    url: String,
}

#[derive(Deserialize)]
struct RawAuthor {
    username: String,
}

/// The builds on one page of the API, in its order. A build whose address is not an Overframe
/// build path is left out rather than linked to.
pub fn parse_builds(bytes: &[u8]) -> Option<Vec<Build>> {
    let page: Page = serde_json::from_slice(bytes).ok()?;
    Some(
        page.results
            .into_iter()
            .filter(|build| build.url.starts_with("/build/"))
            .map(|build| Build {
                title: build.title,
                author: build.author.map(|author| author.username),
                score: build.score,
                formas: build.formas,
                updated: build.updated,
                url: format!("{ORIGIN}{}", build.url),
            })
            .collect(),
    )
}

/// One client for the session, cheap to clone: clones share its connections.
#[derive(Clone)]
pub struct OverframeHttp {
    client: Client,
}

impl OverframeHttp {
    pub fn new() -> Option<Self> {
        Client::builder()
            .connect_timeout(Duration::from_secs(5))
            .timeout(Duration::from_secs(15))
            .user_agent(USER_AGENT)
            .build()
            .ok()
            .map(|client| Self { client })
    }

    /// The best builds for the item Overframe knows by this English name. None when Overframe
    /// could not be reached or answered something else than its builds.
    pub fn builds(&self, item_name: &str) -> Option<Vec<Build>> {
        let url = Url::parse_with_params(BUILDS_URL, [("item_name", item_name), ("limit", SHOWN)])
            .ok()?;
        parse_builds(&fetch_bounded(&self.client, url.as_str()).ok()?)
    }
}
