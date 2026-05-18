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
  work_order_id: string
  work_orders: {
    id: string
    title: string
    stage: string
    clients?: { name: string } | null
    services?: { name: string } | null
  }
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

function todayStr() {
  return new Date().toISOString().substring(0, 10)
}

type FilterMode = 'active' | 'done' | 'all'

export default function MyTasksClient({
  tasks,
  memberName,
}: {
  tasks: TaskRow[]
  memberName: string
}) {
  // Filter pill state — persists in localStorage so the pill choice survives reload.
  const [filter, setFilter] = useState<FilterMode>(() => {
    if (typeof window === 'undefined') return 'active'
    return (localStorage.getItem('myTasksFilter') as FilterMode) || 'active'
  })

  const setFilterPersisted = (f: FilterMode) => {
    setFilter(f)
    try { localStorage.setItem('myTasksFilter', f) } catch {}
  }

  const today = todayStr()

  // Stat counts — always computed off the full task set, not the filtered view.
  const stats = useMemo(() => {
    let active = 0, inProgress = 0, dueToday = 0, overdue = 0
    tasks.forEach(t => {
      if (t.status !== 'done') {
        active += 1
        if (t.status === 'in-progress') inProgress += 1
        if (t.due_date === today) dueToday += 1
        if (t.due_date && t.due_date < today) overdue += 1
      }
    })
    return { active, inProgress, dueToday, overdue }
  }, [tasks, today])

  // Apply the current filter.
  const filteredTasks = useMemo(() => {
    if (filter === 'all') return tasks
    if (filter === 'done') return tasks.filter(t => t.status === 'done')
    return tasks.filter(t => t.status !== 'done')
  }, [tasks, filter])

  // Group by WO so the user sees their tasks bucketed by parent project.
  const grouped = useMemo(() => {
    const map = new Map<string, { wo: TaskRow['work_orders']; tasks: TaskRow[] }>()
    filteredTasks.forEach(t => {
      if (!t.work_orders) return
      const key = t.work_orders.id
      if (!map.has(key)) map.set(key, { wo: t.work_orders, tasks: [] })
      map.get(key)!.tasks.push(t)
    })
    return Array.from(map.values())
  }, [filteredTasks])

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">My Tasks</h1>
        <p className="text-sm text-gray-500 mt-1">Tasks assigned to {memberName}</p>
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatTile label="Active"      value={stats.active}     accent="text-gray-800" />
        <StatTile label="In Progress" value={stats.inProgress} accent="text-amber-700" />
        <StatTile label="Due Today"   value={stats.dueToday}   accent="text-blue-700" />
        <StatTile label="Overdue"     value={stats.overdue}    accent="text-red-700" />
      </div>

      {/* Filter pills */}
      <div className="flex items-center gap-2 mb-4">
        <FilterPill active={filter === 'active'} onClick={() => setFilterPersisted('active')}>Active</FilterPill>
        <FilterPill active={filter === 'done'}   onClick={() => setFilterPersisted('done')}>Done</FilterPill>
        <FilterPill active={filter === 'all'}    onClick={() => setFilterPersisted('all')}>All</FilterPill>
        <div className="ml-auto text-xs text-gray-500">
          {filteredTasks.length} {filteredTasks.length === 1 ? 'task' : 'tasks'}
        </div>
      </div>

      {/* Grouped task list */}
      {grouped.length === 0 ? (
        <div className="text-center text-gray-500 py-16 bg-white rounded-lg border border-gray-200">
          {filter === 'active' ? 'No active tasks 🎉' :
           filter === 'done' ? 'No completed tasks yet' :
           'No tasks assigned to you'}
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(group => (
            <div key={group.wo.id} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              {/* WO header */}
              <a
                href={`/dashboard?wo=${encodeURIComponent(group.wo.id)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block px-4 py-3 bg-gray-50 border-b border-gray-200 hover:bg-gray-100 transition-colors"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold text-gray-900 truncate">{group.wo.title}</div>
                    <div className="text-xs text-gray-500 truncate mt-0.5">
                      {group.wo.clients?.name && <>🏢 {group.wo.clients.name}</>}
                      {group.wo.services?.name && <> · ⚙️ {group.wo.services.name}</>}
                    </div>
                  </div>
                  <div className="text-xs text-gray-400 flex-shrink-0">Open ↗</div>
                </div>
              </a>

              {/* Tasks under this WO */}
              <div className="divide-y divide-gray-100">
                {group.tasks.map(t => {
                  const isOverdue = t.due_date && t.due_date < today && t.status !== 'done'
                  const dueLabel = t.due_date
                    ? new Date(t.due_date + 'T00:00:00').toLocaleDateString()
                    : null
                  return (
                    <a
                      key={t.id}
                      href={`/dashboard?wo=${encodeURIComponent(group.wo.id)}&task=${encodeURIComponent(t.id)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-start gap-3 px-4 py-3 hover:bg-blue-50/40 transition-colors group"
                    >
                      {/* Status checkbox visual */}
                      <div className={`mt-0.5 w-5 h-5 rounded flex items-center justify-center flex-shrink-0 ${
                        t.status === 'done' ? 'bg-blue-500 text-white' : 'border border-gray-300 bg-white'
                      }`}>
                        {t.status === 'done' && '✓'}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className={`text-sm ${t.status === 'done' ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                          {t.description}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs">
                          {/* Status */}
                          <span className={`px-1.5 py-0.5 rounded font-medium ${STATUS_COLORS[t.status]}`}>
                            {t.status === 'in-progress' ? 'In Progress' :
                             t.status === 'todo' ? 'To Do' : 'Done'}
                          </span>
                          {/* Priority */}
                          <span className={`px-1.5 py-0.5 rounded font-medium border ${PRIORITY_COLORS[t.priority]}`}>
                            {t.priority[0].toUpperCase() + t.priority.slice(1)}
                          </span>
                          {/* Due date */}
                          {dueLabel && (
                            <span className={isOverdue ? 'text-red-600 font-medium' : 'text-gray-500'}>
                              📅 {dueLabel}{isOverdue && ' · overdue'}
                            </span>
                          )}
                          {/* Link icon if present */}
                          {t.link && (
                            <span className="text-gray-400" title={t.link}>🔗</span>
                          )}
                          {/* Notes icon if present */}
                          {t.notes && (
                            <span className="text-gray-400" title={t.notes}>📝</span>
                          )}
                        </div>
                      </div>
                    </a>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function StatTile({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="text-xs text-gray-500 uppercase tracking-wide">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${accent}`}>{value}</div>
    </div>
  )
}

function FilterPill({
  active, onClick, children
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
        active
          ? 'bg-blue-600 text-white'
          : 'bg-white text-gray-600 border border-gray-200 hover:border-gray-300 hover:bg-gray-50'
      }`}
    >
      {children}
    </button>
  )
}
