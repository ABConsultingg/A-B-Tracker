'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'

// Anon client — used only for storage, captions, sprout_posts (no RLS on those)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Fetch social_monthly_mix via service-role API route (bypasses RLS)
async function fetchPlan(client_name: string, month: string) {
  const res = await fetch(`/api/social/planning?client_name=${encodeURIComponent(client_name)}&month=${encodeURIComponent(month)}`)
  const json = await res.json()
  return json.data ?? []
}

async function savePlanRow(row: Record<string, unknown>, id?: string) {
  const res = await fetch('/api/social/planning', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'upsert', row, id }),
  })
  return res.json()
}

async function deletePlanRow(id: string) {
  await fetch('/api/social/planning', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'delete', id }),
  })
}

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
  asset_url?: string
  asset_type?: string
  asset_filename?: string
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


// ── SlotCard — defined outside main component to prevent focus loss on re-render ──
type SlotCardProps = {
  slot: Slot; type: string; idx: number;
  editingId: string | null;
  setEditingId: (id: string | null) => void;
  updateSlot: (type: string, idx: number, patch: Partial<Slot>) => void;
  removeSlot: (type: string, idx: number) => void;
  saveSlot: (slot: Slot) => void;
  linkCaption: (type: string, idx: number, captionId: string) => void;
  draftCaption: (type: string, idx: number, slot: Slot) => void;
  draftingSlot: string | null;
  captions: Caption[];
  saving: boolean;
  stageMap: Record<string, { key: string; label: string; owner: string; color: string; bg: string }>;
  confirmingDelete: string | null;
  setConfirmingDelete: (id: string | null) => void;
  uploadAsset: (type: string, idx: number, file: File) => Promise<void>;
  uploadingAsset: string | null;
}

