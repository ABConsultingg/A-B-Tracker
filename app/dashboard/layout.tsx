import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Sidebar, { type SidebarCounts } from '@/components/layout/Sidebar'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: member } = await supabase
    .from('team_members')
    .select('*')
    .eq('auth_user_id', user.id)
    .single()

  // Sidebar counts — three lightweight head queries.
  // RLS does the access filtering; admins see all, team members see only what they're allowed.
  const counts: SidebarCounts = {}

  const { count: clientsCount } = await supabase
    .from('clients')
    .select('id', { count: 'exact', head: true })
  counts.clients = clientsCount ?? 0

  const { count: woCount } = await supabase
    .from('work_orders')
    .select('id', { count: 'exact', head: true })
    .not('stage', 'eq', 'archived')
  counts.allWos = woCount ?? 0

  if (member?.id) {
    const { count: myTasksCount } = await supabase
      .from('wo_tasks')
      .select('id', { count: 'exact', head: true })
      .eq('assignee_id', member.id)
      .neq('status', 'done')
    counts.myTasks = myTasksCount ?? 0
  }

  return (
    <div className="flex min-h-screen" style={{ background: 'var(--bg)' }}>
      <Sidebar member={member} counts={counts} />
      <main className="flex-1 overflow-y-auto pt-14 md:pt-0">{children}</main>
    </div>
  )
}
