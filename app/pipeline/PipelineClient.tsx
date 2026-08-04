'use client'
import { useState, useEffect, useMemo } from 'react'

// Slugs must match the leads_status_check constraint on public.leads.
const STAGES = [
  { id: 'new',           label: 'New',           color: '#6366f1' },
  { id: 'contacted',     label: 'Contacted',     color: '#d97706' },
  { id: 'discovery',     label: 'Discovery',     color: '#8b5cf6' },
  { id: 'proposal',      label: 'Proposal',      color: '#0ea5e9' },
  { id: 'contract-sent', label: 'Contract Sent', color: '#14b8a6' },
  { id: 'won',           label: 'Won',           color: '#16a34a' },
  { id: 'lost',          label: 'Lost',          color: '#dc2626' },
] as const

type Stage = typeof STAGES[number]['id']

// Everything still in play — drives pipeline value, active count, and overdue.
const OPEN_STAGES: Stage[] = ['new', 'contacted', 'discovery', 'proposal', 'contract-sent']

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
  status: Stage
  priority: 'low' | 'medium' | 'high' | null
  assigned_to: string | null
  source: string
  estimated_value: number | string | null
  notes: string | null
  next_action: string | null
  next_action_date: string | null
  lost_reason: string | null
  converted_to_client_id: string | null
}

const SOURCE_CONFIG: Record<string, { label: string; icon: string }> = {
  manual:           { label: 'Manual',        icon: '✏️' },
  assessment:       { label: 'Assessment',    icon: '📊' },
  chatbot:          { label: 'Chatbot',       icon: '🤖' },
  cira:             { label: 'Cira Call',     icon: '📞' },
  lsa:              { label: 'LSA',           icon: '🔍' },
  facebook:         { label: 'Facebook',      icon: '📘' },
  referral:         { label: 'Referral',      icon: '🤝' },
  'rbs-referral':   { label: 'RBS Referral',  icon: '🤝' },
  'client-referral':{ label: 'Client Ref.',   icon: '🤝' },
  'existing-client':{ label: 'Existing',      icon: '⭐' },
  linkedin:         { label: 'LinkedIn',      icon: '💼' },
  event:            { label: 'Event',         icon: '🎪' },
  'cold-outreach':  { label: 'Cold Outreach', icon: '❄️' },
  inbound:          { label: 'Inbound',       icon: '📥' },
  other:            { label: 'Other',         icon: '📌' },
}

const stageById = new Map<string, { id: Stage; label: string; color: string }>(
  STAGES.map(s => [s.id, s])
)

