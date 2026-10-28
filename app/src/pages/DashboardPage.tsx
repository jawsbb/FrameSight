import { useCallback, useEffect, useRef, useState } from 'react'
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification'
import { getWorldState, type CycleState, type Fissure, type Sortie, type WorldNode, type WorldView } from '../backend'
import { Icon, type IconName } from '../components/Icon'
import { useMessages, type Messages } from '../i18n'
import { readFissureAlerts, readFissureFilters, writeFissureAlerts, writeFissureFilters } from '../settings'
import { ANY_FILTER, ERAS, FISSURE_TABS, duration, fissureIds, fissuresOf, matches, newMatches, nextDailyReset, type FissureFilter, type FissureFilters, type FissureTab } from '../world'
import './DashboardPage.css'

/** How often the page asks again while it is on screen; the backend keeps an answer this long. */
const REFRESH_MS = 60_000

const stateIcons: Record<CycleState, IconName> = { day: 'sun', fass: 'sun', night: 'moon', vome: 'moon', warm: 'warm', cold: 'cold' }

function nodeLabel(node: WorldNode): string {
  return node.planet ? `${node.name} (${node.planet})` : node.name
}

function missionName(name: string, t: Messages): string {
  return t.dashboard.missions[name] ?? name
}

/** The clock the countdowns read, ticking each second while the page is open. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  return now
}

/**
 * The world state, asked for when the page opens and then each minute, or one second after the
 * next cycle change when that comes sooner so a state flips on time. Nothing is asked while the
 * page is not on screen.
 */
function useWorld() {
  const [world, setWorld] = useState<WorldView | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempts, setAttempts] = useState(0)
  const load = useCallback(() => {
    getWorldState()
      .then(next => { setWorld(next); setFailed(false) })
      .catch(() => setFailed(true))
      .finally(() => setAttempts(count => count + 1))
  }, [])
  useEffect(load, [load])
  useEffect(() => {
    if (attempts === 0) return
    const delay = Math.min(REFRESH_MS, ...(world?.cycles ?? []).map(cycle => cycle.expiry - Date.now() + 1000))
    const timer = setTimeout(load, Math.max(1000, delay))
    return () => clearTimeout(timer)
  }, [attempts, world, load])
  return { world, failed, load }
}

/**
 * A desktop notification for each refresh that brings fissures not seen before and matching their
 * tab's filters. The first answer only sets what has been seen, so opening the page never fires a
 * burst for what was already open.
 */
function useFissureAlerts(world: WorldView | null, filters: FissureFilters, on: boolean) {
  const t = useMessages()
  const seen = useRef<Set<string> | null>(null)
  useEffect(() => {
    if (!world) return
    const fresh = seen.current ? newMatches(world, seen.current, filters) : []
    seen.current = new Set(fissureIds(world))
    if (!on || !fresh.length) return
    const d = t.dashboard
    sendNotification({
      title: d.alerts.title(fresh.length),
      body: fresh.map(fissure => `${d.eras[fissure.era]} · ${missionName(fissure.mission_type, t)} · ${nodeLabel(fissure.node)}`).join('\n'),
    })
  }, [world, filters, on, t])
}

function Cycles({ world, now }: { world: WorldView; now: number }) {
  const d = useMessages().dashboard
  const units = d.units
  return <section className="world-section" aria-labelledby="world-cycles">
    <h2 id="world-cycles" className="section-title">{d.cycles}</h2>
    <ul className="world-cycles">
      {world.cycles.map(cycle => <li key={cycle.place} className="world-cycle">
        <span className="cycle-place">{d.places[cycle.place]}</span>
        <span className="cycle-state"><Icon name={stateIcons[cycle.state]}/>{d.states[cycle.state]}</span>
        <span className="cycle-left">{duration(cycle.expiry - now, units)}</span>
      </li>)}
    </ul>
  </section>
}

/** Every value a select can offer: those open now, plus the one a stored row already holds. */
function options(values: Array<string | null>, held: string | null): string[] {
  return [...new Set([...values, held].filter((value): value is string => value !== null))]
}

