import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

function prevMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
}

function lastYearMonth(month: string): string {
  const [y, m] = month.split('-')
  return `${Number(y) - 1}-${m}`
}

async function fetchLSAForMonth(supabase: Awaited<ReturnType<typeof createClient>>, month: string) {
  // Try lsa_leads table first (Chrome extension output)
  const { data: leads } = await supabase
    .from('lsa_leads')
    .select('*')
    .eq('client_id', 'culture')
    .eq('lead_month', month)

  if (leads && leads.length > 0) {
    const total = leads.length
    const charged = leads.filter((l: Record<string, unknown>) =>
      String(l.charge_status || '').toLowerCase() === 'charged').length
    const notCharged = leads.filter((l: Record<string, unknown>) =>
      String(l.charge_status || '').toLowerCase().includes('not charged')).length
    const credited = leads.filter((l: Record<string, unknown>) =>
      ['credited', 'in review'].includes(String(l.charge_status || '').toLowerCase())).length
    const phone = leads.filter((l: Record<string, unknown>) =>
      String(l.lead_type || '').toLowerCase() === 'phone').length
    const message = leads.filter((l: Record<string, unknown>) =>
      String(l.lead_type || '').toLowerCase() === 'message').length

    // Job category breakdown
    const catMap: Record<string, number> = {}
    leads.forEach((l: Record<string, unknown>) => {
      const cat = String(l.job_type || l.category || 'Unknown')
      catMap[cat] = (catMap[cat] || 0) + 1
    })
    const categories = Object.entries(catMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8)

    // Fetch LSA spend from report_data
    const { data: spendRow } = await supabase
      .from('report_data').select('value')
      .eq('client_id', 'culture').eq('month', month)
      .eq('section', 'lsa').eq('platform', 'all').eq('metric', 'total_spend')
      .maybeSingle()
    const totalSpend = Number(spendRow?.value || 0)
    const cpl = charged > 0 && totalSpend > 0 ? parseFloat((totalSpend / charged).toFixed(2)) : null

    return {
      total, charged, notCharged, credited,
      chargeRate: total > 0 ? parseFloat(((charged / total) * 100).toFixed(1)) : 0,
      phone, message,
      categories,
      totalSpend,
      cpl,
      source: 'lsa_leads',
    }
  }

  // Fall back to report_data (manually uploaded)
  const { data: rd } = await supabase
    .from('report_data')
    .select('metric, value')
    .eq('client_id', 'culture')
    .eq('month', month)
    .eq('section', 'lsa')

  if (rd && rd.length > 0) {
    const get = (m: string) => rd.find(r => r.metric === m)?.value || 0
    const total = get('total_leads')
    const charged = get('charged_leads')
    return {
      total, charged,
      notCharged: get('not_charged'),
      credited: get('credited'),
      chargeRate: total > 0 ? parseFloat(((charged / total) * 100).toFixed(1)) : 0,
      phone: get('phone_leads'),
      message: get('message_leads'),
      categories: [],
      totalSpend: get('total_spend'),
      cpl: charged > 0 && get('total_spend') > 0 ? parseFloat((get('total_spend') / charged).toFixed(2)) : null,
      source: 'report_data',
    }
  }

  return null
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const clientId = searchParams.get('clientId')
  const month = searchParams.get('month') || new Date().toISOString().slice(0, 7)

  if (clientId !== 'culture') {
    return NextResponse.json({ configured: false, message: 'This endpoint is Culture Construction only' })
  }

  try {
    const supabase = await createClient()
    const pm = prevMonth(month)
    const ly = lastYearMonth(month)

    const [current, prev, lastYear] = await Promise.all([
      fetchLSAForMonth(supabase, month),
      fetchLSAForMonth(supabase, pm),
      fetchLSAForMonth(supabase, ly),
    ])

    return NextResponse.json({
      configured: true,
      clientId,
      month,
      data: current,
      prevData: prev,
      lastYearData: lastYear,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[Culture LSA]', msg)
    return NextResponse.json({ error: msg, configured: true, data: null }, { status: 500 })
  }
}
