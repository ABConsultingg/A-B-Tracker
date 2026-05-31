import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import MessagesInboxClient, { type InboxComment, type WoMeta, type TeamMember } from './MessagesInboxClient'

export const dynamic = 'force-dynamic'

export default async function MessagesPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Recent comments across all WOs.
  const { data: comments } = await supabase
    .from('wo_comments')
    .select('id, work_order_id, body, author_id, mentions, internal_only, created_at, edited_at')
    .order('created_at', { ascending: false })
    .limit(300)

  // WO titles + client names for the comments we fetched.
  const woIds = Array.from(new Set((comments || []).map((c: any) => c.work_order_id)))
  const woMap: Record<string, WoMeta> = {}
  if (woIds.length > 0) {
    const { data: wos } = await supabase
      .from('work_orders')
      .select(`id, title, clients!work_orders_client_id_fkey(name)`)
      .in('id', woIds)
    ;(wos || []).forEach((w: any) => {
      woMap[w.id] = { title: w.title, clientName: w.clients?.name }
    })
  }

  // Team: name lookup + mention autocomplete source.
  const { data: team } = await supabase.from('team_members').select('id, name, auth_user_id')
  const authMap: Record<string, string> = {}
  ;(team || []).forEach((t: any) => { if (t.auth_user_id) authMap[t.auth_user_id] = t.name })

  // This user's read markers: { workOrderId: lastSeenISO }.
  const { data: reads } = await supabase
    .from('wo_message_reads')
    .select('work_order_id, last_seen_at')
    .eq('user_id', user.id)
  const readMap: Record<string, string> = {}
  ;(reads || []).forEach((r: any) => { readMap[r.work_order_id] = r.last_seen_at })

  const rows: InboxComment[] = (comments || []).map((c: any) => ({
    id: c.id,
    workOrderId: c.work_order_id,
    woTitle: woMap[c.work_order_id]?.title || 'Work order',
    clientName: woMap[c.work_order_id]?.clientName,
    body: c.body,
    authorId: c.author_id,
    authorName: c.author_id ? (authMap[c.author_id] || 'Someone') : 'Someone',
    mentions: c.mentions || [],
    internalOnly: c.internal_only,
    createdAt: c.created_at,
    editedAt: c.edited_at,
  }))

  return (
    <MessagesInboxClient
      rows={rows}
      woMeta={woMap}
      authMap={authMap}
      team={(team || []) as TeamMember[]}
      currentUserId={user.id}
      reads={readMap}
    />
  )
}
