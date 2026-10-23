import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react'

/**
 * Highlight that slides to the picked one of a row of buttons: the style (size and position) of a thumb laid behind
 * the `index`-th button of the `ref` box, measured from it so it follows label widths, the language and resizes.
 * The box needs `position: relative`, the thumb a transition on transform and size.
 */
export function useSlideThumb<E extends HTMLElement>(index: number, count: number) {
  const ref = useRef<E>(null)
  const [thumb, setThumb] = useState<CSSProperties | null>(null)
  useLayoutEffect(() => {
    const box = ref.current
    if (!box) return
    const measure = () => {
      const b = box.querySelectorAll('button')[index]
      setThumb(
        b ? { width: b.offsetWidth, height: b.offsetHeight, transform: `translate(${b.offsetLeft}px, ${b.offsetTop}px)` } : null,
      )
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(box)
    return () => observer.disconnect()
  }, [index, count])
  return { ref, thumb }
}
