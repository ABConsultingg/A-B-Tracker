// app/api/clients/[id]/brand-profile/route.ts
// Upsert a client's social_brand_profiles row by client_id.
//
// This row is the single source of truth the AI products read from, so it is
// written through a route rather than straight from the browser: the client_id
// key is derived here, the field list is whitelisted, and array columns are
// normalised instead of trusting whatever the form sent.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

// Plain text columns that may be edited from the client card.
const TEXT_FIELDS = [
  'brand_voice', 'what_makes_different', 'key_services', 'service_area',
  'target_audience', 'ideal_customer', 'customer_problem', 'social_proof',
  'awards', 'cta_style', 'topics_to_avoid', 'industry', 'location', 'tagline',
  'known_for', 'one_sentence',
] as const

// text[] columns — the form sends comma-separated strings.
const ARRAY_FIELDS = ['tone_words', 'avoid_words', 'content_pillars'] as const

function toArray(v: unknown): string[] | null {
  if (Array.isArray(v)) {
    const cleaned = v.map(x => String(x).trim()).filter(Boolean)
    return cleaned.length ? cleaned : null
  }
  if (typeof v === 'string') {
    const cleaned = v.split(',').map(s => s.trim()).filter(Boolean)
    return cleaned.length ? cleaned : null
  }
  return null
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: member } = await supabase
    .from('team_members')
    .select('id, role, active')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  // Client management is open to admin, owner and sales — same as the rest of
  // the clients page.
  const allowed =
    member?.active === true && ['admin', 'owner', 'sales'].includes(member.role)
  if (!allowed) {
    return NextResponse.json({ error: 'admin, owner or sales required' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const admin = createServiceClient()

  const { data: client } = await admin
    .from('clients')
    .select('id, name')
    .eq('id', params.id)
    .maybeSingle()
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

  const row: Record<string, unknown> = {
    client_id: client.id,
    // client_name is retained because the social hub, /api/claude/suggest and
    // /api/ppc/build still look profiles up by name.
    client_name: body.client_name?.toString().trim() || client.name,
    updated_at: new Date().toISOString(),
  }
  for (const f of TEXT_FIELDS) {
    if (f in body) {
      const v = body[f]
      row[f] = typeof v === 'string' && v.trim() ? v.trim() : null
    }
  }
  for (const f of ARRAY_FIELDS) {
    if (f in body) row[f] = toArray(body[f])
  }

  // Upsert on client_id — a client may not have a profile yet.
  const { data: existing } = await admin
    .from('social_brand_profiles')
    .select('id')
    .eq('client_id', client.id)
    .maybeSingle()

  let saved
  if (existing?.id) {
    const { data, error } = await admin
      .from('social_brand_profiles')
      .update(row)
      .eq('id', existing.id)
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    saved = data
  } else {
    const { data, error } = await admin
      .from('social_brand_profiles')
      .insert(row)
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    saved = data
  }

  return NextResponse.json({ ok: true, profile: saved })
}
