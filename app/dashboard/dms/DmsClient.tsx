'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
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
  attachment_url: string | null   // storage path (dms/...) or null
  attachment_type: string | null  // 'image' | 'pdf' | null
}

type Member = { id: string; name: string }
type Reaction = { dm_id: string; member_id: string; emoji: string }
type WoResult = { id: string; title: string; client: string }

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

type ConvoKey = string | null

function getConvoKey(dm: Dm, currentMemberId: string): ConvoKey {
  if (dm.from_member_id === currentMemberId) return dm.to_member_id
  return dm.from_member_id
}

export default function DmsClient({
  initialDms, team, currentMemberId, initialReactions, initialSignedUrls,
}: {
  initialDms: Dm[]
  team: Member[]
  currentMemberId: string
  initialReactions: Reaction[]
  initialSignedUrls: Record<string, string>
}) {
  const supabase = createClient()
  const [dms, setDms] = useState<Dm[]>(initialDms)
  const [activeConvo, setActiveConvo] = useState<ConvoKey | undefined>(undefined)
  const [mobileView, setMobileView] = useState<'list' | 'thread'>('list')
  const [isDesktop, setIsDesktop] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)')
    setIsDesktop(mq.matches)
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  const [replyBody, setReplyBody] = useState('')
  const [sending, setSending] = useState(false)
  const [newDmTarget, setNewDmTarget] = useState('')
  const [newDmBody, setNewDmBody] = useState('')
  const [showNewDm, setShowNewDm] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Attachments
  const [attachFile, setAttachFile] = useState<File | null>(null)
  const [attachPreview, setAttachPreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // WO picker
  const [showWoPicker, setShowWoPicker] = useState(false)
  const [woQuery, setWoQuery] = useState('')
  const [woResults, setWoResults] = useState<WoResult[]>([])
  const [selectedWo, setSelectedWo] = useState<WoResult | null>(null)
  const woSearchRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Reactions: map dm_id → { count, myReaction }
  const [reactions, setReactions] = useState<Reaction[]>(initialReactions)
  // Emoji picker open state per dm_id
  const [openPickerDmId, setOpenPickerDmId] = useState<string | null>(null)

  // Signed URLs for attachments (dm_id → signedUrl)
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>(initialSignedUrls)

  function memberName(id: string | null) {
    if (!id) return '✦ Pancho'
    return team.find(t => t.id === id)?.name || 'Someone'
  }

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
    setMobileView('thread')
    setReplyBody('')
    setAttachFile(null)
    setAttachPreview(null)
    setSelectedWo(null)
    setShowWoPicker(false)
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

  // Fetch signed URL for a new DM attachment that arrived client-side
  async function ensureSignedUrl(dm: Dm) {
    if (!dm.attachment_url || !dm.attachment_url.startsWith('dms/')) return
    if (signedUrls[dm.id]) return
    const res = await fetch(`/api/dms/file-url?path=${encodeURIComponent(dm.attachment_url)}`)
    const json = await res.json()
    if (json.signedUrl) {
      setSignedUrls(prev => ({ ...prev, [dm.id]: json.signedUrl }))
    }
  }

  // File selection
  function onFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setAttachFile(f)
    if (f.type.startsWith('image/')) {
      setAttachPreview(URL.createObjectURL(f))
    } else {
      setAttachPreview(null)
    }
    e.target.value = ''
  }

  function clearAttach() {
    setAttachFile(null)
    setAttachPreview(null)
  }

  // WO search with debounce
  function onWoQueryChange(q: string) {
    setWoQuery(q)
    if (woSearchRef.current) clearTimeout(woSearchRef.current)
    if (q.length < 2) { setWoResults([]); return }
    woSearchRef.current = setTimeout(async () => {
      const res = await fetch(`/api/dms/wo-search?q=${encodeURIComponent(q)}`)
      const json = await res.json()
      setWoResults(json.results ?? [])
    }, 300)
  }

  function selectWo(wo: WoResult) {
    setSelectedWo(wo)
    setShowWoPicker(false)
    setWoQuery('')
    setWoResults([])
  }

  async function sendReply() {
    if ((!replyBody.trim() && !attachFile) || activeConvo === undefined) return
    const toId = activeConvo ?? null
    if (!toId) {
      alert('To message Pancho, go to the Pancho page and ask him directly.')
      return
    }
    setSending(true)

    let storagePath: string | null = null
    let attachType: string | null = null

    if (attachFile) {
      const fd = new FormData()
      fd.append('file', attachFile)
      if (selectedWo) fd.append('wo_id', selectedWo.id)
      if (currentMemberId) fd.append('member_id', currentMemberId)

      const res = await fetch('/api/dms/upload', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) {
        alert('Upload failed: ' + (json.error ?? 'Unknown error'))
        setSending(false)
        return
      }
      storagePath = json.storagePath
      attachType = attachFile.type.startsWith('image/')
        ? 'image'
        : attachFile.type === 'application/pdf'
        ? 'pdf'
        : 'doc'

      // Cache the signed URL for immediate display
      if (json.signedUrl) {
        // We'll set it after we have the DM id — store temporarily
        (window as any).__pendingDmSignedUrl = json.signedUrl
      }
    }

    const { data, error } = await supabase.from('direct_messages').insert({
      from_member_id: currentMemberId,
      to_member_id: toId,
      body: replyBody.trim(),
      sent_via: 'team',
      wo_id: selectedWo?.id ?? null,
      attachment_url: storagePath,
      attachment_type: attachType,
    }).select().single()

    setSending(false)
    if (error) { alert('Error: ' + error.message); return }

    const newDm = data as Dm

    // Cache signed URL if we got one
    const pending = (window as any).__pendingDmSignedUrl
    if (pending && newDm.id) {
      setSignedUrls(prev => ({ ...prev, [newDm.id]: pending }))
      ;(window as any).__pendingDmSignedUrl = null
    }

    setDms(prev => [newDm, ...prev])
    setReplyBody('')
    clearAttach()
    setSelectedWo(null)
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

  const DM_EMOJIS = ['👍', '✅', '👀', '🎉', '🔥', '❤️']

  async function toggleReaction(dmId: string, emoji: string) {
    if (!currentMemberId) return
    const res = await fetch('/api/dms/react', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dm_id: dmId, member_id: currentMemberId, emoji }),
    })
    const json = await res.json()
    if (json.action === 'added') {
      setReactions(prev => [...prev, { dm_id: dmId, member_id: currentMemberId, emoji }])
    } else {
      setReactions(prev => prev.filter(r => !(r.dm_id === dmId && r.member_id === currentMemberId && r.emoji === emoji)))
    }
  }

  const activeConvoStr: string | undefined = activeConvo === null ? '__pancho__' : activeConvo
  const activeThread = activeConvo !== undefined && activeConvoStr !== undefined ? convoMap.get(activeConvoStr) : null
  const threadDms = activeThread
    ? [...activeThread.dms].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    : []
  const otherName = activeConvo !== undefined ? memberName(activeConvo) : ''
  const canReply = activeConvo !== null && activeConvo !== undefined

  return (
    <div style={{ display: 'flex', flexDirection: isDesktop ? 'row' : 'column', gap: 12, height: 'calc(100vh - 120px)', minHeight: 500 }}>
      {/* Conversation list */}
      <div style={{ flexShrink: 0, width: isDesktop ? 240 : '100%', display: isDesktop || mobileView === 'list' ? 'flex' : 'none', flexDirection: 'column' }}>
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
            const preview = convo.latest.attachment_url && !convo.latest.body
              ? (convo.latest.attachment_type === 'image' ? '🖼 Image' : convo.latest.attachment_type === 'pdf' ? '📄 PDF' : '📎 File')
              : convo.latest.body
            return (
              <button key={keyStr} onClick={() => openConvo(convo.key)}
                className={`w-full text-left px-3 py-3 rounded-xl transition-colors ${isActive ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 hover:bg-gray-50'}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-sm font-medium truncate ${isActive ? 'text-white' : 'text-gray-900'}`}>{name}</span>
                  {convo.unread > 0 && (
                    <span className="text-xs bg-blue-500 text-white rounded-full px-1.5 py-0.5 flex-shrink-0">{convo.unread}</span>
                  )}
                </div>
                <p className={`text-xs truncate mt-0.5 ${isActive ? 'text-gray-300' : 'text-gray-500'}`}>{preview}</p>
                <span className={`text-xs ${isActive ? 'text-gray-400' : 'text-gray-400'}`}>{timeAgo(convo.latest.created_at)}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Thread view */}
      <div className="rounded-xl border border-gray-200 overflow-hidden"
        style={{ flex: 1, display: isDesktop || mobileView === 'thread' ? 'flex' : 'none', flexDirection: 'column', background: 'white' }}>
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
              <button
                onClick={() => setMobileView('list')}
                className="md:hidden flex items-center justify-center w-8 h-8 -ml-1 rounded-lg text-gray-500 hover:bg-gray-100 text-lg font-medium">
                ←
              </button>
              <span className="font-medium text-sm text-gray-900">{otherName}</span>
              {!canReply && <span className="text-xs text-gray-400 hidden sm:inline">— read only</span>}
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {threadDms.map(dm => {
                const isFromMe = dm.from_member_id === currentMemberId
                const fromName = dm.sent_via === 'mav' && !dm.from_member_id ? '✦ Pancho' : memberName(dm.from_member_id)
                // Group reactions by emoji for this message
                const dmReactionMap: Record<string, { n: number; mine: boolean }> = {}
                for (const r of reactions.filter(r => r.dm_id === dm.id)) {
                  if (!dmReactionMap[r.emoji]) dmReactionMap[r.emoji] = { n: 0, mine: false }
                  dmReactionMap[r.emoji].n++
                  if (r.member_id === currentMemberId) dmReactionMap[r.emoji].mine = true
                }
                const signedUrl = signedUrls[dm.id]

                // Lazily load signed URL if not yet available
                if (dm.attachment_url && dm.attachment_url.startsWith('dms/') && !signedUrl) {
                  ensureSignedUrl(dm)
                }

                return (
                  <div key={dm.id} className={`flex flex-col ${isFromMe ? 'items-end' : 'items-start'}`}>
                    <div className={`max-w-[75vw] md:max-w-xs lg:max-w-md px-3 py-2 rounded-2xl text-sm ${isFromMe ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-900'}`}>
                      {!isFromMe && (
                        <div className="text-xs font-medium mb-1 opacity-60">{fromName}</div>
                      )}
                      {dm.body && (
                        <p className="whitespace-pre-wrap leading-relaxed">{dm.body}</p>
                      )}

                      {/* Attachment */}
                      {dm.attachment_url && (
                        <div className="mt-2">
                          {dm.attachment_type === 'image' && signedUrl ? (
                            <a href={signedUrl} target="_blank" rel="noreferrer">
                              <img src={signedUrl} alt="attachment"
                                className="rounded-lg max-w-full object-cover"
                                style={{ maxHeight: 200, display: 'block' }} />
                            </a>
                          ) : dm.attachment_type === 'pdf' && signedUrl ? (
                            <a href={signedUrl} target="_blank" rel="noreferrer"
                              className={`flex items-center gap-1.5 text-xs underline ${isFromMe ? 'text-gray-300' : 'text-blue-600'}`}>
                              📄 View PDF
                            </a>
                          ) : dm.attachment_type === 'doc' && signedUrl ? (
                            <a href={signedUrl} target="_blank" rel="noreferrer"
                              className={`flex items-center gap-1.5 text-xs underline ${isFromMe ? 'text-gray-300' : 'text-blue-600'}`}>
                              📎 {dm.attachment_url?.split('/').pop()?.replace(/^\d+-[a-z0-9]+\./, '') ?? 'Download file'}
                            </a>
                          ) : dm.attachment_url.startsWith('dms/') ? (
                            <span className="text-xs opacity-50">Loading…</span>
                          ) : null}
                        </div>
                      )}

                      {/* WO link */}
                      {dm.wo_id && (
                        <a href={`/dashboard/wo/${dm.wo_id}`}
                          className={`block mt-1.5 text-xs underline ${isFromMe ? 'text-gray-300' : 'text-blue-600'}`}>
                          🗂 View work order →
                        </a>
                      )}

                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-xs ${isFromMe ? 'text-gray-400' : 'text-gray-400'}`}>{timeAgo(dm.created_at)}</span>
                        {isFromMe && (
                          dm.read_at
                            ? <span className="text-xs text-blue-300">✓✓ Read</span>
                            : <span className="text-xs text-gray-500">✓ Sent</span>
                        )}
                      </div>
                    </div>

                    {/* Reaction bar */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, flexWrap: 'wrap', position: 'relative' }}>
                      {/* Existing reaction pills */}
                      {Object.entries(dmReactionMap).map(([emoji, { n, mine }]) => (
                        <button
                          key={emoji}
                          onClick={() => toggleReaction(dm.id, emoji)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 3,
                            fontSize: 12, padding: '1px 8px', borderRadius: 999,
                            border: mine ? '1px solid #fcd34d' : '1px solid #e5e7eb',
                            background: mine ? '#fefce8' : 'transparent',
                            color: mine ? '#92400e' : '#9ca3af',
                            cursor: 'pointer',
                          }}>
                          {emoji} <span>{n}</span>
                        </button>
                      ))}
                      {/* ＋ picker button */}
                      <div style={{ position: 'relative' }}>
                        <button
                          onClick={() => setOpenPickerDmId(openPickerDmId === dm.id ? null : dm.id)}
                          style={{
                            fontSize: 13, padding: '1px 8px', borderRadius: 999,
                            border: '1px solid #e5e7eb', background: 'transparent',
                            color: '#9ca3af', cursor: 'pointer',
                          }}>
                          ＋
                        </button>
                        {openPickerDmId === dm.id && (
                          <div style={{
                            position: 'absolute', bottom: '100%', left: 0,
                            background: 'white', border: '1px solid #e5e7eb',
                            borderRadius: 12, padding: '6px 8px',
                            display: 'flex', gap: 4, boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                            zIndex: 50,
                          }}>
                            {DM_EMOJIS.map(e => (
                              <button
                                key={e}
                                onClick={() => { toggleReaction(dm.id, e); setOpenPickerDmId(null) }}
                                style={{
                                  fontSize: 18, background: 'none', border: 'none',
                                  cursor: 'pointer', padding: '2px 3px', borderRadius: 6,
                                  lineHeight: 1,
                                }}
                                onMouseEnter={ev => (ev.currentTarget.style.background = '#f3f4f6')}
                                onMouseLeave={ev => (ev.currentTarget.style.background = 'none')}>
                                {e}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
              <div ref={bottomRef} />
            </div>

            {canReply && (
              <div className="px-3 py-3 border-t border-gray-100">
                {/* Attachment + WO chips */}
                {(attachFile || selectedWo) && (
                  <div className="flex flex-wrap gap-2 mb-2">
                    {attachFile && (
                      <div className="flex items-center gap-1 text-xs bg-blue-50 border border-blue-200 text-blue-700 rounded-lg px-2 py-1">
                        {attachFile.type.startsWith('image/') ? '🖼' : attachFile.type === 'application/pdf' ? '📄' : '📎'} {attachFile.name}
                        <button onClick={clearAttach} className="ml-1 text-blue-400 hover:text-blue-700 font-bold">×</button>
                      </div>
                    )}
                    {selectedWo && (
                      <div className="flex items-center gap-1 text-xs bg-purple-50 border border-purple-200 text-purple-700 rounded-lg px-2 py-1">
                        🗂 {selectedWo.client} — {selectedWo.title}
                        <button onClick={() => setSelectedWo(null)} className="ml-1 text-purple-400 hover:text-purple-700 font-bold">×</button>
                      </div>
                    )}
                  </div>
                )}

                {/* WO picker dropdown */}
                {showWoPicker && (
                  <div className="mb-2 bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                    <input
                      autoFocus
                      value={woQuery}
                      onChange={e => onWoQueryChange(e.target.value)}
                      placeholder="Search work order by title…"
                      className="w-full text-sm px-3 py-2 border-b border-gray-100 focus:outline-none"
                    />
                    {woResults.length > 0 ? (
                      <div className="max-h-40 overflow-y-auto">
                        {woResults.map(wo => (
                          <button key={wo.id} onClick={() => selectWo(wo)}
                            className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 border-b border-gray-50 last:border-0">
                            <span className="font-medium text-gray-800">{wo.title}</span>
                            <span className="text-gray-400 ml-1">— {wo.client}</span>
                          </button>
                        ))}
                      </div>
                    ) : woQuery.length >= 2 ? (
                      <div className="px-3 py-2 text-xs text-gray-400">No results</div>
                    ) : null}
                  </div>
                )}

                <div className="flex gap-2 items-end">
                  {/* Action buttons */}
                  <div className="flex flex-col gap-1">
                    {/* Attach file */}
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      title="Attach image or PDF"
                      className="w-9 h-9 flex items-center justify-center rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700 text-base">
                      📎
                    </button>
                    {/* Tag WO */}
                    <button
                      onClick={() => setShowWoPicker(v => !v)}
                      title="Tag a work order"
                      className={`w-9 h-9 flex items-center justify-center rounded-xl border text-base
                        ${showWoPicker || selectedWo ? 'border-purple-300 bg-purple-50 text-purple-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700'}`}>
                      🗂
                    </button>
                  </div>

                  <textarea
                    value={replyBody}
                    onChange={e => setReplyBody(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); sendReply() } }}
                    placeholder={`Message ${otherName}…`}
                    rows={2}
                    className="flex-1 text-sm border border-gray-200 rounded-xl px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-gray-300"
                    style={{ minHeight: 44 }}
                  />

                  <button
                    onClick={sendReply}
                    disabled={sending || (!replyBody.trim() && !attachFile)}
                    className="px-4 py-2 bg-gray-900 text-white text-sm rounded-xl disabled:opacity-40 hover:bg-gray-800 self-end"
                    style={{ minHeight: 44 }}>
                    {sending ? '…' : 'Send'}
                  </button>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain,text/csv"
                  style={{ display: 'none' }}
                  onChange={onFileSelect}
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
