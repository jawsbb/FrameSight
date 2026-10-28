import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import './App.css'
import {
  authorizeScreenCapture,
  getPreferences,
  getSetupStatus,
  getVersionInfo,
  getView,
  marketLinkToken,
  marketSignIn,
  marketSignOut,
  marketStatus,
  refreshInventory,
  refreshOrders,
  refreshPrices,
  removeOrder,
  createOrder,
  updateOrder,
  setMarketPresence,
  setAccessMode,
  setMasteryMarks,
  setOrderQuantity,
  type AppView,
  type BackendHealth,
  type AccessMode,
  type CollectionItem,
  type HealthState,
  type ItemCategory,
  type SetupStatus,
  type MarketOrder,
  type Presence,
} from './backend'
import { hideRewardOverlay, showRewardOverlay } from './overlay'
import { copyReport, openIssue, saveReport } from './report'
import { closeWindow, minimizeWindow, readWindowMaximized, toggleMaximizeWindow, watchWindowResized } from './window'
import { RewardCards } from './RewardCards'
import { MetalMark } from './MetalMark'
import { OrdersView } from './OrdersView'
import { isListable, listedLabel, listedOrderFor } from './orders'
import { SellForm, type SellHandler, type UpdateHandler } from './SellForm'
import { atMaxRank, collectionTotals, masteryOrder, pageNumbers, pageWindow, rankLabel, stackValue } from './collection'
import { MAX_PRICE_FLOOR, readPriceFloor, readShowDucats, writePriceFloor, writeShowDucats } from './settings'
import { snapshotFreshness, stampReading } from './freshness'
import { bootUpdateChecks } from './updateStore'
import { version as APP_VERSION } from '../package.json'
import { UpdateMark, UpdatesSetting } from './UpdateSettings'
import { reportBlockVisible } from './reportable'
import { AccessSelector } from './AccessSelector'
import { accessMode } from './access'

type Page = 'collection' | 'mastery' | 'rewards' | 'orders' | 'diagnostics' | 'settings'
type Ownership = 'all' | 'owned' | 'mastered' | 'missing' | 'tradeable'
type Sort = 'name-asc' | 'quantity-desc' | 'category-asc' | 'mastery-asc' | 'platinum-desc' | 'ducats-desc'
type MasterySort = 'arsenal-first' | 'name-asc' | 'category-asc'

/** The filters of each grid page. Held by `App` so they survive a change of tab. */
type CollectionFilters = { search: string; category: ItemCategory | 'all'; ownership: Ownership; sort: Sort; page: number }
type MasteryFilters = { search: string; category: ItemCategory | 'all'; sort: MasterySort; page: number }
const initialCollectionFilters: CollectionFilters = { search: '', category: 'all', ownership: 'all', sort: 'name-asc', page: 1 }
const initialMasteryFilters: MasteryFilters = { search: '', category: 'all', sort: 'arsenal-first', page: 1 }

const categories: Array<{ value: ItemCategory | 'all'; label: string }> = [
  { value: 'all', label: 'All categories' },
  { value: 'frame', label: 'Frame' },
  { value: 'weapon', label: 'Weapon' },
  { value: 'companion', label: 'Companion' },
  { value: 'prime_part', label: 'Prime Parts' },
  { value: 'relic', label: 'Relic' },
  { value: 'resource', label: 'Resource' },
  { value: 'blueprint', label: 'Blueprint' },
  { value: 'vehicle', label: 'Vehicle' },
  { value: 'mod', label: 'Mod' },
  { value: 'arcane', label: 'Arcane' },
]

// Ducats is offered only while the ducat values are on screen.
const sortOptions: Array<{ value: Sort; label: string }> = [
  { value: 'name-asc', label: 'Name A–Z' },
  { value: 'quantity-desc', label: 'Quantity' },
  { value: 'category-asc', label: 'Category' },
  { value: 'mastery-asc', label: 'Unmastered first' },
  { value: 'platinum-desc', label: 'Platinum' },
  { value: 'ducats-desc', label: 'Ducats' },
]

// What is held can be ranked tonight; what was never held is a hunt. The default order says so.
const masterySortOptions: Array<{ value: MasterySort; label: string }> = [
  { value: 'arsenal-first', label: 'In arsenal first' },
  { value: 'name-asc', label: 'Name A–Z' },
  { value: 'category-asc', label: 'Category' },
]

const categoryName = Object.fromEntries(categories.map(category => [category.value, category.label])) as Record<ItemCategory | 'all', string>

const monthAbbr = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** `2026-07-27` -> `27 Jul`. Formatted by hand rather than `Intl`, whose month/day order follows
 * the runtime locale. This reading has to look the same on every machine it runs on. */
function shortDumpDate(isoDate: string): string {
  const [, month, day] = isoDate.split('-').map(Number)
  return `${day} ${monthAbbr[month - 1]}`
}

const pages: Page[] = ['collection', 'mastery', 'rewards', 'orders', 'diagnostics', 'settings']

const pageLabel: Record<Page, string> = {
  collection: 'Collection',
  mastery: 'Mastery',
  rewards: 'Rewards',
  orders: 'Orders',
  diagnostics: 'Diagnostics',
  settings: 'Settings',
}

/** `1 choice`, `4 choices`: a nav badge's count, said in words for its accessible name. */
function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}

/** Line icons on a 24px grid, one round stroke throughout. */
function Icon({ name }: { name: Page | 'refresh' | 'search' | 'previous' | 'next' }) {
  const paths = {
    collection: <><rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/></>,
    mastery: <><circle cx="12" cy="12" r="8.5"/><path d="m8.5 12.2 2.4 2.4 4.6-5.1"/></>,
    rewards: <><path d="M7.5 4h9v5a4.5 4.5 0 0 1-9 0z"/><path d="M7.5 6H5a2.5 2.5 0 0 0 2.6 3.4M16.5 6H19a2.5 2.5 0 0 1-2.6 3.4M12 13.5V17M8.5 20h7"/></>,
    orders: <><path d="M6 3.5h12v17l-3-2-3 2-3-2-3 2z"/><path d="M9 8.5h6M9 12.5h4"/></>,
    diagnostics: <path d="M3 12h4l2.5-6.5 5 13 2.5-6.5h4"/>,
    settings: <><path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/></>,
    refresh: <><path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 4.5v4h-4"/></>,
    search: <><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></>,
    previous: <path d="m14.5 6-6 6 6 6"/>,
    next: <path d="m9.5 6 6 6-6 6"/>,
  }
  return <svg className="icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>
}

/** A health state as a shape and a colour, never colour alone: a full dot is ready, a ring is
 * idle, a triangle is degraded, a cross is failed. Paired with the state in words wherever used. */
function StateIcon({ state }: { state: HealthState }) {
  return <svg className={`state-icon ${state}`} viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    {state === 'ready' ? <circle cx="8" cy="8" r="4.5" fill="currentColor" stroke="none"/>
      : state === 'idle' ? <circle cx="8" cy="8" r="4.25"/>
        : state === 'degraded' ? <><path d="M8 2.75 14 13.25H2z"/><path d="M8 7v2.5"/><path d="M8 11.4v.1"/></>
          : <path d="m4 4 8 8M12 4l-8 8"/>}
  </svg>
}

/**
 * Minimize, maximize and close. The maximize control is named by what it does next (restore while
 * maximized), because a button whose name never changes cannot say which press undoes the other.
 */
