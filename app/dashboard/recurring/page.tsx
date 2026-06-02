import { createClient } from '@/lib/supabase/server'
import RecurringManager from './RecurringManager'

export default async function RecurringPage() {
  const supabase = createClient()
  const [{ data: rows }, { data: clients }] = await Promise.all([
    supabase
      .from('recurring_services')
      .select('id, client_id, label, amount, is_bundle, coverage_notes, active, start_date')
      .order('active', { ascending: false }),
    supabase.from('clients').select('id, name').order('name'),
  ])

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Recurring Services</h1>
        <p className="text-sm text-gray-500 mt-1">Committed monthly retainers. Billing is handled in Square — this tracks what recurs and the monthly total.</p>
      </div>
      <RecurringManager initialRows={rows || []} clients={clients || []} />
    </div>
  )
}
