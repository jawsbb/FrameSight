import type { ReactNode } from 'react'
import { figure } from './collection'

/** One summary figure, inline in a page head: the figure, what it counts, and an optional
 * qualification on it. The qualification is a tooltip and a spoken suffix, never visible text: in
 * a row of chips it doubled the height of the one it was on. */
export function Stat({ kind, value, unit, label, aside, note }: { kind: string; value: number | string; unit?: ReactNode; label?: string; aside?: ReactNode; note?: string }) {
  return <div className={`stat ${kind}`} data-summary={kind} data-testid={`stat-${kind}`} title={note}>
    <span className="stat-figure">{typeof value === 'number' ? figure(value) : value}{unit}</span>
    {label && <span className="stat-label">{label}</span>}
    {aside && <span className="stat-aside">{aside}</span>}
    {note && <span className="sr-only">, {note}</span>}
  </div>
}
