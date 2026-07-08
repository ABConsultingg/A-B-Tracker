'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const MONTH_FULL   = ['January','February','March','April','May','June','July','August','September','October','November','December']

const CLIENTS = [
  'Richards Building Supply', 'Culture Construction', 'KBC Exteriors', 'KBC Restoration',
  'MVP Chiropractic', 'Midwest Construction Experts', 'Apollo Supply', 'Midway Windows',
  'Affiliated Control Equipment', 'NICO Roofing', 'A&B Consulting Group', 'APEK Inc.',
  'RG General Roofing',
]

const STAGES: Record<string, { color: string; bg: string }> = {
  'Draft':       { color: '#78716C', bg: '#F5F5F4' },
  'Copy Review': { color: '#854F0B', bg: '#FAEEDA' },
  'Design':      { color: '#5B21B6', bg: '#F0EDFB' },
  'Ready':       { color: '#185FA5', bg: '#EDF4FB' },
  'In Sprout':   { color: '#047857', bg: '#EAF3DE' },
  'Published':   { color: '#1C1917', bg: '#F5F5F4' },
}

const TYPE_EMOJI: Record<string, string> = {
  'Post': '📸', 'Video': '🎥', 'Re-Post': '🔗'
}

type Post = {
  id: string
  slot: number
  content_type: string
  pillar: string
  topic: string
  caption_text: string
  hashtags: string
  design_brief: string
  status: string
  scheduled_date: string
  assignee: string
  asset_url?: string
  asset_type?: string
  asset_filename?: string
}

