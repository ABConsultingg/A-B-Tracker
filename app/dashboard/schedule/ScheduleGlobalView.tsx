'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

const SCHEDULE_TYPES = [
  { id: 'email',       label: 'Email blast',     icon: '📧' },
  { id: 'mailer',      label: 'Mailer drop',     icon: '📬' },
  { id: 'social-post', label: 'Social post',     icon: '📱' },
  { id: 'social-ad',   label: 'Social ad start', icon: '📣' },
  { id: 'google-ad',   label: 'Google ad start', icon: '🔍' },
  { id: 'meeting',     label: 'Meeting/call',    icon: '👥' },
  { id: 'launch',      label: 'Go-live/launch',  icon: '🚀' },
  { id: 'other',       label: 'Other',           icon: '◆' },
] as const

type Row = {
  id: string
  work_order_id: string
  scheduled_date: string
  scheduled_time: string | null
  type: string
  title: string | null
  owner_id: string | null
  status: string
  sort_order: number
  calendar_synced: boolean
  google_event_id: string | null
  wo_title: string | null
  client_id: string | null
  client_name: string | null
}

type TeamMember = { id: string; name: string }
type ClientLite = { id: string; name: string }

const todayISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function effectiveStatus(row: Row): 'scheduled' | 'sent' | 'cancelled' | 'past_due' {
  if (row.status === 'sent') return 'sent'
  if (row.status === 'cancelled') return 'cancelled'
  if (row.scheduled_date < todayISO()) return 'past_due'
  return 'scheduled'
}

function statusPill(status: ReturnType<typeof effectiveStatus>) {
  switch (status) {
    case 'sent':      return { bg: '#dcfce7', fg: '#166534', label: '✓ Sent' }
    case 'past_due':  return { bg: '#fee2e2', fg: '#991b1b', label: '⚠ Past due' }
    case 'cancelled': return { bg: '#f3f4f6', fg: '#6b7280', label: 'Cancelled' }
    default:          return { bg: '#fef3c7', fg: '#92400e', label: 'Scheduled' }
  }
}

function typeMeta(id: string) {
  return SCHEDULE_TYPES.find(t => t.id === id) || SCHEDULE_TYPES[7]
}

function fmtDate(iso: string) {
  try {
    const d = new Date(iso + 'T00:00:00')
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  } catch {
    return iso
  }
}

function fmtTime(t: string | null) {
  if (!t) return ''
  const [hh, mm] = t.split(':')
  const h = parseInt(hh, 10)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${mm} ${ampm}`
}

// Get Monday and Sunday of current week (Mon-Sun convention)
function weekBounds(): { start: string; end: string } {
  const d = new Date()
  const day = d.getDay() // 0=Sun, 1=Mon, ...
  const mondayOffset = day === 0 ? -6 : 1 - day
  const start = new Date(d)
  start.setDate(d.getDate() + mondayOffset)
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  const toISO = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
  return { start: toISO(start), end: toISO(end) }
}

// Timeline filter options
type TimelineFilter = 'this_week' | 'next_30' | 'past_30' | 'this_month' | 'all'

function timelineBounds(t: TimelineFilter): { start: string | null; end: string | null } {
  const today = new Date()
  const toISO = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`

  switch (t) {
    case 'this_week':
      return weekBounds()
    case 'next_30': {
      const end = new Date(today); end.setDate(today.getDate() + 30)
      return { start: toISO(today), end: toISO(end) }
    }
    case 'past_30': {
      const start = new Date(today); start.setDate(today.getDate() - 30)
      return { start: toISO(start), end: toISO(today) }
    }
    case 'this_month': {
      const start = new Date(today.getFullYear(), today.getMonth(), 1)
      const end = new Date(today.getFullYear(), today.getMonth() + 1, 0)
      return { start: toISO(start), end: toISO(end) }
    }
    case 'all':
      return { start: null, end: null }
  }
}

