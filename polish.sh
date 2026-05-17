#!/bin/bash
# ab-tracker — polish pass
# Run from inside ~/ab-tracker: bash polish.sh

set -e
cd ~/ab-tracker

echo "→ Polished BoardClient (click cards → side panel, better visuals)..."

cat > components/work-orders/BoardClient.tsx << 'EOF'
'use client'
import { useState, useMemo } from 'react'
import { STAGES, type WorkOrder, type WoStage } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'

const PRIORITY_COLORS: Record<string, string> = {
  urgent: 'bg-red-50 text-red-700 border-red-200',
  high:   'bg-orange-50 text-orange-700 border-orange-200',
  medium: 'bg-blue-50 text-blue-700 border-blue-200',
  low:    'bg-slate-50 text-slate-600 border-slate-200',
}

const BOARD_STAGES: WoStage[] = [
  'submitted','not-started','in-progress','deliverables-completed',
  'sent-for-approval','revisions-received','approved',
  'deliverables-executed','invoiced','paid','on-hold'
]

export default function BoardClient({ initialWorkOrders, clients, services, team }: {
  initialWorkOrders: WorkOrder[]; clients: any[]; services: any[]; team: any[]
}) {
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>(initialWorkOrders)
  const [search, setSearch] = useState('')
  const [filterClient, setFilterClient] = useState('')
  const [filterService, setFilterService] = useState('')
  const [filterOwner, setFilterOwner] = useState('')
  const [selectedWo, setSelectedWo] = useState<WorkOrder | null>(null)
  const [saving, setSaving] = useState(false)
  const supabase = createClient()

  const filtered = useMemo(() => {
    return workOrders.filter(wo => {
      if (search && !wo.title.toLowerCase().includes(search.toLowerCase())) return false
      if (filterClient && wo.client_id !== filterClient) return false
      if (filterService && wo.service_id !== filterService) return false
      if (filterOwner && wo.owner_id !== filterOwner) return false
      return true
    })
  }, [workOrders, search, filterClient, filterService, filterOwner])

  async function moveStage(woId: string, newStage: WoStage) {
    setWorkOrders(prev => prev.map(w => w.id === woId ? { ...w, stage: newStage } : w))
    await supabase.from('work_orders').update({ stage: newStage }).eq('id', woId)
  }

  async function updateWo(patch: Partial<WorkOrder>) {
    if (!selectedWo) return
    setSaving(true)
    const updated = { ...selectedWo, ...patch }
    setSelectedWo(updated)
    setWorkOrders(prev => prev.map(w => w.id === selectedWo.id ? updated : w))
    await supabase.from('work_orders').update(patch).eq('id', selectedWo.id)
    setSaving(false)
  }

  const grouped = useMemo(() => {
    const out: Record<string, WorkOrder[]> = {}
    BOARD_STAGES.forEach(s => out[s] = [])
    filtered.forEach(wo => { if (out[wo.stage]) out[wo.stage].push(wo) })
    return out
  }, [filtered])

  // Column totals
  const columnTotals = useMemo(() => {
    const out: Record<string, number> = {}
    BOARD_STAGES.forEach(s => {
      out[s] = (grouped[s] || []).reduce((sum, w) => sum + (w.est_cost || 0) + (w.add_cost || 0), 0)
    })
    return out
  }, [grouped])

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="px-6 py-5 bg-white border-b border-gray-200 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Work Order Board</h1>
            <p className="text-xs text-gray-500 mt-0.5">Click any card to view details</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-xs text-gray-500">
              <span className="font-semibold text-gray-900">{filtered.length}</span> of {workOrders.length}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <input type="text" placeholder="🔍 Search work orders..."
            value={search} onChange={e => setSearch(e.target.value)}
            className="flex-1 min-w-[200px] px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <select value={filterClient} onChange={e => setFilterClient(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
            <option value="">All clients</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={filterService} onChange={e => setFilterService(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
            <option value="">All services</option>
            {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select value={filterOwner} onChange={e => setFilterOwner(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
            <option value="">All owners</option>
            {team.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          {(search || filterClient || filterService || filterOwner) && (
            <button onClick={() => { setSearch(''); setFilterClient(''); setFilterService(''); setFilterOwner('') }}
              className="px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Clear</button>
          )}
        </div>
      </div>

      {/* Board */}
      <div className="flex-1 overflow-x-auto px-6 py-4">
        <div className="flex gap-3 min-w-max">
          {BOARD_STAGES.map(stageId => {
            const stage = STAGES.find(s => s.id === stageId)!
            const cards = grouped[stageId] || []
            const total = columnTotals[stageId] || 0
            return (
              <div key={stageId} className="w-72 flex-shrink-0">
                {/* Column header */}
                <div className="bg-white rounded-t-lg border border-gray-200 border-b-0 px-3 py-2.5"
                     style={{ borderTopColor: stage.color, borderTopWidth: 3 }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ background: stage.color }} />
                      <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">{stage.label}</span>
                    </div>
                    <span className="text-xs text-gray-400 font-mono bg-gray-100 px-1.5 py-0.5 rounded">{cards.length}</span>
                  </div>
                  {total > 0 && (
                    <div className="text-xs text-gray-500 mt-1 font-mono">${total.toLocaleString()}</div>
                  )}
                </div>
                {/* Cards */}
                <div className="bg-gray-50 border border-gray-200 border-t-0 rounded-b-lg p-2 space-y-2 min-h-[100px]">
                  {cards.length === 0 && (
                    <div className="text-xs text-gray-300 text-center py-6">No work orders</div>
                  )}
                  {cards.map(wo => (
                    <div key={wo.id} onClick={() => setSelectedWo(wo)}
                      className="bg-white rounded-lg border border-gray-200 p-3 hover:shadow-md hover:border-gray-300 transition-all cursor-pointer">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="text-sm font-semibold text-gray-900 leading-snug line-clamp-2">{wo.title}</div>
                        {wo.priority && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold border ${PRIORITY_COLORS[wo.priority]}`}>
                            {wo.priority[0].toUpperCase()}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 space-y-0.5">
                        {wo.clients?.name && <div className="truncate">🏢 {wo.clients.name}</div>}
                        {wo.services?.name && <div className="truncate">⚙️ {wo.services.name}</div>}
                        {wo.team_members?.name && <div className="truncate">👤 {wo.team_members.name}</div>}
                        {wo.due_date && (
                          <div className="flex items-center gap-1">
                            📅 {new Date(wo.due_date).toLocaleDateString()}
                          </div>
                        )}
                      </div>
                      {((wo.est_cost || 0) + (wo.add_cost || 0) > 0) && (
                        <div className="text-xs font-mono text-gray-700 mt-2 font-semibold">
                          ${((wo.est_cost || 0) + (wo.add_cost || 0)).toLocaleString()}
                        </div>
                      )}
                      <select value={wo.stage}
                        onClick={(e) => e.stopPropagation()}
                        onChange={e => moveStage(wo.id, e.target.value as WoStage)}
                        className="mt-2 w-full text-xs px-2 py-1 border border-gray-200 rounded bg-gray-50 hover:bg-white">
                        {STAGES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Side panel */}
      {selectedWo && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setSelectedWo(null)} />
          <div className="fixed top-0 right-0 bottom-0 w-full max-w-md bg-white shadow-2xl z-50 overflow-y-auto">
            {/* Panel header */}
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full"
                     style={{ background: STAGES.find(s => s.id === selectedWo.stage)?.color }} />
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  {STAGES.find(s => s.id === selectedWo.stage)?.label}
                </span>
                {saving && <span className="text-xs text-blue-500 ml-2">Saving...</span>}
              </div>
              <button onClick={() => setSelectedWo(null)}
                className="text-gray-400 hover:text-gray-700 text-2xl leading-none w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100">×</button>
            </div>

            {/* Panel body */}
            <div className="px-6 py-5 space-y-5">
              {/* Title */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Title</label>
                <input type="text" defaultValue={selectedWo.title}
                  onBlur={e => e.target.value !== selectedWo.title && updateWo({ title: e.target.value })}
                  className="w-full text-lg font-semibold text-gray-900 px-2 py-1.5 border border-transparent rounded hover:border-gray-200 focus:border-blue-500 focus:outline-none" />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Description</label>
                <textarea defaultValue={selectedWo.description || ''}
                  onBlur={e => e.target.value !== selectedWo.description && updateWo({ description: e.target.value })}
                  rows={3} placeholder="Add a description..."
                  className="w-full text-sm text-gray-700 px-2 py-1.5 border border-gray-200 rounded resize-none focus:border-blue-500 focus:outline-none" />
              </div>

              {/* Two columns */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Stage</label>
                  <select value={selectedWo.stage}
                    onChange={e => updateWo({ stage: e.target.value as WoStage })}
                    className="w-full text-sm px-2 py-1.5 border border-gray-200 rounded focus:border-blue-500 focus:outline-none">
                    {STAGES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Priority</label>
                  <select value={selectedWo.priority || 'medium'}
                    onChange={e => updateWo({ priority: e.target.value as any })}
                    className="w-full text-sm px-2 py-1.5 border border-gray-200 rounded focus:border-blue-500 focus:outline-none">
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Client</label>
                  <select value={selectedWo.client_id || ''}
                    onChange={e => updateWo({ client_id: e.target.value })}
                    className="w-full text-sm px-2 py-1.5 border border-gray-200 rounded focus:border-blue-500 focus:outline-none">
                    {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Service</label>
                  <select value={selectedWo.service_id || ''}
                    onChange={e => updateWo({ service_id: e.target.value })}
                    className="w-full text-sm px-2 py-1.5 border border-gray-200 rounded focus:border-blue-500 focus:outline-none">
                    {services.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Owner</label>
                  <select value={selectedWo.owner_id || ''}
                    onChange={e => updateWo({ owner_id: e.target.value })}
                    className="w-full text-sm px-2 py-1.5 border border-gray-200 rounded focus:border-blue-500 focus:outline-none">
                    <option value="">Unassigned</option>
                    {team.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Due Date</label>
                  <input type="date" defaultValue={selectedWo.due_date ? selectedWo.due_date.substring(0, 10) : ''}
                    onBlur={e => updateWo({ due_date: e.target.value || undefined })}
                    className="w-full text-sm px-2 py-1.5 border border-gray-200 rounded focus:border-blue-500 focus:outline-none" />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Est. Cost</label>
                  <div className="relative">
                    <span className="absolute left-2 top-1.5 text-sm text-gray-400">$</span>
                    <input type="number" defaultValue={selectedWo.est_cost || 0}
                      onBlur={e => updateWo({ est_cost: parseFloat(e.target.value) || 0 })}
                      className="w-full text-sm pl-5 pr-2 py-1.5 border border-gray-200 rounded font-mono focus:border-blue-500 focus:outline-none" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Add. Cost</label>
                  <div className="relative">
                    <span className="absolute left-2 top-1.5 text-sm text-gray-400">$</span>
                    <input type="number" defaultValue={selectedWo.add_cost || 0}
                      onBlur={e => updateWo({ add_cost: parseFloat(e.target.value) || 0 })}
                      className="w-full text-sm pl-5 pr-2 py-1.5 border border-gray-200 rounded font-mono focus:border-blue-500 focus:outline-none" />
                  </div>
                </div>
              </div>

              {/* Total */}
              <div className="bg-gray-50 rounded-lg p-3 flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-500 uppercase">Total</span>
                <span className="text-xl font-bold font-mono text-gray-900">
                  ${((selectedWo.est_cost || 0) + (selectedWo.add_cost || 0)).toLocaleString()}
                </span>
              </div>

              {/* Metadata */}
              <div className="pt-3 border-t border-gray-100 text-xs text-gray-400 space-y-0.5">
                {selectedWo.created_at && <div>Created: {new Date(selectedWo.created_at).toLocaleString()}</div>}
                {selectedWo.updated_at && <div>Updated: {new Date(selectedWo.updated_at).toLocaleString()}</div>}
                <div>ID: {selectedWo.id.substring(0, 8)}...</div>
              </div>

              <p className="text-xs text-gray-400 italic pt-2">Changes save automatically when you click outside a field.</p>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
EOF

echo "→ Polished Pipeline page (better dashboard)..."

cat > app/dashboard/pipeline/page.tsx << 'EOF'
import { createClient } from '@/lib/supabase/server'
import { STAGES } from '@/lib/types'

export default async function PipelinePage() {
  const supabase = createClient()
  const { data: wos } = await supabase.from('work_orders').select('stage, est_cost, add_cost, priority')

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

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Pipeline Health</h1>
        <p className="text-sm text-gray-500 mt-1">Snapshot of every work order in your system</p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <div className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Total WOs</div>
          <div className="text-3xl font-bold mt-1">{totalCount}</div>
          <div className="text-xs text-gray-400 mt-1">{activeCount} active</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <div className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Pipeline Value</div>
          <div className="text-3xl font-bold mt-1 font-mono">${totalValue.toLocaleString()}</div>
          <div className="text-xs text-gray-400 mt-1">All work orders</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-5"
             style={{ borderColor: '#d99e2b30' }}>
          <div className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Active Value</div>
          <div className="text-3xl font-bold mt-1 font-mono" style={{ color: '#d99e2b' }}>${activeValue.toLocaleString()}</div>
          <div className="text-xs text-gray-400 mt-1">Still working</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <div className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Urgent</div>
          <div className="text-3xl font-bold mt-1 text-red-600">{urgentCount}</div>
          <div className="text-xs text-gray-400 mt-1">Need attention</div>
        </div>
      </div>

      {/* Stage breakdown */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="font-semibold text-gray-900 mb-5">Distribution by Stage</h2>
        <div className="space-y-3">
          {STAGES.map(s => {
            const data = byStage[s.id]
            if (data.count === 0) return null
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
                    <span className="font-semibold text-gray-900 w-28 text-right">${data.value.toLocaleString()}</span>
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
EOF

echo "→ Polished Finance page..."

cat > app/dashboard/finance/page.tsx << 'EOF'
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

  const clientStats: Record<string, { wos: number; revenue: number; pipeline: number }> = {}
  ;(wos || []).forEach((w: any) => {
    const name = w.clients?.name || 'Unknown'
    if (!clientStats[name]) clientStats[name] = { wos: 0, revenue: 0, pipeline: 0 }
    clientStats[name].wos++
    const v = (w.est_cost || 0) + (w.add_cost || 0)
    if (['paid','archived'].includes(w.stage)) clientStats[name].revenue += v
    else clientStats[name].pipeline += v
  })
  const clientRows = Object.entries(clientStats)
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => (b.revenue + b.pipeline) - (a.revenue + a.pipeline))

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Finance</h1>
        <p className="text-sm text-gray-500 mt-1">Revenue tracking across all work orders</p>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg border border-gray-200 p-5 border-l-4 border-l-green-500">
          <div className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Paid</div>
          <div className="text-2xl font-bold mt-1 font-mono text-green-600">${paid.toLocaleString()}</div>
          <div className="text-xs text-gray-400 mt-1">Collected revenue</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-5 border-l-4" style={{ borderLeftColor: '#d99e2b' }}>
          <div className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Invoiced (Open)</div>
          <div className="text-2xl font-bold mt-1 font-mono" style={{ color: '#d99e2b' }}>${invoiced.toLocaleString()}</div>
          <div className="text-xs text-gray-400 mt-1">Awaiting payment</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-5 border-l-4 border-l-blue-500">
          <div className="text-xs text-gray-500 uppercase tracking-wide font-semibold">In Pipeline</div>
          <div className="text-2xl font-bold mt-1 font-mono text-gray-700">${pending.toLocaleString()}</div>
          <div className="text-xs text-gray-400 mt-1">Not yet invoiced</div>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Revenue by Client</h2>
          <span className="text-xs text-gray-400">{clientRows.length} clients</span>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr className="text-left text-xs text-gray-500 uppercase tracking-wider">
              <th className="px-6 py-3">Client</th>
              <th className="px-6 py-3 text-right">WOs</th>
              <th className="px-6 py-3 text-right">Pipeline</th>
              <th className="px-6 py-3 text-right">Revenue</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {clientRows.map(c => (
              <tr key={c.name} className="hover:bg-gray-50">
                <td className="px-6 py-3 font-medium text-gray-900">{c.name}</td>
                <td className="px-6 py-3 text-right text-gray-500 font-mono">{c.wos}</td>
                <td className="px-6 py-3 text-right font-mono text-gray-600">${c.pipeline.toLocaleString()}</td>
                <td className="px-6 py-3 text-right font-mono font-semibold text-green-600">${c.revenue.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
EOF

echo ""
echo "✅ Polish complete!"
echo ""
echo "Next: build + push"
echo "  cd ~/ab-tracker && npm run build && git add -A && git commit -m 'Polish: card detail panel + filters + visuals' && git push"
echo ""
