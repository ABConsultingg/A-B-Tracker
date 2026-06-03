'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { STAGES } from '@/lib/types'
import {
  CAMPAIGN_ITEMS,
  isCampaignService,
  campaignItemCost,
  type CampaignPick,
} from '@/lib/campaign-items'
import CampaignBuilderSection from '@/components/work-orders/CampaignBuilderSection'
import WoTasksTab from './WoTasksTab'
import WoMessagesTab from './WoMessagesTab'
import WoScheduleTab from './WoScheduleTab'
import WoVendorInvoicesTab from './WoVendorInvoicesTab'
import { useViewMode } from '@/lib/useViewMode'
import { DeliverablePreview } from '@/lib/deliverablePreview'
import WoFilesTab, { type WoLink } from './WoFilesTab'
import { stageView } from '@/lib/portal/stages'

type Tab =
  | 'overview'
  | 'campaign'
  | 'tasks'
  | 'messages'
  | 'files'
  | 'schedule'
  | 'vendor-invoices'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'overview',        label: 'Overview',        icon: '📋' },
  { id: 'campaign',        label: 'Campaign Items',  icon: '📣' },
  { id: 'tasks',           label: 'Tasks',           icon: '✓'  },
  { id: 'messages',        label: 'Messages',        icon: '💬' },
  { id: 'files',           label: 'Files',           icon: '📎' },
  { id: 'schedule',        label: 'Schedule',        icon: '📅' },
  { id: 'vendor-invoices', label: 'Vendor Invoices', icon: '🧾' },
]

const stageColor = (stage: string) =>
  STAGES.find(s => s.id === stage)?.color || '#94a3b8'
const stageLabel = (stage: string) =>
  STAGES.find(s => s.id === stage)?.label || stage

const PRIORITY_COLORS: Record<string, string> = {
  low:    '#94a3b8',
  medium: '#0891b2',
  high:   '#f59e0b',
  urgent: '#ef4444',
}

const money = (n: number | null | undefined) =>
  typeof n === 'number' && !Number.isNaN(n)
    ? n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
    : '—'

const fmtDate = (d: string | null | undefined) => {
  if (!d) return '—'
  try {
    return new Date(d).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    })
  } catch {
    return d
  }
}

const daysAgo = (d: string | null | undefined) => {
  if (!d) return null
  const ms = Date.now() - new Date(d).getTime()
  const days = Math.floor(ms / (1000 * 60 * 60 * 24))
  if (days < 0) return null
  if (days === 0) return 'today'
  if (days === 1) return '1 day ago'
  return `${days} days ago`
}

function BackToBoardLink() {
  const searchParams = useSearchParams()
  const from = searchParams.get('from')
  const href = from ? decodeURIComponent(from) : '/dashboard'
  return (
    <a href={href} className="hover:underline" style={{ color: 'inherit', textDecoration: 'none' }}>
      ← Back to Board
    </a>
  )
}

