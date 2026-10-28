import { useEffect, useId, useState, type ReactNode } from 'react'
import { getFarm, marketItemHistory, type AccessMode, type AppView, type DayTrades, type FarmPlace, type FarmView, type Pace } from '../backend'
import { figure, rankLabel } from '../collection'
import { isListable, listedOrderFor } from '../orders'
import { SellForm, type SellHandler, type UpdateHandler } from '../SellForm'
import { EmptyState } from '../components/EmptyState'
import { Icon } from '../components/Icon'
import { relicLabel } from '../relics'
import { Platinum } from '../components/Platinum'
import { shortDate, useMessages, type Messages } from '../i18n'
import './FarmPage.css'

type Action = 'sell' | 'open' | 'farm'
type Tab = 'all' | Action
const actions: Action[] = ['sell', 'open', 'farm']
const chartActions: Action[] = ['farm', 'open', 'sell']
const paces: Pace[] = ['fast', 'fair', 'slow']
/** Rows per block under All: the top of each list, side by side in kind. */
const BLOCK = 5
const BARS = 5
const periods = [7, 30, 90] as const

/** What the trend card follows instead of the carousel: a row's item, by its market name. */
type Picked = { name: string; market: string }

/**
 * Farm & sales: what to sell, open and farm, ranked by what the market takes. Every figure is the
 * backend's, built from what it already holds; only the curve of an item the player picks asks
 * warframe.market, once.
 */
export function FarmPage({ view, effectiveMode, onSell, onUpdate, ordersBusy }: {
  view: AppView
  effectiveMode: AccessMode
  onSell: SellHandler
  onUpdate: UpdateHandler
  ordersBusy: boolean
}) {
  const t = useMessages()
  const f = t.farm
  const [farm, setFarm] = useState<FarmView | null>(null)
  const [failed, setFailed] = useState(false)
  const [tab, setTab] = useState<Tab>('all')
  const [chart, setChart] = useState<Action>('farm')
  const [picked, setPicked] = useState<Picked | null>(null)
  const snapshotAt = view.collection.snapshot?.observed_at
  const pricesAt = view.health.collection_prices.last_success
  const catalogAt = view.health.catalog.last_success

  useEffect(() => {
    let active = true
    getFarm()
      .then(next => { if (active) { setFarm(next); setFailed(false) } })
      .catch(() => { if (active) setFailed(true) })
    return () => { active = false }
  }, [snapshotAt, pricesAt, catalogAt])

  if (!farm) {
    return <section className="page" aria-labelledby="farm-title" aria-live="polite">
      <div className="page-head"><h1 id="farm-title" className="page-title">{f.title}</h1></div>
      {failed ? <p className="error-banner" role="alert">{f.failed}</p> : <><p className="page-note">{f.loading}</p><div className="streak" aria-hidden="true"/></>}
    </section>
  }

  const full = effectiveMode === 'full'
  const figures = [
    farm.prices_date && f.prices(shortDate(farm.prices_date, t)),
    farm.earlier_date ? f.compared(shortDate(farm.earlier_date, t)) : f.noEarlier,
    f.solo,
  ].filter(Boolean).join(' · ')

  return <section className="page farm-page" aria-labelledby="farm-title">
    <div className="page-head">
      <h1 id="farm-title" className="page-title">{f.title}</h1>
      <p className="page-note">{figures}</p>
      <p className="page-note">{f.note}</p>
      {!farm.prices_date && <p className="page-note farm-warn">{f.noPrices}</p>}
    </div>

    <div className="farm-cards">
      {picked
        ? <ItemCurve key={picked.market} picked={picked} onBack={() => setPicked(null)}/>
        : <TrendCard farm={farm} onPick={setPicked}/>}
      <ChartCard farm={farm} full={full} chart={chart} onChart={setChart}/>
    </div>

    <div className="farm-table-head">
      <h2 className="section-title">{f.table.title}</h2>
      <div className="segmented" role="group" aria-label={f.show}>
        {(['all', ...actions] as Tab[]).map(option => <button key={option} type="button" aria-pressed={tab === option} onClick={() => setTab(option)}>{f.tabs[option]}</button>)}
      </div>
    </div>
    {actions.filter(action => tab === 'all' || tab === action).map(action => <Block
      key={action}
      action={action}
      farm={farm}
      view={view}
      full={full}
      limit={tab === 'all' ? BLOCK : undefined}
      picked={picked?.market ?? null}
      onPick={setPicked}
      onSell={onSell}
      onUpdate={onUpdate}
      ordersBusy={ordersBusy}
    />)}
    <p className="band-note">{f.table.perRunNote}</p>
  </section>
}

