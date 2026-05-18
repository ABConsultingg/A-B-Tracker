import { createClient } from '@/lib/supabase/server'
import RecentChangesClient from '@/components/work-orders/RecentChangesClient'

export const dynamic = 'force-dynamic'

export default async function RecentChangesPage() {
  const supabase = createClient()

  // Get all WOs with client name
  const { data: workOrders } = await supabase
    .from('work_orders')
    .select(`id, title, created_at, updated_at, clients!work_orders_client_id_fkey(name)`)
    .order('updated_at', { ascending: false })
    .limit(500)

  // Get stage history
  const { data: history } = await supabase
    .from('wo_stage_history')
    .select('id, work_order_id, from_stage, to_stage, changed_at, changed_by')
    .order('changed_at', { ascending: false })
    .limit(200)

  // Team for name lookup
  const { data: team } = await supabase.from('team_members').select('id, name, auth_user_id')
  const authMap: Record<string, string> = {}
  ;(team || []).forEach((t: any) => { if (t.auth_user_id) authMap[t.auth_user_id] = t.name })

  const woMap: Record<string, any> = {}
  ;(workOrders || []).forEach((w: any) => { woMap[w.id] = w })

  const events: any[] = []

  // Created events
  ;(workOrders || []).forEach((w: any) => {
    events.push({
      id: `c-${w.id}`,
      type: 'created',
      woId: w.id,
      woTitle: w.title,
      clientName: w.clients?.name,
      at: w.created_at,
    })
    // Updated events (only if updated_at differs significantly from created_at)
    if (w.updated_at && w.created_at && new Date(w.updated_at).getTime() - new Date(w.created_at).getTime() > 60000) {
      events.push({
        id: `u-${w.id}`,
        type: 'updated',
        woId: w.id,
        woTitle: w.title,
        clientName: w.clients?.name,
        at: w.updated_at,
      })
    }
  })

  // Stage change events
  ;(history || []).forEach((h: any) => {
    const wo = woMap[h.work_order_id]
    if (!wo) return
    events.push({
      id: `s-${h.id}`,
      type: 'stage_change',
      woId: h.work_order_id,
      woTitle: wo.title,
      clientName: wo.clients?.name,
      at: h.changed_at,
      by: h.changed_by ? authMap[h.changed_by] : undefined,
      fromStage: h.from_stage,
      toStage: h.to_stage,
    })
  })

  // Sort newest first
  events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())

  return <RecentChangesClient events={events.slice(0, 200)} />
}
