import { memo, useEffect, useMemo, useState } from 'react'
import { getFoundry, type AccessMode, type AppView, type FoundryItem, type FoundryPiece, type FoundryStage, type FoundryView, type ItemCategory } from '../backend'
import { figure } from '../collection'
import { EmptyState } from '../components/EmptyState'
import { SearchField } from '../components/SearchField'
import { Stat } from '../components/Stat'
import { MetalMark } from '../MetalMark'
import { PartGlyph } from '../SetRow'
import { useMessages, type Messages } from '../i18n'
import './FoundryPage.css'

type FoundrySort = 'proximity' | 'value' | 'name'

const stages: FoundryStage[] = ['ready', 'almost', 'set']
const sorts: FoundrySort[] = ['proximity', 'value', 'name']
const categoryOrder: ItemCategory[] = ['frame', 'weapon', 'companion', 'vehicle']
/** Relics named on a missing piece before the rest fold into a count. */
const SHOWN_DROPS = 3

/** What the build is worth on the market: as a set where it is quoted, else piece by piece. */
const worth = (item: FoundryItem) => item.set_platinum ?? item.pieces_platinum ?? -1

/** The tile shown while the backend cannot list anything, by what it waits for. */
const waiting = (t: Messages): Record<FoundryView['status'], [string, string]> => ({
  no_catalog: [t.foundry.noCatalog, t.foundry.noCatalogDetail],
  no_inventory: [t.foundry.noInventory, t.foundry.noInventoryDetail],
  ready: [t.foundry.empty, t.foundry.emptyDetail],
})

export function FoundryPage({ view, effectiveMode }: { view: AppView; effectiveMode: AccessMode }) {
  const t = useMessages()
  const [foundry, setFoundry] = useState<FoundryView | null>(null)
  const [failed, setFailed] = useState(false)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<ItemCategory | 'all'>('all')
  const [unmasteredOnly, setUnmasteredOnly] = useState(false)
  const [sort, setSort] = useState<FoundrySort>('proximity')
  // Asked again whenever what it is built from moves: a new snapshot, the catalog, the price table.
  const source = [view.collection.snapshot?.observed_at, view.health.catalog.state, view.health.catalog.last_success, view.health.collection_prices.last_success].join('|')
  useEffect(() => {
    let active = true
    getFoundry()
      .then(next => { if (active) { setFoundry(next); setFailed(false) } })
      .catch(() => { if (active) setFailed(true) })
    return () => { active = false }
  }, [source])

  const items = useMemo(() => foundry?.items ?? [], [foundry])
  const presentCategories = categoryOrder.filter(entry => items.some(item => item.category === entry))
  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase()
    return items
      .filter(item => !query || item.name.toLocaleLowerCase().includes(query))
      .filter(item => category === 'all' || item.category === category)
      .filter(item => !unmasteredOnly || (item.masterable && !item.mastered))
      .toSorted((left, right) => sort === 'value'
        ? worth(right) - worth(left) || left.name.localeCompare(right.name)
        : sort === 'name'
          ? left.name.localeCompare(right.name)
          : left.missing - right.missing || left.name.localeCompare(right.name))
  }, [items, search, category, unmasteredOnly, sort])
  const clear = () => { setSearch(''); setCategory('all'); setUnmasteredOnly(false) }

  function body() {
    if (failed) return <p className="error-banner" role="alert">{t.foundry.failed}</p>
    if (!foundry) return <p className="page-note" role="status">{t.foundry.loading}</p>
    if (foundry.status !== 'ready' || !items.length) {
      const [title, detail] = waiting(t)[foundry.status]
      return <EmptyState icon="foundry" title={title} detail={detail}/>
    }
    return <>
      <div className="toolbar">
        <SearchField label={t.foundry.search} value={search} onChange={setSearch}/>
        <label className="select">
          <span aria-hidden="true">{t.grid.sort}</span>
          <select aria-label={t.foundry.sortLabel} value={sort} onChange={event => setSort(event.target.value as FoundrySort)}>
            {sorts.map(option => <option key={option} value={option}>{t.foundry.sorts[option]}</option>)}
          </select>
        </label>
        <button type="button" role="switch" aria-checked={unmasteredOnly} className="display-switch" onClick={() => setUnmasteredOnly(!unmasteredOnly)}>
          <span className="display-face">{t.foundry.unmasteredOnly}</span>
          <span className="display-track" aria-hidden="true"><span className="display-thumb"/></span>
        </button>
      </div>
      <div className="chips" role="group" aria-label={t.foundry.categories}>
        {(['all', ...presentCategories] as const).map(entry => <button
          type="button"
          key={entry}
          className="chip"
          aria-label={entry === 'all' ? t.grid.allCategories : undefined}
          aria-pressed={category === entry}
          onClick={() => setCategory(entry)}
        >{t.categories[entry]}</button>)}
      </div>
      {filtered.length
        ? stages.map(stage => {
          const list = filtered.filter(item => item.stage === stage)
          return list.length > 0 && <section key={stage} className="foundry-section" aria-labelledby={`foundry-${stage}`}>
            <h2 id={`foundry-${stage}`} className="section-title">{t.foundry.stages[stage]}<span className="chip-count">{figure(list.length, t)}</span></h2>
            <ul className="foundry-grid">{list.map(item => <li key={item.id}><FoundryCard item={item}/></li>)}</ul>
          </section>
        })
        : <EmptyState icon="search" title={t.grid.noMatch} detail={t.grid.tryAnother} action={<button type="button" className="stamp" onClick={clear}>{t.grid.clearFilters}</button>}/>}
    </>
  }

  return <section className="page foundry" aria-labelledby="foundry-title">
    <div className="page-head">
      <h1 id="foundry-title" className="page-title">{t.foundry.title}</h1>
      {items.length > 0 && <div className="stats">
        {stages.map(stage => <Stat key={stage} kind={`foundry-${stage}`} value={items.filter(item => item.stage === stage).length} label={t.foundry.counts[stage]}/>)}
      </div>}
      {foundry?.status === 'ready' && effectiveMode !== 'full' && <p className="page-note">{t.foundry.snapshotNote}</p>}
    </div>
    {body()}
  </section>
}

