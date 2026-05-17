import { createClient } from '@/lib/supabase/server'
import { STAGES } from '@/lib/types'

export default async function AllWorkOrdersPage() {
  const supabase = createClient()
  const { data: wos } = await supabase
    .from('work_orders')
    .select(`
      *,
      clients!work_orders_client_id_fkey(name),
      services!work_orders_service_id_fkey(name),
      team_members!work_orders_owner_id_fkey(name)
    `)
    .order('created_at', { ascending: false })
    .limit(500)

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">All Work Orders</h1>
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr className="text-left text-xs text-gray-500 uppercase tracking-wider">
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Client</th>
              <th className="px-4 py-3">Service</th>
              <th className="px-4 py-3">Assignee</th>
              <th className="px-4 py-3">Stage</th>
              <th className="px-4 py-3 text-right">Cost</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {(wos || []).map((wo: any) => {
              const stage = STAGES.find(s => s.id === wo.stage)
              return (
                <tr key={wo.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{wo.title}</td>
                  <td className="px-4 py-3 text-gray-600">{wo.clients?.name || '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{wo.services?.name || '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{wo.team_members?.name || '—'}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs px-2 py-1 rounded font-medium text-white"
                      style={{ background: stage?.color }}>{stage?.label}</span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-gray-900">
                    ${((wo.est_cost || 0) + (wo.add_cost || 0)).toLocaleString()}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
