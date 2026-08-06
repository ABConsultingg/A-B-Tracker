// app/api/leads/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { checkSalesAccess } from '@/lib/auth/sales'
import { syncLeadStage, setContactTag } from '@/lib/activecampaign/pipeline-sync'
import { notifyLeadStageChanged } from '@/lib/lead-notify'

function deny(reason: 'unauthenticated' | 'forbidden' | null) {
  return reason === 'unauthenticated'
    ? NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    : NextResponse.json({ error: 'Requires owner or sales role' }, { status: 403 })
}

function stamp(warning: string) {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date())
  return `[${day}] ⚠ ${warning}`
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { supabase, allowed, reason } = await checkSalesAccess()
  if (!allowed) return deny(reason)

  const body = await req.json()

  // Read prior state so we only sync genuine transitions, and so we know which
  // stale tag to remove if this change clears staleness.
  const { data: before } = await supabase
    .from('leads')
    .select('status, is_stale, stale_tag')
    .eq('id', params.id)
    .maybeSingle()

  const { data, error } = await supabase
    .from('leads')
    .update(body)
    .eq('id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Stage transition -> ActiveCampaign. The stage change itself is already
  // committed; a sync failure is reported, never fatal.
  let acSync = null
  if (before && data.status !== before.status) {
    // The trigger already cleared the stale flag for this stage change; drop the
    // matching AC tag too, since Postgres cannot make HTTP calls.
    if (before.is_stale && before.stale_tag) {
      await setContactTag(data.email, before.stale_tag, 'remove')
    }

    acSync = await syncLeadStage(
      { email: data.email, name: data.name, phone: data.phone, business_name: data.business_name },
      data.status
    )

    // Notify the pipeline watchers of the move. Best-effort.
    try {
      await notifyLeadStageChanged(
        { id: data.id, business_name: data.business_name },
        before.status,
        data.status
      )
    } catch (e) {
      console.error('[leads PATCH] stage notification failed', e)
    }

    if (acSync.warning) {
      const note = stamp(acSync.warning)
      const merged = data.notes ? `${data.notes}\n${note}` : note
      await supabase.from('leads').update({ notes: merged }).eq('id', params.id)
    }

    // Re-read after a stage change. log_lead_stage_change is an AFTER trigger,
    // so the row returned by the UPDATE above still holds the pre-trigger
    // last_activity_at / is_stale — returning it would leave a just-cleared
    // stale badge showing in the UI until a refresh.
    const { data: fresh } = await supabase
      .from('leads')
      .select('*')
      .eq('id', params.id)
      .single()
    if (fresh) return NextResponse.json({ ...fresh, acSync })
  }

  return NextResponse.json(acSync ? { ...data, acSync } : data)
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const { supabase, allowed, reason } = await checkSalesAccess()
  if (!allowed) return deny(reason)

  const { error } = await supabase.from('leads').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
