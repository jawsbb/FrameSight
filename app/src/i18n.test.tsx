import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const backend = vi.hoisted(() => ({
  getSetupStatus: vi.fn(), setAccessMode: vi.fn(), authorizeScreenCapture: vi.fn(), getView: vi.fn(), refreshInventory: vi.fn(), refreshPrices: vi.fn(),
  marketStatus: vi.fn(), marketSignIn: vi.fn(), marketLinkToken: vi.fn(), marketSignOut: vi.fn(),
  refreshOrders: vi.fn(), removeOrder: vi.fn(), setOrderQuantity: vi.fn(),
  setMarketPresence: vi.fn(), createOrder: vi.fn(), updateOrder: vi.fn(),
  getVersionInfo: vi.fn(), updateCheck: vi.fn(), updateDownloadAndInstall: vi.fn(),
  getPreferences: vi.fn(), setMasteryMarks: vi.fn(), setLanguage: vi.fn(),
}))
vi.mock('./backend', () => backend)
vi.mock('./overlay', () => ({ showRewardOverlay: vi.fn(), hideRewardOverlay: vi.fn() }))
vi.mock('./window', () => ({
  minimizeWindow: vi.fn(), toggleMaximizeWindow: vi.fn(), closeWindow: vi.fn(),
  readWindowMaximized: vi.fn(() => Promise.resolve(false)), watchWindowResized: vi.fn(() => Promise.resolve(() => {})),
}))
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(() => Promise.resolve(() => {})) }))
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: vi.fn(() => Promise.resolve()) }))
vi.mock('@tauri-apps/plugin-clipboard-manager', () => ({ writeText: vi.fn(() => Promise.resolve()) }))
vi.mock('@tauri-apps/plugin-process', () => ({ relaunch: vi.fn(() => Promise.resolve()) }))

import App from './App'
import { AppRoute } from './Root'
import { en } from './i18n/en'
import { fr } from './i18n/fr'
import { figure } from './collection'
import { stampReading } from './freshness'
import { resetUpdateStoreForTests } from './updateStore'
import type { AppView } from './backend'

const view: AppView = {
  collection: {
    items: [
      { id: 'rhino', name: 'Rhino Prime Systems', category: 'prime_part', quantity: 13, mastered: false, platinum: 1000, ducats: 45, live: false, priceable: true, monthly_trades: 2 },
      { id: 'braton', name: 'Braton', category: 'weapon', quantity: 1, mastered: true, live: false, priceable: true },
    ],
    total_entries: 2,
  },
  mastery: { available: true, items: [], totals: [] },
  reward: { cards: [], best_value_index: null, best_ducat_index: null },
  market_account: { link: 'unlinked', orders: [], listed_platinum: 0, listable: [], presence: { status: null, wanted: null, auto: false }, flagged: 0 },
  health: {
    game_reader: { state: 'ready', message: 'Warframe is running', last_success: null },
    log_monitor: { state: 'ready', message: 'EE.log monitor ready', last_success: null },
    capture: { state: 'idle', message: 'Capture waiting', last_success: null },
    catalog: { state: 'ready', message: 'Catalog ready', last_success: null },
    market: { state: 'ready', message: 'Market ready', last_success: null },
    collection_prices: { state: 'ready', message: 'Priced', last_success: '2026-07-27' },
    database: { state: 'ready', message: 'SQLite database available', last_success: null },
    market_account: { state: 'idle', message: 'Not linked', last_success: null },
    acquisition_stages: [],
  },
}

function setSystemLanguage(language: string) {
  Object.defineProperty(navigator, 'language', { configurable: true, value: language })
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  resetUpdateStoreForTests()
  backend.getSetupStatus.mockResolvedValue({ setup_complete: true, access_mode: 'full', desktop_capture_action_available: false })
  backend.getView.mockResolvedValue(view)
  backend.marketStatus.mockResolvedValue(view)
  backend.refreshOrders.mockResolvedValue(view)
  backend.getVersionInfo.mockResolvedValue({ version: '0.13.1', channel: 'stable', kind: 'unknown', writable: false, updatable: false, manager: null, manager_command: null })
  backend.updateCheck.mockResolvedValue({ kind: 'unknown', updatable: false, update: null })
  backend.getPreferences.mockResolvedValue({ mastery_marks: true, language: 'fr' })
})
afterEach(() => {
  cleanup()
  setSystemLanguage('en-US')
  document.documentElement.lang = 'en'
})

describe('formats by language', () => {
  it('group figures the way each language does, whatever the system locale', () => {
    expect(figure(12345, en)).toBe('12,345')
    expect(figure(12345, fr)).toMatch(/^12[\u00a0\u202f]345$/)
    expect(fr.settings.floorSummary(1234, 5)).toMatch(/^1[\u00a0\u202f]234 piles comptées · 5 platine vendable$/)
  })

  it('read elapsed time in each language', () => {
    const now = new Date('2026-07-25T12:00:00Z')
    expect(stampReading('1784980560', now, en)?.relative).toBe('4 minutes ago')
    expect(stampReading('1784980560', now, fr)?.relative).toBe('il y a 4 minutes')
    expect(stampReading('1784980770', now, fr)?.relative).toBe('à l’instant')
    expect(stampReading('1784980560', now, fr)?.exact).toMatch(/25 juil\. 2026/)
  })
})

