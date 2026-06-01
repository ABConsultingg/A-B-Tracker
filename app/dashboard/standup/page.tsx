import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import StandupClient, { type WallPost, type TeamMember, type WoOption, type Reaction } from './StandupClient'

export const dynamic = 'force-dynamic'

export default async function StandupPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // All wall posts across every channel; client filters by active tab.
  const { data: posts } = await supabase
    .from('wall_posts')
    .select('id, channel, parent_id, author_id, body, mentions, pinned, work_order_id, created_at, edited_at')
    .order('created_at', { ascending: true })
    .limit(1000)

  // Reactions across all posts.
  const { data: reactions } = await supabase
    .from('wall_reactions')
    .select('id, post_id, user_id, emoji')

  // Team for mentions + who-posted strip.
  const { data: team } = await supabase.from('team_members').select('id, name, auth_user_id, active')
  const authMap: Record<string, string> = {}
  ;(team || []).forEach((t: any) => { if (t.auth_user_id) authMap[t.auth_user_id] = t.name })

  // Lightweight WO list for the link picker (active-ish, recent first).
  const { data: wos } = await supabase
    .from('work_orders')
    .select('id, title, clients!work_orders_client_id_fkey(name)')
    .order('created_at', { ascending: false })
    .limit(400)
  const woOptions: WoOption[] = (wos || []).map((w: any) => ({
    id: w.id,
    title: w.title || 'Untitled',
    clientName: w.clients?.name || null,
  }))

  return (
    <StandupClient
      initialPosts={(posts || []) as WallPost[]}
      initialReactions={(reactions || []) as Reaction[]}
      team={(team || []) as TeamMember[]}
      authMap={authMap}
      currentUserId={user.id}
      woOptions={woOptions}
    />
  )
}