export default function WoDetail({
  wo,
  lineItems: initialLineItems,
  assignees,
  initialTab,
  tasks: initialTasks,
  comments: initialComments,
  team,
  authUserMap,
  currentUserId,
  schedule: initialSchedule,
  vendorInvoices,
  woLinks,
  isAdmin,
}: {
  wo: any
  lineItems: any[]
  assignees: { id: string; name: string }[]
  isAdmin: boolean
  initialTab?: string
  tasks: any[]
  comments: any[]
  team: { id: string; name: string; auth_user_id: string | null }[]
  authUserMap: Record<string, string>
  currentUserId: string | null
  schedule: any[]
  vendorInvoices: any[]
  woLinks: WoLink[]
}) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const validTab = (t: string | undefined): Tab =>
    TABS.find(x => x.id === t) ? (t as Tab) : 'overview'

  const [tab, setTab] = useState<Tab>(validTab(initialTab))
  const [lineItems, setLineItems] = useState<any[]>(initialLineItems)

  useEffect(() => {
    const urlTab = validTab(searchParams.get('tab') || undefined)
    if (urlTab !== tab) setTab(urlTab)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  const switchTab = (next: Tab) => {
    setTab(next)
    const params = new URLSearchParams(window.location.search)
    if (next === 'overview') {
      params.delete('tab')
    } else {
      params.set('tab', next)
    }
    const query = params.toString()
    router.replace(`/dashboard/wo/${wo.id}${query ? '?' + query : ''}`, { scroll: false })
  }

  const clientName = wo.clients?.name || 'Unknown client'
  const serviceName = wo.services?.name || 'Unknown service'
  const ownerName = wo.team_members?.name || 'Unassigned'
  const color = stageColor(wo.stage)
  const isCampaign = isCampaignService(wo.service_id)

  // Called by CampaignItemsTab after a successful save so Overview Costs reflect change
  const handleLineItemsUpdated = useCallback((updated: any[]) => {
    setLineItems(updated)
  }, [])

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      {/* Hero header */}
      <div
        className="border-b px-6 py-4"
        style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}
      >
        <div className="max-w-[1400px] mx-auto">
          <div className="text-sm mb-2" style={{ color: 'var(--text-muted)' }}>
            <BackToBoardLink />
          </div>

          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0 flex-1">
              <h1
                className="text-2xl font-bold mb-1"
                style={{ color: 'var(--text)' }}
              >
                {wo.title || 'Untitled work order'}
              </h1>
              <div
                className="text-sm flex items-center gap-3 flex-wrap"
                style={{ color: 'var(--text-muted)' }}
              >
                <span>
                  <strong style={{ color: 'var(--text)' }}>{clientName}</strong>
                </span>
                <span>·</span>
                <span>{serviceName}</span>
                <span>·</span>
                <span>Owner: {ownerName}</span>
                <span>·</span>
                <span style={{ fontFamily: 'monospace', fontSize: '12px' }}>
                  {wo.id}
                </span>
              </div>
            </div>

            <div
              className="px-3 py-1.5 rounded-full text-sm font-medium"
              style={{
                background: color + '22',
                color,
                border: `1px solid ${color}44`,
              }}
            >
              {stageLabel(wo.stage).toUpperCase()}
            </div>
          </div>
        </div>
      </div>

      {/* Tab nav */}
      <div
        className="border-b sticky top-0 z-10 px-6"
        style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}
      >
        <div className="max-w-[1400px] mx-auto flex gap-1 overflow-x-auto">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => switchTab(t.id)}
              className="px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors"
              style={{
                color: tab === t.id ? 'var(--text)' : 'var(--text-muted)',
                borderBottom: tab === t.id
                  ? '2px solid ' + color
                  : '2px solid transparent',
                marginBottom: '-1px',
              }}
            >
              <span className="mr-1.5">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="max-w-[1400px] mx-auto px-6 py-6">
        {tab === 'overview' && (
          <OverviewTab wo={wo} lineItems={lineItems} assignees={assignees} isAdmin={isAdmin} team={team} />
        )}
        {tab === 'campaign' && (
          isCampaign
            ? <CampaignItemsTab wo={wo} lineItems={lineItems} onUpdated={handleLineItemsUpdated} />
            : <Placeholder
                title="Campaign Items"
                note="This tab applies to Storm Response and Marketing Campaign work orders only."
              />
        )}
        {tab === 'tasks' && (
          <WoTasksTab
            wo={wo}
            initialTasks={initialTasks}
            team={team}
          />
        )}
        {tab === 'messages' && (
          <WoMessagesTab
            clientName={(wo as any).clients?.name || 'Client'}
            wo={wo}
            initialComments={initialComments}
            team={team}
            authUserMap={authUserMap}
            currentUserId={currentUserId}
          />
        )}
        {tab === 'files' && (
          <WoFilesTab
            woId={wo.id}
            initialLinks={woLinks}
            primaryLink={wo.deliverables_link || null}
            isAdmin={isAdmin}
          />
        )}
        {tab === 'schedule' && (
          <WoScheduleTab
            wo={wo}
            initialSchedule={initialSchedule}
            team={team}
          />
        )}
        {tab === 'vendor-invoices' && (
          <WoVendorInvoicesTab
            invoices={vendorInvoices}
            woId={wo.id}
          />
        )}
      </div>
    </div>
  )
}

