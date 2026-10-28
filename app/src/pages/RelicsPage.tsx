import { useEffect, useMemo, useState } from 'react'
import { getRelics, type AccessMode, type AppView, type Relic, type RelicReward, type RelicsView } from '../backend'
import { MetalMark } from '../MetalMark'
import { EmptyState } from '../components/EmptyState'
import { Ducats, Platinum } from '../components/Platinum'
import { SearchField } from '../components/SearchField'
import { Stat } from '../components/Stat'
import { shortDate, useMessages, type Messages } from '../i18n'
import './RelicsPage.css'

type Sort = 'opening-desc' | 'quantity-desc' | 'name-asc'
const sorts: Sort[] = ['opening-desc', 'quantity-desc', 'name-asc']
// The game's order, oldest tier first; an era the game adds later sorts after these by name.
const eraOrder = ['Lith', 'Meso', 'Neo', 'Axi', 'Requiem']
const eraRank = (era: string) => { const index = eraOrder.indexOf(era); return index === -1 ? eraOrder.length : index }
const refinementOrder = ['intact', 'exceptional', 'flawless', 'radiant']
const refinementRank = (relic: Relic) => refinementOrder.indexOf(relic.refinement ?? '')

const label = (relic: Relic, t: Messages) => relic.refinement ? `${relic.name} ${t.relics.refinements[relic.refinement]}` : relic.name

/**
 * What the held relics are worth, and which to open. The view is the backend's, computed from
 * what it already holds; this page asks for it again when the snapshot or the prices move.
 */