function WindowControls() {
  const [maximized, setMaximized] = useState(false)
  useEffect(() => {
    let active = true
    let unlisten: (() => void) | undefined
    void readWindowMaximized().then(value => { if (active) setMaximized(value) })
    void watchWindowResized(() => {
      void readWindowMaximized().then(value => { if (active) setMaximized(value) })
    }).then(fn => {
      if (active) unlisten = fn
      else fn()
    })
    return () => {
      active = false
      unlisten?.()
    }
  }, [])
  return <div className="window-controls" role="group" aria-label="Window">
    <button type="button" className="window-control" aria-label="Minimize window" onClick={() => { void minimizeWindow() }}>
      <svg viewBox="0 0 10 10" aria-hidden="true"><path d="M1 5h8"/></svg>
    </button>
    <button type="button" className="window-control" aria-label={maximized ? 'Restore window' : 'Maximize window'} onClick={() => { void toggleMaximizeWindow() }}>
      {maximized
        ? <svg viewBox="0 0 10 10" aria-hidden="true"><path d="M3.5 3.5h5v5h-5zM6.5 3.5v-2h-5v5h2"/></svg>
        : <svg viewBox="0 0 10 10" aria-hidden="true"><path d="M1.5 1.5h7v7h-7z"/></svg>}
    </button>
    <button type="button" className="window-control close" aria-label="Close window" onClick={() => { void closeWindow() }}>
      <svg viewBox="0 0 10 10" aria-hidden="true"><path d="M1 1l8 8M9 1L1 9"/></svg>
    </button>
  </div>
}

/** The window has no compositor decorations: this bar is its titlebar. `deep` makes every part of
 * it a grab handle except the controls standing on it. */
function TitleBar() {
  return <header className="titlebar" data-tauri-drag-region="deep">
    <span className="wordmark">TennoScope</span>
    <WindowControls/>
  </header>
}