describe('French interface', () => {
  it('names the navigation and the collection in French, with French figures', async () => {
    render(<App/>)
    const nav = await screen.findByRole('navigation', { name: 'Navigation principale' })
    for (const page of ['Collection', 'Maîtrise', 'Récompenses', 'Ordres', 'Diagnostic', 'Paramètres']) {
      expect(within(nav).getByRole('button', { name: page })).toBeInTheDocument()
    }
    expect(await screen.findByRole('heading', { name: 'Votre collection' })).toBeInTheDocument()
    // Text matching folds every space, so the grouping character itself is checked in `formats`.
    expect(screen.getByTestId('stat-worth')).toHaveTextContent(/^13 000valeur marché2 000 vendable/)
    expect(screen.getByRole('button', { name: 'Toutes les catégories' })).toBeInTheDocument()
    expect(screen.getByText('Prix du 27 juil.')).toBeInTheDocument()
    // Item names stay as the English catalog gives them.
    expect(screen.getByRole('heading', { name: 'Rhino Prime Systems' })).toBeInTheDocument()
    expect(document.documentElement.lang).toBe('fr')
  })

  it('states the Full access warning in French where the level is chosen', async () => {
    backend.getSetupStatus.mockResolvedValue({ setup_complete: false, access_mode: null, desktop_capture_action_available: false })
    render(<App/>)
    expect(await screen.findByRole('heading', { name: 'Choisissez l’accès à Warframe' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Choisissez un niveau d’accès' })).toBeDisabled()
    await userEvent.click(screen.getByRole('radio', { name: /Complet/ }))
    const detail = screen.getByRole('region', { name: 'Ce qu’ajoute le mode Complet' })
    expect(detail).toHaveTextContent('Envoie votre ID de compte et un nonce à mobile.warframe.com, et nulle part ailleurs.')
    expect(detail).toHaveTextContent('risque au regard de la politique de compte ou de l’anti-triche, même si aucune mémoire du jeu n’est modifiée')
    expect(detail).toHaveTextContent('Mémoire du processus en lecture seule')
    expect(screen.getByRole('button', { name: 'Confirmer le mode Complet' })).toBeEnabled()
  })

  it('translates a warframe.market refusal, and leaves an unknown one as sent', async () => {
    backend.refreshOrders.mockRejectedValueOnce('warframe.market is limiting requests; try again shortly')
    render(<App/>)
    await userEvent.click(await screen.findByRole('button', { name: 'Ordres' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de joindre warframe.market. warframe.market limite les requêtes ; réessayez dans un instant.')

    backend.marketSignIn.mockRejectedValueOnce('upstream said no')
    await userEvent.click(screen.getAllByRole('button', { name: 'Se connecter' })[0])
    expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de se connecter à warframe.market. Upstream said no.')
  })

  it('switches language from Settings at once, and back to the system', async () => {
    backend.getPreferences.mockResolvedValue({ mastery_marks: true, language: null })
    backend.setLanguage.mockImplementation(async (language: 'en' | 'fr' | null) => ({ mastery_marks: true, language }))
    render(<App/>)
    await userEvent.click(await screen.findByRole('button', { name: 'Settings' }))
    const group = screen.getByRole('group', { name: 'Language' })
    expect(within(group).getByRole('button', { name: 'System' })).toHaveAttribute('aria-pressed', 'true')

    await userEvent.click(within(group).getByRole('button', { name: 'Français' }))
    expect(backend.setLanguage).toHaveBeenCalledWith('fr')
    expect(await screen.findByRole('heading', { name: 'Paramètres', level: 1 })).toBeInTheDocument()
    expect(document.documentElement.lang).toBe('fr')
    const langue = screen.getByRole('group', { name: 'Langue' })
    expect(within(langue).getByRole('button', { name: 'Français' })).toHaveAttribute('aria-pressed', 'true')
    // Each language keeps its own name, whatever is on screen.
    expect(within(langue).getByRole('button', { name: 'English' })).toHaveAttribute('lang', 'en')

    await userEvent.click(within(langue).getByRole('button', { name: 'Système' }))
    expect(backend.setLanguage).toHaveBeenLastCalledWith(null)
    expect(await screen.findByRole('heading', { name: 'Settings', level: 1 })).toBeInTheDocument()
    expect(document.documentElement.lang).toBe('en')
  })

  it('keeps the language when the backend refuses to save it', async () => {
    backend.getPreferences.mockResolvedValue({ mastery_marks: true, language: 'en' })
    backend.setLanguage.mockRejectedValue('language setting could not be saved')
    render(<App/>)
    await userEvent.click(await screen.findByRole('button', { name: 'Settings' }))
    await userEvent.click(screen.getByRole('button', { name: 'Français' }))
    expect(await screen.findByText('Could not save this setting.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'English' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('follows a French system when nothing was chosen', async () => {
    setSystemLanguage('fr-FR')
    backend.getPreferences.mockResolvedValue({ mastery_marks: true })
    render(<App/>)
    expect(await screen.findByRole('heading', { name: 'Votre collection' })).toBeInTheDocument()
  })

  it('draws the reward overlay in the language the backend holds', async () => {
    backend.getView.mockResolvedValue({
      ...view,
      reward: { cards: [{ name: 'Forma Blueprint', platinum: 12, ducats: 25, owned: 0, confidence: 1 }], best_value_index: 0, best_ducat_index: null },
    })
    render(<AppRoute pathname="/overlay"/>)
    const overlay = await screen.findByRole('main', { name: 'Overlay des récompenses' })
    await waitFor(() => expect(within(overlay).getByText('Top platine')).toBeInTheDocument())
    expect(within(overlay).getByText('Non possédé')).toBeInTheDocument()
    expect(within(overlay).getByRole('heading', { name: 'Forma Blueprint' })).toBeInTheDocument()
  })
})
