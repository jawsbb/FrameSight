import { useState, type ReactNode } from 'react'

/**
 * A label beside a rail control, shown on hover and on focus, gone on Escape or when either
 * leaves. Not `title`: a native tooltip waits a second, never shows on focus and cannot be styled.
 * The control keeps its own accessible name; this is what the eye reads.
 */
export function Tip({ text, children }: { text: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return <div
    className="tip-anchor"
    onMouseEnter={() => setOpen(true)}
    onMouseLeave={() => setOpen(false)}
    onFocus={() => setOpen(true)}
    onBlur={() => setOpen(false)}
    onKeyDown={event => { if (event.key === 'Escape') setOpen(false) }}
  >
    {children}
    {open && <span className="tip" role="tooltip">{text}</span>}
  </div>
}