function App() {
  const [setupStatus, setSetupStatus] = useState<SetupStatus | null>(null)
  // Nothing is chosen for the player on first run; the effective mode fills this once there is one.
  const [selectedMode, setSelectedMode] = useState<AccessMode | null>(null)
  const [modeBusy, setModeBusy] = useState(false)
  const [modeError, setModeError] = useState<string | null>(null)
  const [view, setView] = useState<AppView | null>(null)
  const [page, setPage] = useState<Page>('collection')
  const [busy, setBusy] = useState(false)
  const [pricing, setPricing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [clock, setClock] = useState(() => new Date())
  const [priceFloor, setPriceFloor] = useState(readPriceFloor)
  const [showDucats, setShowDucats] = useState(readShowDucats)
  const [ordersBusy, setOrdersBusy] = useState(false)
  const [ordersError, setOrdersError] = useState<string | null>(null)
  const [ordersNote, setOrdersNote] = useState<string | null>(null)
  const [captureNote, setCaptureNote] = useState<string | null>(null)
  const [collectionFilters, setCollectionFilters] = useState(initialCollectionFilters)
  const [masteryFilters, setMasteryFilters] = useState(initialMasteryFilters)
  const viewGeneration = useRef(0)
  const foregroundInFlight = useRef(0)
  const setupGeneration = useRef(0)
  const captureAuthorizationInFlight = useRef(false)
  const modeTransitionInFlight = useRef(false)
  const effectiveModeRef = useRef<AccessMode | null>(null)
  const [captureAuthorizationBusy, setCaptureAuthorizationBusy] = useState(false)

  const requestView = useCallback(async (request: () => Promise<AppView>, failure: string) => {
    const generation = ++viewGeneration.current
    try {
      const next = await request()
      if (generation === viewGeneration.current) {
        setView(next)
        setError(null)
      }
    } catch {
      if (generation === viewGeneration.current) setError(failure)
    }
  }, [])

  const runForeground = useCallback(async (operation: () => Promise<void>) => {
    foregroundInFlight.current += 1
    // A write owns the setup state it returns. Retire any poll that started before the write so
    // its older snapshot cannot land after the operation has completed.
    setupGeneration.current += 1
    try { await operation() }
    finally { foregroundInFlight.current -= 1 }
  }, [])

  const requestMarketStatus = useCallback(async () => {
    try {
      const next = await marketStatus()
      // Merge rather than replace: `getView` at startup is the source of truth for everything
      // else, and adopting only the fields this command owns keeps the two calls independent
      // races instead of one clobbering the other's result.
      setView(current => current ? { ...current, market_account: next.market_account, health: { ...current.health, market_account: next.health.market_account } } : next)
    } catch {
      // Startup already surfaces a failure via `getView` if the backend is down; a market-status
      // miss on top of that would just repeat the same alert.
    }
  }, [])

  useEffect(() => {
    getSetupStatus()
      .then(async status => {
        effectiveModeRef.current = status.access_mode
        setSetupStatus(status)
        if (status.access_mode) setSelectedMode(status.access_mode)
        if (status.setup_complete) {
          await requestView(getView, 'The local application backend is unavailable.')
          await requestMarketStatus()
        }
      })
      .catch(() => setError('The local application backend is unavailable.'))
  }, [requestView, requestMarketStatus])

  useEffect(() => {
    if (!setupStatus?.setup_complete) return
    let active = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const schedule = () => { if (active) timer = setTimeout(poll, 2500) }
    const poll = async () => {
      if (document.hidden || foregroundInFlight.current > 0) { schedule(); return }
      const generation = ++setupGeneration.current
      await Promise.all([
        requestView(getView, 'The live backend view could not be updated.'),
        getSetupStatus(1).then(status => {
          if (active && generation === setupGeneration.current) {
            const modeChanged = status.access_mode !== effectiveModeRef.current
            effectiveModeRef.current = status.access_mode
            setSetupStatus(status)
            if (modeChanged && status.access_mode && !modeTransitionInFlight.current) {
              setSelectedMode(status.access_mode)
            }
          }
        }).catch(() => {
          // `getView` owns the shared backend failure banner. Keep the last known capture action
          // rather than hiding it because one capability poll failed.
        }),
      ])
      schedule()
    }
    schedule()
    return () => {
      active = false
      setupGeneration.current += 1
      viewGeneration.current += 1
      clearTimeout(timer)
    }
  }, [setupStatus?.setup_complete, requestView])

  useEffect(() => {
    const timer = setInterval(() => setClock(new Date()), 30_000)
    return () => clearInterval(timer)
  }, [])

  // Update checks live outside the 2.5s backend poll: daily, not live.
  useEffect(() => {
    bootUpdateChecks()
  }, [])

  async function changeAccessMode(next: AccessMode) {
    if (modeTransitionInFlight.current) return
    modeTransitionInFlight.current = true
    const previous = setupStatus?.access_mode ?? null
    setModeBusy(true)
    setModeError(null)
    try {
      await runForeground(async () => {
        const status = await setAccessMode(next)
        effectiveModeRef.current = status.access_mode
        setSetupStatus(status)
        if (status.access_mode) setSelectedMode(status.access_mode)
        await requestView(getView, 'The local application backend is unavailable.')
        // Reconciliation depends on the effective mode: without this a Full-to-Companion
        // downgrade keeps Full-era verified ownership and sellable flags until the player
        // happens to open Orders. The helper merges only what it owns and stays silent on
        // failure, so it is safe on every successful transition, not just first run.
        await requestMarketStatus()
      })
    } catch {
      const active = previous ? accessMode(previous).name : 'No mode'
      // Keep the pending selection on every failure direction so retry is one Confirm click;
      // the effective mode beside it still names what is actually active.
      setModeError(`Could not change Warframe access. ${active} remains active. Review the mode and try again.`)
    } finally {
      modeTransitionInFlight.current = false
      setModeBusy(false)
    }
  }

  async function authorizeCapture() {
    if (captureAuthorizationInFlight.current) return
    captureAuthorizationInFlight.current = true
    setCaptureAuthorizationBusy(true)
    // The desktop chooser is human-paced and may remain open indefinitely. Retire setup polls
    // already in flight, but leave view polling alive while the chooser owns the user's attention.
    const generation = ++setupGeneration.current
    try {
      const status = await authorizeScreenCapture()
      if (generation === setupGeneration.current) {
        effectiveModeRef.current = status.access_mode
        setSetupStatus(status)
      }
    } finally {
      captureAuthorizationInFlight.current = false
      setCaptureAuthorizationBusy(false)
    }
  }
  async function refresh() {
    setBusy(true)
    setError(null)
    await runForeground(() => requestView(refreshInventory, 'Inventory refresh failed. Check diagnostics for acquisition health.'))
    setBusy(false)
  }

  /**
   * Deliberately outside `runForeground`: a page refresh prices up to forty-eight items at three
   * requests a second, so it is on the wire for about sixteen seconds, and the whole promise of it
   * is that prices appear as they land. That only happens if the 2.5s poll keeps running through
   * it. Ordering remains coherent: `requestView` applies a response only while its request is
   * newest one started, so an older view can never land on top of a newer one.
   *
   * The local flag exists only to hold the control down for the up-to-2.5s gap before the poll
   * carries the backend's own progress. The counting is the backend's: it is the only party that
   * knows the total, and it publishes the count the same way for every pass.
   */
  async function priceLive(ids: string[]) {
    setPricing(true)
    await requestView(() => refreshPrices(ids), 'Live prices could not be fetched.')
    setPricing(false)
  }

  /**
   * Every market write goes through here: fresh view on success, a banner on failure. The optional
   * note is spoken once, on success only. The badge appearing is the sighted player's
   * confirmation, and the note is the same confirmation for anyone not looking at it.
   */
  async function ordersOperation(
    operation: () => Promise<AppView>,
    failure: string,
    note?: (next: AppView) => string,
  ) {
    setOrdersBusy(true)
    setOrdersError(null)
    try {
      const next = await operation()
      setView(next)
      setOrdersNote(note ? note(next) : null)
    } catch {
      setOrdersError(failure)
    } finally {
      setOrdersBusy(false)
    }
  }

  const ordersSignIn = (email: string, password: string) =>
    ordersOperation(() => marketSignIn(email, password), 'Could not sign in to warframe.market.')
  const ordersLinkToken = (token: string) =>
    ordersOperation(() => marketLinkToken(token), 'Could not link with that token.')
  const ordersSignOut = () =>
    ordersOperation(marketSignOut, 'Could not unlink the account.')
  const ordersRefresh = () =>
    ordersOperation(refreshOrders, 'warframe.market could not be reached.')
  const ordersRemove = (orderId: string) =>
    ordersOperation(() => removeOrder(orderId), 'Could not remove that listing.')
  const ordersLowerTo = (orderId: string, _quantity: number) =>
    ordersOperation(() => setOrderQuantity(orderId), 'Could not lower that listing.')
  const ordersPresence = (status: Presence | null, auto: boolean) =>
    ordersOperation(() => setMarketPresence(status, auto), 'Could not change your market status.')
  /** The card's own accessible name: the rank belongs in it because a mod held at two ranks is two
   * cards headed the same word. Shared with the spoken note, so the note says what the card is
   * named. */
  function cardLabel(item: CollectionItem): string {
    return rankLabel(item) ? `${item.name}, ${rankLabel(item)}` : item.name
  }

  const ordersSell = (collectionId: string, platinum: number, quantity: number, visible: boolean) =>
    ordersOperation(
      () => createOrder(collectionId, platinum, quantity, visible),
      'Could not publish that listing.',
      next => {
        const item = next.collection.items.find(entry => entry.id === collectionId)
        return `Listed ${item ? cardLabel(item) : 'the item'} at ${platinum} platinum × ${quantity}`
      },
    )
  const ordersUpdate = (orderId: string, platinum: number, quantity: number) =>
    ordersOperation(
      () => updateOrder(orderId, platinum, quantity),
      'Could not update that listing.',
      next => {
        const name = next.market_account.orders.find(entry => entry.order.id === orderId)?.name
        return `Listing updated: ${name ?? 'the item'} at ${platinum} platinum × ${quantity}`
      },
    )

  function openPage(next: Page) {
    setPage(next)
    if (next === 'orders') void ordersRefresh()
  }

  // The update mark deep-links to the Updates section, not just Settings:
  // opening the page alone leaves the section below the fold on long settings.
  const updatesFocusPending = useRef(false)
  function openUpdates(): void {
    if (page === 'settings') {
      requestUpdatesFocus()
      return
    }
    updatesFocusPending.current = true
    openPage('settings')
  }
  function requestUpdatesFocus(): void {
    // Let Settings commit first; the section exists only after the page swap.
    setTimeout(() => {
      document.getElementById('updates-setting')?.scrollIntoView({ block: 'start' })
      document.getElementById('updates-title')?.focus({ preventScroll: true })
    }, 0)
  }
  useEffect(() => {
    if (page === 'settings' && updatesFocusPending.current) {
      updatesFocusPending.current = false
      requestUpdatesFocus()
    }
  }, [page])

  if (setupStatus === null && !error) return <main className="holding"><div className="streak" aria-hidden="true"/><p>Starting TennoScope…</p></main>
  if (!setupStatus?.setup_complete) return <SetupScreen selected={selectedMode} busy={modeBusy} error={modeError ?? error} onSelect={setSelectedMode} onContinue={mode => { void changeAccessMode(mode) }}/>

  const effectiveMode = setupStatus.access_mode ?? 'companion'
  const liveState = view?.health.game_reader.state ?? 'degraded'
  const freshness = snapshotFreshness(view?.collection.snapshot, clock)
  const readerState: HealthState = effectiveMode === 'companion' ? 'idle' : liveState
  const readerDetail = effectiveMode === 'companion' ? 'Using saved and reference data' : view?.health.game_reader.message ?? 'Connecting to local backend'
  const navCount: Partial<Record<Page, number>> = { rewards: view?.reward.cards.length, orders: view?.market_account.flagged }
  const settingsMode = selectedMode ?? effectiveMode
  return <div className="shell">
    <TitleBar/>

    <aside className="sidebar">
      <nav className="nav" aria-label="Primary">
        {pages.map(item => {
          const count = navCount[item] ?? 0
          return <button
            key={item}
            type="button"
            className="nav-item"
            aria-label={count ? `${pageLabel[item]}, ${item === 'rewards' ? plural(count, 'choice', 'choices') : plural(count, 'needs attention', 'need attention')}` : pageLabel[item]}
            title={pageLabel[item]}
            aria-current={page === item ? 'page' : undefined}
            onClick={() => openPage(item)}
          >
            <Icon name={item}/>
            <span className="nav-label">{pageLabel[item]}</span>
            {count > 0 && <span className="nav-count" aria-hidden="true">{count}</span>}
          </button>
        })}
      </nav>
      <section className="sidebar-foot" aria-label="Runtime operations">
        <div className={`reader ${readerState}`} title={readerDetail}>
          <StateIcon state={readerState}/>
          <span className="reader-text">
            <strong role="status">{effectiveMode === 'companion' ? 'Companion mode' : readerWord[liveState]}</strong>
            <small>{readerDetail}</small>
          </span>
        </div>
        {view && <span className="snapshot-age" title={freshness.detail}>{freshness.label}<span className="sr-only">, {freshness.detail}</span></span>}
        <button type="button" className="stamp refresh" onClick={refresh} disabled={busy || modeBusy || setupStatus?.access_mode !== 'full'} aria-describedby={setupStatus?.access_mode !== 'full' ? 'inventory-access-note' : undefined}>
          <Icon name="refresh"/><span className="refresh-label">{busy ? 'Refreshing…' : 'Refresh inventory'}</span>
        </button>
        {setupStatus?.access_mode !== 'full' && <span id="inventory-access-note" className="sr-only">Full access is required to acquire inventory. The saved snapshot remains available.</span>}
        <UpdateMark onOpen={openUpdates}/>
      </section>
    </aside>

    <main className="content">
      {error && <p className="error-banner" role="alert">{error}</p>}
      {/* A sell can be started from a collection card, and its failure has to be readable where it
          was started. The orders screen renders this itself, in the block that owns the recovery. */}
      {ordersError && page !== 'orders' && <p className="error-banner" role="alert">{ordersError}</p>}
      {/* Always in the document, spoken only when a write leaves a word in it: a live region that
          appears and disappears with its content is not announced by every reader. */}
      <p className="sr-only" role="status">{ordersNote}</p>
      {!view ? <LoadingView/> : <>
        {page === 'collection' && <CollectionPage view={view} effectiveMode={effectiveMode} filters={collectionFilters} onFilters={setCollectionFilters} pricing={pricing} onPriceLive={priceLive} priceFloor={priceFloor} showDucats={showDucats} onToggleDucats={() => {
          writeShowDucats(!showDucats)
          setShowDucats(!showDucats)
        }} onOpenMastery={() => openPage('mastery')} onSell={ordersSell} onUpdate={ordersUpdate} ordersBusy={ordersBusy}/>}
        {page === 'mastery' && <MasteryPage view={view} filters={masteryFilters} onFilters={setMasteryFilters} onSell={ordersSell} onUpdate={ordersUpdate} ordersBusy={ordersBusy}/>}
        {page === 'rewards' && <RewardPage view={view} effectiveMode={effectiveMode}/>}
        {page === 'orders' && <OrdersView
          account={view.market_account}
          onSignIn={ordersSignIn}
          onLinkToken={ordersLinkToken}
          onSignOut={ordersSignOut}
          onRefresh={ordersRefresh}
          onRemove={ordersRemove}
          onLowerTo={ordersLowerTo}
          onSell={ordersSell}
          onUpdate={ordersUpdate}
          onPresence={ordersPresence}
          items={view.collection.items}
          busy={ordersBusy}
          error={ordersError}
        />}
        {page === 'diagnostics' && <DiagnosticsPage view={view} effectiveMode={effectiveMode}/>}
        {page === 'settings' && <SettingsPage view={view} priceFloor={priceFloor} effectiveMode={effectiveMode} selectedMode={settingsMode} modeBusy={modeBusy} modeError={modeError} onSelectMode={mode => {
          setSelectedMode(mode)
          setModeError(null)
        }} onConfirmMode={() => { void changeAccessMode(settingsMode) }} desktopCaptureActionAvailable={setupStatus?.desktop_capture_action_available ?? false} captureAuthorizationBusy={captureAuthorizationBusy} captureNote={captureNote} onCaptureNote={setCaptureNote} onAuthorizeCapture={authorizeCapture} onPriceFloor={floor => {
          setPriceFloor(floor)
          writePriceFloor(floor)
        }}/>}
      </>}
    </main>
  </div>
}

function SetupScreen({ selected, busy, error, onSelect, onContinue }: { selected: AccessMode | null; busy: boolean; error: string | null; onSelect: (mode: AccessMode) => void; onContinue: (mode: AccessMode) => void }) {
  return <div className="setup-shell">
    <TitleBar/>
    <main className="setup">
      <section className="setup-panel" aria-labelledby="setup-title">
        <h1 id="setup-title" className="page-title">Choose Warframe access</h1>
        <p className="prose">Each level includes the previous level. Nothing starts until you confirm.</p>
        <AccessSelector value={selected} onChange={onSelect} applyingMode={busy ? selected : null} disabled={busy}/>
        {error && <p className="error-banner" role="alert">{error}</p>}
        <button type="button" className="stamp primary setup-confirm" onClick={() => { if (selected) onContinue(selected) }} disabled={busy || !selected} aria-busy={busy}>
          {!selected ? 'Choose an access level' : busy ? `Applying ${accessMode(selected).name}…` : `Confirm ${accessMode(selected).name}`}
        </button>
      </section>
    </main>
  </div>
}

function LoadingView() {
  return <section className="page" aria-live="polite">
    <div className="page-head">
      <h1 className="page-title">Loading your local collection…</h1>
      <p className="page-note">Reading the latest saved snapshot.</p>
    </div>
    <div className="streak" aria-hidden="true"/>
  </section>
}

function SearchField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="search">
    <Icon name="search"/>
    <input type="search" aria-label={label} placeholder="Search items" value={value} onChange={event => onChange(event.target.value)}/>
  </label>
}

