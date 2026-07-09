import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import twilio from 'twilio';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const tw = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!);
const FROM = 'whatsapp:+17084126025';
const MX_TEAM = ['caro', 'luciana', 'majo', 'montse', 'pau', 'stacia'];

const MSG = `✅ Time for your daily checkout!\n\nPlease share in the app:\n• What did you finish today?\n• Any challenges or blockers?\n\nhttps://app.abconsultingg.com/dashboard/feed`;

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: members } = await sb
    .from('team_members')
    .select('id, name, whatsapp_number, notif_whatsapp')
    .in('id', MX_TEAM)
    .eq('notif_whatsapp', true);

  const results = await Promise.allSettled(
    (members ?? []).map(async (m: any) => {
      const to = m.whatsapp_number.startsWith('whatsapp:') ? m.whatsapp_number : `whatsapp:${m.whatsapp_number}`;
      return tw.messages.create({ from: FROM, to, body: MSG });
    })
  );

  await sb.from('wall_posts').insert({
    channel: 'checkout',
    author_id: 'a0000000-0000-0000-0000-000000000001',
    body: `✅ Mexico team checkout time!\n\nCaro, Luciana, Majo, Montse, Pau, Stacia — please share:\n• What did you finish today?\n• Any challenges or blockers?`,
    mentions: [],
  });

  const sent = results.filter(r => r.status === 'fulfilled').length;
  const failed = results.filter(r => r.status === 'rejected').length;
  return NextResponse.json({ ok: true, sent, failed });
}
