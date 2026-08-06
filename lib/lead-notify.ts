// lib/lead-notify.ts
// Sales-pipeline notifications for Adrian and Valerie, addressed by
// team_members.id — never auth_user_id.
//
// Channel split is driven by each member's own flags, not hardcoded:
//   notif_whatsapp + whatsapp_number -> WhatsApp (via approved content template)
//   notif_sms       + phone          -> SMS      (same content template, SMS channel)
// Today that means Adrian gets both and Valerie gets SMS only, because her
// number has no WhatsApp.
//
// Both channels send the SAME Twilio content template — never freeform text.
// WhatsApp rejects freeform outside the 24h window (63016), and using one
// template per event keeps the wording identical across channels.
import { createClient } from '@supabase/supabase-js'
import { sendNotification } from '@/lib/notifications'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const T = {
  LEAD_CREATED:       process.env.TWILIO_TEMPLATE_LEAD_CREATED,
  LEAD_STAGE_CHANGED: process.env.TWILIO_TEMPLATE_LEAD_STAGE_CHANGED,
  LEAD_CONVERTED:     process.env.TWILIO_TEMPLATE_LEAD_CONVERTED,
}

// Who watches the pipeline.
const RECIPIENTS = ['adrian', 'valerie']

const PIPELINE_URL = 'https://app.abconsultingg.com/pipeline'

// Stage ids -> the labels used on the board, so messages read the way the UI does.
const STAGE_LABELS: Record<string, string> = {
  'new': 'New',
  'contacted': 'Contacted',
  'discovery': 'Discovery',
  'proposal': 'Proposal',
  'contract-sent': 'Contract Sent',
  'won': 'Won',
  'lost': 'Lost',
  'disqualified': 'Disqualified',
}
export const stageLabel = (s: string | null | undefined) =>
  s ? (STAGE_LABELS[s] ?? s) : 'Unknown'

type Member = {
  id: string
  name: string | null
  phone: string | null
  whatsapp_number: string | null
  notif_whatsapp: boolean | null
  notif_sms: boolean | null
  active: boolean | null
}

/** WhatsApp through the business number, using an approved content template. */
async function sendWhatsApp(to: string, contentSid: string, vars: Record<string, string>) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const from = process.env.TWILIO_WHATSAPP_NUMBER || '+17084126025'
  if (!accountSid || !authToken) return { ok: false, detail: 'Twilio not configured' }

  const form = new URLSearchParams({
    To: to.startsWith('whatsapp:') ? to : `whatsapp:${to}`,
    From: from.startsWith('whatsapp:') ? from : `whatsapp:${from}`,
    ContentSid: contentSid,
    ContentVariables: JSON.stringify(vars),
  })
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    { method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString() }
  )
  const data = await res.json()
  if (!res.ok) {
    console.error('[lead-notify] WhatsApp failed', data.code, data.message)
    return { ok: false, detail: `${data.code}: ${data.message}` }
  }
  return { ok: true, sid: data.sid }
}

/** SMS through the messaging service, using the same content template. */
async function sendSms(to: string, contentSid: string, vars: Record<string, string>) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const service = process.env.TWILIO_MESSAGING_SERVICE_SID
  if (!accountSid || !authToken || !service) {
    return { ok: false, detail: 'Twilio SMS not configured' }
  }

  const form = new URLSearchParams({
    To: to,
    MessagingServiceSid: service,
    ContentSid: contentSid,
    ContentVariables: JSON.stringify(vars),
  })

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
    // 30034 here means the A2P 10DLC campaign is still unregistered.
    console.error('[lead-notify] SMS failed', data.code, data.message)
    return { ok: false, detail: `${data.code}: ${data.message}` }
  }
  return { ok: true, sid: data.sid, status: data.status }
}

