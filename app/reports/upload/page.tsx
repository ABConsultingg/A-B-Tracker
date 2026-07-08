'use client'
import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

const CLIENTS = [
  { id: 'a-b-consulting-group',          name: 'A&B Consulting Group' },
  { id: 'nico-roofing',                  name: 'Nico Roofing & Exteriors' },
  { id: 'culture',                       name: 'Culture Construction' },
  { id: 'kbc',                           name: 'KBC Exteriors' },
  { id: 'mvp-chiro',                     name: 'MVP Chiropractic' },
  { id: 'midwest-constrcution-experts',  name: 'Midwest Construction Experts' },
  { id: 'rbs',                           name: 'Richards Building Supply' },
  { id: 'apollo-events',                 name: 'Apollo Supply' },
  { id: 'affiliated-control',            name: 'Affiliated Control Equipment' },
  { id: 'midway-windows-doors',          name: 'Midway Windows & Doors' },
  { id: 'apek',                          name: 'APEK Inc.' },
  { id: 'franos-roofing',                name: 'Franos Roofing' },
  { id: 'rg-general-roofing',            name: 'RG General Roofing' },
]

// Clients with Windsor Google Ads connected (live data)
const WINDSOR_GADS_CLIENTS = new Set([
  'culture', 'mvp-chiro', 'rbs', 'nico-roofing', 'midwest-constrcution-experts',
  'apollo-events', 'a-b-consulting-group', 'affiliated-control', 'kbc',
])

// Clients with Windsor Meta Ads connected (live data)
const WINDSOR_META_CLIENTS = new Set([
  'culture', 'apollo-events', 'a-b-consulting-group', 'rbs', 'nico-roofing',
])

// Clients running LSA
const LSA_CLIENTS = new Set([
  'culture', 'mvp-chiro', 'kbc', 'midwest-constrcution-experts',
  'nico-roofing', 'apollo-events', 'affiliated-control',
])

