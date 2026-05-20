'use client'
import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { WoOccurrence, ClientRate } from '@/lib/types'
import { ratesByService, priceDiff } from '@/lib/pricing'

type Service = {
  id: string
  name: string
  category: string | null
  base_price: number
  occurrence: WoOccurrence
  description: string | null
  lead_time_days: number | null
  revision_hours: number | null
  active: boolean
  sort_order: number
  created_at: string
}

type Draft = {
  name: string
  category: string
  base_price: number
  occurrence: WoOccurrence
  description: string
  lead_time_days: number | ''
  revision_hours: number | ''
  active: boolean
}

const EMPTY_DRAFT: Draft = {
  name: '',
  category: '',
  base_price: 0,
  occurrence: 'One-time',
  description: '',
  lead_time_days: '',
  revision_hours: '',
  active: true,
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
}

const OCCURRENCE_BADGE: Record<WoOccurrence, { bg: string; color: string; icon: string }> = {
  'One-time':  { bg: '#f1f5f9', color: '#475569', icon: '▸' },
  'Recurring': { bg: '#fef3c7', color: '#92400e', icon: '🔁' },
  'Quarterly': { bg: '#ecfeff', color: '#0e7490', icon: '📅' },
  'Weekly':    { bg: '#fce7f3', color: '#9d174d', icon: '🗓' },
}

