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

// Profile ID → client name mapping
// Run /api/sprout/profiles first to discover all profile IDs, then fill this in
// Or we auto-map from display_name patterns
const CLIENT_MAP: Record<string, string> = {
  // Will be populated after first profiles call
}

function inferClientName(displayName: string, username: string): string {
  const name = (displayName || username || '').toLowerCase()
  if (name.includes('richards') || name.includes('rbs')) return 'Richards Building Supply'
  if (name.includes('culture')) return 'Culture Construction'
  if (name.includes('kbc')) return 'KBC Exteriors'
  if (name.includes('mvp') || name.includes('chiro')) return 'MVP Chiropractic'
  if (name.includes('midwest')) return 'Midwest Construction Experts'
  if (name.includes('apollo')) return 'Apollo Supply'
  if (name.includes('midway')) return 'Midway Windows'
  if (name.includes('affiliated') || name.includes('apek') || name.includes('ace')) return 'Affiliated Control Equipment'
  if (name.includes('nico') || name.includes('nico roofing')) return 'NICO Roofing'
  if (name.includes('a&b') || name.includes('ab consulting')) return 'A&B Consulting Group'
  if (name.includes('apek')) return 'APEK Inc.'
  if (name.includes('rg general') || name.includes('rg roofing')) return 'RG General Roofing'
  return displayName || username || 'Unknown'
}

async function fetchProfiles() {
  const res = await fetch(`${SPROUT_BASE}/metadata/customer`, {
    headers: HEADERS,
  })
  if (!res.ok) throw new Error(`Profiles metadata failed: ${res.status} ${await res.text()}`)
  return res.json()
}

async function fetchProfileAnalytics(profileIds: string[], startDate: string, endDate: string) {
  // Sprout analytics/profiles endpoint - daily aggregated data
  const body = {
    filters: [{ entity_type: 'owned_profile', entity_ids: profileIds }],
    metrics: [
      'lifetime.followers.count',
      'lifetime.following.count',
      'net_follower.count',
      'impressions.count',
      'engagements.count',
      'posts_sent.count',
    ],
    dimensions: ['reported_date'],
    start_time: startDate,
    end_time: endDate,
  }
  const res = await fetch(`${SPROUT_BASE}/analytics/profiles`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Profile analytics failed: ${res.status} ${await res.text()}`)
  return res.json()
}

async function fetchPostAnalytics(profileIds: string[], startDate: string, endDate: string, page = 1) {
  const body = {
    filters: [{ entity_type: 'owned_profile', entity_ids: profileIds }],
    metrics: [
      'lifetime.impressions.count',
      'lifetime.engagements.count',
      'lifetime.reactions.count',
      'lifetime.comments.count',
      'lifetime.shares.count',
      'lifetime.clicks.count',
      'lifetime.video_views.count',
      'lifetime.reach.count',
    ],
    page,
    per_page: 100,
    start_time: startDate,
    end_time: endDate,
  }
  const res = await fetch(`${SPROUT_BASE}/analytics/posts`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Post analytics failed: ${res.status} ${await res.text()}`)
  return res.json()
}

