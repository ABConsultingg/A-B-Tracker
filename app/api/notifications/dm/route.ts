import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendNotification } from '@/lib/notifications';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  const { dmId } = await req.json();

  const { data: dm } = await sb
    .from('direct_messages')
    .select('id, from_member_id, to_member_id, body, wo_id')
    .eq('id', dmId)
    .single();

  if (!dm) return NextResponse.json({ error: 'DM not found' }, { status: 404 });
  if (dm.to_member_id === 'pancho') return NextResponse.json({ ok: true, skipped: true });

  const { data: sender } = await sb.from('team_members').select('name').eq('id', dm.from_member_id).single();
  const senderName = sender?.name ?? 'Someone';
  const snippet = (dm.body ?? '').slice(0, 60).replace(/\n/g, ' ');
  const link = dm.wo_id
    ? `https://app.abconsultingg.com/dashboard/work-orders/${dm.wo_id}`
    : `https://app.abconsultingg.com/dashboard/feed?dm=${dm.from_member_id}`;

  await sendNotification({
    recipientMemberId: dm.to_member_id,
    sourceType: 'dm',
    sourceId: dm.id,
    sourceTable: 'direct_messages',
    workOrderId: dm.wo_id ?? undefined,
    bodyPreview: snippet,
    authorName: senderName,
    linkUrl: link,
    senderId: dm.from_member_id,
    templateSid: process.env.TWILIO_TEMPLATE_DM_RECEIVED,
    templateVars: { '1': senderName, '2': snippet, '3': link },
  });

  return NextResponse.json({ ok: true });
}
