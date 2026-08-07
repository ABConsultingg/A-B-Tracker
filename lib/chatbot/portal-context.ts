// lib/chatbot/portal-context.ts
//
// Builds the tracker context for the portal assistant — the chatbot a
// logged-in CLIENT talks to at portal.abconsultingg.com.
//
// SECURITY MODEL
// --------------
// Two independent layers, either of which alone should contain a client:
//
//   1. RLS. Every read goes through the *user-scoped* Supabase client, never
//      the service client, so Supabase policies apply.
//   2. Explicit predicates. Every query also filters by client_id, or by an
//      id set derived from a query that did. RLS being missing or permissive
//      on any one table is therefore not sufficient to leak another tenant.
//
// Layer 2 exists because layer 1 cannot be verified from the code: wo_tasks
// and wo_schedule are not part of the portal UI, and social_monthly_mix has no
// client_id column at all.
//
// Do NOT swap these calls to createServiceClient(). It bypasses RLS, and the
// TypeScript type below cannot tell the difference.
//
// Deliberately NOT read: wo_line_items, vendor_invoices, recurring_services
// (owner-only — carries `amount`), wo_comments, team_members, est_cost,
// add_cost, and every other client's anything.

// Relative, not '@/lib/portal/stages', so portal-context.test.ts can run this
// module directly under node --experimental-strip-types. Next resolves both.
import { stageView, HIDDEN_STAGES } from '../portal/stages.ts'

type Sb = ReturnType<typeof import('@/lib/supabase/server').createClient>

type PortalContextErrorCode = 'no_client' | 'inactive_client' | 'query_failed'

export class PortalContextError extends Error {
  // A plain field, not a `readonly` constructor parameter property — the latter
  // is unsupported by node's strip-only TypeScript mode, which the test uses.
  code: PortalContextErrorCode

  constructor(message: string, code: PortalContextErrorCode) {
    super(message)
    this.name = 'PortalContextError'
    this.code = code
  }
}

export type PortalContext = {
  clientName: string
  text: string
}

