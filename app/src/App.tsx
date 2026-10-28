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
  setLanguage,
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
  type Language,
  type VersionInfo,
} from './backend'
import { hideRewardOverlay, showRewardOverlay } from './overlay'
import { copyReport, openIssue, saveReport } from './report'
import { closeWindow, minimizeWindow, readWindowMaximized, toggleMaximizeWindow, watchWindowResized } from './window'
import { RewardCards } from './RewardCards'
import { MetalMark } from './MetalMark'
import { OrdersView } from './OrdersView'
import { isListable, listedLabel, listedOrderFor } from './orders'
import { SellForm, type SellHandler, type UpdateHandler } from './SellForm'
import { atMaxRank, collectionTotals, figure, masteryOrder, pageNumbers, pageWindow, rankLabel, stackValue } from './collection'
import { MAX_PRICE_FLOOR, readPriceFloor, readShowDucats, writePriceFloor, writeShowDucats } from './settings'
import { snapshotFreshness, stampReading } from './freshness'
import { bootUpdateChecks } from './updateStore'
import { version as APP_VERSION } from '../package.json'
import { UpdateMark, UpdatesSetting } from './UpdateSettings'
import { reportBlockVisible } from './reportable'
import { AccessSelector } from './AccessSelector'
import { accessMode } from './access'
import { Stat } from './Stat'
import { LANGUAGE_NAMES, MessagesContext, backendReason, catalogs, resolveLanguage, shortDate, useDocumentLanguage, useMessages, type Messages } from './i18n'

type Page = 'collection' | 'mastery' | 'rewards' | 'orders' | 'diagnostics' | 'settings'
type Ownership = 'all' | 'owned' | 'mastered' | 'missing' | 'tradeable'
type Sort = 'name-asc' | 'quantity-desc' | 'category-asc' | 'mastery-asc' | 'platinum-desc' | 'ducats-desc'
type MasterySort = 'arsenal-first' | 'name-asc' | 'category-asc'

/** The filters of each grid page. Held by `App` so they survive a change of tab. */
type CollectionFilters = { search: string; category: ItemCategory | 'all'; ownership: Ownership; sort: Sort; page: number }
type MasteryFilters = { search: string; category: ItemCategory | 'all'; sort: MasterySort; page: number }
const initialCollectionFilters: CollectionFilters = { search: '', category: 'all', ownership: 'all', sort: 'name-asc', page: 1 }
const initialMasteryFilters: MasteryFilters = { search: '', category: 'all', sort: 'arsenal-first', page: 1 }

// Their names are the catalog's (`categories`, `collection.sorts`, `mastery.sorts`).
const categories: Array<ItemCategory | 'all'> = ['all', 'frame', 'weapon', 'companion', 'prime_part', 'relic', 'resource', 'blueprint', 'vehicle', 'mod', 'arcane']

// Ducats is offered only while the ducat values are on screen.
const sortOptions: Sort[] = ['name-asc', 'quantity-desc', 'category-asc', 'mastery-asc', 'platinum-desc', 'ducats-desc']

// What is held can be ranked tonight; what was never held is a hunt. The default order says so.
const masterySortOptions: MasterySort[] = ['arsenal-first', 'name-asc', 'category-asc']

const pages: Page[] = ['collection', 'mastery', 'rewards', 'orders', 'diagnostics', 'settings']

/**
 * A failure in the app's words, followed by the backend's own reason when it gives one: the Rust
 * commands reject with a sentence meant for the player ("warframe.market is limiting requests; try
 * again shortly"), which says what the generic line cannot.
 */
