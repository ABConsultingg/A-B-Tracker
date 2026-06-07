'use client'
import React, { useState, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

type Message = { role: 'user' | 'assistant'; content: string }
type AttachedFile = { name: string; type: string; content: string; size: number }

const CLIENT_KEYWORDS: Record<string, string[]> = {
  'nico-roofing':         ['nico roofing', 'nicoroofing', 'nico r'],
  'culture':              ['culture construction', 'cultureccc'],
  'kbc-exteriors':        ['kbc exteriors', 'kbcexteriors', 'kbc commercial'],
  'mvp-chiro':            ['mvp chiro', 'mvpchiro', 'mvp chiropractic'],
  'midwest-construction': ['midwest construction', 'midwestconstruction', 'midwest construction experts'],
  'rbs':                  ['richards building', 'richardssupply', 'richards building supply'],
  'apollo-events':        ['apollo supply', 'apollosupply'],
}

const CLIENT_NAMES: Record<string, string> = {
  'nico-roofing':         'Nico Roofing & Exteriors',
  'culture':              'Culture Construction',
  'kbc-exteriors':        'KBC Exteriors LLC',
  'mvp-chiro':            'MVP Chiropractic',
  'midwest-construction': 'Midwest Construction Experts',
  'rbs':                  'Richards Building Supply',
  'apollo-events':        'Apollo Supply',
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

function fmtBytes(b: number) {
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / (1024 * 1024)).toFixed(1)} MB`
}

function detectClientFromProfile(profile: string): string | null {
  const p = profile.toLowerCase().replace(/^'/, '').trim()
  for (const [clientId, keywords] of Object.entries(CLIENT_KEYWORDS)) {
    if (keywords.some(k => p.includes(k))) return clientId
  }
  return null
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

function cleanNum(s: string | undefined): number {
  if (!s) return 0
  return parseFloat(s.replace(/[,"%]/g, '').trim()) || 0
}

function cleanMoney(s: string | undefined): number {
  if (!s) return 0
  return parseFloat(s.replace(/[$,]/g, '').trim()) || 0
}

function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split('\n')
  return lines.map((line, i) => {
    const parts = line.split(/\*\*(.*?)\*\*/g)
    const rendered = parts.map((part, j) =>
      j % 2 === 1 ? <strong key={j}>{part}</strong> : <span key={j}>{part}</span>
    )
    return <div key={i} style={{ minHeight: line === '' ? '0.5em' : undefined }}>{rendered}</div>
  })
}

export default function ClaudeClient({
  authUserId, role, memberName,
}: { authUserId: string; role: string; memberName: string }) {
  const supabase = createClient()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([])
  const [processing, setProcessing] = useState(false)
  const [processingStatus, setProcessingStatus] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading, processingStatus])

  const suggestions: { label: string; action: string }[] = [
    { label: "What's overdue right now?",              action: 'send' },
    { label: "What's waiting for client approval?",    action: 'send' },
    { label: "What's our pipeline value?",             action: 'send' },
    { label: "What did Tanya work on this week?",      action: 'send' },
    { label: "Which clients have the most active WOs?", action: 'send' },
    { label: "Which client reports need approval?",    action: 'send' },
    { label: "What did we deliver this month?",        action: 'send' },
    { label: "Show me RBS May report",                 action: 'send' },
    { label: "Show me in-progress for Apollo",         action: 'send' },
    { label: "Process monthly reports",                action: 'upload' },
    { label: "Add internal files to a WO",             action: 'send' },
    { label: "Paste a meeting transcript",             action: 'meetings' },
  ]

  async function readFileAsText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = e => resolve(e.target?.result as string)
      reader.onerror = reject
      reader.readAsText(file)
    })
  }

  async function handleFilesSelected(files: FileList) {
    const newFiles: AttachedFile[] = []
    for (const file of Array.from(files)) {
      if (file.name.endsWith('.csv')) {
        const content = await readFileAsText(file)
        newFiles.push({ name: file.name, type: 'csv', content, size: file.size })
      } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        const content = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = e => resolve(e.target?.result as string)
          reader.onerror = reject
          reader.readAsDataURL(file)
        })
        newFiles.push({ name: file.name, type: 'excel', content, size: file.size })
      } else {
        // Any other file type — store name and size for display, read as text if possible
        try {
          const content = await readFileAsText(file)
          newFiles.push({ name: file.name, type: 'document', content, size: file.size })
        } catch {
          newFiles.push({ name: file.name, type: 'document', content: '', size: file.size })
        }
      }
    }
    setAttachedFiles(prev => [...prev, ...newFiles])
  }

  function detectFileType(filename: string): string {
    const lower = filename.toLowerCase()
    if (lower.includes('profile_performance') || lower.includes('profile performance')) return 'profile_performance'
    if (lower.includes('post_performance') || lower.includes('post performance')) return 'post_performance'
    if (lower.includes('paid_performance') || lower.includes('paid performance')) return 'paid_performance'
    if (lower.includes('.xlsx') || lower.includes('.xls')) return 'metrics_excel'
    return 'unknown'
  }

  async function processReportFiles(month: string): Promise<string> {
    const profileFile = attachedFiles.find(f => f.name.toLowerCase().includes('profile'))
    const postFile = attachedFiles.find(f => f.name.toLowerCase().includes('post') && !f.name.toLowerCase().includes('profile'))
    const paidFile = attachedFiles.find(f => f.name.toLowerCase().includes('paid'))

    const allClientMetrics: Record<string, Record<string, number>> = {}

    // Parse Profile Performance — split by client
    if (profileFile) {
      setProcessingStatus('Parsing Profile Performance CSV…')
      const lines = profileFile.content.split('\n').filter(l => l.trim())
      const headers = parseCSVLine(lines[0])
      const profileCol = headers.indexOf('Profile')
      const networkCol = headers.indexOf('Network')
      const impressionsCol = headers.indexOf('Impressions')
      const engagementsCol = headers.indexOf('Engagements')
      const gainedCol = headers.indexOf('Audience Gained')
      const postsCol = headers.indexOf('Published Posts (Total)')

      for (let i = 1; i < lines.length; i++) {
        const cols = parseCSVLine(lines[i])
        const profile = (cols[profileCol] ?? '').replace(/^'/, '').trim()
        const clientId = detectClientFromProfile(profile)
        if (!clientId) continue

        if (!allClientMetrics[clientId]) allClientMetrics[clientId] = {}
        const m = allClientMetrics[clientId]
        const network = (cols[networkCol] ?? '').toLowerCase().replace(/\s+/g, '_')
        const k = (metric: string) => `social_organic__${network}__${metric}`

        m[k('impressions')] = (m[k('impressions')] || 0) + cleanNum(cols[impressionsCol])
        m[k('engagements')] = (m[k('engagements')] || 0) + cleanNum(cols[engagementsCol])
        m[k('audience_gained')] = (m[k('audience_gained')] || 0) + cleanNum(cols[gainedCol])
        m[k('posts')] = (m[k('posts')] || 0) + cleanNum(cols[postsCol])
      }
    }

    // Parse Paid Performance — split by client (or assign to all if no client column)
    if (paidFile) {
      setProcessingStatus('Parsing Paid Performance CSV…')
      const lines = paidFile.content.split('\n').filter(l => l.trim())
      const headers = parseCSVLine(lines[0])
      const spendCol = headers.indexOf('Total Spend')
      const impressionsCol = headers.indexOf('Impressions')
      const clicksCol = headers.indexOf('Clicks')
      const engCol = headers.indexOf('Engagements')
      const lpvCol = headers.indexOf('Landing Page Views')
      const campCol = headers.indexOf('Campaign')
      const adAccountCol = headers.indexOf('Ad Account Name')

      // Group spend by ad account name → map to client
      const accountTotals: Record<string, Record<string, number>> = {}

      for (let i = 1; i < lines.length; i++) {
        const cols = parseCSVLine(lines[i])
        if (!cols[campCol]) continue
        const accountName = (cols[adAccountCol] ?? '').toLowerCase()

        // Detect client from ad account name
        let clientId = detectClientFromProfile(accountName)
        if (!clientId) clientId = 'rbs' // default to RBS since that's what's connected

        if (!accountTotals[clientId]) accountTotals[clientId] = {}
        const m = accountTotals[clientId]
        m['spend'] = (m['spend'] || 0) + cleanMoney(cols[spendCol])
        m['impressions'] = (m['impressions'] || 0) + cleanNum(cols[impressionsCol])
        m['clicks'] = (m['clicks'] || 0) + cleanNum(cols[clicksCol])
        m['engagements'] = (m['engagements'] || 0) + cleanNum(cols[engCol])
        m['landing_page_views'] = (m['landing_page_views'] || 0) + cleanNum(cols[lpvCol])
      }

      for (const [clientId, metrics] of Object.entries(accountTotals)) {
        if (!allClientMetrics[clientId]) allClientMetrics[clientId] = {}
        for (const [metric, value] of Object.entries(metrics)) {
          allClientMetrics[clientId][`meta_ads__all__${metric}`] = value
        }
      }
    }

    // Write all metrics to Supabase
    setProcessingStatus('Writing to database…')
    const clients = Object.keys(allClientMetrics)
    let totalRows = 0

    for (const clientId of clients) {
      const metrics = allClientMetrics[clientId]
      const upserts = Object.entries(metrics).map(([key, value]) => {
        const parts = key.split('__')
        return {
          client_id: clientId,
          month,
          section: parts[0],
          platform: parts[1] || null,
          metric: parts[2] || parts[1],
          value,
          source: 'sprout_csv',
        }
      })

      if (upserts.length > 0) {
        await supabase.from('report_data').upsert(upserts, {
          onConflict: 'client_id,month,section,platform,metric'
        })
        totalRows += upserts.length

        // Record upload
        await supabase.from('monthly_uploads').upsert({
          client_id: clientId,
          month,
          file_type: 'profile_performance',
          file_name: profileFile?.name || 'sprout_export',
          storage_path: `reports/${clientId}/${month}/profile_performance`,
          parse_status: 'done',
          row_count: upserts.length,
          processed_at: new Date().toISOString(),
          uploaded_by: memberName,
        }, { onConflict: 'client_id,month,file_type' })
      }
    }

    // Generate narratives for all clients
    setProcessingStatus('Generating AI narratives for all clients…')
    const narrativeResults: string[] = []

    for (const clientId of clients) {
      const clientName = CLIENT_NAMES[clientId] || clientId
      const metrics = allClientMetrics[clientId]
      const summary = Object.entries(metrics)
        .map(([k, v]) => `${k}: ${v}`)
        .join('\n')

      try {
        const res = await fetch('/api/reports/narrative', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientId, clientName, month: monthLabel(month), summary }),
        })
        if (res.ok) {
          const { narrative } = await res.json()
          await supabase.from('client_reports').upsert({
            client_id: clientId,
            month,
            status: 'draft',
            narrative,
            narrative_generated_at: new Date().toISOString(),
          }, { onConflict: 'client_id,month' })
          narrativeResults.push(`✓ ${clientName}`)
        }
      } catch {
        narrativeResults.push(`✗ ${clientName} (narrative failed)`)
      }
    }

    // Build summary
    const clientSummary = clients.map(id => {
      const m = allClientMetrics[id]
      const impressions = Object.entries(m)
        .filter(([k]) => k.includes('impressions') && k.includes('social'))
        .reduce((s, [, v]) => s + v, 0)
      const engagements = Object.entries(m)
        .filter(([k]) => k.includes('engagements') && k.includes('social'))
        .reduce((s, [, v]) => s + v, 0)
      const metaSpend = m['meta_ads__all__spend'] || 0
      return `**${CLIENT_NAMES[id] || id}**: ${impressions.toLocaleString()} impressions, ${engagements.toLocaleString()} engagements${metaSpend ? `, $${metaSpend.toLocaleString()} Meta spend` : ''}`
    }).join('\n')

    return `✅ Processed ${monthLabel(month)} reports for **${clients.length} clients** — ${totalRows} data points written.\n\n${clientSummary}\n\nNarratives generated:\n${narrativeResults.join('\n')}\n\nReports are ready for review at /reports — approve each one to make it live in the client portal.`
  }

  async function send(text?: string) {
    const userText = (text || input).trim()

    // If files attached + user explicitly asks to process reports — run Sprout pipeline
    const isReportRequest = userText.toLowerCase().includes('process') && userText.toLowerCase().includes('report')
    if (attachedFiles.length > 0 && isReportRequest) {
      setProcessing(true)
      setInput('')
      const month = currentMonth()
      const fileList = attachedFiles.map(f => f.name).join(', ')
      const userMsg = `Process ${monthLabel(month)} reports from these files: ${fileList}`
      setMessages(prev => [...prev, { role: 'user', content: userMsg }])
      try {
        const result = await processReportFiles(month)
        setMessages(prev => [...prev, { role: 'assistant', content: result }])
      } catch (e: any) {
        setMessages(prev => [...prev, { role: 'assistant', content: `Error processing files: ${e.message}` }])
      } finally {
        setProcessing(false)
        setProcessingStatus('')
        setAttachedFiles([])
      }
      return
    }

    // Files attached but not a report request — include file contents as context in chat
    if (attachedFiles.length > 0) {
      const fileContext = attachedFiles
        .filter(f => f.content)
        .map(f => `[File: ${f.name}]\n${f.content.substring(0, 3000)}${f.content.length > 3000 ? '\n...(truncated)' : ''}`)
        .join('\n\n')
      const fullMessage = userText
        ? `${userText}\n\n${fileContext}`
        : `Please review these attached files:\n\n${fileContext}`
      const displayMsg = userText
        ? `${userText} [+ ${attachedFiles.length} file${attachedFiles.length > 1 ? 's' : ''}]`
        : `Review: ${attachedFiles.map(f => f.name).join(', ')}`
      setInput('')
      setAttachedFiles([])
      const newMessages: Message[] = [...messages, { role: 'user', content: fullMessage }]
      setMessages(prev => [...prev, { role: 'user', content: displayMsg }])
      setLoading(true)
      try {
        const res = await fetch('/api/claude', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: newMessages, authUserId, role, memberName }),
        })
        const data = await res.json()
        setMessages(prev => [...prev, { role: 'assistant', content: data.text || 'Sorry, something went wrong.' }])
      } catch {
        setMessages(prev => [...prev, { role: 'assistant', content: 'Connection error. Please try again.' }])
      } finally {
        setLoading(false)
      }
      return
    }

    if (!userText || loading) return
    setInput('')
    const newMessages: Message[] = [...messages, { role: 'user', content: userText }]
    setMessages(newMessages)
    setLoading(true)
    try {
      const res = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages, authUserId, role, memberName }),
      })
      const data = await res.json()
      let responseText = data.text || 'Sorry, something went wrong.'
      if (data.tools_used?.length) {
        const toolLabels: Record<string, string> = {
          create_wo: '✅ Created work order',
          update_stage: '✅ Updated stage',
          assign_wo: '✅ Assigned work order',
          send_message: '✅ Sent message',
          notify_client: '✅ Notified client',
          add_schedule_date: '✅ Added schedule date',
        }
        const used = data.tools_used.map((t: string) => toolLabels[t] || t).join(' · ')
        responseText = used + '\n\n' + responseText
      }
      setMessages(prev => [...prev, { role: 'assistant', content: responseText }])
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Connection error. Please try again.' }])
    } finally {
      setLoading(false)
    }
  }

  const isProcessingFiles = attachedFiles.length > 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 56px)', background: 'var(--bg)' }}>
      {/* Header */}
      <div style={{ padding: '20px 28px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg-elevated)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 24 }}>✦</span>
          <div>
            <h1 style={{ fontFamily: 'Fraunces, serif', fontSize: 22, color: 'var(--text)', margin: 0 }}>A&B Assistant</h1>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>Ask anything about your work orders, clients, and pipeline · Drop Sprout CSVs to process monthly reports</p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px' }}>
        {messages.length === 0 && (
          <div>
            <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 16 }}>
              Hi {memberName.split(' ')[0]}! What would you like to know?
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
              {suggestions.map(s => (
                <button key={s.label} onClick={() => {
                  if (s.action === 'upload') { fileInputRef.current?.click() }
                  else if (s.action === 'meetings') { window.location.href = '/dashboard/meetings' }
                  else send(s.label)
                }}
                  style={{ padding: '8px 14px', borderRadius: 20, border: '1px solid var(--border)',
                           background: s.action !== 'send' ? 'var(--brand-accent-soft, #fdf6e8)' : 'var(--bg-elevated)',
                           color: 'var(--text)', fontSize: 13, cursor: 'pointer' }}>
                  {s.action === 'upload' ? '📎 ' : s.action === 'meetings' ? '📋 ' : ''}{s.label}
                </button>
              ))}
            </div>
            <div
              onDragOver={e => { e.preventDefault() }}
              onDrop={e => { e.preventDefault(); if (e.dataTransfer.files.length) handleFilesSelected(e.dataTransfer.files) }}
              onClick={() => fileInputRef.current?.click()}
              style={{ border: '2px dashed var(--border)', borderRadius: 10, padding: '24px',
                       textAlign: 'center', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 13 }}>
              📂 Drop Sprout CSVs here to process monthly reports for all clients at once
            </div>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {messages.map((m, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
              {m.role === 'assistant' && (
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#1a2744',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 14, marginRight: 8, flexShrink: 0, marginTop: 2 }}>✦</div>
              )}
              <div style={{
                maxWidth: '75%', padding: '10px 14px', borderRadius: 12,
                borderBottomRightRadius: m.role === 'user' ? 4 : 12,
                borderBottomLeftRadius: m.role === 'assistant' ? 4 : 12,
                background: m.role === 'user' ? '#1a2744' : 'var(--bg-elevated)',
                color: m.role === 'user' ? '#f5f3ec' : 'var(--text)',
                border: m.role === 'assistant' ? '1px solid var(--border)' : 'none',
                fontSize: 14, lineHeight: 1.6,
              }}>
                {m.role === 'assistant' ? renderMarkdown(m.content) : m.content}
              </div>
            </div>
          ))}
          {(loading || processing) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#1a2744',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>✦</div>
              <div style={{ padding: '10px 14px', borderRadius: 12, background: 'var(--bg-elevated)',
                            border: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: 14 }}>
                {processingStatus || 'Thinking…'}
              </div>
            </div>
          )}
        </div>
        <div ref={bottomRef} />
      </div>

      {/* Attached files preview */}
      {attachedFiles.length > 0 && (
        <div style={{ padding: '8px 28px', borderTop: '1px solid var(--border)', background: 'var(--bg-elevated)',
                      display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', marginRight: 4 }}>Ready to process:</span>
          {attachedFiles.map((f, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px',
                                   borderRadius: 20, background: 'var(--bg)', border: '1px solid var(--border)',
                                   fontSize: 12, color: 'var(--text)' }}>
              <span>{f.type === 'excel' ? '📗' : '📊'}</span>
              <span>{f.name}</span>
              <span style={{ color: 'var(--text-muted)' }}>{fmtBytes(f.size)}</span>
              <button onClick={() => setAttachedFiles(prev => prev.filter((_, j) => j !== i))}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)',
                         fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
            </div>
          ))}
        </div>
      )}

      {/* Input */}
      <div style={{ padding: '16px 28px', borderTop: '1px solid var(--border)', background: 'var(--bg-elevated)' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {/* Paperclip */}
          <button
            onClick={() => fileInputRef.current?.click()}
            title="Attach Sprout CSVs to process monthly reports"
            style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)',
                     background: 'var(--bg)', color: 'var(--text-muted)', fontSize: 18,
                     cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center' }}>
            📎
          </button>
          <input ref={fileInputRef} type="file" multiple accept="*/*"
            onChange={e => e.target.files && handleFilesSelected(e.target.files)}
            style={{ display: 'none' }} />

          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
            placeholder={attachedFiles.length > 0 ? `${attachedFiles.length} file${attachedFiles.length > 1 ? 's' : ''} attached — type a message or just Send` : 'Ask about work orders, clients, pipeline…'}
            style={{ flex: 1, padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)',
                     background: 'var(--bg)', color: 'var(--text)', fontSize: 14, fontFamily: 'inherit' }}
          />
          <button
            onClick={() => send()}
            disabled={loading || processing || (!input.trim() && attachedFiles.length === 0)}
            style={{ padding: '10px 18px', borderRadius: 8, border: 'none', background: '#1a2744',
                     color: '#b8860b', fontWeight: 700, fontSize: 14, cursor: 'pointer', flexShrink: 0,
                     opacity: (loading || processing || (!input.trim() && attachedFiles.length === 0)) ? 0.5 : 1 }}>
            Send
          </button>
        </div>
        {messages.length > 0 && (
          <button onClick={() => setMessages([])}
            style={{ marginTop: 8, background: 'none', border: 'none', color: 'var(--text-muted)',
                     fontSize: 12, cursor: 'pointer' }}>
            Clear conversation
          </button>
        )}
      </div>
    </div>
  )
}
