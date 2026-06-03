import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { notifications, wo_title, wo_id } = await req.json() as {
      notifications: { user_id: string; type: 'mention' | 'assignment'; author_name?: string; body_preview?: string }[]
      wo_title: string
      wo_id: string
    }

    if (!notifications?.length) return NextResponse.json({ ok: true, sent: 0 })

    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) return NextResponse.json({ ok: false, error: 'No RESEND_API_KEY' }, { status: 500 })

    // Fetch emails for all recipient user_ids
    const userIds = [...new Set(notifications.map(n => n.user_id))]
    const { data: members, error: memberErr } = await supabaseAdmin
      .from('team_members')
      .select('auth_user_id, name, email')
      .in('auth_user_id', userIds)

    if (memberErr || !members) {
      return NextResponse.json({ ok: false, error: memberErr?.message }, { status: 500 })
    }

    const emailMap = new Map(members.map(m => [m.auth_user_id, { name: m.name, email: m.email }]))
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.abconsultingg.com'

    let sent = 0
    for (const notif of notifications) {
      const recipient = emailMap.get(notif.user_id)
      if (!recipient?.email) continue

      const isMention = notif.type === 'mention'
      const subject = isMention
        ? `${notif.author_name || 'Someone'} mentioned you in a work order`
        : `You've been assigned to a work order`

      const preview = notif.body_preview ? `<p style="color:#555;font-size:14px;border-left:3px solid #b8860b;padding-left:12px;margin:16px 0;">${notif.body_preview}</p>` : ''

      const actionUrl = isMention
        ? `${appUrl}/dashboard/wo/${wo_id}?tab=messages`
        : `${appUrl}/dashboard/wo/${wo_id}`

      const actionLabel = isMention ? 'View Message →' : 'View Work Order →'

      const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f5f0;margin:0;padding:32px 16px;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
    <div style="background:#1a2744;padding:20px 28px;">
      <span style="color:#b8860b;font-weight:700;font-size:16px;">A&amp;B Tracker</span>
    </div>
    <div style="padding:28px;">
      <p style="color:#1a2744;font-size:16px;font-weight:600;margin:0 0 8px;">Hi ${recipient.name},</p>
      <p style="color:#444;font-size:14px;margin:0 0 16px;">
        ${isMention
          ? `<strong>${notif.author_name || 'Someone'}</strong> mentioned you in <strong>${wo_title}</strong>.`
          : `You've been assigned to <strong>${wo_title}</strong>.`
        }
      </p>
      ${preview}
      <a href="${actionUrl}" style="display:inline-block;margin-top:16px;background:#b8860b;color:#1a2744;font-weight:700;font-size:14px;padding:10px 22px;border-radius:6px;text-decoration:none;">${actionLabel}</a>
    </div>
    <div style="padding:16px 28px;border-top:1px solid #eee;">
      <p style="color:#aaa;font-size:11px;margin:0;">A&amp;B Consulting Group · app.abconsultingg.com</p>
    </div>
  </div>
</body>
</html>`

      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'A&B Tracker <notifications@abconsultingg.com>',
          to: recipient.email,
          subject,
          html,
        }),
      })

      if (res.ok) sent++
      else {
        const err = await res.text()
        console.error(`Resend error for ${recipient.email}:`, err)
      }
    }

    return NextResponse.json({ ok: true, sent })
  } catch (e: any) {
    console.error('Notify route error:', e)
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}
