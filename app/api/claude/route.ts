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
             clients!work_orders_client_id_fkey(name, contact_name, contact_email),
             services!work_orders_service_id_fkey(name),
             team_members!work_orders_owner_id_fkey(name, auth_user_id),
             wo_assignees(team_members(name)),
             wo_schedule(title, scheduled_date, type)`)
    .not('stage', 'in', '(archived,paid)')
    .order('created_at', { ascending: false })
    .limit(500)

  const { data: team } = await supabaseAdmin
    .from('team_members')
    .select('id, name, role, auth_user_id, active')
    .eq('active', true)

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const { data: recentComms } = await supabaseAdmin
    .from('client_comms')
    .select('client_id, type, summary, contacted_at, clients!client_comms_client_id_fkey(name)')
    .gte('contacted_at', thirtyDaysAgo)
    .order('contacted_at', { ascending: false })
    .limit(50)

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const { data: stageHistory } = await supabaseAdmin
    .from('wo_stage_history')
    .select('work_order_id, from_stage, to_stage, changed_at, changed_by, work_orders!wo_stage_history_work_order_id_fkey(title, client_id, clients!work_orders_client_id_fkey(name))')
    .gte('changed_at', sevenDaysAgo)
    .order('changed_at', { ascending: false })
    .limit(150)

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

  const woList = filteredWos.slice(0, 50).map((w: any) => {
    const assigneeNames = (w.wo_assignees || []).map((a: any) => a.team_members?.name).filter(Boolean).join(', ')
    const scheduleItems = (w.wo_schedule || [])
      .sort((a: any, b: any) => new Date(a.scheduled_date).getTime() - new Date(b.scheduled_date).getTime())
      .slice(0, 3)
      .map((sc: any) => sc.title + ' (' + sc.scheduled_date + ')')
      .join(', ')
    return '- [' + w.stage + '] ' + w.title +
      ' | Client: ' + (w.clients?.name || '?') +
      ' | Service: ' + (w.services?.name || '?') +
      ' | Due: ' + (w.due_date || 'none') +
      ' | Owner: ' + (w.team_members?.name || 'unassigned') +
      (assigneeNames ? ' | Assignees: ' + assigneeNames : '') +
      (scheduleItems ? ' | Schedule: ' + scheduleItems : '')
  }).join('\n')

  let context = 'You are the A&B Consulting Group internal AI assistant. IMPORTANT: Never share cost, pricing, invoice amounts, or financial data in any message that will be sent to a client or visible in client-facing communications. Cost data is internal only. Today is ' + now + '.\n' +
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

  const teamNameMap = Object.fromEntries((team || []).map((t: any) => [t.auth_user_id, t.name]))
  const stageHistoryList = (stageHistory || [])
    .filter((h: any) => {
      if (level === 'team') {
        const wo = (wos || []).find((w: any) => w.id === h.work_order_id)
        return (wo?.team_members as any)?.auth_user_id === authUserId
      }
      return true
    })
    .map((h: any) => {
      const woTitle = (h.work_orders as any)?.title || h.work_order_id
      const clientName = (h.work_orders as any)?.clients?.name || '?'
      const changedBy = h.changed_by ? (teamNameMap[h.changed_by] || h.changed_by) : 'unknown'
      const when = new Date(h.changed_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
      return '- ' + when + ' | ' + woTitle + ' (' + clientName + ') | ' + (h.from_stage || '?') + ' → ' + h.to_stage + ' | by ' + changedBy
    })
    .join('\n')

  if (stageHistoryList) {
    context += '\n\nRECENT STAGE ACTIVITY (last 7 days):\n' + stageHistoryList
  }

  if (recentComms && recentComms.length > 0) {
    const commsList = recentComms.map((c: any) => {
      const when = new Date(c.contacted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      return '- ' + when + ' | ' + (c.clients?.name || '?') + ' | ' + c.type + ': ' + (c.summary || '(no summary)')
    }).join('\n')
    context += '\n\nRECENT CLIENT COMMS (last 30 days):\n' + commsList
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

// ── Tool definitions ─────────────────────────────────────────────────────────
const TOOLS = [
  {
    name: 'create_wo',
    description: 'Create a new work order in the tracker',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Work order title' },
        client_id: { type: 'string', description: 'Client ID (slug format e.g. apollo-supply)' },
        service_name: { type: 'string', description: 'Service name e.g. Design, Video Production' },
        due_date: { type: 'string', description: 'Due date in YYYY-MM-DD format' },
        owner_name: { type: 'string', description: 'Name of the team member to assign as owner' },
        priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'], description: 'Priority level' },
        notes: { type: 'string', description: 'Internal notes for the work order' },
      },
      required: ['title', 'client_id'],
    },
  },
  {
    name: 'update_stage',
    description: 'Update the stage of an existing work order',
    input_schema: {
      type: 'object',
      properties: {
        wo_id: { type: 'string', description: 'Work order ID' },
        wo_title: { type: 'string', description: 'Work order title (used to find it if ID unknown)' },
        new_stage: { type: 'string', enum: ['not-started','in-progress','deliverables-completed','sent-for-approval','revisions-received','approved','ordered','deliverables-executed','invoiced','paid'], description: 'New stage' },
      },
      required: ['new_stage'],
    },
  },
  {
    name: 'assign_wo',
    description: 'Assign a work order to a team member',
    input_schema: {
      type: 'object',
      properties: {
        wo_id: { type: 'string', description: 'Work order ID' },
        wo_title: { type: 'string', description: 'Work order title' },
        owner_name: { type: 'string', description: 'Name of the team member to assign as owner' },
      },
      required: ['owner_name'],
    },
  },
  {
    name: 'send_message',
    description: 'Send a message to the team via HQ channel or to a specific person',
    input_schema: {
      type: 'object',
      properties: {
        channel: { type: 'string', enum: ['general','standup','design','ads','social','email','web'], description: 'HQ channel to post to' },
        message: { type: 'string', description: 'The message to send' },
        mention_names: { type: 'array', items: { type: 'string' }, description: 'Names of team members to @mention' },
        wo_id: { type: 'string', description: 'Optional: post as a WO comment instead of HQ' },
      },
      required: ['message'],
    },
  },
  {
    name: 'send_direct_message',
    description: 'Send a private direct message to a specific team member. Use when asked to message someone privately or send something to a specific person like Tanya, Adrian, Montse, etc.',
    input_schema: {
      type: 'object',
      properties: {
        to_name:  { type: 'string', description: 'Name of the team member to send to (e.g. Tanya, Adrian, Montse)' },
        message:  { type: 'string', description: 'The message content' },
        wo_id:    { type: 'string', description: 'Optional: related work order ID' },
        wo_title: { type: 'string', description: 'Optional: work order title to link' },
      },
      required: ['to_name', 'message'],
    },
  },
  {
    name: 'notify_client',
    description: 'Send an email notification to a client',
    input_schema: {
      type: 'object',
      properties: {
        client_id: { type: 'string', description: 'Client ID' },
        subject: { type: 'string', description: 'Email subject' },
        message: { type: 'string', description: 'Email message body' },
        wo_id: { type: 'string', description: 'Optional: related work order ID' },
      },
      required: ['client_id', 'subject', 'message'],
    },
  },
  {
    name: 'generate_document',
    description: 'Generate a document (SOW, brief, client update, proposal, scope) and save it as a file on a work order.',
    input_schema: {
      type: 'object',
      properties: {
        wo_id:       { type: 'string', description: 'Work order ID (UUID)' },
        wo_title:    { type: 'string', description: 'Work order title partial match' },
        doc_content: { type: 'string', description: 'Full text content of the document' },
        file_name:   { type: 'string', description: 'File name e.g. KBC_SOW_June2026.md' },
        internal_only: { type: 'boolean', description: 'Internal only default true' },
      },
      required: ['doc_content', 'file_name'],
    },
  },
  {
    name: 'attach_file_to_wo',
    description: 'Attach a file from the chat to a specific work order. Use when user uploads a file and asks to attach it to a WO.',
    input_schema: {
      type: 'object',
      properties: {
        wo_id:        { type: 'string', description: 'Work order ID (UUID)' },
        wo_title:     { type: 'string', description: 'Work order title partial match' },
        file_name:    { type: 'string', description: 'Name of the file' },
        file_content: { type: 'string', description: 'Text content of the file' },
        internal_only:{ type: 'boolean', description: 'Internal only flag (default true)' },
      },
      required: ['file_name', 'file_content'],
    },
  },
  {
    name: 'read_wo_files',
    description: 'Read the files and attachments on a work order. Use this when asked to summarize, review, or reference documents attached to a WO.',
    input_schema: {
      type: 'object',
      properties: {
        wo_id:    { type: 'string', description: 'Work order ID (UUID)' },
        wo_title: { type: 'string', description: 'Work order title (partial match ok) — used if wo_id not provided' },
      },
    },
  },
  {
    name: 'add_schedule_date',
    description: 'Add a scheduled date/deliverable to a work order',
    input_schema: {
      type: 'object',
      properties: {
        wo_id: { type: 'string', description: 'Work order ID' },
        wo_title: { type: 'string', description: 'Work order title' },
        scheduled_date: { type: 'string', description: 'Date in YYYY-MM-DD format' },
        type: { type: 'string', enum: ['email','social-post','social-ad','google-ad','meeting','launch','other'], description: 'Type of scheduled item' },
        title: { type: 'string', description: 'What is going out on this date' },
      },
      required: ['scheduled_date', 'type'],
    },
  },
  {
    name: 'get_wo_detail',
    description: 'Get full details of a specific work order: tasks, messages, assignees, schedule, and vendor invoices. Use when asked for details, what is left, or full breakdown of a specific WO.',
    input_schema: {
      type: 'object',
      properties: {
        wo_id:    { type: 'string', description: 'Work order ID (UUID)' },
        wo_title: { type: 'string', description: 'Work order title partial match' },
      },
    },
  },
  {
    name: 'get_client_history',
    description: 'Get full history for a client: all active WOs, recent stage changes, comms log, and contact info. Use when asked about a specific client overview, history, or relationship.',
    input_schema: {
      type: 'object',
      properties: {
        client_id:   { type: 'string', description: 'Client ID slug e.g. apollo-supply' },
        client_name: { type: 'string', description: 'Client name partial match' },
      },
    },
  },
  {
    name: 'search_archived_wos',
    description: 'Search archived, paid, or completed work orders. Use for historical questions.',
    input_schema: {
      type: 'object',
      properties: {
        client_name: { type: 'string', description: 'Filter by client name' },
        stage:       { type: 'string', enum: ['paid','archived','invoiced'], description: 'Stage to filter by' },
        limit:       { type: 'number', description: 'Max results (default 20)' },
      },
    },
  },
]

// ── Tool execution ────────────────────────────────────────────────────────────
async function executeTool(name: string, input: any, level: string, authUserId: string): Promise<string> {
  try {
    if (name === 'create_wo') {
      // Find client
      const { data: client } = await supabaseAdmin.from('clients').select('id').eq('id', input.client_id).maybeSingle()
      if (!client) return 'Error: Client not found with ID ' + input.client_id

      // Find service
      let serviceId = null
      if (input.service_name) {
        const { data: svc } = await supabaseAdmin.from('services').select('id').ilike('name', '%' + input.service_name + '%').maybeSingle()
        serviceId = svc?.id || null
      }

      // Find owner
      let ownerId = null
      if (input.owner_name) {
        const { data: member } = await supabaseAdmin.from('team_members').select('id').ilike('name', '%' + input.owner_name + '%').maybeSingle()
        ownerId = member?.id || null
      }

      const woId = 'WO-' + Math.random().toString(36).slice(2, 10)
      const { error } = await supabaseAdmin.from('work_orders').insert({
        id: woId,
        title: input.title,
        client_id: input.client_id,
        service_id: serviceId,
        owner_id: ownerId,
        due_date: input.due_date || null,
        priority: input.priority || 'medium',
        stage: 'not-started',
        occurrence: 'one-time',
        notes: input.notes || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      if (error) return 'Error creating WO: ' + error.message

      // Notify Tanya of new WO
      try {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.abconsultingg.com'
        await fetch(`${appUrl}/api/notify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            notifications: [{ user_id: 'f9d6e051-1545-4229-9980-c05a29f9dd90', type: 'new_wo' }],
            wo_title: input.title,
            wo_id: woId,
            sender_name: 'Pancho',
          }),
        })
      } catch (e) { console.error('notify error:', e) }

      return 'Created work order "' + input.title + '" (ID: ' + woId + ') successfully.'
    }

    if (name === 'update_stage') {
      let woId = input.wo_id
      if (!woId && input.wo_title) {
        const { data: wo } = await supabaseAdmin.from('work_orders').select('id').ilike('title', '%' + input.wo_title + '%').maybeSingle()
        woId = wo?.id
      }
      if (!woId) return 'Error: Could not find work order "' + (input.wo_title || input.wo_id) + '"'
      const { error } = await supabaseAdmin.from('work_orders').update({ stage: input.new_stage, updated_at: new Date().toISOString() }).eq('id', woId)
      if (error) return 'Error: ' + error.message

      // Fire notifications server-side
      try {
        const { data: woData } = await supabaseAdmin.from('work_orders').select('title, client_id, owner_id').eq('id', woId).maybeSingle()
        const { data: assigneeRows } = await supabaseAdmin.from('wo_assignees').select('team_members(id, auth_user_id)').eq('work_order_id', woId)
        const { data: stageInfo } = await supabaseAdmin.from('team_members').select('auth_user_id').eq('id', woData?.owner_id || '').maybeSingle()
        const assigneeAuthIds = (assigneeRows || []).map((r: any) => r.team_members?.auth_user_id).filter(Boolean) as string[]
        const ownerAuthId = stageInfo?.auth_user_id || null
        const NOTIFIES_CLIENT = new Set(['sent-for-approval', 'ordered', 'deliverables-executed'])
        const NOTIFIES_TEAM   = new Set(['approved', 'revisions-received', 'deliverables-completed', 'deliverables-executed'])
        const { STAGES } = await import('@/lib/types')
        const stageLabel = STAGES.find((s: any) => s.id === input.new_stage)?.label || input.new_stage
        const notifications: any[] = []
        if (NOTIFIES_CLIENT.has(input.new_stage) && woData?.client_id) {
          notifications.push({ client_id: woData.client_id, type: 'stage_change_client', stage: input.new_stage, stage_label: stageLabel })
        }
        if (NOTIFIES_TEAM.has(input.new_stage)) {
          const teamIds = [...new Set([ownerAuthId, ...assigneeAuthIds].filter(Boolean))] as string[]
          teamIds.forEach(uid => notifications.push({ user_id: uid, type: 'stage_change_team', stage: input.new_stage, stage_label: stageLabel }))
        }
        if (notifications.length && woData) {
          const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.abconsultingg.com'
          await fetch(`${appUrl}/api/notify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ notifications, wo_title: woData.title, wo_id: woId, sender_name: 'Pancho' }),
          })
        }
      } catch (notifyErr) {
        console.error('Pancho notify error:', notifyErr)
      }

      return 'Updated work order to stage "' + input.new_stage + '" successfully.'
    }

    if (name === 'assign_wo') {
      let woId = input.wo_id
      if (!woId && input.wo_title) {
        const { data: wo } = await supabaseAdmin.from('work_orders').select('id').ilike('title', '%' + input.wo_title + '%').maybeSingle()
        woId = wo?.id
      }
      if (!woId) return 'Error: Could not find work order'
      const { data: member } = await supabaseAdmin.from('team_members').select('id, name').ilike('name', '%' + input.owner_name + '%').maybeSingle()
      if (!member) return 'Error: Could not find team member "' + input.owner_name + '"'
      const { error } = await supabaseAdmin.from('work_orders').update({ owner_id: member.id, updated_at: new Date().toISOString() }).eq('id', woId)
      if (error) return 'Error: ' + error.message
      return 'Assigned work order to ' + member.name + ' successfully.'
    }

    if (name === 'send_message') {
      const channel = input.channel || 'general'
      // Build body with @mentions
      let body = input.message
      const mentionIds: string[] = []
      if (input.mention_names?.length) {
        for (const mname of input.mention_names) {
          const { data: member } = await supabaseAdmin.from('team_members').select('id, name').ilike('name', '%' + mname + '%').maybeSingle()
          if (member) {
            mentionIds.push(member.id)
            if (!body.includes('@' + member.name.split(' ')[0])) {
              body = '@' + member.name.split(' ')[0] + ' ' + body
            }
          }
        }
      }

      if (input.wo_id) {
        // Post as WO comment
        const { error } = await supabaseAdmin.from('wo_comments').insert({
          work_order_id: input.wo_id, body, author_id: authUserId,
          author_type: 'team', internal_only: false,
          created_at: new Date().toISOString(),
        })
        if (error) return 'Error posting comment: ' + error.message
        return 'Posted comment on work order successfully.'
      } else {
        // Post to HQ wall
        const { error } = await supabaseAdmin.from('wall_posts').insert({
          channel, body, author_id: authUserId,
          mentions: mentionIds, created_at: new Date().toISOString(),
        })
        if (error) return 'Error posting to HQ: ' + error.message
        return 'Posted message to #' + channel + ' in HQ successfully.'
      }
    }

    if (name === 'send_direct_message') {
      // Find recipient
      const { data: recipient } = await supabaseAdmin.from('team_members').select('id, name').ilike('name', '%' + input.to_name + '%').maybeSingle()
      if (!recipient) return 'Could not find team member: ' + input.to_name

      // Find sender (current user)
      const { data: sender } = await supabaseAdmin.from('team_members').select('id, name').eq('auth_user_id', authUserId).maybeSingle()

      // Resolve WO if title given
      let woId = input.wo_id
      if (!woId && input.wo_title) {
        const { data: wo } = await supabaseAdmin.from('work_orders').select('id').ilike('title', '%' + input.wo_title + '%').maybeSingle()
        woId = wo?.id
      }

      const { error } = await supabaseAdmin.from('direct_messages').insert({
        from_member_id: sender?.id || null,
        to_member_id: recipient.id,
        body: input.message,
        wo_id: woId || null,
        sent_via: 'mav',
      })
      if (error) return 'Error sending message: ' + error.message
      return 'Private message sent to ' + recipient.name + ' successfully.'
    }

    if (name === 'notify_client') {
      const { data: client } = await supabaseAdmin.from('clients').select('name, contact_name, contact_email').eq('id', input.client_id).maybeSingle()
      if (!client?.contact_email) return 'Error: No contact email for client ' + input.client_id
      const apiKey = process.env.RESEND_API_KEY
      if (!apiKey) return 'Error: No RESEND_API_KEY'
      const html = '<body style="font-family:sans-serif;padding:32px"><div style="max-width:520px;margin:0 auto"><h2>' + input.subject + '</h2><p>' + input.message.replace(/\n/g, '<br>') + '</p><p style="color:#999;font-size:12px">A&B Consulting Group</p></div></body>'
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: 'A&B Tracker <notifications@abconsultingg.com>', to: client.contact_email, subject: input.subject, html }),
      })
      if (!res.ok) return 'Error sending email: ' + await res.text()
      return 'Email sent to ' + (client.contact_name || client.name) + ' at ' + client.contact_email + ' successfully.'
    }

    if (name === 'add_schedule_date') {
      let woId = input.wo_id
      if (!woId && input.wo_title) {
        const { data: wo } = await supabaseAdmin.from('work_orders').select('id').ilike('title', '%' + input.wo_title + '%').maybeSingle()
        woId = wo?.id
      }
      if (!woId) return 'Error: Could not find work order'
      const { error } = await supabaseAdmin.from('wo_schedule').insert({
        work_order_id: woId,
        scheduled_date: input.scheduled_date,
        type: input.type,
        title: input.title || null,
        status: 'scheduled',
        sort_order: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      if (error) return 'Error: ' + error.message
      return 'Added scheduled date ' + input.scheduled_date + ' (' + input.type + ') to work order successfully.'
    }

    if (name === 'generate_document') {
      let woId = input.wo_id
      if (!woId && input.wo_title) {
        const { data: wo } = await supabaseAdmin.from('work_orders').select('id').ilike('title', '%' + input.wo_title + '%').maybeSingle()
        if (!wo) return 'Could not find work order: ' + input.wo_title
        woId = wo.id
      }
      if (!woId) return 'Error: provide wo_id or wo_title'
      const fileName = input.file_name.endsWith('.md') ? input.file_name : input.file_name + '.md'
      const content = input.doc_content || ''
      const path = 'wo-files/' + woId + '/' + Date.now() + '_' + fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
      const { error: upErr } = await supabaseAdmin.storage.from('ab-files').upload(path, content, { contentType: 'text/markdown', upsert: false })
      if (upErr) return 'Upload failed: ' + upErr.message
      const { error: dbErr } = await supabaseAdmin.from('wo_files').insert({ work_order_id: woId, name: fileName, storage_path: path, mime_type: 'text/markdown', size_bytes: content.length, uploaded_by_type: 'team', uploaded_by_id: authUserId, internal_only: input.internal_only !== false })
      if (dbErr) return 'DB insert failed: ' + dbErr.message
      return 'Generated and saved ' + fileName + ' to the work order. Visible in WO Files tab.'
    }

    if (name === 'attach_file_to_wo') {
      let woId = input.wo_id
      if (!woId && input.wo_title) {
        const { data: wo } = await supabaseAdmin.from('work_orders').select('id').ilike('title', '%' + input.wo_title + '%').maybeSingle()
        if (!wo) return 'Could not find work order: ' + input.wo_title
        woId = wo.id
      }
      if (!woId) return 'Error: provide wo_id or wo_title'
      const fileName = input.file_name
      const content = input.file_content || ''
      const path = 'wo-files/' + woId + '/' + Date.now() + '_' + fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
      const { error: upErr } = await supabaseAdmin.storage.from('ab-files').upload(path, content, { contentType: 'text/plain', upsert: false })
      if (upErr) return 'Upload failed: ' + upErr.message
      const { error: dbErr } = await supabaseAdmin.from('wo_files').insert({
        work_order_id: woId, name: fileName, storage_path: path,
        mime_type: 'text/plain', size_bytes: content.length,
        uploaded_by_type: 'team', uploaded_by_id: authUserId,
        internal_only: input.internal_only !== false,
      })
      if (dbErr) return 'DB insert failed: ' + dbErr.message
      return 'Attached ' + fileName + ' to the work order successfully.'
    }

    if (name === 'read_wo_files') {
      let woId = input.wo_id
      if (!woId && input.wo_title) {
        const { data: wo } = await supabaseAdmin.from('work_orders').select('id, title').ilike('title', '%' + input.wo_title + '%').maybeSingle()
        if (!wo) return 'Could not find work order matching: ' + input.wo_title
        woId = wo.id
      }
      if (!woId) return 'Error: Please provide wo_id or wo_title'

      const { data: files } = await supabaseAdmin.from('wo_files').select('id, name, storage_path, mime_type, size_bytes, created_at').eq('work_order_id', woId).order('created_at', { ascending: false })
      if (!files?.length) return 'No files attached to this work order.'

      const results: string[] = []
      for (const file of files.slice(0, 5)) {
        // Generate signed URL
        const { data: signed } = await supabaseAdmin.storage.from('ab-files').createSignedUrl(file.storage_path, 300)
        if (!signed?.signedUrl) { results.push('File: ' + file.name + ' (could not generate download URL)'); continue }

        // Try to fetch text content for readable files
        const isText = file.mime_type?.includes('text') || file.name.endsWith('.csv') || file.name.endsWith('.txt') || file.name.endsWith('.md')
        const isDoc = file.name.endsWith('.docx') || file.name.endsWith('.doc')
        const isPdf = file.mime_type?.includes('pdf') || file.name.endsWith('.pdf')

        if (isText) {
          try {
            const res = await fetch(signed.signedUrl)
            const text = await res.text()
            results.push('=== ' + file.name + ' ===\n' + text.substring(0, 4000) + (text.length > 4000 ? '\n...(truncated)' : ''))
          } catch {
            results.push('File: ' + file.name + ' (download failed)')
          }
        } else if (isPdf) {
          try {
            const res = await fetch(signed.signedUrl)
            const buffer = Buffer.from(await res.arrayBuffer())
            const pdfParse = await import('pdf-parse'); const parsed = await (pdfParse as any).default(buffer)
            const text = parsed.text || ''
            results.push('=== ' + file.name + ' (PDF) ===\n' + text.substring(0, 4000) + (text.length > 4000 ? '\n...(truncated)' : ''))
          } catch (e: any) {
            results.push('File: ' + file.name + ' (PDF parse failed: ' + e.message + ')')
          }
        } else if (isDoc) {
          try {
            const res = await fetch(signed.signedUrl)
            const buffer = Buffer.from(await res.arrayBuffer())
            const mammoth = await import('mammoth'); const result = await mammoth.extractRawText({ buffer })
            const text = result.value || ''
            results.push('=== ' + file.name + ' (Word doc) ===\n' + text.substring(0, 4000) + (text.length > 4000 ? '\n...(truncated)' : ''))
          } catch (e: any) {
            results.push('File: ' + file.name + ' (DOCX parse failed: ' + e.message + ')')
          }
        } else {
          results.push('File: ' + file.name + ' (' + (file.mime_type || 'unknown type') + ', ' + Math.round((file.size_bytes || 0) / 1024) + ' KB) — binary file format not supported for reading')
        }
      }

      return 'Files on this work order:\n\n' + results.join('\n\n')
    }


    if (name === 'get_wo_detail') {
      let woId = input.wo_id
      if (!woId && input.wo_title) {
        const { data: found } = await supabaseAdmin.from('work_orders').select('id').ilike('title', '%' + input.wo_title + '%').maybeSingle()
        woId = found?.id
      }
      if (!woId) return 'Error: Could not find work order'
      const { data: wo } = await supabaseAdmin.from('work_orders')
        .select(`id, title, stage, due_date, priority, notes, est_cost, add_cost,
                 clients!work_orders_client_id_fkey(name),
                 team_members!work_orders_owner_id_fkey(name),
                 wo_assignees(team_members(name)),
                 wo_tasks(title, status, priority, due_date, notes),
                 wo_schedule(title, scheduled_date, type),
                 wo_vendor_invoices(vendor_name, amount, status, due_date),
                 wo_comments(body, created_at, internal_only)`)
        .eq('id', woId).maybeSingle()
      if (!wo) return 'Error: Work order not found'
      const assignees = ((wo as any).wo_assignees || []).map((a: any) => a.team_members?.name).filter(Boolean).join(', ')
      const tasks = ((wo as any).wo_tasks || []).map((t: any) => '  [' + t.status + '] ' + t.title + (t.due_date ? ' (due ' + t.due_date + ')' : '') + (t.notes ? ' - ' + t.notes : '')).join('\n')
      const schedule = ((wo as any).wo_schedule || []).sort((a: any, b: any) => new Date(a.scheduled_date).getTime() - new Date(b.scheduled_date).getTime()).map((sc: any) => '  ' + sc.scheduled_date + ' | ' + sc.type + ' | ' + sc.title).join('\n')
      const vendorInvoices = ((wo as any).wo_vendor_invoices || []).map((v: any) => '  ' + v.vendor_name + ' $' + v.amount + ' [' + v.status + ']' + (v.due_date ? ' due ' + v.due_date : '')).join('\n')
      const messages = ((wo as any).wo_comments || []).filter((c: any) => level !== 'team' || !c.internal_only).slice(-10).map((c: any) => '  ' + new Date(c.created_at).toLocaleDateString() + ': ' + c.body).join('\n')
      const parts = [
        'WO: ' + (wo as any).title + ' [' + (wo as any).stage + ']',
        'Client: ' + ((wo as any).clients?.name || '?') + ' | Owner: ' + ((wo as any).team_members?.name || 'unassigned') + (assignees ? ' | Assignees: ' + assignees : ''),
        'Due: ' + ((wo as any).due_date || 'none') + ' | Priority: ' + ((wo as any).priority || 'medium'),
        (wo as any).notes ? 'Notes: ' + (wo as any).notes : '',
        tasks ? 'TASKS:\n' + tasks : 'TASKS: none',
        schedule ? 'SCHEDULE:\n' + schedule : 'SCHEDULE: none',
        vendorInvoices ? 'VENDOR INVOICES:\n' + vendorInvoices : '',
        messages ? 'RECENT MESSAGES (last 10):\n' + messages : '',
      ]
      return parts.filter(Boolean).join('\n')
    }

    if (name === 'get_client_history') {
      let clientId = input.client_id
      if (!clientId && input.client_name) {
        const { data: found } = await supabaseAdmin.from('clients').select('id').ilike('name', '%' + input.client_name + '%').maybeSingle()
        clientId = found?.id
      }
      if (!clientId) return 'Error: Could not find client'
      const { data: client } = await supabaseAdmin.from('clients').select('id, name, contact_name, contact_email, notes').eq('id', clientId).maybeSingle()
      const { data: clientWos } = await supabaseAdmin.from('work_orders').select('id, title, stage, due_date, team_members!work_orders_owner_id_fkey(name)').eq('client_id', clientId).not('stage', 'in', '(archived,paid)').order('created_at', { ascending: false }).limit(30)
      const { data: comms } = await supabaseAdmin.from('client_comms').select('type, summary, contacted_at').eq('client_id', clientId).order('contacted_at', { ascending: false }).limit(20)
      const { data: history } = await supabaseAdmin.from('wo_stage_history').select('from_stage, to_stage, changed_at').in('work_order_id', ((clientWos || []).map((w: any) => w.id))).order('changed_at', { ascending: false }).limit(30)
      const woLines = (clientWos || []).map((w: any) => '  [' + w.stage + '] ' + w.title + ' | Owner: ' + (w.team_members?.name || '?') + (w.due_date ? ' | Due: ' + w.due_date : '')).join('\n')
      const commLines = (comms || []).map((c: any) => '  ' + new Date(c.contacted_at).toLocaleDateString() + ' | ' + c.type + ': ' + (c.summary || '(no summary)')).join('\n')
      const histLines = (history || []).map((h: any) => '  ' + new Date(h.changed_at).toLocaleDateString() + ' | ' + h.from_stage + ' -> ' + h.to_stage).join('\n')
      const cparts = [
        'CLIENT: ' + (client as any)?.name,
        (client as any)?.contact_name ? 'Contact: ' + (client as any).contact_name + ' <' + ((client as any).contact_email || 'no email') + '>' : '',
        (client as any)?.notes ? 'Notes: ' + (client as any).notes : '',
        woLines ? 'ACTIVE WOs (' + (clientWos || []).length + '):\n' + woLines : 'No active WOs',
        commLines ? 'COMMS LOG:\n' + commLines : 'No comms logged',
        histLines ? 'RECENT STAGE CHANGES:\n' + histLines : '',
      ]
      return cparts.filter(Boolean).join('\n')
    }

    if (name === 'search_archived_wos') {
      const stageFilter = input.stage || 'paid'
      const { data: archived } = await supabaseAdmin.from('work_orders')
        .select('id, title, stage, due_date, created_at, clients!work_orders_client_id_fkey(name), team_members!work_orders_owner_id_fkey(name)')
        .eq('stage', stageFilter)
        .order('created_at', { ascending: false })
        .limit(input.limit || 20)
      if (!archived?.length) return 'No ' + stageFilter + ' work orders found'
      const lines = archived.map((w: any) => '- [' + w.stage + '] ' + w.title + ' | Client: ' + (w.clients?.name || '?') + ' | Owner: ' + (w.team_members?.name || '?') + (w.due_date ? ' | Due: ' + w.due_date : '')).join('\n')
      return 'Found ' + archived.length + ' ' + stageFilter + ' work orders:\n' + lines
    }

                return 'Unknown tool: ' + name
  } catch (e: any) {
    return 'Tool error: ' + e.message
  }
}

export async function POST(req: NextRequest) {
  try {
    const { messages, authUserId, role, memberName } = await req.json()

    const level = getUserLevel(authUserId, role)
    const systemPrompt = await buildContext(level, authUserId, memberName)

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return NextResponse.json({ ok: false, error: 'No ANTHROPIC_API_KEY' }, { status: 500 })

    // Only owner and admin can use action tools
    const tools = (level === 'owner' || level === 'admin') ? TOOLS : []

    const body: any = {
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: systemPrompt,
      messages,
    }
    if (tools.length > 0) body.tools = tools

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })

    const data = await res.json()

    // Handle tool use
    if (data.stop_reason === 'tool_use') {
      const toolUseBlocks = data.content.filter((b: any) => b.type === 'tool_use')
      const toolResults: any[] = []

      for (const block of toolUseBlocks) {
        const result = await executeTool(block.name, block.input, level, authUserId)
        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result })
      }

      // Send tool results back to Claude for final response
      const followUp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 1024,
          system: systemPrompt,
          tools,
          messages: [
            ...messages,
            { role: 'assistant', content: data.content },
            { role: 'user', content: toolResults },
          ],
        }),
      })
      const followData = await followUp.json()
      const text = followData.content?.find((b: any) => b.type === 'text')?.text || 'Done.'
      return NextResponse.json({ ok: true, text, tools_used: toolUseBlocks.map((b: any) => b.name) })
    }

    const text = data.content?.find((b: any) => b.type === 'text')?.text || 'Sorry, I could not generate a response.'
    return NextResponse.json({ ok: true, text })
  } catch (e: any) {
    console.error('Claude route error:', e)
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}
