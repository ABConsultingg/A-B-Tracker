import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ReportDashboard from './ReportDashboard'

export const dynamic = 'force-dynamic'



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
  const month = searchParams.month || currentMonth()
  const supabase = createClient()

  const { data: clientRow } = await supabase
    .from('clients')
    .select('id, name, report_color, report_initials, reports_enabled')
    .eq('id', clientId)
    .maybeSingle()
  if (!clientRow || !clientRow.reports_enabled) redirect('/reports')
  const client = {
    name: clientRow.name,
    initials: clientRow.report_initials || (clientRow.name.split(' ').slice(0,2).map((w: string) => w[0]?.toUpperCase() || '').join('')),
    color: clientRow.report_color || '#6366f1',
  }

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
