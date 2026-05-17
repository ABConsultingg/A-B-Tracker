import { createClient } from '@/lib/supabase/server'

export default async function ServicesPage() {
  const supabase = createClient()
  const { data: services } = await supabase.from('services').select('*').order('name')
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Services</h1>
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr className="text-left text-xs text-gray-500 uppercase tracking-wider">
              <th className="px-6 py-3">Service</th>
              <th className="px-6 py-3">Category</th>
              <th className="px-6 py-3">Occurrence</th>
              <th className="px-6 py-3 text-right">Base Price</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {(services || []).map((s: any) => (
              <tr key={s.id} className="hover:bg-gray-50">
                <td className="px-6 py-3 font-medium text-gray-900">{s.name}</td>
                <td className="px-6 py-3 text-gray-600">{s.category}</td>
                <td className="px-6 py-3 text-gray-600">{s.occurrence}</td>
                <td className="px-6 py-3 text-right font-mono">${(s.base_price || 0).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