function SlotCard({ slot, type, idx, editingId, setEditingId, updateSlot, removeSlot, saveSlot, linkCaption, draftCaption, draftingSlot, captions, saving, stageMap, confirmingDelete, setConfirmingDelete, uploadAsset, uploadingAsset }: SlotCardProps) {
  const editKey = `${type}-${idx}`
  const isEditing = editingId === editKey
  const stage = stageMap[slot.stage] ?? STAGES[0]
  const linkedCap = captions.find(c => c.id === slot.caption_id)
  const ink = '#1C1917', muted = '#78716C', rule = '#E7E5E4'

  return (
    <div style={{ background: 'white', border: `1px solid ${rule}`, borderRadius: 8, marginBottom: 8, overflow: 'hidden' }}>
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
            {!isEditing && (
              <button onClick={() => saveSlot(slot)} disabled={saving}
                style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, border: '1px solid #047857', background: '#EAF3DE', cursor: 'pointer', color: '#047857', fontWeight: 600 }}>
                {saving ? '…' : 'Save'}
              </button>
            )}
            <button onClick={() => setEditingId(isEditing ? null : editKey)}
              style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, border: `1px solid ${rule}`, background: 'white', cursor: 'pointer', color: muted }}>
              {isEditing ? 'Close' : 'Edit'}
            </button>
            {confirmingDelete === editKey ? (
              <>
                <button onClick={() => { removeSlot(type, idx); setConfirmingDelete(null) }}
                  style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, border: '1px solid #b91c1c', background: '#FEE2E2', cursor: 'pointer', color: '#b91c1c', fontWeight: 600 }}>
                  Confirm
                </button>
                <button onClick={() => setConfirmingDelete(null)}
                  style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, border: `1px solid ${rule}`, background: 'white', cursor: 'pointer', color: muted }}>
                  Cancel
                </button>
              </>
            ) : (
              <button onClick={() => setConfirmingDelete(editKey)}
                style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, border: `1px solid ${rule}`, background: 'white', cursor: 'pointer', color: '#b91c1c' }}>
                ✕
              </button>
            )}
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
            {slot.asset_url && (
              <span style={{ fontSize: 11, color: '#047857', marginLeft: 4 }}>
                {slot.asset_type === 'image' ? '🖼' : '🎥'} {slot.asset_type === 'link' ? 'Link' : slot.asset_filename || 'Asset'}
              </span>
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <label style={{ fontSize: 10, color: muted, fontWeight: 600, textTransform: 'uppercase' }}>Caption</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => draftCaption(type, idx, slot)}
                    disabled={draftingSlot === `${type}-${idx}`}
                    style={{ fontSize: 11, padding: '3px 8px', borderRadius: 4, border: '1px solid #E7E5E4', background: '#F5F5F4', cursor: 'pointer' }}>
                    {draftingSlot === `${type}-${idx}` ? '✦ Drafting…' : '✦ Suggest with Claude'}
                  </button>
                  <select style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, border: `1px solid ${rule}` }}
                    value={slot.caption_id ?? ''}
                    onChange={e => e.target.value ? linkCaption(type, idx, e.target.value) : updateSlot(type, idx, { caption_id: undefined })}>
                    <option value="">— Link from library —</option>
                    {captions.map(c => <option key={c.id} value={c.id}>{c.topic || c.caption_text.slice(0, 50)}</option>)}
                  </select>
                </div>
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

            {/* Asset upload */}
            <div style={{ marginBottom: 8 }}>
              <label style={{ fontSize: 10, color: muted, fontWeight: 600, textTransform: 'uppercase' }}>Asset (Image / Video)</label>
              <div style={{ marginTop: 6 }}>
                {slot.asset_url ? (
                  <div style={{ border: `1px solid ${rule}`, borderRadius: 8, overflow: 'hidden' }}>
                    {slot.asset_type === 'image' ? (
                      <img src={slot.asset_url} alt="preview"
                        style={{ width: '100%', maxHeight: 180, objectFit: 'cover', display: 'block' }} />
                    ) : (
                      <div style={{ padding: '10px 12px', background: '#F5F5F4', fontSize: 12, color: muted }}>
                        🎥 {slot.asset_filename || 'Video uploaded'}
                      </div>
                    )}
                    <div style={{ padding: '8px 10px', display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ fontSize: 11, color: '#047857', flex: 1 }}>✓ {slot.asset_filename || 'Asset ready'}</span>
                      <label style={{ fontSize: 11, padding: '3px 10px', borderRadius: 4, border: `1px solid ${rule}`, background: 'white', cursor: 'pointer', color: muted }}>
                        Replace
                        <input type="file" accept="image/*,video/*" style={{ display: 'none' }}
                          onChange={e => { const f = e.target.files?.[0]; if (f) uploadAsset(type, idx, f) }} />
                      </label>
                      <button onClick={() => updateSlot(type, idx, { asset_url: undefined, asset_type: undefined, asset_filename: undefined })}
                        style={{ fontSize: 11, padding: '3px 10px', borderRadius: 4, border: `1px solid ${rule}`, background: 'white', cursor: 'pointer', color: '#b91c1c' }}>
                        Remove
                      </button>
                    </div>
                  </div>
                ) : (
                  <label style={{
                    display: 'flex', flexDirection: 'column' as any, alignItems: 'center', justifyContent: 'center',
                    gap: 6, padding: '20px', borderRadius: 8, border: `2px dashed ${rule}`,
                    cursor: uploadingAsset === `${type}-${idx}` ? 'wait' : 'pointer',
                    background: '#FAFAF9', color: muted
                  }}>
                    {uploadingAsset === `${type}-${idx}` ? (
                      <span style={{ fontSize: 12 }}>Uploading…</span>
                    ) : (
                      <>
                        <span style={{ fontSize: 24 }}>🖼</span>
                        <span style={{ fontSize: 12, fontWeight: 600 }}>Click to upload image or video</span>
                        <span style={{ fontSize: 11 }}>JPG, PNG, MP4, MOV</span>
                      </>
                    )}
                    <input type="file" accept="image/*,video/*" style={{ display: 'none' }}
                      onChange={e => { const f = e.target.files?.[0]; if (f) uploadAsset(type, idx, f) }} />
                  </label>
                )}
              </div>
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