function FilterRow({ index, row, fissures, onChange, onRemove }: { index: number; row: FissureFilter; fissures: Fissure[]; onChange: (row: FissureFilter) => void; onRemove: () => void }) {
  const t = useMessages()
  const f = t.dashboard.filter
  const missions = options(fissures.map(fissure => fissure.mission_type), row.mission)
    .toSorted((left, right) => missionName(left, t).localeCompare(missionName(right, t), t.locale))
  const planets = options(fissures.map(fissure => fissure.node.planet), row.planet).toSorted((left, right) => left.localeCompare(right, t.locale))
  const pick = (value: string) => value === '' ? null : value
  return <div className="fissure-filter" role="group" aria-label={f.group(index + 1)}>
    <label className="select"><span>{f.era}</span>
      <select value={row.era ?? ''} onChange={event => onChange({ ...row, era: ERAS.find(era => era === event.target.value) ?? null })}>
        <option value="">{f.any}</option>
        {ERAS.map(era => <option key={era} value={era}>{t.dashboard.eras[era]}</option>)}
      </select>
    </label>
    <label className="select"><span>{f.mission}</span>
      <select value={row.mission ?? ''} onChange={event => onChange({ ...row, mission: pick(event.target.value) })}>
        <option value="">{f.any}</option>
        {missions.map(mission => <option key={mission} value={mission}>{missionName(mission, t)}</option>)}
      </select>
    </label>
    <label className="select"><span>{f.planet}</span>
      <select value={row.planet ?? ''} onChange={event => onChange({ ...row, planet: pick(event.target.value) })}>
        <option value="">{f.any}</option>
        {planets.map(planet => <option key={planet} value={planet}>{planet}</option>)}
      </select>
    </label>
    <button type="button" className="stamp sheet-icon" aria-label={f.remove(index + 1)} onClick={onRemove}><Icon name="close"/></button>
  </div>
}

function Fissures({ world, now, filters, onFilters, alerts, onAlerts, denied }: {
  world: WorldView; now: number; filters: FissureFilters; onFilters: (filters: FissureFilters) => void
  alerts: boolean; onAlerts: () => void; denied: boolean
}) {
  const t = useMessages()
  const d = t.dashboard
  const [tab, setTab] = useState<FissureTab>('normal')
  const all = fissuresOf(world, tab)
  const rows = filters[tab]
  const shown = all.filter(fissure => matches(fissure, rows))
  const setRows = (next: FissureFilter[]) => onFilters({ ...filters, [tab]: next })
  return <section className="world-section" aria-labelledby="world-fissures">
    <div className="world-head">
      <h2 id="world-fissures" className="section-title">{d.fissures}</h2>
      <button type="button" role="switch" aria-checked={alerts} className="display-switch" onClick={onAlerts} aria-describedby="fissure-alerts-note">
        <span className="display-face"><Icon name="bell"/>{d.alerts.label}</span>
        <span className="display-track" aria-hidden="true"><span className="display-thumb"/></span>
      </button>
    </div>
    <span id="fissure-alerts-note" hidden>{d.alerts.note}</span>
    {denied && <p className="band-note warn" role="alert">{d.alerts.denied}</p>}
    <div className="segmented" role="group" aria-label={d.tabsLabel}>
      {FISSURE_TABS.map(name => <button key={name} type="button" aria-pressed={tab === name} onClick={() => setTab(name)}>
        {d.tabs[name]} <span className="chip-count">{fissuresOf(world, name).length}</span>
      </button>)}
    </div>
    <div className="fissure-filters">
      {rows.map((row, index) => <FilterRow
        key={index}
        index={index}
        row={row}
        fissures={all}
        onChange={next => setRows(rows.map((old, at) => at === index ? next : old))}
        onRemove={() => setRows(rows.filter((_, at) => at !== index))}
      />)}
      <div className="fissure-filter-foot">
        <button type="button" className="stamp" onClick={() => setRows([...rows, ANY_FILTER])}><Icon name="plus"/>{d.filter.add}</button>
        {rows.length > 1 && <span className="band-note">{d.filter.note}</span>}
      </div>
    </div>
    <ul className="group fissure-list" aria-label={d.tabs[tab]}>
      {shown.length === 0 && <li className="world-empty">{d.noFissures}</li>}
      {shown.map(fissure => <li key={fissure.id} className="fissure-row">
        <span className="fissure-era"><Icon name="relics"/>{d.eras[fissure.era]}</span>
        <span className="world-label">
          {missionName(fissure.mission_type, t)}
          <span className="band-note">{[nodeLabel(fissure.node), fissure.node.enemy].filter(Boolean).join(' · ')}</span>
        </span>
        <span className="world-figure">{duration(fissure.expiry - now, d.units)}</span>
      </li>)}
    </ul>
  </section>
}

