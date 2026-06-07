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

  // Current user's role — drives admin-only UI (cost amounts on Overview, etc.)
  const { data: { user } } = await supabase.auth.getUser()
  let isAdmin = false
  if (user) {
    const { data: currentMember } = await supabase
      .from('team_members')
      .select('role')
      .eq('auth_user_id', user.id)
      .single()
    isAdmin = currentMember?.role === 'admin' || currentMember?.role === 'owner'
  }

  const { data: wo } = await supabase
    .from('work_orders')
    .select(`*,
      clients!work_orders_client_id_fkey(id, name),
      services!work_orders_service_id_fkey(id, name, category),
      team_members!work_orders_owner_id_fkey(id, name)`)
    .eq('id', params.id)
    .single()

  if (!wo) notFound()

  // All line items (used by Overview Costs total)
  const { data: lineItems } = await supabase
    .from('wo_line_items')
    .select('id, description, qty, unit_price, total, sort_order, source, campaign_item_id')
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

  // Tasks (Step 5 Commit B will consume)
  const { data: tasks } = await supabase
    .from('wo_tasks')
    .select('*')
    .eq('work_order_id', params.id)
    .order('sort_order', { ascending: true })

  // Comments (Step 5 Commit C will consume)
  const { data: comments } = await supabase
    .from('wo_comments')
    .select('*')
    .eq('work_order_id', params.id)
    .order('created_at', { ascending: true })

  // Schedule rows (Session 12 Pass 1)
  const { data: schedule } = await supabase
    .from('wo_schedule')
    .select('*')
    .eq('work_order_id', params.id)
    .order('sort_order', { ascending: true })
    .order('scheduled_date', { ascending: true })

  // Vendor invoices for this WO (Session 12 vendor invoices PR)
  // Match by direct FK OR by wo_number_text (Apps Script writes the parsed
  // text first, FK gets set when match is confirmed)
  const woShortId = params.id.slice(0, 8)
  const { data: vendorInvoices } = await supabase
    .from('wo_vendor_invoices')
    .select('*')
    .or(`work_order_id.eq.${params.id},wo_number_text.ilike.%${woShortId}%`)
    .order('invoice_date', { ascending: false })

  // Deliverable links (Files tab)
  const { data: woLinks } = await supabase
    .from('wo_links')
    .select('*')
    .eq('work_order_id', params.id)
    .order('sort_order', { ascending: true })

  // Full team list for assignee dropdowns + @mention candidates
  const { data: team } = await supabase
    .from('team_members')
    .select('id, name, auth_user_id')
    .order('name', { ascending: true })

  // Build authUserMap: auth_user_id -> team member name
  const authUserMap: Record<string, string> = {}
  ;(team || []).forEach((t: any) => {
    if (t.auth_user_id) authUserMap[t.auth_user_id] = t.name
  })

  // Current logged-in user (for ownership checks on comments)
  const { data: userData } = await supabase.auth.getUser()
  const currentUserId = userData.user?.id || null

  return (
    <WoDetail
      wo={wo as any}
      lineItems={lineItems || []}
      assignees={assignees}
      initialTab={searchParams.tab}
      tasks={tasks || []}
      comments={comments || []}
      team={team || []}
      authUserMap={authUserMap}
      currentUserId={currentUserId}
      schedule={schedule || []}
      vendorInvoices={vendorInvoices || []}
      woLinks={woLinks || []}
      isAdmin={isAdmin}
    />
  )
}