export function RelicsPage({ view, effectiveMode }: { view: AppView; effectiveMode: AccessMode }) {
  const t = useMessages()
  const [relics, setRelics] = useState<RelicsView | null>(null)
  const [failed, setFailed] = useState(false)
  const [search, setSearch] = useState('')
  const [era, setEra] = useState<string>('all')
  const [sort, setSort] = useState<Sort>('opening-desc')
  const [open, setOpen] = useState<string | null>(null)
  const snapshotAt = view.collection.snapshot?.observed_at
  const pricesAt = view.health.collection_prices.last_success
  const catalogAt = view.health.catalog.last_success

  useEffect(() => {
    let active = true
    getRelics()
      .then(next => { if (active) { setRelics(next); setFailed(false) } })
      .catch(() => { if (active) setFailed(true) })
    return () => { active = false }
  }, [snapshotAt, pricesAt, catalogAt])

  const held = useMemo(() => relics?.relics ?? [], [relics])
  const eras = useMemo(() => [...new Set(held.map(relic => relic.era))]
    .toSorted((left, right) => eraRank(left) - eraRank(right) || left.localeCompare(right)), [held])
  const shown = useMemo(() => {
    const query = search.trim().toLocaleLowerCase()
    return held
      .filter(relic => era === 'all' || relic.era === era)
      .filter(relic => !query || label(relic, t).toLocaleLowerCase().includes(query)
        || relic.rewards.some(reward => reward.name.toLocaleLowerCase().includes(query)))
      .toSorted((left, right) => sort === 'quantity-desc'
        ? right.quantity - left.quantity || left.name.localeCompare(right.name)
        : sort === 'name-asc'
          ? left.name.localeCompare(right.name) || refinementRank(left) - refinementRank(right)
          : (right.opening?.platinum ?? -1) - (left.opening?.platinum ?? -1) || left.name.localeCompare(right.name))
  }, [held, era, search, sort, t])

  const snapshotOnly = effectiveMode !== 'full'
  const title = snapshotOnly ? t.relics.titleSnapshot : t.relics.title
  if (!relics) {
    return <section className="page" aria-labelledby="relics-title" aria-live="polite">
      <div className="page-head"><h1 id="relics-title" className="page-title">{title}</h1></div>
      {failed ? <p className="error-banner" role="alert">{t.relics.failed}</p> : <><p className="page-note">{t.relics.loading}</p><div className="streak" aria-hidden="true"/></>}
    </section>
  }

  const priced = relics.prices_date !== null
  const count = held.reduce((sum, relic) => sum + relic.quantity, 0)
  const openingTotal = held.reduce((sum, relic) => sum + relic.quantity * (relic.opening?.platinum ?? 0), 0)
  const marketTotal = held.reduce((sum, relic) => sum + relic.quantity * (relic.platinum ?? 0), 0)

  return <section className="page relics-page" aria-labelledby="relics-title">
    <div className="page-head">
      <h1 id="relics-title" className="page-title">{title}</h1>
      {held.length > 0 && <div className="stats">
        <Stat kind="items" value={count} label={t.relics.held(count)}/>
        {priced && relics.catalog && <Stat kind="worth" value={t.relics.approxWhole(openingTotal)} unit={<MetalMark metal="plat" alt={t.units.platinum}/>} label={t.relics.openingTotal} note={t.relics.averageNote}/>}
        {priced && <Stat kind="worth" value={marketTotal} unit={<MetalMark metal="plat" alt={t.units.platinum}/>} label={t.relics.marketTotal}/>}
      </div>}
      {snapshotOnly && <p className="page-note">{t.relics.snapshotNote}</p>}
      {!relics.catalog && held.length > 0 && <p className="page-note relics-warn">{t.relics.noCatalog}</p>}
    </div>

    {held.length === 0
      ? <EmptyState icon="relics" title={snapshotOnly ? t.relics.emptySnapshot : t.relics.empty} detail={snapshotOnly ? t.relics.emptySnapshotDetail : t.relics.emptyDetail}/>
      : <>
        <div className="toolbar">
          <SearchField label={t.relics.search} value={search} onChange={setSearch}/>
          <label className="select">
            <span aria-hidden="true">{t.grid.sort}</span>
            <select aria-label={t.relics.sortLabel} value={sort} onChange={event => setSort(event.target.value as Sort)}>
              {sorts.map(option => <option key={option} value={option}>{t.relics.sorts[option]}</option>)}
            </select>
          </label>
        </div>
        <div className="filter-row">
          <div className="chips" role="group" aria-label={t.relics.eras}>
            <button type="button" className="chip" aria-label={t.relics.allEras} aria-pressed={era === 'all'} onClick={() => setEra('all')}>{t.categories.all}</button>
            {eras.map(name => <button type="button" key={name} className="chip" aria-pressed={era === name} onClick={() => setEra(name)}>
              {name}<span className="chip-count">{held.filter(relic => relic.era === name).reduce((sum, relic) => sum + relic.quantity, 0)}</span>
            </button>)}
          </div>
          <div className="status-line">
            <span>{relics.prices_date ? t.collection.prices(shortDate(relics.prices_date, t)) : t.collection.noPrices}</span>
          </div>
        </div>

        {shown.length === 0
          ? <EmptyState icon="search" title={t.relics.noMatch} detail={t.grid.tryAnother} action={<button type="button" className="stamp" onClick={() => { setSearch(''); setEra('all') }}>{t.grid.clearFilters}</button>}/>
          : <div className="group relic-table">
            <div className="relic-row relic-head" aria-hidden="true">
              <span>{t.relics.columns.relic}</span><span>{t.relics.columns.quantity}</span><span>{t.relics.columns.opening}</span><span>{t.relics.columns.price}</span><span>{t.relics.columns.trades}</span><span/>
            </div>
            <ul className="relic-list" aria-label={t.relics.list}>
              {shown.map(relic => <RelicEntry key={relic.id} relic={relic} priced={priced} ducats={relics.ducats} expanded={open === relic.id} onToggle={() => setOpen(open === relic.id ? null : relic.id)}/>)}
            </ul>
          </div>}
      </>}
  </section>
}

