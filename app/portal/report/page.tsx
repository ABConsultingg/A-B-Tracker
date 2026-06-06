import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

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
  if (n == null) return '—'
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function pct(n: number | null | undefined) {
  if (n == null) return '—'
  return `${n.toFixed(2)}%`
}

function currentMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export const dynamic = 'force-dynamic'

export default async function PortalReportPage({
  searchParams,
}: {
  searchParams: { month?: string }
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: pu } = await supabase
    .from('portal_users')
    .select('client_id, name')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (!pu) redirect('/portal')

  const month = searchParams.month || currentMonth()
  const clientId = pu.client_id

  const [
    { data: report },
    { data: reportData },
    { data: client },
  ] = await Promise.all([
    supabase
      .from('client_reports')
      .select('narrative, status, narrative_generated_at')
      .eq('client_id', clientId)
      .eq('month', month)
      .eq('status', 'ready')
      .maybeSingle(),
    supabase
      .from('report_data')
      .select('section, platform, metric, value')
      .eq('client_id', clientId)
      .eq('month', month),
    supabase
      .from('clients')
      .select('name')
      .eq('id', clientId)
      .maybeSingle(),
  ])

  // Aggregate key metrics
  const get = (section: string, metric: string) => {
    const rows = (reportData || []).filter(r => r.section === section && r.metric === metric)
    return rows.reduce((s, r) => s + (r.value ?? 0), 0) || null
  }

  const impressions = get('social_organic', 'impressions')
  const engagements = get('social_organic', 'engagements')
  const gained = get('social_organic', 'audience_gained')
  const engRate = impressions && engagements ? (engagements / impressions * 100) : null
  const metaSpend = get('meta_ads', 'spend')
  const metaClicks = get('meta_ads', 'clicks')
  const metaCtr = get('meta_ads', 'impressions') && metaClicks ?
    (metaClicks / get('meta_ads', 'impressions')! * 100) : null

  const hasData = (reportData || []).length > 0
  const clientName = client?.name || clientId

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '32px 24px' }}>

      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <a href="/portal"
          style={{ fontSize: 13, color: '#666', textDecoration: 'none', display: 'inline-block', marginBottom: 12 }}>
          ← Back to portal
        </a>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: '#0f1b34', margin: 0, letterSpacing: '-0.5px' }}>
          {monthLabel(month)} Performance Report
        </h1>
        <p style={{ color: '#666', marginTop: 4, fontSize: 14 }}>{clientName}</p>
      </div>

      {!report && (
        <div style={{ background: '#fef9c3', border: '1px solid #fef08a', borderRadius: 12,
                      padding: '20px 24px', marginBottom: 24, fontSize: 14, color: '#854d0e' }}>
          Your {monthLabel(month)} report is being prepared by the A&B team and will be available here soon.
        </div>
      )}

      {/* Narrative */}
      {report?.narrative && (
        <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12,
                      padding: 24, marginBottom: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px',
                        color: '#6366f1', marginBottom: 12 }}>
            ✦ Monthly Insights
          </div>
          <div style={{ fontSize: 14, lineHeight: 1.75, color: '#374151', whiteSpace: 'pre-wrap' }}>
            {report.narrative}
          </div>
        </div>
      )}

      {/* KPI cards */}
      {hasData && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                      gap: 12, marginBottom: 20 }}>
          {[
            { label: 'Social Impressions', value: fmt(impressions) },
            { label: 'Engagements', value: fmt(engagements) },
            { label: 'Engagement Rate', value: pct(engRate) },
            { label: 'New Followers', value: fmt(gained) },
            { label: 'Meta Ads Spend', value: money(metaSpend) },
            { label: 'Meta Ads CTR', value: pct(metaCtr) },
          ].map(k => (
            <div key={k.label}
              style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 10,
                       padding: '16px 18px', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.8px',
                            color: '#9ca3af', marginBottom: 6, fontWeight: 600 }}>
                {k.label}
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#0f1b34', letterSpacing: '-0.5px' }}>
                {k.value}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Social platform breakdown */}
      {hasData && (() => {
        const platforms = ['facebook', 'instagram', 'linkedin']
        const rows = platforms.map(p => ({
          name: p.charAt(0).toUpperCase() + p.slice(1),
          impressions: (reportData || [])
            .filter(r => r.section === 'social_organic' && r.platform?.includes(p) && r.metric === 'impressions')
            .reduce((s, r) => s + (r.value ?? 0), 0),
          engagements: (reportData || [])
            .filter(r => r.section === 'social_organic' && r.platform?.includes(p) && r.metric === 'engagements')
            .reduce((s, r) => s + (r.value ?? 0), 0),
        })).filter(r => r.impressions > 0 || r.engagements > 0)

        if (!rows.length) return null
        return (
          <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12,
                        padding: 24, marginBottom: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#0f1b34', marginBottom: 16 }}>
              📱 Social Media by Platform
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
                  {['Platform', 'Impressions', 'Engagements', 'Eng. Rate'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '6px 12px 10px',
                                         color: '#9ca3af', fontWeight: 600, fontSize: 11,
                                         textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.name} style={{ borderBottom: '1px solid #f9fafb' }}>
                    <td style={{ padding: '10px 12px', fontWeight: 600, color: '#0f1b34' }}>{r.name}</td>
                    <td style={{ padding: '10px 12px', color: '#6b7280', fontVariantNumeric: 'tabular-nums' }}>
                      {r.impressions.toLocaleString()}
                    </td>
                    <td style={{ padding: '10px 12px', color: '#6b7280', fontVariantNumeric: 'tabular-nums' }}>
                      {r.engagements.toLocaleString()}
                    </td>
                    <td style={{ padding: '10px 12px', fontVariantNumeric: 'tabular-nums',
                                  color: r.impressions > 0 && (r.engagements / r.impressions * 100) > 2 ? '#10b981' : '#6b7280' }}>
                      {r.impressions > 0 ? pct(r.engagements / r.impressions * 100) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      })()}

      {/* Footer */}
      <div style={{ fontSize: 12, color: '#9ca3af', textAlign: 'center', paddingTop: 24 }}>
        Prepared by A&B Consulting Group · {monthLabel(month)}
        {report?.narrative_generated_at && (
          <span> · Generated {new Date(report.narrative_generated_at).toLocaleDateString()}</span>
        )}
      </div>
    </div>
  )
}
