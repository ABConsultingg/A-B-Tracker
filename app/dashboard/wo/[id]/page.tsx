import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import WoDetail from './WoDetail'

export default async function WoDetailPage({
  params,
  searchParams,
}: {
  params: { id: string }
  searchParams: { tab?: string }
}) {
  const supabase = createClient()

  const { data: wo } = await supabase
    .from('work_orders')
    .select(`*,
      clients!work_orders_client_id_fkey(id, name),
      services!work_orders_service_id_fkey(id, name, category),
      team_members!work_orders_owner_id_fkey(id, name)`)
    .eq('id', params.id)
    .single()

  if (!wo) notFound()

  // Line items for Costs card
  const { data: lineItems } = await supabase
    .from('wo_line_items')
    .select('id, description, qty, unit_price, total, sort_order')
    .eq('work_order_id', params.id)
    .order('sort_order', { ascending: true })

  // Assignees for People card
  const { data: assigneeRows } = await supabase
    .from('wo_assignees')
    .select('team_members(id, name)')
    .eq('work_order_id', params.id)

  const assignees = (assigneeRows || [])
    .map((r: any) => r.team_members)
    .filter(Boolean)

  return (
    <WoDetail
      wo={wo as any}
      lineItems={lineItems || []}
      assignees={assignees}
      initialTab={searchParams.tab}
    />
  )
}
