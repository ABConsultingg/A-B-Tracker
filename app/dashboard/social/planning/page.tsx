'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

const CLIENTS = [
  'Richards Building Supply', 'Culture Construction', 'KBC Exteriors', 'KBC Restoration',
  'MVP Chiropractic', 'Midwest Construction Experts', 'Apollo Supply', 'Midway Windows',
  'Affiliated Control Equipment', 'NICO Roofing', 'A&B Consulting Group', 'APEK Inc.',
  'RG General Roofing',
]

const PILLARS = ['Story', 'Value', 'Culture', 'Fans', 'Current Events', 'Support', 'Goals']

// Internal production workflow stages
const STAGES = [
  { key: 'Draft',        label: 'Draft',          owner: 'Emily',   color: '#78716C', bg: '#F5F5F4' },
  { key: 'Copy Review',  label: 'Copy Review',     owner: 'Tanya',   color: '#854F0B', bg: '#FAEEDA' },
  { key: 'Design',       label: 'Design',          owner: 'Majo',    color: '#5B21B6', bg: '#F0EDFB' },
  { key: 'Ready',        label: 'Ready',           owner: 'Emily',   color: '#185FA5', bg: '#EDF4FB' },
  { key: 'In Sprout',    label: 'In Sprout',       owner: 'Emily',   color: '#047857', bg: '#EAF3DE' },
  { key: 'Published',    label: 'Published',       owner: '—',       color: '#1C1917', bg: '#F5F5F4' },
]

type Slot = {
  id?: string
  slot_num: number
  content_type: 'Post' | 'Video' | 'Re-Post'
  pillar: string
  topic: string
  caption_text: string
  hashtags: string
  design_brief: string
  stage: string
  scheduled_date: string
  assignee: string
  notes: string
  caption_id?: string
}

type Caption = { id: string; topic: string; caption_text: string; pillar: string; hashtags: string }

const DEFAULT_SLOT = (num: number, type: 'Post' | 'Video' | 'Re-Post'): Slot => ({
  slot_num: num,
  content_type: type,
  pillar: type === 'Re-Post' ? 'Value' : 'Story',
  topic: '',
  caption_text: '',
  hashtags: '',
  design_brief: '',
  stage: 'Draft',
  scheduled_date: '',
  assignee: 'Emily',
  notes: '',
})

