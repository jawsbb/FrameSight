import type { ReactNode } from 'react'
import { Icon, type IconName } from './Icon'

/** Nothing to show, as one tile: the page's icon, what is missing, and what would fill it. */
export function EmptyState({ icon, title, detail, action }: { icon: IconName; title: string; detail: string; action?: ReactNode }) {
  return <div className="empty-state">
    <Icon name={icon}/>
    <h2>{title}</h2>
    <p>{detail}</p>
    {action}
  </div>
}
