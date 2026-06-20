'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type ClientStat = {
  client_name: string
  networks: string[]
  total_followers: number
  net_follower_change: number
  total_posts: number
  total_engagements: number
  avg_eng_per_post: number
  zero_eng_posts: number
  zero_eng_pct: number
  status: 'Strong' | 'Steady' | 'Needs attention'
  spark: number[]
}

type AggregateStat = {
  total_posts: number
  total_engagements: number
  zero_eng_posts: number
  zero_eng_pct: number
  net_follower_growth: number
  top_driver: string
}

type NetworkStat = {
  network: string
  posts: number
  impressions: number
  engagements: number
  eng_rate: number
}

type SyncLog = {
  synced_at: string
  status: string
  posts_upserted: number
}

const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function statusBadge(status: string) {
  if (status === 'Strong') return 'bg-emerald-50 text-emerald-800'
  if (status === 'Steady') return 'bg-amber-50 text-amber-800'
  return 'bg-red-50 text-red-800'
}

function sparkColor(status: string) {
  if (status === 'Strong') return '#059669'
  if (status === 'Steady') return '#D97706'
  return '#DC2626'
}

function MiniSparkbar({ values, color }: { values: number[], color: string }) {
  const max = Math.max(...values, 1)
  return (
    <div style={{ display: 'inline-flex', alignItems: 'flex-end', gap: 2, height: 22 }}>
      {values.map((v, i) => (
        <span key={i} style={{
          display: 'block',
          width: 3,
          height: Math.max(2, Math.round((v / max) * 20)),
          background: color,
          borderRadius: 1,
          opacity: 0.75,
        }} />
      ))}
    </div>
  )
}

