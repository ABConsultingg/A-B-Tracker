"use client"
import { useEffect, useMemo, useState } from "react"
import { createClient } from "@/lib/supabase/client"

export type InboxComment = {
  id: string
  workOrderId: string
  woTitle: string
  clientName?: string
  body: string
  authorId: string | null
  authorName: string
  mentions: string[]
  internalOnly: boolean
  createdAt: string
  editedAt?: string | null
}

export type WoMeta = { title: string; clientName?: string }
export type TeamMember = { id: string; name: string; auth_user_id: string | null }

type SortMode = "activity" | "count" | "client"
type Involve = "all" | "me"
type Visibility = "all" | "internal" | "client"

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  const h = Math.floor(diff / 3600000)
  const d = Math.floor(diff / 86400000)
  if (m < 1) return "just now"
  if (m < 60) return `${m}m ago`
  if (h < 24) return `${h}h ago`
  if (d < 7) return `${d}d ago`
  return new Date(iso).toLocaleDateString()
}

function bucketOf(iso: string): "Today" | "This week" | "Older" {
  const then = new Date(iso)
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const t = then.getTime()
  if (t >= startOfToday) return "Today"
  if (t >= startOfToday - 6 * 86400000) return "This week"
  return "Older"
}

const BUCKET_ORDER: Array<"Today" | "This week" | "Older"> = ["Today", "This week", "Older"]