function Change({ value }: { value: number | null }) {
  const t = useMessages()
  if (value === null) return <span className="value-missing">—</span>
  return <span className={`farm-change ${value > 0 ? 'up' : value < 0 ? 'down' : ''}`}>{t.farm.change(value)}</span>
}

function PaceTag({ pace }: { pace: Pace }) {
  const t = useMessages()
  return pace === 'fast' ? null : <span className={`tag${pace === 'slow' ? ' absent' : ''}`}>{t.farm.pace[pace]}</span>
}

function TrendCard({ farm, onPick }: { farm: FarmView; onPick: (picked: Picked) => void }) {
  const t = useMessages()
  const f = t.farm.trend
  const headingId = useId()
  const [slide, setSlide] = useState(0)
  const count = farm.trends.length
  const trend = count ? farm.trends[slide % count] : null
  return <section className="farm-card trend-card" aria-labelledby={headingId}>
    <div className="farm-card-head">
      <h2 id={headingId}>{f.title}</h2>
      <span className="band-note">{f.week}</span>
    </div>
    {!farm.earlier_date
      ? <p className="farm-card-empty"><strong>{f.waiting}</strong>{f.waitingDetail}</p>
      : !trend
        ? <p className="farm-card-empty"><strong>{f.empty}</strong>{f.emptyDetail}</p>
        : <>
          <p className="trend-figure" aria-live="polite"><span className="farm-change up">{t.farm.change(trend.change)}</span></p>
          <p className="trend-text">
            <strong>{trend.name}</strong>
            <Platinum value={trend.platinum}/>
            <span>{f.sales(trend.monthly_trades)}{trend.held > 0 && ` ${f.held(trend.held)}`}</span>
          </p>
          <div className="trend-nav">
            <button type="button" className="stamp icon-stamp" aria-label={f.previous} onClick={() => setSlide((slide + count - 1) % count)}><Icon name="previous"/></button>
            <div className="trend-dots" role="group" aria-label={f.slides}>
              {farm.trends.map((entry, index) => <button key={entry.name} type="button" aria-label={f.slide(index + 1, count)} aria-pressed={index === slide % count} onClick={() => setSlide(index)}/>)}
            </div>
            <button type="button" className="stamp icon-stamp" aria-label={f.next} onClick={() => setSlide((slide + 1) % count)}><Icon name="next"/></button>
            <button type="button" className="stamp" onClick={() => onPick({ name: trend.name, market: trend.name })}>{f.curve}</button>
          </div>
        </>}
  </section>
}

/** The days of `days` that fall within the last `period` days of it. */
function within(days: DayTrades[], period: number): DayTrades[] {
  const last = days.at(-1)
  if (!last) return []
  const cutoff = Date.parse(last.date) - (period - 1) * 86_400_000
  return days.filter(day => Date.parse(day.date) >= cutoff)
}

