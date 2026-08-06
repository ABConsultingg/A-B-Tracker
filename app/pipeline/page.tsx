import { redirect } from 'next/navigation'
import { checkSalesAccess } from '@/lib/auth/sales'
import PipelineClient from './PipelineClient'

export const dynamic = 'force-dynamic'

export default async function SalesPipelinePage() {
  // This route sits outside /dashboard, so it inherits neither the middleware
  // matcher nor the dashboard layout's guard — gate it here. Sales data is
  // restricted to owner/sales, matching the RLS policy on public.leads.
  const { supabase, allowed, canSeeFinancials, reason } = await checkSalesAccess()
  if (!allowed) redirect(reason === 'unauthenticated' ? '/login' : '/dashboard')

  const { data: leadsRaw } = await supabase
    .from('leads')
    .select('*')
    .order('created_at', { ascending: false })

  // Assignee options: only people who can actually see the pipeline.
  const { data: teamMembers } = await supabase
    .from('team_members')
    .select('id, name')
    .in('role', ['owner', 'sales'])
    .eq('active', true)
    .order('name')

  // Resolved server-side so "overdue" is stable across SSR/hydration and
  // anchored to the business's timezone rather than the server's UTC clock.
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date())

  return (
    <PipelineClient
      initialLeads={leadsRaw || []}
      teamMembers={teamMembers || []}
      today={today}
      canSeeFinancials={canSeeFinancials}
    />
  )
}
