import { useEffect, useRef, useState } from 'react'

// Animates a number from its previous value to the next one. Respects
// prefers-reduced-motion by snapping instantly instead of tweening.
export default function useCountUp(value, duration = 600) {
  const [display, setDisplay] = useState(value)
  const fromRef = useRef(value)
  const frameRef = useRef(null)

  useEffect(() => {
    const target = Number(value) || 0
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduceMotion) {
      setDisplay(target)
      fromRef.current = target
      return
    }

    const from = fromRef.current
    if (from === target) return
    const start = performance.now()

    const tick = (now) => {
      const progress = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - progress, 3)
      const current = Math.round(from + (target - from) * eased)
      setDisplay(current)
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(tick)
      } else {
        fromRef.current = target
      }
    }

    frameRef.current = requestAnimationFrame(tick)
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
    }
  }, [value, duration])

  return display
}