// ── Text safety ─────────────────────────────────────────────────────────────
// Field values are written by staff, by clients, and by the Jotform webhook,
// so they are untrusted with respect to the prompt. Neutralise anything that
// could close the ACCOUNT DATA fence or impersonate a section header, and cap
// length so one long field cannot push the rest of the context out.
function safe(v: unknown, max = 200): string {
  if (typeof v !== 'string') return ''
  return v
    .replace(/[\u0000-\u001F\u007F]+/g, ' ') // control chars, incl. newlines
    .replace(/={3,}/g, '=') // === fence markers
    .replace(/^\s*#{1,6}\s+/gm, '') // markdown headers at line start
    .replace(/#{2,}/g, '') // ...and mid-line '##', which survives newline flattening.
    //                        Runs of 2+ only: '#roofing' in hashtags must survive.
    .trim()
    .slice(0, max)
}

// ── Dates ───────────────────────────────────────────────────────────────────
// Supabase date columns are date-only strings ('2026-08-12'). new Date() parses
// those as UTC midnight, so formatting in server-local time renders the day
// before on any server behind UTC. Format the parts directly instead — there is
// no timezone in a date that has none.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function fmtDate(d: unknown): string {
  if (typeof d !== 'string') return 'no date set'
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return 'no date set'
  const [, y, mo, day] = m
  const idx = Number(mo) - 1
  if (idx < 0 || idx > 11) return 'no date set'
  return `${MONTHS[idx]} ${Number(day)}, ${y}`
}

/** Today as YYYY-MM-DD in the agency's timezone, not the server's. */
function todayIso(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

/**
 * The month key for the current month + `offset`, in the exact format the
 * social hub stores.
 *
 * social_monthly_mix.month is written as a first-of-month DATE string —
 * `${year}-${month}-01` — by app/dashboard/social/planning/page.tsx and read
 * back the same way by social/review. A bare 'YYYY-MM' matches nothing, which
 * silently emptied the whole social section.
 */
function monthKey(now: Date, offset = 0): string {
  const iso = todayIso(now)
  const y = Number(iso.slice(0, 4))
  const m = Number(iso.slice(5, 7)) - 1 + offset
  const year = y + Math.floor(m / 12)
  const month = ((m % 12) + 12) % 12
  return `${year}-${String(month + 1).padStart(2, '0')}-01`
}

// Every query is checked. Supabase returns errors in-band, so destructuring
// only `data` turns a broken query into a confident "you have no projects".
function unwrap<T>(res: { data: T | null; error: any }, what: string): T[] {
  if (res.error) {
    throw new PortalContextError(
      `Query failed: ${what} — ${res.error.message}`,
      'query_failed'
    )
  }
  return (res.data as unknown as T[]) || []
}

// Supplementary data. A failure here degrades one section rather than taking
// down the whole assistant — the client can still ask about their projects if
// the social hub schema shifts under us. Core data (clients, work_orders)
// stays fatal, because an answer built without it would be wrong rather than
// incomplete.
function soft<T>(res: { data: T | null; error: any }, what: string): { rows: T[]; failed: boolean } {
  if (res.error) {
    console.error(`[portal-context] optional query failed: ${what} — ${res.error.message}`)
    return { rows: [], failed: true }
  }
  return { rows: ((res.data as unknown as T[]) || []), failed: false }
}

export async function buildPortalContext(
  supabase: Sb,
  clientId: string
): Promise<PortalContext> {
  const now = new Date()
  const iso = todayIso(now)

  // ── Client identity ───────────────────────────────────────────────────────
  const clientRes = await supabase
    .from('clients')
    .select('id, name, company, status')
    .eq('id', clientId)
    .maybeSingle()

  if (clientRes.error) {
    throw new PortalContextError(
      `Query failed: clients — ${clientRes.error.message}`,
      'query_failed'
    )
  }
  const client: any = clientRes.data
  if (!client) throw new PortalContextError('No client record', 'no_client')
  if (client.status === 'archived' || client.status === 'inactive') {
    throw new PortalContextError('Client is not active', 'inactive_client')
  }

  const clientName = safe(client.name, 80) || 'your business'
  const companyName = safe(client.company, 80) || clientName

  // ── Work orders ───────────────────────────────────────────────────────────
  // Explicit client_id predicate: this set is the allowlist every query below
  // is constrained to, so it must not depend on RLS alone.
  const wos = unwrap<any>(
    await supabase
      .from('work_orders')
      .select(
        `id, title, stage, due_date, created_at,
         services!work_orders_service_id_fkey(name)`
      )
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(200),
    'work_orders'
  )

  const visible = wos.filter((w) => w.stage && !HIDDEN_STAGES.has(w.stage))
  const active = visible.filter((w) => w.stage !== 'paid')
  const awaitingClient = visible.filter((w) => w.stage === 'sent-for-approval')

  const visibleIds = visible.map((w) => w.id)
  const woTitle = new Map<string, string>(
    visible.map((w) => [w.id, safe(w.title) || 'Untitled'])
  )

  // ── Open tasks ────────────────────────────────────────────────────────────
  // Constrained by `.in(visibleIds)` rather than post-filtered, so the row
  // limit is spent on this client's tasks instead of everyone's.
  // `.or(status.is.null,...)` because NOT (NULL = 'done') is NULL, not TRUE —
  // a plain .not() silently drops every task with no status set.
  const tasks = visibleIds.length
    ? unwrap<any>(
        await supabase
          .from('wo_tasks')
          .select('id, title, status, due_date, work_order_id')
          .in('work_order_id', visibleIds)
          .or('status.is.null,status.neq.done')
          .order('due_date', { ascending: true })
          .limit(150),
        'wo_tasks'
      )
    : []

  // ── Upcoming schedule ─────────────────────────────────────────────────────
  // wo_schedule has no client_id, so it is scoped by parent work order.
  const schedule = visibleIds.length
    ? unwrap<any>(
        await supabase
          .from('wo_schedule')
          .select('id, work_order_id, scheduled_date, scheduled_time, type, title, status')
          .in('work_order_id', visibleIds)
          .gte('scheduled_date', iso)
          .order('scheduled_date', { ascending: true })
          .limit(60),
        'wo_schedule'
      )
    : []

  // ── Social media hub ──────────────────────────────────────────────────────
  // This table is keyed by a free-text client_name with no client_id FK, so a
  // string match is the only tenant boundary available. Two known weaknesses,
  // both needing a schema change to fix properly (see CHATBOT_PORTAL.md):
  //   - names in social_monthly_mix do not always match clients.name, so this
  //     can legitimately return nothing for a client who does have a plan;
  //   - two clients sharing a name would see each other's plan.
  // Matched against both name and company to improve the hit rate. An empty
  // name can never match, because of the guards above.
  // Columns verified against what app/dashboard/social/planning writes:
  //   client_name, month, slot, pillar, post_type, content_type, topic,
  //   caption_text, hashtags, design_brief, status, scheduled_date, assignee,
  //   notes, caption_id, asset_url, asset_type, asset_filename
  // design_brief, notes and assignee are internal production fields and are
  // deliberately not read — a client should not see who is assigned or what
  // the brief to the designer said.
  const socialNames = Array.from(new Set([clientName, companyName].filter(Boolean)))
  const socialRes = socialNames.length
    ? soft<any>(
        await supabase
          .from('social_monthly_mix')
          .select('month, slot, content_type, post_type, pillar, topic, caption_text, hashtags, status, scheduled_date')
          .in('client_name', socialNames)
          .in('month', [monthKey(now, 0), monthKey(now, 1)])
          .order('slot', { ascending: true })
          .limit(120),
        'social_monthly_mix'
      )
    : { rows: [], failed: false }
  const social = socialRes.rows

  // ── Assemble ──────────────────────────────────────────────────────────────
  const L: string[] = []
  const TASK_CAP = 60
  const SCHED_CAP = 40

  L.push(`Today is ${fmtDate(iso)}.`)
  L.push(`You are speaking with a representative of ${companyName}.`)
  L.push('')

  L.push(`## Active projects (${active.length})`)
  if (active.length === 0) {
    L.push('No active projects right now.')
  } else {
    for (const w of active) {
      const svc = Array.isArray(w.services) ? w.services[0]?.name : w.services?.name
      const label = stageView(w.stage)?.label || w.stage
      L.push(
        `- "${safe(w.title) || 'Untitled'}"${svc ? ` (${safe(svc, 60)})` : ''} — status: ${label}, due ${fmtDate(w.due_date)}`
      )
    }
  }
  if (wos.length >= 200) {
    L.push('(Older projects beyond the most recent 200 are not listed here.)')
  }
  L.push('')

  if (awaitingClient.length > 0) {
    L.push(`## Waiting on ${companyName} to approve (${awaitingClient.length})`)
    for (const w of awaitingClient) {
      L.push(`- "${safe(w.title) || 'Untitled'}" — sent for approval, due ${fmtDate(w.due_date)}`)
    }
    L.push('')
  }

  if (tasks.length > 0) {
    const shown = tasks.slice(0, TASK_CAP)
    L.push(`## Open tasks (showing ${shown.length} of ${tasks.length})`)
    for (const t of shown) {
      L.push(
        `- ${safe(t.title) || 'Untitled task'} — on "${woTitle.get(t.work_order_id)}", due ${fmtDate(t.due_date)}`
      )
    }
    L.push('')
  }

  if (schedule.length > 0) {
    const shown = schedule.slice(0, SCHED_CAP)
    L.push(`## Upcoming schedule (showing ${shown.length} of ${schedule.length})`)
    for (const s of shown) {
      const parent = woTitle.get(s.work_order_id)
      const time = s.scheduled_time ? ` ${safe(s.scheduled_time, 12)}` : ''
      const what = safe(s.title) || safe(s.type, 40) || 'Scheduled item'
      L.push(`- ${fmtDate(s.scheduled_date)}${time} — ${what}${parent ? ` (${parent})` : ''}`)
    }
    L.push('')
  }

  if (social.length > 0) {
    L.push('## Social media plan')
    let currentMonth = ''
    for (const p of social) {
      if (p.month !== currentMonth) {
        currentMonth = p.month
        // Display the month without the storage format's '-01' day part.
        L.push(`### ${safe(String(currentMonth).slice(0, 7), 10)}`)
      }
      // Format: Slot 3 · Post · Value — Fall roof maintenance — Aug 12, 2026 [Ready]
      const kind = [p.content_type || p.post_type, p.pillar].map((x) => safe(x, 40)).filter(Boolean).join(' · ')
      const topic = safe(p.topic, 120)
      const when = p.scheduled_date ? ` — ${fmtDate(p.scheduled_date)}` : ''
      const st = p.status ? ` [${safe(p.status, 24)}]` : ''
      L.push(`- Slot ${safe(String(p.slot ?? ''), 6)}${kind ? ` · ${kind}` : ''}${topic ? ` — ${topic}` : ''}${when}${st}`)

      // The caption is the thing clients most often want to read back or
      // approve, so it is included in full rather than summarised.
      const caption = safe(p.caption_text, 600)
      if (caption) L.push(`    Caption: ${caption}`)
      const tags = safe(p.hashtags, 200)
      if (tags) L.push(`    Hashtags: ${tags}`)
    }
    L.push('')
  } else if (socialRes.failed) {
    // Say so explicitly. Otherwise the model, told the context is everything it
    // knows, would state confidently that there is no social plan.
    L.push('## Social media plan')
    L.push('The social plan could not be loaded right now. Do not tell the client they have no social plan — say the plan is temporarily unavailable and offer to have their account manager confirm it.')
    L.push('')
  }

  return { clientName: companyName, text: L.join('\n') }
}
