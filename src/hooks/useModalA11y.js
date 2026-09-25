import { useEffect, useRef } from 'react'

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

// Shared behavior for every modal/drawer/overlay: Escape-to-close, Tab focus trapping,
// initial focus on open, and focus restoration to the trigger element on close.
export default function useModalA11y(isOpen, onClose) {
  const containerRef = useRef(null)
  const previouslyFocused = useRef(null)

  useEffect(() => {
    if (!isOpen) return

    previouslyFocused.current = document.activeElement

    const focusFirst = () => {
      const first = containerRef.current?.querySelector(FOCUSABLE_SELECTOR)
      first?.focus()
    }
    // Wait a tick so the panel is mounted/painted before moving focus
    const focusTimer = window.setTimeout(focusFirst, 0)

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose?.()
        return
      }
      if (e.key !== 'Tab' || !containerRef.current) return
      const nodes = containerRef.current.querySelectorAll(FOCUSABLE_SELECTOR)
      if (nodes.length === 0) return
      const first = nodes[0]
      const last = nodes[nodes.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      window.clearTimeout(focusTimer)
      document.removeEventListener('keydown', handleKeyDown)
      previouslyFocused.current?.focus?.()
    }
  }, [isOpen, onClose])

  return containerRef
}