export default function ServicesClient({
  services: initialServices,
  usageCounts,
  currentMember,
  clientRates: initialRates,
  clients,
}: {
  services: Service[]
  usageCounts: Record<string, number>
  currentMember?: { id: string; role: string } | null
  clientRates: ClientRate[]
  clients: { id: string; name: string }[]
}) {
  const isAdmin = currentMember?.role === 'admin'
  const supabase = createClient()
  const [services, setServices] = useState<Service[]>(initialServices)
  const [selected, setSelected] = useState<Service | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [saving, setSaving] = useState(false)
  const [justSaved, setJustSaved] = useState(false)

  // Per-client rate overrides (mutable so optimistic updates work)
  const [clientRates, setClientRates] = useState<ClientRate[]>(initialRates)

  // New-override picker state (per-service in the modal)
  const [newOverrideClient, setNewOverrideClient] = useState('')
  const [newOverridePrice, setNewOverridePrice] = useState<string>('')

  // Close modal on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') closeModal()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Available categories (for the dropdown + datalist)
  const categories = useMemo(() => {
    const set = new Set<string>()
    services.forEach(s => { if (s.category) set.add(s.category) })
    return Array.from(set).sort()
  }, [services])

  const filteredServices = useMemo(() => {
    let list = services
    if (categoryFilter) list = list.filter(s => s.category === categoryFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(s =>
        s.name.toLowerCase().includes(q) ||
        (s.category || '').toLowerCase().includes(q) ||
        (s.description || '').toLowerCase().includes(q)
      )
    }
    return list
  }, [services, search, categoryFilter])

  // Group all rates by service_id for fast lookup (used by table column + modal)
  const ratesByServiceMap = useMemo(() => ratesByService(clientRates), [clientRates])

  function openNewService() {
    if (!isAdmin) return
    setIsNew(true)
    setSelected(null)
    setDraft(EMPTY_DRAFT)
  }

  function openService(s: Service) {
    setIsNew(false)
    setSelected(s)
    setDraft({
      name: s.name || '',
      category: s.category || '',
      base_price: s.base_price || 0,
      occurrence: s.occurrence || 'One-time',
      description: s.description || '',
      lead_time_days: s.lead_time_days ?? '',
      revision_hours: s.revision_hours ?? '',
      active: s.active,
    })
    // Reset the new-override picker when switching services
    setNewOverrideClient('')
    setNewOverridePrice('')
  }

  function closeModal() {
    setSelected(null)
    setIsNew(false)
    setDraft(EMPTY_DRAFT)
    setNewOverrideClient('')
    setNewOverridePrice('')
  }

  function updateDraft(patch: Partial<Draft>) {
    setDraft(prev => ({ ...prev, ...patch }))
  }

  async function autoSaveField(field: keyof Draft, value: any) {
    if (!isAdmin || !selected || isNew) return
    const currentValue = (selected as any)[field]
    // Normalize empty strings to null for numeric and text fields
    let dbValue: any = value
    if (value === '' || value === undefined) dbValue = null
    if ((currentValue ?? null) === (dbValue ?? null)) return
    setSaving(true)
    const { error } = await supabase
      .from('services')
      .update({ [field]: dbValue })
      .eq('id', selected.id)
    setSaving(false)
    if (error) {
      alert('Save failed: ' + error.message)
      return
    }
    setServices(prev => prev.map(s => s.id === selected.id ? { ...s, [field]: dbValue } as Service : s))
    setSelected(prev => prev ? ({ ...prev, [field]: dbValue } as Service) : prev)
    setJustSaved(true)
    setTimeout(() => setJustSaved(false), 1500)
  }

  async function createServiceRow() {
    if (!isAdmin) return
    const name = draft.name.trim()
    if (!name) { alert('Service name is required.'); return }

    let id = slugify(name)
    if (!id) { alert('Service name must contain at least one letter or number.'); return }
    if (services.some(s => s.id === id)) {
      id = id + '-' + Math.random().toString(36).slice(2, 6)
    }

    setSaving(true)
    const payload = {
      id,
      name,
      category: draft.category.trim() || null,
      base_price: Number(draft.base_price) || 0,
      occurrence: draft.occurrence,
      description: draft.description.trim() || null,
      lead_time_days: draft.lead_time_days === '' ? null : Number(draft.lead_time_days),
      revision_hours: draft.revision_hours === '' ? null : Number(draft.revision_hours),
      active: draft.active,
      sort_order: 999, // new services land at the end
    }
    const { data, error } = await supabase
      .from('services')
      .insert(payload)
      .select()
      .single()
    setSaving(false)
    if (error) { alert('Failed to create service: ' + error.message); return }
    setServices(prev => [...prev, data as Service].sort((a, b) => a.name.localeCompare(b.name)))
    closeModal()
  }

  async function deleteService() {
    if (!isAdmin || !selected) return
    const usage = usageCounts[selected.id] || 0
    if (usage > 0) {
      alert(`Cannot delete — ${usage} work order(s) reference this service. Mark it inactive instead.`)
      return
    }
    if (!confirm(`Delete "${selected.name}" permanently? This cannot be undone.`)) return
    setSaving(true)
    const { error } = await supabase.from('services').delete().eq('id', selected.id)
    setSaving(false)
    if (error) { alert('Failed to delete: ' + error.message); return }
    setServices(prev => prev.filter(s => s.id !== selected.id))
    closeModal()
  }

  // ── Override mutations ───────────────────────────────────────────────────
  async function addOverride(serviceId: string, clientId: string, price: number) {
    if (!isAdmin) return
    if (!clientId) { alert('Select a client first'); return }
    if (isNaN(price) || price < 0) { alert('Valid price required'); return }
    // Optimistic insert with a temporary id so the row renders immediately
    const tempId = `tmp-${Date.now()}`
    const optimistic: ClientRate = {
      id: tempId,
      client_id: clientId,
      service_id: serviceId,
      price,
      notes: '',
      created_at: new Date().toISOString(),
    } as ClientRate
    setClientRates(prev => [...prev, optimistic])

    const { data, error } = await supabase
      .from('client_rates')
      .insert({ client_id: clientId, service_id: serviceId, price, notes: '' })
      .select('id, client_id, service_id, price, notes, effective_from, created_at')
      .single()

    if (error || !data) {
      setClientRates(prev => prev.filter(r => r.id !== tempId))
      alert('Failed to add override: ' + (error?.message ?? 'unknown error'))
      return
    }
    setClientRates(prev => prev.map(r => r.id === tempId ? (data as ClientRate) : r))
    setNewOverrideClient('')
    setNewOverridePrice('')
  }

  async function updateOverridePrice(rateId: string, newPrice: number) {
    const prev = clientRates
    setClientRates(curr => curr.map(r => r.id === rateId ? { ...r, price: newPrice } : r))
    const { error } = await supabase
      .from('client_rates')
      .update({ price: newPrice })
      .eq('id', rateId)
    if (error) {
      setClientRates(prev)
      alert('Failed to update price: ' + error.message)
    }
  }

  async function updateOverrideNote(rateId: string, newNote: string) {
    const prev = clientRates
    setClientRates(curr => curr.map(r => r.id === rateId ? { ...r, notes: newNote } : r))
    const { error } = await supabase
      .from('client_rates')
      .update({ notes: newNote })
      .eq('id', rateId)
    if (error) {
      setClientRates(prev)
      alert('Failed to update note: ' + error.message)
    }
  }

  async function removeOverride(rateId: string, clientName: string) {
    if (!confirm(`Remove ${clientName}'s custom rate? They'll fall back to the base price for new work orders.`)) return
    const prev = clientRates
    setClientRates(curr => curr.filter(r => r.id !== rateId))
    const { error } = await supabase
      .from('client_rates')
      .delete()
      .eq('id', rateId)
    if (error) {
      setClientRates(prev)
      alert('Failed to remove override: ' + error.message)
    }
  }

  const showModal = !!selected || isNew

  // For the field display, use draft for edit / display values for read-only
  const currentUsage = selected ? (usageCounts[selected.id] || 0) : 0

  // Overrides for the currently-open service (modal)
  const selectedOverrides = selected ? (ratesByServiceMap[selected.id] || []) : []
  const overriddenClientIds = new Set(selectedOverrides.map(r => r.client_id))
  const eligibleClients = clients.filter(c => !overriddenClientIds.has(c.id))

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Services</h1>
          <p className="text-sm text-gray-500 mt-1">
            {isAdmin
              ? 'Click any service to view or edit. Use + New service to add one.'
              : 'Click any service to view details.'}
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={openNewService}
            className="px-3 md:px-4 py-2 rounded-md text-sm font-semibold transition-all flex items-center gap-1.5 flex-shrink-0"
            style={{ background: 'var(--brand-accent, #d99e2b)', color: 'var(--brand-navy, #1a2b4a)' }}
          >
            <span className="text-base">+</span> <span className="hidden sm:inline">New service</span><span className="sm:hidden">New</span>
          </button>
        )}
      </div>

      <div className="mb-4 flex flex-wrap gap-2 items-center">
        <input
          type="text"
          placeholder="🔍 Search services..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 min-w-[200px] max-w-md px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          value={categoryFilter}
          onChange={e => setCategoryFilter(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
        >
          <option value="">All categories</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <div className="text-xs text-gray-500 font-mono ml-auto">
          {filteredServices.length} of {services.length}
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr className="text-left text-xs text-gray-500 uppercase tracking-wider">
              <th className="px-4 md:px-6 py-3">Service</th>
              <th className="px-4 md:px-6 py-3 hidden sm:table-cell">Category</th>
              <th className="px-4 md:px-6 py-3 hidden md:table-cell">Occurrence</th>
              <th className="px-4 md:px-6 py-3 hidden lg:table-cell">Custom Rates</th>
              <th className="px-4 md:px-6 py-3 text-right hidden sm:table-cell">Used in</th>
              <th className="px-4 md:px-6 py-3 text-right">Base Price</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filteredServices.map(s => {
              const usage = usageCounts[s.id] || 0
              const occ = OCCURRENCE_BADGE[s.occurrence] || OCCURRENCE_BADGE['One-time']
              const overrideCount = (ratesByServiceMap[s.id] || []).length
              return (
                <tr key={s.id} onClick={() => openService(s)}
                    className={`hover:bg-blue-50 cursor-pointer transition-colors ${!s.active ? 'opacity-60' : ''}`}>
                  <td className="px-4 md:px-6 py-3">
                    <div className="font-medium text-gray-900 flex items-center gap-2">
                      {s.name}
                      {!s.active && (
                        <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-gray-200 text-gray-600">
                          Inactive
                        </span>
                      )}
                    </div>
                    {s.description && (
                      <div className="text-xs text-gray-500 line-clamp-1 mt-0.5">{s.description}</div>
                    )}
                  </td>
                  <td className="px-4 md:px-6 py-3 text-gray-600 hidden sm:table-cell">{s.category || '—'}</td>
                  <td className="px-4 md:px-6 py-3 hidden md:table-cell">
                    <span className="text-xs px-2 py-0.5 rounded font-medium" style={{ background: occ.bg, color: occ.color }}>
                      {occ.icon} {s.occurrence}
                    </span>
                  </td>
                  <td className="px-4 md:px-6 py-3 hidden lg:table-cell">
                    {overrideCount > 0 ? (
                      <span className="text-xs px-2 py-0.5 rounded font-mono font-medium"
                        style={{ background: 'var(--brand-accent-soft, #fdf6e8)', color: 'var(--brand-accent-2, #b8851e)' }}>
                        {overrideCount} client{overrideCount === 1 ? '' : 's'}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-4 md:px-6 py-3 text-right font-mono text-gray-700 hidden sm:table-cell">{usage}</td>
                  <td className="px-4 md:px-6 py-3 text-right font-mono font-semibold text-gray-900">
                    ${(s.base_price || 0).toLocaleString()}
                  </td>
                </tr>
              )
            })}
            {filteredServices.length === 0 && (
              <tr><td colSpan={6} className="text-center text-gray-400 py-12 text-sm">No services match your filters</td></tr>
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
                  {isNew ? 'Add service' : (selected?.name || '')}
                </h2>
                <p className="text-xs text-gray-500 truncate">
                  {isNew
                    ? 'New service'
                    : (
                      <>
                        ID <span className="font-mono">{selected?.id}</span>
                        {currentUsage > 0 && <> · {currentUsage} work order{currentUsage === 1 ? '' : 's'}</>}
                        {saving && <span className="text-blue-500 ml-2 font-medium">Saving…</span>}
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

              {/* Details */}
              <div className="space-y-3">
                <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 pb-1">
                  Service details
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">
                      Name {isNew && <span className="text-red-500">*</span>}
                    </label>
                    {isAdmin ? (
                      isNew ? (
                        <input type="text" autoFocus value={draft.name}
                          onChange={e => updateDraft({ name: e.target.value })}
                          placeholder="e.g. Social Media"
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
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Category</label>
                    {isAdmin ? (
                      isNew ? (
                        <>
                          <input type="text" list="cat-suggest" value={draft.category}
                            onChange={e => updateDraft({ category: e.target.value })}
                            placeholder="e.g. Email, Branding, Events"
                            className="w-full text-sm px-3 py-2 border border-gray-200 rounded focus:border-blue-500 focus:outline-none" />
                          <datalist id="cat-suggest">
                            {categories.map(c => <option key={c} value={c} />)}
                          </datalist>
                        </>
                      ) : (
                        <>
                          <input type="text" list="cat-suggest" defaultValue={draft.category}
                            onBlur={e => autoSaveField('category', e.target.value)}
                            placeholder="e.g. Email, Branding, Events"
                            className="w-full text-sm px-3 py-2 border border-gray-200 rounded focus:border-blue-500 focus:outline-none" />
                          <datalist id="cat-suggest">
                            {categories.map(c => <option key={c} value={c} />)}
                          </datalist>
                        </>
                      )
                    ) : (
                      <div className="text-sm text-gray-900 px-3 py-2 bg-gray-50 rounded">{draft.category || '—'}</div>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Occurrence</label>
                    {isAdmin ? (
                      <select value={draft.occurrence}
                        onChange={e => {
                          const v = e.target.value as WoOccurrence
                          updateDraft({ occurrence: v })
                          if (!isNew) autoSaveField('occurrence', v)
                        }}
                        className="w-full text-sm px-3 py-2 border border-gray-200 rounded focus:border-blue-500 focus:outline-none bg-white">
                        <option value="One-time">One-time</option>
                        <option value="Recurring">Recurring</option>
                        <option value="Quarterly">Quarterly</option>
                        <option value="Weekly">Weekly</option>
                      </select>
                    ) : (
                      <span className="inline-block text-xs px-2 py-1 rounded font-medium"
                        style={OCCURRENCE_BADGE[draft.occurrence] ? { background: OCCURRENCE_BADGE[draft.occurrence].bg, color: OCCURRENCE_BADGE[draft.occurrence].color } : {}}>
                        {OCCURRENCE_BADGE[draft.occurrence]?.icon} {draft.occurrence}
                      </span>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">
                      Base price {isNew && <span className="text-red-500">*</span>}
                    </label>
                    {isAdmin ? (
                      <div className="relative">
                        <span className="absolute left-2 top-2 text-sm text-gray-400">$</span>
                        {isNew ? (
                          <input type="number" value={draft.base_price || ''}
                            onChange={e => updateDraft({ base_price: parseFloat(e.target.value) || 0 })}
                            placeholder="0"
                            step="any" min="0"
                            className="w-full text-sm pl-5 pr-2 py-2 border border-gray-200 rounded font-mono focus:border-blue-500 focus:outline-none" />
                        ) : (
                          <input type="number" defaultValue={draft.base_price || ''}
                            onBlur={e => autoSaveField('base_price', parseFloat(e.target.value) || 0)}
                            placeholder="0"
                            step="any" min="0"
                            className="w-full text-sm pl-5 pr-2 py-2 border border-gray-200 rounded font-mono focus:border-blue-500 focus:outline-none" />
                        )}
                      </div>
                    ) : (
                      <div className="text-sm text-gray-900 px-3 py-2 bg-gray-50 rounded font-mono">${draft.base_price.toLocaleString()}</div>
                    )}
                    {draft.occurrence === 'Recurring' && (
                      <div className="text-[11px] text-gray-500 mt-1">Per work order. For recurring services, this is the monthly rate.</div>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Active</label>
                    {isAdmin ? (
                      <label className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded cursor-pointer">
                        <input type="checkbox"
                          checked={draft.active}
                          onChange={e => {
                            updateDraft({ active: e.target.checked })
                            if (!isNew) autoSaveField('active', e.target.checked)
                          }}
                          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                        <span className="text-sm text-gray-700">
                          {draft.active ? 'Visible to team' : 'Hidden — won\'t show in WO service picker'}
                        </span>
                      </label>
                    ) : (
                      <div className="text-sm text-gray-900 px-3 py-2 bg-gray-50 rounded">{draft.active ? 'Yes' : 'No (hidden)'}</div>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Lead time (days)</label>
                    {isAdmin ? (
                      isNew ? (
                        <input type="number" value={draft.lead_time_days}
                          onChange={e => updateDraft({ lead_time_days: e.target.value === '' ? '' : parseInt(e.target.value) || 0 })}
                          placeholder="e.g. 5"
                          step="1" min="0"
                          className="w-full text-sm px-3 py-2 border border-gray-200 rounded font-mono focus:border-blue-500 focus:outline-none" />
                      ) : (
                        <input type="number" defaultValue={draft.lead_time_days}
                          onBlur={e => autoSaveField('lead_time_days', e.target.value === '' ? null : parseInt(e.target.value))}
                          placeholder="e.g. 5"
                          step="1" min="0"
                          className="w-full text-sm px-3 py-2 border border-gray-200 rounded font-mono focus:border-blue-500 focus:outline-none" />
                      )
                    ) : (
                      <div className="text-sm text-gray-900 px-3 py-2 bg-gray-50 rounded font-mono">{draft.lead_time_days || '—'}</div>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Revision window (hrs)</label>
                    {isAdmin ? (
                      isNew ? (
                        <input type="number" value={draft.revision_hours}
                          onChange={e => updateDraft({ revision_hours: e.target.value === '' ? '' : parseFloat(e.target.value) || 0 })}
                          placeholder="e.g. 24"
                          step="any" min="0"
                          className="w-full text-sm px-3 py-2 border border-gray-200 rounded font-mono focus:border-blue-500 focus:outline-none" />
                      ) : (
                        <input type="number" defaultValue={draft.revision_hours}
                          onBlur={e => autoSaveField('revision_hours', e.target.value === '' ? null : parseFloat(e.target.value))}
                          placeholder="e.g. 24"
                          step="any" min="0"
                          className="w-full text-sm px-3 py-2 border border-gray-200 rounded font-mono focus:border-blue-500 focus:outline-none" />
                      )
                    ) : (
                      <div className="text-sm text-gray-900 px-3 py-2 bg-gray-50 rounded font-mono">{draft.revision_hours || '—'}</div>
                    )}
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Description</label>
                    {isAdmin ? (
                      isNew ? (
                        <textarea value={draft.description}
                          onChange={e => updateDraft({ description: e.target.value })}
                          rows={3}
                          placeholder="What's included in this service..."
                          className="w-full text-sm px-3 py-2 border border-gray-200 rounded resize-none focus:border-blue-500 focus:outline-none" />
                      ) : (
                        <textarea defaultValue={draft.description}
                          onBlur={e => autoSaveField('description', e.target.value)}
                          rows={3}
                          placeholder="What's included in this service..."
                          className="w-full text-sm px-3 py-2 border border-gray-200 rounded resize-none focus:border-blue-500 focus:outline-none" />
                      )
                    ) : (
                      <div className="text-sm text-gray-900 px-3 py-2 bg-gray-50 rounded whitespace-pre-wrap min-h-[2rem]">{draft.description || '—'}</div>
                    )}
                  </div>
                </div>
              </div>

              {/* Usage info (existing only) */}
              {!isNew && selected && (
                <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                  <div className="text-xs text-gray-500">
                    {currentUsage === 0 ? (
                      <span>No work orders use this service yet — safe to delete.</span>
                    ) : (
                      <span>
                        <strong className="font-mono text-gray-900">{currentUsage}</strong> work order{currentUsage === 1 ? '' : 's'} reference this service.
                        Existing work orders keep their original price; only new work orders use the updated rate.
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Client-specific rate overrides */}
              {!isNew && selected && (
                <div className="border-t border-gray-100 pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                      Client-specific rate overrides
                    </div>
                    {selectedOverrides.length > 0 && (
                      <div className="text-[11px] text-gray-500 font-mono">
                        {selectedOverrides.length} override{selectedOverrides.length === 1 ? '' : 's'}
                      </div>
                    )}
                  </div>

                  {isAdmin ? (
                    <>
                      {selectedOverrides.length === 0 ? (
                        <div className="text-xs text-gray-400 italic py-1">
                          No overrides. All clients use the base price.
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          {selectedOverrides.map(r => {
                            const clientName = clients.find(c => c.id === r.client_id)?.name || r.client_id
                            const diff = priceDiff(r.price, selected.base_price || 0)
                            return (
                              <div key={r.id}
                                className="grid items-center gap-2 px-2.5 py-2 bg-gray-50 rounded"
                                style={{ gridTemplateColumns: '1fr 130px 28px' }}>
                                <div className="min-w-0">
                                  <div className="text-sm font-medium" style={{ color: 'var(--brand-navy, #1a2b4a)' }}>
                                    {clientName}
                                    {diff && diff.direction !== 'same' && (
                                      <span className="ml-1.5 text-[11px] font-semibold"
                                        style={{ color: diff.direction === 'up' ? 'var(--green, #15803d)' : 'var(--amber, #b45309)' }}>
                                        {diff.direction === 'up' ? '+' : '-'}${Math.abs(diff.delta).toLocaleString()} ({diff.direction === 'up' ? '+' : ''}{diff.deltaPct}%)
                                      </span>
                                    )}
                                  </div>
                                  <input type="text" defaultValue={r.notes ?? ''}
                                    placeholder="Note (optional)"
                                    onBlur={e => {
                                      const v = e.target.value
                                      if (v !== (r.notes ?? '')) updateOverrideNote(r.id, v)
                                    }}
                                    className="w-full text-[11px] text-gray-500 bg-transparent border-none p-0 mt-0.5 focus:outline-none" />
                                </div>
                                <input type="number" defaultValue={r.price}
                                  step="0.01" min="0"
                                  onBlur={e => {
                                    const v = Number(e.target.value)
                                    if (!isNaN(v) && v >= 0 && v !== r.price) updateOverridePrice(r.id, v)
                                  }}
                                  className="text-right text-sm font-mono font-semibold border border-gray-200 rounded px-2 py-1 focus:border-blue-500 focus:outline-none"
                                  style={{ color: 'var(--brand-accent-2, #b8851e)' }} />
                                <button
                                  title="Remove override"
                                  onClick={() => removeOverride(r.id, clientName)}
                                  className="text-red-600 border border-gray-200 rounded px-1.5 py-1 text-xs hover:bg-red-50">
                                  ✕
                                </button>
                              </div>
                            )
                          })}
                        </div>
                      )}

                      {eligibleClients.length > 0 && (
                        <div className="flex gap-2 items-center mt-2">
                          <select value={newOverrideClient}
                            onChange={e => setNewOverrideClient(e.target.value)}
                            className="flex-1 text-xs px-2 py-1.5 border border-gray-200 rounded bg-white focus:border-blue-500 focus:outline-none">
                            <option value="">+ Choose a client to override…</option>
                            {eligibleClients.map(c => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                          </select>
                          <input type="number" value={newOverridePrice}
                            onChange={e => setNewOverridePrice(e.target.value)}
                            placeholder={String(selected.base_price || '')}
                            step="0.01" min="0"
                            className="w-24 text-right text-xs font-mono px-2 py-1.5 border border-gray-200 rounded focus:border-blue-500 focus:outline-none" />
                          <button
                            onClick={() => addOverride(selected.id, newOverrideClient, Number(newOverridePrice))}
                            className="px-3 py-1.5 text-xs font-semibold rounded border border-gray-200 hover:bg-gray-50">
                            Add
                          </button>
                        </div>
                      )}

                      <p className="text-[11px] text-gray-400 italic mt-2">
                        When set, overrides replace the base price for that client only. Past work orders keep their original price.
                      </p>
                    </>
                  ) : (
                    <div className="text-xs text-gray-500">
                      {selectedOverrides.length === 0
                        ? 'All clients use the base price.'
                        : `${selectedOverrides.length} client${selectedOverrides.length === 1 ? '' : 's'} have custom rates for this service.`}
                    </div>
                  )}
                </div>
              )}

              {!isNew && isAdmin && (
                <p className="text-xs text-gray-400 italic">Changes save automatically when you click outside a field.</p>
              )}

              {/* Footer buttons */}
              {isNew && isAdmin && (
                <div className="pt-3 flex gap-2 sticky bottom-0 bg-white pb-2 -mx-4 md:-mx-6 px-4 md:px-6 border-t border-gray-100">
                  <button onClick={createServiceRow} disabled={saving || !draft.name.trim()}
                    className="flex-1 py-3 rounded-lg font-semibold text-white disabled:opacity-50"
                    style={{ background: '#1a2b4a' }}>
                    {saving ? 'Creating…' : 'Create service'}
                  </button>
                  <button onClick={closeModal}
                    className="px-4 py-3 rounded-lg font-semibold text-gray-600 hover:bg-gray-100">
                    Cancel
                  </button>
                </div>
              )}

              {!isNew && isAdmin && selected && (
                <div className="pt-4 border-t border-gray-100">
                  <button onClick={deleteService} disabled={saving || currentUsage > 0}
                    className="w-full py-2.5 rounded-lg font-semibold text-sm text-red-700 bg-red-50 hover:bg-red-100 disabled:opacity-40 disabled:cursor-not-allowed">
                    {currentUsage > 0
                      ? `🔒 Cannot delete — used by ${currentUsage} work order${currentUsage === 1 ? '' : 's'}`
                      : '🗑 Delete service'}
                  </button>
                  {currentUsage > 0 && (
                    <p className="text-[11px] text-gray-500 mt-2 text-center">
                      To retire this service, uncheck "Active" instead. Existing work orders won't break.
                    </p>
                  )}
                </div>
              )}

              {!isNew && selected && (
                <div className="pt-3 border-t border-gray-100 text-xs text-gray-400 space-y-0.5">
                  {selected.created_at && <div>Created: {new Date(selected.created_at).toLocaleDateString()}</div>}
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
