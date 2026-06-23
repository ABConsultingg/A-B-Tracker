import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SPROUT_TOKEN = process.env.SPROUT_API_TOKEN!
const SPROUT_CUSTOMER_ID = '1068501'
const SPROUT_BASE = `https://api.sproutsocial.com/v1/${SPROUT_CUSTOMER_ID}`

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const HEADERS = {
  'Authorization': `Bearer ${SPROUT_TOKEN}`,
  'Content-Type': 'application/json',
}

function inferClientName(name: string): string {
  const n = (name || '').toLowerCase()
  if (n.includes('richards')) return 'Richards Building Supply'
  if (n.includes('culture construction')) return 'Culture Construction'
  if (n.includes('kbc exterior') || n.includes('kennedy')) return 'KBC Exteriors'
  if (n.includes('k.b.c') || n.includes('kb construction')) return 'KBC Exteriors'
  if (n.includes('mvp') || n.includes('chiro')) return 'MVP Chiropractic'
  if (n.includes('midwest construction')) return 'Midwest Construction Experts'
  if (n.includes('apollo supply')) return 'Apollo Supply'
  if (n.includes('midway windows')) return 'Midway Windows'
  if (n.includes('affiliated control')) return 'Affiliated Control Equipment'
  if (n.includes('nico roofing') || n.includes('nico exterior')) return 'NICO Roofing'
  if (n.includes('a&b consulting') || n.includes('ab consulting') || n.includes('abconsulting')) return 'A&B Consulting Group'
  if (n.includes('apek')) return 'APEK Inc.'
  if (n.includes('rg general') || n.includes('rg roofing')) return 'RG General Roofing'
  return name || 'Unknown'
}

async function fetchAllProfiles() {
  const res = await fetch(`${SPROUT_BASE}/metadata/customer`, { headers: HEADERS })
  if (!res.ok) throw new Error(`Metadata failed: ${res.status} ${await res.text()}`)
  const data = await res.json()
  return (data.data ?? []) as Array<{ customer_profile_id: number; network_type: string; name: string; native_id: string }>
}

