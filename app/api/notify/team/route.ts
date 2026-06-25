import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdmin } from '@supabase/supabase-js'

const supabaseAdmin = createAdmin(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// US team members (SMS)
const US_TEAM = ['adrian', 'tanya', 'montse']
// Mexico team members (WhatsApp)  
const MX_TEAM = ['emily', 'majo', 'luciana', 'caro', 'pau', 'stacia']

export async function POST(req: NextRequest) {
  const { member_ids, message, wo_id, wo_title } = await req.json()
  if (!message || !member_ids?.length) return NextResponse.json({ error: 'member_ids and message required' }, { status: 400 })

  // Get team members with their phone/whatsapp numbers and prefs
  const { data: members } = await supabaseAdmin
    .from('team_members')
    .select('id, name, phone, whatsapp_number, notif_sms, notif_whatsapp, auth_user_id')
    .in('auth_user_id', member_ids)

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.abconsultingg.com'
  const woLink = wo_id ? `\n\n${appUrl}/dashboard/wo/${wo_id}` : ''
  const fullMessage = message + woLink

  const results: any[] = []

  for (const member of (members || [])) {
    // SMS for US team
    if (US_TEAM.includes(member.id) && member.phone && member.notif_sms !== false) {
      try {
        const res = await fetch(`${appUrl}/api/notify/sms`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-internal': 'true' },
          body: JSON.stringify({ to: member.phone, message: fullMessage }),
        })
        const data = await res.json()
        results.push({ member: member.name, channel: 'sms', ok: res.ok, sid: data.sid })
      } catch (e) { results.push({ member: member.name, channel: 'sms', ok: false }) }
    }

    // WhatsApp for Mexico team
    if (MX_TEAM.includes(member.id) && member.whatsapp_number && member.notif_whatsapp === true) {
      try {
        const res = await fetch(`${appUrl}/api/notify/whatsapp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-internal': 'true' },
          body: JSON.stringify({ to: member.whatsapp_number, message: fullMessage }),
        })
        const data = await res.json()
        results.push({ member: member.name, channel: 'whatsapp', ok: res.ok, sid: data.sid })
      } catch (e) { results.push({ member: member.name, channel: 'whatsapp', ok: false }) }
    }
  }

  return NextResponse.json({ ok: true, results })
}
