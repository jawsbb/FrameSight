import { useCallback, useState } from 'react'
import type { CollectionItem } from '../backend'

/** Which row of a page's filtered list has its sheet open, and the control focus returns to. */
export function useItemSheet(items: readonly CollectionItem[]) {
  const [open, setOpen] = useState<{ id: string; trigger: HTMLElement } | null>(null)
  const index = open ? items.findIndex(item => item.id === open.id) : -1
  // Stable while the sheet stays open, so its listener for a press outside is not re-added each poll.
  const close = useCallback(() => {
    open?.trigger.focus()
    setOpen(null)
  }, [open])
  return {
    item: index >= 0 ? items[index] : null,
    index,
    total: items.length,
    open: (id: string, trigger: HTMLElement) => setOpen({ id, trigger }),
    step: (delta: number) => {
      const next = items[index + delta]
      if (open && next) setOpen({ ...open, id: next.id })
    },
    close,
  }
}
