'use client'
import { useState, useEffect } from 'react'

type Call = {
  id: string
  call_date: string
  call_time: string | null
  caller_name: string | null
  caller_phone: string | null
  duration_sec: number
  topic: string | null
  is_new_lead: boolean
  is_existing_customer: boolean
  is_qualified: boolean
  is_spam: boolean
  call_summary: string | null
  how_heard: string | null
  lsa_matched: boolean
  appointment_booked: boolean
  crm_entered: boolean
  crm_type: string | null
}

type CallsData = {
  total: number
  newLeads: number
  qualified: number
  existing: number
  spam: number
  lsaMatched: number
  avgDuration: number
  topics: { topic: string; count: number }[]
  calls: Call[]
}

function fmt(n: number) { return n.toLocaleString() }
function dur(sec: number) {
  if (!sec) return '—'
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

export default function CallsTab({ clientId, month, crmType = 'acculynx' }: { clientId: string; month: string; crmType?: string }) {
  const [data, setData] = useState<CallsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'leads' | 'qualified' | 'existing' | 'spam'>('all')
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [updating, setUpdating] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/reports/calls?clientId=${clientId}&month=${month}`)
      .then(r => r.json())
      .then(d => { setData(d.data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [clientId, month])

  async function toggleField(call: Call, field: 'appointment_booked' | 'crm_entered') {
    setUpdating(call.id)
    const newVal = !call[field]
    await fetch('/api/reports/calls', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: call.id, [field]: newVal }),
    })
    setData(prev => prev ? {
      ...prev,
      calls: prev.calls.map(c => c.id === call.id ? { ...c, [field]: newVal } : c)
    } : prev)
    setUpdating(null)
  }

  if (loading) return <div style={{ padding: '32px 0', color: 'var(--text-muted)', fontSize: 14 }}>Loading calls…</div>
  if (!data || data.total === 0) return <div style={{ padding: '32px 0', color: 'var(--text-muted)', fontSize: 14 }}>No call data for this period. Make sure the Cira Chrome extension has been run for this month.</div>

  const filtered = data.calls.filter(c => {
    if (filter === 'leads' && !c.is_new_lead) return false
    if (filter === 'qualified' && !c.is_qualified) return false
    if (filter === 'existing' && !c.is_existing_customer) return false
    if (filter === 'spam' && !c.is_spam) return false
    if (search) {
      const q = search.toLowerCase()
      return (c.caller_name || '').toLowerCase().includes(q) ||
        (c.call_summary || '').toLowerCase().includes(q) ||
        (c.topic || '').toLowerCase().includes(q) ||
        (c.caller_phone || '').includes(q)
    }
    return true
  })

  const NAVY = 'var(--brand-navy, #0f1e3f)'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>
        {[
          { label: 'Total Calls', value: fmt(data.total), color: NAVY },
          { label: 'New Leads', value: fmt(data.newLeads), color: '#2563eb', sub: `${data.total > 0 ? Math.round(data.newLeads/data.total*100) : 0}% of calls` },
          { label: 'Qualified', value: fmt(data.qualified), color: '#16a34a', sub: `${data.newLeads > 0 ? Math.round(data.qualified/data.newLeads*100) : 0}% of leads` },
          { label: 'Existing', value: fmt(data.existing), color: '#d97706' },
          { label: 'Spam / No Response', value: fmt(data.spam), color: '#9ca3af' },
          { label: 'LSA Matched', value: fmt(data.lsaMatched), color: '#7c3aed' },
          { label: 'Avg Duration', value: dur(data.avgDuration), color: NAVY },
        ].map(k => (
          <div key={k.label} className="rounded-xl border p-4" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}>
            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.7px', color: 'var(--text-muted)', fontWeight: 600, marginBottom: 4 }}>{k.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: k.color }}>{k.value}</div>
            {k.sub && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{k.sub}</div>}
          </div>
        ))}
      </div>

      {/* Topics */}
      {data.topics.length > 0 && (
        <div className="rounded-xl border p-4" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>Call topics (excluding spam)</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {data.topics.map(t => (
              <div key={t.topic} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: 20, background: 'var(--bg)', border: '1px solid var(--border)', fontSize: 12 }}>
                <span style={{ color: 'var(--text)' }}>{t.topic}</span>
                <span style={{ fontWeight: 700, color: NAVY }}>{t.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters + search */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {([['all', 'All', data.total], ['leads', 'New Leads', data.newLeads], ['qualified', 'Qualified', data.qualified], ['existing', 'Existing', data.existing], ['spam', 'Spam', data.spam]] as const).map(([f, label, count]) => (
          <button key={f} onClick={() => setFilter(f)}
            style={{ fontSize: 12, fontWeight: 600, padding: '5px 12px', borderRadius: 20, cursor: 'pointer', border: '1px solid', borderColor: filter === f ? NAVY : 'var(--border)', background: filter === f ? NAVY : 'transparent', color: filter === f ? '#fff' : 'var(--text-muted)' }}>
            {label} ({count})
          </button>
        ))}
        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search name, topic, summary…"
          style={{ flex: 1, minWidth: 200, fontSize: 13, padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)' }} />
      </div>

      {/* Call list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filtered.length === 0 && <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '24px 0' }}>No calls match this filter.</div>}
        {filtered.map(call => {
          const isOpen = expanded === call.id
          const badge = call.is_spam ? { label: 'Spam', bg: '#f3f4f6', color: '#6b7280' }
            : call.is_qualified ? { label: 'Qualified Lead', bg: '#f0fdf4', color: '#16a34a' }
            : call.is_new_lead ? { label: 'New Lead', bg: '#eff6ff', color: '#2563eb' }
            : call.is_existing_customer ? { label: 'Existing', bg: '#fffbeb', color: '#d97706' }
            : { label: 'General', bg: 'var(--bg)', color: 'var(--text-muted)' }

          return (
            <div key={call.id} style={{ border: '1px solid var(--border)', borderRadius: 10, background: 'var(--bg-elevated)', overflow: 'hidden' }}>
              <button onClick={() => setExpanded(isOpen ? null : call.id)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{call.caller_name || 'Unknown caller'}</span>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 600, background: badge.bg, color: badge.color }}>{badge.label}</span>
                    {call.lsa_matched && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: '#f5f3ff', color: '#7c3aed', fontWeight: 600 }}>LSA</span>}
                    {call.topic && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{call.topic}</span>}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                    {call.call_date} {call.call_time ? `· ${call.call_time.slice(0,5)}` : ''} · {dur(call.duration_sec)} {call.caller_phone ? `· ${call.caller_phone}` : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                  {call.appointment_booked && <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 6, background: '#f0fdf4', color: '#16a34a', fontWeight: 700 }}>📅 Appt</span>}
                  {call.crm_entered && <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 6, background: '#eff6ff', color: '#2563eb', fontWeight: 700 }}>✓ CRM</span>}
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{isOpen ? '▴' : '▾'}</span>
                </div>
              </button>

              {isOpen && (
                <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--border)' }}>
                  {call.call_summary && (
                    <div style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--text-muted)', marginTop: 12, marginBottom: 12 }}>
                      {call.call_summary}
                    </div>
                  )}
                  {call.how_heard && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>
                      <strong>How they heard:</strong> {call.how_heard}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button onClick={() => toggleField(call, 'appointment_booked')} disabled={updating === call.id}
                      style={{ fontSize: 11, fontWeight: 600, padding: '5px 12px', borderRadius: 8, cursor: 'pointer', border: '1px solid', borderColor: call.appointment_booked ? '#16a34a' : 'var(--border)', background: call.appointment_booked ? '#f0fdf4' : 'transparent', color: call.appointment_booked ? '#16a34a' : 'var(--text-muted)' }}>
                      {call.appointment_booked ? '✓ Appointment booked' : '+ Mark appointment booked'}
                    </button>
                    <button onClick={() => toggleField(call, 'crm_entered')} disabled={updating === call.id}
                      style={{ fontSize: 11, fontWeight: 600, padding: '5px 12px', borderRadius: 8, cursor: 'pointer', border: '1px solid', borderColor: call.crm_entered ? '#2563eb' : 'var(--border)', background: call.crm_entered ? '#eff6ff' : 'transparent', color: call.crm_entered ? '#2563eb' : 'var(--text-muted)' }}>
                      {call.crm_entered ? `✓ In ${crmType === 'jobnimbus' ? 'JobNimbus' : 'AccuLynx'}` : `+ Mark entered in ${crmType === 'jobnimbus' ? 'JobNimbus' : 'AccuLynx'}`}
                    </button>
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
