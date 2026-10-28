---
name: TennoScope
description: A dense, dark, quiet Warframe companion that shows values and states before words.
colors:
  accent: "#5f9fdb"
  accent-hover: "#7db3e6"
  accent-ink: "#0b1622"
  accent-soft: "#5f9fdb29"
  platinum: "#e8ebef"
  platinum-dim: "#9aa1ab"
  gold: "#d8b04a"
  bg-0: "#0f1114"
  bg-1: "#15181c"
  bg-2: "#1c2026"
  line: "#2c313a"
  line-strong: "#3d434d"
  line-control: "#6a727e"
  text: "#e8ebef"
  text-dim: "#a9b0ba"
  text-faint: "#8c939d"
  ok: "#6cc28d"
  warn: "#e69a52"
  danger: "#ec7b6b"
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
  section:
    fontFamily: "ui-sans-serif, system-ui, DejaVu Sans, Liberation Sans, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 600
  title:
    fontFamily: "ui-sans-serif, system-ui, DejaVu Sans, Liberation Sans, sans-serif"
    fontSize: "0.9rem"
    fontWeight: 600
    lineHeight: 1.3
  value:
    fontFamily: "ui-sans-serif, system-ui, DejaVu Sans, Liberation Sans, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    fontFeature: "tnum"
  body:
    fontFamily: "ui-sans-serif, system-ui, DejaVu Sans, Liberation Sans, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.45
  body-small:
    fontFamily: "ui-sans-serif, system-ui, DejaVu Sans, Liberation Sans, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 400
  label:
    fontFamily: "ui-sans-serif, system-ui, DejaVu Sans, Liberation Sans, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    fontFeature: "tnum"
rounded:
  radius-sm: "4px"
  radius: "6px"
spacing:
  hair: "4px"
  tight: "8px"
  step: "16px"
components:
  button:
    backgroundColor: "{colors.bg-2}"
    textColor: "{colors.text}"
    rounded: "{rounded.radius}"
    padding: "0 12px"
    height: "34px"
  button-hover:
    backgroundColor: "{colors.line}"
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-ink}"
    rounded: "{rounded.radius}"
    padding: "0 12px"
    height: "34px"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
  button-armed:
    backgroundColor: "{colors.bg-2}"
    textColor: "{colors.danger}"
  input:
    backgroundColor: "{colors.bg-2}"
    textColor: "{colors.text}"
    rounded: "{rounded.radius}"
    padding: "0 10px"
    height: "34px"
  chip:
    textColor: "{colors.text-dim}"
    rounded: "{rounded.radius}"
    padding: "0 8px"
    height: "28px"
  chip-selected:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.text}"
  nav-item:
    textColor: "{colors.text-dim}"
    rounded: "{rounded.radius}"
    padding: "0 10px"
    height: "36px"
  nav-item-current:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.text}"
  stat:
    backgroundColor: "{colors.bg-2}"
    textColor: "{colors.text}"
    typography: "{typography.body-small}"
    rounded: "{rounded.radius}"
    padding: "3px 10px"
  card:
    backgroundColor: "{colors.bg-2}"
    textColor: "{colors.text}"
    rounded: "{rounded.radius}"
    padding: "8px"
  tag:
    textColor: "{colors.text-dim}"
    typography: "{typography.label}"
    rounded: "{rounded.radius-sm}"
    padding: "0 6px"
    height: "18px"
  slip:
    backgroundColor: "{colors.bg-2}"
    textColor: "{colors.text}"
    rounded: "{rounded.radius}"
    padding: "6px 10px"
---

# Design System: TennoScope

## Overview

**Creative North Star: "The Item Grid Is the Screen"**

TennoScope is a companion read between missions and glanced at during them. The main window is a dense, dark, quiet tool: a thin drag bar, a 212px sidebar, a compact page head, one toolbar row, one row of filter chips, and then the item grid, which takes everything below about y=150. The interface puts values and states before words; a player should find an item, read its price and mastery state on the card and act without reading an explanation.

The world is graphite. Three grounds step from the chrome (`bg-0`) to the page (`bg-1`) to the things on it (`bg-2`); 1px neutral borders separate them, every card and field shares one 6px corner, and a single steel-blue accent marks what is selected, focused or primary. The only other colours with a job are the two currencies, platinum and gold, and the three state colours. Type is the system UI sans throughout, in sentence case, with tabular figures wherever a number is read.

This world replaces the earlier "assay register" (guilloché, clip-path cartouches, tracked monospace caps, 5rem page marks, a row of giant figures). None of that returns. The ergonomic reference is AlecaFrame's pattern set (side navigation, dense item grids, decision aids up front); its name, logo and assets are never borrowed.

