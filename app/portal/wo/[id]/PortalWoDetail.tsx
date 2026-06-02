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

// Relative-ish timestamp: "today at 6:48 PM", "yesterday at 10:45 AM", else date + time.
function relTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  const yest = new Date(now); yest.setDate(now.getDate() - 1)
  const isYest = d.toDateString() === yest.toDateString()
  const t = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  if (sameDay) return `today at ${t}`
  if (isYest) return `yesterday at ${t}`
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ` at ${t}`
}

// Render a message body as React nodes: linkify URLs + style @mentions as pills.
function renderBody(text: string, onClient: boolean): React.ReactNode[] {
  // Split on URLs first, then within non-URL chunks split on @mentions.
  const urlRe = /(https?:\/\/[^\s]+)/g
  const out: React.ReactNode[] = []
  let key = 0
  text.split(urlRe).forEach(chunk => {
    if (!chunk) return
    if (/^https?:\/\//.test(chunk)) {
      out.push(
        <a key={key++} href={chunk} target="_blank" rel="noopener noreferrer"
           style={{ color: onClient ? '#cdb87f' : '#b8851e', textDecoration: 'underline', wordBreak: 'break-all' }}>
          {chunk}
        </a>
      )
      return
    }
    // mentions within this text chunk
    const mentionRe = /(@\w+)/g
    chunk.split(mentionRe).forEach(part => {
      if (!part) return
      if (/^@\w+$/.test(part)) {
        out.push(
          <span key={key++} style={{
            background: onClient ? 'rgba(255,255,255,0.18)' : '#f3ead2',
            color: onClient ? '#fff' : '#7a5b12',
            borderRadius: 5, padding: '1px 6px', fontWeight: 600, fontSize: 13,
          }}>{part}</span>
        )
      } else {
        out.push(<span key={key++}>{part}</span>)
      }
    })
  })
  return out
}

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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '12px 0' }}>
            {comments.map(c => {
              const onClient = c.author_type === 'client'
              const initials = onClient ? 'You' : 'A&B'
              return (
                <div key={c.id} style={{ display: 'flex', flexDirection: onClient ? 'row-reverse' : 'row',
                                          alignItems: 'flex-end', gap: 8 }}>
                  {/* avatar */}
                  <div style={{ flexShrink: 0, width: 30, height: 30, borderRadius: '50%',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: onClient ? 9 : 9, fontWeight: 700,
                                background: onClient ? '#0f1b34' : '#b8851e', color: 'white' }}>
                    {initials}
                  </div>
                  {/* bubble */}
                  <div style={{ maxWidth: '78%', display: 'flex', flexDirection: 'column',
                                alignItems: onClient ? 'flex-end' : 'flex-start' }}>
                    <div style={{ fontSize: 10.5, color: '#a3a097', margin: '0 4px 3px' }}>
                      {onClient ? 'You' : 'A&B team'} · {relTime(c.created_at)}
                    </div>
                    <div style={{
                      fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                      padding: '9px 13px', borderRadius: 14,
                      borderBottomRightRadius: onClient ? 4 : 14,
                      borderBottomLeftRadius: onClient ? 14 : 4,
                      background: onClient ? '#0f1b34' : '#faf8f1',
                      color: onClient ? '#f5f3ec' : '#1c1b18',
                      border: onClient ? 'none' : '1px solid #e8e6dd',
                    }}>
                      {renderBody(c.body, onClient)}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
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
