'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { STAGES } from '@/lib/types'

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
  lineItems,
  assignees,
  initialTab,
}: {
  wo: any
  lineItems: any[]
  assignees: { id: string; name: string }[]
  initialTab?: string
}) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const validTab = (t: string | undefined): Tab =>
    TABS.find(x => x.id === t) ? (t as Tab) : 'overview'

  const [tab, setTab] = useState<Tab>(validTab(initialTab))

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
          <Placeholder
            title="Campaign Items"
            note="The campaign builder will move here with a full 5-column grid. Coming in Step 3."
          />
        )}
        {tab === 'tasks' && (
          <Placeholder
            title="Tasks"
            note="Lifting the tasks UI out of the drawer into this tab. Coming in Step 5."
          />
        )}
        {tab === 'messages' && (
          <Placeholder
            title="Messages"
            note="Comments + @mentions get a proper home here. Coming in Step 5."
          />
        )}
        {tab === 'files' && (
          <Placeholder
            title="Files"
            note="URL list for v1. Per-WO folder + uploads come with the portal in Phase 2."
          />
        )}
        {tab === 'schedule' && (
          <Placeholder
            title="Schedule"
            note="Execution dates + Google Calendar sync. Session 11."
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
// Overview tab content
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
      {/* Top row — 3 summary cards */}
      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
        {/* Costs */}
        <Card title="💰 Costs">
          <Row label="Est. cost"    value={money(estCost)} />
          <Row label="Add-on cost"  value={money(addCost)} />
          <Row label="Ad spend"     value={money(adSpend)} />
          <Row label="Line items"   value={money(lineItemsTotal)} sub={`${lineItems?.length || 0} item${lineItems?.length === 1 ? '' : 's'}`} />
          <div style={{ borderTop: '1px solid var(--border)', marginTop: 8, paddingTop: 8 }}>
            <Row label="Total" value={money(grandTotal)} bold />
          </div>
        </Card>

        {/* Dates */}
        <Card title="📅 Dates">
          <Row label="Submitted"      value={fmtDate(wo.submitted_at || wo.created_at)} sub={daysAgo(wo.submitted_at || wo.created_at) || undefined} />
          <Row label="Due"            value={fmtDate(wo.due_date)} />
          <Row label="Stage entered"  value={fmtDate(wo.stage_entered_at)} sub={daysAgo(wo.stage_entered_at) || undefined} />
          <Row label="Last updated"   value={fmtDate(wo.updated_at)} sub={daysAgo(wo.updated_at) || undefined} />
        </Card>

        {/* Status */}
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

      {/* People */}
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

      {/* Notes / Description */}
      <Card title="📝 Notes">
        {wo.notes ? (
          <div
            style={{
              color: 'var(--text)',
              whiteSpace: 'pre-wrap',
              lineHeight: 1.5,
              fontSize: 14,
            }}
          >
            {wo.notes}
          </div>
        ) : wo.description ? (
          <div
            style={{
              color: 'var(--text)',
              whiteSpace: 'pre-wrap',
              lineHeight: 1.5,
              fontSize: 14,
            }}
          >
            {wo.description}
          </div>
        ) : (
          <div style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
            No notes yet. Edit this work order from the board drawer to add notes.
          </div>
        )}
      </Card>

      {/* Links */}
      {(wo.deliverables_link || wo.notes_link) && (
        <Card title="🔗 Links">
          {wo.deliverables_link && (
            <Row
              label="Deliverables"
              value={
                <a
                  href={wo.deliverables_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: 'var(--accent, #6366f1)' }}
                >
                  Open ↗
                </a>
              }
            />
          )}
          {wo.notes_link && (
            <Row
              label="Notes link"
              value={
                <a
                  href={wo.notes_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: 'var(--accent, #6366f1)' }}
                >
                  Open ↗
                </a>
              }
            />
          )}
        </Card>
      )}

      <div
        className="text-xs text-center mt-2"
        style={{ color: 'var(--text-muted)' }}
      >
        Editing still happens in the board drawer. Full-page editing is coming in a later step.
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
        <div
          style={{
            color: 'var(--text)',
            fontWeight: bold ? 700 : 400,
          }}
        >
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
