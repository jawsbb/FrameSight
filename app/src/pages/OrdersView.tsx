import { useState } from 'react'
import type { CollectionItem, MarketAccount, ReconciledOrder } from '../backend'
import { SellForm, type SellHandler, type UpdateHandler } from '../SellForm'
import { backingLabel, fixLabel, isFlagged, isListable, listedOrderFor, orderValue, sortOrders, statusLabel, uncountedReason } from '../orders'
import { stampReading } from '../freshness'
import { MetalMark } from '../MetalMark'
import { Stat } from '../components/Stat'
import { useMessages } from '../i18n'
import { EmptyState } from '../components/EmptyState'

type OrdersViewProps = {
  account: MarketAccount
  onSignIn: (email: string, password: string) => Promise<void>
  onLinkToken: (token: string) => Promise<void>
  onSignOut: () => Promise<void>
  onRefresh: () => Promise<void>
  onRemove: (orderId: string) => Promise<void>
  onLowerTo: (orderId: string, quantity: number) => Promise<void>
  onSell: SellHandler
  onUpdate: UpdateHandler
  items: CollectionItem[]
  busy: boolean
  error: string | null
}

export function OrdersView({ account, onSignIn, onLinkToken, onSignOut, onRefresh, onRemove, onLowerTo, onSell, onUpdate, items, busy, error }: OrdersViewProps) {
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
      <p className="page-note">{t.orders.note}</p>
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

    {!needsRelink && <NewListing items={items} orders={account.orders} listable={account.listable} busy={busy} onSell={onSell} onUpdate={onUpdate}/>}

    {account.orders.length
      ? <ul className="group docket" aria-label={t.orders.list}>
        {sortOrders(account.orders).map(entry => <li key={entry.order.id}>
          <OrderRow entry={entry} items={items} busy={busy} onRemove={onRemove} onLowerTo={onLowerTo} onSell={onSell} onUpdate={onUpdate} />
        </li>)}
      </ul>
      : <EmptyState icon="orders" title={t.orders.none} detail={t.orders.noneDetail}/>}
  </section>
}

/**
 * One order, as a ledger line rather than a collection card. An order has no art to show and its
 * figures are read down a column (price against price, quantity against quantity), so the
 * columns are fixed and the fix button sits in a reserved slot that stays empty on the rows that
 * need nothing. A row whose button appeared and vanished would shift the rows beneath it.
 *
 * The edit form opens in place, spanning the row's full width beneath its figures: the change is
 * being made to this row, and moving it somewhere else would take the numbers it edits out of the
 * line they are read against.
 */
