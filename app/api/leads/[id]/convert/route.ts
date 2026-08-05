// app/api/leads/[id]/convert/route.ts
// Promote a won lead into a client. Idempotent: if a client already exists at
// the slugified id, the lead is linked to it rather than duplicated.
import { NextRequest, NextResponse } from 'next/server'
import { checkSalesAccess } from '@/lib/auth/sales'

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const { supabase, allowed, reason } = await checkSalesAccess()
  if (!allowed) {
    return reason === 'unauthenticated'
      ? NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
      : NextResponse.json({ error: 'Requires owner or sales role' }, { status: 403 })
  }

  const { data: lead, error: leadError } = await supabase
    .from('leads')
    .select('*')
    .eq('id', params.id)
    .single()

  if (leadError || !lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })

  const clientId = slugify(lead.business_name || '')
  if (!clientId) {
    return NextResponse.json({ error: 'Business name does not produce a usable client id' }, { status: 400 })
  }

  // Prefer the structured address; fall back to the free-text location.
  const streetLine = lead.address_street || null
  const cityLine = [
    [lead.address_city, lead.address_state].filter(Boolean).join(', '),
    lead.address_zip,
  ].filter(Boolean).join(' ')
  const address = [streetLine, cityLine].filter(Boolean).join(' · ') || lead.location || null

  // clients has no website column, so keep it where it stays visible.
  const websiteNote = lead.website ? `Website: ${lead.website}` : null
  const notes = [lead.notes, websiteNote].filter(Boolean).join('\n') || null

  // Check first rather than relying on an insert error to detect duplicates.
  const { data: existing } = await supabase
    .from('clients')
    .select('id, name')
    .eq('id', clientId)
    .maybeSingle()

  let created = false
  if (!existing) {
    const { error: clientError } = await supabase
      .from('clients')
      .insert({
        id: clientId,
        name: lead.business_name,
        status: 'active',
        contact_name: lead.name || null,
        contact_email: lead.email || null,
        contact_phone: lead.phone || null,
        address,
        industry: lead.industry || null,
        notes,
      })
    if (clientError) {
      return NextResponse.json({ error: clientError.message }, { status: 500 })
    }
    created = true
  }

  // Link the lead. status is already 'won' when converting from the UI; setting
  // it here is idempotent. Note the pipeline-won AC tag comes from the stage
  // move itself, not from conversion.
  const { data: updated, error: updateError } = await supabase
    .from('leads')
    .update({
      status: 'won',
      converted_to_client_id: clientId,
      converted_at: new Date().toISOString(),
    })
    .eq('id', params.id)
    .select()
    .single()

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  return NextResponse.json({
    client_id: clientId,
    created,
    linked_existing: !created,
    lead: updated,
  })
}
