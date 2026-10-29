import { useCallback, useEffect, useRef, useState } from 'react'
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification'
import { getWorldState, type Bounty, type Cycle, type CycleState, type Era, type Fissure, type Hub, type Sortie, type WorldNode, type WorldView } from '../backend'
import { Icon, type IconName } from '../components/Icon'
import { useMessages, type Messages } from '../i18n'
import { readFissureAlerts, readFissureFilters, writeFissureAlerts, writeFissureFilters } from '../settings'
import { ANY_FILTER, ENDLESS, ERAS, FISSURE_TABS, duration, fissureIds, fissuresOf, matches, newMatches, nextDailyReset, rotationMarks, type FissureFilter, type FissureFilters, type FissureTab } from '../world'
import './DashboardPage.css'

/** How often the page asks again while it is on screen; the backend keeps an answer this long. */
const REFRESH_MS = 60_000

const stateIcons: Record<CycleState, IconName> = { day: 'sun', fass: 'sun', night: 'moon', vome: 'moon', warm: 'warm', cold: 'cold' }

/** Pictures from the Warframe wiki, the source the item sheet already draws from. */
function wikiImage(file: string, width: number): string {
  return `https://wiki.warframe.com/w/Special:FilePath/${encodeURIComponent(file)}?width=${width}`
}

const eraImages: Record<Era, string> = {
  lith: 'LithRelicIntact.png', meso: 'MesoRelicIntact.png', neo: 'NeoRelicIntact.png',
  axi: 'AxiRelicIntact.png', requiem: 'RequiemRelicIntact.png', omnia: 'VoidRelicGoldIcon64.png',
}

/** Keyed by the faction names the node and sortie catalogs use; a faction missing here shows no mark. */
const factionImages: Record<string, string> = {
  Grineer: 'GrineerIconColor.png', Corpus: 'CorpusIconColor.png',
  Infested: 'InfestedIconColor.png', Infestation: 'InfestedIconColor.png',
  Orokin: 'OrokinIconColor.png', Corrupted: 'OrokinIconColor.png',
  Sentient: 'SentientFactionIcon(xWhite).png', 'The Murmur': 'MurmurIcon(xWhite).png',
  Narmer: 'NarmerEyeSigil(SxWhite).png',
}

const hubImages: Record<Hub, string> = { cetus: 'PlainsofEidolonScene.png', vallis: 'OrbVallisScene.png', cambion: 'DeimosCambionDriftScene.png' }

function cycleImage(cycle: Cycle): string {
  if (cycle.place !== 'earth') return hubImages[cycle.place]
  return cycle.state === 'night' ? 'EarthTileNight1.png' : 'EarthTileDay1.png'
}

/** A decorative wiki picture that steps aside when it does not load, offline for one. */
function WikiArt({ file, width, className }: { file: string; width: number; className: string }) {
  const [failed, setFailed] = useState(false)
  if (failed) return null
  return <img className={className} src={wikiImage(file, width)} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)}/>
}

function FactionMark({ faction }: { faction: string | null }) {
  const file = faction ? factionImages[faction] : undefined
  return file ? <WikiArt key={file} file={file} width={32} className="faction-mark"/> : null
}

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
      {world.cycles.map(cycle => <li key={cycle.place} className="world-cycle" data-state={cycle.state}>
        <WikiArt key={cycleImage(cycle)} file={cycleImage(cycle)} width={480} className="cycle-art"/>
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
        <span className="fissure-era"><WikiArt key={fissure.era} file={eraImages[fissure.era]} width={64} className="relic-art"/>{d.eras[fissure.era]}</span>
        <span className="world-label">
          {missionName(fissure.mission_type, t)}
          <span className="band-note world-where"><FactionMark faction={fissure.node.enemy}/>{[nodeLabel(fissure.node), fissure.node.enemy].filter(Boolean).join(' · ')}</span>
        </span>
        <span className="world-figure">{duration(fissure.expiry - now, d.units)}</span>
      </li>)}
    </ul>
  </section>
}

