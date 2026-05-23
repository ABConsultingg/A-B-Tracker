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
}: {
  wo: any
  lineItems: any[]
  assignees: { id: string; name: string }[]
  initialTab?: string
  tasks: any[]
  comments: any[]
  team: { id: string; name: string; auth_user_id: string | null }[]
  authUserMap: Record<string, string>
  currentUserId: string | null
  schedule: any[]
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
            <Link href="/dashboard" className="hover:underline">
              ← Back to Board
            </Link>
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
          <OverviewTab wo={wo} lineItems={lineItems} assignees={assignees} />
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
            wo={wo}
            initialComments={initialComments}
            team={team}
            authUserMap={authUserMap}
            currentUserId={currentUserId}
          />
        )}
        {tab === 'files' && (
          <Placeholder
            title="Files"
            note="URL list for v1. Per-WO folder + uploads come with the portal in Phase 2."
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
          <Placeholder
            title="Vendor Invoices"
            note="Accurate Printing PDFs (internal-only, no cost math). Apps Script → Supabase wiring in Session 11."
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
  assignees,
}: {
  wo: any
  lineItems: any[]
  assignees: { id: string; name: string }[]
}) {
  const lineItemsTotal = (lineItems || []).reduce(
    (sum, li) => sum + (Number(li.total) || 0), 0
  )
  const estCost = Number(wo.est_cost) || 0
  const addCost = Number(wo.add_cost) || 0
  const adSpend = Number(wo.ad_spend) || 0
  const grandTotal = estCost + addCost + adSpend + lineItemsTotal

  const priorityColor = PRIORITY_COLORS[wo.priority] || '#94a3b8'

  return (
    <div className="grid gap-4">
      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
        <Card title="💰 Costs">
          <Row label="Est. cost"    value={money(estCost)} />
          <Row label="Add-on cost"  value={money(addCost)} />
          <Row label="Ad spend"     value={money(adSpend)} />
          <Row label="Line items"   value={money(lineItemsTotal)} sub={`${lineItems?.length || 0} item${lineItems?.length === 1 ? '' : 's'}`} />
          <div style={{ borderTop: '1px solid var(--border)', marginTop: 8, paddingTop: 8 }}>
            <Row label="Total" value={money(grandTotal)} bold />
          </div>
        </Card>

        <Card title="📅 Dates">
          <Row label="Submitted"      value={fmtDate(wo.submitted_at || wo.created_at)} sub={daysAgo(wo.submitted_at || wo.created_at) || undefined} />
          <Row label="Due"            value={fmtDate(wo.due_date)} />
          <Row label="Stage entered"  value={fmtDate(wo.stage_entered_at)} sub={daysAgo(wo.stage_entered_at) || undefined} />
          <Row label="Last updated"   value={fmtDate(wo.updated_at)} sub={daysAgo(wo.updated_at) || undefined} />
        </Card>

        <Card title="🏷️ Status">
          <Row label="Stage" value={
            <span style={{
              padding: '2px 8px',
              borderRadius: 999,
              background: stageColor(wo.stage) + '22',
              color: stageColor(wo.stage),
              fontSize: 12,
              fontWeight: 500,
            }}>
              {stageLabel(wo.stage)}
            </span>
          } />
          <Row label="Priority" value={
            <span style={{
              padding: '2px 8px',
              borderRadius: 999,
              background: priorityColor + '22',
              color: priorityColor,
              fontSize: 12,
              fontWeight: 500,
              textTransform: 'capitalize',
            }}>
              {wo.priority || 'medium'}
            </span>
          } />
          <Row label="Occurrence" value={wo.occurrence || '—'} />
          <Row label="Flagged" value={wo.flagged ? '🚩 Yes' : '—'} />
          {wo.issue && <Row label="Issue" value={wo.issue} />}
        </Card>
      </div>

      <Card title="👥 People">
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          <div>
            <div className="text-xs uppercase mb-1" style={{ color: 'var(--text-muted)' }}>Owner</div>
            <div style={{ color: 'var(--text)', fontWeight: 500 }}>
              {wo.team_members?.name || 'Unassigned'}
            </div>
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
            <div style={{ color: 'var(--text)' }}>{wo.branch || '—'}</div>
          </div>
          <div>
            <div className="text-xs uppercase mb-1" style={{ color: 'var(--text-muted)' }}>Vendor</div>
            <div style={{ color: 'var(--text)' }}>{wo.vendor || '—'}</div>
          </div>
        </div>
      </Card>

      <Card title="📝 Notes">
        {wo.notes ? (
          <div style={{ color: 'var(--text)', whiteSpace: 'pre-wrap', lineHeight: 1.5, fontSize: 14 }}>
            {wo.notes}
          </div>
        ) : wo.description ? (
          <div style={{ color: 'var(--text)', whiteSpace: 'pre-wrap', lineHeight: 1.5, fontSize: 14 }}>
            {wo.description}
          </div>
        ) : (
          <div style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
            No notes yet. Edit this work order from the board drawer to add notes.
          </div>
        )}
      </Card>

      {(wo.deliverables_link || wo.notes_link) && (
        <Card title="🔗 Links">
          {wo.deliverables_link && (
            <Row label="Deliverables" value={
              <a href={wo.deliverables_link} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent, #6366f1)' }}>
                Open ↗
              </a>
            } />
          )}
          {wo.notes_link && (
            <Row label="Notes link" value={
              <a href={wo.notes_link} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent, #6366f1)' }}>
                Open ↗
              </a>
            } />
          )}
        </Card>
      )}

      <div className="text-xs text-center mt-2" style={{ color: 'var(--text-muted)' }}>
        Editing still happens in the board drawer. Full-page editing is coming in a later step.
      </div>
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
