'use client'
import AcquisitionTab from '@/components/reports/AcquisitionTab'
import CallsTab from '@/components/reports/CallsTab'
import ApprovalTab from '@/components/reports/ApprovalTab'
import React, { useState, useMemo, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
const CHART_COLORS = ['#3b82f6', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4']

// ─── Live Data Tab ────────────────────────────────────────────────────────────

const CHANNEL_META = [
  { id: 'gmb',    icon: '⭐', label: 'Reputation' },
  { id: 'meta',   icon: '📘', label: 'Meta Ads' },
  { id: 'gads',   icon: '🔵', label: 'Google Ads' },
  { id: 'ga4',    icon: '📊', label: 'Website (GA4)' },
  { id: 'social', icon: '🌱', label: 'Social' },
  { id: 'email',  icon: '✉️', label: 'Email' },
] as const;

type ChannelId = typeof CHANNEL_META[number]['id'];

interface Approval {
  approved: boolean;
  notes: string;
  approved_by: string | null;
  approved_at: string | null;
  markup_pct: number | null;
}

function TopPostsSection({ clientId, month }: { clientId: string; month: string }) {
  const [posts, setPosts] = React.useState<any[]>([])
  const supabase = createClient()

  React.useEffect(() => {
    supabase
      .from('post_performance_data')
      .select('*')
      .eq('client_id', clientId)
      .eq('month', month)
      .order('engagements', { ascending: false })
      .limit(4)
      .then(({ data }) => setPosts(data || []))
  }, [clientId, month])

  if (!posts.length) return null

  const networkIcon: Record<string, string> = {
    Facebook: '📘', Instagram: '📸', LinkedIn: '💼', Twitter: '🐦', X: '🐦',
    YouTube: '▶️', TikTok: '🎵', Pinterest: '📌',
  }

  return (
    <div>
      <div className="text-sm font-bold mb-3" style={{ color: 'var(--text)' }}>Top Posts</div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {posts.map((p, i) => (
          <div key={i} className="rounded-xl border flex flex-col"
            style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}>
            {/* Header */}
            <div className="px-3 pt-3 pb-2 border-b" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-base">{networkIcon[p.network] || '📱'}</span>
                <span className="text-xs font-semibold truncate" style={{ color: 'var(--text)' }}>{p.profile}</span>
              </div>
              <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{p.post_date}</div>
            </div>
            {/* Content */}
            <div className="px-3 py-2 flex-1">
              <p className="text-xs leading-relaxed line-clamp-4"
                style={{ color: 'var(--text-muted)', display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                {p.content || '—'}
              </p>
            </div>
            {/* Metrics */}
            <div className="px-3 py-2 border-t" style={{ borderColor: 'var(--border)' }}>
              <div className="font-bold text-sm mb-1" style={{ color: 'var(--text)' }}>
                Engagements <span className="ml-1">{(p.engagements || 0).toLocaleString()}</span>
              </div>
              <div className="grid grid-cols-2 gap-x-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                <span>Reactions {(p.reactions || 0).toLocaleString()}</span>
                <span>Comments {(p.comments || 0).toLocaleString()}</span>
                <span>Shares {(p.shares || 0).toLocaleString()}</span>
                <span>Link Clicks {(p.post_link_clicks || 0).toLocaleString()}</span>
                {p.impressions > 0 && <span className="col-span-2">Impressions {(p.impressions || 0).toLocaleString()}</span>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function GmbTab({ clientId, month }: { clientId: string; month: string }) {
  const [locations, setLocations] = React.useState<any[]>([])
  const [loading, setLoading] = React.useState(true)
  const [rvpFilter, setRvpFilter] = React.useState<string>('All')
  const supabase = createClient()

  React.useEffect(() => {
    supabase
      .from('gmb_location_data')
      .select('*')
      .eq('client_id', clientId)
      .eq('month', month)
      .order('calls', { ascending: false })
      .then(({ data }) => { setLocations(data || []); setLoading(false) })
  }, [clientId, month])

  if (loading) return <div className="text-sm" style={{ color: 'var(--text-muted)', padding: '20px 0' }}>Loading GMB data…</div>
  if (!locations.length) return (
    <div className="rounded-xl border p-8 text-center" style={{ borderColor: 'var(--border)', background: 'var(--bg-elevated)' }}>
      <div className="text-2xl mb-2">📍</div>
      <div className="text-sm font-semibold mb-1" style={{ color: 'var(--text)' }}>No GMB data uploaded</div>
      <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Upload a GMB Performance CSV from Google Business Profile</div>
    </div>
  )

  // RVP filter options
  const rvps = ['All', ...Array.from(new Set(locations.map(l => l.area_manager).filter(Boolean))).sort()]
  const filtered = rvpFilter === 'All' ? locations : locations.filter(l => l.area_manager === rvpFilter)

  const totals = filtered.reduce((a, l) => ({
    search: a.search + (l.search_mobile || 0) + (l.search_desktop || 0),
    maps: a.maps + (l.maps_mobile || 0) + (l.maps_desktop || 0),
    calls: a.calls + (l.calls || 0),
    directions: a.directions + (l.directions || 0),
    website: a.website + (l.website_clicks || 0),
  }), { search: 0, maps: 0, calls: 0, directions: 0, website: 0 })

  const f = (n: number) => n.toLocaleString('en-US')

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Search Views', value: f(totals.search) },
          { label: 'Maps Views', value: f(totals.maps) },
          { label: 'Calls', value: f(totals.calls) },
          { label: 'Directions', value: f(totals.directions) },
          { label: 'Website Clicks', value: f(totals.website) },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-xl border p-4" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}>
            <div className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--text-muted)' }}>{label}</div>
            <div className="text-xl font-bold" style={{ color: 'var(--brand-navy, #1a2744)' }}>{value}</div>
          </div>
        ))}
      </div>

      {/* RVP filter tabs */}
      {rvps.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {rvps.map(rvp => (
            <button
              key={rvp}
              onClick={() => setRvpFilter(rvp)}
              style={{
                padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                border: '1px solid var(--border)',
                background: rvpFilter === rvp ? 'var(--brand-navy, #1a2744)' : 'var(--bg-elevated)',
                color: rvpFilter === rvp ? '#fff' : 'var(--text)',
              }}
            >
              {rvp === 'All' ? `All (${locations.length})` : `${rvp.split(' ')[0]} (${locations.filter(l => l.area_manager === rvp).length})`}
            </button>
          ))}
        </div>
      )}

      <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--bg-sunken)' }}>
              {['BR#', 'Location', 'Search', 'Maps', 'Calls', 'Directions', 'Website'].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '8px 12px', fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((l, i) => {
              const addrParts = (l.address || '').split(',')
              const city = addrParts.length >= 3
                ? `${addrParts[addrParts.length - 2].trim()}, ${addrParts[addrParts.length - 1].trim().split(' ')[0]}`
                : l.address || l.business_name
              return (
                <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    #{l.store_code}
                  </td>
                  <td style={{ padding: '8px 12px', fontWeight: 500, color: 'var(--brand-navy, #1a2744)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {city}
                  </td>
                  <td style={{ padding: '8px 12px', fontFamily: 'monospace' }}>{f((l.search_mobile || 0) + (l.search_desktop || 0))}</td>
                  <td style={{ padding: '8px 12px', fontFamily: 'monospace' }}>{f((l.maps_mobile || 0) + (l.maps_desktop || 0))}</td>
                  <td style={{ padding: '8px 12px', fontFamily: 'monospace' }}>{f(l.calls || 0)}</td>
                  <td style={{ padding: '8px 12px', fontFamily: 'monospace' }}>{f(l.directions || 0)}</td>
                  <td style={{ padding: '8px 12px', fontFamily: 'monospace' }}>{f(l.website_clicks || 0)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function JotformLeadsTab({ clientId, month }: { clientId: string; month: string }) {
  const [data, setData] = React.useState<Record<string, any> | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [msg, setMsg] = React.useState('')

  React.useEffect(() => {
    fetch(`/api/reports/jotform?clientId=${clientId}&month=${month}`)
      .then(r => r.json())
      .then(d => {
        if (!d.configured) { setMsg('No Jotform configured for this client.'); setLoading(false); return }
        if (!d.data) { setMsg(d.message || 'No leads this month.'); setLoading(false); return }
        setData(d.data); setLoading(false)
      })
      .catch(() => { setMsg('Error loading leads data.'); setLoading(false) })
  }, [clientId, month])

  const f = (n: number | null | undefined) => n != null ? n.toLocaleString('en-US') : '—'

  if (loading) return <div className="text-sm" style={{ color: 'var(--text-muted)', padding: '20px 0' }}>Loading leads data…</div>
  if (!data) return <div className="text-sm" style={{ color: 'var(--text-muted)', padding: '20px 0' }}>{msg}</div>

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-xl border p-4" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}>
          <div className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--text-muted)' }}>Total Leads</div>
          <div className="text-2xl font-bold" style={{ color: 'var(--brand-navy, #1a2744)' }}>{f(data.totalLeads)}</div>
        </div>
        {data.totalSignups > 0 && (
          <div className="rounded-xl border p-4" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}>
            <div className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--text-muted)' }}>Newsletter Signups</div>
            <div className="text-2xl font-bold" style={{ color: 'var(--brand-navy, #1a2744)' }}>{f(data.totalSignups)}</div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {data.topManufacturers?.length > 0 && (
          <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
            <div className="px-4 py-2 text-xs font-bold uppercase tracking-wide" style={{ background: 'var(--bg-sunken)', color: 'var(--text-muted)' }}>Top Manufacturers</div>
            {data.topManufacturers.map((m: any, i: number) => (
              <div key={i} className="flex justify-between px-4 py-2 border-t text-sm" style={{ borderColor: 'var(--border)' }}>
                <span style={{ color: 'var(--text)' }}>{m.name}</span>
                <span className="font-mono font-semibold" style={{ color: 'var(--brand-navy, #1a2744)' }}>{m.count}</span>
              </div>
            ))}
          </div>
        )}
        {data.topSources?.length > 0 && (
          <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
            <div className="px-4 py-2 text-xs font-bold uppercase tracking-wide" style={{ background: 'var(--bg-sunken)', color: 'var(--text-muted)' }}>How They Found Us</div>
            {data.topSources.map((s: any, i: number) => (
              <div key={i} className="flex justify-between px-4 py-2 border-t text-sm" style={{ borderColor: 'var(--border)' }}>
                <span style={{ color: 'var(--text)' }}>{s.name}</span>
                <span className="font-mono font-semibold" style={{ color: 'var(--brand-navy, #1a2744)' }}>{s.count}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {data.recentLeads?.length > 0 && (
        <div>
          <div className="text-sm font-bold mb-2" style={{ color: 'var(--text)' }}>Recent Leads</div>
          <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--bg-sunken)' }}>
                  {['Date', 'Name', 'Company', 'Manufacturer', 'Request'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '8px 12px', fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.recentLeads.map((l: any, i: number) => (
                  <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 12px', color: 'var(--text-muted)', fontSize: 12 }}>{l.date}</td>
                    <td style={{ padding: '8px 12px', fontWeight: 500, color: 'var(--brand-navy, #1a2744)' }}>{l.name}</td>
                    <td style={{ padding: '8px 12px', color: 'var(--text-muted)', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.company}</td>
                    <td style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>{l.manufacturer}</td>
                    <td style={{ padding: '8px 12px', color: 'var(--text-muted)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.request}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function EmailTab({ clientId, month }: { clientId: string; month: string }) {
  const [data, setData] = React.useState<Record<string, any> | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [msg, setMsg] = React.useState('')

  const [prevEmail, setPrevEmail] = React.useState<Record<string, any> | null>(null)
  const [lastYearEmail, setLastYearEmail] = React.useState<Record<string, any> | null>(null)

  React.useEffect(() => {
    const [year, mon] = month.split('-').map(Number)
    const prevMonth = mon === 1 ? `${year-1}-12` : `${year}-${String(mon-1).padStart(2,'0')}`
    const lastYearMonth = `${year-1}-${String(mon).padStart(2,'0')}`

    fetch(`/api/reports/email?clientId=${clientId}&month=${month}`)
      .then(r => r.json())
      .then(d => {
        if (!d.configured) { setMsg('Email not configured for this client.'); setLoading(false); return }
        if (!d.data) { setMsg(d.message || 'No campaigns sent this month.'); setLoading(false); return }
        setData(d.data); setLoading(false)
      })
      .catch(() => { setMsg('Error loading email data.'); setLoading(false) })

    fetch(`/api/reports/email?clientId=${clientId}&month=${prevMonth}`)
      .then(r => r.json()).then(d => { if (d.data) setPrevEmail(d.data) }).catch(() => {})
    fetch(`/api/reports/email?clientId=${clientId}&month=${lastYearMonth}`)
      .then(r => r.json()).then(d => { if (d.data) setLastYearEmail(d.data) }).catch(() => {})
  }, [clientId, month])

  const f = (n: number | null | undefined) => n != null ? n.toLocaleString('en-US') : '—'
  const p = (n: number | null | undefined) => n != null ? `${Number(n).toFixed(1)}%` : '—'

  if (loading) return <div className="text-sm" style={{ color: 'var(--text-muted)', padding: '20px 0' }}>Loading email data…</div>
  if (!data) return <div className="text-sm" style={{ color: 'var(--text-muted)', padding: '20px 0' }}>{msg}</div>

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Campaigns', value: f(data.campaignCount), raw: data.campaignCount, prevRaw: prevEmail?.campaignCount, lyRaw: lastYearEmail?.campaignCount },
          { label: 'Sends', value: f(data.sends), raw: data.sends, prevRaw: prevEmail?.sends, lyRaw: lastYearEmail?.sends },
          { label: 'Opens', value: f(data.opens), raw: data.opens, prevRaw: prevEmail?.opens, lyRaw: lastYearEmail?.opens },
          { label: 'Open Rate', value: p(data.openRate), raw: data.openRate, prevRaw: prevEmail?.openRate, lyRaw: lastYearEmail?.openRate },
          { label: 'Clicks', value: f(data.clicks), raw: data.clicks, prevRaw: prevEmail?.clicks, lyRaw: lastYearEmail?.clicks },
          { label: 'Click Rate', value: p(data.clickRate), raw: data.clickRate, prevRaw: prevEmail?.clickRate, lyRaw: lastYearEmail?.clickRate },
          { label: 'Unsubscribes', value: f(data.unsubscribes), raw: data.unsubscribes, prevRaw: prevEmail?.unsubscribes, lyRaw: lastYearEmail?.unsubscribes },
          { label: 'Bounces', value: f(data.bounces), raw: data.bounces, prevRaw: prevEmail?.bounces, lyRaw: lastYearEmail?.bounces },
        ].map(({ label, value, raw, prevRaw, lyRaw }) => (
          <div key={label} className="rounded-xl border p-4" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}>
            <div className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--text-muted)' }}>{label}</div>
            <div className="text-xl font-bold" style={{ color: 'var(--brand-navy, #1a2744)' }}>{value}</div>
            {(prevRaw != null || lyRaw != null) && (
              <div className="mt-1 flex flex-wrap gap-y-0.5">
                <DeltaBadge current={raw} compare={prevRaw} label="vs prev" />
                <DeltaBadge current={raw} compare={lyRaw} label="vs last yr" />
              </div>
            )}
          </div>
        ))}
      </div>
      {data.campaigns?.length > 0 && (
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--bg-sunken)' }}>
                {['Campaign', 'Sends', 'Opens', 'Open Rate', 'Clicks'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '8px 12px', fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.campaigns.map((c: any, i: number) => (
                <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '8px 12px', fontWeight: 500, color: 'var(--brand-navy, #1a2744)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</td>
                  <td style={{ padding: '8px 12px', fontFamily: 'monospace' }}>{f(c.sends)}</td>
                  <td style={{ padding: '8px 12px', fontFamily: 'monospace' }}>{f(c.opens)}</td>
                  <td style={{ padding: '8px 12px', fontFamily: 'monospace' }}>{c.openRate}%</td>
                  <td style={{ padding: '8px 12px', fontFamily: 'monospace' }}>{f(c.clicks)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function MetaTab({ clientId, month, clientColor }: { clientId: string; month: string; clientColor: string }) {
  const [data, setData] = React.useState<Record<string, any> | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [msg, setMsg] = React.useState('')
  const [prevData, setPrevData] = React.useState<Record<string, any> | null>(null)
  const [lastYearData, setLastYearData] = React.useState<Record<string, any> | null>(null)

  React.useEffect(() => {
    const [year, mon] = month.split('-').map(Number)
    const prevMonth = mon === 1 ? `${year-1}-12` : `${year}-${String(mon-1).padStart(2,'0')}`
    const lastYearMonth = `${year-1}-${String(mon).padStart(2,'0')}`

    fetch(`/api/reports/meta?clientId=${clientId}&month=${month}`)
      .then(r => r.json())
      .then(d => {
        if (!d.configured) { setMsg('Meta Ads not configured for this client.'); setLoading(false); return }
        if (!d.data) { setMsg(d.message || 'No Meta Ads data for this period.'); setLoading(false); return }
        setData(d.data); setLoading(false)
      })
      .catch(() => { setMsg('Error loading Meta Ads data.'); setLoading(false) })

    fetch(`/api/reports/meta?clientId=${clientId}&month=${prevMonth}`)
      .then(r => r.json()).then(d => { if (d.data) setPrevData(d.data) }).catch(() => {})
    fetch(`/api/reports/meta?clientId=${clientId}&month=${lastYearMonth}`)
      .then(r => r.json()).then(d => { if (d.data) setLastYearData(d.data) }).catch(() => {})
  }, [clientId, month])

  const f = (n: number | null | undefined) => n != null ? n.toLocaleString('en-US') : '—'
  const p = (n: number | null | undefined) => n != null ? `${Number(n).toFixed(2)}%` : '—'
  const m = (n: number | null | undefined) => n != null ? `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'

  if (loading) return <div className="text-sm" style={{ color: 'var(--text-muted)', padding: '20px 0' }}>Loading Meta Ads data…</div>
  if (!data) return <div className="text-sm" style={{ color: 'var(--text-muted)', padding: '20px 0' }}>{msg}</div>

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiCard label="Raw Spend" value={m(data.spend)} color={clientColor} rawValue={data.spend} prevValue={prevData?.spend} lastYearValue={lastYearData?.spend} />
        <KpiCard label="Billed to Client" value={m(data.billedSpend ?? data.spend)} color={clientColor} rawValue={data.billedSpend ?? data.spend} prevValue={prevData?.billedSpend} lastYearValue={lastYearData?.billedSpend} />
        <KpiCard label="Impressions" value={f(data.impressions)} color={clientColor} rawValue={data.impressions} prevValue={prevData?.impressions} lastYearValue={lastYearData?.impressions} />
        <KpiCard label="Clicks" value={f(data.clicks)} color={clientColor} rawValue={data.clicks} prevValue={prevData?.clicks} lastYearValue={lastYearData?.clicks} />
        <KpiCard label="CTR" value={p(data.ctr)} color={clientColor} rawValue={data.ctr} prevValue={prevData?.ctr} lastYearValue={lastYearData?.ctr} />
        <KpiCard label="Avg CPC" value={m(data.cpc)} color={clientColor} rawValue={data.cpc} prevValue={prevData?.cpc} lastYearValue={lastYearData?.cpc} />
        <KpiCard label="Reach" value={f(data.reach)} color={clientColor} rawValue={data.reach} prevValue={prevData?.reach} lastYearValue={lastYearData?.reach} />
        <KpiCard label="CPM" value={m(data.cpm)} color={clientColor} rawValue={data.cpm} prevValue={prevData?.cpm} lastYearValue={lastYearData?.cpm} />
        <KpiCard label="Conversions" value={f(data.conversions)} color={clientColor} rawValue={data.conversions} prevValue={prevData?.conversions} lastYearValue={lastYearData?.conversions} />
        <KpiCard label="ROAS" value={data.roas != null ? `${data.roas}x` : '—'} color={clientColor} rawValue={data.roas} prevValue={prevData?.roas} lastYearValue={lastYearData?.roas} />
      </div>

      {data.daily?.length > 1 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2 rounded-xl border p-4" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}>
            <div className="text-sm font-bold mb-3" style={{ color: 'var(--text)' }}>Impressions & Clicks Over Time</div>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={data.daily}>
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(d: string) => d.slice(5)} />
                <YAxis yAxisId="left" tick={{ fontSize: 10 }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} />
                <Tooltip formatter={(val: any) => Number(val).toLocaleString()} labelFormatter={(d: any) => d} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line yAxisId="left" type="monotone" dataKey="impressions" stroke="#3b82f6" dot={false} name="Impressions" />
                <Line yAxisId="right" type="monotone" dataKey="clicks" stroke="#f59e0b" dot={false} name="Clicks" />
              </LineChart>
            </ResponsiveContainer>
          </div>
          {data.devices?.length > 0 && (
            <div className="rounded-xl border p-4" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}>
              <div className="text-sm font-bold mb-3" style={{ color: 'var(--text)' }}>Clicks by Device</div>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={data.devices} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, percent }: any) => `${name ?? ""} ${((percent ?? 0) * 100).toFixed(0)}%`} labelLine={false} fontSize={10}>
                    {data.devices.map((_: unknown, i: number) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(val: any) => Number(val).toLocaleString()} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {data.campaigns?.length > 0 && (
        <div>
          <div className="text-sm font-bold mb-3" style={{ color: 'var(--text)' }}>Campaign Breakdown</div>
          <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--bg-sunken)' }}>
                  {['Campaign', 'Spend', 'Impressions', 'Clicks', 'CTR', 'Conv.'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '8px 12px', fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.campaigns.map((c: any, i: number) => (
                  <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 12px', fontWeight: 500, color: 'var(--brand-navy, #1a2744)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</td>
                    <td style={{ padding: '8px 12px', fontFamily: 'monospace' }}>{m(c.spend)}</td>
                    <td style={{ padding: '8px 12px', fontFamily: 'monospace' }}>{f(c.impressions)}</td>
                    <td style={{ padding: '8px 12px', fontFamily: 'monospace' }}>{f(c.clicks)}</td>
                    <td style={{ padding: '8px 12px', fontFamily: 'monospace' }}>{c.clicks > 0 && c.impressions > 0 ? p((c.clicks/c.impressions)*100) : '—'}</td>
                    <td style={{ padding: '8px 12px', fontFamily: 'monospace' }}>{f(c.conversions)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function GAdsTab({ clientId, month, clientColor }: { clientId: string; month: string; clientColor: string }) {
  const [data, setData] = React.useState<Record<string, any> | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [msg, setMsg] = React.useState('')

  const [prevData, setPrevData] = React.useState<Record<string, any> | null>(null)
  const [lastYearData, setLastYearData] = React.useState<Record<string, any> | null>(null)

  React.useEffect(() => {
    const [year, mon] = month.split('-').map(Number)
    const prevMonth = mon === 1 ? `${year-1}-12` : `${year}-${String(mon-1).padStart(2,'0')}`
    const lastYearMonth = `${year-1}-${String(mon).padStart(2,'0')}`

    fetch(`/api/reports/google-ads?clientId=${clientId}&month=${month}`)
      .then(r => r.json())
      .then(d => {
        if (!d.configured) { setMsg('Google Ads not configured for this client.'); setLoading(false); return }
        if (!d.data) { setMsg(d.message || 'No data for this period.'); setLoading(false); return }
        setData(d.data); setLoading(false)
      })
      .catch(() => { setMsg('Error loading Google Ads data.'); setLoading(false) })

    fetch(`/api/reports/google-ads?clientId=${clientId}&month=${prevMonth}`)
      .then(r => r.json()).then(d => { if (d.data) setPrevData(d.data) }).catch(() => {})

    fetch(`/api/reports/google-ads?clientId=${clientId}&month=${lastYearMonth}`)
      .then(r => r.json()).then(d => { if (d.data) setLastYearData(d.data) }).catch(() => {})
  }, [clientId, month])

  const f = (n: number | null | undefined) => n != null ? n.toLocaleString('en-US') : '—'
  const p = (n: number | null | undefined) => n != null ? `${Number(n).toFixed(2)}%` : '—'
  const m = (n: number | null | undefined) => n != null ? `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'

  if (loading) return <div className="text-sm" style={{ color: 'var(--text-muted)', padding: '20px 0' }}>Loading Google Ads data…</div>
  if (!data) return <div className="text-sm" style={{ color: 'var(--text-muted)', padding: '20px 0' }}>{msg}</div>

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiCard label="Raw Spend" value={m(data.spend)} color={clientColor} rawValue={data.spend} prevValue={prevData?.spend} lastYearValue={lastYearData?.spend} />
        <KpiCard label="Billed to Client" value={m(data.billedSpend ?? data.spend)} color={clientColor} rawValue={data.billedSpend ?? data.spend} prevValue={prevData?.billedSpend} lastYearValue={lastYearData?.billedSpend} />
        <KpiCard label="Clicks" value={f(data.clicks)} color={clientColor} rawValue={data.clicks} prevValue={prevData?.clicks} lastYearValue={lastYearData?.clicks} />
        <KpiCard label="CTR" value={p(data.ctr)} color={clientColor} rawValue={data.ctr} prevValue={prevData?.ctr} lastYearValue={lastYearData?.ctr} />
        <KpiCard label="Conversions" value={f(data.conversions)} color={clientColor} rawValue={data.conversions} prevValue={prevData?.conversions} lastYearValue={lastYearData?.conversions} />
        <KpiCard label="Impressions" value={f(data.impressions)} color={clientColor} rawValue={data.impressions} prevValue={prevData?.impressions} lastYearValue={lastYearData?.impressions} />
        <KpiCard label="CPC" value={m(data.cpc)} color={clientColor} rawValue={data.cpc} prevValue={prevData?.cpc} lastYearValue={lastYearData?.cpc} />
        <KpiCard label="CPM" value={m(data.cpm)} color={clientColor} rawValue={data.cpm} prevValue={prevData?.cpm} lastYearValue={lastYearData?.cpm} />
        <KpiCard label="Cost/Conv." value={m(data.costPerConversion)} color={clientColor} rawValue={data.costPerConversion} prevValue={prevData?.costPerConversion} lastYearValue={lastYearData?.costPerConversion} />
        <KpiCard label="ROAS" value={data.roas != null ? `${data.roas}x` : '—'} color={clientColor} rawValue={data.roas} prevValue={prevData?.roas} lastYearValue={lastYearData?.roas} />
      </div>

      {/* Charts row */}
      {data.daily?.length > 1 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Impressions + Clicks over time */}
          <div className="md:col-span-2 rounded-xl border p-4" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}>
            <div className="text-sm font-bold mb-3" style={{ color: 'var(--text)' }}>Impressions & Clicks Over Time</div>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={data.daily}>
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(d: string) => d.slice(5)} />
                <YAxis yAxisId="left" tick={{ fontSize: 10 }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} />
                <Tooltip formatter={(val: any) => Number(val).toLocaleString()} labelFormatter={(d: any) => d} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line yAxisId="left" type="monotone" dataKey="impressions" stroke="#3b82f6" dot={false} name="Impressions" />
                <Line yAxisId="right" type="monotone" dataKey="clicks" stroke="#f59e0b" dot={false} name="Clicks" />
              </LineChart>
            </ResponsiveContainer>
          </div>
          {/* Device breakdown */}
          {data.devices?.length > 0 && (
            <div className="rounded-xl border p-4" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}>
              <div className="text-sm font-bold mb-3" style={{ color: 'var(--text)' }}>Clicks by Device</div>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={data.devices} dataKey="clicks" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, percent }: any) => `${name ?? ""} ${((percent ?? 0) * 100).toFixed(0)}%`} labelLine={false} fontSize={10}>
                    {data.devices.map((_: unknown, i: number) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(val: any) => Number(val).toLocaleString()} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* Charts row */}
      {data.daily?.length > 1 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Impressions + Clicks over time */}
          <div className="md:col-span-2 rounded-xl border p-4" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}>
            <div className="text-sm font-bold mb-3" style={{ color: 'var(--text)' }}>Impressions & Clicks Over Time</div>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={data.daily}>
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(d: string) => d.slice(5)} />
                <YAxis yAxisId="left" tick={{ fontSize: 10 }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} />
                <Tooltip formatter={(val: any) => Number(val).toLocaleString()} labelFormatter={(d: any) => d} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line yAxisId="left" type="monotone" dataKey="impressions" stroke="#3b82f6" dot={false} name="Impressions" />
                <Line yAxisId="right" type="monotone" dataKey="clicks" stroke="#f59e0b" dot={false} name="Clicks" />
              </LineChart>
            </ResponsiveContainer>
          </div>
          {/* Device breakdown */}
          {data.devices?.length > 0 && (
            <div className="rounded-xl border p-4" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}>
              <div className="text-sm font-bold mb-3" style={{ color: 'var(--text)' }}>Clicks by Device</div>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={data.devices} dataKey="clicks" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, percent }: any) => `${name ?? ""} ${((percent ?? 0) * 100).toFixed(0)}%`} labelLine={false} fontSize={10}>
                    {data.devices.map((_: unknown, i: number) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(val: any) => Number(val).toLocaleString()} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}
      {data.campaigns?.length > 0 && (
        <div>
          <div className="text-sm font-bold mb-3" style={{ color: 'var(--text)' }}>Campaign Breakdown</div>
          <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--bg-sunken)' }}>
                  {['Campaign', 'Account', 'Spend', 'Clicks', 'CTR', 'Conv.'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '8px 12px', fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.campaigns.map((c: any, i: number) => (
                  <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 12px', fontWeight: 500, color: 'var(--brand-navy, #1a2744)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</td>
                    <td style={{ padding: '8px 12px', fontSize: 11, color: 'var(--text-muted)' }}>{c.account}</td>
                    <td style={{ padding: '8px 12px', fontFamily: 'monospace' }}>{m(c.cost)}</td>
                    <td style={{ padding: '8px 12px', fontFamily: 'monospace' }}>{f(c.clicks)}</td>
                    <td style={{ padding: '8px 12px', fontFamily: 'monospace' }}>{p(c.ctr)}</td>
                    <td style={{ padding: '8px 12px', fontFamily: 'monospace' }}>{f(c.conversions)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {data.markupPct > 0 && (
        <div className="text-xs rounded-lg px-3 py-2" style={{ background: 'var(--bg-sunken)', color: 'var(--text-muted)' }}>
          💡 Billed to client includes {data.markupPct}% markup on raw Google spend.
        </div>
      )}
    </div>
  )
}

function WebsiteTab({ clientId, month }: { clientId: string; month: string }) {
  const [ga4, setGa4] = React.useState<Record<string, any> | null>(null)
  const [sc, setSc] = React.useState<Record<string, any> | null>(null)
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    const q = `clientId=${clientId}&month=${month}`
    Promise.all([
      fetch(`/api/reports/ga4?${q}`).then(r => r.json()).catch(() => null),
      fetch(`/api/reports/search-console?${q}`).then(r => r.json()).catch(() => null),
    ]).then(([g, s]) => {
      setGa4(g?.data || null)
      setSc(s?.configured ? (s?.data || null) : null)
      setLoading(false)
    })
  }, [clientId, month])

  const f = (n: number | null | undefined) => n != null ? n.toLocaleString('en-US') : '—'
  const p = (n: number | null | undefined) => n != null ? `${Number(n).toFixed(1)}%` : '—'

  if (loading) return <div className="text-sm" style={{ color: 'var(--text-muted)', padding: '20px 0' }}>Loading website data…</div>

  return (
    <div className="space-y-6">
      {/* GA4 Section */}
      {ga4 && (
        <div>
          <div className="text-sm font-bold mb-3" style={{ color: 'var(--text)' }}>📊 Website Analytics (GA4)</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Sessions', value: f(ga4.sessions) },
              { label: 'Users', value: f(ga4.users) },
              { label: 'New Users', value: f(ga4.newUsers) },
              { label: 'Bounce Rate', value: p(ga4.bounceRate) },
              { label: 'Avg Session', value: ga4.avgSessionDuration ? `${Math.floor(Number(ga4.avgSessionDuration)/60)}m ${Math.round(Number(ga4.avgSessionDuration)%60)}s` : '—' },
              { label: 'Page Views', value: f(ga4.pageViews) },
              { label: 'Conversions', value: f(ga4.conversions) },
              { label: 'Top Channel', value: String(ga4.topChannel || '—') },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-xl border p-4" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}>
                <div className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--text-muted)' }}>{label}</div>
                <div className="text-xl font-bold" style={{ color: 'var(--brand-navy, #1a2744)' }}>{value}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Search Console Section */}
      {sc ? (
        <div>
          <div className="text-sm font-bold mb-3" style={{ color: 'var(--text)' }}>🔍 Search Console (SEO)</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {[
              { label: 'Total Clicks', value: f(sc.clicks) },
              { label: 'Impressions', value: f(sc.impressions) },
              { label: 'Avg CTR', value: p(sc.ctr) },
              { label: 'Avg Position', value: sc.position != null ? `#${sc.position}` : '—' },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-xl border p-4" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}>
                <div className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--text-muted)' }}>{label}</div>
                <div className="text-xl font-bold" style={{ color: 'var(--brand-navy, #1a2744)' }}>{value}</div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Top Queries */}
            {sc.topQueries?.length > 0 && (
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--text-muted)' }}>Top Queries</div>
                <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: 'var(--bg-sunken)' }}>
                        {['Query', 'Clicks', 'Impr.', 'CTR', 'Pos.'].map(h => (
                          <th key={h} style={{ textAlign: 'left', padding: '6px 10px', fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sc.topQueries.map((q: any, i: number) => (
                        <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                          <td style={{ padding: '6px 10px', fontWeight: 500, color: 'var(--brand-navy, #1a2744)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.query}</td>
                          <td style={{ padding: '6px 10px', fontFamily: 'monospace' }}>{q.clicks}</td>
                          <td style={{ padding: '6px 10px', fontFamily: 'monospace' }}>{q.impressions}</td>
                          <td style={{ padding: '6px 10px', fontFamily: 'monospace' }}>{q.ctr}%</td>
                          <td style={{ padding: '6px 10px', fontFamily: 'monospace' }}>#{q.position}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {/* Top Pages */}
            {sc.topPages?.length > 0 && (
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--text-muted)' }}>Top Landing Pages</div>
                <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: 'var(--bg-sunken)' }}>
                        {['Page', 'Clicks', 'Impr.', 'Pos.'].map(h => (
                          <th key={h} style={{ textAlign: 'left', padding: '6px 10px', fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sc.topPages.map((pg: any, i: number) => (
                        <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                          <td style={{ padding: '6px 10px', fontWeight: 500, color: 'var(--brand-navy, #1a2744)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pg.page || '/'}</td>
                          <td style={{ padding: '6px 10px', fontFamily: 'monospace' }}>{pg.clicks}</td>
                          <td style={{ padding: '6px 10px', fontFamily: 'monospace' }}>{pg.impressions}</td>
                          <td style={{ padding: '6px 10px', fontFamily: 'monospace' }}>#{pg.position}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="text-sm rounded-lg px-3 py-2" style={{ background: 'var(--bg-sunken)', color: 'var(--text-muted)' }}>
          Search Console not configured for this client.
        </div>
      )}
    </div>
  )
}

function GA4Tab({ clientId, month }: { clientId: string; month: string }) {
  const [data, setData] = React.useState<Record<string, number | string | null> | null>(null)
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    fetch(`/api/reports/ga4?clientId=${clientId}&month=${month}`)
      .then(r => r.json())
      .then(d => { setData(d.data || null); setLoading(false) })
      .catch(() => setLoading(false))
  }, [clientId, month])

  if (loading) return <div className="text-sm" style={{ color: 'var(--text-muted)', padding: '20px 0' }}>Loading GA4 data…</div>
  if (!data) return <div className="text-sm" style={{ color: 'var(--text-muted)', padding: '20px 0' }}>No GA4 data available for this period.</div>

  const fmt = (n: number | null | undefined, dec = 0) => n != null ? n.toLocaleString('en-US', { maximumFractionDigits: dec }) : '—'
  const pct = (n: number | null | undefined) => n != null ? `${Number(n).toFixed(1)}%` : '—'

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {[
        { label: 'Sessions',     value: fmt(data.sessions as number) },
        { label: 'Users',        value: fmt(data.users as number) },
        { label: 'New Users',    value: fmt(data.newUsers as number) },
        { label: 'Bounce Rate',  value: pct(data.bounceRate as number) },
        { label: 'Avg Session',  value: data.avgSessionDuration ? `${Math.floor(Number(data.avgSessionDuration) / 60)}m ${Math.round(Number(data.avgSessionDuration) % 60)}s` : '—' },
        { label: 'Page Views',   value: fmt(data.pageViews as number) },
        { label: 'Conversions',  value: fmt(data.conversions as number) },
        { label: 'Top Channel',  value: String(data.topChannel || '—') },
      ].map(({ label, value }) => (
        <div key={label} className="rounded-xl border p-4" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}>
          <div className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--text-muted)' }}>{label}</div>
          <div className="text-xl font-bold" style={{ color: 'var(--brand-navy, #1a2744)' }}>{value}</div>
        </div>
      ))}
    </div>
  )
}

function LiveDataTab({ clientId, month }: { clientId: string; month: string }) {
  const [approvals, setApprovals] = useState<Record<string, Approval>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [editingNotes, setEditingNotes] = useState<Record<string, string>>({});
  const [editingMarkup, setEditingMarkup] = useState<Record<string, string>>({});
  const [loadingApprovals, setLoadingApprovals] = useState(true);

  useEffect(() => {
    fetch(`/api/reports/approve?clientId=${clientId}&month=${month}`)
      .then(r => r.json())
      .then(d => {
        setApprovals(d.approvals || {});
        const notes: Record<string, string> = {};
        const markup: Record<string, string> = {};
        Object.entries(d.approvals || {}).forEach(([ch, a]) => {
          notes[ch] = (a as Approval).notes || '';
          markup[ch] = (a as Approval).markup_pct != null ? String((a as Approval).markup_pct) : '30';
        });
        setEditingNotes(notes);
        setEditingMarkup(markup);
      })
      .finally(() => setLoadingApprovals(false));
  }, [clientId, month]);

  const toggleApproval = async (channel: ChannelId) => {
    const current = approvals[channel];
    const newApproved = !current?.approved;
    setSaving(prev => ({ ...prev, [channel]: true }));

    const res = await fetch('/api/reports/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId, month, channel,
        approved: newApproved,
        notes: editingNotes[channel] || '',
        markup_pct: parseFloat(editingMarkup[channel] || '30') || 30,
      }),
    });

    if (res.ok) {
      setApprovals(prev => ({
        ...prev,
        [channel]: {
          ...prev[channel],
          approved: newApproved,
          approved_at: newApproved ? new Date().toISOString() : null,
        },
      }));
    }
    setSaving(prev => ({ ...prev, [channel]: false }));
  };

  const saveNotes = async (channel: ChannelId) => {
    setSaving(prev => ({ ...prev, [`notes_${channel}`]: true }));
    await fetch('/api/reports/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId, month, channel,
        approved: approvals[channel]?.approved || false,
        notes: editingNotes[channel] || '',
        markup_pct: parseFloat(editingMarkup[channel] || '30') || 30,
      }),
    });
    setApprovals(prev => ({
      ...prev,
      [channel]: { ...prev[channel], notes: editingNotes[channel] || '', markup_pct: parseFloat(editingMarkup[channel] || '30') || 30 },
    }));
    setSaving(prev => ({ ...prev, [`notes_${channel}`]: false }));
  };

  const approvedCount = CHANNEL_META.filter(c => approvals[c.id]?.approved).length;

  if (loadingApprovals) {
    return <div style={{ padding: '32px 0', color: 'var(--text-muted)', fontSize: 14 }}>Loading approvals…</div>;
  }

  return (
    <div>
      {/* Status bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 20, padding: '12px 16px',
        background: approvedCount === CHANNEL_META.length ? '#f0fdf4' : 'var(--bg-sunken)',
        border: `1px solid ${approvedCount === CHANNEL_META.length ? '#86efac' : 'var(--border)'}`,
        borderRadius: 10,
      }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--brand-navy)' }}>
          {approvedCount}/{CHANNEL_META.length} channels approved
        </div>
        {approvedCount > 0 && (
          <a
            href={`/dashboard/reports`}
            style={{ fontSize: 12, color: '#16a34a', fontWeight: 600, textDecoration: 'none' }}
          >
            ✓ {approvedCount} published to client portal
          </a>
        )}
      </div>

      {/* Channel approval rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {CHANNEL_META.map(ch => {
          const approval = approvals[ch.id];
          const isApproved = approval?.approved || false;
          const isSaving = saving[ch.id];

          return (
            <div key={ch.id} style={{
              border: `1px solid ${isApproved ? '#86efac' : 'var(--border)'}`,
              borderRadius: 10,
              padding: '14px 16px',
              background: isApproved ? '#f0fdf4' : 'var(--bg-elevated)',
              transition: 'all 0.15s',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 16 }}>{ch.icon}</span>
                <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--brand-navy)', flex: 1 }}>{ch.label}</span>

                {isApproved && approval?.approved_at && (
                  <span style={{ fontSize: 11, color: '#16a34a' }}>
                    Approved {new Date(approval.approved_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    {approval.approved_by ? ` by ${approval.approved_by.split('@')[0]}` : ''}
                  </span>
                )}

                <button
                  onClick={() => toggleApproval(ch.id)}
                  disabled={isSaving}
                  style={{
                    fontSize: 12, fontWeight: 600, padding: '6px 14px', borderRadius: 7,
                    border: `1px solid ${isApproved ? '#16a34a' : 'var(--border)'}`,
                    background: isApproved ? '#16a34a' : 'transparent',
                    color: isApproved ? '#fff' : 'var(--text-muted)',
                    cursor: isSaving ? 'not-allowed' : 'pointer',
                    transition: 'all 0.15s',
                    opacity: isSaving ? 0.6 : 1,
                  }}
                >
                  {isSaving ? '…' : isApproved ? '✓ Approved' : 'Approve'}
                </button>
              </div>

              {/* Notes + Markup row */}
              <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <textarea
                  value={editingNotes[ch.id] || ''}
                  onChange={e => setEditingNotes(prev => ({ ...prev, [ch.id]: e.target.value }))}
                  placeholder={`Add notes for ${ch.label} — shown to client after approval`}
                  rows={2}
                  style={{
                    flex: 1, fontSize: 12, padding: '8px 10px',
                    border: '1px solid var(--border)', borderRadius: 7,
                    background: 'var(--bg)', color: 'var(--text)',
                    resize: 'vertical', fontFamily: 'inherit',
                    boxSizing: 'border-box',
                  }}
                  onBlur={() => {
                    if ((editingNotes[ch.id] || '') !== (approval?.notes || '')) {
                      saveNotes(ch.id);
                    }
                  }}
                />
                {(ch.id === 'meta' || ch.id === 'gads') && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 90 }}>
                    <label style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>MARKUP %</label>
                    <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--border)', borderRadius: 7, overflow: 'hidden', background: 'var(--bg)' }}>
                      <input
                        type="number"
                        min="0"
                        max="200"
                        step="1"
                        value={editingMarkup[ch.id] ?? '30'}
                        onChange={e => setEditingMarkup(prev => ({ ...prev, [ch.id]: e.target.value }))}
                        onBlur={() => saveNotes(ch.id)}
                        style={{
                          width: '100%', fontSize: 13, padding: '7px 8px', border: 'none',
                          background: 'transparent', color: 'var(--text)', fontWeight: 600,
                          fontFamily: 'monospace', outline: 'none',
                        }}
                      />
                      <span style={{ paddingRight: 8, fontSize: 13, color: 'var(--text-muted)' }}>%</span>
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                      Billed: ${((parseFloat(editingMarkup[ch.id] || '30') / 100 + 1)).toFixed(2)}x raw
                    </div>
                  </div>
                )}
              </div>
              {saving[`notes_${ch.id}`] && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>Saving…</div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 16, padding: '12px 14px', background: 'var(--bg-sunken)', borderRadius: 8, fontSize: 12, color: 'var(--text-muted)' }}>
        💡 Approved channels appear in the client portal under "Live Data". Notes are visible to the client. Markup and billing details are always hidden.
      </div>
    </div>
  );
}

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
  highlights: string[] | null
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
  isAdmin?: boolean
  defaultMarkup?: number
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

type TabId = 'social' | 'meta' | 'google' | 'website' | 'email' | 'overview' | 'live' | 'gmb' | 'leads' | 'approve' | 'calls' | 'acquisition'

export default function ReportDashboard({
  clientId, clientName, clientInitials, clientColor,
  month, reportData, report, uploads,
  isAdmin = false,
  defaultMarkup = 0,
}: Props) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
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
  const [highlights, setHighlights] = useState<string[]>(report?.highlights || ['', '', ''])
  const [generatingHighlights, setGeneratingHighlights] = useState(false)
  const [savingHighlights, setSavingHighlights] = useState(false)

  // Live ad data from Windsor when report_data has no meta/gads
  const [liveAds, setLiveAds] = useState<{
    metaSpend: number | null; metaClicks: number | null; metaCtr: number | null; metaCpc: number | null; metaImpressions: number | null;
    gadsSpend: number | null; gadsClicks: number | null; gadsCtr: number | null; gadsCpc: number | null; gadsConversions: number | null; gadsBilled: number | null;
  } | null>(null)

  // Build enriched summary including Windsor live data
  function buildSummary() {
    const base = reportData.map(r => `${r.section} / ${r.platform} / ${r.metric}: ${r.value}`).join('\n')
    if (!liveAds) return base
    const adLines = [
      liveAds.metaSpend    != null ? `meta_ads / meta / spend: ${liveAds.metaSpend}` : '',
      liveAds.metaClicks   != null ? `meta_ads / meta / clicks: ${liveAds.metaClicks}` : '',
      liveAds.metaCtr      != null ? `meta_ads / meta / ctr: ${liveAds.metaCtr}` : '',
      liveAds.metaCpc      != null ? `meta_ads / meta / cpc: ${liveAds.metaCpc}` : '',
      liveAds.gadsSpend    != null ? `google_ads / google / spend: ${liveAds.gadsSpend}` : '',
      liveAds.gadsBilled   != null ? `google_ads / google / billed_spend: ${liveAds.gadsBilled}` : '',
      liveAds.gadsClicks   != null ? `google_ads / google / clicks: ${liveAds.gadsClicks}` : '',
      liveAds.gadsCtr      != null ? `google_ads / google / ctr: ${liveAds.gadsCtr}` : '',
      liveAds.gadsConversions != null ? `google_ads / google / conversions: ${liveAds.gadsConversions}` : '',
    ].filter(Boolean).join('\n')
    return [base, adLines].filter(Boolean).join('\n')
  }

  useEffect(() => {
    // Only fetch Windsor if report_data has no meta_ads rows
    const hasMetaInDb = reportData.some(r => r.section === 'meta_ads')
    if (hasMetaInDb) return
    const q = `clientId=${clientId}&month=${month}`
    Promise.all([
      fetch(`/api/reports/meta?${q}`).then(r => r.json()).catch(() => null),
      fetch(`/api/reports/google-ads?${q}`).then(r => r.json()).catch(() => null),
    ]).then(([meta, gads]) => {
      setLiveAds({
        metaSpend:       meta?.data?.spend       ?? null,
        metaClicks:      meta?.data?.clicks      ?? null,
        metaCtr:         meta?.data?.ctr         ?? null,
        metaCpc:         meta?.data?.cpc         ?? null,
        metaImpressions: meta?.data?.impressions ?? null,
        gadsSpend:       gads?.data?.spend       ?? null,
        gadsBilled:      gads?.data?.billedSpend ?? null,
        gadsClicks:      gads?.data?.clicks      ?? null,
        gadsCtr:         gads?.data?.ctr         ?? null,
        gadsCpc:         gads?.data?.cpc         ?? null,
        gadsConversions: gads?.data?.conversions ?? null,
      })
    })
  }, [clientId, month, reportData])

  async function generateHighlights() {
    setGeneratingHighlights(true)
    const summary = buildSummary()
    try {
      const res = await fetch('/api/reports/narrative', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId, clientName, month: monthLabel(month), summary,
          question: 'List exactly 3 positive highlights from this month in plain language a client would understand. Each highlight should be one sentence, specific, and start with a number or metric where possible. Return ONLY a JSON array of 3 strings, nothing else. Example: ["Impressions grew 24% to 45,000 this month", "Your Facebook engagement rate outperformed the industry average", "3 new followers gained on LinkedIn"]',
        }),
      })
      if (!res.ok) throw new Error('API error')
      const { narrative: raw } = await res.json()
      const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim())
      if (Array.isArray(parsed) && parsed.length >= 3) {
        const wins = parsed.slice(0, 3).map((s: unknown) => String(s))
        setHighlights(wins)
        await supabase.from('client_reports').upsert({
          client_id: clientId, month, status: report?.status || 'draft',
          highlights: wins,
        }, { onConflict: 'client_id,month' })
      }
    } catch { /* fail silently */ }
    setGeneratingHighlights(false)
  }

  async function saveHighlights() {
    setSavingHighlights(true)
    await supabase.from('client_reports').upsert({
      client_id: clientId, month, status: report?.status || 'draft',
      highlights,
    }, { onConflict: 'client_id,month' })
    setSavingHighlights(false)
  }

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
  const hasMeta = metrics.metaSpend != null || liveAds?.metaSpend != null
  const hasSocial = metrics.impressions != null
  const hasLiveAds = liveAds != null && (liveAds.metaSpend != null || liveAds.gadsSpend != null)
  const hasAnyData = hasData || hasLiveAds

  const monthOptions = useMemo(() => {
    const opts = []
    const now = new Date()
    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      opts.push({ value: val, label: d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) })
    }
    return opts
  }, [])

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
    const summary = buildSummary()
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
    const summary = buildSummary()
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
    { id: 'overview', label: 'Overview',   icon: '📊' },
    { id: 'live',     label: 'Live Data',  icon: '⚡' },
    { id: 'social',   label: 'Social',     icon: '📱' },
    { id: 'meta',     label: 'Meta Ads',   icon: '🎯' },
    { id: 'google',   label: 'Google Ads', icon: '🔍' },
    { id: 'website',  label: 'Website',    icon: '🌐' },
    { id: 'email',    label: 'Email',      icon: '📧' },
    { id: 'gmb',      label: 'GMB',        icon: '📍' },
    { id: 'leads',    label: 'LSA Leads',  icon: '🎯' },
    { id: 'calls',    label: 'Calls',      icon: '📞' },
    { id: 'acquisition', label: 'Acquisition Cost', icon: '💰' },
    ...(isAdmin ? [{ id: 'approve' as TabId,  label: 'Approve',    icon: '✅' }] : []),
  ]

  if (!mounted) return null

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
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>
                  {monthLabel(month)} Report
                </h1>
                <select
                  value={month}
                  onChange={e => {
                    const url = new URL(window.location.href);
                    url.searchParams.set('month', e.target.value);
                    window.location.href = url.toString();
                  }}
                  style={{
                    fontSize: 12, padding: '4px 10px', border: '1px solid var(--border)',
                    borderRadius: 7, background: 'var(--bg-elevated)', color: 'var(--brand-navy)',
                    fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  {monthOptions.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
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
            {(() => {
              const metaSpend      = metrics.metaSpend      ?? liveAds?.metaSpend      ?? null
              const metaClicks     = metrics.metaClicks     ?? liveAds?.metaClicks     ?? null
              const metaCtr        = metrics.metaCtr        ?? liveAds?.metaCtr        ?? null
              const metaCpc        = metrics.metaCpc        ?? liveAds?.metaCpc        ?? null
              const gadsSpend      = liveAds?.gadsSpend     ?? null
              const gadsBilled     = liveAds?.gadsBilled    ?? null
              const gadsClicks     = liveAds?.gadsClicks    ?? null
              const gadsCtr        = liveAds?.gadsCtr       ?? null
              const hasAnyData     = hasSocial || metaSpend != null || gadsSpend != null
              if (!hasAnyData) return <NoData message="No data uploaded yet." action="Upload files at /reports/upload" />
              return (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <KpiCard label="Impressions"   value={fmt(metrics.impressions)}  sub="organic social"              color={clientColor} />
                  <KpiCard label="Engagements"   value={fmt(metrics.engagements)}  sub={`${pct(metrics.engRate)} rate`} color={clientColor} />
                  <KpiCard label="New Followers" value={fmt(metrics.gained)}       sub="this month"                  color={clientColor} />
                  <KpiCard label="Meta Spend"    value={money(metaSpend)}          sub={`${pct(metaCtr)} CTR · ${fmt(metaClicks)} clicks`} color={clientColor} />
                  {gadsSpend != null
                    ? <KpiCard label="G Ads Spend" value={money(gadsBilled ?? gadsSpend)} sub={`${pct(gadsCtr)} CTR · ${fmt(gadsClicks)} clicks`} color={clientColor} />
                    : <KpiCard label="Meta CPC"    value={money(metaCpc)}           sub={`${fmt(metaClicks)} clicks`} color={clientColor} />
                  }
                </div>
              )
            })()}

            {/* 3 Wins This Month */}
            <div className="rounded-xl border-2 p-5"
              style={{ background: 'var(--bg-elevated)', borderColor: clientColor + '40' }}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🏆</span>
                  <span className="text-sm font-bold" style={{ color: 'var(--text)' }}>3 wins this month</span>
                  <span className="text-xs px-2 py-0.5 rounded" style={{ background: clientColor + '15', color: clientColor }}>
                    Client-facing
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={saveHighlights} disabled={savingHighlights}
                    className="text-xs px-3 py-1 rounded font-semibold disabled:opacity-40"
                    style={{ background: 'var(--bg)', border: '0.5px solid var(--border)', color: 'var(--text)' }}>
                    {savingHighlights ? 'Saving…' : 'Save'}
                  </button>
                  <button onClick={generateHighlights} disabled={generatingHighlights || !hasAnyData}
                    className="text-xs px-3 py-1 rounded font-semibold disabled:opacity-40"
                    style={{ background: clientColor, color: 'white' }}>
                    {generatingHighlights ? 'Generating…' : highlights.some(h => h) ? '↺ Regenerate' : '✦ Auto-generate'}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                {[0, 1, 2].map(i => (
                  <div key={i} className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5"
                      style={{ background: clientColor + '20', color: clientColor }}>{i + 1}</div>
                    <input
                      type="text"
                      value={highlights[i] || ''}
                      onChange={e => {
                        const next = [...highlights]
                        next[i] = e.target.value
                        setHighlights(next)
                      }}
                      onBlur={saveHighlights}
                      placeholder={`Win #${i + 1} — e.g. "Impressions grew 24% to 45,000 this month"`}
                      className="flex-1 rounded-lg border px-3 py-2 text-sm focus:outline-none"
                      style={{ background: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text)' }}
                    />
                  </div>
                ))}
              </div>
              <p className="text-xs mt-3" style={{ color: 'var(--text-muted)' }}>
                These 3 wins appear at the top of the client portal report. Edit freely — auto-save on blur.
              </p>
            </div>

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
                  <button onClick={generateNarrative} disabled={generating || !hasAnyData}
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
                  {hasAnyData ? 'Click "Generate" to create the AI narrative for this report.' : 'Upload files first, then generate the narrative.'}
                </div>
              )}
            </div>

            {/* Action Plan */}
            <ActionPlanPanel
              clientId={clientId}
              clientName={clientName}
              month={month}
              hasData={hasAnyData}
              summary={buildSummary()}
            />

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
                <TopPostsSection clientId={clientId} month={month} />

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
        {tab === 'meta' && <MetaTab clientId={clientId} month={month} clientColor={clientColor} />}

        {/* ── GOOGLE ADS ──────────────────────────────────────────────────── */}
        {tab === 'google' && (
          <GAdsTab clientId={clientId} month={month} clientColor={clientColor} />
        )}

        {/* ── WEBSITE ─────────────────────────────────────────────────────── */}
        {tab === 'website' && (
          <WebsiteTab clientId={clientId} month={month} />
        )}

        {/* ── EMAIL ───────────────────────────────────────────────────────── */}
        {tab === 'live' && (
          <LiveDataTab clientId={clientId} month={month} />
        )}

        {tab === 'email' && (
          <EmailTab clientId={clientId} month={month} />
        )}

        {/* ── GMB ─────────────────────────────────────────────────────────── */}
        {tab === 'gmb' && (
          <GmbTab clientId={clientId} month={month} />
        )}

        {/* ── LEADS (Jotform) ─────────────────────────────────────────────── */}

        {tab === 'leads' && (
          <JotformLeadsTab clientId={clientId} month={month} />
        )}

        {tab === 'calls' && (
          <CallsTab clientId={clientId} month={month} />
        )}

        {tab === 'acquisition' && (
          <AcquisitionTab clientId={clientId} month={month} />
        )}

        {tab === 'approve' && isAdmin && (
          <div className="space-y-6">

            {/* 3 Wins */}
            <div className="rounded-xl border-2 p-5"
              style={{ background: 'var(--bg-elevated)', borderColor: clientColor + '40' }}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🏆</span>
                  <span className="text-sm font-bold" style={{ color: 'var(--text)' }}>3 wins this month</span>
                  <span className="text-xs px-2 py-0.5 rounded" style={{ background: clientColor + '15', color: clientColor }}>Client-facing</span>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={saveHighlights} disabled={savingHighlights}
                    className="text-xs px-3 py-1 rounded font-semibold disabled:opacity-40"
                    style={{ background: 'var(--bg)', border: '0.5px solid var(--border)', color: 'var(--text)' }}>
                    {savingHighlights ? 'Saving…' : 'Save'}
                  </button>
                  <button onClick={generateHighlights} disabled={generatingHighlights || !hasAnyData}
                    className="text-xs px-3 py-1 rounded font-semibold disabled:opacity-40"
                    style={{ background: clientColor, color: 'white' }}>
                    {generatingHighlights ? 'Generating…' : highlights.some(h => h) ? '↺ Regenerate' : '✦ Auto-generate'}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                {[0, 1, 2].map(i => (
                  <div key={i} className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5"
                      style={{ background: clientColor + '20', color: clientColor }}>{i + 1}</div>
                    <input type="text" value={highlights[i] || ''}
                      onChange={e => { const next = [...highlights]; next[i] = e.target.value; setHighlights(next) }}
                      onBlur={saveHighlights}
                      placeholder={`Win #${i + 1} — e.g. "Impressions grew 24% to 45,000"`}
                      className="flex-1 rounded-lg border px-3 py-2 text-sm focus:outline-none"
                      style={{ background: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text)' }} />
                  </div>
                ))}
              </div>
            </div>

            {/* Narrative */}
            <div className="rounded-xl border p-5"
              style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-base">✦</span>
                  <span className="text-sm font-bold" style={{ color: 'var(--text)' }}>Monthly Narrative</span>
                  <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'rgba(99,102,241,0.1)', color: '#6366f1' }}>AI Generated</span>
                </div>
                <div className="flex items-center gap-2">
                  {narrative && !narrativeEditing && (
                    <button onClick={() => setNarrativeEditing(true)}
                      className="text-xs px-2 py-1 rounded" style={{ color: 'var(--text-muted)' }}>Edit</button>
                  )}
                  {narrativeEditing && (
                    <button onClick={saveNarrative} disabled={savingNarrative}
                      className="text-xs px-3 py-1 rounded font-semibold"
                      style={{ background: clientColor, color: 'white' }}>
                      {savingNarrative ? 'Saving…' : 'Save'}
                    </button>
                  )}
                  <button onClick={generateNarrative} disabled={generating || !hasAnyData}
                    className="text-xs px-3 py-1 rounded font-semibold disabled:opacity-40"
                    style={{ background: '#6366f1', color: 'white' }}>
                    {generating ? 'Generating…' : narrative ? '↺ Regenerate' : '✦ Generate'}
                  </button>
                </div>
              </div>
              {narrativeEditing ? (
                <textarea value={narrative} onChange={e => setNarrative(e.target.value)} rows={6}
                  className="w-full rounded-lg border px-3 py-2 text-sm resize-none focus:outline-none"
                  style={{ background: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text)', lineHeight: 1.7 }} />
              ) : narrative ? (
                <div className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--text-muted)' }}>{narrative}</div>
              ) : (
                <div className="text-sm italic text-center py-6" style={{ color: 'var(--text-muted)' }}>
                  {hasAnyData ? 'Click "Generate" to create the AI narrative for this report.' : 'Upload files first, then generate.'}
                </div>
              )}
            </div>

            {/* Channel Approvals */}
            <ApprovalTab clientId={clientId} month={month} defaultMarkup={defaultMarkup} />

          </div>
        )}


      </div>
    </div>
  )
}

// ── Shared components ────────────────────────────────────────────────────────


// ── Action Plan Panel ─────────────────────────────────────────────────────────

type ActionItem = {
  id: string
  title: string
  description: string
  priority: 'high' | 'medium' | 'low'
  channel: string
  creating?: boolean
  created?: boolean
}

function ActionPlanPanel({ clientId, clientName, month, hasData, summary }: {
  clientId: string
  clientName: string
  month: string
  hasData: boolean
  summary: string
}) {
  const [items, setItems] = useState<ActionItem[]>([])
  const [generating, setGenerating] = useState(false)
  const [creatingId, setCreatingId] = useState<string | null>(null)

  async function generate() {
    if (!hasData) return
    setGenerating(true)
    try {
      const res = await fetch('/api/reports/narrative', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientName, month,
          summary,
          question: `You are a senior digital marketing strategist. Based on ALL the data below covering Google Ads, Meta Ads, Social Media, LSA, GMB, Email, Website, and Calls — generate 6-8 specific, actionable recommendations for next month. Each item must reference actual numbers from the data. Return ONLY a valid JSON array (no markdown, no explanation) with objects: { "title": "short task title", "description": "2-3 sentence explanation referencing specific metrics and what to do and why", "priority": "high|medium|low", "channel": "Google Ads|Meta Ads|Social|Email|Website|LSA|GMB|Calls|Strategy" }`,
        }),
      })
      const data = await res.json()
      const raw = data.narrative || ''
      const clean = raw.replace(/\`\`\`json|\`\`\`/g, '').trim()
      const parsed = JSON.parse(clean)
      setItems(parsed.map((item: any, i: number) => ({ ...item, id: `action-${i}-${Date.now()}` })))
    } catch (e) {
      console.error('Action plan failed', e)
    }
    setGenerating(false)
  }

  async function createWO(item: ActionItem) {
    setCreatingId(item.id)
    try {
      const res = await fetch('/api/work-orders/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `[${clientName}] ${item.title}`,
          client_id: clientId,
          notes: item.description,
          priority: item.priority,
          stage: 'not_started',
          source: 'action_plan',
          source_month: month,
        }),
      })
      if (res.ok) {
        setItems(prev => prev.map(p => p.id === item.id ? { ...p, created: true } : p))
      }
    } catch (e) {
      console.error('WO create failed', e)
    }
    setCreatingId(null)
  }

  const priorityColor: Record<string, string> = {
    high: '#dc2626', medium: '#d97706', low: '#6b7280',
  }
  const priorityBg: Record<string, string> = {
    high: '#fef2f2', medium: '#fffbeb', low: '#f9fafb',
  }

  return (
    <div className="rounded-xl border p-5"
      style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-base">📋</span>
          <span className="text-sm font-bold" style={{ color: 'var(--text)' }}>Action Plan</span>
          <span className="text-xs px-2 py-0.5 rounded"
            style={{ background: 'rgba(99,102,241,0.1)', color: '#6366f1' }}>
            Internal only
          </span>
        </div>
        <button onClick={generate} disabled={generating || !hasData}
          className="text-xs px-3 py-1.5 rounded font-semibold disabled:opacity-40"
          style={{ background: '#6366f1', color: 'white' }}>
          {generating ? 'Generating…' : items.length ? '↺ Regenerate' : '✦ Generate action plan'}
        </button>
      </div>

      {items.length === 0 && !generating && (
        <div className="text-sm italic text-center py-6" style={{ color: 'var(--text-muted)' }}>
          {hasData ? 'Generate an AI-powered action plan based on this month&apos;s data.' : 'Upload data first to generate an action plan.'}
        </div>
      )}

      {generating && (
        <div className="text-sm text-center py-6" style={{ color: 'var(--text-muted)' }}>
          Analyzing data and building action plan…
        </div>
      )}

      <div className="space-y-3">
        {items.map(item => (
          <div key={item.id} className="rounded-lg border p-4"
            style={{ background: priorityBg[item.priority] || '#f9fafb', borderColor: '#e5e7eb' }}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{item.title}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wide"
                    style={{ background: priorityBg[item.priority], color: priorityColor[item.priority], border: `1px solid ${priorityColor[item.priority]}30` }}>
                    {item.priority}
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                    style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                    {item.channel}
                  </span>
                </div>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>{item.description}</p>
              </div>
              <button
                onClick={() => createWO(item)}
                disabled={!!item.created || creatingId === item.id}
                className="text-xs px-3 py-1.5 rounded-lg font-semibold flex-shrink-0 disabled:opacity-50"
                style={{
                  background: item.created ? '#f0fdf4' : 'var(--brand-navy, #0f1e3f)',
                  color: item.created ? '#16a34a' : 'white',
                  border: item.created ? '1px solid #86efac' : 'none',
                }}>
                {item.created ? '✓ Created' : creatingId === item.id ? '…' : '+ Create WO'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {items.length > 0 && (
        <p className="text-xs mt-3" style={{ color: 'var(--text-muted)' }}>
          Action items are internal only — not visible to the client. Click "+ Create WO" to add to the work order board.
        </p>
      )}
    </div>
  )
}

function delta(current: number | null | undefined, compare: number | null | undefined) {
  if (current == null || compare == null || compare === 0) return null
  return ((current - compare) / Math.abs(compare)) * 100
}

function DeltaBadge({ current, compare, label }: { current: number | null | undefined; compare: number | null | undefined; label: string }) {
  const d = delta(current, compare)
  if (d == null) return null
  const up = d >= 0
  const color = up ? '#10b981' : '#ef4444'
  const arrow = up ? '↑' : '↓'
  return (
    <span className="text-xs mr-2" style={{ color }}>
      {arrow} {Math.abs(d).toFixed(1)}% <span style={{ color: 'var(--text-muted)' }}>{label}</span>
    </span>
  )
}

function KpiCard({ label, value, sub, color, rawValue, prevValue, lastYearValue }: {
  label: string; value: string; sub?: string; color: string;
  rawValue?: number | null; prevValue?: number | null; lastYearValue?: number | null
}) {
  return (
    <div className="rounded-xl border p-4"
      style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)', borderTopWidth: 3, borderTopColor: color }}>
      <div className="text-xs uppercase tracking-wide mb-2" style={{ color: 'var(--text-muted)' }}>{label}</div>
      <div className="text-2xl font-bold" style={{ color: 'var(--text)' }}>{value}</div>
      {sub && <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{sub}</div>}
      {(prevValue != null || lastYearValue != null) && (
        <div className="mt-2 flex flex-wrap gap-y-0.5">
          <DeltaBadge current={rawValue} compare={prevValue} label="vs prev" />
          <DeltaBadge current={rawValue} compare={lastYearValue} label="vs last yr" />
        </div>
      )}
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
