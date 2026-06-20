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
    metrics: ['lifetime.followers.count', 'net_follower.count', 'impressions', 'engagements', 'posts_sent'],
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
    fields: ['created_time', 'perma_link', 'text', 'post_type', 'customer_profile_id'],
    metrics: ['lifetime.impressions', 'lifetime.engagements', 'lifetime.reactions', 'lifetime.video_views'],
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

    const profileMap: Record<number, { clientName: string; network: string; username: string; displayName: string }> = {}
    for (const p of allProfiles) {
      if (SKIP_NETWORKS.includes(p.network_type)) continue
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

    // Post analytics
    for (let i = 0; i < allIds.length; i += BATCH) {
      const batch = allIds.slice(i, i + BATCH)
      let page = 1, hasMore = true
      while (hasMore) {
        const resp = await fetchPostAnalytics(batch, startStr, endStr, page)
        const posts = resp.data ?? []
        if (!posts.length) break
        const postBatch: any[] = []
        for (const post of posts) {
          const pid = Number(post.customer_profile_id)
          const meta = profileMap[pid]
          const postId = post.profile_guid ?? post.guid ?? post.id
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
            comments: 0, shares: 0, clicks: 0,
            video_views: post.metrics?.['lifetime.video_views'] ?? 0,
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
