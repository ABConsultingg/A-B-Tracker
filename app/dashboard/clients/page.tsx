import { createClient } from '@/lib/supabase/server'
import ClientsClient from '@/components/clients/ClientsClient'
export default async function ClientsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: currentMember } = user
    ? await supabase.from('team_members').select('id, role').eq('auth_user_id', user.id).maybeSingle()
    : { data: null }
  const { data: clients } = await supabase.from('clients').select('*').order('name')
  const { data: workOrders } = await supabase
    .from('work_orders')
    .select(`id, title, stage, client_id, service_id, est_cost, add_cost, due_date, priority,
             services!work_orders_service_id_fkey(name),
             team_members!work_orders_owner_id_fkey(name)`)
    .limit(2000)

  const { data: services } = await supabase
    .from('services')
    .select('id, name, base_price, occurrence, active')
    .order('name')

  const { data: clientRates } = await supabase
    .from('client_rates')
    .select('id, client_id, service_id, price, notes, effective_from, created_at')

  const { data: recurringServices } = await supabase
    .from('recurring_services')
    .select('client_id, amount, active')

  const { data: brandProfiles } = await supabase
    .from('social_brand_profiles')
    .select('*')
    .not('client_id', 'is', null)

  const { data: portalUsers } = await supabase
    .from('portal_users')
    .select('id, client_id, name, email, role, auth_user_id, active, last_login_at')

  return (
    <ClientsClient
      clients={clients || []}
      workOrders={workOrders || []}
      currentMember={currentMember}
      services={services || []}
      clientRates={clientRates || []}
      brandProfiles={brandProfiles || []}
      portalUsers={portalUsers || []}
      recurringServices={recurringServices || []}
    />
  )
}
