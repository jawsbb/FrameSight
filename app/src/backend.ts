import { invoke } from '@tauri-apps/api/core'

export type HealthState = 'ready' | 'idle' | 'degraded' | 'failed'
export interface BackendHealth { state: HealthState; message: string; last_success: string | null }
export interface AcquisitionStageHealth { stage: string; state: HealthState; message: string }
export type ItemCategory = 'frame' | 'weapon' | 'companion' | 'prime_part' | 'relic' | 'resource' | 'blueprint' | 'vehicle' | 'mod' | 'arcane'
export interface CollectionItem { id: string; name: string; category: ItemCategory; quantity: number; mastered: boolean; image_url?: string; platinum?: number; platinum_ceiling?: number; ducats?: number; rank?: number; max_rank?: number; live: boolean; priceable: boolean; monthly_trades?: number }
/** Mastered and total for one equipment category, counted as the game's profile counts: an item mastered and since sold is still mastered. */
export interface MasteryCategoryTotal { category: ItemCategory; mastered: number; total: number }
/** What is left to master. `available` is false until an inventory has been read under Full access and the catalog has loaded. */
export interface MasteryChecklist { available: boolean; items: CollectionItem[]; totals: MasteryCategoryTotal[] }
/** How far the live pricing pass the player asked for has got. */
export interface PricingProgress { done: number; total: number }
export interface RewardCard { name: string; platinum: number; ducats: number; owned: number; mastery?: MasteryMark; confidence: number }
/** One slot of the set a Prime item is built from: the copies the recipe takes, the copies held, and whether this reward is the one that fills it. */
export interface SetPart { name: string; image: string | null; uses: number; held: number; this: boolean }
/** Absent for items mastery never touches or while marks are off; `unknown` still replaces the
 * ownership line, as a dash. `subject` names the consumer a mastered part is still wanted by. */
export type MasteryMark =
  | { state: 'mastered' }
  | { state: 'built'; rank: number; max_rank: number }
  | { state: 'in_foundry' }
  | { state: 'unmastered'; subject: string | null; parts: SetPart[]; missing: boolean; completes: boolean }
  | { state: 'unknown' }
export type LinkState = 'unlinked' | 'linked' | 'needs_relink'
export type CredentialBacking = 'keyring' | 'database'
export type Presence = 'online' | 'ingame' | 'invisible'
/** `status: null` is offline: no socket held. */
export interface PresenceView { status: Presence | null; wanted: Presence | null; auto: boolean }
export type OrderStatus =
  | { state: 'ok' }
  | { state: 'missing' }
  | { state: 'overshoot'; owned: number }
  | { state: 'unverifiable' }
export interface MarketOrder { id: string; item_id: string; kind: 'sell' | 'buy'; platinum: number; quantity: number; per_trade: number; rank?: number; subtype?: string; visible: boolean; updated_at?: number }
/** `thumb_url` is absolute; `slug` addresses the item's live order book. */
export interface ReconciledOrder { order: MarketOrder; name?: string; row_id?: string; thumb_url?: string; slug?: string; status: OrderStatus }
export interface MarketAccount { link: LinkState; backing?: CredentialBacking; orders: ReconciledOrder[]; fetched_at?: string; listed_platinum: number; flagged: number; listable: string[]; presence: PresenceView }

export interface AppView {
  collection: {
    items: CollectionItem[]
    total_entries: number
    snapshot?: { observed_at: number; game_build: string; source: string } | null
    pricing?: PricingProgress | null
  }
  mastery: MasteryChecklist
  reward: { cards: RewardCard[]; best_value_index: number | null; best_ducat_index: number | null }
  market_account: MarketAccount
  health: {
    game_reader: BackendHealth
    log_monitor: BackendHealth
    capture: BackendHealth
    catalog: BackendHealth
    market: BackendHealth
    collection_prices: BackendHealth
    database: BackendHealth
    market_account: BackendHealth
    acquisition_stages: AcquisitionStageHealth[]
  }
}
export type AccessMode = 'companion' | 'overlay' | 'full'
export interface SetupStatus {
  setup_complete: boolean
  access_mode: AccessMode | null
  desktop_capture_action_available: boolean
}

/**
 * Copies of a part the recipe takes (`uses`) and copies held. The strip's fraction starts at two
 * uses: for a part needed once, the game's own owned badge beside the strip already shows the count.
 */
