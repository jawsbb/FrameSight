import { useEffect, useState, type ReactNode } from 'react'
import { getFoundry, getRelics, type AccessMode, type AppView } from '../backend'
import { collectionTotals, figure, masteryProgress } from '../collection'
import { snapshotFreshness } from '../freshness'
import { Icon } from '../components/Icon'
import { Ducats, Platinum } from '../components/Platinum'
import { StateIcon } from '../components/StateIcon'
import { shortDate, useMessages } from '../i18n'
import './DashboardPage.css'

type Target = 'collection' | 'relics' | 'foundry' | 'orders' | 'rewards' | 'diagnostics'

/** Relics and foundry builds are asked for once, when the page opens: the 2.5s poll does not repeat them. */
function useOnOpen<T>(fetch: () => Promise<T>): { data: T | null; failed: boolean } {
  const [state, setState] = useState<{ data: T | null; failed: boolean }>({ data: null, failed: false })
  useEffect(() => {
    let active = true
    fetch()
      .then(data => { if (active) setState({ data, failed: false }) })
      .catch(() => { if (active) setState({ data: null, failed: true }) })
    return () => { active = false }
  }, [fetch])
  return state
}

/** A titled group of rows, and the way to the page that holds the rest. */
function Block({ id, title, link, onOpen, children }: { id: string; title: string; link: string; onOpen: () => void; children: ReactNode }) {
  return <section className="dash-block" aria-labelledby={`dash-${id}`}>
    <div className="dash-head">
      <h2 id={`dash-${id}`} className="section-title">{title}</h2>
      <button type="button" className="link-button head-link" onClick={onOpen}>{link}<Icon name="next"/></button>
    </div>
    <div className="group">{children}</div>
  </section>
}

/** What a row is on the left, with an optional note under it; its value on the right. */
function Row({ label, note, tone, children }: { label: ReactNode; note?: ReactNode; tone?: 'danger' | 'warn'; children?: ReactNode }) {
  return <div className="dash-row" data-tone={tone}>
    <span className="dash-label">{label}{note && <span className="dash-note">{note}</span>}</span>
    {children !== undefined && <span className="dash-figure">{children}</span>}
  </div>
}

/** One of the progress rows: a thin bar and the fraction it draws. */
function Progress({ label, mastered, total, percent = null }: { label: string; mastered: number; total: number; percent?: number | null }) {
  const t = useMessages()
  return <Row label={label}>
    <progress max={Math.max(total, 1)} value={mastered} aria-label={label}/>
    <span>{figure(mastered, t)}/{figure(total, t)}{percent !== null && ` · ${t.units.percent(percent)}`}</span>
  </Row>
}

/**
 * Where everything stands, read in one look: a few groups of rows from what the backend already
 * holds, each pointing at the page that holds the rest. Each group says on its own when it is
 * still loading or cannot be read, so one slow source never blanks the others.
 */