function RelicEntry({ relic, priced, ducats, expanded, onToggle }: { relic: Relic; priced: boolean; ducats: boolean; expanded: boolean; onToggle: () => void }) {
  const t = useMessages()
  const detailId = `relic-${relic.id.replace(/\W/g, '')}`
  const { opening } = relic
  return <li>
    <button type="button" className="relic-row" aria-expanded={expanded} aria-controls={detailId} onClick={onToggle}>
      <span className="relic-name">
        <strong>{relic.name}</strong>
        {relic.refinement && <span className={`tag refinement ${relic.refinement}`}>{t.relics.refinements[relic.refinement]}</span>}
        {relic.vaulted && <span className="tag">{t.relics.vaulted}</span>}
      </span>
      <span className="relic-quantity">{t.relics.quantity(relic.quantity)}</span>
      <span className="relic-values">
        {opening && priced ? <>
          <Platinum value={opening.platinum} approx/>
          {opening.unpriced > 0 && <span className="value-missing">{t.relics.unpricedShort(opening.unpriced)}</span>}
        </> : <span className="value-missing">{t.relics.noValue}</span>}
        {/* A relic of rewards Baro refuses (Requiem mods) averages no ducats; a zero would read as a value. */}
        {opening && opening.ducats !== null && opening.ducats > 0 && <Ducats value={opening.ducats} approx/>}
      </span>
      <span className="relic-values">{relic.platinum !== null ? <Platinum value={relic.platinum}/> : <span className="value-missing">{t.relics.unpriced}</span>}</span>
      <span className="relic-trades">{relic.monthly_trades ? t.relics.perMonth(relic.monthly_trades) : t.relics.noTrades}</span>
      <svg className="relic-chevron" viewBox="0 0 10 10" aria-hidden="true"><path d="m2.5 3.75 2.5 2.5 2.5-2.5"/></svg>
    </button>
    {expanded && <div className="relic-detail" id={detailId} role="region" aria-label={t.relics.rewards(label(relic, t))}>
      {relic.rewards.length === 0
        ? <p className="band-note">{t.relics.noRewards}</p>
        : <>
          <ul className="reward-rows">{relic.rewards.map(reward => <RewardRow key={reward.name} reward={reward} priced={priced} ducats={ducats}/>)}</ul>
          <p className="band-note">{t.relics.averageNote}{opening && opening.unpriced > 0 && ` ${t.relics.unpricedNote(opening.unpriced, opening.unpriced_chance)}`}</p>
        </>}
    </div>}
  </li>
}

function RewardRow({ reward, priced, ducats }: { reward: RelicReward; priced: boolean; ducats: boolean }) {
  const t = useMessages()
  const mark = reward.mastery
  // Only under live facts does a part read as missing; a saved snapshot proves mastery, never a gap.
  const needed = mark?.state === 'unmastered' && mark.missing
  return <li className="reward-row" data-rarity={reward.rarity ?? undefined}>
    <span className="reward-rarity">{reward.rarity && <><i aria-hidden="true"/>{t.relics.rarities[reward.rarity]}</>}</span>
    <span className="reward-name">
      {reward.name}
      <span className="tags">
        {reward.owned > 0 ? <span className="tag">{t.relics.owned(reward.owned)}</span> : <span className="tag absent">{t.relics.notOwned}</span>}
        {needed && <span className="tag needed">{mark.completes ? t.relics.completesSet : t.relics.neededForSet}</span>}
      </span>
    </span>
    <span className="reward-chance">{reward.chance !== null && t.relics.chance(reward.chance)}</span>
    <span className="relic-values">{reward.platinum !== null ? <Platinum value={reward.platinum}/> : priced && <span className="value-missing">{t.relics.unpriced}</span>}</span>
    <span className="relic-values">{reward.ducats !== null ? <Ducats value={reward.ducats}/> : ducats && <span className="value-missing">{t.relics.noDucats}</span>}</span>
  </li>
}
