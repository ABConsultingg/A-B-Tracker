import { createClient } from '@/lib/supabase/server'
import PortalClient from './PortalClient'

export const dynamic = 'force-dynamic'

export default async function PortalPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: pu } = user
    ? await supabase.from('portal_users').select('client_id, name').eq('auth_user_id', user.id).maybeSingle()
    : { data: null }

  const clientId = pu?.client_id || ''

  const { data: client } = await supabase
    .from('clients').select('id, name, company, looker_enabled, looker_url').eq('id', clientId).maybeSingle()

  // RLS scopes all of these to this client automatically.
  const { data: workOrders } = await supabase
    .from('work_orders')
    .select(`id, title, stage, service_id, due_date, est_cost, add_cost, created_at,
             deliverables_link, description, branch,
             services!work_orders_service_id_fkey(name)`)
    .order('created_at', { ascending: false })

  const { data: schedule } = await supabase
    .from('wo_schedule')
    .select('id, work_order_id, scheduled_date, scheduled_time, type, title, status')
    .order('scheduled_date', { ascending: true })

  // Active services for the request picker.
  const { data: services } = await supabase
    .from('services').select('id, name, active').eq('active', true).order('name')

  // Supabase types FK joins as arrays; flatten `services` to a single object.
  const normalizedWOs = (workOrders || []).map((w: any) => ({
    ...w,
    services: Array.isArray(w.services) ? (w.services[0] ?? null) : w.services,
  }))

  return (
    <PortalClient
      greetingName={pu?.name || ''}
      client={client || null}
      workOrders={normalizedWOs}
      schedule={schedule || []}
      services={services || []}
      currentUserId={user?.id || ''}
    />
  )
}