/** A sortie or archon hunt: who, against whom, the three missions, and how long it stays. */
function SortieRow({ title, art, sortie, now }: { title: string; art: string; sortie: Sortie | null; now: number }) {
  const t = useMessages()
  const d = t.dashboard
  const badge = <span className="world-badge"><WikiArt file={art} width={64} className="badge-art"/></span>
  if (!sortie) return <div className="world-row">{badge}<span className="world-label">{title}<span className="band-note">{d.none}</span></span></div>
  return <div className="world-row">
    {badge}
    <span className="world-label">
      {title}
      <span className="band-note world-where"><FactionMark faction={sortie.faction}/>{[sortie.boss, sortie.faction].filter(Boolean).join(' · ')}</span>
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
      <SortieRow title={d.sortie} art="Sortie(xWhite).png" sortie={world.sortie} now={now}/>
      <SortieRow title={d.archonHunt} art="ArchonHunter(xWhite).png" sortie={world.archon_hunt} now={now}/>
      <div className="world-row">
        <span className="world-badge"><WikiArt file="BaroKi'TeerGlyph.png" width={96} className="badge-art portrait"/></span>
        <span className="world-label">{d.baro}<span className="band-note">{baro ? nodeLabel(baro.relay) : d.none}</span></span>
        {baro && <span className="world-figure">{now < baro.activation
          ? d.baroArrives(duration(baro.activation - now, d.units))
          : d.baroLeaves(duration(baro.expiry - now, d.units))}</span>}
      </div>
      <div className="world-row">
        <span className="world-badge"><Icon name="refresh"/></span>
        <span className="world-label">{d.dailyReset}<span className="band-note">{d.dailyResetNote}</span></span>
        <span className="world-figure">{duration(nextDailyReset(now) - now, d.units)}</span>
      </div>
    </div>
  </section>
}

/** One tier's level range beside its table's letter. */
function TierTag({ bounty }: { bounty: Bounty }) {
  const b = useMessages().dashboard.bounties
  return <span className="tag rotation-tier" aria-label={b.tier(bounty.min_level, bounty.max_level, bounty.rotation)}>
    <span aria-hidden="true">{bounty.min_level}–{bounty.max_level}</span>
    <b aria-hidden="true">{bounty.rotation}</b>
  </span>
}

/** Each open world's bounty tiers and the table each pays from, until the cycle turns. */
function Bounties({ world, now }: { world: WorldView; now: number }) {
  const d = useMessages().dashboard
  const b = d.bounties
  const ends = Math.min(...world.bounties.map(bounty => bounty.expiry))
  return <section className="world-section" aria-labelledby="world-bounties">
    <div className="world-head">
      <h2 id="world-bounties" className="section-title">{b.title}</h2>
      {world.bounties.length > 0 && <span className="band-note world-figure">{b.changes(duration(ends - now, d.units))}</span>}
    </div>
    <div className="group">
      {world.bounties.length === 0 && <p className="world-empty">{b.none}</p>}
      {/* The backend sorts by hub, then field before vault, then level. */}
      {[...new Set(world.bounties.map(bounty => bounty.hub))].map(hub => <div key={hub} className="world-row">
        <span className="world-badge"><WikiArt file={hubImages[hub]} width={96} className="badge-art portrait"/></span>
        <span className="world-label">
          {d.places[hub]}
          {[false, true].map(vault => {
            const tiers = world.bounties.filter(bounty => bounty.hub === hub && bounty.vault === vault)
            return tiers.length > 0 && <span key={String(vault)} className="rotation-tiers">
              {vault && <span className="band-note">{b.vault}</span>}
              {tiers.map(bounty => <TierTag key={`${bounty.min_level}-${bounty.max_level}`} bounty={bounty}/>)}
            </span>
          })}
        </span>
      </div>)}
    </div>
    <p className="band-note">{b.note}</p>
  </section>
}

/** The wiki's reward intervals: when A, B and C fall in each endless mission. */
function EndlessRotations() {
  const t = useMessages()
  const e = t.dashboard.endless
  return <section className="world-section" aria-labelledby="world-endless">
    <h2 id="world-endless" className="section-title">{e.title}</h2>
    <dl className="group rotation-list">
      {ENDLESS.map(({ mission, every, unit }) => <div key={mission} className="rotation-row">
        <dt>{missionName(mission, t)}</dt>
        <dd>{rotationMarks(every).map(mark => <span key={mark.rotation} className="rotation-mark"><b>{mark.rotation}</b> {mark.at.join(' · ')}</span>)}<span className="band-note">{e.units[unit]}</span></dd>
      </div>)}
      <div className="rotation-row"><dt>{e.arbitration}</dt><dd>{e.arbitrationPattern}</dd></div>
      <div className="rotation-row"><dt>{e.caches}</dt><dd>{e.cachesPattern}</dd></div>
    </dl>
    <p className="band-note">{e.note}</p>
  </section>
}

/**
 * What a player wants on logging in, read from the game's own world state: the open-world cycles,
 * the void fissures (filtered, with an optional notification for new ones), today's rotations, the
 * bounty tables running now and the wiki's endless reward intervals.
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
          <div className="world-stack">
            <Today world={world} now={now}/>
            <Bounties world={world} now={now}/>
            <EndlessRotations/>
          </div>
        </div>
      </>}
    <div className="world-foot">
      {world && <p className={world.stale ? 'band-note warn' : 'band-note'}>{world.stale ? d.stale(age) : d.fetched(age)}</p>}
      <button type="button" className="stamp" onClick={load}><Icon name="refresh"/>{d.refresh}</button>
    </div>
  </section>
}
