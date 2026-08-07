// app/api/clients/[id]/ai-services/route.ts
// Per-client AI service toggles.
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

  const updates: Record<string, boolean> = {}
  for (const key of TOGGLES) {
    if (key in body) updates[key] = body[key] === true
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: `Supply at least one of: ${TOGGLES.join(', ')}` },
      { status: 400 }
    )
  }

  const admin = createServiceClient()
  const { data, error } = await admin
    .from('clients')
    .update(updates)
    .eq('id', params.id)
    .select('id, chatbot_enabled, receptionist_enabled, seo_agent_enabled, reputation_mgmt_enabled')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

  return NextResponse.json({ ok: true, client: data })
}
