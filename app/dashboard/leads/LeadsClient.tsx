'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

type Lead = {
  id: string
  created_at: string
  name: string | null
  email: string | null
  phone: string | null
  business_name: string
  website: string | null
  industry: string | null
  location: string | null
  status: 'new' | 'contacted' | 'proposal' | 'won' | 'lost'
  priority: 'low' | 'medium' | 'high'
  assigned_to: string | null
  source: string
  assessment_score: number | null
  assessment_grade: string | null
  assessment_report: any
  estimated_value: number | null
  notes: string | null
  next_action: string | null
  next_action_date: string | null
  lost_reason: string | null
  converted_to_client_id: string | null
  converted_at: string | null
}

type TeamMember = { id: string; name: string }

const STATUS_CONFIG = {
  new:       { label: 'New',           color: '#6366f1', bg: '#6366f115' },
  contacted: { label: 'Contacted',     color: '#d97706', bg: '#d9770615' },
  proposal:  { label: 'Proposal Sent', color: '#0ea5e9', bg: '#0ea5e915' },
  won:       { label: 'Won ✓',         color: '#16a34a', bg: '#16a34a15' },
  lost:      { label: 'Lost',          color: '#dc2626', bg: '#dc262615' },
}

const SOURCE_CONFIG: Record<string, { label: string; icon: string }> = {
  assessment: { label: 'Assessment',  icon: '📊' },
  chatbot:    { label: 'Chatbot',     icon: '🤖' },
  cira:       { label: 'Cira Call',   icon: '📞' },
  lsa:        { label: 'LSA',         icon: '🔍' },
  facebook:   { label: 'Facebook',    icon: '📘' },
  referral:   { label: 'Referral',    icon: '🤝' },
  manual:     { label: 'Manual',      icon: '✏️' },
  other:      { label: 'Other',       icon: '📌' },
}

const GRADE_COLOR: Record<string, string> = {
  Good:       '#16a34a',
  'Needs Work': '#d97706',
  'At Risk':  '#dc2626',
  Critical:   '#7c3aed',
}

const STATUSES = ['new', 'contacted', 'proposal', 'won', 'lost'] as const

