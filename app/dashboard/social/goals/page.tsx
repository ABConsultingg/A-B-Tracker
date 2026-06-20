'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type Goal = {
  id: string
  goal_name: string
  baseline_value: string
  target_value: string
  current_value: string
  quarter: string
  status: string
  why_this_goal: string
}

const STATUS_STYLE: Record<string, { bg: string; text: string; dot: string }> = {
  'On Track':  { bg: '#EAF3DE', text: '#3B6D11', dot: '#059669' },
  'Tracking':  { bg: '#FAEEDA', text: '#854F0B', dot: '#D97706' },
  'At Risk':   { bg: '#FCEBEB', text: '#A32D2D', dot: '#DC2626' },
  'Complete':  { bg: '#EDF4FB', text: '#185FA5', dot: '#2563EB' },
}

export default function SocialGoalsPage() {
  const [goals, setGoals] = useState<Goal[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [editStatus, setEditStatus] = useState('')

  useEffect(() => { loadGoals() }, [])

  async function loadGoals() {
    setLoading(true)
    const { data } = await supabase.from('social_goals').select('*').order('goal_name')
    setGoals(data ?? [])
    setLoading(false)
  }

  async function saveGoal(id: string) {
    await supabase.from('social_goals').update({
      current_value: editValue,
      status: editStatus,
      updated_at: new Date().toISOString(),
    }).eq('id', id)
    setEditing(null)
    loadGoals()
  }

  const ink = '#1C1917', muted = '#78716C', rule = '#E7E5E4'

  return (
    <div style={{ minHeight: '100vh', background: '#FAFAF9', color: ink, fontFamily: "'Inter', system-ui, sans-serif" }}>
      <header style={{ borderBottom: `1px solid ${rule}` }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link href="/dashboard/social" style={{ color: muted, textDecoration: 'none', fontSize: 13 }}>← Social Hub</Link>
          <span style={{ color: rule }}>/</span>
          <div>
            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, color: muted }}>Emily's Q3 2026</div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>Goals Tracker</div>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 24px' }}>
        <div style={{ marginBottom: 28 }}>
          <p style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, color: muted, marginBottom: 6 }}>June – August 2026</p>
          <h2 style={{ fontSize: 28, fontWeight: 600, letterSpacing: '-0.02em', margin: 0 }}>Where Q3 stands.</h2>
          <p style={{ color: muted, fontSize: 14, marginTop: 6 }}>6 measurable targets tied to the April data. Click a row to update current value.</p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {loading ? (
            <div style={{ padding: 32, textAlign: 'center', color: muted }}>Loading…</div>
          ) : goals.map(g => {
            const st = STATUS_STYLE[g.status] ?? STATUS_STYLE['Tracking']
            const isEditing = editing === g.id
            return (
              <div key={g.id} style={{ background: 'white', border: `1px solid ${rule}`, borderRadius: 8, padding: '18px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>{g.goal_name}</div>
                    <div style={{ fontSize: 12, color: muted, lineHeight: 1.5 }}>{g.why_this_goal}</div>
                  </div>

                  <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexShrink: 0 }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: muted, marginBottom: 2 }}>Baseline</div>
                      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 16, fontWeight: 500 }}>{g.baseline_value}</div>
                    </div>
                    <div style={{ color: muted, fontSize: 14 }}>→</div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: muted, marginBottom: 2 }}>Target</div>
                      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 16, fontWeight: 600, color: '#047857' }}>{g.target_value}</div>
                    </div>
                    <div style={{ color: muted, fontSize: 14 }}>·</div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: muted, marginBottom: 2 }}>Current</div>
                      {isEditing ? (
                        <input value={editValue} onChange={e => setEditValue(e.target.value)}
                          style={{ width: 80, padding: '3px 6px', borderRadius: 4, border: `1px solid ${rule}`, fontSize: 13, textAlign: 'center', fontFamily: 'monospace' }} />
                      ) : (
                        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 16, fontWeight: 600 }}
                          onClick={() => { setEditing(g.id); setEditValue(g.current_value); setEditStatus(g.status) }}>
                          {g.current_value || '—'}
                        </div>
                      )}
                    </div>

                    <div>
                      {isEditing ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <select value={editStatus} onChange={e => setEditStatus(e.target.value)}
                            style={{ padding: '4px 8px', borderRadius: 5, border: `1px solid ${rule}`, fontSize: 12 }}>
                            {Object.keys(STATUS_STYLE).map(s => <option key={s}>{s}</option>)}
                          </select>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button onClick={() => saveGoal(g.id)} style={{ padding: '4px 8px', borderRadius: 5, border: 'none', background: ink, color: 'white', fontSize: 11, cursor: 'pointer' }}>Save</button>
                            <button onClick={() => setEditing(null)} style={{ padding: '4px 8px', borderRadius: 5, border: `1px solid ${rule}`, background: 'white', fontSize: 11, cursor: 'pointer' }}>Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 600, background: st.bg, color: st.text, cursor: 'pointer', whiteSpace: 'nowrap' }}
                          onClick={() => { setEditing(g.id); setEditValue(g.current_value); setEditStatus(g.status) }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: st.dot, flexShrink: 0 }} />
                          {g.status}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <p style={{ marginTop: 20, fontSize: 12, color: muted }}>Click any current value or status badge to update it.</p>
      </main>
    </div>
  )
}