export async function POST(req: NextRequest) {
  // Allow internal cron or manual trigger with a secret
  // Auth: only enforce if CRON_SECRET is explicitly set and non-empty
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
  let errorMessage: string | null = null

  try {
    // 1. Get all profiles
    const profilesMeta = await fetchProfiles()
    const profiles = profilesMeta.data ?? []

    // Build profile_id → client name map
    const profileClientMap: Record<string, { clientName: string; network: string; username: string; displayName: string }> = {}
    for (const p of profiles) {
      const clientName = CLIENT_MAP[p.id] ?? inferClientName(p.name ?? '', p.native_id ?? '')
      profileClientMap[p.id] = {
        clientName,
        network: p.network_type ?? 'unknown',
        username: p.native_id ?? '',
        displayName: p.name ?? '',
      }
    }

    const profileIds = Object.keys(profileClientMap)
    if (profileIds.length === 0) throw new Error('No profiles found')

    // 2. Fetch profile-level analytics in batches of 20
    const BATCH = 20
    for (let i = 0; i < profileIds.length; i += BATCH) {
      const batch = profileIds.slice(i, i + BATCH)
      const analytics = await fetchProfileAnalytics(batch, startStr, endStr)
      const rows = analytics.data ?? []

      for (const row of rows) {
        const meta = profileClientMap[row.dimensions?.profile_id ?? row.profile_id]
        if (!meta) continue

        const upsertRow = {
          profile_id: row.dimensions?.profile_id ?? row.profile_id,
          client_name: meta.clientName,
          network: meta.network,
          username: meta.username,
          display_name: meta.displayName,
          reported_date: row.dimensions?.reported_date ?? row.reported_date,
          followers: row.metrics?.['lifetime.followers.count'] ?? 0,
          following: row.metrics?.['lifetime.following.count'] ?? 0,
          net_follower_change: row.metrics?.['net_follower.count'] ?? 0,
          impressions: row.metrics?.['impressions.count'] ?? 0,
          engagements: row.metrics?.['engagements.count'] ?? 0,
          posts_sent: row.metrics?.['posts_sent.count'] ?? 0,
          updated_at: new Date().toISOString(),
        }

        await supabase.from('sprout_profiles').upsert(upsertRow, {
          onConflict: 'profile_id,reported_date',
        })
        profilesUpserted++
      }
    }

    // 3. Fetch post analytics (paginated)
    let page = 1
    let hasMore = true
    while (hasMore) {
      const postData = await fetchPostAnalytics(profileIds, startStr, endStr, page)
      const posts = postData.data ?? []
      if (posts.length === 0) { hasMore = false; break }

      for (const post of posts) {
        const meta = profileClientMap[post.profile_id]
        const upsertRow = {
          post_id: post.id ?? post.post_id,
          profile_id: post.profile_id,
          client_name: meta?.clientName ?? inferClientName(post.profile_name ?? '', ''),
          network: meta?.network ?? post.network_type ?? 'unknown',
          post_type: post.post_type ?? post.content_type ?? null,
          published_at: post.sent_time ?? post.created_time ?? null,
          text_content: post.text ?? null,
          permalink: post.permalink ?? null,
          impressions: post.metrics?.['lifetime.impressions.count'] ?? 0,
          reach: post.metrics?.['lifetime.reach.count'] ?? 0,
          engagements: post.metrics?.['lifetime.engagements.count'] ?? 0,
          reactions: post.metrics?.['lifetime.reactions.count'] ?? 0,
          comments: post.metrics?.['lifetime.comments.count'] ?? 0,
          shares: post.metrics?.['lifetime.shares.count'] ?? 0,
          clicks: post.metrics?.['lifetime.clicks.count'] ?? 0,
          video_views: post.metrics?.['lifetime.video_views.count'] ?? 0,
          tags: post.tags ?? [],
          updated_at: new Date().toISOString(),
        }

        await supabase.from('sprout_posts').upsert(upsertRow, {
          onConflict: 'post_id',
        })
        postsUpserted++
      }

      // Check if there are more pages
      const total = postData.paging?.total ?? 0
      hasMore = page * 100 < total
      page++

      // Safety cap
      if (page > 20) break
    }

    // 4. Log the sync
    await supabase.from('sprout_sync_log').insert({
      profiles_upserted: profilesUpserted,
      posts_upserted: postsUpserted,
      date_range_start: startStr,
      date_range_end: endStr,
      status: 'success',
    })

    return NextResponse.json({
      success: true,
      profiles_upserted: profilesUpserted,
      posts_upserted: postsUpserted,
      date_range: { start: startStr, end: endStr },
    })
  } catch (err: any) {
    errorMessage = err.message
    await supabase.from('sprout_sync_log').insert({
      profiles_upserted: profilesUpserted,
      posts_upserted: postsUpserted,
      date_range_start: startStr,
      date_range_end: endStr,
      status: 'error',
      error_message: errorMessage,
    })
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}

// GET = manual trigger from browser / status check
export async function GET() {
  const { data: logs } = await supabase
    .from('sprout_sync_log')
    .select('*')
    .order('synced_at', { ascending: false })
    .limit(5)
  return NextResponse.json({ logs })
}
