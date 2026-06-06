import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ReportDashboard from './ReportDashboard'

export const dynamic = 'force-dynamic'

const CLIENTS: Record<string, { name: string; initials: string; color: string }> = {
  'nico-roofing':  { name: 'Nico Roofing & Exteriors', initials: 'NR', color: '#ef4444' },
  'culture':       { name: 'Culture Construction',      initials: 'CC', color: '#10b981' },
  'rbs':           { name: 'Richards Building Supply',  initials: 'RB', color: '#0ea5e9' },
  'apollo-events': { name: 'Apollo Supply',             initials: 'AS', color: '#f59e0b' },
  'mvp-chiro':     { name: 'MVP Chiropractic',          initials: 'MC', color: '#8b5cf6' },
}

function currentMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default async function ReportPage({
  params,
  searchParams,
}: {
  params: { clientId: string }
  searchParams: { month?: string }
}) {
  const { clientId } = params
  const client = CLIENTS[clientId]
  if (!client) redirect('/reports')

  const month = searchParams.month || currentMonth()
  const supabase = createClient()

  const [
    { data: reportData },
    { data: report },
    { data: uploads },
  ] = await Promise.all([
    supabase
      .from('report_data')
      .select('*')
      .eq('client_id', clientId)
      .eq('month', month),
    supabase
      .from('client_reports')
      .select('*')
      .eq('client_id', clientId)
      .eq('month', month)
      .maybeSingle(),
    supabase
      .from('monthly_uploads')
      .select('file_type, file_name, parse_status, row_count, created_at')
      .eq('client_id', clientId)
      .eq('month', month),
  ])

  return (
    <ReportDashboard
      clientId={clientId}
      clientName={client.name}
      clientInitials={client.initials}
      clientColor={client.color}
      month={month}
      reportData={reportData || []}
      report={report}
      uploads={uploads || []}
    />
  )
}