function ItemCurve({ picked, onBack }: { picked: Picked; onBack: () => void }) {
  const t = useMessages()
  const f = t.farm.trend
  const headingId = useId()
  const [days, setDays] = useState<DayTrades[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [period, setPeriod] = useState<number>(30)

  useEffect(() => {
    let active = true
    marketItemHistory(picked.market)
      .then(next => { if (active) setDays(next) })
      .catch(() => { if (active) setFailed(true) })
    return () => { active = false }
  }, [picked.market])

  const shown = days ? within(days, period) : []
  const first = shown[0]
  const last = shown.at(-1)
  const volume = shown.reduce((sum, day) => sum + day.volume, 0)
  return <section className="farm-card trend-card" aria-labelledby={headingId}>
    <div className="farm-card-head">
      <h2 id={headingId}>{picked.name}</h2>
      <div className="segmented" role="group" aria-label={f.periods}>
        {periods.map(option => <button key={option} type="button" aria-pressed={period === option} onClick={() => setPeriod(option)}>{f.period(option)}</button>)}
      </div>
    </div>
    {failed
      ? <p className="error-banner" role="alert">{f.failed}</p>
      : !days
        ? <p className="band-note" aria-live="polite">{f.loading}</p>
        : !first || !last
          ? <p className="farm-card-empty">{f.noDays}</p>
          : <>
            <p className="trend-figure">
              {shown.length > 1 ? <Change value={last.median / first.median - 1}/> : <Platinum value={last.median}/>}
              <span className="band-note">{f.observed(period)}</span>
            </p>
            <Sparkline days={shown} label={f.curveLabel(picked.name, first.median, last.median, period)}/>
            <p className="trend-text"><Platinum value={last.median}/><span>{f.volume(volume, period)}</span></p>
            <p className="band-note">{f.source}</p>
          </>}
    <div className="trend-nav"><button type="button" className="stamp" onClick={onBack}>{f.back}</button></div>
  </section>
}

function Sparkline({ days, label }: { days: DayTrades[]; label: string }) {
  const medians = days.map(day => day.median)
  const low = Math.min(...medians)
  const high = Math.max(...medians)
  const x = (index: number) => days.length > 1 ? index / (days.length - 1) * 300 : 150
  const y = (median: number) => high > low ? 76 - (median - low) / (high - low) * 72 : 40
  const points = medians.map((median, index) => `${x(index).toFixed(1)},${y(median).toFixed(1)}`).join(' ')
  return <svg className="sparkline" viewBox="0 0 300 80" preserveAspectRatio="none" role="img" aria-label={label}>
    <polyline points={points}/>
  </svg>
}

/** A row's item as a button that puts its curve in the trend card, or plain text with no market name. */
type Pick = (name: string, market: string | null, label?: string) => ReactNode

type Bar = { label: string; value: number; pace: Pace }

function bars(farm: FarmView, chart: Action, t: Messages): Bar[] {
  const rows: Bar[] = chart === 'farm'
    ? farm.farm.map(row => ({ label: row.location, value: row.value, pace: row.pace }))
    : chart === 'open'
      ? farm.open.map(row => ({ label: relicLabel(row, t), value: row.value, pace: row.pace }))
      : farm.sell.map(row => ({ label: row.name, value: row.value, pace: row.pace }))
  return rows.slice(0, BARS)
}

function ChartCard({ farm, full, chart, onChart }: { farm: FarmView; full: boolean; chart: Action; onChart: (chart: Action) => void }) {
  const t = useMessages()
  const f = t.farm.chart
  const headingId = useId()
  const shown = bars(farm, chart, t)
  const best = shown[0]
  const locked = chart !== 'farm' && !full
  return <section className="farm-card chart-card" aria-labelledby={headingId}>
    <div className="farm-card-head">
      <h2 id={headingId}>{f.title}</h2>
      <div className="segmented" role="group" aria-label={f.tabs}>
        {chartActions.map(option => <button key={option} type="button" aria-pressed={chart === option} onClick={() => onChart(option)}>{t.farm.actions[option]}</button>)}
      </div>
    </div>
    {locked
      ? <p className="farm-card-empty"><strong>{t.farm.fullRequired}</strong>{t.farm.fullRequiredDetail}</p>
      : !best || best.value <= 0
        ? <p className="farm-card-empty">{f.empty}</p>
        : <div className="chart-body">
          <div className="chart-key">
            <Platinum value={best.value} approx={chart !== 'sell'}/>
            <span className="band-note">{f.key[chart]}</span>
            <p className="chart-explain">{f.explain[chart](best.label)}</p>
          </div>
          <ul className="farm-bars" aria-label={f.bars}>
            {shown.map(bar => <li key={bar.label}>
              <span className="bar-label">{bar.label}</span>
              <span className="bar-track" aria-hidden="true"><span className={`bar ${bar.pace}`} style={{ width: `${Math.max(2, bar.value / best.value * 100)}%` }}/></span>
              <Platinum value={bar.value} approx={chart !== 'sell'}/>
              <span className="sr-only">{t.farm.pace[bar.pace]}</span>
            </li>)}
          </ul>
        </div>}
    <ul className="farm-legend" aria-label={f.legend}>
      {paces.map(pace => <li key={pace}><i className={`bar ${pace}`} aria-hidden="true"/>{t.farm.pace[pace]}</li>)}
    </ul>
  </section>
}

function Block({ action, farm, view, full, limit, picked, onPick, onSell, onUpdate, ordersBusy }: {
  action: Action
  farm: FarmView
  view: AppView
  full: boolean
  limit?: number
  picked: string | null
  onPick: (picked: Picked) => void
  onSell: SellHandler
  onUpdate: UpdateHandler
  ordersBusy: boolean
}) {
  const t = useMessages()
  const f = t.farm
  const headingId = useId()
  const [selling, setSelling] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const heading = <h3 id={headingId} className="section-title farm-block-title">{f.actions[action]}</h3>
  if (action !== 'farm' && !full) {
    return <section aria-labelledby={headingId}>{heading}<EmptyState icon="farm" title={f.fullRequired} detail={f.fullRequiredDetail}/></section>
  }
  const rows = farm[action]
  if (rows.length === 0) {
    return <section aria-labelledby={headingId}>{heading}<EmptyState icon="farm" title={f.table.empty[action]} detail={!farm.prices_date ? f.table.waiting : action === 'farm' && farm.drops ? f.chart.empty : f.table.emptyDetail[action]}/></section>
  }
  const account = view.market_account
  const pick: Pick = (name, market, label = name) => market
    ? <button type="button" className="farm-pick" aria-pressed={picked === market} aria-label={f.table.pick(label)} onClick={() => onPick({ name, market })}>{label}</button>
    : <span>{label}</span>
  return <section aria-labelledby={headingId}>
    {heading}
    {action === 'sell' && account.link !== 'linked' && <p className="band-note">{f.table.linkToSell}</p>}
    {action === 'open' && !farm.relic_tables && <p className="band-note">{f.table.noRelicTables}</p>}
    <div className="group farm-table">
      <div className="farm-row farm-head" aria-hidden="true">
        {(['action', 'item', 'where', 'unit', 'sales', 'change'] as const).map(column => <span key={column}>{f.table.columns[column]}</span>)}<span/>
      </div>
      <ul className="farm-list" aria-label={f.actions[action]}>
        {action === 'sell' && farm.sell.slice(0, limit).map(row => {
          const item = view.collection.items.find(entry => entry.id === row.id)
          const listed = item ? listedOrderFor(account.orders, item.id) : null
          const offer = item && account.link === 'linked' && isListable(item, account.listable) && !(listed && listed.quantity >= item.quantity)
          const rank = item && rankLabel(item, t)
          return <li key={row.id}>
            <div className="farm-row">
              <span className="tag farm-action">{f.actions.sell}</span>
              <span className="farm-item">{pick(row.name, row.market, f.table.stack(row.quantity, row.name))}{rank && <span className="tag">{rank}</span>}<PaceTag pace={row.pace}/></span>
              <span className="farm-where">{f.table.inventory}</span>
              <span className="farm-unit"><Platinum value={row.platinum}/></span>
              <span className="farm-sales">{row.monthly_trades ? figure(row.monthly_trades, t) : '—'}</span>
              <span className="farm-delta"><Change value={row.change}/></span>
              <span className="farm-act">{offer && <button type="button" className="stamp" disabled={ordersBusy} aria-pressed={selling === row.id} onClick={() => setSelling(selling === row.id ? null : row.id)}>{listed ? t.card.sellMore : f.table.listForSale}</button>}</span>
            </div>
            {selling === row.id && item && <SellForm item={item} listing={listed ?? undefined} busy={ordersBusy} onSell={onSell} onUpdate={onUpdate} onDone={() => setSelling(null)}/>}
          </li>
        })}
        {action === 'open' && farm.open.slice(0, limit).map(row => <li key={row.id}>
          <div className="farm-row">
            <span className="tag farm-action">{f.actions.open}</span>
            <span className="farm-item">{pick(relicLabel(row, t), row.market, `${relicLabel(row, t)} ${t.relics.quantity(row.quantity)}`)}{row.vaulted && <span className="tag">{t.relics.vaulted}</span>}<PaceTag pace={row.pace}/></span>
            <span className="farm-where">{f.table.fissure}</span>
            <span className="farm-unit"><Platinum value={row.value} approx/><span className="band-note">{f.table.perOpening}</span></span>
            <span className="farm-sales">—</span>
            <span className="farm-delta"><Change value={row.change}/></span>
            <span className="farm-act"/>
          </div>
        </li>)}
        {action === 'farm' && farm.farm.slice(0, limit).map(row => <PlaceRow key={row.location} row={row} expanded={open === row.location} onToggle={() => setOpen(open === row.location ? null : row.location)} pick={pick}/>)}
      </ul>
    </div>
  </section>
}

function PlaceRow({ row, expanded, onToggle, pick }: { row: FarmPlace; expanded: boolean; onToggle: () => void; pick: Pick }) {
  const t = useMessages()
  const f = t.farm
  const detailId = useId()
  const [top] = row.drops
  return <li>
    <div className="farm-row">
      <span className="tag farm-action">{f.actions.farm}</span>
      <span className="farm-item">{pick(top.name, top.name)}{row.drops.length > 1 && <span className="band-note">{f.table.more(row.drops.length - 1)}</span>}<PaceTag pace={row.pace}/></span>
      <span className="farm-where">{row.location}</span>
      <span className="farm-unit"><Platinum value={row.value} approx/><span className="band-note">{f.table.perRun}</span></span>
      <span className="farm-sales">{top.monthly_trades ? figure(top.monthly_trades, t) : '—'}</span>
      <span className="farm-delta"><Change value={top.change}/></span>
      <span className="farm-act">
        <button type="button" className="stamp icon-stamp" aria-expanded={expanded} aria-controls={detailId} aria-label={f.table.drops(row.location)} onClick={onToggle}>
          <svg className="farm-chevron" viewBox="0 0 10 10" aria-hidden="true"><path d="m2.5 3.75 2.5 2.5 2.5-2.5"/></svg>
        </button>
      </span>
    </div>
    {expanded && <ul className="farm-drops" id={detailId} aria-label={f.table.drops(row.location)}>
      {row.drops.map(drop => <li key={drop.name} className="farm-row">
        <span/>
        <span className="farm-item">{pick(drop.name, drop.name)}{drop.relic && <span className="tag">{f.table.relic}</span>}</span>
        <span className="farm-chance">{t.relics.chance(drop.chance)} {f.table.perRun}</span>
        <span className="farm-unit"><Platinum value={drop.unit} approx={drop.relic}/></span>
        <span className="farm-sales">{drop.monthly_trades ? figure(drop.monthly_trades, t) : '—'}</span>
        <span className="farm-delta"><Change value={drop.change}/></span>
        <span/>
      </li>)}
    </ul>}
  </li>
}
