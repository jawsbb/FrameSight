import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { marketItemOrders, marketRowOrders, type CollectionItem, type HeldSet, type LiveOrder, type MarketAccount, type ReconciledOrder } from './backend'
import { OrdersView } from './pages/OrdersView'

// The sell form reads the market beside the price; these tests are about the screen around it.
vi.mock('./backend', async original => ({
  ...await original<typeof import('./backend')>(),
  marketRowOrders: vi.fn().mockResolvedValue({ sell: [], buy: [], fetched_at: 0 }),
  marketItemOrders: vi.fn().mockResolvedValue({ sell: [], buy: [], fetched_at: 0 }),
}))

afterEach(() => {
  cleanup()
  // The handlers are shared across every test in this file, so a call recorded by one is visible
  // to the next. A test asserting something was *not* called is the one that catches this, and it
  // catches it as a false failure somewhere unrelated.
  vi.clearAllMocks()
  // A test that fails mid-body never reaches its own teardown, so a fake clock set by one test
  // would otherwise stay installed and time out every test after it, reporting the leak as a
  // pile of unrelated failures instead of the one real one.
  vi.useRealTimers()
})

function entry(id: string, status: ReconciledOrder['status'], quantity = 1, rowId?: string): ReconciledOrder {
  return {
    order: {
      id,
      item_id: `item-${id}`,
      kind: 'sell',
      platinum: 12,
      quantity,
      per_trade: 1,
      visible: true,
      updated_at: 1_785_405_600,
    },
    name: 'Braton Prime Blueprint',
    row_id: rowId,
    status,
  }
}

function account(overrides: Partial<MarketAccount> = {}): MarketAccount {
  return {
    link: 'linked',
    backing: 'keyring',
    orders: [],
    // `fetched_at` is `now_unix_seconds()` on the Rust side, not a calendar stamp.
    fetched_at: '1785492000',
    listed_platinum: 0,
    listable: [],
    sets: [],
    presence: { status: null, wanted: null, auto: false },
    flagged: 0,
    synced: [],
    ...overrides,
  }
}

const handlers = {
  items: [],
  onSell: vi.fn(),
  onSellSet: vi.fn(),
  onUpdate: vi.fn().mockResolvedValue(undefined),
  onSignIn: vi.fn().mockResolvedValue(undefined),
  onLinkToken: vi.fn().mockResolvedValue(undefined),
  onSignOut: vi.fn().mockResolvedValue(undefined),
  onRefresh: vi.fn().mockResolvedValue(undefined),
  onRemove: vi.fn().mockResolvedValue(undefined),
  onShowAll: vi.fn().mockResolvedValue(undefined),
  onRepairAll: vi.fn().mockResolvedValue(undefined),
  onRemoveAll: vi.fn().mockResolvedValue(undefined),
  onLowerTo: vi.fn().mockResolvedValue(undefined),
  onClose: vi.fn().mockResolvedValue(undefined),
  syncOrders: false,
  onSyncOrders: vi.fn().mockResolvedValue(undefined),
}

