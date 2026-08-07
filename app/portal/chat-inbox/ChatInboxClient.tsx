'use client'
import { useMemo, useState } from 'react'

export type ChatSession = {
  id: string
  created_at: string
  status: 'new' | 'contacted' | 'not_a_lead' | string
  page_url: string | null
  device: string | null
  message_count: number | null
  duration_seconds: number | null
  booked_call: boolean | null
  lead_captured: boolean | null
  lead_name: string | null
  lead_email: string | null
  lead_company: string | null
  services_mentioned: string[] | null
  pain_points: string | null
  transcript: string | null
}

// Mirrors chatbot_sessions_status_check.
const STATUSES = [
  { id: 'new',         label: 'New',         color: '#0ea5e9' },
  { id: 'contacted',   label: 'Contacted',   color: '#16a34a' },
  { id: 'not_a_lead',  label: 'Not a Lead',  color: '#6b7280' },
] as const

const statusMeta = (s: string) => STATUSES.find(x => x.id === s) ?? { id: s, label: s, color: '#6b7280' }

const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  })

const fmtDuration = (s: number | null) => {
  if (!s || s <= 0) return null
  const m = Math.floor(s / 60)
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`
}

function Kpi({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div style={{
      border: `1px solid ${accent ? `${accent}40` : '#e5e7eb'}`, borderRadius: 12,
      padding: '12px 16px', background: 'white', minWidth: 140, flex: 1,
    }}>
      <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
                    letterSpacing: '0.05em', color: '#6b7280' }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4, color: accent ?? '#111827' }}>
        {value}
      </div>
    </div>
  )
}

export default function ChatInboxClient({ initialSessions }: { initialSessions: ChatSession[] }) {
  const [sessions, setSessions] = useState<ChatSession[]>(initialSessions)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<string>('all')

  const kpis = useMemo(() => ({
    total: sessions.length,
    leads: sessions.filter(s => s.lead_captured).length,
    booked: sessions.filter(s => s.booked_call).length,
    unread: sessions.filter(s => s.status === 'new').length,
  }), [sessions])

  const visible = useMemo(
    () => (filter === 'all' ? sessions : sessions.filter(s => s.status === filter)),
    [sessions, filter]
  )

  async function setStatus(id: string, status: string) {
    setSavingId(id)
    setError(null)
    // Optimistic: revert on failure so the badge can't lie about what was saved.
    const prev = sessions
    setSessions(list => list.map(s => (s.id === id ? { ...s, status } : s)))
    try {
      const res = await fetch('/api/portal/chat-inbox', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `Could not update (${res.status})`)
      }
    } catch (e) {
      setSessions(prev)
      setError(e instanceof Error ? e.message : 'Could not update status')
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 20px 48px' }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: '#111827', margin: 0 }}>💬 Chat Inbox</h1>
      <p style={{ fontSize: 13, color: '#6b7280', margin: '4px 0 0' }}>
        Conversations from the chat assistant on your website. Newest first.
      </p>

      {error && (
        <div style={{ marginTop: 12, padding: '8px 12px', background: '#fef2f2',
                      color: '#b91c1c', border: '1px solid #fecaca', borderRadius: 8, fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* KPI bar */}
      <div style={{ display: 'flex', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
        <Kpi label="Total Chats" value={kpis.total} />
        <Kpi label="Leads Captured" value={kpis.leads} accent="#16a34a" />
        <Kpi label="Calls Booked" value={kpis.booked} accent="#0ea5e9" />
        <Kpi label="Unread" value={kpis.unread} accent={kpis.unread > 0 ? '#d97706' : undefined} />
      </div>

      {/* Status filter */}
      <div style={{ display: 'flex', gap: 6, marginTop: 20, flexWrap: 'wrap' }}>
        {[{ id: 'all', label: 'All' }, ...STATUSES].map(f => {
          const active = filter === f.id
          return (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              style={{
                padding: '5px 12px', borderRadius: 16, fontSize: 12, fontWeight: 600,
                cursor: 'pointer', border: '1px solid #e5e7eb',
                background: active ? '#0f1b34' : 'white',
                color: active ? 'white' : '#374151',
              }}
            >
              {f.label}
            </button>
          )
        })}
      </div>

      {/* List */}
      <div style={{ marginTop: 14, border: '1px solid #e5e7eb', borderRadius: 12,
                    overflow: 'hidden', background: 'white' }}>
        {visible.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', color: '#6b7280', fontSize: 14 }}>
            {sessions.length === 0
              ? 'No chat conversations yet. They appear here as soon as visitors use the chat assistant on your site.'
              : 'No conversations match this filter.'}
          </div>
        )}

        {visible.map((s, i) => {
          const meta = statusMeta(s.status)
          const isOpen = expanded === s.id
          return (
            <div key={s.id} style={{ borderTop: i === 0 ? 'none' : '1px solid #f3f4f6' }}>
              {/* Row */}
              <div
                onClick={() => setExpanded(isOpen ? null : s.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
                         cursor: 'pointer', background: isOpen ? '#fafafa' : 'white' }}
              >
                <span style={{ fontSize: 12, color: '#9ca3af', width: 12, flexShrink: 0 }}>
                  {isOpen ? '▾' : '▸'}
                </span>

                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#111827',
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.lead_name || 'Anonymous visitor'}
                    {s.lead_company && (
                      <span style={{ fontWeight: 400, color: '#6b7280' }}> · {s.lead_company}</span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                    {s.lead_email || 'no email captured'} · {fmtWhen(s.created_at)}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  {s.lead_captured && (
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 10,
                                   background: '#16a34a15', color: '#16a34a', whiteSpace: 'nowrap' }}>
                      LEAD
                    </span>
                  )}
                  {s.booked_call && (
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 10,
                                   background: '#0ea5e915', color: '#0ea5e9', whiteSpace: 'nowrap' }}>
                      CALL BOOKED
                    </span>
                  )}
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 10,
                                 background: `${meta.color}15`, color: meta.color, whiteSpace: 'nowrap' }}>
                    {meta.label.toUpperCase()}
                  </span>
                </div>
              </div>

              {/* Expanded */}
              {isOpen && (
                <div style={{ padding: '4px 16px 18px 40px', background: '#fafafa' }}>
                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12,
                                color: '#4b5563', marginBottom: 12 }}>
                    {s.page_url && (
                      <span>Page: <a href={s.page_url} target="_blank" rel="noreferrer"
                                     style={{ color: '#1d4ed8' }}>{s.page_url}</a></span>
                    )}
                    {s.device && <span>Device: {s.device}</span>}
                    {s.message_count != null && <span>{s.message_count} messages</span>}
                    {fmtDuration(s.duration_seconds) && <span>Duration: {fmtDuration(s.duration_seconds)}</span>}
                  </div>

                  {(s.services_mentioned?.length || s.pain_points) && (
                    <div style={{ fontSize: 12, color: '#4b5563', marginBottom: 12 }}>
                      {s.services_mentioned?.length ? (
                        <div>Services mentioned: <strong>{s.services_mentioned.join(', ')}</strong></div>
                      ) : null}
                      {s.pain_points ? <div>Pain points: <strong>{s.pain_points}</strong></div> : null}
                    </div>
                  )}

                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                                letterSpacing: '0.05em', color: '#6b7280', marginBottom: 6 }}>
                    Transcript
                  </div>
                  <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 8,
                                padding: 12, fontSize: 13, lineHeight: 1.6, color: '#111827',
                                whiteSpace: 'pre-wrap', maxHeight: 380, overflowY: 'auto' }}>
                    {s.transcript || 'No transcript recorded for this conversation.'}
                  </div>

                  {/* Status toggle */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                                   letterSpacing: '0.05em', color: '#6b7280' }}>
                      Mark as
                    </span>
                    {STATUSES.map(st => {
                      const current = s.status === st.id
                      return (
                        <button
                          key={st.id}
                          onClick={() => !current && setStatus(s.id, st.id)}
                          disabled={current || savingId === s.id}
                          style={{
                            padding: '5px 12px', borderRadius: 16, fontSize: 12, fontWeight: 600,
                            cursor: current || savingId === s.id ? 'default' : 'pointer',
                            border: `1px solid ${current ? st.color : '#e5e7eb'}`,
                            background: current ? st.color : 'white',
                            color: current ? 'white' : st.color,
                            opacity: savingId === s.id && !current ? 0.5 : 1,
                          }}
                        >
                          {st.label}
                        </button>
                      )
                    })}
                    {savingId === s.id && (
                      <span style={{ fontSize: 11, color: '#6b7280' }}>saving…</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
