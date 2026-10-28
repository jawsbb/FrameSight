export type IconName = 'collection' | 'mastery' | 'relics' | 'rewards' | 'orders' | 'diagnostics' | 'settings' | 'refresh' | 'search' | 'previous' | 'next'

/** Line icons on a 24px grid, one round stroke throughout. */
export function Icon({ name }: { name: IconName }) {
  const paths = {
    collection: <><rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/></>,
    mastery: <><circle cx="12" cy="12" r="8.5"/><path d="m8.5 12.2 2.4 2.4 4.6-5.1"/></>,
    relics: <><path d="M12 3 18.5 8v8L12 21l-6.5-5V8z"/><path d="m5.5 8 6.5 4 6.5-4M12 12v9"/></>,
    rewards: <><path d="M7.5 4h9v5a4.5 4.5 0 0 1-9 0z"/><path d="M7.5 6H5a2.5 2.5 0 0 0 2.6 3.4M16.5 6H19a2.5 2.5 0 0 1-2.6 3.4M12 13.5V17M8.5 20h7"/></>,
    orders: <><path d="M6 3.5h12v17l-3-2-3 2-3-2-3 2z"/><path d="M9 8.5h6M9 12.5h4"/></>,
    diagnostics: <path d="M3 12h4l2.5-6.5 5 13 2.5-6.5h4"/>,
    settings: <><path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/></>,
    refresh: <><path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 4.5v4h-4"/></>,
    search: <><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></>,
    previous: <path d="m14.5 6-6 6 6 6"/>,
    next: <path d="m9.5 6 6 6-6 6"/>,
  }
  return <svg className="icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>
}
