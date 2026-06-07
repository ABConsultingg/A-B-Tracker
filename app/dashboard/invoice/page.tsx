import { createClient } from '@/lib/supabase/server'
import InvoiceBuilder from './InvoiceBuilder'

export const dynamic = 'force-dynamic'

export default async function InvoicePage() {
  const supabase = createClient()

  const [{ data: clients }, { data: wos }] = await Promise.all([
    supabase.from('clients').select('id, name, contact_name, contact_email, contact_phone, address').order('name'),
    supabase
      .from('work_orders')
      .select(`id, title, stage, est_cost, add_cost, client_id,
               clients!work_orders_client_id_fkey(name),
               wo_line_items(id, description, qty, unit_price, total, sort_order)`)
      .in('stage', ['deliverables-executed', 'invoiced', 'approved'])
      .order('created_at', { ascending: false })
      .limit(500),
  ])

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Invoice Builder</h1>
        <p className="text-sm text-gray-500 mt-1">Select a client and work orders to generate a draft invoice PDF</p>
      </div>
      <InvoiceBuilder clients={clients || []} workOrders={wos || []} />
    </div>
  )
}
