# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

Tauri 2 desktop app: a React webview for the main window, plus two transparent, click-through,
non-focusable overlay windows drawn over Warframe.

## Users

Warframe players on Linux (Wine/Proton) and Windows, mouse and keyboard on a desktop first. The
Steam Deck is supported and must stay usable (1280×800, coarse pointer), but it is not the primary
target and gamepad navigation is not required.

Two moments of use:
- **In a mission**, on the reward screen or at Baro's Ducat Kiosk: a glance of a second or two to
  pick the most valuable reward or decide what to trade for ducats, without the game losing focus.
- **Between missions**, in the main window: browse the collection, see what is left to master,
  manage warframe.market sell orders.

## Product Purpose

A free, open-source, local-first Warframe companion: platinum and ducat values on the reward screen
and the Ducat Kiosk, a priced collection, a mastery checklist, and warframe.market order
management. Success is the player making a better trade or reward choice faster, and trusting what
the app reads and sends.

## Positioning

No Overwolf, no account, no telemetry, native on Linux and the Steam Deck. The player chooses the
access level (Companion, Overlay, Full) before the app observes the game, and no mode writes to the
game or automates input.

## Operating Context

- Overlays sit over a running game: unreadable or late values are worse than none.
- Full access reads an account ID and nonce from the Warframe process and sends them to
  `mobile.warframe.com` only. This is the highest-stakes decision in the product.
- warframe.market linking takes the player's credentials (sent once) or a token.
- Prices come from a daily warframe.market summary served by relics.run; ducats from Baro's values.

## Capabilities and Constraints

- Screen reading matches English item names only.
- Collection ~1,000 entries, paginated client-side.
- UI copy is English today. Planned (owner, 2026-10-28): a multilingual interface, starting
  with French and English, after the current UX pass. Item names stay as the English catalog
  gives them, which is also what the OCR matches.
- This is a personal fork, taken over from Deftera186/tennoscope. It no longer needs to stay
  mergeable upstream; upstream may be credited in the repo.

## Brand Commitments

- Name: TennoScope.
- Platinum and ducats are the two currencies and always read as two distinct values.
- Ergonomic reference chosen by the owner (2026-10-28): AlecaFrame. Borrow its patterns (side
  navigation, dense item grids, a dark and sober look, decision aids up front, little explanatory
  text), never its name, logo or assets.
- The earlier "assay office" metaphor (hallmarks, assay register, "strike a record") is to be
  toned down hard: decoration at most, never in labels.

## Evidence on Hand

- Screenshots: `docs/screenshots/` (predate the Mastery tab and the redesign).
- Design history: `docs/design/product-pass.md`, `docs/specs/kiosk-overlay.md`.
- No testimonials, user counts or benchmarks exist; do not invent any.

## Product Principles

1. Glanceable in game: the overlays answer "which one?" in under two seconds.
2. Honest state: say what is effective, pending, stale, uncertain or refused; never fake a value.
3. Informed consent: risk and network destinations are shown where the choice is made.
4. Dense, not noisy: show many items, few words.
5. Never touch the game: read only, no input automation.

## Accessibility & Inclusion

State is never carried by color alone. Visible keyboard focus, `prefers-reduced-motion` and
`forced-colors` support are kept. Text stays readable at 1280×800.
