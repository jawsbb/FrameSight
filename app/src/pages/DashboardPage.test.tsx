import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Fissure, WorldView } from '../backend'

const backend = vi.hoisted(() => ({ getWorldState: vi.fn() }))
const notification = vi.hoisted(() => ({ isPermissionGranted: vi.fn(), requestPermission: vi.fn(), sendNotification: vi.fn() }))
vi.mock('../backend', () => backend)
vi.mock('@tauri-apps/plugin-notification', () => notification)

import { MessagesContext } from '../i18n'
import { fr } from '../i18n/fr'
import { DashboardPage } from './DashboardPage'

/** 2026-10-28T17:00:14Z. */
const NOW = Date.UTC(2026, 9, 28, 17, 0, 14)
const seconds = (count: number) => NOW + count * 1000

const fissure = (id: string, era: Fissure['era'], mission_type: string, name: string, planet: string, left: number, steel_path = false): Fissure => ({
  id, era, mission_type, node: { name, planet, enemy: 'Grineer' }, steel_path, expiry: seconds(left),
})
const world: WorldView = {
  cycles: [
    { place: 'earth', state: 'night', expiry: seconds(3600 + 24 * 60 + 33) },
    { place: 'cetus', state: 'night', expiry: seconds(20 * 60 + 43) },
    { place: 'vallis', state: 'cold', expiry: seconds(18 * 60 + 21) },
    { place: 'cambion', state: 'vome', expiry: seconds(20 * 60 + 43) },
  ],
  fissures: [
    fissure('defense', 'lith', 'Defense', 'Casta', 'Ceres', 54 * 60 + 56),
    fissure('survival', 'axi', 'Survival', 'Nimus', 'Eris', 82 * 60),
    fissure('mobile', 'neo', 'Mobile Defense', 'Eurasia', 'Earth', 93 * 60, true),
  ],
  storms: [fissure('storm', 'meso', 'Skirmish', 'Ogal Cluster', 'Earth', 40 * 60)],
  sortie: {
    boss: 'Nef Anyo', faction: 'Corpus', expiry: seconds(7 * 3600),
    missions: [
      { mission_type: 'Survival', node: { name: 'Tycho', planet: 'Lua', enemy: 'Corpus' } },
      { mission_type: 'Spy', node: { name: 'Hydra', planet: 'Pluto', enemy: 'Corpus' } },
      { mission_type: 'Assassination', node: { name: 'Iliad', planet: 'Phobos', enemy: 'Corpus' } },
    ],
  },
  archon_hunt: { boss: 'Archon Nira', faction: 'Narmer', expiry: seconds(4 * 86_400), missions: [{ mission_type: 'Rescue', node: { name: 'Carme', planet: 'Jupiter', enemy: 'Corpus' } }] },
  baro: { activation: seconds(2 * 86_400), expiry: seconds(4 * 86_400), relay: { name: 'Larunda Relay', planet: 'Mercury', enemy: null } },
  fetched_at: seconds(-12),
  stale: false,
}

const list = () => screen.getByRole('list', { name: /Normal|Steel Path|Void storms/ })
const shown = () => within(list()).queryAllByRole('listitem').map(row => row.textContent)
const settle = () => act(async () => {})