const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`
const val = (l: Lead) => Number(l.estimated_value) || 0

function fmtDate(iso: string | null) {
  if (!iso) return null
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// YYYY-MM-DD -> UTC epoch ms at midnight. Month is 1-based in the string and
// 0-based in Date.UTC, so it must be shifted; the offset does not cancel out
// across months of differing length.
function utcDay(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

// Whole days from `today` to `iso`; negative means overdue. Both are plain
// calendar dates, so this stays timezone-free.
function daysUntil(iso: string, today: string) {
  return Math.round((utcDay(iso) - utcDay(today)) / 86400000)
}

export default function PipelineClient({
  initialLeads,
  today,
}: {
  initialLeads: Lead[]
  today: string
}) {
  const [leads, setLeads] = useState<Lead[]>(initialLeads)
  const [view, setView] = useState<'board' | 'list'>('board')
  const [selected, setSelected] = useState<Lead | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isOpen = (l: Lead) => OPEN_STAGES.includes(l.status)
  const isOverdue = (l: Lead) =>
    !!l.next_action_date && isOpen(l) && daysUntil(l.next_action_date, today) < 0

  const kpis = useMemo(() => {
    const open = leads.filter(isOpen)
    return {
      pipelineValue: open.reduce((s, l) => s + val(l), 0),
      wonValue: leads.filter(l => l.status === 'won').reduce((s, l) => s + val(l), 0),
      activeDeals: open.length,
      overdue: leads.filter(isOverdue).length,
      noAction: open.filter(l => !l.next_action_date).length,
      wonCount: leads.filter(l => l.status === 'won').length,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leads, today])

  async function patch(id: string, updates: Partial<Lead>) {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/leads/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `Save failed (${res.status})`)
      }
      const updated = await res.json()
      setLeads(prev => prev.map(l => (l.id === id ? { ...l, ...updated } : l)))
      setSelected(prev => (prev && prev.id === id ? { ...prev, ...updated } : prev))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', color: 'var(--text)' }}>

      {/* Header */}
      <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Sales Pipeline</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '2px 0 0' }}>
            {leads.length} lead{leads.length === 1 ? '' : 's'} · {kpis.activeDeals} active · {kpis.wonCount} won
          </p>
        </div>
        <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          {(['board', 'list'] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                padding: '6px 12px', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 500,
                background: view === v ? 'var(--brand-accent, #6366f1)' : 'transparent',
                color: view === v ? 'white' : 'var(--text-muted)',
              }}
            >
              {v === 'board' ? '⬜ Board' : '☰ List'}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div style={{ padding: '8px 24px', background: '#dc262615', color: '#dc2626', fontSize: 12, flexShrink: 0 }}>
          {error}
        </div>
      )}

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, padding: '16px 24px', flexShrink: 0 }}>
        <Kpi label="Pipeline Value" value={`${money(kpis.pipelineValue)}/mo`} subtitle={`${kpis.activeDeals} open deal${kpis.activeDeals === 1 ? '' : 's'}`} />
        <Kpi label="Won Value" value={`${money(kpis.wonValue)}/mo`} subtitle={`${kpis.wonCount} closed won`} accent="#16a34a" />
        <Kpi label="Active Deals" value={String(kpis.activeDeals)} subtitle={kpis.noAction > 0 ? `${kpis.noAction} with no next action` : 'all have next actions'} />
        <Kpi
          label="Overdue Actions"
          value={String(kpis.overdue)}
          subtitle={kpis.overdue > 0 ? 'needs follow-up today' : 'nothing overdue'}
          accent={kpis.overdue > 0 ? '#dc2626' : undefined}
        />
      </div>

      {/* Board */}
      {view === 'board' && (
        <div style={{ flex: 1, display: 'flex', minHeight: 0, borderTop: '1px solid var(--border)' }}>
          {STAGES.map(stage => {
            const colLeads = leads.filter(l => l.status === stage.id)
            const colValue = colLeads.reduce((s, l) => s + val(l), 0)
            return (
              <div key={stage.id} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border)', overflow: 'hidden' }}>
                <div style={{ padding: '12px 14px 10px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: stage.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {stage.label}
                    </span>
                    <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', background: 'var(--bg-elevated)', padding: '1px 7px', borderRadius: 10 }}>
                      {colLeads.length}
                    </span>
                  </div>
                  {colValue > 0 && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{money(colValue)}/mo</div>
                  )}
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
                  {colLeads.map(lead => (
                    <Card key={lead.id} lead={lead} today={today} overdue={isOverdue(lead)} onClick={() => setSelected(lead)} />
                  ))}
                  {colLeads.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '28px 8px', color: 'var(--text-muted)', fontSize: 11 }}>No leads</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* List */}
      {view === 'list' && (
        <div style={{ flex: 1, overflowY: 'auto', borderTop: '1px solid var(--border)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--bg-sunken)', position: 'sticky', top: 0 }}>
                {['Business', 'Contact', 'Stage', 'Value', 'Next Action', 'Due', 'Source', 'Assigned'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '8px 12px', fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {leads.map(lead => {
                const stage = stageById.get(lead.status)
                const overdue = isOverdue(lead)
                const src = SOURCE_CONFIG[lead.source] ?? { label: lead.source, icon: '📌' }
                return (
                  <tr
                    key={lead.id}
                    onClick={() => setSelected(lead)}
                    style={{ borderTop: '1px solid var(--border)', cursor: 'pointer' }}
                  >
                    <td style={{ padding: '8px 12px', fontWeight: 600 }}>{lead.business_name}</td>
                    <td style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>{lead.name || '—'}</td>
                    <td style={{ padding: '8px 12px' }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: stage?.color ?? 'var(--text-muted)', background: `${stage?.color ?? '#888'}15`, padding: '2px 8px', borderRadius: 10 }}>
                        {stage?.label ?? lead.status}
                      </span>
                    </td>
                    <td style={{ padding: '8px 12px', fontFamily: 'monospace' }}>{val(lead) ? `${money(val(lead))}/mo` : '—'}</td>
                    <td style={{ padding: '8px 12px', color: lead.next_action ? undefined : 'var(--text-muted)' }}>{lead.next_action || '—'}</td>
                    <td style={{ padding: '8px 12px', color: overdue ? '#dc2626' : 'var(--text-muted)', fontWeight: overdue ? 600 : 400 }}>
                      {lead.next_action_date ? `${overdue ? '⚠ ' : ''}${fmtDate(lead.next_action_date)}` : '—'}
                    </td>
                    <td style={{ padding: '8px 12px', fontSize: 11, color: 'var(--text-muted)' }}>{src.icon} {src.label}</td>
                    <td style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text-muted)' }}>{lead.assigned_to || 'Unassigned'}</td>
                  </tr>
                )
              })}
              {leads.length === 0 && (
                <tr><td colSpan={8} style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>No leads yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <DetailModal
          lead={selected}
          today={today}
          saving={saving}
          onPatch={patch}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}

function Kpi({ label, value, subtitle, accent }: { label: string; value: string; subtitle?: string; accent?: string }) {
  return (
    <div style={{ border: `1px solid ${accent ? `${accent}40` : 'var(--border)'}`, borderRadius: 12, padding: '12px 14px', background: 'var(--bg-elevated)' }}>
      <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4, color: accent ?? 'var(--text)' }}>{value}</div>
      {subtitle && <div style={{ fontSize: 11, color: accent ?? 'var(--text-muted)', marginTop: 2 }}>{subtitle}</div>}
    </div>
  )
}

function Card({ lead, today, overdue, onClick }: { lead: Lead; today: string; overdue: boolean; onClick: () => void }) {
  const src = SOURCE_CONFIG[lead.source] ?? { label: lead.source, icon: '📌' }
  const days = lead.next_action_date ? daysUntil(lead.next_action_date, today) : null
  const dueToday = days === 0

  return (
    <div
      onClick={onClick}
      style={{
        border: `1px solid ${overdue ? '#dc262650' : 'var(--border)'}`,
        borderLeft: overdue ? '3px solid #dc2626' : '1px solid var(--border)',
        borderRadius: 8,
        padding: '9px 10px',
        marginBottom: 8,
        background: 'var(--bg-elevated)',
        cursor: 'pointer',
        fontSize: 12,
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {lead.business_name}
      </div>

      {lead.name && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {lead.name}
        </div>
      )}

      {val(lead) > 0 && (
        <div style={{ fontSize: 12, fontWeight: 600, fontFamily: 'monospace', marginTop: 4 }}>
          {money(val(lead))}/mo
        </div>
      )}

      {lead.next_action && (
        <div style={{ marginTop: 6, fontSize: 11, color: overdue ? '#dc2626' : 'var(--text-muted)', fontWeight: overdue ? 600 : 400 }}>
          {overdue ? '⚠ ' : dueToday ? '● ' : ''}{lead.next_action}
          {lead.next_action_date && (
            <span style={{ opacity: 0.8 }}>
              {' · '}
              {overdue ? `${Math.abs(days as number)}d overdue` : dueToday ? 'today' : fmtDate(lead.next_action_date)}
            </span>
          )}
        </div>
      )}

      {!lead.next_action && (
        <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>No next action</div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 7, fontSize: 10, color: 'var(--text-muted)' }}>
        <span title={`Source: ${src.label}`}>{src.icon} {src.label}</span>
        <span style={{ marginLeft: 'auto', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '55%' }}>
          {lead.assigned_to || 'Unassigned'}
        </span>
      </div>
    </div>
  )
}

function DetailModal({
  lead, today, saving, onPatch, onClose,
}: {
  lead: Lead
  today: string
  saving: boolean
  onPatch: (id: string, updates: Partial<Lead>) => Promise<void>
  onClose: () => void
}) {
  const [nextAction, setNextAction] = useState(lead.next_action ?? '')
  const [dueDate, setDueDate] = useState(lead.next_action_date ?? '')
  const [notes, setNotes] = useState(lead.notes ?? '')

  // Re-seed the draft when a different lead is opened, or when a save returns
  // server-normalized values.
  useEffect(() => {
    setNextAction(lead.next_action ?? '')
    setDueDate(lead.next_action_date ?? '')
    setNotes(lead.notes ?? '')
  }, [lead.id, lead.next_action, lead.next_action_date, lead.notes])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const dirty =
    nextAction !== (lead.next_action ?? '') ||
    dueDate !== (lead.next_action_date ?? '') ||
    notes !== (lead.notes ?? '')

  const stage = stageById.get(lead.status)
  const overdue = !!lead.next_action_date && OPEN_STAGES.includes(lead.status) && daysUntil(lead.next_action_date, today) < 0

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '7px 10px', border: '1px solid var(--border)',
    borderRadius: 6, fontSize: 13, fontFamily: 'inherit',
    background: 'var(--bg-sunken)', color: 'var(--text)',
  }
  const labelStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
    letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 4, display: 'block',
  }

  function save() {
    onPatch(lead.id, {
      next_action: nextAction.trim() || null,
      next_action_date: dueDate || null,
      notes: notes.trim() || null,
    })
  }

  const src = SOURCE_CONFIG[lead.source] ?? { label: lead.source, icon: '📌' }
  const assignedName = lead.assigned_to || 'Unassigned'

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 50,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 14,
          width: '100%', maxWidth: 520, maxHeight: '88vh', overflowY: 'auto',
          padding: 20, color: 'var(--text)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>{lead.business_name}</h2>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
              <span style={{ color: stage?.color, fontWeight: 600 }}>{stage?.label ?? lead.status}</span>
              {' · '}{src.icon} {src.label}
              {val(lead) > 0 && ` · ${money(val(lead))}/mo`}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text-muted)', lineHeight: 1 }}>×</button>
        </div>

        {/* Contact */}
        {(lead.name || lead.email || lead.phone) && (
          <div style={{ marginTop: 12, padding: '9px 11px', background: 'var(--bg-sunken)', borderRadius: 8, fontSize: 12 }}>
            {lead.name && <div style={{ fontWeight: 600 }}>{lead.name}</div>}
            {lead.email && <div><a href={`mailto:${lead.email}`} style={{ color: 'var(--brand-accent, #6366f1)' }}>{lead.email}</a></div>}
            {lead.phone && <div style={{ color: 'var(--text-muted)' }}>{lead.phone}</div>}
          </div>
        )}

        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 10 }}>
          Assigned to <strong style={{ color: 'var(--text)' }}>{assignedName}</strong>
        </div>

        {/* Editable fields */}
        <div style={{ marginTop: 16 }}>
          <label style={labelStyle}>Next Action</label>
          <input
            type="text"
            value={nextAction}
            onChange={e => setNextAction(e.target.value)}
            placeholder="e.g. Send proposal, Schedule discovery call…"
            style={inputStyle}
          />
        </div>

        <div style={{ marginTop: 12 }}>
          <label style={labelStyle}>Due Date</label>
          <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} style={inputStyle} />
          {overdue && (
            <div style={{ fontSize: 11, color: '#dc2626', marginTop: 4, fontWeight: 600 }}>
              ⚠ Overdue by {Math.abs(daysUntil(lead.next_action_date as string, today))} day(s)
            </div>
          )}
        </div>

        <div style={{ marginTop: 12 }}>
          <label style={labelStyle}>Notes</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={4} style={{ ...inputStyle, resize: 'vertical' }} />
        </div>

        <button
          onClick={save}
          disabled={!dirty || saving}
          style={{
            marginTop: 12, width: '100%', padding: '9px 16px',
            background: dirty && !saving ? 'var(--brand-accent, #6366f1)' : 'var(--bg-sunken)',
            color: dirty && !saving ? 'white' : 'var(--text-muted)',
            border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600,
            cursor: dirty && !saving ? 'pointer' : 'default',
          }}
        >
          {saving ? 'Saving…' : dirty ? 'Save Changes' : 'Saved'}
        </button>

        {/* Stage moves */}
        <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
          <label style={labelStyle}>Move to Stage</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {STAGES.map(s => {
              const current = s.id === lead.status
              return (
                <button
                  key={s.id}
                  onClick={() => !current && onPatch(lead.id, { status: s.id })}
                  disabled={current || saving}
                  style={{
                    padding: '5px 11px', borderRadius: 14, fontSize: 12, fontWeight: 600,
                    cursor: current || saving ? 'default' : 'pointer',
                    border: `1px solid ${current ? s.color : 'var(--border)'}`,
                    background: current ? s.color : 'transparent',
                    color: current ? 'white' : s.color,
                    opacity: saving && !current ? 0.5 : 1,
                  }}
                >
                  {s.label}
                </button>
              )
            })}
          </div>
        </div>

        {lead.status === 'lost' && lead.lost_reason && (
          <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-muted)' }}>
            <strong>Lost reason:</strong> {lead.lost_reason}
          </div>
        )}
      </div>
    </div>
  )
}
