import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Windsor Google Ads account map
const WINDSOR_ACCOUNTS: Record<string, string[]> = {
  'a-b-consulting-group':         ['322-970-4937'],
  'apollo-events':                ['393-171-0754'],
  'culture':                      ['618-975-6542', '468-650-8437'],
  'rbs':                          ['484-689-6100'],
  'midwest-constrcution-experts': ['157-596-0991'],
  'mvp-chiro':                    ['896-510-0450'],
  'affiliated-control':           ['985-466-7547'],
  'kbc':                          ['432-640-3511'],
  'nico-roofing':                 ['284-714-0647'],
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const clientId = searchParams.get('clientId') || 'all'

  // ── 1. Meta data from report_data (all months available) ──────────────
  const metaQuery = supabase
    .from('report_data')
    .select('client_id, month, metric, value')
    .eq('section', 'meta')
    .order('month')

  if (clientId !== 'all') metaQuery.eq('client_id', clientId)

  const { data: metaRows, error: metaErr } = await metaQuery
  if (metaErr) console.error('meta query error:', metaErr)

  // Group meta rows into PerfRow objects
  const metaMap: Record<string, {
    client_id: string; month: string; platform: string
    spend: number; impressions: number; clicks: number; video_views: number
  }> = {}

  for (const r of metaRows ?? []) {
    const key = `${r.client_id}__${r.month}__meta`
    if (!metaMap[key]) {
      metaMap[key] = { client_id: r.client_id, month: r.month, platform: 'meta', spend: 0, impressions: 0, clicks: 0, video_views: 0 }
    }
    const v = parseFloat(r.value) || 0
    if (r.metric === 'meta_spend')       metaMap[key].spend       += v
    if (r.metric === 'meta_impressions') metaMap[key].impressions += v
    if (r.metric === 'meta_clicks')      metaMap[key].clicks      += v
    if (r.metric === 'meta_video_views') metaMap[key].video_views += v
  }

  // ── 2. Google Ads via Windsor (last 6 months) ─────────────────────────
  type PerfRow = { client_id: string; month: string; platform: string; spend: number; impressions: number; clicks: number; video_views: number }
  const googleRows: PerfRow[] = []

  const apiKey = process.env.WINDSOR_API_KEY
  const clientsToFetch = clientId === 'all'
    ? Object.entries(WINDSOR_ACCOUNTS)
    : Object.entries(WINDSOR_ACCOUNTS).filter(([id]) => id === clientId)

  if (apiKey && clientsToFetch.length) {
    // Fetch last 6 months
    const months: string[] = []
    const now = new Date()
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    }

    await Promise.all(clientsToFetch.map(async ([cid, accountIds]) => {
      await Promise.all(months.map(async (month) => {
        try {
          const [year, mon] = month.split('-').map(Number)
          const pad = (n: number) => String(n).padStart(2, '0')
          const dateFrom = `${year}-${pad(mon)}-01`
          const dateTo = `${year}-${pad(mon)}-${new Date(year, mon, 0).getDate()}`

          const params = new URLSearchParams({
            api_key: apiKey,
            date_from: dateFrom,
            date_to: dateTo,
            fields: 'impressions,clicks,spend',
            select_accounts: accountIds.map(id => `google_ads__${id}`).join(','),
          })

          const res = await fetch(`https://connectors.windsor.ai/all?${params}`)
          if (!res.ok) return

          const rows = ((await res.json()).data || []) as Record<string, unknown>[]
          if (!rows.length) return

          const n = (v: unknown) => Number(v) || 0
          const totals = rows.reduce((a: { impressions: number; clicks: number; spend: number }, r) => ({
            impressions: a.impressions + n(r.impressions),
            clicks: a.clicks + n(r.clicks),
            spend: a.spend + n(r.spend),
          }), { impressions: 0, clicks: 0, spend: 0 })

          if (totals.spend > 0 || totals.clicks > 0) {
            googleRows.push({ client_id: cid, month, platform: 'google_search', spend: totals.spend, impressions: totals.impressions, clicks: totals.clicks, video_views: 0 })
          }
        } catch { /* skip failed months */ }
      }))
    }))
  }

  // ── 3. Fetch client names ─────────────────────────────────────────────
  const { data: clients } = await supabase.from('clients').select('id, name').eq('status', 'active')
  const nameMap: Record<string, string> = {}
  for (const c of clients ?? []) nameMap[c.id] = c.name

  // Combine all rows with client names
  const allRows = [
    ...Object.values(metaMap),
    ...googleRows,
  ].map(r => ({ ...r, client_name: nameMap[r.client_id] || r.client_id }))

  return NextResponse.json({ rows: allRows })
}
