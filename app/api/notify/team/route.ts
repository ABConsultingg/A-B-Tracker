// app/api/notify/team/route.ts
// Notify team members by team_members.id.
//
// Two things were wrong before:
//   1. It matched member_ids against auth_user_id, so passing team_members.id
//      found nobody, sent nothing, and still returned 200 {ok:true} — a silent
//      no-op. It now matches on id, and reports per-recipient outcomes.
//   2. It sent a freeform WhatsApp Body, which WhatsApp rejects outside the
//      24-hour window (Twilio 63016). Delivery now goes through
//      sendNotification(), which records the in-app notification and sends
//      WhatsApp only via an approved content template.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendNotification } from '@/lib/notifications'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const TEMPLATES: Record<string, string | undefined> = {
  new_submitted:     process.env.TWILIO_TEMPLATE_NEW_SUBMITTED,
  assigned_owner:    process.env.TWILIO_TEMPLATE_ASSIGNED_OWNER,
  assigned_assignee: process.env.TWILIO_TEMPLATE_ASSIGNED_ASSIGNEE,
  deliverables_done: process.env.TWILIO_TEMPLATE_DELIVERABLES_DONE,
  client_approved:   process.env.TWILIO_TEMPLATE_CLIENT_APPROVED,
  client_revision:   process.env.TWILIO_TEMPLATE_CLIENT_REVISION,
  ready_to_bill:     process.env.TWILIO_TEMPLATE_READY_TO_BILL,
  stage_changed:     process.env.TWILIO_TEMPLATE_STAGE_CHANGED,
}

export async function POST(req: NextRequest) {
  const { member_ids, message, wo_id, wo_title, template, variables } = await req.json()

  if (!message || !Array.isArray(member_ids) || member_ids.length === 0) {
    return NextResponse.json({ error: 'member_ids and message required' }, { status: 400 })
  }

  // Match on team_members.id (e.g. 'valerie'), not auth_user_id.
  const { data: members } = await supabaseAdmin
    .from('team_members')
    .select('id, name, whatsapp_number, notif_whatsapp, active')
    .in('id', member_ids)

  const found = members ?? []
  const missing = member_ids.filter((id: string) => !found.some(m => m.id === id))

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.abconsultingg.com'
  const linkUrl = wo_id ? `${appUrl}/dashboard/wo/${wo_id}` : appUrl
  const contentSid = template ? TEMPLATES[template] : undefined

  const results: Array<Record<string, unknown>> = []

  for (const m of found) {
    if (!m.active) {
      results.push({ member: m.id, inApp: false, whatsapp: 'skipped: inactive' })
      continue
    }

    await sendNotification({
      recipientMemberId: m.id,
      sourceType: 'wo_assigned',
      workOrderId: wo_id ?? undefined,
      bodyPreview: message,
      authorName: 'System',
      linkUrl,
      templateSid: contentSid,
      templateVars: contentSid
        ? (variables ?? { '1': wo_title ?? message, '2': '', '3': linkUrl })
        : undefined,
    })

    // Explain precisely why WhatsApp did or did not go out, instead of a blanket ok.
    const whatsapp = !m.notif_whatsapp
      ? 'skipped: notif_whatsapp off'
      : !m.whatsapp_number
        ? 'skipped: no whatsapp_number'
        : !contentSid
          ? 'skipped: no approved template supplied (freeform is rejected by WhatsApp)'
          : 'sent'

    results.push({ member: m.id, inApp: true, whatsapp })
  }

  return NextResponse.json({
    ok: true,
    requested: member_ids.length,
    delivered_in_app: results.filter(r => r.inApp).length,
    unknown_member_ids: missing,
    results,
  })
}
