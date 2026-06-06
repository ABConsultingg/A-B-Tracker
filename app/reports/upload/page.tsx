'use client'
import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

const CLIENTS = [
  { id: 'nico-roofing',          name: 'Nico Roofing & Exteriors' },
  { id: 'culture',               name: 'Culture Construction' },
  { id: 'rbs',                   name: 'Richards Building Supply' },
  { id: 'apollo-events',         name: 'Apollo Supply' },
  { id: 'mvp-chiro',             name: 'MVP Chiropractic' },
]

const FILE_TYPES = [
  { key: 'profile_performance', label: 'Profile Performance',  icon: '📊', accept: '.csv', desc: 'Sprout Social — daily profile metrics CSV' },
  { key: 'post_performance',    label: 'Post Performance',     icon: '📊', accept: '.csv', desc: 'Sprout Social — individual post metrics CSV' },
  { key: 'paid_performance',    label: 'Paid Performance',     icon: '🎯', accept: '.csv', desc: 'Sprout Social — Meta Ads paid CSV' },
  { key: 'metrics_excel',       label: 'Metrics Report',       icon: '📗', accept: '.xlsx,.xls', desc: "Montse's monthly metrics Excel file" },
]

type UploadStatus = {
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
  return new Date(Number(y), Number(mo) - 1, 1)
    .toLocaleString('default', { month: 'long', year: 'numeric' })
}

