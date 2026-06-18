'use client'
import { useState, useEffect } from 'react'

function fmt(n: number | null | undefined, dec = 0) {
  if (n == null || isNaN(Number(n))) return '—'
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec })
}
function money(n: number | null | undefined) {
  if (n == null) return '—'
  return `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
function pct(n: number | null | undefined) {
  if (n == null) return '—'
  return `${Number(n).toFixed(2)}%`
}
function dur(s: number | null | undefined) {
  if (s == null) return '—'
  return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`
}

const TH: React.CSSProperties = { textAlign: 'left', padding: '7px 10px', fontSize: 10, color: '#9ca3af', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', background: '#f9fafb' }
const TD: React.CSSProperties = { padding: '8px 10px', fontSize: 12, color: '#374151', borderTop: '1px solid #f3f4f6', fontVariantNumeric: 'tabular-nums' }
const TDB: React.CSSProperties = { ...TD, fontWeight: 600, color: '#0f1b34', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }

function KpiGrid({ items }: { items: { label: string; value: string }[] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8, marginTop: 12 }}>
      {items.map(k => (
        <div key={k.label} style={{ background: '#f9fafb', borderRadius: 8, padding: '10px 12px' }}>
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.7px', color: '#9ca3af', fontWeight: 600, marginBottom: 4 }}>{k.label}</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#0f1b34' }}>{k.value}</div>
        </div>
      ))}
    </div>
  )
}

function DataTable({ title, headers, rows }: { title?: string; headers: string[]; rows: (string | number)[][] }) {
  if (!rows.length) return null
  return (
    <div style={{ marginTop: 16 }}>
      {title && <div style={{ fontSize: 12, fontWeight: 700, color: '#0f1b34', marginBottom: 8 }}>{title}</div>}
      <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid #e5e7eb' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead><tr>{headers.map(h => <th key={h} style={TH}>{h}</th>)}</tr></thead>
          <tbody>{rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j} style={j === 0 ? TDB : TD}>{cell}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </div>
  )
}

function renderMeta(d: any) {
  return (
    <div>
      <KpiGrid items={[
        { label: 'Raw Spend', value: money(d.spend) },
        { label: 'Billed', value: money(d.billedSpend ?? d.spend) },
        { label: 'Impressions', value: fmt(d.impressions) },
        { label: 'Clicks', value: fmt(d.clicks) },
        { label: 'CTR', value: pct(d.ctr) },
        { label: 'CPC', value: money(d.cpc) },
        { label: 'CPM', value: money(d.cpm) },
        { label: 'Reach', value: fmt(d.reach) },
        { label: 'Conversions', value: fmt(d.conversions) },
        { label: 'ROAS', value: d.roas != null ? `${d.roas}x` : '—' },
      ]} />
      <DataTable title="Campaign Breakdown" headers={['Campaign', 'Spend', 'Impressions', 'Clicks', 'CTR', 'Conv.']}
        rows={(d.campaigns || []).map((c: any) => [c.name, money(c.spend), fmt(c.impressions), fmt(c.clicks), c.clicks > 0 && c.impressions > 0 ? pct((c.clicks/c.impressions)*100) : '—', fmt(c.conversions)])} />
    </div>
  )
}

function renderGads(d: any) {
  return (
    <div>
      <KpiGrid items={[
        { label: 'Raw Spend', value: money(d.spend) },
        { label: 'Billed', value: money(d.billedSpend ?? d.spend) },
        { label: 'Impressions', value: fmt(d.impressions) },
        { label: 'Clicks', value: fmt(d.clicks) },
        { label: 'CTR', value: pct(d.ctr) },
        { label: 'CPC', value: money(d.cpc) },
        { label: 'CPM', value: money(d.cpm) },
        { label: 'Conversions', value: fmt(d.conversions) },
        { label: 'Cost/Conv.', value: money(d.costPerConversion) },
        { label: 'ROAS', value: d.roas != null ? `${d.roas}x` : '—' },
      ]} />
      <DataTable title="Campaign Breakdown" headers={['Campaign', 'Spend', 'Clicks', 'CTR', 'Conv.']}
        rows={(d.campaigns || []).map((c: any) => [c.name, money(c.cost), fmt(c.clicks), pct(c.ctr), fmt(c.conversions)])} />
    </div>
  )
}

