// src/components/ContextMenu.tsx
//
// A right-click menu at the pointer, kept on screen: a menu opened on the
// last row of a list, or by the window's edge, used to run under the player
// or off the window. It opens where asked, then moves back inside by
// however much it sticks out — again whenever its size changes (a submenu's
// field appearing, a longer list).
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { contextMenuStyle } from './contextMenuStyles'

const MARGIN = 8
// Between the pointer and a menu that opens upwards.
const ABOVE_GAP = 8

// Where a box of this size goes so that it is whole inside the window.
export function keepOnScreen(x: number, y: number, width: number, height: number, windowWidth: number, windowHeight: number): { left: number; top: number } {
  return {
    left: Math.max(MARGIN, Math.min(x, windowWidth - width - MARGIN)),
    top: Math.max(MARGIN, Math.min(y, windowHeight - height - MARGIN)),
  }
}

export function ContextMenu({
  x,
  y,
  above,
  onClose,
  style,
  children,
}: {
  x: number
  y: number
  // Opens upwards from the pointer (the player's menus, at the bottom of
  // the window, where a menu below would cover what was clicked).
  above?: boolean
  // Esc closes the menu, where the owner says how.
  onClose?: () => void
  style?: CSSProperties
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ left: x, top: y })
  useEffect(() => {
    if (!onClose) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])
  useLayoutEffect(() => {
    const menu = ref.current
    if (!menu) return
    const place = () => {
      const rect = menu.getBoundingClientRect()
      const next = keepOnScreen(x, above ? y - ABOVE_GAP - rect.height : y, rect.width, rect.height, window.innerWidth, window.innerHeight)
      setPosition((current) => (current.left === next.left && current.top === next.top ? current : next))
    }
    place()
    const observer = new ResizeObserver(place)
    observer.observe(menu)
    window.addEventListener('resize', place)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', place)
    }
  }, [x, y, above])
  return (
    // Taller than the window: it scrolls instead of losing its last items.
    <div ref={ref} onClick={(e) => e.stopPropagation()} style={{ ...contextMenuStyle, maxHeight: `calc(100vh - ${2 * MARGIN}px)`, overflowY: 'auto', ...style, ...position }}>
      {children}
    </div>
  )
}
