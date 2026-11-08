import { useMemo, useState } from 'react'
import { marketItemOrders, marketRowOrders, type CollectionItem, type MarketAccount, type MarketItemOrders, type MarketOrder } from '../backend'
import { SellForm, type Sellable, type SellHandler, type UpdateHandler } from '../SellForm'
import { competingSellers, isListable, listedLabel, listedOrderFor } from '../orders'
import { figure, rankLabel } from '../collection'
import { MetalMark } from '../MetalMark'
import { Thumb } from '../components/Thumb'
import { SearchField } from '../components/SearchField'
import { Pagination } from '../components/Pagination'
import { useMessages, type Messages } from '../i18n'

type Kind = 'items' | 'sets'
type Listed = 'unlisted' | 'listed' | 'all'
type Copies = 'spare' | 'all'
type Sort = 'value' | 'price' | 'sales' | 'ducats'

const PAGE_SIZE = 20
const FLOORS = [0, 5, 10, 15] as const

/**
 * One line of the table, whether it is a held row or a set: what it is listed as, what it shows,
 * and how it sells. Items and sets differ only in where these come from.
 */
type StockRow = {
  key: string
  sellable: Sellable
  thumb?: string
  sub: string
  ducats?: number
  sales?: number
  /** Copies a press can list now: the holding, or the whole sets the parts make. */
  available: number
  order: MarketOrder | null
  /** An edit goes through the order's row; a set's listing names no row, so it has none. */
  editable: boolean
  readBook: (id: string) => Promise<MarketItemOrders>
  onSell: SellHandler
}

const sortKey: Record<Sort, (row: StockRow) => number> = {
  value: row => (row.sellable.platinum ?? 0) * row.available,
  price: row => row.sellable.platinum ?? 0,
  sales: row => row.sales ?? 0,
  ducats: row => row.ducats ?? 0,
}

function itemRows(items: CollectionItem[], account: MarketAccount, onSell: SellHandler, t: Messages): StockRow[] {
  return items.filter(item => isListable(item, account.listable)).map(item => {
    const order = listedOrderFor(account.orders, item.id)
    return {
      key: item.id,
      sellable: item,
      thumb: item.image_url,
      sub: [rankLabel(item, t), t.orders.held(item.quantity), order && listedLabel(order, item.quantity, t)].filter(Boolean).join(' · '),
      ducats: item.ducats,
      sales: item.monthly_trades,
      available: item.quantity,
      order,
      editable: true,
      readBook: marketRowOrders,
      onSell,
    }
  })
}

function setRows(account: MarketAccount, onSellSet: SellHandler, t: Messages): StockRow[] {
  return account.sets.map(set => {
    // A set order names the set's market id; reconciliation attributes it to no row.
    const order = account.orders.find(entry => entry.order.item_id === set.item_id && entry.order.visible && entry.order.kind === 'sell')?.order ?? null
    const parts = set.parts.map(part => t.orders.stock.part(part.name, part.held, part.uses)).join(' · ')
    return {
      key: set.path,
      sellable: { id: set.path, name: set.name, quantity: set.complete, platinum: set.platinum },
      thumb: set.thumb_url,
      sub: [t.orders.stock.complete(set.complete), parts, order && listedLabel(order, set.complete, t)].filter(Boolean).join(' · '),
      sales: set.monthly_trades,
      available: set.complete,
      order,
      editable: false,
      readBook: () => marketItemOrders(set.slug),
      onSell: onSellSet,
    }
  })
}

/**
 * Selling straight from the inventory: every holding the account can list, or every Prime set
 * the collection holds a part of, as a dense table that filters and sorts, with a one-press sale
 * on each row.
 *
 * The rows are the same listable set the backend authorises against, so nothing is offered that
 * the backend would refuse; a set offers its sale only once its parts make a whole one, and says
 * which parts it holds either way. Unlisted rows are the default view because they are what is
 * left to do; a listed row says its listing instead. Of the items, only what is held twice or more
 * shows by default, dearest copy first: a duplicate is what a player sells without a second
 * thought, and the price of one copy is what one press of "Sell" earns. "All counts" adds the
 * single copies back.
 *
 * "Sell" reads the row's live book and lists one copy at the cheapest in-game seller's price. With
 * no live price to match (nobody selling, or the market unreachable) it opens the form instead
 * rather than inventing one, and the form's glance says which. One copy, not the stack: a press
 * that lists everything by default eventually does when it was not meant to, and the order row's
 * stepper raises the count from there. "Price…" opens the same form for a price of one's own.
 */
