import { pageNumbers } from '../collection'
import { Icon } from './Icon'
import { useMessages } from '../i18n'

export function Pagination({ current, total, onChange }: { current: number; total: number; onChange: (page: number) => void }) {
  const t = useMessages()
  if (total <= 1) return null
  const pages = pageNumbers(current, total)
  return <nav className="pagination" aria-label={t.grid.pages}>
    <button type="button" disabled={current === 1} aria-label={t.grid.previous} onClick={() => onChange(current - 1)}><Icon name="previous"/></button>
    {pages.map((page, index) => <span key={page} className="page-slot">
      {index > 0 && page - pages[index - 1] > 1 ? <i aria-hidden="true">…</i> : null}
      <button type="button" aria-current={page === current ? 'page' : undefined} aria-label={t.grid.goTo(page)} onClick={() => onChange(page)}>{page}</button>
    </span>)}
    <button type="button" disabled={current === total} aria-label={t.grid.next} onClick={() => onChange(current + 1)}><Icon name="next"/></button>
  </nav>
}
