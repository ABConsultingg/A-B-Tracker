import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Sidebar, { type SidebarCounts, type ClientBadge, type TeamMemberBadge } from '@/components/layout/Sidebar'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: member } = await supabase
    .from('team_members')
    .select('*')
    .eq('auth_user_id', user.id)
    .single()

  // Sidebar counts. Existing three (clients/allWos/myTasks) plus the new
  // quick-filter counts (assigned/owned/flagged/stale/overdue) and the
  // per-client active-WO list rendered in a dedicated section.
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

  // ----- Quick filter counts (board-applicable filters) -----

  // Assigned to me: join through wo_assignees and exclude done WOs
  if (member?.id) {
    const { data: assignedRows } = await supabase
      .from('wo_assignees')
      .select('work_order_id, work_orders!inner(stage)')
      .eq('team_member_id', member.id)
    const assignedActive = (assignedRows || []).filter((r: any) =>
      r.work_orders && !['paid', 'archived'].includes(r.work_orders.stage)
    )
    counts.assignedToMe = assignedActive.length
  }

  // Owned by me: WOs where owner_id = current member id, excluding paid/archived
  if (member?.id) {
    const { count: ownedCount } = await supabase
      .from('work_orders')
      .select('id', { count: 'exact', head: true })
      .eq('owner_id', member.id)
      .not('stage', 'in', '(paid,archived)')
    counts.ownedByMe = ownedCount ?? 0
  }

  // Flagged: flagged=true, excluding paid/archived
  const { count: flaggedCount } = await supabase
    .from('work_orders')
    .select('id', { count: 'exact', head: true })
    .eq('flagged', true)
    .not('stage', 'in', '(paid,archived)')
  counts.flagged = flaggedCount ?? 0

  // Stale + overdue: fetch lightweight set, compute in JS (mirrors lib/sla.ts logic)
  const { data: liveWos } = await supabase
    .from('work_orders')
    .select('id, stage, due_date, stage_entered_at, submitted_at')
    .not('stage', 'in', '(paid,archived)')

  const STALE_DAYS = 10
  const now = Date.now()
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayMs = today.getTime()

  let staleCount = 0
  let overdueCount = 0
  ;(liveWos || []).forEach((w: any) => {
    // stale check
    const anchor = w.stage_entered_at || w.submitted_at
    if (anchor) {
      const days = Math.max(0, Math.floor((now - new Date(anchor).getTime()) / (1000 * 60 * 60 * 24)))
      if (days >= STALE_DAYS) staleCount++
    }
    // overdue check
    if (w.due_date) {
      const dueMs = new Date(w.due_date).setHours(0, 0, 0, 0)
      if (dueMs < todayMs) overdueCount++
    }
  })
  counts.stale = staleCount
  counts.overdue = overdueCount

  // ----- Clients section: each active client with WO count -----
  const { data: allClients } = await supabase
    .from('clients')
    .select('id, name')
    .order('name')

  const { data: woClientPairs } = await supabase
    .from('work_orders')
    .select('client_id, stage')
    .not('stage', 'eq', 'archived')

  const woCountByClient = new Map<string, number>()
  ;(woClientPairs || []).forEach((w: any) => {
    if (!w.client_id) return
    woCountByClient.set(w.client_id, (woCountByClient.get(w.client_id) || 0) + 1)
  })

  const clientBadges: ClientBadge[] = (allClients || [])
    .map((c: any) => ({ id: c.id, name: c.name, count: woCountByClient.get(c.id) || 0 }))
    .filter(c => c.count > 0)

  // ----- Team Tasks section: list every team member for quick-switch -----
  const { data: allTeam } = await supabase
    .from('team_members')
    .select('id, name, role')
    .order('name')

  const teamMemberBadges: TeamMemberBadge[] = (allTeam || []).map((m: any) => ({
    id: m.id,
    name: m.name,
    slug: m.name.toLowerCase().split(/\s+/)[0],
    isAdmin: m.role === 'admin',
  }))

  return (
    <div className="flex min-h-screen" style={{ background: 'var(--bg)' }}>
      <Sidebar
        member={member}
        counts={counts}
        clientBadges={clientBadges}
        teamMemberBadges={teamMemberBadges}
      />
      <main className="flex-1 overflow-y-auto pt-14 md:pt-0">{children}</main>
    </div>
  )
}
