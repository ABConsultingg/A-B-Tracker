import { createClient } from '@/lib/supabase/server'
import BoardClient from '@/components/work-orders/BoardClient'

export default async function DashboardPage() {
  const supabase = createClient()

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
    .from('services').select('id, name, category, base_price, occurrence').order('name')

  const { data: team } = await supabase
    .from('team_members').select('id, name, role, auth_user_id').order('name')

  // Load all tasks for the visible work orders, then aggregate in-process.
  // We avoid a SQL GROUP BY here because PostgREST doesn't expose aggregates
  // cleanly through @supabase/supabase-js; doing it in JS keeps the data
  // contract simple and the cost is negligible (a few thousand rows max).
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

  return (
    <BoardClient
      initialWorkOrders={workOrders || []}
      clients={clients || []}
      services={services || []}
      team={team || []}
      taskAggregates={taskAggregates}
      assignmentsByWo={assignmentsByWo}
    />
  )
}