**Key Characteristics:**
- Three graphite grounds, separated by 1px neutral lines rather than shadows.
- One cool accent for selection, focus and the primary action.
- Platinum and gold appear on currency values and on the marks of the metal a reward wins, nowhere else.
- System sans, sentence case, tabular figures, nothing under 12px in the main window.
- The game's own platinum and ducat icons beside every currency figure, never below 18px.
- Every state also says itself in words or shape; colour never carries it alone.

## Colors

A near-monochrome graphite palette with one steel-blue accent, two currency metals and three state hues.

### Primary
- **Steel Blue** (`accent`): selection, keyboard focus rings, the primary button, links, progress fills and the current nav item. `accent-hover` is its hover step; `accent-ink` is the near-black text set on a solid accent fill (6.48:1); `accent-soft` (the accent at 16% over the ground) fills selected chips, the current nav item, pressed segments and the selected access level.

### Secondary
- **Platinum** (`platinum`): platinum figures on cards, stats, order lines and reward slips; also the rule round a reward slip whose part an unbuilt item still lacks. It shares its value with `text`, so the game's canister icon, not the hue, is what tells the currency. `platinum-dim` is the muted figure on the kiosk strip.
- **Ducat Gold** (`gold`): ducat figures, and the "Top ducats" crown on the slip that wins in ducats.

### Neutral
- **Chrome Graphite** (`bg-0`): title bar and sidebar; also the ink on a platinum or gold crown.
- **Page Graphite** (`bg-1`): the page ground, card art wells, switch tracks.
- **Surface Graphite** (`bg-2`): cards, inputs, chips at rest, stat chips, panels, reward slips.
- **Hairline** (`line`): borders of cards, panels and rows; section rules.
- **Strong Hairline** (`line-strong`): hovered card borders, tag outlines, scrollbar thumbs, the overlay slip frame.
- **Control Edge** (`line-control`): the boundary of every interactive control (buttons, inputs, selects, chips, segmented groups), kept at 3:1 against `bg-2`.
- **Text** (`text`), **Dim Text** (`text-dim`), **Faint Text** (`text-faint`): primary copy; secondary copy and unselected controls; metadata, counts and placeholders (5.28:1 on `bg-2`, the darkest ground text sits on).

### State
- **Ok** (`ok`), **Warn** (`warn`), **Danger** (`danger`): the reader's state icon, verdicts, the "Mastered" tag, pending access changes, flagged orders and errors. Tinted grounds are the state colour mixed at 5–12% into the surface, with a 40–45% border.

### Named Rules
**The One Accent Rule.** Steel blue means "selected, focused or the thing to do next". It is never used for decoration, for a category or for a currency.

**The Two Metals Rule.** Platinum and gold are spent on currency values and on the marks of the metal a reward wins. They never colour chrome, headings or icons, and the two always read as two distinct values, each with the game's own icon.

**The Words Too Rule.** No state is carried by colour alone: a flagged order has a dot and a sentence, an absent item has a dashed tag that says "Not owned", a dimmed card still says so in its badge.

## Typography

**Display Font:** system UI sans (`ui-sans-serif, system-ui`, with DejaVu Sans and Liberation Sans)
**Body Font:** the same face
**Label/Mono Font:** none for labels; `ui-monospace` only inside the shell-command field and `kbd` keys.

**Character:** One plain, native face at small sizes and moderate weights, so the item art and the figures carry the screen. Hierarchy comes from weight (600 for names and titles) and from the three text tones, not from size jumps.

