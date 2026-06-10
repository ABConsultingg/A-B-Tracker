import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type Notification =
  | { user_id: string; type: 'mention' | 'assignment'; author_name?: string; body_preview?: string }
  | { user_id: string; type: 'stage_change_team'; stage: string; stage_label: string }
  | { client_id: string; type: 'stage_change_client'; stage: string; stage_label: string }

function stageEmail(
  type: 'team' | 'client',
  recipientName: string,
  woTitle: string,
  stageLabel: string,
  actionUrl: string,
  appUrl: string
) {
  const isApproved = stageLabel.toLowerCase().includes('approved')
  const isRevisions = stageLabel.toLowerCase().includes('revision')
  const isDelivered = stageLabel.toLowerCase().includes('executed') || stageLabel.toLowerCase().includes('delivered')
  const isInProgress = stageLabel.toLowerCase().includes('progress')
  const isSentForApproval = stageLabel.toLowerCase().includes('approval')
  const isOrdered = stageLabel.toLowerCase().includes('ordered')

  let emoji = '📋'
  let subject = ''
  let message = ''
  let actionLabel = 'View Work Order →'

  if (type === 'client') {
    if (isOrdered) {
      emoji = '📦'; subject = `Items have been ordered for "${woTitle}"`
      message = `Great news — the items for <strong>${woTitle}</strong> have been ordered and are on their way. We'll notify you once everything is ready.`
    } else if (isSentForApproval) {
      emoji = '👀'; subject = `"${woTitle}" is ready for your review`
      message = `Your team has completed <strong>${woTitle}</strong> and it's ready for your approval.`
      actionLabel = 'Review & Approve →'
    } else if (isDelivered) {
      emoji = '🎉'; subject = `"${woTitle}" has been delivered!`
      message = `Great news — <strong>${woTitle}</strong> has been delivered. Thank you for your partnership!`
    } else {
      subject = `Update on "${woTitle}"`
      message = `There's an update on <strong>${woTitle}</strong>: it has moved to <strong>${stageLabel}</strong>.`
    }
  } else {
    if (isApproved) {
      emoji = '✅'; subject = `"${woTitle}" was approved by the client`
      message = `The client has approved <strong>${woTitle}</strong>. Great work!`
    } else if (isRevisions) {
      emoji = '✎'; subject = `"${woTitle}" has revisions from the client`
      message = `The client has requested revisions on <strong>${woTitle}</strong>. Check the messages for details.`
      actionLabel = 'View Messages →'
    } else if (isDelivered) {
      emoji = '🎉'; subject = `"${woTitle}" has been delivered`
      message = `<strong>${woTitle}</strong> has been marked as delivered.`
    } else {
      subject = `"${woTitle}" moved to ${stageLabel}`
      message = `<strong>${woTitle}</strong> has moved to <strong>${stageLabel}</strong>.`
    }
  }

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f5f0;margin:0;padding:32px 16px;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
    <div style="background:#1a2744;padding:20px 28px;">
      <span style="color:#b8860b;font-weight:700;font-size:16px;">A&amp;B Tracker</span>
    </div>
    <div style="padding:28px;">
      <p style="color:#1a2744;font-size:22px;margin:0 0 12px;">${emoji}</p>
      <p style="color:#1a2744;font-size:16px;font-weight:600;margin:0 0 8px;">Hi ${recipientName},</p>
      <p style="color:#444;font-size:14px;margin:0 0 16px;">${message}</p>
      <a href="${actionUrl}" style="display:inline-block;margin-top:16px;background:#b8860b;color:#1a2744;font-weight:700;font-size:14px;padding:10px 22px;border-radius:6px;text-decoration:none;">${actionLabel}</a>
    </div>
    <div style="padding:16px 28px;border-top:1px solid #eee;">
      <p style="color:#aaa;font-size:11px;margin:0;">A&amp;B Consulting Group · app.abconsultingg.com</p>
    </div>
  </div>
</body>
</html>`

  return { subject, html }
}

async function sendSms(to: string, body: string) {
  const sid = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  const from = process.env.TWILIO_FROM_NUMBER
  if (!sid || !token || !from) return
  if (!to.startsWith('+1')) return // US only for now
  try {
    await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: to, From: from, Body: body }).toString(),
    })
  } catch (e) {
    console.error('SMS error:', e)
  }
}

export async function POST(req: NextRequest) {
  try {
    const { notifications, wo_title, wo_id, sender_name } = await req.json() as {
      notifications: Notification[]
      wo_title: string
      wo_id: string
      sender_name?: string
    }

    if (!notifications?.length) return NextResponse.json({ ok: true, sent: 0 })

    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) return NextResponse.json({ ok: false, error: 'No RESEND_API_KEY' }, { status: 500 })

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.abconsultingg.com'
    const woUrl = `${appUrl}/dashboard/wo/${wo_id}`
    const portalWoUrl = `${appUrl}/portal/wo/${wo_id}`

    // Collect team user_ids
    const teamUserIds = notifications
      .filter(n => 'user_id' in n)
      .map(n => (n as any).user_id as string)
    const uniqueTeamIds = [...new Set(teamUserIds)]

    // Collect client_ids
    const clientIds = notifications
      .filter(n => n.type === 'stage_change_client')
      .map(n => (n as any).client_id as string)
    const uniqueClientIds = [...new Set(clientIds)]

    // Fetch team member emails
    const emailMap = new Map<string, { name: string; email: string; phone?: string | null }>()
    if (uniqueTeamIds.length) {
      const { data: members } = await supabaseAdmin
        .from('team_members')
        .select('auth_user_id, name, email, phone')
        .in('auth_user_id', uniqueTeamIds)
      ;(members || []).forEach((m: any) => {
        if (m.auth_user_id) emailMap.set(m.auth_user_id, { name: m.name, email: m.email, phone: m.phone || null })
      })
    }

    // Fetch client contact emails
    const clientEmailMap = new Map<string, { name: string; email: string }>()
    if (uniqueClientIds.length) {
      const { data: clientRows } = await supabaseAdmin
        .from('clients')
        .select('id, name, contact_name, contact_email')
        .in('id', uniqueClientIds)
      ;(clientRows || []).forEach((c: any) => {
        if (c.contact_email) {
          clientEmailMap.set(c.id, { name: c.contact_name || c.name, email: c.contact_email })
        }
      })
    }

    let sent = 0

    for (const notif of notifications) {
      let recipientEmail: string | undefined
      let recipientName: string | undefined
      let subject: string
      let html: string

      if (notif.type === 'mention' || notif.type === 'assignment') {
        const n = notif as { user_id: string; type: string; author_name?: string; body_preview?: string }
        const recipient = emailMap.get(n.user_id)
        if (!recipient?.email) continue
        recipientEmail = recipient.email
        recipientName = recipient.name

        const isMention = notif.type === 'mention'
        subject = isMention
          ? `${n.author_name || 'Someone'} mentioned you in a work order`
          : `You've been assigned to a work order`
        const preview = n.body_preview ? `<p style="color:#555;font-size:14px;border-left:3px solid #b8860b;padding-left:12px;margin:16px 0;">${n.body_preview}</p>` : ''
        const actionUrl = isMention ? `${woUrl}?tab=messages` : woUrl
        const actionLabel = isMention ? 'View Message →' : 'View Work Order →'
        html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f5f0;margin:0;padding:32px 16px;"><div style="max-width:520px;margin:0 auto;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);"><div style="background:#1a2744;padding:20px 28px;"><span style="color:#b8860b;font-weight:700;font-size:16px;">A&amp;B Tracker</span></div><div style="padding:28px;"><p style="color:#1a2744;font-size:16px;font-weight:600;margin:0 0 8px;">Hi ${recipientName},</p><p style="color:#444;font-size:14px;margin:0 0 16px;">${isMention ? `<strong>${n.author_name || 'Someone'}</strong> mentioned you in <strong>${wo_title}</strong>.` : `You've been assigned to <strong>${wo_title}</strong>.`}</p>${preview}<a href="${actionUrl}" style="display:inline-block;margin-top:16px;background:#b8860b;color:#1a2744;font-weight:700;font-size:14px;padding:10px 22px;border-radius:6px;text-decoration:none;">${actionLabel}</a></div><div style="padding:16px 28px;border-top:1px solid #eee;"><p style="color:#aaa;font-size:11px;margin:0;">A&amp;B Consulting Group · app.abconsultingg.com</p></div></div></body></html>`

      } else if (notif.type === 'stage_change_team') {
        const n = notif as { user_id: string; type: string; stage: string; stage_label: string }
        const recipient = emailMap.get(n.user_id)
        if (!recipient?.email) continue
        recipientEmail = recipient.email
        recipientName = recipient.name
        const result = stageEmail('team', recipient.name, wo_title, n.stage_label, woUrl, appUrl)
        subject = result.subject; html = result.html

      } else if (notif.type === 'stage_change_client') {
        const n = notif as { client_id: string; type: string; stage: string; stage_label: string }
        const recipient = clientEmailMap.get(n.client_id)
        if (!recipient?.email) continue
        recipientEmail = recipient.email
        recipientName = recipient.name
        const result = stageEmail('client', recipient.name, wo_title, n.stage_label, portalWoUrl, appUrl)
        subject = result.subject; html = result.html

      } else {
        continue
      }

      if (!recipientEmail) continue

      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: sender_name ? `${sender_name} at A&B <notifications@abconsultingg.com>` : 'A&B Tracker <notifications@abconsultingg.com>',
          to: recipientEmail,
          subject,
          html,
        }),
      })

      if (res.ok) {
        sent++
        // Also send SMS for US numbers
        const member = recipientEmail ? [...emailMap.values()].find(m => m.email === recipientEmail) : null
        if (member?.phone) await sendSms(member.phone, `A&B Tracker: ${subject}`)
      } else {
        const err = await res.text()
        console.error(`Resend error for ${recipientEmail}:`, err)
      }
    }

    return NextResponse.json({ ok: true, sent })
  } catch (e: any) {
    console.error('Notify route error:', e)
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}
