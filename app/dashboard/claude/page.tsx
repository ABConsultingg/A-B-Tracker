import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ClaudeClient from './ClaudeClient'

export const dynamic = 'force-dynamic'

export default async function ClaudePage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: member } = await supabase
    .from('team_members')
    .select('id, name, role')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  return (
    <ClaudeClient
      authUserId={user.id}
      role={member?.role || 'team'}
      memberName={member?.name || 'Team'}
    />
  )
}
