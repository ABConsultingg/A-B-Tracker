'use client'

import { useEffect, useState, useCallback } from 'react'

export type ViewMode = 'admin' | 'team'

const KEY = 'abViewMode'

/**
 * View mode controls whether the user sees admin-only elements (costs, Finance/Services/Clients
 * sidebar items, etc.) or the simplified Team view. Only admins can switch modes; non-admins are
 * forced into 'team' regardless of what's in localStorage.
 *
 * Persists in localStorage. Updates across components in the same tab via a window event so the
 * sidebar toggle immediately reflects in the board.
 */
export function useViewMode(isAdmin: boolean): [ViewMode, (m: ViewMode) => void] {
  const [mode, setMode] = useState<ViewMode | null>(null)

  // Hydrate from localStorage on mount
  useEffect(() => {
    if (!isAdmin) {
      setMode('team')
      return
    }
    try {
      const stored = localStorage.getItem(KEY)
      if (stored === 'team' || stored === 'admin') setMode(stored)
    } catch {}
    // Listen for changes from other components in the same tab
    function onChange(e: Event) {
      const detail = (e as CustomEvent).detail as ViewMode | undefined
      if (detail === 'admin' || detail === 'team') setMode(detail)
    }
    window.addEventListener('ab-view-mode-change', onChange)
    return () => window.removeEventListener('ab-view-mode-change', onChange)
  }, [isAdmin])

  const change = useCallback((next: ViewMode) => {
    if (!isAdmin && next === 'admin') return // Non-admins can't escape team mode
    try { localStorage.setItem(KEY, next) } catch {}
    setMode(next)
    window.dispatchEvent(new CustomEvent('ab-view-mode-change', { detail: next }))
  }, [isAdmin])

  return [mode ?? (isAdmin ? 'admin' : 'team'), change]
}