export default function ReviewPage() {
  const now = new Date()
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)

  const [selectedClient, setSelectedClient] = useState(CLIENTS[0])
  const [selectedMonth, setSelectedMonth] = useState(nextMonth.getMonth())
  const [selectedYear]  = useState(nextMonth.getFullYear())
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(false)

  const monthStr = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-01`

  const months3 = [-2, -1, 0].map(offset => {
    const m = (nextMonth.getMonth() + offset + 12) % 12
    return { label: MONTH_LABELS[m], value: m }
  })

  useEffect(() => { load() }, [selectedClient, selectedMonth, selectedYear])

  async function load() {
    setLoading(true)
    const res = await fetch(`/api/social/planning?client_name=${encodeURIComponent(selectedClient)}&month=${encodeURIComponent(monthStr)}`)
    const json = await res.json()
    setPosts((json.data ?? []) as Post[])
    setLoading(false)
  }

  // ── Calendar helpers ──
  const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate()
  const firstDayOfWeek = new Date(selectedYear, selectedMonth, 1).getDay()
  const calendarDays: (number | null)[] = [
    ...Array(firstDayOfWeek).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1)
  ]
  // pad to complete last row
  while (calendarDays.length % 7 !== 0) calendarDays.push(null)

  function postsOnDay(day: number) {
    return posts.filter(p => {
      if (!p.scheduled_date) return false
      const d = new Date(p.scheduled_date + 'T12:00:00')
      return d.getMonth() === selectedMonth && d.getFullYear() === selectedYear && d.getDate() === day
    })
  }

  const byType = (type: string) => posts
    .filter(p => p.content_type === type)
    .sort((a, b) => a.slot - b.slot)

  const ink = '#1C1917', muted = '#78716C', rule = '#E7E5E4'
  const totalPosts = posts.length
  const withAsset  = posts.filter(p => p.asset_url).length
  const scheduled  = posts.filter(p => p.scheduled_date).length

  return (
    <div style={{ minHeight: '100vh', background: '#FAFAF9', color: ink, fontFamily: "'Inter', system-ui, sans-serif" }}
         className="review-page">

      <style>{`
        @media print {
          .no-print { display: none !important; }
          .review-page { background: white !important; }
          body { margin: 0; }
          .page-break { page-break-before: always; }
        }
      `}</style>

      {/* Header */}
      <header style={{ borderBottom: `1px solid ${rule}`, background: 'white' }} className="no-print">
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Link href="/dashboard/social/planning" style={{ color: muted, textDecoration: 'none', fontSize: 13 }}>← Planning Board</Link>
            <span style={{ color: rule }}>/</span>
            <div>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, color: muted }}>Content</div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>Review & Export</div>
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
            <button onClick={() => window.print()}
              style={{ padding: '7px 16px', borderRadius: 6, border: 'none', background: ink, color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              ⬇ Export PDF
            </button>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px' }}>

        {/* Print header — only shows in PDF */}
        <div style={{ display: 'none', marginBottom: 32 }} className="print-header">
          <style>{`.print-header { display: block !important; } @media screen { .print-header { display: none !important; } }`}</style>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
            <div>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: muted, fontWeight: 600 }}>A&B Consulting Group</div>
              <div style={{ fontSize: 24, fontWeight: 700, marginTop: 2 }}>FINAL — {selectedClient}</div>
              <div style={{ fontSize: 14, color: muted, marginTop: 2 }}>{MONTH_FULL[selectedMonth]} {selectedYear} · {totalPosts} pieces of content</div>
            </div>
            <div style={{ textAlign: 'right', fontSize: 11, color: muted, lineHeight: 1.8 }}>
              <div>emily@abconsultingg.com</div>
              <div>www.abconsultingg.com</div>
              <div>(708) 377-5727</div>
            </div>
          </div>
          <div style={{ height: 2, background: ink, marginTop: 16 }} />
        </div>

        {loading ? (
          <div style={{ padding: 48, textAlign: 'center', color: muted }}>Loading…</div>
        ) : posts.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: muted }}>No content saved for {MONTH_LABELS[selectedMonth]} yet.</div>
        ) : (
          <>
            {/* ── Stats row ── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, background: rule, border: `1px solid ${rule}`, borderRadius: 8, overflow: 'hidden', marginBottom: 32 }} className="no-print">
              {[
                { label: 'Total Content', value: totalPosts },
                { label: 'Posts', value: byType('Post').length },
                { label: 'Videos', value: byType('Video').length },
                { label: 'Re-Posts', value: byType('Re-Post').length },
              ].map((k, i) => (
                <div key={i} style={{ background: 'white', padding: '14px 18px' }}>
                  <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, color: muted }}>{k.label}</div>
                  <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4, fontFamily: "'JetBrains Mono', monospace" }}>{k.value}</div>
                </div>
              ))}
            </div>

            {/* ── Calendar ── */}
            <section style={{ marginBottom: 40 }}>
              <div style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 16, color: muted }}>
                {MONTH_FULL[selectedMonth]} {selectedYear} — Content Calendar
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', border: `1px solid ${rule}`, borderRadius: 8, overflow: 'hidden', background: 'white' }}>
                {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
                  <div key={d} style={{ padding: '8px 0', textAlign: 'center', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: muted, borderBottom: `1px solid ${rule}`, background: '#FAFAF9' }}>{d}</div>
                ))}
                {calendarDays.map((day, i) => {
                  const dayPosts = day ? postsOnDay(day) : []
                  return (
                    <div key={i} style={{
                      minHeight: 80, padding: '6px 8px',
                      borderRight: (i + 1) % 7 !== 0 ? `1px solid ${rule}` : undefined,
                      borderBottom: i < calendarDays.length - 7 ? `1px solid ${rule}` : undefined,
                      background: day ? 'white' : '#FAFAF9',
                    }}>
                      {day && (
                        <>
                          <div style={{ fontSize: 11, fontWeight: 600, color: dayPosts.length > 0 ? ink : muted, marginBottom: 4 }}>{day}</div>
                          {dayPosts.map((p, j) => (
                            <div key={j} style={{
                              fontSize: 10, padding: '2px 5px', borderRadius: 4, marginBottom: 2,
                              background: (STAGES[p.status] ?? STAGES['Draft']).bg,
                              color: (STAGES[p.status] ?? STAGES['Draft']).color,
                              fontWeight: 500, lineHeight: 1.3,
                              overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis'
                            }}>
                              {TYPE_EMOJI[p.content_type]} {p.topic || `Slot ${p.slot}`}
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>

            {/* ── Content Sections ── */}
            {(['Post', 'Video', 'Re-Post'] as const).map(type => {
              const typePosts = byType(type)
              if (typePosts.length === 0) return null
              return (
                <section key={type} style={{ marginBottom: 48 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, paddingBottom: 12, borderBottom: `2px solid ${ink}` }}>
                    <span style={{ fontSize: 20 }}>{TYPE_EMOJI[type]}</span>
                    <div>
                      <div style={{ fontSize: 18, fontWeight: 700 }}>{type === 'Post' ? 'Posts' : type === 'Video' ? 'Videos' : 'Re-Posts'}</div>
                      <div style={{ fontSize: 12, color: muted }}>{typePosts.length} {type === 'Post' ? 'posts' : type === 'Video' ? 'videos' : 're-posts'} planned</div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                    {typePosts.map((p, i) => {
                      const stage = STAGES[p.status] ?? STAGES['Draft']
                      const dateStr = p.scheduled_date
                        ? new Date(p.scheduled_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
                        : 'Date TBD'
                      return (
                        <div key={p.id} style={{ background: 'white', border: `1px solid ${rule}`, borderRadius: 10, overflow: 'hidden' }}>
                          {/* Card header */}
                          <div style={{ padding: '14px 20px', borderBottom: `1px solid ${rule}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#FAFAF9' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: muted }}>
                                {type === 'Post' ? 'Post' : type === 'Video' ? 'Video' : 'Re-Post'} {i + 1}
                              </span>
                              <span style={{ fontSize: 13, fontWeight: 600, color: ink }}>{dateStr}</span>
                              {p.topic && <span style={{ fontSize: 13, color: muted }}>· {p.topic}</span>}
                            </div>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                              <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: stage.bg, color: stage.color, fontWeight: 600 }}>{p.status}</span>
                              <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: '#F5F5F4', color: muted }}>{p.pillar}</span>
                            </div>
                          </div>

                          {/* Card body */}
                          <div style={{ display: 'grid', gridTemplateColumns: p.asset_url && p.asset_type === 'image' ? '1fr 280px' : '1fr', gap: 0 }}>
                            <div style={{ padding: '16px 20px' }}>
                              {p.caption_text && (
                                <div style={{ marginBottom: 14 }}>
                                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: muted, marginBottom: 6 }}>Main Content</div>
                                  <p style={{ fontSize: 13, lineHeight: 1.7, margin: 0, color: ink, whiteSpace: 'pre-wrap' }}>{p.caption_text}</p>
                                </div>
                              )}
                              {p.hashtags && (
                                <div style={{ marginBottom: 14 }}>
                                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: muted, marginBottom: 4 }}>#</div>
                                  <div style={{ fontSize: 12, color: '#185FA5' }}>{p.hashtags}</div>
                                </div>
                              )}
                              {p.asset_url && p.asset_type !== 'image' && (
                                <div>
                                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: muted, marginBottom: 4 }}>Link</div>
                                  <a href={p.asset_url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: '#185FA5', wordBreak: 'break-all' }}>{p.asset_url}</a>
                                </div>
                              )}
                              {p.design_brief && (
                                <div style={{ marginTop: 12, padding: '10px 12px', background: '#F0EDFB', borderRadius: 6, borderLeft: '3px solid #5B21B6' }}>
                                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#5B21B6', marginBottom: 4 }}>Design Brief</div>
                                  <div style={{ fontSize: 12, color: '#3B0764' }}>{p.design_brief}</div>
                                </div>
                              )}
                            </div>

                            {/* Image panel */}
                            {p.asset_url && p.asset_type === 'image' && (
                              <div style={{ borderLeft: `1px solid ${rule}` }}>
                                <img src={p.asset_url} alt="post asset"
                                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', minHeight: 180 }} />
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </section>
              )
            })}

            {/* Footer for print */}
            <div className="no-print" style={{ marginTop: 40, paddingTop: 20, borderTop: `1px solid ${rule}`, display: "flex", justifyContent: "space-between", fontSize: 11, color: muted }}>
              <span>A&B Consulting Group · emily@abconsultingg.com · (708) 377-5727</span>
              <span>{MONTH_FULL[selectedMonth]} {selectedYear} · {selectedClient}</span>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
