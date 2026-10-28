import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppView, CollectionItem, ItemDetail } from '../backend'

const backend = vi.hoisted(() => ({ getItemDetail: vi.fn() }))
vi.mock('../backend', () => backend)
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: vi.fn(() => Promise.resolve()) }))

import { openUrl } from '@tauri-apps/plugin-opener'
import { CollectionPage, type CollectionFilters } from '../pages/CollectionPage'

const items: CollectionItem[] = [
  { id: 'rhino-prime', name: 'Rhino Prime', category: 'frame', quantity: 1, mastered: true, image_url: 'https://wfcd/RhinoPrime.png', platinum: 45, live: false, priceable: true, monthly_trades: 12 },
  { id: 'soma-prime', name: 'Soma Prime', category: 'weapon', quantity: 1, mastered: false, image_url: 'https://wfcd/SomaPrime.png', live: false, priceable: true },
  { id: 'serration', name: 'Serration', category: 'mod', quantity: 2, mastered: false, live: false, priceable: true },
]

const rhino: ItemDetail = {
  wiki_image_url: 'https://wiki.warframe.com/w/Special:FilePath/RhinoPrime.png?width=600',
  image_url: 'https://wfcd/RhinoPrime.png',
  description: 'Takes Rhino to the next level.',
  mastery_req: 0,
  vaulted: true,
  prime: true,
  introduced: { name: 'Update 12.4', date: '2014-03-05' },
  wiki_url: 'https://wiki.warframe.com/w/Rhino%2FPrime',
  abilities: [{ name: 'Rhino Charge', description: 'Rhino charges towards a target.' }],
  stats: [{ key: 'health', value: 270 }, { key: 'critical_chance', value: 0.3 }],
  components: [
    { name: 'Blueprint', count: 1, held: 1, drops: [] },
    { name: 'Chassis', count: 1, held: 0, drops: [
      { location: 'Lith E1 Relic', chance: 11, rarity: 'uncommon', vaulted: true },
      { location: 'Meso N6 Relic', chance: 25.33, rarity: 'common' },
    ] },
    { name: 'Orokin Cell', count: 3, held: 7, drops: [] },
  ],
  drops: [],
}

const detail = (id: string): ItemDetail => id === 'rhino-prime'
  ? rhino
  : { prime: false, abilities: [], stats: [], components: [], drops: [] }

const ready = { state: 'ready', message: 'ok', last_success: null } as const
const view: AppView = {
  collection: { items, total_entries: items.length },
  mastery: { available: false, items: [], totals: [] },
  reward: { cards: [], best_value_index: null, best_ducat_index: null },
  market_account: { link: 'unlinked', orders: [], listed_platinum: 0, listable: [], presence: { status: null, wanted: null, auto: false }, flagged: 0 },
  health: {
    game_reader: ready, log_monitor: ready, capture: ready, catalog: ready, market: ready,
    collection_prices: ready, database: ready, market_account: ready, acquisition_stages: [],
  },
}

const filters: CollectionFilters = { search: '', category: 'all', ownership: 'all', sort: 'name-asc', page: 1 }

function page() {
  return render(<CollectionPage
    view={view} effectiveMode="full" filters={filters} onFilters={vi.fn()} pricing={false} onPriceLive={vi.fn()}
    priceFloor={0} showDucats onToggleDucats={vi.fn()} onOpenMastery={vi.fn()}
    onSell={vi.fn()} onUpdate={vi.fn()} ordersBusy={false}
  />)
}

function card(name: string) {
  return screen.getByRole('article', { name })
}

