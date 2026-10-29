import type { AppView } from './backend'
import { en, type Messages } from './i18n/en'

type Snapshot = AppView['collection']['snapshot']

/** Relative and absolute readings of one instant. */
export type Reading = { relative: string; exact: string }

/** Both readings in the catalog's locale rather than the system's, so a language reads the same
 * on every machine: `4 minutes ago` / `il y a 4 minutes`. */
function readingOf(observed: Date, now: Date, t: Messages): Reading | null {
  if (Number.isNaN(observed.getTime())) return null
  const elapsedSeconds = Math.max(0, Math.floor((now.getTime() - observed.getTime()) / 1000))
  const ago = new Intl.RelativeTimeFormat(t.locale, { numeric: 'always' })
  let relative = t.freshness.justNow
  if (elapsedSeconds >= 86_400) relative = ago.format(-Math.floor(elapsedSeconds / 86_400), 'day')
  else if (elapsedSeconds >= 3_600) relative = ago.format(-Math.floor(elapsedSeconds / 3_600), 'hour')
  else if (elapsedSeconds >= 60) relative = ago.format(-Math.floor(elapsedSeconds / 60), 'minute')
  return {
    relative,
    exact: new Intl.DateTimeFormat(t.locale, { dateStyle: 'medium', timeStyle: 'medium' }).format(observed),
  }
}

/** Reads a backend stamp string, or `null` when it holds no usable time. Health rows and the market
 * order fetch time are emitted as Unix seconds (`now_unix_seconds`, `SystemTime::as_secs`) while the
 * price-dump row keeps a calendar date, so digit-only stamps are read as seconds and everything else
 * is left to `Date`. Owning that test here is what keeps callers from re-deriving it. Read as a
 * calendar string, `1785492000` is not a 2026 date but `Invalid Date`. */
export function stampReading(value: string, now = new Date(), t: Messages = en): Reading | null {
  return readingOf(/^\d{9,}$/.test(value) ? new Date(Number(value) * 1000) : new Date(value), now, t)
}

/** The sidebar's label and hover/screen-reader detail for the inventory snapshot. */
export function snapshotFreshness(snapshot: Snapshot, now = new Date(), t: Messages = en): { label: string; detail: string } {
  if (!snapshot) return { label: t.freshness.noSync, detail: t.freshness.noSyncDetail }
  const origin = t.freshness.origin(snapshot.source, snapshot.game_build)
  const reading = readingOf(new Date(snapshot.observed_at * 1000), now, t)
  if (!reading) return { label: t.freshness.syncUnavailable, detail: origin }
  return { label: t.freshness.synced(reading.relative), detail: `${reading.exact} · ${origin}` }
}
