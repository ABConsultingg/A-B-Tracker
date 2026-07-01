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
  total_impressions: number
  video_views: number
  avg_eng_per_post: number
  zero_eng_posts: number
  zero_eng_pct: number
  eng_rate: number
  status: 'Strong' | 'Steady' | 'Needs attention'
  spark: number[]
}

type AggregateStat = {
  total_posts: number
  total_engagements: number
  total_impressions: number
  video_views: number
  avg_eng_per_post: number
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
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  const [selectedMonth, setSelectedMonth] = useState(nextMonth.getMonth())
  const [selectedYear, setSelectedYear] = useState(nextMonth.getFullYear())
  const [clients, setClients] = useState<ClientStat[]>([])
  const [agg, setAgg] = useState<AggregateStat | null>(null)
  const [networks, setNetworks] = useState<NetworkStat[]>([])
  const [syncLog, setSyncLog] = useState<SyncLog | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [activeView, setActiveView] = useState<'overview' | 'performance'>('overview')
  const [priorClients, setPriorClients] = useState<ClientStat[]>([])
  const [priorAgg, setPriorAgg] = useState<AggregateStat | null>(null)
  const [ytdAgg, setYtdAgg] = useState<{ engagements: number; impressions: number; video_views: number; posts: number } | null>(null)

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
          total_impressions: 0,
          video_views: 0,
          avg_eng_per_post: 0,
          zero_eng_posts: 0,
          zero_eng_pct: 0,
          eng_rate: 0,
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
      c.total_impressions += row.impressions ?? 0
      c.video_views += row.video_views ?? 0
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
      c.eng_rate = c.total_impressions > 0 ? parseFloat(((c.total_engagements / c.total_impressions) * 100).toFixed(2)) : 0
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

    const totalImpressions = (profileRows ?? []).reduce((a, r) => a + (r.impressions ?? 0), 0)
    const totalVideoViews = (profileRows ?? []).reduce((a, r) => a + (r.video_views ?? 0), 0)
    setAgg({
      total_posts: totalPosts,
      total_engagements: totalEng,
      total_impressions: totalImpressions,
      video_views: totalVideoViews,
      avg_eng_per_post: totalPosts > 0 ? parseFloat((totalEng / totalPosts).toFixed(1)) : 0,
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

    // Prior month data
    const priorDate = new Date(selectedYear, selectedMonth - 1, 1)
    const priorStart = new Date(priorDate.getFullYear(), priorDate.getMonth(), 1).toISOString().split('T')[0]
    const priorEnd = new Date(priorDate.getFullYear(), priorDate.getMonth() + 1, 0).toISOString().split('T')[0]
    const { data: priorProfileRows } = await supabase.from('sprout_profiles').select('*').gte('reported_date', priorStart).lte('reported_date', priorEnd)
    const { data: priorPostRows } = await supabase.from('sprout_posts').select('client_name, engagements, impressions, published_at').gte('published_at', priorStart + 'T00:00:00').lte('published_at', priorEnd + 'T23:59:59')

    const priorClientMap: Record<string, ClientStat> = {}
    for (const row of priorProfileRows ?? []) {
      if (!row.client_name) continue
      if (!priorClientMap[row.client_name]) priorClientMap[row.client_name] = { client_name: row.client_name, networks: [], total_followers: 0, net_follower_change: 0, total_posts: 0, total_engagements: 0, total_impressions: 0, video_views: 0, avg_eng_per_post: 0, zero_eng_posts: 0, zero_eng_pct: 0, eng_rate: 0, status: 'Steady', spark: [] }
      const pc = priorClientMap[row.client_name]
      pc.total_impressions += row.impressions ?? 0
      pc.video_views += row.video_views ?? 0
    }
    const priorPostsByClient: Record<string, number[]> = {}
    for (const p of priorPostRows ?? []) {
      if (!p.client_name) continue
      if (!priorPostsByClient[p.client_name]) priorPostsByClient[p.client_name] = []
      priorPostsByClient[p.client_name].push(p.engagements ?? 0)
    }
    for (const [cn, el] of Object.entries(priorPostsByClient)) {
      if (!priorClientMap[cn]) continue
      const pc = priorClientMap[cn]
      pc.total_posts = el.length
      pc.total_engagements = el.reduce((a, b) => a + b, 0)
      pc.zero_eng_posts = el.filter(e => e === 0).length
      pc.zero_eng_pct = pc.total_posts > 0 ? Math.round((pc.zero_eng_posts / pc.total_posts) * 100) : 0
      pc.avg_eng_per_post = pc.total_posts > 0 ? parseFloat((pc.total_engagements / pc.total_posts).toFixed(1)) : 0
      pc.eng_rate = pc.total_impressions > 0 ? parseFloat(((pc.total_engagements / pc.total_impressions) * 100).toFixed(2)) : 0
      pc.status = pc.avg_eng_per_post >= 8 ? 'Strong' : pc.avg_eng_per_post >= 2 ? 'Steady' : 'Needs attention'
    }
    setPriorClients(Object.values(priorClientMap))
    const priorTotalPosts = (priorPostRows ?? []).length
    const priorTotalEng = (priorPostRows ?? []).reduce((a, p) => a + (p.engagements ?? 0), 0)
    const priorZeroPosts = (priorPostRows ?? []).filter(p => (p.engagements ?? 0) === 0).length
    const priorTotalImpressions = (priorProfileRows ?? []).reduce((a, r) => a + (r.impressions ?? 0), 0)
    const priorTotalVideoViews = (priorProfileRows ?? []).reduce((a, r) => a + (r.video_views ?? 0), 0)
    setPriorAgg({
      total_posts: priorTotalPosts, total_engagements: priorTotalEng, total_impressions: priorTotalImpressions,
      video_views: priorTotalVideoViews, avg_eng_per_post: priorTotalPosts > 0 ? parseFloat((priorTotalEng / priorTotalPosts).toFixed(1)) : 0,
      zero_eng_posts: priorZeroPosts, zero_eng_pct: priorTotalPosts > 0 ? Math.round((priorZeroPosts / priorTotalPosts) * 100) : 0,
      net_follower_growth: 0, top_driver: '',
    })

    // YTD (Jan 1 → end of selected month)
    const ytdStart = `${selectedYear}-01-01`
    const ytdEnd = monthEnd
    const { data: ytdPostRows } = await supabase.from('sprout_posts').select('engagements, impressions, published_at').gte('published_at', ytdStart + 'T00:00:00').lte('published_at', ytdEnd + 'T23:59:59')
    const { data: ytdProfileRows } = await supabase.from('sprout_profiles').select('impressions, video_views').gte('reported_date', ytdStart).lte('reported_date', ytdEnd)
    setYtdAgg({
      engagements: (ytdPostRows ?? []).reduce((a, p) => a + (p.engagements ?? 0), 0),
      impressions: (ytdProfileRows ?? []).reduce((a, r) => a + (r.impressions ?? 0), 0),
      video_views: (ytdProfileRows ?? []).reduce((a, r) => a + (r.video_views ?? 0), 0),
      posts: (ytdPostRows ?? []).length,
    })

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
  const currentYear = now.getFullYear()
  const [windowOffset, setWindowOffset] = useState(0)
  const months3 = [-2, -1, 0].map(offset => {
    const totalOffset = offset + windowOffset
    const d = new Date(currentYear, currentMonth + totalOffset, 1)
    return { label: MONTH_LABELS[d.getMonth()], value: d.getMonth(), year: d.getFullYear() }
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={() => setWindowOffset(o => o - 1)}
              style={{ padding: '6px 10px', fontSize: 14, borderRadius: 6, border: '1px solid #E7E5E4', background: 'white', cursor: 'pointer', color: '#1C1917' }}>‹</button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: 4, borderRadius: 8, background: '#F5F5F4' }}>
              {months3.map(m => (
                <button
                  key={m.value + '-' + m.year}
                  onClick={() => { setSelectedMonth(m.value); setSelectedYear(m.year) }}
                  style={{
                    padding: '6px 12px', fontSize: 13, fontWeight: 500, borderRadius: 6, border: 'none', cursor: 'pointer',
                    background: m.value === selectedMonth && m.year === selectedYear ? '#1C1917' : 'transparent',
                    color: m.value === selectedMonth && m.year === selectedYear ? '#FAFAF9' : '#1C1917',
                  }}
                >
                  {m.label} {m.year !== currentYear ? String(m.year).slice(2) : ''}
                </button>
              ))}
            </div>
            <button onClick={() => setWindowOffset(o => o + 1)}
              style={{ padding: '6px 10px', fontSize: 14, borderRadius: 6, border: '1px solid #E7E5E4', background: 'white', cursor: 'pointer', color: '#1C1917' }}>›</button>
          </div>
        </div>

        {/* View tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 28, padding: 4, background: '#F5F5F4', borderRadius: 8, width: 'fit-content' }}>
          {(['overview', 'performance'] as const).map(v => (
            <button key={v} onClick={() => setActiveView(v)} style={{
              padding: '6px 16px', fontSize: 13, fontWeight: 500, borderRadius: 6, border: 'none', cursor: 'pointer',
              background: activeView === v ? '#1C1917' : 'transparent',
              color: activeView === v ? '#FAFAF9' : '#78716C',
            }}>
              {v === 'overview' ? 'Overview' : '📈 Performance'}
            </button>
          ))}
        </div>

        {/* KPI row */}
        {agg && activeView === 'overview' && (
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
        {activeView === 'overview' && <div style={{ display: 'flex', gap: 12, marginBottom: 32 }}>
          <a href="/dashboard/social/rbs" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', background: 'white', border: '1px solid #E7E5E4', borderRadius: 8, textDecoration: 'none', color: '#1C1917', fontSize: 14, fontWeight: 500 }}>
            <span style={{ fontSize: 18 }}>🏗</span>
            <div><div style={{ fontWeight: 600 }}>RBS Branch Scorecard</div><div style={{ fontSize: 12, color: '#78716C' }}>47 branches · performance by RVP</div></div>
          </a>
          <a href="/dashboard/social/captions" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', background: 'white', border: '1px solid #E7E5E4', borderRadius: 8, textDecoration: 'none', color: '#1C1917', fontSize: 14, fontWeight: 500 }}>
            <span style={{ fontSize: 18 }}>✍️</span>
            <div><div style={{ fontWeight: 600 }}>Caption Library</div><div style={{ fontSize: 12, color: '#78716C' }}>Approved captions · Draft with Claude</div></div>
          </a>
          <a href="/dashboard/social/planning" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', background: 'white', border: '1px solid #E7E5E4', borderRadius: 8, textDecoration: 'none', color: '#1C1917', fontSize: 14, fontWeight: 500 }}>
            <span style={{ fontSize: 18 }}>📅</span>
            <div><div style={{ fontWeight: 600 }}>Planning Board</div><div style={{ fontSize: 12, color: '#78716C' }}>Monthly 12-post plan per client</div></div>
          </a>
          <a href="/dashboard/social/brands/Culture%20Construction" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', background: 'white', border: '1px solid #E7E5E4', borderRadius: 8, textDecoration: 'none', color: '#1C1917', fontSize: 14, fontWeight: 500 }}>
            <span style={{ fontSize: 18 }}>🎯</span>
            <div><div style={{ fontWeight: 600 }}>Brand Profiles</div><div style={{ fontSize: 12, color: '#78716C' }}>Voice Q&amp;A per client</div></div>
          </a>
          <a href="/dashboard/social/goals" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', background: 'white', border: '1px solid #E7E5E4', borderRadius: 8, textDecoration: 'none', color: '#1C1917', fontSize: 14, fontWeight: 500 }}>
            <span style={{ fontSize: 18 }}>🎯</span>
            <div><div style={{ fontWeight: 600 }}>Q3 Goals</div><div style={{ fontSize: 12, color: '#78716C' }}>6 targets · Emily's Q3 2026</div></div>
          </a>
        </div>}

        {/* Client ranking table */}
        {activeView === 'overview' && <section style={{ marginBottom: 48 }}>
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
        {activeView === 'overview' && networks.length > 0 && (
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

        {/* ── PERFORMANCE TAB ─────────────────────────────────────────── */}
        {activeView === 'performance' && (
          <div>
            {/* MoM KPI strip */}
            <section style={{ marginBottom: 40 }}>
              <p style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, color: '#78716C', marginBottom: 12 }}>
                {MONTH_LABELS[selectedMonth]} {selectedYear} vs {MONTH_LABELS[new Date(selectedYear, selectedMonth - 1, 1).getMonth()]} — Month over month
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 1, background: '#D6D3D1', border: '1px solid #E7E5E4', borderRadius: 8, overflow: 'hidden' }}>
                {[
                  { label: 'Engagements', cur: agg?.total_engagements ?? 0, prior: priorAgg?.total_engagements ?? 0, fmt: (v: number) => v.toLocaleString() },
                  { label: 'Impressions', cur: agg?.total_impressions ?? 0, prior: priorAgg?.total_impressions ?? 0, fmt: (v: number) => v.toLocaleString() },
                  { label: 'Video Views', cur: agg?.video_views ?? 0, prior: priorAgg?.video_views ?? 0, fmt: (v: number) => v.toLocaleString() },
                  { label: 'Avg Eng / Post', cur: agg?.avg_eng_per_post ?? 0, prior: priorAgg?.avg_eng_per_post ?? 0, fmt: (v: number) => v.toFixed(1) },
                  { label: 'Zero-Eng %', cur: agg?.zero_eng_pct ?? 0, prior: priorAgg?.zero_eng_pct ?? 0, fmt: (v: number) => v + '%', lowerIsBetter: true },
                ].map((k, i) => {
                  const delta = k.cur - k.prior
                  const pct = k.prior > 0 ? Math.round((delta / k.prior) * 100) : 0
                  const positive = k.lowerIsBetter ? delta < 0 : delta > 0
                  const negative = k.lowerIsBetter ? delta > 0 : delta < 0
                  return (
                    <div key={i} style={{ background: 'white', padding: 20 }}>
                      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, color: '#78716C' }}>{k.label}</div>
                      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 28, fontWeight: 600, letterSpacing: '-0.02em', marginTop: 8 }}>{loading ? '…' : k.fmt(k.cur)}</div>
                      <div style={{ marginTop: 6, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ color: positive ? '#047857' : negative ? '#b91c1c' : '#78716C', fontWeight: 600 }}>
                          {delta === 0 ? '—' : `${delta > 0 ? '+' : ''}${k.fmt(delta)} (${pct > 0 ? '+' : ''}${pct}%)`}
                        </span>
                        <span style={{ color: '#A8A29E' }}>vs prior mo</span>
                      </div>
                      <div style={{ marginTop: 4, fontSize: 11, color: '#A8A29E' }}>Prior: {k.fmt(k.prior)}</div>
                    </div>
                  )
                })}
              </div>
            </section>

            {/* YTD strip */}
            {ytdAgg && (
              <section style={{ marginBottom: 40 }}>
                <p style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, color: '#78716C', marginBottom: 12 }}>
                  YTD — Jan {selectedYear} through {MONTH_LABELS[selectedMonth]}
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, background: '#D6D3D1', border: '1px solid #E7E5E4', borderRadius: 8, overflow: 'hidden' }}>
                  {[
                    { label: 'Total Engagements', value: ytdAgg.engagements.toLocaleString() },
                    { label: 'Total Impressions', value: ytdAgg.impressions.toLocaleString() },
                    { label: 'Total Video Views', value: ytdAgg.video_views.toLocaleString() },
                    { label: 'Total Posts', value: ytdAgg.posts.toLocaleString() },
                  ].map((k, i) => (
                    <div key={i} style={{ background: 'white', padding: 20 }}>
                      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, color: '#78716C' }}>{k.label}</div>
                      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 28, fontWeight: 600, letterSpacing: '-0.02em', marginTop: 8 }}>{k.value}</div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Q3 Goals */}
            <section style={{ marginBottom: 40 }}>
              <p style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, color: '#78716C', marginBottom: 4 }}>Q3 2026 Goals — June through August</p>
              <h3 style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.01em', margin: '0 0 16px' }}>Emily's targets.</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[
                  {
                    label: 'Zero-engagement rate', target: 35, current: agg?.zero_eng_pct ?? 0, baseline: 52,
                    unit: '%', lowerIsBetter: true,
                    why: 'Target: <35% · April baseline: 52%',
                  },
                  {
                    label: 'Avg engagement per post', target: 16, current: agg?.avg_eng_per_post ?? 0, baseline: 10.4,
                    unit: '', lowerIsBetter: false,
                    why: 'Target: ≥16 · April baseline: 10.4',
                  },
                  {
                    label: 'Net follower growth (book-wide / mo)', target: 1800, current: agg?.net_follower_growth ?? 0, baseline: 1238,
                    unit: '', lowerIsBetter: false,
                    why: 'Target: +1,800/mo · April baseline: +1,238',
                  },
                  {
                    label: 'NICO Roofing engagement rate', target: 1.5,
                    current: (() => { const n = clients.find(c => c.client_name === 'NICO Roofing'); return n ? n.eng_rate : 0 })(),
                    baseline: 0.1, unit: '%', lowerIsBetter: false,
                    why: 'Target: ≥1.5% · April baseline: 0.1%',
                  },
                ].map((g, i) => {
                  const pct = g.lowerIsBetter
                    ? Math.min(100, Math.max(0, Math.round(((g.baseline - g.current) / (g.baseline - g.target)) * 100)))
                    : Math.min(100, Math.max(0, Math.round((g.current / g.target) * 100)))
                  const hit = g.lowerIsBetter ? g.current <= g.target : g.current >= g.target
                  const color = hit ? '#047857' : pct >= 60 ? '#D97706' : '#b91c1c'
                  return (
                    <div key={i} style={{ background: 'white', border: '1px solid #E7E5E4', borderRadius: 8, padding: '16px 20px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 14 }}>{g.label}</div>
                          <div style={{ fontSize: 12, color: '#78716C', marginTop: 2 }}>{g.why}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 22, fontWeight: 700, color }}>{g.current}{g.unit}</div>
                          <div style={{ fontSize: 11, color: hit ? '#047857' : '#78716C', fontWeight: 600 }}>{hit ? '✓ Hit' : `${pct}% to goal`}</div>
                        </div>
                      </div>
                      <div style={{ height: 6, background: '#F5F5F4', borderRadius: 9999, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 9999, transition: 'width 0.4s ease' }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>

            {/* Client MoM comparison table */}
            <section style={{ marginBottom: 48 }}>
              <p style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, color: '#78716C', marginBottom: 4 }}>Client breakdown</p>
              <h3 style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.01em', margin: '0 0 16px' }}>Month over month by client.</h3>
              <div style={{ border: '1px solid #E7E5E4', borderRadius: 8, overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                    <thead style={{ background: '#FAFAF9', borderBottom: '1px solid #E7E5E4' }}>
                      <tr>
                        {['Client', 'Cur Eng', 'Prior Eng', 'Δ Eng', 'Cur Avg/Post', 'Prior Avg/Post', 'Δ Avg', 'Zero-Eng %', 'YTD Eng'].map(h => (
                          <th key={h} style={{ padding: '10px 14px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, color: '#78716C', textAlign: h === 'Client' ? 'left' : 'right' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {loading ? (
                        <tr><td colSpan={9} style={{ padding: 24, textAlign: 'center', color: '#78716C' }}>Loading…</td></tr>
                      ) : clients.map((c, i) => {
                        const prior = priorClients.find(p => p.client_name === c.client_name)
                        const deltaEng = c.total_engagements - (prior?.total_engagements ?? 0)
                        const deltaAvg = parseFloat((c.avg_eng_per_post - (prior?.avg_eng_per_post ?? 0)).toFixed(1))
                        const posEng = deltaEng > 0, negEng = deltaEng < 0
                        const posAvg = deltaAvg > 0, negAvg = deltaAvg < 0
                        return (
                          <tr key={c.client_name} style={{ borderTop: '1px solid #E7E5E4' }}
                            onMouseEnter={e => (e.currentTarget.style.background = '#F5F5F4')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                          >
                            <td style={{ padding: '10px 14px', fontWeight: 500 }}>{c.client_name}</td>
                            <td style={{ padding: '10px 14px', fontFamily: 'monospace', textAlign: 'right' }}>{c.total_engagements.toLocaleString()}</td>
                            <td style={{ padding: '10px 14px', fontFamily: 'monospace', textAlign: 'right', color: '#78716C' }}>{prior?.total_engagements.toLocaleString() ?? '—'}</td>
                            <td style={{ padding: '10px 14px', fontFamily: 'monospace', textAlign: 'right', fontWeight: 600, color: posEng ? '#047857' : negEng ? '#b91c1c' : '#78716C' }}>
                              {deltaEng === 0 ? '—' : `${deltaEng > 0 ? '+' : ''}${deltaEng.toLocaleString()}`}
                            </td>
                            <td style={{ padding: '10px 14px', fontFamily: 'monospace', textAlign: 'right' }}>{c.avg_eng_per_post.toFixed(1)}</td>
                            <td style={{ padding: '10px 14px', fontFamily: 'monospace', textAlign: 'right', color: '#78716C' }}>{prior?.avg_eng_per_post.toFixed(1) ?? '—'}</td>
                            <td style={{ padding: '10px 14px', fontFamily: 'monospace', textAlign: 'right', fontWeight: 600, color: posAvg ? '#047857' : negAvg ? '#b91c1c' : '#78716C' }}>
                              {deltaAvg === 0 ? '—' : `${deltaAvg > 0 ? '+' : ''}${deltaAvg}`}
                            </td>
                            <td style={{ padding: '10px 14px', fontFamily: 'monospace', textAlign: 'right', color: c.zero_eng_pct > 50 ? '#b91c1c' : c.zero_eng_pct > 30 ? '#D97706' : '#047857' }}>
                              {c.zero_eng_pct}%
                            </td>
                            <td style={{ padding: '10px 14px', fontFamily: 'monospace', textAlign: 'right', color: '#78716C' }}>—</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          </div>
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
