import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

const backend = vi.hoisted(() => ({ getRelics: vi.fn() }))
vi.mock('../backend', () => backend)

import { RelicsPage } from './RelicsPage'
import { MessagesContext } from '../i18n'
import { fr } from '../i18n/fr'
import type { AppView, Relic, RelicReward, RelicsView } from '../backend'

const view = {
  collection: { items: [], total_entries: 0, snapshot: { observed_at: 1, game_build: 'b', source: 'live' } },
  health: { collection_prices: { last_success: '2026-10-27' }, catalog: { last_success: null } },
} as unknown as AppView

const reward = (name: string, chance: number, platinum: number | null, extra: Partial<RelicReward> = {}): RelicReward =>
  ({ name, rarity: chance > 20 ? 'common' : chance > 5 ? 'uncommon' : 'rare', chance, platinum, ducats: 15, owned: 0, ...extra })

const relic = (name: string, quantity: number, opening: number, extra: Partial<Relic> = {}): Relic => ({
  id: `/Lotus/Types/Game/Projections/${name.replace(' ', '')}Bronze`,
  name,
  era: name.split(' ')[0],
  refinement: 'intact',
  quantity,
  vaulted: false,
  platinum: 3,
  monthly_trades: 40,
  opening: { platinum: opening, ducats: 15, unpriced: 0, unpriced_chance: 0 },
  rewards: [],
  ...extra,
})

const relics: RelicsView = {
  catalog: true,
  prices_date: '2026-10-27',
  ducats: true,
  relics: [
    relic('Lith A1', 9, 2.5),
    relic('Axi B2', 1, 30.4, {
      vaulted: true,
      opening: { platinum: 30.4, ducats: 40, unpriced: 1, unpriced_chance: 25.33 },
      rewards: [
        reward('Forma Blueprint', 25.33, null, { ducats: null }),
        reward('Nikana Prime Blueprint', 2, 120, { owned: 1, mastery: { state: 'unmastered', subject: null, parts: [], missing: true, completes: false } }),
      ],
    }),
    relic('Neo C3', 4, 11),
  ],
}

function renderPage(data: RelicsView, effectiveMode: 'full' | 'companion' = 'full') {
  backend.getRelics.mockResolvedValue(data)
  return render(<RelicsPage view={view} effectiveMode={effectiveMode}/>)
}

const rowNames = () => within(screen.getByRole('list', { name: 'Held relics' })).getAllByRole('button').map(row => row.querySelector('strong')?.textContent)

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('Relics page', () => {
  it('lists the held relics, highest average opening first, marked as estimates', async () => {
    renderPage(relics)
    expect(await screen.findByRole('heading', { name: 'Relics' })).toBeInTheDocument()
    expect(rowNames()).toEqual(['Axi B2', 'Neo C3', 'Lith A1'])
    const axi = screen.getByRole('button', { name: /Axi B2/ })
    expect(axi).toHaveTextContent('≈ 30.4')
    expect(axi).toHaveTextContent('1 unpriced')
    expect(axi).toHaveTextContent('Vaulted')
    expect(screen.getByTestId('stat-items')).toHaveTextContent('14')
  })

  it('sorts by quantity and by name', async () => {
    renderPage(relics)
    await screen.findByRole('list', { name: 'Held relics' })
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Sort relics' }), 'quantity-desc')
    expect(rowNames()).toEqual(['Lith A1', 'Neo C3', 'Axi B2'])
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Sort relics' }), 'name-asc')
    expect(rowNames()).toEqual(['Axi B2', 'Lith A1', 'Neo C3'])
  })

  it('filters by era', async () => {
    renderPage(relics)
    await userEvent.click(within(await screen.findByRole('group', { name: 'Relic eras' })).getByRole('button', { name: /^Neo/ }))
    expect(rowNames()).toEqual(['Neo C3'])
  })

  it('opens a relic onto its rewards, saying which have no price and which a set still lacks', async () => {
    renderPage(relics)
    const row = await screen.findByRole('button', { name: /Axi B2/ })
    await userEvent.click(row)
    expect(row).toHaveAttribute('aria-expanded', 'true')
    const detail = screen.getByRole('region', { name: 'Rewards of Axi B2 Intact' })
    expect(within(detail).getByText('Forma Blueprint').closest('li')).toHaveTextContent('No price')
    const nikana = within(detail).getByText('Nikana Prime Blueprint').closest('li')!
    expect(nikana).toHaveTextContent('Owned ×1')
    expect(nikana).toHaveTextContent('Missing from an unmastered set')
    expect(detail).toHaveTextContent('1 reward has no price and is left out (25.3% of openings)')
  })

  it('says a snapshot has no relics without Full access, rather than an empty list', async () => {
    renderPage({ ...relics, relics: [] }, 'companion')
    expect(await screen.findByText('No relics in the saved snapshot')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Relics, saved snapshot' })).toBeInTheDocument()
    expect(screen.getByText(/can't be verified without Full access/)).toBeInTheDocument()
  })

  it('shows no value rather than zero while prices have not loaded', async () => {
    renderPage({ ...relics, prices_date: null, relics: [relic('Lith A1', 2, 0, { platinum: null, opening: { platinum: 0, ducats: 15, unpriced: 6, unpriced_chance: 99.99 } })] })
    const row = await screen.findByRole('button', { name: /Lith A1/ })
    expect(row).toHaveTextContent('No value')
    expect(screen.getByText('No prices yet')).toBeInTheDocument()
    expect(screen.queryByTestId('stat-worth')).not.toBeInTheDocument()
  })

  it('speaks French', async () => {
    backend.getRelics.mockResolvedValue(relics)
    render(<MessagesContext value={fr}><RelicsPage view={view} effectiveMode="full"/></MessagesContext>)
    const row = await screen.findByRole('button', { name: /Axi B2/ })
    expect(row).toHaveTextContent('Intacte')
    expect(row).toHaveTextContent('Vaultée')
    expect(row).toHaveTextContent(/≈\s30,4/)
  })
})
