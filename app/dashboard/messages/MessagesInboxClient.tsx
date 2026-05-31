'use client'
import { useMemo, useState } from 'react'

export type InboxComment = {
  id: string
  workOrderId: string
  woTitle: string
  clientName?: string
  body: string
  authorName: string
  internalOnly: boolean
  createdAt: string
  editedAt?: string | null
}

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  const h = Math.floor(diff / 3600000)
  const d = Math.floor(diff / 86400000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  if (h < 24) return `${h}h ago`
  if (d < 7) return `${d}d ago`
  return new Date(iso).toLocaleDateString()
}

export default function MessagesInboxClient({ rows }: { rows: InboxComment[] }) {
  const [q, setQ] = useState('')

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return rows
    return rows.filter(
      r =>
        r.body.toLowerCase().includes(needle) ||
        r.woTitle.toLowerCase().includes(needle) ||
        r.authorName.toLowerCase().includes(needle) ||
        (r.clientName || '').toLowerCase().includes(needle)
    )
  }, [rows, q])

  // Group by WO, preserving newest-first order of first appearance.
  const groups = useMemo(() => {
    const map = new Map<string, InboxComment[]>()
    for (const r of filtered) {
      const arr = map.get(r.workOrderId)
      if (arr) arr.push(r)
      else map.set(r.workOrderId, [r])
    }
    return Array.from(map.entries())
  }, [filtered])

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-gray-900">Messages</h1>
        <p className="text-sm text-gray-500 mt-1">All comments across work orders, newest first</p>
      </div>

      <input
        value={q}
        onChange={e => setQ(e.target.value)}
        placeholder="Search messages, work orders, people…"
        className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg mb-4 focus:outline-none focus:border-blue-500"
      />

      {groups.length === 0 ? (
        <div className="text-center text-gray-400 py-12 text-sm">
          {rows.length === 0 ? 'No messages yet.' : 'No messages match your search.'}
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map(([woId, items]) => (
            <div key={woId} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <a
                href={`/dashboard/wo/${woId}?tab=messages`}
                className="flex items-center justify-between px-4 py-2.5 bg-gray-50 hover:bg-blue-50 transition-colors border-b border-gray-100"
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-gray-900 truncate">{items[0].woTitle}</div>
                  {items[0].clientName && (
                    <div className="text-xs text-gray-500 truncate">{items[0].clientName}</div>
                  )}
                </div>
                <span className="text-xs text-gray-400 flex-shrink-0 ml-3">
                  {items.length} message{items.length === 1 ? '' : 's'} ›
                </span>
              </a>
              <div className="divide-y divide-gray-50">
                {items.map(c => (
                  <a
                    key={c.id}
                    href={`/dashboard/wo/${c.workOrderId}?tab=messages`}
                    className="block px-4 py-3 hover:bg-blue-50/40 transition-colors"
                  >
                    <div className="flex items-start gap-2.5">
                      <div
                        className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-[11px] font-bold text-white"
                        style={{ background: '#2d4a7c' }}
                      >
                        {(c.authorName || '?')[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-sm font-semibold text-gray-900">{c.authorName}</span>
                          <span className="text-xs text-gray-400">{relativeTime(c.createdAt)}</span>
                          {c.editedAt && <span className="text-xs text-gray-400 italic">edited</span>}
                          {c.internalOnly ? (
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
                              🔒 Internal
                            </span>
                          ) : (
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">
                              👁 Client-visible
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-gray-700 leading-relaxed line-clamp-3 whitespace-pre-wrap break-words">
                          {c.body}
                        </div>
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