function failureWithReason(failure: string, reason: unknown, t: Messages): string {
  const text = typeof reason === 'string' ? backendReason(reason.trim().replace(/\.$/, ''), t) : ''
  if (!text || failure.toLowerCase().startsWith(text.toLowerCase())) return failure
  // A sentence starts with a capital, a domain name never does: "warframe.market is limiting…".
  const lead = /^\S+\.\S/.test(text) ? text : text[0].toUpperCase() + text.slice(1)
  return `${failure} ${lead}.`
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
  const t = useMessages()
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
  return <div className="window-controls" role="group" aria-label={t.window.group}>
    <button type="button" className="window-control" aria-label={t.window.minimize} onClick={() => { void minimizeWindow() }}>
      <svg viewBox="0 0 10 10" aria-hidden="true"><path d="M1 5h8"/></svg>
    </button>
    <button type="button" className="window-control" aria-label={maximized ? t.window.restore : t.window.maximize} onClick={() => { void toggleMaximizeWindow() }}>
      {maximized
        ? <svg viewBox="0 0 10 10" aria-hidden="true"><path d="M3.5 3.5h5v5h-5zM6.5 3.5v-2h-5v5h2"/></svg>
        : <svg viewBox="0 0 10 10" aria-hidden="true"><path d="M1.5 1.5h7v7h-7z"/></svg>}
    </button>
    <button type="button" className="window-control close" aria-label={t.window.close} onClick={() => { void closeWindow() }}>
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
  // Undefined until the backend has answered, so the first screen with words on it is already in
  // the chosen language; null is the answer "follow the system".
  const [languagePreference, setLanguagePreference] = useState<Language | null | undefined>(undefined)
  const language = resolveLanguage(languagePreference)
  const t = catalogs[language]
  // Failures land after an await, in callbacks made before the answer; they speak the language of now.
  const messages = useRef(t)
  useEffect(() => { messages.current = t }, [t])
  useDocumentLanguage(language)
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
  const [captureNote, setCaptureNote] = useState<CaptureNote | null>(null)
  const [collectionFilters, setCollectionFilters] = useState(initialCollectionFilters)
  const [masteryFilters, setMasteryFilters] = useState(initialMasteryFilters)
  const viewGeneration = useRef(0)
  const foregroundInFlight = useRef(0)
  const setupGeneration = useRef(0)
  const captureAuthorizationInFlight = useRef(false)
  const modeTransitionInFlight = useRef(false)
  const effectiveModeRef = useRef<AccessMode | null>(null)
  const [captureAuthorizationBusy, setCaptureAuthorizationBusy] = useState(false)

  const requestView = useCallback(async (request: () => Promise<AppView>, failure: (t: Messages) => string) => {
    const generation = ++viewGeneration.current
    try {
      const next = await request()
      if (generation === viewGeneration.current) {
        setView(next)
        setError(null)
      }
    } catch (reason) {
      if (generation === viewGeneration.current) setError(failureWithReason(failure(messages.current), reason, messages.current))
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
    // A failed read is not worth a banner: the system language is the fallback either way.
    getPreferences()
      .then(preferences => setLanguagePreference(preferences.language ?? null))
      .catch(() => setLanguagePreference(null))
    getSetupStatus()
      .then(async status => {
        effectiveModeRef.current = status.access_mode
        setSetupStatus(status)
        if (status.access_mode) setSelectedMode(status.access_mode)
        if (status.setup_complete) {
          await requestView(getView, m => m.app.backendUnavailable)
          await requestMarketStatus()
        }
      })
      .catch(() => setError(messages.current.app.backendUnavailable))
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
        requestView(getView, m => m.app.liveViewFailed),
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
        await requestView(getView, m => m.app.backendUnavailable)
        // Reconciliation depends on the effective mode: without this a Full-to-Companion
        // downgrade keeps Full-era verified ownership and sellable flags until the player
        // happens to open Orders. The helper merges only what it owns and stays silent on
        // failure, so it is safe on every successful transition, not just first run.
        await requestMarketStatus()
      })
    } catch {
      // Keep the pending selection on every failure direction so retry is one Confirm click;
      // the effective mode beside it still names what is actually active.
      setModeError(t.app.accessChangeFailed(previous ? accessMode(previous, t).name : null))
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
    await runForeground(() => requestView(refreshInventory, m => m.app.refreshFailed))
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
    await requestView(() => refreshPrices(ids), m => m.app.livePricesFailed)
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
    } catch (reason) {
      setOrdersError(failureWithReason(failure, reason, t))
    } finally {
      setOrdersBusy(false)
    }
  }

  const failures = t.market.failures
  const ordersSignIn = (email: string, password: string) =>
    ordersOperation(() => marketSignIn(email, password), failures.signIn)
  const ordersLinkToken = (token: string) =>
    ordersOperation(() => marketLinkToken(token), failures.linkToken)
  const ordersSignOut = () =>
    ordersOperation(marketSignOut, failures.signOut)
  const ordersRefresh = () =>
    ordersOperation(refreshOrders, failures.refresh)
  const ordersRemove = (orderId: string) =>
    ordersOperation(() => removeOrder(orderId), failures.remove)
  const ordersLowerTo = (orderId: string, _quantity: number) =>
    ordersOperation(() => setOrderQuantity(orderId), failures.lower)
  const ordersPresence = (status: Presence | null, auto: boolean) =>
    ordersOperation(() => setMarketPresence(status, auto), failures.presence)
  /** The card's own accessible name: the rank belongs in it because a mod held at two ranks is two
   * cards headed the same word. Shared with the spoken note, so the note says what the card is
   * named. */
  function cardLabel(item: CollectionItem): string {
    return rankLabel(item, t) ? `${item.name}, ${rankLabel(item, t)}` : item.name
  }

  const ordersSell = (collectionId: string, platinum: number, quantity: number, visible: boolean) =>
    ordersOperation(
      () => createOrder(collectionId, platinum, quantity, visible),
      failures.publish,
      next => {
        const item = next.collection.items.find(entry => entry.id === collectionId)
        return t.market.listed(item ? cardLabel(item) : t.market.theItem, platinum, quantity)
      },
    )
  const ordersUpdate = (orderId: string, platinum: number, quantity: number) =>
    ordersOperation(
      () => updateOrder(orderId, platinum, quantity),
      failures.update,
      next => {
        const name = next.market_account.orders.find(entry => entry.order.id === orderId)?.name
        return t.market.updated(name ?? t.market.theItem, platinum, quantity)
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

  if ((setupStatus === null || languagePreference === undefined) && !error) return <main className="holding"><div className="streak" aria-hidden="true"/><p>{t.app.starting}</p></main>
  if (!setupStatus?.setup_complete) return <MessagesContext value={t}><SetupScreen selected={selectedMode} busy={modeBusy} error={modeError ?? error} onSelect={setSelectedMode} onContinue={mode => { void changeAccessMode(mode) }}/></MessagesContext>

  const effectiveMode = setupStatus.access_mode ?? 'companion'
  const liveState = view?.health.game_reader.state ?? 'degraded'
  const freshness = snapshotFreshness(view?.collection.snapshot, clock, t)
  const readerState: HealthState = effectiveMode === 'companion' ? 'idle' : liveState
  // The reader's own message is a health message: English, like every Diagnostics line.
  const readerDetail = effectiveMode === 'companion' ? t.sidebar.companionDetail : view?.health.game_reader.message ?? t.sidebar.connecting
  const navCount: Partial<Record<Page, number>> = { rewards: view?.reward.cards.length, orders: view?.market_account.flagged }
  const settingsMode = selectedMode ?? effectiveMode
  return <MessagesContext value={t}><div className="shell">
    <TitleBar/>

    <aside className="sidebar">
      <nav className="nav" aria-label={t.nav.primary}>
        {pages.map(item => {
          const count = navCount[item] ?? 0
          return <button
            key={item}
            type="button"
            className="nav-item"
            aria-label={count ? `${t.nav.pages[item]}, ${item === 'rewards' ? t.nav.choices(count) : t.nav.needAttention(count)}` : t.nav.pages[item]}
            title={t.nav.pages[item]}
            aria-current={page === item ? 'page' : undefined}
            onClick={() => openPage(item)}
          >
            <Icon name={item}/>
            <span className="nav-label">{t.nav.pages[item]}</span>
            {count > 0 && <span className="nav-count" aria-hidden="true">{count}</span>}
          </button>
        })}
      </nav>
      <section className="sidebar-foot" aria-label={t.sidebar.runtime}>
        <div className={`reader ${readerState}`} title={readerDetail}>
          <StateIcon state={readerState}/>
          <span className="reader-text">
            <strong role="status">{effectiveMode === 'companion' ? t.sidebar.companionMode : t.sidebar.reader[liveState]}</strong>
            <small>{readerDetail}</small>
          </span>
        </div>
        {view && <span className="snapshot-age" title={freshness.detail}>{freshness.label}<span className="sr-only">, {freshness.detail}</span></span>}
        <button type="button" className="stamp refresh" onClick={refresh} disabled={busy || modeBusy || setupStatus?.access_mode !== 'full'} aria-describedby={setupStatus?.access_mode !== 'full' ? 'inventory-access-note' : undefined}>
          <Icon name="refresh"/><span className="refresh-label">{busy ? t.sidebar.refreshing : t.sidebar.refreshInventory}</span>
        </button>
        {setupStatus?.access_mode !== 'full' && <span id="inventory-access-note" className="sr-only">{t.sidebar.fullRequired}</span>}
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
        {page === 'settings' && <SettingsPage view={view} language={languagePreference ?? null} onLanguage={setLanguagePreference} priceFloor={priceFloor} effectiveMode={effectiveMode} selectedMode={settingsMode} modeBusy={modeBusy} modeError={modeError} onSelectMode={mode => {
          setSelectedMode(mode)
          setModeError(null)
        }} onConfirmMode={() => { void changeAccessMode(settingsMode) }} desktopCaptureActionAvailable={setupStatus?.desktop_capture_action_available ?? false} captureAuthorizationBusy={captureAuthorizationBusy} captureNote={captureNote} onCaptureNote={setCaptureNote} onAuthorizeCapture={authorizeCapture} onPriceFloor={floor => {
          setPriceFloor(floor)
          writePriceFloor(floor)
        }}/>}
      </>}
    </main>
  </div></MessagesContext>
}