async function fanOut(
  templateSid: string | undefined,
  templateVars: Record<string, string>,
  bodyPreview: string,
  sourceType: 'lead_created' | 'lead_stage' | 'lead_converted',
  leadId: string
) {
  const { data } = await sb
    .from('team_members')
    .select('id, name, phone, whatsapp_number, notif_whatsapp, notif_sms, active')
    .in('id', RECIPIENTS)

  const members = (data ?? []) as Member[]
  const results: Array<Record<string, unknown>> = []

  for (const m of members) {
    if (!m.active) {
      results.push({ member: m.id, skipped: 'inactive' })
      continue
    }

    // In-app always; WhatsApp only when the member is set up for it.
    await sendNotification({
      recipientMemberId: m.id,
      sourceType,
      sourceId: leadId,
      sourceTable: 'leads',
      bodyPreview,
      authorName: 'Pipeline',
      linkUrl: PIPELINE_URL,
      templateSid,
      templateVars: templateSid ? templateVars : undefined,
    })

    const whatsapp = !m.notif_whatsapp
      ? 'skipped: notif_whatsapp off'
      : !m.whatsapp_number
        ? 'skipped: no whatsapp_number'
        : !templateSid
          ? 'skipped: template not configured'
          : 'sent'

    let sms: string
    if (!m.notif_sms) sms = 'skipped: notif_sms off'
    else if (!m.phone) sms = 'skipped: no phone'
    else if (!templateSid) sms = 'skipped: template not configured'
    else {
      const r = await sendSms(m.phone, templateSid, templateVars)
      sms = r.ok ? `queued ${r.sid}` : `failed ${r.detail}`
    }

    results.push({ member: m.id, inApp: true, whatsapp, sms })
  }

  return { ok: true, recipients: results }
}

/**
 * WhatsApp/SMS only — no in-app row.
 *
 * Used by the outbox worker for lead_created, because
 * trg_notify_on_lead_insert has already written the in-app notification
 * inside the database. Writing it again here would double it in the bell.
 */
export async function sendLeadCreatedChannels(payload: {
  business_name: string
  source: string
  score: string
}) {
  const templateSid = T.LEAD_CREATED
  const vars = {
    '1': payload.business_name || 'Unnamed business',
    '2': payload.source || 'unknown',
    '3': payload.score || 'n/a',
    '4': PIPELINE_URL,
  }

  const { data } = await sb
    .from('team_members')
    .select('id, name, phone, whatsapp_number, notif_whatsapp, notif_sms, active')
    .in('id', RECIPIENTS)

  const results: Array<Record<string, unknown>> = []
  for (const m of (data ?? []) as Member[]) {
    if (!m.active) { results.push({ member: m.id, skipped: 'inactive' }); continue }

    let whatsapp = 'skipped'
    if (!m.notif_whatsapp) whatsapp = 'skipped: notif_whatsapp off'
    else if (!m.whatsapp_number) whatsapp = 'skipped: no whatsapp_number'
    else if (!templateSid) whatsapp = 'skipped: template not configured'
    else {
      const r = await sendWhatsApp(m.whatsapp_number, templateSid, vars)
      whatsapp = r.ok ? `queued ${r.sid}` : `failed ${r.detail}`
    }

    let sms = 'skipped'
    if (!m.notif_sms) sms = 'skipped: notif_sms off'
    else if (!m.phone) sms = 'skipped: no phone'
    else if (!templateSid) sms = 'skipped: template not configured'
    else {
      const r = await sendSms(m.phone, templateSid, vars)
      sms = r.ok ? `queued ${r.sid}` : `failed ${r.detail}`
    }

    results.push({ member: m.id, whatsapp, sms })
  }
  return { ok: true, recipients: results }
}

export async function notifyLeadStageChanged(
  lead: { id: string; business_name: string },
  fromStage: string | null,
  toStage: string
) {
  return fanOut(
    T.LEAD_STAGE_CHANGED,
    {
      '1': lead.business_name || 'Unnamed business',
      '2': stageLabel(fromStage),
      '3': stageLabel(toStage),
      '4': PIPELINE_URL,
    },
    `${lead.business_name}: ${stageLabel(fromStage)} → ${stageLabel(toStage)}`,
    'lead_stage',
    lead.id
  )
}

export async function notifyLeadConverted(
  lead: { id: string; business_name: string },
  clientId: string
) {
  return fanOut(
    T.LEAD_CONVERTED,
    {
      '1': lead.business_name || 'Unnamed business',
      '2': clientId,
      '3': PIPELINE_URL,
    },
    `Converted to client: ${lead.business_name} (${clientId})`,
    'lead_converted',
    lead.id
  )
}
