import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { openUrl } from '@tauri-apps/plugin-opener'
import { getItemBuilds, getItemDetail, type Build, type CollectionItem, type DropSource, type ItemDetail, type StatKey } from '../backend'
import { figure, masteryOrder } from '../collection'
import { MetalMark } from '../MetalMark'
import { SellForm } from '../SellForm'
import { longDate, useMessages, type Messages } from '../i18n'
import { canSell } from '../orders'
import type { EntryContext } from './CollectionEntry'
import { Icon } from './Icon'

const FOCUSABLE = 'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary'

/**
 * One item in full, over the page's right edge: the grid and its filters stay where they are.
 * Focus stays inside until it closes (Escape, the close control, a press outside); the arrow keys
 * walk the page's filtered list. What the catalogue does not say is left out, never filled in.
 */
export function ItemSheet({ item, index, total, onStep, onClose, ...context }: EntryContext & {
  item: CollectionItem
  index: number
  total: number
  onStep: (delta: number) => void
  onClose: () => void
}) {
  const t = useMessages()
  const titleId = useId()
  const panel = useRef<HTMLElement>(null)
  // `value` null is a failed read; no entry for this id yet is a read in flight.
  const [detail, setDetail] = useState<{ id: string; value: ItemDetail | null } | null>(null)
  const [selling, setSelling] = useState(false)
  const loaded = detail?.id === item.id ? detail.value : undefined

  useEffect(() => {
    let live = true
    setSelling(false)
    getItemDetail(item.id).then(
      value => { if (live) setDetail({ id: item.id, value }) },
      () => { if (live) setDetail({ id: item.id, value: null }) },
    )
    return () => { live = false }
  }, [item.id])

  useEffect(() => { panel.current?.focus() }, [])

  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (!panel.current?.contains(event.target as Node)) onClose()
    }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [onClose])

  function keys(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
    } else if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && !(event.target as Element).closest('input, select, textarea')) {
      event.preventDefault()
      onStep(event.key === 'ArrowLeft' ? -1 : 1)
    } else if (event.key === 'Tab') {
      const focusable = [...event.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE)]
      const first = focusable[0]
      const last = focusable.at(-1)
      const active = document.activeElement
      if (event.shiftKey && (active === first || active === event.currentTarget)) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first?.focus()
      }
    }
  }

  const art = loaded === undefined
    ? []
    : [loaded?.wiki_image_url, loaded?.image_url ?? item.image_url].filter((source): source is string => !!source)
  const sellOpen = canSell(item, context)
  const holding = rows([
    context.ownershipVerified && { label: t.sheet.owned, content: item.quantity > 0 ? `×${figure(item.quantity, t)}` : (context.missingLabel ?? t.card.missing) },
    item.rank !== undefined && { label: t.sheet.rank, content: item.max_rank === undefined ? figure(item.rank, t) : `${item.rank}/${item.max_rank}` },
    context.ownershipVerified && masteryOrder(item) !== 2 && { label: t.sheet.mastered, content: item.mastered ? <span className="sheet-yes">{t.sheet.yes}</span> : t.sheet.no },
    loaded?.mastery_req !== undefined && { label: t.sheet.masteryReq, content: <span className="sheet-mono">{loaded.mastery_req}</span> },
  ])
  const value = rows([
    item.platinum !== undefined && { label: t.sheet.platinum, content: <>
      <span className="value plat"><MetalMark metal="plat" alt={t.card.platinum}/><b>{item.platinum_ceiling === undefined ? figure(item.platinum, t) : `${item.platinum}–${item.platinum_ceiling}`}</b></span>
      <span className="sheet-note">{item.live ? t.sheet.checkedLive : t.sheet.dailySummary}</span>
    </> },
    item.monthly_trades !== undefined && { label: t.sheet.monthlySales, content: figure(item.monthly_trades, t) },
    item.ducats !== undefined && { label: t.sheet.ducats, content: <span className="value ducat"><MetalMark metal="ducat" alt={t.card.ducat}/><b>{figure(item.ducats, t)}</b></span> },
  ])

  return <aside ref={panel} className="sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} onKeyDown={keys}>
    <div className="sheet-bar">
      {/* Not `disabled`: a button that disables itself under focus drops focus out of the sheet. */}
      <button type="button" className="stamp sheet-icon" aria-label={t.sheet.previous} aria-disabled={index <= 0} onClick={() => onStep(-1)}><Icon name="previous"/></button>
      <span className="sheet-position">{t.sheet.position(index + 1, total)}</span>
      <button type="button" className="stamp sheet-icon" aria-label={t.sheet.next} aria-disabled={index >= total - 1} onClick={() => onStep(1)}><Icon name="next"/></button>
      <button type="button" className="stamp sheet-icon sheet-close" aria-label={t.sheet.close} onClick={onClose}><Icon name="close"/></button>
    </div>

    <div className="sheet-head">
      <h2 id={titleId} className="sheet-title">{item.name}</h2>
      <div className="tags">
        <span className="tag">{t.categories[item.category]}</span>
        {(loaded?.prime || item.category === 'prime_part') && <span className="tag">{t.sheet.prime}</span>}
        {loaded?.vaulted && <span className="tag">{t.sheet.vaulted}</span>}
      </div>
    </div>

    <SheetArt key={`${item.id}:${loaded === undefined ? 'loading' : 'loaded'}`} name={item.name} sources={art} fallback={loaded === undefined ? null : t.categories[item.category].slice(0, 2)}/>

    {loaded?.description && <p className="prose sheet-description">{loaded.description}</p>}
    {loaded === null && <p className="band-note">{t.sheet.unavailable}</p>}

    {holding.length > 0 && <SheetGroup title={t.sheet.holding} rows={holding}/>}

    {(value.length > 0 || sellOpen) && <SheetGroup title={t.sheet.market} rows={value}>
      {sellOpen && (selling
        ? <div className="sheet-sell"><SellForm item={item} listing={context.listedOrder ?? undefined} busy={context.busy} onSell={context.onSell} onUpdate={context.onUpdate} onDone={() => setSelling(false)}/></div>
        : <div className="sheet-row sheet-actions"><button type="button" className="stamp" disabled={context.busy} onClick={() => setSelling(true)}>{context.listedOrder ? t.card.sellMore : t.card.sell}</button></div>)}
    </SheetGroup>}

    {loaded && loaded.components.length > 0 && <SheetGroup title={t.sheet.components}>
        {loaded.components.map((component, slot) => {
          const known = component.held !== undefined
          const complete = known && (component.held ?? 0) >= component.count
          const face = <>
            <span className="sheet-component-name">
              <ComponentIcon key={component.image_url} source={component.image_url}/>
              {component.name}
            </span>
            <span className={complete ? 'sheet-held complete' : 'sheet-held'}>
              {component.held === undefined ? t.sheet.needed(component.count) : t.sheet.held(component.held, component.count)}
            </span>
          </>
          // What is still missing opens on its sources: that is the decision the sheet is for.
          return component.drops.length
            ? <details key={slot} className="sheet-component" open={known && !complete}>
              <summary>{face}</summary>
              <Drops drops={component.drops}/>
            </details>
            : <div key={slot} className="sheet-row sheet-component">{face}</div>
        })}
    </SheetGroup>}

    {loaded && loaded.drops.length > 0 && <SheetGroup title={t.sheet.obtainedIn}><Drops drops={loaded.drops}/></SheetGroup>}

    {loaded && loaded.abilities.length > 0 && <SheetGroup title={t.sheet.abilities}>
      {loaded.abilities.map(ability => <div key={ability.name} className="sheet-ability">
        <span>{ability.name}</span>
        {ability.description && <p className="prose">{ability.description}</p>}
      </div>)}
    </SheetGroup>}

    {loaded && loaded.stats.length > 0 && <SheetGroup title={t.sheet.stats} rows={loaded.stats.map(({ key, value }) => ({ label: t.sheet.statNames[key], content: <span className="sheet-mono">{statValue(key, value, t)}</span> }))}/>}

    {loaded?.builds_for && <Builds key={loaded.builds_for} name={loaded.builds_for}/>}

    {loaded && (loaded.introduced || loaded.wiki_url) && <SheetGroup>
      {loaded.introduced && <Row label={t.sheet.introduced}>
        {loaded.introduced.name}
        {loaded.introduced.date && <span className="sheet-note">{longDate(loaded.introduced.date, t)}</span>}
      </Row>}
      {loaded.wiki_url && <div className="sheet-row sheet-actions">
        <button type="button" className="link-button" onClick={() => { if (loaded.wiki_url) void openUrl(loaded.wiki_url) }}>{t.sheet.wiki}<Icon name="next"/></button>
      </div>}
    </SheetGroup>}
  </aside>
}

