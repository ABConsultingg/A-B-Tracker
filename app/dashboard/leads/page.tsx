import { createClient } from '@/lib/supabase/server'
import LeadsClient from './LeadsClient'

export const dynamic = 'force-dynamic'

export default async function LeadsPage() {
  const supabase = createClient()

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
