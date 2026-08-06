// app/api/work-orders/[id]/route.ts
// Update a work order and fire notifications for the two changes people care
// about: a stage move and a change of owner.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { notifyWoStageChanged, notifyWoAssigned } from '@/lib/work-order-notify'

// Only these columns may be set through this route.
const UPDATABLE = [
  'title', 'stage', 'owner_id', 'priority', 'due_date', 'notes',
  'flagged', 'est_cost', 'add_cost', 'ad_spend', 'occurrence', 'service_id',
] as const

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: member } = await supabase
    .from('team_members')
    .select('id, name, active')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (!member?.active) {
    return NextResponse.json({ error: 'Active team member required' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const updates: Record<string, unknown> = {}
  for (const key of UPDATABLE) {
    if (key in body) updates[key] = body[key]
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No updatable fields supplied' }, { status: 400 })
  }

  const { data: before, error: beforeError } = await supabase
    .from('work_orders')
    .select('id, stage, owner_id, title')
    .eq('id', params.id)
    .maybeSingle()

  if (beforeError) return NextResponse.json({ error: beforeError.message }, { status: 500 })
  if (!before) return NextResponse.json({ error: 'Work order not found' }, { status: 404 })

  const stageChanged = 'stage' in updates && updates.stage !== before.stage
  const ownerChanged = 'owner_id' in updates && updates.owner_id !== before.owner_id

  // Keep the SLA clock honest — stage age is measured from this column.
  if (stageChanged) updates.stage_entered_at = new Date().toISOString()

  const { data: after, error } = await supabase
    .from('work_orders')
    .update(updates)
    .eq('id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Notifications are best-effort: the update is already committed and must not
  // be reported as failed because a message could not be delivered.
  const notifications: Record<string, unknown> = {}
  try {
    if (stageChanged) {
      notifications.stage = await notifyWoStageChanged(params.id, String(updates.stage))
    }
    if (ownerChanged && updates.owner_id) {
      notifications.owner = await notifyWoAssigned(params.id, { newOwner: String(updates.owner_id) })
    }
  } catch (e) {
    notifications.error = e instanceof Error ? e.message : String(e)
    console.error('[work-orders PATCH] notification failure', e)
  }

  return NextResponse.json({ ok: true, wo: after, stageChanged, ownerChanged, notifications })
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data, error } = await supabase
    .from('work_orders')
    .select('*')
    .eq('id', params.id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Work order not found' }, { status: 404 })
  return NextResponse.json(data)
}
