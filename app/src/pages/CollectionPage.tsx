import { useMemo } from 'react'
import type { AccessMode, AppView, CollectionItem, ItemCategory } from '../backend'
import { collectionTotals, figure, masteryOrder, masteryProgress, pageWindow } from '../collection'
import { sellingFor } from '../orders'
import { MetalMark } from '../MetalMark'
import type { SellHandler, UpdateHandler } from '../SellForm'
import { CollectionEntry, type EntryContext } from '../components/CollectionEntry'
import { ItemSheet } from '../components/ItemSheet'
import { useItemSheet } from '../components/useItemSheet'
import { EmptyState } from '../components/EmptyState'
import { Pagination } from '../components/Pagination'
import { SearchField } from '../components/SearchField'
import { Stat } from '../components/Stat'
import { shortDate, useMessages } from '../i18n'

/** `toMaster` swaps the collection for the mastery checklist: equipment left to master, held or not. */
type Ownership = 'all' | 'owned' | 'mastered' | 'toMaster' | 'missing' | 'tradeable'
type Sort = 'name-asc' | 'quantity-desc' | 'category-asc' | 'mastery-asc' | 'platinum-desc' | 'ducats-desc'
type MasterySort = 'arsenal-first' | 'name-asc' | 'category-asc'

/** Held by `App`, so they survive a change of page. The checklist keeps a sort of its own. */
export type CollectionFilters = { search: string; category: ItemCategory | 'all'; ownership: Ownership; sort: Sort; masterySort: MasterySort; page: number }

// Their names are the catalog's (`categories`, `collection.sorts`, `mastery.sorts`).
const categories: Array<ItemCategory | 'all'> = ['all', 'frame', 'weapon', 'companion', 'prime_part', 'relic', 'resource', 'blueprint', 'vehicle', 'mod', 'arcane']
const allModes: Ownership[] = ['all', 'owned', 'mastered', 'toMaster', 'missing', 'tradeable']
// Without verified ownership the checklist is still offered: it says what it needs.
const unverifiedModes: Ownership[] = ['all', 'toMaster']

// Ducats is offered only while the ducat values are on screen.
const sortOptions: Sort[] = ['name-asc', 'quantity-desc', 'category-asc', 'mastery-asc', 'platinum-desc', 'ducats-desc']
// What is held can be ranked tonight; what was never held is a hunt. The default order says so.
const masterySortOptions: MasterySort[] = ['arsenal-first', 'name-asc', 'category-asc']

type Order = (left: CollectionItem, right: CollectionItem) => number
const byName: Order = (left, right) => left.name.localeCompare(right.name)
const byCategory: Order = (left, right) => left.category.localeCompare(right.category) || byName(left, right)
const collectionOrder: Record<Sort, Order> = {
  'name-asc': byName,
  'quantity-desc': (left, right) => right.quantity - left.quantity || byName(left, right),
  'category-asc': byCategory,
  'mastery-asc': (left, right) => masteryOrder(left) - masteryOrder(right) || byName(left, right),
  'platinum-desc': (left, right) => (right.platinum ?? -1) - (left.platinum ?? -1) || byName(left, right),
  'ducats-desc': (left, right) => (right.ducats ?? -1) - (left.ducats ?? -1) || byName(left, right),
}
const checklistOrder: Record<MasterySort, Order> = {
  'arsenal-first': (left, right) => Number(right.quantity > 0) - Number(left.quantity > 0) || byName(left, right),
  'name-asc': byName,
  'category-asc': byCategory,
}