export function SellStock({ items, account, busy, onSell, onSellSet, onUpdate }: {
  items: CollectionItem[]
  account: MarketAccount
  busy: boolean
  onSell: SellHandler
  onSellSet: SellHandler
  onUpdate: UpdateHandler
}) {
  const t = useMessages()
  const s = t.orders.stock
  const [kind, setKind] = useState<Kind>('items')
  const [query, setQuery] = useState('')
  const [listed, setListed] = useState<Listed>('unlisted')
  const [copies, setCopies] = useState<Copies>('spare')
  const [floor, setFloor] = useState<number>(0)
  const [sort, setSort] = useState<Sort>('price')
  const [page, setPage] = useState(1)
  const [chosen, setChosen] = useState<string | null>(null)
  const [pricing, setPricing] = useState<string | null>(null)

  const stock = useMemo(() => kind === 'items'
    ? itemRows(items, account, onSell, t)
    : setRows(account, onSellSet, t), [kind, items, account, onSell, onSellSet, t])
  if (!account.listable.length && !account.sets.length) return null

  const needle = query.trim().toLowerCase()
  // A set is rarely held whole twice over, so the count filter is the items' alone.
  const spareOnly = kind === 'items' && copies === 'spare'
  const kept = stock.filter(row => {
    if (listed === 'unlisted' && row.order) return false
    if (listed === 'listed' && !row.order) return false
    if (floor > 0 && (row.sellable.platinum ?? 0) < floor) return false
    return !needle || row.sellable.name.toLowerCase().includes(needle)
  })
  const matches = kept
    .filter(row => !spareOnly || row.available >= 2)
    .sort((left, right) => sortKey[sort](right) - sortKey[sort](left))
  // Said only when the count is all that hides the rest, not when a search or a floor does.
  const onlySingles = matches.length === 0 && kept.length > 0
  const pages = Math.max(1, Math.ceil(matches.length / PAGE_SIZE))
  const current = Math.min(page, pages)
  const shown = matches.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)
  // Any filter change starts again from the first page, so a narrowed list is never read from its
  // middle.
  const narrow = <T,>(set: (value: T) => void) => (value: T) => {
    set(value)
    setPage(1)
  }

  async function quickSell(row: StockRow) {
    setPricing(row.key)
    const price = await row.readBook(row.sellable.id).then(
      book => competingSellers(book).sellers[0]?.platinum ?? null,
      () => null,
    )
    setPricing(null)
    if (price === null) setChosen(row.key)
    else await row.onSell(row.sellable.id, price, 1, true)
  }

  return <section className="to-sell" aria-labelledby="to-sell-title">
    <div className="to-sell-head">
      <h2 id="to-sell-title" className="section-title">{t.orders.toSell}</h2>
      <div className="toolbar">
        <div className="segmented" role="group" aria-label={s.kindLabel}>
          {(['items', 'sets'] as Kind[]).map(option => <button key={option} type="button" aria-pressed={kind === option} onClick={() => { narrow(setKind)(option); setChosen(null) }}>{s.kinds[option]}</button>)}
        </div>
        <SearchField label={t.orders.item} value={query} onChange={narrow(setQuery)}/>
        {kind === 'items' && <div className="segmented" role="group" aria-label={s.copiesLabel}>
          {(['spare', 'all'] as Copies[]).map(option => <button key={option} type="button" aria-pressed={copies === option} onClick={() => narrow(setCopies)(option)}>{s.copies[option]}</button>)}
        </div>}
        <div className="segmented" role="group" aria-label={s.listedLabel}>
          {(['unlisted', 'listed', 'all'] as Listed[]).map(option => <button key={option} type="button" aria-pressed={listed === option} onClick={() => narrow(setListed)(option)}>{s.listed[option]}</button>)}
        </div>
        {/* The options name themselves ("5p and up"), so the label is for readers only. */}
        <label className="select">
          <select aria-label={s.floorLabel} value={floor} onChange={event => narrow(setFloor)(Number(event.target.value))}>
            {FLOORS.map(value => <option key={value} value={value}>{value ? s.floor(value) : s.anyPrice}</option>)}
          </select>
        </label>
        <label className="select">
          <span>{t.grid.sort}</span>
          <select aria-label={s.sortLabel} value={sort} onChange={event => narrow(setSort)(event.target.value as Sort)}>
            {(Object.keys(sortKey) as Sort[]).map(option => <option key={option} value={option}>{s.sorts[option]}</option>)}
          </select>
        </label>
      </div>
    </div>
    {shown.length
      ? <ul className="group docket">
        <li className="docket-line stock-line stock-head" aria-hidden="true">
          <span/><span>{s.columns.item}</span><span>{s.columns.ducats}</span><span>{s.columns.sales}</span><span>{s.columns.price}</span><span/>
        </li>
        {shown.map(row => {
          const { sellable, order } = row
          return <li key={row.key}>
            <article className="docket-line stock-line" aria-label={sellable.name}>
              <Thumb src={row.thumb} name={sellable.name}/>
              <div className="line-main">
                <h3 className="line-name" title={sellable.name}>{sellable.name}</h3>
                <p className="line-sub">{row.sub}</p>
              </div>
              <span className="line-value">{row.ducats
                ? <>{figure(row.ducats, t)}<MetalMark metal="ducat" alt={t.units.ducats} className="line-metal"/></>
                : <em>—</em>}</span>
              <span className="line-count" title={s.salesHint}>{row.sales ? figure(row.sales, t) : '—'}</span>
              <span className="line-figure">{sellable.platinum === undefined
                ? <em>—</em>
                : <>{figure(sellable.platinum, t)}<MetalMark metal="plat" alt={t.units.platinum} className="line-metal"/></>}</span>
              <span className="line-fix">
                {chosen !== row.key && (order
                  ? row.editable && <button type="button" className="stamp" disabled={busy} onClick={() => setChosen(row.key)}><span>{t.orders.editListing}</span></button>
                  : <>
                    <button type="button" className="stamp sold" disabled={busy || pricing !== null || row.available < 1} title={row.available < 1 ? s.incompleteHint : s.quickHint} onClick={() => { void quickSell(row) }}>
                      <span>{pricing === row.key ? s.pricing : t.card.sell}</span>
                    </button>
                    <button type="button" className="stamp" disabled={busy || pricing !== null || row.available < 1} onClick={() => setChosen(row.key)}><span>{s.setPrice}</span></button>
                  </>)}
              </span>
              {chosen === row.key && <SellForm item={sellable} listing={order ?? undefined} readBook={row.readBook} busy={busy} onSell={row.onSell} onUpdate={onUpdate} onDone={() => setChosen(null)}/>}
            </article>
          </li>
        })}
      </ul>
      : <p className="pick-empty">{kind === 'sets' ? s.noSets : onlySingles ? s.noSpare : t.orders.noneSellable}</p>}
    <Pagination current={current} total={pages} onChange={setPage}/>
  </section>
}
