import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AccountClient from './AccountClient'

export default async function AccountPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: member } = await supabase.from('team_members').select('id').eq('auth_user_id', user.id).maybeSingle()
  return <AccountClient email={user.email || ''} memberId={member?.id || ''} />
}