export default function LeadsClient({
  initialLeads,
  teamMembers,
}: {
  initialLeads: Lead[]
  teamMembers: TeamMember[]
}) {
  const router = useRouter()
  const [leads, setLeads] = useState<Lead[]>(initialLeads)
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [sourceFilter, setSourceFilter] = useState<string>('all')
  const [saving, setSaving] = useState(false)
  const [converting, setConverting] = useState(false)

  // New lead form state
  const [newLead, setNewLead] = useState({
    business_name: '',
    name: '',
    email: '',
    phone: '',
    website: '',
    industry: '',
    location: '',
    source: 'manual',
    estimated_value: '',
    notes: '',
    priority: 'medium',
  })

  const filteredLeads = leads.filter(l => {
    if (statusFilter !== 'all' && l.status !== statusFilter) return false
    if (sourceFilter !== 'all' && l.source !== sourceFilter) return false
    return true
  })

  const counts = STATUSES.reduce((acc, s) => {
    acc[s] = leads.filter(l => l.status === s).length
    return acc
  }, {} as Record<string, number>)

  async function updateLead(id: string, updates: Partial<Lead>) {
    setSaving(true)
    const res = await fetch(`/api/leads/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
    if (res.ok) {
      const updated = await res.json()
      setLeads(prev => prev.map(l => l.id === id ? { ...l, ...updated } : l))
      if (selectedLead?.id === id) setSelectedLead(prev => prev ? { ...prev, ...updated } : null)
    }
    setSaving(false)
  }

  async function addLead() {
    if (!newLead.business_name.trim()) return
    setSaving(true)
    const res = await fetch('/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newLead),
    })
    if (res.ok) {
      const created = await res.json()
      setLeads(prev => [created, ...prev])
      setShowAddModal(false)
      setNewLead({ business_name: '', name: '', email: '', phone: '', website: '', industry: '', location: '', source: 'manual', estimated_value: '', notes: '', priority: 'medium' })
    }
    setSaving(false)
  }

  async function convertToClient(lead: Lead) {
    setConverting(true)
    const res = await fetch(`/api/leads/${lead.id}/convert`, { method: 'POST' })
    if (res.ok) {
      const data = await res.json()
      setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, status: 'won', converted_to_client_id: data.client_id, converted_at: new Date().toISOString() } : l))
      setSelectedLead(null)
      router.push(`/dashboard/clients`)
    }
    setConverting(false)
  }

  async function deleteLead(id: string) {
    if (!confirm('Delete this lead?')) return
    await fetch(`/api/leads/${id}`, { method: 'DELETE' })
    setLeads(prev => prev.filter(l => l.id !== id))
    setSelectedLead(null)
  }

  const inputStyle = {
    width: '100%',
    padding: '8px 10px',
    borderRadius: 6,
    border: '1px solid var(--border)',
    background: 'var(--bg)',
    color: 'var(--text)',
    fontSize: 13,
  } as React.CSSProperties

  const selectStyle = { ...inputStyle }

  return (
    <div style={{ display: 'flex', height: '100%', minHeight: 0 }}>

      {/* ── Left panel: list ── */}
      <div style={{ width: selectedLead ? 420 : '100%', flexShrink: 0, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border)', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Leads</h1>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '2px 0 0' }}>{leads.length} total · {leads.filter(l => l.status === 'won').length} converted</p>
            </div>
            <button onClick={() => setShowAddModal(true)} style={{ padding: '8px 16px', background: 'var(--brand-accent)', color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              + Add Lead
            </button>
          </div>

          {/* Status pills */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            <button onClick={() => setStatusFilter('all')} style={{ padding: '4px 12px', borderRadius: 20, border: `1px solid ${statusFilter === 'all' ? 'var(--brand-accent)' : 'var(--border)'}`, background: statusFilter === 'all' ? 'var(--brand-accent-soft)' : 'transparent', color: statusFilter === 'all' ? 'var(--brand-accent)' : 'var(--text-muted)', fontSize: 12, cursor: 'pointer', fontWeight: 500 }}>
              All {leads.length}
            </button>
            {STATUSES.map(s => (
              <button key={s} onClick={() => setStatusFilter(statusFilter === s ? 'all' : s)} style={{ padding: '4px 12px', borderRadius: 20, border: `1px solid ${statusFilter === s ? STATUS_CONFIG[s].color : 'var(--border)'}`, background: statusFilter === s ? STATUS_CONFIG[s].bg : 'transparent', color: statusFilter === s ? STATUS_CONFIG[s].color : 'var(--text-muted)', fontSize: 12, cursor: 'pointer', fontWeight: 500 }}>
                {STATUS_CONFIG[s].label} {counts[s] > 0 ? counts[s] : ''}
              </button>
            ))}
          </div>

          {/* Source filter */}
          <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)} style={{ ...selectStyle, width: 'auto' }}>
            <option value="all">All sources</option>
            {Object.entries(SOURCE_CONFIG).map(([k, v]) => (
              <option key={k} value={k}>{v.icon} {v.label}</option>
            ))}
          </select>
        </div>

        {/* Lead list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
          {filteredLeads.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>🎯</div>
              <p>No leads yet. Add one or run the assessment tool.</p>
            </div>
          ) : (
            filteredLeads.map(lead => {
              const src = SOURCE_CONFIG[lead.source] || SOURCE_CONFIG.other
              const st = STATUS_CONFIG[lead.status]
              return (
                <div
                  key={lead.id}
                  onClick={() => setSelectedLead(selectedLead?.id === lead.id ? null : lead)}
                  style={{
                    padding: '12px 14px',
                    borderRadius: 10,
                    border: `1px solid ${selectedLead?.id === lead.id ? 'var(--brand-accent)' : 'var(--border)'}`,
                    background: selectedLead?.id === lead.id ? 'var(--brand-accent-soft)' : 'var(--bg-elevated)',
                    marginBottom: 8,
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {lead.business_name}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
                        {lead.name && `${lead.name} · `}{lead.email || lead.phone || 'No contact'}
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: st.bg, color: st.color, fontWeight: 600 }}>{st.label}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{src.icon} {src.label}</span>
                        {lead.assessment_score && (
                          <span style={{ fontSize: 11, color: GRADE_COLOR[lead.assessment_grade || ''] || 'var(--text-muted)', fontWeight: 600 }}>
                            {lead.assessment_score}/100
                          </span>
                        )}
                        {lead.estimated_value && (
                          <span style={{ fontSize: 11, color: '#16a34a', fontWeight: 600 }}>${Number(lead.estimated_value).toLocaleString()}/mo</span>
                        )}
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>
                      {new Date(lead.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* ── Right panel: lead detail ── */}
      {selectedLead && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
            {/* Lead header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
              <div>
                <h2 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px' }}>{selectedLead.business_name}</h2>
                {selectedLead.website && (
                  <a href={selectedLead.website.startsWith('http') ? selectedLead.website : `https://${selectedLead.website}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: 'var(--brand-accent)' }}>
                    {selectedLead.website}
                  </a>
                )}
              </div>
              <button onClick={() => setSelectedLead(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--text-muted)', padding: 4 }}>✕</button>
            </div>

            {/* Status + actions row */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
              <select
                value={selectedLead.status}
                onChange={e => updateLead(selectedLead.id, { status: e.target.value as any })}
                style={{ ...selectStyle, width: 'auto', fontWeight: 600, color: STATUS_CONFIG[selectedLead.status].color }}
              >
                {STATUSES.map(s => <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>)}
              </select>

              {!selectedLead.converted_to_client_id && selectedLead.status !== 'lost' && (
                <button
                  onClick={() => convertToClient(selectedLead)}
                  disabled={converting}
                  style={{ padding: '8px 16px', background: '#16a34a', color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                >
                  {converting ? 'Converting...' : '🏢 Convert to Client'}
                </button>
              )}

              {selectedLead.converted_to_client_id && (
                <span style={{ padding: '8px 14px', background: '#16a34a15', color: '#16a34a', borderRadius: 8, fontSize: 13, fontWeight: 600 }}>
                  ✓ Converted to Client
                </span>
              )}

              <button
                onClick={() => deleteLead(selectedLead.id)}
                style={{ padding: '8px 12px', background: 'none', color: 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, cursor: 'pointer', marginLeft: 'auto' }}
              >
                Delete
              </button>
            </div>

            {/* Assessment score banner */}
            {selectedLead.assessment_score && (
              <div style={{ padding: '14px 18px', borderRadius: 10, background: '#0F1C2E', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ width: 52, height: 52, borderRadius: '50%', border: `3px solid ${GRADE_COLOR[selectedLead.assessment_grade || ''] || '#aaa'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ fontSize: 18, fontWeight: 800, color: 'white' }}>{selectedLead.assessment_score}</span>
                </div>
                <div>
                  <div style={{ color: GRADE_COLOR[selectedLead.assessment_grade || ''] || '#aaa', fontWeight: 700, fontSize: 14 }}>{selectedLead.assessment_grade} — {selectedLead.assessment_score}/100</div>
                  <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>Marketing Assessment Score</div>
                </div>
              </div>
            )}

            {/* Contact info grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
              {[
                { label: 'Contact Name', key: 'name', type: 'text' },
                { label: 'Email', key: 'email', type: 'email' },
                { label: 'Phone', key: 'phone', type: 'tel' },
                { label: 'Industry', key: 'industry', type: 'text' },
                { label: 'Location', key: 'location', type: 'text' },
                { label: 'Est. Value ($/mo)', key: 'estimated_value', type: 'number' },
              ].map(field => (
                <div key={field.key}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{field.label}</div>
                  <input
                    type={field.type}
                    defaultValue={(selectedLead as any)[field.key] ?? ''}
                    onBlur={e => updateLead(selectedLead.id, { [field.key]: e.target.value || null } as any)}
                    style={inputStyle}
                  />
                </div>
              ))}
            </div>

            {/* Priority + Assigned */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Priority</div>
                <select
                  defaultValue={selectedLead.priority}
                  onBlur={e => updateLead(selectedLead.id, { priority: e.target.value as any })}
                  style={selectStyle}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Assigned To</div>
                <select
                  defaultValue={selectedLead.assigned_to ?? ''}
                  onBlur={e => updateLead(selectedLead.id, { assigned_to: e.target.value || null })}
                  style={selectStyle}
                >
                  <option value="">Unassigned</option>
                  {teamMembers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
            </div>

            {/* Next action */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Next Action</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8 }}>
                <input
                  type="text"
                  defaultValue={selectedLead.next_action ?? ''}
                  placeholder="e.g. Send proposal, Schedule demo call..."
                  onBlur={e => updateLead(selectedLead.id, { next_action: e.target.value || null })}
                  style={inputStyle}
                />
                <input
                  type="date"
                  defaultValue={selectedLead.next_action_date ?? ''}
                  onBlur={e => updateLead(selectedLead.id, { next_action_date: e.target.value || null })}
                  style={{ ...inputStyle, width: 140 }}
                />
              </div>
            </div>

            {/* Notes */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Notes</div>
              <textarea
                defaultValue={selectedLead.notes ?? ''}
                onBlur={e => updateLead(selectedLead.id, { notes: e.target.value || null })}
                rows={4}
                placeholder="Call notes, meeting summary, context..."
                style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
              />
            </div>

            {/* Lost reason (if lost) */}
            {selectedLead.status === 'lost' && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Lost Reason</div>
                <input
                  type="text"
                  defaultValue={selectedLead.lost_reason ?? ''}
                  placeholder="Why did this lead not convert?"
                  onBlur={e => updateLead(selectedLead.id, { lost_reason: e.target.value || null })}
                  style={inputStyle}
                />
              </div>
            )}

            {/* Assessment report accordion */}
            {selectedLead.assessment_report && (
              <details style={{ marginBottom: 20 }}>
                <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', padding: '10px 0', userSelect: 'none' }}>
                  📊 View Full Assessment Report
                </summary>
                <div style={{ marginTop: 12, padding: 16, background: 'var(--bg-elevated)', borderRadius: 10, fontSize: 12, lineHeight: 1.6 }}>
                  {(() => {
                    const r = selectedLead.assessment_report
                    const report = r?.report || r
                    const sections = report?.sections
                    if (!sections) return <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{JSON.stringify(report, null, 2)}</pre>
                    return (
                      <div>
                        {report.headline && <p style={{ fontWeight: 600, marginBottom: 12, fontSize: 13 }}>{report.headline}</p>}
                        {Object.entries(sections).map(([key, val]: [string, any]) => (
                          <div key={key} style={{ marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid var(--border)' }}>
                            <div style={{ fontWeight: 700, textTransform: 'capitalize', marginBottom: 4 }}>{key.replace(/([A-Z])/g, ' $1').trim()}</div>
                            {val.found && <p style={{ margin: '0 0 6px', color: 'var(--text-muted)' }}>{val.found}</p>}
                            {val.fix && <p style={{ margin: 0, color: 'var(--brand-accent)' }}>→ {val.fix}</p>}
                          </div>
                        ))}
                        {report.top3priorities && (
                          <div>
                            <div style={{ fontWeight: 700, marginBottom: 6 }}>Top 3 Priorities</div>
                            <ol style={{ margin: 0, paddingLeft: 20 }}>
                              {report.top3priorities.map((p: string, i: number) => <li key={i} style={{ marginBottom: 4 }}>{p}</li>)}
                            </ol>
                          </div>
                        )}
                      </div>
                    )
                  })()}
                </div>
              </details>
            )}

            {/* Source + meta */}
            <div style={{ fontSize: 11, color: 'var(--text-muted)', borderTop: '1px solid var(--border)', paddingTop: 12 }}>
              {SOURCE_CONFIG[selectedLead.source]?.icon} Source: {SOURCE_CONFIG[selectedLead.source]?.label} ·
              Added {new Date(selectedLead.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </div>
          </div>
        </div>
      )}

      {/* ── Add Lead Modal ── */}
      {showAddModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--bg)', borderRadius: 14, padding: 28, width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Add Lead</h2>
              <button onClick={() => setShowAddModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--text-muted)' }}>✕</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {[
                { label: 'Business Name *', key: 'business_name', type: 'text', full: true },
                { label: 'Contact Name', key: 'name', type: 'text' },
                { label: 'Email', key: 'email', type: 'email' },
                { label: 'Phone', key: 'phone', type: 'tel' },
                { label: 'Website', key: 'website', type: 'text' },
                { label: 'Industry', key: 'industry', type: 'text' },
                { label: 'Location', key: 'location', type: 'text' },
                { label: 'Est. Value ($/mo)', key: 'estimated_value', type: 'number' },
              ].map(f => (
                <div key={f.key} style={{ gridColumn: f.full ? '1 / -1' : undefined }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{f.label}</div>
                  <input
                    type={f.type}
                    value={(newLead as any)[f.key]}
                    onChange={e => setNewLead(prev => ({ ...prev, [f.key]: e.target.value }))}
                    style={inputStyle}
                  />
                </div>
              ))}
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Source</div>
                <select value={newLead.source} onChange={e => setNewLead(prev => ({ ...prev, source: e.target.value }))} style={selectStyle}>
                  {Object.entries(SOURCE_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Priority</div>
                <select value={newLead.priority} onChange={e => setNewLead(prev => ({ ...prev, priority: e.target.value }))} style={selectStyle}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Notes</div>
                <textarea
                  value={newLead.notes}
                  onChange={e => setNewLead(prev => ({ ...prev, notes: e.target.value }))}
                  rows={3}
                  style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
              <button onClick={() => setShowAddModal(false)} style={{ flex: 1, padding: '10px', background: 'none', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', color: 'var(--text)' }}>Cancel</button>
              <button onClick={addLead} disabled={!newLead.business_name.trim() || saving} style={{ flex: 1, padding: '10px', background: 'var(--brand-accent)', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
                {saving ? 'Saving...' : 'Add Lead'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
