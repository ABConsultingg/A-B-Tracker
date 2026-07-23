'use client'
import { useState } from 'react'
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

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  new:       { label: 'New',           color: '#6366f1', bg: '#6366f115', dot: '#6366f1' },
  contacted: { label: 'Contacted',     color: '#d97706', bg: '#d9770615', dot: '#d97706' },
  proposal:  { label: 'Proposal Sent', color: '#0ea5e9', bg: '#0ea5e915', dot: '#0ea5e9' },
  won:       { label: 'Won',           color: '#16a34a', bg: '#16a34a15', dot: '#16a34a' },
  lost:      { label: 'Lost',          color: '#dc2626', bg: '#dc262615', dot: '#dc2626' },
}

const SOURCE_CONFIG: Record<string, { label: string; icon: string }> = {
  assessment: { label: 'Assessment', icon: '📊' },
  chatbot:    { label: 'Chatbot',    icon: '🤖' },
  cira:       { label: 'Cira Call',  icon: '📞' },
  lsa:        { label: 'LSA',        icon: '🔍' },
  facebook:   { label: 'Facebook',   icon: '📘' },
  referral:   { label: 'Referral',   icon: '🤝' },
  manual:     { label: 'Manual',     icon: '✏️' },
  other:      { label: 'Other',      icon: '📌' },
}

const GRADE_COLOR: Record<string, string> = {
  Good: '#16a34a', 'Needs Work': '#d97706', 'At Risk': '#dc2626', Critical: '#7c3aed',
}

