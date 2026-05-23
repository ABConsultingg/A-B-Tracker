import { createClient } from '@/lib/supabase/server'
import ScheduleGlobalView from './ScheduleGlobalView'

export const dynamic = 'force-dynamic'

export default async function SchedulePage() {
  const supabase = createClient()

  // All schedule rows + joined WO title/id + client id/name
  const { data: scheduleRows } = await supabase
    .from('wo_schedule')
    .select(`
      *,
      work_orders!wo_schedule_work_order_id_fkey (
        id,
        title,
        client_id,
        clients!work_orders_client_id_fkey ( id, name )
      )
    `)
    .order('scheduled_date', { ascending: true })
    .order('scheduled_time', { ascending: true })

  // Flatten the join so the client component gets a clean shape
  const rows = (scheduleRows || []).map((r: any) => ({
    id: r.id,
    work_order_id: r.work_order_id,
    scheduled_date: r.scheduled_date,
    scheduled_time: r.scheduled_time,
    type: r.type,
    title: r.title,
    owner_id: r.owner_id,
    status: r.status,
    sort_order: r.sort_order,
    calendar_synced: r.calendar_synced,
    google_event_id: r.google_event_id,
    wo_title: r.work_orders?.title || null,
    client_id: r.work_orders?.client_id || null,
    client_name: r.work_orders?.clients?.name || null,
  }))

  // Team list for owner names + owner filter
  const { data: team } = await supabase
    .from('team_members')
    .select('id, name')
    .order('name', { ascending: true })

  // Distinct clients for the client filter
  const clientMap = new Map<string, string>()
  rows.forEach((r: any) => {
    if (r.client_id && r.client_name) clientMap.set(r.client_id, r.client_name)
  })
  const clients = Array.from(clientMap.entries())
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name))

  return (
    <ScheduleGlobalView
      rows={rows}
      team={team || []}
      clients={clients}
    />
  )
}