export default function SocialHubPage() {
  const now = new Date()
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth())
  const [selectedYear] = useState(now.getFullYear())
  const [clients, setClients] = useState<ClientStat[]>([])
  const [agg, setAgg] = useState<AggregateStat | null>(null)
  const [networks, setNetworks] = useState<NetworkStat[]>([])
  const [syncLog, setSyncLog] = useState<SyncLog | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    loadData()
  }, [selectedMonth, selectedYear])

  async function loadData() {
    setLoading(true)
    const monthStart = new Date(selectedYear, selectedMonth, 1).toISOString().split('T')[0]
    const monthEnd = new Date(selectedYear, selectedMonth + 1, 0).toISOString().split('T')[0]

    // Profiles: get latest follower counts + monthly engagements
    const { data: profileRows } = await supabase
      .from('sprout_profiles')
      .select('*')
      .gte('reported_date', monthStart)
      .lte('reported_date', monthEnd)

    // Posts for the month
    const { data: postRows } = await supabase
      .from('sprout_posts')
      .select('client_name, network, engagements, impressions, published_at')
      .gte('published_at', monthStart + 'T00:00:00')
      .lte('published_at', monthEnd + 'T23:59:59')

    // Follower snapshots (from Excel uploads)
    const monthEndDate = new Date(selectedYear, selectedMonth + 1, 0).toISOString().split('T')[0]
    const { data: followerSnaps } = await supabase
      .from('client_follower_snapshots')
      .select('client_name, total_followers, net_follower_change, snapshot_month')
      .lte('snapshot_month', monthEndDate)
      .order('snapshot_month', { ascending: false })

    // Build follower map: client_name -> most recent snapshot on or before month end
    const followerMap: Record<string, { followers: number; growth: number }> = {}
    for (const snap of followerSnaps ?? []) {
      if (!followerMap[snap.client_name]) {
        followerMap[snap.client_name] = { followers: snap.total_followers, growth: snap.net_follower_change }
      }
    }

    // Sync log
    const { data: logs } = await supabase
      .from('sprout_sync_log')
      .select('synced_at, status, posts_upserted')
      .order('synced_at', { ascending: false })
      .limit(1)

    if (logs?.[0]) setSyncLog(logs[0])

    // Aggregate by client
    const clientMap: Record<string, ClientStat> = {}

    for (const row of profileRows ?? []) {
      if (!row.client_name) continue
      if (!clientMap[row.client_name]) {
        clientMap[row.client_name] = {
          client_name: row.client_name,
          networks: [],
          total_followers: 0,
          net_follower_change: 0,
          total_posts: 0,
          total_engagements: 0,
          avg_eng_per_post: 0,
          zero_eng_posts: 0,
          zero_eng_pct: 0,
          status: 'Steady',
          spark: Array(14).fill(0),
        }
      }
      const c = clientMap[row.client_name]
      // Prefer snapshot data for followers; API data as fallback
      const snap = followerMap[row.client_name]
      if (snap) {
        c.total_followers = snap.followers
        c.net_follower_change = snap.growth
      } else {
        c.total_followers = Math.max(c.total_followers, row.followers ?? 0)
        c.net_follower_change += row.net_follower_change ?? 0
      }
      c.total_posts += row.posts_sent ?? 0
      if (row.network && !c.networks.includes(row.network)) c.networks.push(row.network)
    }

    // Post-level engagements
    const postsByClient: Record<string, number[]> = {}
    for (const p of postRows ?? []) {
      if (!p.client_name) continue
      if (!postsByClient[p.client_name]) postsByClient[p.client_name] = []
      postsByClient[p.client_name].push(p.engagements ?? 0)
    }

    for (const [clientName, engList] of Object.entries(postsByClient)) {
      if (!clientMap[clientName]) continue
      const c = clientMap[clientName]
      c.total_posts = engList.length
      c.total_engagements = engList.reduce((a, b) => a + b, 0)
      c.zero_eng_posts = engList.filter(e => e === 0).length
      c.zero_eng_pct = c.total_posts > 0 ? Math.round((c.zero_eng_posts / c.total_posts) * 100) : 0
      c.avg_eng_per_post = c.total_posts > 0 ? parseFloat((c.total_engagements / c.total_posts).toFixed(1)) : 0
      // Spark: distribute engagements across 14 buckets
      const bucketSize = Math.ceil(engList.length / 14)
      c.spark = Array(14).fill(0).map((_, i) => {
        const slice = engList.slice(i * bucketSize, (i + 1) * bucketSize)
        return slice.reduce((a, b) => a + b, 0)
      })
      c.status = c.avg_eng_per_post >= 8 ? 'Strong' : c.avg_eng_per_post >= 2 ? 'Steady' : 'Needs attention'
    }

    const sorted = Object.values(clientMap).sort((a, b) => b.avg_eng_per_post - a.avg_eng_per_post)
    setClients(sorted)

    // Aggregate stats
    const allPosts = postRows ?? []
    const totalPosts = allPosts.length
    const totalEng = allPosts.reduce((a, p) => a + (p.engagements ?? 0), 0)
    const zeroPosts = allPosts.filter(p => (p.engagements ?? 0) === 0).length
    const totalFollowerGrowth = Object.values(clientMap).reduce((a, c) => a + c.net_follower_change, 0)
    const topDriver = sorted[0]?.client_name ?? '—'

    setAgg({
      total_posts: totalPosts,
      total_engagements: totalEng,
      zero_eng_posts: zeroPosts,
      zero_eng_pct: totalPosts > 0 ? Math.round((zeroPosts / totalPosts) * 100) : 0,
      net_follower_growth: totalFollowerGrowth,
      top_driver: topDriver,
    })

    // Network breakdown
    const netMap: Record<string, { posts: number; impressions: number; engagements: number }> = {}
    for (const p of allPosts) {
      const net = p.network ?? 'unknown'
      if (!netMap[net]) netMap[net] = { posts: 0, impressions: 0, engagements: 0 }
      netMap[net].posts++
      netMap[net].impressions += p.impressions ?? 0
      netMap[net].engagements += p.engagements ?? 0
    }
    const netStats: NetworkStat[] = Object.entries(netMap).map(([network, d]) => ({
      network,
      ...d,
      eng_rate: d.impressions > 0 ? parseFloat(((d.engagements / d.impressions) * 100).toFixed(2)) : 0,
    })).sort((a, b) => b.eng_rate - a.eng_rate)
    setNetworks(netStats)

    setLoading(false)
  }

  async function triggerSync() {
    setSyncing(true)
    try {
      const res = await fetch('/api/sprout/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: 60 }),
      })
      const data = await res.json()
      if (data.success) await loadData()
      else alert('Sync error: ' + data.error)
    } catch (e: any) {
      alert('Sync failed: ' + e.message)
    }
    setSyncing(false)
  }

  const currentMonth = now.getMonth()
  const months3 = [-2, -1, 0].map(offset => {
    const m = (currentMonth + offset + 12) % 12
    return { label: MONTH_LABELS[m], value: m }
  })

  return (
    <div className="min-h-screen" style={{ background: '#FAFAF9', color: '#1C1917', fontFamily: "'Inter', system-ui, sans-serif" }}>

      {/* Header */}
      <header style={{ borderBottom: '1px solid #E7E5E4' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: '#EA580C', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: 14 }}>a</div>
            <div>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, color: '#78716C' }}>A&B Consulting · Tracker</div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>Social <span style={{ color: '#78716C', fontWeight: 400 }}>/ Strategy</span></div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {syncLog && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#78716C', fontSize: 12 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: syncLog.status === 'success' ? '#10b981' : '#ef4444' }} />
                Synced {new Date(syncLog.synced_at).toLocaleDateString()}
              </div>
            )}
            <button
              onClick={triggerSync}
              disabled={syncing}
              style={{ fontSize: 12, fontWeight: 500, padding: '6px 12px', borderRadius: 6, border: '1px solid #E7E5E4', background: 'white', cursor: syncing ? 'wait' : 'pointer' }}
            >
              {syncing ? 'Syncing…' : '↻ Sync now'}
            </button>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 24px' }}>

        {/* Title + month selector */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, marginBottom: 32 }}>
          <div>
            <p style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, color: '#78716C', marginBottom: 8 }}>
              Reporting period · {MONTH_LABELS[selectedMonth]} {selectedYear}
            </p>
            <h2 style={{ fontSize: 32, fontWeight: 600, letterSpacing: '-0.02em', margin: 0 }}>Where the book stands.</h2>
            <p style={{ color: '#78716C', fontSize: 14, marginTop: 8 }}>
              {clients.length} clients · {loading ? '…' : agg?.total_posts ?? 0} posts published this month
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: 4, borderRadius: 8, background: '#F5F5F4' }}>
            {months3.map(m => (
              <button
                key={m.value}
                onClick={() => setSelectedMonth(m.value)}
                style={{
                  padding: '6px 12px', fontSize: 13, fontWeight: 500, borderRadius: 6, border: 'none', cursor: 'pointer',
                  background: m.value === selectedMonth ? '#1C1917' : 'transparent',
                  color: m.value === selectedMonth ? '#FAFAF9' : '#1C1917',
                }}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* KPI row */}
        {agg && (
          <section style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, background: '#D6D3D1', border: '1px solid #E7E5E4', borderRadius: 8, overflow: 'hidden', marginBottom: 48 }}>
            {[
              { label: 'Posts published', value: agg.total_posts.toLocaleString(), sub: `across ${clients.length} clients` },
              { label: 'Engagements', value: agg.total_engagements.toLocaleString(), sub: null },
              { label: 'Zero-engagement', value: agg.zero_eng_posts.toLocaleString(), sub: `${agg.zero_eng_pct}% of all posts`, red: true },
              { label: 'Net follower growth', value: `+${agg.net_follower_growth.toLocaleString()}`, sub: `Led by ${agg.top_driver}`, green: true },
            ].map((k, i) => (
              <div key={i} style={{ background: 'white', padding: 20 }}>
                <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, color: '#78716C' }}>{k.label}</div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 32, fontWeight: 600, letterSpacing: '-0.02em', marginTop: 8, color: k.red ? '#b91c1c' : k.green ? '#047857' : '#1C1917' }}>
                  {loading ? '…' : k.value}
                </div>
                {k.sub && <div style={{ fontSize: 12, color: '#78716C', marginTop: 8 }}>{k.sub}</div>}
              </div>
            ))}
          </section>
        )}

        {/* Quick links */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 32 }}>
          <a href="/dashboard/social/rbs" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', background: 'white', border: '1px solid #E7E5E4', borderRadius: 8, textDecoration: 'none', color: '#1C1917', fontSize: 14, fontWeight: 500 }}>
            <span style={{ fontSize: 18 }}>🏗</span>
            <div><div style={{ fontWeight: 600 }}>RBS Branch Scorecard</div><div style={{ fontSize: 12, color: '#78716C' }}>47 branches · performance by RVP</div></div>
          </a>
        </div>

        {/* Client ranking table */}
        <section style={{ marginBottom: 48 }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 16 }}>
            <div>
              <p style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, color: '#78716C', marginBottom: 4 }}>Client ranking</p>
              <h3 style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.01em', margin: 0 }}>Who's earning their posts.</h3>
            </div>
            <span style={{ fontSize: 12, color: '#78716C' }}>Sort: <span style={{ color: '#1C1917', fontWeight: 500, textDecoration: 'underline', textDecorationColor: '#D6D3D1' }}>Avg eng / post ↓</span></span>
          </div>

          <div style={{ border: '1px solid #E7E5E4', borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse' }}>
                <thead style={{ background: '#FAFAF9', borderBottom: '1px solid #E7E5E4' }}>
                  <tr>
                    {['#', 'Client', 'Followers', 'Growth', 'Posts', 'Avg eng', 'Trend', 'Status'].map(h => (
                      <th key={h} style={{ padding: '12px 16px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, color: '#78716C', textAlign: h === 'Client' || h === '#' ? 'left' : h === 'Trend' || h === 'Status' ? 'left' : 'right' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={8} style={{ padding: 32, textAlign: 'center', color: '#78716C' }}>Loading…</td></tr>
                  ) : clients.length === 0 ? (
                    <tr><td colSpan={8} style={{ padding: 32, textAlign: 'center', color: '#78716C' }}>
                      No data for this month.{' '}
                      <button onClick={triggerSync} style={{ color: '#EA580C', textDecoration: 'underline', border: 'none', background: 'none', cursor: 'pointer' }}>
                        Sync from Sprout →
                      </button>
                    </td></tr>
                  ) : clients.map((c, i) => (
                    <tr key={c.client_name} style={{ borderTop: '1px solid #E7E5E4' }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#F5F5F4')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <td style={{ padding: '12px 16px', fontFamily: 'monospace', color: '#78716C' }}>
                        {String(i + 1).padStart(2, '0')}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <Link href={`/dashboard/social/${encodeURIComponent(c.client_name)}`} style={{ textDecoration: 'none' }}>
                          <div style={{ fontWeight: 500, color: '#1C1917' }}>{c.client_name}</div>
                          <div style={{ fontSize: 12, color: '#78716C' }}>{c.networks.join(' · ')}</div>
                        </Link>
                      </td>
                      <td style={{ padding: '12px 16px', fontFamily: 'monospace', textAlign: 'right' }}>{c.total_followers.toLocaleString()}</td>
                      <td style={{ padding: '12px 16px', fontFamily: 'monospace', textAlign: 'right', color: c.net_follower_change >= 0 ? '#047857' : '#b91c1c' }}>
                        {c.net_follower_change >= 0 ? '+' : ''}{c.net_follower_change.toLocaleString()}
                      </td>
                      <td style={{ padding: '12px 16px', fontFamily: 'monospace', textAlign: 'right' }}>{c.total_posts}</td>
                      <td style={{ padding: '12px 16px', fontFamily: 'monospace', textAlign: 'right', fontWeight: 600 }}>{c.avg_eng_per_post.toFixed(1)}</td>
                      <td style={{ padding: '12px 16px' }}>
                        <MiniSparkbar values={c.spark} color={sparkColor(c.status)} />
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 9999, fontSize: 11, fontWeight: 600 }}
                          className={statusBadge(c.status)}>
                          {c.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Network ROI */}
        {networks.length > 0 && (
          <section style={{ marginBottom: 48 }}>
            <div style={{ marginBottom: 16 }}>
              <p style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, color: '#78716C', marginBottom: 4 }}>Network ROI</p>
              <h3 style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.01em', margin: 0 }}>Where the minutes are paying off.</h3>
            </div>
            <div style={{ border: '1px solid #E7E5E4', borderRadius: 8, overflow: 'hidden', background: 'white' }}>
              <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse' }}>
                <thead style={{ background: '#FAFAF9', borderBottom: '1px solid #E7E5E4' }}>
                  <tr>
                    {['Network', 'Posts', 'Impressions', 'Eng rate'].map(h => (
                      <th key={h} style={{ padding: '12px 16px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, color: '#78716C', textAlign: h === 'Network' ? 'left' : 'right' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {networks.map((n, i) => (
                    <tr key={n.network} style={{ borderTop: i > 0 ? '1px solid #E7E5E4' : undefined }}>
                      <td style={{ padding: '12px 16px', fontWeight: 500, textTransform: 'capitalize' }}>{n.network.toLowerCase()}</td>
                      <td style={{ padding: '12px 16px', fontFamily: 'monospace', textAlign: 'right' }}>{n.posts}</td>
                      <td style={{ padding: '12px 16px', fontFamily: 'monospace', textAlign: 'right' }}>{n.impressions.toLocaleString()}</td>
                      <td style={{ padding: '12px 16px', fontFamily: 'monospace', textAlign: 'right', fontWeight: 600, color: n.eng_rate >= 5 ? '#047857' : n.eng_rate >= 2 ? '#B45309' : '#b91c1c' }}>
                        {n.eng_rate > 0 ? `${n.eng_rate}%` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Footer */}
        <footer style={{ borderTop: '1px solid #E7E5E4', paddingTop: 24, fontSize: 12, color: '#78716C', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div>Source: Sprout Social API · {syncLog ? `synced ${new Date(syncLog.synced_at).toLocaleString()}` : 'not yet synced'}</div>
          <div>Tracker · A&B Consulting Group</div>
        </footer>

      </main>
    </div>
  )
}
