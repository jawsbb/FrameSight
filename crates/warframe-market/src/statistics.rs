//! What one item traded at, day by day, over the last ninety days: the Farm page's curve.
//!
//! `GET /v1/items/{slug}/statistics` is the only public history warframe.market serves. It answers
//! with a 48-hour and a 90-day window of completed trades, split by rank and subtype; the curve
//! reads the 90-day one at rank 0, the copy a farmer picks up. One request per item the player
//! looks at, never a sweep.

use serde::{Deserialize, Serialize};

use crate::{API_V1, MarketError, MarketRequest, MarketTransport, Method, valid_slug};

/// The cap on one response, generous against the measured 130 KB for a ranked mod.
pub const MAX_STATISTICS_BYTES: usize = 1024 * 1024;

/// One day of completed trades.
#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct DayTrades {
    /// "2026-10-27".
    pub date: String,
    pub median: f64,
    pub volume: u32,
}

#[derive(Deserialize)]
struct Response {
    payload: Payload,
}

#[derive(Deserialize)]
struct Payload {
    statistics_closed: Windows,
}

#[derive(Deserialize)]
struct Windows {
    #[serde(rename = "90days", default)]
    ninety_days: Vec<Day>,
}

#[derive(Deserialize)]
struct Day {
    datetime: String,
    median: f64,
    #[serde(default)]
    volume: u32,
    #[serde(default)]
    mod_rank: Option<u32>,
    #[serde(default)]
    subtype: Option<String>,
}

/// The days at rank 0 (or no rank) and at `subtype` (or none), oldest first.
pub fn parse_statistics(body: &[u8], subtype: Option<&str>) -> Result<Vec<DayTrades>, MarketError> {
    let response = serde_json::from_slice::<Response>(body).map_err(|_| MarketError::Malformed)?;
    let mut days = response
        .payload
        .statistics_closed
        .ninety_days
        .into_iter()
        .filter(|day| day.mod_rank.unwrap_or(0) == 0)
        .filter(|day| subtype.is_none_or(|wanted| day.subtype.as_deref() == Some(wanted)))
        .filter(|day| day.median.is_finite() && day.median > 0.0)
        .filter_map(|day| {
            Some(DayTrades {
                date: day.datetime.get(..10)?.to_owned(),
                median: day.median,
                volume: day.volume,
            })
        })
        .collect::<Vec<_>>();
    days.sort_by(|left, right| left.date.cmp(&right.date));
    // A listing with variants the request did not name (a fish's sizes) reports each on its own
    // row; the busiest stands for the day.
    days.dedup_by(|later, kept| {
        later.date == kept.date && {
            if later.volume > kept.volume {
                std::mem::swap(later, kept);
            }
            true
        }
    });
    Ok(days)
}

/// One item's 90-day curve. `slug` must come from the item table.
pub fn item_statistics(
    transport: &dyn MarketTransport,
    slug: &str,
    subtype: Option<&str>,
) -> Result<Vec<DayTrades>, MarketError> {
    if !valid_slug(slug) {
        return Err(MarketError::Malformed);
    }
    let response = transport.send(MarketRequest {
        method: Method::Get,
        url: format!("{API_V1}/items/{slug}/statistics"),
        token: None,
        body: None,
    })?;
    match response.status {
        200..=299 if response.body.len() <= MAX_STATISTICS_BYTES => {
            parse_statistics(&response.body, subtype)
        }
        200..=299 => Err(MarketError::Malformed),
        429 => Err(MarketError::RateLimited),
        _ => Err(MarketError::Unreachable),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const BODY: &str = r#"{"payload":{"statistics_closed":{"48hours":[],"90days":[
        {"datetime":"2026-10-27T00:00:00.000+00:00","volume":4,"median":2.0,"mod_rank":0},
        {"datetime":"2026-10-26T00:00:00.000+00:00","volume":9,"median":30.0,"mod_rank":10},
        {"datetime":"2026-10-26T00:00:00.000+00:00","volume":7,"median":3.0,"mod_rank":0}
    ]},"statistics_live":{}}}"#;

    #[test]
    fn the_curve_is_rank_zero_oldest_first() {
        let days = parse_statistics(BODY.as_bytes(), None).expect("parses");
        assert_eq!(
            days,
            [
                DayTrades {
                    date: "2026-10-26".to_owned(),
                    median: 3.0,
                    volume: 7
                },
                DayTrades {
                    date: "2026-10-27".to_owned(),
                    median: 2.0,
                    volume: 4
                },
            ]
        );
    }

    #[test]
    fn a_relic_curve_is_its_refinement_and_a_day_counts_once() {
        let body = r#"{"payload":{"statistics_closed":{"90days":[
            {"datetime":"2026-10-18T00:00:00.000+00:00","volume":1,"median":15.0,"subtype":"intact"},
            {"datetime":"2026-10-18T00:00:00.000+00:00","volume":3,"median":40.0,"subtype":"radiant"},
            {"datetime":"2026-10-19T00:00:00.000+00:00","volume":1,"median":4.0,"subtype":"small"},
            {"datetime":"2026-10-19T00:00:00.000+00:00","volume":5,"median":6.0,"subtype":"large"}
        ]}}}"#;
        let radiant = parse_statistics(body.as_bytes(), Some("radiant")).unwrap();
        assert_eq!(radiant.len(), 1);
        assert_eq!(radiant[0].median, 40.0);
        let any = parse_statistics(body.as_bytes(), None).unwrap();
        assert_eq!(
            any.iter().map(|day| day.median).collect::<Vec<_>>(),
            [40.0, 6.0]
        );
        assert_eq!(parse_statistics(b"{}", None), Err(MarketError::Malformed));
    }
}
