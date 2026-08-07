// app/api/portal/chat-inbox/route.ts
// Status triage for a client's chatbot sessions.
//
// Portal users intentionally have SELECT-only RLS on chatbot_sessions. RLS
// cannot restrict which columns an update touches, so granting them UPDATE
// would let a portal user rewrite transcript or lead_email through the REST
// API. This route verifies ownership itself and writes nothing but status.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

const ALLOWED = ['new', 'contacted', 'not_a_lead']

export async function PATCH(req: NextRequest) {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: pu } = await supabase
    .from('portal_users')
    .select('client_id, active')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (!pu || pu.active === false) {
    return NextResponse.json({ error: 'Portal access required' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  const id = typeof body?.id === 'string' ? body.id : ''
  const status = typeof body?.status === 'string' ? body.status : ''

  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  if (!ALLOWED.includes(status)) {
    return NextResponse.json({ error: `status must be one of ${ALLOWED.join(', ')}` }, { status: 400 })
  }

  // Read through the user-scoped client so the RLS policy decides whether this
  // session belongs to them — the authorisation check and the read use the same
  // rule rather than a second copy of it.
  const { data: owned } = await supabase
    .from('chatbot_sessions')
    .select('id')
    .eq('id', id)
    .maybeSingle()

  if (!owned) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

  // Service client for the write: portal users have no UPDATE policy by design.
  const admin = createServiceClient()
  const { data, error } = await admin
    .from('chatbot_sessions')
    .update({ status })
    .eq('id', id)
    .select('id, status')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, session: data })
}