### Hierarchy
- **Display** (700, 28px at the overlay's 1080p design pixel, line-height 1, -0.02em): the platinum and ducat figures on a reward slip. Scales with `--u` on the overlay.
- **Headline** (600, 1.25rem, 1.3, -0.01em): the one page title per page, inline with its stat chips. There is no larger type in the main window.
- **Section** (600, 1.0625rem): section titles inside a page. Panel headings step down to 0.9375rem.
- **Title** (600, 0.9rem, 1.3): item names on cards and order lines; two lines at most on a card.
- **Value** (600, 1rem, tabular): the price figure on an item card.
- **Body** (400, 0.875rem, 1.45): controls, page notes, prose (prose capped at 70ch, line-height 1.55).
- **Body small** (400, 0.8125rem): stat chips, filter chips, segmented options, status lines, helper text.
- **Label** (400–700, 0.75rem, tabular where numeric): tags, card metadata, count badges, snapshot age. 12px is the floor.

### Named Rules
**The 12px Floor Rule.** No text in the main window or on a reward slip is set under 12px (0.75rem); slip text is `max(12px, 15u)`.

**The Sentence Case Rule.** Labels, buttons, tags and headings are sentence case at normal tracking. No uppercase, no letter-spaced caps, no monospace labels.

**The Tabular Figures Rule.** Every number a player compares (prices, counts, stats, page numbers, ages) is set with tabular figures.

## Layout

The main window is a two-by-two grid: a 36px title bar across the top (44px under a coarse pointer), a 212px sidebar on the left, and a scrolling content column (padding 20px 24px 48px) whose page caps at 120rem. The sidebar stacks the nav (2px gaps, 36px rows) and, pinned to its foot above a hairline, the reader state, snapshot age and the Refresh button.

A page is a vertical stack with 12px gaps: a page head (title and stat chips wrapping on one line, actions pushed right), one toolbar row (search, sort, segmented filter, ducat switch), one filter row (chips left, price status and action right, the right group wrapping as one piece), then the content. Item cards fill an auto-fill grid with a 14.5rem minimum column and an 8px gap; reward slips use a 13.5rem minimum; diagnostics rows 20rem. Order lines are fixed-column grids so prices and quantities read down a column.

Spacing runs on one named rhythm, `hair` 4px, `tight` 8px and `step` 16px, used for gaps and padding. Inside components, 2px, 6px, 10px, 12px and 14px recur as literals (control inline padding 10px, panel padding 12px 14px, page gap 12px).

Responsive behaviour: below 900px the sidebar collapses to 64px icons (labels stay in the accessibility tree, count badges ride the icon's corner), order lines fold to two rows and paired forms stack. Below 640px the search takes a full row and sliders stack under their label. Under `pointer: coarse` (the Steam Deck) every control is at least 44px tall.

**The Grid First Rule.** Nothing above the item grid is taller than it needs to be: one title line, one toolbar row, one chip row. The grid starts near y=150 on a 1280×800 window.

## Elevation & Depth

TennoScope is flat. Depth is tonal: the three graphite grounds layer chrome, page and surface, and 1px borders do the separating. There are no drop shadows for lift. The few `box-shadow` values in the build are rings and masks, not elevation.

### Shadow Vocabulary
- **Selection ring** (`box-shadow: inset 0 0 0 1px var(--accent)`): pressed segments and pressed presence buttons; the current nav item uses the accent at 40%.
- **Active node ring** (`box-shadow: 0 0 0 3px var(--bg-2), 0 0 0 4px var(--text)`): the effective level's node on the access rail.
- **Scroll-under mask** (`box-shadow: 0 -12px 24px var(--bg-1)`): the sticky confirm button on the setup screen, so content scrolling under it fades into the page.
- **Double rule** (`box-shadow: inset 0 0 0 2px var(--bg-0), inset 0 0 0 3px var(--platinum)`): a reward slip whose part is the last one an unbuilt item lacks.

### Named Rules
**The Flat Graphite Rule.** Surfaces never float. A surface is distinguished by its ground step and its hairline; hover strengthens the hairline (`line` to `line-strong`), it does not lift.

## Shapes

One corner for everything rectangular: 6px (`radius`) on cards, panels, inputs, buttons, chips, stat chips, nav items, order lines and slips; 4px (`radius-sm`) on what sits inside them (tags, card art wells, segmented options, crowns, `kbd`). Round shapes are reserved for small state marks: the 8px status and flag dots, the switch thumb and its 9px track, the 10px count badge, the access-rail nodes. Borders are 1px; a dashed 1px border means absent or unverifiable. Disclosures draw one chevron, rotated from -45° to 45°, in place of the native triangle.

**The One Corner Rule.** A new rectangle takes 6px, or 4px if it nests inside one that does. No other radius, no clipped or cut corners.

## Components

### Buttons
Plain and compact; a button is a bordered label, and only one per view is filled.
- **Shape:** gently rounded (6px), 34px tall, 12px inline padding, 0.875rem at weight 500.
- **Default:** surface graphite ground, text colour, a control-edge border. Hover moves the ground to the hairline tone and the border to faint text.
- **Primary:** solid steel blue with `accent-ink` text at weight 600; hover lightens to `accent-hover`. Used for the page's next action (Price this page, the setup confirm, Confirm an access change).
- **Armed:** a destructive button awaiting its second click turns its border and label danger.
- **Disabled:** 50% opacity, `not-allowed` cursor; a disabled button that blocks a choice has its reason written under it.
- **Link button:** accent text, 1px underline at 0.2em offset, 0.8125rem.

### Chips
- **Filter chip:** 28px, 8px inline padding, transparent with a control-edge border, dim text and a faint tabular count. Selected: accent border, `accent-soft` ground, text colour.
- **Stat chip:** an inline figure in the page head: surface ground, hairline border, 3px 10px padding, 0.8125rem; the figure in 600 tabular, its label dim. Currency stats colour only the figure, in its metal, with the game icon at 18px.
- **Tag:** 18px line, 0 6px, `radius-sm`, strong-hairline border, dim 0.75rem text. "Mastered" in ok; absent dashed and faint; ranked-max and listed in a control-edge border with text colour.

### Cards / Containers
- **Item card:** a two-column grid, 60px art well (page ground, `radius-sm`) beside the name (two lines max), category meta, tags and values pinned to the foot. Surface ground, hairline border, 8px padding; hover strengthens the border only. A card the account does not hold greys its art to 55% and dims its name, and its tag still says so.
- **Panels** (presence, listing forms, reports, health rows): surface ground, hairline, 6px, 10–14px padding. A broken or flagged panel takes a danger border at 40–45% and a 5–6% danger tint.

### Inputs / Fields
- **Style:** 34px, surface ground, control-edge border, 6px, 10px inline padding (32px left when a search icon leads), 0.875rem. Select shows a 16px chevron; placeholders are faint.
- **Hover / Focus:** hover shifts the border to faint text; focus draws the global 2px accent outline at 2px offset.
- **Switch:** a 30×18 track with a 12px thumb; on, the track fills accent and the thumb slides 12px and turns `accent-ink`. Position and fill both carry the state.
- **Segmented:** a bordered 2px-padded group of 28px options; pressed takes `accent-soft` and an inset accent ring.
- **Slider:** 4px track filled accent up to the value; a 16px thumb with a 2px accent ring.

### Navigation
- **Sidebar item:** 36px row, 18px stroke icon, 0.875rem dim label, 10px inline padding, 6px corner. Hover takes the surface ground; current takes `accent-soft`, a 1px accent ring at 40%, text colour and an accent icon. A count badge sits right: a 10px-radius pill, strong-hairline border, 0.75rem bold tabular, neutral, never accent.
- **Title bar:** 36px, chrome ground, the 0.9375rem bold wordmark left, three 44px window controls right.
- **Pagination:** 32px square buttons, borderless at rest; current page takes the accent border and `accent-soft`.

### Reward Slip
The one surface shared by the Rewards page and the in-game overlay. Every size is a count of `--u`, one design pixel of the 1080p overlay (1px on the page, `100vh / 180` over the game). A column: the item name in two reserved lines so figures land level across four slips, a hairline, then two equal metal columns (game icon at 25u, figure at 28u bold, word below), then a foot of hallmarks or the mastery ledger pinned to the bottom. The winning metal's word is replaced by a crown set in that metal ("Top plat", "Top ducats") with chrome-graphite ink. Over the game the slip sits on chrome graphite at 94% opacity with a strong-hairline frame.

### Access Selector
One bordered panel whose rows are the effective-mode status, the rail, the detail and the always-prohibited list. The rail's three levels are framed choices at rest (hairline), stronger on hover, solid accent with `accent-soft` when selected, and dashed control-edge for the effective mode when it differs. A pending change tints the detail warn at 5% and says "Proposed. Not yet effective."

### Kiosk Plate
Over the Ducat Kiosk, every reading (grid price chips and basket rows alike) sits on the same plate: a 4-design-pixel radius, a near-opaque navy glass (`rgb(8 16 26 / 84%)`) with a 1px inset cool ring and a soft text shadow, in the app face at weight 600 with tabular figures. No reading floats as bare digits over the game. Sizes are design pixels of the 1920×1080 calibration times `--h`.

## Do's and Don'ts

### Do:
- **Do** start every new rectangle on `bg-2` with a 1px `line` border and the 6px `radius`.
- **Do** give every interactive control a `line-control` border so its boundary holds 3:1.
- **Do** keep steel blue for selection, focus, links and the one primary action in view.
- **Do** colour a currency figure in its metal and set the game's own platinum or ducat icon beside it, at 18px or more.
- **Do** use tabular figures for every number a player compares.
- **Do** say every state in words or shape as well as colour, and keep visible focus, `prefers-reduced-motion` and `forced-colors` support.
- **Do** give every control 44px under `pointer: coarse`.

### Don't:
- **Don't** set text under 12px in the main window or on a reward slip.
- **Don't** use uppercase or letter-spaced labels, or monospace outside code and keys.
- **Don't** add drop shadows to lift a surface; strengthen its hairline instead.
- **Don't** bring back the assay register: no guilloché, no clip-path cartouches, no 5rem page marks, no row of giant figures, and no hallmark or assay vocabulary in visible labels.
- **Don't** use platinum or gold on chrome, headings, icons or anything that is not a currency value or the metal a reward wins.
- **Don't** borrow AlecaFrame's name, logo or assets; borrow only its patterns.