type ColumnProps = {
  title: string; emoji: string; slots: Slot[]; type: 'Post' | 'Video' | 'Re-Post';
  addSlot: (type: 'Post' | 'Video' | 'Re-Post') => void;
  editingId: string | null;
  setEditingId: (id: string | null) => void;
  updateSlot: (type: string, idx: number, patch: Partial<Slot>) => void;
  removeSlot: (type: string, idx: number) => void;
  saveSlot: (slot: Slot) => void;
  linkCaption: (type: string, idx: number, captionId: string) => void;
  draftCaption: (type: string, idx: number, slot: Slot) => void;
  draftingSlot: string | null;
  captions: Caption[];
  saving: boolean;
  stageMap: Record<string, { key: string; label: string; owner: string; color: string; bg: string }>;
  confirmingDelete: string | null;
  setConfirmingDelete: (id: string | null) => void;
  uploadAsset: (type: string, idx: number, file: File) => Promise<void>;
  uploadingAsset: string | null;
}

function Column({ title, emoji, slots, type, addSlot, editingId, setEditingId, updateSlot, removeSlot, saveSlot, linkCaption, draftCaption, draftingSlot, captions, saving, stageMap, confirmingDelete, setConfirmingDelete, uploadAsset, uploadingAsset }: ColumnProps) {
  const muted = '#78716C', rule = '#E7E5E4'
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
      {slots.map((s, i) => (
        <SlotCard key={`${type}-${i}`} slot={s} type={type} idx={i}
          editingId={editingId} setEditingId={setEditingId}
          updateSlot={updateSlot} removeSlot={removeSlot} saveSlot={saveSlot}
          linkCaption={linkCaption} draftCaption={draftCaption}
          draftingSlot={draftingSlot} captions={captions} saving={saving} stageMap={stageMap}
          confirmingDelete={confirmingDelete} setConfirmingDelete={setConfirmingDelete}
          uploadAsset={uploadAsset} uploadingAsset={uploadingAsset} />
      ))}
    </div>
  )
}

