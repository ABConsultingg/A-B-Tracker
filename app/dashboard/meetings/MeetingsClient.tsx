'use client'
import React, { useState } from 'react'
import { useRouter } from 'next/navigation'

type ActionItem = {
  title: string
  assigned_to: string | null
  due_date: string | null
  client_id: string | null
  priority: string
  create_wo: boolean
  notes: string | null
  selected: boolean
}

type Extracted = {
  meeting_title: string
  meeting_date: string | null
  participants: string[]
  summary: string
  action_items: ActionItem[]
  decisions: string[]
  key_dates: { date: string; description: string }[]
  out_of_office: { person: string; from: string; to: string; reason: string }[]
}

type Client = { id: string; name: string }
type TeamMember = { id: string; name: string; auth_user_id: string }

export default function MeetingsClient({
  currentUserId, currentMember, clients, team,
}: {
  currentUserId: string
  currentMember: any
  clients: Client[]
  team: TeamMember[]
}) {
  const router = useRouter()
  const [transcript, setTranscript] = useState('')
  const [loading, setLoading] = useState(false)
  const [extracted, setExtracted] = useState<Extracted | null>(null)
  const [pushing, setPushing] = useState(false)
  const [pushResult, setPushResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function extract() {
    if (!transcript.trim()) return
    setLoading(true)
    setError(null)
    setExtracted(null)
    setPushResult(null)
    try {
      const res = await fetch('/api/meetings/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript }),
      })
      const data = await res.json()
      if (!data.ok) { setError(data.error || 'Extraction failed'); return }
      // Add selected flag to each action item
      setExtracted({
        ...data.extracted,
        action_items: data.extracted.action_items.map((item: any) => ({ ...item, selected: item.create_wo }))
      })
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  function toggleItem(i: number) {
    if (!extracted) return
    setExtracted({
      ...extracted,
      action_items: extracted.action_items.map((item, idx) =>
        idx === i ? { ...item, selected: !item.selected } : item
      )
    })
  }

  function updateItem(i: number, field: string, value: any) {
    if (!extracted) return
    setExtracted({
      ...extracted,
      action_items: extracted.action_items.map((item, idx) =>
        idx === i ? { ...item, [field]: value } : item
      )
    })
  }

  async function pushToTracker() {
    if (!extracted) return
    setPushing(true)
    setPushResult(null)
    const selected = extracted.action_items.filter(i => i.selected)
    let created = 0
    let errors = 0

    for (const item of selected) {
      try {
        const res = await fetch('/api/claude', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [{ role: 'user', content: `Create a work order with title "${item.title}"${item.client_id ? ` for client ${item.client_id}` : ''}${item.assigned_to ? ` assigned to ${item.assigned_to}` : ''}${item.due_date ? ` due ${item.due_date}` : ''} with priority ${item.priority || 'medium'}${item.notes ? `. Notes: ${item.notes}` : ''}` }],
            authUserId: currentUserId,
            role: currentMember?.role || 'admin',
            memberName: currentMember?.name || 'Team',
          }),
        })
        const data = await res.json()
        if (data.ok) created++
        else errors++
      } catch { errors++ }
    }

    setPushResult(`✅ Created ${created} work order${created !== 1 ? 's' : ''}${errors > 0 ? ` (${errors} failed)` : ''}`)
    setPushing(false)
    if (created > 0) router.refresh()
  }

  const priorityColor: Record<string, string> = {
    urgent: '#dc2626', high: '#ea580c', medium: '#d97706', low: '#6b7280'
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '28px 24px' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'Fraunces, serif', fontSize: 28, color: 'var(--text)', margin: 0 }}>
          📋 Meeting Processor
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
          Paste a meeting transcript — Claude extracts action items and creates work orders
        </p>
      </div>

      {/* Transcript input */}
      {!extracted && (
        <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 20 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', display: 'block', marginBottom: 8 }}>
            Paste transcript
          </label>
          <textarea
            value={transcript}
            onChange={e => setTranscript(e.target.value)}
            placeholder="speaker1 00:00:00&#10;Hello everyone...&#10;&#10;speaker2 00:00:15&#10;Let's get started..."
            rows={12}
            style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px',
                     fontFamily: 'monospace', fontSize: 12, background: 'var(--bg)', color: 'var(--text)',
                     resize: 'vertical', lineHeight: 1.5 }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {transcript.length > 0 ? transcript.split('\\n').length + ' lines' : 'Supports Zoom, Teams, or any speaker-labeled transcript'}
            </span>
            <button onClick={extract} disabled={loading || !transcript.trim()}
              style={{ padding: '10px 24px', borderRadius: 8, border: 'none', background: '#1a2744',
                       color: '#b8860b', fontWeight: 700, fontSize: 14, cursor: 'pointer',
                       opacity: loading || !transcript.trim() ? 0.5 : 1 }}>
              {loading ? '⏳ Extracting...' : '✦ Extract Action Items'}
            </button>
          </div>
          {error && <div style={{ marginTop: 10, color: '#dc2626', fontSize: 13 }}>❌ {error}</div>}
        </div>
      )}

      {/* Extracted results */}
      {extracted && (
        <div>
          {/* Summary card */}
          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h2 style={{ fontFamily: 'Fraunces, serif', fontSize: 20, color: 'var(--text)', margin: '0 0 6px' }}>
                  {extracted.meeting_title}
                </h2>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
                  {extracted.meeting_date && <span>📅 {extracted.meeting_date} · </span>}
                  <span>👥 {extracted.participants.join(', ')}</span>
                </div>
                <p style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6, margin: 0 }}>{extracted.summary}</p>
              </div>
              <button onClick={() => { setExtracted(null); setPushResult(null) }}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12 }}>
                ← New transcript
              </button>
            </div>

            {extracted.decisions.length > 0 && (
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Key Decisions</div>
                {extracted.decisions.map((d, i) => (
                  <div key={i} style={{ fontSize: 13, color: 'var(--text)', marginBottom: 4 }}>• {d}</div>
                ))}
              </div>
            )}

            {extracted.out_of_office.length > 0 && (
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Out of Office</div>
                {extracted.out_of_office.map((o, i) => (
                  <div key={i} style={{ fontSize: 13, color: '#ea580c', marginBottom: 4 }}>
                    ✈️ {o.person}: {o.from} – {o.to} ({o.reason})
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Action items */}
          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontFamily: 'Fraunces, serif', fontSize: 17, color: 'var(--text)' }}>Action Items</span>
                <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--text-muted)' }}>
                  {extracted.action_items.filter(i => i.selected).length} of {extracted.action_items.length} selected for WO creation
                </span>
              </div>
            </div>
            {extracted.action_items.map((item, i) => (
              <div key={i} style={{ padding: '14px 20px', borderBottom: i < extracted.action_items.length - 1 ? '1px solid var(--border)' : 'none',
                                    background: item.selected ? 'var(--bg)' : 'transparent', opacity: item.selected ? 1 : 0.6 }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <input type="checkbox" checked={item.selected} onChange={() => toggleItem(i)}
                    style={{ marginTop: 3, width: 16, height: 16, cursor: 'pointer' }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                      <input value={item.title} onChange={e => updateItem(i, 'title', e.target.value)}
                        style={{ flex: 1, border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px',
                                 fontSize: 13, fontWeight: 600, background: 'var(--bg)', color: 'var(--text)' }} />
                      <span style={{ fontSize: 11, fontWeight: 700, color: priorityColor[item.priority] || '#6b7280',
                                     padding: '2px 8px', borderRadius: 12, border: '1px solid currentColor', whiteSpace: 'nowrap' }}>
                        {item.priority}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <select value={item.assigned_to || ''} onChange={e => updateItem(i, 'assigned_to', e.target.value || null)}
                        style={{ fontSize: 12, border: '1px solid var(--border)', borderRadius: 6, padding: '3px 8px',
                                 background: 'var(--bg)', color: 'var(--text)' }}>
                        <option value="">Unassigned</option>
                        {team.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                      </select>
                      <select value={item.client_id || ''} onChange={e => updateItem(i, 'client_id', e.target.value || null)}
                        style={{ fontSize: 12, border: '1px solid var(--border)', borderRadius: 6, padding: '3px 8px',
                                 background: 'var(--bg)', color: 'var(--text)' }}>
                        <option value="">No client</option>
                        {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                      <input type="date" value={item.due_date || ''} onChange={e => updateItem(i, 'due_date', e.target.value || null)}
                        style={{ fontSize: 12, border: '1px solid var(--border)', borderRadius: 6, padding: '3px 8px',
                                 background: 'var(--bg)', color: 'var(--text)' }} />
                    </div>
                    {item.notes && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{item.notes}</div>}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Push button */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12 }}>
            {pushResult && <span style={{ fontSize: 13, color: '#16a34a', fontWeight: 600 }}>{pushResult}</span>}
            <button onClick={pushToTracker} disabled={pushing || extracted.action_items.filter(i => i.selected).length === 0}
              style={{ padding: '12px 28px', borderRadius: 8, border: 'none', background: '#1a2744',
                       color: '#b8860b', fontWeight: 700, fontSize: 14, cursor: 'pointer',
                       opacity: pushing || extracted.action_items.filter(i => i.selected).length === 0 ? 0.5 : 1 }}>
              {pushing ? '⏳ Creating...' : `🚀 Create ${extracted.action_items.filter(i => i.selected).length} Work Order${extracted.action_items.filter(i => i.selected).length !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
