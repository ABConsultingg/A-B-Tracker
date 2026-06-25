import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'

const supabaseAdmin = createAdmin(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const PANCHO_AUTHOR_ID = 'a0000000-0000-0000-0000-000000000001'

// ── Wall-side read-only tools ─────────────────────────────────────────────
const WALL_TOOLS = [
  {
    name: 'get_wo_detail',
    description: 'Get full details of a specific work order: tasks, messages, assignees, schedule, files.',
    input_schema: {
      type: 'object',
      properties: {
        wo_id:    { type: 'string', description: 'Work order ID (UUID)' },
        wo_title: { type: 'string', description: 'Work order title partial match' },
      },
    },
  },
  {
    name: 'read_wo_files',
    description: 'Read the files and attachments on a work order. Use when asked to summarize, review, or reference documents attached to a WO.',
    input_schema: {
      type: 'object',
      properties: {
        wo_id:    { type: 'string', description: 'Work order ID (UUID)' },
        wo_title: { type: 'string', description: 'Work order title (partial match ok)' },
      },
    },
  },
]

async function executeWallTool(name: string, input: any): Promise<string> {
  try {
    if (name === 'get_wo_detail') {
      let woId = input.wo_id
      if (!woId && input.wo_title) {
        const { data: found } = await supabaseAdmin
          .from('work_orders').select('id').ilike('title', '%' + input.wo_title + '%').maybeSingle()
        woId = found?.id
      }
      if (!woId) return 'Error: Could not find work order'
      const { data: wo } = await supabaseAdmin
        .from('work_orders')
        .select(`id, title, stage, due_date, priority, notes,
                 clients!work_orders_client_id_fkey(name),
                 team_members!work_orders_owner_id_fkey(name),
                 wo_assignees(team_members(name)),
                 wo_tasks(title, status, priority, due_date, notes),
                 wo_schedule(title, scheduled_date, type),
                 wo_comments(body, created_at, internal_only)`)
        .eq('id', woId).maybeSingle()
      if (!wo) return 'Work order not found'
      const w = wo as any
      const assignees = (w.wo_assignees || []).map((a: any) => a.team_members?.name).filter(Boolean).join(', ')
      const tasks = (w.wo_tasks || []).map((t: any) => '  [' + t.status + '] ' + t.title + (t.due_date ? ' due ' + t.due_date : '')).join('\n')
      const schedule = (w.wo_schedule || [])
        .sort((a: any, b: any) => new Date(a.scheduled_date).getTime() - new Date(b.scheduled_date).getTime())
        .map((sc: any) => '  ' + sc.scheduled_date + ' | ' + sc.type + ' | ' + sc.title).join('\n')
      const msgs = (w.wo_comments || []).slice(-8).map((c: any) => '  ' + new Date(c.created_at).toLocaleDateString() + ': ' + c.body).join('\n')
      return [
        'WO: ' + w.title + ' [' + w.stage + ']',
        'Client: ' + (w.clients?.name || '?') + ' | Owner: ' + (w.team_members?.name || 'unassigned') + (assignees ? ' | Assignees: ' + assignees : ''),
        'Due: ' + (w.due_date || 'none') + ' | Priority: ' + (w.priority || 'medium'),
        w.notes ? 'Notes: ' + w.notes : '',
        tasks ? 'TASKS:\n' + tasks : 'TASKS: none',
        schedule ? 'SCHEDULE:\n' + schedule : '',
        msgs ? 'RECENT MESSAGES:\n' + msgs : '',
      ].filter(Boolean).join('\n')
    }

    if (name === 'read_wo_files') {
      let woId = input.wo_id
      if (!woId && input.wo_title) {
        const { data: found } = await supabaseAdmin
          .from('work_orders').select('id').ilike('title', '%' + input.wo_title + '%').maybeSingle()
        if (!found) return 'Could not find work order: ' + input.wo_title
        woId = found.id
      }
      if (!woId) return 'Error: provide wo_id or wo_title'

      const { data: files } = await supabaseAdmin
        .from('wo_files').select('id, name, storage_path, mime_type, size_bytes')
        .eq('work_order_id', woId).order('created_at', { ascending: false })
      if (!files?.length) return 'No files attached to this work order.'

      const results: string[] = []
      for (const file of files.slice(0, 5)) {
        const { data: signed } = await supabaseAdmin.storage.from('ab-files').createSignedUrl(file.storage_path, 300)
        if (!signed?.signedUrl) { results.push('File: ' + file.name + ' (could not generate URL)'); continue }

        const isText = file.mime_type?.includes('text') || file.name.endsWith('.csv') || file.name.endsWith('.txt') || file.name.endsWith('.md')
        const isPdf = file.mime_type?.includes('pdf') || file.name.endsWith('.pdf')
        const isDoc = file.name.endsWith('.docx') || file.name.endsWith('.doc')

        if (isText) {
          try {
            const res = await fetch(signed.signedUrl)
            const text = await res.text()
            results.push('=== ' + file.name + ' ===\n' + text.substring(0, 4000) + (text.length > 4000 ? '\n...(truncated)' : ''))
          } catch { results.push('File: ' + file.name + ' (download failed)') }
        } else if (isPdf) {
          try {
            const res = await fetch(signed.signedUrl)
            const buffer = Buffer.from(await res.arrayBuffer())
            const pdfParse = await import('pdf-parse')
            const parsed = await (pdfParse as any).default(buffer)
            results.push('=== ' + file.name + ' (PDF) ===\n' + (parsed.text || '').substring(0, 4000))
          } catch (e: any) { results.push('File: ' + file.name + ' (PDF parse failed: ' + e.message + ')') }
        } else if (isDoc) {
          try {
            const res = await fetch(signed.signedUrl)
            const buffer = Buffer.from(await res.arrayBuffer())
            const mammoth = await import('mammoth')
            const result = await mammoth.extractRawText({ buffer })
            results.push('=== ' + file.name + ' (Word doc) ===\n' + (result.value || '').substring(0, 4000))
          } catch (e: any) { results.push('File: ' + file.name + ' (DOCX parse failed: ' + e.message + ')') }
        } else {
          results.push('File: ' + file.name + ' (' + (file.mime_type || 'binary') + ') — cannot read this file type')
        }
      }
      return 'Files on this work order:\n\n' + results.join('\n\n')
    }

    return 'Unknown tool: ' + name
  } catch (e: any) {
    return 'Tool error: ' + e.message
  }
}



export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { message, channel, parent_id, thread_posts, work_order_id, work_order_title } = await req.json()

  // Extract WO title from: explicit field > thread messages > message body
  function extractWoHint(): string | null {
    if (work_order_title) return work_order_title
    if (work_order_id) return work_order_id
    // Scan thread_posts for WO link text patterns
    const allText = [message, ...(thread_posts || []).map((p: any) => p.body || '')].join(' ')
    // Match patterns like "Apollo Supply — Some Title" or WO IDs
    const woIdMatch = allText.match(/WO-[a-f0-9]{6,10}/i)
    if (woIdMatch) return woIdMatch[0]
    return null
  }
  const woHint = extractWoHint()

  const { data: member } = await supabaseAdmin
    .from('team_members')
    .select('id, name, role')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (!member) return NextResponse.json({ error: 'Member not found' }, { status: 404 })

  const level = member.role === 'owner' ? 'owner' : member.role === 'admin' ? 'admin' : 'team'

  const { data: wos } = await supabaseAdmin
    .from('work_orders')
    .select(`id, title, stage, client_id, due_date, priority,
             clients!work_orders_client_id_fkey(name),
             services!work_orders_service_id_fkey(name),
             team_members!work_orders_owner_id_fkey(name, auth_user_id),
             wo_assignees(team_members(name, auth_user_id))`)
    .not('stage', 'in', '(archived,paid)')
    .order('created_at', { ascending: false })
    .limit(300)

  const { data: reportRows } = await supabaseAdmin
    .from('report_data')
    .select('client_id, month, section, platform, metric, value, clients!report_data_client_id_fkey(name)')
    .order('month', { ascending: false })
    .limit(1000)

  const reportByClient: Record<string, Record<string, any>> = {}
  ;(reportRows || []).forEach((r: any) => {
    const clientName = r.clients?.name || r.client_id
    if (!reportByClient[clientName]) reportByClient[clientName] = {}
    reportByClient[clientName][r.month+'|'+r.section+'|'+r.platform+'|'+r.metric] = r.value
  })

  const reportSummary = Object.entries(reportByClient).slice(0, 14).map(([client, data]) => {
    const months = [...new Set(Object.keys(data).map(k => k.split('|')[0]))].sort().reverse().slice(0, 2)
    const lines = months.map(month => {
      const metrics = Object.entries(data)
        .filter(([k]) => k.startsWith(month))
        .map(([k, v]) => { const p = k.split('|'); return p[1]+'/'+p[2]+'/'+p[3]+': '+v })
        .slice(0, 12).join(', ')
      return '  ' + month + ': ' + metrics
    }).join('\n')
    return client + ':\n' + lines
  }).join('\n\n')

    const filteredWos = level === 'team'
    ? (wos || []).filter((w: any) =>
        w.team_members?.auth_user_id === user.id ||
        (w.wo_assignees || []).some((a: any) => a.team_members?.auth_user_id === user.id)
      )
    : (wos || [])

  const woList = filteredWos.slice(0, 150).map((w: any) => {
    const assignees = (w.wo_assignees || []).map((a: any) => a.team_members?.name).filter(Boolean).join(', ')
    return `- [${w.stage}] ${w.title} | Client: ${w.clients?.name || '?'} | Due: ${w.due_date || 'none'} | Owner: ${w.team_members?.name || 'unassigned'}${assignees ? ' | Assignees: ' + assignees : ''}`
  }).join('\n')

  const threadMessages = (thread_posts || []) as any[]
  const threadContext = threadMessages.length > 0
    ? '\n\nTHREAD CONTEXT (full conversation so far):\n' +
      threadMessages.map((p: any) => `${p.author}: ${p.body}`).join('\n')
    : ''
  
  // Build WO hint string for system prompt
  const woHintLine = woHint
    ? `\n\nIMPORTANT: This conversation references a work order. Hint: "${woHint}". Use get_wo_detail and/or read_wo_files immediately to pull its content — do NOT ask the user to tell you which WO it is.`
    : ''

  const now = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

  const systemPrompt = `You are Pancho, the A&B Consulting Group internal AI assistant living in the team's HQ wall — like Claude in Slack. You are helpful, concise, and friendly. You know the team and their work well.

Today is ${now}. You are talking with ${member.name} (${level} level).

ACTIVE WORK ORDERS:
${woList}

CLIENT REPORT DATA:
${reportSummary}

RULES:
- Keep replies short and conversational — this is a team chat, not a report
- Never share financial/cost data with team-level users  
- Answer questions about WOs, clients, performance, and operations
- You CAN share marketing metrics (ads, GMB, social) with all team members
- When asked about client performance pull numbers from report data
- Be direct and actionable
- Channel context: ${channel}${threadContext}${woHintLine}`

  const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 800,
      system: systemPrompt,
      tools: WALL_TOOLS,
      messages: (() => {
        // Build real conversation history from thread so Claude has full context
        if (threadMessages.length === 0) {
          return [{ role: 'user', content: message }]
        }
        // Interleave thread posts as user/assistant turns
        const history: any[] = []
        for (const post of threadMessages) {
          const isPancho = post.author === 'Pancho' || post.authorId === PANCHO_AUTHOR_ID
          history.push({ role: isPancho ? 'assistant' : 'user', content: post.body })
        }
        // Add the current triggering message
        history.push({ role: 'user', content: message })
        // Claude requires alternating turns — merge consecutive same-role messages
        const merged: any[] = []
        for (const turn of history) {
          if (merged.length > 0 && merged[merged.length - 1].role === turn.role) {
            merged[merged.length - 1].content += '\n' + turn.content
          } else {
            merged.push({ ...turn })
          }
        }
        // Must start with user
        if (merged[0]?.role === 'assistant') merged.shift()
        return merged.length > 0 ? merged : [{ role: 'user', content: message }]
      })(),
    }),
  })

  if (!anthropicRes.ok) {
    console.error('Pancho wall API error:', await anthropicRes.text())
    return NextResponse.json({ error: 'AI error' }, { status: 500 })
  }

  let aiData = await anthropicRes.json()

  // Handle tool_use — execute tools and follow up
  if (aiData.stop_reason === 'tool_use') {
    const toolUseBlocks = aiData.content.filter((b: any) => b.type === 'tool_use')
    const toolResults: any[] = []
    for (const block of toolUseBlocks) {
      const result = await executeWallTool(block.name, block.input)
      toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result })
    }
    const followUpRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 800,
        system: systemPrompt,
        tools: WALL_TOOLS,
        messages: (() => {
          const base: any[] = []
          for (const post of threadMessages) {
            const isPancho = post.author === 'Pancho' || post.authorId === PANCHO_AUTHOR_ID
            base.push({ role: isPancho ? 'assistant' : 'user', content: post.body })
          }
          base.push({ role: 'user', content: message })
          base.push({ role: 'assistant', content: aiData.content })
          base.push({ role: 'user', content: toolResults })
          // Merge consecutive same-role, ensure starts with user
          const merged: any[] = []
          for (const turn of base) {
            if (merged.length > 0 && merged[merged.length - 1].role === turn.role) {
              merged[merged.length - 1].content += typeof turn.content === 'string'
                ? '\n' + turn.content : turn.content
            } else { merged.push({ ...turn }) }
          }
          if (merged[0]?.role === 'assistant') merged.shift()
          return merged
        })(),
      }),
    })
    if (!followUpRes.ok) return NextResponse.json({ error: 'AI follow-up error' }, { status: 500 })
    aiData = await followUpRes.json()
  }

  const reply = aiData.content?.find((b: any) => b.type === 'text')?.text?.trim()
  if (!reply) return NextResponse.json({ error: 'No reply' }, { status: 500 })

  // Insert as Pancho using service role (bypasses RLS)
  // author_id uses Pancho's fixed UUID — stored in wall_posts, rendered specially client-side
  const { data: post, error: postErr } = await supabaseAdmin
    .from('wall_posts')
    .insert({
      channel,
      parent_id: parent_id || null,
      author_id: PANCHO_AUTHOR_ID,
      body: reply,
      mentions: [],
      work_order_id: null,
    })
    .select()
    .single()

  if (postErr) {
    console.error('Pancho post error:', postErr)
    return NextResponse.json({ error: postErr.message }, { status: 500 })
  }

  return NextResponse.json({ post })
}