function SetupScreen({ selected, busy, error, onSelect, onContinue }: { selected: AccessMode | null; busy: boolean; error: string | null; onSelect: (mode: AccessMode) => void; onContinue: (mode: AccessMode) => void }) {
  const t = useMessages()
  return <div className="setup-shell">
    <TitleBar/>
    <main className="setup">
      <section className="setup-panel" aria-labelledby="setup-title">
        <h1 id="setup-title" className="page-title">{t.setup.title}</h1>
        <p className="prose">{t.setup.intro}</p>
        <AccessSelector value={selected} onChange={onSelect} applyingMode={busy ? selected : null} disabled={busy}/>
        {error && <p className="error-banner" role="alert">{error}</p>}
        <button type="button" className="stamp primary setup-confirm" onClick={() => { if (selected) onContinue(selected) }} disabled={busy || !selected} aria-busy={busy}>
          {!selected ? t.setup.choose : busy ? `${t.access.applying(accessMode(selected, t).name)}…` : t.access.confirm(accessMode(selected, t).name)}
        </button>
      </section>
    </main>
  </div>
}

function LoadingView() {
  const t = useMessages()
  return <section className="page" aria-live="polite">
    <div className="page-head">
      <h1 className="page-title">{t.app.loadingTitle}</h1>
      <p className="page-note">{t.app.loadingNote}</p>
    </div>
    <div className="streak" aria-hidden="true"/>
  </section>
}

function SearchField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const t = useMessages()
  return <label className="search">
    <Icon name="search"/>
    <input type="search" aria-label={label} placeholder={t.grid.searchPlaceholder} value={value} onChange={event => onChange(event.target.value)}/>
  </label>
}

