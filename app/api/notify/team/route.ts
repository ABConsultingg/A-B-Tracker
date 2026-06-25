import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdmin } from '@supabase/supabase-js'

const supabaseAdmin = createAdmin(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const { member_ids, message, wo_id, wo_title } = await req.json()
  if (!message || !member_ids?.length) return NextResponse.json({ error: 'member_ids and message required' }, { status: 400 })

  const { data: members } = await supabaseAdmin
    .from('team_members')
    .select('id, name, phone, whatsapp_number, notif_whatsapp, auth_user_id')
    .in('auth_user_id', member_ids)

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.abconsultingg.com'
  const woLink = wo_id ? `\n\n${appUrl}/dashboard/wo/${wo_id}` : ''
  const fullMessage = message + woLink

  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const from = process.env.TWILIO_WHATSAPP_NUMBER || '+17084126025'

  if (!accountSid || !authToken) {
    console.error('Twilio not configured')
    return NextResponse.json({ error: 'Twilio not configured' }, { status: 500 })
  }

  const results: any[] = []

  for (const member of (members || [])) {
    // Use whatsapp_number if set, otherwise fall back to phone
    const waTo = member.whatsapp_number || member.phone
    if (!waTo) { results.push({ member: member.name, ok: false, reason: 'no number' }); continue }

    try {
      const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`
      const body = new URLSearchParams({
        To: `whatsapp:${waTo}`,
        From: `whatsapp:${from}`,
        Body: fullMessage,
      })
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      })
      const data = await res.json()
      if (!res.ok) console.error('Twilio WA error for', member.name, data)
      results.push({ member: member.name, ok: res.ok, sid: data.sid, error: data.message })
    } catch (e) {
      results.push({ member: member.name, ok: false, error: String(e) })
    }
  }

  return NextResponse.json({ ok: true, results })
}
