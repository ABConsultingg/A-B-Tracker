'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'
import { useParams } from 'next/navigation'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type Profile = {
  id?: string
  client_name: string
  industry: string; location: string; founded: string; key_services: string; service_area: string
  one_sentence: string; tagline: string; known_for: string; customer_say: string; brand_voice: string
  tone_words: string[]; avoid_words: string[]
  target_audience: string; ideal_customer: string; customer_problem: string
  what_makes_different: string; topics_to_avoid: string; social_proof: string; awards: string
  cta_style: string; cta_phone: string; cta_website: string
  content_pillars: string[]; extra_context: string
  competitor_notes: string; competitor_examples: string
}

const EMPTY: Profile = {
  client_name: '', industry: '', location: '', founded: '', key_services: '', service_area: '',
  one_sentence: '', tagline: '', known_for: '', customer_say: '', brand_voice: '',
  tone_words: [], avoid_words: [],
  target_audience: '', ideal_customer: '', customer_problem: '',
  what_makes_different: '', topics_to_avoid: '', social_proof: '', awards: '',
  cta_style: '', cta_phone: '', cta_website: '',
  content_pillars: [], extra_context: '',
  competitor_notes: '', competitor_examples: '',
}

const PILLARS = ['Story', 'Value', 'Culture', 'Fans', 'Current Events', 'Support', 'Goals']
const ink = '#1C1917', muted = '#78716C', rule = '#E7E5E4'

const fieldStyle = {
  width: '100%', padding: '9px 12px', borderRadius: 6,
  border: `1px solid ${rule}`, fontSize: 13, boxSizing: 'border-box' as const,
  fontFamily: 'inherit',
}
const labelStyle = { fontSize: 13, fontWeight: 600 as const, color: ink, display: 'block' as const, marginBottom: 6 }
const hintStyle = { fontSize: 12, color: muted, margin: '0 0 6px' as const }

