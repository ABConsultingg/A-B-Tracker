import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import PrintPricingClient from '@/components/print-pricing/PrintPricingClient'

export default async function PrintPricingPage() {
  const supabase = createClient()

  // Current user's team_member row — needed for admin gating
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: currentMember } = await supabase
    .from('team_members')
    .select('id, role')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  const { data: products } = await supabase
    .from('print_products')
    .select('id, name, spec, vendor, sort_order, active, created_at, updated_at')
    .order('sort_order', { ascending: true })
    .order('name')

  const { data: tiers } = await supabase
    .from('print_product_tiers')
    .select('id, product_id, qty, price, sort_order')

  return (
    <PrintPricingClient
      products={products || []}
      tiers={tiers || []}
      currentMember={currentMember || null}
    />
  )
}
