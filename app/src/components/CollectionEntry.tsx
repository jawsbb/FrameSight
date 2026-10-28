import { useState } from 'react'
import type { CollectionItem, MarketOrder } from '../backend'
import { atMaxRank, rankLabel, stackValue } from '../collection'
import { listedLabel } from '../orders'
import { MetalMark } from '../MetalMark'
import { SellForm, type SellHandler, type UpdateHandler } from '../SellForm'
import { useMessages } from '../i18n'

export function CollectionEntry({ item, ownershipVerified, missingLabel, showDucats, listedOrder, sellable, onSell, onUpdate, busy }: { item: CollectionItem; ownershipVerified: boolean; missingLabel?: string; showDucats: boolean; listedOrder: MarketOrder | null; sellable: boolean; onSell: SellHandler; onUpdate: UpdateHandler; busy: boolean }) {
  const t = useMessages()
  const missing = item.quantity === 0
  const [artFailed, setArtFailed] = useState(false)
  const [selling, setSelling] = useState(false)
  // The rank belongs in the accessible name: a mod held at two ranks is two cards headed the same
  // word, and without it they are indistinguishable to anyone not reading the badges.
  const rank = rankLabel(item, t)
  const label = rank ? `${item.name}, ${rank}` : item.name
  // Nothing offered on a card whose whole holding is already listed: the badge says so, and the
  // market allows one sell order per item. A listing that covers part of the holding keeps the
  // control, as an edit of the listing that already stands.
  const remaining = sellable && (!listedOrder || listedOrder.quantity < item.quantity)
  return <article className="card" aria-label={label} data-held={item.quantity > 0 ? 'true' : 'false'}>
    <div className="card-art">
      {item.image_url && !artFailed
        ? <img src={item.image_url} alt={item.name} loading="lazy" decoding="async" onError={() => setArtFailed(true)}/>
        : <span aria-hidden="true">{t.categories[item.category].slice(0, 2)}</span>}
    </div>
    <div className="card-body">
      <h2 className="card-name" title={item.name}>{item.name}</h2>
      <span className="card-meta">{t.categories[item.category]}</span>
      <div className="tags">
        {ownershipVerified
          ? missing
            ? <span className="tag absent">{missingLabel ?? t.card.missing}</span>
            : <span className="tag">{t.card.owned(item.quantity)}</span>
          : null}
        {rank && <span className={`tag rank${atMaxRank(item) ? ' maxed' : ''}`}>{rank}</span>}
        {ownershipVerified && item.mastered && <span className="tag mastered">{t.card.mastered}</span>}
        {listedOrder && <span className="tag listed">{listedLabel(listedOrder, item.quantity, t)}</span>}
      </div>
    </div>
    <div className="card-values">
      {item.platinum !== undefined && <span className="value plat">
        <MetalMark metal="plat" alt={t.card.platinum}/>
        {item.platinum_ceiling === undefined
          ? <>
            <b>{item.platinum}</b>
            {ownershipVerified && item.quantity > 1 && <em>{t.card.total(stackValue(item) ?? 0)}</em>}
          </>
          // Nobody sells a half-ranked card, so the market brackets it without ever quoting it.
          // The two ends are what is known; a single number here would be invented.
          : <b title={t.card.rankBracket}>
            {item.platinum}–{item.platinum_ceiling}
          </b>}
      </span>}
      {/* Baro's price, beside the market's. It is a fact of the item rather than of a holding,
          so it reads on a missing part too, and it totals like platinum does. */}
      {showDucats && (item.ducats !== undefined
        ? <span className="value ducat">
          <MetalMark metal="ducat" alt={t.card.ducat}/>
          <b>{item.ducats}</b>
          {ownershipVerified && item.quantity > 1 && <em>{t.card.total(item.ducats * item.quantity)}</em>}
        </span>
        : item.category === 'prime_part' && <span className="value-missing">{t.card.ducatUnavailable}</span>)}
      {/* The backend pairs `live` with a price today, but the view allows one without the other, and
          "Checked live" next to no figure reads as a value that is missing by mistake. */}
      {item.live && <span className="checked-live">{item.platinum === undefined ? t.card.noMarketPrice : t.card.checkedLive}</span>}
      {/* On the value line, so a sellable card is no taller than its neighbours. */}
      {remaining && !selling && <button type="button" className="stamp sell-open" disabled={busy} onClick={() => setSelling(true)}>{listedOrder ? t.card.sellMore : t.card.sell}</button>}
    </div>
    {remaining && selling && <SellForm item={item} listing={listedOrder ?? undefined} busy={busy} onSell={onSell} onUpdate={onUpdate} onDone={() => setSelling(false)}/>}
  </article>
}
