import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { transcript } = await req.json()
    if (!transcript) return NextResponse.json({ ok: false, error: 'No transcript' }, { status: 400 })

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return NextResponse.json({ ok: false, error: 'No ANTHROPIC_API_KEY' }, { status: 500 })

    // Fetch clients and team for context
    const { data: clients } = await supabaseAdmin.from('clients').select('id, name').eq('status', 'active').order('name')
    const { data: team } = await supabaseAdmin.from('team_members').select('id, name').eq('active', true)

    const clientList = (clients || []).map((c: any) => c.id + ' = ' + c.name).join(', ')
    const teamList = (team || []).map((t: any) => t.name).join(', ')

    const systemPrompt = `You are an expert meeting analyst for A&B Consulting Group, a digital marketing agency.
Extract structured data from meeting transcripts.

Available clients (id = name): ${clientList}
Team members: ${teamList}

Return ONLY valid JSON with this exact structure:
{
  "meeting_title": "Brief descriptive title",
  "meeting_date": "YYYY-MM-DD or null",
  "participants": ["name1", "name2"],
  "summary": "2-3 sentence summary of what was discussed",
  "action_items": [
    {
      "title": "Clear action item title",
      "assigned_to": "Team member name or null",
      "due_date": "YYYY-MM-DD or null",
      "client_id": "client id slug or null",
      "priority": "low|medium|high|urgent",
      "create_wo": true,
      "notes": "Additional context"
    }
  ],
  "decisions": ["Decision 1", "Decision 2"],
  "key_dates": [
    { "date": "YYYY-MM-DD", "description": "What happens on this date" }
  ],
  "out_of_office": [
    { "person": "Name", "from": "YYYY-MM-DD", "to": "YYYY-MM-DD", "reason": "reason" }
  ]
}

Rules:
- Set create_wo=true only for concrete deliverable tasks, not general discussions
- Map client names to their IDs from the list above
- Extract out-of-office mentions carefully
- Be specific with action item titles - they should be ready to use as WO titles`

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2048,
        system: systemPrompt,
        messages: [{ role: 'user', content: 'Extract action items from this transcript:\n\n' + transcript }],
      }),
    })

    const data = await res.json()
    const text = data.content?.[0]?.text || ''

    // Parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return NextResponse.json({ ok: false, error: 'Could not parse response' }, { status: 500 })

    const extracted = JSON.parse(jsonMatch[0])
    return NextResponse.json({ ok: true, extracted })
  } catch (e: any) {
    console.error('Meeting extract error:', e)
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}
