import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

// Admin-only route for managing client portal logins.
// All privileged operations use the service-role key (server-only).
// The caller MUST be an authenticated admin team member — verified below.

type Action = 'create' | 'reset' | 'revoke' | 'restore'

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Server is missing Supabase admin credentials.')
  return createAdminClient(url, key, { auth: { persistSession: false } })
}

export async function POST(req: Request) {
  // 1) Verify caller is an authenticated ADMIN team member.
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })

  const { data: member } = await supabase
    .from('team_members')
    .select('id, role, active')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (!member || member.active === false || member.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required.' }, { status: 403 })
  }

  // 2) Parse + dispatch.
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid body.' }, { status: 400 }) }
  const action = body?.action as Action

  const db = admin()

  try {
    if (action === 'create') {
      const clientId = String(body.clientId || '').trim()
      const email = String(body.email || '').trim().toLowerCase()
      const name = String(body.name || '').trim()
      const password = String(body.password || '')
      if (!clientId || !email || !name) return NextResponse.json({ error: 'clientId, email, and name are required.' }, { status: 400 })
      if (password.length < 8) return NextResponse.json({ error: 'Temporary password must be at least 8 characters.' }, { status: 400 })

      // Guard: one active login per client (v1 keeps it simple).
      const { data: existing } = await db
        .from('portal_users')
        .select('id, auth_user_id, active')
        .eq('client_id', clientId)
        .maybeSingle()
      if (existing) return NextResponse.json({ error: 'A portal login already exists for this client.' }, { status: 409 })

      // Create the auth user (Supabase hashes the password). email_confirm so they can log in immediately.
      const { data: created, error: cErr } = await db.auth.admin.createUser({
        email, password, email_confirm: true,
      })
      if (cErr || !created?.user) {
        const msg = cErr?.message || 'Could not create the auth user.'
        const status = /already.*registered|exists/i.test(msg) ? 409 : 400
        return NextResponse.json({ error: msg }, { status })
      }

      const authUserId = created.user.id
      const { data: row, error: iErr } = await db
        .from('portal_users')
        .insert({ client_id: clientId, name, email, role: 'viewer', auth_user_id: authUserId, active: true })
        .select('id, client_id, name, email, role, auth_user_id, active, last_login_at')
        .single()

      if (iErr || !row) {
        // Roll back the auth user so we don't orphan it.
        await db.auth.admin.deleteUser(authUserId).catch(() => {})
        return NextResponse.json({ error: iErr?.message || 'Could not link the portal user.' }, { status: 400 })
      }
      return NextResponse.json({ ok: true, portalUser: row })
    }

    if (action === 'reset') {
      const authUserId = String(body.authUserId || '')
      const password = String(body.password || '')
      if (!authUserId) return NextResponse.json({ error: 'authUserId is required.' }, { status: 400 })
      if (password.length < 8) return NextResponse.json({ error: 'New password must be at least 8 characters.' }, { status: 400 })
      const { error } = await db.auth.admin.updateUserById(authUserId, { password })
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      return NextResponse.json({ ok: true })
    }

    if (action === 'revoke' || action === 'restore') {
      const id = String(body.id || '')
      if (!id) return NextResponse.json({ error: 'id is required.' }, { status: 400 })
      const active = action === 'restore'
      const { data: row, error } = await db
        .from('portal_users')
        .update({ active })
        .eq('id', id)
        .select('id, client_id, name, email, role, auth_user_id, active, last_login_at')
        .single()
      if (error || !row) return NextResponse.json({ error: error?.message || 'Update failed.' }, { status: 400 })
      return NextResponse.json({ ok: true, portalUser: row })
    }

    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error.' }, { status: 500 })
  }
}