// Derived from actual Sprout Social profile names in the CSV
function matchesClient(profile: string, clientId: string): boolean {
  const p = profile.replace(/^'+/, '').toLowerCase().trim()
  switch (clientId) {
    case 'rbs':
      return p.startsWith('richards building') || p === '@richardssupply' || p === 'richards building' || p === 'richardsbuildingsupply'
    case 'culture':
      return p.includes('culture construction') || p === '@cultureccc' || p === 'culture_construction_' || p === 'cultureccc'
    case 'kbc':
      return p.includes('k.b.c') || p.includes('kennedy brother') || p.includes('kennedy brothers') || p === 'kbconstr' || p.includes('k.b.c restoration') || p.includes('kbc exteriors')
    case 'apollo-events':
      return p.includes('apollo supply') || p === 'apollo_supplyco'
    case 'mvp-chiro':
      return p.includes('mvp chiro') || p === '@mvpchiro' || p === 'mvpchiro' || p.includes('mvp chiropractic')
    case 'midwest-constrcution-experts':
      return p.includes('midwest construction') || p === 'midwest_construction_exp'
    case 'nico-roofing':
      return p === 'nico roofing' || p === '@nicoroofing' || p.includes('nico exterior') || p.includes('nico roofing') || p === 'nico exteriors'
    case 'a-b-consulting-group':
      return p === 'a&b consulting group' || p === 'ab_consulting_group' || p.includes('a&b consulting') || p === '@abconsultingg' || p === 'abconsultingg'
    case 'affiliated-control':
      return p.includes('affiliated control')
    case 'midway-windows-doors':
      return p.includes('midway windows') || p === 'midway windows & doors, inc.'
    case 'apek':
      return p.includes('apek') || p === 'apekincorporated' || p.includes('apek incorporated')
    case 'franos-roofing':
      return p.includes('franos roofing') || p === 'franos'
    case 'rg-general-roofing':
      return p.includes('rg general roofing') || p.includes('rg general')
    default:
      return false
  }
}

const FILE_TYPES = [
  { key: 'profile_performance', label: 'Profile Performance', icon: '📊', accept: '.csv', desc: 'Sprout Social — daily profile metrics (all clients in one file)' },
  { key: 'post_performance',    label: 'Post Performance',    icon: '📊', accept: '.csv', desc: 'Sprout Social — individual post metrics (all clients in one file)' },
  { key: 'gmb_performance',     label: 'GMB Performance',     icon: '📍', accept: '.csv', desc: 'Google Business Profile — location insights (searches, maps views, calls, directions)' },
  { key: 'paid_performance',    label: 'Paid Performance',    icon: '🎯', accept: '.csv', desc: 'Sprout Social — Meta Ads paid CSV' },
  { key: 'calls_performance',   label: 'Calls',               icon: '📞', accept: '.csv', desc: 'Cira — call tracking CSV (one client per file)' },
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
  const [topPosts, setTopPosts] = useState<Record<string, any[]>>({})

  async function loadTopPosts(clientId: string, month: string) {
    const from = month + '-01'
    const to = month + '-31'
    const { data } = await supabase
      .from('sprout_posts')
      .select('network, post_type, published_at, text_content, impressions, engagements, reactions, video_views, permalink')
      .ilike('client_name', '%' + clientId.replace(/-/g, ' ') + '%')
      .gte('published_at', from + 'T00:00:00Z')
      .lte('published_at', to + 'T23:59:59Z')
      .order('engagements', { ascending: false })
      .limit(3)
    if (data?.length) setTopPosts(prev => ({ ...prev, [clientId]: data }))
  }

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

        // Aggregate totals into report_data
        const totals = rows.reduce((acc: any, r: any) => {
          acc.search_mobile  += r.search_mobile  || 0
          acc.search_desktop += r.search_desktop || 0
          acc.maps_mobile    += r.maps_mobile    || 0
          acc.maps_desktop   += r.maps_desktop   || 0
          acc.calls          += r.calls          || 0
          acc.directions     += r.directions     || 0
          acc.website_clicks += r.website_clicks || 0
          return acc
        }, { search_mobile: 0, search_desktop: 0, maps_mobile: 0, maps_desktop: 0, calls: 0, directions: 0, website_clicks: 0 })

        const rdUpserts = Object.entries(totals)
          .filter(([, v]) => (v as number) > 0)
          .map(([metric, value]) => ({ client_id: clientId, month, section: 'gmb', platform: 'all', metric, value, source: 'gmb_csv' }))
        if (rdUpserts.length > 0) {
          await supabase.from('report_data').upsert(rdUpserts, { onConflict: 'client_id,month,section,platform,metric' })
        }

        const client = CLIENTS.find(c => c.id === clientId)!
        results.push({ clientId, clientName: client?.name || clientId, rows: rows.length, metrics: { locations: rows.length, calls: totals.calls, directions: totals.directions } })
      }
      if (locationRows.length === 0) {
        results.push({ clientId: 'none', clientName: 'No matched clients — check business names', rows: 0, metrics: {} })
      }

    } else if (fileType === 'paid_performance') {
      const accountCol = headers.indexOf('Ad Account')
      const spendCol = headers.indexOf('Total Spend')
      const impressionsCol = headers.indexOf('Impressions')
      const clicksCol = headers.indexOf('Clicks')
      const linkClicksCol = headers.indexOf('Engagement - Link Clicks')
      const videoViewsCol = headers.indexOf('Video Views')
      const campCol = headers.indexOf('Campaign')
      // Aggregate per matched client
      const perClient: Record<string, { metrics: Record<string, number>; rows: number }> = {}
      const unmatched: string[] = []
      for (let i = 1; i < lines.length; i++) {
        const cols = parseCSVLine(lines[i])
        if (!cols[campCol]) continue
        const adAccount = cols[accountCol] || ''
        const matched = CLIENTS.find(c => matchesClient(adAccount, c.id))
        if (!matched) {
          if (adAccount && !unmatched.includes(adAccount)) unmatched.push(adAccount)
          continue
        }
        if (!perClient[matched.id]) perClient[matched.id] = { metrics: {}, rows: 0 }
        const m = perClient[matched.id].metrics
        perClient[matched.id].rows++
        m['meta__spend'] = (m['meta__spend'] || 0) + cleanMoney(cols[spendCol])
        m['meta__impressions'] = (m['meta__impressions'] || 0) + cleanNum(cols[impressionsCol])
        m['meta__clicks'] = (m['meta__clicks'] || 0) + cleanNum(cols[clicksCol])
        m['meta__link_clicks'] = (m['meta__link_clicks'] || 0) + cleanNum(cols[linkClicksCol])
        m['meta__video_views'] = (m['meta__video_views'] || 0) + cleanNum(cols[videoViewsCol])
      }
      // Upsert each matched client to report_data
      for (const [clientId, { metrics, rows }] of Object.entries(perClient)) {
        const clientName = CLIENTS.find(c => c.id === clientId)?.name ?? clientId
        const upsertRows = [
          { client_id: clientId, month, section: 'meta', platform: 'all', metric: 'meta_spend', value: metrics['meta__spend'] || 0 },
          { client_id: clientId, month, section: 'meta', platform: 'all', metric: 'meta_impressions', value: metrics['meta__impressions'] || 0 },
          { client_id: clientId, month, section: 'meta', platform: 'all', metric: 'meta_clicks', value: metrics['meta__clicks'] || 0 },
          { client_id: clientId, month, section: 'meta', platform: 'all', metric: 'meta_link_clicks', value: metrics['meta__link_clicks'] || 0 },
          { client_id: clientId, month, section: 'meta', platform: 'all', metric: 'meta_video_views', value: metrics['meta__video_views'] || 0 },
        ]
        await supabase.from('report_data').upsert(upsertRows, { onConflict: 'client_id,month,section,platform,metric' })
        results.push({ clientId, clientName, rows, metrics })
      }
      if (unmatched.length > 0) {
        results.push({ clientId: 'all', clientName: `Unmatched accounts: ${unmatched.join(', ')}`, rows: 0, metrics: {} })
      }

    } else if (fileType === 'calls_performance') {
      // Cira calls CSV: Date, Time, Name, Phone, Duration, How They Heard About Us, Message/Reason, Call Summary, Address, Email
      // File is for a single client — match by selected client or file name
      const dateCol    = headers.indexOf('Date')
      const timeCol    = headers.indexOf('Time')
      const nameCol    = headers.indexOf('Name')
      const phoneCol   = headers.indexOf('Phone')
      const durCol     = headers.indexOf('Duration')
      const heardCol   = headers.indexOf('How They Heard About Us')
      const msgCol     = headers.indexOf('Message/Reason')
      const summaryCol = headers.indexOf('Call Summary')
      const addrCol    = headers.indexOf('Address')
      const emailCol   = headers.indexOf('Email')

      if (dateCol === -1) {
        results.push({ clientId: 'none', clientName: 'Invalid file — expected Cira calls CSV with Date, Time, Name columns', rows: 0, metrics: {} })
      } else {
        // Try to match client from file name
        const fileName = file.name.toLowerCase()
        const matchedClient = CLIENTS.find(c => {
          const name = c.id.toLowerCase().replace(/-/g, ' ')
          return fileName.includes(name) || fileName.includes(c.id.toLowerCase())
        }) || CLIENTS.find(c => fileName.includes(c.name.toLowerCase().split(' ')[0].toLowerCase()))

        if (!matchedClient) {
          results.push({ clientId: 'none', clientName: 'Could not match client from file name — rename file to include client name', rows: 0, metrics: {} })
        } else {
          function parseDurationSec(raw: string): number {
            if (!raw) return 0
            const m = raw.match(/(\d+)m\s*(\d+)s/)
            if (m) return parseInt(m[1]) * 60 + parseInt(m[2])
            const s = raw.match(/(\d+)s/)
            if (s) return parseInt(s[1])
            return 0
          }

          const callRows: any[] = []
          let totalCalls = 0, answeredCalls = 0, totalDuration = 0

          for (let i = 1; i < lines.length; i++) {
            const cols = parseCSVLine(lines[i])
            if (!cols[dateCol]) continue
            const durRaw = cols[durCol]?.trim() || '0m 0s'
            const durSec = parseDurationSec(durRaw)
            const isAnswered = durSec > 5
            totalCalls++
            if (isAnswered) answeredCalls++
            totalDuration += durSec

            // Parse date MM/DD/YYYY
            const dateParts = (cols[dateCol] || '').split('/')
            let callDate = null
            if (dateParts.length === 3) {
              callDate = `${dateParts[2]}-${dateParts[0].padStart(2,'0')}-${dateParts[1].padStart(2,'0')}`
            }

            callRows.push({
              client_id: matchedClient.id,
              call_date: callDate,
              call_time: cols[timeCol]?.trim() || null,
              caller_name: cols[nameCol]?.trim() || null,
              caller_phone: cols[phoneCol]?.trim() || null,
              duration_raw: durRaw,
              duration_sec: durSec,
              how_heard: cols[heardCol]?.trim() || null,
              message_reason: cols[msgCol]?.trim() || null,
              call_summary: cols[summaryCol]?.trim() || null,
              address: cols[addrCol]?.trim() || null,
              email: cols[emailCol]?.trim() || null,
              call_month: callDate ? callDate.slice(0, 7) : month,
              is_spam: durSec < 5,
            })
          }

          // Delete existing calls for this client/month then insert fresh
          await supabase.from('cira_calls').delete().eq('client_id', matchedClient.id).eq('call_month', month)
          if (callRows.length > 0) {
            const BATCH = 200
            for (let b = 0; b < callRows.length; b += BATCH) {
              await supabase.from('cira_calls').insert(callRows.slice(b, b + BATCH))
            }
          }

          // Also upsert summary metrics to report_data
          const avgDuration = answeredCalls > 0 ? Math.round(totalDuration / answeredCalls) : 0
          await supabase.from('report_data').upsert([
            { client_id: matchedClient.id, month, section: 'calls', platform: 'cira', metric: 'total_calls', value: totalCalls },
            { client_id: matchedClient.id, month, section: 'calls', platform: 'cira', metric: 'answered_calls', value: answeredCalls },
            { client_id: matchedClient.id, month, section: 'calls', platform: 'cira', metric: 'avg_duration_sec', value: avgDuration },
          ], { onConflict: 'client_id,month,section,platform,metric' })

          results.push({
            clientId: matchedClient.id,
            clientName: matchedClient.name,
            rows: callRows.length,
            metrics: { total_calls: totalCalls, answered: answeredCalls, avg_duration_sec: avgDuration }
          })
        }
      }

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
    if (fileType === 'profile_performance') {
      for (const r of results) { await loadTopPosts(r.clientId, month) }
    }
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
  const [clientDataStatus, setClientDataStatus] = useState<Record<string, any>>({})

  useEffect(() => {
    async function loadClientStatus() {
      const { data } = await supabase
        .from('report_data')
        .select('client_id, section')
        .eq('month', month)
      const { data: ciraCalls } = await supabase
        .from('cira_calls')
        .select('client_id')
        .eq('call_month', month)
      const { data: portalUsers } = await supabase
        .from('portal_users')
        .select('client_id')
      const statusMap: Record<string, any> = {}
      for (const row of data || []) {
        if (!statusMap[row.client_id]) statusMap[row.client_id] = {}
        statusMap[row.client_id][row.section] = true
      }
      for (const row of ciraCalls || []) {
        if (!statusMap[row.client_id]) statusMap[row.client_id] = {}
        statusMap[row.client_id]['calls'] = (statusMap[row.client_id]['calls'] || 0) + 1
      }
      for (const row of portalUsers || []) {
        if (!statusMap[row.client_id]) statusMap[row.client_id] = {}
        statusMap[row.client_id]['portal'] = true
      }
      setClientDataStatus(statusMap)
    }
    loadClientStatus()
  }, [month, uploads])

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
                      <div key={r.clientId}>
                        <div className="flex items-center justify-between px-3 py-2 rounded-lg text-xs"
                          style={{ background: 'var(--bg)', border: '0.5px solid var(--border)' }}>
                          <span className="font-medium" style={{ color: 'var(--text)' }}>{r.clientName}</span>
                          <span style={{ color: 'var(--text-muted)' }}>
                            {r.rows} rows
                            {Object.keys(r.metrics).slice(0, 3).map(k => {
                              const parts = k.split('__'); const [platform, metric] = parts.length > 1 ? parts : [k, null]
                              return metric ? ` · ${platform} ${metric}: ${Math.round(r.metrics[k]).toLocaleString()}` : ` · ${Math.round(r.metrics[k]).toLocaleString()} ${platform}`
                            }).join('')}
                          </span>
                        </div>
                        {topPosts[r.clientId]?.length > 0 && (
                          <div className="mt-2">
                            <div className="text-xs font-semibold uppercase tracking-wide mb-2 px-1" style={{ color: 'var(--text-muted)' }}>Top 3 Posts</div>
                            <div className="grid grid-cols-3 gap-2">
                              {topPosts[r.clientId].slice(0, 3).map((p, i) => {
                                const netIcon: Record<string,string> = { facebook: '📘', fb_instagram_account: '📸', instagram: '📸', linkedin_company: '💼', youtube: '▶️', tiktok: '🎵' }
                                return (
                                  <div key={i} className="rounded-lg p-3 text-xs" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
                                    <div className="flex items-center gap-1 mb-1">
                                      <span>{netIcon[p.network] || '📱'}</span>
                                      <span className="uppercase font-semibold" style={{ color: 'var(--text-muted)', fontSize: 10 }}>{p.post_type || 'Post'}</span>
                                      <span style={{ color: 'var(--text-muted)', fontSize: 10, marginLeft: 'auto' }}>{p.published_at?.slice(0,10)}</span>
                                    </div>
                                    <div className="line-clamp-3 mb-2" style={{ color: 'var(--text)', lineHeight: 1.4 }}>
                                      {p.text_content?.slice(0, 80) || '—'}{p.text_content?.length > 80 ? '…' : ''}
                                    </div>
                                    <div className="flex gap-2" style={{ color: 'var(--text-muted)' }}>
                                      <span>❤️ {p.engagements?.toLocaleString() || 0}</span>
                                      {p.video_views > 0 && <span>▶️ {p.video_views?.toLocaleString()}</span>}
                                      <span style={{ marginLeft: 'auto' }}>👁 {p.impressions?.toLocaleString() || 0}</span>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Per-client status table */}
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>
            Client Status — {monthLabel(month)}
          </h2>
          <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--bg-sunken)', borderBottom: '1px solid var(--border)' }}>
                  <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 600, color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Client</th>
                  {['Social', 'GMB', 'G Ads', 'Meta', 'LSA', 'Calls', 'Portal', 'Actions'].map(h => (
                    <th key={h} style={{ textAlign: 'center', padding: '8px 8px', fontWeight: 600, color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {CLIENTS.map((client, i) => {
                  const s = clientDataStatus[client.id] || {}
                  const ns = narrativeStatus[client.id] || 'idle'
                  const hasData = uploadedClients.has(client.id)
                  const chk = (v: boolean) => v
                    ? <span style={{ color: '#16a34a', fontSize: 15 }}>✓</span>
                    : <span style={{ color: 'var(--text-muted)', opacity: 0.3, fontSize: 13 }}>—</span>
                  return (
                    <tr key={client.id} style={{ borderTop: i === 0 ? 'none' : '0.5px solid var(--border)', background: 'var(--bg-elevated)' }}>
                      <td style={{ padding: '9px 12px', fontWeight: 500, color: 'var(--text)', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ width: 6, height: 6, borderRadius: '50%', background: hasData ? '#16a34a' : 'var(--border)', flexShrink: 0 }} />
                          {client.name}
                        </div>
                      </td>
                      <td style={{ textAlign: 'center', padding: '9px 8px' }}>{chk(!!s.social_organic)}</td>
                      <td style={{ textAlign: 'center', padding: '9px 8px' }}>{chk(!!s.gmb)}</td>
                      <td style={{ textAlign: 'center', padding: '9px 8px' }}>
                        {WINDSOR_GADS_CLIENTS.has(client.id) ? <span style={{ fontSize: 10, background: '#E6F1FB', color: '#185FA5', padding: '2px 6px', borderRadius: 10, fontWeight: 600 }}>Live</span> : chk(false)}
                      </td>
                      <td style={{ textAlign: 'center', padding: '9px 8px' }}>
                        {WINDSOR_META_CLIENTS.has(client.id) ? <span style={{ fontSize: 10, background: '#E6F1FB', color: '#185FA5', padding: '2px 6px', borderRadius: 10, fontWeight: 600 }}>Live</span> : chk(false)}
                      </td>
                      <td style={{ textAlign: 'center', padding: '9px 8px' }}>
                        {LSA_CLIENTS.has(client.id) ? <span style={{ fontSize: 10, background: '#EAF3DE', color: '#3B6D11', padding: '2px 6px', borderRadius: 10, fontWeight: 600 }}>LSA</span> : chk(false)}
                      </td>
                      <td style={{ textAlign: 'center', padding: '9px 8px' }}>
                        {s.calls > 0 ? <span style={{ fontSize: 10, background: '#EAF3DE', color: '#3B6D11', padding: '2px 6px', borderRadius: 10, fontWeight: 600 }}>{s.calls}</span> : chk(false)}
                      </td>
                      <td style={{ textAlign: 'center', padding: '9px 8px' }}>{chk(!!s.portal)}</td>
                      <td style={{ textAlign: 'center', padding: '9px 4px' }}>
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'center', flexWrap: 'nowrap' }}>
                          {hasData && (
                            <>
                              <button onClick={() => generateNarrative(client.id)} disabled={ns === 'generating'}
                                style={{ fontSize: 10, padding: '3px 7px', borderRadius: 6, background: 'rgba(99,102,241,0.1)', color: '#6366f1', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', opacity: ns === 'generating' ? 0.5 : 1 }}>
                                {ns === 'generating' ? '…' : ns === 'done' ? '✓' : '✦ Narrative'}
                              </button>
                              <a href={`/reports/${client.id}`} target="_blank"
                                style={{ fontSize: 10, padding: '3px 7px', borderRadius: 6, background: 'var(--bg)', border: '0.5px solid var(--border)', color: 'var(--text)', textDecoration: 'none', whiteSpace: 'nowrap' }}>
                                View
                              </a>
                              <button onClick={() => clearClientMonth(client.id)} disabled={clearing === client.id}
                                style={{ fontSize: 10, padding: '3px 7px', borderRadius: 6, background: 'rgba(239,68,68,0.08)', color: '#ef4444', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', opacity: clearing === client.id ? 0.5 : 1 }}>
                                {clearing === client.id ? '…' : '× Clear'}
                              </button>
                            </>
                          )}
                          {!hasData && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>No data</span>}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 11, color: 'var(--text-muted)', flexWrap: 'wrap' }}>
            <span><span style={{ color: '#16a34a' }}>✓</span> Data uploaded</span>
            <span><span style={{ fontSize: 10, background: '#E6F1FB', color: '#185FA5', padding: '1px 5px', borderRadius: 8, fontWeight: 600 }}>Live</span> Windsor live</span>
            <span><span style={{ fontSize: 10, background: '#EAF3DE', color: '#3B6D11', padding: '1px 5px', borderRadius: 8, fontWeight: 600 }}>n</span> Call count</span>
          </div>
        </div>

      </div>
    </div>
  )
}
