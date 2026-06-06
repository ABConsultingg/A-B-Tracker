import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import MeetingsClient from './MeetingsClient'

export const dynamic = 'force-dynamic'

export default async function MeetingsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: member } = await supabase
    .from('team_members')
    .select('id, name, role, auth_user_id')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  const { data: clients } = await supabase
    .from('clients')
    .select('id, name')
    .eq('status', 'active')
    .order('name')

  const { data: team } = await supabase
    .from('team_members')
    .select('id, name, auth_user_id')
    .eq('active', true)

  return (
    <MeetingsClient
      currentUserId={user.id}
      currentMember={member}
      clients={clients || []}
      team={team || []}
    />
  )
}
