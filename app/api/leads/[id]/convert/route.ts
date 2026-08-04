// app/api/leads/[id]/convert/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { checkSalesAccess } from '@/lib/auth/sales'

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const { supabase, allowed, reason } = await checkSalesAccess()
  if (!allowed) {
    return reason === 'unauthenticated'
      ? NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
      : NextResponse.json({ error: 'Requires owner or sales role' }, { status: 403 })
  }

  // Get the lead
  const { data: lead, error: leadError } = await supabase
    .from('leads')
    .select('*')
    .eq('id', params.id)
    .single()

  if (leadError || !lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })

  // Build client_id from business name
  const clientId = lead.business_name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

  // Create client
  const { data: client, error: clientError } = await supabase
    .from('clients')
    .insert({
      id: clientId,
      name: lead.business_name,
      status: 'active',
      contact_name: lead.name || null,
      contact_email: lead.email || null,
      phone: lead.phone || null,
      address: lead.location || null,
    })
    .select()
    .single()

  if (clientError) {
    // Client may already exist — try to just link
    const { data: existing } = await supabase.from('clients').select('id').eq('id', clientId).single()
    if (!existing) return NextResponse.json({ error: clientError.message }, { status: 500 })
  }

  // Mark lead as won + converted
  await supabase
    .from('leads')
    .update({
      status: 'won',
      converted_to_client_id: clientId,
      converted_at: new Date().toISOString(),
    })
    .eq('id', params.id)

  return NextResponse.json({ client_id: clientId })
}
