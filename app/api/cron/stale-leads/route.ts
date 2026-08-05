// app/api/cron/stale-leads/route.ts
// Hourly staleness sweep. Runs here rather than in Supabase because pg_net and
// http are not installed on this project, so Postgres cannot reach the
// ActiveCampaign API — and the AC credentials only exist as Vercel env vars.
//
// Uses the service-role client: a cron has no user session, so RLS on leads
// would otherwise return nothing.
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { setContactTag } from '@/lib/activecampaign/pipeline-sync'

// Hours of inactivity before a lead in each stage is considered stale.
const STALE_AFTER_HOURS: Record<string, number> = {
  'new': 24,
  'contacted': 72,
  'discovery': 120,
  'proposal': 72,
  'contract-sent': 48,
}

// Closed stages are never chased.
const CLOSED = ['won', 'lost', 'disqualified']

const staleTagFor = (status: string) => `stale-${status}`

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sb = createServiceClient()
  const now = Date.now()

  const { data: leads, error } = await sb
    .from('leads')
    .select('id, business_name, email, status, last_activity_at, created_at, is_stale, stale_tag')
    .not('status', 'in', `(${CLOSED.join(',')})`)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const wentStale: string[] = []
  const retagged: string[] = []
  const warnings: string[] = []
  let checked = 0

  for (const lead of leads ?? []) {
    const threshold = STALE_AFTER_HOURS[lead.status]
    if (threshold === undefined) continue
    checked++

    // Fall back to created_at if no activity has ever been logged.
    const since = lead.last_activity_at ?? lead.created_at
    if (!since) continue
    const hours = (now - new Date(since).getTime()) / 3_600_000
    const shouldBeStale = hours >= threshold
    if (!shouldBeStale) continue

    const wantTag = staleTagFor(lead.status)

    // Already flagged with the right tag for its current stage — nothing to do.
    if (lead.is_stale && lead.stale_tag === wantTag) continue

    // Stage changed while stale: remove the tag for the old stage first so the
    // contact isn't left carrying two stale tags.
    if (lead.is_stale && lead.stale_tag && lead.stale_tag !== wantTag) {
      const off = await setContactTag(lead.email, lead.stale_tag, 'remove')
      if (off.warning) warnings.push(`${lead.business_name}: ${off.warning}`)
      retagged.push(`${lead.business_name} (${lead.stale_tag} -> ${wantTag})`)
    }

    const res = await setContactTag(lead.email, wantTag, 'add')
    if (res.warning) warnings.push(`${lead.business_name}: ${res.warning}`)

    // Flag regardless of the AC outcome so the board still shows the warning.
    await sb
      .from('leads')
      .update({ is_stale: true, stale_since: new Date().toISOString(), stale_tag: wantTag })
      .eq('id', lead.id)

    wentStale.push(`${lead.business_name} (${lead.status}, ${Math.floor(hours)}h)`)
  }

  return NextResponse.json({
    ok: true,
    checked,
    newlyStale: wentStale.length,
    wentStale,
    retagged,
    warnings,
  })
}
