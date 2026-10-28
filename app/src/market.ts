/** What the Market page computes and remembers, kept apart from what it draws. */
import type { BoardRow, LiveOrder, MarketHit, Refinement } from './backend'
import type { Messages } from './i18n'
import { relicLabel } from './relics'

/** An item looked at, with the day of the summary its figures came from. */
export type Viewed = { hit: MarketHit; dumpDate: string | null }
export type Side = 'sell' | 'buy'

const RECENT_LIMIT = 8

/**
 * Viewed this session, newest first. Module state on purpose: it outlives a change of page, dies
 * with the window, and nothing in it is worth storing.
 */
let recent: Viewed[] = []

export function viewedRecently(): Viewed[] {
  return recent
}

export function rememberViewed(viewed: Viewed): Viewed[] {
  recent = [viewed, ...recent.filter(entry => entry.hit.slug !== viewed.hit.slug)].slice(0, RECENT_LIMIT)
  return recent
}

export function forgetRecentForTests(): void {
  recent = []
}

/** The line warframe.market itself offers to paste in game, addressed to the trader. */
export function whisper(order: LiveOrder, item: string, side: Side): string {
  const named = order.rank === null ? item : `${item} (rank ${order.rank})`
  return `/w ${order.user} Hi! I want to ${side === 'sell' ? 'buy' : 'sell'}: "${named}" for ${order.platinum} platinum. (warframe.market)`
}

/** A board row's name; a relic tier (`Meso I3 Relic (Radiant)`) the way the Relics page names it. */
export function boardName(row: BoardRow, t: Messages): string {
  const relic = /^(.+) Relic(?: \((\w+)\))?$/.exec(row.name)
  if (!relic) return row.name
  return relicLabel({ name: relic[1], refinement: (relic[2]?.toLowerCase() ?? 'intact') as Refinement }, t)
}