function CollectionPage({ view, effectiveMode, filters, onFilters, pricing, onPriceLive, priceFloor, showDucats, onToggleDucats, onOpenMastery, onSell, onUpdate, ordersBusy }: { view: AppView; effectiveMode: AccessMode; filters: CollectionFilters; onFilters: (filters: CollectionFilters) => void; pricing: boolean; onPriceLive: (ids: string[]) => void; priceFloor: number; showDucats: boolean; onToggleDucats: () => void; onOpenMastery: () => void; onSell: SellHandler; onUpdate: UpdateHandler; ordersBusy: boolean }) {
  const t = useMessages()
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
  const sorts = showDucats ? sortOptions : sortOptions.filter(option => option !== 'ducats-desc')

  return <section className="page" aria-labelledby="collection-title">
    <div className="page-head">
      <h1 id="collection-title" className="page-title">{snapshotOnly ? t.collection.titleSnapshot : t.collection.title}</h1>
      <div className="stats">
        <Stat kind="items" value={view.collection.total_entries} label={snapshotOnly ? t.collection.savedEntries : t.collection.items}/>
        <Stat kind="owned" value={owned} label={t.collection.owned} aside={t.collection.missing(missing)}/>
        <Stat
          kind="worth"
          value={worth}
          unit={<MetalMark metal="plat" alt={t.units.platinum}/>}
          label={t.collection.marketValue}
          aside={<>{figure(sellable, t)}<MetalMark metal="plat" alt={t.units.platinum}/> {t.collection.sellable}</>}
          note={t.collection.sellableNote(priceFloor)}
        />
        {showDucats && <Stat kind="ducats" value={ducatsAtStake} unit={<MetalMark metal="ducat" alt={t.units.ducats}/>} label={t.collection.atStake}/>}
        <button type="button" className="link-button head-link" onClick={onOpenMastery}>{t.collection.masteryProgress}<Icon name="next"/></button>
      </div>
      {snapshotOnly && <p className="page-note">{t.collection.snapshotNote}</p>}
    </div>

    {view.collection.items.length ? <>
      <div className="toolbar">
        <SearchField label={t.collection.search} value={search} onChange={value => update({ search: value })}/>
        <label className="select">
          <span aria-hidden="true">{t.grid.sort}</span>
          <select aria-label={t.collection.sortLabel} value={sort} onChange={event => update({ sort: event.target.value as Sort })}>
            {sorts.map(option => <option key={option} value={option}>{t.collection.sorts[option]}</option>)}
          </select>
        </label>
        {ownershipVerified && <div className="segmented" role="group" aria-label={t.collection.ownershipFilters}>
          {(['all', 'owned', 'mastered', 'missing', 'tradeable'] as const).map(filter => <button
            type="button"
            key={filter}
            aria-pressed={ownership === filter}
            onClick={() => update({ ownership: filter })}
          >{t.collection.ownership[filter]}</button>)}
        </div>}
        <button type="button" role="switch" aria-checked={showDucats} className="display-switch" onClick={onToggleDucats}>
          <span className="display-face"><MetalMark metal="ducat"/>{t.collection.ducatValues}</span>
          <span className="display-track" aria-hidden="true"><span className="display-thumb"/></span>
        </button>
      </div>

      {/* The chips and the price controls share a row, so the grid starts where the eye lands. */}
      <div className="filter-row">
        <div className="chips" role="group" aria-label={t.collection.itemCategories}>
          {categories.map(item => <button
            type="button"
            key={item}
            className="chip"
            aria-label={item === 'all' ? t.grid.allCategories : undefined}
            aria-pressed={category === item}
            onClick={() => update({ category: item })}
          >{t.categories[item]}</button>)}
        </div>
        <div className="status-line">
          {dumpDate
            ? <span title={t.collection.pricesFrom(shortDate(dumpDate, t))}>{t.collection.prices(shortDate(dumpDate, t))}</span>
            : <span>{t.collection.noPrices}</span>}
          {/* Live prices come from the market dump and explicit price checks, neither of which
              reads the game or needs verified ownership: Companion and Overlay keep valuation.
              Selling still needs Full, and that gate lives on the sell controls, not here. */}
          <button
            type="button"
            className="stamp primary price-page"
            disabled={pricing || inProgress !== null || pricableVisibleIds.length === 0}
            onClick={() => onPriceLive(pricableVisibleIds)}
          >{pricing || inProgress ? t.collection.pricing : t.collection.pricePage(pricableVisibleIds.length)}</button>
          {inProgress && <span className="pricing" role="status">
            <progress max={Math.max(inProgress.total, 1)} value={inProgress.done} aria-label={t.collection.liveCheck}/>
            <span>{t.collection.checking(inProgress.done, inProgress.total)}</span>
          </span>}
        </div>
      </div>

      {filtered.length
        ? <>
          <ul className="card-grid" aria-label={t.collection.list}>{visibleItems.map(item => <li key={item.id}><CollectionEntry item={item} ownershipVerified={ownershipVerified} showDucats={showDucats} listedOrder={listedOrderFor(view.market_account.orders, item.id)} sellable={ownershipVerified && view.market_account.link === 'linked' && isListable(item, view.market_account.listable)} onSell={onSell} onUpdate={onUpdate} busy={ordersBusy}/></li>)}</ul>
          <p className="result-count">{t.grid.range(firstResult, lastResult, filtered.length)}</p>
          <Pagination current={currentPage} total={totalPages} onChange={page => onFilters({ ...filters, page })}/>
        </>
        : <EmptyState title={t.grid.noMatch} detail={t.grid.tryAnother} action={<button type="button" className="stamp" onClick={() => update({ search: '', category: 'all', ownership: 'all' })}>{t.grid.clearFilters}</button>}/>}
    </> : <EmptyState
      title={snapshotOnly ? t.collection.emptySnapshot : t.collection.empty}
      detail={snapshotOnly ? t.collection.emptySnapshotDetail : t.collection.emptyDetail}
    />}
  </section>
}