export interface KioskMastery { held: number; uses: number }
/** One grid tile's corner chip, kept when its price, its mastery or both resolve. */
export interface CellChip { col: number; row: number; name: string; platinum: number | null; mastery: KioskMastery | null }
/** One basket row's platinum value; the game already draws the row's ducats. */
export interface BasketChip { index: number; name: string; platinum: number | null }
/** One poller epoch's whole overlay payload. */
export interface KioskView {
  session: number
  epoch: number
  cells: CellChip[]
  basket: BasketChip[]
  total_plat: number
  scroll_dy: number
  /** `unavailable` is the preference on with no live inventory behind it; the overlay says so once. */
  mastery_status: 'off' | 'live' | 'unavailable'
}

export const getView = () => invoke<AppView>('get_view')

export type Refinement = 'intact' | 'exceptional' | 'flawless' | 'radiant'
export type RelicRarity = 'common' | 'uncommon' | 'rare'
/** One reward of a relic at its refinement. `ducats` absent: Baro does not take it, or the values have not loaded. */
export interface RelicReward { name: string; rarity: RelicRarity | null; chance: number | null; platinum: number | null; ducats: number | null; owned: number; mastery?: MasteryMark }
/** What one opening returns on average: chance × price over the priced rewards. `unpriced` rewards are left out, so it is a floor. */
export interface RelicOpening { platinum: number; ducats: number | null; unpriced: number; unpriced_chance: number }
export interface Relic { id: string; name: string; era: string; refinement: Refinement | null; quantity: number; vaulted: boolean | null; platinum: number | null; monthly_trades: number | null; opening: RelicOpening | null; rewards: RelicReward[] }
/** `catalog` false: WFCD's relic tables are not loaded. `prices_date` null: no price table yet. */
export interface RelicsView { catalog: boolean; prices_date: string | null; ducats: boolean; relics: Relic[] }
export const getRelics = () => invoke<RelicsView>('get_relics')
export const getKioskView = () => invoke<KioskView | null>('get_kiosk_view')

export type Era = 'lith' | 'meso' | 'neo' | 'axi' | 'requiem' | 'omnia'
export type CyclePlace = 'earth' | 'cetus' | 'vallis' | 'cambion'
export type CycleState = 'day' | 'night' | 'warm' | 'cold' | 'fass' | 'vome'
/** `expiry`s are Unix milliseconds: the page counts down to them itself. */
export interface Cycle { place: CyclePlace; state: CycleState; expiry: number }
/** Names as WFCD's table gives them, in English; a node it does not know is its code, with no planet. */
export interface WorldNode { name: string; planet: string | null; enemy: string | null }
/** `mission_type` is WFCD's English name ("Mobile Defense"), which the catalogs translate. */
export interface Fissure { id: string; era: Era; mission_type: string; node: WorldNode; steel_path: boolean; expiry: number }
export interface WorldMission { mission_type: string; node: WorldNode }
/** A sortie or an archon hunt. */
export interface Sortie { boss: string; faction: string | null; missions: WorldMission[]; expiry: number }
export interface WorldView {
  cycles: Cycle[]
  fissures: Fissure[]
  storms: Fissure[]
  sortie: Sortie | null
  archon_hunt: Sortie | null
  baro: { activation: number; expiry: number; relay: WorldNode } | null
  /** When this state was downloaded; `stale` when the latest attempt failed and this is the one before. */
  fetched_at: number
  stale: boolean
}
/** The game's public world state, kept a minute by the backend. */
export const getWorldState = () => invoke<WorldView>('get_world_state')
export const refreshInventory = () => invoke<AppView>('refresh_inventory')
export const refreshPrices = (ids: string[]) => invoke<AppView>('refresh_prices', { itemIds: ids })
export const loadFakeSession = () => invoke<AppView>('load_fake_session')
export interface CollectedReport { folder_path: string; report_text: string; ee_log_included: boolean }

export const collectReport = () => invoke<CollectedReport>('collect_report')
export const collectReportText = () => invoke<string>('collect_report_text')
/**
 * Setup status, waiting out a backend that has not finished starting.
 *
 * Tauri builds the windows before it runs the setup hook, so the webview can reach `invoke`
 * before the runtime is managed, and the first thing setup does is open SQLite, which on a cold
 * first run is slow enough to lose that race. One failure here is not "the backend is
 * unavailable", it is "the backend is still starting"; only a persistent one is worth telling the
 * player about. The retry belongs to the startup call site, which is the only call that races
 * Tauri's setup hook; periodic status polls pass one attempt.
 */
export async function getSetupStatus(attempts = 12, delayMs = 250): Promise<SetupStatus> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await invoke<SetupStatus>('get_setup_status')
    } catch (error) {
      if (attempt >= attempts) throw error
      await new Promise(resolve => setTimeout(resolve, delayMs))
    }
  }
}
export const setAccessMode = (accessMode: AccessMode) => invoke<SetupStatus>('set_access_mode', { accessMode })
export const authorizeScreenCapture = () => invoke<SetupStatus>('authorize_screen_capture')

