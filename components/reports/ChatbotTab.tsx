'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Session = {
  id: string
  created_at: string
  page_url: string | null
  device: string | null
  message_count: number
  booked_call: boolean
  lead_captured: boolean
  lead_name: string | null
  lead_email: string | null
  lead_company: string | null
  lead_industry: string | null
  services_mentioned: string[] | null
  transcript: string | null
  is_ab_site: boolean
  client_name: string | null
}

export default function ChatbotTab() {
  const supabase = createClient()
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Session | null>(null)
  const [filter, setFilter] = useState<'all' | 'leads' | 'booked'>('all')

  useEffect(() => {
    fetchSessions()
  }, [])

  async function fetchSessions() {
    setLoading(true)
    const { data } = await supabase
      .from('chatbot_sessions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200)
    setSessions(data || [])
    setLoading(false)
  }

  const filtered = sessions.filter(s => {
    if (filter === 'leads') return s.lead_captured
    if (filter === 'booked') return s.booked_call
    return true
  })

  // Stats
  const total = sessions.length
  const leads = sessions.filter(s => s.lead_captured).length
  const booked = sessions.filter(s => s.booked_call).length
  const leadRate = total > 0 ? Math.round((leads / total) * 100) : 0
  const bookRate = total > 0 ? Math.round((booked / total) * 100) : 0

  // Top services
  const serviceCounts: Record<string, number> = {}
  sessions.forEach(s => {
    (s.services_mentioned || []).forEach(svc => {
      serviceCounts[svc] = (serviceCounts[svc] || 0) + 1
    })
  })
  const topServices = Object.entries(serviceCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)

  // Top pages
  const pageCounts: Record<string, number> = {}
  sessions.forEach(s => {
    if (s.page_url) {
      pageCounts[s.page_url] = (pageCounts[s.page_url] || 0) + 1
    }
  })
  const topPages = Object.entries(pageCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)

  const cell = { padding: '10px 12px', borderBottom: '1px solid var(--border)', fontSize: 13, color: 'var(--text)' }
  const th = { ...cell, fontWeight: 600, background: 'var(--bg)', color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }

  return (
    <div className="space-y-6">

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16 }}>
        {[
          { label: 'Total Sessions', value: total, icon: '💬' },
          { label: 'Leads Captured', value: leads, icon: '📋' },
          { label: 'Calls Booked', value: booked, icon: '📅' },
          { label: 'Lead Rate', value: `${leadRate}%`, icon: '📈' },
          { label: 'Booking Rate', value: `${bookRate}%`, icon: '🎯' },
        ].map(k => (
          <div key={k.label} className="rounded-xl border p-4"
            style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}>
            <div style={{ fontSize: 22 }}>{k.icon}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text)', marginTop: 4 }}>{k.value}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Top services + top pages */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="rounded-xl border p-4" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}>
          <div style={{ fontWeight: 600, marginBottom: 12, color: 'var(--text)' }}>🔥 Top Services Mentioned</div>
          {topServices.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No data yet</div>}
          {topServices.map(([svc, count]) => (
            <div key={svc} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
              <span style={{ color: 'var(--text)' }}>{svc}</span>
              <span style={{ fontWeight: 600, color: 'var(--accent)' }}>{count}</span>
            </div>
          ))}
        </div>
        <div className="rounded-xl border p-4" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}>
          <div style={{ fontWeight: 600, marginBottom: 12, color: 'var(--text)' }}>📄 Top Pages</div>
          {topPages.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No data yet</div>}
          {topPages.map(([page, count]) => (
            <div key={page} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
              <span style={{ color: 'var(--text)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{page}</span>
              <span style={{ fontWeight: 600, color: 'var(--accent)' }}>{count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Session list */}
      <div className="rounded-xl border" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 600, color: 'var(--text)' }}>💬 Chat Sessions</span>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['all', 'leads', 'booked'] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  background: filter === f ? 'var(--accent)' : 'var(--bg)',
                  color: filter === f ? 'white' : 'var(--text-muted)' }}>
                {f === 'all' ? 'All' : f === 'leads' ? 'Leads' : 'Booked'}
              </button>
            ))}
          </div>
        </div>
        {loading ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>Loading sessions...</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Time', 'Page', 'Device', 'Messages', 'Services', 'Lead', 'Booked'].map(h => (
                  <th key={h} style={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={7} style={{ ...cell, textAlign: 'center', color: 'var(--text-muted)' }}>No sessions yet</td></tr>
              )}
              {filtered.map(s => (
                <tr key={s.id} onClick={() => setSelected(s)}
                  style={{ cursor: 'pointer', background: selected?.id === s.id ? 'var(--bg)' : 'transparent' }}>
                  <td style={cell}>{new Date(s.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</td>
                  <td style={{ ...cell, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.page_url || '—'}</td>
                  <td style={cell}>{s.device || '—'}</td>
                  <td style={{ ...cell, textAlign: 'center' }}>{s.message_count}</td>
                  <td style={{ ...cell, maxWidth: 180 }}>{(s.services_mentioned || []).join(', ') || '—'}</td>
                  <td style={{ ...cell, textAlign: 'center' }}>
                    {s.lead_captured ? <span style={{ color: '#16a34a', fontWeight: 600 }}>✓ {s.lead_name || ''}</span> : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                  </td>
                  <td style={{ ...cell, textAlign: 'center' }}>
                    {s.booked_call ? <span style={{ color: '#2563eb', fontWeight: 600 }}>📅</span> : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Session detail panel */}
      {selected && (
        <div className="rounded-xl border p-5" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <span style={{ fontWeight: 600, color: 'var(--text)' }}>Session Detail</span>
            <button onClick={() => setSelected(null)} style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 18 }}>×</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            {[
              { label: 'Page', value: selected.page_url },
              { label: 'Device', value: selected.device },
              { label: 'Messages', value: selected.message_count },
              { label: 'Lead Name', value: selected.lead_name },
              { label: 'Lead Email', value: selected.lead_email },
              { label: 'Company', value: selected.lead_company },
              { label: 'Industry', value: selected.lead_industry },
              { label: 'Services', value: (selected.services_mentioned || []).join(', ') },
            ].map(({ label, value }) => (
              <div key={label}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>{label}</div>
                <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>{value || '—'}</div>
              </div>
            ))}
          </div>
          {selected.transcript && (
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>TRANSCRIPT</div>
              <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, color: 'var(--text)', background: 'var(--bg)', padding: 12, borderRadius: 8, maxHeight: 300, overflow: 'auto' }}>
                {selected.transcript}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