function MasteryPage({ view, filters, onFilters, onSell, onUpdate, ordersBusy }: { view: AppView; filters: MasteryFilters; onFilters: (filters: MasteryFilters) => void; onSell: SellHandler; onUpdate: UpdateHandler; ordersBusy: boolean }) {
  const t = useMessages()
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
      <h1 id="mastery-title" className="page-title">{t.mastery.title}</h1>
      {available && <div className="stats">
        <Stat kind="mastered" value={mastered} label={t.mastery.masteredOf(total, total ? Math.round(mastered / total * 100) : null)}/>
        <Stat kind="items" value={items.length} label={t.mastery.remaining}/>
        <Stat kind="arsenal" value={inArsenal} label={t.mastery.inArsenal}/>
        <Stat kind="missing" value={items.length - inArsenal} label={t.mastery.neverHeld}/>
      </div>}
    </div>

    {!available
      ? <EmptyState title={t.mastery.unavailable} detail={t.mastery.unavailableDetail}/>
      : <>
        <div className="toolbar">
          <SearchField label={t.mastery.search} value={search} onChange={value => update({ search: value })}/>
          <label className="select">
            <span aria-hidden="true">{t.grid.sort}</span>
            <select aria-label={t.mastery.sortLabel} value={sort} onChange={event => update({ sort: event.target.value as MasterySort })}>
              {masterySortOptions.map(option => <option key={option} value={option}>{t.mastery.sorts[option]}</option>)}
            </select>
          </label>
        </div>

        {/* The category chips carry the progress: mastered over total, as the profile would. */}
        <div className="chips" role="group" aria-label={t.mastery.categories}>
          <button type="button" className="chip" aria-label={t.grid.allCategories} aria-pressed={category === 'all'} onClick={() => update({ category: 'all' })}>{t.categories.all}</button>
          {totals.map(entry => <button
            type="button"
            key={entry.category}
            className="chip"
            aria-label={`${t.categories[entry.category]} ${entry.mastered}/${entry.total}`}
            aria-pressed={category === entry.category}
            onClick={() => update({ category: entry.category })}
          >{t.categories[entry.category]}<span className="chip-count">{entry.mastered}/{entry.total}</span></button>)}
        </div>

        {filtered.length
          ? <>
            <ul className="card-grid" aria-label={t.mastery.list}>{visibleItems.map(item => <li key={item.id}><CollectionEntry item={item} ownershipVerified missingLabel={t.card.neverHeld} showDucats={false} listedOrder={null} sellable={false} onSell={onSell} onUpdate={onUpdate} busy={ordersBusy}/></li>)}</ul>
            <p className="result-count">{t.grid.range(firstResult, lastResult, filtered.length)}</p>
            <Pagination current={currentPage} total={totalPages} onChange={page => onFilters({ ...filters, page })}/>
          </>
          : <EmptyState
            title={t.mastery.nothingLeft}
            detail={items.length ? t.grid.tryAnother : t.mastery.allMastered}
            action={items.length > 0 && <button type="button" className="stamp" onClick={() => update({ search: '', category: 'all' })}>{t.grid.clearFilters}</button>}
          />}
      </>}
  </section>
}

function CollectionEntry({ item, ownershipVerified, missingLabel, showDucats, listedOrder, sellable, onSell, onUpdate, busy }: { item: CollectionItem; ownershipVerified: boolean; missingLabel?: string; showDucats: boolean; listedOrder: MarketOrder | null; sellable: boolean; onSell: SellHandler; onUpdate: UpdateHandler; busy: boolean }) {
  const t = useMessages()
  const missing = item.quantity === 0
  const [artFailed, setArtFailed] = useState(false)
  const [selling, setSelling] = useState(false)
  // The rank belongs in the accessible name: a mod held at two ranks is two cards headed the same
  // word, and without it they are indistinguishable to anyone not reading the badges.
  const rank = rankLabel(item, t)
  const label = rank ? `${item.name}, ${rank}` : item.name
  // Nothing offered on a card whose whole holding is already listed: the badge says so, and the
  // market allows one sell order per item. A listing that covers part of the holding keeps the
  // control, as an edit of the listing that already stands.
  const remaining = sellable && (!listedOrder || listedOrder.quantity < item.quantity)
  return <article className="card" aria-label={label} data-held={item.quantity > 0 ? 'true' : 'false'}>
    <div className="card-art">
      {item.image_url && !artFailed
        ? <img src={item.image_url} alt={item.name} loading="lazy" decoding="async" onError={() => setArtFailed(true)}/>
        : <span aria-hidden="true">{t.categories[item.category].slice(0, 2)}</span>}
    </div>
    <div className="card-body">
      <h2 className="card-name" title={item.name}>{item.name}</h2>
      <span className="card-meta">{t.categories[item.category]}</span>
      <div className="tags">
        {ownershipVerified
          ? missing
            ? <span className="tag absent">{missingLabel ?? t.card.missing}</span>
            : <span className="tag">{t.card.owned(item.quantity)}</span>
          : null}
        {rank && <span className={`tag rank${atMaxRank(item) ? ' maxed' : ''}`}>{rank}</span>}
        {ownershipVerified && item.mastered && <span className="tag mastered">{t.card.mastered}</span>}
        {listedOrder && <span className="tag listed">{listedLabel(listedOrder, item.quantity, t)}</span>}
      </div>
    </div>
    <div className="card-values">
      {item.platinum !== undefined && <span className="value plat">
        <MetalMark metal="plat" alt={t.card.platinum}/>
        {item.platinum_ceiling === undefined
          ? <>
            <b>{item.platinum}</b>
            {ownershipVerified && item.quantity > 1 && <em>{t.card.total(stackValue(item) ?? 0)}</em>}
          </>
          // Nobody sells a half-ranked card, so the market brackets it without ever quoting it.
          // The two ends are what is known; a single number here would be invented.
          : <b title={t.card.rankBracket}>
            {item.platinum}–{item.platinum_ceiling}
          </b>}
      </span>}
      {/* Baro's price, beside the market's. It is a fact of the item rather than of a holding,
          so it reads on a missing part too, and it totals like platinum does. */}
      {showDucats && (item.ducats !== undefined
        ? <span className="value ducat">
          <MetalMark metal="ducat" alt={t.card.ducat}/>
          <b>{item.ducats}</b>
          {ownershipVerified && item.quantity > 1 && <em>{t.card.total(item.ducats * item.quantity)}</em>}
        </span>
        : item.category === 'prime_part' && <span className="value-missing">{t.card.ducatUnavailable}</span>)}
      {/* The backend pairs `live` with a price today, but the view allows one without the other, and
          "Checked live" next to no figure reads as a value that is missing by mistake. */}
      {item.live && <span className="checked-live">{item.platinum === undefined ? t.card.noMarketPrice : t.card.checkedLive}</span>}
      {/* On the value line, so a sellable card is no taller than its neighbours. */}
      {remaining && !selling && <button type="button" className="stamp sell-open" disabled={busy} onClick={() => setSelling(true)}>{listedOrder ? t.card.sellMore : t.card.sell}</button>}
    </div>
    {remaining && selling && <SellForm item={item} listing={listedOrder ?? undefined} busy={busy} onSell={onSell} onUpdate={onUpdate} onDone={() => setSelling(false)}/>}
  </article>
}

