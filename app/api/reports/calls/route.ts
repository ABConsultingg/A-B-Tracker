import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const clientId = searchParams.get('clientId')
  const month = searchParams.get('month')
  if (!clientId || !month) return NextResponse.json({ error: 'clientId and month required' }, { status: 400 })

  const supabase = await createClient()

  const { data: calls, error } = await supabase
    .from('cira_calls')
    .select('id, call_date, call_time, caller_name, caller_phone, duration_sec, topic, is_new_lead, is_existing_customer, is_qualified, is_spam, call_summary, how_heard, lsa_matched, appointment_booked, crm_entered, crm_type')
    .eq('client_id', clientId)
    .eq('call_month', month)
    .order('call_date', { ascending: false })
    .order('call_time', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const total = calls?.length || 0
  const newLeads = calls?.filter(c => c.is_new_lead).length || 0
  const qualified = calls?.filter(c => c.is_qualified).length || 0
  const existing = calls?.filter(c => c.is_existing_customer).length || 0
  const spam = calls?.filter(c => c.is_spam).length || 0
  const lsaMatched = calls?.filter(c => c.lsa_matched).length || 0
  const avgDuration = calls?.length ? Math.round(calls.reduce((s, c) => s + (c.duration_sec || 0), 0) / calls.length) : 0

  // Topic breakdown
  const topicMap: Record<string, number> = {}
  calls?.filter(c => !c.is_spam).forEach(c => {
    const t = c.topic || 'General'
    topicMap[t] = (topicMap[t] || 0) + 1
  })
  const topics = Object.entries(topicMap).map(([topic, count]) => ({ topic, count })).sort((a, b) => b.count - a.count).slice(0, 8)

  return NextResponse.json({
    configured: true, clientId, month,
    data: { total, newLeads, qualified, existing, spam, lsaMatched, avgDuration, topics, calls: calls || [] }
  })
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const body = await req.json()
  const { id, appointment_booked, crm_entered } = body
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const update: Record<string, unknown> = {}
  if (appointment_booked !== undefined) update.appointment_booked = appointment_booked
  if (crm_entered !== undefined) update.crm_entered = crm_entered

  const { error } = await supabase.from('cira_calls').update(update).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
