'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Comment = {
  id: string
  work_order_id: string
  body: string
  author_id: string | null
  mentions: string[] | null
  internal_only: boolean
  created_at: string
  edited_at?: string | null
}

type TeamMember = { id: string; name: string; auth_user_id: string | null }

function ClientDate({ children }: { children: React.ReactNode }) {
  return <span suppressHydrationWarning>{children}</span>
}

export default function WoMessagesTab({
  wo,
  initialComments,
  team,
  authUserMap,
  currentUserId,
}: {
  wo: { id: string; owner_id?: string | null }
  initialComments: Comment[]
  team: TeamMember[]
  authUserMap: Record<string, string>
  currentUserId: string | null
}) {
  const supabase = createClient()
  const [comments, setComments] = useState<Comment[]>(initialComments)
  const [newComment, setNewComment] = useState('')
  const [postingComment, setPostingComment] = useState(false)
  const [mentionDropdown, setMentionDropdown] = useState<{ open: boolean; query: string; position: number }>({
    open: false,
    query: '',
    position: 0,
  })
  const [mentionIndex, setMentionIndex] = useState(0)
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null)
  const [editingCommentBody, setEditingCommentBody] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
  const [visibleToClient, setVisibleToClient] = useState(false)

  // Realtime: live INSERT/UPDATE/DELETE on this WO's comments.
  useEffect(() => {
    const channel = supabase
      .channel(`wo-comments-${wo.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'wo_comments', filter: `work_order_id=eq.${wo.id}` },
        (payload: any) => {
          if (payload.eventType === 'INSERT') {
            const row = payload.new as Comment
            setComments(prev => (prev.some(c => c.id === row.id) ? prev : [...prev, row]))
          } else if (payload.eventType === 'UPDATE') {
            const row = payload.new as Comment
            setComments(prev => prev.map(c => (c.id === row.id ? row : c)))
          } else if (payload.eventType === 'DELETE') {
            const goneId = (payload.old as { id: string }).id
            setComments(prev => prev.filter(c => c.id !== goneId))
          }
        }
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wo.id])

  function handleCommentInput(value: string, cursorPos: number) {
    setNewComment(value)
    const before = value.substring(0, cursorPos)
    const m = before.match(/(?:^|\s)@(\w*)$/)
    if (m) {
      setMentionDropdown({ open: true, query: m[1].toLowerCase(), position: cursorPos - m[1].length - 1 })
      setMentionIndex(0)
    } else {
      setMentionDropdown({ open: false, query: '', position: 0 })
    }
  }

  const mentionCandidates = useMemo(() => {
    const priorityIds = new Set<string>()
    if (wo.owner_id) priorityIds.add(wo.owner_id)
    const priority = team.filter(t => priorityIds.has(t.id))
    const others = team.filter(t => !priorityIds.has(t.id))
    return [...priority, ...others]
  }, [team, wo.owner_id])

  const mentionMatches = useMemo(() => {
    const q = mentionDropdown.query
    return mentionCandidates.filter(t => t.name.toLowerCase().includes(q)).slice(0, 6)
  }, [mentionCandidates, mentionDropdown.query])

  const currentUserName = useMemo(() => {
    const me = team.find(t => t.auth_user_id === currentUserId)
    return me?.name || 'Someone'
  }, [team, currentUserId])

  function insertMention(memberName: string) {
    const cursorPos = mentionDropdown.position + 1 + mentionDropdown.query.length
    const before = newComment.substring(0, mentionDropdown.position)
    const after = newComment.substring(cursorPos)
    const updated = before + '@' + memberName + ' ' + after
    setNewComment(updated)
    setMentionDropdown({ open: false, query: '', position: 0 })
  }

  function extractMentionedIds(body: string): string[] {
    const ids: string[] = []
    const seen = new Set<string>()
    const matches = body.match(/@(\w+)/g) || []
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

  async function postComment() {
    const body = newComment.trim()
    if (!body) return
    setPostingComment(true)
    const mentionIds = extractMentionedIds(body)
    const { data, error } = await supabase
      .from('wo_comments')
      .insert({ work_order_id: wo.id, body, author_id: currentUserId, mentions: mentionIds, internal_only: !visibleToClient })
      .select()
      .single()
    setPostingComment(false)
    if (error) {
      alert('Error posting comment: ' + error.message)
      return
    }
    setComments(prev => [...prev, data as Comment])
    setNewComment('')
    setVisibleToClient(false)
    setMentionDropdown({ open: false, query: '', position: 0 })

    // Create a notification row for each mentioned user (skip self).
    const recipients = mentionIds.filter(uid => uid !== currentUserId)
    if (recipients.length > 0) {
      const preview = body.length > 140 ? body.slice(0, 140) + '\u2026' : body
      const rows = recipients.map(uid => ({
        user_id: uid,
        source_type: 'comment',
        source_id: (data as Comment).id,
        work_order_id: wo.id,
        body_preview: preview,
        author_name: currentUserName,
        link_url: `/dashboard/wo/${wo.id}?tab=messages`,
      }))
      const { error: notifErr } = await supabase.from('wo_notifications').insert(rows)
      if (notifErr) console.error('Failed to create mention notifications:', notifErr.message)
    }
  }

  async function deleteComment(commentId: string) {
    if (!confirm('Delete this comment?')) return
    const prev = comments
    setComments(curr => curr.filter(c => c.id !== commentId))
    const { error } = await supabase.from('wo_comments').delete().eq('id', commentId)
    if (error) {
      alert('Error deleting: ' + error.message)
      setComments(prev)
    }
  }

  function startEditComment(c: { id: string; body: string }) {
    setEditingCommentId(c.id)
    setEditingCommentBody(c.body)
  }

  function cancelEditComment() {
    setEditingCommentId(null)
    setEditingCommentBody('')
  }

  async function saveCommentEdit() {
    if (!editingCommentId) return
    const body = editingCommentBody.trim()
    if (!body) return
    setSavingEdit(true)
    const { error } = await supabase
      .from('wo_comments')
      .update({ body, edited_at: new Date().toISOString() })
      .eq('id', editingCommentId)
    setSavingEdit(false)
    if (error) {
      alert('Error saving: ' + error.message)
      return
    }
    setComments(prev =>
      prev.map(c =>
        c.id === editingCommentId ? ({ ...c, body, edited_at: new Date().toISOString() } as Comment) : c
      )
    )
    setEditingCommentId(null)
    setEditingCommentBody('')
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center justify-between border-b border-gray-200 pb-2">
        <h2 className="text-lg font-semibold text-gray-900">Messages</h2>
        <span className="text-sm text-gray-500">
          {comments.length} comment{comments.length === 1 ? '' : 's'}
        </span>
      </div>

      <div className="space-y-3">
        {comments.length === 0 && (
          <div className="text-sm text-gray-500 italic py-4">
            No messages yet. Add the first one below.
          </div>
        )}
        {comments.map(comment => {
          const authorName = comment.author_id ? authUserMap[comment.author_id] : 'Someone'
          const isOwn = comment.author_id === currentUserId
          const initials = (authorName || '?')[0].toUpperCase()
          const isEditing = editingCommentId === comment.id
          const editedAt = comment.edited_at
          return (
            <div key={comment.id} className="flex gap-2.5">
              <div
                className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold text-white"
                style={{ background: '#2d4a7c' }}
              >
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 mb-0.5">
                  <span className="text-sm font-semibold text-gray-900">{authorName || 'Someone'}</span>
                  <span className="text-xs text-gray-400">
                    <ClientDate>
                      {new Date(comment.created_at).toLocaleString(undefined, {
                        month: 'numeric',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </ClientDate>
                  </span>
                  {editedAt && <span className="text-xs text-gray-400 italic">edited</span>}
                  {comment.internal_only ? (
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
                      🔒 Internal
                    </span>
                  ) : (
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">
                      👁 Client-visible
                    </span>
                  )}
                  {isOwn && !isEditing && (
                    <div className="ml-auto flex items-center gap-2">
                      <button
                        onClick={() => startEditComment(comment)}
                        className="text-xs text-gray-400 hover:text-blue-600"
                      >
                        edit
                      </button>
                      <button
                        onClick={() => deleteComment(comment.id)}
                        className="text-xs text-gray-400 hover:text-red-600"
                      >
                        delete
                      </button>
                    </div>
                  )}
                </div>
                {isEditing ? (
                  <div className="space-y-1.5">
                    <textarea
                      value={editingCommentBody}
                      onChange={e => setEditingCommentBody(e.target.value)}
                      className="w-full text-sm px-2 py-1.5 border border-gray-300 rounded focus:border-blue-500 focus:outline-none resize-y"
                      rows={3}
                      autoFocus
                    />
                    <div className="flex items-center gap-2">
                      <button
                        onClick={saveCommentEdit}
                        disabled={savingEdit}
                        className="text-xs px-2 py-1 rounded font-medium text-white disabled:opacity-50"
                        style={{ background: 'var(--brand-navy, #1a2b4a)' }}
                      >
                        {savingEdit ? 'Saving…' : 'Save'}
                      </button>
                      <button
                        onClick={cancelEditComment}
                        disabled={savingEdit}
                        className="text-xs px-2 py-1 rounded text-gray-600 hover:bg-gray-100"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap break-words">
                    {comment.body.split(/(@\w+)/g).map((part: string, idx: number) => {
                      if (part.startsWith('@')) {
                        const memberExists = team.some(
                          t => t.name.toLowerCase() === part.substring(1).toLowerCase()
                        )
                        if (memberExists) {
                          return (
                            <span
                              key={idx}
                              className="bg-blue-100 text-blue-800 rounded px-1 py-0.5 font-medium"
                            >
                              {part}
                            </span>
                          )
                        }
                      }
                      return <span key={idx}>{part}</span>
                    })}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className="pt-4 border-t border-gray-200">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <textarea
              value={newComment}
              onChange={e => handleCommentInput(e.target.value, e.target.selectionStart)}
              onKeyDown={e => {
                if (mentionDropdown.open && mentionMatches.length > 0) {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault()
                    setMentionIndex(i => (i + 1) % mentionMatches.length)
                    return
                  }
                  if (e.key === 'ArrowUp') {
                    e.preventDefault()
                    setMentionIndex(i => (i - 1 + mentionMatches.length) % mentionMatches.length)
                    return
                  }
                  if (e.key === 'Enter' || e.key === 'Tab') {
                    e.preventDefault()
                    insertMention(mentionMatches[mentionIndex].name)
                    return
                  }
                  if (e.key === 'Escape') {
                    setMentionDropdown({ open: false, query: '', position: 0 })
                    return
                  }
                }
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault()
                  postComment()
                }
              }}
              placeholder="Add a comment... use @ to mention. (Cmd+Enter to post)"
              rows={3}
              className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg resize-none focus:outline-none focus:border-blue-500"
            />
            {mentionDropdown.open && mentionMatches.length > 0 && (
              <div className="absolute bottom-full left-0 mb-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 min-w-[220px] max-h-56 overflow-y-auto">
                {mentionMatches.map((m, idx) => (
                  <button
                    key={m.id}
                    onClick={() => insertMention(m.name)}
                    onMouseEnter={() => setMentionIndex(idx)}
                    className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 ${
                      idx === mentionIndex ? 'bg-blue-50' : 'hover:bg-gray-50'
                    }`}
                  >
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white"
                      style={{ background: '#2d4a7c' }}
                    >
                      {m.name[0]}
                    </div>
                    <span className="font-medium">{m.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center justify-between mt-2">
          <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={visibleToClient}
              onChange={e => setVisibleToClient(e.target.checked)}
              className="rounded border-gray-300"
            />
            Visible to client
          </label>
          <button
            onClick={postComment}
            disabled={postingComment || !newComment.trim()}
            className="px-4 py-1.5 rounded-lg text-sm font-semibold text-white disabled:opacity-40 transition-opacity"
            style={{ background: '#1a2b4a' }}
          >
            {postingComment ? 'Posting...' : 'Post Comment'}
          </button>
        </div>
      </div>
    </div>
  )
}