async function fetchProfileAnalytics(sproutProfileIds: number[], startDate: string, endDate: string, page = 1) {
  const body = {
    filters: [
      `customer_profile_id.eq(${sproutProfileIds.join(',')})`,
      `reporting_period.in(${startDate}...${endDate})`,
    ],
    metrics: ['lifetime.followers.count', 'net_follower.count', 'impressions', 'engagements', 'posts_sent', 'video_views', 'post_link_clicks'],
    page,
  }
  const res = await fetch(`${SPROUT_BASE}/analytics/profiles`, { method: 'POST', headers: HEADERS, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`Profile analytics failed: ${res.status} ${await res.text()}`)
  return res.json()
}

async function fetchPostAnalytics(sproutProfileIds: number[], startDate: string, endDate: string, page = 1) {
  const body = {
    filters: [
      `customer_profile_id.eq(${sproutProfileIds.join(',')})`,
      `created_time.in(${startDate}T00:00:00...${endDate}T23:59:59)`,
    ],
    fields: ['guid', 'created_time', 'perma_link', 'text', 'post_type', 'customer_profile_id'],
    metrics: ['lifetime.impressions', 'lifetime.engagements', 'lifetime.reactions', 'lifetime.video_views', 'lifetime.link_clicks'],
    timezone: 'America/Chicago',
    page,
    limit: 50,
  }
  const res = await fetch(`${SPROUT_BASE}/analytics/posts`, { method: 'POST', headers: HEADERS, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`Post analytics failed: ${res.status} ${await res.text()}`)
  return res.json()
}

export async function POST(req: NextRequest) {
  const cronSecret = (process.env.CRON_SECRET || '').trim()
  if (cronSecret) {
    const authHeader = req.headers.get('authorization') || ''
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const body = await req.json().catch(() => ({}))
  const days = body.days ?? 30
  const endDate = new Date()
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - days)
  const startStr = startDate.toISOString().split('T')[0]
  const endStr = endDate.toISOString().split('T')[0]

  let profilesUpserted = 0
  let postsUpserted = 0

  try {
    const allProfiles = await fetchAllProfiles()
    const SKIP_NETWORKS = ['yelp', 'google_my_business', 'tiktok', 'pinterest']
    const SKIP_NAMES = [
      'three stories', 'midwest gaming', 'relentless construction', 'dirtbags',
      'northshore agribusiness', 'aluminight', 'fresh air experts', 'capri',
      'emily l2598', 'no dam problem', 'smith mountain', 'franos roofing',
      'adrian cardona', 'northshore', 'kennedy brother', 'k.b. construction',
    ]

    const profileMap: Record<number, { clientName: string; network: string; username: string; displayName: string }> = {}
    for (const p of allProfiles) {
      if (SKIP_NETWORKS.includes(p.network_type)) continue
      const nameLower = (p.name || '').toLowerCase()
      if (SKIP_NAMES.some(s => nameLower.includes(s))) continue
      profileMap[p.customer_profile_id] = {
        clientName: inferClientName(p.name),
        network: p.network_type,
        username: p.native_id,
        displayName: p.name,
      }
    }

    const allIds = Object.keys(profileMap).map(Number)
    const BATCH = 100

    // Profile analytics
    for (let i = 0; i < allIds.length; i += BATCH) {
      const batch = allIds.slice(i, i + BATCH)
      let page = 1, hasMore = true
      while (hasMore) {
        const resp = await fetchProfileAnalytics(batch, startStr, endStr, page)
        const rows = resp.data ?? []
        if (!rows.length) break
        const profileBatch: any[] = []
        for (const row of rows) {
          const pid = row.dimensions?.['customer_profile_id'] as number
          const meta = profileMap[pid]
          const reportedDate = row.dimensions?.['reporting_period.by(day)']
          if (!meta || !pid || !reportedDate) continue
          profileBatch.push({
            profile_id: String(pid), client_name: meta.clientName, network: meta.network,
            username: meta.username, display_name: meta.displayName, reported_date: reportedDate,
            followers: row.metrics?.['lifetime.followers.count'] ?? 0,
            following: row.metrics?.['lifetime.following.count'] ?? 0,
            net_follower_change: row.metrics?.['net_follower.count'] ?? 0,
            impressions: row.metrics?.['impressions'] ?? 0,
            engagements: row.metrics?.['engagements'] ?? 0,
            posts_sent: row.metrics?.['posts_sent'] ?? 0,
            video_views: row.metrics?.['video_views'] ?? 0,
            post_link_clicks: row.metrics?.['post_link_clicks'] ?? 0,
            updated_at: new Date().toISOString(),
          })
        }
        if (profileBatch.length > 0) {
          await supabase.from('sprout_profiles').upsert(profileBatch, { onConflict: 'profile_id,reported_date' })
          profilesUpserted += profileBatch.length
        }
        hasMore = (resp.paging?.current_page ?? page) < (resp.paging?.total_pages ?? 1)
        page++
        if (page > 30) break
      }
    }

    // Post analytics in batches of 10
    for (let i = 0; i < allIds.length; i += 10) {
      const batch = allIds.slice(i, i + 10)
      let page = 1, hasMore = true
      while (hasMore) {
        const resp = await fetchPostAnalytics(batch, startStr, endStr, page)
        const posts = resp.data ?? []
        if (!posts.length) break
        const postBatch: any[] = []
        for (const post of posts) {
          const pid = Number(post.customer_profile_id)
          const meta = profileMap[pid]
          const postId = post.guid ?? post.id
          if (!postId) continue
          postBatch.push({
            post_id: String(postId), profile_id: String(pid ?? ''),
            client_name: meta?.clientName ?? 'Unknown', network: meta?.network ?? 'unknown',
            post_type: post.post_type ?? null, published_at: post.created_time ?? null,
            text_content: post.text ?? null, permalink: post.perma_link ?? null,
            impressions: post.metrics?.['lifetime.impressions'] ?? 0,
            reach: 0,
            engagements: post.metrics?.['lifetime.engagements'] ?? 0,
            reactions: post.metrics?.['lifetime.reactions'] ?? 0,
            comments: 0, shares: 0,
            video_views: post.metrics?.['lifetime.video_views'] ?? 0,
            clicks: post.metrics?.['lifetime.link_clicks'] ?? 0,
            tags: [], updated_at: new Date().toISOString(),
          })
        }
        if (postBatch.length > 0) {
          await supabase.from('sprout_posts').upsert(postBatch, { onConflict: 'post_id' })
          postsUpserted += postBatch.length
        }
        hasMore = (resp.paging?.current_page ?? page) < (resp.paging?.total_pages ?? 1)
        page++
        if (page > 100) break
      }
    }

    // ── Aggregate sprout_profiles into report_data for all clients ────────────
    const CLIENT_ID_MAP: Record<string, string> = {
      'Richards Building Supply':     'rbs',
      'Culture Construction':          'culture',
      'KBC Exteriors':                 'kbc',
      'K.B. Construction':             'kbc',
      'MVP Chiropractic':              'mvp-chiro',
      'Midwest Construction Experts':  'midwest-constrcution-experts',
      'Apollo Supply':                 'apollo-events',
      'Midway Windows':                'midway-windows-doors',
      'Affiliated Control Equipment':  'affiliated-control',
      'NICO Roofing':                  'nico-roofing',
      'A&B Consulting Group':          'a-b-consulting-group',
      'APEK Inc.':                     'apek',
      'RG General Roofing':            'rg-general-roofing',
      'Franos Roofing':                'franos-roofing',
    }
    const NET_MAP: Record<string, string> = {
      facebook: 'facebook', fb_instagram_account: 'instagram',
      instagram: 'instagram', linkedin_company: 'linkedin',
      linkedin: 'linkedin', youtube: 'youtube',
      tiktok: 'tiktok', x: 'x', twitter: 'x',
    }

    // Get unique months in the sync range
    const months: Set<string> = new Set()
    const dCur = new Date(startStr)
    const dEnd = new Date(endStr)
    while (dCur <= dEnd) {
      months.add(`${dCur.getFullYear()}-${String(dCur.getMonth() + 1).padStart(2, '0')}`)
      dCur.setMonth(dCur.getMonth() + 1)
    }

    for (const month of months) {
      const from = `${month}-01`
      const to   = `${month}-31`
      const { data: aggRows } = await supabase
        .from('sprout_profiles')
        .select('client_name, network, impressions, engagements, posts_sent, net_follower_change, video_views, post_link_clicks')
        .gte('reported_date', from)
        .lte('reported_date', to)

      if (!aggRows?.length) continue

      const agg: Record<string, Record<string, Record<string, number>>> = {}
      for (const row of aggRows) {
        const clientId = CLIENT_ID_MAP[row.client_name]
        if (!clientId) continue
        const platform = NET_MAP[row.network] || row.network
        if (!agg[clientId]) agg[clientId] = {}
        if (!agg[clientId][platform]) agg[clientId][platform] = { impressions: 0, engagements: 0, posts: 0, audience_gained: 0, video_views: 0, post_link_clicks: 0 }
        agg[clientId][platform].impressions      += row.impressions || 0
        agg[clientId][platform].engagements      += row.engagements || 0
        agg[clientId][platform].posts            += row.posts_sent || 0
        agg[clientId][platform].audience_gained  += row.net_follower_change || 0
        agg[clientId][platform].video_views      += (row as any).video_views || 0
        agg[clientId][platform].post_link_clicks += (row as any).post_link_clicks || 0
      }

      const upserts: any[] = []
      for (const [clientId, platforms] of Object.entries(agg)) {
        for (const [platform, metrics] of Object.entries(platforms)) {
          for (const [metric, value] of Object.entries(metrics)) {
            if (!value) continue
            upserts.push({ client_id: clientId, month, section: 'social_organic', platform, metric, value, source: 'sprout_api' })
          }
        }
      }
      if (upserts.length > 0) {
        await supabase.from('report_data').upsert(upserts, { onConflict: 'client_id,month,section,platform,metric' })
      }
    }
    // ── Also aggregate video_views + post_link_clicks from sprout_posts ───────
    for (const month of months) {
      const from = `${month}-01`
      const to   = `${month}-31`
      const { data: postRows } = await supabase
        .from('sprout_posts')
        .select('client_name, network, video_views, clicks')
        .gte('published_at', from)
        .lte('published_at', to)

      if (!postRows?.length) continue

      const postAgg: Record<string, Record<string, { video_views: number; post_link_clicks: number }>> = {}
      for (const row of postRows) {
        const clientId = CLIENT_ID_MAP[row.client_name]
        if (!clientId) continue
        const platform = NET_MAP[row.network] || row.network
        if (!postAgg[clientId]) postAgg[clientId] = {}
        if (!postAgg[clientId][platform]) postAgg[clientId][platform] = { video_views: 0, post_link_clicks: 0 }
        postAgg[clientId][platform].video_views      += row.video_views || 0
        postAgg[clientId][platform].post_link_clicks += row.clicks || 0
      }

      const postUpserts: any[] = []
      for (const [clientId, platforms] of Object.entries(postAgg)) {
        for (const [platform, metrics] of Object.entries(platforms)) {
          if (metrics.video_views > 0) {
            postUpserts.push({ client_id: clientId, month, section: 'social_organic', platform, metric: 'video_views', value: metrics.video_views, source: 'sprout_api' })
          }
          if (metrics.post_link_clicks > 0) {
            postUpserts.push({ client_id: clientId, month, section: 'social_organic', platform, metric: 'post_link_clicks', value: metrics.post_link_clicks, source: 'sprout_api' })
          }
        }
      }
      if (postUpserts.length > 0) {
        await supabase.from('report_data').upsert(postUpserts, { onConflict: 'client_id,month,section,platform,metric' })
      }
    }
    // ── End aggregation ────────────────────────────────────────────────────────

    await supabase.from('sprout_sync_log').insert({ profiles_upserted: profilesUpserted, posts_upserted: postsUpserted, date_range_start: startStr, date_range_end: endStr, status: 'success' })
    return NextResponse.json({ success: true, profiles_upserted: profilesUpserted, posts_upserted: postsUpserted, date_range: { start: startStr, end: endStr } })

  } catch (err: any) {
    await supabase.from('sprout_sync_log').insert({ profiles_upserted: profilesUpserted, posts_upserted: postsUpserted, date_range_start: startStr, date_range_end: endStr, status: 'error', error_message: err.message })
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function GET() {
  const { data: logs } = await supabase.from('sprout_sync_log').select('*').order('synced_at', { ascending: false }).limit(5)
  return NextResponse.json({ logs })
}
