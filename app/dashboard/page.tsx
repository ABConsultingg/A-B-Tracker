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
    .from('team_members').select('id, name, role').order('name')

  return (
    <BoardClient
      initialWorkOrders={workOrders || []}
      clients={clients || []}
      services={services || []}
      team={team || []}
    />
  )
}
