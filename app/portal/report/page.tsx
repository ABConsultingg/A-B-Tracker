import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import PortalChannels from './PortalChannels'

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

  const clientId = pu.client_id

  // Default to most recent month with approved channels, fallback to current month
  let month: string = searchParams.month ?? ''
  if (!month) {
    const { data: latestApproval } = await supabase
      .from('client_report_approvals')
      .select('month')
      .eq('client_id', clientId)
      .eq('approved', true)
      .order('month', { ascending: false })
      .limit(1)
      .maybeSingle()
    month = latestApproval?.month ?? currentMonth()
  }

  const [
    { data: report },
    { data: reportData },
    { data: client },
  ] = await Promise.all([
    supabase
      .from('client_reports')
      .select('narrative, status, narrative_generated_at, highlights')
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

  // Fetch approved channels
  const { data: approvals } = await supabase
    .from('client_report_approvals')
    .select('channel, approved, notes')
    .eq('client_id', clientId)
    .eq('month', month)
    .eq('approved', true);

  const approvedChannels = new Set((approvals || []).map((a: { channel: string }) => a.channel));
  const approvalNotes: Record<string, string> = {};
  (approvals || []).forEach((a: { channel: string; notes: string }) => { approvalNotes[a.channel] = a.notes || ''; });

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

      {/* 3 Wins */}
      {report && (report as any).highlights?.filter((h: string) => h?.trim()).length > 0 && (
        <div style={{ background: 'white', border: '2px solid #10b981', borderRadius: 12,
                      padding: 24, marginBottom: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px',
                        color: '#10b981', marginBottom: 16 }}>
            🏆 3 wins this month
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {((report as any).highlights as string[]).filter((h: string) => h?.trim()).map((win: string, i: number) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#d1fae5',
                               display: 'flex', alignItems: 'center', justifyContent: 'center',
                               fontSize: 12, fontWeight: 700, color: '#059669', flexShrink: 0, marginTop: 1 }}>
                  {i + 1}
                </div>
                <p style={{ fontSize: 14, lineHeight: 1.6, color: '#374151', margin: 0 }}>{win}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Live Channel Data */}
      {approvedChannels.size > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: '#1a2744', marginBottom: 12 }}>⚡ Live Performance Data</h2>
          <PortalChannels
            clientId={clientId}
            month={month}
            channels={[
              { id: 'gmb',            icon: '⭐', label: 'Reputation Management' },
              { id: 'meta_ads',       icon: '📘', label: 'Meta Ads' },
              { id: 'google_ads',     icon: '🔵', label: 'Google Ads' },
              { id: 'website',        icon: '📊', label: 'Website Performance' },
              { id: 'social_organic', icon: '🌱', label: 'Social Media' },
              { id: 'email',          icon: '✉️',  label: 'Email Marketing' },
              { id: 'lsa',            icon: '📋', label: 'LSA Leads' },
              { id: 'acquisition',    icon: '💰', label: 'Acquisition Cost' },
              { id: 'calls',          icon: '📞', label: 'Call Log' },
            ]
              .filter(ch => approvedChannels.has(ch.id))
              .map(ch => ({ ...ch, note: approvalNotes[ch.id] || '' }))
            }
          />
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
