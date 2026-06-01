'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { DeliverablePreview } from '@/lib/deliverablePreview'

type WO = { id: string; title: string; stage: string; deliverables_link: string | null;
  services?: { name?: string } | null }

export default function PortalApprovalModal({
  wo, currentUserId, onClose, onDone,
}: { wo: WO; currentUserId: string; onClose: () => void; onDone: () => void }) {
  const supabase = createClient()
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [links, setLinks] = useState<{ id: string; label: string | null; url: string }[]>([])

  useEffect(() => {
    let active = true
    supabase.from('wo_links')
      .select('id, label, url')
      .eq('work_order_id', wo.id)
      .order('sort_order', { ascending: true })
      .then(({ data }) => { if (active && data) setLinks(data as any) })
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wo.id])

  async function transition(toStage: 'approved' | 'revisions-received') {
    if (toStage === 'revisions-received' && feedback.trim().length < 3) {
      alert('Please describe what you’d like changed before requesting revisions.')
      return
    }
    setBusy(true)

    // 1) Move the work order (RLS only permits sent-for-approval -> approved|revisions-received).
    const { error: upErr } = await supabase
      .from('work_orders').update({ stage: toStage }).eq('id', wo.id)
    if (upErr) { setBusy(false); alert('Could not update: ' + upErr.message); return }

    // 2) Post a client-visible comment capturing the decision / feedback.
    const body = toStage === 'approved'
      ? (feedback.trim() ? `✓ Approved. ${feedback.trim()}` : '✓ Approved.')
      : `✎ Revisions requested: ${feedback.trim()}`
    const { error: cErr } = await supabase.from('wo_comments').insert({
      work_order_id: wo.id,
      body,
      author_id: currentUserId,
      author_type: 'client',
      internal_only: false,
    })
    setBusy(false)
    if (cErr) { alert('Stage updated, but the note failed to post: ' + cErr.message) }
    onDone()
  }

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,27,52,0.55)', display: 'flex',
               alignItems: 'center', justifyContent: 'center', padding: 24, zIndex: 100 }}>
      <div style={{ background: '#fafaf7', borderRadius: 16, width: '100%', maxWidth: 560,
                    maxHeight: '92vh', overflowY: 'auto' }}>
        <div style={{ padding: '22px 26px 16px', borderBottom: '1px solid #e8e6dd' }}>
          <div style={{ fontSize: 11, color: '#ea580c', textTransform: 'uppercase', letterSpacing: '0.12em',
                        fontWeight: 700, marginBottom: 6 }}>Awaiting your approval</div>
          <div style={{ fontFamily: 'Georgia, serif', fontSize: 22, color: '#0f1b34' }}>{wo.title}</div>
          <div style={{ fontSize: 13, color: '#6b6a63', marginTop: 4 }}>{wo.services?.name || 'Project'}</div>
        </div>
        <div style={{ padding: '22px 26px' }}>
          {wo.deliverables_link && (
            <div style={{ marginBottom: 18 }}>
              <DeliverablePreview link={wo.deliverables_link} label="Primary deliverable" />
            </div>
          )}
          {links.map(l => (
            <div key={l.id} style={{ marginBottom: 18 }}>
              {l.label && <div style={{ fontSize: 12, color: '#6b6a63', fontWeight: 600, marginBottom: 6 }}>{l.label}</div>}
              <DeliverablePreview link={l.url} label={l.label || 'Deliverable'} />
            </div>
          ))}
          {!wo.deliverables_link && links.length === 0 && (
            <div style={{ background: '#f5f5f0', border: '2px dashed #d5d2c5', borderRadius: 10,
                          padding: '24px', textAlign: 'center', marginBottom: 20 }}>
              <span style={{ color: '#a3a097', fontSize: 13 }}>
                No file link yet — your team will add it shortly.
              </span>
            </div>
          )}
          <label style={{ fontSize: 12, color: '#6b6a63', display: 'block', marginBottom: 6 }}>
            Feedback (required if requesting revisions)
          </label>
          <textarea value={feedback} onChange={e => setFeedback(e.target.value)}
            placeholder="Anything you want changed? Leave blank if approving as-is."
            style={{ width: '100%', border: '1px solid #e8e6dd', borderRadius: 8, padding: '12px 14px',
                     fontFamily: 'inherit', fontSize: 14, minHeight: 80, resize: 'vertical' }} />
        </div>
        <div style={{ padding: '18px 26px', borderTop: '1px solid #e8e6dd', display: 'flex',
                      gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} disabled={busy}
            style={{ padding: '11px 20px', borderRadius: 8, border: '1px solid #d5d2c5',
                     background: 'white', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
          <button onClick={() => transition('revisions-received')} disabled={busy}
            style={{ padding: '11px 20px', borderRadius: 8, border: '1.5px solid #ea580c',
                     background: 'white', color: '#ea580c', fontWeight: 600, cursor: 'pointer' }}>
            Request revisions
          </button>
          <button onClick={() => transition('approved')} disabled={busy}
            style={{ padding: '11px 20px', borderRadius: 8, border: 'none', background: '#15803d',
                     color: 'white', fontWeight: 600, cursor: 'pointer' }}>
            {busy ? '…' : 'Approve ✓'}
          </button>
        </div>
      </div>
    </div>
  )
}
