'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { stageView } from '@/lib/portal/stages'
import { DeliverablePreview } from '@/lib/deliverablePreview'

type WO = { id: string; title: string; stage: string; due_date: string | null;
  est_cost: number; add_cost: number; deliverables_link: string | null;
  description: string | null; branch: string | null; services?: { name?: string } | null }
type Comment = { id: string; body: string; author_id: string | null; author_type: string; created_at: string }
type WoLink = { id: string; label: string | null; url: string; sort_order: number }

const money = (n: number) => '$' + (n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })

export default function PortalWoDetail({
  wo, initialComments, woLinks, currentUserId,
}: { wo: WO; initialComments: Comment[]; woLinks: WoLink[]; currentUserId: string }) {
  const router = useRouter()
  const supabase = createClient()
  const [comments, setComments] = useState<Comment[]>(initialComments)
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const sv = stageView(wo.stage)
  const cost = (wo.est_cost || 0) + (wo.add_cost || 0)
  const showCost = ['invoiced', 'paid'].includes(wo.stage) && cost > 0

  async function post() {
    const text = body.trim()
    if (!text) return
    setBusy(true)
    const { data, error } = await supabase.from('wo_comments').insert({
      work_order_id: wo.id, body: text, author_id: currentUserId,
      author_type: 'client', internal_only: false,
    }).select('id, body, author_id, author_type, created_at').single()
    setBusy(false)
    if (error || !data) { alert('Could not post: ' + (error?.message || 'unknown')); return }
    setComments(prev => [...prev, data as Comment])
    setBody('')
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px' }}>
      <button onClick={() => router.push('/portal')}
        style={{ background: 'none', border: 'none', color: '#6b6a63', cursor: 'pointer',
                 fontSize: 13, marginBottom: 16 }}>← Back to dashboard</button>

      <div style={{ background: 'white', border: '1px solid #e8e6dd', borderRadius: 12, padding: 24, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: sv.dot }} />
          <span style={{ color: sv.color, fontWeight: 600, fontSize: 13 }}>{sv.label}</span>
        </div>
        <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 26, color: '#0f1b34', marginBottom: 8 }}>{wo.title}</h1>
        <div style={{ fontSize: 13, color: '#6b6a63' }}>
          {wo.services?.name || 'Project'}
          {wo.branch ? ` · ${wo.branch}` : ''}
          {wo.due_date ? ` · due ${new Date(wo.due_date + 'T00:00:00').toLocaleDateString()}` : ''}
          {showCost ? ` · ${money(cost)}` : ''}
        </div>
        {wo.description && <p style={{ marginTop: 14, fontSize: 14, color: '#1c1b18', whiteSpace: 'pre-wrap' }}>{wo.description}</p>}
        {wo.deliverables_link && (
          <div style={{ marginTop: 14 }}>
            <DeliverablePreview link={wo.deliverables_link} label="Primary deliverable" />
          </div>
        )}
        {woLinks.map(l => (
          <div key={l.id} style={{ marginTop: 14 }}>
            {l.label && <div style={{ fontSize: 12, color: '#6b6a63', fontWeight: 600, marginBottom: 6 }}>{l.label}</div>}
            <DeliverablePreview link={l.url} label={l.label || 'Deliverable'} />
          </div>
        ))}
      </div>

      {/* Messages */}
      <div style={{ background: 'white', border: '1px solid #e8e6dd', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e8e6dd',
                      fontFamily: 'Georgia, serif', fontSize: 17, color: '#0f1b34' }}>Messages</div>
        <div style={{ padding: '8px 20px' }}>
          {comments.length === 0 && (
            <div style={{ padding: '16px 0', color: '#a3a097', fontSize: 13 }}>No messages yet.</div>
          )}
          {comments.map(c => (
            <div key={c.id} style={{ padding: '12px 0', borderTop: '1px solid #f0eee6' }}>
              <div style={{ fontSize: 11, color: '#a3a097', marginBottom: 3 }}>
                {c.author_type === 'client' ? 'You' : 'A&B team'} · {new Date(c.created_at).toLocaleString()}
              </div>
              <div style={{ fontSize: 14, color: '#1c1b18', whiteSpace: 'pre-wrap' }}>{c.body}</div>
            </div>
          ))}
        </div>
        <div style={{ padding: '12px 20px', borderTop: '1px solid #e8e6dd' }}>
          <textarea value={body} onChange={e => setBody(e.target.value)}
            onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') post() }}
            placeholder="Write a message to your team…"
            style={{ width: '100%', border: '1px solid #e8e6dd', borderRadius: 8, padding: '10px 12px',
                     fontFamily: 'inherit', fontSize: 14, minHeight: 64, resize: 'vertical' }} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <button onClick={post} disabled={busy || !body.trim()}
              style={{ background: '#0f1b34', color: 'white', border: 'none', borderRadius: 6,
                       padding: '8px 16px', fontWeight: 600, fontSize: 13, cursor: 'pointer',
                       opacity: body.trim() ? 1 : 0.5 }}>
              {busy ? 'Sending…' : 'Send'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
