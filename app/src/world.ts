import type { Era, Fissure, Rotation, WorldView } from './backend'

export const ERAS: readonly Era[] = ['lith', 'meso', 'neo', 'axi', 'requiem', 'omnia']
export const FISSURE_TABS = ['normal', 'steel', 'storms'] as const
export type FissureTab = typeof FISSURE_TABS[number]

/** One filter row; `null` is "any". */
export interface FissureFilter { era: Era | null; mission: string | null; planet: string | null }
export type FissureFilters = Record<FissureTab, FissureFilter[]>

export const ANY_FILTER: FissureFilter = { era: null, mission: null, planet: null }

/** A tab's fissures, soonest to close first, as the backend sorts them. */
export function fissuresOf(world: WorldView, tab: FissureTab): Fissure[] {
  if (tab === 'storms') return world.storms
  return world.fissures.filter(fissure => fissure.steel_path === (tab === 'steel'))
}

/** Shown when it matches at least one row, each field of a row either any or equal; no row is everything. */
export function matches(fissure: Fissure, rows: readonly FissureFilter[]): boolean {
  return rows.length === 0 || rows.some(row =>
    (row.era === null || row.era === fissure.era)
    && (row.mission === null || row.mission === fissure.mission_type)
    && (row.planet === null || row.planet === fissure.node.planet))
}

/** Every fissure open in `world` that is not in `seen` and matches its tab's filters. */
export function newMatches(world: WorldView, seen: ReadonlySet<string>, filters: FissureFilters): Fissure[] {
  return FISSURE_TABS.flatMap(tab => fissuresOf(world, tab).filter(fissure => !seen.has(fissure.id) && matches(fissure, filters[tab])))
}

/** Every id a world lists, fissures and storms. */
export function fissureIds(world: WorldView): string[] {
  return [...world.fissures, ...world.storms].map(fissure => fissure.id)
}

/** `1h 24m 33s`: the largest unit that is not zero, then every smaller one; never below zero. */
export function duration(milliseconds: number, units: { d: string; h: string; m: string; s: string }): string {
  let seconds = Math.max(0, Math.floor(milliseconds / 1000))
  const parts: Array<[number, string]> = [[86_400, units.d], [3600, units.h], [60, units.m], [1, units.s]]
  const out: string[] = []
  for (const [size, unit] of parts) {
    const count = Math.floor(seconds / size)
    seconds %= size
    if (count > 0 || out.length > 0 || size === 1) out.push(`${count}${unit}`)
  }
  return out.join(' ')
}

/** The next 00:00 UTC, when dailies reset. */
export function nextDailyReset(now: number): number {
  return (Math.floor(now / 86_400_000) + 1) * 86_400_000
}

/** What an endless mission counts its rewards in. */
export type EndlessUnit = 'minutes' | 'waves' | 'rounds' | 'drills' | 'zones' | 'crucibles' | 'squads' | 'exolizers' | 'ruptures' | 'orphix'

/**
 * The wiki's "Mission Rewards" summary: one reward each `every` units, in WFCD's mission names.
 * Disruption is left out, its rotation following defended conduits rather than a count.
 */
export const ENDLESS: ReadonlyArray<{ mission: string; every: number; unit: EndlessUnit }> = [
  { mission: 'Survival', every: 5, unit: 'minutes' },
  { mission: 'Defense', every: 3, unit: 'waves' },
  { mission: 'Interception', every: 1, unit: 'rounds' },
  { mission: 'Excavation', every: 1, unit: 'drills' },
  { mission: 'Sanctuary Onslaught', every: 2, unit: 'zones' },
  { mission: 'Mirror Defense', every: 2, unit: 'waves' },
  { mission: 'Infested Salvage', every: 1, unit: 'waves' },
  { mission: 'Defection', every: 2, unit: 'squads' },
  { mission: 'Alchemy', every: 1, unit: 'crucibles' },
  { mission: 'Orphix', every: 3, unit: 'orphix' },
  { mission: 'Void Cascade', every: 4, unit: 'exolizers' },
  { mission: 'Void Flood', every: 3, unit: 'ruptures' },
  { mission: 'Void Armageddon', every: 1, unit: 'rounds' },
]

/** The marks of one A-A-B-C loop: every 5 minutes is A at 5 and 10, B at 15, C at 20. */
export function rotationMarks(every: number): Array<{ rotation: Rotation; at: number[] }> {
  return [
    { rotation: 'A', at: [every, 2 * every] },
    { rotation: 'B', at: [3 * every] },
    { rotation: 'C', at: [4 * every] },
  ]
}