/** Memoised: the 2.5s poll re-renders the page, and the items keep their identity between fetches. */
const FoundryCard = memo(function FoundryCard({ item }: { item: FoundryItem }) {
  const t = useMessages()
  const [artFailed, setArtFailed] = useState(false)
  return <article className="foundry-card" aria-labelledby={`foundry-item-${item.id}`}>
    <header className="foundry-head">
      <div className="card-art">
        {item.image_url && !artFailed
          ? <img src={item.image_url} alt="" loading="lazy" decoding="async" onError={() => setArtFailed(true)}/>
          : <span aria-hidden="true">{item.name.slice(0, 2)}</span>}
      </div>
      <div className="card-body">
        <h3 id={`foundry-item-${item.id}`} className="card-name">{item.name}</h3>
        {item.category && <span className="card-meta">{t.categories[item.category]}</span>}
        <div className="tags">
          {item.missing > 0 && <span className="tag absent">{t.foundry.missing(item.missing)}</span>}
          {item.masterable && (item.mastered
            ? <span className="tag mastered">{t.card.mastered}</span>
            : <span className="tag gain">{t.foundry.masteryGain}</span>)}
        </div>
      </div>
      <SetValue item={item}/>
    </header>
    <ul className="foundry-pieces" aria-label={t.foundry.pieces}>
      {item.pieces.map(piece => <PieceRow key={`${piece.kind}-${piece.name}`} piece={piece}/>)}
    </ul>
    {item.resources.length > 0 && <p className="foundry-resources">
      <span className="foundry-label">{t.foundry.resources}</span>
      {item.resources.map(resource => <span key={resource.name} className="foundry-resource" data-short={resource.held < resource.uses || undefined}>
        {resource.name}
        <HeldCount held={resource.held} uses={resource.uses}/>
      </span>)}
    </p>}
  </article>
})

function PieceRow({ piece }: { piece: FoundryPiece }) {
  const t = useMessages()
  const full = piece.held >= piece.uses
  // "Axi B1 Relic" reads as "Axi B1" under a Relics label; the full list stays on hover.
  const drops = piece.drops.map(drop => drop.replace(/ Relic$/, ''))
  return <li className="foundry-piece" data-missing={!full || undefined}>
    <PartGlyph image={piece.image} held={piece.held > 0}/>
    <span className="foundry-piece-name">{piece.kind === 'blueprint' ? t.categories.blueprint : piece.name}</span>
    <HeldCount held={piece.held} uses={piece.uses}/>
    {!full && piece.platinum !== undefined && <Platinum value={piece.platinum}/>}
    {!full && piece.kind !== 'ingredient' && <span className="foundry-drops" title={drops.length > SHOWN_DROPS ? piece.drops.join(', ') : undefined}>
      {drops.length
        ? <><span className="foundry-label">{t.foundry.drops}</span> {drops.slice(0, SHOWN_DROPS).join(' · ')}{drops.length > SHOWN_DROPS && ` +${figure(drops.length - SHOWN_DROPS, t)}`}</>
        : t.foundry.noDrops}
    </span>}
  </li>
}

/** Held over needed: a check when held in full, a dashed ring when short, and the same in words. */
function HeldCount({ held, uses }: { held: number; uses: number }) {
  const t = useMessages()
  const full = held >= uses
  return <span className="foundry-count">
    <svg className="foundry-held-mark" viewBox="0 0 12 12" aria-hidden="true" data-full={full}>
      {full ? <path d="m2.5 6.2 2.3 2.3 4.7-5"/> : <circle cx="6" cy="6" r="4.25" strokeDasharray="2 1.6"/>}
    </svg>
    <span aria-hidden="true">{figure(held, t)}/{figure(uses, t)}</span>
    <span className="sr-only">{full ? t.slip.heldInFull : t.slip.held(held, uses)}</span>
  </span>
}

function Platinum({ value }: { value: number }) {
  const t = useMessages()
  return <span className="value plat"><MetalMark metal="plat" alt={t.card.platinum}/><b>{figure(value, t)}</b></span>
}

/** The set's price beside its pieces sold one by one, and which way sells for more. */
function SetValue({ item }: { item: FoundryItem }) {
  const t = useMessages()
  const { set_platinum: set, pieces_platinum: pieces } = item
  const lines = ([[t.foundry.setValue, set], [t.foundry.pieces, pieces]] as const).filter((line): line is readonly [string, number] => line[1] !== undefined)
  if (!lines.length) return null
  let verdict: string | null = null
  if (set !== undefined && pieces !== undefined) {
    if (set > pieces) verdict = t.foundry.sellSet(set - pieces)
    else if (set < pieces) verdict = t.foundry.sellPieces(pieces - set)
    else verdict = t.foundry.sameValue
  }
  return <div className="foundry-values">
    {lines.map(([label, value]) => <span key={label} className="foundry-value"><span>{label}</span><Platinum value={value}/></span>)}
    {verdict && <span className="foundry-verdict">{verdict}</span>}
  </div>
}
