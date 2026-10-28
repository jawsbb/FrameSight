import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppView, FoundryItem, FoundryView } from '../backend'

const backend = vi.hoisted(() => ({ getFoundry: vi.fn() }))
vi.mock('../backend', () => backend)

import { FoundryPage } from './FoundryPage'
import { MessagesContext, catalogs } from '../i18n'

const view = {
  collection: { items: [], total_entries: 0, snapshot: { observed_at: 1, game_build: 'b', source: 'test' } },
  health: { catalog: { state: 'ready', message: 'ok', last_success: '1' }, collection_prices: { state: 'ready', message: 'ok', last_success: '2026-10-28' } },
} as unknown as AppView

const piece = (name: string, uses: number, held: number, extra: Partial<FoundryItem['pieces'][number]> = {}) =>
  ({ name, image: null, kind: 'part' as const, uses, held, drops: [], ...extra })

const items: FoundryItem[] = [
  {
    id: 'guandao', name: 'Guandao Prime', category: 'weapon', masterable: true, mastered: false, stage: 'ready', missing: 0,
    pieces: [piece('Blueprint', 1, 1, { kind: 'blueprint', image: 'blueprint.png' }), piece('Blade', 2, 2), piece('Handle', 1, 1)],
    resources: [{ name: 'Orokin Cell', uses: 15, held: 20 }],
    set_platinum: 60, pieces_platinum: 45,
  },
  {
    id: 'ash', name: 'Ash Prime', category: 'frame', masterable: true, mastered: true, stage: 'almost', missing: 1,
    pieces: [piece('Blueprint', 1, 1, { kind: 'blueprint' }), piece('Chassis', 1, 0, { platinum: 10, drops: ['Axi B1 Relic', 'Lith S3 Relic', 'Meso N2 Relic', 'Neo A1 Relic'] }), piece('Systems', 1, 1)],
    resources: [{ name: 'Orokin Cell', uses: 1, held: 0 }],
  },
  {
    id: 'akbronco', name: 'Akbronco Prime', category: 'weapon', masterable: true, mastered: false, stage: 'set', missing: 3,
    pieces: [piece('Blueprint', 1, 1, { kind: 'blueprint' }), piece('Link', 1, 0), piece('Bronco Prime', 2, 0, { kind: 'ingredient' })],
    resources: [],
  },
]

function show(foundry: FoundryView, effectiveMode: 'full' | 'companion' = 'full', language: 'en' | 'fr' = 'en') {
  backend.getFoundry.mockResolvedValue(foundry)
  return render(<MessagesContext value={catalogs[language]}><FoundryPage view={view} effectiveMode={effectiveMode}/></MessagesContext>)
}

describe('Foundry page', () => {
  beforeEach(() => backend.getFoundry.mockReset())
  afterEach(cleanup)

  it('sorts builds into ready, almost and sets to complete', async () => {
    show({ status: 'ready', items })
    const ready = await screen.findByRole('region', { name: /Ready to build/ })
    expect(within(ready).getByRole('article', { name: 'Guandao Prime' })).toBeInTheDocument()
    expect(within(ready).getByText('Mastery gain')).toBeInTheDocument()
    expect(within(ready).getByText('Set sells for 15 more')).toBeInTheDocument()
    const almost = screen.getByRole('region', { name: /Almost there/ })
    const ash = within(almost).getByRole('article', { name: 'Ash Prime' })
    expect(within(ash).getByText('1 missing')).toBeInTheDocument()
    expect(within(ash).getByText('Mastered')).toBeInTheDocument()
    // The missing piece says so in words, with its price and where it drops.
    expect(within(within(ash).getByRole('list', { name: 'Pieces' })).getByText('0 of 1 held')).toBeInTheDocument()
    expect(within(ash).getByText('10')).toBeInTheDocument()
    expect(within(ash).getByText(/Axi B1 · Lith S3 · Meso N2 \+1/)).toBeInTheDocument()
    const sets = screen.getByRole('region', { name: /Prime sets to complete/ })
    expect(within(sets).getByRole('article', { name: 'Akbronco Prime' })).toBeInTheDocument()
  })

  it('filters by category, mastery and name', async () => {
    const user = userEvent.setup()
    show({ status: 'ready', items })
    await screen.findByRole('article', { name: 'Ash Prime' })
    await user.click(screen.getByRole('button', { name: 'Frame' }))
    expect(screen.getByRole('article', { name: 'Ash Prime' })).toBeInTheDocument()
    expect(screen.queryByRole('article', { name: 'Guandao Prime' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'All categories' }))
    await user.click(screen.getByRole('switch', { name: 'Unmastered only' }))
    expect(screen.queryByRole('article', { name: 'Ash Prime' })).not.toBeInTheDocument()
    expect(screen.getByRole('article', { name: 'Akbronco Prime' })).toBeInTheDocument()
    await user.type(screen.getByRole('searchbox', { name: 'Search foundry' }), 'guan')
    expect(screen.getByRole('article', { name: 'Guandao Prime' })).toBeInTheDocument()
    expect(screen.queryByRole('article', { name: 'Akbronco Prime' })).not.toBeInTheDocument()
  })

  it('says what it waits for, and marks a snapshot', async () => {
    const { unmount } = show({ status: 'no_catalog', items: [] })
    expect(await screen.findByText('The item catalog has not loaded yet')).toBeInTheDocument()
    unmount()
    show({ status: 'ready', items: [] }, 'companion', 'fr')
    expect(await screen.findByText('Rien à construire pour l’instant')).toBeInTheDocument()
    expect(screen.getByText(/instantané enregistré/)).toBeInTheDocument()
  })
})
