import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const OWNER_ID = 'ef045043-5b6a-414a-83fb-1825540fe9cd'

function getUserLevel(authUserId: string, role: string): 'owner' | 'admin' | 'team' {
  if (authUserId === OWNER_ID) return 'owner'
  if (role === 'admin') return 'admin'
  return 'team'
}

async function buildContext(level: 'owner' | 'admin' | 'team', authUserId: string, memberName: string) {
  const now = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

  const { data: wos } = await supabaseAdmin
    .from('work_orders')
    .select(`id, title, stage, client_id, est_cost, add_cost, due_date, priority, created_at,
             clients!work_orders_client_id_fkey(name),
             services!work_orders_service_id_fkey(name),
             team_members!work_orders_owner_id_fkey(name, auth_user_id)`)
    .not('stage', 'in', '(archived,paid)')
    .order('created_at', { ascending: false })
    .limit(500)

  const { data: team } = await supabaseAdmin
    .from('team_members')
    .select('id, name, role, auth_user_id, active')
    .eq('active', true)

  const filteredWos = level === 'team'
    ? (wos || []).filter((w: any) => w.team_members?.auth_user_id === authUserId)
    : (wos || [])

  const stageCounts: Record<string, number> = {}
  filteredWos.forEach((w: any) => { stageCounts[w.stage] = (stageCounts[w.stage] || 0) + 1 })

  const clientCounts: Record<string, number> = {}
  filteredWos.forEach((w: any) => {
    const name = w.clients?.name || 'Unknown'
    clientCounts[name] = (clientCounts[name] || 0) + 1
  })

  const topClients = Object.entries(clientCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([k, v]) => k + ': ' + v)
    .join(', ')

  const teamList = (team || []).map((t: any) => '- ' + t.name + ' (' + t.role + ')').join('\n')

  const woList = filteredWos.slice(0, 50).map((w: any) =>
    '- [' + w.stage + '] ' + w.title +
    ' | Client: ' + (w.clients?.name || '?') +
    ' | Service: ' + (w.services?.name || '?') +
    ' | Due: ' + (w.due_date || 'none') +
    ' | Owner: ' + (w.team_members?.name || 'unassigned')
  ).join('\n')

  let context = 'You are the A&B Consulting Group internal AI assistant. Today is ' + now + '.\n' +
    'You help the team manage work orders, clients, schedules, and operations.\n' +
    'The person talking to you is ' + memberName + ' (' + level + ' level).\n\n' +
    'WORK ORDER SUMMARY (' + filteredWos.length + ' active WOs):\n' +
    'Stages: ' + JSON.stringify(stageCounts) + '\n' +
    'Top clients: ' + topClients + '\n\n' +
    'TEAM:\n' + teamList + '\n\n' +
    'RECENT WORK ORDERS (last 50):\n' + woList

  if (level === 'owner' || level === 'admin') {
    const pipeline = filteredWos.reduce((sum: number, w: any) => sum + (w.est_cost || 0) + (w.add_cost || 0), 0)
    const invoiced = filteredWos.filter((w: any) => w.stage === 'invoiced')
      .reduce((sum: number, w: any) => sum + (w.est_cost || 0) + (w.add_cost || 0), 0)
    const readyToInvoice = filteredWos.filter((w: any) => w.stage === 'deliverables-executed').length

    context += '\n\nPIPELINE FINANCIALS:\n' +
      '- Active pipeline value: $' + pipeline.toLocaleString() + '\n' +
      '- Outstanding invoiced (awaiting payment): $' + invoiced.toLocaleString() + '\n' +
      '- Ready to invoice: ' + readyToInvoice + ' WOs'
  }

  if (level === 'owner') {
    const { data: recurring } = await supabaseAdmin
      .from('recurring_services')
      .select('client_id, amount, active, clients!recurring_services_client_id_fkey(name)')
      .eq('active', true)

    const mrr = (recurring || []).reduce((sum: number, r: any) => sum + Number(r.amount), 0)

    const recurringList = (recurring || [])
      .sort((a: any, b: any) => b.amount - a.amount)
      .slice(0, 10)
      .map((r: any) => '- ' + (r.clients?.name || '?') + ': $' + Number(r.amount).toLocaleString() + '/mo')
      .join('\n')

    context += '\n\nMRR & RECURRING (Owner only):\n' +
      '- Committed MRR: $' + mrr.toLocaleString() + '\n\n' +
      'TOP RECURRING CLIENTS:\n' + recurringList
  }

  if (level === 'team') {
    // Strip any cost data — team sees no financials
    context += '\n\nNOTE: Financial data is not available at your access level.'
  }

  context += '\n\nGUIDELINES:\n' +
    '- Be concise and direct. Use bullet points for lists.\n' +
    '- When showing WO lists, include stage, client, and due date.\n' +
    '- For financial questions, always show numbers clearly.\n' +
    '- If asked about something outside your data, say so clearly.\n' +
    '- You can filter, sort, and analyze the data above to answer questions.\n' +
    '- Address the user by their first name.'

  return context
}

export async function POST(req: NextRequest) {
  try {
    const { messages, authUserId, role, memberName } = await req.json()

    const level = getUserLevel(authUserId, role)
    const systemPrompt = await buildContext(level, authUserId, memberName)

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return NextResponse.json({ ok: false, error: 'No ANTHROPIC_API_KEY' }, { status: 500 })

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: systemPrompt,
        messages,
      }),
    })

    const data = await res.json()
    const text = data.content?.[0]?.text || 'Sorry, I could not generate a response.'
    return NextResponse.json({ ok: true, text })
  } catch (e: any) {
    console.error('Claude route error:', e)
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}
