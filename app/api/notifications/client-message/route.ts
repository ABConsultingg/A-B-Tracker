import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendNotification } from '@/lib/notifications';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  const { commId } = await req.json();

  const { data: comm } = await sb
    .from('client_comms')
    .select('id, client_id, wo_id, body, direction, clients(name)')
    .eq('id', commId)
    .single();

  if (!comm) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (comm.direction !== 'inbound') return NextResponse.json({ ok: true, skipped: true });

  const clientName = (comm.clients as any)?.name ?? 'Client';
  const snippet = (comm.body ?? '').slice(0, 60).replace(/\n/g, ' ');

  let recipientIds: string[] = [];

  if (comm.wo_id) {
    const { data: wo } = await sb.from('work_orders').select('owner_id').eq('id', comm.wo_id).single();
    const { data: assignees } = await sb.from('wo_assignees').select('team_member_id').eq('work_order_id', comm.wo_id);
    const ownerIds = wo?.owner_id ? [wo.owner_id] : [];
    const assigneeIds = (assignees ?? []).map((a: any) => a.team_member_id);
    recipientIds = [...new Set([...ownerIds, ...assigneeIds])];
  } else {
    recipientIds = ['adrian'];
  }

  const link = comm.wo_id
    ? `https://app.abconsultingg.com/dashboard/work-orders/${comm.wo_id}`
    : `https://app.abconsultingg.com/dashboard/feed?client=${comm.client_id}`;

  await Promise.all(recipientIds.map((id) =>
    sendNotification({
      recipientMemberId: id,
      sourceType: 'client_message',
      workOrderId: comm.wo_id ?? undefined,
      bodyPreview: snippet,
      authorName: clientName,
      linkUrl: link,
      templateSid: process.env.TWILIO_TEMPLATE_CLIENT_MESSAGE,
      templateVars: { '1': clientName, '2': comm.wo_id ?? 'General', '3': snippet, '4': link },
    })
  ));

  return NextResponse.json({ ok: true, notified: recipientIds });
}
