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
  { id: 'disqualified',  label: 'Disqualified',  color: '#64748b' },
] as const

// Reasons stored in lost_reason when a lead is disqualified.
const DISQUALIFY_REASONS = [
  { id: 'wrong-number',         label: 'Wrong Number' },
  { id: 'spam',                 label: 'Spam' },
  { id: 'not-qualified',        label: 'Not Qualified' },
  { id: 'outside-service-area', label: 'Outside Service Area' },
  { id: 'no-budget',            label: 'No Budget' },
  { id: 'competitor',           label: 'Competitor' },
  { id: 'duplicate',            label: 'Duplicate' },
  { id: 'other',                label: 'Other' },
] as const

const disqualifyReasonLabel = (id: string | null) =>
  id ? (DISQUALIFY_REASONS.find(r => r.id === id)?.label ?? id) : null

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
  address_street: string | null
  address_city: string | null
  address_state: string | null
  address_zip: string | null
  contact_title: string | null
  secondary_contact_name: string | null
  secondary_contact_email: string | null
  secondary_contact_phone: string | null
  referral_source_detail: string | null
  lead_type: string | null
  last_activity_at: string | null
  is_stale: boolean | null
  stale_since: string | null
  stale_tag: string | null
}

export type Activity = {
  id: string
  activity_type: string
  summary: string | null
  contact_method: string | null
  created_by: string | null
  created_at: string
}

// Mirrors lead_activities_type_check.
const ACTIVITY_TYPES = [
  { id: 'call',             label: 'Call',            icon: '📞' },
  { id: 'text',             label: 'Text',            icon: '💬' },
  { id: 'email',            label: 'Email',           icon: '✉️' },
  { id: 'meeting',          label: 'Meeting',         icon: '🤝' },
  { id: 'note',             label: 'Note',            icon: '📝' },
  { id: 'voicemail',        label: 'Voicemail',       icon: '📼' },
  { id: 'form-submission',  label: 'Form Submission', icon: '📄' },
  { id: 'contract-viewed',  label: 'Contract Viewed', icon: '👀' },
] as const

const activityMeta = (id: string) =>
  ACTIVITY_TYPES.find(a => a.id === id) ?? { id, label: id, icon: '•' }

export type StageEvent = {
  id: string
  from_status: string | null
  to_status: string
  changed_at: string
}

// Mirrors the leads_lead_type_check constraint.
const LEAD_TYPES = [
  { id: 'website',              label: 'Website' },
  { id: 'retainer',             label: 'Retainer' },
  { id: 'full-service',         label: 'Full Service' },
  { id: 'distributor-program',  label: 'Distributor Program' },
  { id: 'contractor-program',   label: 'Contractor Program' },
] as const

const leadTypeLabel = (id: string | null) =>
  id ? (LEAD_TYPES.find(t => t.id === id)?.label ?? id) : null

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

type TeamMember = { id: string; name: string | null }