export default function PlanningBoardPage() {
  const now = new Date()
  // Work one month ahead: default to next calendar month
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  const currentMonth = nextMonth.getMonth()
  const currentYear = nextMonth.getFullYear()

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
  const [showExport, setShowExport] = useState(false)
  const [copied, setCopied] = useState(false)
  const [draftingSlot, setDraftingSlot] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null)
  const [uploadingAsset, setUploadingAsset] = useState<string | null>(null)
  const [videoLinkInput, setVideoLinkInput] = useState<Record<string, string>>({})
  const [showEmail, setShowEmail] = useState(false)
  const [insights, setInsights] = useState<{
    topPosts: { text: string; eng: number; type: string }[]
    zeroPosts: { text: string; type: string; impressions: number }[]
    typePerf: { type: string; avg: number; zeros: number; total: number }[]
  } | null>(null)
  const [insightsLoading, setInsightsLoading] = useState(false)

  const months3 = [-2, -1, 0].map(offset => {
    const m = (currentMonth + offset + 12) % 12
    return { label: MONTH_LABELS[m], value: m }
  })

  const monthStr = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-01`

  useEffect(() => { loadPlan() }, [selectedClient, selectedMonth, selectedYear])
  useEffect(() => { loadCaptions() }, [selectedClient])
  useEffect(() => { loadInsights() }, [selectedClient])

  async function loadInsights() {
    setInsightsLoading(true)
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()

    const [{ data: top }, { data: zero }, { data: all }] = await Promise.all([
      supabase.from('sprout_posts').select('text_content, engagements, post_type')
        .eq('client_name', selectedClient).not('text_content', 'is', null)
        .gte('published_at', since).order('engagements', { ascending: false }).limit(5),
      supabase.from('sprout_posts').select('text_content, post_type, impressions, engagements')
        .eq('client_name', selectedClient).not('text_content', 'is', null)
        .gte('published_at', since).eq('engagements', 0).gt('impressions', 30)
        .order('impressions', { ascending: false }).limit(5),
      supabase.from('sprout_posts').select('post_type, engagements')
        .eq('client_name', selectedClient).gte('published_at', since),
    ])

    const typeMap: Record<string, { total: number; sum: number; zeros: number }> = {}
    for (const p of all ?? []) {
      const t = p.post_type ?? 'unknown'
      if (!typeMap[t]) typeMap[t] = { total: 0, sum: 0, zeros: 0 }
      typeMap[t].total++
      typeMap[t].sum += p.engagements ?? 0
      if ((p.engagements ?? 0) === 0) typeMap[t].zeros++
    }
    const typePerf = Object.entries(typeMap)
      .map(([type, d]) => ({ type, avg: parseFloat((d.sum / d.total).toFixed(1)), zeros: d.zeros, total: d.total }))
      .sort((a, b) => b.avg - a.avg)

    setInsights({
      topPosts: (top ?? []).map(p => ({ text: p.text_content ?? '', eng: p.engagements ?? 0, type: p.post_type ?? '' })),
      zeroPosts: (zero ?? []).map(p => ({ text: p.text_content ?? '', type: p.post_type ?? '', impressions: p.impressions ?? 0 })),
      typePerf,
    })
    setInsightsLoading(false)
  }

  async function loadPlan() {
    setLoading(true)
    const data = await fetchPlan(selectedClient, monthStr)

    if (data && (data as any[]).length > 0) {
      const savedPosts = data.filter((d: any) => d.content_type === 'Post')
      const savedVideos = data.filter((d: any) => d.content_type === 'Video')
      const savedReposts = data.filter((d: any) => d.content_type === 'Re-Post')

      // Merge saved slots with defaults — keep defaults for unsaved slots
      const defaultPosts = [1,2,3,4,5,6].map(n => DEFAULT_SLOT(n, 'Post'))
      const defaultVideos = [7,8,9,10].map(n => DEFAULT_SLOT(n, 'Video'))
      const defaultReposts = [11,12].map(n => DEFAULT_SLOT(n, 'Re-Post'))

      function mergeSlots(defaults: Slot[], saved: any[]): Slot[] {
        const savedBySlot = Object.fromEntries(saved.map((d: any) => [d.slot, dbToSlot(d)]))
        const maxSlot = Math.max(...defaults.map(s => s.slot_num), ...saved.map((d: any) => d.slot ?? 0))
        const result = [...defaults]
        // Add any extra saved slots beyond defaults
        saved.forEach((d: any) => {
          if (!result.find(s => s.slot_num === d.slot)) {
            result.push(dbToSlot(d))
          }
        })
        // Merge saved data into matching default slots
        return result.map(s => savedBySlot[s.slot_num] ?? s)
      }

      setPostSlots(mergeSlots(defaultPosts, savedPosts))
      setVideoSlots(mergeSlots(defaultVideos, savedVideos))
      setRepostSlots(mergeSlots(defaultReposts, savedReposts))
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
      asset_url: d.asset_url ?? undefined,
      asset_type: d.asset_type ?? undefined,
      asset_filename: d.asset_filename ?? undefined,
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

  async function draftCaption(type: string, idx: number, slot: Slot) {
    const key = `${type}-${idx}`
    setDraftingSlot(key)
    
    try {
      const res = await fetch('/api/claude/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_name: selectedClient,
          pillar: slot.pillar,
          content_type: slot.content_type,
          topic: slot.topic,
          month: `${MONTH_LABELS[selectedMonth]} ${selectedYear}`,
        })
      })
      const data = await res.json()
      updateSlot(type, idx, {
        caption_text: data.caption ?? '',
        hashtags: data.hashtags ?? ''
      })
    } catch(e) {
      console.error('Draft failed', e)
    }
    setDraftingSlot(null)
  }

  async function uploadAsset(type: string, idx: number, file: File) {
    const key = `${type}-${idx}`
    setUploadingAsset(key)
    try {
      const ext = file.name.split('.').pop()
      const path = `${selectedClient}/${selectedYear}-${String(selectedMonth+1).padStart(2,'0')}/${type}-${idx}-${Date.now()}.${ext}`

      // 1. Ask our API for a signed upload URL (small JSON request — no file, no 413)
      const res = await fetch('/api/social/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(`Could not get upload URL: ${res.status} ${text.slice(0, 200)}`)
      }
      const { token, path: signedPath, publicUrl } = await res.json()

      // 2. Upload the file straight to Supabase Storage (bypasses the API body limit entirely)
      const { error } = await supabase.storage
        .from('social-assets')
        .uploadToSignedUrl(signedPath, token, file)
      if (error) throw new Error(error.message)

      // 3. Save the public URL onto the slot — same shape as before
      const assetType = file.type.startsWith('video') ? 'video' : 'image'
      updateSlot(type, idx, { asset_url: publicUrl, asset_type: assetType, asset_filename: file.name })
    } catch(e) {
      console.error('Upload failed', e)
    }
    setUploadingAsset(null)
  }

  function generateEmail(): string {
    const monthName = MONTH_LABELS[selectedMonth] + ' ' + selectedYear
    const clientFirst = selectedClient.split(' ')[0]

    function formatSlots(slots: Slot[], label: string): string {
      const filled = slots.filter(s => s.topic || s.caption_text)
      if (!filled.length) return ''
      let out = `(${filled.length} ${label})\n`
      filled.forEach((s, i) => {
        const num = i + 1
        const date = s.scheduled_date ? new Date(s.scheduled_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric' }) : '(date TBD)'
        out += `\n(${label.replace(/s$/, '')} ${num}) ${date}: ${s.topic}\n`
        if (s.caption_text) out += `Main Content: ${s.caption_text}\n`
        if (s.hashtags) out += `#: ${s.hashtags}\n`
        if (s.asset_url) out += `${s.asset_type === 'video' ? 'Video' : 'Image'}: ${s.asset_url}\n`
      })
      return out
    }

    const posts = formatSlots(postSlots, 'Our Posts')
    const reposts = formatSlots(repostSlots, 'Re-Posts')
    const videos = formatSlots(videoSlots, 'Videos')
    const total = allSlots().filter(s => s.topic || s.caption_text).length

    return `Hello,

Here are the social media posts planned for ${monthName}. Please let me know if you have any feedback or if you're happy to approve them as they are.

Additionally, if you have any specific content requests for the following month, feel free to share those when you have a chance so we can plan accordingly.

FINAL - ${selectedClient} (${monthName})
Calendar: ${total} Post
[paste calendar image here]

${posts}
${reposts}
${videos}
--

EMILY LISOWSKI
AB CONSULTING

(708) 377 - 5727
emily@abconsultingg.com
www.abconsultingg.com
52 River St. Lemont, IL 60439`
  }

  function generateSubject(): string {
    const monthName = MONTH_LABELS[selectedMonth] + ' ' + selectedYear
    return `FINAL - ${selectedClient} (${monthName})`
  }

  function generateEmailHTML(): string {
    const monthName = MONTH_LABELS[selectedMonth] + ' ' + selectedYear
    const esc = (s: string) => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

    function formatSlotsHTML(slots: Slot[], label: string): string {
      const filled = slots.filter(s => s.topic || s.caption_text)
      if (!filled.length) return ''
      let out = `<div style="font-size:20px;font-weight:bold;margin:18px 0 8px;">(${filled.length} ${label})</div>`
      filled.forEach((s, i) => {
        const num = i + 1
        const date = s.scheduled_date ? new Date(s.scheduled_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric' }) : '(date TBD)'
        out += `<div style="margin-top:14px;"><b>(${label.replace(/s$/, '')} ${num}) ${date}: ${esc(s.topic)}</b></div>`
        if (s.caption_text) out += `<div style="margin-top:6px;">Main Content: ${esc(s.caption_text).replace(/\n/g, '<br>')}</div>`
        if (s.hashtags) out += `<div style="margin-top:6px;">#: ${esc(s.hashtags)}</div>`
        if (s.asset_url) {
          if (s.asset_type === 'video') {
            out += `<div style="margin-top:6px;">Link: <a href="${s.asset_url}">${s.asset_url}</a></div>`
          } else {
            out += `<div style="margin-top:6px;"><img src="${s.asset_url}" style="max-width:100%;max-height:500px;margin:5px 0;vertical-align:middle;" /></div>`
          }
        }
      })
      return out
    }

    const posts = formatSlotsHTML(postSlots, 'Our Posts')
    const reposts = formatSlotsHTML(repostSlots, 'Re-Posts')
    const videos = formatSlotsHTML(videoSlots, 'Videos')
    const total = allSlots().filter(s => s.topic || s.caption_text).length

    return `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1C1917;line-height:1.5;">
<p>Hello,</p>
<p>Here are the social media posts planned for ${monthName}. Please let me know if you have any feedback or if you're happy to approve them as they are.</p>
<p>Additionally, if you have any specific content requests for the following month, feel free to share those when you have a chance so we can plan accordingly.</p>
<div style="font-size:22px;font-weight:bold;margin-top:16px;">FINAL - ${esc(selectedClient)} (${monthName})</div>
<div style="font-size:22px;font-weight:bold;">Calendar: ${total} Post</div>
<p>[paste calendar image here]</p>
<hr style="width:100%;height:1px;border:none;border-bottom:1px solid #C1C7CD;" />
${posts}
${reposts}
${videos}
<p>--</p>
<p>EMILY LISOWSKI<br>AB CONSULTING</p>
<p>(708) 377 - 5727<br>emily@abconsultingg.com<br>www.abconsultingg.com<br>52 River St. Lemont, IL 60439</p>
</div>`
  }

  async function copyEmailHTML() {
    const html = generateEmailHTML()
    const plain = generateEmail()
    try {
      const item = new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([plain], { type: 'text/plain' }),
      })
      await navigator.clipboard.write([item])
    } catch {
      // Fallback for browsers without ClipboardItem support
      await navigator.clipboard.writeText(plain)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

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
      asset_url: slot.asset_url || null,
      asset_type: slot.asset_type || null,
      asset_filename: slot.asset_filename || null,
    }
    if (slot.id) {
      await savePlanRow(row, slot.id)
    } else {
      const result = await savePlanRow(row)
      if (result.data) {
        const id = result.data.id
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
            <button onClick={() => setShowExport(true)}
              style={{ padding: '7px 14px', borderRadius: 6, border: '1px solid #E7E5E4', background: 'white', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
              📤 Export email
            </button>
            <a href={`/dashboard/social/review`}
              style={{ padding: '7px 14px', borderRadius: 6, border: 'none', background: '#1C1917', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', textDecoration: 'none' }}>
              👁 View All Content
            </a>
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
            <button onClick={() => setShowEmail(true)}
              style={{ padding: '7px 14px', borderRadius: 6, border: `1px solid ${rule}`, background: 'white', fontSize: 13, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              ✉ Generate approval email
            </button>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 1300, margin: '0 auto', padding: '24px 24px' }}>
      
      {/* Export Modal */}
      {showExport && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>
          <div style={{ background: 'white', borderRadius: 12, padding: 28, width: '100%', maxWidth: 700, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Approval Email</h2>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => { navigator.clipboard.writeText(generateEmail()); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
                  style={{ padding: '7px 14px', borderRadius: 6, border: '1px solid #E7E5E4', background: copied ? '#EAF3DE' : 'white', fontSize: 13, cursor: 'pointer', color: copied ? '#047857' : '#1C1917' }}>
                  {copied ? '✓ Copied' : 'Copy'}
                </button>
                <button onClick={() => setShowExport(false)}
                  style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer', color: '#78716C' }}>✕</button>
              </div>
            </div>
            <pre style={{ background: '#FAFAF9', borderRadius: 8, padding: 16, fontSize: 12, lineHeight: 1.6, whiteSpace: 'pre-wrap', border: '1px solid #E7E5E4', fontFamily: 'inherit', margin: 0 }}>
              {generateEmail()}
            </pre>
          </div>
        </div>
      )}

        {/* Performance Insights Panel */}
        {insights && !insightsLoading && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
            {/* What's Working */}
            <div style={{ background: 'white', border: '1px solid #E7E5E4', borderRadius: 8, padding: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#047857', marginBottom: 10 }}>
                ✓ What's Working — Top 5 Posts (Last 90 Days)
              </div>
              {insights.topPosts.length === 0 ? (
                <div style={{ fontSize: 12, color: '#78716C' }}>No data yet for this client.</div>
              ) : insights.topPosts.map((p, i) => (
                <div key={i} style={{ borderTop: i > 0 ? '1px solid #F5F5F4' : undefined, paddingTop: i > 0 ? 8 : 0, marginTop: i > 0 ? 8 : 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                    <span style={{ fontSize: 10, fontWeight: 600, color: '#047857', background: '#EAF3DE', padding: '1px 6px', borderRadius: 4 }}>{p.eng} eng</span>
                    <span style={{ fontSize: 10, color: '#A8A29E' }}>{p.type.toLowerCase().replace('_', ' ')}</span>
                  </div>
                  <div style={{ fontSize: 12, color: '#1C1917', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {p.text}
                  </div>
                </div>
              ))}
            </div>

            {/* What's Bombing */}
            <div style={{ background: 'white', border: '1px solid #E7E5E4', borderRadius: 8, padding: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#b91c1c', marginBottom: 10 }}>
                ✗ What's Bombing — Zero Engagement (Had Impressions)
              </div>
              {insights.zeroPosts.length === 0 ? (
                <div style={{ fontSize: 12, color: '#78716C' }}>No zero-engagement posts with impressions — great!</div>
              ) : insights.zeroPosts.map((p, i) => (
                <div key={i} style={{ borderTop: i > 0 ? '1px solid #F5F5F4' : undefined, paddingTop: i > 0 ? 8 : 0, marginTop: i > 0 ? 8 : 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                    <span style={{ fontSize: 10, fontWeight: 600, color: '#b91c1c', background: '#FEE2E2', padding: '1px 6px', borderRadius: 4 }}>0 eng / {p.impressions} imp</span>
                    <span style={{ fontSize: 10, color: '#A8A29E' }}>{p.type.toLowerCase().replace('_', ' ')}</span>
                  </div>
                  <div style={{ fontSize: 12, color: '#78716C', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {p.text}
                  </div>
                </div>
              ))}
              {/* Post type breakdown */}
              {insights.typePerf.length > 0 && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #F5F5F4' }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: '#78716C', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Format Performance</div>
                  {insights.typePerf.slice(0, 5).map((t, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
                      <span style={{ color: '#1C1917' }}>{t.type.toLowerCase().replace(/_/g, ' ')}</span>
                      <span style={{ color: t.avg >= 10 ? '#047857' : t.avg >= 3 ? '#B45309' : '#b91c1c', fontWeight: 600, fontFamily: 'monospace' }}>
                        avg {t.avg} eng · {t.zeros}/{t.total} zero
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
        {insightsLoading && (
          <div style={{ fontSize: 12, color: '#78716C', marginBottom: 16 }}>Loading performance insights…</div>
        )}

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
        <section style={{ display: 'grid', gridTemplateColumns: `repeat(${STAGES.length + 1}, 1fr)`, gap: 1, background: '#D6D3D1', border: `1px solid ${rule}`, borderRadius: 8, overflow: 'hidden', marginBottom: 24 }}>
          <div style={{ background: 'white', padding: '14px 18px' }}>
            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, color: muted }}>Total Slots</div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 24, fontWeight: 600, marginTop: 6, color: ink }}>{totalSlots}</div>
          </div>
          {STAGES.map(s => {
            const count = allSlots().filter(sl => sl.stage === s.key).length
            return (
              <div key={s.key} style={{ background: 'white', padding: '14px 18px' }}>
                <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, color: muted }}>{s.label}</div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 24, fontWeight: 600, marginTop: 6, color: count > 0 ? s.color : muted }}>{count}</div>
              </div>
            )
          })}
        </section>

        {loading ? (
          <div style={{ padding: 32, textAlign: 'center', color: muted }}>Loading…</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20 }}>
            <Column title="Posts" emoji="📸" slots={postSlots} type="Post" addSlot={addSlot} editingId={editingId} setEditingId={setEditingId} updateSlot={updateSlot} removeSlot={removeSlot} saveSlot={saveSlot} linkCaption={linkCaption} draftCaption={draftCaption} draftingSlot={draftingSlot} captions={captions} saving={saving} stageMap={stageMap} confirmingDelete={confirmingDelete} setConfirmingDelete={setConfirmingDelete} uploadAsset={uploadAsset} uploadingAsset={uploadingAsset} />
            <Column title="Videos" emoji="🎥" slots={videoSlots} type="Video" addSlot={addSlot} editingId={editingId} setEditingId={setEditingId} updateSlot={updateSlot} removeSlot={removeSlot} saveSlot={saveSlot} linkCaption={linkCaption} draftCaption={draftCaption} draftingSlot={draftingSlot} captions={captions} saving={saving} stageMap={stageMap} confirmingDelete={confirmingDelete} setConfirmingDelete={setConfirmingDelete} uploadAsset={uploadAsset} uploadingAsset={uploadingAsset} />
            <Column title="Re-Posts" emoji="🔗" slots={repostSlots} type="Re-Post" addSlot={addSlot} editingId={editingId} setEditingId={setEditingId} updateSlot={updateSlot} removeSlot={removeSlot} saveSlot={saveSlot} linkCaption={linkCaption} draftCaption={draftCaption} draftingSlot={draftingSlot} captions={captions} saving={saving} stageMap={stageMap} confirmingDelete={confirmingDelete} setConfirmingDelete={setConfirmingDelete} uploadAsset={uploadAsset} uploadingAsset={uploadingAsset} />
          </div>
        )}
      </main>

      {/* Email export modal */}
      {showEmail && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>
          <div style={{ background: 'white', borderRadius: 12, padding: 28, width: '100%', maxWidth: 680, maxHeight: '88vh', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Approval Email — {selectedClient}</h2>
              <button onClick={() => setShowEmail(false)} style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer', color: muted }}>✕</button>
            </div>
            <div style={{ fontSize: 12, color: muted }}>Copy this and paste into Gmail. Send to the client contact + CC Tanya.</div>
            <div>
              <label style={{ fontSize: 10, color: muted, fontWeight: 600, textTransform: 'uppercase' }}>Subject</label>
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <input readOnly value={generateSubject()}
                  style={{ flex: 1, padding: '8px 10px', borderRadius: 6, border: `1px solid ${rule}`, fontSize: 13, fontFamily: 'monospace' }} />
                <button onClick={() => { navigator.clipboard.writeText(generateSubject()) }}
                  style={{ padding: '8px 14px', borderRadius: 6, border: `1px solid ${rule}`, background: 'white', fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  Copy subject
                </button>
              </div>
            </div>
            <textarea readOnly value={generateEmail()}
              style={{ flex: 1, minHeight: 380, padding: '12px', borderRadius: 6, border: `1px solid ${rule}`, fontSize: 12, fontFamily: 'monospace', resize: 'vertical', lineHeight: 1.6 }} />
            <div style={{ fontSize: 12, color: muted, marginTop: -4 }}>
              Use <b>Copy for email</b> to paste with images visible (like the old format). Paste into Gmail's compose window.
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={copyEmailHTML}
                style={{ padding: '9px 18px', borderRadius: 6, border: 'none', background: ink, color: 'white', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                {copied ? '✓ Copied!' : '🖼 Copy for email (with images)'}
              </button>
              <button onClick={() => { navigator.clipboard.writeText(generateEmail()); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
                style={{ padding: '9px 14px', borderRadius: 6, border: `1px solid ${rule}`, background: 'white', fontSize: 13, cursor: 'pointer' }}>
                Copy as text
              </button>
              <button onClick={() => setShowEmail(false)}
                style={{ padding: '9px 14px', borderRadius: 6, border: `1px solid ${rule}`, background: 'white', fontSize: 13, cursor: 'pointer' }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
