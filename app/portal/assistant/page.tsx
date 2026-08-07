import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AssistantChat from '../AssistantChat'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'Assistant — A&B Portal' }

export default async function AssistantPage() {
  const supabase = createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: pu } = await supabase
    .from('portal_users')
    .select('client_id, active')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (!pu || pu.active === false) redirect('/dashboard')

  const { data: client } = await supabase
    .from('clients')
    .select('name, company')
    .eq('id', pu.client_id)
    .maybeSingle()

  const clientName = client?.company || client?.name || 'your business'

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 20px 48px' }}>
      <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 26, color: '#0f1b34', margin: 0 }}>
        Assistant
      </h1>
      <p style={{ color: '#6b7280', fontSize: 13.5, margin: '6px 0 18px' }}>
        Ask about your projects, deadlines, schedule, and social plan.
      </p>
      <AssistantChat clientName={clientName} variant="page" />
    </div>
  )
}