function Pagination({ current, total, onChange }: { current: number; total: number; onChange: (page: number) => void }) {
  const t = useMessages()
  if (total <= 1) return null
  const pages = pageNumbers(current, total)
  return <nav className="pagination" aria-label={t.grid.pages}>
    <button type="button" disabled={current === 1} aria-label={t.grid.previous} onClick={() => onChange(current - 1)}><Icon name="previous"/></button>
    {pages.map((page, index) => <span key={page} className="page-slot">
      {index > 0 && page - pages[index - 1] > 1 ? <i aria-hidden="true">…</i> : null}
      <button type="button" aria-current={page === current ? 'page' : undefined} aria-label={t.grid.goTo(page)} onClick={() => onChange(page)}>{page}</button>
    </span>)}
    <button type="button" disabled={current === total} aria-label={t.grid.next} onClick={() => onChange(current + 1)}><Icon name="next"/></button>
  </nav>
}

function RewardPage({ view, effectiveMode }: { view: AppView; effectiveMode: AccessMode }) {
  const t = useMessages()
  const ownershipVerified = effectiveMode === 'full'
  const companion = effectiveMode === 'companion'
  return <div className="page">
    <div className="page-head">
      <h1 id="reward-title" className="page-title">{t.rewards.title}</h1>
      <p className="page-note">{companion ? t.rewards.companionNote : t.rewards.note}</p>
    </div>
    <section aria-label={t.rewards.title}>
      {view.reward.cards.length
        ? <RewardCards cards={view.reward.cards} bestValueIndex={view.reward.best_value_index} bestDucatIndex={view.reward.best_ducat_index} ownershipVerified={ownershipVerified}/>
        : <EmptyState title={t.rewards.none} detail={companion ? t.rewards.companionDetail : t.rewards.waiting}/>}
    </section>
  </div>
}

/** A service's state in words. Its message is the backend's and stays in English: it is composed
 * from live values (paths, counts, error text) that no catalog can hold. */
function HealthRow({ label, health }: { label: string; health: BackendHealth | { state: HealthState; message: string; last_success?: string | null } }) {
  const t = useMessages()
  return <article className={`health-row ${health.state}`}>
    <StateIcon state={health.state}/>
    <div>
      <h3>{label}</h3>
      <p title={health.message}>{health.message}</p>
      {/* Rows record their success time in whatever form their own source keeps: most write Unix
          seconds, the price table an ISO date. The relative reading is the useful one here; the
          exact stamp rides along for anyone comparing a row against a log. */}
      {health.last_success && <small>{t.health.lastSuccess(healthSuccessLabel(health.last_success, t))}</small>}
    </div>
    <span className="verdict">{t.health.states[health.state]}</span>
  </article>
}

function healthSuccessLabel(value: string, t: Messages) {
  const reading = stampReading(value, new Date(), t)
  return reading ? `${reading.relative} · ${reading.exact}` : value
}

type ReportStatus =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'done'; message: string }

function ReportBlock({ health, alwaysVisible }: { health: AppView['health']; alwaysVisible?: boolean }) {
  const t = useMessages()
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
    <section className={`report${broken ? ' broken' : ''}`} role="group" aria-label={t.report.title}>
      <div className="report-head">
        <StateIcon state={broken ? 'failed' : 'ready'}/>
        <h2 className="section-title">{t.report.title}</h2>
        <p className="prose">{broken ? t.report.failed : ''}{t.report.intro}</p>
      </div>
      <div className="report-actions">
        <button type="button" className="stamp" disabled={status.kind === 'busy'} onClick={() => void run(openIssue, () => t.report.opened)}>{t.report.openIssue}</button>
        <button type="button" className="stamp" disabled={status.kind === 'busy'} onClick={() => void run(copyReport, () => t.report.copied)}>{t.report.copy}</button>
        <button type="button" className="stamp" disabled={status.kind === 'busy'} onClick={() => void run(saveReport, result =>
          t.report.saved(result?.folder_path ?? '…', result?.ee_log_included ?? false),
        )}>{t.report.save}</button>
      </div>
      {status.kind === 'done' && <p className="report-status" role="status">{status.message}</p>}
    </section>
  )
}

function DiagnosticsPage({ view, effectiveMode }: { view: AppView; effectiveMode: AccessMode }) {
  const t = useMessages()
  const referenceSystems = ['catalog', 'market', 'collection_prices', 'database', 'market_account'] as const
  const liveSystems = ['game_reader', 'log_monitor', 'capture'] as const
  const systems = effectiveMode === 'companion' ? referenceSystems : [...liveSystems, ...referenceSystems]
  const showAcquisition = effectiveMode === 'full'
  return <div className="page">
    <div className="page-head">
      <h1 id="diagnostics-title" className="page-title">{t.diagnostics.title}</h1>
      <p className="page-note">{t.diagnostics.note}</p>
    </div>
    <ReportBlock health={view.health}/>
    <section className="page-section" aria-label={t.diagnostics.title}>
      {effectiveMode === 'companion' && <p className="prose">{t.diagnostics.companion}</p>}
      <h2 className="section-title">{t.diagnostics.services}</h2>
      <div className="health-list">{systems.map(system => <HealthRow key={system} label={t.diagnostics.systems[system]} health={view.health[system]}/>)}</div>

      {showAcquisition && <>
        <h2 className="section-title">{t.diagnostics.acquisition}</h2>
        {view.health.acquisition_stages.length
          ? <ol className="stages">{view.health.acquisition_stages.map((stage, index) => {
            // A stage the catalog does not name yet reads as its id in words.
            const words = stage.stage.replaceAll('_', ' ')
            const label = (t.diagnostics.stages as Partial<Record<string, string>>)[stage.stage] ?? words[0].toUpperCase() + words.slice(1)
            return <li key={stage.stage} className={stage.state}>
              <span className="stage-index">{index + 1}</span>
              <StateIcon state={stage.state}/>
              <div><strong>{label}</strong><p>{stage.message}</p></div>
              <span className="verdict">{t.health.states[stage.state]}</span>
            </li>
          })}</ol>
          : <EmptyState title={t.diagnostics.noAttempt} detail={t.diagnostics.noAttemptDetail}/>}
      </>}
    </section>
  </div>
}

