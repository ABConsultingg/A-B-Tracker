'use client'

import { useState, useMemo } from 'react'

type TaskRow = {
  id: string
  description: string
  status: 'todo' | 'in-progress' | 'done'
  priority: 'low' | 'medium' | 'high' | 'urgent'
  due_date: string | null
  link: string | null
  notes: string | null
  assignee_id: string | null
  work_order_id: string
  work_orders: {
    id: string
    title: string
    stage: string
    clients?: { id?: string; name: string } | null
    services?: { name: string } | null
  }
  team_members?: { id: string; name: string } | null
}

const PRIORITY_COLORS: Record<string, string> = {
  low:     'bg-gray-100 text-gray-700 border-gray-200',
  medium:  'bg-blue-50 text-blue-700 border-blue-200',
  high:    'bg-orange-50 text-orange-700 border-orange-200',
  urgent:  'bg-red-50 text-red-700 border-red-200',
}

const STATUS_COLORS: Record<string, string> = {
  'todo':         'bg-gray-100 text-gray-700',
  'in-progress':  'bg-amber-100 text-amber-800',
  'done':         'bg-green-100 text-green-800',
}

const PRIORITY_RANK: Record<string, number> = {
  urgent: 0, high: 1, medium: 2, low: 3,
}

function todayStr() {
  return new Date().toISOString().substring(0, 10)
}

type SortKey = 'due' | 'priority' | 'assignee' | 'wo' | 'client'
type SortDir = 'asc' | 'desc'
type StatusFilter = 'active' | 'done' | 'all'

