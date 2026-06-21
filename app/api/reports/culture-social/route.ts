import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number)
  const from = new Date(y, m - 1, 1).toISOString().slice(0, 10)
  const to = new Date(y, m, 0).toISOString().slice(0, 10)
  return { from, to }
}

function prevMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return m === 1
    ? `${y - 1}-12`
    : `${y}-${String(m - 1).padStart(2, '0')}`
}

function lastYearMonth(month: string): string {
  const [y, m] = month.split('-')
  return `${Number(y) - 1}-${m}`
}

async function fetchSocialForMonth(supabase: Awaited<ReturnType<typeof createClient>>, month: string) {
  const { from, to } = monthRange(month)

  // Profile-level aggregates
  const { data: profiles } = await supabase
    .from('sprout_profiles')
    .select('network, impressions, engagements, posts_sent, net_follower_change, followers, reported_date')
    .eq('client_name', 'Culture Construction')
    .gte('reported_date', from)
    .lte('reported_date', to)

  if (!profiles || profiles.length === 0) return null

  // Aggregate by network
  const byNetwork: Record<string, { impressions: number; engagements: number; posts: number; followerChange: number; followers: number }> = {}
  for (const row of profiles) {
    const net = row.network as string
    if (!byNetwork[net]) byNetwork[net] = { impressions: 0, engagements: 0, posts: 0, followerChange: 0, followers: 0 }
    byNetwork[net].impressions    += row.impressions || 0
    byNetwork[net].engagements    += row.engagements || 0
    byNetwork[net].posts          += row.posts_sent || 0
    byNetwork[net].followerChange += row.net_follower_change || 0
    byNetwork[net].followers       = Math.max(byNetwork[net].followers, row.followers || 0)
  }

  // Top posts for the month
  const { data: posts } = await supabase
    .from('sprout_posts')
    .select('network, post_type, published_at, impressions, engagements, reactions, comments, shares, video_views, text_content')
    .eq('client_name', 'Culture Construction')
    .gte('published_at', from + 'T00:00:00Z')
    .lte('published_at', to + 'T23:59:59Z')
    .order('engagements', { ascending: false })
    .limit(6)

  const totalImpressions = Object.values(byNetwork).reduce((s, n) => s + n.impressions, 0)
  const totalEngagements = Object.values(byNetwork).reduce((s, n) => s + n.engagements, 0)
  const totalFollowerChange = Object.values(byNetwork).reduce((s, n) => s + n.followerChange, 0)
  const engRate = totalImpressions > 0 ? (totalEngagements / totalImpressions) * 100 : 0

  const networkMap: Record<string, string> = {
    facebook: 'Facebook',
    fb_instagram_account: 'Instagram',
    linkedin_company: 'LinkedIn',
    youtube: 'YouTube',
  }

  const platforms = Object.entries(byNetwork)
    .map(([net, v]) => ({
      network: net,
      label: networkMap[net] || net,
      impressions: v.impressions,
      engagements: v.engagements,
      posts: v.posts,
      followerChange: v.followerChange,
      followers: v.followers,
      engRate: v.impressions > 0 ? parseFloat(((v.engagements / v.impressions) * 100).toFixed(2)) : 0,
    }))
    .sort((a, b) => b.impressions - a.impressions)

  return {
    totalImpressions,
    totalEngagements,
    totalFollowerChange,
    engRate: parseFloat(engRate.toFixed(2)),
    platforms,
    topPosts: (posts || []).map(p => ({
      network: networkMap[p.network] || p.network,
      postType: p.post_type,
      publishedAt: p.published_at,
      impressions: p.impressions || 0,
      engagements: p.engagements || 0,
      reactions: p.reactions || 0,
      comments: p.comments || 0,
      shares: p.shares || 0,
      videoViews: p.video_views || 0,
      preview: p.text_content ? p.text_content.slice(0, 100) : null,
      engRate: (p.impressions || 0) > 0
        ? parseFloat(((p.engagements || 0) / (p.impressions || 1) * 100).toFixed(1))
        : 0,
    })),
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const clientId = searchParams.get('clientId')
  const month = searchParams.get('month') || new Date().toISOString().slice(0, 7)

  if (clientId !== 'culture') {
    return NextResponse.json({ configured: false, message: 'This endpoint is Culture Construction only' })
  }

  try {
    const supabase = await createClient()
    const pm = prevMonth(month)
    const ly = lastYearMonth(month)

    const [current, prev, lastYear] = await Promise.all([
      fetchSocialForMonth(supabase, month),
      fetchSocialForMonth(supabase, pm),
      fetchSocialForMonth(supabase, ly),
    ])

    if (!current) {
      return NextResponse.json({ configured: true, data: null, message: 'No social data for this period' })
    }

    return NextResponse.json({
      configured: true,
      clientId,
      month,
      prevMonth: pm,
      lastYearMonth: ly,
      data: current,
      prevData: prev,
      lastYearData: lastYear,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[Culture Social]', msg)
    return NextResponse.json({ error: msg, configured: true, data: null }, { status: 500 })
  }
}
