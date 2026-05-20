import { createClient } from '@/lib/supabase/server'
import BoardClient from '@/components/work-orders/BoardClient'

export default async function DashboardPage() {
  const supabase = createClient()

  // Current user's team_member row — needed so BoardClient knows if it's an admin
  const { data: { user } } = await supabase.auth.getUser()
  const { data: currentMember } = user
    ? await supabase.from('team_members').select('id, role').eq('auth_user_id', user.id).maybeSingle()
    : { data: null }

  const { data: workOrders } = await supabase
    .from('work_orders')
    .select(`
      *,
      clients!work_orders_client_id_fkey(name),
      services!work_orders_service_id_fkey(name, category),
      team_members!work_orders_owner_id_fkey(name)
    `)
    .not('stage', 'eq', 'archived')
    .order('created_at', { ascending: false })
    .limit(500)

  const { data: clients } = await supabase
    .from('clients').select('id, name').order('name')

  const { data: services } = await supabase
    .from('services').select('id, name, category, base_price, occurrence, lead_time_days, description').order('name')

  const { data: team } = await supabase
    .from('team_members').select('id, name, role, auth_user_id').order('name')
  const { data: clientRates } = await supabase
    .from('client_rates')
    .select('id, client_id, service_id, price, notes, effective_from, created_at')

  // Load all tasks for the visible work orders, then aggregate in-process.
  const woIds = (workOrders || []).map(w => w.id)
  const today = new Date().toISOString().substring(0, 10)

  type TaskRow = { work_order_id: string; status: string; due_date: string | null }
  const { data: taskRows } = woIds.length
    ? await supabase
        .from('wo_tasks')
        .select('work_order_id, status, due_date')
        .in('work_order_id', woIds)
    : { data: [] as TaskRow[] }

  const taskAggregates: Record<string, { total: number; done: number; overdue: number }> = {}
  ;(taskRows || []).forEach((t: TaskRow) => {
    if (!taskAggregates[t.work_order_id]) {
      taskAggregates[t.work_order_id] = { total: 0, done: 0, overdue: 0 }
    }
    const agg = taskAggregates[t.work_order_id]
    agg.total += 1
    if (t.status === 'done') agg.done += 1
    else if (t.due_date && t.due_date < today) agg.overdue += 1
  })

  // Load assignees per WO, same shape.
  type AssigneeRow = { work_order_id: string; team_member_id: string }
  const { data: assigneeRows } = woIds.length
    ? await supabase
        .from('wo_assignees')
        .select('work_order_id, team_member_id')
        .in('work_order_id', woIds)
    : { data: [] as AssigneeRow[] }

  const assignmentsByWo: Record<string, string[]> = {}
  ;(assigneeRows || []).forEach((a: AssigneeRow) => {
    if (!assignmentsByWo[a.work_order_id]) assignmentsByWo[a.work_order_id] = []
    assignmentsByWo[a.work_order_id].push(a.team_member_id)
  })

  // Load line item totals per WO. Admins only — RLS will return empty for
  // non-admins, so the lineItemTotalsByWo map stays empty for them. The
  // generated `total` column on wo_line_items already does the qty * unit_price
  // math; we just sum it per WO here.
  type LineItemRow = { work_order_id: string; total: number }
  const { data: lineItemRows } = woIds.length
    ? await supabase
        .from('wo_line_items')
        .select('work_order_id, total')
        .in('work_order_id', woIds)
    : { data: [] as LineItemRow[] }

  const lineItemTotalsByWo: Record<string, number> = {}
  ;(lineItemRows || []).forEach((r: LineItemRow) => {
    lineItemTotalsByWo[r.work_order_id] = (lineItemTotalsByWo[r.work_order_id] || 0) + (r.total || 0)
  })

  return (
    <BoardClient
      initialWorkOrders={workOrders || []}
      clients={clients || []}
      services={services || []}
      team={team || []}
      taskAggregates={taskAggregates}
      assignmentsByWo={assignmentsByWo}
      lineItemTotalsByWo={lineItemTotalsByWo}
      currentMember={currentMember}
      clientRates={clientRates || []}
    />
  )
}