describe('the unlinked screen', () => {
  it('explains what linking does before offering to do it', () => {
    render(<OrdersView account={account({ link: 'unlinked', backing: undefined })} {...handlers} busy={false} error={null} />)

    // The consent statement is on this screen, at the moment the player decides, not in a
    // settings page they would have to go looking for afterwards. Matched as one statement rather
    // than as two loose words: the screen now names warframe.market in several places, and an
    // assertion that any of them exists would pass on a screen that had lost the consent notice.
    expect(screen.getByText(/optional.*warframe\.market/is)).toBeInTheDocument()
  })

  it('offers both ways in, neither presented as the lesser', () => {
    render(<OrdersView account={account({ link: 'unlinked', backing: undefined })} {...handlers} busy={false} error={null} />)

    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/token/i)).toBeInTheDocument()
  })

  it('says where the token comes from, and what it is worth to whoever holds it', () => {
    render(<OrdersView account={account({ link: 'unlinked', backing: undefined })} {...handlers} busy={false} error={null} />)

    // The token path is unusable without these steps, and asking the player to go and find them
    // elsewhere is what makes an optional feature the one nobody links. Behind a disclosure
    // because they are read once; asserted here because a collapsed `details` still renders its
    // contents, and a reader can reach them.
    expect(screen.getByText(/cookie named/i)).toBeInTheDocument()
    expect(screen.getByText(/JWT/)).toBeInTheDocument()
    // A token is a credential. The screen that asks for one says so.
    expect(screen.getByText(/like a password/i)).toBeInTheDocument()
  })

  it('never renders the password as readable text', async () => {
    render(<OrdersView account={account({ link: 'unlinked', backing: undefined })} {...handlers} busy={false} error={null} />)

    const password = screen.getByLabelText(/password/i)
    expect(password).toHaveAttribute('type', 'password')
    await userEvent.type(password, 'not-a-real-password')
    expect(document.body.textContent).not.toContain('not-a-real-password')
  })
})

describe('the linked screen', () => {
  it('states the total and the age of the list', () => {
    render(
      <OrdersView
        account={account({ orders: [entry('a', { state: 'ok' })], listed_platinum: 24 })}
        {...handlers}
        busy={false}
        error={null}
      />,
    )

    expect(screen.getByText(/24/)).toBeInTheDocument()
  })

  it('shows where the credential is held, because the two are not equally strong', () => {
    render(<OrdersView account={account({ backing: 'database' })} {...handlers} busy={false} error={null} />)

    expect(screen.getByText(/local database file/i)).toBeInTheDocument()
  })

  // The stats read like Collection's: the qualification is a tooltip and a spoken suffix.
  it('keeps the stat notes in tooltips rather than on screen', () => {
    render(<OrdersView account={account({ orders: [entry('gone', { state: 'missing' })], flagged: 1 })} {...handlers} busy={false} error={null} />)

    expect(screen.getByTestId('stat-flagged')).toHaveAttribute('title', 'Listed above what this device says you hold')
    expect(screen.getByText(/Listed above what this device says you hold/)).toHaveClass('sr-only')
    expect(screen.getByTestId('stat-backing')).toHaveAttribute('title', 'Credential held in system keyring')
  })

  it('never shows an email address', () => {
    render(<OrdersView account={account()} {...handlers} busy={false} error={null} />)

    expect(document.body.textContent).not.toContain('@')
  })

  it('flags an order for something unowned, and offers to remove it', async () => {
    render(
      <OrdersView
        account={account({ orders: [entry('gone', { state: 'missing' })], flagged: 1 })}
        {...handlers}
        busy={false}
        error={null}
      />,
    )

    expect(screen.getByText(/no longer own this/i)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }))
    expect(handlers.onRemove).toHaveBeenCalledWith('gone')
  })

  /**
   * The row nobody flagged is the one that can be a misclick: it is currently selling something
   * the player still owns, and the only reason to take it down is a change of mind.
   */
  it('asks again before removing a listing nothing is wrong with', async () => {
    render(
      <OrdersView
        account={account({ orders: [entry('fine', { state: 'ok' })] })}
        {...handlers}
        busy={false}
        error={null}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Remove' }))
    expect(handlers.onRemove).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: /confirm remove/i }))
    expect(handlers.onRemove).toHaveBeenCalledWith('fine')
  })

  // Unlinking drops the credential, so it is a press that asks again, in place, like removing a
  // listing that is selling. Moving focus away disarms it.
  it('asks again before unlinking the account, and forgets the question on blur', async () => {
    render(<OrdersView account={account()} {...handlers} busy={false} error={null} />)

    await userEvent.click(screen.getByRole('button', { name: 'Unlink account' }))
    expect(handlers.onSignOut).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Confirm unlink' })).toHaveFocus()
    await userEvent.tab()
    expect(screen.getByRole('button', { name: 'Unlink account' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Unlink account' }))
    await userEvent.click(screen.getByRole('button', { name: 'Confirm unlink' }))
    expect(handlers.onSignOut).toHaveBeenCalledTimes(1)
  })

  it('offers to lower an order that lists more than is owned', async () => {
    render(
      <OrdersView
        account={account({ orders: [entry('over', { state: 'overshoot', owned: 1 }, 3)], flagged: 1 })}
        {...handlers}
        busy={false}
        error={null}
      />,
    )

    expect(screen.getByText(/own 1 of 3 listed/i)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /lower to 1/i }))
    expect(handlers.onLowerTo).toHaveBeenCalledWith('over', 1)
  })

  // An unverifiable order remains an ordinary, unflagged row, but the backend's status is still
  // visible so the absence of an ownership judgment is not mistaken for a verified holding.
  it('renders an unverifiable order without offering an ownership fix', () => {
    render(
      <OrdersView
        account={account({ orders: [entry('unknown', { state: 'unverifiable' })] })}
        {...handlers}
        busy={false}
        error={null}
      />,
    )

    expect(screen.getByText('Unverifiable')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /lower to/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/no longer own/i)).not.toBeInTheDocument()
  })

  it('does not claim unverifiable listings match the collection', () => {
    render(
      <OrdersView
        account={account({ orders: [entry('unknown', { state: 'unverifiable' })] })}
        {...handlers}
        busy={false}
        error={null}
      />,
    )

    expect(screen.getByText(/Ownership could not be verified/i)).toBeInTheDocument()
    expect(screen.queryByText('Every listing matches the collection')).not.toBeInTheDocument()
  })

  it('disables the fixes while one is in flight, so a click is not sent twice', () => {
    render(
      <OrdersView
        account={account({ orders: [entry('gone', { state: 'missing' })], flagged: 1 })}
        {...handlers}
        busy={true}
        error={null}
      />,
    )

    expect(screen.getByRole('button', { name: 'Remove' })).toBeDisabled()
  })

  // `fetched_at` is Unix seconds, and read as a calendar string it is `Invalid Date`, not a 2026
  // date. The band said "Fetched just now" over a stale list once, so this asserts the reading is
  // real and that the raw stamp never reaches the screen.
  it('reads the fetch time as the seconds the backend actually sent', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-31T12:00:00Z'))

    render(<OrdersView account={account()} {...handlers} busy={false} error={null} />)

    expect(screen.getByText(/Fetched 2 hours ago/)).toBeInTheDocument()
    expect(screen.queryByText(/1785492000/)).not.toBeInTheDocument()
    expect(screen.queryByText(/have not been fetched yet/)).not.toBeInTheDocument()
  })
})

