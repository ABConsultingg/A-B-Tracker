'use client'
import { useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

type ReportData = {
  id: string
  section: string
  platform: string | null
  metric: string
  value: number | null
  source: string | null
}

type Upload = {
  file_type: string
  file_name: string
  parse_status: string
  row_count: number | null
  created_at: string
}

type Report = {
  id: string
  status: string
  narrative: string | null
  narrative_generated_at: string | null
} | null

interface Props {
  clientId: string
  clientName: string
  clientInitials: string
  clientColor: string
  month: string
  reportData: ReportData[]
  report: Report
  uploads: Upload[]
}

function monthLabel(m: string) {
  const [y, mo] = m.split('-')
  return new Date(Number(y), Number(mo) - 1, 1)
    .toLocaleString('default', { month: 'long', year: 'numeric' })
}

function fmt(n: number | null | undefined, decimals = 0) {
  if (n == null || isNaN(n)) return '—'
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

function money(n: number | null | undefined) {
  if (n == null || isNaN(n)) return '—'
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function pct(n: number | null | undefined) {
  if (n == null || isNaN(n)) return '—'
  return `${n.toFixed(2)}%`
}

type TabId = 'social' | 'meta' | 'google' | 'website' | 'email' | 'overview'

export default function ReportDashboard({
  clientId, clientName, clientInitials, clientColor,
  month, reportData, report, uploads,
}: Props) {
  const supabase = createClient()
  const [tab, setTab] = useState<TabId>('overview')
  const [narrative, setNarrative] = useState(report?.narrative || '')
  const [narrativeEditing, setNarrativeEditing] = useState(false)
  const [savingNarrative, setSavingNarrative] = useState(false)
  const [approving, setApproving] = useState(false)
  const [approved, setApproved] = useState(report?.status === 'ready')
  const [generating, setGenerating] = useState(false)
  const [claudeQuery, setClaudeQuery] = useState('')
  const [claudeResponse, setClaudeResponse] = useState('')
  const [claudeLoading, setClaudeLoading] = useState(false)

  // ── Aggregate metrics from report_data ──────────────────────────────────
  const metrics = useMemo(() => {
    const get = (section: string, platform: string | null, metric: string) => {
      const row = reportData.find(r =>
        r.section === section &&
        (platform === null || r.platform === platform) &&
        r.metric === metric
      )
      return row?.value ?? null
    }
    const sum = (section: string, metric: string) => {
      const rows = reportData.filter(r => r.section === section && r.metric === metric)
      if (!rows.length) return null
      return rows.reduce((s, r) => s + (r.value ?? 0), 0)
    }

    // Social organic — sum across all platforms
    const impressions = sum('social_organic', 'impressions')
    const engagements = sum('social_organic', 'engagements')
    const gained = sum('social_organic', 'audience_gained')
    const posts = sum('social_organic', 'posts')
    const engRate = impressions && engagements ? (engagements / impressions) * 100 : null

    // Meta ads
    const metaSpend = get('meta_ads', 'all', 'spend') ?? get('meta_ads', 'meta', 'spend')
    const metaImpressions = get('meta_ads', 'all', 'impressions') ?? get('meta_ads', 'meta', 'impressions')
    const metaClicks = get('meta_ads', 'all', 'clicks') ?? get('meta_ads', 'meta', 'clicks')
    const metaCtr = metaImpressions && metaClicks ? (metaClicks / metaImpressions) * 100 : null
    const metaCpc = metaSpend && metaClicks ? metaSpend / metaClicks : null
    const metaEngagements = get('meta_ads', 'all', 'engagements') ?? get('meta_ads', 'meta', 'engagements')
    const metaLpv = get('meta_ads', 'all', 'landing_page_views') ?? get('meta_ads', 'meta', 'landing_page_views')

    // Platform breakdowns for social
    const platforms = ['facebook', 'instagram', 'linkedin', 'x', 'youtube', 'tiktok']
    const byPlatform = platforms.map(p => ({
      name: p.charAt(0).toUpperCase() + p.slice(1),
      key: p,
      impressions: sum('social_organic', 'impressions') ?
        reportData.filter(r => r.section === 'social_organic' && r.platform?.includes(p) && r.metric === 'impressions')
          .reduce((s, r) => s + (r.value ?? 0), 0) : null,
      engagements: reportData.filter(r => r.section === 'social_organic' && r.platform?.includes(p) && r.metric === 'engagements')
        .reduce((s, r) => s + (r.value ?? 0), 0),
      posts: reportData.filter(r => r.section === 'social_organic' && r.platform?.includes(p) && r.metric === 'posts')
        .reduce((s, r) => s + (r.value ?? 0), 0),
    })).filter(p => p.posts > 0 || (p.impressions ?? 0) > 0)

    return {
      impressions, engagements, engRate, gained, posts,
      metaSpend, metaImpressions, metaClicks, metaCtr, metaCpc, metaEngagements, metaLpv,
      byPlatform,
    }
  }, [reportData])

  const uploadStatus = useMemo(() => {
    const types = ['profile_performance', 'post_performance', 'paid_performance', 'metrics_excel']
    return Object.fromEntries(types.map(t => [t, uploads.find(u => u.file_type === t)]))
  }, [uploads])

  const hasData = reportData.length > 0
  const hasMeta = metrics.metaSpend != null
  const hasSocial = metrics.impressions != null

  async function saveNarrative() {
    setSavingNarrative(true)
    await supabase.from('client_reports').upsert({
      client_id: clientId, month, status: approved ? 'ready' : 'draft', narrative,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'client_id,month' })
    setSavingNarrative(false)
    setNarrativeEditing(false)
  }

  async function approveReport() {
    setApproving(true)
    await supabase.from('client_reports').upsert({
      client_id: clientId, month, status: 'ready', narrative,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'client_id,month' })
    setApproved(true)
    setApproving(false)
  }

  async function generateNarrative() {
    if (!hasData) return
    setGenerating(true)
    const summary = reportData.map(r =>
      `${r.section}/${r.platform ?? 'all'}/${r.metric}: ${r.value}`
    ).join('\n')
    const res = await fetch('/api/reports/narrative', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId, clientName, month: monthLabel(month), summary }),
    })
    if (res.ok) {
      const { narrative: n } = await res.json()
      setNarrative(n)
      await supabase.from('client_reports').upsert({
        client_id: clientId, month, status: 'draft', narrative: n,
        narrative_generated_at: new Date().toISOString(),
      }, { onConflict: 'client_id,month' })
    }
    setGenerating(false)
  }

  async function askClaude() {
    if (!claudeQuery.trim()) return
    setClaudeLoading(true)
    const summary = reportData.map(r =>
      `${r.section}/${r.platform ?? 'all'}/${r.metric}: ${r.value}`
    ).join('\n')
    const res = await fetch('/api/reports/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientName, month: monthLabel(month), summary, question: claudeQuery }),
    })
    if (res.ok) {
      const { answer } = await res.json()
      setClaudeResponse(answer)
    }
    setClaudeLoading(false)
  }

  const TABS: { id: TabId; label: string; icon: string }[] = [
    { id: 'overview', label: 'Overview', icon: '📊' },
    { id: 'social',   label: 'Social',   icon: '📱' },
    { id: 'meta',     label: 'Meta Ads', icon: '🎯' },
    { id: 'google',   label: 'Google Ads', icon: '🔍' },
    { id: 'website',  label: 'Website',  icon: '🌐' },
    { id: 'email',    label: 'Email',    icon: '📧' },
  ]

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>

      {/* Header */}
      <div className="border-b px-6 py-4"
        style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}>
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center gap-3 mb-1">
            <Link href="/reports" className="text-sm hover:underline"
              style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>← Reports</Link>
            <span style={{ color: 'var(--text-muted)' }}>/</span>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold text-white"
                style={{ background: clientColor }}>{clientInitials}</div>
              <span className="font-semibold" style={{ color: 'var(--text)' }}>{clientName}</span>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>
                {monthLabel(month)} Report
              </h1>
              <div className="flex items-center gap-3 mt-1">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  approved ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                }`}>
                  {approved ? '✓ Approved — Live in portal' : '⟳ Draft — Internal only'}
                </span>
                {report?.narrative_generated_at && (
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    Narrative generated {new Date(report.narrative_generated_at).toLocaleDateString()}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link href={`/reports/upload?client=${clientId}`}
                className="text-xs px-3 py-1.5 rounded-lg font-medium"
                style={{ background: 'var(--bg-sunken, #f1f5f9)', color: 'var(--text-muted)', textDecoration: 'none' }}>
                ⬆ Upload Files
              </Link>
              {!approved && narrative && (
                <button onClick={approveReport} disabled={approving}
                  className="text-xs px-3 py-1.5 rounded-lg font-semibold disabled:opacity-50"
                  style={{ background: '#10b981', color: 'white' }}>
                  {approving ? 'Approving…' : '✓ Approve for Client'}
                </button>
              )}
              {approved && (
                <button onClick={() => { setApproved(false); supabase.from('client_reports').update({ status: 'draft' }).eq('client_id', clientId).eq('month', month) }}
                  className="text-xs px-3 py-1.5 rounded-lg font-medium"
                  style={{ background: 'var(--bg-sunken, #f1f5f9)', color: 'var(--text-muted)' }}>
                  Unpublish
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tab nav */}
      <div className="border-b px-6 sticky top-0 z-10"
        style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}>
        <div className="max-w-6xl mx-auto flex gap-1 overflow-x-auto">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className="px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors"
              style={{
                color: tab === t.id ? 'var(--text)' : 'var(--text-muted)',
                borderBottom: tab === t.id ? `2px solid ${clientColor}` : '2px solid transparent',
                marginBottom: '-1px',
              }}>
              <span className="mr-1">{t.icon}</span>{t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">

        {/* ── OVERVIEW ────────────────────────────────────────────────────── */}
        {tab === 'overview' && (
          <>
            {/* KPI cards */}
            {hasSocial || hasMeta ? (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <KpiCard label="Impressions" value={fmt(metrics.impressions)} sub="organic social" color={clientColor} />
                <KpiCard label="Engagements" value={fmt(metrics.engagements)} sub={`${pct(metrics.engRate)} rate`} color={clientColor} />
                <KpiCard label="New Followers" value={fmt(metrics.gained)} sub="this month" color={clientColor} />
                <KpiCard label="Meta Spend" value={money(metrics.metaSpend)} sub={`${pct(metrics.metaCtr)} CTR`} color={clientColor} />
                <KpiCard label="Meta CPC" value={money(metrics.metaCpc)} sub={`${fmt(metrics.metaClicks)} clicks`} color={clientColor} />
              </div>
            ) : (
              <NoData message="No data uploaded yet." action={`Upload files at /reports/upload`} />
            )}

            {/* AI Narrative */}
            <div className="rounded-xl border p-5"
              style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-base">✦</span>
                  <span className="text-sm font-bold" style={{ color: 'var(--text)' }}>
                    Monthly Narrative
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'rgba(99,102,241,0.1)', color: '#6366f1' }}>
                    AI Generated
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {narrative && !narrativeEditing && (
                    <button onClick={() => setNarrativeEditing(true)}
                      className="text-xs px-2 py-1 rounded"
                      style={{ color: 'var(--text-muted)' }}>Edit</button>
                  )}
                  {narrativeEditing && (
                    <button onClick={saveNarrative} disabled={savingNarrative}
                      className="text-xs px-3 py-1 rounded font-semibold"
                      style={{ background: clientColor, color: 'white' }}>
                      {savingNarrative ? 'Saving…' : 'Save'}
                    </button>
                  )}
                  <button onClick={generateNarrative} disabled={generating || !hasData}
                    className="text-xs px-3 py-1 rounded font-semibold disabled:opacity-40"
                    style={{ background: '#6366f1', color: 'white' }}>
                    {generating ? 'Generating…' : narrative ? '↺ Regenerate' : '✦ Generate'}
                  </button>
                </div>
              </div>

              {narrativeEditing ? (
                <textarea
                  value={narrative}
                  onChange={e => setNarrative(e.target.value)}
                  rows={6}
                  className="w-full rounded-lg border px-3 py-2 text-sm resize-none focus:outline-none"
                  style={{ background: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text)', lineHeight: 1.7 }}
                />
              ) : narrative ? (
                <div className="text-sm leading-relaxed whitespace-pre-wrap"
                  style={{ color: 'var(--text-muted)' }}>
                  {narrative}
                </div>
              ) : (
                <div className="text-sm italic text-center py-6"
                  style={{ color: 'var(--text-muted)' }}>
                  {hasData ? 'Click "Generate" to create the AI narrative for this report.' : 'Upload files first, then generate the narrative.'}
                </div>
              )}
            </div>

            {/* Claude Analysis */}
            <div className="rounded-xl border p-5"
              style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-base">🤖</span>
                <span className="text-sm font-bold" style={{ color: 'var(--text)' }}>
                  Ask Claude about this report
                </span>
              </div>
              <div className="flex gap-2 mb-3">
                <input
                  type="text"
                  value={claudeQuery}
                  onChange={e => setClaudeQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && askClaude()}
                  placeholder={`e.g. "What's the biggest opportunity for ${clientName} next month?"`}
                  className="flex-1 rounded-lg border px-3 py-2 text-sm focus:outline-none"
                  style={{ background: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text)' }}
                />
                <button onClick={askClaude} disabled={claudeLoading || !claudeQuery.trim() || !hasData}
                  className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-40"
                  style={{ background: 'var(--brand-navy, #0f1e3f)', color: 'white' }}>
                  {claudeLoading ? '…' : 'Ask'}
                </button>
              </div>
              {claudeResponse && (
                <div className="rounded-lg p-4 text-sm leading-relaxed"
                  style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                  {claudeResponse}
                </div>
              )}
              <div className="flex gap-2 mt-2 flex-wrap">
                {[
                  'What should we focus on next month?',
                  'Where is spend performing vs not?',
                  'What content is working best?',
                  'Any red flags in this data?',
                ].map(q => (
                  <button key={q} onClick={() => { setClaudeQuery(q); }}
                    className="text-xs px-2 py-1 rounded-full"
                    style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                    {q}
                  </button>
                ))}
              </div>
            </div>

            {/* Upload status */}
            <div className="rounded-xl border p-5"
              style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}>
              <div className="text-sm font-bold mb-3" style={{ color: 'var(--text)' }}>📂 Data Sources</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { key: 'profile_performance', label: 'Profile Performance', icon: '📊' },
                  { key: 'post_performance',    label: 'Post Performance',    icon: '📊' },
                  { key: 'paid_performance',    label: 'Paid Performance',    icon: '🎯' },
                  { key: 'metrics_excel',       label: 'Metrics Excel',       icon: '📗' },
                ].map(f => {
                  const u = uploadStatus[f.key]
                  return (
                    <div key={f.key} className="rounded-lg border p-3 text-center"
                      style={{ borderColor: u?.parse_status === 'done' ? '#10b981' : 'var(--border)',
                               background: u?.parse_status === 'done' ? 'rgba(16,185,129,0.04)' : 'var(--bg)' }}>
                      <div className="text-xl mb-1">{f.icon}</div>
                      <div className="text-xs font-medium" style={{ color: 'var(--text)' }}>{f.label}</div>
                      <div className="text-xs mt-1"
                        style={{ color: u?.parse_status === 'done' ? '#10b981' : 'var(--text-muted)' }}>
                        {u ? (u.parse_status === 'done' ? `✓ ${(u.row_count || 0).toLocaleString()} rows` : '⟳ Processing') : '— Not uploaded'}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </>
        )}

        {/* ── SOCIAL ──────────────────────────────────────────────────────── */}
        {tab === 'social' && (
          <>
            {hasSocial ? (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <KpiCard label="Total Impressions" value={fmt(metrics.impressions)} color={clientColor} />
                  <KpiCard label="Total Engagements" value={fmt(metrics.engagements)} color={clientColor} />
                  <KpiCard label="Engagement Rate" value={pct(metrics.engRate)} color={clientColor} />
                  <KpiCard label="New Followers" value={fmt(metrics.gained)} color={clientColor} />
                </div>

                {metrics.byPlatform.length > 0 && (
                  <div className="rounded-xl border" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}>
                    <div className="px-5 py-3 border-b text-sm font-bold"
                      style={{ color: 'var(--text)', borderColor: 'var(--border)' }}>
                      By Platform
                    </div>
                    <table className="w-full">
                      <thead>
                        <tr className="border-b" style={{ borderColor: 'var(--border)' }}>
                          {['Platform','Posts','Impressions','Engagements','Eng. Rate'].map(h => (
                            <th key={h} className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wide"
                              style={{ color: 'var(--text-muted)' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {metrics.byPlatform.map((p, i) => {
                          const rate = p.impressions && p.engagements ? (p.engagements / p.impressions * 100) : null
                          return (
                            <tr key={p.key} className="border-b last:border-0"
                              style={{ borderColor: 'var(--border)', background: i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.01)' }}>
                              <td className="px-5 py-3 text-sm font-medium" style={{ color: 'var(--text)' }}>{p.name}</td>
                              <td className="px-5 py-3 text-sm font-mono" style={{ color: 'var(--text-muted)' }}>{fmt(p.posts)}</td>
                              <td className="px-5 py-3 text-sm font-mono" style={{ color: 'var(--text-muted)' }}>{fmt(p.impressions)}</td>
                              <td className="px-5 py-3 text-sm font-mono" style={{ color: 'var(--text-muted)' }}>{fmt(p.engagements)}</td>
                              <td className="px-5 py-3 text-sm font-mono"
                                style={{ color: (rate ?? 0) > 2 ? '#10b981' : (rate ?? 0) > 0.5 ? 'var(--text-muted)' : '#f59e0b' }}>
                                {pct(rate)}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            ) : (
              <NoData message="No social data yet." action="Upload Profile Performance CSV from Sprout Social." />
            )}
          </>
        )}

        {/* ── META ADS ────────────────────────────────────────────────────── */}
        {tab === 'meta' && (
          <>
            {hasMeta ? (
              <>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <KpiCard label="Total Spend" value={money(metrics.metaSpend)} color={clientColor} />
                  <KpiCard label="Impressions" value={fmt(metrics.metaImpressions)} color={clientColor} />
                  <KpiCard label="Clicks" value={fmt(metrics.metaClicks)} color={clientColor} />
                  <KpiCard label="CTR" value={pct(metrics.metaCtr)} color={clientColor} />
                  <KpiCard label="Avg CPC" value={money(metrics.metaCpc)} color={clientColor} />
                </div>
                <div className="rounded-xl border p-5"
                  style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}>
                  <div className="text-sm font-bold mb-2" style={{ color: 'var(--text)' }}>Additional Metrics</div>
                  <div className="grid grid-cols-2 gap-4">
                    <Row label="Engagements" value={fmt(metrics.metaEngagements)} />
                    <Row label="Landing Page Views" value={fmt(metrics.metaLpv)} />
                  </div>
                </div>
              </>
            ) : (
              <NoData message="No Meta Ads data yet." action="Upload Paid Performance CSV from Sprout Social (requires Meta Ad Account connected in Sprout)." />
            )}
          </>
        )}

        {/* ── GOOGLE ADS ──────────────────────────────────────────────────── */}
        {tab === 'google' && (
          <PendingSection
            title="Google Ads"
            icon="🔍"
            reason="Google Ads MCC permission pending — go to Tools → API Center in Google Ads MCC (663-027-0833) and approve Zapier as a data partner."
          />
        )}

        {/* ── WEBSITE ─────────────────────────────────────────────────────── */}
        {tab === 'website' && (
          <PendingSection
            title="Website Analytics"
            icon="🌐"
            reason="GA4 API connection pending. Property IDs are configured — resolve Google Ads permission first, then wire GA4 via Zapier."
          />
        )}

        {/* ── EMAIL ───────────────────────────────────────────────────────── */}
        {tab === 'email' && (
          <PendingSection
            title="Email Marketing"
            icon="📧"
            reason="ActiveCampaign API keys pending. Connect RBS and Apollo accounts in Zapier under My Apps → ActiveCampaign → Add new account."
          />
        )}

      </div>
    </div>
  )
}

// ── Shared components ────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div className="rounded-xl border p-4"
      style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)', borderTopWidth: 3, borderTopColor: color }}>
      <div className="text-xs uppercase tracking-wide mb-2" style={{ color: 'var(--text-muted)' }}>{label}</div>
      <div className="text-2xl font-bold" style={{ color: 'var(--text)' }}>{value}</div>
      {sub && <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{sub}</div>}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span className="font-mono font-medium" style={{ color: 'var(--text)' }}>{value}</span>
    </div>
  )
}

function NoData({ message, action }: { message: string; action: string }) {
  return (
    <div className="rounded-xl border p-12 text-center"
      style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}>
      <div className="text-3xl mb-3">📭</div>
      <div className="text-sm font-semibold mb-1" style={{ color: 'var(--text)' }}>{message}</div>
      <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{action}</div>
    </div>
  )
}

function PendingSection({ title, icon, reason }: { title: string; icon: string; reason: string }) {
  return (
    <div className="rounded-xl border p-8 text-center"
      style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}>
      <div className="text-3xl mb-3">{icon}</div>
      <div className="text-base font-semibold mb-2" style={{ color: 'var(--text)' }}>{title}</div>
      <div className="text-sm max-w-md mx-auto" style={{ color: 'var(--text-muted)' }}>{reason}</div>
      <div className="mt-4 text-xs px-3 py-1.5 rounded-full inline-block"
        style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b' }}>
        ⟳ Pending connection
      </div>
    </div>
  )
}
