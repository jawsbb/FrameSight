export type IconName = 'collection' | 'mastery' | 'relics' | 'foundry' | 'market' | 'rewards' | 'orders' | 'diagnostics' | 'settings' | 'refresh' | 'search' | 'previous' | 'next' | 'close'

/** Line icons on a 24px grid, one round stroke throughout. */
export function Icon({ name }: { name: IconName }) {
  const paths = {
    collection: <><rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/></>,
    mastery: <><circle cx="12" cy="12" r="8.5"/><path d="m8.5 12.2 2.4 2.4 4.6-5.1"/></>,
    relics: <><path d="M12 3 18.5 8v8L12 21l-6.5-5V8z"/><path d="m5.5 8 6.5 4 6.5-4M12 12v9"/></>,
    market: <><path d="M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7l8.3 8.3a1.5 1.5 0 0 1 0 2.1l-6.1 6.1a1.5 1.5 0 0 1-2.1 0z"/><circle cx="8" cy="8" r="1.5"/></>,
    rewards: <><path d="M7.5 4h9v5a4.5 4.5 0 0 1-9 0z"/><path d="M7.5 6H5a2.5 2.5 0 0 0 2.6 3.4M16.5 6H19a2.5 2.5 0 0 1-2.6 3.4M12 13.5V17M8.5 20h7"/></>,
    orders: <><path d="M6 3.5h12v17l-3-2-3 2-3-2-3 2z"/><path d="M9 8.5h6M9 12.5h4"/></>,
    diagnostics: <path d="M3 12h4l2.5-6.5 5 13 2.5-6.5h4"/>,
    settings: <><path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/></>,
    refresh: <><path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 4.5v4h-4"/></>,
    search: <><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></>,
    previous: <path d="m14.5 6-6 6 6 6"/>,
    next: <path d="m9.5 6 6 6-6 6"/>,
    // An anvil: the horn on the left, the face, the waist and a flared foot.
    foundry: <path d="M5.5 6h15v4h-6v3c0 1.4 1.3 2.6 3.5 3.1V19H6v-2.9c2.2-.5 3.5-1.7 3.5-3.1v-3H9C6.4 10 4.3 9 2.5 7.2 3.6 6.4 4.6 6 5.5 6z"/>,
    close: <path d="m6.5 6.5 11 11M17.5 6.5l-11 11"/>,
  }
  return <svg className="icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>
}