describe('failures', () => {
  it('shows what went wrong without losing the orders already listed', () => {
    render(
      <OrdersView
        account={account({ orders: [entry('a', { state: 'ok' })] })}
        {...handlers}
        busy={false}
        error="warframe.market could not be reached"
      />,
    )

    expect(screen.getByText(/could not be reached/i)).toBeInTheDocument()
    expect(screen.getByText(/Braton Prime Blueprint/)).toBeInTheDocument()
  })

  it('asks for a re-link when the credential was refused', () => {
    render(<OrdersView account={account({ link: 'needs_relink' })} {...handlers} busy={false} error={null} />)

    // The block that owns the recovery, not the band note that summarises it. Both say to sign
    // in again, and only this one carries the forms that let the player do it.
    expect(screen.getByRole('heading', { name: /credential refused/i })).toBeInTheDocument()
    expect(screen.getByText(/refused the stored credential/i)).toBeInTheDocument()
    // The status cell must not still read "Linked" while the credential is being refused.
    expect(screen.queryByText('Linked')).not.toBeInTheDocument()
  })

  it('offers both ways back in from the needs_relink screen, without requiring an unlink first', async () => {
    render(<OrdersView account={account({ link: 'needs_relink' })} {...handlers} busy={false} error={null} />)

    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/token/i)).toBeInTheDocument()

    await userEvent.type(screen.getByLabelText(/email/i), 'someone@example.com')
    await userEvent.type(screen.getByLabelText(/password/i), 'a-password')
    await userEvent.click(screen.getByRole('button', { name: /^sign in$/i }))
    expect(handlers.onSignIn).toHaveBeenCalledWith('someone@example.com', 'a-password')

    await userEvent.type(screen.getByLabelText(/token/i), 'a-token')
    await userEvent.click(screen.getByRole('button', { name: /link with token/i }))
    expect(handlers.onLinkToken).toHaveBeenCalledWith('a-token')
  })
})

