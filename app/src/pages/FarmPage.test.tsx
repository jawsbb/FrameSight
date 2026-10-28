import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppView, FarmView } from '../backend'

const backend = vi.hoisted(() => ({ getFarm: vi.fn(), marketItemHistory: vi.fn() }))
vi.mock('../backend', () => backend)

import { FarmPage } from './FarmPage'
import { MessagesContext, catalogs } from '../i18n'

const SERRATION = '/Lotus/Upgrades/Mods/Rifle/WeaponDamageAmountMod'

function view(link: 'linked' | 'unlinked' = 'linked'): AppView {
  return {
    collection: {
      items: [{ id: SERRATION, name: 'Serration', category: 'mod', quantity: 4, mastered: false, live: false, priceable: true, platinum: 30, monthly_trades: 90 }],
      total_entries: 1,
      snapshot: { observed_at: 1, game_build: 'b', source: 'test' },
    },
    mastery: { available: false, items: [], totals: [] },
    reward: { cards: [], best_value_index: null, best_ducat_index: null },
    market_account: { link, orders: [], listed_platinum: 0, flagged: 0, listable: [SERRATION], presence: { status: null, wanted: null, auto: false } },
    health: { catalog: { state: 'ready', message: 'ok', last_success: '1' }, collection_prices: { state: 'ready', message: 'ok', last_success: '2026-10-27' } },
  } as unknown as AppView
}

const farm: FarmView = {
  prices_date: '2026-10-27',
  earlier_date: '2026-10-20',
  drops: true,
  relic_tables: true,
  sell: [
    { id: SERRATION, name: 'Serration', quantity: 4, platinum: 30, monthly_trades: 90, value: 120, pace: 'fast', change: 0.25, market: 'Serration' },
    { id: '/scan', name: 'Scan Matter', quantity: 5, platinum: 240, monthly_trades: null, value: 0, pace: 'slow', change: null, market: 'Scan Matter' },
  ],
  open: [{ id: '/lith', name: 'Lith T1', refinement: 'radiant', quantity: 3, vaulted: true, value: 11.6, pace: 'fair', change: -0.1, market: 'Lith T1 Relic (Radiant)' }],
  farm: [{
    location: 'Void/Mot (Survival), Rotation C', value: 2.3, pace: 'fast',
    drops: [
      { name: 'Lith T1 Relic', chance: 20, unit: 11.6, value: 2.3, relic: true, monthly_trades: 120, change: 0.05 },
      { name: 'Serration', chance: 0.5, unit: 30, value: 0.15, relic: false, monthly_trades: 90, change: 0.25 },
    ],
  }],
  trends: [
    { name: 'Primed Cleanse Orokin', change: 1.5, platinum: 50, monthly_trades: 240, held: 0 },
    { name: 'Serration', change: 0.25, platinum: 30, monthly_trades: 90, held: 4 },
  ],
}

function show(data: FarmView, { mode = 'full', link = 'linked', language = 'en' }: { mode?: 'full' | 'companion'; link?: 'linked' | 'unlinked'; language?: 'en' | 'fr' } = {}) {
  backend.getFarm.mockResolvedValue(data)
  const onSell = vi.fn(() => Promise.resolve())
  render(<MessagesContext value={catalogs[language]}>
    <FarmPage view={view(link)} effectiveMode={mode} onSell={onSell} onUpdate={vi.fn(() => Promise.resolve())} ordersBusy={false}/>
  </MessagesContext>)
  return { onSell }
}

