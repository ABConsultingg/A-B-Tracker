import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: member } = await supabase
    .from('team_members')
    .select('id, role, active')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (!member?.active || (member.role !== 'admin' && member.role !== 'owner')) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const body = await req.json()
  const { title, client_id, notes, priority = 'medium', owner_name, assignee_name, due_date, service_id } = body

  // Map channel to service_id if not provided
  const CHANNEL_SERVICE: Record<string, string> = {
    'Google Ads': 'ab-ppc', 'Meta Ads': 'ab-ppc', 'Social': 'ab-social',
    'Email': 'ab-email', 'Website': 'ab-website', 'GMB': 'ab-reputation',
    'SEO': 'ab-seo', 'Video': 'ab-video', 'Design': 'ab-design',
  }
  const resolvedServiceId = service_id || 'ab-consulting-onetime'

  if (!title || !client_id) {
    return NextResponse.json({ error: 'title and client_id required' }, { status: 400 })
  }

  // Resolve owner — use named owner if provided, else fall back to current user
  let ownerId = member.id
  if (owner_name) {
    const { data: ownerMember } = await supabase
      .from('team_members')
      .select('id')
      .ilike('name', owner_name)
      .maybeSingle()
    if (ownerMember) ownerId = ownerMember.id
  }

  const { data, error } = await supabase
    .from('work_orders')
    .insert({
      title,
      client_id,
      owner_id: ownerId,
      service_id: resolvedServiceId,
      stage: 'not-started',
      priority,
      occurrence: 'One-time',
      notes: notes || '',
      due_date: due_date || null,
      submitted_at: new Date().toISOString(),
    })
    .select('id, title')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  // Add assignee if provided
  if (assignee_name && data) {
    const { data: assigneeMember } = await supabase
      .from('team_members')
      .select('id')
      .ilike('name', assignee_name)
      .maybeSingle()
    if (assigneeMember) {
      await supabase.from('wo_assignees').insert({ work_order_id: data.id, team_member_id: assigneeMember.id })
    }
  }

  return NextResponse.json({ ok: true, wo: data })
}