/** Overframe's best builds for the item, each opening on Overframe. */
function Builds({ name }: { name: string }) {
  const t = useMessages()
  // Undefined while Overframe is asked, null when it did not answer.
  const [builds, setBuilds] = useState<Build[] | null>()
  useEffect(() => {
    let live = true
    getItemBuilds(name).then(
      value => { if (live) setBuilds(value) },
      () => { if (live) setBuilds(null) },
    )
    return () => { live = false }
  }, [name])
  const state = builds === undefined ? t.sheet.buildsLoading : builds === null ? t.sheet.buildsUnavailable : builds.length ? null : t.sheet.noBuilds
  return <SheetGroup title={t.sheet.builds} note={t.sheet.buildsSource}>
    {state
      ? <div className="sheet-row sheet-note">{state}</div>
      : builds?.map(build => <button key={build.url} type="button" className="sheet-build" onClick={() => void openUrl(build.url)}>
        <span className="sheet-build-title">{build.title}</span>
        <span className="sheet-note">{[
          build.author && t.sheet.buildBy(build.author),
          t.sheet.buildScore(build.score),
          t.sheet.buildFormas(build.formas),
          t.sheet.buildUpdated(longDate(build.updated, t)),
        ].filter(Boolean).join(' · ')}</span>
        <Icon name="next"/>
      </button>)}
  </SheetGroup>
}

