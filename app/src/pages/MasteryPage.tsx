import { useMemo } from 'react'
import type { AppView, ItemCategory } from '../backend'
import { pageWindow } from '../collection'
import type { SellHandler, UpdateHandler } from '../SellForm'
import { CollectionEntry } from '../components/CollectionEntry'
import { EmptyState } from '../components/EmptyState'
import { Pagination } from '../components/Pagination'
import { SearchField } from '../components/SearchField'
import { Stat } from '../components/Stat'
import { useMessages } from '../i18n'

type MasterySort = 'arsenal-first' | 'name-asc' | 'category-asc'
export type MasteryFilters = { search: string; category: ItemCategory | 'all'; sort: MasterySort; page: number }

// What is held can be ranked tonight; what was never held is a hunt. The default order says so.
const masterySortOptions: MasterySort[] = ['arsenal-first', 'name-asc', 'category-asc']

export function MasteryPage({ view, filters, onFilters, onSell, onUpdate, ordersBusy }: { view: AppView; filters: MasteryFilters; onFilters: (filters: MasteryFilters) => void; onSell: SellHandler; onUpdate: UpdateHandler; ordersBusy: boolean }) {
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
      ? <EmptyState icon="mastery" title={t.mastery.unavailable} detail={t.mastery.unavailableDetail}/>
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
            icon="mastery"
            title={t.mastery.nothingLeft}
            detail={items.length ? t.grid.tryAnother : t.mastery.allMastered}
            action={items.length > 0 && <button type="button" className="stamp" onClick={() => update({ search: '', category: 'all' })}>{t.grid.clearFilters}</button>}
          />}
      </>}
  </section>
}
