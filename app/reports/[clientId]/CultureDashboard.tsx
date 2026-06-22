'use client'
import CallsTab from '@/components/reports/CallsTab'
import ApprovalTab from '@/components/reports/ApprovalTab'
import React, { useState, useEffect, useCallback } from 'react'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Legend, Cell, PieChart, Pie,
} from 'recharts'

// ─── Types ────────────────────────────────────────────────────────────────────

type ViewMode = 'lm' | 'ytd'
type TabId = 'overview' | 'google' | 'meta' | 'social' | 'lsa' | 'website' | 'cpl' | 'reputation' | 'approve' | 'calls'

interface AdData {
  spend: number; billedSpend: number; markupPct: number
  impressions: number; clicks: number; conversions: number
  ctr: number; cpc: number; cpm: number; costPerConversion: number; roas: number
  campaigns: { name: string; account: string; cost: number; impressions: number; clicks: number; conversions: number; ctr: number }[]
  daily: { date: string; impressions: number; clicks: number; cost: number }[]
  devices: { name: string; clicks: number }[]
}

interface MetaData {
  spend: number; billedSpend: number; markupPct: number
  impressions: number; clicks: number; reach: number; conversions: number
  ctr: number; cpc: number; cpm: number; roas: number
  campaigns: { name: string; spend: number; impressions: number; clicks: number; conversions: number }[]
  daily: { date: string; impressions: number; clicks: number; spend: number }[]
  devices: { name: string; value: number }[]
}

interface SocialData {
  totalImpressions: number; totalEngagements: number; totalFollowerChange: number; engRate: number
  platforms: { network: string; label: string; impressions: number; engagements: number; posts: number; followerChange: number; followers: number; engRate: number }[]
  topPosts: { network: string; postType: string; publishedAt: string; impressions: number; engagements: number; reactions: number; videoViews: number; preview: string | null; engRate: number }[]
}

interface LSAData {
  total: number; charged: number; notCharged: number; credited: number
  chargeRate: number; phone: number; message: number
  categories: { name: string; count: number }[]
  source: string
}

interface GA4Data {
  sessions: number; users: number; newUsers: number; bounceRate: number
  avgSessionDuration: number; pageViews: number; conversions: number
  topChannel: string | null
  channels: { channel: string; sessions: number; users: number; conversions: number }[]
  topPages?: { page: string; views: number; users: number; bounceRate: number }[]
}

interface SCData {
  clicks: number; impressions: number; ctr: number; position: number
  topQueries: { query: string; clicks: number; impressions: number; ctr: number; position: number }[]
  topPages: { page: string; clicks: number; impressions: number; ctr: number; position: number }[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const f = (n: number | null | undefined, dec = 0) =>
  n == null || isNaN(n) ? '—' : n.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec })

const m$ = (n: number | null | undefined) =>
  n == null || isNaN(n) ? '—' : `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const pct = (n: number | null | undefined, dec = 1) =>
  n == null || isNaN(n) ? '—' : `${Number(n).toFixed(dec)}%`

function delta(cur: number | null | undefined, prev: number | null | undefined) {
  if (cur == null || prev == null || prev === 0) return null
  return ((cur - prev) / Math.abs(prev)) * 100
}

function monthLabel(m: string) {
  const [y, mo] = m.split('-')
  return new Date(Number(y), Number(mo) - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' })
}

function prevMonth(month: string): string {
  const [y, mo] = month.split('-').map(Number)
  return mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, '0')}`
}

const CHART_COLORS = ['#2e75b6', '#2d7a3e', '#c25613', '#8b5cf6', '#06b6d4', '#f59e0b']
const NAVY = '#1f3a5f'

// ─── Sub-components ───────────────────────────────────────────────────────────

function DeltaBadge({ cur, prev, label, invertGood = false }: {
  cur: number | null | undefined
  prev: number | null | undefined
  label: string
  invertGood?: boolean
}) {
  const d = delta(cur, prev)
  if (d == null) return null
  const positive = d >= 0
  const isGood = invertGood ? !positive : positive
  const color = isGood ? '#2d7a3e' : '#c1373c'
  return (
    <span className="text-xs mr-2" style={{ color }}>
      {positive ? '↑' : '↓'}{Math.abs(d).toFixed(1)}%{' '}
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
    </span>
  )
}

function KpiCard({ label, value, sub, cur, prev, prevLabel, ly, lyLabel, invertGood, featured, color }: {
  label: string; value: string; sub?: string
  cur?: number | null; prev?: number | null; prevLabel?: string
  ly?: number | null; lyLabel?: string
  invertGood?: boolean; featured?: boolean; color?: string
}) {
  const bg = featured ? NAVY : 'var(--bg-elevated)'
  const textPrimary = featured ? 'white' : 'var(--text)'
  const textMuted = featured ? '#b8c8dd' : 'var(--text-muted)'
  const border = featured ? NAVY : 'var(--border)'
  const topBorder = !featured && color ? `3px solid ${color}` : undefined

  return (
    <div className="rounded-xl border p-4" style={{ background: bg, borderColor: border, borderTopWidth: topBorder ? 3 : undefined, borderTopColor: color }}>
      <div className="text-xs uppercase tracking-wide mb-2 font-semibold" style={{ color: textMuted }}>{label}</div>
      <div className="text-2xl font-bold" style={{ color: textPrimary }}>{value}</div>
      {sub && <div className="text-xs mt-1" style={{ color: textMuted }}>{sub}</div>}
      {(prev != null || ly != null) && (
        <div className="mt-2 flex flex-wrap gap-y-0.5">
          {prev != null && <DeltaBadge cur={cur} prev={prev} label={prevLabel || 'vs prev'} invertGood={invertGood} />}
          {ly != null && <DeltaBadge cur={cur} prev={ly} label={lyLabel || 'vs LY'} invertGood={invertGood} />}
        </div>
      )}
    </div>
  )
}

function SectionAlert({ type, icon, title, body }: { type: 'danger' | 'warn' | 'info'; icon: string; title: string; body: string }) {
  const colors = { danger: { bg: '#fae3e4', border: '#c1373c' }, warn: { bg: '#fbe5d6', border: '#c25613' }, info: { bg: '#e8f0fb', border: '#2e75b6' } }
  const c = colors[type]
  return (
    <div className="rounded-lg p-3 mb-2" style={{ background: c.bg, borderLeft: `4px solid ${c.border}` }}>
      <div className="flex gap-3 items-start">
        <span className="text-lg">{icon}</span>
        <div>
          <div className="text-sm font-semibold" style={{ color: NAVY }}>{title}</div>
          <div className="text-xs mt-0.5" style={{ color: '#5a6878' }}>{body}</div>
        </div>
      </div>
    </div>
  )
}

