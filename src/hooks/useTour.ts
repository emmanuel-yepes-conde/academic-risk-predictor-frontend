import { useState, useEffect } from 'react'

/**
 * useTour
 * -------
 * Manages the lifecycle of a role-specific guided tour.
 *
 * - Auto-starts after 1.2 s on first visit (key not in localStorage).
 * - Waits until `blocked` is false before auto-starting (e.g. consent modal open).
 * - Listens for the global DOM event `ar:start-tour` so the Header
 *   "?" button can re-trigger the tour from anywhere.
 * - Marks the tour as seen in localStorage when finished or skipped.
 */
export function useTour(key: string, userId?: string, blocked = false) {
  const storageKey = userId ? `ar-tour-${userId}-${key}` : `ar-tour-${key}`
  const [run, setRun] = useState(false)
  const [pendingStart, setPendingStart] = useState(false)

  useEffect(() => {
    // Auto-start on first visit — but only schedule once
    const timer = setTimeout(() => {
      if (!localStorage.getItem(storageKey)) {
        setPendingStart(true)
      }
    }, 1200)

    // Allow the Header "?" button to re-trigger
    const handler = () => {
      if (!blocked) {
        setRun(true)
      } else {
        setPendingStart(true)
      }
    }
    window.addEventListener('ar:start-tour', handler)

    return () => {
      clearTimeout(timer)
      window.removeEventListener('ar:start-tour', handler)
    }
  }, [storageKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // Fire the tour as soon as pendingStart=true AND blocked=false
  useEffect(() => {
    if (pendingStart && !blocked) {
      setRun(true)
      setPendingStart(false)
    }
  }, [pendingStart, blocked])

  const onTourEnd = () => {
    localStorage.setItem(storageKey, '1')
    setRun(false)
  }

  return { run, setRun, onTourEnd }
}