function SettingsPage({ view, language, onLanguage, priceFloor, effectiveMode, selectedMode, modeBusy, modeError, onSelectMode, onConfirmMode, desktopCaptureActionAvailable, captureAuthorizationBusy, captureNote, onCaptureNote, onAuthorizeCapture, onPriceFloor }: { view: AppView; language: Language | null; onLanguage: (language: Language | null) => void; priceFloor: number; effectiveMode: AccessMode; selectedMode: AccessMode; modeBusy: boolean; modeError: string | null; onSelectMode: (mode: AccessMode) => void; onConfirmMode: () => void; desktopCaptureActionAvailable: boolean; captureAuthorizationBusy: boolean; captureNote: CaptureNote | null; onCaptureNote: (note: CaptureNote | null) => void; onAuthorizeCapture: () => Promise<void>; onPriceFloor: (floor: number) => void }) {
  const t = useMessages()
  const { sellable: total, sellableCount: counted } = collectionTotals(view.collection.items, priceFloor)
  return <section className="page" aria-labelledby="settings-title">
    <div className="page-head">
      <h1 id="settings-title" className="page-title">{t.settings.title}</h1>
      <p className="page-note">{t.settings.note}</p>
    </div>
    <section className="page-section" aria-labelledby="access-setting-title">
      <h2 id="access-setting-title" className="section-title">{t.settings.access}</h2>
      <p className="band-note">{t.settings.accessNote}</p>
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

    <LanguageSetting preference={language} onSaved={onLanguage}/>

    <section className="page-section" aria-labelledby="collection-setting-title">
      <h2 id="collection-setting-title" className="section-title">{t.settings.collection}</h2>
      <div className="setting">
        <div>
          <h3>{t.settings.priceFloor}</h3>
          <p className="prose">{t.settings.priceFloorNote}</p>
        </div>
        <div className="dial">
          <label className="dial-slot">
            <span className="sr-only">{t.settings.priceFloorLabel}</span>
            <input
              type="range"
              min={0}
              max={MAX_PRICE_FLOOR}
              step={1}
              value={priceFloor}
              style={{ '--dial-fill': `${priceFloor / MAX_PRICE_FLOOR * 100}%` } as CSSProperties}
              aria-valuetext={priceFloor ? t.settings.floorValue(priceFloor) : t.settings.everyPriceCounts}
              onChange={event => onPriceFloor(Number(event.target.value))}
            />
          </label>
          <output className="dial-figure">
            {priceFloor ? <>{priceFloor}<MetalMark metal="plat" alt={t.units.platinum}/><span>{t.settings.andOver}</span></> : <span>{t.settings.everyPrice}</span>}
          </output>
        </div>
        <p className="band-note">{t.settings.floorSummary(counted, total)}</p>
      </div>
    </section>

    <section className="page-section" aria-labelledby="overlays-setting-title">
      <h2 id="overlays-setting-title" className="section-title">{t.settings.overlays}</h2>
      <MasteryMarksSetting/>

      <DesktopCaptureSetting actionAvailable={effectiveMode !== 'companion' && desktopCaptureActionAvailable} prohibited={effectiveMode === 'companion'} busy={captureAuthorizationBusy} note={captureNote} onNote={onCaptureNote} onAuthorize={onAuthorizeCapture}/>

      <div className="setting">
        <div>
          <h3>{t.settings.placement}</h3>
          <p className="prose">{t.settings.placementNote}</p>
        </div>
        <OverlayPreviewToggle prohibited={effectiveMode === 'companion'} busy={modeBusy}/>
      </div>
    </section>

    <section className="page-section" aria-labelledby="updates-title">
      <UpdatesSetting observesGame={effectiveMode !== 'companion'}/>
    </section>

    <div className="page-section">
      <ReportBlock health={view.health} alwaysVisible/>
    </div>

    <AboutSection effectiveMode={effectiveMode}/>
  </section>
}


/** The preference lives in the backend and a click is a command it may refuse. A refusal leaves
 * the switch where it was and says so, so the thumb never claims a state the overlays are not in. */
function MasteryMarksSetting() {
  const t = useMessages()
  const [enabled, setEnabled] = useState(true)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<'unreadable' | 'unsaved' | null>(null)

  useEffect(() => {
    let mounted = true
    // A failed read leaves the switch on, the backend's own fallback, and usable: a control frozen
    // on a guess would teach the player that the guess is a fact.
    getPreferences()
      .then(preferences => { if (mounted) setEnabled(preferences.mastery_marks) })
      .catch(() => { if (mounted) setNote('unreadable') })
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
      setNote('unsaved')
    } finally {
      setBusy(false)
    }
  }

  return <div className="setting">
    <div>
      <h3>{t.settings.marks}</h3>
      <p className="prose">{t.settings.marksNote}</p>
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
      <span className="display-face">{t.settings.marksSwitch}</span>
      <span className="display-track" aria-hidden="true"><span className="display-thumb"/></span>
    </button>
    {note && <p className="band-note" role="status">{t.settings[note]}</p>}
  </div>
}

