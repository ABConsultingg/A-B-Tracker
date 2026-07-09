import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendNotification, getAllActiveTeamIds } from '@/lib/notifications';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const AB_MENTION = /@a&b/i;

export async function POST(req: NextRequest) {
  const { memberId, section, channelOrId, body, mentions = [], workOrderId, parentId } = await req.json();

  if (!memberId || !body || !section) {
    return NextResponse.json({ error: 'memberId, section, body required' }, { status: 400 });
  }

  const { data: sender } = await sb.from('team_members')
    .select('id, name, auth_user_id').eq('id', memberId).single();
  if (!sender) return NextResponse.json({ error: 'sender not found' }, { status: 404 });

  const isBroadcast = AB_MENTION.test(body);
  const appBase = 'https://app.abconsultingg.com';

  if (section === 'channel') {
    const { data: post, error } = await sb.from('wall_posts').insert({
      channel: channelOrId,
      author_id: sender.auth_user_id,
      body,
      mentions,
      work_order_id: workOrderId ?? null,
      parent_id: parentId ?? null,
    }).select().single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const link = workOrderId
      ? `${appBase}/dashboard/work-orders/${workOrderId}`
      : `${appBase}/dashboard/feed`;

    let notifyIds: string[] = [];
    if (isBroadcast) {
      notifyIds = await getAllActiveTeamIds(memberId);
    } else if (mentions.length) {
      const { data: mentionedMembers } = await sb.from('team_members').select('id').in('auth_user_id', mentions);
      notifyIds = (mentionedMembers ?? []).map((m: any) => m.id).filter((id: string) => id !== memberId);
    }

    if (workOrderId && !isBroadcast) {
      const { data: wo } = await sb.from('work_orders').select('owner_id').eq('id', workOrderId).single();
      const { data: assignees } = await sb.from('wo_assignees').select('team_member_id').eq('work_order_id', workOrderId);
      const woRecipients = [wo?.owner_id, ...(assignees ?? []).map((a: any) => a.team_member_id)]
        .filter(Boolean).filter((id: string) => id !== memberId && !notifyIds.includes(id));
      notifyIds = [...new Set([...notifyIds, ...woRecipients])];
    }

    await Promise.all(notifyIds.map((id: string) =>
      sendNotification({
        recipientMemberId: id,
        sourceType: isBroadcast ? 'broadcast' : 'mention',
        sourceId: post.id,
        sourceTable: 'wall_posts',
        workOrderId: workOrderId ?? undefined,
        bodyPreview: body.slice(0, 100),
        authorName: isBroadcast ? `${sender.name} (@a&b)` : sender.name,
        linkUrl: link,
        senderId: memberId,
        isBroadcast,
        templateSid: process.env.TWILIO_TEMPLATE_MENTION,
        templateVars: { '1': isBroadcast ? `${sender.name} (@a&b)` : sender.name, '2': body.slice(0, 60), '3': link },
      })
    ));

    // Mirror to wo_comments if WO attached — use service role to bypass RLS
    if (workOrderId) {
      const { error: commentError } = await sb.from('wo_comments').insert({
        work_order_id: workOrderId,
        author_id: sender.auth_user_id,
        body: `💬 [From Feed] ${body}`,
        mentions: mentions.length ? mentions : null,
        internal_only: true,
        author_type: 'team',
      });
      if (commentError) {
        console.error('[feed/post] wo_comments mirror failed:', commentError.message);
      }
    }

    return NextResponse.json({ post });
  }

  if (section === 'dm' || section === 'pancho') {
    const toId = section === 'pancho' ? 'pancho' : channelOrId;
    const { data: dm, error } = await sb.from('direct_messages').insert({
      from_member_id: memberId,
      to_member_id: toId,
      body,
      wo_id: workOrderId ?? null,
    }).select().single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const link = workOrderId
      ? `${appBase}/dashboard/work-orders/${workOrderId}`
      : `${appBase}/dashboard/feed?dm=${memberId}`;

    if (toId !== 'pancho') {
      await sendNotification({
        recipientMemberId: toId,
        sourceType: 'dm',
        sourceId: dm.id,
        sourceTable: 'direct_messages',
        workOrderId: workOrderId ?? undefined,
        bodyPreview: body.slice(0, 100),
        authorName: sender.name,
        linkUrl: link,
        senderId: memberId,
        templateSid: process.env.TWILIO_TEMPLATE_DM_RECEIVED,
        templateVars: { '1': sender.name, '2': body.slice(0, 60), '3': link },
      });
    }

    return NextResponse.json({ dm, needsPanchoResponse: toId === 'pancho' });
  }

  if (section === 'client') {
    const { data: comm, error } = await sb.from('client_comms').insert({
      client_id: channelOrId,
      wo_id: workOrderId ?? null,
      sent_by: sender.name,
      sent_at: new Date().toISOString(),
      channel: 'app',
      body,
      direction: 'outbound',
      read_by: [memberId],
    }).select().single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ comm });
  }

  return NextResponse.json({ error: 'invalid section' }, { status: 400 });
}
