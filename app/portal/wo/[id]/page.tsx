import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import PortalWoDetail from './PortalWoDetail'

export const dynamic = 'force-dynamic'

export default async function PortalWoPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // RLS ensures this only returns the WO if it belongs to the user's client.
  const { data: wo } = await supabase
    .from('work_orders')
    .select(`id, title, stage, due_date, est_cost, add_cost, deliverables_link, description, branch,
             services!work_orders_service_id_fkey(name)`)
    .eq('id', params.id)
    .maybeSingle()

  if (!wo) notFound()

  const woNorm: any = {
    ...wo,
    services: Array.isArray((wo as any).services)
      ? ((wo as any).services[0] ?? null)
      : (wo as any).services,
  }

  // Client-visible comments only (RLS enforces internal_only=false + own client).
  const { data: comments } = await supabase
    .from('wo_comments')
    .select('id, body, author_id, author_type, created_at')
    .eq('work_order_id', params.id)
    .order('created_at', { ascending: true })

  return (
    <PortalWoDetail wo={woNorm} initialComments={comments || []} currentUserId={user.id} />
  )
}
