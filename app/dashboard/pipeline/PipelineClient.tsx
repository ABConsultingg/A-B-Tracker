'use client'

import { useViewMode } from '@/lib/useViewMode'

type Stage = { id: string; label: string; color: string }

export default function PipelineClient({
  currentMember, byStage, totalCount, totalValue, activeCount, activeValue,
  urgentCount, maxCount, stages,
}: {
  currentMember: { id: string; role: string } | null
  byStage: Record<string, { count: number; value: number }>
  totalCount: number
  totalValue: number
  activeCount: number
  activeValue: number
  urgentCount: number
  maxCount: number
  stages: Stage[]
}) {
  const isAdmin = currentMember?.role === 'admin'
  const [viewMode] = useViewMode(isAdmin)
  const showCosts = viewMode === 'admin'

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Pipeline Health</h1>
        <p className="text-sm text-gray-500 mt-1">Snapshot of every work order in your system</p>
      </div>

      {/* KPI cards — layout shifts from 4 cols (admin) to 2 cols (team) since 2 $ tiles are hidden */}
      <div className={`grid grid-cols-1 gap-4 mb-6 ${showCosts ? 'sm:grid-cols-4' : 'sm:grid-cols-2'}`}>
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <div className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Total WOs</div>
          <div className="text-3xl font-bold mt-1">{totalCount}</div>
          <div className="text-xs text-gray-400 mt-1">{activeCount} active</div>
        </div>
        {showCosts && (
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <div className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Pipeline Value</div>
            <div className="text-3xl font-bold mt-1 font-mono">${totalValue.toLocaleString()}</div>
            <div className="text-xs text-gray-400 mt-1">All work orders</div>
          </div>
        )}
        {showCosts && (
          <div className="bg-white rounded-lg border border-gray-200 p-5"
               style={{ borderColor: '#d99e2b30' }}>
            <div className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Active Value</div>
            <div className="text-3xl font-bold mt-1 font-mono" style={{ color: '#d99e2b' }}>${activeValue.toLocaleString()}</div>
            <div className="text-xs text-gray-400 mt-1">Still working</div>
          </div>
        )}
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <div className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Urgent</div>
          <div className="text-3xl font-bold mt-1 text-red-600">{urgentCount}</div>
          <div className="text-xs text-gray-400 mt-1">Need attention</div>
        </div>
      </div>

      {/* Stage breakdown — keep all rows, hide $ in team mode */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="font-semibold text-gray-900 mb-5">Distribution by Stage</h2>
        <div className="space-y-3">
          {stages.map(s => {
            const data = byStage[s.id]
            if (!data || data.count === 0) return null
            const pct = totalCount ? (data.count / maxCount) * 100 : 0
            return (
              <div key={s.id} className="group">
                <div className="flex items-center justify-between text-sm mb-1.5">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: s.color }} />
                    <span className="font-medium text-gray-700">{s.label}</span>
                  </div>
                  <div className="flex items-center gap-3 font-mono text-xs">
                    <span className="text-gray-500">{data.count} WOs</span>
                    {showCosts && (
                      <span className="font-semibold text-gray-900 w-28 text-right">${data.value.toLocaleString()}</span>
                    )}
                  </div>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all"
                       style={{ width: `${pct}%`, background: s.color }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
