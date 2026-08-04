// app/api/leads/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { checkSalesAccess } from '@/lib/auth/sales'

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
      status: 'new',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
