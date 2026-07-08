import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const client_name = searchParams.get('client_name')
  const month = searchParams.get('month')

  if (!client_name || !month) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('social_monthly_mix')
    .select('*')
    .eq('client_name', client_name)
    .eq('month', month)
    .order('slot', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { action, row, id } = body

  if (action === 'upsert') {
    if (id) {
      const { error } = await supabase.from('social_monthly_mix').update(row).eq('id', id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    } else {
      const { data, error } = await supabase.from('social_monthly_mix').insert(row).select().single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ data })
    }
  }

  if (action === 'delete') {
    const { error } = await supabase.from('social_monthly_mix').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
