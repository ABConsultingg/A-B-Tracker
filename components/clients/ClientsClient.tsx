'use client'
import { useState, useMemo, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { STAGES } from '@/lib/types'
import type { ClientRate } from '@/lib/types'
import { priceFor, priceDiff } from '@/lib/pricing'
import PortalAccess, { type PortalUser } from './PortalAccess'

type ClientStatus = 'active' | 'paused' | 'archived'

type Client = {
  id: string
  name: string
  status: ClientStatus
  account_lead?: string | null
  company?: string | null
  contact_name?: string | null
  contact_email?: string | null
  contact_phone?: string | null
  address?: string | null
  notes?: string | null
  looker_enabled?: boolean | null
  looker_url?: string | null
  created_at?: string
  updated_at?: string
}

type WO = {
  id: string; title: string; stage: string; client_id: string;
  service_id?: string | null;
  est_cost?: number; add_cost?: number; due_date?: string; priority?: string;
  services?: any; team_members?: any;
}

type Service = {
  id: string
  name: string
  base_price: number
  occurrence: string
  active: boolean
}

type Draft = {
  name: string
  company: string
  contact_name: string
  contact_email: string
  contact_phone: string
  address: string
  notes: string
  status: ClientStatus
  looker_enabled: boolean
  looker_url: string
}

const EMPTY_DRAFT: Draft = {
  name: '',
  company: '',
  contact_name: '',
  contact_email: '',
  contact_phone: '',
  address: '',
  notes: '',
  status: 'active',
  looker_enabled: false,
  looker_url: '',
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
}

export default function ClientsClient({
  clients: initialClients,
  workOrders,
  currentMember,
  services,
  clientRates: initialRates,
  portalUsers,
}: {
  clients: Client[]
  workOrders: WO[]
  currentMember?: { id: string; role: string } | null
  services: Service[]
  clientRates: ClientRate[]
  portalUsers: PortalUser[]
}) {
  const isAdmin = currentMember?.role === 'admin'
  const portalByClient = useMemo(() => {
    const m: Record<string, PortalUser> = {}
    portalUsers.forEach(p => { m[p.client_id] = p })
    return m
  }, [portalUsers])
  const supabase = createClient()
  const [clients, setClients] = useState<Client[]>(initialClients)
  const [selected, setSelected] = useState<Client | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | ClientStatus>('all')
  const [saving, setSaving] = useState(false)
  const [justSaved, setJustSaved] = useState(false)
  const [clientRates, setClientRates] = useState<ClientRate[]>(initialRates)

  // Escape key closes the modal
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') closeModal()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const stats = useMemo(() => {
    const map: Record<string, { count: number; active: number; pipeline: number; revenue: number }> = {}
    workOrders.forEach(wo => {
      if (!map[wo.client_id]) map[wo.client_id] = { count: 0, active: 0, pipeline: 0, revenue: 0 }
      const m = map[wo.client_id]
      m.count++
      const v = (wo.est_cost || 0) + (wo.add_cost || 0)
      if (['paid', 'archived'].includes(wo.stage)) m.revenue += v
      else { m.pipeline += v; m.active++ }
    })
    return map
  }, [workOrders])

  const filteredClients = useMemo(() => {
    let list = clients
    if (statusFilter !== 'all') list = list.filter(c => (c.status || 'active') === statusFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(c =>
        c.name.toLowerCase().includes(q) ||
        (c.company || '').toLowerCase().includes(q) ||
        (c.contact_name || '').toLowerCase().includes(q)
      )
    }
    return list
  }, [clients, search, statusFilter])

  const selectedWOs = useMemo(() => {
    if (!selected) return []
    return workOrders
      .filter(wo => wo.client_id === selected.id)
      .sort((a, b) => {
        const aArchived = ['paid', 'archived'].includes(a.stage)
        const bArchived = ['paid', 'archived'].includes(b.stage)
        if (aArchived !== bArchived) return aArchived ? 1 : -1
        return 0
      })
  }, [selected, workOrders])

  const woByStage = useMemo(() => {
    const map: Record<string, WO[]> = {}
    selectedWOs.forEach(wo => {
      if (!map[wo.stage]) map[wo.stage] = []
      map[wo.stage].push(wo)
    })
    return map
  }, [selectedWOs])

  const selectedStats = selected ? stats[selected.id] || { count: 0, active: 0, pipeline: 0, revenue: 0 } : null

  // Rate card data: which services has this client used + how many times
  const rateCardRows = useMemo(() => {
    if (!selected) return []
    const usage: Record<string, number> = {}
    selectedWOs.forEach(wo => {
      if (wo.service_id) usage[wo.service_id] = (usage[wo.service_id] || 0) + 1
    })
    // Build rows for every service the client has used, plus any service that already has
    // an override for this client (in case there's an override for a service the client
    // hasn't used yet through an existing WO).
    const overrideServiceIds = clientRates
      .filter(r => r.client_id === selected.id)
      .map(r => r.service_id)
    const serviceIds = Array.from(new Set([...Object.keys(usage), ...overrideServiceIds]))
    return serviceIds
      .map(sid => {
        const svc = services.find(s => s.id === sid)
        if (!svc) return null
        const resolved = priceFor(selected.id, sid, services as any, clientRates)
        return {
          service: svc,
          usage: usage[sid] || 0,
          effective: resolved?.price ?? svc.base_price,
          isOverride: resolved?.isOverride ?? false,
          basePrice: svc.base_price,
          overrideRow: clientRates.find(r => r.client_id === selected.id && r.service_id === sid) || null,
        }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => b.usage - a.usage || a.service.name.localeCompare(b.service.name))
  }, [selected, selectedWOs, clientRates, services])

  // Projected monthly revenue: sum of effective rate for each unique RECURRING
  // service that's on this client's rate card. "On the rate card" means EITHER
  // (a) the client has at least one WO for it, OR (b) the client has a custom
  // rate override for it. This matches the rate card definition exactly, so
  // the tile total equals the sum of the recurring rows you see below.
  const projectedMonthly = useMemo(() => {
    if (!selected) return 0
    const recurringServiceIds = new Set<string>()
    // (a) Services this client has WOs for
    selectedWOs.forEach(wo => {
      if (!wo.service_id) return
      const svc = services.find(s => s.id === wo.service_id)
      if (!svc) return
      if (svc.occurrence !== 'Recurring') return
      recurringServiceIds.add(wo.service_id)
    })
    // (b) Services with an override for this client (even if no WO yet)
    clientRates
      .filter(r => r.client_id === selected.id)
      .forEach(r => {
        const svc = services.find(s => s.id === r.service_id)
        if (!svc) return
        if (svc.occurrence !== 'Recurring') return
        recurringServiceIds.add(r.service_id)
      })
    let total = 0
    recurringServiceIds.forEach(sid => {
      const resolved = priceFor(selected.id, sid, services as any, clientRates)
      const svc = services.find(s => s.id === sid)
      total += resolved?.price ?? svc?.base_price ?? 0
    })
    return total
  }, [selected, selectedWOs, services, clientRates])

  function openNewClient() {
    if (!isAdmin) return
    setIsNew(true)
    setSelected(null)
    setDraft(EMPTY_DRAFT)
  }

  function openClient(c: Client) {
    setIsNew(false)
    setSelected(c)
    setDraft({
      name: c.name || '',
      company: c.company || '',
      contact_name: c.contact_name || '',
      contact_email: c.contact_email || '',
      contact_phone: c.contact_phone || '',
      address: c.address || '',
      notes: c.notes || '',
      status: (c.status || 'active') as ClientStatus,
      looker_enabled: !!c.looker_enabled,
      looker_url: c.looker_url || '',
    })
  }

  function closeModal() {
    setSelected(null)
    setIsNew(false)
    setDraft(EMPTY_DRAFT)
  }

  function updateDraft(patch: Partial<Draft>) {
    setDraft(prev => ({ ...prev, ...patch }))
  }

  // Auto-save on field blur for existing clients (admin only)
  async function autoSaveField(field: keyof Draft, value: any) {
    if (!isAdmin || !selected || isNew) return
    // Skip if unchanged
    const currentValue = (selected as any)[field]
    if ((currentValue || '') === (value || '')) return
    setSaving(true)
    // Booleans need to be passed as-is, not coerced
    const dbValue = typeof value === 'boolean' ? value : (value || null)
    const { error } = await supabase
      .from('clients')
      .update({ [field]: dbValue, updated_at: new Date().toISOString() })
      .eq('id', selected.id)
    setSaving(false)
    if (error) {
      alert('Save failed: ' + error.message)
      return
    }
    // Update local state
    setClients(prev => prev.map(c => c.id === selected.id ? { ...c, [field]: dbValue } as Client : c))
    setSelected(prev => prev ? ({ ...prev, [field]: dbValue } as Client) : prev)
    setJustSaved(true)
    setTimeout(() => setJustSaved(false), 1500)
  }

  async function createClientRow() {
    if (!isAdmin) return
    const name = draft.name.trim()
    if (!name) { alert('Display name is required.'); return }

    // Auto-slug, with collision suffix
    let id = slugify(name)
    if (!id) { alert('Display name must contain at least one letter or number.'); return }
    if (clients.some(c => c.id === id)) {
      id = id + '-' + Math.random().toString(36).slice(2, 6)
    }

    setSaving(true)
    const payload = {
      id,
      name,
      company: draft.company.trim() || null,
      contact_name: draft.contact_name.trim() || null,
      contact_email: draft.contact_email.trim() || null,
      contact_phone: draft.contact_phone.trim() || null,
      address: draft.address.trim() || null,
      notes: draft.notes.trim() || null,
      status: draft.status,
      looker_enabled: draft.looker_enabled,
      looker_url: draft.looker_enabled ? (draft.looker_url.trim() || null) : null,
    }
    const { data, error } = await supabase
      .from('clients')
      .insert(payload)
      .select()
      .single()
    setSaving(false)
    if (error) { alert('Failed to create client: ' + error.message); return }
    setClients(prev => [...prev, data as Client].sort((a, b) => a.name.localeCompare(b.name)))
    closeModal()
  }

  async function archiveClient() {
    if (!isAdmin || !selected) return
    if (!confirm(`Archive ${selected.name}? They'll be hidden from the active list but their work order history is preserved.`)) return
    setSaving(true)
    const { error } = await supabase
      .from('clients')
      .update({ status: 'archived', updated_at: new Date().toISOString() })
      .eq('id', selected.id)
    setSaving(false)
    if (error) { alert('Failed to archive: ' + error.message); return }
    setClients(prev => prev.map(c => c.id === selected.id ? { ...c, status: 'archived' } as Client : c))
    closeModal()
  }

  // ── Rate-card mutations ─────────────────────────────────────────────────
  // If newPrice equals base price → remove any existing override.
  // Otherwise upsert (insert when no override exists, update when one does).
  async function setEffectivePrice(serviceId: string, newPrice: number) {
    if (!isAdmin || !selected) return
    if (isNaN(newPrice) || newPrice < 0) { alert('Valid price required'); return }
    const svc = services.find(s => s.id === serviceId)
    if (!svc) return
    const existing = clientRates.find(r => r.client_id === selected.id && r.service_id === serviceId)

    // Case A: new price matches base → remove override if one exists
    if (newPrice === svc.base_price) {
      if (!existing) return // already at base
      const prev = clientRates
      setClientRates(curr => curr.filter(r => r.id !== existing.id))
      const { error } = await supabase.from('client_rates').delete().eq('id', existing.id)
      if (error) {
        setClientRates(prev)
        alert('Failed to reset to base: ' + error.message)
      }
      return
    }

    // Case B: existing override → update price
    if (existing) {
      if (existing.price === newPrice) return // no-op
      const prev = clientRates
      setClientRates(curr => curr.map(r => r.id === existing.id ? { ...r, price: newPrice } : r))
      const { error } = await supabase.from('client_rates').update({ price: newPrice }).eq('id', existing.id)
      if (error) {
        setClientRates(prev)
        alert('Failed to update override: ' + error.message)
      }
      return
    }

    // Case C: no existing → insert new override
    const tempId = `tmp-${Date.now()}`
    const optimistic: ClientRate = {
      id: tempId,
      client_id: selected.id,
      service_id: serviceId,
      price: newPrice,
      notes: '',
      created_at: new Date().toISOString(),
    } as ClientRate
    setClientRates(curr => [...curr, optimistic])
    const { data, error } = await supabase
      .from('client_rates')
      .insert({ client_id: selected.id, service_id: serviceId, price: newPrice, notes: '' })
      .select('id, client_id, service_id, price, notes, effective_from, created_at')
      .single()
    if (error || !data) {
      setClientRates(curr => curr.filter(r => r.id !== tempId))
      alert('Failed to create override: ' + (error?.message ?? 'unknown error'))
      return
    }
    setClientRates(curr => curr.map(r => r.id === tempId ? (data as ClientRate) : r))
  }

  async function resetToBase(serviceId: string) {
    if (!isAdmin || !selected) return
    const existing = clientRates.find(r => r.client_id === selected.id && r.service_id === serviceId)
    if (!existing) return
    const svc = services.find(s => s.id === serviceId)
    if (!confirm(`Reset ${svc?.name || serviceId} to base price for ${selected.name}? Past work orders keep their original price.`)) return
    const prev = clientRates
    setClientRates(curr => curr.filter(r => r.id !== existing.id))
    const { error } = await supabase.from('client_rates').delete().eq('id', existing.id)
    if (error) {
      setClientRates(prev)
      alert('Failed to reset: ' + error.message)
    }
  }

  const statusPillStyle = (status?: string): React.CSSProperties => {
    switch (status) {
      case 'paused':   return { background: '#fef3c7', color: '#92400e' }
      case 'archived': return { background: '#f3f4f6', color: '#6b7280' }
      default:         return { background: '#d1fae5', color: '#065f46' }
    }
  }

  const showModal = !!selected || isNew

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clients</h1>
          <p className="text-sm text-gray-500 mt-1">
            {isAdmin
              ? 'Click any client to view or edit. Use + New client to onboard a new one.'
              : 'Click any client to view their details and work orders.'}
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={openNewClient}
            className="px-3 md:px-4 py-2 rounded-md text-sm font-semibold transition-all flex items-center gap-1.5 flex-shrink-0"
            style={{ background: 'var(--brand-accent, #d99e2b)', color: 'var(--brand-navy, #1a2b4a)' }}
          >
            <span className="text-base">+</span> <span className="hidden sm:inline">New client</span><span className="sm:hidden">New</span>
          </button>
        )}
      </div>

      <div className="mb-4 flex flex-wrap gap-2 items-center">
        <input
          type="text"
          placeholder="🔍 Search clients..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 min-w-[200px] max-w-md px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as any)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
          <option value="archived">Archived</option>
        </select>
        <div className="text-xs text-gray-500 font-mono ml-auto">
          {filteredClients.length} of {clients.length}
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr className="text-left text-xs text-gray-500 uppercase tracking-wider">
              <th className="px-4 md:px-6 py-3">Name</th>
              <th className="px-4 md:px-6 py-3 hidden md:table-cell">Contact</th>
              <th className="px-4 md:px-6 py-3 hidden sm:table-cell">Status</th>
              <th className="px-4 md:px-6 py-3 text-right">WOs</th>
              <th className="px-4 md:px-6 py-3 text-right hidden sm:table-cell">Active</th>
              <th className="px-4 md:px-6 py-3 text-right">Pipeline</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filteredClients.map(c => {
              const s = stats[c.id] || { count: 0, active: 0, pipeline: 0, revenue: 0 }
              return (
                <tr key={c.id} onClick={() => openClient(c)}
                    className="hover:bg-blue-50 cursor-pointer transition-colors">
                  <td className="px-4 md:px-6 py-3">
                    <div className="font-medium text-gray-900">{c.name}</div>
                    {c.company && c.company !== c.name && (
                      <div className="text-xs text-gray-500">{c.company}</div>
                    )}
                  </td>
                  <td className="px-4 md:px-6 py-3 text-gray-600 hidden md:table-cell">
                    {c.contact_name ? (
                      <div>
                        <div className="text-sm">{c.contact_name}</div>
                        {c.contact_email && <div className="text-xs text-gray-400">{c.contact_email}</div>}
                      </div>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-4 md:px-6 py-3 hidden sm:table-cell">
                    <span className="text-xs px-2 py-0.5 rounded font-medium" style={statusPillStyle(c.status)}>
                      {c.status || 'active'}
                    </span>
                  </td>
                  <td className="px-4 md:px-6 py-3 text-right font-mono text-gray-700">{s.count}</td>
                  <td className="px-4 md:px-6 py-3 text-right font-mono text-gray-700 hidden sm:table-cell">{s.active}</td>
                  <td className="px-4 md:px-6 py-3 text-right font-mono font-semibold text-gray-900">
                    ${s.pipeline.toLocaleString()}
                  </td>
                </tr>
              )
            })}
            {filteredClients.length === 0 && (
              <tr><td colSpan={6} className="text-center text-gray-400 py-12 text-sm">No clients match your filters</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {showModal && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40" onClick={closeModal} />
          <div className="fixed top-0 right-0 bottom-0 left-0 md:left-auto md:w-full md:max-w-2xl bg-white shadow-2xl z-50 overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-4 md:px-6 py-4 flex items-center justify-between z-10">
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-gray-900 truncate">
                  {isNew ? 'Add client' : (selected?.name || '')}
                </h2>
                <p className="text-xs text-gray-500 truncate">
                  {isNew
                    ? 'New client onboarding'
                    : (
                      <>
                        ID <span className="font-mono">{selected?.id}</span>
                        {selectedStats && <> · {selectedStats.count} work orders · {selectedStats.active} active</>}
                        {saving && <span className="text-blue-500 ml-2 font-medium">Saving...</span>}
                        {!saving && justSaved && <span className="text-green-600 ml-2 font-medium">✓ Saved</span>}
                      </>
                    )
                  }
                </p>
              </div>
              <button onClick={closeModal}
                className="text-gray-400 hover:text-gray-700 text-2xl leading-none w-10 h-10 flex items-center justify-center rounded hover:bg-gray-100 flex-shrink-0">×</button>
            </div>

            <div className="px-4 md:px-6 py-5 space-y-6">

              {/* ─── Client details ─── */}
              <div className="space-y-3">
                <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 pb-1">
                  Client details
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">
                      Display name {isNew && <span className="text-red-500">*</span>}
                    </label>
                    {isAdmin ? (
                      isNew ? (
                        <input type="text" autoFocus value={draft.name}
                          onChange={e => updateDraft({ name: e.target.value })}
                          placeholder="e.g. RBS"
                          className="w-full text-sm px-3 py-2 border border-gray-200 rounded focus:border-blue-500 focus:outline-none" />
                      ) : (
                        <input type="text" defaultValue={draft.name}
                          onBlur={e => autoSaveField('name', e.target.value)}
                          className="w-full text-sm px-3 py-2 border border-gray-200 rounded focus:border-blue-500 focus:outline-none" />
                      )
                    ) : (
                      <div className="text-sm text-gray-900 px-3 py-2 bg-gray-50 rounded">{draft.name || '—'}</div>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Status</label>
                    {isAdmin ? (
                      <select value={draft.status}
                        onChange={e => {
                          const v = e.target.value as ClientStatus
                          updateDraft({ status: v })
                          if (!isNew) autoSaveField('status', v)
                        }}
                        className="w-full text-sm px-3 py-2 border border-gray-200 rounded focus:border-blue-500 focus:outline-none bg-white">
                        <option value="active">Active</option>
                        <option value="paused">Paused</option>
                        <option value="archived">Archived</option>
                      </select>
                    ) : (
                      <span className="inline-block text-xs px-2 py-1 rounded font-medium" style={statusPillStyle(draft.status)}>
                        {draft.status}
                      </span>
                    )}
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Full company name</label>
                    {isAdmin ? (
                      isNew ? (
                        <input type="text" value={draft.company}
                          onChange={e => updateDraft({ company: e.target.value })}
                          placeholder="e.g. Richards Building Supply"
                          className="w-full text-sm px-3 py-2 border border-gray-200 rounded focus:border-blue-500 focus:outline-none" />
                      ) : (
                        <input type="text" defaultValue={draft.company}
                          onBlur={e => autoSaveField('company', e.target.value)}
                          placeholder="e.g. Richards Building Supply"
                          className="w-full text-sm px-3 py-2 border border-gray-200 rounded focus:border-blue-500 focus:outline-none" />
                      )
                    ) : (
                      <div className="text-sm text-gray-900 px-3 py-2 bg-gray-50 rounded">{draft.company || '—'}</div>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Primary contact name</label>
                    {isAdmin ? (
                      isNew ? (
                        <input type="text" value={draft.contact_name}
                          onChange={e => updateDraft({ contact_name: e.target.value })}
                          className="w-full text-sm px-3 py-2 border border-gray-200 rounded focus:border-blue-500 focus:outline-none" />
                      ) : (
                        <input type="text" defaultValue={draft.contact_name}
                          onBlur={e => autoSaveField('contact_name', e.target.value)}
                          className="w-full text-sm px-3 py-2 border border-gray-200 rounded focus:border-blue-500 focus:outline-none" />
                      )
                    ) : (
                      <div className="text-sm text-gray-900 px-3 py-2 bg-gray-50 rounded">{draft.contact_name || '—'}</div>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Primary contact email</label>
                    {isAdmin ? (
                      isNew ? (
                        <input type="email" value={draft.contact_email}
                          onChange={e => updateDraft({ contact_email: e.target.value })}
                          placeholder="name@company.com"
                          className="w-full text-sm px-3 py-2 border border-gray-200 rounded focus:border-blue-500 focus:outline-none" />
                      ) : (
                        <input type="email" defaultValue={draft.contact_email}
                          onBlur={e => autoSaveField('contact_email', e.target.value)}
                          placeholder="name@company.com"
                          className="w-full text-sm px-3 py-2 border border-gray-200 rounded focus:border-blue-500 focus:outline-none" />
                      )
                    ) : (
                      <div className="text-sm text-gray-900 px-3 py-2 bg-gray-50 rounded">{draft.contact_email || '—'}</div>
                    )}
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Phone</label>
                    {isAdmin ? (
                      isNew ? (
                        <input type="text" value={draft.contact_phone}
                          onChange={e => updateDraft({ contact_phone: e.target.value })}
                          placeholder="(555) 123-4567"
                          className="w-full text-sm px-3 py-2 border border-gray-200 rounded focus:border-blue-500 focus:outline-none" />
                      ) : (
                        <input type="text" defaultValue={draft.contact_phone}
                          onBlur={e => autoSaveField('contact_phone', e.target.value)}
                          placeholder="(555) 123-4567"
                          className="w-full text-sm px-3 py-2 border border-gray-200 rounded focus:border-blue-500 focus:outline-none" />
                      )
                    ) : (
                      <div className="text-sm text-gray-900 px-3 py-2 bg-gray-50 rounded">{draft.contact_phone || '—'}</div>
                    )}
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Address</label>
                    {isAdmin ? (
                      isNew ? (
                        <input type="text" value={draft.address}
                          onChange={e => updateDraft({ address: e.target.value })}
                          placeholder="Street, City, State, ZIP"
                          className="w-full text-sm px-3 py-2 border border-gray-200 rounded focus:border-blue-500 focus:outline-none" />
                      ) : (
                        <input type="text" defaultValue={draft.address}
                          onBlur={e => autoSaveField('address', e.target.value)}
                          placeholder="Street, City, State, ZIP"
                          className="w-full text-sm px-3 py-2 border border-gray-200 rounded focus:border-blue-500 focus:outline-none" />
                      )
                    ) : (
                      <div className="text-sm text-gray-900 px-3 py-2 bg-gray-50 rounded">{draft.address || '—'}</div>
                    )}
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Notes</label>
                    {isAdmin ? (
                      isNew ? (
                        <textarea value={draft.notes}
                          onChange={e => updateDraft({ notes: e.target.value })}
                          rows={3}
                          placeholder="Internal notes about this client..."
                          className="w-full text-sm px-3 py-2 border border-gray-200 rounded resize-none focus:border-blue-500 focus:outline-none" />
                      ) : (
                        <textarea defaultValue={draft.notes}
                          onBlur={e => autoSaveField('notes', e.target.value)}
                          rows={3}
                          placeholder="Internal notes about this client..."
                          className="w-full text-sm px-3 py-2 border border-gray-200 rounded resize-none focus:border-blue-500 focus:outline-none" />
                      )
                    ) : (
                      <div className="text-sm text-gray-900 px-3 py-2 bg-gray-50 rounded whitespace-pre-wrap min-h-[2rem]">{draft.notes || '—'}</div>
                    )}
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">
                      Looker dashboard needed?
                    </label>
                    {isAdmin ? (
                      <div className="flex gap-2 flex-wrap">
                        <label className={`inline-flex items-center gap-2 px-3 py-1.5 border rounded-full cursor-pointer text-sm ${
                          !draft.looker_enabled ? 'border-blue-300 bg-blue-50 text-blue-900' : 'border-gray-200 bg-white text-gray-600'
                        }`}>
                          <input type="radio" name="looker"
                            checked={!draft.looker_enabled}
                            onChange={() => {
                              updateDraft({ looker_enabled: false, looker_url: '' })
                              if (!isNew) {
                                autoSaveField('looker_enabled', false)
                                autoSaveField('looker_url', '')
                              }
                            }}
                            className="accent-blue-500" />
                          <span>No</span>
                        </label>
                        <label className={`inline-flex items-center gap-2 px-3 py-1.5 border rounded-full cursor-pointer text-sm ${
                          draft.looker_enabled ? 'border-blue-300 bg-blue-50 text-blue-900' : 'border-gray-200 bg-white text-gray-600'
                        }`}>
                          <input type="radio" name="looker"
                            checked={!!draft.looker_enabled}
                            onChange={() => {
                              updateDraft({ looker_enabled: true })
                              if (!isNew) autoSaveField('looker_enabled', true)
                            }}
                            className="accent-blue-500" />
                          <span>Yes — embed in their portal</span>
                        </label>
                      </div>
                    ) : (
                      <div className="text-sm text-gray-900 px-3 py-2 bg-gray-50 rounded">
                        {draft.looker_enabled ? 'Yes' : 'No'}
                      </div>
                    )}
                  </div>

                  {draft.looker_enabled && (
                    <div className="sm:col-span-2 pl-3 border-l-2 border-blue-100">
                      <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Dashboard URL</label>
                      {isAdmin ? (
                        isNew ? (
                          <input type="url" value={draft.looker_url}
                            onChange={e => updateDraft({ looker_url: e.target.value })}
                            placeholder="https://lookerstudio.google.com/embed/reporting/..."
                            className="w-full text-sm px-3 py-2 border border-gray-200 rounded focus:border-blue-500 focus:outline-none" />
                        ) : (
                          <input type="url" defaultValue={draft.looker_url}
                            onBlur={e => autoSaveField('looker_url', e.target.value)}
                            placeholder="https://lookerstudio.google.com/embed/reporting/..."
                            className="w-full text-sm px-3 py-2 border border-gray-200 rounded focus:border-blue-500 focus:outline-none" />
                        )
                      ) : (
                        <div className="text-sm text-gray-900 px-3 py-2 bg-gray-50 rounded break-all">{draft.looker_url || '—'}</div>
                      )}
                      <div className="text-[11px] text-gray-500 mt-1">
                        💡 Use the <strong>embed</strong> URL from Looker Studio (Share → Embed report → Copy link). Clients will see a "View Analytics" card in their portal.
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* ─── Portal access (existing clients only, admin only) ─── */}
              {!isNew && selected && isAdmin && (
                <PortalAccess
                  clientId={selected.id}
                  clientName={selected.name}
                  defaultEmail={selected.contact_email}
                  defaultName={selected.contact_name}
                  initial={portalByClient[selected.id] || null}
                />
              )}

              {/* ─── Snapshot + WO list (existing clients only) ─── */}
              {!isNew && selected && selectedStats && (
                <>
                  <div className="space-y-3">
                    <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 pb-1">
                      Snapshot
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="bg-gray-50 rounded-lg p-3 border-l-4 border-l-blue-500">
                        <div className="text-xs text-gray-500 uppercase tracking-wide">Pipeline</div>
                        <div className="text-xl font-bold mt-0.5 font-mono">${selectedStats.pipeline.toLocaleString()}</div>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3 border-l-4"
                        style={{ borderLeftColor: 'var(--brand-accent, #d99e2b)' }}>
                        <div className="text-xs text-gray-500 uppercase tracking-wide">Projected / mo</div>
                        <div className="text-xl font-bold mt-0.5 font-mono"
                          style={{ color: 'var(--brand-accent-2, #b8851e)' }}>
                          ${projectedMonthly.toLocaleString()}
                        </div>
                        <div className="text-[10px] text-gray-400 mt-0.5">
                          All recurring services at current rates
                        </div>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3 border-l-4 border-l-green-500">
                        <div className="text-xs text-gray-500 uppercase tracking-wide">Revenue</div>
                        <div className="text-xl font-bold mt-0.5 font-mono text-green-600">${selectedStats.revenue.toLocaleString()}</div>
                      </div>
                    </div>
                  </div>

                  {/* ─── Rate card (per-service effective price for this client) ─── */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between border-b border-gray-100 pb-1">
                      <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                        Rate card for {selected.name}
                      </div>
                      {rateCardRows.some(r => r.isOverride) && (
                        <div className="text-[11px] text-gray-500 font-mono">
                          {rateCardRows.filter(r => r.isOverride).length} custom
                        </div>
                      )}
                    </div>
                    {rateCardRows.length === 0 ? (
                      <div className="text-xs text-gray-400 italic py-2">
                        No services used yet. The rate card will populate when this client has work orders.
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-left text-[10px] text-gray-400 uppercase tracking-wider">
                              <th className="py-1.5">Service</th>
                              <th className="py-1.5 hidden sm:table-cell">Occurrence</th>
                              <th className="py-1.5 text-right">Used in</th>
                              <th className="py-1.5 text-right">Effective price</th>
                              <th className="py-1.5"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {rateCardRows.map(row => {
                              const diff = row.isOverride ? priceDiff(row.effective, row.basePrice) : null
                              return (
                                <tr key={row.service.id} className="border-t border-gray-50">
                                  <td className="py-2 pr-2">
                                    <div className="font-medium text-gray-900 text-sm flex items-center gap-1.5">
                                      {row.service.name}
                                      {row.isOverride && (
                                        <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded font-mono"
                                          style={{ background: 'var(--brand-accent-soft, #fdf6e8)', color: 'var(--brand-accent-2, #b8851e)' }}>
                                          Custom
                                        </span>
                                      )}
                                    </div>
                                    {row.isOverride && (
                                      <div className="text-[11px] text-gray-400 mt-0.5">
                                        Base: ${row.basePrice.toLocaleString()}
                                      </div>
                                    )}
                                  </td>
                                  <td className="py-2 pr-2 text-xs text-gray-500 hidden sm:table-cell">
                                    {row.service.occurrence}
                                  </td>
                                  <td className="py-2 pr-2 text-right font-mono text-gray-600 text-sm">
                                    {row.usage}
                                  </td>
                                  <td className="py-2 pr-2 text-right">
                                    {isAdmin ? (
                                      <div className="inline-flex flex-col items-end">
                                        <input type="number"
                                          defaultValue={row.effective}
                                          step="0.01" min="0"
                                          onBlur={e => {
                                            const v = Number(e.target.value)
                                            if (!isNaN(v) && v >= 0 && v !== row.effective) {
                                              setEffectivePrice(row.service.id, v)
                                            }
                                          }}
                                          className="w-24 text-right text-sm font-mono font-semibold border border-gray-200 rounded px-2 py-1 focus:border-blue-500 focus:outline-none"
                                          style={{ color: row.isOverride ? 'var(--brand-accent-2, #b8851e)' : undefined }} />
                                        {diff && diff.direction !== 'same' && (
                                          <span className="text-[10px] font-semibold mt-0.5"
                                            style={{ color: diff.direction === 'up' ? 'var(--green, #15803d)' : 'var(--amber, #b45309)' }}>
                                            {diff.direction === 'up' ? '+' : '-'}${Math.abs(diff.delta).toLocaleString()} ({diff.direction === 'up' ? '+' : ''}{diff.deltaPct}%)
                                          </span>
                                        )}
                                      </div>
                                    ) : (
                                      <span className="font-mono font-semibold text-sm"
                                        style={{ color: row.isOverride ? 'var(--brand-accent-2, #b8851e)' : undefined }}>
                                        ${row.effective.toLocaleString()}
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-2 pl-1 text-right">
                                    {isAdmin && row.isOverride && (
                                      <button
                                        onClick={() => resetToBase(row.service.id)}
                                        title="Reset to base price"
                                        className="text-[11px] text-gray-500 hover:text-gray-900 underline">
                                        Reset
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                        {isAdmin && (
                          <p className="text-[11px] text-gray-400 italic mt-2">
                            Edit a price to set a custom rate. Set it back to base to remove the override. Past work orders keep their original price.
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="space-y-3">
                    <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 pb-1">
                      Recent work orders
                    </div>
                    {selectedWOs.length === 0 ? (
                      <div className="text-sm text-gray-400 italic py-4 text-center">No work orders yet</div>
                    ) : (
                      <div className="space-y-4">
                        {STAGES.map(stage => {
                          const wos = woByStage[stage.id] || []
                          if (wos.length === 0) return null
                          const total = wos.reduce((s, w) => s + (w.est_cost || 0) + (w.add_cost || 0), 0)
                          return (
                            <div key={stage.id}>
                              <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-gray-100">
                                <div className="flex items-center gap-2">
                                  <div className="w-2 h-2 rounded-full" style={{ background: stage.color }} />
                                  <span className="text-xs font-semibold text-gray-700">{stage.label}</span>
                                  <span className="text-[10px] bg-gray-100 px-1.5 py-0.5 rounded font-mono">{wos.length}</span>
                                </div>
                                {total > 0 && <span className="text-xs text-gray-500 font-mono">${total.toLocaleString()}</span>}
                              </div>
                              <div className="space-y-1.5">
                                {wos.map(wo => (
                                  <a key={wo.id} href={`/dashboard?wo=${wo.id}`}
                                    className="block bg-gray-50 hover:bg-gray-100 rounded-lg p-2.5 transition-colors">
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="flex-1 min-w-0">
                                        <div className="text-sm font-medium text-gray-900 truncate">{wo.title}</div>
                                        <div className="text-xs text-gray-500 mt-0.5 flex flex-wrap gap-x-3">
                                          {wo.services?.name && <span>⚙️ {wo.services.name}</span>}
                                          {wo.team_members?.name && <span>👤 {wo.team_members.name}</span>}
                                          {wo.due_date && <span>📅 {new Date(wo.due_date).toLocaleDateString()}</span>}
                                        </div>
                                      </div>
                                      {((wo.est_cost || 0) + (wo.add_cost || 0) > 0) && (
                                        <div className="text-xs font-mono font-semibold text-gray-700 whitespace-nowrap">
                                          ${((wo.est_cost || 0) + (wo.add_cost || 0)).toLocaleString()}
                                        </div>
                                      )}
                                    </div>
                                  </a>
                                ))}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* Auto-save hint for existing clients */}
              {!isNew && isAdmin && (
                <p className="text-xs text-gray-400 italic">Changes save automatically when you click outside a field.</p>
              )}

              {/* Footer buttons */}
              {isNew && isAdmin && (
                <div className="pt-3 flex gap-2 sticky bottom-0 bg-white pb-2 -mx-4 md:-mx-6 px-4 md:px-6 border-t border-gray-100">
                  <button onClick={createClientRow} disabled={saving || !draft.name.trim()}
                    className="flex-1 py-3 rounded-lg font-semibold text-white disabled:opacity-50"
                    style={{ background: '#1a2b4a' }}>
                    {saving ? 'Creating...' : 'Create client'}
                  </button>
                  <button onClick={closeModal}
                    className="px-4 py-3 rounded-lg font-semibold text-gray-600 hover:bg-gray-100">
                    Cancel
                  </button>
                </div>
              )}

              {!isNew && isAdmin && selected && selected.status !== 'archived' && (
                <div className="pt-4 border-t border-gray-100">
                  <button onClick={archiveClient} disabled={saving}
                    className="w-full py-2.5 rounded-lg font-semibold text-sm text-red-700 bg-red-50 hover:bg-red-100 disabled:opacity-50">
                    📁 Archive client
                  </button>
                </div>
              )}

              {!isNew && selected && (
                <div className="pt-3 border-t border-gray-100 text-xs text-gray-400 space-y-0.5">
                  {selected.created_at && <div>Created: {new Date(selected.created_at).toLocaleDateString()}</div>}
                  {selected.updated_at && <div>Updated: {new Date(selected.updated_at).toLocaleDateString()}</div>}
                  <div>ID: <span className="font-mono">{selected.id}</span></div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