export default function ScheduleGlobalView({
  rows,
  team,
  clients,
}: {
  rows: Row[]
  team: TeamMember[]
  clients: ClientLite[]
}) {
  const router = useRouter()
  const teamById: Record<string, string> = Object.fromEntries(team.map(t => [t.id, t.name]))

  // Filters
  const [timeline, setTimeline] = useState<TimelineFilter>('this_week')
  const [clientId, setClientId] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [typeFilter, setTypeFilter] = useState<string>('')
  const [ownerFilter, setOwnerFilter] = useState<string>('')

  // THIS WEEK rows — never affected by filters
  const thisWeekRows = useMemo(() => {
    const { start, end } = weekBounds()
    return rows.filter(r => r.scheduled_date >= start && r.scheduled_date <= end)
  }, [rows])

  // Filtered rows for ALL SCHEDULE panel
  const filteredRows = useMemo(() => {
    const { start, end } = timelineBounds(timeline)
    return rows.filter(r => {
      if (start && r.scheduled_date < start) return false
      if (end && r.scheduled_date > end) return false
      if (clientId && r.client_id !== clientId) return false
      if (typeFilter && r.type !== typeFilter) return false
      if (ownerFilter && r.owner_id !== ownerFilter) return false
      if (statusFilter) {
        const eff = effectiveStatus(r)
        if (statusFilter === 'past_due' && eff !== 'past_due') return false
        if (statusFilter !== 'past_due' && r.status !== statusFilter) return false
      }
      return true
    })
  }, [rows, timeline, clientId, statusFilter, typeFilter, ownerFilter])

  // Counts for header
  const counts = useMemo(() => {
    let scheduled = 0, sent = 0, pastDue = 0, cancelled = 0
    thisWeekRows.forEach(r => {
      const eff = effectiveStatus(r)
      if (eff === 'sent') sent++
      else if (eff === 'past_due') pastDue++
      else if (eff === 'cancelled') cancelled++
      else scheduled++
    })
    return { scheduled, sent, pastDue, cancelled }
  }, [thisWeekRows])

  function openRow(r: Row) {
    router.push(`/dashboard/wo/${r.work_order_id}?tab=schedule&highlight=${r.id}`)
  }

  return (
    <div className="p-6 max-w-screen-2xl mx-auto space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-3xl font-bold" style={{ fontFamily: 'Fraunces, serif' }}>
          📅 Execution Schedule
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          What is going out across all clients and work orders, all in one place.
        </p>
      </div>

      {/* THIS WEEK summary chips */}
      <div className="flex flex-wrap gap-2 text-xs">
        <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 font-semibold">
          🟡 {counts.scheduled} scheduled
        </span>
        <span className="px-2.5 py-1 rounded-full bg-green-100 text-green-800 font-semibold">
          🟢 {counts.sent} sent
        </span>
        {counts.pastDue > 0 && (
          <span className="px-2.5 py-1 rounded-full bg-red-100 text-red-800 font-semibold">
            🔴 {counts.pastDue} past due
          </span>
        )}
        {counts.cancelled > 0 && (
          <span className="px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 font-semibold">
            ⚫ {counts.cancelled} cancelled
          </span>
        )}
        <span className="px-2.5 py-1 rounded-full bg-gray-50 text-gray-500">
          this week
        </span>
      </div>

      {/* THIS WEEK panel */}
      <section className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">
              This Week
            </h2>
            <div className="text-xs text-gray-500 mt-0.5">
              {thisWeekRows.length} {thisWeekRows.length === 1 ? 'item' : 'items'} from {fmtDate(weekBounds().start)} to {fmtDate(weekBounds().end)}
            </div>
          </div>
        </div>
        {thisWeekRows.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-gray-400">
            Nothing scheduled this week.
          </div>
        ) : (
          <ScheduleTable rows={thisWeekRows} teamById={teamById} onRowClick={openRow} />
        )}
      </section>

      {/* ALL SCHEDULE panel */}
      <section className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
          <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">
            All Schedule
          </h2>
          <div className="text-xs text-gray-500 mt-0.5">
            Filter to find any scheduled item across all work orders.
          </div>
        </div>

        {/* Filters bar */}
        <div className="px-4 py-3 border-b border-gray-200 bg-white flex flex-wrap gap-3 items-center text-xs">
          <FilterDropdown
            label="Timeline"
            value={timeline}
            onChange={v => setTimeline(v as TimelineFilter)}
            options={[
              { value: 'this_week',  label: 'This week' },
              { value: 'this_month', label: 'This month' },
              { value: 'next_30',    label: 'Next 30 days' },
              { value: 'past_30',    label: 'Past 30 days' },
              { value: 'all',        label: 'All time' },
            ]}
          />
          <FilterDropdown
            label="Client"
            value={clientId}
            onChange={setClientId}
            options={[
              { value: '', label: 'All clients' },
              ...clients.map(c => ({ value: c.id, label: c.name })),
            ]}
          />
          <FilterDropdown
            label="Status"
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: '',          label: 'All statuses' },
              { value: 'scheduled', label: 'Scheduled' },
              { value: 'sent',      label: 'Sent' },
              { value: 'past_due',  label: 'Past due' },
              { value: 'cancelled', label: 'Cancelled' },
            ]}
          />
          <FilterDropdown
            label="Type"
            value={typeFilter}
            onChange={setTypeFilter}
            options={[
              { value: '', label: 'All types' },
              ...SCHEDULE_TYPES.map(t => ({ value: t.id, label: `${t.icon} ${t.label}` })),
            ]}
          />
          <FilterDropdown
            label="Owner"
            value={ownerFilter}
            onChange={setOwnerFilter}
            options={[
              { value: '', label: 'All owners' },
              ...team.map(t => ({ value: t.id, label: t.name })),
            ]}
          />
          {(timeline !== 'this_week' || clientId || statusFilter || typeFilter || ownerFilter) && (
            <button
              onClick={() => {
                setTimeline('this_week')
                setClientId('')
                setStatusFilter('')
                setTypeFilter('')
                setOwnerFilter('')
              }}
              className="ml-auto text-xs text-gray-500 hover:text-gray-700 underline"
            >
              Reset filters
            </button>
          )}
        </div>

        {filteredRows.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-gray-400">
            No scheduled dates match these filters.
          </div>
        ) : (
          <ScheduleTable rows={filteredRows} teamById={teamById} onRowClick={openRow} />
        )}
      </section>
    </div>
  )
}