export function DashboardPage({ view, effectiveMode, priceFloor, now, onOpen, onToMaster }: { view: AppView; effectiveMode: AccessMode; priceFloor: number; now: Date; onOpen: (page: Target) => void; onToMaster: () => void }) {
  const t = useMessages()
  const d = t.dashboard
  const relics = useOnOpen(getRelics)
  const foundry = useOnOpen(getFoundry)
  const snapshotOnly = effectiveMode !== 'full'

  const { owned, worth, sellable, ducatsAtStake } = collectionTotals(view.collection.items, priceFloor)
  const collection = view.collection.items.length === 0
    ? <Row label={snapshotOnly ? t.collection.emptySnapshot : t.collection.empty} note={snapshotOnly ? t.collection.emptySnapshotDetail : t.collection.emptyDetail}/>
    : <>
      <Row label={d.marketValue}><Platinum value={worth}/></Row>
      <Row label={d.sellable} note={t.collection.sellableNote(priceFloor)}><Platinum value={sellable}/></Row>
      <Row label={d.ducats} note={d.ducatsNote}><Ducats value={ducatsAtStake}/></Row>
      <Row label={snapshotOnly ? d.savedEntries : d.items} note={d.owned(owned)}>{figure(view.collection.total_entries, t)}</Row>
    </>

  const { mastery } = view
  const progress = masteryProgress(mastery.totals)
  const masteryRows = !mastery.available
    ? <Row label={t.mastery.unavailable} note={t.mastery.unavailableDetail}/>
    : <>
      <Progress label={d.mastered} {...progress}/>
      {mastery.totals.filter(entry => entry.total > 0).map(entry => <Progress key={entry.category} label={t.categories[entry.category]} mastered={entry.mastered} total={entry.total}/>)}
    </>

  function relicRows() {
    if (relics.failed) return <Row label={t.relics.failed}/>
    if (!relics.data) return <Row label={t.relics.loading}/>
    const held = relics.data.relics
    if (!held.length) return <Row label={snapshotOnly ? t.relics.emptySnapshot : t.relics.empty} note={snapshotOnly ? t.relics.emptySnapshotDetail : t.relics.emptyDetail}/>
    const count = held.reduce((sum, relic) => sum + relic.quantity, 0)
    const valued = relics.data.prices_date !== null && relics.data.catalog
    const opening = held.reduce((sum, relic) => sum + relic.quantity * (relic.opening?.platinum ?? 0), 0)
    const best = held.flatMap(relic => relic.opening ? [{ relic, value: relic.opening.platinum }] : [])
      .toSorted((left, right) => right.value - left.value)
      .slice(0, 3)
    return <>
      <Row label={d.relicsHeld}>{figure(count, t)}</Row>
      {valued && <Row label={d.openingTotal} note={t.relics.averageNote}><Platinum value={Math.round(opening)}/></Row>}
      {valued && best.length > 0 && <>
        <p className="dash-caption">{d.bestToOpen}</p>
        {best.map(({ relic, value }) => <Row key={relic.id} label={<span className="dash-relic">{relic.name}{relic.refinement && <span className={`tag refinement ${relic.refinement}`}>{t.relics.refinements[relic.refinement]}</span>}</span>} note={t.relics.quantity(relic.quantity)}><Platinum value={value} approx/></Row>)}
      </>}
    </>
  }

  function foundryRows() {
    if (foundry.failed) return <Row label={t.foundry.failed}/>
    if (!foundry.data) return <Row label={t.foundry.loading}/>
    if (foundry.data.status === 'no_catalog') return <Row label={t.foundry.noCatalog} note={t.foundry.noCatalogDetail}/>
    if (foundry.data.status === 'no_inventory') return <Row label={t.foundry.noInventory} note={t.foundry.noInventoryDetail}/>
    const ready = foundry.data.items.filter(item => item.stage === 'ready')
    const almost = foundry.data.items.filter(item => item.stage === 'almost')
    if (!ready.length && !almost.length) return <Row label={t.foundry.empty} note={t.foundry.emptyDetail}/>
    return <>
      <Row label={t.foundry.stages.ready}>{figure(ready.length, t)}</Row>
      {ready.slice(0, 3).map(item => <Row key={item.id} label={item.name} note={item.category && t.categories[item.category]}>
        {item.set_platinum !== undefined && <Platinum value={item.set_platinum}/>}
      </Row>)}
      <Row label={t.foundry.stages.almost} note={almost.slice(0, 3).map(item => item.name).join(' · ') || undefined}>{figure(almost.length, t)}</Row>
    </>
  }

  const account = view.market_account
  const presence = t.orders.presence
  const orders = account.link === 'unlinked'
    ? <Row label={presence.notLinked} note={presence.linkInOrders}/>
    : <>
      {account.link === 'needs_relink'
        ? <Row label={t.orders.credentialRefused} note={t.orders.relinkNote} tone="warn"/>
        : <Row label={d.status}>{presence[account.presence.status ?? 'offline']}</Row>}
      <Row label={d.listed} note={d.sellOrders(account.orders.length)}><Platinum value={account.listed_platinum}/></Row>
      {/* Red only while something is flagged: a zero is not an alarm. */}
      <Row label={d.toFix} note={account.flagged ? t.orders.flaggedNote : t.orders.matchingNote} tone={account.flagged ? 'danger' : undefined}>{figure(account.flagged, t)}</Row>
    </>

  const { reward } = view
  const rewards = reward.cards.length
    ? reward.cards.map((card, index) => <Row key={`${index}-${card.name}`} label={card.name} note={index === reward.best_value_index ? d.bestValue : undefined}>
      <Platinum value={card.platinum}/>
      <Ducats value={card.ducats}/>
    </Row>)
    : <Row label={t.rewards.none} note={effectiveMode === 'companion' ? t.rewards.companionDetail : t.rewards.waiting}/>

  const readerState = effectiveMode === 'companion' ? 'idle' : view.health.game_reader.state
  const freshness = snapshotFreshness(view.collection.snapshot, now, t)
  const pricesDate = view.health.collection_prices.last_success

  return <section className="page" aria-labelledby="dashboard-title">
    <div className="page-head">
      <h1 id="dashboard-title" className="page-title">{d.title}</h1>
    </div>
    <div className="dash-columns">
      <div className="dash-column">
        <Block id="collection" title={t.nav.pages.collection} link={d.open.collection} onOpen={() => onOpen('collection')}>{collection}</Block>
        <Block id="mastery" title={d.masteryTitle} link={d.open.toMaster} onOpen={onToMaster}>{masteryRows}</Block>
        <Block id="relics" title={t.nav.pages.relics} link={d.open.relics} onOpen={() => onOpen('relics')}>{relicRows()}</Block>
      </div>
      <div className="dash-column">
        <Block id="orders" title={t.nav.pages.orders} link={d.open.orders} onOpen={() => onOpen('orders')}>{orders}</Block>
        <Block id="foundry" title={t.nav.pages.foundry} link={d.open.foundry} onOpen={() => onOpen('foundry')}>{foundryRows()}</Block>
        <Block id="rewards" title={d.lastRewards} link={d.open.rewards} onOpen={() => onOpen('rewards')}>{rewards}</Block>
        <Block id="state" title={d.state} link={d.open.diagnostics} onOpen={() => onOpen('diagnostics')}>
          <Row label={t.diagnostics.systems.game_reader} note={effectiveMode === 'companion' ? t.sidebar.companionDetail : view.health.game_reader.message}>
            <StateIcon state={readerState}/>{effectiveMode === 'companion' ? t.sidebar.companionMode : t.sidebar.reader[readerState]}
          </Row>
          <Row label={d.snapshot} note={freshness.detail}>{freshness.label}</Row>
          <Row label={d.prices}>{pricesDate ? shortDate(pricesDate, t) : t.collection.noPrices}</Row>
        </Block>
      </div>
    </div>
  </section>
}