/** Preferences the backend owns; the overlays never read browser storage for them. */
export type Language = 'en' | 'fr'
/** `language` absent or null follows the system language. */
export interface Preferences { mastery_marks: boolean; language?: Language | null }
export const getPreferences = () => invoke<Preferences>('get_preferences')
export const setMasteryMarks = (enabled: boolean) => invoke<Preferences>('set_mastery_marks', { enabled })
export const setLanguage = (language: Language | null) => invoke<Preferences>('set_language', { language })

export const marketStatus = () => invoke<AppView>('market_status')
export const marketSignIn = (email: string, password: string) => invoke<AppView>('market_sign_in', { email, password })
export const marketLinkToken = (token: string) => invoke<AppView>('market_link_token', { token })
export const marketSignOut = () => invoke<AppView>('market_sign_out')
export const refreshOrders = () => invoke<AppView>('refresh_orders')
export const removeOrder = (orderId: string) => invoke<AppView>('remove_order', { orderId })
export const setOrderQuantity = (orderId: string) => invoke<AppView>('set_order_quantity', { orderId })
export const setMarketPresence = (status: Presence | null, auto: boolean) =>
  invoke<AppView>('set_market_presence', { status, auto })
export const createOrder = (collectionId: string, platinum: number, quantity: number, visible: boolean) =>
  invoke<AppView>('create_order', { collectionId, platinum, quantity, visible })
export const updateOrder = (orderId: string, platinum: number, quantity: number) =>
  invoke<AppView>('update_order', { orderId, platinum, quantity })
/** Mark `quantity` of a sell listing sold: the whole listing closes it, less lowers it. Whole trades only. */
export const closeOrder = (orderId: string, quantity: number) => invoke<AppView>('close_order', { orderId, quantity })

/** The item sheet: what the catalogue already loaded says about one row, and what the collection
 * holds of its recipe. Optional fields are absent where the catalogue gives nothing. */
export type Rarity = 'common' | 'uncommon' | 'rare' | 'legendary'
/** `chance` is in percent; `vaulted` is known for relics only. */
export interface DropSource { location: string; chance?: number; rarity?: Rarity; vaulted?: boolean }
export type StatKey = 'health' | 'shield' | 'armor' | 'energy' | 'sprint_speed' | 'damage' | 'critical_chance' | 'critical_multiplier' | 'status_chance' | 'fire_rate' | 'magazine' | 'reload'
/** `held` is absent without a collection to count from. */
export interface ComponentDetail { name: string; image_url?: string; count: number; held?: number; drops: DropSource[] }
export interface ItemDetail {
  /** The wiki's render; the wiki has none under the name for many mods and parts. */
  wiki_image_url?: string
  image_url?: string
  description?: string
  mastery_req?: number
  vaulted?: boolean
  prime: boolean
  introduced?: { name: string; date?: string }
  wiki_url?: string
  /** The English name Overframe lists this item's builds under; absent for what has none. */
  builds_for?: string
  abilities: Array<{ name: string; description: string }>
  stats: Array<{ key: StatKey; value: number }>
  components: ComponentDetail[]
  drops: DropSource[]
}
export const getItemDetail = (itemId: string) => invoke<ItemDetail>('get_item_detail', { itemId })
/** One of Overframe's best builds, in its order. `updated` is ISO 8601; `url` is the build's page
 * on overframe.gg. */
export interface Build { title: string; author: string | null; score: number; formas: number; updated: string; url: string }
export const getItemBuilds = (itemName: string) => invoke<Build[]>('get_item_builds', { itemName })

export type InstallKind = 'appimage' | 'system_linux' | 'portable_win' | 'system_win' | 'unknown'
export interface VersionInfo { version: string; channel: string; kind: InstallKind; writable: boolean; updatable: boolean; manager: string | null; manager_command: string | null }
export interface UpdateSummary { version: string; current_version: string; notes: string | null; date: string | null; feed: string }
export interface CheckResult { kind: InstallKind; updatable: boolean; update: UpdateSummary | null }
export const getVersionInfo = () => invoke<VersionInfo>('get_version_info')
export const updateCheck = (feed: string) => invoke<CheckResult>('update_check', { feed })
export const updateDownloadAndInstall = (feed: string, expectedVersion: string) =>
  invoke<UpdateSummary>('update_download_and_install', { feed, expectedVersion })

/** One Market search suggestion. The figures come from the daily summary; `held` names the
 * collection rows that hold the item. */
