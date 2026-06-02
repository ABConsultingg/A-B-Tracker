'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Svc = { id: string; name: string; active: boolean }

function newWoId() {
  // WO- prefixed, matching existing IDs (e.g. WO-4fc7e90b)
  return 'WO-' + Math.random().toString(16).slice(2, 10)
}

export default function PortalRequestModal({
  clientId, services, onClose, onDone, isRBS,
}: { clientId: string; services: Svc[]; onClose: () => void; onDone: () => void; isRBS?: boolean }) {
  const supabase = createClient()
  const [busy, setBusy] = useState(false)
  const [serviceId, setServiceId] = useState('')
  const [title, setTitle] = useState('')
  const [branch, setBranch] = useState('')
  const [due, setDue] = useState('')
  const [description, setDescription] = useState('')
  const [notes, setNotes] = useState('')
  const [reference, setReference] = useState('')
  // RBS-specific fields (folded into WO columns / notes on submit)
  const [rbsType, setRbsType] = useState('')
  const [vendorBrand, setVendorBrand] = useState('')
  const [recipient, setRecipient] = useState('')

  const ready = serviceId && title.trim().length > 2

  async function submit() {
    if (!ready || !clientId) return
    setBusy(true)
    const payload: any = {
      id: newWoId(),
      title: title.trim(),
      client_id: clientId,
      service_id: serviceId,
      stage: 'submitted',
      occurrence: 'One-time',
      submitted_via: 'portal',
      submitted_at: new Date().toISOString(),
      branch: branch.trim() || null,
      due_date: due || null,
      description: description.trim() || null,
      notes: notes.trim() || null,
      notes_link: reference.trim() || null,
    }
    if (isRBS) {
      if (vendorBrand.trim()) payload.vendor = vendorBrand.trim()
      const extra: string[] = []
      if (rbsType.trim()) extra.push('Type: ' + rbsType.trim())
      if (recipient.trim()) extra.push('Recipient: ' + recipient.trim())
      if (extra.length) {
        payload.notes = [payload.notes, extra.join('\n')].filter(Boolean).join('\n')
      }
    }
    const { error } = await supabase.from('work_orders').insert(payload)
    setBusy(false)
    if (error) { alert('Could not submit: ' + error.message); return }
    onDone()
  }

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,27,52,0.55)', display: 'flex',
               alignItems: 'center', justifyContent: 'center', padding: 24, zIndex: 100 }}>
      <div style={{ background: '#fafaf7', borderRadius: 16, width: '100%', maxWidth: 640,
                    maxHeight: '92vh', overflowY: 'auto' }}>
        <div style={{ padding: '22px 26px 16px', borderBottom: '1px solid #e8e6dd' }}>
          <div style={{ fontSize: 11, color: '#b8851e', textTransform: 'uppercase', letterSpacing: '0.12em',
                        fontWeight: 700, marginBottom: 6 }}>New project request</div>
          <div style={{ fontFamily: 'Georgia, serif', fontSize: 22, color: '#0f1b34' }}>What can we help you with?</div>
          <div style={{ fontSize: 13, color: '#6b6a63', marginTop: 6 }}>
            Your team will confirm scope, timing, and pricing within 1 business day.
          </div>
        </div>
        <div style={{ padding: '22px 26px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Field label="What kind of project? *">
            <select value={serviceId} onChange={e => setServiceId(e.target.value)} style={inp}>
              <option value="">Select a service…</option>
              {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="Project name *">
            <input value={title} onChange={e => setTitle(e.target.value)} style={inp}
              placeholder="e.g. Spring open house flyer" />
          </Field>
          {isRBS && (
            <>
              <Field label="Order / flyer type">
                <select value={rbsType} onChange={e => setRbsType(e.target.value)} style={inp}>
                  <option value="">Select type…</option>
                  <option value="Performance Plus Order">Performance Plus Order</option>
                  <option value="Flyer Only">Flyer Only</option>
                  <option value="Event Flyer">Event Flyer</option>
                  <option value="Now Stocking">Now Stocking</option>
                  <option value="Promotion">Promotion</option>
                </select>
              </Field>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <Field label="Vendor / brand">
                  <input value={vendorBrand} onChange={e => setVendorBrand(e.target.value)} style={inp}
                    placeholder="e.g. GAF" />
                </Field>
                <Field label="Recipient name">
                  <input value={recipient} onChange={e => setRecipient(e.target.value)} style={inp}
                    placeholder="Who's it for" />
                </Field>
              </div>
            </>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Field label="Branch (optional)">
              <input value={branch} onChange={e => setBranch(e.target.value)} style={inp} placeholder="HQ or branch" />
            </Field>
            <Field label="Ideal completion date">
              <input type="date" value={due} onChange={e => setDue(e.target.value)} style={inp} />
            </Field>
          </div>
          <Field label="Tell us more">
            <textarea value={description} onChange={e => setDescription(e.target.value)}
              style={{ ...inp, minHeight: 80, resize: 'vertical' }}
              placeholder="What's it for, who's the audience, key messaging, dates, references…" />
          </Field>
          <Field label="Reference link (optional)">
            <input value={reference} onChange={e => setReference(e.target.value)} style={inp}
              placeholder="Drive / Dropbox / website URL" />
          </Field>
          <Field label="Notes (optional)">
            <textarea value={notes} onChange={e => setNotes(e.target.value)}
              style={{ ...inp, minHeight: 60, resize: 'vertical' }}
              placeholder="Anything else we should know?" />
          </Field>
        </div>
        <div style={{ padding: '18px 26px', borderTop: '1px solid #e8e6dd', display: 'flex',
                      gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} disabled={busy}
            style={{ padding: '11px 20px', borderRadius: 8, border: '1px solid #d5d2c5',
                     background: 'white', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
          <button onClick={submit} disabled={busy || !ready}
            style={{ padding: '11px 20px', borderRadius: 8, border: 'none', background: '#0f1b34',
                     color: 'white', fontWeight: 600, cursor: 'pointer', opacity: ready ? 1 : 0.5 }}>
            {busy ? 'Submitting…' : 'Submit request'}
          </button>
        </div>
      </div>
    </div>
  )
}

const inp: React.CSSProperties = {
  width: '100%', border: '1px solid #e8e6dd', borderRadius: 6, padding: '9px 12px',
  fontFamily: 'inherit', fontSize: 13.5, background: 'white',
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: '#0f1b34', marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  )
}
