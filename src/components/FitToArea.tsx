// Scales its content up (CSS zoom) to the largest size that still fits the
// available area without scrolling — so a screen of controls like the FX
// panel fills a big window instead of sitting small in its top corner.
// Never scales below 1: in a small window the content keeps its normal
// size and the area scrolls.
import { useLayoutEffect, useRef, type ReactNode } from 'react'

const MAX_ZOOM = 2.5

export function FitToArea({ children }: { children: ReactNode }) {
  const areaRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const area = areaRef.current
    const content = contentRef.current
    if (!area || !content) return
    function fit() {
      const width = area!.clientWidth
      const height = area!.clientHeight
      if (!width || !height) return
      // Content height at `z`: laid out at width/z, so it fills the width
      // once zoomed. Taller as z grows (bigger, and fewer grid columns), so
      // a binary search finds the largest z that fits.
      const heightAt = (z: number) => {
        content!.style.zoom = String(z)
        content!.style.width = `${width / z}px`
        return content!.getBoundingClientRect().height
      }
      let low = 1
      let high = MAX_ZOOM
      if (heightAt(low) <= height) {
        for (let i = 0; i < 10; i++) {
          const mid = (low + high) / 2
          if (heightAt(mid) <= height) low = mid
          else high = mid
        }
      }
      heightAt(low)
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(area)
    return () => observer.disconnect()
  }, [])

  return (
    // Still scrollable, in case the content grows after it was fitted.
    <div ref={areaRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden' }}>
      <div ref={contentRef}>{children}</div>
    </div>
  )
}
