import { useMemo, useState } from 'react'
import { marketRowOrders, type CollectionItem, type MarketAccount } from '../backend'
import { SellForm, type SellHandler, type UpdateHandler } from '../SellForm'
import { competingSellers, isListable, listedLabel, listedOrderFor } from '../orders'
import { figure, rankLabel, stackValue } from '../collection'
import { MetalMark } from '../MetalMark'
import { Thumb } from '../components/Thumb'
import { SearchField } from '../components/SearchField'
import { Pagination } from '../components/Pagination'
import { useMessages } from '../i18n'

type Listed = 'unlisted' | 'listed' | 'all'
type Sort = 'value' | 'price' | 'sales' | 'ducats'

const PAGE_SIZE = 20
const FLOORS = [0, 5, 10, 15] as const

const sortKey: Record<Sort, (item: CollectionItem) => number> = {
  value: item => stackValue(item) ?? 0,
  price: item => item.platinum ?? 0,
  sales: item => item.monthly_trades ?? 0,
  ducats: item => item.ducats ?? 0,
}

/**
 * Selling straight from the inventory: every holding the account can list, as a dense table that
 * filters and sorts, with a one-press sale on each row.
 *
 * The rows are the same listable set the backend authorises against, so nothing is offered that
 * the backend would refuse. Unlisted holdings are the default view because they are what is left
 * to do; a listed row says its listing and opens it for editing instead.
 *
 * "Sell" reads the row's live book and lists one copy at the cheapest in-game seller's price. With
 * no live price to match (nobody selling, or the market unreachable) it opens the form instead
 * rather than inventing one, and the form's glance says which. One copy, not the stack: a press
 * that lists everything by default eventually does when it was not meant to, and the order row's
 * stepper raises the count from there. "Price…" opens the same form for a price of one's own.
 */
export function SellStock({ items, account, busy, onSell, onUpdate }: {
  items: CollectionItem[]
  account: MarketAccount
  busy: boolean
  onSell: SellHandler
  onUpdate: UpdateHandler
}) {
  const t = useMessages()
  const s = t.orders.stock
  const [query, setQuery] = useState('')
  const [listed, setListed] = useState<Listed>('unlisted')
  const [floor, setFloor] = useState<number>(0)
  const [sort, setSort] = useState<Sort>('value')
  const [page, setPage] = useState(1)
  const [chosen, setChosen] = useState<string | null>(null)
  const [pricing, setPricing] = useState<string | null>(null)

  const stock = useMemo(() => items.filter(item => isListable(item, account.listable)), [items, account.listable])
  if (!stock.length) return null

  const needle = query.trim().toLowerCase()
  const matches = stock
    .filter(item => {
      const order = listedOrderFor(account.orders, item.id)
      if (listed === 'unlisted' && order) return false
      if (listed === 'listed' && !order) return false
      if (floor > 0 && (item.platinum ?? 0) < floor) return false
      return !needle || item.name.toLowerCase().includes(needle)
    })
    .sort((left, right) => sortKey[sort](right) - sortKey[sort](left))
  const pages = Math.max(1, Math.ceil(matches.length / PAGE_SIZE))
  const current = Math.min(page, pages)
  const shown = matches.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)
  // Any filter change starts again from the first page, so a narrowed list is never read from its
  // middle.
  const narrow = <T,>(set: (value: T) => void) => (value: T) => {
    set(value)
    setPage(1)
  }

  async function quickSell(item: CollectionItem) {
    setPricing(item.id)
    const price = await marketRowOrders(item.id).then(
      book => competingSellers(book).sellers[0]?.platinum ?? null,
      () => null,
    )
    setPricing(null)
    if (price === null) setChosen(item.id)
    else await onSell(item.id, price, 1, true)
  }

  return <section className="to-sell" aria-labelledby="to-sell-title">
    <div className="to-sell-head">
      <h2 id="to-sell-title" className="section-title">{t.orders.toSell}</h2>
      <div className="toolbar">
        <SearchField label={t.orders.item} value={query} onChange={narrow(setQuery)}/>
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
        {shown.map(item => {
          const order = listedOrderFor(account.orders, item.id)
          const sub = [rankLabel(item, t), t.orders.held(item.quantity), order && listedLabel(order, item.quantity, t)].filter(Boolean).join(' · ')
          return <li key={item.id}>
            <article className="docket-line stock-line" aria-label={item.name}>
              <Thumb src={item.image_url} name={item.name}/>
              <div className="line-main">
                <h3 className="line-name" title={item.name}>{item.name}</h3>
                <p className="line-sub">{sub}</p>
              </div>
              <span className="line-value">{item.ducats
                ? <>{figure(item.ducats, t)}<MetalMark metal="ducat" alt={t.units.ducats} className="line-metal"/></>
                : <em>—</em>}</span>
              <span className="line-count" title={s.salesHint}>{item.monthly_trades ? figure(item.monthly_trades, t) : '—'}</span>
              <span className="line-figure">{item.platinum === undefined
                ? <em>—</em>
                : <>{figure(item.platinum, t)}<MetalMark metal="plat" alt={t.units.platinum} className="line-metal"/></>}</span>
              <span className="line-fix">
                {chosen !== item.id && (order
                  ? <button type="button" className="stamp" disabled={busy} onClick={() => setChosen(item.id)}><span>{t.orders.editListing}</span></button>
                  : <>
                    <button type="button" className="stamp sold" disabled={busy || pricing !== null} title={s.quickHint} onClick={() => { void quickSell(item) }}>
                      <span>{pricing === item.id ? s.pricing : t.card.sell}</span>
                    </button>
                    <button type="button" className="stamp" disabled={busy || pricing !== null} onClick={() => setChosen(item.id)}><span>{s.setPrice}</span></button>
                  </>)}
              </span>
              {chosen === item.id && <SellForm item={item} listing={order ?? undefined} busy={busy} onSell={onSell} onUpdate={onUpdate} onDone={() => setChosen(null)}/>}
            </article>
          </li>
        })}
      </ul>
      : <p className="pick-empty">{t.orders.noneSellable}</p>}
    <Pagination current={current} total={pages} onChange={setPage}/>
  </section>
}
