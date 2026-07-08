import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const { dm_id, member_id, emoji = '👍' } = await req.json()
  if (!dm_id || !member_id) return NextResponse.json({ error: 'Missing params' }, { status: 400 })

  // Check if reaction already exists
  const { data: existing } = await supabaseAdmin
    .from('dm_reactions')
    .select('id')
    .eq('dm_id', dm_id)
    .eq('member_id', member_id)
    .eq('emoji', emoji)
    .maybeSingle()

  if (existing) {
    await supabaseAdmin.from('dm_reactions').delete().eq('id', existing.id)
    return NextResponse.json({ action: 'removed' })
  } else {
    await supabaseAdmin.from('dm_reactions').insert({ dm_id, member_id, emoji })
    return NextResponse.json({ action: 'added' })
  }
}
