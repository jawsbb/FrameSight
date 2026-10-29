import { describe, expect, it } from 'vitest'
import type { Fissure, WorldView } from './backend'
import { duration, matches, newMatches, nextDailyReset, rotationMarks } from './world'

const units = { d: 'd', h: 'h', m: 'm', s: 's' }
const fissure = (id: string, overrides: Partial<Fissure> = {}): Fissure => ({
  id, era: 'axi', mission_type: 'Capture', node: { name: 'Brugia', planet: 'Eris', enemy: 'Infested' }, steel_path: false, expiry: 0, ...overrides,
})
const world = (fissures: Fissure[], storms: Fissure[] = []): WorldView => ({
  cycles: [], fissures, storms, sortie: null, archon_hunt: null, baro: null, bounties: [], fetched_at: 0, stale: false,
})

describe('duration', () => {
  it('starts at the largest unit that is not zero and keeps every smaller one', () => {
    expect(duration((3600 + 24 * 60 + 33) * 1000, units)).toBe('1h 24m 33s')
    expect(duration((20 * 60 + 43) * 1000 + 999, units)).toBe('20m 43s')
    expect(duration(3600 * 1000, units)).toBe('1h 0m 0s')
    expect(duration((2 * 86_400 + 5) * 1000, units)).toBe('2d 0h 0m 5s')
    expect(duration(400, units)).toBe('0s')
    expect(duration(-5000, units), 'past is zero').toBe('0s')
  })
})

describe('filters', () => {
  const capture = fissure('a')
  it('show everything with no row, and what any one row accepts otherwise', () => {
    expect(matches(capture, [])).toBe(true)
    expect(matches(capture, [{ era: 'lith', mission: null, planet: null }])).toBe(false)
    expect(matches(capture, [{ era: 'lith', mission: null, planet: null }, { era: null, mission: 'Capture', planet: 'Eris' }])).toBe(true)
    expect(matches(capture, [{ era: 'axi', mission: 'Capture', planet: 'Mars' }])).toBe(false)
  })

  it('find only fissures not seen before that match their own tab', () => {
    const next = world([capture, fissure('b', { era: 'lith' }), fissure('c', { steel_path: true })], [fissure('d', { era: 'neo' })])
    const filters = { normal: [{ era: 'lith' as const, mission: null, planet: null }], steel: [], storms: [{ era: 'axi' as const, mission: null, planet: null }] }
    expect(newMatches(next, new Set(['a']), filters).map(found => found.id)).toEqual(['b', 'c'])
    expect(newMatches(next, new Set(['a', 'b', 'c', 'd']), filters)).toEqual([])
  })
})

describe('daily reset', () => {
  it('is the next midnight UTC', () => {
    expect(nextDailyReset(Date.UTC(2026, 9, 28, 17, 0, 14))).toBe(Date.UTC(2026, 9, 29))
    expect(nextDailyReset(Date.UTC(2026, 9, 29))).toBe(Date.UTC(2026, 9, 30))
  })
})

describe('rotationMarks', () => {
  it('lays one A-A-B-C loop on the reward interval', () => {
    expect(rotationMarks(5)).toEqual([
      { rotation: 'A', at: [5, 10] },
      { rotation: 'B', at: [15] },
      { rotation: 'C', at: [20] },
    ])
  })
})