function renderGmb(d: any) {
  return (
    <div>
      <KpiGrid items={[
        { label: 'Search Views', value: fmt(d.searchViews) },
        { label: 'Maps Views', value: fmt(d.mapsViews) },
        { label: 'Total Views', value: fmt(d.totalImpressions) },
        { label: 'Calls', value: fmt(d.calls) },
        { label: 'Directions', value: fmt(d.directions) },
        { label: 'Website Clicks', value: fmt(d.websiteClicks) },
      ]} />
      <DataTable title="Location Breakdown" headers={['BR#', 'Location', 'Search', 'Maps', 'Calls', 'Dir.', 'Website']}
        rows={(d.locations || []).map((l: any) => {
          const parts = (l.address || '').split(',')
          const city = parts.length >= 3 ? `${parts[parts.length-2].trim()}, ${parts[parts.length-1].trim().split(' ')[0]}` : l.address || l.fullName
          return [`#${l.storeCode}`, city, fmt(l.searchViews), fmt(l.mapsViews), fmt(l.calls), fmt(l.directions), fmt(l.websiteClicks)]
        })} />
    </div>
  )
}

function renderEmail(d: any) {
  return (
    <div>
      <KpiGrid items={[
        { label: 'Campaigns', value: fmt(d.campaignCount) },
        { label: 'Sends', value: fmt(d.sends) },
        { label: 'Opens', value: fmt(d.opens) },
        { label: 'Open Rate', value: `${d.openRate}%` },
        { label: 'Clicks', value: fmt(d.clicks) },
        { label: 'Click Rate', value: `${d.clickRate}%` },
        { label: 'Unsubscribes', value: fmt(d.unsubscribes) },
        { label: 'Bounces', value: fmt(d.bounces) },
      ]} />
      <DataTable title="Campaign Breakdown" headers={['Campaign', 'Subject', 'Sends', 'Opens', 'Open Rate', 'Clicks']}
        rows={(d.campaigns || []).map((c: any) => [c.name, c.subject || '—', fmt(c.sends), fmt(c.opens), `${c.openRate}%`, fmt(c.clicks)])} />
    </div>
  )
}

function renderGa4(d: any) {
  return (
    <div>
      <KpiGrid items={[
        { label: 'Sessions', value: fmt(d.sessions) },
        { label: 'Users', value: fmt(d.users) },
        { label: 'New Users', value: fmt(d.newUsers) },
        { label: 'Page Views', value: fmt(d.pageViews) },
        { label: 'Bounce Rate', value: pct(d.bounceRate) },
        { label: 'Avg Session', value: dur(d.avgSessionDuration) },
        { label: 'Conversions', value: fmt(d.conversions) },
        { label: 'Top Channel', value: String(d.topChannel || '—') },
      ]} />
      <DataTable title="Traffic by Channel" headers={['Channel', 'Sessions', 'Users', 'Conversions']}
        rows={(d.channels || []).map((c: any) => [c.channel, fmt(c.sessions), fmt(c.users), fmt(c.conversions)])} />
      {(d.devices || []).length > 0 && (
        <DataTable title="Sessions by Device" headers={['Device', 'Sessions', 'Users']}
          rows={d.devices.map((c: any) => [c.device, fmt(c.sessions), fmt(c.users)])} />
      )}
      {(d.topPages || []).length > 0 && (
        <DataTable title="Top Pages" headers={['Page', 'Views', 'Users', 'Avg Duration']}
          rows={d.topPages.slice(0, 10).map((p: any) => [p.page, fmt(p.views), fmt(p.users), dur(p.avgDuration)])} />
      )}
      {(d.events || []).length > 0 && (
        <DataTable title="Top Events" headers={['Event', 'Count', 'Users']}
          rows={d.events.slice(0, 10).map((e: any) => [e.name, fmt(e.count), fmt(e.users)])} />
      )}
    </div>
  )
}

