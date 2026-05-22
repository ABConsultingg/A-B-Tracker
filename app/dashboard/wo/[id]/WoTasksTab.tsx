'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Task = {
  id: string
  work_order_id: string
  description: string
  status: 'todo' | 'in-progress' | 'done'
  priority: 'low' | 'medium' | 'high' | 'urgent'
  assignee_id: string | null
  due_date: string | null
  link: string | null
  notes: string | null
  sort_order: number
  created_at: string
}

type TeamMember = { id: string; name: string; auth_user_id: string | null }

export default function WoTasksTab({
  wo,
  initialTasks,
  team,
}: {
  wo: { id: string }
  initialTasks: Task[]
  team: TeamMember[]
}) {
  const supabase = createClient()
  const [tasks, setTasks] = useState<Task[]>(initialTasks)
  const [newTaskDesc, setNewTaskDesc] = useState('')
  const [addingTask, setAddingTask] = useState(false)

  async function addTask() {
    const desc = newTaskDesc.trim()
    if (!desc) return
    setAddingTask(true)
    const nextSort = tasks.length > 0 ? Math.max(...tasks.map(t => t.sort_order)) + 1 : 0
    const { data, error } = await supabase
      .from('wo_tasks')
      .insert({
        work_order_id: wo.id,
        description: desc,
        status: 'todo',
        priority: 'medium',
        sort_order: nextSort,
      })
      .select()
      .single()
    setAddingTask(false)
    if (error) {
      alert('Error adding task: ' + error.message)
      return
    }
    setTasks(prev => [...prev, data as Task])
    setNewTaskDesc('')
  }

  async function patchTask(taskId: string, patch: Partial<Task>) {
    setTasks(prev => prev.map(t => (t.id === taskId ? ({ ...t, ...patch } as Task) : t)))
    const { error } = await supabase.from('wo_tasks').update(patch).eq('id', taskId)
    if (error) {
      alert('Error updating task: ' + error.message)
      // refetch on error
      const { data } = await supabase.from('wo_tasks').select('*').eq('work_order_id', wo.id).order('sort_order')
      if (data) setTasks(data as Task[])
    }
  }

  async function deleteTask(taskId: string) {
    if (!confirm('Delete this task?')) return
    const prev = tasks
    setTasks(curr => curr.filter(t => t.id !== taskId))
    const { error } = await supabase.from('wo_tasks').delete().eq('id', taskId)
    if (error) {
      alert('Error deleting task: ' + error.message)
      setTasks(prev)
    }
  }

  const doneCount = tasks.filter(t => t.status === 'done').length

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center justify-between border-b border-gray-200 pb-2">
        <h2 className="text-lg font-semibold text-gray-900">Tasks</h2>
        {tasks.length > 0 && (
          <span className="text-sm text-gray-500 font-mono">
            {doneCount}/{tasks.length} done
          </span>
        )}
      </div>

      {tasks.length === 0 && (
        <div className="text-sm text-gray-500 italic px-1 py-4">
          No tasks yet. Break this work order into smaller actionable steps.
        </div>
      )}

      <div className="space-y-3">
        {tasks.map(task => {
          const isDone = task.status === 'done'
          const today = new Date().toISOString().substring(0, 10)
          const isOverdueTask = !isDone && task.due_date && task.due_date < today
          const isDueToday = !isDone && task.due_date && task.due_date === today
          return (
            <div
              key={task.id}
              className={`rounded-lg border p-3 space-y-2 ${
                isDone
                  ? 'border-gray-100 bg-gray-50 opacity-70'
                  : isOverdueTask
                  ? 'border-red-200 bg-red-50/40'
                  : isDueToday
                  ? 'border-amber-200 bg-amber-50/40'
                  : 'border-gray-200 bg-white'
              }`}
            >
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
                <button
                  onClick={() => deleteTask(task.id)}
                  className="text-gray-300 hover:text-red-500 text-sm leading-none px-1"
                  title="Delete task"
                >
                  ×
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2 pl-6">
                <div>
                  <label className="block text-[10px] text-gray-400 uppercase font-semibold mb-0.5">Assignee</label>
                  <select
                    value={task.assignee_id || ''}
                    onChange={e => patchTask(task.id, { assignee_id: e.target.value || null })}
                    className="w-full text-xs px-1.5 py-1 border border-gray-200 rounded focus:border-blue-500 focus:outline-none bg-white"
                  >
                    <option value="">Unassigned</option>
                    {team.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] text-gray-400 uppercase font-semibold mb-0.5">Due</label>
                  <input
                    type="date"
                    defaultValue={task.due_date || ''}
                    onBlur={e => patchTask(task.id, { due_date: e.target.value || null })}
                    className={`w-full text-xs px-1.5 py-1 border rounded focus:border-blue-500 focus:outline-none bg-white ${
                      isOverdueTask
                        ? 'border-red-300 text-red-700'
                        : isDueToday
                        ? 'border-amber-300 text-amber-700'
                        : 'border-gray-200'
                    }`}
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-gray-400 uppercase font-semibold mb-0.5">Priority</label>
                  <select
                    value={task.priority}
                    onChange={e => patchTask(task.id, { priority: e.target.value as Task['priority'] })}
                    className="w-full text-xs px-1.5 py-1 border border-gray-200 rounded focus:border-blue-500 focus:outline-none bg-white"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pl-6">
                <div>
                  <label className="block text-[10px] text-gray-400 uppercase font-semibold mb-0.5">Status</label>
                  <select
                    value={task.status}
                    onChange={e => patchTask(task.id, { status: e.target.value as Task['status'] })}
                    className="w-full text-xs px-1.5 py-1 border border-gray-200 rounded focus:border-blue-500 focus:outline-none bg-white"
                  >
                    <option value="todo">To Do</option>
                    <option value="in-progress">In Progress</option>
                    <option value="done">✓ Done</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] text-gray-400 uppercase font-semibold mb-0.5">Link</label>
                  <input
                    type="url"
                    defaultValue={task.link || ''}
                    onBlur={e => {
                      const v = e.target.value.trim()
                      if (v !== (task.link || '')) patchTask(task.id, { link: v || null })
                    }}
                    placeholder="https://..."
                    className="w-full text-xs px-1.5 py-1 border border-gray-200 rounded focus:border-blue-500 focus:outline-none bg-white"
                  />
                </div>
              </div>

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
                  className="w-full text-xs px-1.5 py-1 border border-gray-200 rounded resize-none focus:border-blue-500 focus:outline-none bg-white"
                />
              </div>
            </div>
          )
        })}

        <div className="flex gap-2 pt-1">
          <input
            type="text"
            value={newTaskDesc}
            onChange={e => setNewTaskDesc(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addTask()
              }
            }}
            placeholder="+ Add task — press Enter"
            className="flex-1 text-sm px-3 py-2 border border-dashed border-gray-300 rounded focus:border-blue-500 focus:border-solid focus:outline-none"
          />
          {newTaskDesc.trim() && (
            <button
              onClick={addTask}
              disabled={addingTask}
              className="px-3 py-2 rounded text-xs font-semibold text-white disabled:opacity-40"
              style={{ background: '#1a2b4a' }}
            >
              {addingTask ? '...' : 'Add'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
