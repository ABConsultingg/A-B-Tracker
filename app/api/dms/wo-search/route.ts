import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  const q = new URL(req.url).searchParams.get('q') ?? ''
  if (q.length < 2) return NextResponse.json({ results: [] })

  const { data, error } = await supabaseAdmin
    .from('work_orders')
    .select('id, title, clients!work_orders_client_id_fkey(name)')
    .ilike('title', `%${q}%`)
    .not('stage', 'in', '(archived,paid)')
    .order('created_at', { ascending: false })
    .limit(8)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const results = (data ?? []).map((wo: any) => ({
    id: wo.id,
    title: wo.title,
    client: wo.clients?.name ?? '',
  }))

  return NextResponse.json({ results })
}
