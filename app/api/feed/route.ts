import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function resolveMember(memberId: string) {
  const { data } = await sb.from('team_members')
    .select('id, name, auth_user_id')
    .eq('id', memberId).single();
  return data;
}

export async function GET(req: NextRequest) {
  const p = new URL(req.url).searchParams;
  const memberId = p.get('memberId');
  const section  = p.get('section');
  const id       = p.get('id');
  const limit    = parseInt(p.get('limit') ?? '50');
  const before   = p.get('before');

  if (!memberId) return NextResponse.json({ error: 'memberId required' }, { status: 400 });
  const member = await resolveMember(memberId);
  if (!member) return NextResponse.json({ error: 'member not found' }, { status: 404 });

  if (section === 'sidebar') {
    const { data: notifs } = await sb.from('wo_notifications')
      .select('source_type, read_at')
      .eq('user_id', member.auth_user_id)
      .is('read_at', null);

    const { data: dmsSent } = await sb.from('direct_messages')
      .select('from_member_id, to_member_id, body, created_at, read_at')
      .eq('from_member_id', memberId).order('created_at', { ascending: false });

    const { data: dmsReceived } = await sb.from('direct_messages')
      .select('from_member_id, to_member_id, body, created_at, read_at')
      .eq('to_member_id', memberId).order('created_at', { ascending: false });

    const threadMap = new Map<string, any>();
    const unreadMap = new Map<string, number>();

    for (const dm of [...(dmsSent ?? []), ...(dmsReceived ?? [])]) {
      const partner = dm.from_member_id === memberId ? dm.to_member_id : dm.from_member_id;
      if (!threadMap.has(partner) || new Date(dm.created_at) > new Date(threadMap.get(partner).created_at)) {
        threadMap.set(partner, dm);
      }
      if (dm.to_member_id === memberId && !dm.read_at) {
        unreadMap.set(partner, (unreadMap.get(partner) ?? 0) + 1);
      }
    }

    const { data: allMembers } = await sb.from('team_members').select('id, name').eq('active', true);
    const memberMap = Object.fromEntries((allMembers ?? []).map((m: any) => [m.id, m.name]));

    const dmThreads = Array.from(threadMap.entries()).map(([partnerId, last]) => ({
      partnerId,
      partnerName: memberMap[partnerId] ?? partnerId,
      isPancho: partnerId === 'pancho',
      lastMessage: last.body?.slice(0, 80) ?? '',
      lastAt: last.created_at,
      unread: unreadMap.get(partnerId) ?? 0,
    })).sort((a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime());

    const { data: clientComms } = await sb.from('client_comms')
      .select('client_id, body, direction, created_at, read_by')
      .order('created_at', { ascending: false });

    const clientThreadMap = new Map<string, any>();
    const clientUnreadMap = new Map<string, number>();

    for (const cc of clientComms ?? []) {
      if (!clientThreadMap.has(cc.client_id)) clientThreadMap.set(cc.client_id, cc);
      if (cc.direction === 'inbound' && !(cc.read_by ?? []).includes(memberId)) {
        clientUnreadMap.set(cc.client_id, (clientUnreadMap.get(cc.client_id) ?? 0) + 1);
      }
    }

    const { data: clients } = await sb.from('clients').select('id, name').order('name');

    const clientThreads = (clients ?? []).map((c: any) => ({
      clientId: c.id,
      clientName: c.name,
      lastMessage: clientThreadMap.get(c.id)?.body?.slice(0, 80) ?? null,
      lastAt: clientThreadMap.get(c.id)?.created_at ?? null,
      unread: clientUnreadMap.get(c.id) ?? 0,
    }));

    const CHANNELS = ['general','standup','checkout','design','social','web','ads'];

    return NextResponse.json({
      channels: CHANNELS,
      dmThreads,
      clientThreads,
      unreadTotal: (notifs ?? []).length
        + Array.from(unreadMap.values()).reduce((a, b) => a + b, 0)
        + Array.from(clientUnreadMap.values()).reduce((a, b) => a + b, 0),
    });
  }

  if (section === 'channel' && id) {
    let q = sb.from('wall_posts')
      .select('id, channel, body, mentions, work_order_id, parent_id, attachment_url, attachment_type, created_at, author_id')
      .eq('channel', id)
      .is('dm_to', null)
      .is('client_id', null)
      .is('parent_id', null)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (before) q = q.lt('created_at', before);
    const { data: posts } = await q;

    const postIds = (posts ?? []).map((p: any) => p.id);
    const { data: replies } = postIds.length
      ? await sb.from('wall_posts').select('id, parent_id, body, mentions, work_order_id, created_at, author_id').in('parent_id', postIds).order('created_at', { ascending: true })
      : { data: [] };

    const { data: members } = await sb.from('team_members').select('auth_user_id, id, name');
    const authToMember = Object.fromEntries((members ?? []).map((m: any) => [m.auth_user_id, { id: m.id, name: m.name }]));

    const enrich = (p: any) => ({
      ...p,
      authorName: authToMember[p.author_id]?.name ?? 'Unknown',
      authorMemberId: authToMember[p.author_id]?.id ?? null,
    });

    const replyMap = new Map<string, any[]>();
    for (const r of replies ?? []) {
      if (!replyMap.has(r.parent_id)) replyMap.set(r.parent_id, []);
      replyMap.get(r.parent_id)!.push(enrich(r));
    }

    const enrichedPosts = (posts ?? []).map((p: any) => ({ ...enrich(p), replies: replyMap.get(p.id) ?? [] })).reverse();
    return NextResponse.json({ messages: enrichedPosts });
  }

  if (section === 'dm' && id) {
    const { data: messages } = await sb.from('direct_messages')
      .select('*')
      .or(`and(from_member_id.eq.${memberId},to_member_id.eq.${id}),and(from_member_id.eq.${id},to_member_id.eq.${memberId})`)
      .order('created_at', { ascending: true })
      .limit(limit);

    await sb.from('direct_messages')
      .update({ read_at: new Date().toISOString() })
      .eq('to_member_id', memberId)
      .eq('from_member_id', id)
      .is('read_at', null);

    return NextResponse.json({ messages: messages ?? [], isPancho: id === 'pancho' });
  }

  if (section === 'client' && id) {
    let q = sb.from('client_comms')
      .select('*, clients(name, contact_name, contact_email)')
      .eq('client_id', id)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (before) q = q.lt('created_at', before);
    const { data: comms } = await q;

    const unreadIds = (comms ?? [])
      .filter((c: any) => c.direction === 'inbound' && !(c.read_by ?? []).includes(memberId))
      .map((c: any) => c.id);
    if (unreadIds.length) {
      await sb.rpc('mark_client_comms_read', { comm_ids: unreadIds, reader_id: memberId });
    }

    return NextResponse.json({ messages: (comms ?? []).reverse() });
  }

  return NextResponse.json({ error: 'invalid section' }, { status: 400 });
}