function renderSocial(d: any) {
  return (
    <div>
      <KpiGrid items={[
        { label: 'Impressions', value: fmt(d.impressions) },
        { label: 'Engagements', value: fmt(d.engagements) },
        { label: 'Eng. Rate', value: pct(d.engRate) },
        { label: 'New Followers', value: fmt(d.gained) },
        { label: 'Video Views', value: fmt(d.videoViews) },
        { label: 'Link Clicks', value: fmt(d.postLinkClicks) },
      ]} />
      <DataTable title="By Platform" headers={['Platform', 'Posts', 'Impressions', 'Engagements', 'Eng. Rate']}
        rows={(d.platforms || []).map((p: any) => [p.platform, fmt(p.posts), fmt(p.impressions), fmt(p.engagements), p.impressions > 0 ? pct((p.engagements/p.impressions)*100) : '—'])} />
    </div>
  )
}

function ChannelCard({ id, icon, label, note, clientId, month }: {
  id: string; icon: string; label: string; note: string; clientId: string; month: string
}) {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open || data) return
    setLoading(true)
    const endpoints: Record<string, string> = {
      meta:   `/api/reports/meta?clientId=${clientId}&month=${month}`,
      gads:   `/api/reports/google-ads?clientId=${clientId}&month=${month}`,
      gmb:    `/api/reports/gmb?clientId=${clientId}&month=${month}`,
      email:  `/api/reports/email?clientId=${clientId}&month=${month}`,
      ga4:    `/api/reports/ga4?clientId=${clientId}&month=${month}`,
      social: `/api/reports/social-portal?clientId=${clientId}&month=${month}`,
    }
    fetch(endpoints[id]).then(r => r.json()).then(d => { setData(d); setLoading(false) }).catch(() => setLoading(false))
  }, [open, id, clientId, month, data])

  const renderData = () => {
    if (loading) return <div style={{ fontSize: 13, color: '#9ca3af', paddingTop: 10 }}>Loading…</div>
    if (!data?.data) return <div style={{ fontSize: 13, color: '#9ca3af', paddingTop: 10 }}>No data available for this period.</div>
    const d = data.data
    if (id === 'meta')   return renderMeta(d)
    if (id === 'gads')   return renderGads(d)
    if (id === 'gmb')    return renderGmb(d)
    if (id === 'email')  return renderEmail(d)
    if (id === 'ga4')    return renderGa4(d)
    if (id === 'social') return renderSocial(d)
    return <div style={{ fontSize: 13, color: '#9ca3af', paddingTop: 10 }}>No data available.</div>
  }

  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, background: '#fff', overflow: 'hidden' }}>
      <button onClick={() => setOpen(o => !o)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
        <span style={{ fontWeight: 600, fontSize: 13, color: '#1a2744' }}>{icon} {label}</span>
        <span style={{ fontSize: 18, color: '#9ca3af', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>›</span>
      </button>
      {open && (
        <div style={{ padding: '0 16px 16px' }}>
          {note && <p style={{ fontSize: 13, color: '#4b5563', margin: '0 0 8px', lineHeight: 1.5 }}>{note}</p>}
          {renderData()}
        </div>
      )}
    </div>
  )
}

export default function PortalChannels({ channels, clientId, month }: {
  channels: { id: string; icon: string; label: string; note: string }[]
  clientId: string
  month: string
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {channels.map(ch => <ChannelCard key={ch.id} {...ch} clientId={clientId} month={month} />)}
    </div>
  )
}
