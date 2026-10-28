import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MarketAccount } from './backend'
import { MarketStatus } from './components/MarketStatus'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function account(overrides: Partial<MarketAccount> = {}): MarketAccount {
  return {
    link: 'linked',
    backing: 'keyring',
    orders: [],
    fetched_at: '1785492000',
    listed_platinum: 0,
    listable: [],
    presence: { status: null, wanted: null, auto: false },
    flagged: 0,
    ...overrides,
  }
}

const onPresence = vi.fn().mockResolvedValue(undefined)
const onLink = vi.fn()

function renderStatus(overrides: Partial<MarketAccount> = {}, busy = false) {
  render(<MarketStatus account={account(overrides)} busy={busy} onPresence={onPresence} onLink={onLink}/>)
}

async function openStatus() {
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: /^Market status:/ }))
  return user
}

describe('the market status switch', () => {
  it('asks for a status the server accepts, chosen by hand', async () => {
    renderStatus()
    const user = await openStatus()
    await user.click(screen.getByRole('button', { name: 'In game' }))
    expect(onPresence).toHaveBeenCalledWith('ingame', false)
  })

  it('spells offline as no status at all', async () => {
    renderStatus({ presence: { status: 'online', wanted: 'online', auto: false } })
    const user = await openStatus()
    await user.click(screen.getByRole('button', { name: 'Offline' }))
    // warframe.market has no settable `offline`: the backend closes the socket instead.
    expect(onPresence).toHaveBeenCalledWith(null, false)
  })

  it('marks what was asked for, so a press registers before the socket answers', async () => {
    renderStatus({ presence: { status: null, wanted: 'invisible', auto: false } })
    expect(screen.getByRole('button', { name: 'Market status: Invisible' })).toBeInTheDocument()
    await openStatus()
    expect(screen.getByRole('button', { name: 'Invisible' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Online' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('says so while the server has not confirmed the choice', async () => {
    renderStatus({ presence: { status: null, wanted: 'ingame', auto: false } })
    await openStatus()
    expect(screen.getByRole('status')).toHaveTextContent(/asking warframe\.market/i)
  })

  it('reports the status automatic mode settled on, in the same list', async () => {
    renderStatus({ presence: { status: 'ingame', wanted: 'ingame', auto: true } })
    expect(screen.getByRole('button', { name: 'Market status: In game, Follow the game' })).toBeInTheDocument()
    await openStatus()
    // Automatic is not a fifth status: the list still names which of the four is in force.
    expect(screen.getByRole('button', { name: 'In game' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('checkbox', { name: /follow the game/i })).toBeChecked()
    // Reporting, not offering. Pressing one would be undone by the next poll.
    expect(screen.getByRole('button', { name: 'Online' })).toBeDisabled()
    // With every status disabled, focus lands on the one control that still acts.
    expect(screen.getByRole('checkbox', { name: /follow the game/i })).toHaveFocus()
  })

  it('hands the choice back when automatic is switched off', async () => {
    renderStatus({ presence: { status: 'ingame', wanted: 'ingame', auto: true } })
    const user = await openStatus()
    await user.click(screen.getByRole('checkbox', { name: /follow the game/i }))
    // Whatever it had settled on is what is held, so switching off does not change what others see.
    expect(onPresence).toHaveBeenCalledWith('ingame', false)
  })
})

describe('the market status popover', () => {
  it('opens on the status in force and closes with Escape, back on the pill', async () => {
    renderStatus({ presence: { status: 'online', wanted: 'online', auto: false } })
    const pill = screen.getByRole('button', { name: 'Market status: Online' })
    expect(pill).toHaveAttribute('aria-expanded', 'false')
    const user = await openStatus()
    expect(pill).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('group', { name: 'Market status' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Online' })).toHaveFocus()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('group', { name: 'Market status' })).not.toBeInTheDocument()
    expect(pill).toHaveAttribute('aria-expanded', 'false')
    expect(pill).toHaveFocus()
  })

  it('closes once a status is chosen, focus back on the pill', async () => {
    renderStatus()
    const user = await openStatus()
    await user.click(screen.getByRole('button', { name: 'Online' }))
    expect(onPresence).toHaveBeenCalledWith('online', false)
    expect(screen.queryByRole('group', { name: 'Market status' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Market status:/ })).toHaveFocus()
  })

  it('closes on a press anywhere else', async () => {
    render(<><MarketStatus account={account()} busy={false} onPresence={onPresence} onLink={onLink}/><button type="button">Elsewhere</button></>)
    const user = await openStatus()
    await user.click(screen.getByRole('button', { name: 'Elsewhere' }))
    expect(screen.queryByRole('group', { name: 'Market status' })).not.toBeInTheDocument()
  })

  it('says Not linked without an account, and leads to Orders instead of opening', async () => {
    renderStatus({ link: 'unlinked', backing: undefined })
    const pill = screen.getByRole('button', { name: 'Market status: Not linked. Link an account in Orders' })
    expect(pill).toHaveTextContent('Not linked')
    expect(pill).not.toHaveAttribute('aria-expanded')
    await userEvent.click(pill)
    expect(onLink).toHaveBeenCalledOnce()
    expect(screen.queryByRole('group', { name: 'Market status' })).not.toBeInTheDocument()
  })

  it('asks for a new sign-in when the credential was refused', async () => {
    renderStatus({ link: 'needs_relink' })
    await userEvent.click(screen.getByRole('button', { name: /^Market status: Sign in again/ }))
    expect(onLink).toHaveBeenCalledOnce()
  })
})
