import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import DmsClient from './DmsClient'

export const dynamic = 'force-dynamic'

export default async function DmsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: memberRow } = await supabase
    .from('team_members')
    .select('id, name')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  const memberId = memberRow?.id

  const { data: dms } = memberId ? await supabase
    .from('direct_messages')
    .select('id, from_member_id, to_member_id, body, wo_id, sent_via, read_at, created_at')
    .or(`to_member_id.eq.${memberId},from_member_id.eq.${memberId}`)
    .order('created_at', { ascending: false })
    .limit(100) : { data: [] }

  const { data: team } = await supabase
    .from('team_members')
    .select('id, name')
    .eq('active', true)

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">✦ Mav Direct</h1>
        <p className="text-sm text-gray-500 mt-1">Private messages from Mav and your team</p>
      </div>
      <DmsClient
        initialDms={dms || []}
        team={team || []}
        currentMemberId={memberId || ''}
      />
    </div>
  )
}
