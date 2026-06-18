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
    .eq('section', 'social_organic')

  if (!rows || rows.length === 0) return NextResponse.json({ configured: true, data: null, message: 'No social data uploaded for this period' })

  const get = (platform: string, metric: string) =>
    rows.filter(r => (!platform || r.platform?.includes(platform)) && r.metric === metric)
        .reduce((s, r) => s + (r.value ?? 0), 0) || null

  const impressions = get('', 'impressions')
  const engagements = get('', 'engagements')
  const gained = get('', 'audience_gained')
  const videoViews = get('', 'video_views')
  const postLinkClicks = get('', 'post_link_clicks')
  const engRate = impressions && engagements ? (engagements / impressions * 100) : null

  const platformNames = ['facebook', 'instagram', 'linkedin', 'twitter', 'tiktok']
  const platforms = platformNames.map(p => ({
    platform: p.charAt(0).toUpperCase() + p.slice(1),
    posts: get(p, 'posts') ?? 0,
    impressions: get(p, 'impressions') ?? 0,
    engagements: get(p, 'engagements') ?? 0,
    gained: get(p, 'audience_gained') ?? 0,
  })).filter(p => p.impressions > 0 || p.engagements > 0)

  return NextResponse.json({
    configured: true, clientId, month,
    data: { impressions, engagements, gained, videoViews, postLinkClicks, engRate, platforms },
  })
}
