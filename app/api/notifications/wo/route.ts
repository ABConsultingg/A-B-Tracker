import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendNotification } from '@/lib/notifications';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const T = {
  NEW_SUBMITTED:     process.env.TWILIO_TEMPLATE_NEW_SUBMITTED,
  ASSIGNED_OWNER:    process.env.TWILIO_TEMPLATE_ASSIGNED_OWNER,
  ASSIGNED_ASSIGNEE: process.env.TWILIO_TEMPLATE_ASSIGNED_ASSIGNEE,
  DELIVERABLES_DONE: process.env.TWILIO_TEMPLATE_DELIVERABLES_DONE,
  CLIENT_APPROVED:   process.env.TWILIO_TEMPLATE_CLIENT_APPROVED,
  CLIENT_REVISION:   process.env.TWILIO_TEMPLATE_CLIENT_REVISION,
  READY_TO_BILL:     process.env.TWILIO_TEMPLATE_READY_TO_BILL,
};

async function getAssignees(woId: string): Promise<string[]> {
  const { data } = await sb.from('wo_assignees').select('team_member_id').eq('work_order_id', woId);
  return (data ?? []).map((r: any) => r.team_member_id);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { event, woId } = body;

  const { data: wo } = await sb
    .from('work_orders')
    .select('id, title, stage, owner_id, clients(id, name, contact_name, contact_email)')
    .eq('id', woId)
    .single();

  if (!wo) return NextResponse.json({ error: 'WO not found' }, { status: 404 });

  const client     = wo.clients as any;
  const clientName = client?.name ?? 'Client';
  const clientEmail = client?.contact_email ?? null;
  const clientHello = client?.contact_name ?? 'there';
  const title      = wo.title;
  const link       = `https://app.abconsultingg.com/dashboard/work-orders/${wo.id}`;
  const pLink      = `https://portal.abconsultingg.com/work-orders/${wo.id}`;
  const ownerId    = wo.owner_id ?? '';
  const baseVars   = { '1': title, '2': clientName, '3': link };

  if (event === 'wo_created') {
    for (const id of ['adrian', 'tanya', 'montse']) {
      await sendNotification({ recipientMemberId: id, sourceType: 'wo_created', workOrderId: woId, bodyPreview: `New WO: ${title}`, authorName: 'System', linkUrl: link, templateSid: T.NEW_SUBMITTED, templateVars: baseVars });
    }
    return NextResponse.json({ ok: true });
  }

  if (event === 'wo_assigned') {
    const { newOwner, addedAssignees = [] } = body;
    if (newOwner) await sendNotification({ recipientMemberId: newOwner, sourceType: 'wo_assigned', workOrderId: woId, bodyPreview: `You are owner of: ${title}`, authorName: 'System', linkUrl: link, templateSid: T.ASSIGNED_OWNER, templateVars: baseVars });
    for (const a of addedAssignees) {
      if (a === newOwner) continue;
      await sendNotification({ recipientMemberId: a, sourceType: 'wo_assigned', workOrderId: woId, bodyPreview: `You were assigned: ${title}`, authorName: 'System', linkUrl: link, templateSid: T.ASSIGNED_ASSIGNEE, templateVars: baseVars });
    }
    return NextResponse.json({ ok: true });
  }

  if (event === 'stage_changed') {
    const { newStage } = body;
    const assigneeIds = await getAssignees(wo.id);

    if (newStage === 'in-progress' && clientEmail) {
      const { Resend } = await import('resend');
      const resend = new Resend(process.env.RESEND_API_KEY!);
      await resend.emails.send({ from: 'A&B Consulting <notifications@abconsultingg.com>', to: clientEmail, subject: `Your project is now in progress — ${title}`, html: `<p>Hi ${clientHello},</p><p>Your project <strong>${title}</strong> is now in progress!</p><p><a href="${pLink}">Track it here</a></p><p>— The A&B Team</p>` });
    }
    if (newStage === 'deliverables-completed' && ownerId) {
      await sendNotification({ recipientMemberId: ownerId, sourceType: 'wo_stage', workOrderId: woId, bodyPreview: `Deliverables done: ${title}`, authorName: 'System', linkUrl: link, templateSid: T.DELIVERABLES_DONE, templateVars: baseVars });
    }
    if (newStage === 'sent-for-approval' && clientEmail) {
      const { Resend } = await import('resend');
      const resend = new Resend(process.env.RESEND_API_KEY!);
      await resend.emails.send({ from: 'A&B Consulting <notifications@abconsultingg.com>', to: clientEmail, subject: `Action needed: review your project — ${title}`, html: `<p>Hi ${clientHello},</p><p><strong>${title}</strong> is ready for your review.</p><p><a href="${pLink}">Approve or request revisions</a></p><p>— The A&B Team</p>` });
    }
    if (newStage === 'deliverables-executed' || newStage === 'ordered') {
      await sendNotification({ recipientMemberId: 'adrian', sourceType: 'wo_stage', workOrderId: woId, bodyPreview: `Ready to bill: ${title}`, authorName: 'System', linkUrl: link, templateSid: T.READY_TO_BILL, templateVars: baseVars });
    }
    return NextResponse.json({ ok: true, stage: newStage });
  }

  if (event === 'client_approved') {
    const assigneeIds = await getAssignees(wo.id);
    const recipients = [...new Set([ownerId, ...assigneeIds].filter(Boolean))];
    for (const id of recipients) {
      await sendNotification({ recipientMemberId: id, sourceType: 'wo_stage', workOrderId: woId, bodyPreview: `Client approved: ${title}`, authorName: 'System', linkUrl: link, templateSid: T.CLIENT_APPROVED, templateVars: baseVars });
    }
    return NextResponse.json({ ok: true });
  }

  if (event === 'client_revision') {
    const assigneeIds = await getAssignees(wo.id);
    const recipients = [...new Set([ownerId, ...assigneeIds].filter(Boolean))];
    for (const id of recipients) {
      await sendNotification({ recipientMemberId: id, sourceType: 'wo_stage', workOrderId: woId, bodyPreview: `Revision requested: ${title}`, authorName: 'System', linkUrl: link, templateSid: T.CLIENT_REVISION, templateVars: baseVars });
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'unknown event' }, { status: 400 });
}
