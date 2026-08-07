// app/api/clients/[id]/ai-services/route.ts
// Per-client AI service toggles and their configuration.
//
// Restricted to admin and owner — narrower than the rest of the clients page,
// which sales can edit. Enabling a service turns on outbound behaviour towards a
// client's own customers (website chat, answered phone calls), so it is kept to
// the people accountable for that.
//
// Written with the service client because the clients update policy is
// is_admin() OR role = 'sales', and is_admin() is admin-only — an OWNER cannot
// update clients directly under RLS.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

const TOGGLES = [
  'chatbot_enabled',
  'receptionist_enabled',
  'seo_agent_enabled',
  'reputation_mgmt_enabled',
] as const

const TONES = ['professional', 'friendly', 'casual']
const AFTER_HOURS = ['voicemail', 'transfer', 'both']
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

const str = (v: unknown, max = 400): string | null => {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t ? t.slice(0, max) : null
}

/** Validate and normalise the receptionist block. Unknown keys are dropped. */
function cleanReceptionist(input: Record<string, unknown>) {
  const out: Record<string, unknown> = {}

  out.name = str(input.name) ?? 'Alex'
  out.tone = TONES.includes(String(input.tone)) ? String(input.tone) : 'professional'
  out.after_hours_behavior = AFTER_HOURS.includes(String(input.after_hours_behavior))
    ? String(input.after_hours_behavior)
    : 'voicemail'

  // [{ name, phone }] — both required, anything else discarded.
  const contacts = Array.isArray(input.transfer_contacts) ? input.transfer_contacts : []
  out.transfer_contacts = contacts
    .map(c => {
      const row = (c ?? {}) as Record<string, unknown>
      const name = str(row.name, 120)
      const phone = str(row.phone, 40)
      return name && phone ? { name, phone } : null
    })
    .filter(Boolean)
    .slice(0, 20)

  // { mon: { open: '08:00', close: '17:00', closed: false }, ... }
  const hoursIn = (input.business_hours ?? {}) as Record<string, unknown>
  const hours: Record<string, unknown> = {}
  for (const d of DAYS) {
    const row = (hoursIn[d] ?? {}) as Record<string, unknown>
    const time = (v: unknown) => (/^\d{2}:\d{2}$/.test(String(v)) ? String(v) : null)
    hours[d] = {
      closed: row.closed === true,
      open: time(row.open) ?? '08:00',
      close: time(row.close) ?? '17:00',
    }
  }
  out.business_hours = hours

  return out
}

/** Validate and normalise the chatbot block. */
function cleanChatbot(input: Record<string, unknown>) {
  const colour = str(input.brand_color, 9)
  return {
    bot_name: str(input.bot_name, 60) ?? 'Assistant',
    greeting: str(input.greeting, 500),
    cta_text: str(input.cta_text, 120),
    brand_color: colour && /^#[0-9a-fA-F]{3,8}$/.test(colour) ? colour : null,
    booking_enabled: input.booking_enabled === true,
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: member } = await supabase
    .from('team_members')
    .select('id, role, active')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (!(member?.active === true && (member.role === 'admin' || member.role === 'owner'))) {
    return NextResponse.json({ error: 'admin or owner required' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const admin = createServiceClient()

  const { data: existing } = await admin
    .from('clients')
    .select('id, ai_service_config')
    .eq('id', params.id)
    .maybeSingle()
  if (!existing) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

  const updates: Record<string, unknown> = {}

  for (const key of TOGGLES) {
    if (key in body) updates[key] = body[key] === true
  }

  // Merge per-service config rather than replacing the whole object, so saving
  // the chatbot panel cannot wipe the receptionist's settings.
  if (body.config && typeof body.config === 'object') {
    const current = (existing.ai_service_config ?? {}) as Record<string, unknown>
    const incoming = body.config as Record<string, unknown>
    const merged: Record<string, unknown> = { ...current }

    if (incoming.receptionist && typeof incoming.receptionist === 'object') {
      merged.receptionist = cleanReceptionist(incoming.receptionist as Record<string, unknown>)
    }
    if (incoming.chatbot && typeof incoming.chatbot === 'object') {
      merged.chatbot = cleanChatbot(incoming.chatbot as Record<string, unknown>)
    }
    updates.ai_service_config = merged
  }

  // The chatbot panel edits the real domain column, not a JSONB copy — this is
  // what the Origin resolver matches against.
  if (Array.isArray(body.website_domain)) {
    const domains = body.website_domain
      .map((d: unknown) =>
        String(d).trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '')
      )
      .filter((d: string) => d.includes('.'))
    updates.website_domain = domains.length ? Array.from(new Set(domains)) : null
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  const { data, error } = await admin
    .from('clients')
    .update(updates)
    .eq('id', params.id)
    .select('id, chatbot_enabled, receptionist_enabled, seo_agent_enabled, reputation_mgmt_enabled, ai_service_config, website_domain')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, client: data })
}
