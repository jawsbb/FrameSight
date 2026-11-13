import { useState } from 'react'
import type { CollectionItem, MarketAccount, MarketOrder, SyncedOrder } from '../backend'
import { SellForm, type SellHandler, type UpdateHandler } from '../SellForm'
import { backingLabel, fixLabel, isFlagged, orderValue, sortOrders, statusLabel, uncountedReason } from '../orders'
import { stampReading } from '../freshness'
import { MetalMark } from '../MetalMark'
import { Stat } from '../components/Stat'
import { Thumb } from '../components/Thumb'
import { Icon } from '../components/Icon'
import { useMessages } from '../i18n'
import { EmptyState } from '../components/EmptyState'
import { SellStock } from './SellStock'

type OrdersViewProps = {
  account: MarketAccount
  onSignIn: (email: string, password: string) => Promise<void>
  onLinkToken: (token: string) => Promise<void>
  onSignOut: () => Promise<void>
  onRefresh: () => Promise<void>
  onRemove: (orderId: string) => Promise<void>
  onShowAll: (visible: boolean) => Promise<void>
  onRepairAll: () => Promise<void>
  onRemoveAll: () => Promise<void>
  onLowerTo: (orderId: string, quantity: number) => Promise<void>
  onClose: (orderId: string, quantity: number) => Promise<void>
  onSell: SellHandler
  onSellSet: SellHandler
  onUpdate: UpdateHandler
  syncOrders: boolean
  onSyncOrders: (enabled: boolean) => Promise<void>
  items: CollectionItem[]
  busy: boolean
  error: string | null
}

export function OrdersView({ account, onSignIn, onLinkToken, onSignOut, onRefresh, onRemove, onShowAll, onRepairAll, onRemoveAll, onLowerTo, onClose, onSell, onSellSet, onUpdate, syncOrders, onSyncOrders, items, busy, error }: OrdersViewProps) {
  const t = useMessages()
  if (account.link === 'unlinked') {
    return <UnlinkedPanel onSignIn={onSignIn} onLinkToken={onLinkToken} busy={busy} error={error} />
  }

  // Only the relative reading is shown here, and an unfetched order list is not a missing inventory
  // snapshot, so this says what actually has not happened yet.
  const fetched = account.fetched_at ? stampReading(account.fetched_at, new Date(), t) : null
  const freshness = fetched ? t.orders.fetched(fetched.relative) : t.orders.notFetched
  const needsRelink = account.link === 'needs_relink'
  const ownershipUnverifiable = account.orders.some(entry => entry.status.state === 'unverifiable')

  return <section className="page" aria-labelledby="orders-title">
    <div className="page-head">
      <h1 id="orders-title" className="page-title">{t.orders.title}</h1>
      <div className="stats">
        <Stat kind="orders" value={account.listed_platinum} unit={<MetalMark metal="plat" alt={t.units.platinum}/>} label={t.orders.listedValue} note={t.orders.listedValueNote(freshness)}/>
        {/* Red only while something is flagged: a zero is not an alarm. */}
        <Stat
          kind={account.flagged ? 'flagged' : 'unflagged'}
          value={account.flagged}
          label={t.orders.needAttention}
          note={account.flagged
            ? t.orders.flaggedNote
            : ownershipUnverifiable
              ? t.orders.unverifiableNote
              : t.orders.matchingNote}
        />
        {/* A refused credential is not a linked account: "Linked" beside a refusal notice would
            contradict the screen it heads. */}
        <Stat
          kind="backing"
          value={needsRelink ? t.orders.refused : t.orders.linked}
          note={needsRelink
            ? t.orders.relinkNote
            : t.orders.heldIn(backingLabel(account.backing, t))}
        />
      </div>
      <div className="head-actions">
        <button type="button" className="stamp" onClick={onRefresh} disabled={busy}>
          <span>{busy ? t.orders.refreshing : t.orders.refresh}</span>
        </button>
        <ConfirmButton label={t.orders.unlink} confirmLabel={t.orders.confirmUnlink} busy={busy} onConfirm={onSignOut}/>
      </div>
    </div>

    {/* Suppressed while the relink block is up: that block already names the refusal and offers
        the way out, and a banner above it saying the same thing twice is noise, not emphasis. */}
    {error && !needsRelink && <p className="error-banner" role="alert">{error}</p>}

    {/* The refusal states its case and the two ways back in follow immediately, as one block: a
        heading whose instruction is answered a screen further down is an instruction nobody
        follows. */}
    {needsRelink && <div className="relink">
      <h2>{t.orders.credentialRefused}</h2>
      <p className="prose">{t.orders.refusedNote}</p>
      <LinkForms onSignIn={onSignIn} onLinkToken={onLinkToken} busy={busy} />
    </div>}

    {!needsRelink && <SyncSwitch enabled={syncOrders} busy={busy} onChange={onSyncOrders}/>}
    {account.synced.length > 0 && <SyncReport synced={account.synced}/>}

    <div className="orders-head">
      <h2 className="section-title">{t.orders.mine}</h2>
      {account.orders.length > 0 && !needsRelink && <BulkActions account={account} busy={busy} onShowAll={onShowAll} onRepairAll={onRepairAll} onRemoveAll={onRemoveAll}/>}
    </div>
    {account.orders.length
      ? <ul className="group docket" aria-label={t.orders.list}>
        {sortOrders(account.orders).map(entry => <li key={entry.order.id}>
          <OrderRow entry={entry} items={items} busy={busy} onRemove={onRemove} onLowerTo={onLowerTo} onClose={onClose} onSell={onSell} onUpdate={onUpdate} />
        </li>)}
      </ul>
      : <EmptyState icon="orders" title={t.orders.none} detail={t.orders.noneDetail}/>}

    {!needsRelink && <SellStock items={items} account={account} busy={busy} onSell={onSell} onSellSet={onSellSet} onUpdate={onUpdate}/>}
  </section>
}

