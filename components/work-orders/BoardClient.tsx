'use client'
import { useState, useMemo, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
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

type StageHistoryEntry = {
  id: string
  from_stage: string
  to_stage: string
  changed_at: string
  changed_by?: string
}

type WoOrNew = WorkOrder | { __new: true } & Partial<WorkOrder>

export default function BoardClient({ initialWorkOrders, clients, services, team }: {
  initialWorkOrders: WorkOrder[]; clients: any[]; services: any[]; team: any[]
}) {
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>(initialWorkOrders)
  const [search, setSearch] = useState('')
  const [filterClient, setFilterClient] = useState('')
  const [filterService, setFilterService] = useState('')
  const [filterOwner, setFilterOwner] = useState('')
  const [selectedWo, setSelectedWo] = useState<WoOrNew | null>(null)
  const [saving, setSaving] = useState(false)
  const [justSaved, setJustSaved] = useState(false)
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [dragOverStage, setDragOverStage] = useState<WoStage | null>(null)
  const [mobileStage, setMobileStage] = useState<WoStage>('not-started')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [stageHistory, setStageHistory] = useState<StageHistoryEntry[]>([])
  const [historyOpen, setHistoryOpen] = useState(false)
  const supabase = createClient()
  const searchParams = useSearchParams()
  const router = useRouter()

  // Auto-open WO from ?wo=X param (when arriving from Clients or All Work Orders)
  useEffect(() => {
    const woId = searchParams?.get('wo')
    if (woId && workOrders.length > 0) {
      const found = workOrders.find(w => w.id === woId)
      if (found) {
        setSelectedWo(found)
        // Clear the param so refresh doesn't re-open
        router.replace('/dashboard', { scroll: false })
      }
    }
  }, [searchParams, workOrders, router])


  // Load stage history when a non-new WO is selected
  useEffect(() => {
    if (!selectedWo || (selectedWo as any).__new) { setStageHistory([]); return }
    const wo = selectedWo as WorkOrder
    supabase.from('wo_stage_history')
      .select('*')
      .eq('work_order_id', wo.id)
      .order('changed_at', { ascending: false })
      .limit(20)
      .then(({ data }) => setStageHistory(data || []))
  }, [selectedWo, supabase])

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
    if (!selectedWo || (selectedWo as any).__new) return
    const wo = selectedWo as WorkOrder
    setSaving(true)
    const updated = { ...wo, ...patch }
    setSelectedWo(updated)
    setWorkOrders(prev => prev.map(w => w.id === wo.id ? updated : w))
    await supabase.from('work_orders').update(patch).eq('id', wo.id)
    setSaving(false)
    setJustSaved(true)
    setTimeout(() => setJustSaved(false), 2000)
    // Refresh history if stage changed
    if (patch.stage) {
      const { data } = await supabase.from('wo_stage_history')
        .select('*').eq('work_order_id', wo.id)
        .order('changed_at', { ascending: false }).limit(20)
      setStageHistory(data || [])
    }
  }

  async function archiveWo() {
    if (!selectedWo || (selectedWo as any).__new) return
    const wo = selectedWo as WorkOrder
    if (!confirm(`Archive "${wo.title}"? It will be hidden from the board but stays in All Work Orders.`)) return
    await updateWo({ stage: 'archived' })
    setSelectedWo(null)
  }

  async function deleteWo() {
    if (!selectedWo || (selectedWo as any).__new) return
    const wo = selectedWo as WorkOrder
    if (!confirm(`PERMANENTLY DELETE "${wo.title}"? This cannot be undone.`)) return
    if (!confirm(`Are you absolutely sure? Type-confirm in your head: this work order will be gone forever.`)) return
    setSaving(true)
    const { error } = await supabase.from('work_orders').delete().eq('id', wo.id)
    setSaving(false)
    if (error) { alert('Delete failed: ' + error.message); return }
    setWorkOrders(prev => prev.filter(w => w.id !== wo.id))
    setSelectedWo(null)
  }

  const [newWo, setNewWo] = useState<Partial<WorkOrder>>({})
  function openNewWo() {
    setNewWo({ title: '', stage: 'not-started', priority: 'medium',
      client_id: clients[0]?.id || '', service_id: services[0]?.id || '',
      owner_id: '', est_cost: 0, add_cost: 0 })
    setSelectedWo({ __new: true } as any)
  }
  async function createWo() {
    if (!newWo.title?.trim()) { alert('Please enter a title.'); return }
    if (!newWo.client_id) { alert('Please select a client.'); return }
    if (!newWo.service_id) { alert('Please select a service.'); return }
    setSaving(true)
    const payload: any = {
      title: newWo.title, description: newWo.description || null,
      client_id: newWo.client_id, service_id: newWo.service_id,
      owner_id: newWo.owner_id || null, stage: newWo.stage || 'not-started',
      priority: newWo.priority || 'medium', est_cost: newWo.est_cost || 0,
      add_cost: newWo.add_cost || 0, due_date: newWo.due_date || null,
    }
    const { data, error } = await supabase.from('work_orders').insert(payload)
      .select(`*, clients!work_orders_client_id_fkey(name), services!work_orders_service_id_fkey(name, category), team_members!work_orders_owner_id_fkey(name)`)
      .single()
    setSaving(false)
    if (error) { alert('Error creating: ' + error.message); return }
    setWorkOrders(prev => [data as WorkOrder, ...prev])
    setSelectedWo(null); setNewWo({})
  }

  const grouped = useMemo(() => {
    const out: Record<string, WorkOrder[]> = {}
    BOARD_STAGES.forEach(s => out[s] = [])
    filtered.forEach(wo => { if (out[wo.stage]) out[wo.stage].push(wo) })
    return out
  }, [filtered])

  const columnTotals = useMemo(() => {
    const out: Record<string, number> = {}
    BOARD_STAGES.forEach(s => {
      out[s] = (grouped[s] || []).reduce((sum, w) => sum + (w.est_cost || 0) + (w.add_cost || 0), 0)
    })
    return out
  }, [grouped])

  function handleDragStart(e: React.DragEvent, woId: string) { setDraggedId(woId); e.dataTransfer.effectAllowed = 'move' }
  function handleDragEnd() { setDraggedId(null); setDragOverStage(null) }
  function handleDragOver(e: React.DragEvent, stage: WoStage) {
    e.preventDefault(); e.dataTransfer.dropEffect = 'move'
    if (dragOverStage !== stage) setDragOverStage(stage)
  }
  function handleDrop(e: React.DragEvent, stage: WoStage) {
    e.preventDefault()
    if (draggedId) {
      const wo = workOrders.find(w => w.id === draggedId)
      if (wo && wo.stage !== stage) moveStage(draggedId, stage)
    }
    setDraggedId(null); setDragOverStage(null)
  }

  const isNew = selectedWo && (selectedWo as any).__new
  const wo = selectedWo as WorkOrder | null
  const activeFilterCount = [filterClient, filterService, filterOwner].filter(Boolean).length

  // Team name lookup for stage history
  const teamById = useMemo(() => {
    const map: Record<string, string> = {}
    team.forEach((t: any) => { map[t.id] = t.name })
    return map
  }, [team])

  // Auth user → team_member lookup so we can show "by Adrian" in history
  const [authUserMap, setAuthUserMap] = useState<Record<string, string>>({})
  useEffect(() => {
    supabase.from('team_members').select('id, name, auth_user_id').then(({ data }) => {
      if (!data) return
      const m: Record<string, string> = {}
      data.forEach((t: any) => { if (t.auth_user_id) m[t.auth_user_id] = t.name })
      setAuthUserMap(m)
    })
  }, [supabase])

  function renderCard(card: WorkOrder) {
    return (
      <div key={card.id} draggable
        onDragStart={(e) => handleDragStart(e, card.id)}
        onDragEnd={handleDragEnd}
        onClick={() => setSelectedWo(card)}
        className={`bg-white rounded-lg border border-gray-200 p-3 hover:shadow-md hover:border-gray-300 transition-all cursor-grab active:cursor-grabbing ${
          draggedId === card.id ? 'opacity-30' : ''
        }`}>
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="text-sm font-semibold text-gray-900 leading-snug line-clamp-2">{card.title}</div>
          {card.priority && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold border ${PRIORITY_COLORS[card.priority]}`}>
              {card.priority[0].toUpperCase()}
            </span>
          )}
        </div>
        <div className="text-xs text-gray-500 space-y-0.5">
          {card.clients?.name && <div className="truncate">🏢 {card.clients.name}</div>}
          {card.services?.name && <div className="truncate">⚙️ {card.services.name}</div>}
          {card.team_members?.name && <div className="truncate">👤 {card.team_members.name}</div>}
          {card.due_date && <div>📅 {new Date(card.due_date).toLocaleDateString()}</div>}
        </div>
        {((card.est_cost || 0) + (card.add_cost || 0) > 0) && (
          <div className="text-xs font-mono text-gray-700 mt-2 font-semibold">
            ${((card.est_cost || 0) + (card.add_cost || 0)).toLocaleString()}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-gray-50">
      <div className="px-4 md:px-6 py-4 md:py-5 bg-white border-b border-gray-200 shadow-sm">
        <div className="flex items-center justify-between mb-3 md:mb-4">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-gray-900">Work Order Board</h1>
            <p className="hidden md:block text-xs text-gray-500 mt-0.5">Drag cards between columns · Click any card to edit</p>
          </div>
          <div className="flex items-center gap-2 md:gap-3">
            <div className="hidden md:block text-xs text-gray-500">
              <span className="font-semibold text-gray-900">{filtered.length}</span> of {workOrders.length}
            </div>
            <button onClick={openNewWo}
              className="px-3 md:px-4 py-2 rounded-lg text-sm font-semibold text-white shadow-sm hover:shadow transition-all flex items-center gap-1.5"
              style={{ background: '#d99e2b' }}>
              <span className="text-base">+</span> <span className="hidden sm:inline">New Work Order</span><span className="sm:hidden">New</span>
            </button>
          </div>
        </div>
        <div className="flex items-center justify-between md:hidden mb-2">
          <div className="text-xs text-gray-500">
            <span className="font-semibold text-gray-900">{filtered.length}</span> of {workOrders.length}
          </div>
          <button onClick={() => setFiltersOpen(!filtersOpen)}
            className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-600 flex items-center gap-1">
            🔍 Filters {activeFilterCount > 0 && <span className="bg-blue-500 text-white rounded-full px-1.5 text-[10px]">{activeFilterCount}</span>}
          </button>
        </div>
        <div className={`${filtersOpen ? 'block' : 'hidden md:flex'} md:flex flex-wrap gap-2`}>
          <input type="text" placeholder="🔍 Search..."
            value={search} onChange={e => setSearch(e.target.value)}
            className="flex-1 min-w-[140px] px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <select value={filterClient} onChange={e => setFilterClient(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
            <option value="">All clients</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={filterService} onChange={e => setFilterService(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
            <option value="">All services</option>
            {services.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
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

      {/* Mobile */}
      <div className="md:hidden flex-1 flex flex-col overflow-hidden">
        <div className="bg-white border-b border-gray-200 overflow-x-auto">
          <div className="flex gap-1 px-2 py-2 min-w-max">
            {BOARD_STAGES.map(stageId => {
              const stage = STAGES.find(s => s.id === stageId)!
              const count = (grouped[stageId] || []).length
              const active = mobileStage === stageId
              return (
                <button key={stageId} onClick={() => setMobileStage(stageId)}
                  className={`px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                    active ? 'text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'
                  }`}
                  style={active ? { background: stage.color } : {}}>
                  <div className="w-1.5 h-1.5 rounded-full" style={{ background: active ? 'white' : stage.color }} />
                  {stage.label}
                  <span className={`text-[10px] rounded-full px-1.5 py-0.5 ${active ? 'bg-white/20' : 'bg-gray-100'}`}>{count}</span>
                </button>
              )
            })}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {(grouped[mobileStage] || []).length === 0 && (
            <div className="text-sm text-gray-400 text-center py-12">No work orders in this stage</div>
          )}
          {(grouped[mobileStage] || []).map(card => renderCard(card))}
        </div>
        {columnTotals[mobileStage] > 0 && (
          <div className="bg-white border-t border-gray-200 px-4 py-3 flex items-center justify-between">
            <span className="text-xs text-gray-500 uppercase font-semibold">Column Total</span>
            <span className="font-mono font-bold text-gray-900">${columnTotals[mobileStage].toLocaleString()}</span>
          </div>
        )}
      </div>

      {/* Desktop */}
      <div className="hidden md:block flex-1 overflow-x-auto px-6 py-4">
        <div className="flex gap-3 min-w-max">
          {BOARD_STAGES.map(stageId => {
            const stage = STAGES.find(s => s.id === stageId)!
            const cards = grouped[stageId] || []
            const total = columnTotals[stageId] || 0
            const isDragOver = dragOverStage === stageId
            return (
              <div key={stageId} className="w-72 flex-shrink-0"
                onDragOver={(e) => handleDragOver(e, stageId)}
                onDrop={(e) => handleDrop(e, stageId)}
                onDragLeave={() => setDragOverStage(null)}>
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
                <div className={`border border-gray-200 border-t-0 rounded-b-lg p-2 space-y-2 min-h-[120px] transition-colors ${
                  isDragOver ? 'bg-blue-50 border-blue-300 ring-2 ring-blue-200' : 'bg-gray-50'
                }`}>
                  {cards.length === 0 && !isDragOver && (
                    <div className="text-xs text-gray-300 text-center py-6">No work orders</div>
                  )}
                  {isDragOver && (
                    <div className="text-xs text-blue-500 text-center py-2 font-medium">Drop here</div>
                  )}
                  {cards.map(renderCard)}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Detail panel */}
      {selectedWo && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40" onClick={() => { setSelectedWo(null); setNewWo({}) }} />
          <div className="fixed top-0 right-0 bottom-0 left-0 md:left-auto md:w-full md:max-w-md bg-white shadow-2xl z-50 overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-4 md:px-6 py-4 flex items-center justify-between z-10">
              <div className="flex items-center gap-2">
                {isNew ? (
                  <span className="text-sm font-bold text-gray-900">New Work Order</span>
                ) : (
                  <>
                    <div className="w-2 h-2 rounded-full" style={{ background: STAGES.find(s => s.id === wo?.stage)?.color }} />
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      {STAGES.find(s => s.id === wo?.stage)?.label}
                    </span>
                    {saving && <span className="text-xs text-blue-500 ml-2 font-medium">Saving...</span>}
                    {!saving && justSaved && <span className="text-xs text-green-600 ml-2 font-medium">✓ Saved</span>}
                  </>
                )}
              </div>
              <button onClick={() => { setSelectedWo(null); setNewWo({}) }}
                className="text-gray-400 hover:text-gray-700 text-2xl leading-none w-10 h-10 flex items-center justify-center rounded hover:bg-gray-100">×</button>
            </div>

            <div className="px-4 md:px-6 py-5 space-y-5">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Title {isNew && '*'}</label>
                {isNew ? (
                  <input type="text" autoFocus value={newWo.title || ''}
                    onChange={e => setNewWo({ ...newWo, title: e.target.value })}
                    placeholder="What needs to be done?"
                    className="w-full text-lg font-semibold text-gray-900 px-3 py-2 border border-gray-200 rounded focus:border-blue-500 focus:outline-none" />
                ) : (
                  <input type="text" defaultValue={wo?.title || ''}
                    onBlur={e => e.target.value !== wo?.title && updateWo({ title: e.target.value })}
                    className="w-full text-lg font-semibold text-gray-900 px-3 py-2 border border-transparent rounded hover:border-gray-200 focus:border-blue-500 focus:outline-none" />
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Description</label>
                {isNew ? (
                  <textarea value={newWo.description || ''}
                    onChange={e => setNewWo({ ...newWo, description: e.target.value })}
                    rows={3} placeholder="Add a description..."
                    className="w-full text-sm text-gray-700 px-3 py-2 border border-gray-200 rounded resize-none focus:border-blue-500 focus:outline-none" />
                ) : (
                  <textarea defaultValue={wo?.description || ''}
                    onBlur={e => e.target.value !== wo?.description && updateWo({ description: e.target.value })}
                    rows={3} placeholder="Add a description..."
                    className="w-full text-sm text-gray-700 px-3 py-2 border border-gray-200 rounded resize-none focus:border-blue-500 focus:outline-none" />
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Stage</label>
                  {isNew ? (
                    <select value={newWo.stage || 'not-started'}
                      onChange={e => setNewWo({ ...newWo, stage: e.target.value as WoStage })}
                      className="w-full text-sm px-2 py-2 border border-gray-200 rounded focus:border-blue-500 focus:outline-none">
                      {STAGES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                    </select>
                  ) : (
                    <select value={wo?.stage}
                      onChange={e => updateWo({ stage: e.target.value as WoStage })}
                      className="w-full text-sm px-2 py-2 border border-gray-200 rounded focus:border-blue-500 focus:outline-none">
                      {STAGES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                    </select>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Priority</label>
                  {isNew ? (
                    <select value={newWo.priority || 'medium'}
                      onChange={e => setNewWo({ ...newWo, priority: e.target.value as any })}
                      className="w-full text-sm px-2 py-2 border border-gray-200 rounded focus:border-blue-500 focus:outline-none">
                      <option value="low">Low</option><option value="medium">Medium</option>
                      <option value="high">High</option><option value="urgent">Urgent</option>
                    </select>
                  ) : (
                    <select value={wo?.priority || 'medium'}
                      onChange={e => updateWo({ priority: e.target.value as any })}
                      className="w-full text-sm px-2 py-2 border border-gray-200 rounded focus:border-blue-500 focus:outline-none">
                      <option value="low">Low</option><option value="medium">Medium</option>
                      <option value="high">High</option><option value="urgent">Urgent</option>
                    </select>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Client {isNew && '*'}</label>
                  {isNew ? (
                    <select value={newWo.client_id || ''}
                      onChange={e => setNewWo({ ...newWo, client_id: e.target.value })}
                      className="w-full text-sm px-2 py-2 border border-gray-200 rounded focus:border-blue-500 focus:outline-none">
                      <option value="">— Select —</option>
                      {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  ) : (
                    <select value={wo?.client_id || ''}
                      onChange={e => updateWo({ client_id: e.target.value })}
                      className="w-full text-sm px-2 py-2 border border-gray-200 rounded focus:border-blue-500 focus:outline-none">
                      {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Service {isNew && '*'}</label>
                  {isNew ? (
                    <select value={newWo.service_id || ''}
                      onChange={e => setNewWo({ ...newWo, service_id: e.target.value })}
                      className="w-full text-sm px-2 py-2 border border-gray-200 rounded focus:border-blue-500 focus:outline-none">
                      <option value="">— Select —</option>
                      {services.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  ) : (
                    <select value={wo?.service_id || ''}
                      onChange={e => updateWo({ service_id: e.target.value })}
                      className="w-full text-sm px-2 py-2 border border-gray-200 rounded focus:border-blue-500 focus:outline-none">
                      {services.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Owner</label>
                  {isNew ? (
                    <select value={newWo.owner_id || ''}
                      onChange={e => setNewWo({ ...newWo, owner_id: e.target.value })}
                      className="w-full text-sm px-2 py-2 border border-gray-200 rounded focus:border-blue-500 focus:outline-none">
                      <option value="">Unassigned</option>
                      {team.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  ) : (
                    <select value={wo?.owner_id || ''}
                      onChange={e => updateWo({ owner_id: e.target.value })}
                      className="w-full text-sm px-2 py-2 border border-gray-200 rounded focus:border-blue-500 focus:outline-none">
                      <option value="">Unassigned</option>
                      {team.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Due Date</label>
                  {isNew ? (
                    <input type="date" value={newWo.due_date ? (newWo.due_date as string).substring(0,10) : ''}
                      onChange={e => setNewWo({ ...newWo, due_date: e.target.value || undefined })}
                      className="w-full text-sm px-2 py-2 border border-gray-200 rounded focus:border-blue-500 focus:outline-none" />
                  ) : (
                    <input type="date" defaultValue={wo?.due_date ? wo.due_date.substring(0, 10) : ''}
                      onBlur={e => updateWo({ due_date: e.target.value || undefined })}
                      className="w-full text-sm px-2 py-2 border border-gray-200 rounded focus:border-blue-500 focus:outline-none" />
                  )}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Est. Cost</label>
                  <div className="relative">
                    <span className="absolute left-2 top-2 text-sm text-gray-400">$</span>
                    {isNew ? (
                      <input type="number" placeholder="0" value={newWo.est_cost || ''}
                        onChange={e => setNewWo({ ...newWo, est_cost: parseFloat(e.target.value) || 0 })}
                        className="w-full text-sm pl-5 pr-2 py-2 border border-gray-200 rounded font-mono focus:border-blue-500 focus:outline-none" />
                    ) : (
                      <input type="number" placeholder="0" defaultValue={wo?.est_cost || ''}
                        onBlur={e => updateWo({ est_cost: parseFloat(e.target.value) || 0 })}
                        className="w-full text-sm pl-5 pr-2 py-2 border border-gray-200 rounded font-mono focus:border-blue-500 focus:outline-none" />
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Add. Cost</label>
                  <div className="relative">
                    <span className="absolute left-2 top-2 text-sm text-gray-400">$</span>
                    {isNew ? (
                      <input type="number" placeholder="0" value={newWo.add_cost || ''}
                        onChange={e => setNewWo({ ...newWo, add_cost: parseFloat(e.target.value) || 0 })}
                        className="w-full text-sm pl-5 pr-2 py-2 border border-gray-200 rounded font-mono focus:border-blue-500 focus:outline-none" />
                    ) : (
                      <input type="number" placeholder="0" defaultValue={wo?.add_cost || ''}
                        onBlur={e => updateWo({ add_cost: parseFloat(e.target.value) || 0 })}
                        className="w-full text-sm pl-5 pr-2 py-2 border border-gray-200 rounded font-mono focus:border-blue-500 focus:outline-none" />
                    )}
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-3 flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-500 uppercase">Total</span>
                <span className="text-xl font-bold font-mono text-gray-900">
                  ${(((isNew ? newWo.est_cost : wo?.est_cost) || 0) + ((isNew ? newWo.add_cost : wo?.add_cost) || 0)).toLocaleString()}
                </span>
              </div>

              {/* Stage History (existing WO only) */}
              {!isNew && (
                <div className="border-t border-gray-100 pt-4">
                  <button onClick={() => setHistoryOpen(!historyOpen)}
                    className="w-full flex items-center justify-between text-xs font-semibold text-gray-500 uppercase tracking-wide hover:text-gray-700">
                    <span>Stage History ({stageHistory.length})</span>
                    <span className="text-base">{historyOpen ? '▾' : '▸'}</span>
                  </button>
                  {historyOpen && (
                    <div className="mt-3 space-y-2">
                      {stageHistory.length === 0 && (
                        <div className="text-xs text-gray-400 italic">No stage changes recorded yet. Change the stage above to start tracking.</div>
                      )}
                      {stageHistory.map(entry => {
                        const from = STAGES.find(s => s.id === entry.from_stage)
                        const to = STAGES.find(s => s.id === entry.to_stage)
                        const byName = entry.changed_by ? authUserMap[entry.changed_by] : null
                        return (
                          <div key={entry.id} className="flex items-start gap-2 text-xs">
                            <div className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0" style={{ background: to?.color || '#94a3b8' }} />
                            <div className="flex-1 min-w-0">
                              <div className="text-gray-700">
                                <span className="text-gray-400">{from?.label || entry.from_stage || '—'}</span>
                                <span className="mx-1.5 text-gray-300">→</span>
                                <span className="font-medium" style={{ color: to?.color }}>{to?.label || entry.to_stage}</span>
                              </div>
                              <div className="text-gray-400 text-[11px] mt-0.5">
                                {new Date(entry.changed_at).toLocaleString()}
                                {byName && <span> · by {byName}</span>}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              {isNew ? (
                <div className="pt-3 flex gap-2 sticky bottom-0 bg-white pb-2 -mx-4 md:-mx-6 px-4 md:px-6 border-t border-gray-100 pt-3">
                  <button onClick={createWo} disabled={saving}
                    className="flex-1 py-3 rounded-lg font-semibold text-white disabled:opacity-50 transition-opacity"
                    style={{ background: '#1a2b4a' }}>
                    {saving ? 'Creating...' : 'Create Work Order'}
                  </button>
                  <button onClick={() => { setSelectedWo(null); setNewWo({}) }}
                    className="px-4 py-3 rounded-lg font-semibold text-gray-600 hover:bg-gray-100">
                    Cancel
                  </button>
                </div>
              ) : (
                <>
                  <div className="pt-3 border-t border-gray-100 text-xs text-gray-400 space-y-0.5">
                    {wo?.created_at && <div>Created: {new Date(wo.created_at).toLocaleString()}</div>}
                    {wo?.updated_at && <div>Updated: {new Date(wo.updated_at).toLocaleString()}</div>}
                    {wo?.id && <div>ID: {wo.id.substring(0, 8)}...</div>}
                  </div>
                  <p className="text-xs text-gray-400 italic pt-2">Changes save automatically when you click outside a field.</p>

                  {/* Archive + Delete buttons */}
                  <div className="pt-4 border-t border-gray-100 flex gap-2">
                    {wo?.stage !== 'archived' && (
                      <button onClick={archiveWo} disabled={saving}
                        className="flex-1 py-2.5 rounded-lg font-semibold text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 disabled:opacity-50">
                        📁 Archive
                      </button>
                    )}
                    <button onClick={deleteWo} disabled={saving}
                      className="flex-1 py-2.5 rounded-lg font-semibold text-sm text-red-700 bg-red-50 hover:bg-red-100 disabled:opacity-50">
                      🗑️ Delete Forever
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
