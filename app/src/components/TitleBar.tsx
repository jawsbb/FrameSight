import { useEffect, useState } from 'react'
import { closeWindow, minimizeWindow, readWindowMaximized, toggleMaximizeWindow, watchWindowResized } from '../window'
import { useMessages } from '../i18n'

/**
 * Minimize, maximize and close. The maximize control is named by what it does next (restore while
 * maximized), because a button whose name never changes cannot say which press undoes the other.
 */
function WindowControls() {
  const t = useMessages()
  const [maximized, setMaximized] = useState(false)
  useEffect(() => {
    let active = true
    let unlisten: (() => void) | undefined
    void readWindowMaximized().then(value => { if (active) setMaximized(value) })
    void watchWindowResized(() => {
      void readWindowMaximized().then(value => { if (active) setMaximized(value) })
    }).then(fn => {
      if (active) unlisten = fn
      else fn()
    })
    return () => {
      active = false
      unlisten?.()
    }
  }, [])
  return <div className="window-controls" role="group" aria-label={t.window.group}>
    <button type="button" className="window-control" aria-label={t.window.minimize} onClick={() => { void minimizeWindow() }}>
      <svg viewBox="0 0 10 10" aria-hidden="true"><path d="M1 5h8"/></svg>
    </button>
    <button type="button" className="window-control" aria-label={maximized ? t.window.restore : t.window.maximize} onClick={() => { void toggleMaximizeWindow() }}>
      {maximized
        ? <svg viewBox="0 0 10 10" aria-hidden="true"><path d="M3.5 3.5h5v5h-5zM6.5 3.5v-2h-5v5h2"/></svg>
        : <svg viewBox="0 0 10 10" aria-hidden="true"><path d="M1.5 1.5h7v7h-7z"/></svg>}
    </button>
    <button type="button" className="window-control close" aria-label={t.window.close} onClick={() => { void closeWindow() }}>
      <svg viewBox="0 0 10 10" aria-hidden="true"><path d="M1 1l8 8M9 1L1 9"/></svg>
    </button>
  </div>
}

/** The window has no compositor decorations: this bar is its titlebar. `deep` makes every part of
 * it a grab handle except the controls standing on it. */
export function TitleBar() {
  return <header className="titlebar" data-tauri-drag-region="deep">
    <span className="brand">
      <svg className="brand-mark" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="2"/><path d="M12 1.75v4.5M12 17.75v4.5M1.75 12h4.5M17.75 12h4.5"/></svg>
      <span className="wordmark">TennoScope</span>
    </span>
    <WindowControls/>
  </header>
}