/**
 * What can be done to every listing at once. Each button shows only when it would change
 * something: no "Show all" when nothing is hidden, no fix when nothing is flagged. Removing
 * everything asks again, with the count, because it is the one press here that cannot be undone.
 */
function BulkActions({ account, busy, onShowAll, onRepairAll, onRemoveAll }: {
  account: MarketAccount
  busy: boolean
  onShowAll: (visible: boolean) => Promise<void>
  onRepairAll: () => Promise<void>
  onRemoveAll: () => Promise<void>
}) {
  const t = useMessages()
  const b = t.orders.bulk
  const hidden = account.orders.some(entry => !entry.order.visible)
  const shown = account.orders.some(entry => entry.order.visible)
  return <div className="head-actions" role="group" aria-label={b.label}>
    {hidden && <button type="button" className="stamp" disabled={busy} onClick={() => { void onShowAll(true) }}><span>{b.showAll}</span></button>}
    {shown && <button type="button" className="stamp" disabled={busy} onClick={() => { void onShowAll(false) }}><span>{b.hideAll}</span></button>}
    {account.flagged > 0 && <button type="button" className="stamp sold" disabled={busy} title={b.repairHint} onClick={() => { void onRepairAll() }}><span>{b.repairAll(account.flagged)}</span></button>}
    <ConfirmButton label={b.removeAll} confirmLabel={b.confirmRemoveAll(account.orders.length)} busy={busy} onConfirm={onRemoveAll}/>
  </div>
}

/**
 * One order, as a ledger line: the item's picture and name, then figures read down a column
 * (price against price, quantity against quantity), then what can be done to it.
 *
 * Whatever the reconciliation claims sits under the name rather than in a column of its own, with
 * the repair it calls for beside it: a claim read a screen-width away from the row it accuses, and
 * a fix button in a third place, is how the two used to overlap.
 *
 * The quantity steps by one trade, within what the row holds, as an edit of the listing at its
 * own price. "Sold" closes one trade on warframe.market, which records the sale there; a step
 * down only says the listing is smaller. Both need a held row to bound them, so a set, a
 * sculpture or a buy order shows its count plain.
 */