const PRIORITY_COLOR: Record<string, string> = {
  high: '#dc2626', medium: '#d97706', low: '#6b7280',
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
  const [viewMode, setViewMode] = useState<'board' | 'list'>('board')
  const [saving, setSaving] = useState(false)
  const [converting, setConverting] = useState(false)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverStatus, setDragOverStatus] = useState<string | null>(null)

  const [newLead, setNewLead] = useState({
    business_name: '', name: '', email: '', phone: '',
    website: '', industry: '', location: '',
    source: 'manual', estimated_value: '', notes: '', priority: 'medium',
  })

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
      router.push('/dashboard/clients')
    }
    setConverting(false)
  }

  async function deleteLead(id: string) {
    if (!confirm('Delete this lead?')) return
    await fetch(`/api/leads/${id}`, { method: 'DELETE' })
    setLeads(prev => prev.filter(l => l.id !== id))
    setSelectedLead(null)
  }

  // Drag and drop handlers
  function handleDragStart(e: React.DragEvent, id: string) {
    setDraggingId(id)
    e.dataTransfer.effectAllowed = 'move'
  }

  function handleDragOver(e: React.DragEvent, status: string) {
    e.preventDefault()
    setDragOverStatus(status)
  }

  function handleDrop(e: React.DragEvent, status: string) {
    e.preventDefault()
    if (draggingId && draggingId !== status) {
      updateLead(draggingId, { status: status as any })
    }
    setDraggingId(null)
    setDragOverStatus(null)
  }

  function handleDragEnd() {
    setDraggingId(null)
    setDragOverStatus(null)
  }

  const inputStyle = {
    width: '100%', padding: '8px 10px', borderRadius: 6,
    border: '1px solid var(--border)', background: 'var(--bg)',
    color: 'var(--text)', fontSize: 13, boxSizing: 'border-box' as const,
  }

  const LeadCard = ({ lead, compact = false }: { lead: Lead; compact?: boolean }) => {
    const src = SOURCE_CONFIG[lead.source] || SOURCE_CONFIG.other
    const st = STATUS_CONFIG[lead.status]
    const isSelected = selectedLead?.id === lead.id
    return (
      <div
        draggable
        onDragStart={e => handleDragStart(e, lead.id)}
        onDragEnd={handleDragEnd}
        onClick={() => setSelectedLead(isSelected ? null : lead)}
        style={{
          padding: '12px 14px',
          borderRadius: 10,
          border: `1px solid ${isSelected ? 'var(--brand-accent)' : 'var(--border)'}`,
          background: isSelected ? 'var(--brand-accent-soft)' : 'var(--bg-elevated)',
          marginBottom: compact ? 0 : 8,
          cursor: 'pointer',
          opacity: draggingId === lead.id ? 0.4 : 1,
          transition: 'all 0.15s',
          userSelect: 'none',
        }}
      >
        {/* Priority stripe */}
        {lead.priority === 'high' && (
          <div style={{ width: 3, height: '100%', background: '#dc2626', position: 'absolute', left: 0, top: 0, borderRadius: '10px 0 0 10px' }} />
        )}
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {lead.business_name}
        </div>
        {lead.name && (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>{lead.name}</div>
        )}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{src.icon} {src.label}</span>
          {lead.assessment_score && (
            <span style={{ fontSize: 11, color: GRADE_COLOR[lead.assessment_grade || ''] || 'var(--text-muted)', fontWeight: 600 }}>
              {lead.assessment_score}/100
            </span>
          )}
          {lead.estimated_value && (
            <span style={{ fontSize: 11, color: '#16a34a', fontWeight: 600 }}>${Number(lead.estimated_value).toLocaleString()}/mo</span>
          )}
          {lead.priority === 'high' && (
            <span style={{ fontSize: 10, color: '#dc2626', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>HIGH</span>
          )}
        </div>
        {lead.next_action && (
          <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)', borderTop: '1px solid var(--border)', paddingTop: 6 }}>
            → {lead.next_action}
            {lead.next_action_date && <span style={{ marginLeft: 6, color: new Date(lead.next_action_date) < new Date() ? '#dc2626' : 'var(--text-muted)' }}>{lead.next_action_date}</span>}
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', height: '100%', minHeight: 0, flexDirection: 'column', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Leads</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '2px 0 0' }}>
            {leads.length} total · {leads.filter(l => l.status === 'won').length} converted · ${leads.filter(l => l.status !== 'lost').reduce((s, l) => s + (Number(l.estimated_value) || 0), 0).toLocaleString()}/mo pipeline
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* View toggle */}
          <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            {(['board', 'list'] as const).map(v => (
              <button key={v} onClick={() => setViewMode(v)} style={{
                padding: '6px 12px', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 500,
                background: viewMode === v ? 'var(--brand-accent)' : 'transparent',
                color: viewMode === v ? 'white' : 'var(--text-muted)',
              }}>
                {v === 'board' ? '⬜ Board' : '☰ List'}
              </button>
            ))}
          </div>
          <button onClick={() => setShowAddModal(true)} style={{ padding: '8px 16px', background: 'var(--brand-accent)', color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            + Add Lead
          </button>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>

        {/* ── BOARD VIEW ── */}
        {viewMode === 'board' && !selectedLead && (
          <div style={{ flex: 1, display: 'flex', gap: 0, overflow: 'hidden' }}>
            {STATUSES.map(status => {
              const st = STATUS_CONFIG[status]
              const colLeads = leads.filter(l => l.status === status)
              const isOver = dragOverStatus === status
              return (
                <div
                  key={status}
                  onDragOver={e => handleDragOver(e, status)}
                  onDrop={e => handleDrop(e, status)}
                  style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    borderRight: '1px solid var(--border)',
                    background: isOver ? 'var(--brand-accent-soft)' : 'transparent',
                    transition: 'background 0.15s',
                    overflow: 'hidden',
                  }}
                >
                  {/* Column header */}
                  <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: st.dot }} />
                      <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)' }}>{st.label}</span>
                      <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', background: 'var(--bg-elevated)', padding: '1px 7px', borderRadius: 10 }}>{colLeads.length}</span>
                    </div>
                    {colLeads.length > 0 && (
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                        ${colLeads.reduce((s, l) => s + (Number(l.estimated_value) || 0), 0).toLocaleString()}/mo
                      </div>
                    )}
                  </div>
                  {/* Cards */}
                  <div style={{ flex: 1, overflowY: 'auto', padding: '10px 10px' }}>
                    {colLeads.map(lead => <LeadCard key={lead.id} lead={lead} compact />)}
                    {colLeads.length === 0 && (
                      <div style={{ textAlign: 'center', padding: '32px 12px', color: 'var(--text-muted)', fontSize: 12 }}>
                        {isOver ? '📥 Drop here' : 'No leads'}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ── BOARD VIEW with detail panel ── */}
        {viewMode === 'board' && selectedLead && (
          <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
            {/* Compressed board */}
            <div style={{ width: 280, flexShrink: 0, borderRight: '1px solid var(--border)', overflowY: 'auto', padding: 10 }}>
              {STATUSES.map(status => {
                const st = STATUS_CONFIG[status]
                const colLeads = leads.filter(l => l.status === status)
                return (
                  <div key={status} style={{ marginBottom: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, padding: '0 4px' }}>
                      <div style={{ width: 7, height: 7, borderRadius: '50%', background: st.dot }} />
                      <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)' }}>{st.label}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>{colLeads.length}</span>
                    </div>
                    {colLeads.map(lead => <LeadCard key={lead.id} lead={lead} compact />)}
                  </div>
                )
              })}
            </div>
            {/* Detail */}
            <DetailPanel
              lead={selectedLead}
              teamMembers={teamMembers}
              onUpdate={updateLead}
              onClose={() => setSelectedLead(null)}
              onDelete={deleteLead}
              onConvert={convertToClient}
              saving={saving}
              converting={converting}
              inputStyle={inputStyle}
            />
          </div>
        )}

        {/* ── LIST VIEW ── */}
        {viewMode === 'list' && (
          <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
            <div style={{ width: selectedLead ? 420 : '100%', flexShrink: 0, overflowY: 'auto', borderRight: selectedLead ? '1px solid var(--border)' : 'none' }}>
              <div style={{ padding: '12px 16px' }}>
                {leads.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>
                    <div style={{ fontSize: 32, marginBottom: 8 }}>🎯</div>
                    <p>No leads yet. Add one or run the assessment tool.</p>
                  </div>
                ) : leads.map(lead => <LeadCard key={lead.id} lead={lead} />)}
              </div>
            </div>
            {selectedLead && (
              <DetailPanel
                lead={selectedLead}
                teamMembers={teamMembers}
                onUpdate={updateLead}
                onClose={() => setSelectedLead(null)}
                onDelete={deleteLead}
                onConvert={convertToClient}
                saving={saving}
                converting={converting}
                inputStyle={inputStyle}
              />
            )}
          </div>
        )}
      </div>

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
                <div key={f.key} style={{ gridColumn: (f as any).full ? '1 / -1' : undefined }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{f.label}</div>
                  <input type={f.type} value={(newLead as any)[f.key]} onChange={e => setNewLead(prev => ({ ...prev, [f.key]: e.target.value }))} style={inputStyle} />
                </div>
              ))}
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Source</div>
                <select value={newLead.source} onChange={e => setNewLead(prev => ({ ...prev, source: e.target.value }))} style={inputStyle}>
                  {Object.entries(SOURCE_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Priority</div>
                <select value={newLead.priority} onChange={e => setNewLead(prev => ({ ...prev, priority: e.target.value }))} style={inputStyle}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Notes</div>
                <textarea value={newLead.notes} onChange={e => setNewLead(prev => ({ ...prev, notes: e.target.value }))} rows={3} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
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

// ── Detail Panel ──────────────────────────────────────────────────────────────
function DetailPanel({ lead, teamMembers, onUpdate, onClose, onDelete, onConvert, saving, converting, inputStyle }: {
  lead: Lead
  teamMembers: TeamMember[]
  onUpdate: (id: string, updates: Partial<Lead>) => void
  onClose: () => void
  onDelete: (id: string) => void
  onConvert: (lead: Lead) => void
  saving: boolean
  converting: boolean
  inputStyle: React.CSSProperties
}) {
  const STATUSES = ['new', 'contacted', 'proposal', 'won', 'lost'] as const
  const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
    new: { label: 'New', color: '#6366f1' }, contacted: { label: 'Contacted', color: '#d97706' },
    proposal: { label: 'Proposal Sent', color: '#0ea5e9' }, won: { label: 'Won', color: '#16a34a' }, lost: { label: 'Lost', color: '#dc2626' },
  }
  const GRADE_COLOR: Record<string, string> = { Good: '#16a34a', 'Needs Work': '#d97706', 'At Risk': '#dc2626', Critical: '#7c3aed' }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px' }}>{lead.business_name}</h2>
            {lead.website && (
              <a href={lead.website.startsWith('http') ? lead.website : `https://${lead.website}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: 'var(--brand-accent)' }}>{lead.website}</a>
            )}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--text-muted)', padding: 4 }}>✕</button>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          <select value={lead.status} onChange={e => onUpdate(lead.id, { status: e.target.value as any })} style={{ ...inputStyle, width: 'auto', fontWeight: 600, color: STATUS_CONFIG[lead.status].color }}>
            {STATUSES.map(s => <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>)}
          </select>
          {!lead.converted_to_client_id && lead.status !== 'lost' && (
            <button onClick={() => onConvert(lead)} disabled={converting} style={{ padding: '8px 16px', background: '#16a34a', color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              {converting ? 'Converting...' : '🏢 Convert to Client'}
            </button>
          )}
          {lead.converted_to_client_id && (
            <span style={{ padding: '8px 14px', background: '#16a34a15', color: '#16a34a', borderRadius: 8, fontSize: 13, fontWeight: 600 }}>✓ Converted</span>
          )}
          <button onClick={() => onDelete(lead.id)} style={{ padding: '8px 12px', background: 'none', color: 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, cursor: 'pointer', marginLeft: 'auto' }}>Delete</button>
        </div>

        {lead.assessment_score && (
          <div style={{ padding: '14px 18px', borderRadius: 10, background: '#0F1C2E', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 52, height: 52, borderRadius: '50%', border: `3px solid ${GRADE_COLOR[lead.assessment_grade || ''] || '#aaa'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ fontSize: 18, fontWeight: 800, color: 'white' }}>{lead.assessment_score}</span>
            </div>
            <div>
              <div style={{ color: GRADE_COLOR[lead.assessment_grade || ''] || '#aaa', fontWeight: 700, fontSize: 14 }}>{lead.assessment_grade} — {lead.assessment_score}/100</div>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>Marketing Assessment Score</div>
            </div>
          </div>
        )}

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
              <input type={field.type} defaultValue={(lead as any)[field.key] ?? ''} onBlur={e => onUpdate(lead.id, { [field.key]: e.target.value || null } as any)} style={inputStyle} />
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Priority</div>
            <select defaultValue={lead.priority} onBlur={e => onUpdate(lead.id, { priority: e.target.value as any })} style={inputStyle}>
              <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
            </select>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Assigned To</div>
            <select defaultValue={lead.assigned_to ?? ''} onBlur={e => onUpdate(lead.id, { assigned_to: e.target.value || null })} style={inputStyle}>
              <option value="">Unassigned</option>
              {teamMembers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Next Action</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8 }}>
            <input type="text" defaultValue={lead.next_action ?? ''} placeholder="e.g. Send proposal, Schedule call..." onBlur={e => onUpdate(lead.id, { next_action: e.target.value || null })} style={inputStyle} />
            <input type="date" defaultValue={lead.next_action_date ?? ''} onBlur={e => onUpdate(lead.id, { next_action_date: e.target.value || null })} style={{ ...inputStyle, width: 140 }} />
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Notes</div>
          <textarea defaultValue={lead.notes ?? ''} onBlur={e => onUpdate(lead.id, { notes: e.target.value || null })} rows={4} placeholder="Call notes, meeting summary, context..." style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
        </div>

        {lead.status === 'lost' && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Lost Reason</div>
            <input type="text" defaultValue={lead.lost_reason ?? ''} placeholder="Why did this lead not convert?" onBlur={e => onUpdate(lead.id, { lost_reason: e.target.value || null })} style={inputStyle} />
          </div>
        )}

        {lead.assessment_report && (
          <details style={{ marginBottom: 20 }}>
            <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', padding: '10px 0', userSelect: 'none' }}>📊 View Full Assessment Report</summary>
            <div style={{ marginTop: 12 }}>
              {(() => {
                const r = lead.assessment_report
                const report = r?.report || r
                const scores = r?.scores
                const sections = report?.sections
                const SECTION_META: Record<string, { label: string; icon: string }> = {
                  website: { label: 'Website & Technology', icon: '🌐' },
                  seo: { label: 'SEO', icon: '🔍' },
                  social: { label: 'Social Media', icon: '📱' },
                  ads: { label: 'Paid Ads', icon: '📢' },
                  reputation: { label: 'Online Reputation', icon: '⭐' },
                  leadFollowup: { label: 'Lead Follow-Up', icon: '📋' },
                  aiReadiness: { label: 'AI Readiness', icon: '🤖' },
                }
                const scoreColor = (s: number) => s >= 75 ? '#16a34a' : s >= 50 ? '#d97706' : s >= 25 ? '#dc2626' : '#7c3aed'
                const scoreGrade = (s: number) => s >= 75 ? 'Good' : s >= 50 ? 'Needs Work' : s >= 25 ? 'At Risk' : 'Critical'
                if (!sections) return <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 11 }}>{JSON.stringify(report, null, 2)}</pre>
                return (
                  <div>
                    {report.headline && (
                      <div style={{ padding: '12px 16px', background: '#0F1C2E', borderRadius: 10, marginBottom: 12 }}>
                        <p style={{ fontWeight: 600, margin: 0, fontSize: 13, color: 'white', lineHeight: 1.5 }}>{report.headline}</p>
                      </div>
                    )}
                    {/* Score bar */}
                    {scores && (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 6, marginBottom: 12, padding: '12px 14px', background: '#080f1a', borderRadius: 10 }}>
                        {Object.entries(SECTION_META).map(([key, meta]) => {
                          const s = (scores as any)[key]
                          if (!s) return null
                          return (
                            <div key={key} style={{ textAlign: 'center' }}>
                              <div style={{ fontSize: 15, fontWeight: 800, color: scoreColor(s) }}>{s}</div>
                              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', marginTop: 2, lineHeight: 1.2 }}>{meta.label.split(' ')[0]}</div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                    {/* Section cards */}
                    {Object.entries(sections).map(([key, val]: [string, any]) => {
                      const meta = SECTION_META[key] || { label: key, icon: '📌' }
                      const sectionScore = scores ? (scores as any)[key] : null
                      const color = sectionScore ? scoreColor(sectionScore) : 'var(--text-muted)'
                      return (
                        <div key={key} style={{ marginBottom: 10, borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)' }}>
                          <div style={{ background: '#0F1C2E', padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontSize: 16 }}>{meta.icon}</span>
                              <span style={{ color: 'white', fontWeight: 600, fontSize: 13 }}>{meta.label}</span>
                            </div>
                            {sectionScore && (
                              <span style={{ fontSize: 12, fontWeight: 700, color, background: `${color}20`, border: `1px solid ${color}`, borderRadius: 12, padding: '2px 10px' }}>
                                {sectionScore}/100 — {scoreGrade(sectionScore)}
                              </span>
                            )}
                          </div>
                          <div style={{ padding: '12px 14px', background: 'white' }}>
                            {val.found && (
                              <div style={{ marginBottom: 8 }}>
                                <div style={{ fontSize: 10, fontWeight: 700, color: '#999', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>WHAT WE FOUND</div>
                                <p style={{ margin: 0, fontSize: 12, color: '#333', lineHeight: 1.6 }}>{val.found}</p>
                              </div>
                            )}
                            {val.fix && (
                              <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 8 }}>
                                <div style={{ fontSize: 10, fontWeight: 700, color: '#E8541A', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>WHAT TO FIX</div>
                                <p style={{ margin: 0, fontSize: 12, color: '#333', lineHeight: 1.6 }}>{val.fix}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                    {/* Top 3 priorities */}
                    {report.top3priorities && (
                      <div style={{ background: 'white', borderRadius: 10, padding: '14px 16px', border: '1px solid var(--border)' }}>
                        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10, color: '#0F1C2E' }}>🎯 Top 3 Priorities</div>
                        {report.top3priorities.map((p: string, i: number) => (
                          <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 8, alignItems: 'flex-start' }}>
                            <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#E8541A', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{i + 1}</div>
                            <p style={{ margin: 0, fontSize: 12, color: '#333', lineHeight: 1.6, paddingTop: 2 }}>{p}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })()}
            </div>
          </details>
        )}

        <div style={{ fontSize: 11, color: 'var(--text-muted)', borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          {(SOURCE_CONFIG as any)[lead.source]?.icon} Source: {(SOURCE_CONFIG as any)[lead.source]?.label} · Added {new Date(lead.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        </div>
      </div>
    </div>
  )
}
