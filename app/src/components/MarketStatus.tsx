import { useEffect, useId, useRef, useState } from 'react'
import type { MarketAccount, Presence } from '../backend'
import { useMessages } from '../i18n'

type Mark = Presence | 'offline' | 'refused'

/** A status as a shape and a colour, always beside its word: a dot is online, a dot in a ring is
 * in game, a dashed ring is invisible, an empty ring is offline, a triangle is a refused link. */
function PresenceMark({ status }: { status: Mark }) {
  return <svg className={`presence-mark ${status}`} viewBox="0 0 12 12" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    {status === 'online' ? <circle cx="6" cy="6" r="3.5" fill="currentColor" stroke="none"/>
      : status === 'ingame' ? <><circle cx="6" cy="6" r="2.25" fill="currentColor" stroke="none"/><circle cx="6" cy="6" r="5"/></>
        : status === 'invisible' ? <circle cx="6" cy="6" r="4" strokeDasharray="2 2"/>
          : status === 'refused' ? <path d="M6 1.5 11 10.5H1z"/>
            : <circle cx="6" cy="6" r="4"/>}
  </svg>
}

/**
 * What warframe.market shows this account as, from the title bar of every page: a pill that
 * names the status and opens the choices beneath it. Unlinked, the pill says so and opens Orders,
 * where the account is linked.
 *
 * Four choices, three of which are values the server accepts. Offline is the fourth and is not one
 * of them: warframe.market has no settable `offline`, and going offline means closing the socket,
 * so the control says the word the player means and the backend spells it as a disconnection.
 *
 * Automatic is not a fifth choice beside them. It is how the choice is *made*, so it sits on its
 * own line as a toggle, and the status it settles on is marked in the same list a hand-picked one
 * would be; the player still reads their status in one place either way.
 *
 * The list marks what was asked for, so a press registers on the press. What the server has
 * actually committed is a separate claim, made in the note below: the socket takes a moment to
 * answer, and a switch that stayed blank across that moment read as broken.
 */
export function MarketStatus({ account, busy, onPresence, onLink }: {
  account: MarketAccount
  busy: boolean
  onPresence: (status: Presence | null, auto: boolean) => Promise<void>
  onLink: () => void
}) {
  const t = useMessages()
  const p = t.orders.presence
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const pill = useRef<HTMLButtonElement>(null)
  const menuId = useId()
  const titleId = useId()

  useEffect(() => {
    if (!open) return
    // Focus lands on the status in force, or on the automatic switch when the list only reports.
    const menu = document.getElementById(menuId)
    ;(menu?.querySelector<HTMLElement>('[aria-pressed="true"]:not(:disabled)') ?? menu?.querySelector<HTMLElement>('button:not(:disabled), input:not(:disabled)'))?.focus()
    const away = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false) }
    document.addEventListener('pointerdown', away)
    return () => document.removeEventListener('pointerdown', away)
  }, [open, menuId])

  if (account.link !== 'linked') {
    const word = account.link === 'needs_relink' ? p.relink : p.notLinked
    return <div className="market-status">
      <button type="button" className="market-pill" aria-label={`${p.label}: ${word}. ${p.linkInOrders}`} onClick={onLink}>
        <PresenceMark status={account.link === 'needs_relink' ? 'refused' : 'offline'}/>{word}
        <svg className="market-chevron go" viewBox="0 0 10 10" aria-hidden="true"><path d="m2.5 3.75 2.5 2.5 2.5-2.5"/></svg>
      </button>
    </div>
  }

  const { presence } = account
  const wanted = presence.wanted ?? null
  const settled = presence.status === wanted
  const shown = p[wanted ?? 'offline']
  const choices: { value: Presence | null; label: string }[] = [
    { value: null, label: p.offline },
    { value: 'online', label: p.online },
    { value: 'ingame', label: p.ingame },
    { value: 'invisible', label: p.invisible },
  ]
  function close() {
    setOpen(false)
    pill.current?.focus()
  }

  return <div
    className="market-status"
    ref={root}
    onKeyDown={event => { if (event.key === 'Escape' && open) close() }}
    // Tabbing out closes it; focus dropped to nothing (a choice disabled while it is sent) does not.
    onBlur={event => { if (event.relatedTarget && !root.current?.contains(event.relatedTarget)) setOpen(false) }}
  >
    <button
      type="button"
      ref={pill}
      className="market-pill"
      aria-label={`${p.label}: ${shown}${presence.auto ? `, ${p.auto}` : ''}`}
      aria-expanded={open}
      aria-controls={open ? menuId : undefined}
      data-pending={!settled || undefined}
      onClick={() => setOpen(!open)}
    >
      <PresenceMark status={wanted ?? 'offline'}/>{shown}{presence.auto && <i>{p.autoShort}</i>}
      <svg className="market-chevron" viewBox="0 0 10 10" aria-hidden="true"><path d="m2.5 3.75 2.5 2.5 2.5-2.5"/></svg>
    </button>
    {/* The title bar is a grab handle; the menu standing on it is not. */}
    {open && <div className="market-menu" id={menuId} data-tauri-drag-region="false">
      <span className="market-menu-title" id={titleId}>{p.label}</span>
      <div className="market-choices" role="group" aria-labelledby={titleId} data-auto={presence.auto || undefined}>
        {choices.map(choice => <button
          key={choice.label}
          type="button"
          aria-pressed={wanted === choice.value}
          // In automatic mode the list reports rather than accepts: pressing one would silently be
          // overridden by the next poll, and a control that undoes itself is worse than a disabled one.
          disabled={busy || presence.auto}
          onClick={() => { void onPresence(choice.value, false); close() }}
        ><PresenceMark status={choice.value ?? 'offline'}/>{choice.label}</button>)}
      </div>
      {/* A real checkbox: it is a mode with two states, a reader announces it as one without
          being told to, and the space bar works on it for free. */}
      <label className="presence-auto">
        <input
          type="checkbox"
          checked={presence.auto}
          disabled={busy}
          onChange={event => { void onPresence(event.target.checked ? null : wanted, event.target.checked) }}
        />
        <span>{p.auto}</span>
      </label>
      <p className="presence-note" role="status">{
        !settled ? p.asking
          : presence.auto ? p.following(p.words[wanted ?? 'offline'])
            : wanted ? p.held
              : p.silent
      }</p>
    </div>}
  </div>
}
