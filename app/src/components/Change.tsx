import { useMessages } from '../i18n'

/** A price change with its sign, `ok` for a rise and `danger` for a fall; a dash when unknown. */
export function Change({ value }: { value: number | null }) {
  const t = useMessages()
  if (value === null) return <span className="value-missing">—</span>
  return <span className={`change ${value > 0 ? 'up' : value < 0 ? 'down' : ''}`}>{t.farm.change(value)}</span>
}