export interface MarketHit {
  id: string
  slug: string
  name: string
  thumb_url: string | null
  max_rank: number | null
  median: number | null
  median_max_rank: number | null
  checked_live: boolean
  monthly_trades: number | null
  held: string[]
}
/** `dump_date` is the day the daily summary describes, null until it has loaded. */
export interface MarketSearch { hits: MarketHit[]; dump_date: string | null }
export type TraderStatus = 'ingame' | 'online'
/** `platinum` buys one trade of `per_trade` units. */
export interface LiveOrder { user: string; status: TraderStatus; platinum: number; quantity: number; per_trade: number; rank: number | null; subtype: string | null }
/** `fetched_at` is when warframe.market answered, in Unix seconds; a cached answer keeps it. */
export interface MarketItemOrders { sell: LiveOrder[]; buy: LiveOrder[]; fetched_at: number }
export const marketSearch = (query: string) => invoke<MarketSearch>('market_search', { query })
export const marketItemOrders = (slug: string) => invoke<MarketItemOrders>('market_item_orders', { slug })
/** One variant's day on warframe.market (a change row: one item). `median` is what it traded at, or on a
 * change row the price the change is measured on; `traded` the platinum that changed hands; `change` the
 * 7-day move, 0.22 for +22%. */
export interface BoardRow { name: string; subtype: string | null; rank: number | null; sales: number; listings: number; median: number; traded: number; change: number | null }
/** The Market page's rankings, from the daily summary. `date` null until one carrying its day's trades
 * has loaded; `earlier_date` null until the one a week before it has. `hits` is the item each row's
 * name opens; a name it lacks opens nothing. */
export interface MarketBoard {
  date: string | null
  earlier_date: string | null
  most_sold: BoardRow[]
  fastest: BoardRow[]
  most_platinum: BoardRow[]
  rising: BoardRow[]
  falling: BoardRow[]
  hits: Record<string, MarketHit>
}
export const marketBoard = () => invoke<MarketBoard>('market_board')
/** The Foundry page, built from what the backend already holds. `status` names what it waits for. */
export type FoundryStage = 'ready' | 'almost' | 'set'
/** One recipe slot. A part counts its blueprint too; builds already in the foundry are not in hand. */
export interface FoundryPiece { name: string; image: string | null; kind: 'blueprint' | 'part' | 'ingredient'; uses: number; held: number; platinum?: number; drops: string[] }
/** Only resources the inventory can count are sent. */
export interface FoundryResource { name: string; uses: number; held: number }
export interface FoundryItem { id: string; name: string; category?: ItemCategory; image_url?: string; masterable: boolean; mastered: boolean; stage: FoundryStage; missing: number; pieces: FoundryPiece[]; resources: FoundryResource[]; set_platinum?: number; pieces_platinum?: number }
export interface FoundryView { status: 'no_catalog' | 'no_inventory' | 'ready'; items: FoundryItem[] }
export const getFoundry = () => invoke<FoundryView>('get_foundry')
/** How fast an item sells: `fast` from 30 sales a month, `fair` from 10. */
export type Pace = 'fast' | 'fair' | 'slow'
/** A held stack: `value` is what a month's sales take of it (the Collection's sellable value). `change` is the 7-day move, 0.22 for +22%. `market` is warframe.market's name. */
export interface FarmSell { id: string; name: string; quantity: number; platinum: number; monthly_trades: number | null; value: number; pace: Pace; change: number | null; market: string | null }
/** A held relic: `value` is one solo opening on average, each reward weighed by its sales. */
export interface FarmOpen { id: string; name: string; refinement: Refinement | null; quantity: number; vaulted: boolean | null; value: number; pace: Pace; change: number | null; market: string | null }
/** One thing that falls at a place: `chance` in percent per run, `unit` one copy at its price (a relic: the better of opening and selling it), `value` its share of the run. */
export interface FarmDrop { name: string; chance: number; unit: number; value: number; relic: boolean; monthly_trades: number | null; change: number | null }
/** One run of a place: `value` is the platinum expected, sales counted. */
export interface FarmPlace { location: string; value: number; pace: Pace; drops: FarmDrop[] }
export interface FarmTrend { name: string; change: number; platinum: number; monthly_trades: number; held: number }
/** `prices_date`/`earlier_date` null: that dump has not loaded. `drops`/`relic_tables` false: the catalogue or relic tables are missing. */
export interface FarmView { prices_date: string | null; earlier_date: string | null; drops: boolean; relic_tables: boolean; sell: FarmSell[]; open: FarmOpen[]; farm: FarmPlace[]; trends: FarmTrend[] }
export const getFarm = () => invoke<FarmView>('get_farm')
/** One day of completed trades at rank 0, oldest first. */
export interface DayTrades { date: string; median: number; volume: number }
export const marketItemHistory = (name: string) => invoke<DayTrades[]>('market_item_history', { name })
