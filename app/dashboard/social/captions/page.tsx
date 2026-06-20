'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type Caption = {
  id: string
  client_name: string
  pillar: string
  post_type: string
  topic: string
  caption_text: string
  hashtags: string
  design_brief: string
  post_date: string
  status: string
}

const PILLARS = ['All', 'Story', 'Value', 'Culture', 'Fans', 'Current Events', 'Support', 'Goals']
const TYPES = ['All', 'Post', 'Video', 'Re-Post']

export default function CaptionLibraryPage() {
  const [captions, setCaptions] = useState<Caption[]>([])
  const [loading, setLoading] = useState(true)
  const [filterClient, setFilterClient] = useState('All')
  const [filterPillar, setFilterPillar] = useState('All')
  const [filterType, setFilterType] = useState('All')
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [drafting, setDrafting] = useState(false)
  const [draftResult, setDraftResult] = useState('')
  const [form, setForm] = useState({ client_name: '', pillar: '', post_type: 'Post', topic: '', caption_text: '', hashtags: '', design_brief: '' })

  useEffect(() => { loadCaptions() }, [])

  async function loadCaptions() {
    setLoading(true)
    const { data } = await supabase
      .from('social_captions')
      .select('*')
      .order('post_date', { ascending: false })
    setCaptions(data ?? [])
    setLoading(false)
  }

  const clients = ['All', ...Array.from(new Set(captions.map(c => c.client_name).filter(Boolean))).sort()]

  const filtered = captions
    .filter(c => filterClient === 'All' || c.client_name === filterClient)
    .filter(c => filterPillar === 'All' || c.pillar === filterPillar)
    .filter(c => filterType === 'All' || c.post_type === filterType)
    .filter(c => !search || c.caption_text?.toLowerCase().includes(search.toLowerCase()) || c.topic?.toLowerCase().includes(search.toLowerCase()))

  async function saveCaption() {
    if (!form.client_name || !form.caption_text) return
    await supabase.from('social_captions').insert({ ...form, status: 'approved' })
    setShowAdd(false)
    setForm({ client_name: '', pillar: '', post_type: 'Post', topic: '', caption_text: '', hashtags: '', design_brief: '' })
    loadCaptions()
  }

  async function draftWithClaude() {
    if (!form.client_name || !form.topic) return
    setDrafting(true)
    setDraftResult('')

    // Pull existing captions for this client as context
    const clientCaptions = captions.filter(c => c.client_name === form.client_name).slice(0, 5)
    const context = clientCaptions.map(c => `Pillar: ${c.pillar} | Topic: ${c.topic}\n${c.caption_text}`).join('\n\n---\n\n')

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: `You are drafting a social media caption for ${form.client_name}.

Pillar: ${form.pillar || 'Value'}
Post type: ${form.post_type}
Topic: ${form.topic}

Here are approved past captions from this client for voice reference:
${context || 'No previous captions yet — use a professional, direct tone.'}

Draft a new caption for the topic above. Match the voice and style of past approved captions. Keep it concise and avoid heavy hashtag stacks. Return ONLY the caption text, then on a new line starting with HASHTAGS: the hashtags.`
        }]
      })
    })

    const data = await res.json()
    const text = data.content?.[0]?.text ?? ''
    const parts = text.split('HASHTAGS:')
    setForm(f => ({
      ...f,
      caption_text: parts[0].trim(),
      hashtags: parts[1]?.trim() ?? ''
    }))
    setDraftResult('Draft ready — review and save.')
    setDrafting(false)
  }

  const ink = '#1C1917', muted = '#78716C', rule = '#E7E5E4'

  const PILLAR_COLOR: Record<string, string> = {
    Story: '#185FA5', Value: '#3B6D11', Culture: '#5B21B6',
    Fans: '#854F0B', 'Current Events': '#D97706', Support: '#A32D2D', Goals: '#047857',
  }

  return (
    <div style={{ minHeight: '100vh', background: '#FAFAF9', color: ink, fontFamily: "'Inter', system-ui, sans-serif" }}>
      <header style={{ borderBottom: `1px solid ${rule}` }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Link href="/dashboard/social" style={{ color: muted, textDecoration: 'none', fontSize: 13 }}>← Social Hub</Link>
            <span style={{ color: rule }}>/</span>
            <div>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, color: muted }}>Content</div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>Caption Library</div>
            </div>
          </div>
          <button onClick={() => setShowAdd(true)} style={{ padding: '8px 16px', background: ink, color: 'white', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
            + Add caption
          </button>
        </div>
      </header>

      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '28px 24px' }}>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, background: '#D6D3D1', border: `1px solid ${rule}`, borderRadius: 8, overflow: 'hidden', marginBottom: 28 }}>
          {[
            { label: 'Total captions', value: captions.length.toString() },
            { label: 'Clients covered', value: String(new Set(captions.map(c => c.client_name)).size) },
            { label: 'Pillars used', value: String(new Set(captions.map(c => c.pillar).filter(Boolean)).size) },
            { label: 'Target', value: '≥200', color: captions.length >= 200 ? '#047857' : '#B45309' },
          ].map((k, i) => (
            <div key={i} style={{ background: 'white', padding: '16px 20px' }}>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, color: muted }}>{k.label}</div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 26, fontWeight: 600, marginTop: 8, color: k.color ?? ink }}>{k.value}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
          <input placeholder="Search captions or topics…" value={search} onChange={e => setSearch(e.target.value)}
            style={{ padding: '7px 12px', borderRadius: 6, border: `1px solid ${rule}`, fontSize: 13, background: 'white', minWidth: 220 }} />
          <select value={filterClient} onChange={e => setFilterClient(e.target.value)}
            style={{ padding: '7px 10px', borderRadius: 6, border: `1px solid ${rule}`, fontSize: 13, background: 'white' }}>
            {clients.map(c => <option key={c}>{c}</option>)}
          </select>
          <select value={filterPillar} onChange={e => setFilterPillar(e.target.value)}
            style={{ padding: '7px 10px', borderRadius: 6, border: `1px solid ${rule}`, fontSize: 13, background: 'white' }}>
            {PILLARS.map(p => <option key={p}>{p}</option>)}
          </select>
          <select value={filterType} onChange={e => setFilterType(e.target.value)}
            style={{ padding: '7px 10px', borderRadius: 6, border: `1px solid ${rule}`, fontSize: 13, background: 'white' }}>
            {TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
          <span style={{ fontSize: 12, color: muted, alignSelf: 'center', marginLeft: 'auto' }}>{filtered.length} captions</span>
        </div>

        {/* Caption cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {loading ? (
            <div style={{ padding: 32, textAlign: 'center', color: muted }}>Loading…</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: muted }}>No captions match. <button onClick={() => setShowAdd(true)} style={{ color: '#EA580C', border: 'none', background: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Add one →</button></div>
          ) : filtered.map(c => {
            const isOpen = expanded === c.id
            const pillarColor = PILLAR_COLOR[c.pillar] ?? muted
            return (
              <div key={c.id} style={{ background: 'white', border: `1px solid ${rule}`, borderRadius: 8, overflow: 'hidden' }}>
                <div onClick={() => setExpanded(isOpen ? null : c.id)}
                  style={{ padding: '14px 18px', cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 99, background: pillarColor + '20', color: pillarColor }}>{c.pillar}</span>
                      <span style={{ fontSize: 11, color: muted, padding: '2px 7px', borderRadius: 99, background: '#F5F5F4' }}>{c.post_type}</span>
                      <span style={{ fontSize: 11, color: muted }}>{c.client_name}</span>
                      {c.post_date && <span style={{ fontSize: 11, color: muted }}>{new Date(c.post_date).toLocaleDateString()}</span>}
                    </div>
                    {c.topic && <div style={{ fontSize: 12, fontWeight: 600, color: muted, marginBottom: 4 }}>{c.topic}</div>}
                    <p style={{ fontSize: 13, margin: 0, lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: isOpen ? undefined : 2, WebkitBoxOrient: 'vertical' as any }}>
                      {c.caption_text}
                    </p>
                  </div>
                  <span style={{ color: muted, fontSize: 16, flexShrink: 0, marginTop: 2 }}>{isOpen ? '▲' : '▼'}</span>
                </div>
                {isOpen && (
                  <div style={{ padding: '0 18px 16px', borderTop: `1px solid ${rule}` }}>
                    <div style={{ marginTop: 12, fontSize: 13, lineHeight: 1.6 }}>{c.caption_text}</div>
                    {c.hashtags && <div style={{ marginTop: 8, fontSize: 12, color: '#185FA5' }}>{c.hashtags}</div>}
                    {c.design_brief && (
                      <div style={{ marginTop: 12, padding: '10px 14px', background: '#FAFAF9', borderRadius: 6, fontSize: 12, color: muted, lineHeight: 1.5 }}>
                        <strong style={{ color: ink }}>Design brief:</strong> {c.design_brief}
                      </div>
                    )}
                    <button
                      onClick={() => navigator.clipboard.writeText(c.caption_text + (c.hashtags ? '\n\n' + c.hashtags : ''))}
                      style={{ marginTop: 10, fontSize: 12, padding: '5px 10px', borderRadius: 5, border: `1px solid ${rule}`, background: 'white', cursor: 'pointer' }}>
                      Copy caption
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </main>

      {/* Add caption modal */}
      {showAdd && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>
          <div style={{ background: 'white', borderRadius: 12, padding: 28, width: '100%', maxWidth: 620, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Add caption</h2>
              <button onClick={() => setShowAdd(false)} style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer', color: muted }}>✕</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Client *</label>
                <input value={form.client_name} onChange={e => setForm(f => ({ ...f, client_name: e.target.value }))}
                  placeholder="e.g. Midway Windows"
                  style={{ width: '100%', marginTop: 4, padding: '8px 10px', borderRadius: 6, border: `1px solid ${rule}`, fontSize: 13, boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Pillar</label>
                <select value={form.pillar} onChange={e => setForm(f => ({ ...f, pillar: e.target.value }))}
                  style={{ width: '100%', marginTop: 4, padding: '8px 10px', borderRadius: 6, border: `1px solid ${rule}`, fontSize: 13 }}>
                  <option value="">Select…</option>
                  {PILLARS.slice(1).map(p => <option key={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Type</label>
                <select value={form.post_type} onChange={e => setForm(f => ({ ...f, post_type: e.target.value }))}
                  style={{ width: '100%', marginTop: 4, padding: '8px 10px', borderRadius: 6, border: `1px solid ${rule}`, fontSize: 13 }}>
                  {TYPES.slice(1).map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Topic</label>
                <input value={form.topic} onChange={e => setForm(f => ({ ...f, topic: e.target.value }))}
                  placeholder="e.g. Energy efficiency"
                  style={{ width: '100%', marginTop: 4, padding: '8px 10px', borderRadius: 6, border: `1px solid ${rule}`, fontSize: 13, boxSizing: 'border-box' }} />
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Caption *</label>
                <button onClick={draftWithClaude} disabled={drafting || !form.client_name || !form.topic}
                  style={{ fontSize: 12, padding: '4px 10px', borderRadius: 5, border: `1px solid ${rule}`, background: '#F5F5F4', cursor: 'pointer', color: ink }}>
                  {drafting ? 'Drafting…' : '✦ Draft with Claude'}
                </button>
              </div>
              {draftResult && <div style={{ fontSize: 11, color: '#047857', marginTop: 2 }}>{draftResult}</div>}
              <textarea value={form.caption_text} onChange={e => setForm(f => ({ ...f, caption_text: e.target.value }))}
                placeholder="Caption text…" rows={5}
                style={{ width: '100%', marginTop: 6, padding: '8px 10px', borderRadius: 6, border: `1px solid ${rule}`, fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }} />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Hashtags</label>
              <input value={form.hashtags} onChange={e => setForm(f => ({ ...f, hashtags: e.target.value }))}
                placeholder="#tag1 #tag2"
                style={{ width: '100%', marginTop: 4, padding: '8px 10px', borderRadius: 6, border: `1px solid ${rule}`, fontSize: 13, boxSizing: 'border-box' }} />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Design brief</label>
              <textarea value={form.design_brief} onChange={e => setForm(f => ({ ...f, design_brief: e.target.value }))}
                placeholder="Image direction for Majo…" rows={2}
                style={{ width: '100%', marginTop: 4, padding: '8px 10px', borderRadius: 6, border: `1px solid ${rule}`, fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }} />
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowAdd(false)} style={{ padding: '9px 16px', borderRadius: 6, border: `1px solid ${rule}`, background: 'white', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
              <button onClick={saveCaption} disabled={!form.client_name || !form.caption_text}
                style={{ padding: '9px 16px', borderRadius: 6, border: 'none', background: ink, color: 'white', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                Save caption
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
