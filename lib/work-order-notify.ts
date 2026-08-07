// lib/work-order-notify.ts
// Server-side work-order notification dispatch, shared by
// /api/notifications/wo, /api/work-orders/create and /api/work-orders/[id].
//
// WhatsApp Business rejects freeform messages outside the 24h customer-service
// window, so every WhatsApp send goes through an approved Twilio content
// template. sendNotification() always records the in-app notification, and only
// sends WhatsApp when a templateSid is supplied — so an event with no matching
// template still shows up in the bell, just not on WhatsApp.
import { createClient } from '@supabase/supabase-js'
import { sendNotification } from '@/lib/notifications'
import { STAGES } from '@/lib/types'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const T = {
  NEW_SUBMITTED:     process.env.TWILIO_TEMPLATE_NEW_SUBMITTED,
  ASSIGNED_OWNER:    process.env.TWILIO_TEMPLATE_ASSIGNED_OWNER,
  ASSIGNED_ASSIGNEE: process.env.TWILIO_TEMPLATE_ASSIGNED_ASSIGNEE,
  DELIVERABLES_DONE: process.env.TWILIO_TEMPLATE_DELIVERABLES_DONE,
  CLIENT_APPROVED:   process.env.TWILIO_TEMPLATE_CLIENT_APPROVED,
  CLIENT_REVISION:   process.env.TWILIO_TEMPLATE_CLIENT_REVISION,
  READY_TO_BILL:     process.env.TWILIO_TEMPLATE_READY_TO_BILL,
  // Optional: a generic "stage changed" template. There is no approved template
  // for arbitrary stage moves yet, so until this env var exists those moves
  // notify in-app only. Expected variables: 1 title, 2 client, 3 stage, 4 link.
  STAGE_CHANGED:     process.env.TWILIO_TEMPLATE_STAGE_CHANGED,
}

const APP = 'https://app.abconsultingg.com'
const PORTAL = 'https://portal.abconsultingg.com'

type WoContext = {
  id: string
  title: string
  stage: string
  owner_id: string | null
  clientName: string
  clientEmail: string | null
  clientHello: string
  link: string
  portalLink: string
  baseVars: Record<string, string>
}

async function loadWo(woId: string): Promise<WoContext | null> {
  const { data: wo } = await sb
    .from('work_orders')
    .select('id, title, stage, owner_id, clients(id, name, contact_name, contact_email)')
    .eq('id', woId)
    .single()

  if (!wo) return null
  const client = wo.clients as { name?: string; contact_name?: string; contact_email?: string } | null
  const clientName = client?.name ?? 'Client'
  const link = `${APP}/dashboard/wo/${wo.id}`

  return {
    id: wo.id,
    title: wo.title,
    stage: wo.stage,
    owner_id: wo.owner_id ?? null,
    clientName,
    clientEmail: client?.contact_email ?? null,
    clientHello: client?.contact_name ?? 'there',
    link,
    portalLink: `${PORTAL}/work-orders/${wo.id}`,
    baseVars: { '1': wo.title, '2': clientName, '3': link },
  }
}

async function getAssignees(woId: string): Promise<string[]> {
  const { data } = await sb.from('wo_assignees').select('team_member_id').eq('work_order_id', woId)
  return (data ?? []).map(r => r.team_member_id as string)
}

async function clientEmail(subject: string, html: string, to: string) {
  const { Resend } = await import('resend')
  const resend = new Resend(process.env.RESEND_API_KEY!)
  await resend.emails.send({
    from: 'A&B Consulting <notifications@abconsultingg.com>',
    to, subject, html,
  })
}

/** New work order: alert the admin trio, plus the owner and any assignees. */
export async function notifyWoCreated(woId: string) {
  const wo = await loadWo(woId)
  if (!wo) return { ok: false, reason: 'wo not found' }

  const notified: string[] = []

  for (const id of ['adrian', 'tanya', 'montse']) {
    await sendNotification({
      recipientMemberId: id, sourceType: 'wo_created', workOrderId: woId,
      bodyPreview: `New WO: ${wo.title}`, authorName: 'System', linkUrl: wo.link,
      templateSid: T.NEW_SUBMITTED, templateVars: wo.baseVars,
    })
    notified.push(id)
  }

  // The owner and assignees are the people who have to act on it.
  const assignees = await getAssignees(woId)
  if (wo.owner_id && !notified.includes(wo.owner_id)) {
    await sendNotification({
      recipientMemberId: wo.owner_id, sourceType: 'wo_assigned', workOrderId: woId,
      bodyPreview: `You own: ${wo.title}`, authorName: 'System', linkUrl: wo.link,
      templateSid: T.ASSIGNED_OWNER, templateVars: wo.baseVars,
    })
    notified.push(wo.owner_id)
  }
  for (const a of assignees) {
    if (notified.includes(a)) continue
    await sendNotification({
      recipientMemberId: a, sourceType: 'wo_assigned', workOrderId: woId,
      bodyPreview: `You were assigned: ${wo.title}`, authorName: 'System', linkUrl: wo.link,
      templateSid: T.ASSIGNED_ASSIGNEE, templateVars: wo.baseVars,
    })
    notified.push(a)
  }

  return { ok: true, notified }
}

