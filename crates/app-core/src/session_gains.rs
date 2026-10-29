//! What the open game session added to the holding.

use std::collections::HashMap;

use warframe_domain::catalog_path;

/// Copies of each row gained since the session opened, by row id. Rows that gained nothing are
/// absent.
///
/// Counted per item first, across its rows, and only then per row: ranking a mod moves a copy from
/// the unranked row to `path#rank` without the account holding one more, and a row-only count
/// would call that copy gained. A row gains at most what its item gained.
pub(crate) fn session_gains<'a>(
    now: &[(&'a str, u32)],
    then: &'a HashMap<String, u32>,
) -> HashMap<&'a str, u32> {
    let mut item_gain: HashMap<&str, i64> = HashMap::new();
    for &(id, quantity) in now {
        *item_gain.entry(catalog_path(id)).or_default() += i64::from(quantity);
    }
    for (id, quantity) in then {
        if let Some(gain) = item_gain.get_mut(catalog_path(id)) {
            *gain -= i64::from(*quantity);
        }
    }
    now.iter()
        .filter_map(|&(id, quantity)| {
            let row = quantity.saturating_sub(then.get(id).copied().unwrap_or_default());
            let item = u32::try_from(item_gain[catalog_path(id)]).unwrap_or_default();
            let gained = row.min(item);
            (gained > 0).then_some((id, gained))
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::session_gains;
    use std::collections::HashMap;

    fn then(rows: &[(&str, u32)]) -> HashMap<String, u32> {
        rows.iter()
            .map(|&(id, quantity)| (id.to_owned(), quantity))
            .collect()
    }

    #[test]
    fn a_new_item_and_more_copies_are_gains_and_fewer_are_not() {
        let then = then(&[("forma", 2), ("lex", 3)]);
        let gains = session_gains(&[("forma", 5), ("braton", 1), ("lex", 1)], &then);
        assert_eq!(gains, HashMap::from([("forma", 3), ("braton", 1)]));
    }

    /// Fusing one copy to its maximum leaves the account holding as many as before.
    #[test]
    fn ranking_a_copy_up_gains_nothing() {
        let then = then(&[("/Mods/Serration", 3)]);
        let gains = session_gains(&[("/Mods/Serration", 2), ("/Mods/Serration#10", 1)], &then);
        assert!(gains.is_empty(), "{gains:?}");
    }

    #[test]
    fn a_new_copy_beside_a_ranked_one_is_gained_once() {
        let then = then(&[("/Mods/Serration", 3)]);
        let gains = session_gains(&[("/Mods/Serration", 3), ("/Mods/Serration#10", 1)], &then);
        assert_eq!(gains, HashMap::from([("/Mods/Serration#10", 1)]));
    }
}
