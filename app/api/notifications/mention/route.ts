import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendNotification, getAllActiveTeamIds } from '@/lib/notifications';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const AB_MENTION = /@a&b/i;

export async function POST(req: NextRequest) {
  const { authorId, mentionedIds = [], body, woId } = await req.json();

  const { data: author } = await sb.from('team_members').select('id, name').eq('id', authorId).single();
  const authorName = author?.name ?? 'Someone';
  const snippet = (body ?? '').slice(0, 60).replace(/\n/g, ' ');
  const link = woId
    ? `https://app.abconsultingg.com/dashboard/work-orders/${woId}`
    : `https://app.abconsultingg.com/dashboard/feed`;

  const isBroadcast = AB_MENTION.test(body ?? '');
  let recipientIds: string[];

  if (isBroadcast) {
    recipientIds = await getAllActiveTeamIds(authorId);
  } else {
    const { data: members } = await sb.from('team_members').select('id').in('auth_user_id', mentionedIds);
    recipientIds = (members ?? []).map((m: any) => m.id).filter((id: string) => id !== authorId);
  }

  if (!recipientIds.length) return NextResponse.json({ ok: true, sent: 0 });

  await Promise.all(recipientIds.map((id) =>
    sendNotification({
      recipientMemberId: id,
      sourceType: isBroadcast ? 'broadcast' : 'mention',
      workOrderId: woId ?? undefined,
      bodyPreview: snippet,
      authorName: isBroadcast ? `${authorName} (@a&b)` : authorName,
      linkUrl: link,
      senderId: authorId,
      isBroadcast,
      templateSid: process.env.TWILIO_TEMPLATE_MENTION,
      templateVars: { '1': isBroadcast ? `${authorName} (@a&b)` : authorName, '2': snippet, '3': link },
    })
  ));

  return NextResponse.json({ ok: true, broadcast: isBroadcast, sent: recipientIds.length });
}
