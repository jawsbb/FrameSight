import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const backend = vi.hoisted(() => ({ marketSearch: vi.fn(), marketItemOrders: vi.fn() }))
const clipboard = vi.hoisted(() => ({ writeText: vi.fn(() => Promise.resolve()) }))
vi.mock('../backend', () => backend)
vi.mock('@tauri-apps/plugin-clipboard-manager', () => clipboard)

import { MarketPage } from './MarketPage'
import { forgetRecentForTests, whisper } from '../market'
import { MessagesContext, catalogs } from '../i18n'
import type { AppView, MarketHit, MarketItemOrders } from '../backend'

const SERRATION_ROW = '/Lotus/Upgrades/Mods/Rifle/WeaponDamageAmountMod'

const serration: MarketHit = {
  id: '54a74454e779892d5e515596', slug: 'serration', name: 'Serration', thumb_url: null, max_rank: 10,
  median: 2, median_max_rank: 20, checked_live: false, monthly_trades: 1800, held: [SERRATION_ROW],
}
const braton: MarketHit = {
  id: '56783f24cbfa8f0432dd8993', slug: 'braton_prime_set', name: 'Braton Prime Set', thumb_url: null, max_rank: null,
  median: 9, median_max_rank: null, checked_live: false, monthly_trades: 120, held: [],
}
const serrationOrders: MarketItemOrders = {
  fetched_at: Math.floor(Date.now() / 1000),
  sell: [
    { user: 'Portarto', status: 'ingame', platinum: 1, quantity: 46, per_trade: 1, rank: 0, subtype: 'regular' },
    { user: 'Frost_J', status: 'online', platinum: 2, quantity: 1, per_trade: 1, rank: 0, subtype: 'regular' },
  ],
  buy: [{ user: 'LukaGamer86', status: 'ingame', platinum: 15, quantity: 1, per_trade: 1, rank: 10, subtype: 'regular' }],
}

function view(overrides: Partial<AppView['market_account']> = {}): AppView {
  return {
    collection: {
      items: [{ id: SERRATION_ROW, name: 'Serration', category: 'mod', quantity: 3, mastered: false, rank: 0, max_rank: 10, live: false, priceable: true }],
      total_entries: 1,
    },
    mastery: { available: false, items: [], totals: [] },
    reward: { cards: [], best_value_index: null, best_ducat_index: null },
    market_account: {
      link: 'unlinked', orders: [], listed_platinum: 0, flagged: 0, listable: [],
      presence: { status: null, wanted: null, auto: false }, ...overrides,
    },
    health: {} as AppView['health'],
  }
}

function renderPage(appView = view(), language: 'en' | 'fr' = 'en') {
  const onSell = vi.fn(() => Promise.resolve())
  render(<MessagesContext value={catalogs[language]}>
    <MarketPage view={appView} effectiveMode="full" onSell={onSell} onUpdate={vi.fn(() => Promise.resolve())} ordersBusy={false}/>
  </MessagesContext>)
  return { onSell }
}