/** System, English or Français. Like the marks, a backend preference: the overlays read it there.
 * Each language is named in itself, so it can be found from a screen the player cannot read. */
function LanguageSetting({ preference, onSaved }: { preference: Language | null; onSaved: (language: Language | null) => void }) {
  const t = useMessages()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  async function choose(next: Language | null) {
    if (busy || next === preference) return
    setBusy(true)
    setFailed(false)
    try {
      // The stored answer, not the request, decides what the screen shows.
      onSaved((await setLanguage(next)).language ?? null)
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }
  const choices: Array<{ value: Language | null; label: string }> = [
    { value: null, label: t.settings.system },
    { value: 'en', label: LANGUAGE_NAMES.en },
    { value: 'fr', label: LANGUAGE_NAMES.fr },
  ]
  return <section className="page-section" aria-labelledby="language-setting-title">
    <h2 id="language-setting-title" className="section-title">{t.settings.language}</h2>
    <div className="setting">
      <p className="prose">{t.settings.languageNote}</p>
      <div className="segmented" role="group" aria-labelledby="language-setting-title">
        {choices.map(choice => <button
          type="button"
          key={choice.label}
          lang={choice.value ?? undefined}
          aria-pressed={preference === choice.value}
          disabled={busy}
          onClick={() => { void choose(choice.value) }}
        >{choice.label}</button>)}
      </div>
      {failed && <p className="band-note" role="status">{t.settings.unsaved}</p>}
    </div>
  </section>
}

/** `note` is a key into the catalog's settings, held by `App` so it outlives the page. */
type CaptureNote = 'captureAllowed' | 'captureAgain' | 'captureDenied'

function DesktopCaptureSetting({ actionAvailable, prohibited, busy, note, onNote, onAuthorize }: { actionAvailable: boolean; prohibited: boolean; busy: boolean; note: CaptureNote | null; onNote: (note: CaptureNote | null) => void; onAuthorize: () => Promise<void> }) {
  const t = useMessages()
  useEffect(() => {
    if (actionAvailable && note === 'captureAllowed') {
      onNote('captureAgain')
    }
  }, [actionAvailable, note, onNote])
  async function authorize() {
    if (busy) return
    onNote(null)
    try {
      await onAuthorize()
      onNote('captureAllowed')
    } catch {
      onNote('captureDenied')
    }
  }
  return <div className="setting">
    <div>
      <h3>{t.settings.capture}</h3>
      <p className="prose">{t.settings.captureNote}</p>
      {actionAvailable && <p className="prose">{t.settings.captureChooser}</p>}
    </div>
    {(actionAvailable || prohibited) && <div className="prohibited-control">
      <button type="button" className="stamp" onClick={authorize} disabled={busy || prohibited} aria-busy={busy} aria-describedby={prohibited ? 'capture-prohibited' : undefined}>{busy ? t.settings.allowingCapture : t.settings.allowCapture}</button>
      {prohibited && <p className="prohibition-note" id="capture-prohibited">{t.settings.captureProhibited}</p>}
    </div>}
    <p className="band-note capture-status" role="status" aria-live="polite" aria-atomic="true">{note && t.settings[note]}</p>
  </div>
}

/** What TennoScope is, and what it does to this machine in the current mode. */
function AboutSection({ effectiveMode }: { effectiveMode: AccessMode }) {
  const t = useMessages()
  const observesGame = effectiveMode !== 'companion'
  const acquiresInventory = effectiveMode === 'full'
  const [info, setInfo] = useState<VersionInfo | null>(null)
  // The version is a frontend build constant: the line renders even when the
  // backend is down, gaining installer identity once getVersionInfo lands.
  useEffect(() => {
    getVersionInfo().then(setInfo).catch(() => {})
  }, [])
  const installer = !info || info.kind === 'unknown'
    ? undefined
    : info.kind === 'system_linux' ? (info.manager ?? t.about.installers.system_linux) : t.about.installers[info.kind]
  return <section className="page-section" aria-labelledby="about-title">
    <h2 id="about-title" className="section-title">{t.about.title}</h2>
    <p className="prose">{t.about.tagline}</p>
    <p className="band-note">{t.about.version(info?.version ?? APP_VERSION, installer)}</p>

    {/* What each access level reads, and what Full sends, is said once, in the selector above. */}
    <div className="setting">
      <div>
        <h3>{t.about.storage}</h3>
        <p className="prose">{t.about.storageNote}</p>
      </div>
    </div>
    <div className="setting">
      <div>
        <h3>{t.about.sync}</h3>
        <p className="prose">{acquiresInventory ? t.about.syncFull : t.about.syncOther}</p>
      </div>
    </div>
    <div className="setting">
      <div>
        <h3>{t.about.assistance}</h3>
        <p className="prose">{observesGame ? t.about.assistanceObserving : t.about.assistanceOther}</p>
      </div>
    </div>
  </section>
}

/**
 * The strip is placed against the game's own window, so a preview is the only way
 * to see it without a fissure running. A preview you cannot dismiss does not
 * earn its place, which is why this is a toggle and not a one-way button.
 */
function OverlayPreviewToggle({ prohibited, busy }: { prohibited: boolean; busy: boolean }) {
  const t = useMessages()
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
    >{shown ? t.settings.hideOverlay : t.settings.previewOverlay}</button>
    {prohibited && <p id="overlay-prohibited" className="prohibition-note">{t.settings.overlayProhibited}</p>}
    {!prohibited && blocked && <p id="overlay-blocked" className="band-note" role="status">{t.settings.overlayBlocked}</p>}
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
