'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'
import { useParams } from 'next/navigation'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

type Post = {
  post_id: string
  network: string
  post_type: string
  published_at: string
  text_content: string
  permalink: string
  impressions: number
  engagements: number
  reactions: number
  video_views: number
}

type MonthStat = {
  month: string
  posts: number
  engagements: number
  avg_eng: number
  zero_eng: number
}

type NetworkStat = {
  network: string
  posts: number
  engagements: number
  impressions: number
  eng_rate: number
}

type KPI = {
  total_posts: number
  total_eng: number
  avg_eng: number
  zero_eng_pct: number
  top_post_eng: number
  followers: number
  follower_growth: number
}

export default function ClientSocialPage() {
  const params = useParams()
  const clientName = decodeURIComponent(params.client as string)

  const now = new Date()
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth())
  const [selectedYear] = useState(now.getFullYear())
  const [kpi, setKpi] = useState<KPI | null>(null)
  const [topPosts, setTopPosts] = useState<Post[]>([])
  const [networks, setNetworks] = useState<NetworkStat[]>([])
  const [trend, setTrend] = useState<MonthStat[]>([])
  const [loading, setLoading] = useState(true)

  const currentMonth = now.getMonth()
  const months3 = [-2, -1, 0].map(offset => {
    const m = (currentMonth + offset + 12) % 12
    return { label: MONTH_LABELS[m], value: m }
  })

  useEffect(() => { loadData() }, [selectedMonth, selectedYear, clientName])

  async function loadData() {
    setLoading(true)
    const monthStart = new Date(selectedYear, selectedMonth, 1).toISOString().split('T')[0]
    const monthEnd = new Date(selectedYear, selectedMonth + 1, 0).toISOString().split('T')[0]

    // Posts for selected month
    const { data: posts } = await supabase
      .from('sprout_posts')
      .select('*')
      .eq('client_name', clientName)
      .gte('published_at', monthStart + 'T00:00:00')
      .lte('published_at', monthEnd + 'T23:59:59')
      .order('engagements', { ascending: false })

    // Follower snapshot
    const { data: snaps } = await supabase
      .from('client_follower_snapshots')
      .select('total_followers, net_follower_change')
      .eq('client_name', clientName)
      .lte('snapshot_month', monthEnd)
      .order('snapshot_month', { ascending: false })
      .limit(1)

    // 6-month trend
    const trendStart = new Date(selectedYear, selectedMonth - 5, 1).toISOString().split('T')[0]
    const { data: trendPosts } = await supabase
      .from('sprout_posts')
      .select('published_at, engagements')
      .eq('client_name', clientName)
      .gte('published_at', trendStart + 'T00:00:00')
      .lte('published_at', monthEnd + 'T23:59:59')

    // Build KPIs
    const allPosts = posts ?? []
    const totalPosts = allPosts.length
    const totalEng = allPosts.reduce((a, p) => a + (p.engagements ?? 0), 0)
    const zeroPosts = allPosts.filter(p => (p.engagements ?? 0) === 0).length
    const topPost = allPosts[0]
    const snap = snaps?.[0]

    setKpi({
      total_posts: totalPosts,
      total_eng: totalEng,
      avg_eng: totalPosts > 0 ? parseFloat((totalEng / totalPosts).toFixed(1)) : 0,
      zero_eng_pct: totalPosts > 0 ? Math.round((zeroPosts / totalPosts) * 100) : 0,
      top_post_eng: topPost?.engagements ?? 0,
      followers: snap?.total_followers ?? 0,
      follower_growth: snap?.net_follower_change ?? 0,
    })

    // Top 5 posts
    setTopPosts(allPosts.slice(0, 5))

    // Network breakdown
    const netMap: Record<string, { posts: number; eng: number; imp: number }> = {}
    for (const p of allPosts) {
      const net = (p.network ?? 'unknown').toLowerCase()
      if (!netMap[net]) netMap[net] = { posts: 0, eng: 0, imp: 0 }
      netMap[net].posts++
      netMap[net].eng += p.engagements ?? 0
      netMap[net].imp += p.impressions ?? 0
    }
    setNetworks(Object.entries(netMap).map(([network, d]) => ({
      network,
      posts: d.posts,
      engagements: d.eng,
      impressions: d.imp,
      eng_rate: d.imp > 0 ? parseFloat(((d.eng / d.imp) * 100).toFixed(2)) : 0,
    })).sort((a, b) => b.engagements - a.engagements))

    // Monthly trend
    const monthMap: Record<string, { posts: number; eng: number }> = {}
    for (const p of trendPosts ?? []) {
      const key = p.published_at?.slice(0, 7) ?? ''
      if (!key) continue
      if (!monthMap[key]) monthMap[key] = { posts: 0, eng: 0 }
      monthMap[key].posts++
      monthMap[key].eng += p.engagements ?? 0
    }
    const trendArr = Object.entries(monthMap).sort(([a], [b]) => a.localeCompare(b)).map(([month, d]) => ({
      month,
      posts: d.posts,
      engagements: d.eng,
      avg_eng: d.posts > 0 ? parseFloat((d.eng / d.posts).toFixed(1)) : 0,
      zero_eng: 0,
    }))
    setTrend(trendArr)

    setLoading(false)
  }

  const networkLabel = (n: string) => {
    const map: Record<string, string> = {
      facebook: 'Facebook', fb_instagram_account: 'Instagram', linkedin_company: 'LinkedIn',
      linkedin: 'LinkedIn', twitter: 'X / Twitter', youtube: 'YouTube',
    }
    return map[n] ?? n
  }

  const networkColor = (n: string) => {
    const map: Record<string, string> = {
      facebook: '#1877f2', fb_instagram_account: '#e1306c', linkedin_company: '#0a66c2',
      linkedin: '#0a66c2', twitter: '#000', youtube: '#ff0000',
    }
    return map[n] ?? '#78716C'
  }

  const maxEng = Math.max(...trend.map(t => t.engagements), 1)

  return (
    <div style={{ minHeight: '100vh', background: '#FAFAF9', color: '#1C1917', fontFamily: "'Inter', system-ui, sans-serif" }}>

      {/* Header */}
      <header style={{ borderBottom: '1px solid #E7E5E4' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Link href="/dashboard/social" style={{ color: '#78716C', textDecoration: 'none', fontSize: 13 }}>← Social Hub</Link>
            <span style={{ color: '#E7E5E4' }}>/</span>
            <div>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, color: '#78716C' }}>Client</div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{clientName}</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: 4, borderRadius: 8, background: '#F5F5F4' }}>
            {months3.map(m => (
              <button key={m.value} onClick={() => setSelectedMonth(m.value)} style={{
                padding: '6px 12px', fontSize: 13, fontWeight: 500, borderRadius: 6, border: 'none', cursor: 'pointer',
                background: m.value === selectedMonth ? '#1C1917' : 'transparent',
                color: m.value === selectedMonth ? '#FAFAF9' : '#1C1917',
              }}>{m.label}</button>
            ))}
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px' }}>

        <div style={{ marginBottom: 32 }}>
          <p style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, color: '#78716C', marginBottom: 6 }}>
            {MONTH_LABELS[selectedMonth]} {selectedYear}
          </p>
          <h2 style={{ fontSize: 28, fontWeight: 600, letterSpacing: '-0.02em', margin: 0 }}>{clientName}</h2>
        </div>

        {/* KPI tiles */}
        {kpi && (
          <section style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, background: '#D6D3D1', border: '1px solid #E7E5E4', borderRadius: 8, overflow: 'hidden', marginBottom: 40 }}>
            {[
              { label: 'Posts published', value: loading ? '…' : kpi.total_posts.toString() },
              { label: 'Total engagements', value: loading ? '…' : kpi.total_eng.toLocaleString() },
              { label: 'Avg eng / post', value: loading ? '…' : kpi.avg_eng.toFixed(1), color: kpi.avg_eng >= 8 ? '#047857' : kpi.avg_eng >= 2 ? '#B45309' : '#b91c1c' },
              { label: 'Zero-engagement', value: loading ? '…' : `${kpi.zero_eng_pct}%`, color: kpi.zero_eng_pct > 50 ? '#b91c1c' : '#B45309' },
              { label: 'Top post', value: loading ? '…' : `${kpi.top_post_eng} eng` },
              { label: 'Followers', value: loading ? '…' : kpi.followers > 0 ? kpi.followers.toLocaleString() : '—' },
              { label: 'Follower growth', value: loading ? '…' : kpi.follower_growth > 0 ? `+${kpi.follower_growth}` : kpi.follower_growth === 0 ? '—' : `${kpi.follower_growth}`, color: kpi.follower_growth > 0 ? '#047857' : undefined },
              { label: 'Networks active', value: loading ? '…' : networks.length.toString() },
            ].map((k, i) => (
              <div key={i} style={{ background: 'white', padding: '18px 20px' }}>
                <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, color: '#78716C' }}>{k.label}</div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 26, fontWeight: 600, letterSpacing: '-0.02em', marginTop: 8, color: k.color ?? '#1C1917' }}>{k.value}</div>
              </div>
            ))}
          </section>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 40 }}>

          {/* Network breakdown */}
          <section>
            <p style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, color: '#78716C', marginBottom: 4 }}>Network breakdown</p>
            <h3 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 16px' }}>Where they're publishing.</h3>
            <div style={{ border: '1px solid #E7E5E4', borderRadius: 8, overflow: 'hidden', background: 'white' }}>
              {loading ? (
                <div style={{ padding: 24, color: '#78716C', textAlign: 'center' }}>Loading…</div>
              ) : networks.length === 0 ? (
                <div style={{ padding: 24, color: '#78716C', textAlign: 'center' }}>No posts this month</div>
              ) : networks.map((n, i) => (
                <div key={n.network} style={{ padding: '14px 16px', borderTop: i > 0 ? '1px solid #E7E5E4' : undefined, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: networkColor(n.network), flexShrink: 0 }} />
                    <div>
                      <div style={{ fontWeight: 500, fontSize: 14 }}>{networkLabel(n.network)}</div>
                      <div style={{ fontSize: 12, color: '#78716C' }}>{n.posts} posts</div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: 14 }}>{n.engagements.toLocaleString()} eng</div>
                    {n.eng_rate > 0 && <div style={{ fontSize: 12, color: '#78716C' }}>{n.eng_rate}% rate</div>}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* 6-month trend */}
          <section>
            <p style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, color: '#78716C', marginBottom: 4 }}>6-month trend</p>
            <h3 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 16px' }}>Engagement over time.</h3>
            <div style={{ border: '1px solid #E7E5E4', borderRadius: 8, background: 'white', padding: 20 }}>
              {loading ? (
                <div style={{ color: '#78716C', textAlign: 'center' }}>Loading…</div>
              ) : trend.length === 0 ? (
                <div style={{ color: '#78716C', textAlign: 'center' }}>No data</div>
              ) : (
                <div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 100, marginBottom: 8 }}>
                    {trend.map((t, i) => (
                      <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                        <div style={{
                          width: '100%', background: t.month === `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}` ? '#EA580C' : '#1C1917',
                          height: Math.max(4, Math.round((t.engagements / maxEng) * 90)),
                          borderRadius: 3, opacity: 0.8,
                        }} />
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {trend.map((t, i) => (
                      <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: 10, color: '#78716C' }}>
                        {MONTH_LABELS[parseInt(t.month.split('-')[1]) - 1]}
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: 16, borderTop: '1px solid #E7E5E4', paddingTop: 12, display: 'flex', justifyContent: 'space-between' }}>
                    {trend.map((t, i) => (
                      <div key={i} style={{ flex: 1, textAlign: 'center' }}>
                        <div style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 600 }}>{t.avg_eng}</div>
                        <div style={{ fontSize: 10, color: '#78716C' }}>avg</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Top posts */}
        <section>
          <p style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, color: '#78716C', marginBottom: 4 }}>Top posts</p>
          <h3 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 16px' }}>What landed this month.</h3>
          <div style={{ border: '1px solid #E7E5E4', borderRadius: 8, overflow: 'hidden' }}>
            {loading ? (
              <div style={{ padding: 32, textAlign: 'center', color: '#78716C' }}>Loading…</div>
            ) : topPosts.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center', color: '#78716C' }}>No posts found for this month.</div>
            ) : topPosts.map((p, i) => (
              <div key={p.post_id} style={{ padding: '16px 20px', borderTop: i > 0 ? '1px solid #E7E5E4' : undefined, background: 'white', display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                <div style={{ fontFamily: 'monospace', color: '#78716C', fontSize: 13, minWidth: 20 }}>0{i + 1}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: networkColor(p.network), flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: '#78716C' }}>{networkLabel(p.network)}</span>
                    <span style={{ fontSize: 12, color: '#78716C' }}>·</span>
                    <span style={{ fontSize: 12, color: '#78716C' }}>{new Date(p.published_at).toLocaleDateString()}</span>
                  </div>
                  <p style={{ fontSize: 13, margin: '0 0 8px', lineHeight: 1.5, color: '#1C1917', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any }}>
                    {p.text_content || '—'}
                  </p>
                  {p.permalink && (
                    <a href={p.permalink} target="_blank" rel="noopener" style={{ fontSize: 12, color: '#EA580C', textDecoration: 'none' }}>View post →</a>
                  )}
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontFamily: 'monospace', fontSize: 20, fontWeight: 600, color: p.engagements > 10 ? '#047857' : '#1C1917' }}>{p.engagements}</div>
                  <div style={{ fontSize: 11, color: '#78716C' }}>engagements</div>
                  {p.impressions > 0 && <div style={{ fontSize: 11, color: '#78716C', marginTop: 2 }}>{p.impressions.toLocaleString()} views</div>}
                </div>
              </div>
            ))}
          </div>
        </section>

      </main>
    </div>
  )
}
