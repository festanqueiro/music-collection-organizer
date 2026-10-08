// The popover a toolbar button opens above itself (Audio, Cast, Mic, Record,
// Second screen): placed over the button and kept inside the window, closed
// by a click outside it or Esc.
import { useEffect, useRef, useState } from 'react'

export function useToolbarPopover(width: number) {
  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState<{ left: number; bottom: number } | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onMouseDown(e: MouseEvent) {
      const target = e.target as Node
      if (!popoverRef.current?.contains(target) && !buttonRef.current?.contains(target)) setOpen(false)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onMouseDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  function toggleOpen(e: React.MouseEvent<HTMLButtonElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    setAnchor({
      left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
      bottom: window.innerHeight - rect.top + 8,
    })
    setOpen((v) => !v)
    // Otherwise the focused button swallows Space (play/pause).
    e.currentTarget.blur()
  }

  return { open, anchor, buttonRef, popoverRef, toggleOpen }
}
