// app/api/leads/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { checkSalesAccess } from '@/lib/auth/sales'
import { syncLeadStage } from '@/lib/activecampaign/pipeline-sync'

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

  // Read the prior status so we only sync genuine transitions.
  const { data: before } = await supabase
    .from('leads')
    .select('status')
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
    acSync = await syncLeadStage(
      { email: data.email, name: data.name, phone: data.phone, business_name: data.business_name },
      data.status
    )

    if (acSync.warning) {
      const note = stamp(acSync.warning)
      const merged = data.notes ? `${data.notes}\n${note}` : note
      const { data: withNote } = await supabase
        .from('leads')
        .update({ notes: merged })
        .eq('id', params.id)
        .select()
        .single()
      if (withNote) return NextResponse.json({ ...withNote, acSync })
    }
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