export default function AllTasksClient({
  tasks,
  allTeam,
  allClients,
}: {
  tasks: TaskRow[]
  allTeam: { id: string; name: string }[]
  allClients: { id: string; name: string }[]
}) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active')
  const [assigneeFilter, setAssigneeFilter] = useState<string>('')
  const [clientFilter, setClientFilter] = useState<string>('')
  const [priorityFilter, setPriorityFilter] = useState<string>('')
  const [sortKey, setSortKey] = useState<SortKey>('due')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const today = todayStr()

  const filtered = useMemo(() => {
    return tasks.filter(t => {
      if (statusFilter === 'active' && t.status === 'done') return false
      if (statusFilter === 'done' && t.status !== 'done') return false
      if (assigneeFilter) {
        if (assigneeFilter === 'unassigned') {
          if (t.assignee_id) return false
        } else if (t.assignee_id !== assigneeFilter) return false
      }
      if (clientFilter) {
        const cName = t.work_orders?.clients?.name
        const matches = allClients.find(c => c.id === clientFilter)?.name === cName
        if (!matches) return false
      }
      if (priorityFilter && t.priority !== priorityFilter) return false
      return true
    })
  }, [tasks, statusFilter, assigneeFilter, clientFilter, priorityFilter, allClients])

  const sorted = useMemo(() => {
    const dirMult = sortDir === 'asc' ? 1 : -1
    const arr = [...filtered]
    arr.sort((a, b) => {
      let cmp = 0
      if (sortKey === 'due') {
        const ad = a.due_date || '9999-12-31'
        const bd = b.due_date || '9999-12-31'
        cmp = ad.localeCompare(bd)
      } else if (sortKey === 'priority') {
        cmp = (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9)
      } else if (sortKey === 'assignee') {
        const an = a.team_members?.name || 'zzz'
        const bn = b.team_members?.name || 'zzz'
        cmp = an.localeCompare(bn)
      } else if (sortKey === 'wo') {
        cmp = (a.work_orders?.title || '').localeCompare(b.work_orders?.title || '')
      } else if (sortKey === 'client') {
        cmp = (a.work_orders?.clients?.name || '').localeCompare(b.work_orders?.clients?.name || '')
      }
      return cmp * dirMult
    })
    return arr
  }, [filtered, sortKey, sortDir])

  function toggleSort(k: SortKey) {
    if (sortKey === k) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(k)
      setSortDir('asc')
    }
  }

  function clearFilters() {
    setStatusFilter('active')
    setAssigneeFilter('')
    setClientFilter('')
    setPriorityFilter('')
  }

  const activeFilterCount =
    (statusFilter !== 'active' ? 1 : 0) +
    (assigneeFilter ? 1 : 0) +
    (clientFilter ? 1 : 0) +
    (priorityFilter ? 1 : 0)

  const sortIndicator = (k: SortKey) => {
    if (sortKey !== k) return ''
    return sortDir === 'asc' ? ' ↑' : ' ↓'
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">All Tasks</h1>
          <p className="text-sm text-gray-500 mt-1">
            Flat view of every task across every work order
          </p>
        </div>
        <div className="text-sm text-gray-500 font-mono">
          {sorted.length} of {tasks.length}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as StatusFilter)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:border-blue-500"
          >
            <option value="active">Active only</option>
            <option value="done">Done only</option>
            <option value="all">All statuses</option>
          </select>

          <select
            value={assigneeFilter}
            onChange={e => setAssigneeFilter(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:border-blue-500"
          >
            <option value="">All assignees</option>
            <option value="unassigned">Unassigned</option>
            {allTeam.map(m => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>

          <select
            value={clientFilter}
            onChange={e => setClientFilter(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:border-blue-500"
          >
            <option value="">All clients</option>
            {allClients.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          <select
            value={priorityFilter}
            onChange={e => setPriorityFilter(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:border-blue-500"
          >
            <option value="">All priorities</option>
            <option value="urgent">Urgent</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>

          {activeFilterCount > 0 && (
            <button
              onClick={clearFilters}
              className="px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              Clear filters ({activeFilterCount})
            </button>
          )}
        </div>
      </div>

      {/* Table — desktop */}
      <div className="hidden md:block bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
              <th className="px-4 py-3 w-8"></th>
              <th className="px-4 py-3">Task</th>
              <th
                className="px-4 py-3 cursor-pointer hover:text-gray-700"
                onClick={() => toggleSort('assignee')}
              >
                Assignee{sortIndicator('assignee')}
              </th>
              <th
                className="px-4 py-3 cursor-pointer hover:text-gray-700"
                onClick={() => toggleSort('wo')}
              >
                Work Order{sortIndicator('wo')}
              </th>
              <th
                className="px-4 py-3 cursor-pointer hover:text-gray-700"
                onClick={() => toggleSort('client')}
              >
                Client{sortIndicator('client')}
              </th>
              <th className="px-4 py-3">Status</th>
              <th
                className="px-4 py-3 cursor-pointer hover:text-gray-700"
                onClick={() => toggleSort('priority')}
              >
                Priority{sortIndicator('priority')}
              </th>
              <th
                className="px-4 py-3 cursor-pointer hover:text-gray-700"
                onClick={() => toggleSort('due')}
              >
                Due{sortIndicator('due')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-gray-500">
                  No tasks match the current filters.
                </td>
              </tr>
            ) : (
              sorted.map(t => {
                const isOverdue = t.due_date && t.due_date < today && t.status !== 'done'
                const dueLabel = t.due_date
                  ? new Date(t.due_date + 'T00:00:00').toLocaleDateString()
                  : '—'
                return (
                  <tr
                    key={t.id}
                    className="hover:bg-blue-50/40 transition-colors cursor-pointer"
                    onClick={() => window.open(`/dashboard?wo=${encodeURIComponent(t.work_orders.id)}&task=${encodeURIComponent(t.id)}`, '_blank', 'noopener,noreferrer')}
                  >
                    <td className="px-4 py-3">
                      <div className={`w-5 h-5 rounded flex items-center justify-center ${
                        t.status === 'done' ? 'bg-blue-500 text-white' : 'border border-gray-300 bg-white'
                      }`}>
                        {t.status === 'done' && <span className="text-xs">✓</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className={`${t.status === 'done' ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                        {t.description}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-400">
                        {t.link && <span title={t.link}>🔗</span>}
                        {t.notes && <span title={t.notes}>📝</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {t.team_members?.name ? (
                        <div className="flex items-center gap-1.5">
                          <span
                            className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                            style={{ background: '#2d4a7c' }}
                          >
                            {t.team_members.name[0]?.toUpperCase()}
                          </span>
                          <span>{t.team_members.name}</span>
                        </div>
                      ) : (
                        <span className="text-gray-400 italic">Unassigned</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-700 max-w-xs truncate" title={t.work_orders?.title}>
                      {t.work_orders?.title || '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {t.work_orders?.clients?.name || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[t.status]}`}>
                        {t.status === 'in-progress' ? 'In Progress' :
                         t.status === 'todo' ? 'To Do' : 'Done'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-1.5 py-0.5 rounded text-xs font-medium border ${PRIORITY_COLORS[t.priority]}`}>
                        {t.priority[0].toUpperCase() + t.priority.slice(1)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-sm ${isOverdue ? 'text-red-600 font-medium' : 'text-gray-700'}`}>
                        {dueLabel}{isOverdue && ' ⚠️'}
                      </span>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile: card list */}
      <div className="md:hidden space-y-3">
        {sorted.length === 0 ? (
          <div className="text-center text-gray-500 py-12 bg-white rounded-lg border border-gray-200">
            No tasks match the current filters.
          </div>
        ) : (
          sorted.map(t => {
            const isOverdue = t.due_date && t.due_date < today && t.status !== 'done'
            const dueLabel = t.due_date
              ? new Date(t.due_date + 'T00:00:00').toLocaleDateString()
              : '—'
            return (
              <a
                key={t.id}
                href={`/dashboard?wo=${encodeURIComponent(t.work_orders.id)}&task=${encodeURIComponent(t.id)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block bg-white rounded-lg border border-gray-200 p-3"
              >
                <div className={`text-sm font-medium ${t.status === 'done' ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                  {t.description}
                </div>
                <div className="text-xs text-gray-500 mt-1 truncate">
                  {t.work_orders?.title} · {t.work_orders?.clients?.name || '—'}
                </div>
                <div className="flex flex-wrap items-center gap-1.5 mt-2 text-xs">
                  <span className={`px-1.5 py-0.5 rounded font-medium ${STATUS_COLORS[t.status]}`}>
                    {t.status === 'in-progress' ? 'In Progress' :
                     t.status === 'todo' ? 'To Do' : 'Done'}
                  </span>
                  <span className={`px-1.5 py-0.5 rounded font-medium border ${PRIORITY_COLORS[t.priority]}`}>
                    {t.priority[0].toUpperCase() + t.priority.slice(1)}
                  </span>
                  {t.team_members?.name && (
                    <span className="text-gray-500">👤 {t.team_members.name}</span>
                  )}
                  <span className={isOverdue ? 'text-red-600 font-medium' : 'text-gray-500'}>
                    📅 {dueLabel}{isOverdue && ' overdue'}
                  </span>
                </div>
              </a>
            )
          })
        )}
      </div>
    </div>
  )
}
