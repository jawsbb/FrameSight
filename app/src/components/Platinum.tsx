import { figure } from '../collection'
import { MetalMark } from '../MetalMark'
import { useMessages } from '../i18n'

/** A platinum figure with the game's canister; `approx` marks an average, one decimal. */
export function Platinum({ value, approx }: { value: number; approx?: boolean }) {
  const t = useMessages()
  return <span className="value plat"><MetalMark metal="plat" alt={t.card.platinum}/><b>{approx ? t.relics.approx(value) : figure(value, t)}</b></span>
}
