import { createClient } from '@supabase/supabase-js';
import twilio from 'twilio';
import { Resend } from 'resend';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
const tw = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!);
const resend = new Resend(process.env.RESEND_API_KEY!);
const FROM_WA = 'whatsapp:+17084126025';

export type NotifSourceType =
  | 'dm' | 'mention' | 'broadcast' | 'client_message'
  | 'wo_created' | 'wo_assigned' | 'wo_stage'
  | 'comment' | 'standup' | 'social_content';

export interface NotifPayload {
  recipientMemberId: string;
  sourceType: NotifSourceType;
  sourceId?: string;
  sourceTable?: string;
  workOrderId?: string;
  bodyPreview: string;
  authorName: string;
  linkUrl: string;
  senderId?: string;
  isBroadcast?: boolean;
  templateSid?: string;
  templateVars?: Record<string, string>;
  emailSubject?: string;
  emailHtml?: string;
}

export async function sendNotification(p: NotifPayload): Promise<void> {
  const { data: member } = await supabase
    .from('team_members')
    .select('auth_user_id, whatsapp_number, notif_whatsapp, email')
    .eq('id', p.recipientMemberId)
    .single();

  if (!member) return;

  if (member.auth_user_id) {
    await supabase.from('wo_notifications').insert({
      user_id: member.auth_user_id,
      source_type: p.sourceType,
      source_id: p.sourceId ?? null,
      source_table: p.sourceTable ?? null,
      work_order_id: p.workOrderId ?? null,
      body_preview: p.bodyPreview,
      author_name: p.authorName,
      link_url: p.linkUrl,
      sender_id: p.senderId ?? null,
      is_broadcast: p.isBroadcast ?? false,
      read_at: null,
    });
  }

  if (member.notif_whatsapp && member.whatsapp_number && p.templateSid && p.templateVars) {
    const to = member.whatsapp_number.startsWith('whatsapp:')
      ? member.whatsapp_number : `whatsapp:${member.whatsapp_number}`;
    try {
      await tw.messages.create({
        from: FROM_WA, to,
        contentSid: p.templateSid,
        contentVariables: JSON.stringify(p.templateVars),
      });
    } catch (err) {
      console.error(`[notify] WhatsApp failed for ${p.recipientMemberId}:`, err);
    }
  }

  if (p.emailSubject && p.emailHtml && member.email) {
    try {
      await resend.emails.send({
        from: 'A&B Consulting <notifications@abconsultingg.com>',
        to: member.email,
        subject: p.emailSubject,
        html: p.emailHtml,
      });
    } catch (err) {
      console.error(`[notify] Email failed for ${p.recipientMemberId}:`, err);
    }
  }
}

export async function sendNotifications(payloads: NotifPayload[]): Promise<void> {
  await Promise.all(payloads.map(sendNotification));
}

export async function getAllActiveTeamIds(excludeId?: string): Promise<string[]> {
  const { data } = await supabase
    .from('team_members')
    .select('id')
    .eq('active', true)
    .neq('id', 'pancho');
  const ids = (data ?? []).map((r: any) => r.id as string);
  return excludeId ? ids.filter((id) => id !== excludeId) : ids;
}
