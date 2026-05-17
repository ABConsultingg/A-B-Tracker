import { createClient } from '@/lib/supabase/server'
import { STAGES } from '@/lib/types'

export default async function MyTasksPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: member } = await supabase.from('team_members').select('id').eq('auth_user_id', user!.id).single()

  const { data: wos } = await supabase
    .from('work_orders')
    .select(`
      *,
      clients!work_orders_client_id_fkey(name),
      services!work_orders_service_id_fkey(name)
    `)
    .eq('owner_id', member?.id)
    .not('stage', 'in', '(paid,archived)')
    .order('due_date', { ascending: true })

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">My Tasks</h1>
      <div className="space-y-2">
        {(wos || []).map((wo: any) => {
          const stage = STAGES.find(s => s.id === wo.stage)
          return (
            <div key={wo.id} className="bg-white rounded-lg border border-gray-200 p-4 flex items-center justify-between">
              <div>
                <div className="font-medium text-gray-900">{wo.title}</div>
                <div className="text-sm text-gray-500 mt-1">
                  {wo.clients?.name} · {wo.services?.name}
                  {wo.due_date && ` · Due ${new Date(wo.due_date).toLocaleDateString()}`}
                </div>
              </div>
              <span className="text-xs px-2 py-1 rounded font-medium text-white"
                style={{ background: stage?.color }}>{stage?.label}</span>
            </div>
          )
        })}
        {(!wos || wos.length === 0) && <div className="text-center text-gray-500 py-12">No active tasks 🎉</div>}
      </div>
    </div>
  )
}
