'use client'
import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

type Dm = {
  id: string
  from_member_id: string | null
  to_member_id: string
  body: string
  wo_id: string | null
  sent_via: string | null
  read_at: string | null
  created_at: string
}

type Member = { id: string; name: string }

function timeAgo(d: string) {
  const ms = Date.now() - new Date(d).getTime()
  const m = Math.floor(ms / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const days = Math.floor(h / 24)
  if (days < 7) return `${days}d ago`
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// A conversation is identified by the "other" person's member id (null = Pancho)
type ConvoKey = string | null

function getConvoKey(dm: Dm, currentMemberId: string): ConvoKey {
  if (dm.from_member_id === currentMemberId) return dm.to_member_id
  return dm.from_member_id // null means Pancho
}

export default function DmsClient({
  initialDms, team, currentMemberId,
}: {
  initialDms: Dm[]
  team: Member[]
  currentMemberId: string
}) {
  const supabase = createClient()
  const [dms, setDms] = useState<Dm[]>(initialDms)
  const [activeConvo, setActiveConvo] = useState<ConvoKey | undefined>(undefined)
  const [replyBody, setReplyBody] = useState('')
  const [sending, setSending] = useState(false)
  const [newDmTarget, setNewDmTarget] = useState('')
  const [newDmBody, setNewDmBody] = useState('')
  const [showNewDm, setShowNewDm] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  function memberName(id: string | null) {
    if (!id) return '✦ Pancho'
    return team.find(t => t.id === id)?.name || 'Someone'
  }

  // Group dms into conversations
  const convoMap = new Map<string, { key: ConvoKey; dms: Dm[]; unread: number; latest: Dm }>()
  for (const dm of dms) {
    const key = getConvoKey(dm, currentMemberId)
    const keyStr = key ?? '__pancho__'
    if (!convoMap.has(keyStr)) {
      convoMap.set(keyStr, { key, dms: [], unread: 0, latest: dm })
    }
    const convo = convoMap.get(keyStr)!
    convo.dms.push(dm)
    if (!dm.read_at && dm.to_member_id === currentMemberId) convo.unread++
    if (new Date(dm.created_at) > new Date(convo.latest.created_at)) convo.latest = dm
  }

  const convos = [...convoMap.values()].sort((a, b) =>
    new Date(b.latest.created_at).getTime() - new Date(a.latest.created_at).getTime()
  )

  const totalUnread = dms.filter(d => !d.read_at && d.to_member_id === currentMemberId).length

  async function openConvo(key: ConvoKey) {
    setActiveConvo(key)
    setReplyBody('')
    // mark unread as read
    const keyStr = key ?? '__pancho__'
    const convo = convoMap.get(keyStr)
    if (!convo) return
    const unreadIds = convo.dms.filter(d => !d.read_at && d.to_member_id === currentMemberId).map(d => d.id)
    for (const id of unreadIds) {
      await supabase.from('direct_messages').update({ read_at: new Date().toISOString() }).eq('id', id)
    }
    if (unreadIds.length) {
      setDms(prev => prev.map(d => unreadIds.includes(d.id) ? { ...d, read_at: new Date().toISOString() } : d))
    }
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [activeConvo, dms])

  async function sendReply() {
    if (!replyBody.trim() || activeConvo === undefined) return
    setSending(true)
    const toId = activeConvo ?? null
    // Can't reply to Pancho directly — show hint
    if (!toId) {
      setSending(false)
      alert('To message Pancho, go to the Pancho page and ask him directly.')
      return
    }
    const { data, error } = await supabase.from('direct_messages').insert({
      from_member_id: currentMemberId,
      to_member_id: toId,
      body: replyBody.trim(),
      sent_via: 'team',
    }).select().single()
    setSending(false)
    if (error) { alert('Error: ' + error.message); return }
    setDms(prev => [data as Dm, ...prev])
    setReplyBody('')
  }

  async function sendNewDm() {
    if (!newDmBody.trim() || !newDmTarget) return
    setSending(true)
    const { data, error } = await supabase.from('direct_messages').insert({
      from_member_id: currentMemberId,
      to_member_id: newDmTarget,
      body: newDmBody.trim(),
      sent_via: 'team',
    }).select().single()
    setSending(false)
    if (error) { alert('Error: ' + error.message); return }
    setDms(prev => [data as Dm, ...prev])
    setNewDmBody('')
    setNewDmTarget('')
    setShowNewDm(false)
    setActiveConvo(newDmTarget)
  }

  const activeConvoStr: string | undefined = activeConvo === null ? '__pancho__' : activeConvo
  const activeThread = activeConvo !== undefined && activeConvoStr !== undefined ? convoMap.get(activeConvoStr) : null
  const threadDms = activeThread ? [...activeThread.dms].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) : []
  const otherName = activeConvo !== undefined ? memberName(activeConvo) : ''
  const canReply = activeConvo !== null && activeConvo !== undefined

  return (
    <div className="flex gap-4" style={{ height: 'calc(100vh - 200px)', minHeight: 500 }}>
      {/* Conversation list */}
      <div className="flex flex-col" style={{ width: 260, flexShrink: 0 }}>
        <div className="flex items-center justify-between mb-3">
          {totalUnread > 0 && (
            <span className="text-xs bg-blue-500 text-white rounded-full px-2 py-0.5 font-medium">{totalUnread} unread</span>
          )}
          <button onClick={() => setShowNewDm(v => !v)}
            className="ml-auto text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">
            + New DM
          </button>
        </div>

        {showNewDm && (
          <div className="mb-3 p-3 bg-white rounded-xl border border-gray-200 space-y-2">
            <select value={newDmTarget} onChange={e => setNewDmTarget(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5">
              <option value="">Select person...</option>
              {team.filter(t => t.id !== currentMemberId).map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            <textarea value={newDmBody} onChange={e => setNewDmBody(e.target.value)}
              placeholder="Message..." rows={2}
              className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 resize-none" />
            <button onClick={sendNewDm} disabled={sending || !newDmTarget || !newDmBody.trim()}
              className="w-full text-xs bg-gray-900 text-white rounded-lg py-1.5 disabled:opacity-40">
              Send
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto space-y-1">
          {convos.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-xs">No messages yet</div>
          ) : convos.map(convo => {
            const keyStr = convo.key ?? '__pancho__'
            const isActive = activeConvoStr === keyStr
            const name = memberName(convo.key)
            return (
              <button key={keyStr} onClick={() => openConvo(convo.key)}
                className={`w-full text-left px-3 py-3 rounded-xl transition-colors ${isActive ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 hover:bg-gray-50'}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-sm font-medium truncate ${isActive ? 'text-white' : 'text-gray-900'}`}>{name}</span>
                  {convo.unread > 0 && (
                    <span className="text-xs bg-blue-500 text-white rounded-full px-1.5 py-0.5 flex-shrink-0">{convo.unread}</span>
                  )}
                </div>
                <p className={`text-xs truncate mt-0.5 ${isActive ? 'text-gray-300' : 'text-gray-500'}`}>{convo.latest.body}</p>
                <span className={`text-xs ${isActive ? 'text-gray-400' : 'text-gray-400'}`}>{timeAgo(convo.latest.created_at)}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Thread view */}
      <div className="flex-1 flex flex-col bg-white rounded-xl border border-gray-200 overflow-hidden">
        {activeConvo === undefined ? (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <div className="text-center">
              <div className="text-3xl mb-2">✦</div>
              <div className="text-sm">Select a conversation</div>
            </div>
          </div>
        ) : (
          <>
            <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
              <span className="font-medium text-sm text-gray-900">{otherName}</span>
              {!canReply && <span className="text-xs text-gray-400">— read only (Pancho messages)</span>}
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {threadDms.map(dm => {
                const isFromMe = dm.from_member_id === currentMemberId
                const fromName = dm.sent_via === 'mav' && !dm.from_member_id ? '✦ Pancho' : memberName(dm.from_member_id)
                return (
                  <div key={dm.id} className={`flex ${isFromMe ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-xs lg:max-w-md px-3 py-2 rounded-2xl text-sm ${isFromMe ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-900'}`}>
                      {!isFromMe && (
                        <div className="text-xs font-medium mb-1 opacity-60">{fromName}</div>
                      )}
                      <p className="whitespace-pre-wrap leading-relaxed">{dm.body}</p>
                      {dm.wo_id && (
                        <a href={`/dashboard/wo/${dm.wo_id}`}
                          className={`block mt-1 text-xs underline ${isFromMe ? 'text-gray-300' : 'text-blue-600'}`}>
                          View work order →
                        </a>
                      )}
                      <div className={`text-xs mt-1 ${isFromMe ? 'text-gray-400' : 'text-gray-400'}`}>{timeAgo(dm.created_at)}</div>
                    </div>
                  </div>
                )
              })}
              <div ref={bottomRef} />
            </div>

            {canReply && (
              <div className="px-4 py-3 border-t border-gray-100 flex gap-2">
                <textarea
                  value={replyBody}
                  onChange={e => setReplyBody(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); sendReply() } }}
                  placeholder={`Message ${otherName}... (Cmd+Enter to send)`}
                  rows={2}
                  className="flex-1 text-sm border border-gray-200 rounded-xl px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-gray-300"
                />
                <button onClick={sendReply} disabled={sending || !replyBody.trim()}
                  className="px-4 py-2 bg-gray-900 text-white text-sm rounded-xl disabled:opacity-40 hover:bg-gray-800 self-end">
                  Send
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
