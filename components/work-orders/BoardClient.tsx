'use client'
import { useState, useMemo, useEffect } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { STAGES, type WorkOrder, type WoStage, type ClientRate, type PrintProduct, type PrintProductTier } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'
import { useViewMode } from '@/lib/useViewMode'
import { ACTIVE_DELIVERY_STAGES, isStale, isOverdue } from '@/lib/sla'
import { priceFor } from '@/lib/pricing'
import { isCampaignService, CAMPAIGN_ITEMS, campaignItemCost, type CampaignPick } from '@/lib/campaign-items'
import WoLineItemsSection from './WoLineItemsSection'
import CampaignBuilderSection from './CampaignBuilderSection'
import DrawerScheduleSection, { ScheduleRow } from './DrawerScheduleSection'

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

export default function BoardClient({ initialWorkOrders, clients, services, team, taskAggregates, assignmentsByWo, lineItemTotalsByWo, currentMember, clientRates, printProducts, printProductTiers }: {
  initialWorkOrders: WorkOrder[]; clients: any[]; services: any[]; team: any[];
  taskAggregates?: Record<string, { total: number; done: number; overdue: number }>;
  assignmentsByWo?: Record<string, string[]>;
  lineItemTotalsByWo?: Record<string, number>;
  currentMember?: { id: string; role: string } | null;
  clientRates?: ClientRate[];
  printProducts?: PrintProduct[];
  printProductTiers?: PrintProductTier[];
}) {
  // Resolved price for the new-WO form. Used to auto-fill est_cost when both
  // client and service are selected, and to show a Custom / Base rate badge.
  // Returns null if either id is missing or the service isn't found.
  const rates = clientRates || []
  function resolveNewWoPrice(clientId: string | undefined, serviceId: string | undefined) {
    if (!clientId || !serviceId) return null
    return priceFor(clientId, serviceId, services as any, rates)
  }
  const isAdmin = currentMember?.role === 'admin'
  const [viewMode] = useViewMode(isAdmin)
  const showCosts = viewMode === 'admin'
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>(initialWorkOrders)
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  const [search, setSearch] = useState('')
  const [filterClient, setFilterClient] = useState('')
  const [filterService, setFilterService] = useState('')
  const [filterOwner, setFilterOwner] = useState('')
  const [selectedWo, setSelectedWo] = useState<WoOrNew | null>(null)

  // Line items subtotal for the currently-open WO panel. Updated by
  // WoLineItemsSection via its onTotalChange callback. Falls back to the
  // server-loaded aggregate when the panel hasn't loaded items yet.
  const [openWoLineItemTotal, setOpenWoLineItemTotal] = useState<number | null>(null)

  // ----- URL-driven sidebar filters -----
  const urlAssignedToMe       = searchParams.get('assignedToMe') === '1'
  const urlOwnedByMe          = searchParams.get('ownedByMe') === '1'
  const urlFlagged            = searchParams.get('flagged') === '1'
  const urlStale              = searchParams.get('stale') === '1'
  const urlOverdue            = searchParams.get('overdue') === '1'
  const urlActiveOnly         = searchParams.get('active') === '1'
  const urlOverdueOrFlagged   = searchParams.get('overdueOrFlagged') === '1'
  const urlClient             = searchParams.get('client') || ''
  const urlStage              = searchParams.get('stage') || ''

  const hasUrlFilters = urlAssignedToMe || urlOwnedByMe || urlFlagged || urlStale ||
    urlOverdue || urlActiveOnly || urlOverdueOrFlagged || !!urlClient || !!urlStage

  function clearUrlFilters() {
    router.push(pathname)
  }

  function activeFilterSummary(): string {
    const parts: string[] = []
    if (urlAssignedToMe) parts.push('assigned to me')
    if (urlOwnedByMe) parts.push('owned by me')
    if (urlFlagged) parts.push('flagged')
    if (urlStale) parts.push('stale (10d+ in stage)')
    if (urlOverdue) parts.push('overdue')
    if (urlActiveOnly) parts.push('active delivery')
    if (urlOverdueOrFlagged) parts.push('overdue or flagged')
    if (urlClient) {
      const c = clients.find((cc: any) => cc.id === urlClient)
      parts.push(`client: ${c?.name || urlClient}`)
    }
    if (urlStage) {
      if (urlStage === 'approved-or-executed') parts.push('ready to invoice')
      else parts.push(`stage: ${STAGES.find(s => s.id === urlStage)?.label || urlStage}`)
    }
    return parts.join(' · ')
  }

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
  const [tasks, setTasks] = useState<Task[]>([])
  const [assignees, setAssignees] = useState<string[]>([])
  const [togglingAssignee, setTogglingAssignee] = useState<string | null>(null)
  const supabase = createClient()

  // Reset line item total state when WO panel switches
  useEffect(() => {
    setOpenWoLineItemTotal(null)
  }, [selectedWo])

  // Auto-open WO from ?wo=X param
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const woId = params.get('wo')
    if (woId && workOrders.length > 0) {
      const found = workOrders.find(w => w.id === woId)
      if (found) {
        setSelectedWo(found)
        params.delete('wo')
        const qs = params.toString()
        window.history.replaceState({}, '', `/dashboard${qs ? '?' + qs : ''}`)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workOrders.length])


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

  useEffect(() => {
    if (!selectedWo || (selectedWo as any).__new) { setComments([]); return }
    const wo = selectedWo as WorkOrder
    supabase.from('wo_comments')
      .select('*')
      .eq('work_order_id', wo.id)
      .order('created_at', { ascending: true })
      .then(({ data }) => setComments(data || []))
  }, [selectedWo, supabase])

  useEffect(() => {
    if (!selectedWo || (selectedWo as any).__new) { setTasks([]); return }
    const wo = selectedWo as WorkOrder
    supabase.from('wo_tasks')
      .select('*')
      .eq('work_order_id', wo.id)
      .order('sort_order', { ascending: true })
      .then(({ data }) => setTasks((data || []) as Task[]))
  }, [selectedWo, supabase])

  useEffect(() => {
    if (!selectedWo || (selectedWo as any).__new) { setAssignees([]); return }
    const wo = selectedWo as WorkOrder
    supabase.from('wo_assignees')
      .select('team_member_id')
      .eq('work_order_id', wo.id)
      .then(({ data }) => setAssignees((data || []).map((r: any) => r.team_member_id)))
  }, [selectedWo, supabase])

  async function toggleAssignee(teamMemberId: string) {
    if (!selectedWo || (selectedWo as any).__new) return
    const wo = selectedWo as WorkOrder
    const isAssigned = assignees.includes(teamMemberId)
    setTogglingAssignee(teamMemberId)
    if (isAssigned) {
      setAssignees(prev => prev.filter(id => id !== teamMemberId))
      const { error } = await supabase.from('wo_assignees')
        .delete()
        .eq('work_order_id', wo.id)
        .eq('team_member_id', teamMemberId)
      if (error) {
        alert('Failed to remove: ' + error.message)
        setAssignees(prev => [...prev, teamMemberId])
      }
    } else {
      setAssignees(prev => [...prev, teamMemberId])
      const { error } = await supabase.from('wo_assignees')
        .insert({ work_order_id: wo.id, team_member_id: teamMemberId })
      if (error) {
        alert('Failed to assign: ' + error.message)
        setAssignees(prev => prev.filter(id => id !== teamMemberId))
      }
    }
    setTogglingAssignee(null)
  }

  const activeDeliverySet = useMemo(() => new Set<string>(ACTIVE_DELIVERY_STAGES), [])

  const filtered = useMemo(() => {
    return workOrders.filter(wo => {
      if (search && !wo.title.toLowerCase().includes(search.toLowerCase())) return false
      if (filterClient && wo.client_id !== filterClient) return false
      if (filterService && wo.service_id !== filterService) return false
      if (filterOwner && wo.owner_id !== filterOwner) return false

      if (urlAssignedToMe) {
        if (!currentMember?.id) return false
        const woAssignees = assignmentsByWo?.[wo.id] || []
        if (!woAssignees.includes(currentMember.id)) return false
      }
      if (urlOwnedByMe) {
        if (!currentMember?.id || wo.owner_id !== currentMember.id) return false
      }
      if (urlFlagged) {
        if ((wo as any).flagged !== true) return false
      }
      if (urlStale) {
        if (!isStale(wo)) return false
      }
      if (urlOverdue) {
        if (!isOverdue(wo)) return false
      }
      if (urlActiveOnly) {
        if (!activeDeliverySet.has(wo.stage)) return false
      }
      if (urlOverdueOrFlagged) {
        const flagged = (wo as any).flagged === true
        const overdue = isOverdue(wo)
        if (!flagged && !overdue) return false
      }
      if (urlClient) {
        if (wo.client_id !== urlClient) return false
      }
      if (urlStage) {
        if (urlStage === 'approved-or-executed') {
          if (wo.stage !== 'approved' && wo.stage !== 'deliverables-executed') return false
        } else {
          if (wo.stage !== urlStage) return false
        }
      }
      return true
    })
  }, [
    workOrders, search, filterClient, filterService, filterOwner,
    urlAssignedToMe, urlOwnedByMe, urlFlagged, urlStale, urlOverdue,
    urlActiveOnly, urlOverdueOrFlagged, urlClient, urlStage,
    currentMember?.id, assignmentsByWo, activeDeliverySet,
  ])

  async function moveStage(woId: string, newStage: WoStage) {
    const prevState = workOrders
    setWorkOrders(prev => prev.map(w => w.id === woId ? { ...w, stage: newStage } : w))
    const { data, error } = await supabase.from('work_orders').update({ stage: newStage }).eq('id', woId).select()
    if (error) {
      alert('Move failed: ' + error.message)
      setWorkOrders(prevState)
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
  // Campaign builder state — only used when service is Storm Response or Marketing Campaign
  const [campaignPicks, setCampaignPicks] = useState<CampaignPick[]>([])
  const [newWoSchedule, setNewWoSchedule] = useState<ScheduleRow[]>([])
  const [campaignTitle, setCampaignTitle] = useState('')
  const [campaignDuration, setCampaignDuration] = useState<{ value: string; unit: 'days' | 'weeks' | 'months' }>({ value: '', unit: 'weeks' })
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

    // Build notes — prefix with campaign meta if this is a campaign WO and the user filled them in
    let notesValue = newWo.notes || null
    if (isCampaignService(newWo.service_id)) {
      const metaParts: string[] = []
      if (campaignTitle.trim()) metaParts.push(campaignTitle.trim())
      if (campaignDuration.value && Number(campaignDuration.value) > 0) {
        metaParts.push(`${campaignDuration.value} ${campaignDuration.unit}`)
      }
      if (metaParts.length > 0) {
        const prefix = `Campaign: ${metaParts.join(' · ')}`
        notesValue = newWo.notes?.trim() ? `${prefix}\n\n${newWo.notes}` : prefix
      }
    }

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
      notes_link: newWo.notes_link || null, notes: notesValue,
      submitted_at: new Date().toISOString(),
    }
    const { data, error } = await supabase.from('work_orders').insert(payload)
      .select(`*, clients!work_orders_client_id_fkey(name), services!work_orders_service_id_fkey(name, category), team_members!work_orders_owner_id_fkey(name)`)
      .single()
    if (error) { setSaving(false); alert('Error creating: ' + error.message); return }

    // If this was a campaign WO with picks, flatten them to wo_line_items
    const woRow = data as WorkOrder
    if (isCampaignService(woRow.service_id) && campaignPicks.length > 0) {
      const lineItemRows = campaignPicks
        .map(pick => {
          const item = CAMPAIGN_ITEMS.find(i => i.id === pick.id)
          if (!item) return null
          const unitPrice = typeof pick.unitPrice === 'number' ? pick.unitPrice : item.price
          // For flat / no_charge, qty stays 1 so total = unit_price
          const qty = (item.pricing === 'per_unit' || item.pricing === 'monthly') ? pick.qty : 1
          const sortOrder = CAMPAIGN_ITEMS.findIndex(i => i.id === pick.id)
          return {
            work_order_id: woRow.id,
            description: item.name,
            qty,
            unit_price: unitPrice,
            sort_order: sortOrder,
            source: 'campaign',
            campaign_item_id: item.id,
          }
        })
        .filter((r): r is NonNullable<typeof r> => r !== null)

      if (lineItemRows.length > 0) {
        const { error: liError } = await supabase.from('wo_line_items').insert(lineItemRows)
        if (liError) {
          // WO is saved; just warn that line items partially failed
          alert(`WO created, but campaign items failed to save: ${liError.message}`)
        }
      }
    }

    // Flush buffered schedule rows (from drawer Execution Schedule on new WO)
    if (newWoSchedule.length > 0) {
      const scheduleRows = newWoSchedule.map(s => ({
        work_order_id: woRow.id,
        scheduled_date: s.scheduled_date,
        scheduled_time: s.scheduled_time,
        type: s.type,
        title: s.title,
        owner_id: s.owner_id,
        status: s.status,
        sort_order: s.sort_order,
      }))
      const { error: schedError } = await supabase.from('wo_schedule').insert(scheduleRows)
      if (schedError) {
        alert(`WO created, but schedule rows failed to save: ${schedError.message}`)
      }
    }

    setSaving(false)
    setWorkOrders(prev => [woRow, ...prev])
    setSelectedWo(null)
    setNewWo({})
    // Reset campaign builder state so the next New WO opens fresh
    setCampaignPicks([])
    setCampaignTitle('')
    setCampaignDuration({ value: '', unit: 'weeks' })
    setNewWoSchedule([])
  }

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
    overdue.sort((a, b) => new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime())
    return { dueToday, overdue }
  }, [workOrders, mounted])

  const grouped = useMemo(() => {
    const out: Record<string, WorkOrder[]> = {}
    BOARD_STAGES.forEach(s => out[s] = [])
    filtered.forEach(wo => { if (out[wo.stage]) out[wo.stage].push(wo) })
    // Newest first within each column.
    BOARD_STAGES.forEach(s => {
      out[s].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    })
    return out
  }, [filtered])

  // Helper: total cost for a single card/WO, including server-loaded line items.
  function cardCost(w: WorkOrder): number {
    return (w.est_cost || 0)
      + (w.add_cost || 0)
      + ((w as any).ad_spend || 0)
      + (lineItemTotalsByWo?.[w.id] || 0)
  }

  const columnTotals = useMemo(() => {
    const out: Record<string, number> = {}
    BOARD_STAGES.forEach(s => {
      out[s] = (grouped[s] || []).reduce((sum, w) => sum + cardCost(w), 0)
    })
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grouped, lineItemTotalsByWo])

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

  const teamById = useMemo(() => {
    const map: Record<string, string> = {}
    team.forEach((t: any) => { map[t.id] = t.name })
    return map
  }, [team])

  // Services grouped by billing cadence (Recurring, One-time, etc.) for use
  // in the New/Edit WO modal service dropdown. Recurring comes first.
  const servicesByOccurrence = useMemo(() => {
    const order = ['Recurring', 'One-time', 'Quarterly', 'Weekly', 'Other']
    const groups: Record<string, any[]> = {}
    services.forEach((s: any) => {
      const key = s.occurrence || 'Other'
      if (!groups[key]) groups[key] = []
      groups[key].push(s)
    })
    Object.values(groups).forEach(list => list.sort((a, b) => a.name.localeCompare(b.name)))
    // Sort by predefined order, falling back to alphabetical for unknown keys
    const sortedEntries = Object.entries(groups).sort((a, b) => {
      const ai = order.indexOf(a[0])
      const bi = order.indexOf(b[0])
      if (ai !== -1 && bi !== -1) return ai - bi
      if (ai !== -1) return -1
      if (bi !== -1) return 1
      return a[0].localeCompare(b[0])
    })
    return Object.fromEntries(sortedEntries)
  }, [services])

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
    const priority = card.priority || 'medium'
    const priorityColor =
      priority === 'urgent' ? 'var(--pri-urgent)' :
      priority === 'high'   ? 'var(--pri-high)'   :
      priority === 'low'    ? 'var(--pri-low)'    :
                              'var(--pri-medium)'
    const flagged = (card as any).flagged
    const priorityBadgeClasses: Record<string, string> = {
      urgent: 'bg-[#fee2e2] text-[#991b1b]',
      high:   'bg-[#ffedd5] text-[#9a3412]',
      medium: 'bg-[#fef9c3] text-[#854d0e]',
      low:    'bg-[#f1f5f9] text-[#475569]',
    }
    const occurrence = (card as any).occurrence
    return (
      <div key={card.id} draggable
        onDragStart={(e) => handleDragStart(e, card.id)}
        onDragEnd={handleDragEnd}
        onClick={() => setSelectedWo(card)}
        className={`bg-white rounded-lg px-3 py-2.5 cursor-grab active:cursor-grabbing transition-all hover:shadow-[0_2px_8px_rgba(15,27,52,0.08)] ${
          draggedId === card.id ? 'opacity-30' : ''
        }`}
        style={{
          border: '1px solid var(--border)',
          borderLeftWidth: '3px',
          borderLeftColor: flagged ? 'var(--red)' : priorityColor,
        }}>

        <div className="flex items-center justify-between gap-2 mb-1">
          <span className="font-mono text-[10px] tracking-wider" style={{ color: 'var(--text-faint)' }}>
            {card.id.startsWith('WO-') ? card.id : `WO-${card.id.substring(0, 8)}`}
          </span>
          <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-[1px] rounded ${priorityBadgeClasses[priority]}`}>
            {priority}
          </span>
        </div>

        <div className="text-[13px] font-[550] leading-snug line-clamp-2 mb-1.5" style={{ color: 'var(--brand-navy)', letterSpacing: '-0.005em' }}>
          {flagged && <span className="mr-1" style={{ color: 'var(--red)' }} title="Flagged with issue">⚑</span>}
          {card.title}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
          {card.clients?.name && (
            <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ background: 'var(--blue-soft)', color: 'var(--blue)' }}>
              {card.clients.name}
            </span>
          )}
          {card.services?.name && (
            <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ background: 'var(--purple-soft)', color: 'var(--purple)' }}>
              {card.services.name}
            </span>
          )}
          {occurrence && (
            <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ background: '#ecfeff', color: '#0e7490' }}>
              {occurrence}
            </span>
          )}
        </div>

        {card.due_date && (
          <div className="mt-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>
            📅 <span className="font-mono tabular-nums"><ClientDate>{new Date(card.due_date).toLocaleDateString()}</ClientDate></span>
          </div>
        )}

        {(() => {
          const agg = taskAggregates?.[card.id]
          if (!agg || agg.total === 0) return null
          const allDone = agg.done === agg.total
          const hasOverdue = agg.overdue > 0
          const colorStyle = allDone
            ? { background: 'var(--green-soft)', color: 'var(--green)', borderColor: '#a7f3d0' }
            : hasOverdue
              ? { background: 'var(--red-soft)', color: 'var(--red)', borderColor: '#fecaca' }
              : { background: 'var(--bg-sunken)', color: 'var(--text-muted)', borderColor: 'var(--border)' }
          const tooltipLabel = hasOverdue
            ? `${agg.overdue} overdue · ${agg.done}/${agg.total} done`
            : `${agg.done}/${agg.total} done`
          return (
            <div className="mt-2">
              <span className="inline-block text-[10px] px-1.5 py-0.5 rounded font-semibold border"
                style={colorStyle}
                title={tooltipLabel}>
                ✓ {agg.done}/{agg.total} tasks
              </span>
            </div>
          )
        })()}

        {(() => {
          const ownerId = card.owner_id
          const assigneeIds = assignmentsByWo?.[card.id] || []
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
          const cost = cardCost(card)
          if (ordered.length === 0) {
            return (
              <div className="flex items-center justify-between mt-2">
                <span className="text-[11px] italic" style={{ color: 'var(--text-faint)' }}>Unassigned</span>
                {showCosts && cost > 0 && (
                  <span className="text-[11px] font-mono tabular-nums font-semibold px-1.5 py-0.5 rounded"
                    style={{ background: 'var(--brand-accent-soft)', color: 'var(--brand-navy)' }}>
                    ${cost.toLocaleString()}
                  </span>
                )}
              </div>
            )
          }
          const footer =
            ordered.length === 1 ? ordered[0].name :
            ordered.length === 2 ? `${ordered[0].name} +1` :
            `${ordered[0].name} +${ordered.length - 1}`
          return (
            <div className="flex items-center justify-between mt-2 gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <div className="flex">
                  {ordered.slice(0, 4).map((m, idx) => (
                    <div key={m.id}
                      title={m.isOwner ? `${m.name} (owner)` : m.name}
                      className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-semibold flex-shrink-0"
                      style={{
                        background: m.isOwner ? 'var(--brand-accent)' : 'var(--brand-navy)',
                        color:      m.isOwner ? 'var(--brand-navy)'   : 'white',
                        marginLeft: idx === 0 ? 0 : '-6px',
                        border:     idx === 0 ? 'none' : '1.5px solid var(--bg-elevated)',
                        letterSpacing: '0.02em',
                      }}>
                      {m.name[0]?.toUpperCase()}
                    </div>
                  ))}
                  {ordered.length > 4 && (
                    <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-semibold flex-shrink-0"
                      style={{ background: 'var(--bg-sunken)', color: 'var(--text-muted)', marginLeft: '-6px', border: '1.5px solid var(--bg-elevated)' }}>
                      +{ordered.length - 4}
                    </div>
                  )}
                </div>
                <span className="text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>{footer}</span>
              </div>
              {showCosts && cost > 0 && (
                <span className="text-[11px] font-mono tabular-nums font-semibold px-1.5 py-0.5 rounded flex-shrink-0"
                  style={{ background: 'var(--brand-accent-soft)', color: 'var(--brand-navy)' }}>
                  ${cost.toLocaleString()}
                </span>
              )}
            </div>
          )
        })()}
      </div>
    )
  }

  // Compute the live line-item subtotal for the open WO. While the panel is
  // open and the section has reported its current sum via onTotalChange, use
  // that. Otherwise fall back to the server aggregate.
  const openWoLineItemSubtotal = useMemo(() => {
    if (!selectedWo || (selectedWo as any).__new) return 0
    if (openWoLineItemTotal != null) return openWoLineItemTotal
    const w = selectedWo as WorkOrder
    return lineItemTotalsByWo?.[w.id] || 0
  }, [selectedWo, openWoLineItemTotal, lineItemTotalsByWo])

  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--bg)' }}>
      {/* Active filter banner */}
      {hasUrlFilters && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 md:px-6 py-2 flex items-center justify-between gap-3">
          <div className="text-xs md:text-sm text-amber-900 truncate">
            <span className="font-semibold">Filter active:</span>{' '}
            <span className="text-amber-700">{activeFilterSummary()}</span>{' '}
            <span className="font-mono text-amber-600">· {filtered.length} of {workOrders.length}</span>
          </div>
          <button
            onClick={clearUrlFilters}
            className="text-xs md:text-sm text-amber-800 hover:text-amber-900 underline font-medium flex-shrink-0"
          >
            Clear filter
          </button>
        </div>
      )}

      <div className="px-4 md:px-6 py-4 md:py-5 bg-white border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center justify-between mb-3 md:mb-4">
          <div>
            <h1 className="font-serif text-2xl md:text-[28px] font-semibold tracking-tight" style={{ color: 'var(--brand-navy)' }}>Board</h1>
            <p className="hidden md:block text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Drag cards between columns · Click any card to edit</p>
          </div>
          <div className="flex items-center gap-2 md:gap-3">
            <div className="hidden md:block text-xs font-mono tabular-nums" style={{ color: 'var(--text-muted)' }}>
              <span className="font-semibold" style={{ color: 'var(--brand-navy)' }}>{filtered.length}</span> of {workOrders.length}
            </div>
            <button onClick={openNewWo}
              className="px-3 md:px-4 py-2 rounded-md text-sm font-semibold transition-all flex items-center gap-1.5"
              style={{ background: 'var(--brand-accent)', color: 'var(--brand-navy)' }}>
              <span className="text-base">+</span> <span className="hidden sm:inline">New work order</span><span className="sm:hidden">New</span>
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
        {showCosts && columnTotals[mobileStage] > 0 && (
          <div className="bg-white border-t border-gray-200 px-4 py-3 flex items-center justify-between">
            <span className="text-xs text-gray-500 uppercase font-semibold">Column Total</span>
            <span className="font-mono font-bold text-gray-900">${columnTotals[mobileStage].toLocaleString()}</span>
          </div>
        )}
      </div>

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

      {mounted && (dueAlerts.dueToday.length > 0 || dueAlerts.overdue.length > 0) && (
        <div className="md:hidden px-3 pt-3 pb-1 space-y-2">
          {dueAlerts.overdue.length > 0 && (
            <button onClick={() => {}}
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
                <div className="bg-white rounded-t-lg border border-b-0 px-3 py-2.5"
                     style={{ borderColor: 'var(--border)', borderTopColor: stage.color, borderTopWidth: 3 }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-sm" style={{ background: stage.color }} />
                      <span className="text-[12px] font-semibold uppercase tracking-wide" style={{ color: 'var(--brand-navy)' }}>{stage.label}</span>
                    </div>
                    <span className="text-[11px] font-mono tabular-nums px-1.5 py-0.5 rounded-full" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-faint)' }}>{cards.length}</span>
                  </div>
                  {showCosts && total > 0 && (
                    <div className="text-[11px] mt-1 font-mono tabular-nums" style={{ color: 'var(--text-muted)' }}>${total.toLocaleString()}</div>
                  )}
                </div>
                <div className={`border border-t-0 rounded-b-lg p-2 space-y-2 min-h-[120px] transition-colors ${
                  isDragOver ? 'bg-blue-50 border-blue-300 ring-2 ring-blue-200' : ''
                }`}
                  style={!isDragOver ? { background: 'var(--bg-sunken)', borderColor: 'var(--border)' } : {}}>
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
              <div className="flex items-center gap-2">
                {!isNew && wo?.id && (
                  <button
                    onClick={() => {
                      // Encode current board URL (filters + open WO) so Back to Board restores state
                      const params = new URLSearchParams(searchParams.toString())
                      params.set('wo', wo.id)
                      const from = encodeURIComponent(pathname + '?' + params.toString())
                      router.push(`/dashboard/wo/${wo.id}?from=${from}`)
                    }}
                    className="text-xs font-semibold text-blue-700 hover:text-blue-900 hover:bg-blue-50 px-2 py-1 rounded transition-colors"
                    title="Open full-page view with all tabs"
                  >
                    ↗ Open full view
                  </button>
                )}
                <button onClick={() => { setSelectedWo(null); setNewWo({}) }}
                  className="text-gray-400 hover:text-gray-700 text-2xl leading-none w-10 h-10 flex items-center justify-center rounded hover:bg-gray-100">×</button>
              </div>
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
                        onChange={e => {
                          const newClientId = e.target.value
                          const patch: any = { client_id: newClientId }
                          // Re-resolve est_cost when client changes (only if a service is already picked).
                          // Skip campaign services — est_cost is driven by item picker, must stay 0.
                          if (newClientId && newWo.service_id && !isCampaignService(newWo.service_id)) {
                            const resolved = resolveNewWoPrice(newClientId, newWo.service_id)
                            if (resolved) patch.est_cost = resolved.price
                          }
                          setNewWo({ ...newWo, ...patch })
                        }}
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
                        onChange={e => {
                          const newServiceId = e.target.value
                          const picked = services.find((s: any) => s.id === newServiceId)
                          const patch: any = { service_id: newServiceId }
                          if (picked?.lead_time_days != null) {
                            const target = new Date()
                            target.setDate(target.getDate() + picked.lead_time_days)
                            patch.due_date = target.toISOString().substring(0, 10)
                          }
                          // Campaign services: force est_cost to 0; item picker drives Total
                          if (isCampaignService(newServiceId)) {
                            patch.est_cost = 0
                            setCampaignPicks([])
                            setCampaignTitle('')
                            setCampaignDuration({ value: '', unit: 'weeks' })
                          }
                          // Auto-fill est_cost from priceFor (override if exists, else base)
                          else if (newServiceId && newWo.client_id) {
                            const resolved = resolveNewWoPrice(newWo.client_id, newServiceId)
                            if (resolved) patch.est_cost = resolved.price
                          } else if (picked?.base_price != null) {
                            patch.est_cost = picked.base_price
                          }
                          setNewWo({ ...newWo, ...patch })
                        }}
                        className="w-full text-sm px-2 py-2 border border-gray-200 rounded focus:border-blue-500 focus:outline-none">
                        <option value="">— Select —</option>
                        {Object.entries(servicesByOccurrence).map(([occ, list]) => (
                          <optgroup key={occ} label={occ}>
                            {(list as any[]).map((s: any) => (
                              <option key={s.id} value={s.id} title={s.description || ''}>
                                {s.name}{showCosts && s.base_price != null ? ` — $${s.base_price.toLocaleString()}${s.occurrence === 'Recurring' ? '/mo' : ''}` : ''}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    ) : (
                      <select value={wo?.service_id || ''}
                        onChange={e => updateWo({ service_id: e.target.value })}
                        className="w-full text-sm px-2 py-2 border border-gray-200 rounded focus:border-blue-500 focus:outline-none">
                        {Object.entries(servicesByOccurrence).map(([occ, list]) => (
                          <optgroup key={occ} label={occ}>
                            {(list as any[]).map((s: any) => (
                              <option key={s.id} value={s.id} title={s.description || ''}>
                                {s.name}{showCosts && s.base_price != null ? ` — $${s.base_price.toLocaleString()}${s.occurrence === 'Recurring' ? '/mo' : ''}` : ''}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    )}
                    {(() => {
                      const sid = isNew ? newWo.service_id : wo?.service_id
                      const picked = services.find((s: any) => s.id === sid)
                      if (!picked?.description) return null
                      return (
                        <div className="mt-1 text-[11px] leading-snug" style={{ color: 'var(--text-muted)' }}>
                          {picked.description}
                        </div>
                      )
                    })()}
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
              {showCosts && (
              <div className="space-y-3">
                <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 pb-1">Costs</div>
                {/* Costs card — amber/cream background, stacked rows, total inside */}
                <div
                  className="rounded-lg border p-4 space-y-3"
                  style={{
                    background: 'var(--brand-accent-soft, #fdf6e8)',
                    borderColor: 'var(--brand-accent, #d99e2b)',
                  }}
                >
                  {/* Estimated Cost (auto) */}
                  <div className="grid grid-cols-12 gap-3 items-center">
                    <label className="col-span-7 text-xs font-semibold text-gray-600 uppercase tracking-wide">
                      Estimated Cost <span className="text-gray-400 normal-case">(auto)</span>
                    </label>
                    <div className="col-span-5 relative">
                      <span className="absolute left-2 top-2 text-sm text-gray-400">$</span>
                      {isNew ? (
                        <input type="number" placeholder="0" value={newWo.est_cost || ''}
                          onChange={e => setNewWo({ ...newWo, est_cost: parseFloat(e.target.value) || 0 })}
                          className="w-full text-sm pl-5 pr-2 py-2 border border-gray-300 rounded font-mono text-right bg-white focus:border-blue-500 focus:outline-none" />
                      ) : (
                        <input type="number" placeholder="0" defaultValue={wo?.est_cost || ''}
                          onBlur={e => updateWo({ est_cost: parseFloat(e.target.value) || 0 })}
                          className="w-full text-sm pl-5 pr-2 py-2 border border-gray-300 rounded font-mono text-right bg-white focus:border-blue-500 focus:outline-none" />
                      )}
                    </div>
                  </div>

                  {/* Additional Cost */}
                  <div className="grid grid-cols-12 gap-3 items-center">
                    <label className="col-span-7 text-xs font-semibold text-gray-600 uppercase tracking-wide">
                      Additional Cost
                    </label>
                    <div className="col-span-5 relative">
                      <span className="absolute left-2 top-2 text-sm text-gray-400">$</span>
                      {isNew ? (
                        <input type="number" placeholder="0" value={newWo.add_cost || ''}
                          onChange={e => setNewWo({ ...newWo, add_cost: parseFloat(e.target.value) || 0 })}
                          className="w-full text-sm pl-5 pr-2 py-2 border border-gray-300 rounded font-mono text-right bg-white focus:border-blue-500 focus:outline-none" />
                      ) : (
                        <input type="number" placeholder="0" defaultValue={wo?.add_cost || ''}
                          onBlur={e => updateWo({ add_cost: parseFloat(e.target.value) || 0 })}
                          className="w-full text-sm pl-5 pr-2 py-2 border border-gray-300 rounded font-mono text-right bg-white focus:border-blue-500 focus:outline-none" />
                      )}
                    </div>
                  </div>

                  {/* Ad Spend */}
                  <div className="grid grid-cols-12 gap-3 items-center">
                    <label className="col-span-7 text-xs font-semibold text-gray-600 uppercase tracking-wide">
                      Ad Spend
                    </label>
                    <div className="col-span-5 relative">
                      <span className="absolute left-2 top-2 text-sm text-gray-400">$</span>
                      {isNew ? (
                        <input type="number" placeholder="0" value={(newWo as any).ad_spend || ''}
                          onChange={e => setNewWo({ ...newWo, ad_spend: parseFloat(e.target.value) || 0 } as any)}
                          className="w-full text-sm pl-5 pr-2 py-2 border border-gray-300 rounded font-mono text-right bg-white focus:border-blue-500 focus:outline-none" />
                      ) : (
                        <input type="number" placeholder="0" defaultValue={(wo as any)?.ad_spend || ''}
                          onBlur={e => updateWo({ ad_spend: parseFloat(e.target.value) || 0 } as any)}
                          className="w-full text-sm pl-5 pr-2 py-2 border border-gray-300 rounded font-mono text-right bg-white focus:border-blue-500 focus:outline-none" />
                      )}
                    </div>
                  </div>

                  {/* Divider + Total */}
                  <div className="pt-2" style={{ borderTop: '1px dashed rgba(217, 158, 43, 0.4)' }}>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-gray-900 uppercase tracking-wide">Total Cost</span>
                      <span className="text-xl font-bold font-mono" style={{ color: 'var(--brand-accent-2, #b8851e)' }}>
                        ${(
                          ((isNew ? newWo.est_cost : wo?.est_cost) || 0)
                          + ((isNew ? (newWo as any).ad_spend : (wo as any)?.ad_spend) || 0)
                          + ((isNew ? newWo.add_cost : wo?.add_cost) || 0)
                          + (isNew ? 0 : openWoLineItemSubtotal)
                        ).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>

                  {/* Service-info subtitle */}
                  {(() => {
                    const clientId = isNew ? newWo.client_id : wo?.client_id
                    const serviceId = isNew ? newWo.service_id : wo?.service_id
                    if (!clientId || !serviceId) return null
                    const resolved = resolveNewWoPrice(clientId, serviceId)
                    if (!resolved) return null
                    const picked = services.find((s: any) => s.id === serviceId)
                    if (!picked) return null
                    const currentEst = isNew ? (newWo.est_cost || 0) : (wo?.est_cost || 0)
                    const isManual = Math.abs(currentEst - resolved.price) > 0.01
                    const cadenceWord = picked.occurrence === 'Recurring'
                      ? 'recurring service (auto MRR)'
                      : `${(picked.occurrence || 'one-time').toLowerCase()} service`
                    const rateLabel = isManual
                      ? `manually edited (auto was $${resolved.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`
                      : resolved.isOverride
                        ? '★ custom rate — auto-filled'
                        : 'A&B standard rate — auto-filled'
                    return (
                      <div className="pt-2 text-[11px] text-gray-600" style={{ borderTop: '1px dashed rgba(217, 158, 43, 0.4)' }}>
                        <span className="font-semibold">{picked.name}</span>
                        <span className="text-gray-500"> · {rateLabel} · {cadenceWord}</span>
                      </div>
                    )
                  })()}
                </div>

                {/* Campaign builder — only on New WO with a campaign service picked (v1) */}
                {isNew && newWo.service_id && isCampaignService(newWo.service_id) && (
                  <div className="pt-2">
                    <CampaignBuilderSection
                      serviceId={newWo.service_id}
                      picks={campaignPicks}
                      onChange={setCampaignPicks}
                      title={campaignTitle}
                      onTitleChange={setCampaignTitle}
                      duration={campaignDuration}
                      onDurationChange={setCampaignDuration}
                    />
                  </div>
                )}

                {/* Line items — existing WOs only. Lives BELOW the costs card. */}
                {!isNew && wo?.id && (
                  <div className="pt-2">
                    <WoLineItemsSection
                      workOrderId={wo.id}
                      onTotalChange={setOpenWoLineItemTotal}
                      printProducts={printProducts || []}
                      printProductTiers={printProductTiers || []}
                    />
                  </div>
                )}
              </div>
              )}

              {/* ─── Details ─── */}
              <div className="space-y-3">
                <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 pb-1">Details</div>

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

              {/* ─── Execution Schedule section (Surface 2) ─── */}
              <div className="pt-2">
                <DrawerScheduleSection
                  workOrderId={isNew ? null : (wo?.id ?? null)}
                  team={team || []}
                  bufferedRows={isNew ? newWoSchedule : undefined}
                  onBufferedChange={isNew ? setNewWoSchedule : undefined}
                />
              </div>

              {/* ─── Tasks summary card (Step 4) ─── */}
              {!isNew && wo?.id && (
                <button
                  onClick={() => router.push(`/dashboard/wo/${wo.id}?tab=tasks`)}
                  className="w-full text-left px-3 py-2.5 rounded-lg border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-colors flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-700">
                      ✓ Tasks
                    </span>
                    <span className="text-xs text-gray-500">
                      {tasks.length === 0
                        ? 'No tasks yet'
                        : `${tasks.filter(t => t.status === 'done').length}/${tasks.length} done`}
                    </span>
                  </div>
                  <span className="text-gray-400 text-sm">›</span>
                </button>
              )}

              {/* Messages summary card (Step 4) */}
              {!isNew && wo?.id && (() => {
                const lastComment = comments.length > 0 ? comments[comments.length - 1] : null
                const lastAuthor = lastComment?.author_id ? authUserMap[lastComment.author_id] : null
                let lastAgo = ''
                if (lastComment?.created_at) {
                  const diffMs = Date.now() - new Date(lastComment.created_at).getTime()
                  const mins = Math.floor(diffMs / 60000)
                  if (mins < 1) lastAgo = 'just now'
                  else if (mins < 60) lastAgo = `${mins}m ago`
                  else if (mins < 1440) lastAgo = `${Math.floor(mins / 60)}h ago`
                  else lastAgo = `${Math.floor(mins / 1440)}d ago`
                }
                return (
                  <button
                    onClick={() => router.push(`/dashboard/wo/${wo.id}?tab=messages`)}
                    className="w-full text-left px-3 py-2.5 rounded-lg border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-colors flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-semibold text-gray-700 flex-shrink-0">
                        💬 Messages
                      </span>
                      <span className="text-xs text-gray-500 truncate">
                        {comments.length === 0
                          ? 'No messages yet'
                          : `${comments.length} comment${comments.length === 1 ? '' : 's'}${lastAuthor ? ` · last from ${lastAuthor.split(' ')[0]} ${lastAgo}` : ''}`}
                      </span>
                    </div>
                    <span className="text-gray-400 text-sm flex-shrink-0">›</span>
                  </button>
                )
              })()}

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