function CollectionPage({ view, effectiveMode, filters, onFilters, pricing, onPriceLive, priceFloor, showDucats, onToggleDucats, onOpenMastery, onSell, onUpdate, ordersBusy }: { view: AppView; effectiveMode: AccessMode; filters: CollectionFilters; onFilters: (filters: CollectionFilters) => void; pricing: boolean; onPriceLive: (ids: string[]) => void; priceFloor: number; showDucats: boolean; onToggleDucats: () => void; onOpenMastery: () => void; onSell: SellHandler; onUpdate: UpdateHandler; ordersBusy: boolean }) {
  const ownershipVerified = effectiveMode === 'full'
  const snapshotOnly = !ownershipVerified
  const { search, category } = filters
  // Ownership cannot be filtered on when it cannot be verified, and ducats cannot be sorted on
  // while their values are hidden: that sort falls back to platinum, in plain sight.
  const ownership = ownershipVerified ? filters.ownership : 'all'
  const sort = !showDucats && filters.sort === 'ducats-desc' ? 'platinum-desc' : filters.sort
  // Any filter change starts again from the first page; only paging keeps the page it asks for.
  const update = (patch: Partial<CollectionFilters>) => onFilters({ ...filters, page: 1, ...patch })
  const { owned, missing, worth, sellable, ducatsAtStake } = collectionTotals(view.collection.items, priceFloor)
  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase()
    return view.collection.items
      .filter(item => !query || item.name.toLocaleLowerCase().includes(query))
      .filter(item => category === 'all' || item.category === category)
      .filter(item => ownership === 'all'
        || (ownership === 'owned' && item.quantity > 0)
        || (ownership === 'mastered' && item.mastered)
        || (ownership === 'missing' && item.quantity === 0)
        || (ownership === 'tradeable' && item.platinum !== undefined))
      .toSorted((left, right) => sort === 'quantity-desc'
        ? right.quantity - left.quantity || left.name.localeCompare(right.name)
        : sort === 'category-asc'
          ? left.category.localeCompare(right.category) || left.name.localeCompare(right.name)
          : sort === 'mastery-asc'
            ? masteryOrder(left) - masteryOrder(right) || left.name.localeCompare(right.name)
            : sort === 'platinum-desc'
              ? (right.platinum ?? -1) - (left.platinum ?? -1) || left.name.localeCompare(right.name)
              : sort === 'ducats-desc'
                ? (right.ducats ?? -1) - (left.ducats ?? -1) || left.name.localeCompare(right.name)
                : left.name.localeCompare(right.name))
  }, [view.collection.items, search, category, ownership, sort])
  const { current: currentPage, total: totalPages, visible: visibleItems, first: firstResult, last: lastResult } = pageWindow(filtered, filters.page)
  // What the refresh can *attempt*, not what already has a number. A relic is priced only if some
  // dump in the last month saw it trade, so a thinly-traded one is unpriced, and excluding unpriced
  // items would close the manual path against exactly the items that need it. `priceable` is the
  // backend's own answer to "can warframe.market be asked about this": it drops every name the
  // price table cannot resolve. Quantity 0 is not owned and is never priceable.
  const pricableVisibleIds = visibleItems.filter(item => item.priceable).map(item => item.id)
  // One readout for the whole page, published by the backend rather than counted here: it is the
  // party that knows the total, and every pass comes out of one rate-limited budget.
  const inProgress = view.collection.pricing ?? null
  const dumpDate = view.health.collection_prices.last_success
  const sorts = showDucats ? sortOptions : sortOptions.filter(option => option.value !== 'ducats-desc')

  return <section className="page" aria-labelledby="collection-title">
    <div className="page-head">
      <h1 id="collection-title" className="page-title">{snapshotOnly ? 'Saved snapshot' : 'Your collection'}</h1>
      <div className="stats">
        <Stat kind="items" value={view.collection.total_entries} label={snapshotOnly ? 'saved entries' : 'items'}/>
        <Stat kind="owned" value={owned} label="owned" aside={`${figure(missing)} missing`}/>
        <Stat
          kind="worth"
          value={worth}
          unit={<MetalMark metal="plat" alt=" platinum"/>}
          label="market value"
          aside={<>{figure(sellable)}<MetalMark metal="plat" alt=" platinum"/> sellable</>}
          note={priceFloor
            ? `Sellable counts only the copies the market buys in a month, at ${priceFloor} platinum and over.`
            : 'Sellable counts only the copies the market buys in a month.'}
        />
        {showDucats && <Stat kind="ducats" value={ducatsAtStake} unit={<MetalMark metal="ducat" alt=" ducats"/>} label="at stake"/>}
      </div>
      <button type="button" className="link-button head-link" onClick={onOpenMastery}>Mastery progress<Icon name="next"/></button>
      {snapshotOnly && <p className="page-note">Read from the saved snapshot. Current ownership can't be verified without Full access.</p>}
    </div>

    {view.collection.items.length ? <>
      <div className="toolbar">
        <SearchField label="Search collection" value={search} onChange={value => update({ search: value })}/>
        <label className="select">
          <span aria-hidden="true">Sort</span>
          <select aria-label="Sort collection" value={sort} onChange={event => update({ sort: event.target.value as Sort })}>
            {sorts.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        {ownershipVerified && <div className="segmented" role="group" aria-label="Ownership filters">
          {(['all', 'owned', 'mastered', 'missing', 'tradeable'] as const).map(filter => <button
            type="button"
            key={filter}
            aria-pressed={ownership === filter}
            onClick={() => update({ ownership: filter })}
          >{filter[0].toUpperCase() + filter.slice(1)}</button>)}
        </div>}
        <button type="button" role="switch" aria-checked={showDucats} className="display-switch" onClick={onToggleDucats}>
          <span className="display-face"><MetalMark metal="ducat"/>Ducat values</span>
          <span className="display-track" aria-hidden="true"><span className="display-thumb"/></span>
        </button>
        {/* Live prices come from the market dump and explicit price checks, neither of which
            reads the game or needs verified ownership: Companion and Overlay keep valuation.
            Selling still needs Full, and that gate lives on the sell controls, not here. */}
        <button
          type="button"
          className="stamp primary price-page"
          disabled={pricing || inProgress !== null || pricableVisibleIds.length === 0}
          onClick={() => onPriceLive(pricableVisibleIds)}
        >{pricing || inProgress ? 'Pricing…' : `Price this page (${pricableVisibleIds.length})`}</button>
      </div>

      <div className="chips" role="group" aria-label="Item categories">
        {categories.map(item => <button
          type="button"
          key={item.value}
          className="chip"
          aria-pressed={category === item.value}
          onClick={() => update({ category: item.value })}
        >{item.label}</button>)}
      </div>

      <div className="status-line">
        <span>{dumpDate ? `Prices from the ${shortDumpDate(dumpDate)} market summary` : 'No price summary loaded yet'}</span>
        <span>{firstResult}–{lastResult} of {filtered.length}</span>
        {inProgress && <span className="pricing" role="status">
          <progress max={Math.max(inProgress.total, 1)} value={inProgress.done} aria-label="Live price check"/>
          <span>Checking live prices · {inProgress.done} of {inProgress.total}</span>
        </span>}
      </div>

      {filtered.length
        ? <>
          <ul className="card-grid" aria-label="Collection items">{visibleItems.map(item => <li key={item.id}><CollectionEntry item={item} ownershipVerified={ownershipVerified} showDucats={showDucats} listedOrder={listedOrderFor(view.market_account.orders, item.id)} sellable={ownershipVerified && view.market_account.link === 'linked' && isListable(item, view.market_account.listable)} onSell={onSell} onUpdate={onUpdate} busy={ordersBusy}/></li>)}</ul>
          <Pagination current={currentPage} total={totalPages} onChange={page => onFilters({ ...filters, page })}/>
        </>
        : <EmptyState title="No matching items" detail="Try another search or clear the filters." action={<button type="button" className="stamp" onClick={() => update({ search: '', category: 'all', ownership: 'all' })}>Clear filters</button>}/>}
    </> : <EmptyState
      title={snapshotOnly ? 'No saved inventory snapshot yet' : 'No inventory items yet'}
      detail={snapshotOnly ? 'Full access can acquire one; Companion remains useful for reference, prices, and planning.' : 'Start Warframe and refresh to create your first local snapshot.'}
    />}
  </section>
}

/** Figures are grouped: a five-digit total is read, not counted. */
function figure(value: number): string {
  return value.toLocaleString('en-US')
}

function MasteryPage({ view, filters, onFilters, onSell, onUpdate, ordersBusy }: { view: AppView; filters: MasteryFilters; onFilters: (filters: MasteryFilters) => void; onSell: SellHandler; onUpdate: UpdateHandler; ordersBusy: boolean }) {
  const { search, category, sort } = filters
  const update = (patch: Partial<MasteryFilters>) => onFilters({ ...filters, page: 1, ...patch })
  const { available, items, totals } = view.mastery
  const mastered = totals.reduce((sum, entry) => sum + entry.mastered, 0)
  const total = totals.reduce((sum, entry) => sum + entry.total, 0)
  const inArsenal = items.filter(item => item.quantity > 0).length
  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase()
    return items
      .filter(item => !query || item.name.toLocaleLowerCase().includes(query))
      .filter(item => category === 'all' || item.category === category)
      .toSorted((left, right) => sort === 'arsenal-first'
        ? Number(right.quantity > 0) - Number(left.quantity > 0) || left.name.localeCompare(right.name)
        : sort === 'category-asc'
          ? left.category.localeCompare(right.category) || left.name.localeCompare(right.name)
          : left.name.localeCompare(right.name))
  }, [items, search, category, sort])
  const { current: currentPage, total: totalPages, visible: visibleItems, first: firstResult, last: lastResult } = pageWindow(filtered, filters.page)

  return <section className="page" aria-labelledby="mastery-title">
    <div className="page-head">
      <h1 id="mastery-title" className="page-title">Mastery</h1>
      {available && <div className="stats">
        <Stat kind="mastered" value={mastered} label={`of ${figure(total)} mastered${total ? ` · ${Math.round(mastered / total * 100)}%` : ''}`}/>
        <Stat kind="items" value={items.length} label="remaining"/>
        <Stat kind="arsenal" value={inArsenal} label="in arsenal"/>
        <Stat kind="missing" value={items.length - inArsenal} label="never held"/>
      </div>}
    </div>

    {!available
      ? <EmptyState title="Mastery needs an inventory read under Full access" detail="Refresh the inventory once under Full access. Companion and Overlay show the saved snapshot only."/>
      : <>
        <div className="toolbar">
          <SearchField label="Search mastery" value={search} onChange={value => update({ search: value })}/>
          <label className="select">
            <span aria-hidden="true">Sort</span>
            <select aria-label="Sort mastery" value={sort} onChange={event => update({ sort: event.target.value as MasterySort })}>
              {masterySortOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
        </div>

        {/* The category chips carry the progress: mastered over total, as the profile would. */}
        <div className="chips" role="group" aria-label="Mastery categories">
          <button type="button" className="chip" aria-pressed={category === 'all'} onClick={() => update({ category: 'all' })}>All categories</button>
          {totals.map(entry => <button
            type="button"
            key={entry.category}
            className="chip"
            aria-label={`${categoryName[entry.category]} ${entry.mastered}/${entry.total}`}
            aria-pressed={category === entry.category}
            onClick={() => update({ category: entry.category })}
          >{categoryName[entry.category]}<span className="chip-count">{entry.mastered}/{entry.total}</span></button>)}
        </div>

        <div className="status-line">
          <span>{firstResult}–{lastResult} of {filtered.length}</span>
        </div>

        {filtered.length
          ? <>
            <ul className="card-grid" aria-label="Mastery items">{visibleItems.map(item => <li key={item.id}><CollectionEntry item={item} ownershipVerified missingLabel="Never held" showDucats={false} listedOrder={null} sellable={false} onSell={onSell} onUpdate={onUpdate} busy={ordersBusy}/></li>)}</ul>
            <Pagination current={currentPage} total={totalPages} onChange={page => onFilters({ ...filters, page })}/>
          </>
          : <EmptyState
            title="Nothing left in this view"
            detail={items.length ? 'Try another search or clear the filters.' : 'Every masterable item the catalog knows is mastered.'}
            action={items.length > 0 && <button type="button" className="stamp" onClick={() => update({ search: '', category: 'all' })}>Clear filters</button>}
          />}
      </>}
  </section>
}

