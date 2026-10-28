import { useEffect, useRef, useState } from 'react'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { getView, type AppView } from './backend'
import { RewardCards } from './RewardCards'

/*
 * The window is 180/1080 of the screen's height (`OVERLAY_HEIGHT` in `src-tauri/src/overlay_window.rs`)
 * and as wide as the game's card block, which also scales with height. So one design pixel of the
 * 1080p overlay is `100vh / 180`, and every size on the slips is a count of `--u`: the strip scales
 * as one piece and a 1280x800 screen draws the 1080p layout at 0.74, instead of cutting it off.
 */
const OVERLAY_DESIGN_HEIGHT = 180
const scale = { '--u': `calc(100vh / ${OVERLAY_DESIGN_HEIGHT})` } as React.CSSProperties

export default function RewardOverlay() {
  const [view, setView] = useState<AppView | null>(null)
  const [error, setError] = useState(false)
  const generation = useRef(0)

  useEffect(() => {
    document.documentElement.classList.add('overlay-mode')
    let active = true
    let timer: ReturnType<typeof setTimeout> | undefined
    let unlisten: UnlistenFn | undefined
    const refresh = async () => {
      const request = ++generation.current
      try {
        const next = await getView()
        if (active && request === generation.current) { setView(next); setError(false) }
      } catch {
        if (active && request === generation.current) setError(true)
      }
    }
    const poll = async () => {
      await refresh()
      if (active) timer = setTimeout(poll, 1500)
    }
    void listen('reward-updated', () => { void refresh() }).then(stop => {
      if (active) unlisten = stop
      else stop()
    })
    void poll()
    return () => { active = false; generation.current += 1; unlisten?.(); document.documentElement.classList.remove('overlay-mode'); if (timer) clearTimeout(timer) }
  }, [])

  return <main className="overlay-shell" aria-label="Reward overlay" style={scale}>
    {error ? <div className="overlay-empty">Reward data is unavailable.</div>
      : !view ? <div className="overlay-empty">Loading reward choices…</div>
        : view.reward.cards.length
          ? <RewardCards cards={view.reward.cards} bestValueIndex={view.reward.best_value_index} bestDucatIndex={view.reward.best_ducat_index} className="overlay-rewards"/>
          : <div className="overlay-empty"><strong>No reward choices detected</strong><span>Watching the active Warframe display.</span></div>}
  </main>
}
