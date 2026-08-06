// app/api/notify/whatsapp/route.ts
// Sends WhatsApp via the Twilio Content API (ContentSid + ContentVariables).
//
// Raw Body text is NOT supported here on purpose. WhatsApp only accepts freeform
// messages inside the 24-hour customer-service window; outside it Twilio returns
// error 63016 and the message is silently undelivered. Every send must therefore
// use an approved content template.
//
// Templates are addressed by key so callers never hold SIDs. Keys map to the
// TWILIO_TEMPLATE_* env vars; the template bodies take three variables:
//   {{1}} = work order / subject title
//   {{2}} = client name
//   {{3}} = link
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const TEMPLATES: Record<string, string | undefined> = {
  new_submitted:     process.env.TWILIO_TEMPLATE_NEW_SUBMITTED,
  assigned_owner:    process.env.TWILIO_TEMPLATE_ASSIGNED_OWNER,
  assigned_assignee: process.env.TWILIO_TEMPLATE_ASSIGNED_ASSIGNEE,
  deliverables_done: process.env.TWILIO_TEMPLATE_DELIVERABLES_DONE,
  client_approved:   process.env.TWILIO_TEMPLATE_CLIENT_APPROVED,
  client_revision:   process.env.TWILIO_TEMPLATE_CLIENT_REVISION,
  ready_to_bill:     process.env.TWILIO_TEMPLATE_READY_TO_BILL,
  mention:           process.env.TWILIO_TEMPLATE_MENTION,
  dm_received:       process.env.TWILIO_TEMPLATE_DM_RECEIVED,
  client_message:    process.env.TWILIO_TEMPLATE_CLIENT_MESSAGE,
  stage_changed:     process.env.TWILIO_TEMPLATE_STAGE_CHANGED,
}

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

  const { to, template, content_sid, variables } = body as {
    to?: string
    template?: string
    content_sid?: string
    variables?: Record<string, string>
  }

  if (!to) return NextResponse.json({ error: 'to is required' }, { status: 400 })

  const contentSid = content_sid || (template ? TEMPLATES[template] : undefined)
  if (!contentSid) {
    return NextResponse.json(
      {
        error: template
          ? `No content SID configured for template "${template}"`
          : 'template or content_sid is required — freeform WhatsApp bodies are rejected outside the 24h window (Twilio 63016)',
        available_templates: Object.entries(TEMPLATES).filter(([, v]) => v).map(([k]) => k),
      },
      { status: 400 }
    )
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const from = process.env.TWILIO_WHATSAPP_NUMBER || '+17084126025'
  if (!accountSid || !authToken) {
    return NextResponse.json({ error: 'Twilio not configured' }, { status: 500 })
  }

  const waTo = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`
  const waFrom = from.startsWith('whatsapp:') ? from : `whatsapp:${from}`

  const form = new URLSearchParams({
    To: waTo,
    From: waFrom,
    ContentSid: contentSid,
  })
  if (variables && Object.keys(variables).length) {
    form.set('ContentVariables', JSON.stringify(variables))
  }

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    }
  )

  const data = await res.json()
  if (!res.ok) {
    console.error('[notify/whatsapp] Twilio error', data)
    return NextResponse.json(
      { error: data.message, code: data.code, more_info: data.more_info },
      { status: 500 }
    )
  }

  // status is usually "queued" here; delivery failures (63016, 63024) surface
  // later on the message resource, not in this response.
  return NextResponse.json({ ok: true, sid: data.sid, status: data.status })
}
