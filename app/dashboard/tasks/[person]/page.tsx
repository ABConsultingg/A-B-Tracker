import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import TeamTasksClient from '@/components/work-orders/TeamTasksClient'

export const dynamic = 'force-dynamic'

export default async function TeamTasksPage({
  params,
}: {
  params: { person: string }
}) {
  const supabase = createClient()

  // Resolve target person — accept either the team_members.id (UUID) or the
  // lowercased first-name slug (e.g. "/dashboard/tasks/caro") for ergonomics.
  const slug = decodeURIComponent(params.person)
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug)

  let targetMember: { id: string; name: string; role: string } | null = null

  if (isUuid) {
    const { data } = await supabase
      .from('team_members')
      .select('id, name, role')
      .eq('id', slug)
      .maybeSingle()
    targetMember = data || null
  } else {
    // Slug lookup: match on lowercased first word of name
    const { data: allMembers } = await supabase
      .from('team_members')
      .select('id, name, role')
    const found = (allMembers || []).find((m: any) => {
      const first = m.name.toLowerCase().split(/\s+/)[0]
      return first === slug.toLowerCase()
    })
    targetMember = found || null
  }

  if (!targetMember) {
    notFound()
  }

  // Fetch all team members for the picker
  const { data: allTeam } = await supabase
    .from('team_members')
    .select('id, name, role')
    .order('name')

  // Fetch all tasks assigned to the target person, joined with WO context.
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
    .eq('assignee_id', targetMember.id)
    .order('due_date', { ascending: true, nullsFirst: false })

  const visibleTasks = (tasks || []).filter((t: any) =>
    t.work_orders && !['paid', 'archived'].includes(t.work_orders.stage)
  )

  return (
    <TeamTasksClient
      tasks={visibleTasks}
      targetMember={targetMember}
      allTeam={allTeam || []}
    />
  )
}
