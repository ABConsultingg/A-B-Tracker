import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ServicesClient from '@/components/services/ServicesClient'
import PrintPricingClient from '@/components/print-pricing/PrintPricingClient'

export default async function ServicesPage({
  searchParams,
}: {
  searchParams: { tab?: string }
}) {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: currentMember } = await supabase
    .from('team_members')
    .select('id, role')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  // ── Services data ────────────────────────────────────────────────────────
  const { data: services } = await supabase
    .from('services')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('name')

  const { data: woRefs } = await supabase
    .from('work_orders')
    .select('service_id')
    .not('service_id', 'is', null)

  const usageCounts: Record<string, number> = {}
  ;(woRefs || []).forEach((r: any) => {
    if (r.service_id) usageCounts[r.service_id] = (usageCounts[r.service_id] || 0) + 1
  })

  const { data: clientRates } = await supabase
    .from('client_rates')
    .select('id, client_id, service_id, price, notes, effective_from, created_at')

  const { data: clients } = await supabase
    .from('clients')
    .select('id, name')
    .order('name', { ascending: true })

  // ── Print Pricing data ───────────────────────────────────────────────────
  const { data: products } = await supabase
    .from('print_products')
    .select('id, name, spec, vendor, sort_order, active, created_at, updated_at')
    .order('sort_order', { ascending: true })
    .order('name')

  const { data: tiers } = await supabase
    .from('print_product_tiers')
    .select('id, product_id, qty, price, sort_order')

  const activeTab = searchParams.tab === 'print-pricing' ? 'print-pricing' : 'services'

  return (
    <div>
      {/* Tab bar */}
      <div style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg)', paddingTop: 24 }}>
        <div style={{ maxWidth: 1400, margin: '0 auto', paddingLeft: 24, paddingRight: 24 }}>
          <div style={{ display: 'flex', gap: 0 }}>
            <a
              href="/dashboard/services"
              style={{
                padding: '10px 20px',
                fontSize: 14,
                fontWeight: 500,
                borderBottom: activeTab === 'services' ? '2px solid var(--brand-accent, #b8860b)' : '2px solid transparent',
                color: activeTab === 'services' ? 'var(--text)' : 'var(--text-muted)',
                textDecoration: 'none',
              }}>
              Services
            </a>
            <a
              href="/dashboard/services?tab=print-pricing"
              style={{
                padding: '10px 20px',
                fontSize: 14,
                fontWeight: 500,
                borderBottom: activeTab === 'print-pricing' ? '2px solid var(--brand-accent, #b8860b)' : '2px solid transparent',
                color: activeTab === 'print-pricing' ? 'var(--text)' : 'var(--text-muted)',
                textDecoration: 'none',
              }}>
              Print Pricing
            </a>
          </div>
        </div>
      </div>

      {/* Tab content */}
      {activeTab === 'services' ? (
        <ServicesClient
          services={services || []}
          usageCounts={usageCounts}
          currentMember={currentMember}
          clientRates={clientRates || []}
          clients={clients || []}
        />
      ) : (
        <PrintPricingClient
          products={products || []}
          tiers={tiers || []}
          currentMember={currentMember || null}
        />
      )}
    </div>
  )
}
