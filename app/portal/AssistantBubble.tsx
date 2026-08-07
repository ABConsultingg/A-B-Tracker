'use client'
// app/portal/AssistantBubble.tsx
//
// Floating launcher mounted in the portal layout, so the assistant is reachable
// from any portal page. Hidden on /portal/assistant itself, where the full page
// already shows the same component.
//
// The panel is unmounted while closed, so conversation state resets each time
// it is opened. That matches the API, which is stateless anyway.
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import AssistantChat from './AssistantChat'

const NAVY = '#0f1b34'
const GOLD = '#d99e2b'

export default function AssistantBubble({ clientName }: { clientName: string }) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  // Close on Escape.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  // The dedicated page already renders the chat; a bubble there is noise.
  if (pathname === '/portal/assistant') return null

  return (
    <>
      {open && (
        <div
          style={{
            position: 'fixed',
            bottom: 88,
            right: 24,
            width: 380,
            maxWidth: 'calc(100vw - 32px)',
            zIndex: 60,
            boxShadow: '0 12px 40px rgba(15,27,52,0.22)',
            borderRadius: 12,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              background: NAVY,
              color: 'white',
              padding: '10px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span style={{ fontWeight: 600, fontSize: 13.5, flex: 1 }}>Assistant</span>
            <a
              href="/portal/assistant"
              style={{
                color: 'rgba(255,255,255,0.7)',
                fontSize: 11.5,
                textDecoration: 'none',
                marginRight: 4,
              }}
            >
              Open full page ↗
            </a>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close assistant"
              style={{
                background: 'transparent',
                border: 'none',
                color: 'rgba(255,255,255,0.8)',
                fontSize: 18,
                lineHeight: 1,
                cursor: 'pointer',
                padding: 0,
              }}
            >
              ×
            </button>
          </div>
          <AssistantChat clientName={clientName} variant="panel" />
        </div>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Close assistant' : 'Open assistant'}
        style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          zIndex: 60,
          width: 54,
          height: 54,
          borderRadius: '50%',
          background: NAVY,
          color: GOLD,
          border: 'none',
          boxShadow: '0 6px 20px rgba(15,27,52,0.3)',
          cursor: 'pointer',
          fontSize: 22,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {open ? '×' : '💬'}
      </button>
    </>
  )
}
