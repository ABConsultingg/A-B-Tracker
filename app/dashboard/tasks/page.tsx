import { createClient } from '@/lib/supabase/server'
import MyTasksClient from '@/components/work-orders/MyTasksClient'

export default async function MyTasksPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: member } = await supabase
    .from('team_members')
    .select('id, name')
    .eq('auth_user_id', user!.id)
    .single()

  if (!member) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">My Tasks</h1>
        <div className="text-center text-gray-500 py-12">
          No team member profile is linked to your account. Contact an admin.
        </div>
      </div>
    )
  }

  // Fetch all tasks assigned to the current user, joined with WO context.
  // Filter out tasks whose parent WO is paid or archived (matches Board behavior).
  const { data: tasks } = await supabase
    .from('wo_tasks')
    .select(`
      *,
      work_orders!wo_tasks_work_order_id_fkey(
        id, title, stage, owner_id, due_date,
        clients!work_orders_client_id_fkey(name),
        services!work_orders_service_id_fkey(name)
      )
    `)
    .eq('assignee_id', member.id)
    .order('due_date', { ascending: true, nullsFirst: false })

  // Drop tasks belonging to paid/archived WOs (RLS may already filter; this is belt+suspenders)
  const visibleTasks = (tasks || []).filter((t: any) =>
    t.work_orders && !['paid', 'archived'].includes(t.work_orders.stage)
  )

  return (
    <MyTasksClient
      tasks={visibleTasks}
      memberName={member.name}
    />
  )
}