export default function PlanningBoardPage() {
  const now = new Date()
  const currentMonth = (now.getMonth() + 1) % 12
  const currentYear = now.getFullYear()

  const [selectedClient, setSelectedClient] = useState(CLIENTS[0])
  const [selectedMonth, setSelectedMonth] = useState(currentMonth)
  const [selectedYear] = useState(currentYear)
  const [postSlots, setPostSlots] = useState<Slot[]>([1,2,3,4,5,6].map(n => DEFAULT_SLOT(n, 'Post')))
  const [videoSlots, setVideoSlots] = useState<Slot[]>([7,8,9,10].map(n => DEFAULT_SLOT(n, 'Video')))
  const [repostSlots, setRepostSlots] = useState<Slot[]>([11,12].map(n => DEFAULT_SLOT(n, 'Re-Post')))
  const [captions, setCaptions] = useState<Caption[]>([])
  const [loading, setLoading] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null) // 'type-index'
  const [saving, setSaving] = useState(false)

  const months3 = [-2, -1, 0].map(offset => {
    const m = (currentMonth + offset + 12) % 12
    return { label: MONTH_LABELS[m], value: m }
  })

  const monthStr = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-01`

  useEffect(() => { loadPlan() }, [selectedClient, selectedMonth, selectedYear])
  useEffect(() => { loadCaptions() }, [selectedClient])

  async function loadPlan() {
    setLoading(true)
    const { data } = await supabase
      .from('social_monthly_mix')
      .select('*')
      .eq('client_name', selectedClient)
      .eq('month', monthStr)
      .order('slot', { ascending: true })

    if (data && data.length > 0) {
      const posts = data.filter((d: any) => d.content_type === 'Post')
      const videos = data.filter((d: any) => d.content_type === 'Video')
      const reposts = data.filter((d: any) => d.content_type === 'Re-Post')
      if (posts.length) setPostSlots(posts.map((d: any) => dbToSlot(d)))
      if (videos.length) setVideoSlots(videos.map((d: any) => dbToSlot(d)))
      if (reposts.length) setRepostSlots(reposts.map((d: any) => dbToSlot(d)))
    } else {
      setPostSlots([1,2,3,4,5,6].map(n => DEFAULT_SLOT(n, 'Post')))
      setVideoSlots([7,8,9,10].map(n => DEFAULT_SLOT(n, 'Video')))
      setRepostSlots([11,12].map(n => DEFAULT_SLOT(n, 'Re-Post')))
    }
    setLoading(false)
  }

  function dbToSlot(d: any): Slot {
    return {
      id: d.id,
      slot_num: d.slot,
      content_type: d.content_type,
      pillar: d.pillar ?? 'Value',
      topic: d.topic ?? '',
      caption_text: d.caption_text ?? '',
      hashtags: d.hashtags ?? '',
      design_brief: d.design_brief ?? '',
      stage: d.status ?? 'Draft',
      scheduled_date: d.scheduled_date ?? '',
      assignee: d.assignee ?? 'Emily',
      notes: d.notes ?? '',
      caption_id: d.caption_id,
    }
  }

  async function loadCaptions() {
    const { data } = await supabase
      .from('social_captions')
      .select('id, topic, caption_text, pillar, hashtags')
      .eq('client_name', selectedClient)
      .order('post_date', { ascending: false })
      .limit(100)
    setCaptions((data ?? []) as Caption[])
  }

  function allSlots() { return [...postSlots, ...videoSlots, ...repostSlots] }

  function updateSlot(type: string, idx: number, updates: Partial<Slot>) {
    if (type === 'Post') setPostSlots(prev => prev.map((s, i) => i === idx ? { ...s, ...updates } : s))
    if (type === 'Video') setVideoSlots(prev => prev.map((s, i) => i === idx ? { ...s, ...updates } : s))
    if (type === 'Re-Post') setRepostSlots(prev => prev.map((s, i) => i === idx ? { ...s, ...updates } : s))
  }

  function addSlot(type: 'Post' | 'Video' | 'Re-Post') {
    const allNums = allSlots().map(s => s.slot_num)
    const nextNum = Math.max(...allNums, 0) + 1
    const newSlot = DEFAULT_SLOT(nextNum, type)
    if (type === 'Post') setPostSlots(prev => [...prev, newSlot])
    if (type === 'Video') setVideoSlots(prev => [...prev, newSlot])
    if (type === 'Re-Post') setRepostSlots(prev => [...prev, newSlot])
  }

  function removeSlot(type: string, idx: number) {
    if (type === 'Post') setPostSlots(prev => prev.filter((_, i) => i !== idx))
    if (type === 'Video') setVideoSlots(prev => prev.filter((_, i) => i !== idx))
    if (type === 'Re-Post') setRepostSlots(prev => prev.filter((_, i) => i !== idx))
  }

  async function saveSlot(slot: Slot) {
    setSaving(true)
    const row = {
      client_name: selectedClient,
      month: monthStr,
      slot: slot.slot_num,
      pillar: slot.pillar,
      post_type: slot.content_type,
      content_type: slot.content_type,
      topic: slot.topic,
      caption_text: slot.caption_text || null,
      hashtags: slot.hashtags || null,
      design_brief: slot.design_brief || null,
      status: slot.stage,
      scheduled_date: slot.scheduled_date || null,
      assignee: slot.assignee || null,
      notes: slot.notes || null,
      caption_id: slot.caption_id || null,
    }
    if (slot.id) {
      await supabase.from('social_monthly_mix').update(row).eq('id', slot.id)
    } else {
      const { data } = await supabase.from('social_monthly_mix').insert(row).select().single()
      if (data) {
        const id = (data as any).id
        if (slot.content_type === 'Post') setPostSlots(prev => prev.map(s => s.slot_num === slot.slot_num ? { ...s, id } : s))
        if (slot.content_type === 'Video') setVideoSlots(prev => prev.map(s => s.slot_num === slot.slot_num ? { ...s, id } : s))
        if (slot.content_type === 'Re-Post') setRepostSlots(prev => prev.map(s => s.slot_num === slot.slot_num ? { ...s, id } : s))
      }
    }
    setSaving(false)
    setEditingId(null)
  }

  function linkCaption(type: string, idx: number, captionId: string) {
    const cap = captions.find(c => c.id === captionId)
    if (!cap) return
    updateSlot(type, idx, {
      caption_id: captionId,
      caption_text: cap.caption_text,
      hashtags: cap.hashtags,
      pillar: cap.pillar || (type === 'Re-Post' ? 'Value' : 'Story'),
    })
  }

  const stageMap = Object.fromEntries(STAGES.map(s => [s.key, s]))
  const totalSlots = allSlots().length
  const publishedCount = allSlots().filter(s => s.stage === 'Published').length
  const inSproutCount = allSlots().filter(s => s.stage === 'In Sprout').length
  const readyCount = allSlots().filter(s => s.stage === 'Ready').length

  const ink = '#1C1917', muted = '#78716C', rule = '#E7E5E4'

  function SlotCard({ slot, type, idx }: { slot: Slot; type: string; idx: number }) {
    const editKey = `${type}-${idx}`
    const isEditing = editingId === editKey
    const stage = stageMap[slot.stage] ?? STAGES[0]
    const linkedCap = captions.find(c => c.id === slot.caption_id)

    return (
      <div style={{ background: 'white', border: `1px solid ${rule}`, borderRadius: 8, marginBottom: 8, overflow: 'hidden' }}>
        {/* Stage indicator bar */}
        <div style={{ height: 3, background: stage.color, opacity: 0.6 }} />

        <div style={{ padding: '12px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontFamily: 'monospace', fontSize: 11, color: muted }}>{String(slot.slot_num).padStart(2,'0')}</span>
              <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 6px', borderRadius: 99, background: stage.bg, color: stage.color }}>
                {slot.stage}
              </span>
              <span style={{ fontSize: 11, color: muted }}>{stage.owner}</span>
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              <button onClick={() => setEditingId(isEditing ? null : editKey)}
                style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, border: `1px solid ${rule}`, background: 'white', cursor: 'pointer', color: muted }}>
                {isEditing ? 'Close' : 'Edit'}
              </button>
              <button onClick={() => removeSlot(type, idx)}
                style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, border: `1px solid ${rule}`, background: 'white', cursor: 'pointer', color: '#b91c1c' }}>
                ✕
              </button>
            </div>
          </div>

          {!isEditing ? (
            <div onClick={() => setEditingId(editKey)} style={{ cursor: 'pointer' }}>
              <div style={{ display: 'flex', gap: 4, marginBottom: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 99, background: '#F5F5F4', color: muted }}>{slot.pillar}</span>
                {slot.scheduled_date && <span style={{ fontSize: 10, color: muted }}>{new Date(slot.scheduled_date).toLocaleDateString()}</span>}
              </div>
              <p style={{ fontSize: 13, margin: '0 0 4px', color: slot.topic ? ink : muted, lineHeight: 1.4 }}>
                {slot.topic || 'Click to add topic…'}
              </p>
              {slot.caption_text && (
                <p style={{ fontSize: 12, margin: 0, color: muted, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any }}>
                  {slot.caption_text}
                </p>
              )}
              {linkedCap && !slot.caption_text && (
                <span style={{ fontSize: 11, color: '#185FA5' }}>📎 {linkedCap.topic || 'Caption linked'}</span>
              )}
            </div>
          ) : (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                <div>
                  <label style={{ fontSize: 10, color: muted, fontWeight: 600, textTransform: 'uppercase' }}>Pillar</label>
                  <select value={slot.pillar} onChange={e => updateSlot(type, idx, { pillar: e.target.value })}
                    style={{ width: '100%', marginTop: 3, padding: '5px 7px', borderRadius: 5, border: `1px solid ${rule}`, fontSize: 12 }}>
                    {PILLARS.map(p => <option key={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 10, color: muted, fontWeight: 600, textTransform: 'uppercase' }}>Stage</label>
                  <select value={slot.stage} onChange={e => updateSlot(type, idx, { stage: e.target.value })}
                    style={{ width: '100%', marginTop: 3, padding: '5px 7px', borderRadius: 5, border: `1px solid ${rule}`, fontSize: 12 }}>
                    {STAGES.map(s => <option key={s.key}>{s.key}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: 8 }}>
                <label style={{ fontSize: 10, color: muted, fontWeight: 600, textTransform: 'uppercase' }}>Topic</label>
                <input value={slot.topic} onChange={e => updateSlot(type, idx, { topic: e.target.value })}
                  placeholder="What is this post about?"
                  style={{ width: '100%', marginTop: 3, padding: '6px 8px', borderRadius: 5, border: `1px solid ${rule}`, fontSize: 13, boxSizing: 'border-box' }} />
              </div>

              <div style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ fontSize: 10, color: muted, fontWeight: 600, textTransform: 'uppercase' }}>Caption</label>
                  <select style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, border: `1px solid ${rule}` }}
                    value={slot.caption_id ?? ''}
                    onChange={e => e.target.value ? linkCaption(type, idx, e.target.value) : updateSlot(type, idx, { caption_id: undefined })}>
                    <option value="">— Link from library —</option>
                    {captions.map(c => <option key={c.id} value={c.id}>{c.topic || c.caption_text.slice(0, 50)}</option>)}
                  </select>
                </div>
                <textarea value={slot.caption_text} onChange={e => updateSlot(type, idx, { caption_text: e.target.value })}
                  placeholder="Caption text (or link from library above)…" rows={3}
                  style={{ width: '100%', marginTop: 4, padding: '6px 8px', borderRadius: 5, border: `1px solid ${rule}`, fontSize: 12, resize: 'vertical', boxSizing: 'border-box' }} />
              </div>

              <div style={{ marginBottom: 8 }}>
                <label style={{ fontSize: 10, color: muted, fontWeight: 600, textTransform: 'uppercase' }}>Hashtags</label>
                <input value={slot.hashtags} onChange={e => updateSlot(type, idx, { hashtags: e.target.value })}
                  placeholder="#tag1 #tag2"
                  style={{ width: '100%', marginTop: 3, padding: '6px 8px', borderRadius: 5, border: `1px solid ${rule}`, fontSize: 12, boxSizing: 'border-box' }} />
              </div>

              <div style={{ marginBottom: 8 }}>
                <label style={{ fontSize: 10, color: muted, fontWeight: 600, textTransform: 'uppercase' }}>Design brief (for Majo/Luciana)</label>
                <textarea value={slot.design_brief} onChange={e => updateSlot(type, idx, { design_brief: e.target.value })}
                  placeholder="Image or video direction…" rows={2}
                  style={{ width: '100%', marginTop: 3, padding: '6px 8px', borderRadius: 5, border: `1px solid ${rule}`, fontSize: 12, resize: 'vertical', boxSizing: 'border-box' }} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                <div>
                  <label style={{ fontSize: 10, color: muted, fontWeight: 600, textTransform: 'uppercase' }}>Scheduled date</label>
                  <input type="date" value={slot.scheduled_date} onChange={e => updateSlot(type, idx, { scheduled_date: e.target.value })}
                    style={{ width: '100%', marginTop: 3, padding: '5px 7px', borderRadius: 5, border: `1px solid ${rule}`, fontSize: 12 }} />
                </div>
                <div>
                  <label style={{ fontSize: 10, color: muted, fontWeight: 600, textTransform: 'uppercase' }}>Assignee</label>
                  <select value={slot.assignee} onChange={e => updateSlot(type, idx, { assignee: e.target.value })}
                    style={{ width: '100%', marginTop: 3, padding: '5px 7px', borderRadius: 5, border: `1px solid ${rule}`, fontSize: 12 }}>
                    {['Emily', 'Majo', 'Luciana', 'Tanya', 'Adrian'].map(n => <option key={n}>{n}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => saveSlot(slot)} disabled={saving}
                  style={{ padding: '6px 14px', borderRadius: 5, border: 'none', background: ink, color: 'white', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button onClick={() => setEditingId(null)}
                  style={{ padding: '6px 12px', borderRadius: 5, border: `1px solid ${rule}`, background: 'white', fontSize: 12, cursor: 'pointer' }}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  function Column({ title, emoji, slots, type }: { title: string; emoji: string; slots: Slot[]; type: 'Post' | 'Video' | 'Re-Post' }) {
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, color: muted }}>
            {emoji} {slots.length} {title}
          </div>
          <button onClick={() => addSlot(type)}
            style={{ fontSize: 11, padding: '3px 8px', borderRadius: 5, border: `1px solid ${rule}`, background: 'white', cursor: 'pointer', color: muted }}>
            + Add
          </button>
        </div>
        {slots.map((s, i) => <SlotCard key={`${type}-${i}`} slot={s} type={type} idx={i} />)}
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#FAFAF9', color: ink, fontFamily: "'Inter', system-ui, sans-serif" }}>
      <header style={{ borderBottom: `1px solid ${rule}` }}>
        <div style={{ maxWidth: 1300, margin: '0 auto', padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Link href="/dashboard/social" style={{ color: muted, textDecoration: 'none', fontSize: 13 }}>← Social Hub</Link>
            <span style={{ color: rule }}>/</span>
            <div>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, color: muted }}>Content</div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>Planning Board</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <select value={selectedClient} onChange={e => setSelectedClient(e.target.value)}
              style={{ padding: '7px 10px', borderRadius: 6, border: `1px solid ${rule}`, fontSize: 13, background: 'white', fontWeight: 500 }}>
              {CLIENTS.map(c => <option key={c}>{c}</option>)}
            </select>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: 4, borderRadius: 8, background: '#F5F5F4' }}>
              {months3.map(m => (
                <button key={m.value} onClick={() => setSelectedMonth(m.value)} style={{
                  padding: '6px 12px', fontSize: 13, fontWeight: 500, borderRadius: 6, border: 'none', cursor: 'pointer',
                  background: m.value === selectedMonth ? '#1C1917' : 'transparent',
                  color: m.value === selectedMonth ? '#FAFAF9' : ink,
                }}>{m.label}</button>
              ))}
            </div>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 1300, margin: '0 auto', padding: '24px 24px' }}>

        {/* Workflow legend */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: muted, fontWeight: 600, marginRight: 4 }}>Workflow:</span>
          {STAGES.map((s, i) => (
            <span key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: s.bg, color: s.color, fontWeight: 500 }}>{s.label}</span>
              <span style={{ fontSize: 10, color: muted }}>{s.owner}</span>
              {i < STAGES.length - 1 && <span style={{ color: rule, fontSize: 12 }}>→</span>}
            </span>
          ))}
        </div>

        {/* KPI row */}
        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 1, background: '#D6D3D1', border: `1px solid ${rule}`, borderRadius: 8, overflow: 'hidden', marginBottom: 24 }}>
          {[
            { label: 'Total slots', value: totalSlots.toString() },
            { label: 'Published', value: publishedCount.toString(), color: '#1C1917' },
            { label: 'In Sprout', value: inSproutCount.toString(), color: '#047857' },
            { label: 'Ready', value: readyCount.toString(), color: '#185FA5' },
            { label: 'Remaining', value: String(totalSlots - publishedCount - inSproutCount), color: totalSlots - publishedCount - inSproutCount > 8 ? '#b91c1c' : '#B45309' },
          ].map((k, i) => (
            <div key={i} style={{ background: 'white', padding: '14px 18px' }}>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, color: muted }}>{k.label}</div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 24, fontWeight: 600, marginTop: 6, color: k.color ?? ink }}>{k.value}</div>
            </div>
          ))}
        </section>

        {loading ? (
          <div style={{ padding: 32, textAlign: 'center', color: muted }}>Loading…</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20 }}>
            <Column title="Posts" emoji="📸" slots={postSlots} type="Post" />
            <Column title="Videos" emoji="🎥" slots={videoSlots} type="Video" />
            <Column title="Re-Posts" emoji="🔗" slots={repostSlots} type="Re-Post" />
          </div>
        )}
      </main>
    </div>
  )
}
