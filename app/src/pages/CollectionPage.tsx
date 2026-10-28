import { useMemo } from 'react'
import type { AccessMode, AppView, CollectionItem, ItemCategory } from '../backend'
import { collectionTotals, figure, masteryOrder, pageWindow } from '../collection'
import { isListable, listedOrderFor } from '../orders'
import { MetalMark } from '../MetalMark'
import type { SellHandler, UpdateHandler } from '../SellForm'
import { CollectionEntry, type EntryContext } from '../components/CollectionEntry'
import { ItemSheet } from '../components/ItemSheet'
import { useItemSheet } from '../components/useItemSheet'
import { EmptyState } from '../components/EmptyState'
import { Icon } from '../components/Icon'
import { Pagination } from '../components/Pagination'
import { SearchField } from '../components/SearchField'
import { Stat } from '../components/Stat'
import { shortDate, useMessages } from '../i18n'

type Ownership = 'all' | 'owned' | 'mastered' | 'missing' | 'tradeable'
type Sort = 'name-asc' | 'quantity-desc' | 'category-asc' | 'mastery-asc' | 'platinum-desc' | 'ducats-desc'

/** Held by `App`, so they survive a change of page. */
export type CollectionFilters = { search: string; category: ItemCategory | 'all'; ownership: Ownership; sort: Sort; page: number }

// Their names are the catalog's (`categories`, `collection.sorts`, `mastery.sorts`).
const categories: Array<ItemCategory | 'all'> = ['all', 'frame', 'weapon', 'companion', 'prime_part', 'relic', 'resource', 'blueprint', 'vehicle', 'mod', 'arcane']


// Ducats is offered only while the ducat values are on screen.
const sortOptions: Sort[] = ['name-asc', 'quantity-desc', 'category-asc', 'mastery-asc', 'platinum-desc', 'ducats-desc']

export function CollectionPage({ view, effectiveMode, filters, onFilters, pricing, onPriceLive, priceFloor, showDucats, onToggleDucats, onOpenMastery, onSell, onUpdate, ordersBusy }: { view: AppView; effectiveMode: AccessMode; filters: CollectionFilters; onFilters: (filters: CollectionFilters) => void; pricing: boolean; onPriceLive: (ids: string[]) => void; priceFloor: number; showDucats: boolean; onToggleDucats: () => void; onOpenMastery: () => void; onSell: SellHandler; onUpdate: UpdateHandler; ordersBusy: boolean }) {
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
  const sheet = useItemSheet(filtered)
  const entry = (item: CollectionItem): EntryContext => ({
    ownershipVerified,
    showDucats,
    listedOrder: listedOrderFor(view.market_account.orders, item.id),
    sellable: ownershipVerified && view.market_account.link === 'linked' && isListable(item, view.market_account.listable),
    onSell,
    onUpdate,
    busy: ordersBusy,
  })
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
      {ownershipVerified && view.collection.items.length > 0 && <div className="segmented head-tabs" role="group" aria-label={t.collection.ownershipFilters}>
        {(['all', 'owned', 'mastered', 'missing', 'tradeable'] as const).map(filter => <button
          type="button"
          key={filter}
          aria-pressed={ownership === filter}
          onClick={() => update({ ownership: filter })}
        >{t.collection.ownership[filter]}</button>)}
      </div>}
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
          <ul className="card-grid" aria-label={t.collection.list}>{visibleItems.map(item => <li key={item.id}><CollectionEntry item={item} {...entry(item)} onOpen={trigger => sheet.open(item.id, trigger)}/></li>)}</ul>
          <p className="result-count">{t.grid.range(firstResult, lastResult, filtered.length)}</p>
          <Pagination current={currentPage} total={totalPages} onChange={page => onFilters({ ...filters, page })}/>
        </>
        : <EmptyState icon="search" title={t.grid.noMatch} detail={t.grid.tryAnother} action={<button type="button" className="stamp" onClick={() => update({ search: '', category: 'all', ownership: 'all' })}>{t.grid.clearFilters}</button>}/>}
    </> : <EmptyState
      icon="collection"
      title={snapshotOnly ? t.collection.emptySnapshot : t.collection.empty}
      detail={snapshotOnly ? t.collection.emptySnapshotDetail : t.collection.emptyDetail}
    />}
    {sheet.item && <ItemSheet item={sheet.item} index={sheet.index} total={sheet.total} onStep={sheet.step} onClose={sheet.close} {...entry(sheet.item)}/>}
  </section>
}