/** A sortie or archon hunt: who, against whom, the three missions, and how long it stays. */
function SortieRow({ title, sortie, now }: { title: string; sortie: Sortie | null; now: number }) {
  const t = useMessages()
  const d = t.dashboard
  if (!sortie) return <div className="world-row"><span className="world-label">{title}<span className="band-note">{d.none}</span></span></div>
  return <div className="world-row">
    <span className="world-label">
      {title}
      <span className="band-note">{[sortie.boss, sortie.faction].filter(Boolean).join(' · ')}</span>
      <ol className="world-missions">
        {sortie.missions.map((mission, index) => <li key={index}>{missionName(mission.mission_type, t)} <span className="band-note">{nodeLabel(mission.node)}</span></li>)}
      </ol>
    </span>
    <span className="world-figure">{duration(sortie.expiry - now, d.units)}</span>
  </div>
}

function Today({ world, now }: { world: WorldView; now: number }) {
  const d = useMessages().dashboard
  const { baro } = world
  return <section className="world-section" aria-labelledby="world-today">
    <h2 id="world-today" className="section-title">{d.today}</h2>
    <div className="group">
      <SortieRow title={d.sortie} sortie={world.sortie} now={now}/>
      <SortieRow title={d.archonHunt} sortie={world.archon_hunt} now={now}/>
      <div className="world-row">
        <span className="world-label">{d.baro}<span className="band-note">{baro ? nodeLabel(baro.relay) : d.none}</span></span>
        {baro && <span className="world-figure">{now < baro.activation
          ? d.baroArrives(duration(baro.activation - now, d.units))
          : d.baroLeaves(duration(baro.expiry - now, d.units))}</span>}
      </div>
      <div className="world-row">
        <span className="world-label">{d.dailyReset}<span className="band-note">{d.dailyResetNote}</span></span>
        <span className="world-figure">{duration(nextDailyReset(now) - now, d.units)}</span>
      </div>
    </div>
  </section>
}

/**
 * What a player wants on logging in, read from the game's own world state: the open-world cycles,
 * the void fissures (filtered, with an optional notification for new ones) and today's rotations.
 */
export function DashboardPage() {
  const d = useMessages().dashboard
  const now = useNow()
  const { world, failed, load } = useWorld()
  const [filters, setFilters] = useState(readFissureFilters)
  const [alerts, setAlerts] = useState(readFissureAlerts)
  const [denied, setDenied] = useState(false)
  useFissureAlerts(world, filters, alerts)

  function changeFilters(next: FissureFilters) {
    setFilters(next)
    writeFissureFilters(next)
  }

  async function toggleAlerts() {
    let granted = false
    if (!alerts) {
      try {
        granted = await isPermissionGranted() || await requestPermission() === 'granted'
      } catch {
        granted = false
      }
      setDenied(!granted)
    }
    setAlerts(granted)
    writeFissureAlerts(granted)
  }

  const age = duration(now - (world?.fetched_at ?? now), d.units)
  return <section className="page" aria-labelledby="dashboard-title">
    <div className="page-head">
      <h1 id="dashboard-title" className="page-title">{d.title}</h1>
    </div>
    {!world
      ? failed ? <p className="error-banner" role="alert">{d.failed}</p> : <p className="band-note" role="status">{d.loading}</p>
      : <>
        <Cycles world={world} now={now}/>
        <div className="world-columns">
          <Fissures world={world} now={now} filters={filters} onFilters={changeFilters} alerts={alerts} onAlerts={() => void toggleAlerts()} denied={denied}/>
          <Today world={world} now={now}/>
        </div>
      </>}
    <div className="world-foot">
      {world && <p className={world.stale ? 'band-note warn' : 'band-note'}>{world.stale ? d.stale(age) : d.fetched(age)}</p>}
      <button type="button" className="stamp" onClick={load}><Icon name="refresh"/>{d.refresh}</button>
    </div>
  </section>
}
