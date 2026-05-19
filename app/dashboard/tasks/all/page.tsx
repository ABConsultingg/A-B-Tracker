import { createClient } from '@/lib/supabase/server'
import AllTasksClient from '@/components/work-orders/AllTasksClient'

export const dynamic = 'force-dynamic'

export default async function AllTasksPage() {
  const supabase = createClient()

  // Fetch all tasks across all team members, joined with WO + client + service + assignee.
  const { data: tasks } = await supabase
    .from('wo_tasks')
    .select(`
      *,
      work_orders!wo_tasks_work_order_id_fkey(
        id, title, stage, owner_id, due_date,
        clients!work_orders_client_id_fkey(name),
        services!work_orders_service_id_fkey(name)
      ),
      team_members!wo_tasks_assignee_id_fkey(id, name)
    `)
    .order('due_date', { ascending: true, nullsFirst: false })

  // Drop tasks belonging to paid/archived WOs (matches My Tasks behavior)
  const visibleTasks = (tasks || []).filter((t: any) =>
    t.work_orders && !['paid', 'archived'].includes(t.work_orders.stage)
  )

  // Fetch team list for the assignee filter dropdown
  const { data: allTeam } = await supabase
    .from('team_members')
    .select('id, name')
    .order('name')

  // Distinct client list for the client filter dropdown
  const { data: allClients } = await supabase
    .from('clients')
    .select('id, name')
    .order('name')

  return (
    <AllTasksClient
      tasks={visibleTasks}
      allTeam={allTeam || []}
      allClients={allClients || []}
    />
  )
}
