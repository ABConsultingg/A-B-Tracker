'use client'
import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

const CLIENTS = [
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
    default:
      return false
  }
}

const FILE_TYPES = [
  { key: 'profile_performance', label: 'Profile Performance', icon: '📊', accept: '.csv', desc: 'Sprout Social — daily profile metrics (all clients in one file)' },
  { key: 'post_performance',    label: 'Post Performance',    icon: '📊', accept: '.csv', desc: 'Sprout Social — individual post metrics (all clients in one file)' },
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

  async function handleFile(fileType: string, file: File) {
    setUploading(fileType)
    setParseResults(prev => ({ ...prev, [fileType]: [] }))
    const text = await file.text()
    const lines = text.split('\n').filter(l => l.trim())
    if (lines.length < 2) { setUploading(null); return }
    const headers = parseCSVLine(lines[0])
    const results: ParseResult[] = []

    if (fileType === 'profile_performance') {
      const profileCol = headers.indexOf('Profile')
      const networkCol = headers.indexOf('Network')
      const impressionsCol = headers.indexOf('Impressions')
      const engagementsCol = headers.indexOf('Engagements')
      const gainedCol = headers.indexOf('Audience Gained')
      const postsCol = headers.indexOf('Published Posts (Total)')

      const byClient: Record<string, Record<string, Record<string, number>>> = {}
      for (let i = 1; i < lines.length; i++) {
        const cols = parseCSVLine(lines[i])
        const profile = (cols[profileCol] ?? '').trim()
        const network = (cols[networkCol] ?? '').toLowerCase().replace(/\s+/g, '_')
        const matchedClient = CLIENTS.find(c => matchesClient(profile, c.id))
        if (!matchedClient) continue
        if (!byClient[matchedClient.id]) byClient[matchedClient.id] = {}
        if (!byClient[matchedClient.id][network]) byClient[matchedClient.id][network] = { impressions: 0, engagements: 0, audience_gained: 0, posts: 0 }
        byClient[matchedClient.id][network]['impressions'] += cleanNum(cols[impressionsCol])
        byClient[matchedClient.id][network]['engagements'] += cleanNum(cols[engagementsCol])
        byClient[matchedClient.id][network]['audience_gained'] += cleanNum(cols[gainedCol])
        byClient[matchedClient.id][network]['posts'] += cleanNum(cols[postsCol])
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
        if (upserts.length > 0) {
          await supabase.from('report_data').upsert(upserts, { onConflict: 'client_id,month,section,platform,metric' })
        }
        results.push({ clientId, clientName: client.name, rows: totalRows, metrics: summary })
      }

    } else if (fileType === 'post_performance') {
      const profileCol = headers.indexOf('Profile')
      const networkCol = headers.indexOf('Network')
      const byClient: Record<string, { rows: number; impressions: number; engagements: number }> = {}
      for (let i = 1; i < lines.length; i++) {
        const cols = parseCSVLine(lines[i])
        const profile = (cols[profileCol] ?? '').trim()
        const matchedClient = CLIENTS.find(c => matchesClient(profile, c.id))
        if (!matchedClient) continue
        if (!byClient[matchedClient.id]) byClient[matchedClient.id] = { rows: 0, impressions: 0, engagements: 0 }
        byClient[matchedClient.id].rows++
        byClient[matchedClient.id].impressions += cleanNum(cols[headers.indexOf('Impressions')])
        byClient[matchedClient.id].engagements += cleanNum(cols[headers.indexOf('Engagements')])
      }
      for (const [clientId, data] of Object.entries(byClient)) {
        const client = CLIENTS.find(c => c.id === clientId)!
        results.push({ clientId, clientName: client.name, rows: data.rows, metrics: { impressions: data.impressions, engagements: data.engagements } })
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
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(ft.key, f); e.target.value = '' }}
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
