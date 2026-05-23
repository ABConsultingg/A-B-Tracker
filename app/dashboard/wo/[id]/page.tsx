import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import WoDetail from './WoDetail'

export default async function WoDetailPage({
  params,
  searchParams,
}: {
  params: { id: string }
  searchParams: { tab?: string }
}) {
  const supabase = createClient()

  const { data: wo } = await supabase
    .from('work_orders')
    .select(`*,
      clients!work_orders_client_id_fkey(id, name),
      services!work_orders_service_id_fkey(id, name, category),
      team_members!work_orders_owner_id_fkey(id, name)`)
    .eq('id', params.id)
    .single()

  if (!wo) notFound()

  // All line items (used by Overview Costs total)
  const { data: lineItems } = await supabase
    .from('wo_line_items')
    .select('id, description, qty, unit_price, total, sort_order, source, campaign_item_id')
    .eq('work_order_id', params.id)
    .order('sort_order', { ascending: true })

  // Assignees for People card
  const { data: assigneeRows } = await supabase
    .from('wo_assignees')
    .select('team_members(id, name)')
    .eq('work_order_id', params.id)

  const assignees = (assigneeRows || [])
    .map((r: any) => r.team_members)
    .filter(Boolean)

  // Tasks (Step 5 Commit B will consume)
  const { data: tasks } = await supabase
    .from('wo_tasks')
    .select('*')
    .eq('work_order_id', params.id)
    .order('sort_order', { ascending: true })

  // Comments (Step 5 Commit C will consume)
  const { data: comments } = await supabase
    .from('wo_comments')
    .select('*')
    .eq('work_order_id', params.id)
    .order('created_at', { ascending: true })

  // Schedule rows (Session 12 Pass 1)
  const { data: schedule } = await supabase
    .from('wo_schedule')
    .select('*')
    .eq('work_order_id', params.id)
    .order('sort_order', { ascending: true })
    .order('scheduled_date', { ascending: true })

  // Full team list for assignee dropdowns + @mention candidates
  const { data: team } = await supabase
    .from('team_members')
    .select('id, name, auth_user_id')
    .order('name', { ascending: true })

  // Build authUserMap: auth_user_id -> team member name
  const authUserMap: Record<string, string> = {}
  ;(team || []).forEach((t: any) => {
    if (t.auth_user_id) authUserMap[t.auth_user_id] = t.name
  })

  // Current logged-in user (for ownership checks on comments)
  const { data: userData } = await supabase.auth.getUser()
  const currentUserId = userData.user?.id || null

  return (
    <WoDetail
      wo={wo as any}
      lineItems={lineItems || []}
      assignees={assignees}
      initialTab={searchParams.tab}
      tasks={tasks || []}
      comments={comments || []}
      team={team || []}
      authUserMap={authUserMap}
      currentUserId={currentUserId}
      schedule={schedule || []}
    />
  )
}
