#!/bin/bash
set -e
cd ~/ab-tracker

echo "→ Adding Comments to BoardClient detail panel..."

python3 << 'PYEOF'
path = 'components/work-orders/BoardClient.tsx'
with open(path) as f:
    c = f.read()

# 1. Add Comment type after StageHistoryEntry
old_type = """type StageHistoryEntry = {
  id: string
  from_stage: string
  to_stage: string
  changed_at: string
  changed_by?: string
}"""

new_type = """type StageHistoryEntry = {
  id: string
  from_stage: string
  to_stage: string
  changed_at: string
  changed_by?: string
}

type Comment = {
  id: string
  work_order_id: string
  author_id?: string
  body: string
  created_at: string
}"""

if old_type in c:
    c = c.replace(old_type, new_type)
    print("✅ Comment type added")

# 2. Add comments state next to stageHistory state
old_state = """  const [stageHistory, setStageHistory] = useState<StageHistoryEntry[]>([])
  const [historyOpen, setHistoryOpen] = useState(false)"""

new_state = """  const [stageHistory, setStageHistory] = useState<StageHistoryEntry[]>([])
  const [historyOpen, setHistoryOpen] = useState(false)
  const [comments, setComments] = useState<Comment[]>([])
  const [newComment, setNewComment] = useState('')
  const [postingComment, setPostingComment] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)"""

if old_state in c:
    c = c.replace(old_state, new_state)
    print("✅ Comments state added")

# 3. Add useEffect to load current user id (next to existing supabase auth call)
# Place it after the authUserMap effect
auth_effect_marker = """  useEffect(() => {
    supabase.from('team_members').select('id, name, auth_user_id').then(({ data }) => {
      if (!data) return
      const m: Record<string, string> = {}
      data.forEach((t: any) => { if (t.auth_user_id) m[t.auth_user_id] = t.name })
      setAuthUserMap(m)
    })
  }, [supabase])"""

auth_effect_new = auth_effect_marker + """

  // Get current user id for comment authorship
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setCurrentUserId(data.user?.id || null)
    })
  }, [supabase])"""

if auth_effect_marker in c and 'getUser' not in c:
    c = c.replace(auth_effect_marker, auth_effect_new)
    print("✅ getUser effect added")

# 4. Add loadComments effect next to stage history loader
old_history_effect = """  // Load stage history when a non-new WO is selected
  useEffect(() => {
    if (!selectedWo || (selectedWo as any).__new) { setStageHistory([]); return }
    const wo = selectedWo as WorkOrder
    supabase.from('wo_stage_history')
      .select('*')
      .eq('work_order_id', wo.id)
      .order('changed_at', { ascending: false })
      .limit(20)
      .then(({ data }) => setStageHistory(data || []))
  }, [selectedWo, supabase])"""

new_history_effect = old_history_effect + """

  // Load comments when a non-new WO is selected
  useEffect(() => {
    if (!selectedWo || (selectedWo as any).__new) { setComments([]); return }
    const wo = selectedWo as WorkOrder
    supabase.from('wo_comments')
      .select('*')
      .eq('work_order_id', wo.id)
      .order('created_at', { ascending: true })
      .then(({ data }) => setComments(data || []))
  }, [selectedWo, supabase])

  async function postComment() {
    if (!selectedWo || (selectedWo as any).__new) return
    const wo = selectedWo as WorkOrder
    const body = newComment.trim()
    if (!body) return
    setPostingComment(true)
    const { data, error } = await supabase.from('wo_comments')
      .insert({ work_order_id: wo.id, body, author_id: currentUserId })
      .select()
      .single()
    setPostingComment(false)
    if (error) { alert('Failed to post: ' + error.message); return }
    setComments(prev => [...prev, data as Comment])
    setNewComment('')
  }

  async function deleteComment(commentId: string) {
    if (!confirm('Delete this comment?')) return
    const { error } = await supabase.from('wo_comments').delete().eq('id', commentId)
    if (error) { alert('Failed to delete: ' + error.message); return }
    setComments(prev => prev.filter(c => c.id !== commentId))
  }"""

if old_history_effect in c and 'wo_comments' not in c.replace('wo_comments_table', ''):
    c = c.replace(old_history_effect, new_history_effect)
    print("✅ Comments effect + handlers added")

# 5. Add Comments UI section before Stage History
old_history_render = """              {/* Stage History (existing WO only) */}
              {!isNew && (
                <div className="border-t border-gray-100 pt-4">"""

new_history_render = """              {/* Comments (existing WO only) */}
              {!isNew && (
                <div className="border-t border-gray-100 pt-4">
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                    Comments ({comments.length})
                  </div>
                  <div className="space-y-3 mb-3 max-h-80 overflow-y-auto">
                    {comments.length === 0 && (
                      <div className="text-xs text-gray-400 italic">No comments yet. Add the first one below.</div>
                    )}
                    {comments.map(comment => {
                      const authorName = comment.author_id ? authUserMap[comment.author_id] : 'Someone'
                      const isOwn = comment.author_id === currentUserId
                      const initials = (authorName || '?')[0].toUpperCase()
                      return (
                        <div key={comment.id} className="flex gap-2.5">
                          <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold text-white"
                               style={{ background: '#2d4a7c' }}>
                            {initials}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline gap-2 mb-0.5">
                              <span className="text-xs font-semibold text-gray-900">{authorName || 'Someone'}</span>
                              <span className="text-[10px] text-gray-400">{new Date(comment.created_at).toLocaleString(undefined, { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                              {isOwn && (
                                <button onClick={() => deleteComment(comment.id)}
                                  className="ml-auto text-[10px] text-gray-400 hover:text-red-600">delete</button>
                              )}
                            </div>
                            <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap break-words">
                              {comment.body}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <div className="flex gap-2">
                    <textarea value={newComment}
                      onChange={e => setNewComment(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                          e.preventDefault()
                          postComment()
                        }
                      }}
                      placeholder="Add a comment... (Cmd+Enter to post)"
                      rows={2}
                      className="flex-1 text-sm px-3 py-2 border border-gray-200 rounded-lg resize-none focus:outline-none focus:border-blue-500" />
                  </div>
                  <div className="flex justify-end mt-2">
                    <button onClick={postComment}
                      disabled={postingComment || !newComment.trim()}
                      className="px-4 py-1.5 rounded-lg text-sm font-semibold text-white disabled:opacity-40 transition-opacity"
                      style={{ background: '#1a2b4a' }}>
                      {postingComment ? 'Posting...' : 'Post Comment'}
                    </button>
                  </div>
                </div>
              )}

              {/* Stage History (existing WO only) */}
              {!isNew && (
                <div className="border-t border-gray-100 pt-4">"""

if old_history_render in c:
    c = c.replace(old_history_render, new_history_render)
    print("✅ Comments UI added")

with open(path, 'w') as f:
    f.write(c)

print("\n✅ Comments feature complete!")
PYEOF

echo ""
echo "Now: cd ~/ab-tracker && npm run build && git add -A && git commit -m 'Feature: comments on each WO' && git push"
