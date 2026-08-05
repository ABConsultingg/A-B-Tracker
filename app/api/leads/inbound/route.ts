// app/api/leads/inbound/route.ts
// Public ingestion endpoint for the website contact form.
//
// Creating a lead here sends the pipeline-new tag, which triggers the
// "New Lead Introduction" automation and therefore sends email. That makes this
// endpoint an email-sending vector, so it is protected two ways:
//   1. a shared secret header (INBOUND_WEBHOOK_SECRET) — fails closed if unset
//   2. a rate limit of MAX_PER_MINUTE creates per minute per IP
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { syncLeadStage, warningNote } from '@/lib/activecampaign/pipeline-sync'

const MAX_PER_MINUTE = 10

// Mirrors leads_source_check.
const ALLOWED_SOURCES = [
  'manual', 'assessment', 'chatbot', 'cira', 'lsa', 'facebook', 'referral',
  'rbs-referral', 'client-referral', 'existing-client', 'linkedin', 'event',
  'cold-outreach', 'inbound', 'other',
]

// Mirrors leads_lead_type_check.
const ALLOWED_LEAD_TYPES = [
  'website', 'retainer', 'full-service', 'distributor-program', 'contractor-program',
]

function clientIp(req: NextRequest) {
  const fwd = req.headers.get('x-forwarded-for') || ''
  return fwd.split(',')[0].trim() || req.headers.get('x-real-ip') || 'unknown'
}

export async function POST(req: NextRequest) {
  const expected = process.env.INBOUND_WEBHOOK_SECRET

  // Fail closed. An unset secret must not leave the endpoint open.
  if (!expected) {
    console.error('[leads/inbound] INBOUND_WEBHOOK_SECRET is not configured')
    return NextResponse.json({ error: 'Endpoint not configured' }, { status: 503 })
  }

  const provided =
    req.headers.get('x-webhook-secret') ||
    (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')

  if (provided !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sb = createServiceClient()
  const ip = clientIp(req)

  // Rate limit. Counted per accepted request, so repeated hammering cannot be
  // used to probe the endpoint either.
  const windowStart = new Date(Date.now() - 60_000).toISOString()
  const { count } = await sb
    .from('inbound_rate_limit')
    .select('id', { count: 'exact', head: true })
    .eq('ip', ip)
    .gte('created_at', windowStart)

  if ((count ?? 0) >= MAX_PER_MINUTE) {
    return NextResponse.json(
      { error: `Rate limit exceeded — max ${MAX_PER_MINUTE} per minute` },
      { status: 429, headers: { 'Retry-After': '60' } }
    )
  }
  await sb.from('inbound_rate_limit').insert({ ip })
  // Opportunistic cleanup so the ledger cannot grow without bound.
  await sb.from('inbound_rate_limit').delete().lt('created_at', new Date(Date.now() - 3_600_000).toISOString())

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)

  const name = str(body.name)
  const email = str(body.email)
  const phone = str(body.phone)
  const message = str(body.message)

  // business_name is NOT NULL in the schema; a contact form may not collect it.
  const businessName = str(body.business_name) || name || email
  if (!businessName) {
    return NextResponse.json(
      { error: 'One of business_name, name, or email is required' },
      { status: 400 }
    )
  }

  const source = ALLOWED_SOURCES.includes(String(body.source)) ? String(body.source) : 'inbound'
  const leadType = ALLOWED_LEAD_TYPES.includes(String(body.lead_type)) ? String(body.lead_type) : null

  const { data: lead, error } = await sb
    .from('leads')
    .insert({
      business_name: businessName,
      name,
      email,
      phone,
      notes: message,
      source,
      lead_type: leadType,
      status: 'new',
      priority: 'medium',
      assigned_to: 'valerie',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // pipeline-new -> "New Lead Introduction". Best-effort: a sync failure is
  // recorded on the lead, never fatal to the submission.
  const acSync = await syncLeadStage(
    { email: lead.email, name: lead.name, phone: lead.phone, business_name: lead.business_name },
    'new'
  )
  if (acSync.warning) {
    const merged = lead.notes
      ? `${lead.notes}\n${warningNote(acSync.warning)}`
      : warningNote(acSync.warning)
    await sb.from('leads').update({ notes: merged }).eq('id', lead.id)
  }

  return NextResponse.json({
    ok: true,
    lead_id: lead.id,
    ac_synced: acSync.ok,
    ac_warning: acSync.warning,
  })
}
