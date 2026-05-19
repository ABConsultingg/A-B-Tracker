import { createClient } from '@/lib/supabase/server'
import { STAGES } from '@/lib/types'
import PipelineClient from './PipelineClient'

export default async function PipelinePage() {
  const supabase = createClient()
  const { data: wos } = await supabase.from('work_orders').select('stage, est_cost, add_cost, priority')

  // Current user's team_member row for role-based view gating
  const { data: { user } } = await supabase.auth.getUser()
  const { data: currentMember } = user
    ? await supabase.from('team_members').select('id, role').eq('auth_user_id', user.id).maybeSingle()
    : { data: null }

  const byStage: Record<string, { count: number; value: number }> = {}
  STAGES.forEach(s => byStage[s.id] = { count: 0, value: 0 })
  ;(wos || []).forEach(wo => {
    if (!byStage[wo.stage]) return
    byStage[wo.stage].count++
    byStage[wo.stage].value += (wo.est_cost || 0) + (wo.add_cost || 0)
  })

  const totalCount = (wos || []).length
  const totalValue = Object.values(byStage).reduce((sum, s) => sum + s.value, 0)
  const activeCount = (wos || []).filter(w => !['paid', 'archived'].includes(w.stage)).length
  const activeValue = (wos || []).filter(w => !['paid', 'archived'].includes(w.stage))
                                 .reduce((s, w) => s + (w.est_cost || 0) + (w.add_cost || 0), 0)
  const urgentCount = (wos || []).filter(w => w.priority === 'urgent' && !['paid','archived'].includes(w.stage)).length
  const maxCount = Math.max(...Object.values(byStage).map(s => s.count), 1)

  // Strip $ values from byStage before sending to client so they don't even reach the browser
  // for non-admins (defense in depth: client also gates rendering)
  const byStageData: Record<string, { count: number; value: number }> = {}
  STAGES.forEach(s => {
    byStageData[s.id] = { count: byStage[s.id].count, value: byStage[s.id].value }
  })

  return (
    <PipelineClient
      currentMember={currentMember}
      byStage={byStageData}
      totalCount={totalCount}
      totalValue={totalValue}
      activeCount={activeCount}
      activeValue={activeValue}
      urgentCount={urgentCount}
      maxCount={maxCount}
      stages={STAGES.map(s => ({ id: s.id, label: s.label, color: s.color }))}
    />
  )
}