const braton: CollectionItem = {
  id: '/Lotus/Weapons/BratonPrime',
  name: 'Braton Prime Blueprint',
  category: 'prime_part',
  quantity: 3,
  mastered: false,
  platinum: 14,
  live: false,
  priceable: true,
}

describe('editing a listing from its row', () => {
  /// The row is where the player is looking at the listing itself, so it is where a change of
  /// price or count is made. Offered only where the order names one held row: a count bounded by
  /// a holding is the one thing this write insists on, and an order that names no row (a set, a
  /// sculpture) has no holding to be bounded against.
  it('opens the form prefilled from the row, and saves through the order', async () => {
    const user = userEvent.setup()
    render(
      <OrdersView
        account={account({ orders: [entry('o1', { state: 'ok' }, 2, braton.id)] })}
        {...handlers}
        items={[braton]}
        busy={false}
        error={null}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Edit' }))
    expect(screen.getByLabelText('Platinum')).toHaveValue(12)
    expect(screen.getByLabelText('Quantity')).toHaveValue(2)
    await user.clear(screen.getByLabelText('Quantity'))
    await user.type(screen.getByLabelText('Quantity'), '3')
    await user.click(screen.getByRole('button', { name: /save listing/i }))

    expect(handlers.onUpdate).toHaveBeenCalledWith('o1', 12, 3)
    expect(handlers.onSell).not.toHaveBeenCalled()
  })

  it('offers no edit on a row that names nothing this device holds', () => {
    const buying = entry('b', { state: 'ok' }, 1, braton.id)
    buying.order.kind = 'buy'
    render(
      <OrdersView
        account={{
          ...account(),
          orders: [
            entry('set', { state: 'unverifiable' }),
            entry('gone', { state: 'ok' }, 1, '/Lotus/Not/Held'),
            buying,
          ],
        }}
        {...handlers}
        items={[braton]}
        busy={false}
        error={null}
      />,
    )

    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull()
  })

  it('steps the count by one within the holding, at the listing\'s own price', async () => {
    const user = userEvent.setup()
    render(
      <OrdersView
        account={account({ orders: [entry('o1', { state: 'ok' }, 2, braton.id)] })}
        {...handlers}
        items={[{ ...braton, quantity: 3 }]}
        busy={false}
        error={null}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'One more' }))
    expect(handlers.onUpdate).toHaveBeenLastCalledWith('o1', 12, 3)
    await user.click(screen.getByRole('button', { name: 'One fewer' }))
    expect(handlers.onUpdate).toHaveBeenLastCalledWith('o1', 12, 1)
  })

  it('stops the count at the holding and at one', () => {
    render(
      <OrdersView
        account={account({ orders: [entry('o1', { state: 'ok' }, 1, braton.id)] })}
        {...handlers}
        items={[{ ...braton, quantity: 1 }]}
        busy={false}
        error={null}
      />,
    )

    expect(screen.getByRole('button', { name: 'One more' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'One fewer' })).toBeDisabled()
  })

  /** A sale closes one trade, which for a bulk listing is the whole bundle a buyer takes. */
  it('records a sale of one trade', async () => {
    const bulk = entry('o1', { state: 'ok' }, 12, braton.id)
    bulk.order.per_trade = 6
    render(<OrdersView account={account({ orders: [bulk] })} {...handlers} items={[braton]} busy={false} error={null} />)

    await userEvent.click(screen.getByRole('button', { name: 'Sold' }))
    expect(handlers.onClose).toHaveBeenCalledWith('o1', 6)
  })

  it('offers no sale on a buy order', () => {
    const buying = entry('b', { state: 'unverifiable' })
    buying.order.kind = 'buy'
    render(<OrdersView account={account({ orders: [buying] })} {...handlers} busy={false} error={null} />)

    expect(screen.queryByRole('button', { name: 'Sold' })).toBeNull()
    expect(screen.getByText('Buy order')).toBeInTheDocument()
  })
})

