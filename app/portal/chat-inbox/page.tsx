import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ChatInboxClient, { type ChatSession } from './ChatInboxClient'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'Chat Inbox — A&B Portal' }

export default async function ChatInboxPage() {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: pu } = await supabase
    .from('portal_users')
    .select('client_id, active')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (!pu || pu.active === false) redirect('/dashboard')

  // No client_name filter here on purpose — the RLS policy on chatbot_sessions
  // scopes rows to this portal user's client. Filtering again in the query would
  // duplicate the rule and drift from it.
  const { data: sessions } = await supabase
    .from('chatbot_sessions')
    .select(`id, created_at, status, page_url, device, message_count, duration_seconds,
             booked_call, lead_captured, lead_name, lead_email, lead_company,
             services_mentioned, pain_points, transcript`)
    .order('created_at', { ascending: false })
    .limit(500)

  return <ChatInboxClient initialSessions={(sessions || []) as ChatSession[]} />
}
