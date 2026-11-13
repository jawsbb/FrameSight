import { useRef, useState } from 'react'
import type { CollectionItem, MarketOrder } from '../backend'
import { atMaxRank, rankLabel } from '../collection'
import { listedLabel } from '../orders'
import { MetalMark } from '../MetalMark'
import type { SellHandler, UpdateHandler } from '../SellForm'
import { useMessages } from '../i18n'

/** What a page knows about one row beyond the row itself; the card and its sheet both read it. */
export type EntryContext = { ownershipVerified: boolean; missingLabel?: string; showDucats: boolean; listedOrder: MarketOrder | null; sellable: boolean; onSell: SellHandler; onUpdate: UpdateHandler; busy: boolean }

/**
 * One tile of the grid, kept to what a glance across a page of them needs: the art, the name, how
 * many are held, the states that change a decision (rank, mastered, listed, gained this session)
 * and the two values. The category, the stack totals and the sale live in the item sheet the tile
 * opens, so a page shows half again as many items as a card that carried them all.
 *
 * `onOpen` opens the item's sheet, with the control focus goes back to when it closes.
 */
export function CollectionEntry({ item, onOpen, ...context }: EntryContext & { item: CollectionItem; onOpen?: (trigger: HTMLElement) => void }) {
  const { ownershipVerified, missingLabel, showDucats, listedOrder } = context
  const t = useMessages()
  const opener = useRef<HTMLButtonElement>(null)
  const missing = item.quantity === 0
  const [artFailed, setArtFailed] = useState(false)
  // The rank belongs in the accessible name: a mod held at two ranks is two cards headed the same
  // word, and without it they are indistinguishable to anyone not reading the badges.
  const rank = rankLabel(item, t)
  const label = rank ? `${item.name}, ${rank}` : item.name
  // The name is the keyboard's way in; anywhere else on the card opens the same sheet for the
  // pointer.
  return <article className="card" aria-label={label} data-held={item.quantity > 0 ? 'true' : 'false'} onClick={onOpen && (event => {
    if (opener.current && !(event.target as Element).closest('button, input, select, textarea, label, a, form')) onOpen(opener.current)
  })}>
    <div className="card-art">
      {item.image_url && !artFailed
        ? <img src={item.image_url} alt="" loading="lazy" decoding="async" onError={() => setArtFailed(true)}/>
        : <span aria-hidden="true">{t.categories[item.category].slice(0, 2)}</span>}
    </div>
    <h2 className="card-name" title={item.name}>{onOpen
      ? <button ref={opener} type="button" className="card-open" aria-haspopup="dialog" onClick={event => onOpen(event.currentTarget)}>{item.name}</button>
      : item.name}</h2>
    <div className="card-foot">
      <div className="tags">
        {ownershipVerified
          ? missing
            ? <span className="tag absent">{missingLabel ?? t.card.missing}</span>
            // The count alone reads at a glance; the words are for whoever cannot see the tile.
            : <span className="tag count"><span aria-hidden="true">×{item.quantity}</span><span className="sr-only">{t.card.owned(item.quantity)}</span></span>
          : null}
        {ownershipVerified && item.gained !== undefined && <span className="tag gained">{t.card.gained(item.gained)}</span>}
        {rank && <span className={`tag rank${atMaxRank(item) ? ' maxed' : ''}`}>{rank}</span>}
        {ownershipVerified && item.mastered && <span className="tag mastered">{t.card.mastered}</span>}
        {listedOrder && <span className="tag listed">{listedLabel(listedOrder, item.quantity, t)}</span>}
      </div>
      <div className="card-values">
        {item.platinum !== undefined && <span className="value plat">
          <MetalMark metal="plat" alt={t.card.platinum}/>
          {item.platinum_ceiling === undefined
            ? <b>{item.platinum}</b>
            // Nobody sells a half-ranked card, so the market brackets it without ever quoting it.
            // The two ends are what is known; a single number here would be invented.
            : <b title={t.card.rankBracket}>{item.platinum}–{item.platinum_ceiling}</b>}
        </span>}
        {/* Baro's price, beside the market's. It is a fact of the item rather than of a holding,
            so it reads on a missing part too. */}
        {showDucats && item.ducats !== undefined && <span className="value ducat">
          <MetalMark metal="ducat" alt={t.card.ducat}/>
          <b>{item.ducats}</b>
        </span>}
        {/* The backend pairs `live` with a price today, but the view allows one without the other,
            and "Checked live" next to no figure reads as a value that is missing by mistake. */}
        {item.live && item.platinum === undefined && <span className="checked-live">{t.card.noMarketPrice}</span>}
      </div>
    </div>
  </article>
}
