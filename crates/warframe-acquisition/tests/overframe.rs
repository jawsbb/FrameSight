use warframe_acquisition::{Build, parse_builds};

/// `overframe.gg/api/v1/builds/?item_name=Nova%20Prime&limit=5` on 2026-10-28, cut to three.
const NOVA_PRIME: &[u8] = include_bytes!("fixtures/overframe-builds-nova-prime.json");

#[test]
fn builds_keep_overframe_order_and_point_at_overframe() {
    let builds = parse_builds(NOVA_PRIME).unwrap();

    assert_eq!(builds.len(), 3);
    assert_eq!(
        builds[0],
        Build {
            title: "Tanky Slow/Fast Nova".to_owned(),
            author: Some("Taurael".to_owned()),
            score: 1438,
            formas: 4,
            updated: "2025-10-26T13:37:55.082121Z".to_owned(),
            url: "https://overframe.gg/build/2646/nova-prime/tanky-slow-fast-nova/".to_owned(),
        }
    );
    let scores: Vec<i64> = builds.iter().map(|build| build.score).collect();
    assert_eq!(scores, [1438, 1173, 311]);
}

/// A part or a resource: Overframe answers, with nothing.
#[test]
fn an_item_without_builds_reads_as_none_found() {
    let empty = br#"{"count":0,"next":null,"previous":null,"results":[]}"#;

    assert_eq!(parse_builds(empty), Some(Vec::new()));
}

/// Only a build path is linked: anything else could send the player off Overframe.
#[test]
fn an_address_that_is_not_a_build_path_is_left_out() {
    let page = br#"{"results":[
      {"title":"Elsewhere","author":null,"score":1,"formas":0,"updated":"2026-01-01T00:00:00Z","url":"@example.com/build/1/"},
      {"title":"Kept","author":null,"score":1,"formas":0,"updated":"2026-01-01T00:00:00Z","url":"/build/1/nova/kept/"}
    ]}"#;

    let builds = parse_builds(page).unwrap();

    assert_eq!(builds.len(), 1);
    assert_eq!(builds[0].title, "Kept");
    assert_eq!(builds[0].author, None);
}

#[test]
fn a_page_that_is_not_overframe_builds_is_unreadable() {
    assert_eq!(parse_builds(b"<html>Just a moment...</html>"), None);
}
