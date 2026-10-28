import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { writeText } from '@tauri-apps/plugin-clipboard-manager'
import { marketBoard, marketItemOrders, marketSearch, type AccessMode, type AppView, type BoardRow, type LiveOrder, type MarketBoard, type MarketHit, type MarketItemOrders, type MarketSearch } from '../backend'
import { figure, rankLabel } from '../collection'
import { isListable, listedOrderFor } from '../orders'
import { stampReading } from '../freshness'
import { MetalMark } from '../MetalMark'
import { SellForm, type SellHandler, type UpdateHandler } from '../SellForm'
import { Platinum } from '../components/Platinum'
import { Change } from '../components/Change'
import { EmptyState } from '../components/EmptyState'
import { Icon } from '../components/Icon'
import { backendReason, shortDate, useMessages, type Messages } from '../i18n'
import { boardName, rememberViewed, viewedRecently, whisper, type Side, type Viewed } from '../market'
import './MarketPage.css'

type Orders = { state: 'loading' } | { state: 'ready'; orders: MarketItemOrders } | { state: 'failed'; message: string }
type Search = { query: string; result?: MarketSearch; error?: string }
type Board = { state: 'ready'; board: MarketBoard } | { state: 'failed'; message: string }

/** A failure, then the backend's reason in this catalog's words when it gives one. */
function withReason(failure: string, reason: unknown, t: Messages): string {
  if (typeof reason !== 'string' || !reason.trim()) return failure
  const text = backendReason(reason.trim().replace(/\.$/, ''), t)
  return `${failure} ${/^\S+\.\S/.test(text) ? text : text[0].toUpperCase() + text.slice(1)}.`
}

function Thumb({ hit, name = hit?.name ?? '' }: { hit: MarketHit | undefined; name?: string }) {
  const [failed, setFailed] = useState(false)
  return <span className="market-thumb">
    {hit?.thumb_url && !failed
      ? <img src={hit.thumb_url} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)}/>
      : <span aria-hidden="true">{name.slice(0, 2)}</span>}
  </span>
}

/** Ringed dot in game, plain dot online: the title bar's marks for the same two states. */
function TraderMark({ status }: { status: LiveOrder['status'] }) {
  return <svg className={`presence-mark ${status}`} viewBox="0 0 12 12" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5">
    {status === 'online'
      ? <circle cx="6" cy="6" r="3.5" fill="currentColor" stroke="none"/>
      : <><circle cx="6" cy="6" r="2.25" fill="currentColor" stroke="none"/><circle cx="6" cy="6" r="5"/></>}
  </svg>
}

