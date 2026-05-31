'use client'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

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

export type WoMeta = { title: string; clientName?: string }

type SortMode = 'activity' | 'count' | 'client'

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

// Day bucket for a WO group, based on its most recent comment.
function bucketOf(iso: string): 'Today' | 'This week' | 'Older' {
  const then = new Date(iso)
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const t = then.getTime()
  if (t >= startOfToday) return 'Today'
  if (t >= startOfToday - 6 * 86400000) return 'This week'
  return 'Older'
}

const BUCKET_ORDER: Array<'Today' | 'This week' | 'Older'> = ['Today', 'This week', 'Older']

export default function MessagesInboxClient({
  rows: initialRows,
  woMeta = {},
  authMap = {},
}: {
  rows: InboxComment[]
  woMeta?: Record<string, WoMeta>
  authMap?: Record<string, string>
}) {
  const supabase = createClient()
  const [rows, setRows] = useState<InboxComment[]>(initialRows)
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<SortMode>('activity')

  // Realtime: prepend new comments across all WOs.
  useEffect(() => {
    const channel = supabase
      .channel('inbox-all-comments')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'wo_comments' },
        (payload: any) => {
          const c = payload.new
          setRows(prev => {
            if (prev.some(r => r.id === c.id)) return prev
            const meta = woMeta[c.work_order_id]
            const row: InboxComment = {
              id: c.id,
              workOrderId: c.work_order_id,
              woTitle: meta?.title || 'Work order',
              clientName: meta?.clientName,
              body: c.body,
              authorName: c.author_id ? (authMap[c.author_id] || 'Someone') : 'Someone',
              internalOnly: c.internal_only,
              createdAt: c.created_at,
              editedAt: c.edited_at,
            }
            return [row, ...prev]
          })
        }
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  // Group by WO. Each group carries its comments (newest-first, as rows arrive
  // newest-first) plus derived sort keys.
  type Group = {
    woId: string
    title: string
    clientName?: string
    items: InboxComment[]
    latest: number
  }

  const groups = useMemo<Group[]>(() => {
    const map = new Map<string, Group>()
    for (const r of filtered) {
      const g = map.get(r.workOrderId)
      const t = new Date(r.createdAt).getTime()
      if (g) {
        g.items.push(r)
        if (t > g.latest) g.latest = t
      } else {
        map.set(r.workOrderId, {
          woId: r.workOrderId,
          title: r.woTitle,
          clientName: r.clientName,
          items: [r],
          latest: t,
        })
      }
    }
    const arr = Array.from(map.values())
    if (sort === 'activity') {
      arr.sort((a, b) => b.latest - a.latest)
    } else if (sort === 'count') {
      arr.sort((a, b) => b.items.length - a.items.length || b.latest - a.latest)
    } else {
      arr.sort(
        (a, b) =>
          (a.clientName || 'zzz').localeCompare(b.clientName || 'zzz') ||
          b.latest - a.latest
      )
    }
    return arr
  }, [filtered, sort])

  // For activity sort, split into Today / This week / Older sections.
  // Other sorts render as a single flat list (date buckets don't apply).
  const sections = useMemo(() => {
    if (sort !== 'activity') return [{ label: null as string | null, groups }]
    const byBucket: Record<string, Group[]> = { Today: [], 'This week': [], Older: [] }
    for (const g of groups) byBucket[bucketOf(new Date(g.latest).toISOString())].push(g)
    return BUCKET_ORDER.filter(b => byBucket[b].length > 0).map(b => ({
      label: b as string | null,
      groups: byBucket[b],
    }))
  }, [groups, sort])

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-gray-900">Messages</h1>
        <p className="text-sm text-gray-500 mt-1">All comments across work orders</p>
      </div>

      <div className="flex items-center gap-2 mb-4">
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search messages, work orders, people…"
          className="flex-1 text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500"
        />
        <select
          value={sort}
          onChange={e => setSort(e.target.value as SortMode)}
          className="text-sm px-2 py-2 border border-gray-200 rounded-lg bg-white text-gray-700 focus:outline-none focus:border-blue-500"
        >
          <option value="activity">Newest activity</option>
          <option value="count">Most messages</option>
          <option value="client">By client</option>
        </select>
      </div>

      {groups.length === 0 ? (
        <div className="text-center text-gray-400 py-12 text-sm">
          {rows.length === 0 ? 'No messages yet.' : 'No messages match your search.'}
        </div>
      ) : (
        <div className="space-y-6">
          {sections.map((section, si) => (
            <div key={section.label || si}>
              {section.label && (
                <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-2 px-1">
                  {section.label}
                </div>
              )}
              <div className="space-y-5">
                {section.groups.map(g => (
                  <div key={g.woId} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                    <a
                      href={`/dashboard/wo/${g.woId}?tab=messages`}
                      className="flex items-center justify-between px-4 py-2.5 bg-gray-50 hover:bg-blue-50 transition-colors border-b border-gray-100"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-gray-900 truncate">{g.title}</div>
                        {g.clientName && (
                          <div className="text-xs text-gray-500 truncate">{g.clientName}</div>
                        )}
                      </div>
                      <span className="text-xs text-gray-400 flex-shrink-0 ml-3">
                        {g.items.length} message{g.items.length === 1 ? '' : 's'} ›
                      </span>
                    </a>
                    <div className="divide-y divide-gray-50">
                      {g.items.map(c => (
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
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
