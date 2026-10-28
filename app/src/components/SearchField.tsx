import { Icon } from './Icon'
import { useMessages } from '../i18n'

export function SearchField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const t = useMessages()
  return <label className="search">
    <Icon name="search"/>
    <input type="search" aria-label={label} placeholder={t.grid.searchPlaceholder} value={value} onChange={event => onChange(event.target.value)}/>
  </label>
}
