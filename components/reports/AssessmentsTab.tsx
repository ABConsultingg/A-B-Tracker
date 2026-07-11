'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Assessment = {
  id: string
  created_at: string
  email: string
  business_name: string | null
  industry: string | null
  score: number
  grade: string
  gap_analysis: string | null
  recommendations: string | null
  source_page: string | null
  email_sent: boolean
  booked_call: boolean
  answers: Record<string, string | string[]> | null
  full_report: string | null
}

const GRADE_COLOR: Record<string, string> = {
  Good: '#16a34a',
  'Needs Work': '#d97706',
  'At Risk': '#dc2626',
  Critical: '#7c3aed',
}

export default function AssessmentsTab() {
  const supabase = createClient()
  const [assessments, setAssessments] = useState<Assessment[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Assessment | null>(null)
  const [filter, setFilter] = useState<'all' | 'good' | 'at_risk'>('all')

  useEffect(() => { fetchAssessments() }, [])

  async function fetchAssessments() {
    setLoading(true)
    const { data } = await supabase
      .from('marketing_assessments')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200)
    setAssessments(data || [])
    setLoading(false)
  }

  const filtered = assessments.filter(a => {
    if (filter === 'good') return a.score >= 75
    if (filter === 'at_risk') return a.score < 50
    return true
  })

  const total = assessments.length
  const avgScore = total > 0 ? Math.round(assessments.reduce((s, a) => s + a.score, 0) / total) : 0
  const booked = assessments.filter(a => a.booked_call).length
  const atRisk = assessments.filter(a => a.score < 50).length

  // Top industries
  const industryCounts: Record<string, number> = {}
  assessments.forEach(a => {
    if (a.industry) industryCounts[a.industry] = (industryCounts[a.industry] || 0) + 1
  })
  const topIndustries = Object.entries(industryCounts).sort((a, b) => b[1] - a[1]).slice(0, 5)

  // Score distribution
  const distribution = {
    'Critical (0–24)': assessments.filter(a => a.score < 25).length,
    'At Risk (25–49)': assessments.filter(a => a.score >= 25 && a.score < 50).length,
    'Needs Work (50–74)': assessments.filter(a => a.score >= 50 && a.score < 75).length,
    'Good (75–100)': assessments.filter(a => a.score >= 75).length,
  }

  const cell = { padding: '10px 12px', borderBottom: '1px solid var(--border)', fontSize: 13, color: 'var(--text)' }
  const th = { ...cell, fontWeight: 600, background: 'var(--bg)', color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }

  return (
    <div className="space-y-6">

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        {[
          { label: 'Total Assessments', value: total, icon: '📊' },
          { label: 'Average Score', value: `${avgScore}/100`, icon: '🎯' },
          { label: 'At Risk (< 50)', value: atRisk, icon: '⚠️' },
          { label: 'Booked a Call', value: booked, icon: '📅' },
        ].map(k => (
          <div key={k.label} className="rounded-xl border p-4" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}>
            <div style={{ fontSize: 22 }}>{k.icon}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text)', marginTop: 4 }}>{k.value}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Distribution + Industries */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="rounded-xl border p-4" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}>
          <div style={{ fontWeight: 600, marginBottom: 12, color: 'var(--text)' }}>📈 Score Distribution</div>
          {Object.entries(distribution).map(([label, count]) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
              <span style={{ color: 'var(--text)' }}>{label}</span>
              <span style={{ fontWeight: 600, color: 'var(--accent)' }}>{count}</span>
            </div>
          ))}
        </div>
        <div className="rounded-xl border p-4" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}>
          <div style={{ fontWeight: 600, marginBottom: 12, color: 'var(--text)' }}>🏭 Top Industries</div>
          {topIndustries.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No data yet</div>}
          {topIndustries.map(([industry, count]) => (
            <div key={industry} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
              <span style={{ color: 'var(--text)', textTransform: 'capitalize' }}>{industry.replace(/_/g, ' ')}</span>
              <span style={{ fontWeight: 600, color: 'var(--accent)' }}>{count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Assessment list */}
      <div className="rounded-xl border" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 600, color: 'var(--text)' }}>📋 Submissions</span>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['all', 'at_risk', 'good'] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  background: filter === f ? 'var(--accent)' : 'var(--bg)',
                  color: filter === f ? 'white' : 'var(--text-muted)' }}>
                {f === 'all' ? 'All' : f === 'at_risk' ? 'At Risk' : 'Good'}
              </button>
            ))}
          </div>
        </div>
        {loading ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Date', 'Business', 'Email', 'Industry', 'Score', 'Grade', 'Booked'].map(h => (
                  <th key={h} style={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={7} style={{ ...cell, textAlign: 'center', color: 'var(--text-muted)' }}>No assessments yet</td></tr>
              )}
              {filtered.map(a => (
                <tr key={a.id} onClick={() => setSelected(a)}
                  style={{ cursor: 'pointer', background: selected?.id === a.id ? 'var(--bg)' : 'transparent' }}>
                  <td style={cell}>{new Date(a.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</td>
                  <td style={cell}>{a.business_name || '—'}</td>
                  <td style={{ ...cell, fontSize: 12 }}>{a.email}</td>
                  <td style={{ ...cell, textTransform: 'capitalize' }}>{a.industry?.replace(/_/g, ' ') || '—'}</td>
                  <td style={{ ...cell, textAlign: 'center', fontWeight: 700 }}>{a.score}</td>
                  <td style={{ ...cell, textAlign: 'center' }}>
                    <span style={{ color: GRADE_COLOR[a.grade] || 'var(--text)', fontWeight: 600, fontSize: 12 }}>{a.grade}</span>
                  </td>
                  <td style={{ ...cell, textAlign: 'center' }}>
                    {a.booked_call ? <span style={{ color: '#2563eb' }}>📅</span> : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Detail panel */}
      {selected && (
        <div className="rounded-xl border p-5" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{
                width: 60, height: 60, borderRadius: '50%',
                border: `4px solid ${GRADE_COLOR[selected.grade] || '#aaa'}`,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                background: `${GRADE_COLOR[selected.grade]}15`,
              }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)' }}>{selected.score}</div>
              </div>
              <div>
                <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: 16 }}>{selected.business_name || selected.email}</div>
                <div style={{ color: GRADE_COLOR[selected.grade], fontSize: 13, fontWeight: 600 }}>{selected.grade}</div>
              </div>
            </div>
            <button onClick={() => setSelected(null)} style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 20 }}>×</button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, fontWeight: 600, letterSpacing: '0.08em' }}>GAP ANALYSIS</div>
              {(selected.gap_analysis || '').split('\n').map((gap, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 8, fontSize: 13, color: 'var(--text)', alignItems: 'flex-start' }}>
                  <span style={{ color: '#E8541A', fontWeight: 700, flexShrink: 0 }}>{i + 1}.</span>
                  {gap}
                </div>
              ))}
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, fontWeight: 600, letterSpacing: '0.08em' }}>RECOMMENDATIONS</div>
              {(selected.recommendations || '').split('\n').map((rec, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 8, fontSize: 13, color: 'var(--text)', alignItems: 'flex-start' }}>
                  <span style={{ color: '#16a34a', flexShrink: 0 }}>✓</span>
                  {rec}
                </div>
              ))}
            </div>
          </div>

          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, fontWeight: 600, letterSpacing: '0.08em' }}>THEIR ANSWERS</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {selected.answers && Object.entries(selected.answers).map(([key, val]) => (
              <div key={key} style={{ fontSize: 12, color: 'var(--text)' }}>
                <strong style={{ color: 'var(--text-muted)' }}>{key.replace(/_/g, ' ')}: </strong>
                {Array.isArray(val) ? val.join(', ') : val}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