function OrderRow({ entry, items, busy, onRemove, onLowerTo, onClose, onSell, onUpdate }: {
  entry: ReturnType<typeof sortOrders>[number]
  items: CollectionItem[]
  busy: boolean
  onRemove: (orderId: string) => Promise<void>
  onLowerTo: (orderId: string, quantity: number) => Promise<void>
  onClose: (orderId: string, quantity: number) => Promise<void>
  onSell: SellHandler
  onUpdate: UpdateHandler
}) {
  const t = useMessages()
  const [editing, setEditing] = useState(false)
  const { order } = entry
  const name = entry.name ?? order.item_id
  const flagged = isFlagged(entry.status)
  // A buy order is never judged against the holding, so its line says what it is instead.
  const sub = order.kind === 'buy' ? t.orders.buyOrder : statusLabel(entry, t) ?? uncountedReason(order, t)
  const fix = fixLabel(entry.status, t)
  const value = orderValue(order)
  const overshoot = entry.status.state === 'overshoot' ? entry.status.owned : null
  const held = order.kind === 'sell' && entry.row_id
    ? items.find(item => item.id === entry.row_id && item.quantity > 0)
    : undefined
  return <article className={`docket-line${flagged ? ' doubt' : ''}`} aria-label={name}>
    <Thumb src={entry.thumb_url ?? held?.image_url} name={name}/>
    <div className="line-main">
      <h2 className="line-name" title={name}>{name}</h2>
      {sub && <p className={`line-sub${flagged ? ' flagged' : ''}`}>
        <span>{sub}</span>
        {/* The count is read out here rather than inside the handler: a narrowing on a property
            does not survive into a closure, so `entry.status.owned` there is not the overshoot's. */}
        {overshoot !== null && <button type="button" className="link-button" disabled={busy} onClick={() => onLowerTo(order.id, overshoot)}>{fix}</button>}
      </p>}
    </div>
    <span className="line-figure">{order.platinum}<MetalMark metal="plat" alt={t.units.platinum} className="line-metal"/></span>
    <Quantity order={order} name={name} held={held?.quantity ?? null} busy={busy} onSet={quantity => onUpdate(order.id, order.platinum, quantity)}/>
    {/* A row's share of the headline figure, written out when it is not just the price beside it:
        for more than one copy, or as a dash when the row counts for nothing (hidden, buying). */}
    <span className="line-value">{value === null
      ? <em>—</em>
      : order.quantity > 1 && <>{value}<MetalMark metal="plat" alt={t.units.platinum} className="line-metal"/></>}</span>
    <span className="line-fix">
      {order.kind === 'sell' && <button
        type="button"
        className="stamp sold"
        disabled={busy}
        title={t.orders.soldHint(order.per_trade)}
        onClick={() => onClose(order.id, order.per_trade)}
      ><span>{t.orders.sold}</span></button>}
      {held && <button type="button" className="stamp" disabled={busy} onClick={() => setEditing(true)}><span>{t.orders.editListing}</span></button>}
      {/* A flagged row's removal is the repair it asks for and goes on one press. */}
      <ConfirmButton
        label={t.orders.removeListing}
        confirmLabel={t.orders.confirmRemove}
        skip={entry.status.state === 'missing'}
        busy={busy}
        onConfirm={() => onRemove(order.id)}
      />
    </span>
    {held && editing && <SellForm
      item={held}
      listing={order}
      busy={busy}
      onSell={onSell}
      onUpdate={onUpdate}
      onDone={() => setEditing(false)}
    />}
  </article>
}

/** The listed count, with a step either way when a held row bounds it. */
function Quantity({ order, name, held, busy, onSet }: {
  order: MarketOrder
  name: string
  held: number | null
  busy: boolean
  onSet: (quantity: number) => Promise<void>
}) {
  const t = useMessages()
  const step = order.per_trade
  if (held === null) return <span className="line-count">× {order.quantity}</span>
  return <span className="stepper" role="group" aria-label={t.orders.quantityOf(name)}>
    <button type="button" aria-label={t.orders.fewer} disabled={busy || order.quantity - step < 1} onClick={() => onSet(order.quantity - step)}><Icon name="minus"/></button>
    <output>{order.quantity}</output>
    <button type="button" aria-label={t.orders.more} disabled={busy || order.quantity + step > held} onClick={() => onSet(order.quantity + step)}><Icon name="plus"/></button>
  </span>
}

/**
 * The automatic sync, off until the player turns it on. With it on, every inventory read takes
 * down what the game no longer holds and lowers what it holds less of: the same two repairs the
 * rows offer, made without the press, and only where the reconciliation makes a claim at all.
 */
function SyncSwitch({ enabled, busy, onChange }: { enabled: boolean; busy: boolean; onChange: (enabled: boolean) => Promise<void> }) {
  const t = useMessages()
  return <div className="sync-switch">
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      className="display-switch"
      disabled={busy}
      onClick={() => { void onChange(!enabled) }}
    >
      <span className="display-track" aria-hidden="true"><span className="display-thumb"/></span>
      <span>{t.orders.sync}</span>
    </button>
    <p className="band-note">{t.orders.syncNote}</p>
  </div>
}

/** What the last automatic sync changed, so a listing that vanished is never a mystery. */
function SyncReport({ synced }: { synced: SyncedOrder[] }) {
  const t = useMessages()
  const when = stampReading(synced[0].at, new Date(), t)
  return <section className="sync-report" aria-label={t.orders.syncedTitle}>
    <h2>{t.orders.synced(when?.relative ?? '')}</h2>
    <ul>
      {synced.map((change, index) => <li key={index}>
        <Thumb src={change.thumb_url} name={change.name ?? '?'}/>
        <span>{change.name ?? t.market.theItem}</span>
        <span className="sync-change">{change.to === 0 ? t.orders.syncRemoved : t.orders.syncLowered(change.from, change.to)}</span>
      </li>)}
    </ul>
  </section>
}

