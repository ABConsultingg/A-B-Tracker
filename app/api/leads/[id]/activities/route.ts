// app/api/leads/[id]/activities/route.ts
// Activity log for one lead. Inserting an activity fires
// trg_touch_lead_on_activity, which updates leads.last_activity_at and clears
// the stale flag. Removing the matching ActiveCampaign tag has to happen here,
// because Postgres cannot make outbound HTTP calls.
import { NextRequest, NextResponse } from 'next/server'
import { checkSalesAccess } from '@/lib/auth/sales'
import { setContactTag } from '@/lib/activecampaign/pipeline-sync'

// Not exported: Next.js route files may only export request handlers and a
// fixed set of config values.
const ACTIVITY_TYPES = [
  'call', 'text', 'email', 'meeting', 'note', 'voicemail', 'form-submission', 'contract-viewed',
] as const

function deny(reason: 'unauthenticated' | 'forbidden' | null) {
  return reason === 'unauthenticated'
    ? NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    : NextResponse.json({ error: 'Requires owner or sales role' }, { status: 403 })
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { supabase, allowed, reason } = await checkSalesAccess()
  if (!allowed) return deny(reason)

  const { data, error } = await supabase
    .from('lead_activities')
    .select('id, activity_type, summary, contact_method, created_by, created_at')
    .eq('lead_id', params.id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { supabase, member, allowed, reason } = await checkSalesAccess()
  if (!allowed) return deny(reason)

  const body = await req.json()
  const activityType = String(body.activity_type || '')

  if (!(ACTIVITY_TYPES as readonly string[]).includes(activityType)) {
    return NextResponse.json({ error: `Invalid activity_type "${activityType}"` }, { status: 400 })
  }
  const summary = typeof body.summary === 'string' ? body.summary.trim() : ''
  if (!summary) {
    return NextResponse.json({ error: 'summary is required' }, { status: 400 })
  }
  const method = body.contact_method === 'inbound' || body.contact_method === 'outbound'
    ? body.contact_method
    : null

  // Captured before the insert: the trigger clears these, and we need to know
  // which AC tag to take off.
  const { data: before } = await supabase
    .from('leads')
    .select('email, is_stale, stale_tag')
    .eq('id', params.id)
    .maybeSingle()

  const { data: activity, error } = await supabase
    .from('lead_activities')
    .insert({
      lead_id: params.id,
      activity_type: activityType,
      summary,
      contact_method: method,
      created_by: member?.id ?? null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Was stale, now touched -> drop the stale tag in AC. Best-effort.
  let acSync = null
  if (before?.is_stale && before.stale_tag) {
    acSync = await setContactTag(before.email, before.stale_tag, 'remove')
  }

  // Return the refreshed lead so the client can pick up last_activity_at and
  // the cleared stale flag without a second request.
  const { data: lead } = await supabase
    .from('leads')
    .select('*')
    .eq('id', params.id)
    .single()

  return NextResponse.json({ activity, lead, acSync })
}
