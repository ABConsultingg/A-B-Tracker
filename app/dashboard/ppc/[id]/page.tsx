'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useParams } from 'next/navigation'
import Link from 'next/link'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const PLATFORM_LABELS: Record<string, string> = {
  google_search: 'Google Search', google_display: 'Google Display', youtube: 'YouTube',
  meta: 'Meta', linkedin: 'LinkedIn', nextdoor: 'Nextdoor', bing: 'Microsoft/Bing', lsa: 'Google LSA',
}

const MATCH_TYPE_COLORS: Record<string, { bg: string; color: string }> = {
  exact:    { bg: '#EDF4FB', color: '#185FA5' },
  phrase:   { bg: '#EAF3DE', color: '#047857' },
  broad:    { bg: '#FFF7ED', color: '#B45309' },
  negative: { bg: '#FEE2E2', color: '#b91c1c' },
}

export default function CampaignDetailPage() {
  const { id } = useParams() as { id: string }
  const [campaign, setCampaign] = useState<Record<string, unknown> | null>(null)
  const [keywords, setKeywords] = useState<Record<string, unknown>[]>([])
  const [ads, setAds] = useState<Record<string, unknown>[]>([])
  const [audiences, setAudiences] = useState<Record<string, unknown>[]>([])
  const [loading, setLoading] = useState(true)
  const [copiedKey, setCopiedKey] = useState('')
  const [activeTab, setActiveTab] = useState<'keywords' | 'ads' | 'audiences'>('keywords')

  useEffect(() => { loadData() }, [id])

  async function loadData() {
    setLoading(true)
    const [{ data: camp }, { data: kws }, { data: adRows }, { data: auds }] = await Promise.all([
      supabase.from('ppc_campaigns').select('*, clients(name)').eq('id', id).single(),
      supabase.from('ppc_keywords').select('*').eq('campaign_id', id).order('is_negative').order('ad_group'),
      supabase.from('ppc_ads').select('*').eq('campaign_id', id),
      supabase.from('ppc_audiences').select('*').eq('campaign_id', id),
    ])
    setCampaign(camp as Record<string, unknown>)
    setKeywords(kws ?? [])
    setAds(adRows ?? [])
    setAudiences(auds ?? [])
    setLoading(false)
  }

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text)
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(''), 2000)
  }

  function exportKeywords(type: 'all' | 'positive' | 'negative') {
    const filtered = type === 'all' ? keywords : keywords.filter(k => type === 'negative' ? k.is_negative : !k.is_negative)
    const lines = filtered.map(k => {
      const kw = k.keyword as string
      if (k.is_negative) return `-${kw}`
      if (k.match_type === 'exact') return `[${kw}]`
      if (k.match_type === 'phrase') return `"${kw}"`
      return kw
    })
    copy(lines.join('\n'), `kw-export-${type}`)
  }

  const ink = '#1C1917'
  const muted = '#78716C'

  if (loading) return <div style={{ padding: 48, color: muted, fontFamily: "'Inter', sans-serif" }}>Loading campaign…</div>
  if (!campaign) return <div style={{ padding: 48, color: muted, fontFamily: "'Inter', sans-serif" }}>Campaign not found.</div>

  // Group keywords by ad group
  const kwByGroup: Record<string, Record<string, unknown>[]> = {}
  for (const kw of keywords) {
    const group = (kw.ad_group as string) || '_ungrouped'
    if (!kwByGroup[group]) kwByGroup[group] = []
    kwByGroup[group].push(kw)
  }

  const adsByGroup: Record<string, Record<string, unknown>[]> = {}
  for (const ad of ads) {
    const group = (ad.ad_group as string) || '_ungrouped'
    if (!adsByGroup[group]) adsByGroup[group] = []
    adsByGroup[group].push(ad)
  }

  const positiveKws = keywords.filter(k => !k.is_negative)
  const negativeKws = keywords.filter(k => k.is_negative)

  return (
    <div style={{ minHeight: '100vh', background: '#FAFAF9', color: ink, fontFamily: "'Inter', system-ui, sans-serif" }}>
      <header style={{ borderBottom: '1px solid #E7E5E4' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Link href="/dashboard/ppc" style={{ fontSize: 13, color: muted, textDecoration: 'none' }}>← PPC Hub</Link>
            <span style={{ color: '#D6D3D1' }}>/</span>
            <span style={{ fontSize: 13, fontWeight: 500 }}>{campaign.campaign_name as string}</span>
          </div>
          <span style={{
            fontSize: 11, padding: '3px 10px', borderRadius: 99, fontWeight: 600,
            background: campaign.status === 'active' ? '#EAF3DE' : '#F5F5F4',
            color: campaign.status === 'active' ? '#047857' : muted,
          }}>{campaign.status as string}</span>
        </div>
      </header>

      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 24px' }}>
        {/* Campaign summary */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginBottom: 28 }}>
          {[
            { label: 'Client', value: (campaign.clients as { name: string })?.name },
            { label: 'Platform', value: PLATFORM_LABELS[campaign.platform as string] || campaign.platform as string },
            { label: 'Objective', value: campaign.objective as string },
            { label: 'Budget', value: campaign.budget_daily ? `$${campaign.budget_daily}/day` : campaign.budget_monthly ? `$${campaign.budget_monthly}/mo` : '—' },
            { label: 'Geo', value: (campaign.geo as string) || '—' },
          ].map(({ label, value }) => (
            <div key={label} style={{ background: 'white', border: '1px solid #E7E5E4', borderRadius: 8, padding: '12px 14px' }}>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, color: muted, marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 20, padding: 4, background: '#F5F5F4', borderRadius: 8, width: 'fit-content' }}>
          {[
            { key: 'keywords', label: `Keywords (${positiveKws.length})` },
            { key: 'ads', label: `Ad Copy (${ads.length})` },
            { key: 'audiences', label: `Audiences (${audiences.length})` },
          ].map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key as typeof activeTab)}
              style={{ padding: '6px 16px', fontSize: 13, fontWeight: 500, borderRadius: 6, border: 'none', cursor: 'pointer',
                background: activeTab === tab.key ? '#1C1917' : 'transparent',
                color: activeTab === tab.key ? '#FAFAF9' : muted }}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* KEYWORDS TAB */}
        {activeTab === 'keywords' && (
          <div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <button onClick={() => exportKeywords('positive')}
                style={{ fontSize: 13, padding: '7px 14px', borderRadius: 6, border: '1px solid #E7E5E4', background: 'white', cursor: 'pointer', color: copiedKey === 'kw-export-positive' ? '#047857' : ink }}>
                {copiedKey === 'kw-export-positive' ? '✓ Copied' : `Copy ${positiveKws.length} keywords`}
              </button>
              <button onClick={() => exportKeywords('negative')}
                style={{ fontSize: 13, padding: '7px 14px', borderRadius: 6, border: '1px solid #E7E5E4', background: 'white', cursor: 'pointer', color: copiedKey === 'kw-export-negative' ? '#047857' : ink }}>
                {copiedKey === 'kw-export-negative' ? '✓ Copied' : `Copy ${negativeKws.length} negatives`}
              </button>
              <button onClick={() => exportKeywords('all')}
                style={{ fontSize: 13, padding: '7px 14px', borderRadius: 6, border: '1px solid #E7E5E4', background: 'white', cursor: 'pointer', color: copiedKey === 'kw-export-all' ? '#047857' : ink }}>
                {copiedKey === 'kw-export-all' ? '✓ Copied' : 'Copy all'}
              </button>
            </div>

            {Object.entries(kwByGroup).filter(([g]) => g !== '_global').map(([group, kws]) => (
              <div key={group} style={{ background: 'white', border: '1px solid #E7E5E4', borderRadius: 8, marginBottom: 12, overflow: 'hidden' }}>
                <div style={{ padding: '10px 16px', background: '#F5F5F4', borderBottom: '1px solid #E7E5E4', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{group === '_ungrouped' ? 'All Keywords' : group}</span>
                  <span style={{ fontSize: 12, color: muted }}>{kws.length} keywords</span>
                </div>
                <div style={{ padding: 16, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {kws.map((kw, i) => {
                    const style = MATCH_TYPE_COLORS[kw.match_type as string] || MATCH_TYPE_COLORS.broad
                    const display = kw.match_type === 'exact' ? `[${kw.keyword}]` : kw.match_type === 'phrase' ? `"${kw.keyword}"` : kw.is_negative ? `-${kw.keyword}` : kw.keyword as string
                    return (
                      <span key={i} style={{ fontSize: 12, padding: '3px 8px', borderRadius: 4, fontFamily: 'monospace', background: style.bg, color: style.color }}>
                        {display}
                        {kw.recommended_bid ? <span style={{ fontSize: 10, marginLeft: 4, opacity: 0.7 }}>${String(kw.recommended_bid)}</span> : null}
                      </span>
                    )
                  })}
                </div>
              </div>
            ))}

            {/* Global negatives */}
            {kwByGroup['_global'] && (
              <div style={{ background: 'white', border: '1px solid #FEE2E2', borderRadius: 8, overflow: 'hidden' }}>
                <div style={{ padding: '10px 16px', background: '#FEF2F2', borderBottom: '1px solid #FEE2E2' }}>
                  <span style={{ fontWeight: 600, fontSize: 14, color: '#b91c1c' }}>Global Negative Keywords</span>
                </div>
                <div style={{ padding: 16, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {kwByGroup['_global'].map((kw, i) => (
                    <span key={i} style={{ fontSize: 12, padding: '3px 8px', borderRadius: 4, fontFamily: 'monospace', background: '#FEE2E2', color: '#b91c1c' }}>-{kw.keyword as string}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ADS TAB */}
        {activeTab === 'ads' && (
          <div>
            {Object.entries(adsByGroup).map(([group, groupAds]) => (
              <div key={group} style={{ marginBottom: 20 }}>
                {group !== '_ungrouped' && (
                  <div style={{ fontSize: 12, fontWeight: 600, color: muted, textTransform: 'uppercase', marginBottom: 8 }}>{group}</div>
                )}
                {groupAds.map((ad, ai) => {
                  const copy_json = ad.copy_json as Record<string, unknown>
                  const adKey = `ad-detail-${group}-${ai}`
                  return (
                    <div key={ai} style={{ background: 'white', border: '1px solid #E7E5E4', borderRadius: 8, marginBottom: 10, overflow: 'hidden' }}>
                      <div style={{ padding: '10px 16px', background: '#F5F5F4', borderBottom: '1px solid #E7E5E4', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 600, fontSize: 13, textTransform: 'uppercase', color: muted }}>{ad.ad_format as string}</span>
                        <button onClick={() => copy(JSON.stringify(copy_json, null, 2), adKey)}
                          style={{ fontSize: 12, padding: '4px 10px', borderRadius: 4, border: '1px solid #E7E5E4', background: copiedKey === adKey ? '#EAF3DE' : 'white', cursor: 'pointer', color: copiedKey === adKey ? '#047857' : ink }}>
                          {copiedKey === adKey ? '✓ Copied' : 'Copy ad'}
                        </button>
                      </div>
                      <div style={{ padding: 16 }}>
                        {copy_json.headlines && (
                          <div style={{ marginBottom: 12 }}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: muted, textTransform: 'uppercase', marginBottom: 6 }}>Headlines</div>
                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                              {(copy_json.headlines as string[]).map((h, hi) => (
                                <span key={hi} onClick={() => copy(h, `h-${adKey}-${hi}`)} style={{ fontSize: 12, padding: '3px 8px', background: '#F5F5F4', borderRadius: 4, cursor: 'pointer', border: '1px solid transparent' }}
                                  onMouseEnter={e => (e.currentTarget.style.borderColor = '#4285F4')}
                                  onMouseLeave={e => (e.currentTarget.style.borderColor = 'transparent')}>
                                  {copiedKey === `h-${adKey}-${hi}` ? '✓' : `${hi+1}.`} {h} <span style={{ color: h.length > 30 ? '#b91c1c' : '#A8A29E', fontSize: 10 }}>{h.length}</span>
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        {copy_json.descriptions && (
                          <div style={{ marginBottom: 12 }}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: muted, textTransform: 'uppercase', marginBottom: 6 }}>Descriptions</div>
                            {(copy_json.descriptions as string[]).map((d, di) => (
                              <div key={di} onClick={() => copy(d, `d-${adKey}-${di}`)} style={{ fontSize: 13, padding: '6px 8px', cursor: 'pointer', borderRadius: 4, marginBottom: 3, background: copiedKey === `d-${adKey}-${di}` ? '#EAF3DE' : '#FAFAF9', border: '1px solid #F5F5F4' }}>
                                <span style={{ color: muted, fontSize: 11 }}>{di+1}. </span>{d}
                                <span style={{ color: d.length > 90 ? '#b91c1c' : '#A8A29E', fontSize: 10, marginLeft: 6 }}>{d.length}/90</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {copy_json.primary_text && <div style={{ marginBottom: 8, fontSize: 13 }}><span style={{ color: muted, fontSize: 11, fontWeight: 600 }}>PRIMARY TEXT: </span>{copy_json.primary_text as string}</div>}
                        {copy_json.headline && <div style={{ marginBottom: 8, fontSize: 13 }}><span style={{ color: muted, fontSize: 11, fontWeight: 600 }}>HEADLINE: </span><strong>{copy_json.headline as string}</strong></div>}
                        {copy_json.intro_text && <div style={{ marginBottom: 8, fontSize: 13 }}><span style={{ color: muted, fontSize: 11, fontWeight: 600 }}>INTRO: </span>{copy_json.intro_text as string}</div>}
                        {copy_json.image_direction && <div style={{ fontSize: 12, color: muted, fontStyle: 'italic', padding: '6px 8px', background: '#FFFBEB', borderRadius: 4 }}>🎨 Creative direction: {copy_json.image_direction as string}</div>}
                      </div>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        )}

        {/* AUDIENCES TAB */}
        {activeTab === 'audiences' && (
          <div>
            {audiences.length === 0 ? (
              <div style={{ color: muted, fontSize: 14 }}>No audience data saved for this campaign.</div>
            ) : audiences.map((aud, i) => (
              <div key={i} style={{ background: 'white', border: '1px solid #E7E5E4', borderRadius: 8, overflow: 'hidden', marginBottom: 12 }}>
                <div style={{ padding: '10px 16px', background: '#F5F5F4', borderBottom: '1px solid #E7E5E4', display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>Audience {i + 1}</span>
                  <button onClick={() => copy(JSON.stringify(aud.targeting_json, null, 2), `aud-detail-${i}`)}
                    style={{ fontSize: 12, padding: '4px 10px', borderRadius: 4, border: '1px solid #E7E5E4', background: copiedKey === `aud-detail-${i}` ? '#EAF3DE' : 'white', cursor: 'pointer', color: copiedKey === `aud-detail-${i}` ? '#047857' : ink }}>
                    {copiedKey === `aud-detail-${i}` ? '✓ Copied' : 'Copy targeting'}
                  </button>
                </div>
                <div style={{ padding: 16 }}>
                  {Object.entries(aud.targeting_json as Record<string, unknown>).map(([key, val]) => (
                    <div key={key} style={{ display: 'flex', gap: 12, marginBottom: 8, fontSize: 13 }}>
                      <span style={{ color: muted, fontWeight: 600, width: 160, flexShrink: 0 }}>{key.replace(/_/g, ' ')}</span>
                      <span style={{ color: ink }}>
                        {Array.isArray(val) ? (val as string[]).join(', ') : val as string}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
