// app/api/leads/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { checkSalesAccess } from '@/lib/auth/sales'
import { syncLeadStage, warningNote } from '@/lib/activecampaign/pipeline-sync'


function deny(reason: 'unauthenticated' | 'forbidden' | null) {
  return reason === 'unauthenticated'
    ? NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    : NextResponse.json({ error: 'Requires owner or sales role' }, { status: 403 })
}

export async function GET() {
  const { supabase, allowed, reason } = await checkSalesAccess()
  if (!allowed) return deny(reason)

  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const { supabase, allowed, reason } = await checkSalesAccess()
  if (!allowed) return deny(reason)

  const body = await req.json()

  const { data, error } = await supabase
    .from('leads')
    .insert({
      business_name: body.business_name,
      name: body.name || null,
      email: body.email || null,
      phone: body.phone || null,
      website: body.website || null,
      industry: body.industry || null,
      location: body.location || null,
      source: body.source || 'manual',
      estimated_value: body.estimated_value ? Number(body.estimated_value) : null,
      notes: body.notes || null,
      priority: body.priority || 'medium',
      assigned_to: body.assigned_to || null,
      next_action: body.next_action || null,
      next_action_date: body.next_action_date || null,
      contact_title: body.contact_title || null,
      secondary_contact_name: body.secondary_contact_name || null,
      secondary_contact_email: body.secondary_contact_email || null,
      secondary_contact_phone: body.secondary_contact_phone || null,
      address_street: body.address_street || null,
      address_city: body.address_city || null,
      address_state: body.address_state || null,
      address_zip: body.address_zip || null,
      referral_source_detail: body.referral_source_detail || null,
      lead_type: body.lead_type || null,
      status: 'new',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // New leads are created at status 'new', which is never a transition, so the
  // PATCH-based sync would never fire for them. Send pipeline-new here — it is
  // the trigger for the "New Lead Introduction" automation.
  const acSync = await syncLeadStage(
    { email: data.email, name: data.name, phone: data.phone, business_name: data.business_name },
    'new'
  )

  // No lead-created notification here on purpose. trg_notify_on_lead_insert
  // fires for every insert into leads, so notifying here as well would send
  // twice for leads added through this route. The trigger writes the in-app
  // notification immediately and queues WhatsApp/SMS for the outbox worker.

  if (acSync.warning) {
    const merged = data.notes
      ? `${data.notes}\n${warningNote(acSync.warning)}`
      : warningNote(acSync.warning)
    const { data: withNote } = await supabase
      .from('leads')
      .update({ notes: merged })
      .eq('id', data.id)
      .select()
      .single()
    if (withNote) return NextResponse.json({ ...withNote, acSync })
  }

  return NextResponse.json({ ...data, acSync })
}
