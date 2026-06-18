import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const clientId = searchParams.get('clientId')
  const month = searchParams.get('month')
  if (!clientId || !month) return NextResponse.json({ error: 'clientId and month required' }, { status: 400 })

  const supabase = await createClient()
  const { data: rows } = await supabase
    .from('report_data')
    .select('section, platform, metric, value')
    .eq('client_id', clientId)
    .eq('month', month)
    .in('section', ['social_organic', 'social_branches'])

  if (!rows || rows.length === 0) return NextResponse.json({ configured: true, data: null, message: 'No social data uploaded for this period' })

  const organic = rows.filter(r => r.section === 'social_organic')
  const branches = rows.filter(r => r.section === 'social_branches')

  const get = (data: typeof rows, platform: string, metric: string) =>
    data.filter(r => (!platform || r.platform === platform) && r.metric === metric)
      .reduce((s, r) => s + (parseFloat(String(r.value)) || 0), 0) || null

  // Organic totals across all platforms
  const allPlatforms = [...new Set(organic.map(r => r.platform))]
  const impressions = allPlatforms.reduce((s, p) => s + (get(organic, p, 'impressions') || 0), 0) || null
  const engagements = allPlatforms.reduce((s, p) => s + (get(organic, p, 'engagements') || 0), 0) || null
  const gained = allPlatforms.reduce((s, p) => s + (get(organic, p, 'audience_gained') || 0), 0) || null
  const videoViews = allPlatforms.reduce((s, p) => s + (get(organic, p, 'video_views') || 0), 0) || null
  const postLinkClicks = allPlatforms.reduce((s, p) => s + (get(organic, p, 'post_link_clicks') || 0), 0) || null
  const engRate = impressions && engagements ? (engagements / impressions * 100) : null

  const platformNames = ['facebook', 'instagram', 'linkedin', 'x', 'tiktok', 'youtube']
  const platforms = platformNames.map(p => ({
    platform: p.charAt(0).toUpperCase() + p.slice(1),
    posts: get(organic, p, 'posts') ?? 0,
    impressions: get(organic, p, 'impressions') ?? 0,
    engagements: get(organic, p, 'engagements') ?? 0,
    videoViews: get(organic, p, 'video_views') ?? 0,
    postLinkClicks: get(organic, p, 'post_link_clicks') ?? 0,
  })).filter(p => p.impressions > 0 || p.engagements > 0)

  // Branch pages (RBS-specific)
  const branchData = branches.length > 0 ? {
    branchCount: get(branches, 'facebook', 'branch_count') ?? 0,
    impressions: get(branches, 'facebook', 'impressions') ?? 0,
    engagements: get(branches, 'facebook', 'engagements') ?? 0,
    videoViews: get(branches, 'facebook', 'video_views') ?? 0,
    postLinkClicks: get(branches, 'facebook', 'post_link_clicks') ?? 0,
  } : null

  return NextResponse.json({
    configured: true, clientId, month,
    data: { impressions, engagements, gained, videoViews, postLinkClicks, engRate, platforms, branchPages: branchData },
  })
}