export default function BrandProfilePage() {
  const params = useParams()
  const clientName = decodeURIComponent(params.client as string)
  const [profile, setProfile] = useState<Profile>({ ...EMPTY, client_name: clientName })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [tagInput, setTagInput] = useState({ tone: '', avoid: '' })

  useEffect(() => { loadProfile() }, [clientName])

  async function loadProfile() {
    setLoading(true)
    const { data } = await supabase.from('social_brand_profiles').select('*').eq('client_name', clientName).single()
    if (data) setProfile({ ...EMPTY, ...data })
    setLoading(false)
  }

  const u = useCallback((field: keyof Profile, value: any) => {
    setProfile(p => ({ ...p, [field]: value }))
  }, [])

  async function save() {
    setSaving(true)
    const row = { ...profile, updated_at: new Date().toISOString() }
    if (profile.id) {
      await supabase.from('social_brand_profiles').update(row).eq('id', profile.id)
    } else {
      const { data } = await supabase.from('social_brand_profiles').insert(row).select().single()
      if (data) setProfile(p => ({ ...p, id: (data as any).id }))
    }
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000)
  }

  function addTag(type: 'tone' | 'avoid') {
    const val = tagInput[type].trim()
    const field = type === 'tone' ? 'tone_words' : 'avoid_words'
    const arr = (profile[field] as string[]) ?? []
    if (val && !arr.includes(val)) u(field, [...arr, val])
    setTagInput(t => ({ ...t, [type]: '' }))
  }

  function removeTag(type: 'tone' | 'avoid', v: string) {
    const field = type === 'tone' ? 'tone_words' : 'avoid_words'
    u(field, ((profile[field] as string[]) ?? []).filter(x => x !== v))
  }

  function TagRow({ type }: { type: 'tone' | 'avoid' }) {
    const field = type === 'tone' ? 'tone_words' : 'avoid_words'
    const arr = (profile[field] as string[]) ?? []
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '8px 10px', borderRadius: 6, border: `1px solid ${rule}`, background: 'white', minHeight: 42, alignItems: 'center' }}>
        {arr.map(v => (
          <span key={v} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 99, background: '#F5F5F4', fontSize: 12, color: ink }}>
            {v}
            <button onClick={() => removeTag(type, v)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: muted, fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
          </span>
        ))}
        <input value={tagInput[type]}
          onChange={e => setTagInput(t => ({ ...t, [type]: e.target.value }))}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(type) } }}
          onBlur={() => addTag(type)}
          placeholder={arr.length === 0 ? 'Type and press Enter…' : ''}
          style={{ border: 'none', outline: 'none', fontSize: 13, minWidth: 120, flex: 1, padding: 2 }} />
      </div>
    )
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: muted }}>Loading…</div>

  return (
    <div style={{ minHeight: '100vh', background: '#FAFAF9', color: ink, fontFamily: "'Inter', system-ui, sans-serif" }}>
      <header style={{ borderBottom: `1px solid ${rule}`, position: 'sticky', top: 0, background: 'white', zIndex: 10 }}>
        <div style={{ maxWidth: 780, margin: '0 auto', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Link href="/dashboard/social" style={{ color: muted, textDecoration: 'none', fontSize: 13 }}>← Social Hub</Link>
            <span style={{ color: rule }}>/</span>
            <div>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, color: muted }}>Brand Profile</div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{clientName}</div>
            </div>
          </div>
          <button onClick={save} disabled={saving}
            style={{ padding: '8px 20px', borderRadius: 6, border: 'none', background: saved ? '#047857' : ink, color: 'white', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
            {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save'}
          </button>
        </div>
      </header>

      <main style={{ maxWidth: 780, margin: '0 auto', padding: '32px 24px' }}>
        <div style={{ padding: '14px 18px', background: '#EDF4FB', borderRadius: 8, marginBottom: 32, fontSize: 13, color: '#185FA5' }}>
          ✦ Claude uses this profile to generate captions that sound like {clientName}. Fill in as much as you can.
        </div>

        {/* Business basics */}
        <section style={{ marginBottom: 40 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 20px', paddingBottom: 10, borderBottom: `2px solid ${rule}` }}>Business basics</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>Industry / niche</label>
              <input value={profile.industry} onChange={e => u('industry', e.target.value)} placeholder="e.g. Residential & Commercial Roofing" style={fieldStyle} />
            </div>
            <div>
              <label style={labelStyle}>Location / Cities served</label>
              <textarea value={profile.location} onChange={e => u('location', e.target.value)} rows={2}
                placeholder="e.g. Burr Ridge, IL · Hinsdale · Western Springs"
                style={{ ...fieldStyle, resize: 'vertical', lineHeight: 1.5 }} />
            </div>
            <div>
              <label style={labelStyle}>Service area</label>
              <input value={profile.service_area} onChange={e => u('service_area', e.target.value)} placeholder="e.g. Will County and surrounding suburbs" style={fieldStyle} />
            </div>
            <div>
              <label style={labelStyle}>Founded</label>
              <input value={profile.founded} onChange={e => u('founded', e.target.value)} placeholder="e.g. 2012" style={fieldStyle} />
            </div>
          </div>
          <div>
            <label style={labelStyle}>Key services</label>
            <input value={profile.key_services} onChange={e => u('key_services', e.target.value)} placeholder="e.g. Roofing, siding, gutters, windows" style={fieldStyle} />
          </div>
        </section>

        {/* Brand voice Q&A */}
        <section style={{ marginBottom: 40 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 20px', paddingBottom: 10, borderBottom: `2px solid ${rule}` }}>Brand voice Q&A</h3>
          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>How would you describe this business in one sentence?</label>
            <input value={profile.one_sentence} onChange={e => u('one_sentence', e.target.value)}
              placeholder="e.g. A veteran-owned roofing company serving the south suburbs with honest work." style={fieldStyle} />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>Tagline or slogan (if any)</label>
            <input value={profile.tagline} onChange={e => u('tagline', e.target.value)} placeholder="e.g. Quality you can count on" style={fieldStyle} />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>What is this business known for in their area?</label>
            <p style={hintStyle}>Think reputation, not services. What do people say when they refer them?</p>
            <textarea value={profile.known_for} onChange={e => u('known_for', e.target.value)} rows={2}
              placeholder="e.g. Always showing up on time. Clean job sites. Owner on every job."
              style={{ ...fieldStyle, resize: 'vertical', lineHeight: 1.5 }} />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>What do their best customers say about them?</label>
            <p style={hintStyle}>Think Google reviews, testimonials, word-of-mouth phrases.</p>
            <textarea value={profile.customer_say} onChange={e => u('customer_say', e.target.value)} rows={3}
              placeholder="e.g. 'They came back to fix a small issue months later, no charge.'"
              style={{ ...fieldStyle, resize: 'vertical', lineHeight: 1.5 }} />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>Describe the brand voice</label>
            <p style={hintStyle}>How should captions sound? Formal or casual? Technical or simple?</p>
            <textarea value={profile.brand_voice} onChange={e => u('brand_voice', e.target.value)} rows={3}
              placeholder="e.g. Confident but not arrogant. Educational without being preachy."
              style={{ ...fieldStyle, resize: 'vertical', lineHeight: 1.5 }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <label style={{ ...labelStyle, marginBottom: 8 }}>Tone words (press Enter after each)</label>
              <TagRow type="tone" />
            </div>
            <div>
              <label style={{ ...labelStyle, marginBottom: 8 }}>Words / phrases to NEVER use</label>
              <TagRow type="avoid" />
            </div>
          </div>
        </section>

        {/* Audience */}
        <section style={{ marginBottom: 40 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 20px', paddingBottom: 10, borderBottom: `2px solid ${rule}` }}>Audience Q&A</h3>
          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>Who is the target audience?</label>
            <input value={profile.target_audience} onChange={e => u('target_audience', e.target.value)}
              placeholder="e.g. Homeowners aged 35-60 in Will County who own their home and take pride in it" style={fieldStyle} />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>Describe the ideal customer</label>
            <textarea value={profile.ideal_customer} onChange={e => u('ideal_customer', e.target.value)} rows={2}
              placeholder="e.g. A homeowner who researches before hiring, values quality over price"
              style={{ ...fieldStyle, resize: 'vertical', lineHeight: 1.5 }} />
          </div>
          <div>
            <label style={labelStyle}>What problem are they trying to solve?</label>
            <textarea value={profile.customer_problem} onChange={e => u('customer_problem', e.target.value)} rows={2}
              placeholder="e.g. Their roof is leaking. They've been burned by a bad contractor before."
              style={{ ...fieldStyle, resize: 'vertical', lineHeight: 1.5 }} />
          </div>
        </section>

        {/* Differentiation */}
        <section style={{ marginBottom: 40 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 20px', paddingBottom: 10, borderBottom: `2px solid ${rule}` }}>Differentiation Q&A</h3>
          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>What makes this business different from competitors?</label>
            <p style={hintStyle}>Be specific — not just "quality work."</p>
            <textarea value={profile.what_makes_different} onChange={e => u('what_makes_different', e.target.value)} rows={3}
              placeholder="e.g. Veteran-owned. Owner on every job. No subcontractors. 5-year workmanship warranty."
              style={{ ...fieldStyle, resize: 'vertical', lineHeight: 1.5 }} />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>Social proof (reviews, certifications, awards)</label>
            <textarea value={profile.social_proof} onChange={e => u('social_proof', e.target.value)} rows={2}
              placeholder="e.g. 4.9 stars on Google with 200+ reviews. GAF Master Elite certified."
              style={{ ...fieldStyle, resize: 'vertical', lineHeight: 1.5 }} />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>Awards or recognition</label>
            <input value={profile.awards} onChange={e => u('awards', e.target.value)}
              placeholder="e.g. Best of Houzz 2024. BBB Accredited." style={fieldStyle} />
          </div>
          <div>
            <label style={labelStyle}>Topics / content areas to avoid</label>
            <textarea value={profile.topics_to_avoid} onChange={e => u('topics_to_avoid', e.target.value)} rows={2}
              placeholder="e.g. Never mention specific pricing. No competitor comparisons. No political content."
              style={{ ...fieldStyle, resize: 'vertical', lineHeight: 1.5 }} />
          </div>
        </section>

        {/* CTA */}
        <section style={{ marginBottom: 40 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 20px', paddingBottom: 10, borderBottom: `2px solid ${rule}` }}>Call to action</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
            <div>
              <label style={labelStyle}>Preferred CTA</label>
              <input value={profile.cta_style} onChange={e => u('cta_style', e.target.value)} placeholder="e.g. Call for a free estimate" style={fieldStyle} />
            </div>
            <div>
              <label style={labelStyle}>Phone</label>
              <input value={profile.cta_phone} onChange={e => u('cta_phone', e.target.value)} placeholder="e.g. (708) 555-1234" style={fieldStyle} />
            </div>
            <div>
              <label style={labelStyle}>Website</label>
              <input value={profile.cta_website} onChange={e => u('cta_website', e.target.value)} placeholder="e.g. example.com" style={fieldStyle} />
            </div>
          </div>
        </section>

        {/* Content pillars */}
        <section style={{ marginBottom: 40 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 12px', paddingBottom: 10, borderBottom: `2px solid ${rule}` }}>Content pillars</h3>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {PILLARS.map(p => {
              const active = (profile.content_pillars ?? []).includes(p)
              return (
                <button key={p} onClick={() => u('content_pillars', active
                  ? profile.content_pillars.filter((x: string) => x !== p)
                  : [...(profile.content_pillars ?? []), p])}
                  style={{ padding: '7px 16px', borderRadius: 99, fontSize: 13, fontWeight: 500, cursor: 'pointer', border: `1px solid ${active ? ink : rule}`, background: active ? ink : 'white', color: active ? 'white' : muted }}>
                  {p}
                </button>
              )
            })}
          </div>
        </section>

        {/* Competitor */}
        <section style={{ marginBottom: 40 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 20px', paddingBottom: 10, borderBottom: `2px solid ${rule}` }}>Competitor reference</h3>
          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>Who are the main competitors and how is this client different?</label>
            <textarea value={profile.competitor_notes} onChange={e => u('competitor_notes', e.target.value)} rows={3}
              placeholder="e.g. Main competitors: ABC Roofing, XYZ Exteriors. They run heavy discount promotions. We differentiate on quality."
              style={{ ...fieldStyle, resize: 'vertical', lineHeight: 1.5 }} />
          </div>
          <div>
            <label style={labelStyle}>Paste competitor social media posts here</label>
            <p style={hintStyle}>Claude will NOT copy these — uses them as contrast/inspiration.</p>
            <textarea value={profile.competitor_examples} onChange={e => u('competitor_examples', e.target.value)} rows={6}
              placeholder="Paste 1-3 real competitor posts here…"
              style={{ ...fieldStyle, resize: 'vertical', lineHeight: 1.5 }} />
          </div>
        </section>

        {/* Extra context */}
        <section style={{ marginBottom: 40 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 20px', paddingBottom: 10, borderBottom: `2px solid ${rule}` }}>Extra context</h3>
          <div>
            <label style={labelStyle}>Anything else Claude should know about this client?</label>
            <p style={hintStyle}>Recent news, upcoming launches, seasonal focus, owner personality, anything useful.</p>
            <textarea value={profile.extra_context} onChange={e => u('extra_context', e.target.value)} rows={4}
              placeholder="e.g. The owner is named Mike. They're launching a new gutter guard product in August."
              style={{ ...fieldStyle, resize: 'vertical', lineHeight: 1.5 }} />
          </div>
        </section>

        <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 20, borderTop: `1px solid ${rule}` }}>
          <button onClick={save} disabled={saving}
            style={{ padding: '10px 28px', borderRadius: 6, border: 'none', background: saved ? '#047857' : ink, color: 'white', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
            {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save profile'}
          </button>
        </div>
      </main>
    </div>
  )
}