/** One summary figure, inline in a page head: the figure, what it counts, and an optional
 * qualification on it. */
function Stat({ kind, value, unit, label, aside, note }: { kind: string; value: number; unit?: ReactNode; label: string; aside?: ReactNode; note?: string }) {
  return <div className={`stat ${kind}`} data-summary={kind} data-testid={`stat-${kind}`}>
    <span className="stat-figure">{figure(value)}{unit}</span>
    <span className="stat-label">{label}</span>
    {aside && <span className="stat-aside">{aside}</span>}
    {note && <p className="stat-note">{note}</p>}
  </div>
}

function CollectionEntry({ item, ownershipVerified, missingLabel = 'Missing', showDucats, listedOrder, sellable, onSell, onUpdate, busy }: { item: CollectionItem; ownershipVerified: boolean; missingLabel?: string; showDucats: boolean; listedOrder: MarketOrder | null; sellable: boolean; onSell: SellHandler; onUpdate: UpdateHandler; busy: boolean }) {
  const missing = item.quantity === 0
  const [artFailed, setArtFailed] = useState(false)
  const [selling, setSelling] = useState(false)
  // The rank belongs in the accessible name: a mod held at two ranks is two cards headed the same
  // word, and without it they are indistinguishable to anyone not reading the badges.
  const label = rankLabel(item) ? `${item.name}, ${rankLabel(item)}` : item.name
  // Nothing offered on a card whose whole holding is already listed: the badge says so, and the
  // market allows one sell order per item. A listing that covers part of the holding keeps the
  // control, as an edit of the listing that already stands.
  const remaining = sellable && (!listedOrder || listedOrder.quantity < item.quantity)
  return <article className="card" aria-label={label} data-held={item.quantity > 0 ? 'true' : 'false'}>
    <div className="card-art">
      {item.image_url && !artFailed
        ? <img src={item.image_url} alt={item.name} loading="lazy" decoding="async" onError={() => setArtFailed(true)}/>
        : <span aria-hidden="true">{categoryName[item.category].slice(0, 2)}</span>}
    </div>
    <div className="card-body">
      <h2 className="card-name" title={item.name}>{item.name}</h2>
      <span className="card-meta">{categoryName[item.category]}</span>
      <div className="tags">
        {ownershipVerified
          ? missing
            ? <span className="tag absent">{missingLabel}</span>
            : <span className="tag">Owned ×{item.quantity}</span>
          : null}
        {rankLabel(item) && <span className={`tag rank${atMaxRank(item) ? ' maxed' : ''}`}>{rankLabel(item)}</span>}
        {ownershipVerified && item.mastered && <span className="tag mastered">Mastered</span>}
        {listedOrder && <span className="tag listed">{listedLabel(listedOrder, item.quantity)}</span>}
      </div>
    </div>
    <div className="card-values">
      {item.platinum !== undefined && <span className="value plat">
        <MetalMark metal="plat" alt="platinum "/>
        {item.platinum_ceiling === undefined
          ? <>
            <b>{item.platinum}</b>
            {ownershipVerified && item.quantity > 1 && <em>{stackValue(item)} total</em>}
          </>
          // Nobody sells a half-ranked card, so the market brackets it without ever quoting it.
          // The two ends are what is known; a single number here would be invented.
          : <b title="Sellers list unranked and fully ranked copies only, so this rank sits between the two">
            {item.platinum}–{item.platinum_ceiling}
          </b>}
      </span>}
      {/* Baro's price, beside the market's. It is a fact of the item rather than of a holding,
          so it reads on a missing part too, and it totals like platinum does. */}
      {showDucats && (item.ducats !== undefined
        ? <span className="value ducat">
          <MetalMark metal="ducat" alt="ducat "/>
          <b>{item.ducats}</b>
          {ownershipVerified && item.quantity > 1 && <em>{item.ducats * item.quantity} total</em>}
        </span>
        : item.category === 'prime_part' && <span className="value-missing">Ducat value unavailable</span>)}
      {item.live && <span className="checked-live">Checked live</span>}
    </div>
    {remaining && (selling
      ? <SellForm item={item} listing={listedOrder ?? undefined} busy={busy} onSell={onSell} onUpdate={onUpdate} onDone={() => setSelling(false)}/>
      : <button type="button" className="stamp sell-open" disabled={busy} onClick={() => setSelling(true)}>{listedOrder ? 'Sell more' : 'Sell'}</button>)}
  </article>
}

