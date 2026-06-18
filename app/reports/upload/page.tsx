'use client'
import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

const CLIENTS = [
  { id: 'a-b-consulting-group',  name: 'A&B Consulting Group' },
  { id: 'nico-roofing',          name: 'Nico Roofing & Exteriors' },
  { id: 'culture',               name: 'Culture Construction' },
  { id: 'kbc-exteriors',         name: 'KBC Exteriors LLC' },
  { id: 'mvp-chiro',             name: 'MVP Chiropractic' },
  { id: 'midwest-construction',  name: 'Midwest Construction Experts' },
  { id: 'rbs',                   name: 'Richards Building Supply' },
  { id: 'apollo-events',         name: 'Apollo Supply' },
]

// Derived from actual Sprout Social profile names in the CSV
function matchesClient(profile: string, clientId: string): boolean {
  const p = profile.replace(/^'+/, '').toLowerCase()
  switch (clientId) {
    case 'rbs':
      return p.startsWith('richards building') || p === '@richardssupply' || p === 'richards building'
    case 'culture':
      return p.includes('culture construction') || p === '@cultureccc' || p === 'culture_construction_'
    case 'kbc-exteriors':
      return p.includes('k.b.c') || p.includes('kennedy brother') || p.includes('kennedy brothers') || p === 'kbconstr'
    case 'apollo-events':
      return p.includes('apollo supply')
    case 'mvp-chiro':
      return p.includes('mvp chiro') || p === '@mvpchiro' || p === 'mvpchiro'
    case 'midwest-construction':
      return p.includes('midwest construction experts') || p === 'midwest_construction_exp'
    case 'nico-roofing':
      return p === 'nico roofing' || p === '@nicoroofing'
    case 'a-b-consulting-group':
      return p === 'a&b consulting group' || p === 'ab_consulting_group' || p.includes('a&b consulting')
    default:
      return false
  }
}

const FILE_TYPES = [
  { key: 'profile_performance', label: 'Profile Performance', icon: '📊', accept: '.csv', desc: 'Sprout Social — daily profile metrics (all clients in one file)' },
  { key: 'post_performance',    label: 'Post Performance',    icon: '📊', accept: '.csv', desc: 'Sprout Social — individual post metrics (all clients in one file)' },
  { key: 'gmb_performance',     label: 'GMB Performance',     icon: '📍', accept: '.csv', desc: 'Google Business Profile — location insights (searches, maps views, calls, directions)' },
  { key: 'paid_performance',    label: 'Paid Performance',    icon: '🎯', accept: '.csv', desc: 'Sprout Social — Meta Ads paid CSV' },
]

type ParseResult = {
  clientId: string
  clientName: string
  rows: number
  metrics: Record<string, number>
}

type UploadStatus = {
  client_id: string
  file_type: string
  file_name: string
  parse_status: string
  row_count: number | null
}

function currentMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function monthLabel(m: string) {
  const [y, mo] = m.split('-')
  return new Date(Number(y), Number(mo) - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' })
}

function cleanNum(s: string | undefined): number {
  if (!s) return 0
  return parseFloat(s.replace(/[,"%]/g, '').trim()) || 0
}

function cleanMoney(s: string | undefined): number {
  if (!s) return 0
  return parseFloat(s.replace(/[$,]/g, '').trim()) || 0
}

function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (const char of line) {
    if (char === '"') { inQuotes = !inQuotes; continue }
    if (char === ',' && !inQuotes) { result.push(current.trim()); current = ''; continue }
    current += char
  }
  result.push(current.trim())
  return result
}

export default function ReportsUploadPage() {
  const supabase = createClient()
  const [month, setMonth] = useState(currentMonth())
  const [uploading, setUploading] = useState<string | null>(null)
  const [parseResults, setParseResults] = useState<Record<string, ParseResult[]>>({})
  const [uploads, setUploads] = useState<UploadStatus[]>([])
  const [clearing, setClearing] = useState<string | null>(null)
  const [narrativeStatus, setNarrativeStatus] = useState<Record<string, 'idle'|'generating'|'done'|'error'>>({})
  const refs = useRef<Record<string, HTMLInputElement | null>>({})

  useEffect(() => { loadUploads() }, [month])

  async function loadUploads() {
    const { data } = await supabase
      .from('monthly_uploads')
      .select('file_type, file_name, parse_status, row_count, client_id')
      .eq('month', month)
    setUploads(data || [])
  }

  async function handleMultipleFiles(fileType: string, files: File[]) {
    setUploading(fileType)
    setParseResults(prev => ({ ...prev, [fileType]: [] }))
    const allResults: any[] = []
    for (const file of files) {
      const text = await file.text()
      const lines = text.split('\n').filter(l => l.trim())
      if (lines.length < 2) continue
      // Re-use the single-file handler logic by calling handleFile per file
      // but accumulate results — easiest to just call handleFile and merge
      await handleFile(fileType, file)
      // Results will be set by handleFile — we collect them after
    }
    setUploading(null)
  }

  async function handleFile(fileType: string, file: File) {
    setUploading(fileType)
    setParseResults(prev => ({ ...prev, [fileType]: [] }))
    const text = await file.text()
    const lines = text.split('\n').filter(l => l.trim())
    if (lines.length < 2) { setUploading(null); return }
    const headers = parseCSVLine(lines[0])
    const results: ParseResult[] = []

    if (fileType === 'profile_performance') {
      const profileCol    = headers.indexOf('Profile')
      const networkCol    = headers.indexOf('Network')
      const audienceCol   = headers.indexOf('Audience')
      const netGrowthCol  = headers.indexOf('Net Audience Growth')
      const gainedCol     = headers.indexOf('Audience Gained')
      const postsCol      = headers.indexOf('Published Posts (Total)')
      const impressionsCol = headers.indexOf('Impressions')
      const videoViewsCol = headers.indexOf('Video Views')
      const engagementsCol = headers.indexOf('Engagements')
      const engRateCol    = headers.indexOf('Engagement Rate (per Impression)')
      const plcCol        = headers.indexOf('Post Link Clicks')

      // per-network totals
      const byClient: Record<string, Record<string, Record<string, number>>> = {}
      // per-profile rows for profile table
      const profileRows: Record<string, Record<string, Record<string, number>>> = {}

      for (let i = 1; i < lines.length; i++) {
        const cols = parseCSVLine(lines[i])
        const profile = (cols[profileCol] ?? '').trim()
        const network = (cols[networkCol] ?? '').toLowerCase().replace(/\s+/g, '_')
        const matchedClient = CLIENTS.find(c => matchesClient(profile, c.id))
        if (!matchedClient) continue
        const cid = matchedClient.id
        if (!byClient[cid]) byClient[cid] = {}
        if (!byClient[cid][network]) byClient[cid][network] = { impressions: 0, engagements: 0, audience_gained: 0, posts: 0, video_views: 0, post_link_clicks: 0, audience: 0, net_audience_growth: 0 }
        byClient[cid][network]['impressions']        += cleanNum(cols[impressionsCol])
        byClient[cid][network]['engagements']        += cleanNum(cols[engagementsCol])
        byClient[cid][network]['audience_gained']    += cleanNum(cols[gainedCol])
        byClient[cid][network]['posts']              += cleanNum(cols[postsCol])
        byClient[cid][network]['video_views']        += cleanNum(cols[videoViewsCol])
        byClient[cid][network]['post_link_clicks']   += cleanNum(cols[plcCol])
        byClient[cid][network]['audience']            = Math.max(byClient[cid][network]['audience'], cleanNum(cols[audienceCol]))
        byClient[cid][network]['net_audience_growth'] += cleanNum(cols[netGrowthCol])

        // per-profile accumulation
        const profileKey = `${profile}__${network}`
        if (!profileRows[cid]) profileRows[cid] = {}
        if (!profileRows[cid][profileKey]) profileRows[cid][profileKey] = { audience: 0, net_audience_growth: 0, posts: 0, impressions: 0, engagements: 0, video_views: 0, post_link_clicks: 0 }
        profileRows[cid][profileKey]['audience']            = Math.max(profileRows[cid][profileKey]['audience'], cleanNum(cols[audienceCol]))
        profileRows[cid][profileKey]['net_audience_growth'] += cleanNum(cols[netGrowthCol])
        profileRows[cid][profileKey]['posts']               += cleanNum(cols[postsCol])
        profileRows[cid][profileKey]['impressions']         += cleanNum(cols[impressionsCol])
        profileRows[cid][profileKey]['engagements']         += cleanNum(cols[engagementsCol])
        profileRows[cid][profileKey]['video_views']         += cleanNum(cols[videoViewsCol])
        profileRows[cid][profileKey]['post_link_clicks']    += cleanNum(cols[plcCol])
      }

      for (const [clientId, networks] of Object.entries(byClient)) {
        const client = CLIENTS.find(c => c.id === clientId)!
        const upserts: any[] = []
        let totalRows = 0
        const summary: Record<string, number> = {}
        for (const [network, metrics] of Object.entries(networks)) {
          for (const [metric, value] of Object.entries(metrics)) {
            if (value === 0) continue
            totalRows++
            summary[`${network}__${metric}`] = value
            upserts.push({ client_id: clientId, month, section: 'social_organic', platform: network, metric, value, source: 'sprout_csv' })
          }
        }
        // Store per-profile rows as a JSON blob
        const profiles = profileRows[clientId] || {}
        const profileArr = Object.entries(profiles).map(([key, m]) => {
          const [profileName, network] = key.split('__')
          return { profile: profileName, network, ...m }
        })
        if (profileArr.length > 0) {
          upserts.push({ client_id: clientId, month, section: 'social_profiles', platform: 'all', metric: 'profiles_json', value: JSON.stringify(profileArr) as any, source: 'sprout_csv' })
        }
        if (upserts.length > 0) {
          await supabase.from('report_data').upsert(upserts, { onConflict: 'client_id,month,section,platform,metric' })
        }
        results.push({ clientId, clientName: client.name, rows: totalRows, metrics: summary })
      }

    } else if (fileType === 'post_performance') {
      const profileCol = headers.indexOf('Profile')
      const networkCol = headers.indexOf('Network')
      const dateCol = headers.indexOf('Date')
      const postTypeCol = headers.indexOf('Post Type')
      const postCol = headers.indexOf('Post')
      const linkCol = headers.indexOf('Link')
      const impressionsCol2 = headers.indexOf('Impressions')
      const engagementsCol2 = headers.indexOf('Engagements')
      const reactionsCol = headers.indexOf('Reactions')
      const commentsCol = headers.indexOf('Comments')
      const sharesCol = headers.indexOf('Shares')
      const plcCol = headers.indexOf('Post Link Clicks')
      const videoCol = headers.indexOf('Video Views')
      const erCol = headers.indexOf('Engagement Rate (per Impression)')

      const byClient: Record<string, { rows: number; impressions: number; engagements: number; posts: any[] }> = {}
      for (let i = 1; i < lines.length; i++) {
        const cols = parseCSVLine(lines[i])
        const profile = (cols[profileCol] ?? '').trim()
        const matchedClient = CLIENTS.find(c => matchesClient(profile, c.id))
        if (!matchedClient) continue
        if (!byClient[matchedClient.id]) byClient[matchedClient.id] = { rows: 0, impressions: 0, engagements: 0, posts: [] }
        byClient[matchedClient.id].rows++
        const impr = cleanNum(cols[impressionsCol2])
        const engag = cleanNum(cols[engagementsCol2])
        byClient[matchedClient.id].impressions += impr
        byClient[matchedClient.id].engagements += engag
        byClient[matchedClient.id].posts.push({
          client_id: matchedClient.id,
          month,
          post_date: cols[dateCol]?.trim() || null,
          network: cols[networkCol]?.trim() || null,
          profile: profile,
          post_type: cols[postTypeCol]?.trim() || null,
          content: (cols[postCol] ?? '').trim().slice(0, 500),
          link: cols[linkCol]?.trim() || null,
          impressions: impr,
          engagements: engag,
          reactions: cleanNum(cols[reactionsCol]),
          comments: cleanNum(cols[commentsCol]),
          shares: cleanNum(cols[sharesCol]),
          post_link_clicks: cleanNum(cols[plcCol]),
          video_views: cleanNum(cols[videoCol]),
          engagement_rate: parseFloat(cols[erCol] ?? '0') || 0,
        })
      }
      for (const [clientId, data] of Object.entries(byClient)) {
        const client = CLIENTS.find(c => c.id === clientId)!
        // Save top 10 posts by engagements to DB
        const topPosts = data.posts.sort((a: any, b: any) => b.engagements - a.engagements).slice(0, 10)
        if (topPosts.length > 0) {
          // Delete existing posts for this client/month first
          await supabase.from('post_performance_data').delete().eq('client_id', clientId).eq('month', month)
          await supabase.from('post_performance_data').insert(topPosts)
        }
        results.push({ clientId, clientName: client.name, rows: data.rows, metrics: { impressions: data.impressions, engagements: data.engagements } })
      }

    } else if (fileType === 'gmb_performance') {
      // GMB CSV: Store code, Business name, Address, Labels, Search Mobile, Search Desktop, Maps Mobile, Maps Desktop, Calls, Messages, Bookings, Directions, Website clicks...
      const storeCol = headers.indexOf('Store code')
      const nameCol = headers.indexOf('Business name')
      const addrCol = headers.indexOf('Address')
      const smCol = headers.indexOf('Google Search - Mobile')
      const sdCol = headers.indexOf('Google Search - Desktop')
      const mmCol = headers.indexOf('Google Maps - Mobile')
      const mdCol = headers.indexOf('Google Maps - Desktop')
      const callsCol = headers.indexOf('Calls')
      const dirCol = headers.indexOf('Directions')
      const webCol = headers.indexOf('Website clicks')

      // Match each row independently to a client by business name
      // NOTE: Google GMB CSV has a 2-row header — row 0 = column names, row 1 = descriptions.
      // Start at i=2 to skip the description row.
      const locationRows: any[] = []
      for (let i = 2; i < lines.length; i++) {
        const cols = parseCSVLine(lines[i])
        if (!cols[storeCol] && !cols[nameCol]) continue
        const bizName = (cols[nameCol] ?? '').trim()
        if (bizName === '' || bizName.startsWith('Number of')) continue
        const mc = CLIENTS.find(c => matchesClient(bizName, c.id))
        if (!mc) continue // skip unmatched rows
        // Normalize store code: strip leading zeros, keep as string
        const rawCode = cols[storeCol]?.trim() || null
        const storeCode = rawCode ? String(parseInt(rawCode, 10)) : null
        // Look up RVP from branch directory
        let rvp: string | null = null
        if (storeCode) {
          const { data: branch } = await supabase
            .from('rbs_branch_directory')
            .select('rvp')
            .eq('store_code', storeCode)
            .single()
          rvp = branch?.rvp || null
        }
        locationRows.push({
          client_id: mc.id,
          month,
          store_code: storeCode,
          business_name: bizName,
          address: cols[addrCol]?.trim() || null,
          search_mobile: cleanNum(cols[smCol]),
          search_desktop: cleanNum(cols[sdCol]),
          maps_mobile: cleanNum(cols[mmCol]),
          maps_desktop: cleanNum(cols[mdCol]),
          calls: cleanNum(cols[callsCol]),
          directions: cleanNum(cols[dirCol]),
          website_clicks: cleanNum(cols[webCol]),
          area_manager: rvp,
        })
      }
      // Group by client and upsert
      const byClient: Record<string, any[]> = {}
      locationRows.forEach((r: any) => {
        if (!byClient[r.client_id]) byClient[r.client_id] = []
        byClient[r.client_id].push(r)
      })
      for (const [clientId, rows] of Object.entries(byClient)) {
        // Dedupe by store_code — delete matching store codes then insert
        const storeCodes = rows.map((r: any) => r.store_code).filter(Boolean)
        if (storeCodes.length > 0) {
          await supabase.from('gmb_location_data').delete()
            .eq('client_id', clientId).eq('month', month).in('store_code', storeCodes)
        }
        // Also delete rows with same business_name+address for locations without store codes
        const noCodeRows = rows.filter((r: any) => !r.store_code)
        for (const r of noCodeRows) {
          await supabase.from('gmb_location_data').delete()
            .eq('client_id', clientId).eq('month', month).eq('business_name', r.business_name).eq('address', r.address)
        }
        await supabase.from('gmb_location_data').insert(rows)
        const client = CLIENTS.find(c => c.id === clientId)!
        results.push({ clientId, clientName: client?.name || clientId, rows: rows.length, metrics: { locations: rows.length } })
      }
      if (locationRows.length === 0) {
        results.push({ clientId: 'none', clientName: 'No matched clients — check business names', rows: 0, metrics: {} })
      }

    } else if (fileType === 'paid_performance') {
      const spendCol = headers.indexOf('Total Spend')
      const impressionsCol = headers.indexOf('Impressions')
      const clicksCol = headers.indexOf('Clicks')
      const campCol = headers.indexOf('Campaign')
      const metrics: Record<string, number> = {}
      let rowCount = 0
      for (let i = 1; i < lines.length; i++) {
        const cols = parseCSVLine(lines[i])
        if (!cols[campCol]) continue
        rowCount++
        metrics['meta__spend'] = (metrics['meta__spend'] || 0) + cleanMoney(cols[spendCol])
        metrics['meta__impressions'] = (metrics['meta__impressions'] || 0) + cleanNum(cols[impressionsCol])
        metrics['meta__clicks'] = (metrics['meta__clicks'] || 0) + cleanNum(cols[clicksCol])
      }
      // Paid doesn't have profile column — write to selected client
      results.push({ clientId: 'all', clientName: 'All (manual assignment needed)', rows: rowCount, metrics })
    }

    // Save upload log
    const { data: { user } } = await supabase.auth.getUser()
    for (const result of results) {
      if (result.clientId === 'all') continue
      await supabase.from('monthly_uploads').upsert({
        client_id: result.clientId, month, file_type: fileType,
        file_name: file.name, parse_status: 'done',
        row_count: result.rows, uploaded_by: user?.email ?? 'unknown',
        processed_at: new Date().toISOString(),
      }, { onConflict: 'client_id,month,file_type' })
    }

    setParseResults(prev => ({ ...prev, [fileType]: results }))
    await loadUploads()
    setUploading(null)
  }

  async function clearClientMonth(clientId: string) {
    setClearing(clientId)
    await supabase.from('report_data').delete().eq('client_id', clientId).eq('month', month)
    await supabase.from('monthly_uploads').delete().eq('client_id', clientId).eq('month', month)
    await supabase.from('client_reports').delete().eq('client_id', clientId).eq('month', month)
    setClearing(null)
    await loadUploads()
    setParseResults({})
  }

  async function generateNarrative(clientId: string) {
    setNarrativeStatus(prev => ({ ...prev, [clientId]: 'generating' }))
    const { data: metrics } = await supabase.from('report_data').select('section, platform, metric, value').eq('client_id', clientId).eq('month', month)
    if (!metrics?.length) { setNarrativeStatus(prev => ({ ...prev, [clientId]: 'error' })); return }
    const clientName = CLIENTS.find(c => c.id === clientId)?.name ?? clientId
    const summary = metrics.map(m => `${m.section} / ${m.platform} / ${m.metric}: ${m.value}`).join('\n')
    try {
      const res = await fetch('/api/reports/narrative', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, clientName, month: monthLabel(month), summary }),
      })
      if (!res.ok) throw new Error('API error')
      const { narrative } = await res.json()
      await supabase.from('client_reports').upsert({
        client_id: clientId, month, status: 'draft', narrative,
        narrative_generated_at: new Date().toISOString(),
      }, { onConflict: 'client_id,month' })
      setNarrativeStatus(prev => ({ ...prev, [clientId]: 'done' }))
    } catch {
      setNarrativeStatus(prev => ({ ...prev, [clientId]: 'error' }))
    }
  }

  const uploadedClients = new Set(uploads.map(u => u.client_id))

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <div className="border-b px-6 py-4" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}>
        <div className="max-w-4xl mx-auto">
          <a href="/reports" className="text-sm hover:underline" style={{ color: 'var(--text-muted)' }}>← Reports</a>
          <h1 className="text-2xl font-bold mt-1" style={{ color: 'var(--text)' }}>Monthly Upload</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>Upload Sprout exports — one file processes all clients automatically.</p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">

        {/* Month selector */}
        <div className="flex items-center gap-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Month</label>
            <input type="month" value={month} onChange={e => setMonth(e.target.value)}
              className="rounded-lg border px-3 py-2 text-sm"
              style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)', color: 'var(--text)' }} />
          </div>
          <div className="text-sm mt-4" style={{ color: 'var(--text-muted)' }}>
            Processing: <strong style={{ color: 'var(--text)' }}>{monthLabel(month)}</strong>
          </div>
          <div className="mt-4">
            <label className="block text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Clear Data</label>
            <button
              onClick={async () => {
                if (!confirm(`Delete ALL report data for ${monthLabel(month)}? This cannot be undone.`)) return
                const { createClient } = await import('@/lib/supabase/client')
                const sb = createClient()
                await Promise.all([
                  sb.from('report_data').delete().eq('month', month),
                  sb.from('gmb_location_data').delete().eq('month', month),
                ])
                alert(`Cleared all data for ${monthLabel(month)}`)
              }}
              className="px-3 py-2 rounded-lg text-sm font-medium"
              style={{ background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', cursor: 'pointer' }}>
              🗑 Clear {monthLabel(month)}
            </button>
          </div>
        </div>

        {/* Upload zones */}
        <div className="space-y-3">
          {FILE_TYPES.map(ft => {
            const isUploading = uploading === ft.key
            const results = parseResults[ft.key] || []
            const totalRows = results.reduce((sum, r) => sum + r.rows, 0)

            return (
              <div key={ft.key} className="rounded-xl border p-4" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{ft.icon}</span>
                    <div>
                      <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{ft.label}</div>
                      <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{ft.desc}</div>
                    </div>
                  </div>
                  {results.length > 0 && (
                    <span className="text-xs font-semibold" style={{ color: '#10b981' }}>
                      ✓ {results.length} clients · {totalRows.toLocaleString()} rows
                    </span>
                  )}
                </div>

                <div
                  onClick={() => refs.current[ft.key]?.click()}
                  className="rounded border-2 border-dashed p-4 text-center cursor-pointer transition-colors"
                  style={{ borderColor: 'var(--border)' }}>
                  <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
                    {isUploading ? 'Processing…' : results.length > 0 ? `Re-upload ${ft.label}` : `Drop ${ft.label} here or click`}
                  </div>
                  <input
                    ref={el => { refs.current[ft.key] = el }}
                    type="file" accept={ft.accept} className="hidden"
                    multiple={ft.key === 'gmb_performance'}
                    onChange={e => {
                      const files = Array.from(e.target.files || [])
                      if (ft.key === 'gmb_performance' && files.length > 1) {
                        handleMultipleFiles(ft.key, files)
                      } else if (files[0]) {
                        handleFile(ft.key, files[0])
                      }
                      e.target.value = ''
                    }}
                  />
                </div>

                {/* Parse results preview */}
                {results.length > 0 && (
                  <div className="mt-3 space-y-1">
                    {results.map(r => (
                      <div key={r.clientId} className="flex items-center justify-between px-3 py-2 rounded-lg text-xs"
                        style={{ background: 'var(--bg)', border: '0.5px solid var(--border)' }}>
                        <span className="font-medium" style={{ color: 'var(--text)' }}>{r.clientName}</span>
                        <span style={{ color: 'var(--text-muted)' }}>
                          {r.rows} rows
                          {Object.keys(r.metrics).slice(0, 3).map(k => {
                            const [platform, metric] = k.split('__')
                            return ` · ${platform} ${metric}: ${Math.round(r.metrics[k]).toLocaleString()}`
                          }).join('')}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Per-client status + actions */}
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>
            Client Status — {monthLabel(month)}
          </h2>
          <div className="space-y-2">
            {CLIENTS.map(client => {
              const clientUploads = uploads.filter(u => u.client_id === client.id)
              const hasData = uploadedClients.has(client.id)
              const ns = narrativeStatus[client.id] || 'idle'
              return (
                <div key={client.id} className="rounded-xl border p-4 flex items-center justify-between gap-4"
                  style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}>
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${hasData ? 'bg-green-500' : 'bg-gray-300'}`} />
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{client.name}</div>
                      {clientUploads.length > 0 && (
                        <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          {clientUploads.map(u => u.file_type.replace('_', ' ')).join(' · ')}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {hasData && (
                      <>
                        <button onClick={() => generateNarrative(client.id)}
                          disabled={ns === 'generating'}
                          className="text-xs px-3 py-1.5 rounded-lg font-medium disabled:opacity-40"
                          style={{ background: 'rgba(99,102,241,0.1)', color: '#6366f1' }}>
                          {ns === 'generating' ? 'Generating…' : ns === 'done' ? '✓ Narrative' : '✦ Generate narrative'}
                        </button>
                        <a href={`/reports/${client.id}`} target="_blank"
                          className="text-xs px-3 py-1.5 rounded-lg font-medium"
                          style={{ background: 'var(--bg)', border: '0.5px solid var(--border)', color: 'var(--text)' }}>
                          View →
                        </a>
                        <button onClick={() => clearClientMonth(client.id)}
                          disabled={clearing === client.id}
                          className="text-xs px-3 py-1.5 rounded-lg font-medium disabled:opacity-40"
                          style={{ background: 'rgba(239,68,68,0.08)', color: '#ef4444' }}>
                          {clearing === client.id ? 'Clearing…' : '× Clear & redo'}
                        </button>
                      </>
                    )}
                    {!hasData && (
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>No data yet</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

      </div>
    </div>
  )
}