export function MarketPage({ view, effectiveMode, onSell, onUpdate, ordersBusy }: {
  view: AppView
  effectiveMode: AccessMode
  onSell: SellHandler
  onUpdate: UpdateHandler
  ordersBusy: boolean
}) {
  const t = useMessages()
  const m = t.marketPage
  const listId = useId()
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState<Search | null>(null)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [selected, setSelected] = useState<Viewed | null>(null)
  const [orders, setOrders] = useState<Orders | null>(null)
  const [recent, setRecent] = useState(viewedRecently)
  const [selling, setSelling] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [clock, setClock] = useState(() => new Date())
  const [board, setBoard] = useState<Board | null>(null)
  const orderRequest = useRef(0)
  const pricesAt = view.health.collection_prices.last_success

  // The day's rankings come from the daily summary in hand; a new one redraws them.
  useEffect(() => {
    let live = true
    marketBoard()
      .then(next => { if (live) setBoard({ state: 'ready', board: next }) })
      .catch(reason => { if (live) setBoard({ state: 'failed', message: withReason(m.board.failed, reason, t) }) })
    return () => { live = false }
  }, [pricesAt, m, t])

  const ranked = board?.state === 'ready' && board.board.date ? { board: board.board, date: board.board.date } : null
  const trimmed = query.trim()
  useEffect(() => {
    if (trimmed.length < 2) {
      setSearch(null)
      return
    }
    let live = true
    // Typing is not a request each: the table is local, but each keystroke is still a round trip.
    const timer = setTimeout(() => {
      setSearch({ query: trimmed })
      marketSearch(trimmed)
        .then(result => {
          if (!live) return
          setSearch({ query: trimmed, result })
          setActive(0)
        })
        .catch(reason => { if (live) setSearch({ query: trimmed, error: withReason(m.searchFailed, reason, t) }) })
    }, 150)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [trimmed, m, t])

  // The age of the live orders is part of what they say.
  useEffect(() => {
    const timer = setInterval(() => setClock(new Date()), 15_000)
    return () => clearInterval(timer)
  }, [])

  function loadOrders(slug: string) {
    const generation = ++orderRequest.current
    setOrders({ state: 'loading' })
    marketItemOrders(slug)
      .then(next => {
        if (generation !== orderRequest.current) return
        setClock(new Date())
        setOrders({ state: 'ready', orders: next })
      })
      .catch(reason => { if (generation === orderRequest.current) setOrders({ state: 'failed', message: withReason(m.ordersFailed, reason, t) }) })
  }

  function choose(viewed: Viewed) {
    setSelected(viewed)
    setSelling(null)
    setQuery('')
    setOpen(false)
    setRecent(rememberViewed(viewed))
    loadOrders(viewed.hit.slug)
  }

  const hits = search?.result?.hits ?? []
  const showList = open && hits.length > 0 && search?.query === trimmed
  const searching = search !== null && !search.result && !search.error
  const pick = (hit: MarketHit) => choose({ hit, dumpDate: search?.result?.dump_date ?? null })

  async function copy(order: LiveOrder, side: Side, key: string) {
    if (!selected) return
    try {
      await writeText(whisper(order, selected.hit.name, side))
      setCopied(key)
      setNote(m.copiedNote(order.user))
      setTimeout(() => setCopied(current => current === key ? null : current), 2000)
    } catch {
      setNote(m.copyFailed)
    }
  }

  const otherRecent = recent.filter(entry => entry.hit.slug !== selected?.hit.slug)

  return <section className="page market-page" aria-labelledby="market-title">
    <div className="page-head">
      <h1 id="market-title" className="page-title">{m.title}</h1>
      <p className="page-note">{m.note}</p>
    </div>

    <div className="market-search">
      <label className="search">
        <Icon name="search"/>
        <input
          type="search"
          role="combobox"
          aria-label={m.search}
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList ? `${listId}-${active}` : undefined}
          placeholder={m.placeholder}
          value={query}
          onChange={event => {
            setQuery(event.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={event => {
            if (event.key === 'Escape') setOpen(false)
            if (!showList) return
            if (event.key === 'ArrowDown') setActive(index => (index + 1) % hits.length)
            else if (event.key === 'ArrowUp') setActive(index => (index - 1 + hits.length) % hits.length)
            else if (event.key === 'Enter') pick(hits[Math.min(active, hits.length - 1)])
            else return
            event.preventDefault()
          }}
        />
      </label>
      {showList && <ul id={listId} role="listbox" className="market-suggestions" aria-label={m.suggestions}>
        {hits.map((hit, index) => <li
          key={hit.slug}
          id={`${listId}-${index}`}
          role="option"
          aria-selected={index === active}
          // Keeps focus in the field, so the blur does not close the list before the click lands.
          onMouseDown={event => event.preventDefault()}
          onMouseEnter={() => setActive(index)}
          onClick={() => pick(hit)}
        >
          <Thumb hit={hit}/>
          <span className="suggestion-name">{hit.name}</span>
          {hit.median !== null && <span className="value plat"><MetalMark metal="plat" alt={t.card.platinum}/><b>{figure(hit.median, t)}</b></span>}
          <span className="suggestion-pace">{hit.monthly_trades ? m.pace(hit.monthly_trades) : ''}</span>
        </li>)}
      </ul>}
      <p className="band-note" role="status">
        {searching ? m.searching : search?.result && hits.length === 0 ? m.noMatch(search.query) : ''}
      </p>
      {search?.error && <p className="error-banner" role="alert">{search.error}</p>}
    </div>

    {otherRecent.length > 0 && <div className="market-recent">
      <h2 className="section-title">{m.recent}</h2>
      <div className="chips">
        {otherRecent.map(entry => <button key={entry.hit.slug} type="button" className="chip" onClick={() => choose(entry)}>{entry.hit.name}</button>)}
      </div>
    </div>}

    {selected && ranked && <button type="button" className="link-button market-back" onClick={() => setSelected(null)}>{m.board.back}</button>}

    {selected
      ? <ItemSheet
        viewed={selected}
        view={view}
        ownershipVerified={effectiveMode === 'full'}
        orders={orders}
        clock={clock}
        selling={selling}
        onSelling={setSelling}
        onSell={onSell}
        onUpdate={onUpdate}
        ordersBusy={ordersBusy}
        onRefresh={() => loadOrders(selected.hit.slug)}
        copied={copied}
        onCopy={copy}
      />
      : ranked
        ? <Rankings {...ranked} onOpen={choose}/>
        : <>
          {board?.state === 'failed' && <p className="error-banner" role="alert">{board.message}</p>}
          <EmptyState icon="market" title={m.emptyTitle} detail={board?.state === 'ready' ? `${m.emptyDetail} ${m.board.waiting}` : m.emptyDetail}/>
        </>}

    <p className="sr-only" role="status">{note}</p>
  </section>
}

type Week = 'rising' | 'falling'

/** The day's trades, ranked: what sold most, fastest and for the most platinum, and what moved. */
function Rankings({ board, date, onOpen }: { board: MarketBoard; date: string; onOpen: (viewed: Viewed) => void }) {
  const t = useMessages()
  const b = t.marketPage.board
  const headingId = useId()
  const [week, setWeek] = useState<Week>('rising')
  const open = (hit: MarketHit) => onOpen({ hit, dumpDate: date })

  return <section className="market-board" aria-labelledby={headingId}>
    <div className="market-board-head">
      <h2 id={headingId}>{b.title(shortDate(date, t))}</h2>
      <p className="band-note">{b.note(board.earlier_date && shortDate(board.earlier_date, t))}</p>
    </div>
    <div className="market-rankings">
      <Ranked title={b.mostSold} figure={b.sales} rows={board.most_sold} hits={board.hits} onOpen={open}
        value={row => figure(row.sales, t)}/>
      <Ranked title={b.fastest} figure={b.perListing} rows={board.fastest} hits={board.hits} onOpen={open}
        value={row => figure(row.sales / row.listings, t, 2)} note={b.fastestNote}/>
      <Ranked title={b.mostPlatinum} figure={b.traded} rows={board.most_platinum} hits={board.hits} onOpen={open}
        value={row => <Platinum value={row.traded}/>}/>
      <Ranked title={b.week} figure={b.change} rows={board[week]} hits={board.hits} onOpen={open}
        value={row => <Change value={row.change}/>}
        note={b.weekNote}
        empty={board.earlier_date ? b.noChange : b.noEarlier}
        control={<div className="segmented" role="group" aria-label={b.week}>
          {(['rising', 'falling'] as Week[]).map(option => <button key={option} type="button" aria-pressed={week === option} onClick={() => setWeek(option)}>{b[option]}</button>)}
        </div>}/>
    </div>
  </section>
}

/** One ranking: a titled group of rows, each opening its item as a search would. */
function Ranked({ title, figure: figureTitle, rows, hits, value, note, empty, control, onOpen }: {
  title: string
  figure: string
  rows: BoardRow[]
  hits: Record<string, MarketHit>
  value: (row: BoardRow) => ReactNode
  note?: string
  empty?: string
  control?: ReactNode
  onOpen: (hit: MarketHit) => void
}) {
  const t = useMessages()
  const b = t.marketPage.board
  const headingId = useId()
  return <section className="market-ranking" aria-labelledby={headingId}>
    <div className="market-ranking-head">
      <h3 id={headingId} className="section-title">{title}</h3>
      {control}
    </div>
    {rows.length === 0
      ? <p className="group market-book-empty">{empty}</p>
      : <div className="group">
        <div className="ranked-row ranked-head"><span/><span>{b.item}</span><span>{figureTitle}</span><span>{b.median}</span></div>
        <ol className="ranked-list">
          {rows.map(row => {
            const hit = hits[row.name]
            const name = boardName(row, t)
            const cells = <>
              <Thumb hit={hit} name={name}/>
              <span className="ranked-name">
                <span>{name}</span>
                {row.rank !== null && <span className="tag">{t.marketPage.rank(row.rank)}</span>}
                {row.subtype && <span className="tag">{row.subtype}</span>}
              </span>
              <span className="ranked-figure">{value(row)}</span>
              <Platinum value={row.median}/>
            </>
            return <li key={`${row.name}-${row.subtype}-${row.rank}`}>
              {hit
                ? <button type="button" className="ranked-row" onClick={() => onOpen(hit)}>{cells}</button>
                : <div className="ranked-row">{cells}</div>}
            </li>
          })}
        </ol>
      </div>}
    {note && <p className="band-note">{note}</p>}
  </section>
}

function ItemSheet({ viewed, view, ownershipVerified, orders, clock, selling, onSelling, onSell, onUpdate, ordersBusy, onRefresh, copied, onCopy }: {
  viewed: Viewed
  view: AppView
  ownershipVerified: boolean
  orders: Orders | null
  clock: Date
  selling: string | null
  onSelling: (id: string | null) => void
  onSell: SellHandler
  onUpdate: UpdateHandler
  ordersBusy: boolean
  onRefresh: () => void
  copied: string | null
  onCopy: (order: LiveOrder, side: Side, key: string) => void
}) {
  const t = useMessages()
  const m = t.marketPage
  const { hit, dumpDate } = viewed
  const held = ownershipVerified ? view.collection.items.filter(item => item.quantity > 0 && hit.held.includes(item.id)) : []
  const count = held.reduce((total, item) => total + item.quantity, 0)
  const account = view.market_account
  const sellable = account.link === 'linked' ? held.filter(item => isListable(item, account.listable)) : []
  const sellingItem = sellable.find(item => item.id === selling)
  const ready = orders?.state === 'ready' ? orders.orders : null
  const fetched = ready ? stampReading(String(ready.fetched_at), clock, t) : null

  return <article className="market-item" aria-labelledby="market-item-name">
    <div className="market-item-head">
      <Thumb hit={hit}/>
      <div className="market-item-title">
        <h2 id="market-item-name">{hit.name}</h2>
        <div className="tags">
          {hit.max_rank !== null && <span className="tag">{m.ranks(hit.max_rank)}</span>}
          {ownershipVerified && (count > 0
            ? <span className="tag">{m.owned(count)}</span>
            : <span className="tag absent">{m.notHeld}</span>)}
        </div>
      </div>
      {sellable.length > 0 && <div className="head-actions">
        {sellable.map(item => {
          const listed = listedOrderFor(account.orders, item.id)
          if (listed && listed.quantity >= item.quantity) return null
          const rank = rankLabel(item, t)
          return <button key={item.id} type="button" className="stamp" disabled={ordersBusy} aria-pressed={selling === item.id} onClick={() => onSelling(selling === item.id ? null : item.id)}>
            {listed ? t.card.sellMore : rank ? m.sellRank(rank) : m.sell}
          </button>
        })}
      </div>}
    </div>
    {sellingItem && <SellForm item={sellingItem} listing={listedOrderFor(account.orders, sellingItem.id) ?? undefined} busy={ordersBusy} onSell={onSell} onUpdate={onUpdate} onDone={() => onSelling(null)}/>}

    {/* Price and pace side by side, the same size: a price nobody trades at is not a price. */}
    <dl className="group market-figures">
      <div>
        <dt>{m.median}</dt>
        <dd className="market-figure">{hit.median !== null
          ? <span className="value plat"><MetalMark metal="plat" alt={t.card.platinum}/><b>{figure(hit.median, t)}</b>{hit.median_max_rank !== null && <em>{m.medianMaxRank(hit.median_max_rank)}</em>}</span>
          : <span className="value-missing">{m.noMedian}</span>}</dd>
        <dd className="band-note">{hit.checked_live ? m.checkedLive : dumpDate ? m.dumpDate(shortDate(dumpDate, t)) : ''}</dd>
      </div>
      <div>
        <dt>{m.perMonth}</dt>
        <dd className="market-figure">{hit.monthly_trades
          ? <span className="value"><b>{figure(hit.monthly_trades, t)}</b></span>
          : <span className="value-missing">{m.noTrades}</span>}</dd>
        <dd className="band-note">{m.perMonthNote}</dd>
      </div>
    </dl>

    <div className="market-live-head">
      <span className="band-note" aria-live="polite">{orders?.state === 'loading' ? m.loadingOrders : fetched ? m.live(fetched.relative) : ''}</span>
      <button type="button" className="stamp" disabled={orders?.state === 'loading'} onClick={onRefresh}>{orders?.state === 'failed' ? m.retry : m.refresh}</button>
    </div>
    {orders?.state === 'loading' && <div className="streak" aria-hidden="true"/>}
    {orders?.state === 'failed' && <p className="error-banner" role="alert">{orders.message}</p>}
    {ready && <div className="market-books">
      <OrderBook side="sell" title={m.sellers} empty={m.noSellers} orders={ready.sell} hit={hit} copied={copied} onCopy={onCopy}/>
      <OrderBook side="buy" title={m.buyers} empty={m.noBuyers} orders={ready.buy} hit={hit} copied={copied} onCopy={onCopy}/>
    </div>}
    {ready && <p className="band-note">{m.topNote}</p>}
  </article>
}

function OrderBook({ side, title, empty, orders, hit, copied, onCopy }: {
  side: Side
  title: string
  empty: string
  orders: LiveOrder[]
  hit: MarketHit
  copied: string | null
  onCopy: (order: LiveOrder, side: Side, key: string) => void
}) {
  const t = useMessages()
  const m = t.marketPage
  const headingId = useId()
  return <section className="market-book" aria-labelledby={headingId}>
    <h3 id={headingId} className="section-title">{title}</h3>
    {orders.length === 0
      ? <p className="group market-book-empty">{empty}</p>
      : <ul className="group">
        {orders.map((order, index) => {
          const key = `${side}-${index}-${order.user}`
          return <li key={key} className="trade-row">
            <span className="trade-status"><TraderMark status={order.status}/>{order.status === 'ingame' ? m.ingame : m.online}</span>
            <span className="trade-user">{order.user}</span>
            <span className="trade-tags">
              {order.rank !== null && <span className="tag">{m.rank(order.rank)}</span>}
              {hit.max_rank === null && order.subtype && <span className="tag">{order.subtype}</span>}
            </span>
            <span className="trade-quantity">{m.quantity(order.quantity)}</span>
            <span className="value plat"><MetalMark metal="plat" alt={t.card.platinum}/><b>{figure(order.platinum, t)}</b>{order.per_trade > 1 && <em>{m.perTrade(order.per_trade)}</em>}</span>
            <button type="button" className="stamp" aria-label={`${copied === key ? m.copied : m.whisper}, ${order.user}`} onClick={() => onCopy(order, side, key)}>{copied === key ? m.copied : m.whisper}</button>
          </li>
        })}
      </ul>}
  </section>
}