function Pagination({ current, total, onChange }: { current: number; total: number; onChange: (page: number) => void }) {
  if (total <= 1) return null
  const pages = pageNumbers(current, total)
  return <nav className="pagination" aria-label="Collection pages">
    <button type="button" disabled={current === 1} aria-label="Previous page" onClick={() => onChange(current - 1)}><Icon name="previous"/></button>
    {pages.map((page, index) => <span key={page} className="page-slot">
      {index > 0 && page - pages[index - 1] > 1 ? <i aria-hidden="true">…</i> : null}
      <button type="button" aria-current={page === current ? 'page' : undefined} aria-label={`Go to page ${page}`} onClick={() => onChange(page)}>{page}</button>
    </span>)}
    <button type="button" disabled={current === total} aria-label="Next page" onClick={() => onChange(current + 1)}><Icon name="next"/></button>
  </nav>
}

function RewardPage({ view, effectiveMode }: { view: AppView; effectiveMode: AccessMode }) {
  const ownershipVerified = effectiveMode === 'full'
  const companion = effectiveMode === 'companion'
  return <div className="page">
    <div className="page-head">
      <h1 id="reward-title" className="page-title">Reward advisor</h1>
      <p className="page-note">{companion
        ? 'Live reward observation is inactive in Companion. Saved ownership is shown as unverifiable.'
        : 'Reads the Void Fissure reward screen and shows each choice’s value here and over the game.'}</p>
    </div>
    <section aria-label="Reward advisor">
      {view.reward.cards.length
        ? <RewardCards cards={view.reward.cards} bestValueIndex={view.reward.best_value_index} bestDucatIndex={view.reward.best_ducat_index} ownershipVerified={ownershipVerified}/>
        : <EmptyState title="No reward choices detected" detail={companion ? 'Live reward observation is inactive in Companion; reference data remains available.' : 'Waiting for an English Void Fissure reward screen.'}/>}
    </section>
  </div>
}

const stateWord: Record<HealthState, string> = { ready: 'Ready', idle: 'Idle', degraded: 'Degraded', failed: 'Failed' }
const readerWord: Record<HealthState, string> = { ready: 'Watching Warframe', idle: 'Idle', degraded: 'Attention needed', failed: 'Attention: reader failed' }

function HealthRow({ label, health }: { label: string; health: BackendHealth | { state: HealthState; message: string; last_success?: string | null } }) {
  return <article className={`health-row ${health.state}`}>
    <StateIcon state={health.state}/>
    <div>
      <h3>{label}</h3>
      <p title={health.message}>{health.message}</p>
      {/* Rows record their success time in whatever form their own source keeps: most write Unix
          seconds, the price table an ISO date. The relative reading is the useful one here; the
          exact stamp rides along for anyone comparing a row against a log. */}
      {health.last_success && <small>Last success: {healthSuccessLabel(health.last_success)}</small>}
    </div>
    <span className="verdict">{stateWord[health.state]}</span>
  </article>
}

function healthSuccessLabel(value: string) {
  const reading = stampReading(value)
  return reading ? `${reading.relative} · ${reading.exact}` : value
}

type ReportStatus =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'done'; message: string }