export function CollectionPage({ view, effectiveMode, filters, onFilters, pricing, onPriceLive, priceFloor, showDucats, onToggleDucats, onSell, onUpdate, ordersBusy }: { view: AppView; effectiveMode: AccessMode; filters: CollectionFilters; onFilters: (filters: CollectionFilters) => void; pricing: boolean; onPriceLive: (ids: string[]) => void; priceFloor: number; showDucats: boolean; onToggleDucats: () => void; onSell: SellHandler; onUpdate: UpdateHandler; ordersBusy: boolean }) {
  const t = useMessages()
  const ownershipVerified = effectiveMode === 'full'
  const snapshotOnly = !ownershipVerified
  const { search, masterySort } = filters
  // Ownership cannot be filtered on when it cannot be verified, and ducats cannot be sorted on
  // while their values are hidden: that sort falls back to platinum, in plain sight.
  const modes = ownershipVerified && view.collection.items.length > 0 ? allModes : unverifiedModes
  const ownership = modes.includes(filters.ownership) ? filters.ownership : 'all'
  const checklist = ownership === 'toMaster'
  const mastery = view.mastery
  // The checklist's chips are the masterable categories with their progress; a category it does
  // not have falls back to all of them, as the ducat sort falls back to platinum.
  const chipCategories: Array<ItemCategory | 'all'> = checklist ? ['all', ...mastery.totals.map(entry => entry.category)] : categories
  const category = chipCategories.includes(filters.category) ? filters.category : 'all'
  const sort = !showDucats && filters.sort === 'ducats-desc' ? 'platinum-desc' : filters.sort
  // Any filter change starts again from the first page; only paging keeps the page it asks for.
  const update = (patch: Partial<CollectionFilters>) => onFilters({ ...filters, page: 1, ...patch })
  const { owned, missing, worth, sellable, ducatsAtStake } = collectionTotals(view.collection.items, priceFloor)
  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase()
    return (checklist ? mastery.items : view.collection.items)
      .filter(item => !query || item.name.toLocaleLowerCase().includes(query))
      .filter(item => category === 'all' || item.category === category)
      .filter(item => ownership === 'all' || ownership === 'toMaster'
        || (ownership === 'owned' && item.quantity > 0)
        || (ownership === 'mastered' && item.mastered)
        || (ownership === 'missing' && item.quantity === 0)
        || (ownership === 'tradeable' && item.platinum !== undefined))
      .toSorted(checklist ? checklistOrder[masterySort] : collectionOrder[sort])
  }, [checklist, mastery.items, view.collection.items, search, category, ownership, sort, masterySort])
  const { current: currentPage, total: totalPages, visible: visibleItems, first: firstResult, last: lastResult } = pageWindow(filtered, filters.page)
  const sheet = useItemSheet(filtered)
  // Nothing on the checklist is sold from it: every row is either unheld or still to rank.
  const entry = (item: CollectionItem): EntryContext => checklist
    ? { ownershipVerified: true, missingLabel: t.card.neverHeld, showDucats: false, listedOrder: null, sellable: false, onSell, onUpdate, busy: ordersBusy }
    : {
      ownershipVerified,
      showDucats,
      ...sellingFor(item, view.market_account, ownershipVerified),
      onSell,
      onUpdate,
      busy: ordersBusy,
    }
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
  const progress = masteryProgress(mastery.totals)
  const inArsenal = mastery.items.filter(item => item.quantity > 0).length
  const clearFilters = () => update({ search: '', category: 'all', ownership: checklist ? 'toMaster' : 'all' })

  const collectionStats = <div className="stats">
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
  </div>
  const checklistStats = mastery.available && <div className="stats">
    <Stat kind="mastered" value={`${figure(progress.mastered, t)}/${figure(progress.total, t)}`} label={progress.percent === null ? t.mastery.mastered : `${t.mastery.mastered} · ${t.units.percent(progress.percent)}`}/>
    <Stat kind="remaining" value={mastery.items.length} label={t.mastery.remaining}/>
    <Stat kind="arsenal" value={inArsenal} label={t.mastery.inArsenal}/>
    <Stat kind="missing" value={mastery.items.length - inArsenal} label={t.mastery.neverHeld}/>
  </div>

  const toolbar = <div className="toolbar">
    <SearchField label={t.collection.search} value={search} onChange={value => update({ search: value })}/>
    {checklist
      ? <label className="select">
        <span aria-hidden="true">{t.grid.sort}</span>
        <select aria-label={t.mastery.sortLabel} value={masterySort} onChange={event => update({ masterySort: event.target.value as MasterySort })}>
          {masterySortOptions.map(option => <option key={option} value={option}>{t.mastery.sorts[option]}</option>)}
        </select>
      </label>
      : <>
        <label className="select">
          <span aria-hidden="true">{t.grid.sort}</span>
          <select aria-label={t.collection.sortLabel} value={sort} onChange={event => update({ sort: event.target.value as Sort })}>
            {sorts.map(option => <option key={option} value={option}>{t.collection.sorts[option]}</option>)}
          </select>
        </label>
        <button type="button" role="switch" aria-checked={showDucats} className="display-switch" onClick={onToggleDucats}>
          <span className="display-face"><MetalMark metal="ducat"/>{t.collection.ducatValues}</span>
          <span className="display-track" aria-hidden="true"><span className="display-thumb"/></span>
        </button>
      </>}
  </div>

  // The checklist's chips carry the progress: mastered over total, as the profile would.
  const chips = checklist
    ? <div className="chips" role="group" aria-label={t.mastery.categories}>
      <button type="button" className="chip" aria-label={t.grid.allCategories} aria-pressed={category === 'all'} onClick={() => update({ category: 'all' })}>{t.categories.all}</button>
      {mastery.totals.map(entry => <button
        type="button"
        key={entry.category}
        className="chip"
        aria-label={`${t.categories[entry.category]} ${entry.mastered}/${entry.total}`}
        aria-pressed={category === entry.category}
        onClick={() => update({ category: entry.category })}
      >{t.categories[entry.category]}<span className="chip-count">{entry.mastered}/{entry.total}</span></button>)}
    </div>
    : <div className="chips" role="group" aria-label={t.collection.itemCategories}>
      {categories.map(item => <button
        type="button"
        key={item}
        className="chip"
        aria-label={item === 'all' ? t.grid.allCategories : undefined}
        aria-pressed={category === item}
        onClick={() => update({ category: item })}
      >{t.categories[item]}</button>)}
    </div>

  const grid = <>
    <ul className="card-grid" aria-label={checklist ? t.mastery.list : t.collection.list}>{visibleItems.map(item => <li key={item.id}><CollectionEntry item={item} {...entry(item)} onOpen={trigger => sheet.open(item.id, trigger)}/></li>)}</ul>
    <p className="result-count">{t.grid.range(firstResult, lastResult, filtered.length)}</p>
    <Pagination current={currentPage} total={totalPages} onChange={page => onFilters({ ...filters, page })}/>
  </>

  function body() {
    if (checklist) {
      if (!mastery.available) return <EmptyState icon="mastery" title={t.mastery.unavailable} detail={t.mastery.unavailableDetail}/>
      return <>
        {toolbar}
        {chips}
        {filtered.length ? grid : <EmptyState
          icon="mastery"
          title={t.mastery.nothingLeft}
          detail={mastery.items.length ? t.grid.tryAnother : t.mastery.allMastered}
          action={mastery.items.length > 0 && <button type="button" className="stamp" onClick={clearFilters}>{t.grid.clearFilters}</button>}
        />}
      </>
    }
    if (!view.collection.items.length) return <EmptyState
      icon="collection"
      title={snapshotOnly ? t.collection.emptySnapshot : t.collection.empty}
      detail={snapshotOnly ? t.collection.emptySnapshotDetail : t.collection.emptyDetail}
    />
    return <>
      {toolbar}
      {/* The chips and the price controls share a row, so the grid starts where the eye lands. */}
      <div className="filter-row">
        {chips}
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
      {filtered.length ? grid : <EmptyState icon="search" title={t.grid.noMatch} detail={t.grid.tryAnother} action={<button type="button" className="stamp" onClick={clearFilters}>{t.grid.clearFilters}</button>}/>}
    </>
  }

  return <section className="page" aria-labelledby="collection-title">
    <div className="page-head">
      <h1 id="collection-title" className="page-title">{snapshotOnly ? t.collection.titleSnapshot : t.collection.title}</h1>
      <div className="segmented head-tabs" role="group" aria-label={t.collection.ownershipFilters}>
        {modes.map(filter => <button
          type="button"
          key={filter}
          aria-pressed={ownership === filter}
          onClick={() => update({ ownership: filter })}
        >{t.collection.ownership[filter]}</button>)}
      </div>
      {checklist ? checklistStats : collectionStats}
      {snapshotOnly && !checklist && <p className="page-note">{t.collection.snapshotNote}</p>}
    </div>
    {body()}
    {sheet.item && <ItemSheet item={sheet.item} index={sheet.index} total={sheet.total} onStep={sheet.step} onClose={sheet.close} {...entry(sheet.item)}/>}
  </section>
}