export default function ReportsUploadPage() {
  const supabase = createClient()
  const [clientId, setClientId] = useState(CLIENTS[0].id)
  const [month, setMonth] = useState(currentMonth())
  const [uploads, setUploads] = useState<UploadStatus[]>([])
  const [uploading, setUploading] = useState<string | null>(null)
  const [draggingOver, setDraggingOver] = useState<string | null>(null)
  const [narrativeStatus, setNarrativeStatus] = useState<'idle'|'generating'|'done'|'error'>('idle')
  const refs = useRef<Record<string, HTMLInputElement | null>>({})

  useEffect(() => { loadUploads() }, [clientId, month])

  async function loadUploads() {
    const { data } = await supabase
      .from('monthly_uploads')
      .select('file_type, file_name, parse_status, row_count')
      .eq('client_id', clientId)
      .eq('month', month)
    setUploads(data || [])
  }

  async function handleFile(fileType: string, file: File) {
    setUploading(fileType)
    const { data: { user } } = await supabase.auth.getUser()
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `reports/${clientId}/${month}/${fileType}_${Date.now()}_${safeName}`

    const { error: upErr } = await supabase.storage
      .from('ab-files')
      .upload(path, file, { upsert: true })

    if (upErr) { alert('Upload failed: ' + upErr.message); setUploading(null); return }

    await supabase.from('monthly_uploads').upsert({
      client_id: clientId,
      month,
      file_type: fileType,
      file_name: file.name,
      storage_path: path,
      mime_type: file.type || null,
      size_bytes: file.size,
      parse_status: 'pending',
      uploaded_by: user?.email ?? 'unknown',
    }, { onConflict: 'client_id,month,file_type' })

    // Parse CSV files client-side
    if (file.name.endsWith('.csv')) {
      await parseCsv(fileType, file, path)
    } else {
      // Excel — mark done, parsing happens server-side
      await supabase.from('monthly_uploads')
        .update({ parse_status: 'done', processed_at: new Date().toISOString() })
        .eq('client_id', clientId).eq('month', month).eq('file_type', fileType)
    }

    await loadUploads()
    setUploading(null)
  }

  async function parseCsv(fileType: string, file: File, path: string) {
    const text = await file.text()
    const lines = text.split('\n').filter(l => l.trim())
    if (lines.length < 2) return

    const headers = parseCSVLine(lines[0])
    const metrics: Record<string, number> = {}
    let rowCount = 0

    const clientKeywords: Record<string, string[]> = {
      'nico-roofing':  ['nico roofing', 'nicoroofing'],
      'culture':       ['culture construction', 'cultureccc'],
      'rbs':           ['richards building', 'richardssupply'],
      'apollo-events': ['apollo supply'],
      'mvp-chiro':     ['mvp chiro', 'mvpchiro', 'mvp chiropractic'],
    }
    const keywords = clientKeywords[clientId] || []

    if (fileType === 'profile_performance') {
      const profileCol = headers.indexOf('Profile')
      const networkCol = headers.indexOf('Network')
      const impressionsCol = headers.indexOf('Impressions')
      const engagementsCol = headers.indexOf('Engagements')
      const gainedCol = headers.indexOf('Audience Gained')
      const postsCol = headers.indexOf('Published Posts (Total)')

      for (let i = 1; i < lines.length; i++) {
        const cols = parseCSVLine(lines[i])
        const profile = (cols[profileCol] ?? '').replace(/^'/, '').toLowerCase()
        if (!keywords.some(k => profile.includes(k))) continue
        rowCount++
        const network = (cols[networkCol] ?? '').toLowerCase().replace(/\s+/g, '_')
        const k = (metric: string) => `${network}__${metric}`
        metrics[k('impressions')] = (metrics[k('impressions')] || 0) + cleanNum(cols[impressionsCol])
        metrics[k('engagements')] = (metrics[k('engagements')] || 0) + cleanNum(cols[engagementsCol])
        metrics[k('audience_gained')] = (metrics[k('audience_gained')] || 0) + cleanNum(cols[gainedCol])
        metrics[k('posts')] = (metrics[k('posts')] || 0) + cleanNum(cols[postsCol])
      }
    } else if (fileType === 'paid_performance') {
      const spendCol = headers.indexOf('Total Spend')
      const impressionsCol = headers.indexOf('Impressions')
      const clicksCol = headers.indexOf('Clicks')
      const engCol = headers.indexOf('Engagements')
      const lpvCol = headers.indexOf('Landing Page Views')
      const campCol = headers.indexOf('Campaign')

      for (let i = 1; i < lines.length; i++) {
        const cols = parseCSVLine(lines[i])
        if (!cols[campCol]) continue
        rowCount++
        metrics['meta__spend'] = (metrics['meta__spend'] || 0) + cleanMoney(cols[spendCol])
        metrics['meta__impressions'] = (metrics['meta__impressions'] || 0) + cleanNum(cols[impressionsCol])
        metrics['meta__clicks'] = (metrics['meta__clicks'] || 0) + cleanNum(cols[clicksCol])
        metrics['meta__engagements'] = (metrics['meta__engagements'] || 0) + cleanNum(cols[engCol])
        metrics['meta__landing_page_views'] = (metrics['meta__landing_page_views'] || 0) + cleanNum(cols[lpvCol])
      }
    } else if (fileType === 'post_performance') {
      const profileCol = headers.indexOf('Profile')
      rowCount = 0
      for (let i = 1; i < lines.length; i++) {
        const cols = parseCSVLine(lines[i])
        const profile = (cols[profileCol] ?? '').replace(/^'/, '').toLowerCase()
        if (!keywords.some(k => profile.includes(k))) continue
        rowCount++
      }
    }

    // Write metrics to report_data
    const upserts = Object.entries(metrics).map(([key, value]) => {
      const [platform, metric] = key.split('__')
      return {
        client_id: clientId,
        month,
        section: fileType === 'paid_performance' ? 'meta_ads' : 'social_organic',
        platform,
        metric,
        value,
        source: 'sprout_csv',
      }
    })

    if (upserts.length > 0) {
      await supabase.from('report_data').upsert(upserts, {
        onConflict: 'client_id,month,section,platform,metric'
      })
    }

    await supabase.from('monthly_uploads')
      .update({ parse_status: 'done', row_count: rowCount, processed_at: new Date().toISOString() })
      .eq('client_id', clientId).eq('month', month).eq('file_type', fileType)
  }

  async function generateNarrative() {
    setNarrativeStatus('generating')
    const { data: metrics } = await supabase
      .from('report_data')
      .select('section, platform, metric, value')
      .eq('client_id', clientId)
      .eq('month', month)

    if (!metrics?.length) { setNarrativeStatus('error'); return }

    const clientName = CLIENTS.find(c => c.id === clientId)?.name ?? clientId
    const summary = metrics.map(m =>
      `${m.section} / ${m.platform} / ${m.metric}: ${m.value}`
    ).join('\n')

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
      setNarrativeStatus('done')
    } catch {
      setNarrativeStatus('error')
    }
  }

  function statusFor(type: string) {
    return uploads.find(u => u.file_type === type)
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

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      {/* Header */}
      <div className="border-b px-6 py-4"
        style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}>
        <div className="max-w-2xl mx-auto">
          <a href="/reports" className="text-sm hover:underline"
            style={{ color: 'var(--text-muted)' }}>← Reports</a>
          <h1 className="text-2xl font-bold mt-1" style={{ color: 'var(--text)' }}>
            Monthly Upload
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Upload Sprout exports and metrics file to generate the client report.
          </p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">

        {/* Client + Month selectors */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider mb-2"
              style={{ color: 'var(--text-muted)' }}>Client</label>
            <select value={clientId} onChange={e => setClientId(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)', color: 'var(--text)' }}>
              {CLIENTS.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider mb-2"
              style={{ color: 'var(--text-muted)' }}>Month</label>
            <input type="month" value={month} onChange={e => setMonth(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)', color: 'var(--text)' }} />
          </div>
        </div>

        {/* File upload zones */}
        <div className="space-y-3">
          {FILE_TYPES.map(ft => {
            const status = statusFor(ft.key)
            const isUploading = uploading === ft.key
            const isDragging = draggingOver === ft.key

            return (
              <div key={ft.key}
                className="rounded-lg border p-4"
                style={{ background: 'var(--bg-elevated)', borderColor: isDragging ? 'var(--brand-accent, #d99e2b)' : 'var(--border)' }}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{ft.icon}</span>
                    <div>
                      <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{ft.label}</div>
                      <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{ft.desc}</div>
                    </div>
                  </div>
                  {status && (
                    <div className="text-right">
                      <div className="text-xs font-semibold"
                        style={{ color: status.parse_status === 'done' ? '#10b981' : '#f59e0b' }}>
                        {status.parse_status === 'done' ? '✓ Processed' : '⟳ Processing'}
                      </div>
                      {status.row_count != null && (
                        <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          {status.row_count.toLocaleString()} rows
                        </div>
                      )}
                      <div className="text-xs truncate max-w-32" style={{ color: 'var(--text-muted)' }}>
                        {status.file_name}
                      </div>
                    </div>
                  )}
                </div>

                <div
                  onDragOver={e => { e.preventDefault(); setDraggingOver(ft.key) }}
                  onDragLeave={() => setDraggingOver(null)}
                  onDrop={e => {
                    e.preventDefault(); setDraggingOver(null)
                    const file = e.dataTransfer.files[0]
                    if (file) handleFile(ft.key, file)
                  }}
                  onClick={() => refs.current[ft.key]?.click()}
                  className="rounded border-2 border-dashed p-4 text-center cursor-pointer transition-colors"
                  style={{
                    borderColor: isDragging ? 'var(--brand-accent, #d99e2b)' : 'var(--border)',
                    background: isDragging ? 'rgba(217,158,43,0.04)' : 'transparent',
                  }}
                >
                  <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
                    {isUploading ? 'Uploading…' : (status ? `Replace ${ft.label}` : `Drop ${ft.label} here or click`)}
                  </div>
                  <input
                    ref={el => { refs.current[ft.key] = el }}
                    type="file"
                    accept={ft.accept}
                    className="hidden"
                    onChange={e => {
                      const file = e.target.files?.[0]
                      if (file) handleFile(ft.key, file)
                      e.target.value = ''
                    }}
                  />
                </div>
              </div>
            )
          })}
        </div>

        {/* Generate narrative */}
        <div className="rounded-lg border p-4"
          style={{ background: 'rgba(99,102,241,0.04)', borderColor: 'rgba(99,102,241,0.2)' }}>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                ✦ Generate AI Narrative
              </div>
              <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                Reads uploaded data and writes the insights section for {monthLabel(month)}
              </div>
            </div>
            <button
              onClick={generateNarrative}
              disabled={narrativeStatus === 'generating' || uploads.length === 0}
              className="px-4 py-2 rounded-lg text-sm font-semibold transition-opacity disabled:opacity-40"
              style={{ background: '#6366f1', color: 'white' }}>
              {narrativeStatus === 'generating' ? 'Generating…' :
               narrativeStatus === 'done' ? '✓ Regenerate' : 'Generate'}
            </button>
          </div>
          {narrativeStatus === 'done' && (
            <div className="mt-2 text-xs" style={{ color: '#10b981' }}>
              ✓ Narrative saved — visible in the client report
            </div>
          )}
          {narrativeStatus === 'error' && (
            <div className="mt-2 text-xs" style={{ color: '#ef4444' }}>
              Failed — make sure files are uploaded first
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