function ReportBlock({ health, alwaysVisible }: { health: AppView['health']; alwaysVisible?: boolean }) {
  const [status, setStatus] = useState<ReportStatus>({ kind: 'idle' })
  const broken = reportBlockVisible(health)
  if (!alwaysVisible && !broken) return null
  const run = async (action: () => Promise<void | { folder_path: string; ee_log_included: boolean }>, done: (result: { folder_path: string; ee_log_included: boolean } | null) => string) => {
    setStatus({ kind: 'busy' })
    try {
      const result = await action()
      const resultOrNull = result && typeof result === 'object' ? result : null
      setStatus({ kind: 'done', message: done(resultOrNull) })
    } catch (error) {
      setStatus({ kind: 'done', message: String(error) })
    }
  }
  return (
    <section className={`report${broken ? ' broken' : ''}`} role="group" aria-label="Report a problem">
      <div className="report-head">
        <StateIcon state={broken ? 'failed' : 'ready'}/>
        <h2 className="section-title">Report a problem</h2>
        <p className="prose">{broken
          ? 'Collect a report of what failed and review it before it leaves this machine. Nothing is sent anywhere.'
          : 'Something not working right? Bundle your diagnostics and open an issue. Nothing leaves this machine without you sending it.'}</p>
      </div>
      <div className="report-actions">
        <button type="button" className="stamp" disabled={status.kind === 'busy'} onClick={() => void run(openIssue, () => 'Opened the issue form in your browser.')}>Open an issue</button>
        <button type="button" className="stamp" disabled={status.kind === 'busy'} onClick={() => void run(copyReport, () => 'Copied. Paste it into the diagnostics field of the issue form.')}>Copy diagnostics</button>
        <button type="button" className="stamp" disabled={status.kind === 'busy'} onClick={() => void run(saveReport, result =>
          `Saved to ${result?.folder_path ?? '…'}${result?.ee_log_included ? '. EE.log included (sanitized), safe to attach to the issue.' : ''}`,
        )}>Save logs</button>
      </div>
      {status.kind === 'done' && <p className="report-status" role="status">{status.message}</p>}
    </section>
  )
}

function DiagnosticsPage({ view, effectiveMode }: { view: AppView; effectiveMode: AccessMode }) {
  const referenceSystems = [
    ['Catalog', view.health.catalog],
    ['Market data', view.health.market],
    ['Collection prices', view.health.collection_prices],
    ['Database', view.health.database],
    ['Market account', view.health.market_account],
  ] as const
  const liveSystems = [
    ['Game reader', view.health.game_reader],
    ['EE.log', view.health.log_monitor],
    ['Reward observer', view.health.capture],
  ] as const
  const systems = effectiveMode === 'companion' ? referenceSystems : [...liveSystems, ...referenceSystems]
  const showAcquisition = effectiveMode === 'full'
  return <div className="page">
    <div className="page-head">
      <h1 id="diagnostics-title" className="page-title">Diagnostics</h1>
      <p className="page-note">Status messages never show temporary access values.</p>
    </div>
    <ReportBlock health={view.health}/>
    <section className="page-section" aria-label="Diagnostics">
      {effectiveMode === 'companion' && <p className="prose">Live Warframe diagnostics are inactive in Companion. Local and reference services remain visible.</p>}
      <h2 className="section-title">Services</h2>
      <div className="health-list">{systems.map(([label, health]) => <HealthRow key={label} label={label} health={health}/>)}</div>

      {showAcquisition && <>
        <h2 className="section-title">Inventory acquisition</h2>
        {view.health.acquisition_stages.length
          ? <ol className="stages">{view.health.acquisition_stages.map((stage, index) => {
            const words = stage.stage.replaceAll('_', ' ')
            const label = words[0].toUpperCase() + words.slice(1)
            return <li key={stage.stage} className={stage.state}>
              <span className="stage-index">{index + 1}</span>
              <StateIcon state={stage.state}/>
              <div><strong>{label}</strong><p>{stage.message}</p></div>
              <span className="verdict">{stateWord[stage.state]}</span>
            </li>
          })}</ol>
          : <EmptyState title="No acquisition attempt yet" detail="Start Warframe or request a refresh to populate the five pipeline stages."/>}
      </>}
    </section>
  </div>
}

function SettingsPage({ view, priceFloor, effectiveMode, selectedMode, modeBusy, modeError, onSelectMode, onConfirmMode, desktopCaptureActionAvailable, captureAuthorizationBusy, captureNote, onCaptureNote, onAuthorizeCapture, onPriceFloor }: { view: AppView; priceFloor: number; effectiveMode: AccessMode; selectedMode: AccessMode; modeBusy: boolean; modeError: string | null; onSelectMode: (mode: AccessMode) => void; onConfirmMode: () => void; desktopCaptureActionAvailable: boolean; captureAuthorizationBusy: boolean; captureNote: string | null; onCaptureNote: (note: string | null) => void; onAuthorizeCapture: () => Promise<void>; onPriceFloor: (floor: number) => void }) {
  const { sellable: total, sellableCount: counted } = collectionTotals(view.collection.items, priceFloor)
  return <section className="page" aria-labelledby="settings-title">
    <div className="page-head">
      <h1 id="settings-title" className="page-title">Settings</h1>
      <p className="page-note">Saved on this device and applied as you set them.</p>
    </div>
    <section className="page-section" aria-labelledby="access-setting-title">
      <h2 id="access-setting-title" className="section-title">Warframe access</h2>
      <p className="band-note">Every change needs confirmation. Nothing applies until you confirm.</p>
      <AccessSelector
        value={selectedMode}
        effectiveMode={effectiveMode}
        onChange={onSelectMode}
        onConfirmUpgrade={onConfirmMode}
        applyingMode={modeBusy ? selectedMode : null}
        disabled={modeBusy}
      />
      {modeError && <p className="error-banner" role="alert">{modeError}</p>}
    </section>


    <section className="page-section" aria-label="Preferences">
      <h2 className="section-title">Preferences</h2>
      <div className="setting">
        <div>
          <h3>Collection price floor</h3>
          <p className="prose">Stacks worth less than this per copy are left out of the sellable figure, and out of it alone: the market-rate total always counts everything. What the market completes is measured; whether a 3&nbsp;platinum mod is worth an evening of arranging the trade by hand is yours to say.</p>
        </div>
        <div className="dial">
          <label className="dial-slot">
            <span className="sr-only">Minimum platinum a copy must be worth to count</span>
            <input
              type="range"
              min={0}
              max={MAX_PRICE_FLOOR}
              step={1}
              value={priceFloor}
              style={{ '--dial-fill': `${priceFloor / MAX_PRICE_FLOOR * 100}%` } as CSSProperties}
              aria-valuetext={priceFloor ? `${priceFloor} platinum and over` : 'Every price counts'}
              onChange={event => onPriceFloor(Number(event.target.value))}
            />
          </label>
          <output className="dial-figure">
            {priceFloor ? <>{priceFloor}<MetalMark metal="plat" alt=" platinum"/><span> and over</span></> : <span>Every price</span>}
          </output>
        </div>
        <p className="band-note">{figure(counted)} stacks counted · {figure(total)} platinum sellable</p>
      </div>

      <MasteryMarksSetting/>

      <DesktopCaptureSetting actionAvailable={effectiveMode !== 'companion' && desktopCaptureActionAvailable} prohibited={effectiveMode === 'companion'} busy={captureAuthorizationBusy} note={captureNote} onNote={onCaptureNote} onAuthorize={onAuthorizeCapture}/>

      <div className="setting">
        <div>
          <h3>Reward overlay placement</h3>
          <p className="prose">The strip is drawn against the game's own window, so where it lands is compositor-specific and there is no way to see it without a fissure running. This puts it on screen with nothing to read, and takes it down again.</p>
        </div>
        <OverlayPreviewToggle prohibited={effectiveMode === 'companion'} busy={modeBusy}/>
      </div>
      <UpdatesSetting observesGame={effectiveMode !== 'companion'}/>
    </section>

    <section className="page-section" aria-label="Support">
      <h2 className="section-title">Support</h2>
      <ReportBlock health={view.health} alwaysVisible/>
    </section>

    <AboutSection effectiveMode={effectiveMode}/>
  </section>
}


/** The preference lives in the backend and a click is a command it may refuse. A refusal leaves
 * the switch where it was and says so, so the thumb never claims a state the overlays are not in. */
