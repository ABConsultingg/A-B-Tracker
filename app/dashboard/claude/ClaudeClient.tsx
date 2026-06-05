'use client'
import { useState, useRef, useEffect } from 'react'

type Message = { role: 'user' | 'assistant'; content: string }

export default function ClaudeClient({
  authUserId, role, memberName,
}: { authUserId: string; role: string; memberName: string }) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const suggestions = [
    "What's overdue right now?",
    "Show me everything in-progress for Apollo",
    "What's waiting for client approval?",
    "What did Tanya work on this week?",
    "What's our pipeline value?",
    "Which clients have the most active WOs?",
  ]

  async function send(text?: string) {
    const userText = (text || input).trim()
    if (!userText || loading) return
    setInput('')
    const newMessages: Message[] = [...messages, { role: 'user', content: userText }]
    setMessages(newMessages)
    setLoading(true)
    try {
      const res = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages, authUserId, role, memberName }),
      })
      const data = await res.json()
      setMessages(prev => [...prev, { role: 'assistant', content: data.text || 'Sorry, something went wrong.' }])
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Connection error. Please try again.' }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 56px)', background: 'var(--bg)' }}>
      {/* Header */}
      <div style={{ padding: '20px 28px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg-elevated)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 24 }}>✦</span>
          <div>
            <h1 style={{ fontFamily: 'Fraunces, serif', fontSize: 22, color: 'var(--text)', margin: 0 }}>A&B Assistant</h1>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>Ask anything about your work orders, clients, and pipeline</p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px' }}>
        {messages.length === 0 && (
          <div>
            <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 16 }}>
              Hi {memberName.split(' ')[0]}! What would you like to know?
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {suggestions.map(s => (
                <button key={s} onClick={() => send(s)}
                  style={{ padding: '8px 14px', borderRadius: 20, border: '1px solid var(--border)',
                           background: 'var(--bg-elevated)', color: 'var(--text)', fontSize: 13,
                           cursor: 'pointer', transition: 'all 0.15s' }}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {messages.map((m, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
              {m.role === 'assistant' && (
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#1a2744',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 14, marginRight: 8, flexShrink: 0, marginTop: 2 }}>✦</div>
              )}
              <div style={{
                maxWidth: '75%', padding: '10px 14px', borderRadius: 12,
                borderBottomRightRadius: m.role === 'user' ? 4 : 12,
                borderBottomLeftRadius: m.role === 'assistant' ? 4 : 12,
                background: m.role === 'user' ? '#1a2744' : 'var(--bg-elevated)',
                color: m.role === 'user' ? '#f5f3ec' : 'var(--text)',
                border: m.role === 'assistant' ? '1px solid var(--border)' : 'none',
                fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap',
              }}>
                {m.content}
              </div>
            </div>
          ))}
          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#1a2744',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>✦</div>
              <div style={{ padding: '10px 14px', borderRadius: 12, background: 'var(--bg-elevated)',
                            border: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: 14 }}>
                Thinking…
              </div>
            </div>
          )}
        </div>
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ padding: '16px 28px', borderTop: '1px solid var(--border)', background: 'var(--bg-elevated)' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
            placeholder="Ask about work orders, clients, pipeline…"
            style={{ flex: 1, padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)',
                     background: 'var(--bg)', color: 'var(--text)', fontSize: 14, fontFamily: 'inherit' }}
          />
          <button onClick={() => send()} disabled={loading || !input.trim()}
            style={{ padding: '10px 18px', borderRadius: 8, border: 'none', background: '#1a2744',
                     color: '#b8860b', fontWeight: 700, fontSize: 14, cursor: 'pointer',
                     opacity: loading || !input.trim() ? 0.5 : 1 }}>
            Send
          </button>
        </div>
        {messages.length > 0 && (
          <button onClick={() => setMessages([])}
            style={{ marginTop: 8, background: 'none', border: 'none', color: 'var(--text-muted)',
                     fontSize: 12, cursor: 'pointer' }}>
            Clear conversation
          </button>
        )}
      </div>
    </div>
  )
}