// ============================================================
// Overview tab content (unchanged from Step 2)
// ============================================================
function OverviewTab({
  wo,
  lineItems,
  isAdmin,
  assignees,
  team,
}: {
  wo: any
  lineItems: any[]
  assignees: { id: string; name: string }[]
  isAdmin: boolean
  team: { id: string; name: string; auth_user_id: string | null }[]
}) {
  const supabaseEdit = createClient()
  const [woState, setWoState] = useState<any>(wo)
  const [stageHistory, setStageHistory] = useState<any[]>([])

  useEffect(() => {
    supabaseEdit.from('wo_stage_history')
      .select('*')
      .eq('work_order_id', wo.id)
      .order('changed_at', { ascending: false })
      .limit(20)
      .then(({ data }) => setStageHistory(data || []))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wo.id])

  const nameFor = (authId: string | null) =>
    authId ? (team.find(t => t.auth_user_id === authId)?.name || null) : null
  const [savingField, setSavingField] = useState<string | null>(null)
  const [savedField, setSavedField] = useState<string | null>(null)

  const saveField = useCallback(async (field: string, value: any, extra?: Record<string, any>) => {
    if (!isAdmin) return
    const prev = (woState as any)[field]
    const norm = typeof value === 'boolean' ? value : (value === '' ? null : value)
    if ((prev ?? '') === (norm ?? '') && !extra) return
    setSavingField(field)
    const patch: Record<string, any> = { [field]: norm, updated_at: new Date().toISOString(), ...(extra || {}) }
    setWoState((s: any) => ({ ...s, ...patch }))
    const { error } = await supabaseEdit.from('work_orders').update(patch).eq('id', wo.id)
    setSavingField(null)
    if (error) {
      setWoState((s: any) => ({ ...s, [field]: prev }))
      alert('Save failed: ' + error.message)
      return
    }
    setSavedField(field)
    setTimeout(() => setSavedField(f => (f === field ? null : f)), 1200)
  }, [isAdmin, woState, wo.id])

  const editedNum = (field: string, current: number) => (
    <span className="inline-flex items-center gap-1">
      <span style={{ color: 'var(--text-muted)' }}>$</span>
      <input type="number" step="0.01" min="0" defaultValue={current}
        onBlur={e => saveField(field, e.target.value === '' ? 0 : Number(e.target.value))}
        className="w-24 text-right rounded border px-2 py-0.5 text-sm"
        style={{ background: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text)' }} />
      {savingField === field && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>…</span>}
      {savedField === field && <span style={{ fontSize: 10, color: '#15803d' }}>✓</span>}
    </span>
  )
  const editedText = (field: string, current: string, placeholder = '') => (
    <span className="inline-flex items-center gap-1">
      <input type="text" defaultValue={current || ''} placeholder={placeholder}
        onBlur={e => saveField(field, e.target.value.trim())}
        className="w-40 text-right rounded border px-2 py-0.5 text-sm"
        style={{ background: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text)' }} />
      {savingField === field && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>…</span>}
      {savedField === field && <span style={{ fontSize: 10, color: '#15803d' }}>✓</span>}
    </span>
  )

  const lineItemsTotal = (lineItems || []).reduce(
    (sum, li) => sum + (Number(li.total) || 0), 0
  )
  const estCost = Number(wo.est_cost) || 0
  const addCost = Number(wo.add_cost) || 0
  const [viewMode] = useViewMode(isAdmin)
  const showCosts = viewMode === 'admin'
  const hiddenMoney = '—'
  const adSpend = Number(wo.ad_spend) || 0
  const grandTotal = estCost + addCost + adSpend + lineItemsTotal

  const priorityColor = PRIORITY_COLORS[wo.priority] || '#94a3b8'

  return (
    <div className="grid gap-4">
      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
        <Card title="💰 Costs">
          <Row label="Est. cost"    value={showCosts ? (isAdmin ? editedNum('est_cost', Number(woState.est_cost) || 0) : money(estCost)) : hiddenMoney} />
          <Row label="Add-on cost"  value={showCosts ? (isAdmin ? editedNum('add_cost', Number(woState.add_cost) || 0) : money(addCost)) : hiddenMoney} />
          <Row label="Ad spend"     value={showCosts ? (isAdmin ? editedNum('ad_spend', Number(woState.ad_spend) || 0) : money(adSpend)) : hiddenMoney} />
          <Row label="Line items"   value={showCosts ? money(lineItemsTotal) : hiddenMoney} sub={`${lineItems?.length || 0} item${lineItems?.length === 1 ? '' : 's'}`} />
          <div style={{ borderTop: '1px solid var(--border)', marginTop: 8, paddingTop: 8 }}>
            <Row label="Total" value={showCosts ? money(grandTotal) : hiddenMoney} bold />
          </div>
        </Card>

        <Card title="📅 Dates">
          <Row label="Submitted"      value={fmtDate(wo.submitted_at || wo.created_at)} sub={daysAgo(wo.submitted_at || wo.created_at) || undefined} />
          <Row label="Due"            value={isAdmin ? (
            <span className="inline-flex items-center gap-1">
              <input type="date" defaultValue={woState.due_date || ''}
                onChange={e => saveField('due_date', e.target.value)}
                className="rounded border px-2 py-0.5 text-sm"
                style={{ background: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text)' }} />
              {savingField === 'due_date' && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>…</span>}
              {savedField === 'due_date' && <span style={{ fontSize: 10, color: '#15803d' }}>✓</span>}
            </span>
          ) : fmtDate(wo.due_date)} />
          <Row label="Stage entered"  value={fmtDate(wo.stage_entered_at)} sub={daysAgo(wo.stage_entered_at) || undefined} />
          <Row label="Last updated"   value={fmtDate(wo.updated_at)} sub={daysAgo(wo.updated_at) || undefined} />
        </Card>

        <Card title="🏷️ Status">
          <Row label="Stage" value={isAdmin ? (
            <select defaultValue={woState.stage}
              onChange={e => saveField('stage', e.target.value, { stage_entered_at: new Date().toISOString() })}
              className="rounded border px-2 py-0.5 text-sm"
              style={{ background: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text)' }}>
              {STAGES.map((s: any) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          ) : (
            <span style={{ padding: '2px 8px', borderRadius: 999, background: stageColor(wo.stage) + '22', color: stageColor(wo.stage), fontSize: 12, fontWeight: 500 }}>
              {stageLabel(wo.stage)}
            </span>
          )} />
          <Row label="Priority" value={isAdmin ? (
            <select defaultValue={woState.priority || 'medium'}
              onChange={e => saveField('priority', e.target.value)}
              className="rounded border px-2 py-0.5 text-sm capitalize"
              style={{ background: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text)' }}>
              {['low','medium','high','urgent'].map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          ) : (
            <span style={{ padding: '2px 8px', borderRadius: 999, background: priorityColor + '22', color: priorityColor, fontSize: 12, fontWeight: 500, textTransform: 'capitalize' }}>
              {wo.priority || 'medium'}
            </span>
          )} />
          <Row label="Occurrence" value={isAdmin ? (
            <select defaultValue={woState.occurrence || 'One-time'}
              onChange={e => saveField('occurrence', e.target.value)}
              className="rounded border px-2 py-0.5 text-sm"
              style={{ background: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text)' }}>
              {['One-time','Recurring','Quarterly','Weekly'].map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          ) : (woState.occurrence || '—')} />
          <Row label="Flagged" value={isAdmin ? (
            <label className="inline-flex items-center gap-2 text-sm" style={{ color: 'var(--text)' }}>
              <input type="checkbox" checked={!!woState.flagged}
                onChange={e => saveField('flagged', e.target.checked)} />
              {woState.flagged ? '🚩 Yes' : 'No'}
            </label>
          ) : (wo.flagged ? '🚩 Yes' : '—')} />
          <Row label="Issue" value={isAdmin ? editedText('issue', woState.issue, 'none') : (wo.issue || '—')} />
        </Card>
      </div>

      <Card title="👥 People">
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          <div>
            <div className="text-xs uppercase mb-1" style={{ color: 'var(--text-muted)' }}>Owner</div>
            {isAdmin ? (
              <select defaultValue={woState.owner_id || ''}
                onChange={e => saveField('owner_id', e.target.value || null)}
                className="rounded border px-2 py-1 text-sm"
                style={{ background: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text)' }}>
                <option value="">Unassigned</option>
                {team.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            ) : (
              <div style={{ color: 'var(--text)', fontWeight: 500 }}>{wo.team_members?.name || 'Unassigned'}</div>
            )}
          </div>
          <div>
            <div className="text-xs uppercase mb-1" style={{ color: 'var(--text-muted)' }}>Assignees</div>
            {assignees.length === 0 ? (
              <div style={{ color: 'var(--text-muted)' }}>None</div>
            ) : (
              <div className="flex flex-wrap gap-1">
                {assignees.map(a => (
                  <span
                    key={a.id}
                    style={{
                      padding: '2px 8px',
                      borderRadius: 999,
                      background: 'var(--bg-sunken, #f1f5f9)',
                      color: 'var(--text)',
                      fontSize: 12,
                    }}
                  >
                    {a.name}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div>
            <div className="text-xs uppercase mb-1" style={{ color: 'var(--text-muted)' }}>Branch / Location</div>
            {isAdmin ? (
              <input type="text" defaultValue={woState.branch || ''} placeholder="—"
                onBlur={e => saveField('branch', e.target.value.trim())}
                className="w-full rounded border px-2 py-1 text-sm"
                style={{ background: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text)' }} />
            ) : (<div style={{ color: 'var(--text)' }}>{wo.branch || '—'}</div>)}
          </div>
          <div>
            <div className="text-xs uppercase mb-1" style={{ color: 'var(--text-muted)' }}>Vendor</div>
            {isAdmin ? (
              <input type="text" defaultValue={woState.vendor || ''} placeholder="—"
                onBlur={e => saveField('vendor', e.target.value.trim())}
                className="w-full rounded border px-2 py-1 text-sm"
                style={{ background: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text)' }} />
            ) : (<div style={{ color: 'var(--text)' }}>{wo.vendor || '—'}</div>)}
          </div>
          <div>
            <div className="text-xs uppercase mb-1" style={{ color: 'var(--text-muted)' }}>Manufacturer</div>
            {isAdmin ? (
              <input type="text" defaultValue={woState.manufacturer || ''} placeholder="—"
                onBlur={e => saveField('manufacturer', e.target.value.trim())}
                className="w-full rounded border px-2 py-1 text-sm"
                style={{ background: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text)' }} />
            ) : (<div style={{ color: 'var(--text)' }}>{wo.manufacturer || '—'}</div>)}
          </div>
        </div>
      </Card>

      <Card title="📝 Notes">
        {isAdmin ? (
          <textarea defaultValue={woState.notes || ''} rows={4}
            placeholder="Add notes about this work order…"
            onBlur={e => saveField('notes', e.target.value)}
            className="w-full rounded border px-3 py-2 text-sm"
            style={{ background: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text)', lineHeight: 1.5, resize: 'vertical' }} />
        ) : wo.notes ? (
          <div style={{ color: 'var(--text)', whiteSpace: 'pre-wrap', lineHeight: 1.5, fontSize: 14 }}>{wo.notes}</div>
        ) : wo.description ? (
          <div style={{ color: 'var(--text)', whiteSpace: 'pre-wrap', lineHeight: 1.5, fontSize: 14 }}>{wo.description}</div>
        ) : (
          <div style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No notes yet.</div>
        )}
      </Card>

      <Card title="🔗 Links">
        <Row label="Deliverables" value={isAdmin ? (
          <span className="inline-flex items-center gap-2">
            <input type="url" defaultValue={woState.deliverables_link || ''} placeholder="https://…"
              onBlur={e => saveField('deliverables_link', e.target.value.trim())}
              className="w-56 rounded border px-2 py-0.5 text-sm"
              style={{ background: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text)' }} />
            {woState.deliverables_link && (
              <a href={woState.deliverables_link} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent, #6366f1)' }}>↗</a>
            )}
          </span>
        ) : (woState.deliverables_link ? (
          <a href={woState.deliverables_link} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent, #6366f1)' }}>Open ↗</a>
        ) : '—')} />
        <Row label="Notes link" value={isAdmin ? (
          <span className="inline-flex items-center gap-2">
            <input type="url" defaultValue={woState.notes_link || ''} placeholder="https://…"
              onBlur={e => saveField('notes_link', e.target.value.trim())}
              className="w-56 rounded border px-2 py-0.5 text-sm"
              style={{ background: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text)' }} />
            {woState.notes_link && (
              <a href={woState.notes_link} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent, #6366f1)' }}>↗</a>
            )}
          </span>
        ) : (woState.notes_link ? (
          <a href={woState.notes_link} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent, #6366f1)' }}>Open ↗</a>
        ) : '—')} />
      </Card>

      {woState.deliverables_link && (
        <Card title="🖼 Deliverable preview">
          <DeliverablePreview link={woState.deliverables_link} label={woState.title || 'Deliverable'} />
        </Card>
      )}

      <Card title={`🕘 Stage History${stageHistory.length ? ` (${stageHistory.length})` : ''}`}>
        {stageHistory.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic' }}>
            No stage changes recorded yet. Change the stage to start tracking.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {stageHistory.map(entry => {
              const to = stageView(entry.to_stage)
              const byName = nameFor(entry.changed_by)
              const d = new Date(entry.changed_at)
              return (
                <div key={entry.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', marginTop: 6,
                                 flexShrink: 0, background: to.dot }} />
                  <div style={{ color: 'var(--text)', lineHeight: 1.5 }}>
                    <span style={{ color: 'var(--text-muted)' }}>Moved to </span>
                    <span style={{ fontWeight: 600, color: to.color }}>{to.label}</span>
                    <span style={{ color: 'var(--text-muted)' }}> on </span>
                    {d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' })}
                    <span style={{ color: 'var(--text-muted)' }}> at </span>
                    {d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                    {byName && (
                      <>
                        <span style={{ color: 'var(--text-muted)' }}> by </span>
                        <span style={{ fontWeight: 500 }}>{byName}</span>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>
    </div>
  )
}

// ============================================================
// Campaign Items tab — full round-trip
// ============================================================
function CampaignItemsTab({
  wo,
  lineItems,
  onUpdated,
}: {
  wo: any
  lineItems: any[]
  onUpdated: (updated: any[]) => void
}) {
  // Pre-populate picks from existing campaign-sourced line items
  const initialPicks: CampaignPick[] = (lineItems || [])
    .filter(li => li.source === 'campaign' && li.campaign_item_id)
    .map(li => {
      const item = CAMPAIGN_ITEMS.find(i => i.id === li.campaign_item_id)
      const isOverride = item && Math.abs(Number(li.unit_price) - item.price) > 0.001
      return {
        id: li.campaign_item_id,
        qty: Number(li.qty) || 1,
        ...(isOverride ? { unitPrice: Number(li.unit_price) } : {}),
      }
    })

  const [picks, setPicks] = useState<CampaignPick[]>(initialPicks)
  const [title, setTitle] = useState<string>('')
  const [duration, setDuration] = useState<{ value: string; unit: 'days' | 'weeks' | 'months' }>(
    { value: '', unit: 'weeks' }
  )
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Mark dirty when picks change after initial mount
  useEffect(() => {
    setDirty(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picks])

  // Don't mark dirty on first render
  const [hasMounted, setHasMounted] = useState(false)
  useEffect(() => {
    setHasMounted(true)
    setDirty(false)
  }, [])

  async function handleSave() {
    if (!hasMounted) return
    setSaving(true)
    setError(null)
    const supabase = createClient()

    // 1. Delete all existing campaign-sourced line items for this WO
    const { error: delErr } = await supabase
      .from('wo_line_items')
      .delete()
      .eq('work_order_id', wo.id)
      .eq('source', 'campaign')

    if (delErr) {
      setError('Delete failed: ' + delErr.message)
      setSaving(false)
      return
    }

    // 2. Insert fresh rows for current picks
    if (picks.length > 0) {
      const rows = picks
        .map(pick => {
          const item = CAMPAIGN_ITEMS.find(i => i.id === pick.id)
          if (!item) return null
          const unitPrice = typeof pick.unitPrice === 'number' ? pick.unitPrice : item.price
          const qty = (item.pricing === 'per_unit' || item.pricing === 'monthly') ? pick.qty : 1
          const sortOrder = CAMPAIGN_ITEMS.findIndex(i => i.id === pick.id)
          return {
            work_order_id: wo.id,
            description: item.name,
            qty,
            unit_price: unitPrice,
            sort_order: sortOrder,
            source: 'campaign',
            campaign_item_id: item.id,
          }
        })
        .filter((r): r is NonNullable<typeof r> => r !== null)

      if (rows.length > 0) {
        const { error: insErr } = await supabase
          .from('wo_line_items')
          .insert(rows)
        if (insErr) {
          setError('Insert failed: ' + insErr.message)
          setSaving(false)
          return
        }
      }
    }

    // 3. Reload line items so Overview Costs reflect the new state
    const { data: refreshed } = await supabase
      .from('wo_line_items')
      .select('id, description, qty, unit_price, total, sort_order, source, campaign_item_id')
      .eq('work_order_id', wo.id)
      .order('sort_order', { ascending: true })

    onUpdated(refreshed || [])
    setLastSavedAt(new Date())
    setDirty(false)
    setSaving(false)
  }

  const campaignTotal = picks.reduce((sum, p) => {
    const item = CAMPAIGN_ITEMS.find(i => i.id === p.id)
    if (!item) return sum
    return sum + campaignItemCost(item, p.qty, p.unitPrice)
  }, 0)

  return (
    <div className="grid gap-4">
      <div
        className="rounded-lg border p-4 flex items-center justify-between"
        style={{
          background: 'var(--bg-elevated)',
          borderColor: 'var(--border)',
        }}
      >
        <div>
          <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
            Campaign items for this work order
          </div>
          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Picks are saved as line items with <code>source = 'campaign'</code>.
            Adding/removing items here updates the regular Line Items list too.
          </div>
        </div>

        <div className="flex items-center gap-3">
          {dirty && (
            <span className="text-xs" style={{ color: '#f59e0b' }}>
              Unsaved changes
            </span>
          )}
          {lastSavedAt && !dirty && (
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Saved {lastSavedAt.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={saving || !dirty}
            className="px-4 py-2 rounded-md text-sm font-medium"
            style={{
              background: dirty ? '#f59e0b' : 'var(--bg-sunken, #e2e8f0)',
              color: dirty ? '#fff' : 'var(--text-muted)',
              opacity: saving ? 0.6 : 1,
              cursor: saving || !dirty ? 'not-allowed' : 'pointer',
              border: 'none',
            }}
          >
            {saving ? 'Saving…' : 'Save campaign items'}
          </button>
        </div>
      </div>

      {error && (
        <div
          className="rounded-md border p-3 text-sm"
          style={{
            background: '#fef2f2',
            borderColor: '#fecaca',
            color: '#991b1b',
          }}
        >
          {error}
        </div>
      )}

      <CampaignBuilderSection
        serviceId={wo.service_id}
        picks={picks}
        onChange={setPicks}
        title={title}
        onTitleChange={setTitle}
        duration={duration}
        onDurationChange={setDuration}
      />

      <div className="text-xs text-center" style={{ color: 'var(--text-muted)' }}>
        Total: <strong style={{ color: 'var(--text)' }}>{money(campaignTotal)}</strong>
        {' · '}
        {picks.length} item{picks.length === 1 ? '' : 's'} selected
      </div>
    </div>
  )
}

// ============================================================
// Tiny reusable bits
// ============================================================
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="rounded-lg border p-4"
      style={{
        background: 'var(--bg-elevated)',
        borderColor: 'var(--border)',
      }}
    >
      <div
        className="text-sm font-semibold mb-3"
        style={{ color: 'var(--text)' }}
      >
        {title}
      </div>
      <div className="grid gap-2">{children}</div>
    </div>
  )
}

function Row({
  label,
  value,
  sub,
  bold,
}: {
  label: string
  value: React.ReactNode
  sub?: string
  bold?: boolean
}) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <div style={{ color: 'var(--text-muted)' }}>{label}</div>
      <div className="text-right">
        <div style={{ color: 'var(--text)', fontWeight: bold ? 700 : 400 }}>
          {value}
        </div>
        {sub && (
          <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>{sub}</div>
        )}
      </div>
    </div>
  )
}

function Placeholder({ title, note }: { title: string; note: string }) {
  return (
    <div
      className="rounded-lg border p-8 text-center"
      style={{
        background: 'var(--bg-elevated)',
        borderColor: 'var(--border)',
        color: 'var(--text-muted)',
      }}
    >
      <div className="text-lg font-medium mb-2" style={{ color: 'var(--text)' }}>
        {title}
      </div>
      <div className="text-sm">{note}</div>
    </div>
  )
}
