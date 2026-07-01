'use client'

import { useState, Suspense, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const PLATFORMS = [
  { key: 'google_search',   label: 'Google Search',      color: '#4285F4', icon: '🔍', desc: 'Intent-based search ads with keywords' },
  { key: 'meta',            label: 'Meta Ads',            color: '#0866FF', icon: '📘', desc: 'Facebook + Instagram social ads' },
  { key: 'google_display',  label: 'Google Display',      color: '#34A853', icon: '🖼', desc: 'Banner ads across millions of sites' },
  { key: 'lsa',             label: 'Google LSA',          color: '#FBBC04', icon: '⭐', desc: 'Pay-per-lead local service ads' },
  { key: 'linkedin',        label: 'LinkedIn Ads',        color: '#0A66C2', icon: '💼', desc: 'B2B targeting by job title & industry' },
  { key: 'youtube',         label: 'YouTube Ads',         color: '#FF0000', icon: '▶️', desc: 'Video pre-roll and skippable ads' },
  { key: 'nextdoor',        label: 'Nextdoor Ads',        color: '#00B246', icon: '🏘', desc: 'Hyperlocal neighborhood targeting' },
  { key: 'bing',            label: 'Microsoft/Bing',      color: '#008272', icon: '🔷', desc: 'B2B-friendly, cheaper CPCs' },
]

const OBJECTIVES = {
  google_search:  ['leads', 'traffic', 'calls'],
  meta:           ['leads', 'traffic', 'awareness', 'conversions', 'engagement'],
  google_display: ['awareness', 'retargeting', 'traffic'],
  lsa:            ['leads', 'calls'],
  linkedin:       ['leads', 'traffic', 'awareness'],
  youtube:        ['awareness', 'leads', 'traffic'],
  nextdoor:       ['leads', 'awareness'],
  bing:           ['leads', 'traffic', 'calls'],
}

const CAMPAIGN_TYPES: Record<string, string[]> = {
  google_search:  ['standard_search', 'performance_max', 'demand_gen'],
  meta:           ['lead_gen', 'traffic', 'awareness', 'retargeting', 'conversion'],
  google_display: ['display', 'retargeting', 'performance_max'],
  lsa:            ['local_services'],
  linkedin:       ['sponsored_content', 'message_ads', 'lead_gen'],
  youtube:        ['skippable_instream', 'non_skippable', 'bumper', 'video_discovery'],
  nextdoor:       ['sponsored_post', 'local_deal'],
  bing:           ['standard_search', 'performance_max'],
}

const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function NewCampaignInner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const now = new Date()

  const [step, setStep] = useState(1)
  const [clients, setClients] = useState<{ id: string; name: string }[]>([])

  useEffect(() => {
    supabase.from('clients').select('id, name').eq('status', 'active').order('name')
      .then(({ data }) => setClients(data ?? []))
  }, [])
  const [building, setBuilding] = useState(false)
  const [result, setResult] = useState<Record<string, unknown> | null>(null)
  const [error, setError] = useState('')
  const [copiedKey, setCopiedKey] = useState('')

  const [form, setForm] = useState({
    client_id: '',
    platform: searchParams.get('platform') || '',
    campaign_type: '',
    objective: '',
    budget_daily: '',
    budget_monthly: '',
    geo: '',
    service_product: '',
    target_audience_notes: '',
    campaign_name: '',
    month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
  })

  function set(key: string, val: string) {
    setForm(f => ({ ...f, [key]: val }))
  }

  async function build() {
    setBuilding(true)
    setError('')
    try {
      const res = await fetch('/api/ppc/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          budget_daily: form.budget_daily ? parseFloat(form.budget_daily) : null,
          budget_monthly: form.budget_monthly ? parseFloat(form.budget_monthly) : null,
        }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setResult(data)
      setStep(4)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Build failed')
    }
    setBuilding(false)
  }

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text)
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(''), 2000)
  }

  const ink = '#1C1917'
  const muted = '#78716C'
  const platform = PLATFORMS.find(p => p.key === form.platform)
  const output = result?.output as Record<string, unknown> | null

  return (
    <div style={{ minHeight: '100vh', background: '#FAFAF9', color: ink, fontFamily: "'Inter', system-ui, sans-serif" }}>
      {/* Header */}
      <header style={{ borderBottom: '1px solid #E7E5E4' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Link href="/dashboard/ppc" style={{ fontSize: 13, color: muted, textDecoration: 'none' }}>← PPC Hub</Link>
            <span style={{ color: '#D6D3D1' }}>/</span>
            <span style={{ fontSize: 13, fontWeight: 500 }}>New Campaign</span>
          </div>
          {step < 4 && (
            <div style={{ display: 'flex', gap: 6 }}>
              {[1,2,3].map(s => (
                <div key={s} style={{ width: 24, height: 4, borderRadius: 99, background: s <= step ? '#4285F4' : '#E7E5E4' }} />
              ))}
            </div>
          )}
        </div>
      </header>

      <main style={{ maxWidth: 900, margin: '0 auto', padding: '40px 24px' }}>

        {/* STEP 1 — Platform + Client */}
        {step === 1 && (
          <div>
            <h2 style={{ fontSize: 28, fontWeight: 600, letterSpacing: '-0.02em', marginBottom: 8 }}>Which platform?</h2>
            <p style={{ color: muted, fontSize: 14, marginBottom: 32 }}>Claude will generate the full campaign structure for the chosen platform.</p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 32 }}>
              {PLATFORMS.map(p => (
                <button key={p.key} onClick={() => set('platform', p.key)}
                  style={{
                    padding: '16px 14px', borderRadius: 10, border: `2px solid ${form.platform === p.key ? p.color : '#E7E5E4'}`,
                    background: form.platform === p.key ? p.color + '10' : 'white',
                    cursor: 'pointer', textAlign: 'left',
                  }}>
                  <div style={{ fontSize: 22, marginBottom: 6 }}>{p.icon}</div>
                  <div style={{ fontWeight: 600, fontSize: 13, color: ink, marginBottom: 3 }}>{p.label}</div>
                  <div style={{ fontSize: 11, color: muted, lineHeight: 1.4 }}>{p.desc}</div>
                </button>
              ))}
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Client</label>
              <select value={form.client_id} onChange={e => set('client_id', e.target.value)}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 6, border: '1px solid #E7E5E4', fontSize: 14, background: 'white', color: ink }}>
                <option value="">Select a client…</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            <button
              disabled={!form.platform || !form.client_id}
              onClick={() => setStep(2)}
              style={{ padding: '12px 28px', background: form.platform && form.client_id ? '#4285F4' : '#E7E5E4', color: 'white', borderRadius: 8, border: 'none', fontSize: 15, fontWeight: 600, cursor: form.platform && form.client_id ? 'pointer' : 'not-allowed' }}>
              Next: Campaign Details →
            </button>
          </div>
        )}

        {/* STEP 2 — Campaign Details */}
        {step === 2 && (
          <div>
            <h2 style={{ fontSize: 28, fontWeight: 600, letterSpacing: '-0.02em', marginBottom: 8 }}>
              {platform?.icon} {platform?.label} campaign
            </h2>
            <p style={{ color: muted, fontSize: 14, marginBottom: 32 }}>Fill in the basics — Claude handles the rest.</p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Campaign Type</label>
                <select value={form.campaign_type} onChange={e => set('campaign_type', e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 6, border: '1px solid #E7E5E4', fontSize: 14, background: 'white', color: ink }}>
                  <option value="">Select type…</option>
                  {(CAMPAIGN_TYPES[form.platform] || []).map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Objective</label>
                <select value={form.objective} onChange={e => set('objective', e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 6, border: '1px solid #E7E5E4', fontSize: 14, background: 'white', color: ink }}>
                  <option value="">Select objective…</option>
                  {((OBJECTIVES as Record<string, string[]>)[form.platform] || []).map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Daily Budget ($)</label>
                <input type="number" value={form.budget_daily} onChange={e => set('budget_daily', e.target.value)} placeholder="e.g. 50"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 6, border: '1px solid #E7E5E4', fontSize: 14, boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Monthly Budget ($)</label>
                <input type="number" value={form.budget_monthly} onChange={e => set('budget_monthly', e.target.value)} placeholder="e.g. 1500"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 6, border: '1px solid #E7E5E4', fontSize: 14, boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Month</label>
                <select value={form.month} onChange={e => set('month', e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 6, border: '1px solid #E7E5E4', fontSize: 14, background: 'white', color: ink }}>
                  {[-1, 0, 1, 2].map(offset => {
                    const d = new Date(now.getFullYear(), now.getMonth() + offset, 1)
                    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
                    return <option key={val} value={val}>{MONTH_LABELS[d.getMonth()]} {d.getFullYear()}</option>
                  })}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Geographic Target</label>
                <input value={form.geo} onChange={e => set('geo', e.target.value)} placeholder="e.g. Elmhurst, IL 25-mile radius"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 6, border: '1px solid #E7E5E4', fontSize: 14, boxSizing: 'border-box' }} />
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Service / Product Being Promoted</label>
              <input value={form.service_product} onChange={e => set('service_product', e.target.value)}
                placeholder="e.g. Roof replacement, storm damage repair, free inspection"
                style={{ width: '100%', padding: '10px 12px', borderRadius: 6, border: '1px solid #E7E5E4', fontSize: 14, boxSizing: 'border-box' }} />
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Target Audience Notes <span style={{ fontWeight: 400, color: muted }}>(optional)</span></label>
              <textarea value={form.target_audience_notes} onChange={e => set('target_audience_notes', e.target.value)}
                rows={3} placeholder="e.g. Homeowners 35-65, recent hail damage, Chicago suburbs, household income $80k+"
                style={{ width: '100%', padding: '10px 12px', borderRadius: 6, border: '1px solid #E7E5E4', fontSize: 14, resize: 'vertical', boxSizing: 'border-box' }} />
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setStep(1)} style={{ padding: '12px 20px', background: 'white', border: '1px solid #E7E5E4', borderRadius: 8, fontSize: 14, cursor: 'pointer', color: ink }}>← Back</button>
              <button
                disabled={!form.objective || !form.service_product}
                onClick={() => setStep(3)}
                style={{ padding: '12px 28px', background: form.objective && form.service_product ? '#4285F4' : '#E7E5E4', color: 'white', borderRadius: 8, border: 'none', fontSize: 15, fontWeight: 600, cursor: form.objective && form.service_product ? 'pointer' : 'not-allowed' }}>
                Next: Review & Build →
              </button>
            </div>
          </div>
        )}

        {/* STEP 3 — Review */}
        {step === 3 && (
          <div>
            <h2 style={{ fontSize: 28, fontWeight: 600, letterSpacing: '-0.02em', marginBottom: 8 }}>Ready to build.</h2>
            <p style={{ color: muted, fontSize: 14, marginBottom: 32 }}>Claude will generate keywords, ad copy, audiences, and optimization tips. Takes ~30 seconds.</p>

            <div style={{ background: 'white', border: '1px solid #E7E5E4', borderRadius: 10, padding: 24, marginBottom: 32 }}>
              {[
                ['Platform', platform?.label],
                ['Objective', form.objective],
                ['Campaign Type', form.campaign_type || '—'],
                ['Service', form.service_product],
                ['Geo', form.geo || '—'],
                ['Budget', form.budget_daily ? `$${form.budget_daily}/day` : form.budget_monthly ? `$${form.budget_monthly}/mo` : '—'],
                ['Month', form.month],
              ].map(([label, val]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #F5F5F4', fontSize: 14 }}>
                  <span style={{ color: muted }}>{label}</span>
                  <span style={{ fontWeight: 500 }}>{val}</span>
                </div>
              ))}
            </div>

            {error && <div style={{ background: '#FEE2E2', color: '#b91c1c', padding: '12px 16px', borderRadius: 8, fontSize: 13, marginBottom: 16 }}>{error}</div>}

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setStep(2)} style={{ padding: '12px 20px', background: 'white', border: '1px solid #E7E5E4', borderRadius: 8, fontSize: 14, cursor: 'pointer', color: ink }}>← Back</button>
              <button onClick={build} disabled={building}
                style={{ padding: '12px 32px', background: building ? '#93C5FD' : '#4285F4', color: 'white', borderRadius: 8, border: 'none', fontSize: 15, fontWeight: 600, cursor: building ? 'wait' : 'pointer' }}>
                {building ? '⏳ Building campaign…' : '🚀 Build with Claude'}
              </button>
            </div>
          </div>
        )}

        {/* STEP 4 — Results */}
        {step === 4 && output && (() => {
          const campaignSummary = output.campaign_summary as string
          const estimatedPerf = output.estimated_performance as Record<string, string> | undefined
          const adGroups = Array.isArray(output.ad_groups) ? output.ad_groups as Record<string, unknown>[] : undefined
          const adSets = Array.isArray(output.ad_sets) ? output.ad_sets as Record<string, unknown>[] : undefined
          const globalNegatives = output.global_negatives as string[] | undefined
          const optimizationTips = output.optimization_tips as string[] | undefined
          return (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <h2 style={{ fontSize: 28, fontWeight: 600, letterSpacing: '-0.02em', margin: 0 }}>Campaign built ✓</h2>
              <Link href={`/dashboard/ppc/${(result as Record<string, unknown>)?.campaign_id}`}
                style={{ padding: '8px 16px', background: '#4285F4', color: 'white', borderRadius: 6, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
                View Full Campaign →
              </Link>
            </div>
            <p style={{ color: muted, fontSize: 14, marginBottom: 24 }}>{campaignSummary}</p>

            {/* Estimated Performance */}
            {estimatedPerf && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 28 }}>
                {Object.entries(estimatedPerf).map(([k, v]) => (
                  <div key={k} style={{ background: 'white', border: '1px solid #E7E5E4', borderRadius: 8, padding: '12px 14px' }}>
                    <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, color: muted, marginBottom: 4 }}>{k.replace(/_/g, ' ')}</div>
                    <div style={{ fontFamily: 'monospace', fontSize: 16, fontWeight: 700, color: '#4285F4' }}>{v}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Keywords / Ad Groups (Google/Bing) */}
            {adGroups && (
              <div style={{ marginBottom: 28 }}>
                <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Keywords & Ad Copy</h3>
                {adGroups.map((group, gi) => {
                  const groupName = group.name as string
                  const groupTheme = group.theme as string
                  const groupKeywords = group.keywords as Record<string, unknown>[] | undefined
                  const groupNegatives = group.negative_keywords as string[] | undefined
                  const groupAds = group.ads as Record<string, unknown>[] | undefined
                  return (
                  <div key={gi} style={{ background: 'white', border: '1px solid #E7E5E4', borderRadius: 8, marginBottom: 12, overflow: 'hidden' }}>
                    <div style={{ padding: '12px 16px', background: '#F5F5F4', borderBottom: '1px solid #E7E5E4', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <span style={{ fontWeight: 600, fontSize: 14 }}>{groupName}</span>
                        <span style={{ fontSize: 12, color: muted, marginLeft: 8 }}>{groupTheme}</span>
                      </div>
                    </div>
                    <div style={{ padding: 16 }}>
                      <div style={{ marginBottom: 14 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: muted, textTransform: 'uppercase', marginBottom: 8 }}>Keywords ({groupKeywords?.length})</div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {groupKeywords?.map((kw, ki) => {
                            const kwKeyword = kw.keyword as string
                            const kwMatchType = kw.match_type as string
                            const kwBid = kw.recommended_bid as number | undefined
                            return (
                            <span key={ki} style={{
                              fontSize: 12, padding: '3px 8px', borderRadius: 4, fontFamily: 'monospace',
                              background: kwMatchType === 'exact' ? '#EDF4FB' : kwMatchType === 'phrase' ? '#EAF3DE' : '#FFF7ED',
                              color: kwMatchType === 'exact' ? '#185FA5' : kwMatchType === 'phrase' ? '#047857' : '#B45309',
                            }}>
                              {kwMatchType === 'exact' ? `[${kwKeyword}]` : kwMatchType === 'phrase' ? `"${kwKeyword}"` : kwKeyword}
                              {kwBid ? ` · $${kwBid}` : ''}
                            </span>
                          )})}
                        </div>
                        {groupNegatives && (
                          <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 11, color: muted, fontWeight: 600 }}>Negatives:</span>
                            {groupNegatives.map((neg, ni) => (
                              <span key={ni} style={{ fontSize: 12, padding: '3px 8px', borderRadius: 4, background: '#FEE2E2', color: '#b91c1c', fontFamily: 'monospace' }}>-{neg}</span>
                            ))}
                          </div>
                        )}
                      </div>
                      {groupAds?.map((ad, ai) => {
                        const adHeadlines = ad.headlines as string[] | undefined
                        const adDescs = ad.descriptions as string[] | undefined
                        const adPath1 = ad.path1 as string
                        const adPath2 = ad.path2 as string
                        return (
                        <div key={ai} style={{ background: '#FAFAF9', borderRadius: 6, padding: 14, border: '1px solid #E7E5E4' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                            <span style={{ fontSize: 11, fontWeight: 600, color: muted, textTransform: 'uppercase' }}>RSA Ad Copy</span>
                            <button onClick={() => copy(
                              `HEADLINES:\n${adHeadlines?.map((h, i) => `${i+1}. ${h}`).join('\n') ?? ''}\n\nDESCRIPTIONS:\n${adDescs?.map((d, i) => `${i+1}. ${d}`).join('\n') ?? ''}\n\nPath 1: ${adPath1}\nPath 2: ${adPath2}`,
                              `ad-${gi}-${ai}`
                            )} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 4, border: '1px solid #E7E5E4', background: copiedKey === `ad-${gi}-${ai}` ? '#EAF3DE' : 'white', cursor: 'pointer', color: copiedKey === `ad-${gi}-${ai}` ? '#047857' : ink }}>
                              {copiedKey === `ad-${gi}-${ai}` ? '✓ Copied' : 'Copy all'}
                            </button>
                          </div>
                          {adHeadlines && (
                            <div style={{ marginBottom: 8 }}>
                              <div style={{ fontSize: 11, color: muted, fontWeight: 600, marginBottom: 4 }}>HEADLINES (15)</div>
                              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                {adHeadlines.map((h, hi) => (
                                  <span key={hi} style={{ fontSize: 12, padding: '2px 6px', background: 'white', border: '1px solid #E7E5E4', borderRadius: 4 }}>
                                    <span style={{ color: muted, fontSize: 10 }}>{hi+1}. </span>{h}
                                    <span style={{ color: h.length > 30 ? '#b91c1c' : '#A8A29E', fontSize: 10, marginLeft: 4 }}>{h.length}/30</span>
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                          {adDescs && (
                            <div>
                              <div style={{ fontSize: 11, color: muted, fontWeight: 600, marginBottom: 4 }}>DESCRIPTIONS (4)</div>
                              {adDescs.map((d, di) => (
                                <div key={di} style={{ fontSize: 13, padding: '4px 0', borderBottom: di < adDescs.length - 1 ? '1px solid #E7E5E4' : undefined }}>
                                  <span style={{ color: muted, fontSize: 11 }}>{di+1}. </span>{d}
                                  <span style={{ color: d.length > 90 ? '#b91c1c' : '#A8A29E', fontSize: 10, marginLeft: 6 }}>{d.length}/90</span>
                                </div>
                              ))}
                            </div>
                          )}
                          <div style={{ marginTop: 8, fontSize: 12, color: muted }}>
                            Path: <span style={{ fontFamily: 'monospace', color: '#4285F4' }}>{adPath1} / {adPath2}</span>
                          </div>
                        </div>
                      )})}
                    </div>
                  </div>
                )})}

                {globalNegatives && (
                  <div style={{ background: 'white', border: '1px solid #E7E5E4', borderRadius: 8, padding: 16, marginBottom: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: muted, marginBottom: 8, textTransform: 'uppercase' }}>Global Negative Keywords</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {globalNegatives.map((neg, i) => (
                        <span key={i} style={{ fontSize: 12, padding: '3px 8px', borderRadius: 4, background: '#FEE2E2', color: '#b91c1c', fontFamily: 'monospace' }}>-{neg}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Meta / LinkedIn ad sets */}
            {adSets && (
              <div style={{ marginBottom: 28 }}>
                <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Ad Sets & Creative</h3>
                {adSets.map((set, si) => {
                  const setName = set.name as string
                  const setAds = set.ads as Record<string, unknown>[] | undefined
                  const setAudience = set.audience ?? null
                  return (
                  <div key={si} style={{ background: 'white', border: '1px solid #E7E5E4', borderRadius: 8, marginBottom: 12, overflow: 'hidden' }}>
                    <div style={{ padding: '12px 16px', background: '#F5F5F4', borderBottom: '1px solid #E7E5E4' }}>
                      <span style={{ fontWeight: 600, fontSize: 14 }}>{setName}</span>
                    </div>
                    <div style={{ padding: 16 }}>
                      {setAudience && (
                        <div style={{ marginBottom: 14 }}>
                          <div style={{ fontSize: 11, fontWeight: 600, color: muted, textTransform: 'uppercase', marginBottom: 8 }}>Audience Targeting</div>
                          <pre style={{ fontSize: 12, background: '#F5F5F4', padding: 10, borderRadius: 6, overflow: 'auto', margin: 0, color: ink }}>
                            {JSON.stringify(setAudience, null, 2)}
                          </pre>
                          <button onClick={() => copy(JSON.stringify(setAudience, null, 2), `aud-${si}`)}
                            style={{ marginTop: 6, fontSize: 12, padding: '4px 10px', borderRadius: 4, border: '1px solid #E7E5E4', background: copiedKey === `aud-${si}` ? '#EAF3DE' : 'white', cursor: 'pointer', color: copiedKey === `aud-${si}` ? '#047857' : ink }}>
                            {copiedKey === `aud-${si}` ? '✓ Copied' : 'Copy targeting'}
                          </button>
                        </div>
                      )}
                      {setAds?.map((ad, ai) => {
                        const adPrimaryText = ad.primary_text as string | undefined
                        const adHeadline = ad.headline as string | undefined
                        const adDescription = ad.description as string | undefined
                        const adIntroText = ad.intro_text as string | undefined
                        const adCta = ad.cta as string | undefined
                        const adImageDir = ad.image_direction as string | undefined
                        return (
                        <div key={ai} style={{ background: '#FAFAF9', borderRadius: 6, padding: 14, border: '1px solid #E7E5E4', marginBottom: 8 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                            <span style={{ fontSize: 11, fontWeight: 600, color: muted, textTransform: 'uppercase' }}>{ad.format as string}</span>
                            <button onClick={() => copy(JSON.stringify(ad, null, 2), `ad-${si}-${ai}`)}
                              style={{ fontSize: 12, padding: '4px 10px', borderRadius: 4, border: '1px solid #E7E5E4', background: copiedKey === `ad-${si}-${ai}` ? '#EAF3DE' : 'white', cursor: 'pointer', color: copiedKey === `ad-${si}-${ai}` ? '#047857' : ink }}>
                              {copiedKey === `ad-${si}-${ai}` ? '✓ Copied' : 'Copy ad'}
                            </button>
                          </div>
                          {adPrimaryText && <div style={{ marginBottom: 6 }}><span style={{ fontSize: 11, color: muted }}>Primary: </span><span style={{ fontSize: 13 }}>{adPrimaryText}</span></div>}
                          {adHeadline && <div style={{ marginBottom: 6 }}><span style={{ fontSize: 11, color: muted }}>Headline: </span><span style={{ fontSize: 13, fontWeight: 600 }}>{adHeadline}</span></div>}
                          {adDescription && <div style={{ marginBottom: 6 }}><span style={{ fontSize: 11, color: muted }}>Description: </span><span style={{ fontSize: 13 }}>{adDescription}</span></div>}
                          {adIntroText && <div style={{ marginBottom: 6 }}><span style={{ fontSize: 11, color: muted }}>Intro: </span><span style={{ fontSize: 13 }}>{adIntroText}</span></div>}
                          {adCta && <div style={{ marginBottom: 6 }}><span style={{ fontSize: 11, color: muted }}>CTA: </span><span style={{ fontSize: 12, padding: '2px 8px', background: '#EDF4FB', borderRadius: 4, color: '#185FA5', fontWeight: 600 }}>{adCta}</span></div>}
                          {adImageDir && <div style={{ fontSize: 12, color: muted, fontStyle: 'italic', padding: '6px 8px', background: '#FFFBEB', borderRadius: 4, marginTop: 6 }}>Creative: {adImageDir}</div>}
                        </div>
                      )})}
                    </div>
                  </div>
                )})}
              </div>
            )}

            {/* Optimization Tips */}
            {optimizationTips && (
              <div style={{ background: 'white', border: '1px solid #E7E5E4', borderRadius: 8, padding: 20, marginBottom: 24 }}>
                <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>Optimization Tips</h3>
                {optimizationTips.map((tip, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: i < optimizationTips.length - 1 ? '1px solid #F5F5F4' : undefined }}>
                    <span style={{ color: '#4285F4', fontWeight: 700, flexShrink: 0 }}>{i+1}.</span>
                    <span style={{ fontSize: 13, color: ink }}>{tip}</span>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <Link href="/dashboard/ppc"
                style={{ padding: '10px 20px', background: 'white', border: '1px solid #E7E5E4', borderRadius: 8, textDecoration: 'none', fontSize: 14, color: ink }}>
                ← Back to Hub
              </Link>
              <button onClick={() => { setStep(1); setResult(null); setForm(f => ({ ...f, campaign_name: '', service_product: '', target_audience_notes: '' })) }}
                style={{ padding: '10px 20px', background: '#F5F5F4', border: 'none', borderRadius: 8, fontSize: 14, cursor: 'pointer', color: ink }}>
                Build Another
              </button>
            </div>
          </div>
          )
        })()}
      </main>
    </div>
  )
}

export default function NewCampaignPage() {
  return <Suspense fallback={<div style={{ padding: 48, color: '#78716C' }}>Loading…</div>}><NewCampaignInner /></Suspense>
}