/** Owner and/or assignees changed. */
export async function notifyWoAssigned(
  woId: string,
  { newOwner, addedAssignees = [] }: { newOwner?: string | null; addedAssignees?: string[] }
) {
  const wo = await loadWo(woId)
  if (!wo) return { ok: false, reason: 'wo not found' }

  const notified: string[] = []

  if (newOwner) {
    await sendNotification({
      recipientMemberId: newOwner, sourceType: 'wo_assigned', workOrderId: woId,
      bodyPreview: `You are owner of: ${wo.title}`, authorName: 'System', linkUrl: wo.link,
      templateSid: T.ASSIGNED_OWNER, templateVars: wo.baseVars,
    })
    notified.push(newOwner)
  }
  for (const a of addedAssignees) {
    if (notified.includes(a)) continue
    await sendNotification({
      recipientMemberId: a, sourceType: 'wo_assigned', workOrderId: woId,
      bodyPreview: `You were assigned: ${wo.title}`, authorName: 'System', linkUrl: wo.link,
      templateSid: T.ASSIGNED_ASSIGNEE, templateVars: wo.baseVars,
    })
    notified.push(a)
  }

  return { ok: true, notified }
}

/** Stage moved. Keeps the existing per-stage rules and adds a general alert. */
export async function notifyWoStageChanged(woId: string, newStage: string) {
  const wo = await loadWo(woId)
  if (!wo) return { ok: false, reason: 'wo not found' }

  const stageLabel = STAGES.find(s => s.id === newStage)?.label ?? newStage
  const assignees = await getAssignees(woId)
  const notified: string[] = []

  if (newStage === 'in-progress' && wo.clientEmail) {
    await clientEmail(
      `Your project is now in progress — ${wo.title}`,
      `<p>Hi ${wo.clientHello},</p><p>Your project <strong>${wo.title}</strong> is now in progress!</p><p><a href="${wo.portalLink}">Track it here</a></p><p>— The A&B Team</p>`,
      wo.clientEmail
    )
  }
  if (newStage === 'sent-for-approval' && wo.clientEmail) {
    await clientEmail(
      `Action needed: review your project — ${wo.title}`,
      `<p>Hi ${wo.clientHello},</p><p><strong>${wo.title}</strong> is ready for your review.</p><p><a href="${wo.portalLink}">Approve or request revisions</a></p><p>— The A&B Team</p>`,
      wo.clientEmail
    )
  }
  // These two client emails previously came from the client-side
  // notifyStageChange -> /api/notify path. That call is gone now that all WO
  // mutations route through the API, so they are reproduced here to avoid
  // silently dropping client-facing mail on those stages.
  if (newStage === 'ordered' && wo.clientEmail) {
    await clientEmail(
      `Items have been ordered for "${wo.title}"`,
      `<p>Hi ${wo.clientHello},</p><p>Great news — the items for <strong>${wo.title}</strong> have been ordered and are on their way. We'll notify you once everything is ready.</p><p><a href="${wo.portalLink}">View your project</a></p><p>— The A&B Team</p>`,
      wo.clientEmail
    )
  }
  if (newStage === 'deliverables-executed' && wo.clientEmail) {
    await clientEmail(
      `"${wo.title}" has been delivered`,
      `<p>Hi ${wo.clientHello},</p><p><strong>${wo.title}</strong> has been marked as delivered.</p><p><a href="${wo.portalLink}">View your project</a></p><p>— The A&B Team</p>`,
      wo.clientEmail
    )
  }

  if (newStage === 'deliverables-completed' && wo.owner_id) {
    await sendNotification({
      recipientMemberId: wo.owner_id, sourceType: 'wo_stage', workOrderId: woId,
      bodyPreview: `Deliverables done: ${wo.title}`, authorName: 'System', linkUrl: wo.link,
      templateSid: T.DELIVERABLES_DONE, templateVars: wo.baseVars,
    })
    notified.push(wo.owner_id)
  }
  if (newStage === 'deliverables-executed' || newStage === 'ordered') {
    await sendNotification({
      recipientMemberId: 'adrian', sourceType: 'wo_stage', workOrderId: woId,
      bodyPreview: `Ready to bill: ${wo.title}`, authorName: 'System', linkUrl: wo.link,
      templateSid: T.READY_TO_BILL, templateVars: wo.baseVars,
    })
    notified.push('adrian')
  }

  // Everyone responsible for the WO hears about any stage move. WhatsApp only
  // goes out if a generic stage template is configured; otherwise this is an
  // in-app notification.
  const stageVars = { '1': wo.title, '2': wo.clientName, '3': stageLabel, '4': wo.link }
  for (const id of [wo.owner_id, ...assignees].filter(Boolean) as string[]) {
    if (notified.includes(id)) continue
    await sendNotification({
      recipientMemberId: id, sourceType: 'wo_stage', workOrderId: woId,
      bodyPreview: `${wo.title} moved to ${stageLabel}`, authorName: 'System', linkUrl: wo.link,
      templateSid: T.STAGE_CHANGED, templateVars: T.STAGE_CHANGED ? stageVars : undefined,
    })
    notified.push(id)
  }

  return { ok: true, stage: newStage, stageLabel, notified, whatsappTemplate: Boolean(T.STAGE_CHANGED) }
}

/** Client approved or requested revisions. */
export async function notifyWoClientDecision(woId: string, kind: 'approved' | 'revision') {
  const wo = await loadWo(woId)
  if (!wo) return { ok: false, reason: 'wo not found' }

  const assignees = await getAssignees(woId)
  const recipients = [...new Set([wo.owner_id, ...assignees].filter(Boolean))] as string[]

  for (const id of recipients) {
    await sendNotification({
      recipientMemberId: id, sourceType: 'wo_stage', workOrderId: woId,
      bodyPreview: kind === 'approved' ? `Client approved: ${wo.title}` : `Revision requested: ${wo.title}`,
      authorName: 'System', linkUrl: wo.link,
      templateSid: kind === 'approved' ? T.CLIENT_APPROVED : T.CLIENT_REVISION,
      templateVars: wo.baseVars,
    })
  }

  return { ok: true, notified: recipients }
}
