---
name: TennoScope
description: A quiet, warm-grey desktop companion for Warframe that shows values and states before words.
colors:
  bg-0: "#1b1a19"
  bg-1: "#242321"
  bg-1-low: "#2a2624"
  bg-2: "#2e2c2a"
  fill: "#ffffff12"
  fill-strong: "#ffffff1f"
  line: "#ffffff12"
  line-strong: "#ffffff21"
  well: "#00000029"
  line-control: "#807b76"
  text: "#ecebe9"
  text-dim: "#b4b0ab"
  text-faint: "#a39e98"
  accent: "#6b93dc"
  accent-text: "#a3c0f2"
  accent-soft: "#6b93dc38"
  platinum: "#e8e8ea"
  platinum-dim: "#9aa1ab"
  gold: "#d8b04a"
  ok: "#7cc597"
  warn: "#e3a364"
  danger: "#f08a7c"
typography:
  display:
    fontFamily: "ui-sans-serif, system-ui, DejaVu Sans, Liberation Sans, sans-serif"
    fontSize: "28px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.02em"
    fontFeature: "tnum"
  headline:
    fontFamily: "ui-sans-serif, system-ui, DejaVu Sans, Liberation Sans, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  value:
    fontFamily: "ui-sans-serif, system-ui, DejaVu Sans, Liberation Sans, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 600
    fontFeature: "tnum"
  body:
    fontFamily: "ui-sans-serif, system-ui, DejaVu Sans, Liberation Sans, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "ui-sans-serif, system-ui, DejaVu Sans, Liberation Sans, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    fontFeature: "tnum"
  group-title:
    fontFamily: "ui-sans-serif, system-ui, DejaVu Sans, Liberation Sans, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
  mono:
    fontFamily: "ui-monospace, DejaVu Sans Mono, Liberation Mono, monospace"
    fontSize: "0.75rem"
    fontWeight: 400
rounded:
  radius-xs: "4px"
  radius-sm: "6px"
  radius: "10px"
spacing:
  hair: "4px"
  tight: "8px"
  step: "16px"
components:
  button:
    backgroundColor: "{colors.fill}"
    textColor: "{colors.text}"
    rounded: "{rounded.radius-sm}"
    padding: "0 12px"
    height: "28px"
  button-hover:
    backgroundColor: "{colors.fill-strong}"
  button-primary:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent-text}"
    rounded: "{rounded.radius-sm}"
    padding: "0 12px"
    height: "28px"
  input:
    backgroundColor: "{colors.well}"
    textColor: "{colors.text}"
    rounded: "{rounded.radius-sm}"
    padding: "0 10px"
    height: "30px"
  segment-selected:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.text}"
    rounded: "{rounded.radius-sm}"
    height: "24px"
  chip:
    textColor: "{colors.text-dim}"
    rounded: "{rounded.radius-sm}"
    padding: "0 9px"
    height: "26px"
  chip-selected:
    backgroundColor: "{colors.fill-strong}"
    textColor: "{colors.text}"
  rail-item:
    textColor: "{colors.text-dim}"
    rounded: "{rounded.radius-sm}"
    width: "40px"
    height: "40px"
  rail-item-current:
    backgroundColor: "{colors.fill}"
    textColor: "{colors.text}"
  group:
    backgroundColor: "{colors.bg-2}"
    rounded: "{rounded.radius}"
  row:
    textColor: "{colors.text}"
    typography: "{typography.body}"
    padding: "10px 14px"
  card:
    backgroundColor: "{colors.bg-2}"
    textColor: "{colors.text}"
    rounded: "{rounded.radius}"
    padding: "10px"
  tag:
    backgroundColor: "{colors.fill}"
    textColor: "{colors.text-dim}"
    typography: "{typography.label}"
    rounded: "{rounded.radius-xs}"
    padding: "0 6px"
    height: "18px"
  slip:
    backgroundColor: "{colors.bg-2}"
    textColor: "{colors.text}"
    rounded: "{rounded.radius-sm}"
    padding: "6px 10px"
---

# Design System: TennoScope

## Overview

**Creative North Star: "A Quiet Desktop Tool"**