// ───────────────────────────────────────────────
// Filter dropdown (label + select)
// ───────────────────────────────────────────────
function FilterDropdown({
  label, value, onChange, options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <label className="flex items-center gap-2">
      <span className="text-gray-500 font-medium">{label}:</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="border border-gray-300 rounded px-2 py-1 bg-white text-xs"
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  )
}

// ───────────────────────────────────────────────
// Shared schedule table
// ───────────────────────────────────────────────
function ScheduleTable({
  rows,
  teamById,
  onRowClick,
}: {
  rows: Row[]
  teamById: Record<string, string>
  onRowClick: (r: Row) => void
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
          <tr>
            <th className="px-4 py-2 text-left font-semibold">Date</th>
            <th className="px-3 py-2 text-left font-semibold">Time</th>
            <th className="px-3 py-2 text-left font-semibold">Type</th>
            <th className="px-3 py-2 text-left font-semibold">Title</th>
            <th className="px-3 py-2 text-left font-semibold">Work Order</th>
            <th className="px-3 py-2 text-left font-semibold">Client</th>
            <th className="px-3 py-2 text-left font-semibold">Owner</th>
            <th className="px-3 py-2 text-left font-semibold">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const eff = effectiveStatus(r)
            const pill = statusPill(eff)
            const tm = typeMeta(r.type)
            const isCancelled = eff === 'cancelled'
            const isPastDue = eff === 'past_due'
            return (
              <tr
                key={r.id}
                onClick={() => onRowClick(r)}
                className="border-b border-gray-100 hover:bg-amber-50 cursor-pointer transition-colors"
                style={{
                  opacity: isCancelled ? 0.6 : 1,
                  borderLeft: isPastDue ? '3px solid #dc2626' : '3px solid transparent',
                }}
              >
                <td className="px-4 py-2.5 font-medium text-gray-800 whitespace-nowrap">
                  {fmtDate(r.scheduled_date)}
                </td>
                <td className="px-3 py-2.5 text-gray-500 font-mono text-xs whitespace-nowrap">
                  {fmtTime(r.scheduled_time)}
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  <span className="text-xs">{tm.icon}</span>{' '}
                  <span className="text-xs text-gray-700">{tm.label}</span>
                </td>
                <td className="px-3 py-2.5 text-gray-700">
                  {r.title || <span className="text-gray-400 italic">(no title)</span>}
                </td>
                <td className="px-3 py-2.5 text-gray-600 text-xs">
                  {r.wo_title || '—'}
                </td>
                <td className="px-3 py-2.5 text-gray-600 text-xs">
                  {r.client_name || '—'}
                </td>
                <td className="px-3 py-2.5 text-gray-600 text-xs">
                  {r.owner_id ? (teamById[r.owner_id] || '—') : <span className="text-gray-400">—</span>}
                </td>
                <td className="px-3 py-2.5">
                  <span
                    className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold"
                    style={{ background: pill.bg, color: pill.fg }}
                  >
                    {pill.label}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
