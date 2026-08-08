'use client'

// components/reports/AssessmentsSummaryCard.tsx
// Headline numbers for the marketing assessments, with a link through to the
// full table. The table itself lives on /pipeline?tab=assessments — assessments
// are A&B's own lead-gen, not per-client reporting, so they sit with the sales
// views rather than on a client's report.
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

// Same threshold the assessments table filters on, so the count here and the
// "At Risk" filter there always agree.
const AT_RISK_BELOW = 50

export default function AssessmentsSummaryCard() {
  const supabase = createClient()
  const [stats, setStats] = useState<{ total: number; avg: number; atRisk: number } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data } = await supabase.from('marketing_assessments').select('score')
      if (cancelled) return
      const rows = (data ?? []) as { score: number | null }[]
      const scores = rows.map(r => Number(r.score)).filter(n => Number.isFinite(n))
      setStats({
        total: rows.length,
        avg: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0,
        atRisk: scores.filter(n => n < AT_RISK_BELOW).length,
      })
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [supabase])

  const cell = (label: string, value: string | number, color?: string) => (
    <div>
      <div style={{ fontSize: 22, fontWeight: 700, color: color ?? 'var(--text)', lineHeight: 1.1 }}>
        {value}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{label}</div>
    </div>
  )

  return (
    <div
      style={{
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '14px 16px',
        background: 'var(--bg-elevated)',
        marginBottom: 16,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>📊 Marketing Assessments</div>
        <a
          href="/pipeline?tab=assessments"
          style={{ fontSize: 12, color: 'var(--brand-accent, #6366f1)', textDecoration: 'none', fontWeight: 600 }}
        >
          View all →
        </a>
      </div>

      {loading ? (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 10 }}>Loading…</div>
      ) : (
        <div style={{ display: 'flex', gap: 28, marginTop: 12 }}>
          {cell('Submissions', stats?.total ?? 0)}
          {cell('Avg score', stats?.total ? stats.avg : '—')}
          {cell('At risk', stats?.atRisk ?? 0, (stats?.atRisk ?? 0) > 0 ? '#dc2626' : undefined)}
        </div>
      )}
    </div>
  )
}