TennoScope is a companion read between missions and glanced at during them. The main window is drawn like a recent dark desktop app: the title bar and a floating icon rail sit on the window's own ground, and the page is one lighter panel, inset by 8px with a 10px corner, whose ground warms faintly toward its foot. What the page holds comes in raised groups made of rows (what a row is on the left, its value or control on the right) split by hairlines that are barely there, each group named by a small grey title above it. The item grid stays the screen on Collection (and its To master mode, the mastery checklist): dense, but its cards are borderless raised tiles.

The world is warm grey and almost colourless. Neutral greys carry the structure; one soft blue marks a switch that is on, keyboard focus, the selected segment of a tab control and the one primary action on a screen. The two currencies, platinum and gold, colour currency values and nothing else; ok, warn and danger say state, always next to a word or a shape. Type is the system sans at a 13px base with 20px semibold page titles; versions and shell commands are set in monospace.

The owner pinned the reference (2026-10-28): "very minimal and stylish" dark desktop windows. Its grammar is borrowed, never a product, name or mark. AlecaFrame remains the ergonomic reference for patterns (side navigation, dense grids, decision aids up front), never for its name, logo or assets. The earlier steel-blue graphite system with bordered chips, solid blue buttons and framed panels is gone, and so is the older assay register.

**Key Characteristics:**
- Window ground, one lighter content panel, raised groups: depth by tone, never by shadow.
- Groups of label-left, value-right rows split by 7% white hairlines; small grey titles above.
- Neutral translucent buttons; soft blue only for on, focus, the selected segment and the one primary action.
- Platinum and gold on currency values only, each with the game's own icon at 18px or more.
- System sans at 13px, 20px semibold titles, tabular figures, nothing under 12px in the main window.
- Every state also says itself in words or shape; colour never carries it alone.

## Colors

Warm greys with a hint of brown, one soft blue, two currency metals and three state hues.

