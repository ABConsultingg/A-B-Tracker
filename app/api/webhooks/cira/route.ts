import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// POST /api/webhooks/cira
// Receives real-time call events from Cira (app.hicira.com)
// Configure in Cira → Integrations → Webhooks → Add
// URL: https://app.abconsultingg.com/api/webhooks/cira?client=culture


function parseDurationSec(s: string | undefined): number {
  if (!s) return 0
  const m = s.match(/(\d+)m/)
  const sec = s.match(/(\d+)s/)
  return (m ? parseInt(m[1]) * 60 : 0) + (sec ? parseInt(sec[1]) : 0)
}

function cleanPhone(s: string | undefined): string {
  return (s || '').replace(/\D/g, '').slice(-10)
}

function classifyCall(summary: string, durationSec: number): {
  is_spam: boolean
  is_new_lead: boolean
  is_existing_customer: boolean
  is_qualified: boolean
  topic: string
} {
  const s = (summary || '').toLowerCase()

  if (
    s.includes('never responded') ||
    s.includes('greeted but never') ||
    durationSec < 10
  ) {
    return { is_spam: true, is_new_lead: false, is_existing_customer: false, is_qualified: false, topic: 'No response' }
  }

  const existingKw = ['existing', 'already', 'previously', 'follow up', 'follow-up', 'status update', 'warranty', 'invoice', 'payment', 'work order', 'schedule', 'cancel', 'appointment', 'permit']
  const leadKw = ['estimate', 'quote', 'inspection', 'replace', 'install', 'repair', 'damage', 'storm', 'hail', 'roof', 'deck', 'siding', 'window', 'remodel', 'addition', 'build', 'concrete', 'exterior', 'patio']

  const isExisting = existingKw.some(k => s.includes(k))
  const isNew = leadKw.some(k => s.includes(k)) && !isExisting
  const isQualified = isNew && durationSec >= 60

  const topicMap: [string, string[]][] = [
    ['Storm/Hail damage',   ['storm', 'hail', 'wind damage', 'tornado']],
    ['Roof replacement',    ['roof replacement', 'new roof']],
    ['Roof repair',         ['roof repair', 'roof damage', 'shingle', 'leak']],
    ['Deck/Patio',          ['deck', 'patio', 'pergola']],
    ['Siding',              ['siding', 'efis', 'dryvit', 'hardy', 'exterior finish']],
    ['Windows/Doors',       ['window', 'door']],
    ['Remodel',             ['remodel', 'renovation', 'kitchen', 'bathroom', 'basement']],
    ['Addition',            ['addition', 'room addition', 'expand']],
    ['Concrete',            ['concrete', 'foundation', 'driveway', 'paver']],
    ['Accessory building',  ['garage', 'shed']],
    ['Insurance claim',     ['insurance', 'adjuster', 'supplement', 'claim', 'state farm']],
    ['Existing customer',   existingKw.slice(0, 4)],
    ['Vendor/Spam',         ['looking for work', 'offer.*services', 'contractor seeking']],
  ]

  let topic = 'General'
  for (const [t, kws] of topicMap) {
    if (kws.some(k => new RegExp(k).test(s))) { topic = t; break }
  }

  return { is_spam: false, is_new_lead: isNew, is_existing_customer: isExisting, is_qualified: isQualified, topic }
}

export async function POST(req: NextRequest) {
  try {
    const CLIENT_ID = new URL(req.url).searchParams.get('client') || 'culture'
    const body = await req.json().catch(() => null)

    if (!body) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    // Log raw payload to help identify Cira's field names on first receipt
    console.log('[Cira Webhook] Raw payload:', JSON.stringify(body).slice(0, 500))

    const supabase = await createClient()

    // ── Parse Cira payload ──────────────────────────────────────────────────
    // Cira likely sends fields like: date, time, name, phone, duration, summary
    // Field names normalized from common patterns (update after first real payload)
    const raw = body as Record<string, unknown>

    const dateStr    = String(raw.date || raw.call_date || raw.created_at || '').slice(0, 10)
    const timeStr    = String(raw.time || raw.call_time || '')
    const callerName = String(raw.name || raw.caller_name || raw.contact_name || '') || null
    const callerPhone = cleanPhone(String(raw.phone || raw.caller_phone || raw.phone_number || raw.from || ''))
    const durationRaw = String(raw.duration || raw.call_duration || '')
    const durationSec = parseDurationSec(durationRaw) || Number(raw.duration_seconds || raw.duration_sec || 0)
    const summary    = String(raw.call_summary || raw.summary || raw.transcript || raw.notes || '') || null
    const howHeard   = String(raw.how_heard || raw.source || raw.how_they_heard || '') || null
    const message    = String(raw.message || raw.message_reason || raw.reason || '') || null

    if (!dateStr) {
      // Still save the raw payload so we can inspect it
      console.warn('[Cira Webhook] No date found in payload, saving raw for inspection')
    }

    const callDate = dateStr || new Date().toISOString().slice(0, 10)

    // ── Cross-reference with LSA leads ──────────────────────────────────────
    let lsaLeadId: string | null = null
    if (callerPhone && callerPhone.length >= 7) {
      const { data: lsaMatches } = await supabase
        .from('lsa_leads')
        .select('lead_id, lead_received')
        .eq('client_id', CLIENT_ID)
        .eq('lead_type', 'Phone')
        .ilike('customer', `%${callerPhone.slice(-7)}%`)
        .limit(5)

      if (lsaMatches?.length) {
        const callDateObj = new Date(callDate)
        for (const lead of lsaMatches) {
          if (!lead.lead_received) continue
          const leadDate = new Date(lead.lead_received)
          const diffDays = Math.abs((callDateObj.getTime() - leadDate.getTime()) / 86400000)
          if (diffDays <= 3) {
            lsaLeadId = lead.lead_id
            break
          }
        }
      }
    }

    const classification = classifyCall(summary || '', durationSec)

    // ── Insert into cira_calls ──────────────────────────────────────────────
    const record = {
      client_id:            CLIENT_ID,
      call_date:            callDate,
      call_month:           callDate.slice(0, 7),
      call_time:            timeStr || null,
      caller_name:          callerName && callerName !== 'null' ? callerName : null,
      caller_phone:         callerPhone || null,
      duration_raw:         durationRaw || null,
      duration_sec:         durationSec,
      how_heard:            howHeard,
      message_reason:       message,
      call_summary:         summary,
      is_new_lead:          classification.is_new_lead,
      is_existing_customer: classification.is_existing_customer,
      is_qualified:         classification.is_qualified,
      is_spam:              classification.is_spam,
      topic:                classification.topic,
      lsa_lead_id:          lsaLeadId,
      lsa_matched:          lsaLeadId !== null,
    }

    const { error } = await supabase.from('cira_calls').insert(record)

    if (error) {
      console.error('[Cira Webhook] Insert error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    console.log(`[Cira Webhook] ✓ Saved call from ${callerPhone} — ${classification.topic} — LSA match: ${lsaLeadId || 'none'}`)

    return NextResponse.json({ ok: true, topic: classification.topic, lsa_matched: lsaLeadId !== null })

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[Cira Webhook] Error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// GET handler for Cira webhook verification (some platforms send a GET to verify)
export async function GET(req: NextRequest) {
  const challenge = new URL(req.url).searchParams.get('challenge')
  if (challenge) return NextResponse.json({ challenge })
  return NextResponse.json({ ok: true, service: 'cira-webhook', client: new URL(req.url).searchParams.get('client') || 'culture' })
}
