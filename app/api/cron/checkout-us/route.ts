import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import twilio from 'twilio';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const tw = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!);
const FROM = 'whatsapp:+17084126025';
const US_TEAM = ['adrian', 'tanya', 'emily'];

// Cron fires outside any 24h customer-service window, so freeform bodies get
// rejected with 63016. Everything here goes out as an approved content template.
const TEMPLATE = process.env.TWILIO_TEMPLATE_CHECKOUT;
const FEED_URL = 'https://app.abconsultingg.com/dashboard/feed';

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: members } = await sb
    .from('team_members')
    .select('id, name, whatsapp_number, notif_whatsapp')
    .in('id', US_TEAM)
    .eq('notif_whatsapp', true);

  const recipients = (members ?? []).filter((m: any) => m.whatsapp_number);

  const results = TEMPLATE
    ? await Promise.allSettled(
        recipients.map(async (m: any) => {
          const to = m.whatsapp_number.startsWith('whatsapp:') ? m.whatsapp_number : `whatsapp:${m.whatsapp_number}`;
          return tw.messages.create({
            from: FROM,
            to,
            contentSid: TEMPLATE,
            contentVariables: JSON.stringify({ '1': m.name || m.id, '2': FEED_URL }),
          });
        })
      )
    : [];

  if (!TEMPLATE) console.error('[cron/checkout-us] TWILIO_TEMPLATE_CHECKOUT not set — no WhatsApp sent');
  for (const r of results) {
    if (r.status === 'rejected') console.error('[cron/checkout-us] WhatsApp failed:', r.reason);
  }

  await sb.from('wall_posts').insert({
    channel: 'checkout',
    author_id: 'a0000000-0000-0000-0000-000000000001',
    body: `✅ US team checkout time!\n\nAdrian, Tanya, Emily — please share:\n• What did you finish today?\n• Any challenges or blockers?`,
    mentions: [],
  });

  const sent = results.filter(r => r.status === 'fulfilled').length;
  const failed = results.filter(r => r.status === 'rejected').length;
  return NextResponse.json({ ok: true, sent, failed, template: TEMPLATE ? 'configured' : 'missing' });
}