/**
 * A press that can be a misclick on something live (taking down a listing that is selling,
 * unlinking the account), so it asks again, in place: the first press arms it, the second acts.
 * A modal for this would be a heavier interruption than the action deserves, and would take the
 * pointer away from what it belongs to. `skip` is for the case where the press is the repair the
 * screen is asking for.
 */
function ConfirmButton({ label, confirmLabel, skip = false, busy, onConfirm }: {
  label: string
  confirmLabel: string
  skip?: boolean
  busy: boolean
  onConfirm: () => Promise<void>
}) {
  const [armed, setArmed] = useState(false)
  return <button
    type="button"
    className={`stamp${armed ? ' armed' : ''}`}
    disabled={busy}
    // The row list is rebuilt after every write, so an armed button that lost its row cannot
    // fire on whatever slid into its place.
    onBlur={() => setArmed(false)}
    onClick={() => {
      if (skip || armed) return void onConfirm()
      setArmed(true)
    }}
  ><span>{armed ? confirmLabel : label}</span></button>
}

function UnlinkedPanel({ onSignIn, onLinkToken, busy, error }: {
  onSignIn: (email: string, password: string) => Promise<void>
  onLinkToken: (token: string) => Promise<void>
  busy: boolean
  error: string | null
}) {
  const t = useMessages()
  return <section className="page" aria-labelledby="orders-title">
    <div className="page-head">
      <h1 id="orders-title" className="page-title">{t.orders.title}</h1>
      <p className="page-note">{t.orders.optionalNote}</p>
    </div>

    {error && <p className="error-banner" role="alert">{error}</p>}

    <LinkForms onSignIn={onSignIn} onLinkToken={onLinkToken} busy={busy} />
  </section>
}

/**
 * The two ways back in, of equal standing wherever they appear: the unlinked screen, and the
 * needs_relink screen where a refused credential leaves the player with no obvious next click.
 * Extracted so a re-link is not a second, drifting copy of these two forms.
 */
function LinkForms({ onSignIn, onLinkToken, busy }: {
  onSignIn: (email: string, password: string) => Promise<void>
  onLinkToken: (token: string) => Promise<void>
  busy: boolean
}) {
  const t = useMessages()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [token, setToken] = useState('')

  return <div className="clause-pair">
    <article>
      <h2>{t.orders.signIn}</h2>
      <p className="prose">{t.orders.signInNote}</p>
      <form onSubmit={event => { event.preventDefault(); void onSignIn(email, password) }}>
        <label className="dial-slot">
          <span>{t.orders.email}</span>
          <input type="email" aria-label={t.orders.email} value={email} onChange={event => setEmail(event.target.value)} disabled={busy} />
        </label>
        <label className="dial-slot">
          <span>{t.orders.password}</span>
          <input type="password" aria-label={t.orders.password} value={password} onChange={event => setPassword(event.target.value)} disabled={busy} />
        </label>
        <button type="submit" className="stamp" disabled={busy}><span>{busy ? t.orders.signingIn : t.orders.signIn}</span></button>
      </form>
    </article>
    <article>
      <h2>{t.orders.useToken}</h2>
      <p className="prose">{t.orders.tokenNote}</p>
      {/* A native disclosure: the steps are needed once, by the people who want this path, and
          they are long enough that leaving them open would bury the field they explain. No
          popover library for something `<details>` already does with a keyboard and a reader. */}
      <details className="token-help">
        <summary>{t.orders.whereToken}</summary>
        <ol>
          {Object.entries(t.orders.tokenSteps).map(([step, parts]) => <li key={step}>
            {parts.map((part, index) => index % 2 === 0 ? part : step === 'devTools' ? <kbd key={index}>{part}</kbd> : <b key={index}>{part}</b>)}
          </li>)}
        </ol>
        <p>{t.orders.tokenWarning}</p>
      </details>
      <form onSubmit={event => { event.preventDefault(); void onLinkToken(token) }}>
        <label className="dial-slot">
          <span>{t.orders.token}</span>
          <input type="password" aria-label={t.orders.token} value={token} onChange={event => setToken(event.target.value)} disabled={busy} />
        </label>
        <button type="submit" className="stamp" disabled={busy}><span>{busy ? t.orders.linking : t.orders.linkToken}</span></button>
      </form>
    </article>
  </div>
}