function MasteryMarksSetting() {
  const [enabled, setEnabled] = useState(true)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    // A failed read leaves the switch on, the backend's own fallback, and usable: a control frozen
    // on a guess would teach the player that the guess is a fact.
    getPreferences()
      .then(preferences => { if (mounted) setEnabled(preferences.mastery_marks) })
      .catch(() => { if (mounted) setNote('Could not read this setting.') })
      .finally(() => { if (mounted) setLoaded(true) })
    return () => { mounted = false }
  }, [])

  async function toggle() {
    if (!loaded || busy) return
    setBusy(true)
    setNote(null)
    try {
      // The command answers with the stored preference, so the switch takes the backend's word
      // for what it now holds rather than the value that was asked for.
      const preferences = await setMasteryMarks(!enabled)
      setEnabled(preferences.mastery_marks)
    } catch {
      setNote('Could not save this setting.')
    } finally {
      setBusy(false)
    }
  }

  return <div className="setting">
    <div>
      <h3>Mastery marks on overlays</h3>
      <p className="prose">On the reward screen, each Prime part's slip says whether the item it builds is mastered, built, in the foundry or still unmastered, and draws the set behind an unmastered one. On the Ducat Kiosk, a part of an item you have not mastered, built or started building gets a strip with its price. Full access shows every mark after an inventory sync; Overlay access shows only what you have already mastered.</p>
    </div>
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      className="display-switch"
      disabled={!loaded || busy}
      aria-busy={busy}
      onClick={() => { void toggle() }}
    >
      <span className="display-face">Mastery marks</span>
      <span className="display-track" aria-hidden="true"><span className="display-thumb"/></span>
    </button>
    {note && <p className="band-note" role="status">{note}</p>}
  </div>
}

function DesktopCaptureSetting({ actionAvailable, prohibited, busy, note, onNote, onAuthorize }: { actionAvailable: boolean; prohibited: boolean; busy: boolean; note: string | null; onNote: (note: string | null) => void; onAuthorize: () => Promise<void> }) {
  useEffect(() => {
    if (actionAvailable && note === 'Desktop capture allowed.') {
      onNote('Desktop capture needs permission again.')
    }
  }, [actionAvailable, note, onNote])
  async function authorize() {
    if (busy) return
    onNote(null)
    try {
      await onAuthorize()
      onNote('Desktop capture allowed.')
    } catch {
      onNote('Desktop capture was denied or is unavailable. Check that desktop screen sharing works, then try again.')
    }
  }
  return <div className="setting">
    <div>
      <h3>Screen capture</h3>
      <p className="prose">Screen capture is automatic. Desktop sharing is only needed when Warframe is launched with PROTON_ENABLE_WAYLAND=1 and this compositor has no direct capture API.</p>
      {prohibited ? <p className="prohibition-note" id="capture-prohibited">Overlay or Full access is required because Companion does not use screen capture.</p> : actionAvailable && <p className="prose">The desktop opens its own screen chooser. Select every display where Warframe may run. KDE/GNOME may show an active screen-sharing indicator. TennoScope releases the session when the game exits.</p>}
    </div>
    {(actionAvailable || prohibited) && <button type="button" className="stamp" onClick={authorize} disabled={busy || prohibited} aria-busy={busy} aria-describedby={prohibited ? 'capture-prohibited' : undefined}>{busy ? 'Allowing desktop capture…' : 'Allow desktop capture'}</button>}
    <p className="band-note capture-status" role="status" aria-live="polite" aria-atomic="true">{note}</p>
  </div>
}

/** What TennoScope is, and what it does to this machine in the current mode. */
function AboutSection({ effectiveMode }: { effectiveMode: AccessMode }) {
  const observesGame = effectiveMode !== 'companion'
  const acquiresInventory = effectiveMode === 'full'
  const [versionLine, setVersionLine] = useState<string>(`Version ${APP_VERSION}`)
  // The version is a frontend build constant: the line renders even when the
  // backend is down, gaining installer identity once getVersionInfo lands.
  useEffect(() => {
    getVersionInfo()
      .then(info => {
        const installer = info.kind === 'appimage'
          ? 'AppImage'
          : info.kind === 'portable_win'
            ? 'Windows install'
            : info.kind === 'system_linux'
              ? (info.manager ?? 'System package')
              : info.kind === 'system_win'
                ? 'Windows system install'
                : ''
        setVersionLine(installer ? `Version ${info.version} · ${installer}` : `Version ${info.version}`)
      })
      .catch(() => {})
  }, [])
  return <section className="page-section" aria-labelledby="about-title">
    <h2 id="about-title" className="section-title">About</h2>
    <p className="prose">TennoScope is a free, open-source, local-first companion. GPLv3 · MVP.</p>
    <p className="band-note">{versionLine}</p>

    <div className="clauses">
      <article className="clause">
        <h3>Local-first storage</h3>
        <p className="prose">Your inventory snapshot and preferences are stored on this device in the application data directory. The UI has no telemetry or cloud account.</p>
      </article>
      <article className={observesGame ? 'clause caution' : 'clause'}>
        <h3>{observesGame ? 'Warframe access disclosure' : 'Companion access'}</h3>
        <p className="prose">{effectiveMode === 'full'
          ? 'Full access inspects the running game process using read-only memory access. Third-party software and process inspection may carry account-policy or anti-cheat risk even when no game memory is modified.'
          : effectiveMode === 'overlay'
            ? 'Overlay observes process presence, EE.log, and visible pixels to provide live reward assistance. It does not read process memory or acquire inventory.'
            : 'Companion does not observe the running game process or EE.log, capture the screen, display overlays, read process memory, or acquire inventory.'}</p>
      </article>
      <article className="clause">
        <h3>Inventory synchronization</h3>
        <p className="prose">{acquiresInventory ? 'Full access can synchronize inventory automatically and through Refresh inventory in the sidebar.' : 'Inventory synchronization is available only in Full access. Your existing saved snapshot remains available here.'}</p>
      </article>
      <article className="clause">
        <h3>Reward assistance</h3>
        <p className="prose">{observesGame ? 'Reward names can be read from visible screen pixels with OCR and matched against the squad’s relic pool. The overlay is non-focusable and click-through, so it never takes input from the game.' : 'The catalog and relic reference remain available for planning. Live screen recognition and the click-through overlay are available in Overlay and Full access.'}</p>
      </article>
    </div>
  </section>
}

/**
 * The strip is placed against the game's own window, so a preview is the only way
 * to see it without a fissure running. A preview you cannot dismiss does not
 * earn its place, which is why this is a toggle and not a one-way button.
 */
function OverlayPreviewToggle({ prohibited, busy }: { prohibited: boolean; busy: boolean }) {
  const [shown, setShown] = useState(false)
  const [blocked, setBlocked] = useState(false)
  return <div className="prohibited-control">
    <button
      type="button"
      className="stamp"
      aria-pressed={shown}
      disabled={prohibited || busy}
      aria-describedby={prohibited ? 'overlay-prohibited' : blocked ? 'overlay-blocked' : undefined}
      onClick={() => {
        // The backend rejects while an access transition holds the gate. Flip only after the
        // command lands, so a click across a downgrade reports instead of desyncing the toggle.
        const next = !shown
        setBlocked(false)
        void (shown ? hideRewardOverlay() : showRewardOverlay())
          .then(() => setShown(next))
          .catch(() => setBlocked(true))
      }}
    >{shown ? 'Hide reward overlay' : 'Preview reward overlay'}</button>
    {prohibited && <p id="overlay-prohibited" className="prohibition-note">Overlay or Full access is required because Companion does not create overlays.</p>}
    {!prohibited && blocked && <p id="overlay-blocked" className="band-note" role="status">The overlay is unavailable while access is changing. Try again once the new mode is effective.</p>}
  </div>
}

function EmptyState({ title, detail, action }: { title: string; detail: string; action?: ReactNode }) {
  return <div className="empty-state">
    <h2>{title}</h2>
    <p>{detail}</p>
    {action}
  </div>
}

export default App
