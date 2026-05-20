import { createClient } from '@/lib/supabase/server'
import ServicesClient from '@/components/services/ServicesClient'

export default async function ServicesPage() {
  const supabase = createClient()

  // Current user's role for admin gating
  const { data: { user } } = await supabase.auth.getUser()
  const { data: currentMember } = user
    ? await supabase.from('team_members').select('id, role').eq('auth_user_id', user.id).maybeSingle()
    : { data: null }

  const { data: services } = await supabase
    .from('services')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('name')

  // Count work orders per service so the delete button can be safely gated
  // and the modal shows "X work orders use this service".
  const { data: woRefs } = await supabase
    .from('work_orders')
    .select('service_id')
    .not('service_id', 'is', null)

  const usageCounts: Record<string, number> = {}
  ;(woRefs || []).forEach((r: any) => {
    if (r.service_id) usageCounts[r.service_id] = (usageCounts[r.service_id] || 0) + 1
  })

  // Per-client price overrides + minimal client list for the override picker
  const { data: clientRates } = await supabase
    .from('client_rates')
    .select('id, client_id, service_id, price, notes, effective_from, created_at')

  const { data: clients } = await supabase
    .from('clients')
    .select('id, name')
    .order('name', { ascending: true })

  return (
    <ServicesClient
      services={services || []}
      usageCounts={usageCounts}
      currentMember={currentMember}
      clientRates={clientRates || []}
      clients={clients || []}
    />
  )
}
