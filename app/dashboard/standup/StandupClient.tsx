'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export type WallPost = {
  id: string
  channel: string
  parent_id: string | null
  author_id: string
  body: string
  mentions: string[] | null
  pinned: boolean
  work_order_id: string | null
  created_at: string
  edited_at?: string | null
}
export type TeamMember = { id: string; name: string; auth_user_id: string | null; active?: boolean }
export type WoOption = { id: string; title: string; clientName: string | null }
export type Reaction = { id: string; post_id: string; user_id: string; emoji: string }

const CHANNELS: { id: string; label: string }[] = [
  { id: 'standup', label: '☀️ Standup' },
  { id: 'design',  label: '🎨 Design' },
  { id: 'ads',     label: '📣 Ads' },
  { id: 'social',  label: '📱 Social' },
  { id: 'email',   label: '✉️ Email' },
  { id: 'web',     label: '🌐 Web' },
]

const EMOJIS = ['👍', '✅', '👀', '🎉', '🔥', '❤️']

function ClientDate({ iso }: { iso: string }) {
  const txt = new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
  return <span suppressHydrationWarning>{txt}</span>
}

function renderBody(body: string) {
  const parts = body.split(/(@\w+)/g)
  return parts.map((p, i) =>
    p.startsWith('@') ? (
      <span key={i} style={{ background: 'rgba(217,158,43,0.15)', color: 'var(--brand-accent, #b8860b)', borderRadius: 4, padding: '0 4px', fontWeight: 600 }}>{p}</span>
    ) : <span key={i}>{p}</span>
  )
}

// Central-time YYYY-MM-DD for "today" comparison.
function centralDateKey(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
  } catch { return iso.slice(0, 10) }
}