### Primary
- **Soft Blue** (`accent`, #6b93dc): the track of a switch that is on, the slider fill, the access rail's progress, keyboard focus rings (2px, 2px offset), the ring of a selected segment or access level, progress bars and the update dot. 4.52:1 on `bg-2`; a white thumb on it reads 3.07:1. `accent-soft` (the accent at 22%) fills the selected segment, the selected access level and the primary button. `accent-text` (#a3c0f2) is blue set as words: links and the primary button's label.

### Secondary
- **Platinum** (`platinum`, #e8e8ea): platinum figures on cards, the figures line, order rows and reward slips; also the rule round a reward slip whose part an unbuilt item still lacks. Its hue is close to `text`, so the game's canister icon is what tells the currency. `platinum-dim` is the muted figure on the kiosk strip.
- **Ducat Gold** (`gold`, #d8b04a): ducat figures, and the "Top ducats" crown on the slip that wins in ducats.

### Neutral
- **Window** (`bg-0`, #1b1a19): title bar, the ground round the rail, the setup screen's frame; the ink on a platinum or gold crown; the overlay slip's ground at 94%.
- **Panel** (`bg-1` #242321 to `bg-1-low` #2a2624): the content panel, a top-to-bottom gradient from 35% down.
- **Raised** (`bg-2`, #2e2c2a): groups, item cards, empty-state tiles, link forms, reward slips.
- **Fill** (`fill`, white at 7%) and **Strong Fill** (`fill-strong`, white at 12%): neutral buttons, hovers, the current nav item, a segmented track, tags; their hover state, a pressed chip, the current page number.
- **Well** (`well`, black at 16%): the ground of fields and of card art wells.
- **Hairline** (`line`, white at 7%) and **Strong Hairline** (`line-strong`, white at 13%): row separators and the panel edge; hovered cards, the access rail, the overlay slip frame.
- **Control Edge** (`line-control`, #807b76): the drawn edge of fields, selects and an off switch track, and the ring of a pressed chip or current page. 3.32:1 on `bg-2`, 3.75:1 on `bg-1`.
- **Text** (#ecebe9), **Dim Text** (#b4b0ab), **Faint Text** (#a39e98): primary copy; secondary copy, row notes and unselected controls; metadata, counts, placeholders and footnotes (5.23:1 on `bg-2`, the lightest ground faint text sits on).

### State
- **Ok** (#7cc597), **Warn** (#e3a364), **Danger** (#f08a7c): the reader icon, verdicts, the "Mastered" tag, pending access changes, flagged orders and errors. Tinted grounds mix the state colour at 5–16% into the surface (`danger-ground`, danger at 6% over `bg-2`, for a flagged order row, a broken report group and the relink block); a state tint never replaces the word.

### Named Rules
**The Soft Blue Rule.** Blue means "on, focused, selected segment, or the thing to do next". One primary action per screen at most; never decoration, a category, a nav item or a currency.

**The Two Metals Rule.** Platinum and gold are spent on currency values and on the marks of the metal a reward wins. They never colour chrome, headings or icons, and the two always read as two distinct values, each with the game's own icon.

**The Words Too Rule.** No state is carried by colour alone: a flagged order has a dot and a sentence, an absent item has a dashed tag that says so, a pressed chip has a drawn ring as well as a fill.

## Typography

**Display Font:** system UI sans (`ui-sans-serif, system-ui`, with DejaVu Sans and Liberation Sans)
**Body Font:** the same face
**Mono Font:** `ui-monospace` with DejaVu Sans Mono and Liberation Mono (`--face-mono`), for the version line, shell commands and `kbd` keys only.

**Character:** One plain native face at small sizes and moderate weights, so the item art and the figures carry the screen. Hierarchy comes from weight and from the three text tones, not from size jumps.

### Hierarchy
- **Display** (700, 28px at the overlay's 1080p design pixel, line-height 1, -0.02em): the platinum and ducat figures on a reward slip. Scales with `--u` over the game. In the main window it sets one figure per card on Farm & sales (the trend's change, the best platinum per run) and nothing else.
- **Headline** (600, 1.25rem, 1.3, -0.01em): the one page title per page. Nothing larger in the main window.
- **Body** (400, 0.8125rem / 13px, 1.45): the base of the main window: controls, rows, nav, card names (600), prose (70ch, 1.5).
- **Value** (600, 0.9375rem, tabular): the price figure on an item card.
- **Group title** (600, 0.75rem, dim): the small grey title above a group.
- **Label** (400, 0.75rem / 12px, tabular where numeric): row notes, tags, card metadata, footnotes, counts, snapshot age. 12px is the floor.

### Named Rules
**The 12px Floor Rule.** No text in the main window or on a reward slip is set under 12px; slip text is `max(12px, 15u)`.

**The Sentence Case Rule.** Labels, buttons, tags and titles are sentence case at normal tracking. No uppercase, no letter-spaced caps.

**The Mono For Values Rule.** Monospace is for things a player may copy (a version, a command), never for labels or sentences.

## Layout

The main window is a two-by-two grid: a 36px title bar (44px under a coarse pointer) across the top, the icon rail on the left, and the content panel (margin 0 8px 8px 0, padding 22px 28px 48px, page capped at 120rem). The rail is its own panel (`bg-1`, hairline edge, 10px corner, 6px padding, margin 0 8px 8px): the pages at the top (Dashboard, the page the app opens on; Collection; Relics, Foundry, Market, Farm & sales, Rewards, Orders), Diagnostics and Settings at its foot, then under a hairline the reader state, Refresh inventory and the update mark. The title bar carries the TennoScope mark over the rail's centre line, and on its right the warframe.market status before the window controls.

A page is a vertical stack with 12px gaps. The page head puts the title and, on its right, its tabs (the ownership filter) or its actions (Refresh orders, Unlink); under them one line of figures in dim text separated by middle dots; then the page note. Collection follows with one toolbar row (search, sort, ducat switch), one row of category words with the price state and action on its right, and the grid: auto-fill, 14.5rem minimum, 8px gap. Settings, Diagnostics and Orders are made of groups: a 12px grey title, the group, an optional footnote, 16px between sections. The Dashboard reads the game's world: a row of cycle tiles (the place's scene from the wiki behind its words, darkened toward the text, dimmer at night), then two columns of unequal weight, the void fissures on the left (each row led by its era's relic, the enemy's faction mark before the node) and Today on the right (each row led by a 36px well holding the sortie, archon or Baro mark), one column below 900px. Every picture is decoration with an empty alt and steps aside when it does not load.

Responsive behaviour: below 900px order rows fold to two lines and paired forms stack. Below 640px the search takes a full row and the setup confirm stops being sticky. Under `pointer: coarse` (the Steam Deck) every control is at least 44px tall.

**The Grid First Rule.** Nothing above the item grid is taller than it needs to be: a title line, a figures line, one toolbar row, one row of categories. The grid starts near y=205 on a 1280×800 window.

## Elevation & Depth

Flat, by tone. The window ground, the panel and the raised groups are three steps of the same warm grey; the panel has a 1px hairline edge and a faint warm gradient, and nothing casts a shadow for lift.

### Shadow Vocabulary
- **Selection ring** (`box-shadow: inset 0 0 0 1px var(--accent)`): the selected segment and the selected access level.
- **Pressed ring** (`box-shadow: inset 0 0 0 1px var(--line-control)`): a pressed category chip, the current page number.
- **Thumb lift** (`box-shadow: 0 1px 2px rgb(0 0 0 / 40%)`): the white thumbs of the slider and the access rail.
- **Active node ring** (`box-shadow: 0 0 0 3px var(--bg-2), 0 0 0 4px var(--text-dim)`): the effective level's node on the access rail.
- **Double rule** (`box-shadow: inset 0 0 0 2px var(--bg-0), inset 0 0 0 3px var(--platinum)`): a reward slip whose part is the last one an unbuilt item lacks.

### Named Rules
**The No Lift Rule.** Surfaces never float. A surface is told apart by its tone; hover lightens a fill or shows a hairline, it never adds a shadow.

## Shapes

Three corners: 10px (`radius`) for the content panel, groups, item cards and empty tiles; 6px (`radius-sm`) for controls (buttons, fields, chips, segments, nav rows, access tiles) and for reward slips; 4px (`radius-xs`) for what sits inside (tags, crowns, hallmarks, `kbd`). Round shapes are small state marks: status and flag dots, switch thumbs and their 9px tracks, count badges, rail nodes. Lines are 1px; a dashed 1px edge means absent, unverifiable or the effective-but-unselected access level. Disclosures draw one chevron rotated from -45° to 45°.

## Components

### Buttons
Quiet and compact; a button is a label on a translucent fill.
- **Default:** `fill`, text colour, no frame, 6px, 28px tall, 12px inline padding, 13px at weight 500. Hover: `fill-strong`.
- **Primary:** the accent at 22% (32% on hover) with an `accent-text` label, never a solid blue block; one per screen (Price this page, the setup confirm, Confirm an access change). The mix is made over `--primary-under`, transparent by default; the sticky setup confirm sets it to the panel colour so text scrolling under it does not read through.
- **Armed:** a destructive button awaiting its second click turns danger, on a 16% danger ground.
- **Rail item:** Refresh inventory is an icon on the rail like the pages, not a button standing on it.
- **Disabled:** 45% opacity; a disabled button that blocks a choice has its reason written next to it.
- **Link:** `accent-text` with a 45% underline at 0.2em, full on hover.

### Groups and Rows
- **Group:** `bg-2`, 10px, no border; children split by a `line` hairline.
- **Row** (`.setting`): label and its note on the left (13px weight 500, note 12px dim, 62ch), value or control on the right, 10px 14px padding, wrapping under the label when narrow. Footnotes and errors take the row's full width.
- **Group title:** 12px, 600, dim, 2px inset, above the group.

### Chips and Tabs
- **Category chip:** words at rest (dim, 26px, no frame); hover takes `fill`; pressed takes `fill-strong`, text colour and a control-edge ring. Counts in faint tabular 12px.
- **Segmented tabs:** a `fill` track with 2px padding and 8px corners; 24px options; the selected one `accent-soft` with a 1px accent ring. Used for ownership and language.
- **Tag:** `fill`, 4px, 18px line, dim 12px. Mastered in ok on an ok tint; absent dashed and faint; maxed rank and listed on `fill-strong` in text colour.

### Cards / Containers
- **Item card:** borderless `bg-2` tile, 10px corner, 10px padding; 56px art well (black at 16%, 6px) beside the name (two lines max), category, tags and the values line with Sell at its end. Hover shows a strong hairline. A card the account does not hold greys its art and dims its name, and its tag says so.
- **Empty state:** one tile (22rem max, centred): the page's 20px icon, a 13px title, a 12px faint line, an optional action.
- **Order list:** one group, an order per row in fixed columns (mark, name, price × count, value, claim, actions); a flagged row adds a danger dot, a danger sentence and a 6% danger tint.

### Cards and Bars (Farm & sales)
- **Card:** a group-toned tile (`bg-2`, 10px, 12px 14px padding) with a 13px semibold title and, on its right, a segmented control. Two sit side by side above the page's table, one column under 1100px. No gradient and no glow: the reference's lit trend card is translated to tone, like everything else here.
- **Trend figure:** the Display size, `ok` for a rise and `danger` for a fall, always with its sign; a line under it says over what it was observed. Carousel dots are 3px rules in 28px buttons, the current one in text colour.
- **Bar chart:** horizontal, one row per entry (label, 10px bar, figure with its metal). Pace is a fill and a shape: fast a full `ok` bar, steady a `text-faint` bar, slow an outline in control edge only; a legend under the chart names all three, and each row speaks its pace to a screen reader.
- **Sparkline:** one 1.5px `text-dim` line, no axes, no fill; its accessible name states the first and last figure and the period.

### Rankings (Market)
While no item is open, the Market page shows the day's trades under the search: a 13px semibold heading that names the day the daily summary covers ("Trades of 27 Oct", never "today"), a 12px faint line on where it comes from, then four groups, two abreast from 27rem each and one column below. Each group is a ranking of ten rows under a 12px grey title: a faint column line (Item, the ranking's figure, Median), then rows of a 28px art well, the name with its rank or variant tag, the figure in dim tabular text right-aligned, and the median as a platinum figure. A relic tier is named as the Relics page names it (Meso I3 Radiant). A row is a button that opens the item as a search would, its hover a `fill`; one the item list cannot name stays a plain row. The fourth group, Over 7 days, carries a segmented control (Rising, Falling) on its title line; its change is `ok` with a plus or `danger` with a minus, the sign always written. A threshold a ranking applies is said in a footnote under its group, and a ranking that cannot be drawn yet says why in its group's place. Opening an item puts a link back to the rankings above it.

### Orders
A listing is a ledger line in a group, on fixed columns so figures read down the page: a 40px thumbnail well (warframe.market's picture, else the collection's, else two letters), the name with one 12px line under it (the reconciliation's claim in `danger` with its repair as a link beside it, else what the row is: unverifiable, hidden, a buy order), the price in platinum, the count, the listing's value, then a 14rem action column right-aligned so rows with fewer buttons keep the figures in line. The count is a 28px stepper (minus and plus icons in a `fill` well with a control edge, the number between) when a held row bounds it, a plain `× n` otherwise. Sold is the row's one filled stamp (`accent-soft`, accent edge); Edit and Remove stay plain. A flagged line takes `danger-ground`. Above the list, the sync switch with its note beside it, and while there is one, the last sync's report: a `bg-2` block of 24px thumbnails with the name and `taken down` or `3 → 1`. Below, the inventory's unlisted sellable holdings on the same line grammar (thumbnail, name over rank and count, price, Sell), headed by its title and a search field, eight rows at most. The sell form's market line sits under its two fields: the in-game sellers' prices in platinum and a Match link.

### Item Sheet
A card opens its item in a panel over the page's right edge (`bg-1`, a `line-strong` edge, 10px, 460px wide at most), the grid left in place: a sticky bar (previous, position, next, close), the title and its tags, the art in a 300px well, the description, then titled groups of rows, each shown only when the catalogue says something: In your collection, Value, Components (a missing part opens on its relics), Obtained in, Abilities, Stats, Builds, and the introduction and wiki link last. **Builds** lists Overframe's five best builds for a Warframe, weapon or companion (a Prime part or blueprint asks for the item it builds; mods, relics and resources show no group and ask nothing): each row is a button the width of the group, the build's title over a 12px faint line (author · score · Forma · updated date) with an arrow at its end, opening the build on overframe.gg; its hover is a `fill`. While Overframe is asked, when it lists none and when it cannot be reached, the group holds one faint sentence saying so and the rest of the sheet stands. A 12px faint footnote names Overframe as the source. Only what points at a build is shown, never its mods.

### Inputs / Fields
- **Field:** 30px, black at 16% over the ground, control-edge border, 6px, 10px inline padding (30px with a search icon), 13px. Hover lightens the edge to faint text; focus draws the 2px soft-blue outline.
- **Switch:** 32×18 track with a 12px thumb; off is `fill` inside a control edge with a dim thumb; on fills soft blue and the thumb slides 14px and turns white.
- **Slider:** 4px track, soft blue up to the value and control edge after; a 16px white thumb.

### Navigation
- **Rail item:** a 40px square (44px under a coarse pointer), 18px icon at a 1.5 stroke, dim, 6px corner, no label. Hover takes `fill` and text colour; current takes `fill`, a `line` inset ring and text colour, never the accent. A count rides the top-right corner inside the button: a 16px neutral pill on `bg-2`, carved from the icon by a 2px ring of the rail.
- **Tip:** the name of a rail item, shown on hover and on keyboard focus, gone on Escape: `bg-2`, a `line-strong` inset ring, 6px, 12px text, 10px right of the item; the reader's tip adds its detail and the snapshot age in dim text. Never `title`.
- **Market status:** a 24px pill on `fill` in the title bar: a 12px mark (dot online, ringed dot in game, dashed ring invisible, ring offline, warn triangle for a refused link), the status word, `· auto` when it follows the game, a chevron. It opens a 16rem popover on `bg-2` with a `line-strong` ring and a 10px corner: the four choices as rows (the one asked for in `accent-soft` with an accent ring), the Follow the game checkbox and the note. Unlinked, the pill says Not linked and opens Orders.
- **Title bar:** 36px on the window ground, the 13px semibold wordmark in dim text, three 44px window controls.
- **Pagination:** 28px buttons, bare at rest; the current page takes `fill-strong` and a control-edge ring.

### Reward Slip
Shared by the Rewards page and the in-game overlay. Every size is a count of `--u`, one design pixel of the 1080p overlay (1px on the page, `100vh / 180` over the game). A column: the name in two reserved lines, a hairline, two equal metal columns (game icon at 25u, figure at 28u bold, word below), then hallmarks or the mastery ledger pinned to the foot. The winning metal's word becomes a crown in that metal with window-ground ink. Over the game the slip sits on the window ground at 94% with a strong-hairline frame. Its corners are 6px and 4px, as before this world, so the overlay's geometry does not move.

### Access Selector
One group whose rows are the effective-mode status, the rail, the detail and the always-prohibited list. The rail's three levels are `fill` tiles; hover takes `fill-strong`; selected takes `accent-soft` with an accent ring; the effective level, when it differs, a dashed control-edge outline. A pending change tints the detail warn at 5% and says "Proposed. Not yet effective."

### Kiosk Plate
Over the Ducat Kiosk, every reading sits on its own plate: a 4-design-pixel radius, near-opaque navy glass (`rgb(8 16 26 / 84%)`) with a 1px inset cool ring and a soft text shadow, weight 600 with tabular figures. The plate keeps these colours of its own rather than the window's greys: it is read against the game's teal panels, not against the app. Sizes are design pixels of the 1920×1080 calibration times `--h`.

## Do's and Don'ts

### Do:
- **Do** put settings and data in a group of label-left, value-right rows, titled in small grey above.
- **Do** keep soft blue for a switch that is on, focus, the selected segment and the one primary action.
- **Do** draw a 3:1 edge (`line-control`) on every field, select and off switch track.
- **Do** colour a currency figure in its metal and set the game's platinum or ducat icon beside it at 18px or more.
- **Do** use tabular figures for every number a player compares, and monospace for versions and commands.
- **Do** say every state in words or shape as well as colour; keep visible focus, `prefers-reduced-motion` and `forced-colors` support.
- **Do** give every control 44px under `pointer: coarse`.

### Don't:
- **Don't** set text under 12px in the main window or on a reward slip.
- **Don't** frame chips, stats or panels with borders; separate rows with hairlines and surfaces with tone.
- **Don't** fill a button with solid blue, or use blue on a nav item, a category or a heading.
- **Don't** add shadows for lift.
- **Don't** use uppercase, letter-spaced labels, or monospace for labels and sentences.
- **Don't** use platinum or gold on chrome, headings, icons or anything that is not a currency value or the metal a reward wins.
- **Don't** bring back the assay register or the graphite world: no guilloché, no cartouches, no bordered stat chips, no solid accent buttons.
- **Don't** borrow a product's or AlecaFrame's name, logo or assets; borrow only grammar and patterns.
