import { useCallback, useEffect, useRef, useState } from 'react'
import './App.css'
import {
  authorizeScreenCapture,
  getPreferences,
  getSetupStatus,
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
  setOrderQuantity,
  type AppView,
  type AccessMode,
  type CollectionItem,
  type HealthState,
  type SetupStatus,
  type Presence,
  type Language,
} from './backend'
import { rankLabel } from './collection'
import { readPriceFloor, readShowDucats, writePriceFloor, writeShowDucats } from './settings'
import { snapshotFreshness } from './freshness'
import { bootUpdateChecks } from './updateStore'
import { UpdateMark } from './UpdateSettings'
import { AccessSelector } from './AccessSelector'
import { accessMode } from './access'
import { Icon } from './components/Icon'
import { StateIcon } from './components/StateIcon'
import { TitleBar } from './components/TitleBar'
import { Tip } from './components/Tip'
import { MarketStatus } from './components/MarketStatus'
import { CollectionPage, type CollectionFilters } from './pages/CollectionPage'
import { DashboardPage } from './pages/DashboardPage'
import { RelicsPage } from './pages/RelicsPage'
import { MarketPage } from './pages/MarketPage'
import { FoundryPage } from './pages/FoundryPage'
import { RewardPage } from './pages/RewardPage'
import { OrdersView } from './pages/OrdersView'
import { DiagnosticsPage } from './pages/DiagnosticsPage'
import { SettingsPage, type CaptureNote } from './pages/SettingsPage'
import { MessagesContext, backendReason, catalogs, resolveLanguage, useDocumentLanguage, useMessages, type Messages } from './i18n'

/** Collection's filters. Held here, not by the page, so they survive a change of page. */
const initialCollectionFilters: CollectionFilters = { search: '', category: 'all', ownership: 'all', sort: 'name-asc', masterySort: 'arsenal-first', page: 1 }

/**
 * The rail, top to bottom, then the pair that stays at its foot. A page joins by adding its id
 * here; `tsc` then asks for its icon (`components/Icon.tsx`) and its name (`nav.pages` in each
 * catalog), and the page switch in `App` renders it.
 */
const railPages = ['dashboard', 'collection', 'relics', 'foundry', 'market', 'rewards', 'orders'] as const
const railEndPages = ['diagnostics', 'settings'] as const
type Page = typeof railPages[number] | typeof railEndPages[number]

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
  const [page, setPage] = useState<Page>('dashboard')
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
  const readerLabel = effectiveMode === 'companion' ? t.sidebar.companionMode : t.sidebar.reader[liveState]
  const inventoryReadable = setupStatus.access_mode === 'full'
  const refreshLabel = busy ? t.sidebar.refreshing : t.sidebar.refreshInventory
  const navItem = (item: Page) => {
    const count = navCount[item] ?? 0
    return <Tip key={item} text={t.nav.pages[item]}>
      <button
        type="button"
        className="rail-item"
        aria-label={count ? `${t.nav.pages[item]}, ${item === 'rewards' ? t.nav.choices(count) : t.nav.needAttention(count)}` : t.nav.pages[item]}
        aria-current={page === item ? 'page' : undefined}
        onClick={() => openPage(item)}
      >
        <Icon name={item}/>
        {count > 0 && <span className="nav-count" aria-hidden="true">{count}</span>}
      </button>
    </Tip>
  }
  const settingsMode = selectedMode ?? effectiveMode
  return <MessagesContext value={t}><div className="shell">
    <TitleBar>{view && <MarketStatus account={view.market_account} busy={ordersBusy} onPresence={ordersPresence} onLink={() => openPage('orders')}/>}</TitleBar>

    <aside className="rail">
      <nav className="rail-nav" aria-label={t.nav.primary}>
        <div className="rail-group">{railPages.map(navItem)}</div>
        <div className="rail-group rail-end">{railEndPages.map(navItem)}</div>
      </nav>
      <section className="rail-foot" aria-label={t.sidebar.runtime}>
        <span className="sr-only" role="status">{readerLabel}</span>
        {/* The detail and the snapshot age are the reader's description, read on focus. */}
        <span id="reader-detail" hidden>{readerDetail}</span>
        {view && <span id="inventory-freshness" hidden>{freshness.label}, {freshness.detail}</span>}
        <Tip text={<><strong>{readerLabel}</strong><span>{readerDetail}</span>{view && <><small>{freshness.label}</small><small>{freshness.detail}</small></>}</>}>
          <button type="button" className={`rail-item reader ${readerState}`} aria-label={readerLabel} aria-describedby={view ? 'reader-detail inventory-freshness' : 'reader-detail'} onClick={() => openPage('diagnostics')}>
            <StateIcon state={readerState}/>
          </button>
        </Tip>
        <Tip text={<><strong>{refreshLabel}</strong>{!inventoryReadable && <span>{t.sidebar.fullRequired}</span>}</>}>
          <button type="button" className="rail-item" aria-label={refreshLabel} onClick={refresh} disabled={busy || modeBusy || !inventoryReadable} aria-describedby={inventoryReadable ? undefined : 'inventory-access-note'}>
            <Icon name="refresh"/>
          </button>
        </Tip>
        {!inventoryReadable && <span id="inventory-access-note" className="sr-only">{t.sidebar.fullRequired}</span>}
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
        {page === 'dashboard' && <DashboardPage view={view} effectiveMode={effectiveMode} priceFloor={priceFloor} now={clock} onOpen={openPage} onToMaster={() => {
          setCollectionFilters(filters => ({ ...filters, ownership: 'toMaster', page: 1 }))
          openPage('collection')
        }}/>}
        {page === 'collection' && <CollectionPage view={view} effectiveMode={effectiveMode} filters={collectionFilters} onFilters={setCollectionFilters} pricing={pricing} onPriceLive={priceLive} priceFloor={priceFloor} showDucats={showDucats} onToggleDucats={() => {
          writeShowDucats(!showDucats)
          setShowDucats(!showDucats)
        }} onSell={ordersSell} onUpdate={ordersUpdate} ordersBusy={ordersBusy}/>}
        {page === 'relics' && <RelicsPage view={view} effectiveMode={effectiveMode}/>}
        {page === 'market' && <MarketPage view={view} effectiveMode={effectiveMode} onSell={ordersSell} onUpdate={ordersUpdate} ordersBusy={ordersBusy}/>}
        {page === 'foundry' && <FoundryPage view={view} effectiveMode={effectiveMode}/>}
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

export default App