describe('Dashboard', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: NOW })
    vi.clearAllMocks()
    localStorage.clear()
    backend.getWorldState.mockResolvedValue(world)
    notification.isPermissionGranted.mockResolvedValue(true)
  })
  afterEach(() => { cleanup(); vi.useRealTimers() })

  it('counts each cycle down every second, from the expiry it was given', async () => {
    render(<DashboardPage/>)
    await settle()
    const cycles = screen.getByRole('region', { name: 'Cycles' })
    const tiles = within(cycles).getAllByRole('listitem').map(tile => tile.textContent)
    expect(tiles).toEqual(['EarthNight1h 24m 33s', 'CetusNight20m 43s', 'Orb VallisCold18m 21s', 'Cambion DriftVome20m 43s'])
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect(within(cycles).getAllByRole('listitem')[0]).toHaveTextContent('1h 24m 32s')
    expect(backend.getWorldState).toHaveBeenCalledOnce()
  })

  it('asks again each minute, and not in between', async () => {
    render(<DashboardPage/>)
    await settle()
    await act(async () => { await vi.advanceTimersByTimeAsync(59_000) })
    expect(backend.getWorldState).toHaveBeenCalledOnce()
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect(backend.getWorldState).toHaveBeenCalledTimes(2)
  })

  it('puts fissures under their tab, soonest first, and storms under their own', async () => {
    render(<DashboardPage/>)
    await settle()
    expect(shown()).toEqual(['LithDefenseCasta (Ceres) · Grineer54m 56s', 'AxiSurvivalNimus (Eris) · Grineer1h 22m 0s'])
    fireEvent.click(screen.getByRole('button', { name: /Steel Path/ }))
    expect(screen.getByRole('button', { name: /Steel Path/ })).toHaveAttribute('aria-pressed', 'true')
    expect(shown()).toEqual(['NeoMobile DefenseEurasia (Earth) · Grineer1h 33m 0s'])
    fireEvent.click(screen.getByRole('button', { name: /Void storms/ }))
    expect(shown()).toEqual(['MesoSkirmishOgal Cluster (Earth) · Grineer40m 0s'])
  })

  it('stacks filter rows, shows what any row matches, and keeps them for next time', async () => {
    const { unmount } = render(<DashboardPage/>)
    await settle()
    fireEvent.click(screen.getByRole('button', { name: 'Add a filter' }))
    fireEvent.change(within(screen.getByRole('group', { name: 'Filter 1' })).getByRole('combobox', { name: 'Era' }), { target: { value: 'axi' } })
    expect(shown()).toEqual(['AxiSurvivalNimus (Eris) · Grineer1h 22m 0s'])

    fireEvent.click(screen.getByRole('button', { name: 'Add a filter' }))
    const second = screen.getByRole('group', { name: 'Filter 2' })
    // A select offers what is open now: two missions and two planets in Normal.
    expect(within(second).getAllByRole('option').map(option => option.textContent)).toEqual([
      'Any', 'Lith', 'Meso', 'Neo', 'Axi', 'Requiem', 'Omnia', 'Any', 'Defense', 'Survival', 'Any', 'Ceres', 'Eris',
    ])
    fireEvent.change(within(second).getByRole('combobox', { name: 'Planet' }), { target: { value: 'Ceres' } })
    expect(shown()).toHaveLength(2)
    expect(screen.getByText('A fissure shows when it matches any one filter.')).toBeInTheDocument()

    unmount()
    render(<DashboardPage/>)
    await settle()
    expect(within(screen.getByRole('group', { name: 'Filter 1' })).getByRole('combobox', { name: 'Era' })).toHaveValue('axi')
    expect(within(screen.getByRole('group', { name: 'Filter 2' })).getByRole('combobox', { name: 'Planet' })).toHaveValue('Ceres')
    fireEvent.click(screen.getByRole('button', { name: 'Remove filter 1' }))
    expect(shown()).toEqual(['LithDefenseCasta (Ceres) · Grineer54m 56s'])
    // Steel Path keeps its own rows: none, so everything.
    fireEvent.click(screen.getByRole('button', { name: /Steel Path/ }))
    expect(shown()).toHaveLength(1)
    expect(JSON.parse(localStorage.getItem('tennoscope.fissure-filters') ?? '{}').normal).toEqual([{ era: null, mission: null, planet: 'Ceres' }])
  })

  it('says when no open fissure matches', async () => {
    localStorage.setItem('tennoscope.fissure-filters', JSON.stringify({ normal: [{ era: 'requiem' }] }))
    render(<DashboardPage/>)
    await settle()
    expect(shown()).toEqual(['No open fissure matches these filters.'])
  })

  it('notifies a new matching fissure only, never what was open when the page opened', async () => {
    localStorage.setItem('tennoscope.fissure-filters', JSON.stringify({ normal: [{ era: 'axi' }] }))
    localStorage.setItem('tennoscope.fissure-alerts', 'true')
    render(<DashboardPage/>)
    await settle()
    expect(screen.getByRole('switch', { name: 'Notify new fissures' })).toHaveAttribute('aria-checked', 'true')
    // Open at startup and matching, but already there: no burst.
    expect(notification.sendNotification).not.toHaveBeenCalled()

    backend.getWorldState.mockResolvedValue({
      ...world,
      fissures: [...world.fissures, fissure('new-axi', 'axi', 'Capture', 'Brugia', 'Eris', 3600), fissure('new-lith', 'lith', 'Capture', 'Ukko', 'Void', 3600)],
    })
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000) })
    expect(notification.sendNotification).toHaveBeenCalledOnce()
    expect(notification.sendNotification).toHaveBeenCalledWith({ title: 'New void fissure', body: 'Axi · Capture · Brugia (Eris)' })

    // The same fissures again are not new.
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000) })
    expect(notification.sendNotification).toHaveBeenCalledOnce()
  })

  it('is off by default, asks the system when turned on, and stays off if refused', async () => {
    notification.isPermissionGranted.mockResolvedValue(false)
    notification.requestPermission.mockResolvedValue('denied')
    render(<DashboardPage/>)
    await settle()
    const bell = screen.getByRole('switch', { name: 'Notify new fissures' })
    expect(bell).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(bell)
    await settle()
    expect(notification.requestPermission).toHaveBeenCalledOnce()
    expect(bell).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('alert')).toHaveTextContent('The system refused notifications to TennoScope.')
    expect(localStorage.getItem('tennoscope.fissure-alerts')).toBe('false')

    notification.requestPermission.mockResolvedValue('granted')
    fireEvent.click(bell)
    await settle()
    expect(bell).toHaveAttribute('aria-checked', 'true')
    expect(localStorage.getItem('tennoscope.fissure-alerts')).toBe('true')
  })

  it('lists the sortie, the archon hunt, Baro and the daily reset', async () => {
    render(<DashboardPage/>)
    await settle()
    const today = screen.getByRole('region', { name: 'Today' })
    expect(today).toHaveTextContent(/SortieNef Anyo · CorpusSurvival Tycho \(Lua\)Spy Hydra \(Pluto\)Assassination Iliad \(Phobos\)7h 0m 0s/)
    expect(today).toHaveTextContent(/Archon huntArchon Nira · NarmerRescue Carme \(Jupiter\)4d 0h 0m 0s/)
    expect(today).toHaveTextContent(/Baro Ki’TeerLarunda Relay \(Mercury\)Arrives in 2d 0h 0m 0s/)
    expect(today).toHaveTextContent(/Daily resetAt 00:00 UTC6h 59m 46s/)
  })

  it('says how old the data is, and falls back to the last state when the game does not answer', async () => {
    render(<DashboardPage/>)
    await settle()
    expect(screen.getByText('Game data, 12s ago')).toBeInTheDocument()
    cleanup()

    backend.getWorldState.mockResolvedValue({ ...world, fetched_at: seconds(-120), stale: true })
    render(<DashboardPage/>)
    await settle()
    expect(screen.getByText('The game’s servers did not answer; this is the data from 2m 0s ago.')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Cycles' })).toBeInTheDocument()
    cleanup()

    backend.getWorldState.mockRejectedValue('The game\'s world state could not be reached')
    render(<DashboardPage/>)
    await settle()
    expect(screen.getByRole('alert')).toHaveTextContent('The game’s world state could not be reached.')
    backend.getWorldState.mockResolvedValue(world)
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    await settle()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Cycles' })).toBeInTheDocument()
  })

  it('speaks French', async () => {
    render(<MessagesContext value={fr}><DashboardPage/></MessagesContext>)
    await settle()
    expect(within(screen.getByRole('region', { name: 'Cycles' })).getAllByRole('listitem').map(tile => tile.textContent))
      .toEqual(['TerreNuit1h 24m 33s', 'CetusNuit20m 43s', 'Vallée OrbFroid18m 21s', 'Cambion DriftVome20m 43s'])
    expect(screen.getByRole('region', { name: 'Fissures du Néant' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Route de l’Acier/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Tempêtes du Néant/ })).toBeInTheDocument()
    expect(within(screen.getByRole('list', { name: 'Normal' })).getByText('Survie')).toBeInTheDocument()
    expect(screen.getByText('Données du jeu, il y a 12s')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Aujourd’hui' })).toHaveTextContent(/Arrive dans 2j 0h 0m 0s/)
  })
})
