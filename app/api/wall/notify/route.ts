import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// POST /api/wall/notify
// Inserts mention notifications into wo_notifications using service role (bypasses RLS).
export async function POST(req: NextRequest) {
  try {
    const { recipients, text, postId, authorName, linkUrl } = await req.json() as {
      recipients: string[]   // auth_user_ids to notify
      text: string
      postId: string
      authorName: string
      linkUrl?: string
    }
    if (!recipients?.length) return NextResponse.json({ ok: true, inserted: 0 })

    const preview = text.length > 140 ? text.slice(0, 140) + '…' : text
    const rows = recipients.map(uid => ({
      user_id: uid,
      source_type: 'standup',
      source_id: postId,
      work_order_id: null,
      body_preview: preview,
      author_name: authorName,
      link_url: linkUrl || '/dashboard/standup',
    }))

    const { error } = await supabaseAdmin.from('wo_notifications').insert(rows)
    if (error) {
      console.error('wall/notify error:', error.message)
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true, inserted: rows.length })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}
