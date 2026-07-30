// app/api/reports/gads-markup/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET /api/reports/gads-markup?client_id=rbs&platform=google
// Returns overrides as { [campaign_id]: markup_pct }
export async function GET(req: NextRequest) {
  const clientId  = req.nextUrl.searchParams.get('client_id')
  const platform  = req.nextUrl.searchParams.get('platform') ?? 'google'
  if (!clientId) return NextResponse.json({ error: 'client_id required' }, { status: 400 })

  const { data, error } = await supabase
    .from('gads_campaign_markup')
    .select('campaign_id, campaign_name, markup_pct')
    .eq('client_id', clientId)
    .eq('platform', platform)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const map: Record<string, number> = {}
  for (const row of data ?? []) map[row.campaign_id] = Number(row.markup_pct)

  return NextResponse.json({ overrides: map })
}

// POST /api/reports/gads-markup
// Body: { client_id, platform, campaign_id, campaign_name, markup_pct }
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { client_id, campaign_id, campaign_name, markup_pct, platform = 'google' } = body

  if (!client_id || !campaign_id || markup_pct === undefined)
    return NextResponse.json({ error: 'client_id, campaign_id, markup_pct required' }, { status: 400 })

  const pct = Number(markup_pct)
  if (isNaN(pct) || pct < 0 || pct > 500)
    return NextResponse.json({ error: 'markup_pct must be 0–500' }, { status: 400 })

  const { error } = await supabase
    .from('gads_campaign_markup')
    .upsert(
      { client_id, platform, campaign_id, campaign_name, markup_pct: pct, updated_at: new Date().toISOString() },
      { onConflict: 'client_id,platform,campaign_id' }
    )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE /api/reports/gads-markup?client_id=rbs&platform=meta&campaign_id=123
export async function DELETE(req: NextRequest) {
  const clientId   = req.nextUrl.searchParams.get('client_id')
  const campaignId = req.nextUrl.searchParams.get('campaign_id')
  const platform   = req.nextUrl.searchParams.get('platform') ?? 'google'

  if (!clientId || !campaignId)
    return NextResponse.json({ error: 'client_id and campaign_id required' }, { status: 400 })

  const { error } = await supabase
    .from('gads_campaign_markup')
    .delete()
    .eq('client_id', clientId)
    .eq('platform', platform)
    .eq('campaign_id', campaignId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