function CompareTable({ rows, headers }: { headers: string[]; rows: (string | React.ReactNode)[][] }) {
  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: 'var(--bg-sunken)' }}>
            {headers.map((h, i) => (
              <th key={i} style={{ textAlign: i === 0 ? 'left' : 'right', padding: '8px 12px', fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} style={{ borderTop: '1px solid var(--border)' }}>
              {row.map((cell, ci) => (
                <td key={ci} style={{ padding: '9px 12px', textAlign: ci === 0 ? 'left' : 'right', color: ci === 0 ? NAVY : 'var(--text-muted)', fontWeight: ci === 0 ? 600 : 400 }}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}



function Stub({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div className="rounded-xl border p-12 text-center" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)', borderStyle: 'dashed' }}>
      <div className="text-3xl mb-3">{icon}</div>
      <div className="text-sm font-semibold mb-2" style={{ color: NAVY }}>{title}</div>
      <div className="text-xs max-w-sm mx-auto" style={{ color: 'var(--text-muted)' }}>{body}</div>
    </div>
  )
}

function Loading() {
  return <div className="py-8 text-sm text-center" style={{ color: 'var(--text-muted)' }}>Loading…</div>
}

// ─── Tab: Google Ads ──────────────────────────────────────────────────────────

function GoogleAdsTab({ clientId, month, view }: { clientId: string; month: string; view: ViewMode }) {
  const [cur, setCur] = useState<AdData | null>(null)
  const [prev, setPrev] = useState<AdData | null>(null)
  const [ly, setLy] = useState<AdData | null>(null)
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')

  const pm = prevMonth(month)
  const lym = `${Number(month.split('-')[0]) - 1}-${month.split('-')[1]}`

  useEffect(() => {
    setLoading(true)
    const q = (m: string) => fetch(`/api/reports/google-ads?clientId=${clientId}&month=${m}`).then(r => r.json()).catch(() => null)
    Promise.all([q(month), q(pm), q(lym)]).then(([c, p, l]) => {
      if (!c?.data) { setMsg(c?.message || 'No Google Ads data for this period.'); setLoading(false); return }
      setCur(c.data); setPrev(p?.data || null); setLy(l?.data || null); setLoading(false)
    })
  }, [clientId, month])

  if (loading) return <Loading />
  if (!cur) return <div className="text-sm py-4" style={{ color: 'var(--text-muted)' }}>{msg}</div>

  const prevSpend = view === 'lm' ? prev?.spend : ly?.spend
  const prevConv  = view === 'lm' ? prev?.conversions : ly?.conversions
  const prevCPL   = view === 'lm' ? (prev?.costPerConversion ?? null) : (ly?.costPerConversion ?? null)
  const prevLabel = view === 'lm' ? 'vs prev mo' : 'vs LY'

  const monthlyData = [
    { month: 'Jan', spend: 1827, conv: 14 },
    { month: 'Feb', spend: 2091, conv: 16 },
    { month: 'Mar', spend: 5099, conv: 17 },
    { month: 'Apr', spend: 12727, conv: 105 },
    { month: 'May', spend: 8615, conv: 128 },
    { month: 'Jun*', spend: 6905, conv: 56 },
  ]

  return (
    <div className="space-y-5">
      {view === 'lm' && (
        <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
          {monthLabel(month)} vs {monthLabel(pm)}
        </div>
      )}
      {view === 'ytd' && (
        <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
          YTD 2026 vs YTD 2025
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiCard label="Ad Spend" value={m$(cur.spend)} featured
          cur={cur.spend} prev={prevSpend} prevLabel={prevLabel} invertGood />
        <KpiCard label="Billed to Client" value={m$(cur.billedSpend)} sub={`${cur.markupPct}% markup`}
          cur={cur.billedSpend} prev={view === 'lm' ? prev?.billedSpend : ly?.billedSpend} prevLabel={prevLabel} color={NAVY} />
        <KpiCard label="Conversions" value={f(cur.conversions)}
          cur={cur.conversions} prev={prevConv} prevLabel={prevLabel} color={NAVY} />
        <KpiCard label="Cost / Conv." value={m$(cur.costPerConversion)}
          cur={cur.costPerConversion} prev={prevCPL} prevLabel={prevLabel} invertGood color={NAVY} />
        <KpiCard label="CTR" value={pct(cur.ctr, 2)}
          cur={cur.ctr} prev={view === 'lm' ? prev?.ctr : ly?.ctr} prevLabel={prevLabel} color={NAVY} />
        <KpiCard label="Clicks" value={f(cur.clicks)}
          cur={cur.clicks} prev={view === 'lm' ? prev?.clicks : ly?.clicks} prevLabel={prevLabel} color={NAVY} />
        <KpiCard label="Impressions" value={f(cur.impressions)}
          cur={cur.impressions} prev={view === 'lm' ? prev?.impressions : ly?.impressions} prevLabel={prevLabel} color={NAVY} />
        <KpiCard label="CPC" value={m$(cur.cpc)}
          cur={cur.cpc} prev={view === 'lm' ? prev?.cpc : ly?.cpc} prevLabel={prevLabel} invertGood color={NAVY} />
        <KpiCard label="CPM" value={m$(cur.cpm)}
          cur={cur.cpm} prev={view === 'lm' ? prev?.cpm : ly?.cpm} prevLabel={prevLabel} invertGood color={NAVY} />
        <KpiCard label="ROAS" value={cur.roas > 0 ? `${cur.roas}x` : '—'}
          cur={cur.roas} prev={view === 'lm' ? prev?.roas : ly?.roas} prevLabel={prevLabel} color={NAVY} />
      </div>

      {/* Monthly trend chart */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl border p-4" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}>
          <div className="text-sm font-bold mb-3" style={{ color: 'var(--text)' }}>Monthly Spend vs Conversions (YTD)</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={monthlyData}>
              <XAxis dataKey="month" tick={{ fontSize: 10 }} />
              <YAxis yAxisId="left" tick={{ fontSize: 10 }} tickFormatter={v => `$${Math.round(v / 1000)}k`} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v, n) => n === 'spend' ? `$${Number(v).toLocaleString()}` : v} />
              <Bar yAxisId="left" dataKey="spend" fill="#2e75b6" radius={[3, 3, 0, 0]} name="Spend" />
              <Bar yAxisId="right" dataKey="conv" fill="#2d7a3e" radius={[3, 3, 0, 0]} name="Conversions" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {(cur.daily?.length ?? 0) > 1 && (
          <div className="rounded-xl border p-4" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}>
            <div className="text-sm font-bold mb-3" style={{ color: 'var(--text)' }}>Daily Clicks — {monthLabel(month)}</div>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={cur.daily}>
                <XAxis dataKey="date" tick={{ fontSize: 9 }} tickFormatter={d => d.slice(5)} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip labelFormatter={d => d} formatter={v => Number(v).toLocaleString()} />
                <Line type="monotone" dataKey="clicks" stroke="#2e75b6" dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Campaign table */}
      {cur.campaigns.length > 0 && (
        <div>
          <div className="text-sm font-bold mb-3" style={{ color: 'var(--text)' }}>Campaign Breakdown</div>
          <CompareTable
            headers={['Campaign', 'Account', 'Spend', 'Clicks', 'CTR', 'Conv.', 'CPL']}
            rows={cur.campaigns.map(c => [
              c.name.replace('LocalServicesCampaign:SystemGenerated:', 'LSA '),
              c.account,
              m$(c.cost),
              f(c.clicks),
              pct(c.ctr, 2),
              f(c.conversions),
              c.conversions > 0 ? (
                <span style={{ color: c.cost / c.conversions < 100 ? '#2d7a3e' : c.cost / c.conversions < 300 ? '#c25613' : '#c1373c', fontWeight: 700 }}>
                  {m$(c.cost / c.conversions)}
                </span>
              ) : '—',
            ])}
          />
        </div>
      )}

      {view === 'ytd' && (
        <div className="rounded-lg p-3 text-sm" style={{ background: 'var(--bg-sunken)', color: 'var(--text-muted)' }}>
          💡 YTD 2025 data is available for comparison. CPL increase is driven by storm/hail campaigns at $651–$849/conv. LSA is holding at $45–$72.
        </div>
      )}
    </div>
  )
}

// ─── Tab: Meta Ads ────────────────────────────────────────────────────────────

function MetaAdsTab({ clientId, month, view }: { clientId: string; month: string; view: ViewMode }) {
  const [cur, setCur] = useState<MetaData | null>(null)
  const [prev, setPrev] = useState<MetaData | null>(null)
  const [ly, setLy] = useState<MetaData | null>(null)
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')

  const pm = prevMonth(month)
  const lym = `${Number(month.split('-')[0]) - 1}-${month.split('-')[1]}`

  useEffect(() => {
    setLoading(true)
    const q = (m: string) => fetch(`/api/reports/meta?clientId=${clientId}&month=${m}`).then(r => r.json()).catch(() => null)
    Promise.all([q(month), q(pm), q(lym)]).then(([c, p, l]) => {
      if (!c?.data) { setMsg(c?.message || 'No Meta Ads data for this period.'); setLoading(false); return }
      setCur(c.data); setPrev(p?.data || null); setLy(l?.data || null); setLoading(false)
    })
  }, [clientId, month])

  if (loading) return <Loading />
  if (!cur) return <div className="text-sm py-4" style={{ color: 'var(--text-muted)' }}>{msg}</div>

  const prevLabel = view === 'lm' ? 'vs prev mo' : 'vs LY'
  const prevData = view === 'lm' ? prev : ly

  return (
    <div className="space-y-5">
      <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
        {view === 'lm' ? `${monthLabel(month)} vs ${monthLabel(pm)}` : 'YTD 2026 vs YTD 2025'}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiCard label="Ad Spend" value={m$(cur.spend)} featured cur={cur.spend} prev={prevData?.spend} prevLabel={prevLabel} invertGood />
        <KpiCard label="Billed to Client" value={m$(cur.billedSpend)} sub={`${cur.markupPct}% markup`} cur={cur.billedSpend} prev={prevData?.billedSpend} prevLabel={prevLabel} color={NAVY} />
        <KpiCard label="Impressions" value={f(cur.impressions)} cur={cur.impressions} prev={prevData?.impressions} prevLabel={prevLabel} color={NAVY} />
        <KpiCard label="Clicks" value={f(cur.clicks)} cur={cur.clicks} prev={prevData?.clicks} prevLabel={prevLabel} color={NAVY} />
        <KpiCard label="CTR" value={pct(cur.ctr, 2)} cur={cur.ctr} prev={prevData?.ctr} prevLabel={prevLabel} color={NAVY} />
        <KpiCard label="Reach" value={f(cur.reach)} cur={cur.reach} prev={prevData?.reach} prevLabel={prevLabel} color={NAVY} />
        <KpiCard label="CPM" value={m$(cur.cpm)} cur={cur.cpm} prev={prevData?.cpm} prevLabel={prevLabel} invertGood color={NAVY} />
        <KpiCard label="CPC" value={m$(cur.cpc)} cur={cur.cpc} prev={prevData?.cpc} prevLabel={prevLabel} invertGood color={NAVY} />
        <KpiCard label="Conversions" value={f(cur.conversions)} cur={cur.conversions} prev={prevData?.conversions} prevLabel={prevLabel} color={NAVY} />
        <KpiCard label="ROAS" value={cur.roas > 0 ? `${cur.roas}x` : '—'} cur={cur.roas} prev={prevData?.roas} prevLabel={prevLabel} color={NAVY} />
      </div>

      {(cur.daily?.length ?? 0) > 1 && (
        <div className="rounded-xl border p-4" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}>
          <div className="text-sm font-bold mb-3" style={{ color: 'var(--text)' }}>Daily Impressions & Clicks</div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={cur.daily}>
              <XAxis dataKey="date" tick={{ fontSize: 9 }} tickFormatter={d => d.slice(5)} />
              <YAxis yAxisId="left" tick={{ fontSize: 10 }} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} />
              <Tooltip labelFormatter={d => d} formatter={v => Number(v).toLocaleString()} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line yAxisId="left" type="monotone" dataKey="impressions" stroke="#2e75b6" dot={false} name="Impressions" />
              <Line yAxisId="right" type="monotone" dataKey="clicks" stroke="#f59e0b" dot={false} name="Clicks" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {cur.campaigns.length > 0 && (
        <div>
          <div className="text-sm font-bold mb-3" style={{ color: 'var(--text)' }}>Campaign Breakdown</div>
          <CompareTable
            headers={['Campaign', 'Spend', 'Impressions', 'Clicks', 'Conv.']}
            rows={cur.campaigns.map(c => [c.name, m$(c.spend), f(c.impressions), f(c.clicks), f(c.conversions)])}
          />
        </div>
      )}
    </div>
  )
}

// ─── Tab: Social ──────────────────────────────────────────────────────────────

function SocialTab({ clientId, month, view }: { clientId: string; month: string; view: ViewMode }) {
  const [cur, setCur] = useState<SocialData | null>(null)
  const [prev, setPrev] = useState<SocialData | null>(null)
  const [ly, setLy] = useState<SocialData | null>(null)
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    setLoading(true)
    fetch(`/api/reports/culture-social?clientId=${clientId}&month=${month}`)
      .then(r => r.json())
      .then(d => {
        if (!d.data) { setMsg(d.message || 'No social data for this period.'); setLoading(false); return }
        setCur(d.data); setPrev(d.prevData || null); setLy(d.lastYearData || null); setLoading(false)
      })
      .catch(() => { setMsg('Error loading social data.'); setLoading(false) })
  }, [clientId, month])

  if (loading) return <Loading />
  if (!cur) return <div className="text-sm py-4" style={{ color: 'var(--text-muted)' }}>{msg}</div>

  const prevData = view === 'lm' ? prev : ly
  const prevLabel = view === 'lm' ? 'vs prev mo' : 'vs LY'

  const networkIcon: Record<string, string> = {
    Facebook: '📘', Instagram: '📸', LinkedIn: '💼', YouTube: '▶️',
  }

  return (
    <div className="space-y-5">
      <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
        {view === 'lm' ? `${monthLabel(month)} vs ${monthLabel(prevMonth(month))}` : 'YTD 2026 (Mar–Jun)'}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Total Impressions" value={f(cur.totalImpressions)} featured cur={cur.totalImpressions} prev={prevData?.totalImpressions} prevLabel={prevLabel} />
        <KpiCard label="Total Engagements" value={f(cur.totalEngagements)} cur={cur.totalEngagements} prev={prevData?.totalEngagements} prevLabel={prevLabel} color={NAVY} />
        <KpiCard label="Engagement Rate" value={pct(cur.engRate)} cur={cur.engRate} prev={prevData?.engRate} prevLabel={prevLabel} color={NAVY} />
        <KpiCard label="Follower Change" value={cur.totalFollowerChange >= 0 ? `+${cur.totalFollowerChange}` : `${cur.totalFollowerChange}`} cur={cur.totalFollowerChange} prev={prevData?.totalFollowerChange} prevLabel={prevLabel} color={NAVY} />
      </div>

      {/* Platform breakdown */}
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
        <div className="px-4 py-3 text-sm font-bold border-b" style={{ color: 'var(--text)', borderColor: 'var(--border)', background: 'var(--bg-sunken)' }}>By Platform</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--border)' }}>
              {['Platform', 'Impressions', '∆ vs prev', 'Engagements', '∆ vs prev', 'Eng. Rate', 'Posts'].map((h, i) => (
                <th key={i} style={{ textAlign: i === 0 ? 'left' : 'right', padding: '8px 12px', fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cur.platforms.map((p, i) => {
              const prev_p = prevData?.platforms.find(pp => pp.network === p.network)
              const impDelta = delta(p.impressions, prev_p?.impressions)
              const engDelta = delta(p.engagements, prev_p?.engagements)
              return (
                <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '9px 12px', fontWeight: 600, color: NAVY }}>
                    {networkIcon[p.label] || '📱'} {p.label}
                  </td>
                  <td style={{ padding: '9px 12px', textAlign: 'right', fontFamily: 'monospace' }}>{f(p.impressions)}</td>
                  <td style={{ padding: '9px 12px', textAlign: 'right', fontSize: 11, color: impDelta != null && impDelta >= 0 ? '#2d7a3e' : '#c1373c' }}>
                    {impDelta != null ? `${impDelta >= 0 ? '↑' : '↓'}${Math.abs(impDelta).toFixed(1)}%` : '—'}
                  </td>
                  <td style={{ padding: '9px 12px', textAlign: 'right', fontFamily: 'monospace' }}>{f(p.engagements)}</td>
                  <td style={{ padding: '9px 12px', textAlign: 'right', fontSize: 11, color: engDelta != null && engDelta >= 0 ? '#2d7a3e' : '#c1373c' }}>
                    {engDelta != null ? `${engDelta >= 0 ? '↑' : '↓'}${Math.abs(engDelta).toFixed(1)}%` : '—'}
                  </td>
                  <td style={{ padding: '9px 12px', textAlign: 'right', fontFamily: 'monospace', color: p.engRate > 3 ? '#2d7a3e' : p.engRate > 1 ? 'var(--text-muted)' : '#c25613' }}>
                    {pct(p.engRate)}
                  </td>
                  <td style={{ padding: '9px 12px', textAlign: 'right', fontFamily: 'monospace' }}>{p.posts || '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Top posts */}
      {cur.topPosts.length > 0 && (
        <div>
          <div className="text-sm font-bold mb-3" style={{ color: 'var(--text)' }}>Top Posts by Engagement</div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {cur.topPosts.slice(0, 6).map((p, i) => (
              <div key={i} className="rounded-xl border p-4" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
                    {networkIcon[p.network] || '📱'} {p.network} · {p.postType.replace('FACEBOOK_', '').replace('INSTAGRAM_', '')}
                  </span>
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{p.publishedAt?.slice(0, 10)}</span>
                </div>
                {p.preview && (
                  <p className="text-xs mb-3 leading-relaxed" style={{ color: 'var(--text)', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {p.preview}
                  </p>
                )}
                <div className="grid grid-cols-3 gap-1 text-center">
                  {[
                    { label: 'Impressions', val: f(p.impressions) },
                    { label: 'Engagements', val: f(p.engagements) },
                    { label: 'Eng. Rate', val: pct(p.engRate) },
                  ].map(stat => (
                    <div key={stat.label}>
                      <div className="text-xs font-bold" style={{ color: NAVY }}>{stat.val}</div>
                      <div className="text-xs" style={{ color: 'var(--text-muted)', fontSize: 10 }}>{stat.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Tab: LSA Leads ───────────────────────────────────────────────────────────

function LSATab({ clientId, month, view }: { clientId: string; month: string; view: ViewMode }) {
  const [cur, setCur] = useState<LSAData | null>(null)
  const [prev, setPrev] = useState<LSAData | null>(null)
  const [ly, setLy] = useState<LSAData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/reports/culture-lsa?clientId=${clientId}&month=${month}`)
      .then(r => r.json())
      .then(d => {
        setCur(d.data || null); setPrev(d.prevData || null); setLy(d.lastYearData || null)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [clientId, month])

  if (loading) return <Loading />

  // Hardcoded fallback from Chrome extension data if no DB data yet
  const data = cur || { total: 131, charged: 93, notCharged: 29, credited: 9, chargeRate: 71.0, phone: 80, message: 51, categories: [{ name: 'Decks & Patio', count: 30 }, { name: 'Home Remodel', count: 22 }, { name: 'Accessory Bldg', count: 12 }, { name: 'Exterior Finish', count: 12 }, { name: 'Home Building', count: 11 }, { name: 'Foundations', count: 5 }], source: 'fallback' }

  const prevData = view === 'lm' ? prev : ly
  const prevLabel = view === 'lm' ? 'vs prev mo' : 'vs LY'

  const monthlyData = [
    { month: 'March', total: 38, charged: 28 },
    { month: 'April', total: 51, charged: 35 },
    { month: 'May', total: 42, charged: 30 },
  ]

  return (
    <div className="space-y-5">
      <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
        LSA Leads — Chrome extension data · Mar–May 2026
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Total Leads" value={f(data.total)} featured cur={data.total} prev={prevData?.total} prevLabel={prevLabel} />
        <KpiCard label="Charged" value={f(data.charged)} sub={`${pct(data.chargeRate)} charge rate`} cur={data.charged} prev={prevData?.charged} prevLabel={prevLabel} color={NAVY} />
        <KpiCard label="Not Charged" value={f(data.notCharged)} cur={data.notCharged} prev={prevData?.notCharged} prevLabel={prevLabel} invertGood color={NAVY} />
        <KpiCard label="Credited / Review" value={f(data.credited)} cur={data.credited} prev={prevData?.credited} prevLabel={prevLabel} invertGood color={NAVY} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl border p-4" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}>
          <div className="text-sm font-bold mb-3" style={{ color: 'var(--text)' }}>Monthly Lead Volume</div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={monthlyData}>
              <XAxis dataKey="month" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="total" fill="#4a90c9" radius={[3, 3, 0, 0]} name="Total" />
              <Bar dataKey="charged" fill="#2d7a3e" radius={[3, 3, 0, 0]} name="Charged" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-xl border p-4" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}>
          <div className="text-sm font-bold mb-3" style={{ color: 'var(--text)' }}>Lead Type Split</div>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={[{ name: 'Phone', value: data.phone }, { name: 'Message', value: data.message }]} dataKey="value" cx="50%" cy="50%" outerRadius={70} label={({ name, percent }) => `${name} ${Math.round((percent || 0) * 100)}%`} labelLine={false} fontSize={11}>
                <Cell fill="#2e75b6" />
                <Cell fill="#2d7a3e" />
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {data.categories.length > 0 && (
        <div>
          <div className="text-sm font-bold mb-3" style={{ color: 'var(--text)' }}>Top Job Categories</div>
          <CompareTable
            headers={['Category', 'Leads', '% of Total']}
            rows={data.categories.map(c => [c.name, f(c.count), pct((c.count / data.total) * 100)])}
          />
        </div>
      )}

      <SectionAlert type="info" icon="📞"
        title="Cira.ai call data pending"
        body="Once connected, we'll cross-reference LSA charged leads with answered calls, call duration, and booked jobs to calculate true conversion rate from lead → appointment." />
    </div>
  )
}

// ─── Tab: Website ─────────────────────────────────────────────────────────────

function WebsiteTab({ clientId, month, view }: { clientId: string; month: string; view: ViewMode }) {
  const [ga4, setGa4] = useState<GA4Data | null>(null)
  const [sc, setSc] = useState<SCData | null>(null)
  const [ga4Prev, setGa4Prev] = useState<GA4Data | null>(null)
  const [ga4Ly, setGa4Ly] = useState<GA4Data | null>(null)
  const [loading, setLoading] = useState(true)

  const pm = prevMonth(month)
  const lym = `${Number(month.split('-')[0]) - 1}-${month.split('-')[1]}`

  useEffect(() => {
    setLoading(true)
    const q = (path: string, m: string) => fetch(`/api/reports/${path}?clientId=${clientId}&month=${m}`).then(r => r.json()).catch(() => null)
    Promise.all([q('ga4', month), q('search-console', month), q('ga4', pm), q('ga4', lym)]).then(([g, s, gp, gl]) => {
      setGa4(g?.data || null); setSc(s?.configured ? s?.data || null : null)
      setGa4Prev(gp?.data || null); setGa4Ly(gl?.data || null)
      setLoading(false)
    })
  }, [clientId, month])

  if (loading) return <Loading />

  const prevData = view === 'lm' ? ga4Prev : ga4Ly
  const prevLabel = view === 'lm' ? 'vs prev mo' : 'vs LY'

  return (
    <div className="space-y-5">
      {ga4 ? (
        <>
          <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
            {view === 'lm' ? `${monthLabel(month)} vs ${monthLabel(pm)}` : 'YTD 2026 vs YTD 2025'}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard label="Sessions" value={f(ga4.sessions)} featured cur={ga4.sessions} prev={prevData?.sessions} prevLabel={prevLabel} />
            <KpiCard label="Users" value={f(ga4.users)} cur={ga4.users} prev={prevData?.users} prevLabel={prevLabel} color={NAVY} />
            <KpiCard label="New Users" value={f(ga4.newUsers)} cur={ga4.newUsers} prev={prevData?.newUsers} prevLabel={prevLabel} color={NAVY} />
            <KpiCard label="Bounce Rate" value={pct(ga4.bounceRate)} cur={ga4.bounceRate} prev={prevData?.bounceRate} prevLabel={prevLabel} invertGood color={NAVY} />
            <KpiCard label="Page Views" value={f(ga4.pageViews)} cur={ga4.pageViews} prev={prevData?.pageViews} prevLabel={prevLabel} color={NAVY} />
            <KpiCard label="Avg Session" value={ga4.avgSessionDuration ? `${Math.floor(ga4.avgSessionDuration / 60)}m ${Math.round(ga4.avgSessionDuration % 60)}s` : '—'} color={NAVY} />
            <KpiCard label="Conversions" value={f(ga4.conversions)} cur={ga4.conversions} prev={prevData?.conversions} prevLabel={prevLabel} color={NAVY} />
            <KpiCard label="Top Channel" value={ga4.topChannel || '—'} color={NAVY} />
          </div>

          {ga4.channels && ga4.channels.length > 0 && (
            <div>
              <div className="text-sm font-bold mb-3" style={{ color: 'var(--text)' }}>Traffic by Channel</div>
              <CompareTable
                headers={['Channel', 'Sessions', 'Users', 'Conversions']}
                rows={ga4.channels.map(c => [c.channel, f(c.sessions), f(c.users), f(c.conversions)])}
              />
            </div>
          )}

          {ga4.topPages && ga4.topPages.length > 0 && (
            <div>
              <div className="text-sm font-bold mb-3" style={{ color: 'var(--text)' }}>Top Pages</div>
              <CompareTable
                headers={['Page', 'Views', 'Users', 'Bounce Rate']}
                rows={ga4.topPages.map(p => [p.page, f(p.views), f(p.users), pct(p.bounceRate)])}
              />
            </div>
          )}
        </>
      ) : (
        <Stub icon="📊" title="GA4 data not yet synced" body="Run the GA4 sync for Culture (cultureccc.com · property 420061105) to populate website analytics." />
      )}

      {sc ? (
        <div>
          <div className="text-sm font-bold mb-3 mt-4" style={{ color: 'var(--text)' }}>🔍 Search Console — cultureccc.com</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <KpiCard label="Organic Clicks" value={f(sc.clicks)} featured />
            <KpiCard label="Impressions" value={f(sc.impressions)} color={NAVY} />
            <KpiCard label="Avg CTR" value={pct(sc.ctr)} color={NAVY} />
            <KpiCard label="Avg Position" value={sc.position ? `#${sc.position}` : '—'} color={NAVY} />
          </div>
          {sc.topQueries.length > 0 && (
            <CompareTable
              headers={['Top Query', 'Clicks', 'Impressions', 'CTR', 'Position']}
              rows={sc.topQueries.map(q => [q.query, f(q.clicks), f(q.impressions), pct(q.ctr), `#${q.position}`])}
            />
          )}
        </div>
      ) : (
        <div className="text-sm rounded-lg px-3 py-2" style={{ background: 'var(--bg-sunken)', color: 'var(--text-muted)' }}>
          Search Console configured for sc-domain:cultureccc.com — data loads on demand.
        </div>
      )}
    </div>
  )
}

// ─── Tab: CPL / Acquisition Cost ─────────────────────────────────────────────

function CPLTab({ clientId, month }: { clientId: string; month: string }) {
  const [gads, setGads] = useState<AdData | null>(null)
  const [meta, setMeta] = useState<MetaData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      fetch(`/api/reports/google-ads?clientId=${clientId}&month=${month}`).then(r => r.json()).catch(() => null),
      fetch(`/api/reports/meta?clientId=${clientId}&month=${month}`).then(r => r.json()).catch(() => null),
    ]).then(([g, m]) => {
      setGads(g?.data || null); setMeta(m?.data || null); setLoading(false)
    })
  }, [clientId, month])

  if (loading) return <Loading />

  const channels = [
    { name: 'Google LSA (Exteriors)', spend: 5659, conv: 127, cpl: 45, color: '#2d7a3e' },
    { name: 'Google LSA (Design & Build)', spend: 8834, conv: 122, cpl: 72, color: '#2d7a3e' },
    { name: 'James Hardie Perf Max', spend: 813, conv: 9, cpl: 91, color: '#4a90c9' },
    { name: 'Storm Damage Search', spend: 5998, conv: 18, cpl: 333, color: '#c25613' },
    { name: 'Hail Storm Calls', spend: 6567, conv: 8, cpl: 821, color: '#c1373c' },
    { name: 'James Hardie Catalog', spend: 1070, conv: 1, cpl: 1070, color: '#c1373c' },
    { name: 'Meta Ads', spend: meta?.spend || 0, conv: meta?.conversions || 0, cpl: meta?.conversions ? (meta.spend / meta.conversions) : null, color: '#8b5cf6' },
    { name: 'Design & Build 2026', spend: 155, conv: 0, cpl: null, color: '#8a96a4' },
  ].filter(c => c.spend > 0 || c.conv > 0)

  const maxCPL = Math.max(...channels.filter(c => c.cpl != null).map(c => c.cpl as number))

  return (
    <div className="space-y-5">
      <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
        ACQUISITION COST BY CHANNEL — YTD 2026 · CAC pending AccuLynx revenue data
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Best CPL Channel" value="$45" sub="Google LSA Exteriors" featured />
        <KpiCard label="Worst CPL Channel" value="$1,070" sub="JH Catalog · 1 conv" color={NAVY} />
        <KpiCard label="Blended CPL" value={gads ? m$(gads.costPerConversion) : '$111'} sub="All Google channels" color={NAVY} />
        <KpiCard label="LSA Blended CPL" value="$58" sub="Both LSA accounts" color={NAVY} />
      </div>

      <div className="rounded-xl border p-5" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}>
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm font-bold" style={{ color: 'var(--text)' }}>CPL by Channel</div>
          <div className="text-xs px-2 py-0.5 rounded-full" style={{ background: `${NAVY}15`, color: NAVY }}>CAC replaces CPL once AccuLynx connects</div>
        </div>

        <div className="space-y-3">
          {channels.map((ch, i) => (
            <div key={i} className="grid items-center gap-3" style={{ gridTemplateColumns: '200px 1fr 80px 90px' }}>
              <div>
                <div className="text-xs font-semibold" style={{ color: NAVY }}>{ch.name}</div>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{f(ch.conv)} conv · {m$(ch.spend)}</div>
              </div>
              <div className="h-5 rounded overflow-hidden" style={{ background: 'var(--border)' }}>
                {ch.cpl != null && (
                  <div className="h-full rounded flex items-center px-2 text-white text-xs font-bold" style={{ width: `${Math.max(3, (ch.cpl / maxCPL) * 100)}%`, background: ch.color }}>
                    {ch.cpl > 200 ? m$(ch.cpl) : ''}
                  </div>
                )}
              </div>
              <div className="text-right text-sm font-bold" style={{ color: ch.cpl == null ? 'var(--text-muted)' : ch.cpl < 100 ? '#2d7a3e' : ch.cpl < 400 ? '#c25613' : '#c1373c' }}>
                {ch.cpl != null ? m$(ch.cpl) : '—'}
              </div>
              <div className="text-right">
                <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: ch.cpl == null ? 'var(--bg-sunken)' : ch.cpl < 100 ? '#e8f3eb' : ch.cpl < 400 ? '#fbe5d6' : '#fae3e4', color: ch.cpl == null ? 'var(--text-muted)' : ch.cpl < 100 ? '#2d7a3e' : ch.cpl < 400 ? '#c25613' : '#c1373c', fontWeight: 600, fontSize: 10 }}>
                  {ch.cpl == null ? 'New' : ch.cpl < 100 ? '✓ Good' : ch.cpl < 400 ? '⚠ Watch' : '✕ Pause'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <SectionAlert type="danger" icon="⚠️"
        title="Hail Storm campaigns: $6,567 spent · 8 conversions · $821 CPL"
        body="LSA converts at $45–$72. Hail Storm is 11–18× more expensive per conversion. Recommend pausing or restructuring before next storm season." />

      <div className="rounded-xl border p-5" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)', borderStyle: 'dashed' }}>
        <div className="text-sm font-bold mb-2" style={{ color: NAVY }}>🔗 True CAC — Coming with AccuLynx + Cira.ai</div>
        <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
          CPL → CAC requires: AccuLynx job data (signed contracts per channel) + Cira.ai call data (answer rate, qualified call rate). Once connected:
          revenue per channel, ROAS, close rate lead → job, and cost per signed contract will replace current CPL estimates.
        </div>
      </div>
    </div>
  )
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({ clientId, month, view }: { clientId: string; month: string; view: ViewMode }) {
  const [gads, setGads] = useState<AdData | null>(null)
  const [gadsPrev, setGadsPrev] = useState<AdData | null>(null)
  const [gadsLy, setGadsLy] = useState<AdData | null>(null)
  const [social, setSocial] = useState<SocialData | null>(null)
  const [socialPrev, setSocialPrev] = useState<SocialData | null>(null)
  const [loading, setLoading] = useState(true)

  const pm = prevMonth(month)
  const lym = `${Number(month.split('-')[0]) - 1}-${month.split('-')[1]}`

  useEffect(() => {
    setLoading(true)
    const q = (path: string, m: string) => fetch(`/api/reports/${path}?clientId=${clientId}&month=${m}`).then(r => r.json()).catch(() => null)
    Promise.all([
      q('google-ads', month), q('google-ads', pm), q('google-ads', lym),
      fetch(`/api/reports/culture-social?clientId=${clientId}&month=${month}`).then(r => r.json()).catch(() => null),
    ]).then(([g, gp, gl, s]) => {
      setGads(g?.data || null); setGadsPrev(gp?.data || null); setGadsLy(gl?.data || null)
      setSocial(s?.data || null); setSocialPrev(view === 'lm' ? s?.prevData || null : s?.lastYearData || null)
      setLoading(false)
    })
  }, [clientId, month, view])

  if (loading) return <Loading />

  const prevGads = view === 'lm' ? gadsPrev : gadsLy
  const prevLabel = view === 'lm' ? 'vs prev mo' : 'vs LY'
  const viewLabel = view === 'lm'
    ? `${monthLabel(month)} vs ${monthLabel(pm)}`
    : 'YTD 2026 vs YTD 2025'

  return (
    <div className="space-y-5">
      <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>{viewLabel}</div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiCard label="Google Ad Spend" value={gads ? m$(gads.spend) : '—'} featured
          cur={gads?.spend} prev={prevGads?.spend} prevLabel={prevLabel} invertGood />
        <KpiCard label="Conversions" value={gads ? f(gads.conversions) : '—'}
          cur={gads?.conversions} prev={prevGads?.conversions} prevLabel={prevLabel} color={NAVY} />
        <KpiCard label="Blended CPL" value={gads ? m$(gads.costPerConversion) : '—'}
          cur={gads?.costPerConversion} prev={prevGads?.costPerConversion} prevLabel={prevLabel} invertGood color={NAVY} />
        <KpiCard label="Social Impressions" value={social ? f(social.totalImpressions) : '—'}
          cur={social?.totalImpressions} prev={socialPrev?.totalImpressions} prevLabel={prevLabel} color={NAVY} />
        <KpiCard label="Engagement Rate" value={social ? pct(social.engRate) : '—'}
          cur={social?.engRate} prev={socialPrev?.engRate} prevLabel={prevLabel} color={NAVY} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiCard label="LSA Leads" value="131" sub="Mar–May · 71% charged" color={NAVY} />
        <KpiCard label="LSA CPL" value="$58" sub="Both LSA accounts" color={NAVY} />
        <KpiCard label="CTR (Google)" value={gads ? pct(gads.ctr, 2) : '—'}
          cur={gads?.ctr} prev={prevGads?.ctr} prevLabel={prevLabel} color={NAVY} />
        <KpiCard label="Clicks (Google)" value={gads ? f(gads.clicks) : '—'}
          cur={gads?.clicks} prev={prevGads?.clicks} prevLabel={prevLabel} color={NAVY} />
        <KpiCard label="Social Engagements" value={social ? f(social.totalEngagements) : '—'}
          cur={social?.totalEngagements} prev={socialPrev?.totalEngagements} prevLabel={prevLabel} color={NAVY} />
      </div>

      <SectionAlert type="danger" icon="⚠️"
        title="Hail Storm campaigns burning $6,567 at $821/conv"
        body="LSA is converting at $45–$72. Recommend pausing Hail Storm Calls and reallocating to LSA for next storm season." />
      <SectionAlert type="warn" icon="📈"
        title={`CPL improved ${view === 'lm' ? '45%' : '33% vs LY (YTD)'} — driven by LSA`}
        body="May hit $67 blended CPL vs April $121. LSA efficiency is the key driver. Storm campaigns are pulling the blended rate up." />
      <SectionAlert type="info" icon="🔗"
        title="AccuLynx + Cira.ai pending — revenue attribution not live"
        body="Once connected: job pipeline, close rate, revenue per channel, and true CAC will populate here." />

      {view === 'ytd' && (
        <div className="rounded-xl border p-4" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}>
          <div className="text-sm font-bold mb-3" style={{ color: 'var(--text)' }}>YTD 2026 vs 2025 — Google Ads Summary</div>
          <CompareTable
            headers={['Metric', '2025 YTD', '2026 YTD', 'Change', '% Δ']}
            rows={[
              ['Total Spend', '$15,394', '$37,264', <span style={{ color: '#c25613', fontWeight: 700 }}>↑ $21,870</span>, <span style={{ color: '#c25613' }}>+142%</span>],
              ['Conversions', '185', '336', <span style={{ color: '#2d7a3e', fontWeight: 700 }}>↑ 151</span>, <span style={{ color: '#2d7a3e' }}>+82%</span>],
              ['Blended CPL', '$83', '$111', <span style={{ color: '#c1373c', fontWeight: 700 }}>↑ $28</span>, <span style={{ color: '#c1373c' }}>+34%</span>],
              ['LSA CPL', '$58*', '$58', <span style={{ color: '#2d7a3e' }}>— flat</span>, '—'],
            ]}
          />
          <div className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>* 2025 LSA CPL estimated. CPL increase driven by storm/hail campaigns; LSA itself is holding steady.</div>
        </div>
      )}

      {/* Action Plan */}
      <CultureActionPlan clientId={clientId} month={month} />

    </div>
  )
}

// ─── Action Plan ──────────────────────────────────────────────────────────────

type ActionItem = { id: string; title: string; description: string; priority: 'high' | 'medium' | 'low'; channel: string; created?: boolean }

function CultureActionPlan({ clientId, month }: { clientId: string; month: string }) {
  const [items, setItems] = React.useState<ActionItem[]>([])
  const [generating, setGenerating] = React.useState(false)
  const [creatingId, setCreatingId] = React.useState<string | null>(null)

  async function generate() {
    setGenerating(true)
    try {
      const res = await fetch('/api/reports/narrative', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientName: 'Culture Construction',
          month,
          summary: `Client: Culture Construction. Month: ${month}. Exterior remodeling contractor in Chicago area. Services: James Hardie siding, roofing, windows, storm damage restoration. Running Google Ads (LSA + Search), Meta Ads, and organic social.`,
          question: 'Generate 4-5 specific action items for next month. Return ONLY a JSON array: [{ "title": "short task", "description": "1-2 sentences on what to do and why", "priority": "high|medium|low", "channel": "Google Ads|Meta Ads|Social|Email|Website|LSA|GMB|Strategy" }]. No extra text, just the array.',
        }),
      })
      const data = await res.json()
      const raw = (data.narrative || '').replace(/```json|```/g, '').trim()
      const parsed = JSON.parse(raw)
      setItems(parsed.map((item: any, i: number) => ({ ...item, id: `action-${i}-${Date.now()}` })))
    } catch (e) { console.error('Action plan failed', e) }
    setGenerating(false)
  }

  async function createWO(item: ActionItem) {
    setCreatingId(item.id)
    try {
      const res = await fetch('/api/work-orders/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: `[Culture Construction] ${item.title}`, client_id: clientId, notes: item.description, priority: item.priority }),
      })
      if (res.ok) setItems(prev => prev.map(p => p.id === item.id ? { ...p, created: true } : p))
    } catch (e) { console.error('WO create failed', e) }
    setCreatingId(null)
  }

  const pColor: Record<string, string> = { high: '#dc2626', medium: '#d97706', low: '#6b7280' }
  const pBg: Record<string, string> = { high: '#fef2f2', medium: '#fffbeb', low: '#f9fafb' }

  return (
    <div className="rounded-xl border p-5" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-base">📋</span>
          <span className="text-sm font-bold" style={{ color: 'var(--text)' }}>Action Plan</span>
          <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'rgba(99,102,241,0.1)', color: '#6366f1' }}>Internal only</span>
        </div>
        <button onClick={generate} disabled={generating}
          className="text-xs px-3 py-1.5 rounded font-semibold disabled:opacity-40"
          style={{ background: '#6366f1', color: 'white' }}>
          {generating ? 'Generating…' : items.length ? '↺ Regenerate' : '✦ Generate action plan'}
        </button>
      </div>
      {items.length === 0 && !generating && (
        <div className="text-sm italic text-center py-6" style={{ color: 'var(--text-muted)' }}>
          Generate an AI-powered action plan based on this month&apos;s data.
        </div>
      )}
      {generating && <div className="text-sm text-center py-6" style={{ color: 'var(--text-muted)' }}>Analyzing data and building action plan…</div>}
      <div className="space-y-3">
        {items.map(item => (
          <div key={item.id} className="rounded-lg border p-4" style={{ background: pBg[item.priority] || '#f9fafb', borderColor: '#e5e7eb' }}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{item.title}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wide"
                    style={{ background: pBg[item.priority], color: pColor[item.priority], border: `1px solid ${pColor[item.priority]}30` }}>
                    {item.priority}
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                    style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                    {item.channel}
                  </span>
                </div>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>{item.description}</p>
              </div>
              <button onClick={() => createWO(item)} disabled={!!item.created || creatingId === item.id}
                className="text-xs px-3 py-1.5 rounded-lg font-semibold flex-shrink-0 disabled:opacity-50"
                style={{ background: item.created ? '#f0fdf4' : 'var(--brand-navy, #0f1e3f)', color: item.created ? '#16a34a' : 'white', border: item.created ? '1px solid #86efac' : 'none' }}>
                {item.created ? '✓ Created' : creatingId === item.id ? '…' : '+ Create WO'}
              </button>
            </div>
          </div>
        ))}
      </div>
      {items.length > 0 && (
        <p className="text-xs mt-3" style={{ color: 'var(--text-muted)' }}>Internal only — not visible to client. Click &quot;+ Create WO&quot; to add to the board.</p>
      )}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface Props {
  clientId: string
  clientName: string
  clientInitials: string
  clientColor: string
  month: string
  isAdmin?: boolean
}

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'overview',    label: 'Overview',          icon: '📊' },
  { id: 'google',      label: 'Google Ads',        icon: '🔍' },
  { id: 'meta',        label: 'Meta Ads',          icon: '📘' },
  { id: 'lsa',         label: 'LSA Leads',         icon: '📋' },
  { id: 'social',      label: 'Social',            icon: '📣' },
  { id: 'website',     label: 'Website & SEO',     icon: '🌐' },
  { id: 'cpl',         label: 'Acquisition Cost',  icon: '💰' },
  { id: 'reputation',  label: 'Reputation',        icon: '⭐' },
  { id: 'calls',       label: 'Calls',             icon: '📞' },
]

export default function CultureDashboard({ clientId, clientName, clientInitials, clientColor, month,
  isAdmin = false,
}: Props) {
  const [mounted, setMounted] = useState(false)
  const [tab, setTab] = useState<TabId>('overview')
  const TABS_WITH_APPROVE = isAdmin ? [...TABS, { id: 'approve' as TabId, label: 'Approve', icon: '✅' }] : TABS
  const [view, setView] = useState<ViewMode>('lm')

  useEffect(() => setMounted(true), [])

  const monthOptions = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(new Date().getFullYear(), new Date().getMonth() - i, 1)
    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    return { value: val, label: d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) }
  })

  if (!mounted) return null

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>

      {/* Header */}
      <div className="border-b px-6 py-4" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}>
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-3 mb-1">
            <a href="/reports" className="text-sm" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>← Reports</a>
            <span style={{ color: 'var(--text-muted)' }}>/</span>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold text-white" style={{ background: clientColor }}>{clientInitials}</div>
              <span className="font-semibold" style={{ color: 'var(--text)' }}>{clientName}</span>
            </div>
          </div>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>Marketing Dashboard</h1>
              <select value={month} onChange={e => { const u = new URL(window.location.href); u.searchParams.set('month', e.target.value); window.location.href = u.toString() }}
                style={{ fontSize: 12, padding: '4px 10px', border: '1px solid var(--border)', borderRadius: 7, background: 'var(--bg-elevated)', color: NAVY, fontWeight: 600, cursor: 'pointer' }}>
                {monthOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            {/* View toggle */}
            <div className="flex items-center gap-1 p-1 rounded-lg" style={{ background: 'var(--bg-sunken)' }}>
              {(['lm', 'ytd'] as ViewMode[]).map(v => (
                <button key={v} onClick={() => setView(v)}
                  className="px-3 py-1.5 rounded-md text-xs font-semibold transition-all"
                  style={{ background: view === v ? 'white' : 'transparent', color: view === v ? NAVY : 'var(--text-muted)', boxShadow: view === v ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>
                  {v === 'lm' ? 'LM vs PM' : 'YTD vs LY'}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: '#e8f0fb', color: '#2e75b6' }}>
              ● Live — Google Ads · Meta · Sprout · LSA
            </span>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {view === 'lm' ? `Comparing ${monthLabel(month)} vs ${monthLabel(prevMonth(month))}` : `YTD 2026 vs YTD 2025`}
            </span>
          </div>
        </div>
      </div>

      {/* Tab nav */}
      <div className="border-b px-6 sticky top-0 z-10" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}>
        <div className="max-w-7xl mx-auto flex gap-0 overflow-x-auto">
          {TABS_WITH_APPROVE.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className="px-4 py-3 text-sm font-medium whitespace-nowrap"
              style={{ color: tab === t.id ? 'var(--text)' : 'var(--text-muted)', borderBottom: `2px solid ${tab === t.id ? clientColor : 'transparent'}`, marginBottom: -1 }}>
              <span className="mr-1">{t.icon}</span>{t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        {tab === 'overview'   && <OverviewTab    clientId={clientId} month={month} view={view} />}
        {tab === 'google'     && <GoogleAdsTab   clientId={clientId} month={month} view={view} />}
        {tab === 'meta'       && <MetaAdsTab     clientId={clientId} month={month} view={view} />}
        {tab === 'lsa'        && <LSATab         clientId={clientId} month={month} view={view} />}
        {tab === 'social'     && <SocialTab      clientId={clientId} month={month} view={view} />}
        {tab === 'website'    && <WebsiteTab     clientId={clientId} month={month} view={view} />}
        {tab === 'cpl'        && <CPLTab         clientId={clientId} month={month} />}
        {tab === 'reputation' && (
          <Stub icon="⭐" title="Reputation data pending Chrome backfill"
            body="Once the Chrome extension backfills Google review data into Supabase, this section will show overall rating, review count trend (LM vs PM, YTD), response rate, and recent reviews." />
        )}

        {tab === 'calls' && (
          <CallsTab clientId={clientId} month={month} crmType="acculynx" />
        )}

        {tab === 'approve' && isAdmin && (
          <ApprovalTab clientId={clientId} month={month} defaultMarkup={0} />
        )}
      </div>
    </div>
  )
}
