// app/api/leads/[id]/events/route.ts
// Stage-change timeline for one lead, written by the trg_log_lead_stage_change
// trigger on public.leads.
import { NextRequest, NextResponse } from 'next/server'
import { checkSalesAccess } from '@/lib/auth/sales'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { supabase, allowed, reason } = await checkSalesAccess()
  if (!allowed) {
    return reason === 'unauthenticated'
      ? NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
      : NextResponse.json({ error: 'Requires owner or sales role' }, { status: 403 })
  }

  const { data, error } = await supabase
    .from('lead_stage_events')
    .select('id, from_status, to_status, changed_at')
    .eq('lead_id', params.id)
    .order('changed_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