beforeEach(() => {
  backend.getItemDetail.mockImplementation((id: string) => Promise.resolve(detail(id)))
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('the item sheet', () => {
  it('opens on a click anywhere on the card', async () => {
    const user = userEvent.setup()
    page()

    await user.click(within(card('Rhino Prime')).getByText('Frame'))

    expect(screen.getByRole('dialog', { name: 'Rhino Prime' })).toBeInTheDocument()
    expect(backend.getItemDetail).toHaveBeenCalledWith('rhino-prime')
  })

  it('opens from the keyboard, and Escape gives focus back to the card it came from', async () => {
    const user = userEvent.setup()
    page()
    const opener = within(card('Rhino Prime')).getByRole('button', { name: 'Rhino Prime' })
    opener.focus()

    await user.keyboard('{Enter}')
    const dialog = screen.getByRole('dialog', { name: 'Rhino Prime' })
    expect(dialog).toHaveFocus()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(opener).toHaveFocus()
  })

  it('keeps Tab inside the sheet', async () => {
    const user = userEvent.setup()
    page()
    await user.click(within(card('Serration')).getByRole('button', { name: 'Serration' }))
    const dialog = screen.getByRole('dialog', { name: 'Serration' })
    await waitFor(() => expect(backend.getItemDetail).toHaveBeenCalled())

    const close = within(dialog).getByRole('button', { name: 'Close' })
    close.focus()
    await user.tab()
    expect(dialog).toContainElement(document.activeElement as HTMLElement)
  })

  it('walks the filtered list with the arrow keys and the buttons', async () => {
    const user = userEvent.setup()
    page()
    await user.click(within(card('Rhino Prime')).getByRole('button', { name: 'Rhino Prime' }))

    expect(screen.getByRole('button', { name: 'Previous item' })).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByText('1 of 3')).toBeInTheDocument()

    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('dialog', { name: 'Serration' })).toBeInTheDocument()
    expect(screen.getByText('2 of 3')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Next item' }))
    expect(screen.getByRole('dialog', { name: 'Soma Prime' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next item' })).toHaveAttribute('aria-disabled', 'true')

    await user.keyboard('{ArrowLeft}')
    expect(screen.getByRole('dialog', { name: 'Serration' })).toBeInTheDocument()
  })

  it('closes on a press outside it', async () => {
    const user = userEvent.setup()
    page()
    await user.click(within(card('Rhino Prime')).getByRole('button', { name: 'Rhino Prime' }))

    await user.click(screen.getByRole('heading', { level: 1 }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('draws the wiki render, then the WFCD icon when it fails, then the category letters', async () => {
    const user = userEvent.setup()
    page()
    await user.click(within(card('Rhino Prime')).getByRole('button', { name: 'Rhino Prime' }))
    const dialog = screen.getByRole('dialog', { name: 'Rhino Prime' })

    const art = await within(dialog).findByRole('img', { name: 'Rhino Prime' })
    expect(art).toHaveAttribute('src', 'https://wiki.warframe.com/w/Special:FilePath/RhinoPrime.png?width=600')

    fireEvent.error(art)
    expect(within(dialog).getByRole('img', { name: 'Rhino Prime' })).toHaveAttribute('src', 'https://wfcd/RhinoPrime.png')

    fireEvent.error(within(dialog).getByRole('img', { name: 'Rhino Prime' }))
    expect(within(dialog).queryByRole('img', { name: 'Rhino Prime' })).not.toBeInTheDocument()
    expect(dialog.querySelector('.sheet-art')).toHaveTextContent('Fr')
  })

  it('lists the recipe with what is held, and where a missing part drops', async () => {
    const user = userEvent.setup()
    page()
    await user.click(within(card('Rhino Prime')).getByRole('button', { name: 'Rhino Prime' }))
    const dialog = screen.getByRole('dialog', { name: 'Rhino Prime' })

    expect(await within(dialog).findByText('Takes Rhino to the next level.')).toBeInTheDocument()
    expect(within(dialog).getByText('Vaulted', { selector: '.sheet-head .tag' })).toBeInTheDocument()
    expect(within(dialog).getByText('1 of 1 held')).toBeInTheDocument()
    expect(within(dialog).getByText('7 of 3 held')).toBeInTheDocument()

    // The missing Chassis opens on its relics, best chance first as the backend sent them.
    const chassis = within(dialog).getByText('Chassis').closest('details')
    expect(chassis).toHaveAttribute('open')
    const relics = within(chassis as HTMLElement).getAllByRole('listitem')
    expect(relics.map(row => row.textContent)).toEqual([
      'Lith E1 RelicVaultedUncommon · 11% chance',
      'Meso N6 RelicCommon · 25.33% chance',
    ])

    expect(within(dialog).getByText('Rhino Charge')).toBeInTheDocument()
    expect(within(dialog).getByText('30%')).toBeInTheDocument()
    expect(within(dialog).getByText('Mastery rank required')).toBeInTheDocument()
    expect(within(dialog).getByText('Update 12.4')).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'Open on the wiki' }))
    expect(openUrl).toHaveBeenCalledWith('https://wiki.warframe.com/w/Rhino%2FPrime')
  })
})
