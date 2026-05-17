import { createClient } from '@/lib/supabase/server'

export default async function ClientsPage() {
  const supabase = createClient()
  const { data: clients } = await supabase.from('clients').select('*').order('name')
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Clients</h1>
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr className="text-left text-xs text-gray-500 uppercase tracking-wider">
              <th className="px-6 py-3">Name</th>
              <th className="px-6 py-3">Status</th>
              <th className="px-6 py-3">Account Lead</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {(clients || []).map((c: any) => (
              <tr key={c.id} className="hover:bg-gray-50">
                <td className="px-6 py-3 font-medium text-gray-900">{c.name}</td>
                <td className="px-6 py-3"><span className="text-xs px-2 py-0.5 rounded bg-green-100 text-green-700">{c.status || 'active'}</span></td>
                <td className="px-6 py-3 text-gray-600">{c.account_lead || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