function OrderRow({ entry, items, busy, onRemove, onLowerTo, onSell, onUpdate }: {
  entry: ReturnType<typeof sortOrders>[number]
  items: CollectionItem[]
  busy: boolean
  onRemove: (orderId: string) => Promise<void>
  onLowerTo: (orderId: string, quantity: number) => Promise<void>
  onSell: SellHandler
  onUpdate: UpdateHandler
}) {
  const t = useMessages()
  const [editing, setEditing] = useState(false)
  const flagged = isFlagged(entry.status)
  const label = statusLabel(entry, t)
  const fix = fixLabel(entry.status, t)
  const value = orderValue(entry.order)
  const overshoot = entry.status.state === 'overshoot' ? entry.status.owned : null
  // The edit is bounded by a holding, so it is offered only where the order names one held row.
  // A set, a sculpture, a buy order: real rows, no edit, same honesty as everywhere else.
  const held = entry.order.kind === 'sell' && entry.row_id
    ? items.find(item => item.id === entry.row_id && item.quantity > 0)
    : undefined
  return <article className={`docket-line${flagged ? ' doubt' : ''}`} aria-label={entry.name ?? entry.order.item_id}>
    {/* A flagged row carries a dot as well as a colour, so it reads as flagged without the hue.
        Ordinary rows keep the empty slot so the names still line up. */}
    <span className={`line-mark${flagged ? ' flagged' : ''}`} aria-hidden="true" />
    <h2 className="line-name" title={entry.name ?? entry.order.item_id}>{entry.name ?? entry.order.item_id}</h2>
    <span className="line-figure">
      {entry.order.platinum}<MetalMark metal="plat" alt={t.units.platinum} className="line-metal"/>
      <i>× {entry.order.quantity}</i>
    </span>
    {/* Every row states its own share of the headline figure, or why it has none. The total is a
        sum of these and nothing else, so it can be checked by reading down the column. */}
    <span className="line-value">{value === null
      ? <em>{uncountedReason(entry.order, t)}</em>
      : <>{value}<MetalMark metal="plat" alt={t.units.platinum} className="line-metal"/></>}</span>
    <span className="line-claim" title={label ?? undefined}>{label}</span>
    <span className="line-fix">
      {/* The count is read out here rather than inside the handler: a narrowing on a property
          does not survive into a closure, so `entry.status.owned` there is not the overshoot's. */}
      {overshoot !== null && <button
        type="button"
        className="stamp"
        disabled={busy}
        onClick={() => onLowerTo(entry.order.id, overshoot)}
      ><span>{fix}</span></button>}
      {held && <button
        type="button"
        className="stamp"
        disabled={busy}
        onClick={() => setEditing(true)}
      ><span>{t.orders.editListing}</span></button>}
      {/* A flagged row's removal is the repair it asks for and goes on one press. */}
      <ConfirmButton
        label={t.orders.removeListing}
        confirmLabel={t.orders.confirmRemove}
        skip={entry.status.state === 'missing'}
        busy={busy}
        onConfirm={() => onRemove(entry.order.id)}
      />
    </span>
    {held && editing && <SellForm
      item={held}
      listing={entry.order}
      busy={busy}
      onSell={onSell}
      onUpdate={onUpdate}
      onDone={() => setEditing(false)}
    />}
  </article>
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

/**
 * Publishing from the orders screen, where the player is looking at listings rather than at items.
 *
 * The picker is over the same collection the cards are drawn from and the same listable set the
 * backend authorises against, so an item that cannot be sold from a card cannot be sold from here
 * either. The refusal lives in one place, on the backend, and neither surface offers what it
 * would refuse.
 *
 * A row that is already listed opens the form as an edit of that listing, for the same reason the
 * card offers "Sell more": warframe.market allows one sell order per item, and a create against an
 * existing one would be refused by the market after the request.
 *
 * Typed rather than picked from a list. A collection runs to a couple of thousand items, and no
 * one scrolls a list that long to find the one they already have a name for, so the field takes
 * the name and the list answers with the few that match.
 */
function NewListing({ items, orders, listable, busy, onSell, onUpdate }: {
  items: CollectionItem[]
  orders: ReconciledOrder[]
  listable: string[]
  busy: boolean
  onSell: SellHandler
  onUpdate: UpdateHandler
}) {
  const t = useMessages()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [chosen, setChosen] = useState('')
  const sellable = items.filter(item => isListable(item, listable))
  if (!sellable.length) return null
  const item = sellable.find(entry => entry.id === chosen)
  const listing = item ? listedOrderFor(orders, item.id) : null

  function close() {
    setOpen(false)
    setQuery('')
    setChosen('')
  }

  if (!open) {
    return <div className="toolbar">
      <button type="button" className="stamp" disabled={busy} onClick={() => setOpen(true)}><span>{t.orders.newListing}</span></button>
    </div>
  }

  const needle = query.trim().toLowerCase()
  // Shown only once the query narrows things: the whole collection listed under an empty field is
  // the wall of names this control exists to avoid. The cap is on what is drawn, and the count
  // below says how many were left out, so a too-broad query reads as too broad rather than as all
  // there is.
  const matches = needle ? sellable.filter(entry => entry.name.toLowerCase().includes(needle)) : []
  const shown = matches.slice(0, 8)

  return <div className="new-listing">
    <div className="new-listing-head">
      <h2>{t.orders.newListing}</h2>
      <button type="button" className="stamp" disabled={busy} onClick={close}><span>{t.orders.cancel}</span></button>
    </div>
    {item
      ? <>
        <p className="new-listing-chosen">
          <b>{item.name}</b> <i>· {t.orders.held(item.quantity)}</i>
          <button type="button" className="link-button" disabled={busy} onClick={() => setChosen('')}>{t.orders.chooseAnother}</button>
        </p>
        <SellForm item={item} listing={listing ?? undefined} busy={busy} onSell={onSell} onUpdate={onUpdate} onDone={close}/>
      </>
      : <>
        <label className="dial-slot">
          <span>{t.orders.item}</span>
          <input
            type="search"
            aria-label={t.orders.item}
            placeholder={t.orders.itemPlaceholder}
            value={query}
            autoFocus
            onChange={event => setQuery(event.target.value)}
            disabled={busy}
          />
        </label>
        {needle && (shown.length
          ? <ul className="pick-list">
            {shown.map(entry => <li key={entry.id}>
              <button type="button" disabled={busy} onClick={() => setChosen(entry.id)}>
                <span className="pick-name">{entry.name}</span>
                <span className="pick-held">{t.orders.held(entry.quantity)}</span>
              </button>
            </li>)}
          </ul>
          : <p className="pick-empty">{t.orders.noneSellable}</p>)}
        {matches.length > shown.length && <p className="pick-more">{t.orders.moreMatch(matches.length - shown.length)}</p>}
      </>}
  </div>
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