describe('Farm & sales page', () => {
  beforeEach(() => { backend.getFarm.mockReset(); backend.marketItemHistory.mockReset() })
  afterEach(cleanup)

  it('ranks selling, opening and farming in three blocks, each in its own unit', async () => {
    show(farm)
    const sell = await screen.findByRole('list', { name: 'Sell' })
    expect(within(sell).getByRole('button', { name: 'Show the curve of 4 × Serration' })).toBeInTheDocument()
    expect(within(sell).getByText('+25%')).toBeInTheDocument()
    // The dear stack nobody buys is not hidden: it sinks and says why.
    expect(within(sell).getByText('Sells slowly')).toBeInTheDocument()
    const open = screen.getByRole('list', { name: 'Open' })
    expect(within(open).getByText('≈ 11.6')).toBeInTheDocument()
    expect(within(open).getByText('per opening')).toBeInTheDocument()
    expect(within(open).getByText('Vaulted')).toBeInTheDocument()
    const places = screen.getByRole('list', { name: 'Farm' })
    expect(within(places).getByText('Void/Mot (Survival), Rotation C')).toBeInTheDocument()
    expect(within(places).getByText('per run')).toBeInTheDocument()
    // The trend and the chart say what they measure.
    expect(screen.getByText('+150%')).toBeInTheDocument()
    expect(screen.getByText('per run, best place')).toBeInTheDocument()
    expect(screen.getByText(/Prices of 27 Oct · 7-day change against 20 Oct/)).toBeInTheDocument()
  })

  it('opens the sell form from a Sell row', async () => {
    const user = userEvent.setup()
    show(farm)
    await user.click(await screen.findByRole('button', { name: 'List for sale' }))
    expect(screen.getByRole('form', { name: 'List Serration for sale' })).toBeInTheDocument()
  })

  it('offers no listing without a linked account, and says how to get one', async () => {
    show(farm, { link: 'unlinked' })
    await screen.findByRole('list', { name: 'Sell' })
    expect(screen.queryByRole('button', { name: 'List for sale' })).not.toBeInTheDocument()
    expect(screen.getByText(/Link warframe.market on the Orders page/)).toBeInTheDocument()
  })

  it('asks for Full access to sell and open, and still farms without it', async () => {
    const user = userEvent.setup()
    show(farm, { mode: 'companion' })
    await screen.findByRole('list', { name: 'Farm' })
    expect(screen.getAllByRole('heading', { name: 'Needs Full access' })).toHaveLength(2)
    expect(screen.queryByRole('list', { name: 'Sell' })).not.toBeInTheDocument()
    await user.click(within(screen.getByRole('group', { name: 'Chart' })).getByRole('button', { name: 'Sell' }))
    expect(screen.getAllByText('Needs Full access')).toHaveLength(3)
  })

  it('says prices have not loaded rather than ranking on nothing', async () => {
    show({ ...farm, prices_date: null, earlier_date: null, sell: [], open: [], farm: [], trends: [] })
    expect(await screen.findByText(/Prices have not loaded yet/)).toBeInTheDocument()
    expect(screen.getAllByText('Ranked once prices load.')).toHaveLength(3)
    expect(screen.getByText('No comparison yet')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Nothing priced to sell' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'No place to farm' })).toBeInTheDocument()
  })

  it('puts the curve of a picked row in the trend card, observed over the chosen period', async () => {
    const user = userEvent.setup()
    backend.marketItemHistory.mockResolvedValue([
      { date: '2026-09-01', median: 10, volume: 4 },
      { date: '2026-10-20', median: 20, volume: 6 },
      { date: '2026-10-27', median: 25, volume: 5 },
    ])
    show(farm)
    await user.click(await screen.findByRole('button', { name: 'Show the curve of Lith T1 Radiant ×3' }))
    expect(backend.marketItemHistory).toHaveBeenCalledWith('Lith T1 Relic (Radiant)')
    const card = await screen.findByRole('region', { name: 'Lith T1 Radiant' })
    expect(await within(card).findByRole('img', { name: /from 20 to 25 platinum over 30 days/ })).toBeInTheDocument()
    expect(within(card).getByText('+25%')).toBeInTheDocument()
    expect(within(card).getByText('observed over 30 days')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '90 d' }))
    expect(screen.getByRole('img', { name: /from 10 to 25 platinum over 90 days/ })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Back to trends' }))
    expect(screen.getByText('+150%')).toBeInTheDocument()
  })

  it('shows what drops at a place under its row', async () => {
    const user = userEvent.setup()
    show(farm)
    await user.click(await screen.findByRole('button', { name: 'What drops at Void/Mot (Survival), Rotation C' }))
    const drops = screen.getByRole('list', { name: 'What drops at Void/Mot (Survival), Rotation C' })
    expect(within(drops).getByText('Relic, valued by opening')).toBeInTheDocument()
    expect(within(drops).getByText('0.5% per run')).toBeInTheDocument()
  })

  it('speaks French', async () => {
    show(farm, { language: 'fr' })
    expect(await screen.findByRole('heading', { name: 'Farm & ventes' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mettre en vente' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Quoi faire maintenant' })).toBeInTheDocument()
    expect(screen.getAllByText('Votre inventaire')).toHaveLength(2)
  })
})
