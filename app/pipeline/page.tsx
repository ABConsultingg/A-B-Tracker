import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import PipelineClient from './PipelineClient'

export const dynamic = 'force-dynamic'

export default async function SalesPipelinePage() {
  const supabase = createClient()

  // This route sits outside /dashboard, so it inherits neither the middleware
  // matcher nor the dashboard layout's guard — gate it here.
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: leadsRaw } = await supabase
    .from('leads')
    .select('*')
    .order('created_at', { ascending: false })

  // Resolved server-side so "overdue" is stable across SSR/hydration and
  // anchored to the business's timezone rather than the server's UTC clock.
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date())

  return (
    <PipelineClient
      initialLeads={leadsRaw || []}
      today={today}
    />
  )
}
