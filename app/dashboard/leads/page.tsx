import { redirect } from 'next/navigation'
import { checkSalesAccess } from '@/lib/auth/sales'
import LeadsClient from './LeadsClient'

export const dynamic = 'force-dynamic'

export default async function LeadsPage() {
  // Leads are owner/sales only, matching the RLS policy on public.leads.
  // Without this, other roles could still reach the URL directly and would
  // land on a board that RLS renders empty.
  const { supabase, allowed, reason } = await checkSalesAccess()
  if (!allowed) redirect(reason === 'unauthenticated' ? '/login' : '/dashboard')

  const { data: leadsRaw } = await supabase
    .from('leads')
    .select('*')
    .order('created_at', { ascending: false })

  const { data: teamMembers } = await supabase
    .from('team_members')
    .select('id, name')
    .eq('active', true)
    .order('name')

  return (
    <LeadsClient
      initialLeads={leadsRaw || []}
      teamMembers={teamMembers || []}
    />
  )
}