beforeEach(() => {
  forgetRecentForTests()
  backend.marketSearch.mockImplementation((query: string) => Promise.resolve({
    hits: [serration, braton].filter(hit => hit.name.toLowerCase().includes(query.toLowerCase())),
    dump_date: '2026-10-28',
  }))
  backend.marketItemOrders.mockResolvedValue(serrationOrders)
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('Market page search', () => {
  it('starts empty and does not ask anything for one letter', async () => {
    renderPage()
    expect(screen.getByRole('heading', { name: 'Look up an item' })).toBeInTheDocument()
    await userEvent.type(screen.getByRole('combobox', { name: 'Search warframe.market items' }), 's')
    await new Promise(resolve => setTimeout(resolve, 250))
    expect(backend.marketSearch).not.toHaveBeenCalled()
  })

  it('suggests items with their daily price and pace', async () => {
    renderPage()
    await userEvent.type(screen.getByRole('combobox'), 'serr')

    const option = await screen.findByRole('option', { name: /Serration/ })
    expect(option).toHaveTextContent('2')
    expect(option).toHaveTextContent('1,800 sales/mo')
    expect(backend.marketSearch).toHaveBeenLastCalledWith('serr')
  })

  it('says when nothing matches', async () => {
    renderPage()
    await userEvent.type(screen.getByRole('combobox'), 'zzz')
    expect(await screen.findByText('No warframe.market item matches “zzz”.')).toBeInTheDocument()
  })

  it('names the reason the item list could not be read, in the chosen language', async () => {
    backend.marketSearch.mockRejectedValue('warframe.market could not be reached')
    renderPage(view(), 'fr')
    await userEvent.type(screen.getByRole('combobox'), 'serr')
    expect(await screen.findByRole('alert')).toHaveTextContent(/^La liste des objets n’a pas pu être lue\. /)
  })
})

describe('Market page item sheet', () => {
  it('asks for one item’s live orders once and draws sellers then buyers', async () => {
    renderPage()
    await userEvent.type(screen.getByRole('combobox'), 'serr')
    await userEvent.click(await screen.findByRole('option', { name: /^Serration/ }))

    expect(backend.marketItemOrders).toHaveBeenCalledTimes(1)
    expect(backend.marketItemOrders).toHaveBeenCalledWith('serration')
    expect(screen.getByRole('heading', { name: 'Serration' })).toBeInTheDocument()
    expect(screen.getByText('Daily summary of 28 Oct')).toBeInTheDocument()
    expect(screen.getByText('20 at max rank')).toBeInTheDocument()
    expect(screen.getByText('1,800')).toBeInTheDocument()
    expect(screen.getByText('You hold 3')).toBeInTheDocument()

    const sellers = await screen.findByRole('region', { name: 'Sellers now' })
    const rows = within(sellers).getAllByRole('listitem')
    expect(rows.map(row => within(row).getByText(/Portarto|Frost_J/).textContent)).toEqual(['Portarto', 'Frost_J'])
    expect(rows[0]).toHaveTextContent('In game')
    expect(rows[0]).toHaveTextContent('Rank 0')
    expect(rows[0]).toHaveTextContent('×46')
    expect(rows[1]).toHaveTextContent('Online')
    const buyers = screen.getByRole('region', { name: 'Buyers now' })
    expect(buyers).toHaveTextContent('LukaGamer86')
    expect(buyers).toHaveTextContent('Rank 10')
    expect(screen.getByText('Live, fetched just now')).toBeInTheDocument()
  })

  it('selects with the keyboard and remembers what was viewed', async () => {
    renderPage()
    const box = screen.getByRole('combobox')
    await userEvent.type(box, 'ra')
    await screen.findByRole('option', { name: /Braton Prime Set/ })
    await userEvent.keyboard('{ArrowDown}{Enter}')
    expect(backend.marketItemOrders).toHaveBeenLastCalledWith('braton_prime_set')

    await userEvent.type(box, 'serr')
    await userEvent.click(await screen.findByRole('option', { name: /^Serration/ }))
    const recent = screen.getByRole('button', { name: 'Braton Prime Set' })
    await userEvent.click(recent)
    expect(backend.marketItemOrders).toHaveBeenLastCalledWith('braton_prime_set')
    expect(screen.getByRole('heading', { name: 'Braton Prime Set' })).toBeInTheDocument()
  })

  it('says why live orders failed and offers to try again', async () => {
    backend.marketItemOrders.mockRejectedValueOnce('warframe.market is limiting requests; try again shortly')
    renderPage()
    await userEvent.type(screen.getByRole('combobox'), 'serr')
    await userEvent.click(await screen.findByRole('option', { name: /^Serration/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Live orders could not be fetched. warframe.market is limiting requests; try again shortly.')
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('region', { name: 'Sellers now' })).toBeInTheDocument()
    expect(backend.marketItemOrders).toHaveBeenCalledTimes(2)
  })

  it('copies the whisper warframe.market would, rank included', async () => {
    renderPage()
    await userEvent.type(screen.getByRole('combobox'), 'serr')
    await userEvent.click(await screen.findByRole('option', { name: /^Serration/ }))
    await userEvent.click(await screen.findByRole('button', { name: 'Copy whisper, Portarto' }))

    expect(clipboard.writeText).toHaveBeenCalledWith('/w Portarto Hi! I want to buy: "Serration (rank 0)" for 1 platinum. (warframe.market)')
    expect(await screen.findByRole('button', { name: 'Copied, Portarto' })).toBeInTheDocument()
  })

  it('offers Sell only for a held, listable row of a linked account', async () => {
    renderPage(view({ link: 'linked', listable: [SERRATION_ROW] }))
    await userEvent.type(screen.getByRole('combobox'), 'serr')
    await userEvent.click(await screen.findByRole('option', { name: /^Serration/ }))

    await userEvent.click(screen.getByRole('button', { name: 'Sell Rank 0/10' }))
    expect(screen.getByRole('form', { name: /Serration/ })).toBeInTheDocument()
  })

  it('offers no Sell while the account is not linked', async () => {
    renderPage()
    await userEvent.type(screen.getByRole('combobox'), 'serr')
    await userEvent.click(await screen.findByRole('option', { name: /^Serration/ }))
    await waitFor(() => expect(screen.getByRole('region', { name: 'Sellers now' })).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /^Sell/ })).toBeNull()
  })
})

describe('whisper', () => {
  it('asks a buyer to buy from a seller and offers a buyer a sale', () => {
    const order = { user: 'Littleboy9x', status: 'ingame' as const, platinum: 8, quantity: 91, per_trade: 1, rank: null, subtype: null }
    expect(whisper(order, 'Braton Prime Set', 'sell')).toBe('/w Littleboy9x Hi! I want to buy: "Braton Prime Set" for 8 platinum. (warframe.market)')
    expect(whisper(order, 'Braton Prime Set', 'buy')).toBe('/w Littleboy9x Hi! I want to sell: "Braton Prime Set" for 8 platinum. (warframe.market)')
  })
})
