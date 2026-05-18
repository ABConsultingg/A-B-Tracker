'use client'
import { useState, useMemo, useEffect } from 'react'
import { STAGES, type WoStage } from '@/lib/types'

type WO = {
  id: string; title: string; stage: string; client_id: string; service_id: string; owner_id?: string;
  priority?: string; est_cost?: number; add_cost?: number; due_date?: string; created_at: string;
  clients?: any; services?: any; team_members?: any;
}

type SortKey = 'title' | 'client' | 'service' | 'owner' | 'stage' | 'priority' | 'due_date' | 'total' | 'created_at'

export default function AllWorkOrdersClient({ workOrders, clients, services, team }: {
  workOrders: WO[]; clients: any[]; services: any[]; team: any[]
}) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  const [search, setSearch] = useState('')
  const [filterClient, setFilterClient] = useState('')
  const [filterService, setFilterService] = useState('')
  const [filterOwner, setFilterOwner] = useState('')
  const [filterStage, setFilterStage] = useState('')
  const [filterPriority, setFilterPriority] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('created_at')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const filteredAndSorted = useMemo(() => {
    let result = workOrders.filter(wo => {
      if (search && !wo.title.toLowerCase().includes(search.toLowerCase())) return false
      if (filterClient && wo.client_id !== filterClient) return false
      if (filterService && wo.service_id !== filterService) return false
      if (filterOwner && wo.owner_id !== filterOwner) return false
      if (filterStage && wo.stage !== filterStage) return false
      if (filterPriority && wo.priority !== filterPriority) return false
      return true
    })

    const dir = sortDir === 'asc' ? 1 : -1
    result.sort((a, b) => {
      let av: any, bv: any
      switch (sortKey) {
        case 'title':      av = a.title || ''; bv = b.title || ''; break
        case 'client':     av = a.clients?.name || ''; bv = b.clients?.name || ''; break
        case 'service':    av = a.services?.name || ''; bv = b.services?.name || ''; break
        case 'owner':      av = a.team_members?.name || ''; bv = b.team_members?.name || ''; break
        case 'stage':      av = a.stage || ''; bv = b.stage || ''; break
        case 'priority':   {
          const order: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 }
          av = order[a.priority || 'medium']; bv = order[b.priority || 'medium']; break
        }
        case 'due_date':   av = a.due_date || ''; bv = b.due_date || ''; break
        case 'total':      av = (a.est_cost || 0) + (a.add_cost || 0); bv = (b.est_cost || 0) + (b.add_cost || 0); break
        case 'created_at': av = a.created_at || ''; bv = b.created_at || ''; break
      }
      if (av < bv) return -1 * dir
      if (av > bv) return 1 * dir
      return 0
    })
    return result
  }, [workOrders, search, filterClient, filterService, filterOwner, filterStage, filterPriority, sortKey, sortDir])

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  function clearFilters() {
    setSearch(''); setFilterClient(''); setFilterService('');
    setFilterOwner(''); setFilterStage(''); setFilterPriority('')
  }

  const totalValue = useMemo(() =>
    filteredAndSorted.reduce((s, w) => s + (w.est_cost || 0) + (w.add_cost || 0), 0),
    [filteredAndSorted]
  )

  const activeFilters = [filterClient, filterService, filterOwner, filterStage, filterPriority, search].filter(Boolean).length

  function SortHeader({ k, label, align = 'left' }: { k: SortKey; label: string; align?: 'left' | 'right' }) {
    const active = sortKey === k
    return (
      <th className={`px-3 md:px-4 py-3 cursor-pointer hover:bg-gray-100 select-none ${align === 'right' ? 'text-right' : 'text-left'}`}
          onClick={() => toggleSort(k)}>
        <div className={`flex items-center gap-1 ${align === 'right' ? 'justify-end' : ''}`}>
          {label}
          {active && <span className="text-blue-500 text-[10px]">{sortDir === 'asc' ? '▲' : '▼'}</span>}
        </div>
      </th>
    )
  }

  return (
    <div className="p-4 md:p-6">
      <div className="mb-5">
        <div className="flex flex-wrap items-baseline gap-3 mb-1">
          <h1 className="text-2xl font-bold text-gray-900">All Work Orders</h1>
          <span className="text-sm text-gray-500">
            {filteredAndSorted.length} of {workOrders.length}
            {totalValue > 0 && <span className="ml-3 font-mono font-semibold text-gray-700">${totalValue.toLocaleString()}</span>}
          </span>
        </div>
        <p className="text-xs text-gray-500">Includes archived and paid work orders</p>
      </div>

      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded-lg p-3 mb-4 flex flex-wrap gap-2">
        <input type="text" placeholder="🔍 Search title..."
          value={search} onChange={e => setSearch(e.target.value)}
          className="flex-1 min-w-[160px] px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
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
        <select value={filterStage} onChange={e => setFilterStage(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
          <option value="">All stages</option>
          {STAGES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
          <option value="">All priorities</option>
          <option value="urgent">Urgent</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        {activeFilters > 0 && (
          <button onClick={clearFilters}
            className="px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg flex items-center gap-1">
            Clear <span className="bg-blue-500 text-white rounded-full text-[10px] px-1.5">{activeFilters}</span>
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm min-w-[800px]">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr className="text-xs text-gray-600 uppercase tracking-wide font-semibold">
              <SortHeader k="title" label="Title" />
              <SortHeader k="client" label="Client" />
              <SortHeader k="service" label="Service" />
              <SortHeader k="owner" label="Owner" />
              <SortHeader k="stage" label="Stage" />
              <SortHeader k="priority" label="Pri" />
              <SortHeader k="due_date" label="Due" />
              <SortHeader k="total" label="Total" align="right" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filteredAndSorted.map((wo) => {
              const stage = STAGES.find(s => s.id === wo.stage)
              const total = (wo.est_cost || 0) + (wo.add_cost || 0)
              const overdue = mounted && wo.due_date && new Date(wo.due_date) < new Date() && !['paid','archived'].includes(wo.stage)
              return (
                <tr key={wo.id} className="hover:bg-blue-50 cursor-pointer"
                    onClick={() => { window.location.href = `/dashboard?wo=${wo.id}` }}>
                  <td className="px-3 md:px-4 py-3 font-medium text-gray-900 max-w-xs truncate">{wo.title}</td>
                  <td className="px-3 md:px-4 py-3 text-gray-600 truncate max-w-[160px]">{wo.clients?.name || '—'}</td>
                  <td className="px-3 md:px-4 py-3 text-gray-600 truncate max-w-[140px]">{wo.services?.name || '—'}</td>
                  <td className="px-3 md:px-4 py-3 text-gray-600">{wo.team_members?.name || '—'}</td>
                  <td className="px-3 md:px-4 py-3">
                    <span className="text-[10px] px-2 py-0.5 rounded font-semibold text-white whitespace-nowrap"
                      style={{ background: stage?.color }}>{stage?.label}</span>
                  </td>
                  <td className="px-3 md:px-4 py-3">
                    {wo.priority && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                        wo.priority === 'urgent' ? 'bg-red-100 text-red-700' :
                        wo.priority === 'high' ? 'bg-orange-100 text-orange-700' :
                        wo.priority === 'medium' ? 'bg-blue-100 text-blue-700' :
                        'bg-slate-100 text-slate-600'
                      }`}>{wo.priority[0].toUpperCase()}</span>
                    )}
                  </td>
                  <td className={`px-3 md:px-4 py-3 text-xs ${overdue ? 'text-red-600 font-semibold' : 'text-gray-600'}`}>
                    {wo.due_date ? new Date(wo.due_date).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-3 md:px-4 py-3 text-right font-mono font-semibold text-gray-900 whitespace-nowrap">
                    {total > 0 ? `$${total.toLocaleString()}` : '—'}
                  </td>
                </tr>
              )
            })}
            {filteredAndSorted.length === 0 && (
              <tr><td colSpan={8} className="text-center text-gray-400 py-12 text-sm">No work orders match your filters</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
