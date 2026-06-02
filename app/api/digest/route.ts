import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

/**
 * Read-only operations digest.
 *
 * Auth: ?token=<DIGEST_TOKEN>
 *   https://app.abconsultingg.com/api/digest?token=YOUR_TOKEN
 *
 * Returns plain text by default (best for Claude to read via web fetch and for
 * eyeballing). Add &format=json for structured output.
 *
 * Buckets open work orders (excludes paid / archived) that have a due_date into:
 *   OVERDUE, DUE TODAY, DUE THIS WEEK (next 7 days).
 * Grouped by client. No dollar amounts.
 */

// Only these stages need attention; everything else (invoiced/approved/
// deliverables-executed/paid/archived/on-hold) is effectively done.
const ACTION_STAGES = ['not-started', 'in-progress', 'revisions-received', 'deliverables-completed', 'sent-for-approval']
// Internal/test client to exclude from the operations digest.
const EXCLUDE_CLIENT_ID = 'a-b-consulting-group'

// Central time "today" boundaries (America/Chicago), returned as YYYY-MM-DD.
function centralToday(): string {
  const now = new Date()
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit',
  })
  return fmt.format(now) // en-CA gives YYYY-MM-DD
}

function addDays(ymd: string, n: number): string {
  const d = new Date(ymd + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

function mdy(ymd: string | null): string {
  if (!ymd) return '—'
  const d = new Date(ymd + 'T00:00:00')
  return `${d.getMonth() + 1}/${d.getDate()}`
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  if (!token || token !== process.env.DIGEST_TOKEN) {
    return new NextResponse('Unauthorized', { status: 401 })
  }
  const format = req.nextUrl.searchParams.get('format') || 'text'

  const supabase = createServiceClient()
  const today = centralToday()
  const weekEnd = addDays(today, 7)

  // Open WOs with a due_date on or before the end of this week.
  const { data: wos, error } = await supabase
    .from('work_orders')
    .select(`id, title, stage, due_date, flagged, issue, branch,
             clients!work_orders_client_id_fkey(name),
             team_members!work_orders_owner_id_fkey(name)`)
    .not('due_date', 'is', null)
    .in('stage', ACTION_STAGES)
    .neq('client_id', EXCLUDE_CLIENT_ID)
    .lte('due_date', weekEnd)
    .order('due_date', { ascending: true })

  if (error) {
    return new NextResponse('Error: ' + error.message, { status: 500 })
  }

  type Row = {
    id: string; title: string; stage: string; due_date: string | null
    flagged: boolean | null; issue: string | null; branch: string | null
    client: string; owner: string
  }

  const rows: Row[] = (wos || []).map((w: any) => ({
    id: w.id, title: w.title, stage: w.stage, due_date: w.due_date,
    flagged: w.flagged, issue: w.issue, branch: w.branch,
    client: w.clients?.name || 'Unassigned client',
    owner: w.team_members?.name || 'Unassigned',
  }))

  const overdue = rows.filter(r => r.due_date! < today)
  const dueToday = rows.filter(r => r.due_date === today)
  const thisWeek = rows.filter(r => r.due_date! > today && r.due_date! <= weekEnd)

  if (format === 'json') {
    return NextResponse.json({
      generated_at: new Date().toISOString(),
      central_date: today,
      counts: { overdue: overdue.length, due_today: dueToday.length, this_week: thisWeek.length },
      overdue, due_today: dueToday, this_week: thisWeek,
    })
  }

  // ---- plain text ----
  const line = (r: Row) => {
    const parts = [r.title, r.stage, `due ${mdy(r.due_date)}`, r.owner]
    let s = '  • ' + parts.join(' · ')
    if (r.branch) s += ` · ${r.branch}`
    if (r.flagged) s += `  ⚑ ${r.issue || 'flagged'}`
    return s
  }

  const byClient = (list: Row[]) => {
    const groups: Record<string, Row[]> = {}
    list.forEach(r => { (groups[r.client] ||= []).push(r) })
    return Object.keys(groups).sort().map(c =>
      `${c}:\n` + groups[c].map(line).join('\n')
    ).join('\n\n')
  }

  const section = (label: string, list: Row[]) =>
    list.length
      ? `${label} (${list.length})\n${'─'.repeat(40)}\n${byClient(list)}`
      : `${label} (0)\n${'─'.repeat(40)}\n  none`

  const out = [
    `A&B WORK ORDER DIGEST`,
    `Central date: ${today}  ·  Overdue ${overdue.length} · Due today ${dueToday.length} · This week ${thisWeek.length}`,
    `(Action-needed stages only · excludes internal A&B WOs)`,
    ``,
    section('⚠️  OVERDUE', overdue),
    ``,
    section('📅  DUE TODAY', dueToday),
    ``,
    section('🗓  DUE THIS WEEK (next 7 days)', thisWeek),
  ].join('\n')

  return new NextResponse(out, {
    status: 200,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
