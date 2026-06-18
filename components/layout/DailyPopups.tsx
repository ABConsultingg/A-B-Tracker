'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

type MorningData = {
  type: 'morning'; date: string; member: string
  overdueApproved: { id: string; title: string; client: string; due: string; owner: string; stage: string }[]
  dueToday: { id: string; title: string; client: string; due: string; owner: string; stage: string }[]
  tasksDue: { id: string; title: string; due: string; woTitle: string; client: string }[]
}
type EodData = {
  type: 'eod'; date: string; member: string
  stageChanges: { woTitle: string; client: string; toStage: string; at: string }[]
  doneTasks: { title: string; woTitle: string; client: string }[]
}
type PopupData = MorningData | EodData | null

function stageLabel(s: string) {
  const map: Record<string, string> = {
    'deliverables-completed': 'Deliverables Completed', 'deliverables-executed': 'Deliverables Executed',
    'sent-for-approval': 'Sent for Approval', 'approved': 'Approved', 'invoiced': 'Invoiced', 'paid': 'Paid',
  }
  return map[s] || s
}

function getKey(type: string, date: string) { return `ab-popup-${type}-${date}` }

export default function DailyPopups() {
  const [popup, setPopup] = useState<PopupData>(null)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const fetchAndShow = useCallback(async (type: 'morning' | 'eod', isManual = false) => {
    const today = new Date().toISOString().slice(0, 10)
    if (!isManual && localStorage.getItem(getKey(type, today))) return
    try {
      const res = await fetch(`/api/daily-summary?type=${type}`)
      const data = await res.json()
      if (data.error) return
      if (type === 'morning' && !isManual) {
        const d = data as MorningData
        if (!d.overdueApproved.length && !d.dueToday.length && !d.tasksDue.length) return
      }
      setNote('')
      setSaved(false)
      setPopup(data)
    } catch {}
  }, [])

  const dismiss = useCallback(async () => {
    if (!popup) return
    // Save note if present
    if (note.trim()) {
      setSaving(true)
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          const { data: member } = await supabase
            .from('team_members').select('id').eq('auth_user_id', user.id).maybeSingle()
          if (member) {
            await supabase.from('daily_standup_notes').upsert({
              member_id: member.id,
              date: popup.date,
              type: popup.type,
              note: note.trim(),
              updated_at: new Date().toISOString(),
            }, { onConflict: 'member_id,date,type' })
          }
        }
      } catch {}
      setSaving(false)
    }
    localStorage.setItem(getKey(popup.type, popup.date), '1')
    setPopup(null)
  }, [popup, note])

  useEffect(() => {
    const check = () => {
      const now = new Date(); const h = now.getHours(); const m = now.getMinutes()
      const today = now.toISOString().slice(0, 10)
      if (h === 9 && m < 5 && !localStorage.getItem(getKey('morning', today))) fetchAndShow('morning')
      if (h === 17 && m >= 30 && m < 35 && !localStorage.getItem(getKey('eod', today))) fetchAndShow('eod')
    }
    check()
    const interval = setInterval(check, 60_000)
    return () => clearInterval(interval)
  }, [fetchAndShow])

  useEffect(() => {
    const handler = (e: Event) => fetchAndShow((e as CustomEvent).detail as 'morning' | 'eod', true)
    window.addEventListener('open-daily-popup', handler)
    return () => window.removeEventListener('open-daily-popup', handler)
  }, [fetchAndShow])

  if (!popup) return null
  const isMorning = popup.type === 'morning'
  const m = popup as MorningData
  const e = popup as EodData

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'var(--bg-elevated, #fff)', borderRadius: 16, padding: 28, width: '100%', maxWidth: 580, maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.25)', border: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--brand-navy, #1a2744)' }}>{isMorning ? '☀️ Morning Standup' : '🌙 End of Day'}</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
              {isMorning ? `Good morning, ${popup.member}!` : `Great work today, ${popup.member}!`} · {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </div>
          </div>
          <button onClick={dismiss} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, color: 'var(--text-muted)', padding: '4px 8px', lineHeight: 1 }}>×</button>
        </div>

        {isMorning ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {m.overdueApproved.length > 0 && <Section title={`🚨 Overdue — Needs Action (${m.overdueApproved.length})`} color="#ef4444">
              {m.overdueApproved.map((w, i) => <WoRow key={i} title={w.title} client={w.client} sub={`Due: ${w.due} · Owner: ${w.owner}`} urgent />)}
            </Section>}
            {m.dueToday.length > 0 && <Section title={`📅 Due Today (${m.dueToday.length})`} color="#f59e0b">
              {m.dueToday.map((w, i) => <WoRow key={i} title={w.title} client={w.client} sub={`Stage: ${w.stage} · Owner: ${w.owner}`} />)}
            </Section>}
            {m.tasksDue.length > 0 && <Section title={`✅ Tasks Due (${m.tasksDue.length})`} color="#8b5cf6">
              {m.tasksDue.map((t, i) => <WoRow key={i} title={t.title} client={t.client} sub={`WO: ${t.woTitle} · Due: ${t.due}`} />)}
            </Section>}
            {!m.overdueApproved.length && !m.dueToday.length && !m.tasksDue.length && (
              <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)' }}>🎉 Nothing overdue or due today!</div>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {e.stageChanges.length > 0 && <Section title={`📦 WOs Advanced Today (${e.stageChanges.length})`} color="#10b981">
              {e.stageChanges.map((h, i) => <WoRow key={i} title={h.woTitle} client={h.client} sub={`→ ${stageLabel(h.toStage)} · ${new Date(h.at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`} />)}
            </Section>}
            {e.doneTasks.length > 0 && <Section title={`✅ Tasks Completed (${e.doneTasks.length})`} color="#3b82f6">
              {e.doneTasks.map((t, i) => <WoRow key={i} title={t.title} client={t.client} sub={`WO: ${t.woTitle}`} />)}
            </Section>}
            {!e.stageChanges.length && !e.doneTasks.length && (
              <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)' }}>No completions recorded today yet.</div>
            )}
          </div>
        )}

        {/* Daily note input */}
        <div style={{ marginTop: 20 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>
            {isMorning ? '📝 What are you working on today?' : '📝 Any notes or blockers to share?'}
          </label>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder={isMorning ? 'e.g. Finishing the Culture Construction deliverables, then working on RBS GMB updates...' : 'e.g. Completed 3 WOs, waiting on client feedback for Apollo...'}
            rows={3}
            style={{
              width: '100%', fontSize: 13, padding: '10px 12px', border: '1px solid var(--border)',
              borderRadius: 10, background: 'var(--bg)', color: 'var(--text)',
              resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box',
              outline: 'none', lineHeight: 1.5,
            }}
          />
        </div>

        <button
          onClick={dismiss}
          disabled={saving}
          style={{ marginTop: 12, width: '100%', padding: '12px 0', background: 'var(--brand-navy, #1a2744)', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 600, fontSize: 14, cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1 }}
        >
          {saving ? 'Saving...' : note.trim() ? 'Submit & Got it 👍' : 'Got it 👍'}
        </button>
      </div>
    </div>
  )
}

function Section({ title, color, children }: { title: string; color: string; children: React.ReactNode }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ padding: '8px 14px', background: color + '18', borderBottom: '1px solid var(--border)', fontSize: 12, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{title}</div>
      <div>{children}</div>
    </div>
  )
}

function WoRow({ title, client, sub, urgent }: { title: string; client: string; sub: string; urgent?: boolean }) {
  return (
    <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: urgent ? '#ef4444' : 'var(--brand-navy, #1a2744)' }}>
        {title}{client && <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}> · {client}</span>}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{sub}</div>
    </div>
  )
}
