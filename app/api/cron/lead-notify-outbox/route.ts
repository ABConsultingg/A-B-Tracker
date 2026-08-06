// app/api/cron/lead-notify-outbox/route.ts
// Drains lead_notification_outbox, which trg_notify_on_lead_insert fills for
// every lead insert regardless of source (Cira trigger, /api/leads,
// /api/leads/inbound, assessment auto-insert, raw SQL).
//
// This worker exists because Postgres cannot call Twilio: pg_net and http are
// not installed, and the credentials are Vercel env vars. The trigger writes the
// in-app notification itself and queues the outbound leg here.
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { sendLeadCreatedChannels } from '@/lib/lead-notify'

const MAX_PER_RUN = 25
const MAX_ATTEMPTS = 3

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sb = createServiceClient()

  const { data: rows, error } = await sb
    .from('lead_notification_outbox')
    .select('id, lead_id, event, payload, attempts')
    .is('sent_at', null)
    .lt('attempts', MAX_ATTEMPTS)
    .order('created_at', { ascending: true })
    .limit(MAX_PER_RUN)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const processed: Array<Record<string, unknown>> = []

  for (const row of rows ?? []) {
    const p = (row.payload ?? {}) as Record<string, string>
    try {
      const result = await sendLeadCreatedChannels({
        business_name: p.business_name ?? 'Unnamed business',
        source: p.source ?? 'unknown',
        score: p.score ?? 'n/a',
      })
      await sb
        .from('lead_notification_outbox')
        .update({ sent_at: new Date().toISOString(), attempts: row.attempts + 1, last_error: null })
        .eq('id', row.id)
      processed.push({ id: row.id, business: p.business_name, result: result.recipients })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      // Leave sent_at null so it retries, up to MAX_ATTEMPTS.
      await sb
        .from('lead_notification_outbox')
        .update({ attempts: row.attempts + 1, last_error: msg })
        .eq('id', row.id)
      processed.push({ id: row.id, error: msg, attempt: row.attempts + 1 })
    }
  }

  const { count: remaining } = await sb
    .from('lead_notification_outbox')
    .select('id', { count: 'exact', head: true })
    .is('sent_at', null)
    .lt('attempts', MAX_ATTEMPTS)

  return NextResponse.json({ ok: true, drained: processed.length, remaining: remaining ?? 0, processed })
}