/** The wiki's render first, then WFCD's icon, then the category's letters: the next on each error. */
function SheetArt({ name, sources, fallback }: { name: string; sources: string[]; fallback: string | null }) {
  const [attempt, setAttempt] = useState(0)
  const source = sources[attempt]
  return <div className="sheet-art">
    {source
      ? <img src={source} alt={name} decoding="async" onError={() => setAttempt(attempt + 1)}/>
      : fallback && <span aria-hidden="true">{fallback}</span>}
  </div>
}

/** A broken icon leaves its empty well rather than the browser's broken-image mark. */
function ComponentIcon({ source }: { source?: string }) {
  const [failed, setFailed] = useState(false)
  return source && !failed
    ? <img src={source} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)}/>
    : <span className="sheet-component-blank" aria-hidden="true"/>
}

type RowSpec = { label: string; content: ReactNode }

/** The rows whose condition held. */
function rows(specs: Array<RowSpec | false>): RowSpec[] {
  return specs.filter((spec): spec is RowSpec => spec !== false)
}

/** A titled group: its label/value rows, then anything else it holds, then its footnote. */
function SheetGroup({ title, rows = [], note, children }: { title?: string; rows?: RowSpec[]; note?: string; children?: ReactNode }) {
  return <section className="sheet-section">
    {title && <h3 className="section-title">{title}</h3>}
    <div className="group">
      {rows.map(({ label, content }) => <Row key={label} label={label}>{content}</Row>)}
      {children}
    </div>
    {note && <p className="band-note">{note}</p>}
  </section>
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return <div className="sheet-row"><span className="sheet-label">{label}</span><span className="sheet-value">{children}</span></div>
}

function Drops({ drops }: { drops: DropSource[] }) {
  const t = useMessages()
  return <ul className="sheet-drops">
    {drops.map((drop, row) => <li key={row}>
      <span className="sheet-drop-place">{drop.location}{drop.vaulted && <span className="tag">{t.sheet.vaulted}</span>}</span>
      <span className="sheet-note">{[
        drop.rarity && t.sheet.rarity[drop.rarity],
        drop.chance !== undefined && t.sheet.chance(percent(drop.chance, t)),
      ].filter(Boolean).join(' · ')}</span>
    </li>)}
  </ul>
}

function percent(value: number, t: Messages): string {
  return new Intl.NumberFormat(t.locale, { style: 'percent', maximumFractionDigits: 2 }).format(value / 100)
}

/** The catalogue's base values: chances are fractions, times seconds. */
function statValue(key: StatKey, value: number, t: Messages): string {
  const number = (digits: number) => new Intl.NumberFormat(t.locale, { maximumFractionDigits: digits }).format(value)
  switch (key) {
    case 'critical_chance':
    case 'status_chance': return percent(value * 100, t)
    case 'critical_multiplier': return `${number(1)}×`
    case 'reload': return `${number(1)} s`
    case 'fire_rate':
    case 'sprint_speed':
    case 'damage': return number(2)
    default: return number(0)
  }
}