export default function MessagesInboxClient({
  rows: initialRows,
  woMeta = {},
  authMap = {},
  team = [],
  currentUserId = null,
  reads: initialReads = {},
}: {
  rows: InboxComment[]
  woMeta?: Record<string, WoMeta>
  authMap?: Record<string, string>
  team?: TeamMember[]
  currentUserId?: string | null
  reads?: Record<string, string>
}) {
  const supabase = createClient()
  const [rows, setRows] = useState<InboxComment[]>(initialRows)
  const [reads, setReads] = useState<Record<string, string>>(initialReads)
  const [q, setQ] = useState("")
  const [sort, setSort] = useState<SortMode>("activity")
  const [involve, setInvolve] = useState<Involve>("all")
  const [clientFilter, setClientFilter] = useState<string>("")
  const [visibility, setVisibility] = useState<Visibility>("all")

  const currentUserName = useMemo(() => {
    const me = team.find(t => t.auth_user_id === currentUserId)
    return me?.name || "Someone"
  }, [team, currentUserId])

  // Realtime: prepend new comments across all WOs.
  useEffect(() => {
    const channel = supabase
      .channel("inbox-all-comments")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "wo_comments" },
        (payload: any) => {
          const c = payload.new
          setRows(prev => {
            if (prev.some(r => r.id === c.id)) return prev
            const meta = woMeta[c.work_order_id]
            const row: InboxComment = {
              id: c.id,
              workOrderId: c.work_order_id,
              woTitle: meta?.title || "Work order",
              clientName: meta?.clientName,
              body: c.body,
              authorId: c.author_id,
              authorName: c.author_id ? (authMap[c.author_id] || "Someone") : "Someone",
              mentions: c.mentions || [],
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

  // Is a single comment unread for me? (newer than my last-seen for its WO,
  // and not authored by me.)
  function isUnread(c: InboxComment): boolean {
    if (c.authorId && c.authorId === currentUserId) return false
    const seen = reads[c.workOrderId]
    if (!seen) return true
    return new Date(c.createdAt).getTime() > new Date(seen).getTime()
  }

  async function markRead(woId: string) {
    if (!currentUserId) return
    const nowIso = new Date().toISOString()
    setReads(prev => ({ ...prev, [woId]: nowIso }))
    const { error } = await supabase
      .from("wo_message_reads")
      .upsert(
        { user_id: currentUserId, work_order_id: woId, last_seen_at: nowIso },
        { onConflict: "user_id,work_order_id" }
      )
    if (error) console.error("Failed to mark read:", error.message)
  }

  async function markAllRead(woIds: string[]) {
    if (!currentUserId || woIds.length === 0) return
    const nowIso = new Date().toISOString()
    setReads(prev => {
      const next = { ...prev }
      woIds.forEach(id => { next[id] = nowIso })
      return next
    })
    const payload = woIds.map(id => ({ user_id: currentUserId, work_order_id: id, last_seen_at: nowIso }))
    const { error } = await supabase
      .from("wo_message_reads")
      .upsert(payload, { onConflict: "user_id,work_order_id" })
    if (error) console.error("Failed to mark all read:", error.message)
  }

  const clientOptions = useMemo(() => {
    const set = new Set<string>()
    rows.forEach(r => { if (r.clientName) set.add(r.clientName) })
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [rows])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return rows.filter(r => {
      if (needle) {
        const hit =
          r.body.toLowerCase().includes(needle) ||
          r.woTitle.toLowerCase().includes(needle) ||
          r.authorName.toLowerCase().includes(needle) ||
          (r.clientName || "").toLowerCase().includes(needle)
        if (!hit) return false
      }
      if (involve === "me" && currentUserId) {
        const authored = r.authorId === currentUserId
        const mentioned = (r.mentions || []).includes(currentUserId)
        if (!authored && !mentioned) return false
      }
      if (clientFilter && r.clientName !== clientFilter) return false
      if (visibility === "internal" && !r.internalOnly) return false
      if (visibility === "client" && r.internalOnly) return false
      return true
    })
  }, [rows, q, involve, currentUserId, clientFilter, visibility])

  type Group = {
    woId: string
    title: string
    clientName?: string
    items: InboxComment[]
    latest: number
    unreadCount: number
  }

  const groups = useMemo<Group[]>(() => {
    const map = new Map<string, Group>()
    for (const r of filtered) {
      const g = map.get(r.workOrderId)
      const t = new Date(r.createdAt).getTime()
      const unread = isUnread(r) ? 1 : 0
      if (g) {
        g.items.push(r)
        if (t > g.latest) g.latest = t
        g.unreadCount += unread
      } else {
        map.set(r.workOrderId, {
          woId: r.workOrderId,
          title: r.woTitle,
          clientName: r.clientName,
          items: [r],
          latest: t,
          unreadCount: unread,
        })
      }
    }
    const arr = Array.from(map.values())
    if (sort === "activity") {
      arr.sort((a, b) => b.latest - a.latest)
    } else if (sort === "count") {
      arr.sort((a, b) => b.items.length - a.items.length || b.latest - a.latest)
    } else {
      arr.sort((a, b) => (a.clientName || "zzz").localeCompare(b.clientName || "zzz") || b.latest - a.latest)
    }
    return arr
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, sort, reads, currentUserId])

  const sections = useMemo(() => {
    if (sort !== "activity") return [{ label: null as string | null, groups }]
    const byBucket: Record<string, Group[]> = { Today: [], "This week": [], Older: [] }
    for (const g of groups) byBucket[bucketOf(new Date(g.latest).toISOString())].push(g)
    return BUCKET_ORDER.filter(b => byBucket[b].length > 0).map(b => ({
      label: b as string | null,
      groups: byBucket[b],
    }))
  }, [groups, sort])

  const totalUnreadWos = groups.filter(g => g.unreadCount > 0).map(g => g.woId)

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Messages</h1>
          <p className="text-sm text-gray-500 mt-1">All comments across work orders</p>
        </div>
        {totalUnreadWos.length > 0 && (
          <button
            onClick={() => markAllRead(totalUnreadWos)}
            className="text-xs text-gray-500 hover:text-gray-900 underline whitespace-nowrap mt-1"
          >
            Mark all read
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search messages, work orders, people…"
          className="flex-1 min-w-[200px] text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500"
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

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex rounded-lg border border-gray-200 overflow-hidden">
          <button
            onClick={() => setInvolve("all")}
            className={`text-xs px-3 py-1.5 ${involve === "all" ? "bg-gray-900 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
          >
            All
          </button>
          <button
            onClick={() => setInvolve("me")}
            className={`text-xs px-3 py-1.5 border-l border-gray-200 ${involve === "me" ? "bg-gray-900 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
          >
            Involving me
          </button>
        </div>

        <select
          value={clientFilter}
          onChange={e => setClientFilter(e.target.value)}
          className="text-xs px-2 py-1.5 border border-gray-200 rounded-lg bg-white text-gray-700 focus:outline-none focus:border-blue-500"
        >
          <option value="">All clients</option>
          {clientOptions.map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        <div className="flex rounded-lg border border-gray-200 overflow-hidden">
          <button
            onClick={() => setVisibility("all")}
            className={`text-xs px-3 py-1.5 ${visibility === "all" ? "bg-gray-900 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
          >
            All
          </button>
          <button
            onClick={() => setVisibility("internal")}
            className={`text-xs px-3 py-1.5 border-l border-gray-200 ${visibility === "internal" ? "bg-gray-900 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
          >
            🔒 Internal
          </button>
          <button
            onClick={() => setVisibility("client")}
            className={`text-xs px-3 py-1.5 border-l border-gray-200 ${visibility === "client" ? "bg-gray-900 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
          >
            👁 Client
          </button>
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="text-center text-gray-400 py-12 text-sm">
          {rows.length === 0 ? "No messages yet." : "No messages match your filters."}
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
                  <WoGroup
                    key={g.woId}
                    woId={g.woId}
                    title={g.title}
                    clientName={g.clientName}
                    items={g.items}
                    unreadCount={g.unreadCount}
                    isUnread={isUnread}
                    onMarkRead={() => markRead(g.woId)}
                    team={team}
                    currentUserId={currentUserId}
                    currentUserName={currentUserName}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function WoGroup({
  woId,
  title,
  clientName,
  items,
  unreadCount,
  isUnread,
  onMarkRead,
  team,
  currentUserId,
  currentUserName,
}: {
  woId: string
  title: string
  clientName?: string
  items: InboxComment[]
  unreadCount: number
  isUnread: (c: InboxComment) => boolean
  onMarkRead: () => void
  team: TeamMember[]
  currentUserId: string | null
  currentUserName: string
}) {
  const supabase = createClient()
  const [replyOpen, setReplyOpen] = useState(false)
  const [body, setBody] = useState("")
  const [posting, setPosting] = useState(false)
  const [visibleToClient, setVisibleToClient] = useState(false)

  function extractMentionedIds(text: string): string[] {
    const ids: string[] = []
    const seen = new Set<string>()
    const matches = text.match(/@(\w+)/g) || []
    matches.forEach(m => {
      const name = m.substring(1).toLowerCase()
      const member = team.find(
        t => t.name.toLowerCase() === name || t.name.toLowerCase().startsWith(name)
      )
      if (member && member.auth_user_id && !seen.has(member.auth_user_id)) {
        seen.add(member.auth_user_id)
        ids.push(member.auth_user_id)
      }
    })
    return ids
  }

  async function postReply() {
    const text = body.trim()
    if (!text) return
    setPosting(true)
    const mentionIds = extractMentionedIds(text)
    const { data, error } = await supabase
      .from("wo_comments")
      .insert({
        work_order_id: woId,
        body: text,
        author_id: currentUserId,
        mentions: mentionIds,
        internal_only: !visibleToClient,
      })
      .select()
      .single()
    if (error) {
      setPosting(false)
      alert("Error posting: " + error.message)
      return
    }

    const recipients = mentionIds.filter(uid => uid !== currentUserId)
    if (recipients.length > 0) {
      const preview = text.length > 140 ? text.slice(0, 140) + "…" : text
      const notifRows = recipients.map(uid => ({
        user_id: uid,
        source_type: "comment",
        source_id: (data as any).id,
        work_order_id: woId,
        body_preview: preview,
        author_name: currentUserName,
        link_url: `/dashboard/wo/${woId}?tab=messages`,
      }))
      const { error: notifErr } = await supabase.from("wo_notifications").insert(notifRows)
      if (notifErr) console.error("Failed to create mention notifications:", notifErr.message)
    }

    setPosting(false)
    setBody("")
    setVisibleToClient(false)
    setReplyOpen(false)
    onMarkRead()
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <a
        href={`/dashboard/wo/${woId}?tab=messages`}
        onClick={() => onMarkRead()}
        className="flex items-center justify-between px-4 py-2.5 bg-gray-50 hover:bg-blue-50 transition-colors border-b border-gray-100"
      >
        <div className="min-w-0 flex items-center gap-2">
          {unreadCount > 0 && (
            <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
          )}
          <div className="min-w-0">
            <div className="text-sm font-semibold text-gray-900 truncate">{title}</div>
            {clientName && <div className="text-xs text-gray-500 truncate">{clientName}</div>}
          </div>
        </div>
        <span className="text-xs flex-shrink-0 ml-3 flex items-center gap-2">
          {unreadCount > 0 && (
            <span className="bg-blue-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5">
              {unreadCount} new
            </span>
          )}
          <span className="text-gray-400">
            {items.length} message{items.length === 1 ? "" : "s"} ›
          </span>
        </span>
      </a>
      <div className="divide-y divide-gray-50">
        {items.map(c => {
          const unread = isUnread(c)
          return (
            <div key={c.id} className={`px-4 py-3 ${unread ? "bg-blue-50/40" : ""}`}>
              <div className="flex items-start gap-2.5">
                <div
                  className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-[11px] font-bold text-white"
                  style={{ background: "#2d4a7c" }}
                >
                  {(c.authorName || "?")[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-semibold text-gray-900">{c.authorName}</span>
                    <span className="text-xs text-gray-400">{relativeTime(c.createdAt)}</span>
                    {c.editedAt && <span className="text-xs text-gray-400 italic">edited</span>}
                    {c.internalOnly ? (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">🔒 Internal</span>
                    ) : (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">👁 Client-visible</span>
                    )}
                  </div>
                  <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap break-words">
                    {c.body}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50/50 flex items-center justify-between">
        {replyOpen ? (
          <div className="space-y-2 w-full">
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault()
                  postReply()
                }
              }}
              placeholder="Reply… use @ to mention. (Cmd+Enter to post)"
              rows={2}
              autoFocus
              className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg resize-y focus:outline-none focus:border-blue-500"
            />
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={visibleToClient}
                  onChange={e => setVisibleToClient(e.target.checked)}
                  className="rounded border-gray-300"
                />
                Visible to client
              </label>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setReplyOpen(false); setBody(""); setVisibleToClient(false) }}
                  className="text-xs px-2 py-1 rounded text-gray-600 hover:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  onClick={postReply}
                  disabled={posting || !body.trim()}
                  className="text-xs px-3 py-1.5 rounded-lg font-semibold text-white disabled:opacity-40"
                  style={{ background: "#1a2b4a" }}
                >
                  {posting ? "Posting…" : "Post reply"}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            <button
              onClick={() => setReplyOpen(true)}
              className="text-xs text-gray-500 hover:text-gray-900"
            >
              + Reply
            </button>
            {unreadCount > 0 && (
              <button
                onClick={onMarkRead}
                className="text-xs text-gray-400 hover:text-gray-700 underline"
              >
                Mark read
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