const PRIORITIES = ['low', 'medium', 'high'] as const

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
  teamMembers,
  today,
  canSeeFinancials,
}: {
  initialLeads: Lead[]
  teamMembers: TeamMember[]
  today: string
  /**
   * From team_members.sales_access. When false, every dollar figure is hidden —
   * card values, the Pipeline/Won KPI tiles, per-column $/mo, the list Value
   * column, and the estimated-value inputs. The board, names, stages, and
   * activity stay fully visible.
   */
  canSeeFinancials: boolean
}) {
  const [leads, setLeads] = useState<Lead[]>(initialLeads)
  const [view, setView] = useState<'board' | 'list'>('board')
  const [selected, setSelected] = useState<Lead | null>(null)
  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverStage, setDragOverStage] = useState<string | null>(null)
  const [lineCard, setLineCard] = useState<Lead | null>(null)
  const [events, setEvents] = useState<StageEvent[]>([])
  const [eventsLoading, setEventsLoading] = useState(false)
  const [activities, setActivities] = useState<Activity[]>([])
  const [activitiesLoading, setActivitiesLoading] = useState(false)

  // Load the activity feed whenever a different lead is opened.
  const selectedId = selected?.id
  useEffect(() => {
    if (!selectedId) { setActivities([]); return }
    let cancelled = false
    setActivitiesLoading(true)
    fetch(`/api/leads/${selectedId}/activities`)
      .then(r => (r.ok ? r.json() : []))
      .then(d => { if (!cancelled) setActivities(Array.isArray(d) ? d : []) })
      .catch(() => { if (!cancelled) setActivities([]) })
      .finally(() => { if (!cancelled) setActivitiesLoading(false) })
    return () => { cancelled = true }
  }, [selectedId])

  // assigned_to stores the team_members.id (e.g. 'valerie'); show the name.
  const memberName = (id: string | null) =>
    id ? (teamMembers.find(m => m.id === id)?.name ?? id) : null

  const isOpen = (l: Lead) => OPEN_STAGES.includes(l.status)
  const isOverdue = (l: Lead) =>
    !!l.next_action_date && isOpen(l) && daysUntil(l.next_action_date, today) < 0

  // Filters drive the whole page: board columns, list rows, and every KPI.
  const [assigneeFilter, setAssigneeFilter] = useState<string>('all')
  const [sourceFilter, setSourceFilter] = useState<string>('all')

  const visible = useMemo(
    () => leads.filter(l =>
      (assigneeFilter === 'all' || l.assigned_to === assigneeFilter) &&
      (sourceFilter === 'all' || l.source === sourceFilter)
    ),
    [leads, assigneeFilter, sourceFilter]
  )

  // The listed sources, plus any others actually present so no lead is
  // impossible to filter to.
  const sourceOptions = useMemo(() => {
    const preferred = [
      'rbs-referral', 'client-referral', 'existing-client',
      'inbound', 'cira', 'assessment', 'manual',
    ]
    const present = Array.from(new Set(leads.map(l => l.source).filter(Boolean)))
    return [...preferred, ...present.filter(s => !preferred.includes(s))]
  }, [leads])

  const filtering = assigneeFilter !== 'all' || sourceFilter !== 'all'

  const kpis = useMemo(() => {
    const open = visible.filter(isOpen)
    return {
      pipelineValue: open.reduce((s, l) => s + val(l), 0),
      wonValue: visible.filter(l => l.status === 'won').reduce((s, l) => s + val(l), 0),
      activeDeals: open.length,
      overdue: visible.filter(isOverdue).length,
      noAction: open.filter(l => !l.next_action_date).length,
      wonCount: visible.filter(l => l.status === 'won').length,
      stale: open.filter(l => l.is_stale === true).length,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, today])

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
      // acSync is transport-only metadata about the ActiveCampaign push; keep it
      // out of lead state and surface any warning to the user directly.
      const { acSync, ...updated } = await res.json()
      setLeads(prev => prev.map(l => (l.id === id ? { ...l, ...updated } : l)))
      setSelected(prev => (prev && prev.id === id ? { ...prev, ...updated } : prev))
      if (acSync?.warning) setError(acSync.warning)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function createLead(fields: Record<string, string>) {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `Could not add lead (${res.status})`)
      }
      const { acSync, ...created } = await res.json()
      setLeads(prev => [created, ...prev])
      setAdding(false)
      if (acSync?.warning) setError(acSync.warning)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add lead')
    } finally {
      setSaving(false)
    }
  }

  // Soft delete: move to 'lost' so the record and its history survive. The
  // DELETE endpoint exists but is deliberately not used here.
  async function removeLead(lead: Lead) {
    if (!confirm('Are you sure you want to remove this lead?')) return
    await patch(lead.id, { status: 'lost' })
    setSelected(null)
  }

  // Disqualified = never belonged in the pipeline. Distinct from Lost, which
  // is a real deal that didn't close. The reason lands in lost_reason.
  async function disqualifyLead(lead: Lead, reason: string) {
    await patch(lead.id, { status: 'disqualified', lost_reason: reason })
    setSelected(null)
  }

  // Logging an activity is what marks a lead as touched: the DB trigger updates
  // last_activity_at and clears the stale flag, and the route drops the stale
  // tag in ActiveCampaign.
  async function addActivity(leadId: string, activityType: string, summary: string, method: string) {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/leads/${leadId}/activities`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          activity_type: activityType,
          summary,
          contact_method: method || null,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `Could not log activity (${res.status})`)
      }
      const { activity, lead, acSync } = await res.json()
      setActivities(prev => [activity, ...prev])
      if (lead) {
        setLeads(prev => prev.map(l => (l.id === leadId ? { ...l, ...lead } : l)))
        setSelected(prev => (prev && prev.id === leadId ? { ...prev, ...lead } : prev))
      }
      if (acSync?.warning) setError(acSync.warning)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not log activity')
    } finally {
      setSaving(false)
    }
  }

  async function convertToClient(lead: Lead) {
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      const res = await fetch(`/api/leads/${lead.id}/convert`, { method: 'POST' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || `Convert failed (${res.status})`)

      if (body.lead) {
        setLeads(prev => prev.map(l => (l.id === lead.id ? { ...l, ...body.lead } : l)))
        setSelected(prev => (prev && prev.id === lead.id ? { ...prev, ...body.lead } : prev))
      }
      setNotice(
        body.linked_existing
          ? `Linked to existing client "${body.client_id}" — no duplicate created.`
          : `Client "${body.client_id}" created and linked.`
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Convert failed')
    } finally {
      setSaving(false)
    }
  }

  // Dropping a card on a column is a stage change, so it goes through the same
  // patch() as the modal buttons — meaning it also fires the AC sync and the
  // pipeline notifications.
  async function handleDrop(stageId: Stage) {
    const id = draggingId
    setDraggingId(null)
    setDragOverStage(null)
    if (!id) return
    const lead = leads.find(l => l.id === id)
    if (!lead || lead.status === stageId) return

    // Disqualified requires a reason, so it is not a drop target — same rule as
    // the Move to Stage row. Use the Disqualify action in the detail modal.
    if (stageId === 'disqualified') {
      setError('To disqualify a lead, open it and use Disqualify so a reason is recorded.')
      return
    }
    await patch(id, { status: stageId })
  }

  async function openLineCard(lead: Lead) {
    setLineCard(lead)
    setEvents([])
    setEventsLoading(true)
    try {
      const res = await fetch(`/api/leads/${lead.id}/events`)
      setEvents(res.ok ? await res.json() : [])
    } catch {
      setEvents([])
    } finally {
      setEventsLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', color: 'var(--text)' }}>

      {/* Header */}
      <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          {/* /pipeline sits outside the /dashboard layout, so it has no sidebar —
              this is the only way back. */}
          <a href="/dashboard" style={{ fontSize: 12, color: 'var(--text-muted)', textDecoration: 'none' }}>
            ← Dashboard
          </a>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: '2px 0 0' }}>Sales Pipeline</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '2px 0 0' }}>
            {visible.length} lead{visible.length === 1 ? '' : 's'}
            {filtering && ` of ${leads.length}`} · {kpis.activeDeals} active · {kpis.wonCount} won
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
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
          <button
            onClick={() => setAdding(true)}
            style={{
              padding: '8px 16px', background: 'var(--brand-accent, #6366f1)', color: 'white',
              border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}
          >
            + Add Lead
          </button>
        </div>
      </div>

      {error && (
        <div style={{ padding: '8px 24px', background: '#dc262615', color: '#dc2626', fontSize: 12, flexShrink: 0 }}>
          {error}
        </div>
      )}

      {notice && (
        <div
          onClick={() => setNotice(null)}
          style={{ padding: '8px 24px', background: '#16a34a15', color: '#16a34a', fontSize: 12, flexShrink: 0, cursor: 'pointer' }}
        >
          ✓ {notice}
        </div>
      )}

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, padding: '16px 24px', flexShrink: 0 }}>
        {/* Money tiles are omitted entirely without sales_access — not blanked
            out, so there is no shape of a number to infer. */}
        {canSeeFinancials && (
          <>
            <Kpi label="Pipeline Value" value={`${money(kpis.pipelineValue)}/mo`} subtitle={`${kpis.activeDeals} open deal${kpis.activeDeals === 1 ? '' : 's'}`} />
            <Kpi label="Won Value" value={`${money(kpis.wonValue)}/mo`} subtitle={`${kpis.wonCount} closed won`} accent="#16a34a" />
          </>
        )}
        <Kpi label="Active Deals" value={String(kpis.activeDeals)} subtitle={kpis.noAction > 0 ? `${kpis.noAction} with no next action` : 'all have next actions'} />
        <Kpi
          label="Overdue Actions"
          value={String(kpis.overdue)}
          subtitle={kpis.overdue > 0 ? 'needs follow-up today' : 'nothing overdue'}
          accent={kpis.overdue > 0 ? '#dc2626' : undefined}
        />
        <Kpi
          label="Stale Deals"
          value={String(kpis.stale)}
          subtitle={kpis.stale > 0 ? 'no activity logged in time' : 'all recently touched'}
          accent={kpis.stale > 0 ? '#dc2626' : undefined}
        />
      </div>

      {/* Filter bar — applies to the board, the list, and every KPI above. */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        padding: '0 24px 14px', flexShrink: 0,
      }}>
        <span style={{ ...FIELD_LABEL, marginBottom: 0 }}>Assignee</span>
        <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          {[{ id: 'all', name: 'All' }, ...teamMembers].map(m => {
            const active = assigneeFilter === m.id
            return (
              <button
                key={m.id}
                onClick={() => setAssigneeFilter(m.id)}
                style={{
                  padding: '6px 12px', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 500,
                  background: active ? 'var(--brand-accent, #6366f1)' : 'transparent',
                  color: active ? 'white' : 'var(--text-muted)',
                }}
              >
                {m.name ?? m.id}
              </button>
            )
          })}
        </div>

        <span style={{ ...FIELD_LABEL, marginBottom: 0 }}>Source</span>
        <select
          value={sourceFilter}
          onChange={e => setSourceFilter(e.target.value)}
          style={{ ...FIELD_INPUT, width: 'auto' }}
        >
          <option value="all">All Sources</option>
          {sourceOptions.map(s => {
            const cfg = SOURCE_CONFIG[s] ?? { label: s, icon: '📌' }
            return <option key={s} value={s}>{cfg.icon} {cfg.label}</option>
          })}
        </select>

        {filtering && (
          <button
            onClick={() => { setAssigneeFilter('all'); setSourceFilter('all') }}
            style={{
              padding: '5px 10px', background: 'transparent', color: 'var(--text-muted)',
              border: '1px solid var(--border)', borderRadius: 8, fontSize: 11, cursor: 'pointer',
            }}
          >
            Clear filters
          </button>
        )}

        {filtering && (
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {visible.length} of {leads.length} leads
          </span>
        )}
      </div>

      {/* Board */}
      {view === 'board' && (
        <div style={{ flex: 1, display: 'flex', minHeight: 0, borderTop: '1px solid var(--border)' }}>
          {STAGES.map(stage => {
            const colLeads = visible.filter(l => l.status === stage.id)
            const colValue = colLeads.reduce((s, l) => s + val(l), 0)
            return (
              <div
                key={stage.id}
                onDragOver={e => { e.preventDefault(); if (dragOverStage !== stage.id) setDragOverStage(stage.id) }}
                onDragLeave={() => setDragOverStage(cur => (cur === stage.id ? null : cur))}
                onDrop={e => { e.preventDefault(); handleDrop(stage.id) }}
                style={{
                  flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column',
                  borderRight: '1px solid var(--border)', overflow: 'hidden',
                  background: dragOverStage === stage.id && stage.id !== 'disqualified'
                    ? 'var(--brand-accent-soft, rgba(99,102,241,0.08))' : 'transparent',
                  transition: 'background 0.15s',
                }}
              >
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
                  {canSeeFinancials && colValue > 0 && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{money(colValue)}/mo</div>
                  )}
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
                  {colLeads.map(lead => (
                    <Card key={lead.id} lead={lead} today={today} overdue={isOverdue(lead)}
                      assignedName={memberName(lead.assigned_to)} canSeeFinancials={canSeeFinancials}
                      dragging={draggingId === lead.id}
                      onDragStart={() => setDraggingId(lead.id)}
                      onDragEnd={() => { setDraggingId(null); setDragOverStage(null) }}
                      onClick={() => setSelected(lead)} />
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
                {['Business', 'Contact', 'Stage', ...(canSeeFinancials ? ['Value'] : []), 'Next Action', 'Due', 'Source', 'Assigned'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '8px 12px', fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map(lead => {
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
                    {canSeeFinancials && (
                      <td style={{ padding: '8px 12px', fontFamily: 'monospace' }}>{val(lead) ? `${money(val(lead))}/mo` : '—'}</td>
                    )}
                    <td style={{ padding: '8px 12px', color: lead.next_action ? undefined : 'var(--text-muted)' }}>{lead.next_action || '—'}</td>
                    <td style={{ padding: '8px 12px', color: overdue ? '#dc2626' : 'var(--text-muted)', fontWeight: overdue ? 600 : 400 }}>
                      {lead.next_action_date ? `${overdue ? '⚠ ' : ''}${fmtDate(lead.next_action_date)}` : '—'}
                    </td>
                    <td style={{ padding: '8px 12px', fontSize: 11, color: 'var(--text-muted)' }}>{src.icon} {src.label}</td>
                    <td style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text-muted)' }}>{memberName(lead.assigned_to) || 'Unassigned'}</td>
                  </tr>
                )
              })}
              {visible.length === 0 && (
                <tr><td colSpan={canSeeFinancials ? 8 : 7} style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>
                  {filtering ? 'No leads match these filters.' : 'No leads yet.'}
                </td></tr>
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
          assignedName={memberName(selected.assigned_to)}
          teamMembers={teamMembers}
          activities={activities}
          activitiesLoading={activitiesLoading}
          memberName={memberName}
          canSeeFinancials={canSeeFinancials}
          onAddActivity={addActivity}
          onConvert={convertToClient}
          onPatch={patch}
          onRemove={removeLead}
          onDisqualify={disqualifyLead}
          onLineCard={() => openLineCard(selected)}
          onClose={() => setSelected(null)}
        />
      )}

      {lineCard && (
        <LineCard
          lead={lineCard}
          events={events}
          eventsLoading={eventsLoading}
          assignedName={memberName(lineCard.assigned_to)}
          canSeeFinancials={canSeeFinancials}
          onClose={() => setLineCard(null)}
        />
      )}

      {adding && (
        <AddLeadModal
          teamMembers={teamMembers}
          saving={saving}
          canSeeFinancials={canSeeFinancials}
          onCreate={createLead}
          onClose={() => setAdding(false)}
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

function Card({ lead, today, overdue, assignedName, canSeeFinancials, dragging, onDragStart, onDragEnd, onClick }: {
  lead: Lead; today: string; overdue: boolean; assignedName: string | null
  canSeeFinancials: boolean; dragging?: boolean
  onDragStart?: () => void; onDragEnd?: () => void; onClick: () => void
}) {
  const src = SOURCE_CONFIG[lead.source] ?? { label: lead.source, icon: '📌' }
  const days = lead.next_action_date ? daysUntil(lead.next_action_date, today) : null
  const dueToday = days === 0
  const stale = lead.is_stale === true
  // Stale (nobody has touched it) and overdue (a dated action slipped) are
  // different failures; stale takes the border since it is the louder signal.
  const flagged = stale || overdue

  return (
    <div
      draggable
      onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; onDragStart?.() }}
      onDragEnd={() => onDragEnd?.()}
      onClick={onClick}
      style={{
        opacity: dragging ? 0.45 : 1,
        border: `1px solid ${flagged ? '#dc262650' : 'var(--border)'}`,
        borderLeft: flagged ? '3px solid #dc2626' : '1px solid var(--border)',
        borderRadius: 8,
        padding: '9px 10px',
        marginBottom: 8,
        background: 'var(--bg-elevated)',
        cursor: 'grab',
        fontSize: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
        {stale && (
          <span
            title={`Stale — no activity logged since ${lead.last_activity_at ? new Date(lead.last_activity_at).toLocaleDateString('en-US') : 'unknown'}`}
            style={{ flexShrink: 0, fontSize: 11 }}
          >
            🕒
          </span>
        )}
        <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {lead.business_name}
        </span>
      </div>

      {lead.name && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {lead.name}
        </div>
      )}

      {canSeeFinancials && val(lead) > 0 && (
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
          {assignedName || 'Unassigned'}
        </span>
      </div>
    </div>
  )
}

const BLANK_LEAD = {
  // Business Info
  business_name: '', website: '', industry: '', location: '', estimated_value: '',
  // Primary Contact
  name: '', contact_title: '', email: '', phone: '',
  // Secondary Contact
  secondary_contact_name: '', secondary_contact_email: '', secondary_contact_phone: '',
  // Address
  address_street: '', address_city: '', address_state: '', address_zip: '',
  // Lead Details
  source: 'manual', referral_source_detail: '', lead_type: '', priority: 'medium',
  assigned_to: '', next_action: '', next_action_date: '', notes: '',
}

// Section heading shared by the add + detail modals.
function GroupHeading({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
      color: 'var(--brand-accent, #6366f1)', marginTop: 4, marginBottom: -2,
      paddingBottom: 4, borderBottom: '1px solid var(--border)',
    }}>
      {children}
    </div>
  )
}

const FIELD_INPUT: React.CSSProperties = {
  width: '100%', padding: '7px 10px', border: '1px solid var(--border)',
  borderRadius: 6, fontSize: 13, fontFamily: 'inherit',
  background: 'var(--bg-sunken)', color: 'var(--text)',
}
const FIELD_LABEL: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
  letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 4, display: 'block',
}

// Defined at module scope on purpose: a component declared inside the modal's
// render body would be a new type every render, remounting each input and
// dropping focus after every keystroke.
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label style={FIELD_LABEL}>{label}</label>{children}</div>
}

function AddLeadModal({
  teamMembers, saving, canSeeFinancials, onCreate, onClose,
}: {
  teamMembers: TeamMember[]
  saving: boolean
  canSeeFinancials: boolean
  onCreate: (fields: Record<string, string>) => Promise<void>
  onClose: () => void
}) {
  const [f, setF] = useState({ ...BLANK_LEAD })
  const set = (k: keyof typeof BLANK_LEAD) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => setF(prev => ({ ...prev, [k]: e.target.value }))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const valid = f.business_name.trim().length > 0
  const inputStyle = FIELD_INPUT

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
          width: '100%', maxWidth: 580, maxHeight: '88vh', overflowY: 'auto',
          padding: 20, color: 'var(--text)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0, flex: 1 }}>Add Lead</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text-muted)', lineHeight: 1 }}>×</button>
        </div>

        <div style={{ marginTop: 16, display: 'grid', gap: 12 }}>

          <GroupHeading>Business Info</GroupHeading>
          <Field label="Business Name *">
            <input type="text" value={f.business_name} onChange={set('business_name')} placeholder="Required" autoFocus style={inputStyle} />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Website">
              <input type="text" value={f.website} onChange={set('website')} placeholder="example.com" style={inputStyle} />
            </Field>
            <Field label="Industry">
              <input type="text" value={f.industry} onChange={set('industry')} style={inputStyle} />
            </Field>
            <Field label="Location">
              <input type="text" value={f.location} onChange={set('location')} placeholder="Region or market" style={inputStyle} />
            </Field>
            {canSeeFinancials && (
              <Field label="Estimated Value ($/mo)">
                <input type="number" min={0} step={100} value={f.estimated_value} onChange={set('estimated_value')} style={inputStyle} />
              </Field>
            )}
          </div>

          <GroupHeading>Primary Contact</GroupHeading>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Contact Name">
              <input type="text" value={f.name} onChange={set('name')} style={inputStyle} />
            </Field>
            <Field label="Title / Role">
              <input type="text" value={f.contact_title} onChange={set('contact_title')} placeholder="Owner, Marketing Director…" style={inputStyle} />
            </Field>
            <Field label="Email">
              <input type="email" value={f.email} onChange={set('email')} style={inputStyle} />
            </Field>
            <Field label="Phone">
              <input type="tel" value={f.phone} onChange={set('phone')} style={inputStyle} />
            </Field>
          </div>

          <GroupHeading>Secondary Contact</GroupHeading>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Name">
              <input type="text" value={f.secondary_contact_name} onChange={set('secondary_contact_name')} style={inputStyle} />
            </Field>
            <Field label="Email">
              <input type="email" value={f.secondary_contact_email} onChange={set('secondary_contact_email')} style={inputStyle} />
            </Field>
            <Field label="Phone">
              <input type="tel" value={f.secondary_contact_phone} onChange={set('secondary_contact_phone')} style={inputStyle} />
            </Field>
          </div>

          <GroupHeading>Address</GroupHeading>
          <Field label="Street">
            <input type="text" value={f.address_street} onChange={set('address_street')} style={inputStyle} />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12 }}>
            <Field label="City">
              <input type="text" value={f.address_city} onChange={set('address_city')} style={inputStyle} />
            </Field>
            <Field label="State">
              <input type="text" value={f.address_state} onChange={set('address_state')} placeholder="IL" style={inputStyle} />
            </Field>
            <Field label="ZIP">
              <input type="text" value={f.address_zip} onChange={set('address_zip')} style={inputStyle} />
            </Field>
          </div>

          <GroupHeading>Lead Details</GroupHeading>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Source">
              <select value={f.source} onChange={set('source')} style={inputStyle}>
                {Object.entries(SOURCE_CONFIG).map(([id, cfg]) => (
                  <option key={id} value={id}>{cfg.icon} {cfg.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Lead Type">
              <select value={f.lead_type} onChange={set('lead_type')} style={inputStyle}>
                <option value="">Not set</option>
                {LEAD_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Referral Detail">
            <input type="text" value={f.referral_source_detail} onChange={set('referral_source_detail')} placeholder="e.g. Clint Klepp at RBS" style={inputStyle} />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Priority">
              <select value={f.priority} onChange={set('priority')} style={inputStyle}>
                {PRIORITIES.map(p => (
                  <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>
                ))}
              </select>
            </Field>
            <Field label="Assigned To">
              <select value={f.assigned_to} onChange={set('assigned_to')} style={inputStyle}>
                <option value="">Unassigned</option>
                {teamMembers.map(m => (
                  <option key={m.id} value={m.id}>{m.name ?? m.id}</option>
                ))}
              </select>
            </Field>
            <Field label="Next Action">
              <input type="text" value={f.next_action} onChange={set('next_action')} placeholder="e.g. Intro call…" style={inputStyle} />
            </Field>
            <Field label="Next Action Date">
              <input type="date" value={f.next_action_date} onChange={set('next_action_date')} style={inputStyle} />
            </Field>
          </div>
          <Field label="Notes">
            <textarea value={f.notes} onChange={set('notes')} rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
          </Field>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
          <button
            onClick={onClose}
            style={{
              flex: 1, padding: '9px 16px', background: 'transparent', color: 'var(--text-muted)',
              border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => onCreate(f)}
            disabled={!valid || saving}
            style={{
              flex: 2, padding: '9px 16px',
              background: valid && !saving ? 'var(--brand-accent, #6366f1)' : 'var(--bg-sunken)',
              color: valid && !saving ? 'white' : 'var(--text-muted)',
              border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600,
              cursor: valid && !saving ? 'pointer' : 'default',
            }}
          >
            {saving ? 'Adding…' : 'Add Lead'}
          </button>
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6, textAlign: 'center' }}>
          New leads start in the New stage.
        </div>
      </div>
    </div>
  )
}

// Editable projection of a lead. Empty string means "cleared" and is converted
// back to NULL on save.
function draftFrom(l: Lead) {
  return {
    business_name: l.business_name ?? '',
    website: l.website ?? '',
    industry: l.industry ?? '',
    location: l.location ?? '',
    estimated_value: l.estimated_value != null ? String(l.estimated_value) : '',
    name: l.name ?? '',
    contact_title: l.contact_title ?? '',
    email: l.email ?? '',
    phone: l.phone ?? '',
    secondary_contact_name: l.secondary_contact_name ?? '',
    secondary_contact_email: l.secondary_contact_email ?? '',
    secondary_contact_phone: l.secondary_contact_phone ?? '',
    address_street: l.address_street ?? '',
    address_city: l.address_city ?? '',
    address_state: l.address_state ?? '',
    address_zip: l.address_zip ?? '',
    source: l.source ?? 'manual',
    lead_type: l.lead_type ?? '',
    referral_source_detail: l.referral_source_detail ?? '',
    priority: l.priority ?? 'medium',
    assigned_to: l.assigned_to ?? '',
    next_action: l.next_action ?? '',
    next_action_date: l.next_action_date ?? '',
    notes: l.notes ?? '',
  }
}

function DetailModal({
  lead, today, saving, assignedName, teamMembers, activities, activitiesLoading,
  memberName, canSeeFinancials, onAddActivity, onConvert, onPatch, onRemove, onDisqualify, onLineCard, onClose,
}: {
  lead: Lead
  today: string
  saving: boolean
  canSeeFinancials: boolean
  assignedName: string | null
  teamMembers: TeamMember[]
  activities: Activity[]
  activitiesLoading: boolean
  memberName: (id: string | null) => string | null
  onAddActivity: (leadId: string, type: string, summary: string, method: string) => Promise<void>
  onConvert: (lead: Lead) => Promise<void>
  onPatch: (id: string, updates: Partial<Lead>) => Promise<void>
  onRemove: (lead: Lead) => Promise<void>
  onDisqualify: (lead: Lead, reason: string) => Promise<void>
  onLineCard: () => void
  onClose: () => void
}) {
  const [d, setD] = useState(() => draftFrom(lead))
  const [dqOpen, setDqOpen] = useState(false)
  const [dqReason, setDqReason] = useState<string>(DISQUALIFY_REASONS[0].id)
  const set = (k: keyof ReturnType<typeof draftFrom>) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => setD(prev => ({ ...prev, [k]: e.target.value }))

  // Re-seed when a different lead is opened, or when a save returns
  // server-normalized values (e.g. an appended AC warning note).
  const serverDraft = JSON.stringify(draftFrom(lead))
  useEffect(() => { setD(draftFrom(lead)) }, [serverDraft])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const dirty = JSON.stringify(d) !== serverDraft
  const stage = stageById.get(lead.status)
  const overdue = !!lead.next_action_date && OPEN_STAGES.includes(lead.status) && daysUntil(lead.next_action_date, today) < 0

  const inputStyle = FIELD_INPUT
  const labelStyle = FIELD_LABEL

  function save() {
    const t = (v: string) => (v.trim() ? v.trim() : null)
    onPatch(lead.id, {
      business_name: d.business_name.trim() || lead.business_name, // NOT NULL in DB
      website: t(d.website),
      industry: t(d.industry),
      location: t(d.location),
      estimated_value: d.estimated_value.trim() ? Number(d.estimated_value) : null,
      name: t(d.name),
      contact_title: t(d.contact_title),
      email: t(d.email),
      phone: t(d.phone),
      secondary_contact_name: t(d.secondary_contact_name),
      secondary_contact_email: t(d.secondary_contact_email),
      secondary_contact_phone: t(d.secondary_contact_phone),
      address_street: t(d.address_street),
      address_city: t(d.address_city),
      address_state: t(d.address_state),
      address_zip: t(d.address_zip),
      source: d.source || 'manual',
      lead_type: d.lead_type || null,
      referral_source_detail: t(d.referral_source_detail),
      priority: (d.priority || 'medium') as Lead['priority'],
      assigned_to: d.assigned_to || null,
      next_action: t(d.next_action),
      next_action_date: d.next_action_date || null,
      notes: t(d.notes),
    })
  }

  const src = SOURCE_CONFIG[lead.source] ?? { label: lead.source, icon: '📌' }

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
          width: '100%', maxWidth: 580, maxHeight: '88vh', overflowY: 'auto',
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
              {canSeeFinancials && val(lead) > 0 && ` · ${money(val(lead))}/mo`}
              {lead.lead_type && ` · ${leadTypeLabel(lead.lead_type)}`}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
              Assigned to <strong style={{ color: 'var(--text)' }}>{assignedName || 'Unassigned'}</strong>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text-muted)', lineHeight: 1 }}>×</button>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button
            onClick={onLineCard}
            style={{
              flex: 1, padding: '8px 16px', background: 'transparent',
              color: 'var(--brand-accent, #6366f1)', border: '1px solid var(--brand-accent, #6366f1)',
              borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}
          >
            🖨 View Line Card
          </button>

          {/* Conversion is only meaningful once the deal is won. */}
          {lead.status === 'won' && (
            lead.converted_to_client_id ? (
              <a
                href={`/reports/${lead.converted_to_client_id}`}
                style={{
                  flex: 1, padding: '8px 16px', background: '#16a34a15', color: '#16a34a',
                  border: '1px solid #16a34a50', borderRadius: 8, fontSize: 13, fontWeight: 600,
                  textAlign: 'center', textDecoration: 'none',
                }}
              >
                ✓ Client: {lead.converted_to_client_id}
              </a>
            ) : (
              <button
                onClick={() => onConvert(lead)}
                disabled={saving}
                style={{
                  flex: 1, padding: '8px 16px', background: '#16a34a', color: 'white',
                  border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600,
                  cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1,
                }}
              >
                {saving ? 'Converting…' : '→ Convert to Client'}
              </button>
            )
          )}
        </div>

        {/* Editable fields */}
        <div style={{ marginTop: 16, display: 'grid', gap: 12 }}>

          <GroupHeading>Business Info</GroupHeading>
          <Field label="Business Name">
            <input type="text" value={d.business_name} onChange={set('business_name')} style={inputStyle} />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Website">
              <input type="text" value={d.website} onChange={set('website')} style={inputStyle} />
            </Field>
            <Field label="Industry">
              <input type="text" value={d.industry} onChange={set('industry')} style={inputStyle} />
            </Field>
            <Field label="Location">
              <input type="text" value={d.location} onChange={set('location')} style={inputStyle} />
            </Field>
            {canSeeFinancials && (
              <Field label="Estimated Value ($/mo)">
                <input type="number" min={0} step={100} value={d.estimated_value} onChange={set('estimated_value')} style={inputStyle} />
              </Field>
            )}
          </div>

          <GroupHeading>Primary Contact</GroupHeading>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Contact Name">
              <input type="text" value={d.name} onChange={set('name')} style={inputStyle} />
            </Field>
            <Field label="Title / Role">
              <input type="text" value={d.contact_title} onChange={set('contact_title')} placeholder="Owner, Marketing Director…" style={inputStyle} />
            </Field>
            <Field label="Email">
              <input type="email" value={d.email} onChange={set('email')} style={inputStyle} />
            </Field>
            <Field label="Phone">
              <input type="tel" value={d.phone} onChange={set('phone')} style={inputStyle} />
            </Field>
          </div>
          {!d.email.trim() && (
            <div style={{ fontSize: 10, color: '#d97706' }}>
              No email — stage changes will not sync to ActiveCampaign.
            </div>
          )}

          <GroupHeading>Secondary Contact</GroupHeading>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Name">
              <input type="text" value={d.secondary_contact_name} onChange={set('secondary_contact_name')} style={inputStyle} />
            </Field>
            <Field label="Email">
              <input type="email" value={d.secondary_contact_email} onChange={set('secondary_contact_email')} style={inputStyle} />
            </Field>
            <Field label="Phone">
              <input type="tel" value={d.secondary_contact_phone} onChange={set('secondary_contact_phone')} style={inputStyle} />
            </Field>
          </div>

          <GroupHeading>Address</GroupHeading>
          <Field label="Street">
            <input type="text" value={d.address_street} onChange={set('address_street')} style={inputStyle} />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12 }}>
            <Field label="City">
              <input type="text" value={d.address_city} onChange={set('address_city')} style={inputStyle} />
            </Field>
            <Field label="State">
              <input type="text" value={d.address_state} onChange={set('address_state')} style={inputStyle} />
            </Field>
            <Field label="ZIP">
              <input type="text" value={d.address_zip} onChange={set('address_zip')} style={inputStyle} />
            </Field>
          </div>

          <GroupHeading>Lead Details</GroupHeading>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Source">
              <select value={d.source} onChange={set('source')} style={inputStyle}>
                {Object.entries(SOURCE_CONFIG).map(([id, cfg]) => (
                  <option key={id} value={id}>{cfg.icon} {cfg.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Lead Type">
              <select value={d.lead_type} onChange={set('lead_type')} style={inputStyle}>
                <option value="">Not set</option>
                {LEAD_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Referral Detail">
            <input type="text" value={d.referral_source_detail} onChange={set('referral_source_detail')} placeholder="e.g. Clint Klepp at RBS" style={inputStyle} />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Priority">
              <select value={d.priority} onChange={set('priority')} style={inputStyle}>
                {PRIORITIES.map(p => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}
              </select>
            </Field>
            <Field label="Assigned To">
              <select value={d.assigned_to} onChange={set('assigned_to')} style={inputStyle}>
                <option value="">Unassigned</option>
                {teamMembers.map(m => <option key={m.id} value={m.id}>{m.name ?? m.id}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Next Action">
            <input type="text" value={d.next_action} onChange={set('next_action')} placeholder="e.g. Send proposal…" style={inputStyle} />
          </Field>
          <Field label="Next Action Date">
            <input type="date" value={d.next_action_date} onChange={set('next_action_date')} style={inputStyle} />
            {overdue && (
              <div style={{ fontSize: 11, color: '#dc2626', marginTop: 4, fontWeight: 600 }}>
                ⚠ Overdue by {Math.abs(daysUntil(lead.next_action_date as string, today))} day(s)
              </div>
            )}
          </Field>
          <Field label="Notes">
            <textarea value={d.notes} onChange={set('notes')} rows={4} style={{ ...inputStyle, resize: 'vertical' }} />
          </Field>
        </div>

        <ActivityTimeline
          lead={lead}
          activities={activities}
          loading={activitiesLoading}
          saving={saving}
          memberName={memberName}
          onAdd={onAddActivity}
        />

        <button
          onClick={save}
          disabled={!dirty || saving}
          style={{
            marginTop: 14, width: '100%', padding: '9px 16px',
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
            {/* Disqualified is omitted here on purpose — it requires a reason,
                so it is set through the Disqualify action below. */}
            {STAGES.filter(s => s.id !== 'disqualified').map(s => {
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

        {(lead.status === 'lost' || lead.status === 'disqualified') && lead.lost_reason && (
          <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-muted)' }}>
            <strong>{lead.status === 'disqualified' ? 'Disqualified' : 'Lost'} reason:</strong>{' '}
            {disqualifyReasonLabel(lead.lost_reason)}
          </div>
        )}

        {/* Close-out actions — both soft: the record is always kept.
            Lost = a real deal that didn't close. Disqualified = never belonged
            in the pipeline, and carries a reason for source-quality tracking. */}
        <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
          {lead.status === 'lost' || lead.status === 'disqualified' ? (
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              This lead is already marked {lead.status === 'lost' ? 'lost' : 'disqualified'}.
              Move it to another stage above to bring it back.
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => onRemove(lead)}
                  disabled={saving}
                  style={{
                    flex: 1, padding: '8px 12px', background: 'transparent',
                    color: '#dc2626', border: '1px solid #dc262650', borderRadius: 8,
                    fontSize: 13, fontWeight: 600, cursor: saving ? 'default' : 'pointer',
                    opacity: saving ? 0.6 : 1,
                  }}
                >
                  Mark Lost
                </button>
                <button
                  onClick={() => setDqOpen(v => !v)}
                  disabled={saving}
                  style={{
                    flex: 1, padding: '8px 12px', background: dqOpen ? '#64748b' : 'transparent',
                    color: dqOpen ? 'white' : '#64748b', border: '1px solid #64748b70', borderRadius: 8,
                    fontSize: 13, fontWeight: 600, cursor: saving ? 'default' : 'pointer',
                    opacity: saving ? 0.6 : 1,
                  }}
                >
                  Disqualify
                </button>
              </div>

              {dqOpen && (
                <div style={{
                  marginTop: 10, padding: 12, borderRadius: 8,
                  background: 'var(--bg-sunken)', border: '1px solid var(--border)',
                }}>
                  <label style={labelStyle}>Disqualify Reason</label>
                  <select value={dqReason} onChange={e => setDqReason(e.target.value)} style={inputStyle}>
                    {DISQUALIFY_REASONS.map(r => (
                      <option key={r.id} value={r.id}>{r.label}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => onDisqualify(lead, dqReason)}
                    disabled={saving}
                    style={{
                      marginTop: 10, width: '100%', padding: '8px 16px', background: '#64748b',
                      color: 'white', border: 'none', borderRadius: 8,
                      fontSize: 13, fontWeight: 600, cursor: saving ? 'default' : 'pointer',
                      opacity: saving ? 0.6 : 1,
                    }}
                  >
                    {saving ? 'Saving…' : 'Confirm Disqualify'}
                  </button>
                </div>
              )}

              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6, textAlign: 'center' }}>
                Lost = real deal that didn&apos;t close. Disqualified = never belonged in the pipeline.
                Neither deletes the record.
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Prospect line card ──────────────────────────────────────────────────────
// One-page summary intended to be printed or saved to PDF. The print rules hide
// the rest of the app rather than re-laying it out, so what prints is exactly
// this sheet.
const LINE_CARD_PRINT_CSS = `
@media print {
  body * { visibility: hidden !important; }
  .ab-linecard, .ab-linecard * { visibility: visible !important; }
  .ab-linecard {
    position: absolute !important;
    inset: 0 !important;
    margin: 0 !important;
    padding: 0 !important;
    background: #fff !important;
    color: #000 !important;
    box-shadow: none !important;
    border: none !important;
    border-radius: 0 !important;
    max-height: none !important;
    overflow: visible !important;
    width: 100% !important;
    max-width: none !important;
  }
  .ab-linecard a { color: #000 !important; text-decoration: none !important; }
  .ab-linecard-noprint { display: none !important; }
  .ab-linecard-section { break-inside: avoid; page-break-inside: avoid; }
  @page { margin: 14mm; }
}
`

function LcRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === '') return null
  return (
    <div style={{ display: 'flex', gap: 8, fontSize: 12, padding: '2px 0' }}>
      <span style={{ minWidth: 116, color: '#666', flexShrink: 0 }}>{label}</span>
      <span style={{ fontWeight: 500 }}>{value}</span>
    </div>
  )
}

function LcSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="ab-linecard-section" style={{ marginTop: 14 }}>
      <div style={{
        fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
        borderBottom: '1px solid #ccc', paddingBottom: 3, marginBottom: 6, color: '#333',
      }}>
        {title}
      </div>
      {children}
    </div>
  )
}

function LineCard({
  lead, events, eventsLoading, assignedName, canSeeFinancials, onClose,
}: {
  lead: Lead
  events: StageEvent[]
  eventsLoading: boolean
  assignedName: string | null
  canSeeFinancials: boolean
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const stage = stageById.get(lead.status)
  const src = SOURCE_CONFIG[lead.source] ?? { label: lead.source, icon: '📌' }

  const cityLine = [lead.address_city, lead.address_state].filter(Boolean).join(', ')
  const addressLines = [lead.address_street, [cityLine, lead.address_zip].filter(Boolean).join(' ')]
    .filter(Boolean)

  const fmtStamp = (iso: string) =>
    new Date(iso).toLocaleString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    })

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: 20, zIndex: 60, overflowY: 'auto',
      }}
    >
      <style>{LINE_CARD_PRINT_CSS}</style>
      <div
        className="ab-linecard"
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', color: '#111', borderRadius: 10,
          width: '100%', maxWidth: 780, padding: '28px 32px',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        {/* Toolbar — excluded from print */}
        <div className="ab-linecard-noprint" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginBottom: 14 }}>
          <button
            onClick={() => window.print()}
            style={{
              padding: '7px 16px', background: '#111', color: '#fff', border: 'none',
              borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}
          >
            🖨 Print
          </button>
          <button
            onClick={onClose}
            style={{
              padding: '7px 16px', background: 'transparent', color: '#555',
              border: '1px solid #ccc', borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>

        {/* Masthead */}
        <div style={{ borderBottom: '2px solid #111', paddingBottom: 10 }}>
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.14em', color: '#666' }}>
            A&amp;B Consulting Group · Prospect Line Card
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: '6px 0 0' }}>{lead.business_name}</h1>
          <div style={{ fontSize: 12, color: '#444', marginTop: 4 }}>
            <strong>{stage?.label ?? lead.status}</strong>
            {lead.lead_type && <> · {leadTypeLabel(lead.lead_type)}</>}
            {canSeeFinancials && val(lead) > 0 && <> · {money(val(lead))}/mo estimated</>}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 28px' }}>
          <div>
            <LcSection title="Business Info">
              <LcRow label="Business" value={lead.business_name} />
              <LcRow label="Website" value={lead.website} />
              <LcRow label="Industry" value={lead.industry} />
              <LcRow label="Location" value={lead.location} />
              {canSeeFinancials && <LcRow label="Estimated Value" value={val(lead) > 0 ? `${money(val(lead))}/mo` : null} />}
            </LcSection>

            <LcSection title="Address">
              {addressLines.length > 0
                ? addressLines.map((line, i) => (
                    <div key={i} style={{ fontSize: 12, fontWeight: 500 }}>{line}</div>
                  ))
                : <div style={{ fontSize: 12, color: '#888' }}>No address on file</div>}
            </LcSection>

            <LcSection title="Lead Details">
              <LcRow label="Pipeline Stage" value={stage?.label ?? lead.status} />
              <LcRow label="Lead Type" value={leadTypeLabel(lead.lead_type)} />
              <LcRow label="Source" value={`${src.icon} ${src.label}`} />
              <LcRow label="Referred By" value={lead.referral_source_detail} />
              <LcRow label="Priority" value={lead.priority} />
              <LcRow label="Assigned To" value={assignedName || 'Unassigned'} />
              <LcRow label="Next Action" value={lead.next_action} />
              <LcRow label="Next Action Due" value={lead.next_action_date ? fmtDate(lead.next_action_date) : null} />
            </LcSection>
          </div>

          <div>
            <LcSection title="Primary Contact">
              {lead.name || lead.email || lead.phone ? (
                <>
                  <LcRow label="Name" value={lead.name} />
                  <LcRow label="Title" value={lead.contact_title} />
                  <LcRow label="Email" value={lead.email ? <a href={`mailto:${lead.email}`}>{lead.email}</a> : null} />
                  <LcRow label="Phone" value={lead.phone} />
                </>
              ) : <div style={{ fontSize: 12, color: '#888' }}>No primary contact on file</div>}
            </LcSection>

            <LcSection title="Secondary Contact">
              {lead.secondary_contact_name || lead.secondary_contact_email || lead.secondary_contact_phone ? (
                <>
                  <LcRow label="Name" value={lead.secondary_contact_name} />
                  <LcRow label="Email" value={lead.secondary_contact_email ? <a href={`mailto:${lead.secondary_contact_email}`}>{lead.secondary_contact_email}</a> : null} />
                  <LcRow label="Phone" value={lead.secondary_contact_phone} />
                </>
              ) : <div style={{ fontSize: 12, color: '#888' }}>None</div>}
            </LcSection>

            <LcSection title="Stage Timeline">
              {eventsLoading && <div style={{ fontSize: 12, color: '#888' }}>Loading…</div>}
              {!eventsLoading && events.length === 0 && (
                <div style={{ fontSize: 12, color: '#888' }}>No stage changes recorded.</div>
              )}
              {!eventsLoading && events.map(ev => (
                <div key={ev.id} style={{ fontSize: 12, padding: '3px 0', borderBottom: '1px dotted #ddd' }}>
                  <div style={{ fontWeight: 600 }}>
                    {ev.from_status
                      ? `${stageById.get(ev.from_status)?.label ?? ev.from_status} → ${stageById.get(ev.to_status)?.label ?? ev.to_status}`
                      : `Created as ${stageById.get(ev.to_status)?.label ?? ev.to_status}`}
                  </div>
                  <div style={{ color: '#777', fontSize: 11 }}>{fmtStamp(ev.changed_at)}</div>
                </div>
              ))}
            </LcSection>
          </div>
        </div>

        <LcSection title="Notes">
          {lead.notes
            ? <div style={{ fontSize: 12, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{lead.notes}</div>
            : <div style={{ fontSize: 12, color: '#888' }}>No notes.</div>}
          {(lead.status === 'lost' || lead.status === 'disqualified') && lead.lost_reason && (
            <div style={{ fontSize: 12, marginTop: 6 }}>
              <strong>{lead.status === 'disqualified' ? 'Disqualified' : 'Lost'} reason:</strong>{' '}
              {disqualifyReasonLabel(lead.lost_reason)}
            </div>
          )}
        </LcSection>

        <div style={{ marginTop: 18, paddingTop: 8, borderTop: '1px solid #ccc', fontSize: 10, color: '#888' }}>
          A&amp;B Consulting Group · Burr Ridge, IL · abconsultingg.com
        </div>
      </div>
    </div>
  )
}

// ─── Activity timeline ───────────────────────────────────────────────────────
// The activity log is the source of truth for when a lead was last touched:
// each insert updates leads.last_activity_at and clears the stale flag.
function ActivityTimeline({
  lead, activities, loading, saving, memberName, onAdd,
}: {
  lead: Lead
  activities: Activity[]
  loading: boolean
  saving: boolean
  memberName: (id: string | null) => string | null
  onAdd: (leadId: string, type: string, summary: string, method: string) => Promise<void>
}) {
  const [type, setType] = useState<string>('call')
  const [summary, setSummary] = useState('')
  const [method, setMethod] = useState<string>('outbound')

  const canAdd = summary.trim().length > 0 && !saving

  async function submit() {
    if (!canAdd) return
    await onAdd(lead.id, type, summary.trim(), method)
    setSummary('')
  }

  const fmtWhen = (iso: string) =>
    new Date(iso).toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    })

  return (
    <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
        <label style={FIELD_LABEL}>Activity Log</label>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-muted)' }}>
          {lead.last_activity_at
            ? `last touched ${fmtWhen(lead.last_activity_at)}`
            : 'no activity logged'}
        </span>
      </div>

      {lead.is_stale && (
        <div style={{
          fontSize: 11, color: '#dc2626', fontWeight: 600, marginBottom: 8,
          padding: '6px 9px', background: '#dc262610', border: '1px solid #dc262640', borderRadius: 6,
        }}>
          🕒 Stale — logging any activity below clears this and removes the
          {lead.stale_tag ? ` "${lead.stale_tag}"` : ''} tag in ActiveCampaign.
        </div>
      )}

      {/* Quick-add bar */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'stretch' }}>
        <select
          value={type}
          onChange={e => setType(e.target.value)}
          style={{ ...FIELD_INPUT, width: 'auto', flexShrink: 0 }}
        >
          {ACTIVITY_TYPES.map(a => (
            <option key={a.id} value={a.id}>{a.icon} {a.label}</option>
          ))}
        </select>
        <select
          value={method}
          onChange={e => setMethod(e.target.value)}
          title="Direction"
          style={{ ...FIELD_INPUT, width: 'auto', flexShrink: 0 }}
        >
          <option value="outbound">Outbound</option>
          <option value="inbound">Inbound</option>
          <option value="">—</option>
        </select>
        <input
          type="text"
          value={summary}
          onChange={e => setSummary(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submit() } }}
          placeholder="What happened? e.g. Left voicemail, will try again Thursday"
          style={{ ...FIELD_INPUT, flex: 1 }}
        />
        <button
          onClick={submit}
          disabled={!canAdd}
          style={{
            flexShrink: 0, padding: '7px 14px',
            background: canAdd ? 'var(--brand-accent, #6366f1)' : 'var(--bg-sunken)',
            color: canAdd ? 'white' : 'var(--text-muted)',
            border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600,
            cursor: canAdd ? 'pointer' : 'default',
          }}
        >
          {saving ? '…' : 'Add'}
        </button>
      </div>

      {/* Feed, newest first */}
      <div style={{ marginTop: 10 }}>
        {loading && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Loading activity…</div>}
        {!loading && activities.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
            Nothing logged yet. Add the first entry above.
          </div>
        )}
        {!loading && activities.map(a => {
          const meta = activityMeta(a.activity_type)
          return (
            <div
              key={a.id}
              style={{
                display: 'flex', gap: 9, padding: '8px 0',
                borderTop: '1px solid var(--border)', fontSize: 12,
              }}
            >
              <span title={meta.label} style={{ flexShrink: 0, fontSize: 14, lineHeight: '18px' }}>
                {meta.icon}
              </span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ whiteSpace: 'pre-wrap' }}>{a.summary}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                  {meta.label}
                  {a.contact_method ? ` · ${a.contact_method}` : ''}
                  {' · '}{fmtWhen(a.created_at)}
                  {' · '}{memberName(a.created_by) || a.created_by || 'unknown'}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
