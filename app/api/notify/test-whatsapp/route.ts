import { NextRequest, NextResponse } from 'next/server'

// GET /api/notify/test-whatsapp?to=+16304084078
// Sends a test WhatsApp to the given number and returns the raw Twilio response.
// Delete this route once WhatsApp is confirmed working.
export async function GET(req: NextRequest) {
  const to = new URL(req.url).searchParams.get('to') || '+16304084078'

  const sid = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  const from = process.env.TWILIO_WHATSAPP_NUMBER || process.env.TWILIO_FROM_NUMBER

  if (!sid || !token || !from) {
    return NextResponse.json({
      error: 'Missing env vars',
      TWILIO_ACCOUNT_SID: !!sid,
      TWILIO_AUTH_TOKEN: !!token,
      TWILIO_WHATSAPP_NUMBER: !!process.env.TWILIO_WHATSAPP_NUMBER,
      TWILIO_FROM_NUMBER: !!process.env.TWILIO_FROM_NUMBER,
    })
  }

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        To: `whatsapp:${to}`,
        From: `whatsapp:${from}`,
        Body: '✅ A&B Tracker WhatsApp test — notifications are working!',
      }).toString(),
    }
  )

  const data = await res.json()
  return NextResponse.json({
    ok: res.ok,
    status: res.status,
    from: `whatsapp:${from}`,
    to: `whatsapp:${to}`,
    twilio: data,
  })
}