export default function StandupClient({
  initialPosts, initialReactions, team, authMap, currentUserId, woOptions,
}: {
  initialPosts: WallPost[]
  initialReactions: Reaction[]
  team: TeamMember[]
  authMap: Record<string, string>
  currentUserId: string | null
  woOptions: WoOption[]
}) {
  const supabase = createClient()
  const [posts, setPosts] = useState<WallPost[]>(initialPosts)
  const [reactions, setReactions] = useState<Reaction[]>(initialReactions)
  const [channel, setChannel] = useState<string>('standup')

  const [body, setBody] = useState('')
  const [posting, setPosting] = useState(false)
  const [postWo, setPostWo] = useState<string>('')   // WO id to link on new post

  const [mention, setMention] = useState<{ target: string; query: string; pos: number } | null>(null)
  const [mentionIdx] = useState(0)

  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [replyBody, setReplyBody] = useState('')
  const [replyWo, setReplyWo] = useState<string>('')
  const [replyPosting, setReplyPosting] = useState(false)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editBody, setEditBody] = useState('')

  const currentUserName = useMemo(() => {
    const me = team.find(t => t.auth_user_id === currentUserId)
    return me?.name || 'Someone'
  }, [team, currentUserId])

  const woMap = useMemo(() => {
    const m: Record<string, WoOption> = {}
    woOptions.forEach(w => { m[w.id] = w })
    return m
  }, [woOptions])

  // Realtime: all wall_posts + wall_reactions (client filters by channel).
  useEffect(() => {
    const ch = supabase
      .channel('wall-all')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wall_posts' }, (payload: any) => {
        if (payload.eventType === 'INSERT') {
          const row = payload.new as WallPost
          setPosts(prev => prev.some(p => p.id === row.id) ? prev : [...prev, row])
        } else if (payload.eventType === 'UPDATE') {
          const row = payload.new as WallPost
          setPosts(prev => prev.map(p => p.id === row.id ? row : p))
        } else if (payload.eventType === 'DELETE') {
          const goneId = (payload.old as { id: string }).id
          setPosts(prev => prev.filter(p => p.id !== goneId))
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wall_reactions' }, (payload: any) => {
        if (payload.eventType === 'INSERT') {
          const row = payload.new as Reaction
          setReactions(prev => prev.some(r => r.id === row.id) ? prev : [...prev, row])
        } else if (payload.eventType === 'DELETE') {
          const goneId = (payload.old as { id: string }).id
          setReactions(prev => prev.filter(r => r.id !== goneId))
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── mentions ──
  function onInput(target: string, value: string, cursor: number, setter: (v: string) => void) {
    setter(value)
    const before = value.substring(0, cursor)
    const m = before.match(/(?:^|\s)@(\w*)$/)
    if (m) setMention({ target, query: m[1].toLowerCase(), pos: cursor - m[1].length - 1 })
    else setMention(null)
  }
  const mentionMatches = useMemo(() => {
    if (!mention) return []
    return team.filter(t => t.name.toLowerCase().includes(mention.query)).slice(0, 6)
  }, [team, mention])
  function applyMention(name: string, value: string, setter: (v: string) => void) {
    if (!mention) return
    const cursor = mention.pos + 1 + mention.query.length
    setter(value.substring(0, mention.pos) + '@' + name + ' ' + value.substring(cursor))
    setMention(null)
  }
  function extractMentionedIds(text: string): string[] {
    const ids: string[] = []; const seen = new Set<string>()
    ;(text.match(/@(\w+)/g) || []).forEach(m => {
      const name = m.substring(1).toLowerCase()
      const member = team.find(t => t.name.toLowerCase() === name || t.name.toLowerCase().startsWith(name))
      if (member && member.auth_user_id && !seen.has(member.auth_user_id)) { seen.add(member.auth_user_id); ids.push(member.auth_user_id) }
    })
    return ids
  }
  async function notify(mentionIds: string[], text: string, postId: string) {
    const recipients = mentionIds.filter(uid => uid !== currentUserId)
    if (recipients.length === 0) return
    const preview = text.length > 140 ? text.slice(0, 140) + '\u2026' : text
    const rows = recipients.map(uid => ({
      user_id: uid, source_type: 'standup', source_id: postId, work_order_id: null,
      body_preview: preview, author_name: currentUserName, link_url: '/dashboard/standup',
    }))
    const { error } = await supabase.from('wo_notifications').insert(rows)
    if (error) console.error('Failed to create standup notifications:', error.message)
  }

  // ── post / reply ──
  async function submitPost(text: string, parentId: string | null, woId: string) {
    const clean = text.trim()
    if (!clean) return null
    const mentionIds = extractMentionedIds(clean)
    const { data, error } = await supabase
      .from('wall_posts')
      .insert({
        channel, parent_id: parentId, author_id: currentUserId, body: clean,
        mentions: mentionIds, work_order_id: woId || null,
      })
      .select()
      .single()
    if (error) { alert('Error posting: ' + error.message); return null }
    setPosts(prev => prev.some(p => p.id === (data as WallPost).id) ? prev : [...prev, data as WallPost])
    await notify(mentionIds, clean, (data as WallPost).id)
    return data as WallPost
  }
  async function onPost() {
    if (!body.trim()) return
    setPosting(true)
    const res = await submitPost(body, null, postWo)
    setPosting(false)
    if (res) { setBody(''); setPostWo(''); setMention(null) }
  }
  async function onReply(parentId: string) {
    if (!replyBody.trim()) return
    setReplyPosting(true)
    const res = await submitPost(replyBody, parentId, replyWo)
    setReplyPosting(false)
    if (res) { setReplyBody(''); setReplyWo(''); setReplyTo(null); setMention(null) }
  }
  async function onDelete(id: string) {
    if (!confirm('Delete this post?')) return
    const prev = posts
    setPosts(curr => curr.filter(p => p.id !== id && p.parent_id !== id))
    const { error } = await supabase.from('wall_posts').delete().eq('id', id)
    if (error) { alert('Error deleting: ' + error.message); setPosts(prev) }
  }
  async function onSaveEdit() {
    if (!editingId) return
    const clean = editBody.trim(); if (!clean) return
    const { error } = await supabase.from('wall_posts').update({ body: clean, edited_at: new Date().toISOString() }).eq('id', editingId)
    if (error) { alert('Error saving: ' + error.message); return }
    setPosts(prev => prev.map(p => p.id === editingId ? { ...p, body: clean, edited_at: new Date().toISOString() } : p))
    setEditingId(null); setEditBody('')
  }

  // ── pin ──
  async function togglePin(post: WallPost) {
    const next = !post.pinned
    setPosts(prev => prev.map(p => p.id === post.id ? { ...p, pinned: next } : p))
    const { error } = await supabase.from('wall_posts').update({ pinned: next }).eq('id', post.id)
    if (error) { alert('Error pinning: ' + error.message); setPosts(prev => prev.map(p => p.id === post.id ? { ...p, pinned: post.pinned } : p)) }
  }

  // ── reactions ──
  async function toggleReaction(postId: string, emoji: string) {
    const mine = reactions.find(r => r.post_id === postId && r.emoji === emoji && r.user_id === currentUserId)
    if (mine) {
      setReactions(prev => prev.filter(r => r.id !== mine.id))
      const { error } = await supabase.from('wall_reactions').delete().eq('id', mine.id)
      if (error) console.error('react remove failed:', error.message)
    } else {
      const { data, error } = await supabase.from('wall_reactions').insert({ post_id: postId, user_id: currentUserId, emoji }).select().single()
      if (error) { console.error('react add failed:', error.message); return }
      setReactions(prev => prev.some(r => r.id === (data as Reaction).id) ? prev : [...prev, data as Reaction])
    }
  }

  // ── derived ──
  const channelPosts = useMemo(() => posts.filter(p => p.channel === channel), [posts, channel])
  const topLevel = useMemo(() =>
    channelPosts.filter(p => !p.parent_id).sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
      return b.created_at.localeCompare(a.created_at)
    }), [channelPosts])
  const repliesByParent = useMemo(() => {
    const map: Record<string, WallPost[]> = {}
    channelPosts.filter(p => p.parent_id).forEach(p => { (map[p.parent_id as string] ||= []).push(p) })
    Object.values(map).forEach(list => list.sort((a, b) => a.created_at.localeCompare(b.created_at)))
    return map
  }, [channelPosts])

  const reactionsByPost = useMemo(() => {
    const map: Record<string, Reaction[]> = {}
    reactions.forEach(r => { (map[r.post_id] ||= []).push(r) })
    return map
  }, [reactions])

  // Who's posted today (standup channel only; login-having team; Central time).
  const todayKey = useMemo(() => centralDateKey(new Date().toISOString()), [])
  const postedTodayIds = useMemo(() => {
    const s = new Set<string>()
    posts.filter(p => p.channel === 'standup' && !p.parent_id && centralDateKey(p.created_at) === todayKey)
      .forEach(p => s.add(p.author_id))
    return s
  }, [posts, todayKey])
  const checkInTeam = useMemo(() => team.filter(t => t.auth_user_id && t.active !== false), [team])

  const initials = (uid: string) => (authMap[uid] || '?')[0]?.toUpperCase() || '?'
  const nameOf = (uid: string) => authMap[uid] || 'Someone'

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      {/* Channel tabs */}
      <div className="flex gap-1 mb-4 flex-wrap">
        {CHANNELS.map(c => {
          const active = c.id === channel
          return (
            <button key={c.id} onClick={() => { setChannel(c.id); setReplyTo(null); setMention(null) }}
              className="px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
              style={active
                ? { background: 'var(--brand-accent, #b8860b)', color: '#1a2744' }
                : { background: 'var(--bg-elevated)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
              {c.label}
            </button>
          )
        })}
      </div>

      <div className="mb-4">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>
          {CHANNELS.find(c => c.id === channel)?.label}
        </h1>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          {channel === 'standup'
            ? 'Post your morning update. Everyone can see and reply. Use @name to ping, and link a work order if relevant.'
            : 'Team channel. Post updates, @mention people, link work orders.'}
        </p>
      </div>

      {/* Who's posted today — standup only */}
      {channel === 'standup' && checkInTeam.length > 0 && (
        <div className="rounded-lg border p-3 mb-4 flex items-center gap-3 flex-wrap" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}>
          <span className="text-xs font-semibold uppercase" style={{ color: 'var(--text-muted)', letterSpacing: '0.06em' }}>Checked in today</span>
          <div className="flex gap-1.5 flex-wrap">
            {checkInTeam.map(m => {
              const done = m.auth_user_id ? postedTodayIds.has(m.auth_user_id) : false
              return (
                <span key={m.id} title={`${m.name}${done ? ' — posted' : ' — not yet'}`}
                  className="rounded-full flex items-center justify-center font-bold"
                  style={{ width: 26, height: 26, fontSize: 11,
                    background: done ? 'var(--brand-accent, #b8860b)' : 'var(--bg)',
                    color: done ? '#1a2744' : 'var(--text-muted)',
                    border: done ? 'none' : '1px dashed var(--border)',
                    opacity: done ? 1 : 0.7 }}>
                  {m.name[0]?.toUpperCase()}
                </span>
              )
            })}
          </div>
          <span className="text-xs ml-auto" style={{ color: 'var(--text-muted)' }}>
            {postedTodayIds.size}/{checkInTeam.length}
          </span>
        </div>
      )}

      {/* Composer */}
      <div className="rounded-lg border p-3 mb-6 relative" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}>
        <textarea value={body}
          onChange={e => onInput('main', e.target.value, e.target.selectionStart || 0, setBody)}
          placeholder={channel === 'standup' ? 'What are you working on today?' : 'Share an update…'}
          rows={3} className="w-full rounded border px-3 py-2 text-sm"
          style={{ background: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text)', resize: 'vertical' }} />
        {mention && mention.target === 'main' && mentionMatches.length > 0 && (
          <MentionMenu matches={mentionMatches} idx={mentionIdx} onPick={(n) => applyMention(n, body, setBody)} />
        )}
        <div className="flex items-center gap-2 mt-2">
          <WoPicker value={postWo} onChange={setPostWo} options={woOptions} />
          <button onClick={onPost} disabled={posting || !body.trim()}
            className="ml-auto px-4 py-1.5 rounded text-sm font-medium"
            style={{ background: 'var(--brand-accent, #b8860b)', color: '#1a2744', opacity: posting || !body.trim() ? 0.5 : 1 }}>
            {posting ? 'Posting…' : 'Post'}
          </button>
        </div>
      </div>

      {/* Feed */}
      {topLevel.length === 0 ? (
        <div className="text-center text-sm py-10" style={{ color: 'var(--text-muted)' }}>
          Nothing in {CHANNELS.find(c => c.id === channel)?.label} yet. Be the first to post.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {topLevel.map(post => {
            const replies = repliesByParent[post.id] || []
            return (
              <div key={post.id} className="rounded-lg border p-4"
                style={{ background: 'var(--bg-elevated)', borderColor: post.pinned ? 'var(--brand-accent, #b8860b)' : 'var(--border)' }}>
                {post.pinned && <div className="text-xs font-semibold mb-1" style={{ color: 'var(--brand-accent, #b8860b)' }}>📌 Pinned</div>}
                <PostHead initials={initials(post.author_id)} name={nameOf(post.author_id)}
                  createdAt={post.created_at} editedAt={post.edited_at}
                  canManage={post.author_id === currentUserId} pinned={post.pinned}
                  onPin={() => togglePin(post)}
                  onEdit={() => { setEditingId(post.id); setEditBody(post.body) }}
                  onDelete={() => onDelete(post.id)} />
                {editingId === post.id ? (
                  <EditBox value={editBody} onChange={setEditBody} onSave={onSaveEdit} onCancel={() => { setEditingId(null); setEditBody('') }} />
                ) : (
                  <div className="text-sm mt-1 whitespace-pre-wrap" style={{ color: 'var(--text)', lineHeight: 1.5 }}>{renderBody(post.body)}</div>
                )}
                {post.work_order_id && <WoChip wo={woMap[post.work_order_id]} woId={post.work_order_id} />}
                <ReactionBar postId={post.id} reactions={reactionsByPost[post.id] || []} currentUserId={currentUserId} onToggle={toggleReaction} />

                {replies.length > 0 && (
                  <div className="mt-3 pl-3 flex flex-col gap-3" style={{ borderLeft: '2px solid var(--border)' }}>
                    {replies.map(r => (
                      <div key={r.id}>
                        <PostHead small initials={initials(r.author_id)} name={nameOf(r.author_id)}
                          createdAt={r.created_at} editedAt={r.edited_at}
                          canManage={r.author_id === currentUserId} pinned={false} hidePin
                          onPin={() => {}} onEdit={() => { setEditingId(r.id); setEditBody(r.body) }}
                          onDelete={() => onDelete(r.id)} />
                        {editingId === r.id ? (
                          <EditBox value={editBody} onChange={setEditBody} onSave={onSaveEdit} onCancel={() => { setEditingId(null); setEditBody('') }} />
                        ) : (
                          <div className="text-sm whitespace-pre-wrap" style={{ color: 'var(--text)', lineHeight: 1.5 }}>{renderBody(r.body)}</div>
                        )}
                        {r.work_order_id && <WoChip wo={woMap[r.work_order_id]} woId={r.work_order_id} />}
                        <ReactionBar postId={r.id} reactions={reactionsByPost[r.id] || []} currentUserId={currentUserId} onToggle={toggleReaction} />
                      </div>
                    ))}
                  </div>
                )}

                {/* Reply composer */}
                <div className="mt-3 relative">
                  {replyTo === post.id ? (
                    <>
                      <textarea value={replyBody}
                        onChange={e => onInput('reply', e.target.value, e.target.selectionStart || 0, setReplyBody)}
                        placeholder={`Reply to ${nameOf(post.author_id)}…`} rows={2}
                        className="w-full rounded border px-3 py-2 text-sm"
                        style={{ background: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text)', resize: 'vertical' }} />
                      {mention && mention.target === 'reply' && mentionMatches.length > 0 && (
                        <MentionMenu matches={mentionMatches} idx={mentionIdx} onPick={(n) => applyMention(n, replyBody, setReplyBody)} />
                      )}
                      <div className="flex items-center gap-2 mt-1">
                        <WoPicker value={replyWo} onChange={setReplyWo} options={woOptions} small />
                        <div className="ml-auto flex gap-2">
                          <button onClick={() => { setReplyTo(null); setReplyBody(''); setReplyWo(''); setMention(null) }}
                            className="px-3 py-1 rounded text-xs" style={{ color: 'var(--text-muted)' }}>Cancel</button>
                          <button onClick={() => onReply(post.id)} disabled={replyPosting || !replyBody.trim()}
                            className="px-3 py-1 rounded text-xs font-medium"
                            style={{ background: 'var(--brand-accent, #b8860b)', color: '#1a2744', opacity: replyPosting || !replyBody.trim() ? 0.5 : 1 }}>
                            {replyPosting ? 'Replying…' : 'Reply'}
                          </button>
                        </div>
                      </div>
                    </>
                  ) : (
                    <button onClick={() => { setReplyTo(post.id); setReplyBody(''); setReplyWo(''); setMention(null) }}
                      className="text-xs font-medium" style={{ color: 'var(--brand-accent, #b8860b)' }}>Reply</button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function WoPicker({ value, onChange, options, small }: {
  value: string; onChange: (v: string) => void; options: WoOption[]; small?: boolean
}) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      className="rounded border px-2 py-1 text-xs"
      style={{ background: 'var(--bg)', borderColor: 'var(--border)', color: value ? 'var(--text)' : 'var(--text-muted)', maxWidth: small ? 180 : 240 }}>
      <option value="">🔗 Link a work order (optional)</option>
      {options.map(w => (
        <option key={w.id} value={w.id}>{w.clientName ? `${w.clientName} — ` : ''}{w.title}</option>
      ))}
    </select>
  )
}

function WoChip({ wo, woId }: { wo: WoOption | undefined; woId: string }) {
  const label = wo ? `${wo.clientName ? wo.clientName + ' — ' : ''}${wo.title}` : woId
  return (
    <a href={`/dashboard/wo/${woId}`}
      className="inline-flex items-center gap-1 mt-2 px-2 py-0.5 rounded text-xs font-medium"
      style={{ background: 'rgba(99,102,241,0.12)', color: 'var(--accent, #6366f1)' }}>
      🔗 {label}
    </a>
  )
}

function ReactionBar({ postId, reactions, currentUserId, onToggle }: {
  postId: string; reactions: Reaction[]; currentUserId: string | null
  onToggle: (postId: string, emoji: string) => void
}) {
  const [open, setOpen] = useState(false)
  const counts: Record<string, { n: number; mine: boolean }> = {}
  reactions.forEach(r => {
    counts[r.emoji] ||= { n: 0, mine: false }
    counts[r.emoji].n += 1
    if (r.user_id === currentUserId) counts[r.emoji].mine = true
  })
  return (
    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
      {Object.entries(counts).map(([emoji, { n, mine }]) => (
        <button key={emoji} onClick={() => onToggle(postId, emoji)}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs"
          style={{ background: mine ? 'rgba(217,158,43,0.18)' : 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}>
          <span>{emoji}</span><span style={{ color: 'var(--text-muted)' }}>{n}</span>
        </button>
      ))}
      <div className="relative">
        <button onClick={() => setOpen(o => !o)} className="px-1.5 py-0.5 rounded-full text-xs"
          style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>＋</button>
        {open && (
          <div className="absolute z-10 mt-1 flex gap-1 p-1 rounded border shadow-lg"
            style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}>
            {EMOJIS.map(e => (
              <button key={e} onClick={() => { onToggle(postId, e); setOpen(false) }}
                className="px-1 text-base hover:scale-110 transition-transform">{e}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function PostHead({ initials, name, createdAt, editedAt, canManage, pinned, hidePin, onPin, onEdit, onDelete, small }: {
  initials: string; name: string; createdAt: string; editedAt?: string | null
  canManage: boolean; pinned: boolean; hidePin?: boolean
  onPin: () => void; onEdit: () => void; onDelete: () => void; small?: boolean
}) {
  return (
    <div className="flex items-center gap-2 mb-1">
      <span className="rounded-full flex items-center justify-center font-bold flex-shrink-0"
        style={{ width: small ? 22 : 28, height: small ? 22 : 28, fontSize: small ? 10 : 12, background: 'var(--brand-navy, #1a2744)', color: 'white' }}>
        {initials}
      </span>
      <span className="font-semibold" style={{ color: 'var(--text)', fontSize: small ? 13 : 14 }}>{name}</span>
      <span style={{ color: 'var(--text-muted)', fontSize: 11 }}><ClientDate iso={createdAt} /></span>
      {editedAt && <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>(edited)</span>}
      <span className="ml-auto flex gap-2">
        {!hidePin && (
          <button onClick={onPin} className="text-xs" style={{ color: pinned ? 'var(--brand-accent, #b8860b)' : 'var(--text-muted)' }}>
            {pinned ? 'Unpin' : 'Pin'}
          </button>
        )}
        {canManage && <button onClick={onEdit} className="text-xs" style={{ color: 'var(--text-muted)' }}>Edit</button>}
        {canManage && <button onClick={onDelete} className="text-xs" style={{ color: '#dc2626' }}>Delete</button>}
      </span>
    </div>
  )
}

function EditBox({ value, onChange, onSave, onCancel }: {
  value: string; onChange: (v: string) => void; onSave: () => void; onCancel: () => void
}) {
  return (
    <div className="mt-1">
      <textarea value={value} onChange={e => onChange(e.target.value)} rows={3}
        className="w-full rounded border px-3 py-2 text-sm"
        style={{ background: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text)', resize: 'vertical' }} />
      <div className="flex justify-end gap-2 mt-1">
        <button onClick={onCancel} className="px-3 py-1 rounded text-xs" style={{ color: 'var(--text-muted)' }}>Cancel</button>
        <button onClick={onSave} disabled={!value.trim()} className="px-3 py-1 rounded text-xs font-medium"
          style={{ background: 'var(--brand-accent, #b8860b)', color: '#1a2744', opacity: value.trim() ? 1 : 0.5 }}>Save</button>
      </div>
    </div>
  )
}

function MentionMenu({ matches, idx, onPick }: {
  matches: TeamMember[]; idx: number; onPick: (name: string) => void
}) {
  return (
    <div className="absolute z-10 mt-1 rounded border shadow-lg"
      style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)', minWidth: 180 }}>
      {matches.map((m, i) => (
        <button key={m.id} onClick={() => onPick(m.name)} className="block w-full text-left px-3 py-1.5 text-sm"
          style={{ background: i === idx ? 'rgba(217,158,43,0.15)' : 'transparent', color: 'var(--text)' }}>
          @{m.name}
        </button>
      ))}
    </div>
  )
}
