'use client'
import { useState, useMemo, useEffect } from 'react'
// removed unused next/navigation imports
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

type Comment = {
  id: string
  work_order_id: string
  author_id?: string
  body: string
  created_at: string
}

type Task = {
  id: string
  work_order_id: string
  description: string
  assignee_id: string | null
  due_date: string | null
  assigned_at: string
  priority: 'low' | 'medium' | 'high' | 'urgent'
  status: 'todo' | 'in-progress' | 'done'
  link: string | null
  notes: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

type WoOrNew = WorkOrder | { __new: true } & Partial<WorkOrder>

function ClientDate({ children }: { children: React.ReactNode }) {
  const [m, setM] = useState(false)
  useEffect(() => { setM(true) }, [])
  if (!m) return null
  return <>{children}</>
}

export default function BoardClient({ initialWorkOrders, clients, services, team, taskAggregates, assignmentsByWo }: {
  initialWorkOrders: WorkOrder[]; clients: any[]; services: any[]; team: any[];
  taskAggregates?: Record<string, { total: number; done: number; overdue: number }>;
  assignmentsByWo?: Record<string, string[]>;
}) {
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>(initialWorkOrders)
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  const [search, setSearch] = useState('')
  const [filterClient, setFilterClient] = useState('')
  const [filterService, setFilterService] = useState('')
  const [filterOwner, setFilterOwner] = useState('')
  const [selectedWo, setSelectedWo] = useState<WoOrNew | null>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { setSelectedWo(null); setNewWo({}) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const [saving, setSaving] = useState(false)
  const [justSaved, setJustSaved] = useState(false)
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [dragOverStage, setDragOverStage] = useState<WoStage | null>(null)
  const [mobileStage, setMobileStage] = useState<WoStage>('not-started')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [stageHistory, setStageHistory] = useState<StageHistoryEntry[]>([])
  const [historyOpen, setHistoryOpen] = useState(false)
  const [comments, setComments] = useState<Comment[]>([])
  const [newComment, setNewComment] = useState('')
  const [postingComment, setPostingComment] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [mentionDropdown, setMentionDropdown] = useState<{ open: boolean; query: string; position: number }>({ open: false, query: '', position: 0 })
  const [mentionIndex, setMentionIndex] = useState(0)
  const [tasks, setTasks] = useState<Task[]>([])
  const [newTaskDesc, setNewTaskDesc] = useState('')
  const [addingTask, setAddingTask] = useState(false)
  const [assignees, setAssignees] = useState<string[]>([])
  const [togglingAssignee, setTogglingAssignee] = useState<string | null>(null)
  const supabase = createClient()

  // Auto-open WO from ?wo=X param (when arriving from Clients or All Work Orders)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const woId = params.get('wo')
    if (woId && workOrders.length > 0) {
      const found = workOrders.find(w => w.id === woId)
      if (found) {
        setSelectedWo(found)
        // Clear the param without triggering re-render
        window.history.replaceState({}, '', '/dashboard')
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workOrders.length])


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

  // Load comments when a non-new WO is selected
  useEffect(() => {
    if (!selectedWo || (selectedWo as any).__new) { setComments([]); return }
    const wo = selectedWo as WorkOrder
    supabase.from('wo_comments')
      .select('*')
      .eq('work_order_id', wo.id)
      .order('created_at', { ascending: true })
      .then(({ data }) => setComments(data || []))
  }, [selectedWo, supabase])

  // Load tasks when a non-new WO is selected
  useEffect(() => {
    if (!selectedWo || (selectedWo as any).__new) { setTasks([]); return }
    const wo = selectedWo as WorkOrder
    supabase.from('wo_tasks')
      .select('*')
      .eq('work_order_id', wo.id)
      .order('sort_order', { ascending: true })
      .then(({ data }) => setTasks((data || []) as Task[]))
  }, [selectedWo, supabase])

  // Load assignees when a non-new WO is selected
  useEffect(() => {
    if (!selectedWo || (selectedWo as any).__new) { setAssignees([]); return }
    const wo = selectedWo as WorkOrder
    supabase.from('wo_assignees')
      .select('team_member_id')
      .eq('work_order_id', wo.id)
      .then(({ data }) => setAssignees((data || []).map((r: any) => r.team_member_id)))
  }, [selectedWo, supabase])

  function handleCommentInput(value: string, cursorPos: number) {
    setNewComment(value)
    const before = value.substring(0, cursorPos)
    const m = before.match(/(?:^|\s)@(\w*)$/)
    if (m) {
      setMentionDropdown({ open: true, query: m[1].toLowerCase(), position: cursorPos - m[1].length - 1 })
      setMentionIndex(0)
    } else {
      setMentionDropdown({ open: false, query: '', position: 0 })
    }
  }

  const mentionCandidates = useMemo(() => {
    if (!selectedWo || (selectedWo as any).__new) return team
    const wo = selectedWo as WorkOrder
    const priorityIds = new Set<string>()
    if (wo.owner_id) priorityIds.add(wo.owner_id)
    const priority = team.filter((t: any) => priorityIds.has(t.id))
    const others = team.filter((t: any) => !priorityIds.has(t.id))
    return [...priority, ...others]
  }, [team, selectedWo])

  const mentionMatches = useMemo(() => {
    const q = mentionDropdown.query
    return mentionCandidates.filter((t: any) =>
      t.name.toLowerCase().includes(q)
    ).slice(0, 6)
  }, [mentionCandidates, mentionDropdown.query])

  function insertMention(memberName: string) {
    const cursorPos = mentionDropdown.position + 1 + mentionDropdown.query.length
    const before = newComment.substring(0, mentionDropdown.position)
    const after = newComment.substring(cursorPos)
    const updated = before + '@' + memberName + ' ' + after
    setNewComment(updated)
    setMentionDropdown({ open: false, query: '', position: 0 })
  }

  function extractMentionedIds(body: string): string[] {
    const ids: string[] = []
    const seen = new Set<string>()
    const matches = body.match(/@(\w+)/g) || []
    matches.forEach(m => {
      const name = m.substring(1).toLowerCase()
      const member = team.find((t: any) => t.name.toLowerCase() === name || t.name.toLowerCase().startsWith(name))
      if (member && member.auth_user_id && !seen.has(member.auth_user_id)) {
        seen.add(member.auth_user_id)
        ids.push(member.auth_user_id)
      }
    })
    return ids
  }

    async function postComment() {
    if (!selectedWo || (selectedWo as any).__new) return
    const wo = selectedWo as WorkOrder
    const body = newComment.trim()
    if (!body) return
    setPostingComment(true)
    const mentionIds = extractMentionedIds(body)
    const { data, error } = await supabase.from('wo_comments')
      .insert({ work_order_id: wo.id, body, author_id: currentUserId, mentions: mentionIds })
      .select()
      .single()
    setPostingComment(false)
    if (error) { alert('Failed to post: ' + error.message); return }
    setComments(prev => [...prev, data as Comment])
    setNewComment('')
    if (mentionIds.length > 0 && data) {
      const authorName = team.find((t: any) => t.auth_user_id === currentUserId)?.name || 'Someone'
      const preview = body.substring(0, 120)
      const notifPayload = mentionIds
        .filter(uid => uid !== currentUserId)
        .map(uid => ({
          user_id: uid,
          source_type: 'comment',
          source_id: (data as any).id,
          work_order_id: wo.id,
          body_preview: preview,
          author_name: authorName,
          link_url: '/dashboard?wo=' + wo.id,
        }))
      if (notifPayload.length > 0) {
        await supabase.from('wo_notifications').insert(notifPayload)
      }
    }
  }

  async function deleteComment(commentId: string) {
    if (!confirm('Delete this comment?')) return
    const { error } = await supabase.from('wo_comments').delete().eq('id', commentId)
    if (error) { alert('Failed to delete: ' + error.message); return }
    setComments(prev => prev.filter(c => c.id !== commentId))
  }

  async function addTask() {
    if (!selectedWo || (selectedWo as any).__new) return
    const wo = selectedWo as WorkOrder
    const desc = newTaskDesc.trim()
    if (!desc) return
    setAddingTask(true)
    const nextSort = tasks.length > 0 ? Math.max(...tasks.map(t => t.sort_order)) + 1 : 0
    const today = new Date().toISOString().substring(0, 10)
    const { data, error } = await supabase.from('wo_tasks')
      .insert({
        work_order_id: wo.id,
        description: desc,
        assignee_id: wo.owner_id || null,
        priority: 'medium',
        status: 'todo',
        assigned_at: today,
        sort_order: nextSort,
      })
      .select()
      .single()
    setAddingTask(false)
    if (error) { alert('Failed to add task: ' + error.message); return }
    setTasks(prev => [...prev, data as Task])
    setNewTaskDesc('')
  }

  async function patchTask(taskId: string, patch: Partial<Task>) {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...patch } as Task : t))
    const { error } = await supabase.from('wo_tasks').update(patch).eq('id', taskId)
    if (error) {
      alert('Failed to update task: ' + error.message)
      // Reload to recover from optimistic update mismatch
      if (selectedWo && !(selectedWo as any).__new) {
        const wo = selectedWo as WorkOrder
        const { data } = await supabase.from('wo_tasks').select('*').eq('work_order_id', wo.id).order('sort_order', { ascending: true })
        setTasks((data || []) as Task[])
      }
    }
  }

  async function deleteTask(taskId: string) {
    if (!confirm('Delete this task?')) return
    setTasks(prev => prev.filter(t => t.id !== taskId))
    const { error } = await supabase.from('wo_tasks').delete().eq('id', taskId)
    if (error) alert('Failed to delete task: ' + error.message)
  }

  async function toggleAssignee(teamMemberId: string) {
    if (!selectedWo || (selectedWo as any).__new) return
    const wo = selectedWo as WorkOrder
    const isAssigned = assignees.includes(teamMemberId)
    setTogglingAssignee(teamMemberId)
    if (isAssigned) {
      // optimistic remove
      setAssignees(prev => prev.filter(id => id !== teamMemberId))
      const { error } = await supabase.from('wo_assignees')
        .delete()
        .eq('work_order_id', wo.id)
        .eq('team_member_id', teamMemberId)
      if (error) {
        alert('Failed to remove: ' + error.message)
        setAssignees(prev => [...prev, teamMemberId]) // rollback
      }
    } else {
      // optimistic add
      setAssignees(prev => [...prev, teamMemberId])
      const { error } = await supabase.from('wo_assignees')
        .insert({ work_order_id: wo.id, team_member_id: teamMemberId })
      if (error) {
        alert('Failed to assign: ' + error.message)
        setAssignees(prev => prev.filter(id => id !== teamMemberId)) // rollback
      }
    }
    setTogglingAssignee(null)
  }

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
    const prevState = workOrders
    setWorkOrders(prev => prev.map(w => w.id === woId ? { ...w, stage: newStage } : w))
    const { data, error } = await supabase.from('work_orders').update({ stage: newStage }).eq('id', woId).select()
    if (error) {
      alert('Move failed: ' + error.message)
      setWorkOrders(prevState) // rollback
    }
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
      occurrence: 'One-time',
      client_id: clients[0]?.id || '', service_id: services[0]?.id || '',
      owner_id: '', est_cost: 0, add_cost: 0, ad_spend: 0 })
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
      priority: newWo.priority || 'medium', occurrence: newWo.occurrence || 'One-time',
      est_cost: newWo.est_cost || 0,
      add_cost: newWo.add_cost || 0, ad_spend: newWo.ad_spend || 0,
      due_date: newWo.due_date || null,
      branch: newWo.branch || null, vendor: newWo.vendor || null,
      deliverables_link: newWo.deliverables_link || null,
      notes_link: newWo.notes_link || null, notes: newWo.notes || null,
      submitted_at: new Date().toISOString(),
    }
    const { data, error } = await supabase.from('work_orders').insert(payload)
      .select(`*, clients!work_orders_client_id_fkey(name), services!work_orders_service_id_fkey(name, category), team_members!work_orders_owner_id_fkey(name)`)
      .single()
    setSaving(false)
    if (error) { alert('Error creating: ' + error.message); return }
    setWorkOrders(prev => [data as WorkOrder, ...prev])
    setSelectedWo(null); setNewWo({})
  }

  // Today's Due + Overdue work orders (active stages only)
  const dueAlerts = useMemo(() => {
    if (!mounted) return { dueToday: [], overdue: [] }
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const todayEnd = new Date(todayStart)
    todayEnd.setDate(todayEnd.getDate() + 1)
    const dueToday: WorkOrder[] = []
    const overdue: WorkOrder[] = []
    workOrders.forEach(wo => {
      if (!wo.due_date) return
      if (['paid', 'archived'].includes(wo.stage)) return
      const dd = new Date(wo.due_date)
      if (dd >= todayStart && dd < todayEnd) dueToday.push(wo)
      else if (dd < todayStart) overdue.push(wo)
    })
    // Sort overdue by oldest first
    overdue.sort((a, b) => new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime())
    return { dueToday, overdue }
  }, [workOrders, mounted])

  const grouped = useMemo(() => {
    const out: Record<string, WorkOrder[]> = {}
    BOARD_STAGES.forEach(s => out[s] = [])
    filtered.forEach(wo => { if (out[wo.stage]) out[wo.stage].push(wo) })
    return out
  }, [filtered])

  const columnTotals = useMemo(() => {
    const out: Record<string, number> = {}
    BOARD_STAGES.forEach(s => {
      out[s] = (grouped[s] || []).reduce((sum, w) => sum + (w.est_cost || 0) + (w.add_cost || 0) + ((w as any).ad_spend || 0), 0)
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

  // Get current user id for comment authorship
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setCurrentUserId(data.user?.id || null)
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
          <div className="text-sm font-semibold text-gray-900 leading-snug line-clamp-2">
            {(card as any).flagged && <span className="text-red-600 mr-1" title="Flagged with issue">⚑</span>}
            {card.title}
          </div>
          {card.priority && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold border ${PRIORITY_COLORS[card.priority]}`}>
              {card.priority[0].toUpperCase()}
            </span>
          )}
        </div>
        <div className="text-xs text-gray-500 space-y-0.5">
          {card.clients?.name && <div className="truncate">🏢 {card.clients.name}</div>}
          {card.services?.name && <div className="truncate">⚙️ {card.services.name}</div>}
          {card.due_date && <div>📅 <ClientDate>{new Date(card.due_date).toLocaleDateString()}</ClientDate></div>}
        </div>

        {/* Task tag */}
        {(() => {
          const agg = taskAggregates?.[card.id]
          if (!agg || agg.total === 0) return null
          const allDone = agg.done === agg.total
          const hasOverdue = agg.overdue > 0
          const colorClass = allDone
            ? 'bg-green-50 text-green-700 border-green-200'
            : hasOverdue
              ? 'bg-red-50 text-red-700 border-red-200'
              : 'bg-gray-50 text-gray-600 border-gray-200'
          const tooltipLabel = hasOverdue
            ? `${agg.overdue} overdue · ${agg.done}/${agg.total} done`
            : `${agg.done}/${agg.total} done`
          return (
            <div className="mt-2">
              <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded font-semibold border ${colorClass}`}
                title={tooltipLabel}>
                ✓ {agg.done}/{agg.total} tasks
              </span>
            </div>
          )
        })()}

        {/* Avatar stack + assignee footer */}
        {(() => {
          const ownerId = card.owner_id
          const assigneeIds = assignmentsByWo?.[card.id] || []
          // Build a deduped, ordered list: owner first, then unique assignees not equal to owner
          const ordered: { id: string; name: string; isOwner: boolean }[] = []
          if (ownerId) {
            const name = teamById[ownerId] || card.team_members?.name || '?'
            ordered.push({ id: ownerId, name, isOwner: true })
          }
          assigneeIds.forEach(aid => {
            if (aid === ownerId) return
            const name = teamById[aid] || '?'
            ordered.push({ id: aid, name, isOwner: false })
          })
          if (ordered.length === 0) {
            return <div className="text-xs text-gray-400 mt-2 italic">Unassigned</div>
          }
          const footer =
            ordered.length === 1 ? ordered[0].name :
            ordered.length === 2 ? `${ordered[0].name} +1` :
            `${ordered[0].name} +${ordered.length - 1}`
          return (
            <div className="flex items-center gap-2 mt-2">
              <div className="flex -space-x-1.5">
                {ordered.slice(0, 4).map(m => (
                  <div key={m.id}
                    title={m.isOwner ? `${m.name} (owner)` : m.name}
                    className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white border border-white ${
                      m.isOwner ? 'ring-1 ring-amber-400' : ''
                    }`}
                    style={{ background: '#2d4a7c' }}>
                    {m.name[0]?.toUpperCase()}
                  </div>
                ))}
                {ordered.length > 4 && (
                  <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-gray-600 bg-gray-100 border border-white">
                    +{ordered.length - 4}
                  </div>
                )}
              </div>
              <div className="text-xs text-gray-600 truncate">{footer}</div>
            </div>
          )
        })()}

        {((card.est_cost || 0) + (card.add_cost || 0) + ((card as any).ad_spend || 0) > 0) && (
          <div className="text-xs font-mono text-gray-700 mt-2 font-semibold">
            ${((card.est_cost || 0) + (card.add_cost || 0) + ((card as any).ad_spend || 0)).toLocaleString()}
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

      {/* Today's Due + Overdue widget (desktop) */}
      {mounted && (dueAlerts.dueToday.length > 0 || dueAlerts.overdue.length > 0) && (
        <div className="hidden md:flex gap-3 px-6 pt-4 pb-2">
          {dueAlerts.overdue.length > 0 && (
            <div className="flex-1 bg-red-50 border border-red-200 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-red-600">⚠️</span>
                  <span className="text-xs font-bold text-red-700 uppercase tracking-wide">
                    Overdue ({dueAlerts.overdue.length})
                  </span>
                </div>
              </div>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {dueAlerts.overdue.slice(0, 5).map(wo => (
                  <button key={wo.id} onClick={() => setSelectedWo(wo)}
                    className="block w-full text-left text-xs bg-white hover:bg-red-100 border border-red-100 rounded px-2 py-1.5 transition-colors">
                    <div className="font-medium text-gray-900 truncate">{wo.title}</div>
                    <div className="text-red-600 text-[10px] mt-0.5">
                      {wo.clients?.name && <span>{wo.clients.name} · </span>}
                      Due <ClientDate>{new Date(wo.due_date!).toLocaleDateString()}</ClientDate>
                      {wo.team_members?.name && <span> · {wo.team_members.name}</span>}
                    </div>
                  </button>
                ))}
                {dueAlerts.overdue.length > 5 && (
                  <div className="text-[10px] text-red-500 italic pt-1">+ {dueAlerts.overdue.length - 5} more</div>
                )}
              </div>
            </div>
          )}
          {dueAlerts.dueToday.length > 0 && (
            <div className="flex-1 bg-amber-50 border border-amber-200 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span>📅</span>
                  <span className="text-xs font-bold text-amber-700 uppercase tracking-wide">
                    Due Today ({dueAlerts.dueToday.length})
                  </span>
                </div>
              </div>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {dueAlerts.dueToday.slice(0, 5).map(wo => (
                  <button key={wo.id} onClick={() => setSelectedWo(wo)}
                    className="block w-full text-left text-xs bg-white hover:bg-amber-100 border border-amber-100 rounded px-2 py-1.5 transition-colors">
                    <div className="font-medium text-gray-900 truncate">{wo.title}</div>
                    <div className="text-amber-700 text-[10px] mt-0.5">
                      {wo.clients?.name && <span>{wo.clients.name}</span>}
                      {wo.team_members?.name && <span> · {wo.team_members.name}</span>}
                    </div>
                  </button>
                ))}
                {dueAlerts.dueToday.length > 5 && (
                  <div className="text-[10px] text-amber-600 italic pt-1">+ {dueAlerts.dueToday.length - 5} more</div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Today's Due + Overdue widget (mobile) */}
      {mounted && (dueAlerts.dueToday.length > 0 || dueAlerts.overdue.length > 0) && (
        <div className="md:hidden px-3 pt-3 pb-1 space-y-2">
          {dueAlerts.overdue.length > 0 && (
            <button onClick={() => {/* could filter to overdue */}}
              className="w-full bg-red-50 border border-red-200 rounded-lg p-2.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span>⚠️</span>
                <span className="text-xs font-bold text-red-700 uppercase">{dueAlerts.overdue.length} Overdue</span>
              </div>
              <span className="text-[10px] text-red-600 truncate ml-2">
                {dueAlerts.overdue[0].title.substring(0, 30)}
                {dueAlerts.overdue.length > 1 ? ` +${dueAlerts.overdue.length - 1}` : ''}
              </span>
            </button>
          )}
          {dueAlerts.dueToday.length > 0 && (
            <button onClick={() => { if (dueAlerts.dueToday[0]) setSelectedWo(dueAlerts.dueToday[0]) }}
              className="w-full bg-amber-50 border border-amber-200 rounded-lg p-2.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span>📅</span>
                <span className="text-xs font-bold text-amber-700 uppercase">{dueAlerts.dueToday.length} Due Today</span>
              </div>
              <span className="text-[10px] text-amber-700 truncate ml-2">
                {dueAlerts.dueToday[0].title.substring(0, 30)}
                {dueAlerts.dueToday.length > 1 ? ` +${dueAlerts.dueToday.length - 1}` : ''}
              </span>
            </button>
          )}
        </div>
      )}

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

            <div className="px-4 md:px-6 py-5 space-y-6">

              {/* ─── Project ─── */}
              <div className="space-y-3">
                <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 pb-1">Project</div>

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
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Branch / Location</label>
                    {isNew ? (
                      <input type="text" value={(newWo as any).branch || ''}
                        onChange={e => setNewWo({ ...newWo, branch: e.target.value } as any)}
                        placeholder="e.g. Lombard IL · HQ"
                        className="w-full text-sm px-2 py-2 border border-gray-200 rounded focus:border-blue-500 focus:outline-none" />
                    ) : (
                      <input type="text" defaultValue={(wo as any)?.branch || ''}
                        onBlur={e => e.target.value !== ((wo as any)?.branch || '') && updateWo({ branch: e.target.value || null } as any)}
                        placeholder="e.g. Lombard IL · HQ"
                        className="w-full text-sm px-2 py-2 border border-gray-200 rounded focus:border-blue-500 focus:outline-none" />
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Occurrence</label>
                    {isNew ? (
                      <select value={(newWo as any).occurrence || 'One-time'}
                        onChange={e => setNewWo({ ...newWo, occurrence: e.target.value } as any)}
                        className="w-full text-sm px-2 py-2 border border-gray-200 rounded focus:border-blue-500 focus:outline-none">
                        <option value="One-time">One-time</option>
                        <option value="Recurring">Recurring</option>
                        <option value="Quarterly">Quarterly</option>
                        <option value="Weekly">Weekly</option>
                      </select>
                    ) : (
                      <select value={(wo as any)?.occurrence || 'One-time'}
                        onChange={e => updateWo({ occurrence: e.target.value } as any)}
                        className="w-full text-sm px-2 py-2 border border-gray-200 rounded focus:border-blue-500 focus:outline-none">
                        <option value="One-time">One-time</option>
                        <option value="Recurring">Recurring</option>
                        <option value="Quarterly">Quarterly</option>
                        <option value="Weekly">Weekly</option>
                      </select>
                    )}
                  </div>
                </div>
              </div>

              {/* ─── Ownership & Priority ─── */}
              <div className="space-y-3">
                <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 pb-1">Ownership &amp; Priority</div>

                {/* Assigned To (multi-select chip list) */}
                {isNew ? (
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">
                      Assigned To
                    </label>
                    <div className="text-xs text-gray-400 italic px-1">
                      Save the work order first, then assign team members.
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">
                      Assigned To {assignees.length > 0 && (
                        <span className="ml-1 normal-case text-gray-400 font-normal">({assignees.length})</span>
                      )}
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {team.map((t: any) => {
                        const assigned = assignees.includes(t.id)
                        const busy = togglingAssignee === t.id
                        return (
                          <button
                            key={t.id}
                            onClick={() => toggleAssignee(t.id)}
                            disabled={busy}
                            className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full border transition-all ${
                              busy ? 'opacity-50' : ''
                            } ${
                              assigned
                                ? 'bg-blue-50 border-blue-200 text-blue-800 hover:bg-blue-100'
                                : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700'
                            }`}
                            title={assigned ? `Remove ${t.name}` : `Assign ${t.name}`}
                          >
                            <span className={`inline-flex w-4 h-4 rounded-full items-center justify-center text-[10px] font-bold text-white ${
                              assigned ? '' : 'opacity-40'
                            }`} style={{ background: '#2d4a7c' }}>
                              {t.name[0]}
                            </span>
                            <span className="font-medium">{t.name}</span>
                            {assigned && <span className="text-blue-400 ml-0.5">×</span>}
                          </button>
                        )
                      })}
                      {team.length === 0 && (
                        <span className="text-xs text-gray-400 italic">No team members to assign.</span>
                      )}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
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
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Vendor</label>
                    {isNew ? (
                      <input type="text" value={(newWo as any).vendor || ''}
                        onChange={e => setNewWo({ ...newWo, vendor: e.target.value } as any)}
                        placeholder="e.g. Mod-Pac"
                        className="w-full text-sm px-2 py-2 border border-gray-200 rounded focus:border-blue-500 focus:outline-none" />
                    ) : (
                      <input type="text" defaultValue={(wo as any)?.vendor || ''}
                        onBlur={e => e.target.value !== ((wo as any)?.vendor || '') && updateWo({ vendor: e.target.value || null } as any)}
                        placeholder="e.g. Mod-Pac"
                        className="w-full text-sm px-2 py-2 border border-gray-200 rounded focus:border-blue-500 focus:outline-none" />
                    )}
                  </div>
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
                </div>
              </div>

              {/* ─── Timeline ─── */}
              <div className="space-y-3">
                <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 pb-1">Timeline</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Submission Date</label>
                    <div className="w-full text-sm px-2 py-2 border border-gray-100 rounded bg-gray-50 text-gray-600 font-mono">
                      {isNew
                        ? <span className="text-gray-400">— set on save —</span>
                        : ((wo as any)?.submitted_at
                            ? <ClientDate>{new Date((wo as any).submitted_at).toISOString().substring(0, 10)}</ClientDate>
                            : <span className="text-gray-400">—</span>)
                      }
                    </div>
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
                </div>
              </div>

              {/* ─── Costs ─── */}
              <div className="space-y-3">
                <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 pb-1">Costs</div>
                <div className="grid grid-cols-3 gap-3">
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
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Ad Spend</label>
                    <div className="relative">
                      <span className="absolute left-2 top-2 text-sm text-gray-400">$</span>
                      {isNew ? (
                        <input type="number" placeholder="0" value={(newWo as any).ad_spend || ''}
                          onChange={e => setNewWo({ ...newWo, ad_spend: parseFloat(e.target.value) || 0 } as any)}
                          className="w-full text-sm pl-5 pr-2 py-2 border border-gray-200 rounded font-mono focus:border-blue-500 focus:outline-none" />
                      ) : (
                        <input type="number" placeholder="0" defaultValue={(wo as any)?.ad_spend || ''}
                          onBlur={e => updateWo({ ad_spend: parseFloat(e.target.value) || 0 } as any)}
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
                    ${(
                      ((isNew ? newWo.est_cost : wo?.est_cost) || 0)
                      + ((isNew ? (newWo as any).ad_spend : (wo as any)?.ad_spend) || 0)
                      + ((isNew ? newWo.add_cost : wo?.add_cost) || 0)
                    ).toLocaleString()}
                  </span>
                </div>
              </div>

              {/* ─── Details ─── */}
              <div className="space-y-3">
                <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 pb-1">Details</div>

                {/* Flag with issue */}
                <div className={`rounded-lg border ${
                  (isNew ? (newWo as any).flagged : (wo as any)?.flagged)
                    ? 'border-red-200 bg-red-50'
                    : 'border-gray-200 bg-white'
                }`}>
                  <label className="flex items-start gap-2 px-3 py-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
                      checked={!!(isNew ? (newWo as any).flagged : (wo as any)?.flagged)}
                      onChange={e => {
                        const next = e.target.checked
                        if (isNew) {
                          setNewWo({ ...newWo, flagged: next, ...(next ? {} : { issue: null }) } as any)
                        } else {
                          updateWo({ flagged: next, ...(next ? {} : { issue: null }) } as any)
                        }
                      }}
                    />
                    <div className="flex-1">
                      <div className={`text-sm font-semibold ${
                        (isNew ? (newWo as any).flagged : (wo as any)?.flagged) ? 'text-red-700' : 'text-gray-700'
                      }`}>
                        <span className="mr-1">⚑</span> Flag with issue
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        Surface this work order to the team as needing attention
                      </div>
                    </div>
                  </label>
                  {(isNew ? (newWo as any).flagged : (wo as any)?.flagged) && (
                    <div className="px-3 pb-3 -mt-1">
                      {isNew ? (
                        <textarea
                          value={(newWo as any).issue || ''}
                          onChange={e => setNewWo({ ...newWo, issue: e.target.value } as any)}
                          rows={3}
                          placeholder="Describe the issue — what's broken, blocked, or needs the team's eyes."
                          className="w-full text-sm text-red-900 placeholder-red-300 px-3 py-2 border border-red-200 rounded bg-red-50/40 resize-none focus:border-red-500 focus:outline-none"
                        />
                      ) : (
                        <textarea
                          defaultValue={(wo as any)?.issue || ''}
                          onBlur={e => e.target.value !== ((wo as any)?.issue || '') && updateWo({ issue: e.target.value || null } as any)}
                          rows={3}
                          placeholder="Describe the issue — what's broken, blocked, or needs the team's eyes."
                          className="w-full text-sm text-red-900 placeholder-red-300 px-3 py-2 border border-red-200 rounded bg-red-50/40 resize-none focus:border-red-500 focus:outline-none"
                        />
                      )}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Deliverables Link</label>
                  {isNew ? (
                    <input type="url" value={(newWo as any).deliverables_link || ''}
                      onChange={e => setNewWo({ ...newWo, deliverables_link: e.target.value } as any)}
                      placeholder="https://drive.google.com/..."
                      className="w-full text-sm px-2 py-2 border border-gray-200 rounded focus:border-blue-500 focus:outline-none" />
                  ) : (
                    <input type="url" defaultValue={(wo as any)?.deliverables_link || ''}
                      onBlur={e => e.target.value !== ((wo as any)?.deliverables_link || '') && updateWo({ deliverables_link: e.target.value || null } as any)}
                      placeholder="https://drive.google.com/..."
                      className="w-full text-sm px-2 py-2 border border-gray-200 rounded focus:border-blue-500 focus:outline-none" />
                  )}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Notes Link</label>
                  {isNew ? (
                    <input type="url" value={(newWo as any).notes_link || ''}
                      onChange={e => setNewWo({ ...newWo, notes_link: e.target.value } as any)}
                      placeholder="https://docs.google.com/..."
                      className="w-full text-sm px-2 py-2 border border-gray-200 rounded focus:border-blue-500 focus:outline-none" />
                  ) : (
                    <input type="url" defaultValue={(wo as any)?.notes_link || ''}
                      onBlur={e => e.target.value !== ((wo as any)?.notes_link || '') && updateWo({ notes_link: e.target.value || null } as any)}
                      placeholder="https://docs.google.com/..."
                      className="w-full text-sm px-2 py-2 border border-gray-200 rounded focus:border-blue-500 focus:outline-none" />
                  )}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Notes</label>
                  {isNew ? (
                    <textarea value={(newWo as any).notes || ''}
                      onChange={e => setNewWo({ ...newWo, notes: e.target.value } as any)}
                      rows={4} placeholder="Internal notes about this work order..."
                      className="w-full text-sm text-gray-700 px-3 py-2 border border-gray-200 rounded resize-none focus:border-blue-500 focus:outline-none" />
                  ) : (
                    <textarea defaultValue={(wo as any)?.notes || ''}
                      onBlur={e => e.target.value !== ((wo as any)?.notes || '') && updateWo({ notes: e.target.value || null } as any)}
                      rows={4} placeholder="Internal notes about this work order..."
                      className="w-full text-sm text-gray-700 px-3 py-2 border border-gray-200 rounded resize-none focus:border-blue-500 focus:outline-none" />
                  )}
                </div>
              </div>

              {/* ─── Tasks (existing WO only) ─── */}
              {!isNew && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b border-gray-100 pb-1">
                    <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                      Tasks {tasks.length > 0 && (
                        <span className="ml-1 text-gray-500 font-mono normal-case">
                          {tasks.filter(t => t.status === 'done').length}/{tasks.length} done
                        </span>
                      )}
                    </div>
                  </div>

                  {tasks.length === 0 && (
                    <div className="text-xs text-gray-400 italic px-1">
                      No tasks yet. Break this work order into smaller actionable steps.
                    </div>
                  )}

                  {tasks.map(task => {
                    const isDone = task.status === 'done'
                    const today = new Date().toISOString().substring(0, 10)
                    const isOverdue = !isDone && task.due_date && task.due_date < today
                    const isDueToday = !isDone && task.due_date && task.due_date === today
                    return (
                      <div key={task.id} className={`rounded-lg border p-3 space-y-2 ${
                        isDone ? 'border-gray-100 bg-gray-50 opacity-70' :
                        isOverdue ? 'border-red-200 bg-red-50/40' :
                        isDueToday ? 'border-amber-200 bg-amber-50/40' :
                        'border-gray-200 bg-white'
                      }`}>
                        {/* Row 1: checkbox + description */}
                        <div className="flex items-start gap-2">
                          <input
                            type="checkbox"
                            checked={isDone}
                            onChange={e => patchTask(task.id, { status: e.target.checked ? 'done' : 'todo' })}
                            className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 flex-shrink-0"
                          />
                          <input
                            type="text"
                            defaultValue={task.description}
                            onBlur={e => {
                              const v = e.target.value.trim()
                              if (v && v !== task.description) patchTask(task.id, { description: v })
                              else if (!v) e.target.value = task.description
                            }}
                            className={`flex-1 text-sm bg-transparent border-0 px-1 py-0.5 focus:outline-none focus:bg-white focus:border focus:border-blue-500 focus:rounded ${
                              isDone ? 'line-through text-gray-500' : 'text-gray-900'
                            }`}
                          />
                          <button onClick={() => deleteTask(task.id)}
                            className="text-gray-300 hover:text-red-500 text-sm leading-none px-1"
                            title="Delete task">×</button>
                        </div>

                        {/* Row 2: meta grid */}
                        <div className="grid grid-cols-3 gap-2 pl-6">
                          <div>
                            <label className="block text-[10px] text-gray-400 uppercase font-semibold mb-0.5">Assignee</label>
                            <select value={task.assignee_id || ''}
                              onChange={e => patchTask(task.id, { assignee_id: e.target.value || null })}
                              className="w-full text-xs px-1.5 py-1 border border-gray-200 rounded focus:border-blue-500 focus:outline-none bg-white">
                              <option value="">Unassigned</option>
                              {team.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="block text-[10px] text-gray-400 uppercase font-semibold mb-0.5">Due</label>
                            <input type="date"
                              defaultValue={task.due_date || ''}
                              onBlur={e => patchTask(task.id, { due_date: e.target.value || null })}
                              className={`w-full text-xs px-1.5 py-1 border rounded focus:border-blue-500 focus:outline-none bg-white ${
                                isOverdue ? 'border-red-300 text-red-700' :
                                isDueToday ? 'border-amber-300 text-amber-700' :
                                'border-gray-200'
                              }`} />
                          </div>
                          <div>
                            <label className="block text-[10px] text-gray-400 uppercase font-semibold mb-0.5">Priority</label>
                            <select value={task.priority}
                              onChange={e => patchTask(task.id, { priority: e.target.value as Task['priority'] })}
                              className="w-full text-xs px-1.5 py-1 border border-gray-200 rounded focus:border-blue-500 focus:outline-none bg-white">
                              <option value="low">Low</option>
                              <option value="medium">Medium</option>
                              <option value="high">High</option>
                              <option value="urgent">Urgent</option>
                            </select>
                          </div>
                        </div>

                        {/* Row 3: status + link + notes inputs */}
                        <div className="grid grid-cols-2 gap-2 pl-6">
                          <div>
                            <label className="block text-[10px] text-gray-400 uppercase font-semibold mb-0.5">Status</label>
                            <select value={task.status}
                              onChange={e => patchTask(task.id, { status: e.target.value as Task['status'] })}
                              className="w-full text-xs px-1.5 py-1 border border-gray-200 rounded focus:border-blue-500 focus:outline-none bg-white">
                              <option value="todo">To Do</option>
                              <option value="in-progress">In Progress</option>
                              <option value="done">✓ Done</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-[10px] text-gray-400 uppercase font-semibold mb-0.5">Link</label>
                            <input type="url"
                              defaultValue={task.link || ''}
                              onBlur={e => {
                                const v = e.target.value.trim()
                                if (v !== (task.link || '')) patchTask(task.id, { link: v || null })
                              }}
                              placeholder="https://..."
                              className="w-full text-xs px-1.5 py-1 border border-gray-200 rounded focus:border-blue-500 focus:outline-none bg-white" />
                          </div>
                        </div>

                        {/* Row 4: notes */}
                        <div className="pl-6">
                          <label className="block text-[10px] text-gray-400 uppercase font-semibold mb-0.5">Notes</label>
                          <textarea
                            defaultValue={task.notes || ''}
                            onBlur={e => {
                              const v = e.target.value
                              if (v !== (task.notes || '')) patchTask(task.id, { notes: v || null })
                            }}
                            rows={1}
                            placeholder="Optional notes..."
                            className="w-full text-xs px-1.5 py-1 border border-gray-200 rounded resize-none focus:border-blue-500 focus:outline-none bg-white" />
                        </div>
                      </div>
                    )
                  })}

                  {/* Add task input */}
                  <div className="flex gap-2 pt-1">
                    <input
                      type="text"
                      value={newTaskDesc}
                      onChange={e => setNewTaskDesc(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTask() } }}
                      placeholder="+ Add task — press Enter"
                      className="flex-1 text-sm px-3 py-2 border border-dashed border-gray-300 rounded focus:border-blue-500 focus:border-solid focus:outline-none"
                    />
                    {newTaskDesc.trim() && (
                      <button onClick={addTask} disabled={addingTask}
                        className="px-3 py-2 rounded text-xs font-semibold text-white disabled:opacity-40"
                        style={{ background: '#1a2b4a' }}>
                        {addingTask ? '...' : 'Add'}
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Comments (existing WO only) */}
              {!isNew && (
                <div className="border-t border-gray-100 pt-4">
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                    Comments ({comments.length})
                  </div>
                  <div className="space-y-3 mb-3 max-h-80 overflow-y-auto">
                    {comments.length === 0 && (
                      <div className="text-xs text-gray-400 italic">No comments yet. Add the first one below.</div>
                    )}
                    {comments.map(comment => {
                      const authorName = comment.author_id ? authUserMap[comment.author_id] : 'Someone'
                      const isOwn = comment.author_id === currentUserId
                      const initials = (authorName || '?')[0].toUpperCase()
                      return (
                        <div key={comment.id} className="flex gap-2.5">
                          <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold text-white"
                               style={{ background: '#2d4a7c' }}>
                            {initials}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline gap-2 mb-0.5">
                              <span className="text-xs font-semibold text-gray-900">{authorName || 'Someone'}</span>
                              <span className="text-[10px] text-gray-400"><ClientDate>{new Date(comment.created_at).toLocaleString(undefined, { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</ClientDate></span>
                              {isOwn && (
                                <button onClick={() => deleteComment(comment.id)}
                                  className="ml-auto text-[10px] text-gray-400 hover:text-red-600">delete</button>
                              )}
                            </div>
                            <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap break-words">
                              {comment.body.split(/(@\w+)/g).map((part: string, idx: number) => {
                                if (part.startsWith('@')) {
                                  const memberExists = team.some((t: any) => t.name.toLowerCase() === part.substring(1).toLowerCase())
                                  if (memberExists) {
                                    return <span key={idx} className="bg-blue-100 text-blue-800 rounded px-1 py-0.5 font-medium">{part}</span>
                                  }
                                }
                                return <span key={idx}>{part}</span>
                              })}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1 relative">
                      <textarea value={newComment}
                        onChange={e => handleCommentInput(e.target.value, e.target.selectionStart)}
                        onKeyDown={e => {
                          if (mentionDropdown.open && mentionMatches.length > 0) {
                            if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIndex(i => (i + 1) % mentionMatches.length); return }
                            if (e.key === 'ArrowUp') { e.preventDefault(); setMentionIndex(i => (i - 1 + mentionMatches.length) % mentionMatches.length); return }
                            if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insertMention((mentionMatches[mentionIndex] as any).name); return }
                            if (e.key === 'Escape') { setMentionDropdown({ open: false, query: '', position: 0 }); return }
                          }
                          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                            e.preventDefault()
                            postComment()
                          }
                        }}
                        placeholder="Add a comment... use @ to mention. (Cmd+Enter to post)"
                        rows={2}
                        className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg resize-none focus:outline-none focus:border-blue-500" />
                      {mentionDropdown.open && mentionMatches.length > 0 && (
                        <div className="absolute bottom-full left-0 mb-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 min-w-[200px] max-h-56 overflow-y-auto">
                          {mentionMatches.map((m: any, idx: number) => (
                            <button key={m.id} onClick={() => insertMention(m.name)}
                              onMouseEnter={() => setMentionIndex(idx)}
                              className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 ${idx === mentionIndex ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                              <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ background: '#2d4a7c' }}>{m.name[0]}</div>
                              <span className="font-medium">{m.name}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex justify-end mt-2">
                    <button onClick={postComment}
                      disabled={postingComment || !newComment.trim()}
                      className="px-4 py-1.5 rounded-lg text-sm font-semibold text-white disabled:opacity-40 transition-opacity"
                      style={{ background: '#1a2b4a' }}>
                      {postingComment ? 'Posting...' : 'Post Comment'}
                    </button>
                  </div>
                </div>
              )}

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
                            <div className="flex-1 min-w-0 text-gray-700 leading-relaxed">
                              <span className="text-gray-500">Moved to </span>
                              <span className="font-semibold" style={{ color: to?.color }}>{to?.label || entry.to_stage}</span>
                              <span className="text-gray-500"> on </span>
                              <span className="text-gray-700"><ClientDate>{new Date(entry.changed_at).toLocaleDateString(undefined, { month: 'numeric', day: 'numeric', year: '2-digit' })}</ClientDate></span>
                              <span className="text-gray-500"> at </span>
                              <span className="text-gray-700"><ClientDate>{new Date(entry.changed_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</ClientDate></span>
                              {byName && <><span className="text-gray-500"> by </span><span className="font-medium text-gray-800">{byName}</span></>}
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
                    {wo?.created_at && <div>Created: <ClientDate>{new Date(wo.created_at).toLocaleString()}</ClientDate></div>}
                    {wo?.updated_at && <div>Updated: <ClientDate>{new Date(wo.updated_at).toLocaleString()}</ClientDate></div>}
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
