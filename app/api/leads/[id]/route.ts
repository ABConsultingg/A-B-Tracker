// app/api/leads/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { checkSalesAccess } from '@/lib/auth/sales'

function deny(reason: 'unauthenticated' | 'forbidden' | null) {
  return reason === 'unauthenticated'
    ? NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    : NextResponse.json({ error: 'Requires owner or sales role' }, { status: 403 })
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { supabase, allowed, reason } = await checkSalesAccess()
  if (!allowed) return deny(reason)

  const body = await req.json()

  const { data, error } = await supabase
    .from('leads')
    .update(body)
    .eq('id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const { supabase, allowed, reason } = await checkSalesAccess()
  if (!allowed) return deny(reason)

  const { error } = await supabase.from('leads').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
