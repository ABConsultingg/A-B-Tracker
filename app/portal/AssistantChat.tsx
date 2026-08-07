'use client'
// app/portal/AssistantChat.tsx
//
// The chat surface for the portal assistant. Used two ways:
//   - variant="page"  — /portal/assistant, fills the page
//   - variant="panel" — inside the floating bubble, fixed height
//
// Conversation state lives here and the full array is posted on every turn;
// the API is stateless. Nothing is persisted, so a reload starts fresh.
import { useEffect, useRef, useState } from 'react'

const NAVY = '#0f1b34'
const BORDER = '#e5e7eb'

export type Msg = { role: 'user' | 'assistant'; content: string }

const SUGGESTIONS = [
  'What needs my approval?',
  "What's in progress right now?",
  "What's going out on social this month?",
  "What's coming up in the next two weeks?",
]

export default function AssistantChat({
  clientName,
  variant = 'page',
}: {
  clientName: string
  variant?: 'page' | 'panel'
}) {
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const isPanel = variant === 'panel'

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, busy])

  async function send(text: string) {
    const content = text.trim()
    if (!content || busy) return

    const next: Msg[] = [...messages, { role: 'user', content }]
    setMessages(next)
    setInput('')
    setError(null)
    setBusy(true)

    try {
      const res = await fetch('/api/portal/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next }),
      })

      if (!res.ok) {
        // Distinguish the cases the client can actually act on.
        const msg =
          res.status === 401
            ? 'Your session expired. Please sign in again.'
            : res.status === 403
            ? 'Your portal access is not active. Contact your account manager.'
            : res.status === 429
            ? 'Too many messages in a short time. Give it a moment and try again.'
            : (await res.json().catch(() => null))?.error ||
              'Something went wrong. Please try again.'
        setError(msg)
        return
      }

      const data = await res.json()
      setMessages([...next, { role: 'assistant', content: data.reply }])
    } catch {
      setError('Could not reach the assistant. Check your connection and try again.')
    } finally {
      setBusy(false)
      inputRef.current?.focus()
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send(input)
    }
  }

  const empty = messages.length === 0

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: isPanel ? 460 : 'calc(100vh - 190px)',
        minHeight: isPanel ? 460 : 420,
        background: 'white',
        border: `1px solid ${BORDER}`,
        borderRadius: 12,
        overflow: 'hidden',
      }}
    >
      {/* Messages */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: isPanel ? 14 : 20 }}>
        {empty && (
          <div style={{ maxWidth: 520, margin: isPanel ? '8px auto' : '32px auto', textAlign: 'center' }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>💬</div>
            <div style={{ fontWeight: 600, color: NAVY, fontSize: isPanel ? 15 : 17 }}>
              Ask about your account
            </div>
            <p style={{ color: '#6b7280', fontSize: 13, margin: '8px 0 18px', lineHeight: 1.5 }}>
              I can see {clientName}&rsquo;s projects, deadlines, schedule, and social plan.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  style={{
                    background: '#fafaf7',
                    border: `1px solid ${BORDER}`,
                    borderRadius: 16,
                    padding: '7px 14px',
                    fontSize: 12.5,
                    color: NAVY,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
              marginBottom: 12,
            }}
          >
            <div
              style={{
                maxWidth: '80%',
                padding: '10px 14px',
                borderRadius: 12,
                fontSize: 13.5,
                lineHeight: 1.55,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                background: m.role === 'user' ? NAVY : '#f4f4f1',
                color: m.role === 'user' ? 'white' : '#1f2937',
                border: m.role === 'user' ? 'none' : `1px solid ${BORDER}`,
              }}
            >
              {m.content}
            </div>
          </div>
        ))}

        {busy && (
          <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 12 }}>
            <div
              style={{
                padding: '10px 14px',
                borderRadius: 12,
                background: '#f4f4f1',
                border: `1px solid ${BORDER}`,
                fontSize: 13,
                color: '#6b7280',
              }}
            >
              Thinking&hellip;
            </div>
          </div>
        )}

        {error && (
          <div
            role="alert"
            style={{
              padding: '9px 12px',
              background: '#fef2f2',
              color: '#b91c1c',
              border: '1px solid #fecaca',
              borderRadius: 8,
              fontSize: 12.5,
            }}
          >
            {error}
          </div>
        )}
      </div>

      {/* Composer */}
      <div style={{ borderTop: `1px solid ${BORDER}`, padding: 10, background: '#fcfcfa' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder="Ask about your projects, deadlines, or social plan…"
            disabled={busy}
            style={{
              flex: 1,
              resize: 'none',
              border: `1px solid ${BORDER}`,
              borderRadius: 8,
              padding: '10px 12px',
              fontSize: 13.5,
              fontFamily: 'inherit',
              lineHeight: 1.5,
              maxHeight: 120,
              outline: 'none',
              background: 'white',
            }}
          />
          <button
            onClick={() => send(input)}
            disabled={busy || !input.trim()}
            style={{
              background: busy || !input.trim() ? '#d1d5db' : NAVY,
              color: 'white',
              border: 'none',
              borderRadius: 8,
              padding: '10px 18px',
              fontSize: 13.5,
              fontWeight: 600,
              cursor: busy || !input.trim() ? 'default' : 'pointer',
              fontFamily: 'inherit',
              flexShrink: 0,
            }}
          >
            Send
          </button>
        </div>
        <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 6, textAlign: 'center' }}>
          Answers come from your account data. For anything else, contact your account manager.
        </div>
      </div>
    </div>
  )
}
