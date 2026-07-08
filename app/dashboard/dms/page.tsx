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
    .select('id, from_member_id, to_member_id, body, wo_id, sent_via, read_at, created_at, attachment_url, attachment_type')
    .or(`to_member_id.eq.${memberId},from_member_id.eq.${memberId}`)
    .order('created_at', { ascending: false })
    .limit(100) : { data: [] }

  const { data: team } = await supabase
    .from('team_members')
    .select('id, name')
    .eq('active', true)

  // Load reactions for these DMs
  const dmIds = (dms ?? []).map(d => d.id)
  const { data: reactions } = dmIds.length > 0
    ? await supabase
        .from('dm_reactions')
        .select('dm_id, member_id, emoji')
        .in('dm_id', dmIds)
    : { data: [] }

  // Generate signed URLs for DMs with file attachments (attachment_url = storage path)
  const signedUrls: Record<string, string> = {}
  for (const dm of dms ?? []) {
    if (dm.attachment_url && dm.attachment_url.startsWith('dms/')) {
      const { data } = await supabase.storage
        .from('ab-files')
        .createSignedUrl(dm.attachment_url, 60 * 60 * 24)
      if (data?.signedUrl) signedUrls[dm.id] = data.signedUrl
    }
  }

  return (
    <div className="p-4 max-w-3xl mx-auto">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-900">✦ Pancho Direct</h1>
        <p className="text-sm text-gray-500 mt-1">Private messages from Pancho and your team</p>
      </div>
      <DmsClient
        initialDms={dms || []}
        team={team || []}
        currentMemberId={memberId || ''}
        initialReactions={reactions || []}
        initialSignedUrls={signedUrls}
      />
    </div>
  )
}