describe('the automatic sync', () => {
  it('is a switch the player turns on', async () => {
    render(<OrdersView account={account()} {...handlers} busy={false} error={null} />)

    const toggle = screen.getByRole('switch', { name: /follow the inventory/i })
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    await userEvent.click(toggle)
    expect(handlers.onSyncOrders).toHaveBeenCalledWith(true)
  })

  it('says what the last sync changed', () => {
    render(
      <OrdersView
        account={account({ synced: [
          { name: 'Ash Prime Systems Blueprint', from: 1, to: 0, at: '1785492000' },
          { name: 'Paris Prime String', from: 3, to: 1, at: '1785492000' },
        ] })}
        {...handlers}
        busy={false}
        error={null}
      />,
    )

    expect(screen.getByText('Ash Prime Systems Blueprint').nextSibling).toHaveTextContent('listing taken down')
    expect(screen.getByText('Paris Prime String').nextSibling).toHaveTextContent('3 → 1')
  })
})

describe('selling from the inventory', () => {
  const serration: CollectionItem = {
    id: '/Lotus/Upgrades/Mods/RifleSerrationMod#10',
    name: 'Serration',
    category: 'mod',
    quantity: 2,
    mastered: false,
    platinum: 48,
    live: false,
    priceable: true,
  }

  it('offers nothing when the account can list nothing', () => {
    render(<OrdersView account={account()} {...handlers} items={[braton]} busy={false} error={null} />)
    expect(screen.queryByRole('button', { name: 'Sell' })).toBeNull()
  })

  it('lists what can be sold, most valuable first, leaving out what is already listed', () => {
    const listed = { ...braton, id: '/Lotus/Listed', name: 'Listed Thing' }
    render(
      <OrdersView
        account={account({ listable: [braton.id, serration.id, listed.id], orders: [entry('o1', { state: 'ok' }, 1, listed.id)] })}
        {...handlers}
        items={[braton, serration, listed]}
        busy={false}
        error={null}
      />,
    )

    const section = screen.getByRole('region', { name: /sell from your inventory/i })
    const names = Array.from(section.querySelectorAll('h3'), heading => heading.textContent)
    expect(names).toEqual(['Serration', 'Braton Prime Blueprint'])
  })

  it('proposes what is held more than once, dearest first, and the rest on request', async () => {
    const user = userEvent.setup()
    // The single copy is the dearest, and the stack of three the cheapest per copy.
    const single = { ...braton, id: '/Lotus/Single', name: 'Single Thing', quantity: 1, platinum: 200 }
    render(<OrdersView account={account({ listable: [braton.id, serration.id, single.id] })} {...handlers} items={[braton, serration, single]} busy={false} error={null} />)
    const section = screen.getByRole('region', { name: /sell from your inventory/i })
    const names = () => Array.from(section.querySelectorAll('h3'), heading => heading.textContent)
    expect(names()).toEqual(['Serration', 'Braton Prime Blueprint'])
    await user.click(screen.getByRole('button', { name: 'All counts' }))
    expect(names()).toEqual(['Single Thing', 'Serration', 'Braton Prime Blueprint'])
  })

  it('says so when nothing is held twice, rather than showing an empty list', () => {
    const single = { ...braton, quantity: 1 }
    render(<OrdersView account={account({ listable: [single.id] })} {...handlers} items={[single]} busy={false} error={null} />)
    expect(screen.getByText(/nothing is held twice/i)).toBeInTheDocument()
  })

  it('sends the price and quantity typed, for the item chosen', async () => {
    const user = userEvent.setup()
    render(
      <OrdersView
        account={account({ listable: [braton.id] })}
        {...handlers}
        items={[braton]}
        busy={false}
        error={null}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Price…' }))
    // The price prefills from the card's own quote, so only the quantity is typed here.
    await user.clear(screen.getByLabelText('Quantity'))
    await user.type(screen.getByLabelText('Quantity'), '2')
    await user.click(screen.getByRole('button', { name: /list for sale/i }))
    expect(handlers.onSell).toHaveBeenCalledWith(braton.id, 14, 2, true)
  })

  // The whole row id, rank suffix included: it is what the backend resolves the listing's rank
  // from, and a path with the suffix stripped would name the unranked stack instead.
  it('sends the whole row id for a ranked copy', async () => {
    const user = userEvent.setup()
    render(
      <OrdersView
        account={account({ listable: [serration.id] })}
        {...handlers}
        items={[serration]}
        busy={false}
        error={null}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Price…' }))
    await user.click(screen.getByRole('button', { name: /list for sale/i }))
    expect(handlers.onSell).toHaveBeenCalledWith(serration.id, 48, 1, true)
  })

  it('narrows the list to the name typed', async () => {
    const user = userEvent.setup()
    render(
      <OrdersView
        account={account({ listable: [braton.id] })}
        {...handlers}
        items={[braton]}
        busy={false}
        error={null}
      />,
    )
    await user.type(screen.getByLabelText('Item'), 'zzz')
    expect(screen.queryByRole('button', { name: 'Sell' })).toBeNull()
    expect(screen.getByText(/nothing sellable here matches/i)).toBeInTheDocument()
  })

  it('refuses to send more than this device holds', async () => {
    const user = userEvent.setup()
    render(
      <OrdersView
        account={account({ listable: [braton.id] })}
        {...handlers}
        items={[braton]}
        busy={false}
        error={null}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Price…' }))
    await user.clear(screen.getByLabelText('Quantity'))
    await user.type(screen.getByLabelText('Quantity'), '9')
    expect(screen.getByRole('button', { name: /list for sale/i })).toBeDisabled()
  })
  function live(platinum: number, status: LiveOrder['status']): LiveOrder {
    return { user: `seller-${platinum}`, status, platinum, quantity: 1, per_trade: 1, rank: null, subtype: null }
  }

  it('lists one copy at the cheapest in-game price in one press', async () => {
    const user = userEvent.setup()
    // Online sellers are cheaper here, but buyers whisper the ones in game.
    vi.mocked(marketRowOrders).mockResolvedValueOnce({ sell: [live(18, 'ingame'), live(21, 'ingame'), live(9, 'online')], buy: [], fetched_at: 0 })
    render(<OrdersView account={account({ listable: [braton.id] })} {...handlers} items={[braton]} busy={false} error={null} />)
    await user.click(screen.getByRole('button', { name: 'Sell' }))
    expect(marketRowOrders).toHaveBeenCalledWith(braton.id)
    expect(handlers.onSell).toHaveBeenCalledWith(braton.id, 18, 1, true)
  })

  it('opens the form rather than inventing a price when nobody is selling', async () => {
    const user = userEvent.setup()
    vi.mocked(marketRowOrders).mockResolvedValueOnce({ sell: [], buy: [], fetched_at: 0 })
    render(<OrdersView account={account({ listable: [braton.id] })} {...handlers} items={[braton]} busy={false} error={null} />)
    await user.click(screen.getByRole('button', { name: 'Sell' }))
    expect(handlers.onSell).not.toHaveBeenCalled()
    expect(await screen.findByRole('form', { name: /list braton prime blueprint for sale/i })).toBeInTheDocument()
  })

  it('opens the form when the market cannot be read', async () => {
    const user = userEvent.setup()
    vi.mocked(marketRowOrders).mockRejectedValueOnce('offline')
    render(<OrdersView account={account({ listable: [braton.id] })} {...handlers} items={[braton]} busy={false} error={null} />)
    await user.click(screen.getByRole('button', { name: 'Sell' }))
    expect(handlers.onSell).not.toHaveBeenCalled()
    expect(await screen.findByRole('form', { name: /list braton prime blueprint for sale/i })).toBeInTheDocument()
  })

  it('leaves a listed holding to the listings above, rather than offering it again', () => {
    render(
      <OrdersView
        account={account({ listable: [braton.id], orders: [entry('o1', { state: 'ok' }, 2, braton.id)] })}
        {...handlers}
        items={[braton]}
        busy={false}
        error={null}
      />,
    )
    const section = screen.getByRole('region', { name: /sell from your inventory/i })
    expect(within(section).queryByRole('article', { name: 'Braton Prime Blueprint' })).toBeNull()
    expect(within(section).queryByRole('button', { name: 'Listed' })).toBeNull()
  })

  it('sorts by how fast an item sells', async () => {
    const user = userEvent.setup()
    const fast = { ...braton, monthly_trades: 300 }
    const slow = { ...serration, monthly_trades: 4 }
    render(<OrdersView account={account({ listable: [fast.id, slow.id] })} {...handlers} items={[fast, slow]} busy={false} error={null} />)
    await user.selectOptions(screen.getByLabelText('Sort items to sell'), 'sales')
    const section = screen.getByRole('region', { name: /sell from your inventory/i })
    expect(Array.from(section.querySelectorAll('h3'), heading => heading.textContent)).toEqual(['Braton Prime Blueprint', 'Serration'])
  })

  it('pages a long inventory rather than cutting it off', async () => {
    const user = userEvent.setup()
    const many = Array.from({ length: 25 }, (_, index) => ({ ...braton, id: `/Lotus/Part${index}`, name: `Part ${index}`, platinum: 100 - index }))
    render(<OrdersView account={account({ listable: many.map(item => item.id) })} {...handlers} items={many} busy={false} error={null} />)
    const section = screen.getByRole('region', { name: /sell from your inventory/i })
    expect(section.querySelectorAll('h3')).toHaveLength(20)
    await user.click(screen.getByRole('button', { name: /next page/i }))
    expect(Array.from(section.querySelectorAll('h3'), heading => heading.textContent)).toEqual(['Part 20', 'Part 21', 'Part 22', 'Part 23', 'Part 24'])
  })
})

describe('acting on every listing at once', () => {
  const hidden = (id: string): ReconciledOrder => ({ ...entry(id, { state: 'ok' }), order: { ...entry(id, { state: 'ok' }).order, visible: false } })

  it('offers only the visibility change that would change something', () => {
    render(<OrdersView account={account({ orders: [entry('o1', { state: 'ok' })] })} {...handlers} busy={false} error={null} />)
    const group = screen.getByRole('group', { name: 'Every listing' })
    expect(within(group).queryByRole('button', { name: 'Show all' })).toBeNull()
    expect(within(group).getByRole('button', { name: 'Hide all' })).toBeInTheDocument()
  })

  it('shows or hides every listing on one press', async () => {
    const user = userEvent.setup()
    render(<OrdersView account={account({ orders: [entry('o1', { state: 'ok' }), hidden('o2')] })} {...handlers} busy={false} error={null} />)
    await user.click(screen.getByRole('button', { name: 'Show all' }))
    expect(handlers.onShowAll).toHaveBeenCalledWith(true)
    await user.click(screen.getByRole('button', { name: 'Hide all' }))
    expect(handlers.onShowAll).toHaveBeenCalledWith(false)
  })

  it('offers to fix the flagged listings only when some are flagged', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<OrdersView account={account({ orders: [entry('o1', { state: 'ok' })] })} {...handlers} busy={false} error={null} />)
    expect(screen.queryByRole('button', { name: /^fix/i })).toBeNull()
    rerender(<OrdersView account={account({ orders: [entry('o1', { state: 'missing' }), entry('o2', { state: 'overshoot', owned: 1 }, 3)], flagged: 2 })} {...handlers} busy={false} error={null} />)
    await user.click(screen.getByRole('button', { name: 'Fix 2' }))
    expect(handlers.onRepairAll).toHaveBeenCalledOnce()
  })

  it('asks again, with the count, before removing every listing', async () => {
    const user = userEvent.setup()
    render(<OrdersView account={account({ orders: [entry('o1', { state: 'ok' }), entry('o2', { state: 'ok' })] })} {...handlers} busy={false} error={null} />)
    await user.click(screen.getByRole('button', { name: 'Remove all' }))
    expect(handlers.onRemoveAll).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Remove 2?' }))
    expect(handlers.onRemoveAll).toHaveBeenCalledOnce()
  })

  it('offers nothing to act on when there are no listings', () => {
    render(<OrdersView account={account()} {...handlers} busy={false} error={null} />)
    expect(screen.queryByRole('group', { name: 'Every listing' })).toBeNull()
  })
})

describe('selling sets', () => {
  const braton: HeldSet = {
    path: '/Lotus/Weapons/Tenno/Rifle/BratonPrime',
    name: 'Braton Prime Set',
    item_id: 'set-braton',
    slug: 'braton_prime_set',
    parts: [{ name: 'Blueprint', uses: 1, held: 2 }, { name: 'Receiver', uses: 1, held: 1 }],
    complete: 1,
    platinum: 30,
    monthly_trades: 200,
  }
  const guandao: HeldSet = {
    path: '/Lotus/Weapons/Tenno/Melee/Polearms/GuandaoPrime',
    name: 'Guandao Prime Set',
    item_id: 'set-guandao',
    slug: 'guandao_prime_set',
    parts: [{ name: 'Blade', uses: 2, held: 1 }],
    complete: 0,
    platinum: 50,
  }

  async function openSets(sets: HeldSet[], orders: ReconciledOrder[] = []) {
    const user = userEvent.setup()
    render(<OrdersView account={account({ sets, orders })} {...handlers} busy={false} error={null} />)
    await user.click(screen.getByRole('button', { name: 'Sets' }))
    return { user, section: screen.getByRole('region', { name: /sell from your inventory/i }) }
  }

  it('lists the sets held in part, with each part counted, and sells only a whole one', async () => {
    const { section } = await openSets([braton, guandao])
    const whole = within(section).getByRole('article', { name: 'Braton Prime Set' })
    expect(whole).toHaveTextContent('1 complete · Blueprint 2/1 · Receiver 1/1')
    expect(within(whole).getByRole('button', { name: 'Sell' })).toBeEnabled()
    const partial = within(section).getByRole('article', { name: 'Guandao Prime Set' })
    expect(partial).toHaveTextContent('incomplete · Blade 1/2')
    expect(within(partial).getByRole('button', { name: 'Sell' })).toBeDisabled()
  })

  it('lists one set at the cheapest in-game price, reading the set\'s own book', async () => {
    vi.mocked(marketItemOrders).mockResolvedValueOnce({ sell: [{ user: 'a', status: 'ingame', platinum: 28, quantity: 1, per_trade: 1, rank: null, subtype: null }], buy: [], fetched_at: 0 })
    const { user, section } = await openSets([braton])
    await user.click(within(section).getByRole('button', { name: 'Sell' }))
    expect(marketItemOrders).toHaveBeenCalledWith('braton_prime_set')
    expect(handlers.onSellSet).toHaveBeenCalledWith(braton.path, 28, 1, true)
    expect(handlers.onSell).not.toHaveBeenCalled()
  })

  it('leaves a set out once an order names it', async () => {
    const order = { ...entry('o1', { state: 'unverifiable' }), order: { ...entry('o1', { state: 'unverifiable' }).order, item_id: 'set-braton' } }
    const { section } = await openSets([braton, guandao], [order])
    expect(within(section).queryByRole('article', { name: 'Braton Prime Set' })).toBeNull()
    expect(within(section).getByRole('article', { name: 'Guandao Prime Set' })).toBeInTheDocument()
  })
})
