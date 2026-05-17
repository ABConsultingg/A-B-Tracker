import { createClient } from '@/lib/supabase/server'

export default async function FinancePage() {
  const supabase = createClient()
  const { data: wos } = await supabase
    .from('work_orders')
    .select(`stage, est_cost, add_cost, clients!work_orders_client_id_fkey(name)`)

  const invoiced = (wos || []).filter(w => w.stage === 'invoiced')
                              .reduce((s, w) => s + (w.est_cost || 0) + (w.add_cost || 0), 0)
  const paid = (wos || []).filter(w => w.stage === 'paid')
                          .reduce((s, w) => s + (w.est_cost || 0) + (w.add_cost || 0), 0)
  const pending = (wos || []).filter(w => !['paid','archived','invoiced'].includes(w.stage))
                             .reduce((s, w) => s + (w.est_cost || 0) + (w.add_cost || 0), 0)

  const clientStats: Record<string, { wos: number; revenue: number }> = {}
  ;(wos || []).forEach((w: any) => {
    const name = w.clients?.name || 'Unknown'
    if (!clientStats[name]) clientStats[name] = { wos: 0, revenue: 0 }
    clientStats[name].wos++
    if (['paid','archived'].includes(w.stage)) clientStats[name].revenue += (w.est_cost || 0) + (w.add_cost || 0)
  })
  const clientRows = Object.entries(clientStats)
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.revenue - a.revenue)

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Finance</h1>
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <div className="text-sm text-gray-500">Paid (YTD)</div>
          <div className="text-2xl font-bold mt-1 text-green-600">${paid.toLocaleString()}</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <div className="text-sm text-gray-500">Invoiced (Open)</div>
          <div className="text-2xl font-bold mt-1" style={{ color: '#d99e2b' }}>${invoiced.toLocaleString()}</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <div className="text-sm text-gray-500">In Pipeline</div>
          <div className="text-2xl font-bold mt-1 text-gray-700">${pending.toLocaleString()}</div>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Revenue by Client</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr className="text-left text-xs text-gray-500 uppercase tracking-wider">
              <th className="px-6 py-3">Client</th>
              <th className="px-6 py-3 text-right">Work Orders</th>
              <th className="px-6 py-3 text-right">Revenue</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {clientRows.map(c => (
              <tr key={c.name} className="hover:bg-gray-50">
                <td className="px-6 py-3 font-medium text-gray-900">{c.name}</td>
                <td className="px-6 py-3 text-right text-gray-500 font-mono">{c.wos}</td>
                <td className="px-6 py-3 text-right font-mono font-semibold text-gray-900">${c.revenue.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
