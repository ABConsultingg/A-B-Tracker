'use client'

import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

// Schedule types (8 from prototype) with icons + labels
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

const STATUS_OPTIONS = [
  { id: 'scheduled', label: 'Scheduled' },
  { id: 'sent',      label: '✓ Sent' },
  { id: 'cancelled', label: 'Cancelled' },
] as const

type ScheduleRow = {
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
}

type TeamMember = { id: string; name: string }

const todayISO = () => {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

const trimTime = (t: string | null): string => {
  if (!t) return ''
  return t.slice(0, 5)
}

// Compute the effective status — 'past_due' if scheduled and date < today
function effectiveStatus(row: ScheduleRow): 'scheduled' | 'sent' | 'cancelled' | 'past_due' {
  if (row.status === 'sent') return 'sent'
  if (row.status === 'cancelled') return 'cancelled'
  if (row.scheduled_date < todayISO()) return 'past_due'
  return 'scheduled'
}

// Style map for status pill
function statusPillStyle(status: ReturnType<typeof effectiveStatus>) {
  switch (status) {
    case 'sent':
      return { bg: '#dcfce7', fg: '#166534', label: '✓ Sent' }
    case 'past_due':
      return { bg: '#fee2e2', fg: '#991b1b', label: '⚠ Past due' }
    case 'cancelled':
      return { bg: '#f3f4f6', fg: '#6b7280', label: 'Cancelled' }
    case 'scheduled':
    default:
      return { bg: '#fef3c7', fg: '#92400e', label: 'Scheduled' }
  }
}

export default function WoScheduleTab({
  wo,
  initialSchedule,
  team,
}: {
  wo: any
  initialSchedule: any[]
  team: TeamMember[]
}) {
  const supabase = createClient()
  const searchParams = useSearchParams()

  const [rows, setRows] = useState<ScheduleRow[]>(initialSchedule as ScheduleRow[])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [highlightId, setHighlightId] = useState<string | null>(null)
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({})

  // Handle ?highlight=<row-id> on mount
  useEffect(() => {
    const id = searchParams.get('highlight')
    if (!id) return
    setHighlightId(id)
    // Scroll to the row
    setTimeout(() => {
      const el = rowRefs.current[id]
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }, 100)
    // Clear highlight after 2.5s
    const timer = setTimeout(() => setHighlightId(null), 2500)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Always render sorted by date, then time (matches global view + prototype)
  const sortedRows = [...rows].sort((a, b) => {
    const dateCmp = a.scheduled_date.localeCompare(b.scheduled_date)
    if (dateCmp !== 0) return dateCmp
    return (a.scheduled_time || '').localeCompare(b.scheduled_time || '')
  })

  async function addRow() {
    setError(null)
    setAdding(true)
    const nextSort = rows.length > 0
      ? Math.max(...rows.map(r => r.sort_order)) + 1
      : 0

    const { data, error: insertErr } = await supabase
      .from('wo_schedule')
      .insert({
        work_order_id: wo.id,
        scheduled_date: todayISO(),
        type: 'other',
        status: 'scheduled',
        sort_order: nextSort,
      })
      .select('*')
      .single()

    setAdding(false)

    if (insertErr || !data) {
      setError(insertErr?.message || 'Failed to add row')
      return
    }
    setRows(prev => [...prev, data as ScheduleRow])
  }

  async function updateRow(id: string, patch: Partial<ScheduleRow>) {
    setError(null)
    setBusyId(id)
    setRows(prev => prev.map(r => (r.id === id ? { ...r, ...patch } : r)))

    const { error: updateErr } = await supabase
      .from('wo_schedule')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)

    setBusyId(null)

    if (updateErr) {
      setError(updateErr.message)
      const { data } = await supabase
        .from('wo_schedule')
        .select('*')
        .eq('id', id)
        .single()
      if (data) {
        setRows(prev => prev.map(r => (r.id === id ? (data as ScheduleRow) : r)))
      }
    }
  }

  async function deleteRow(id: string) {
    if (!confirm('Delete this scheduled date?')) return
    setError(null)
    setBusyId(id)

    const { error: deleteErr } = await supabase
      .from('wo_schedule')
      .delete()
      .eq('id', id)

    setBusyId(null)

    if (deleteErr) {
      setError(deleteErr.message)
      return
    }
    setRows(prev => prev.filter(r => r.id !== id))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        flexWrap: 'wrap',
      }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>📅 Execution Schedule</h2>
          <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>
            When each deliverable actually goes out. Google Calendar sync coming soon.
          </div>
        </div>
        <button
          onClick={addRow}
          disabled={adding}
          style={{
            padding: '8px 14px',
            background: '#d99e2b',
            color: 'white',
            border: 'none',
            borderRadius: 6,
            cursor: adding ? 'wait' : 'pointer',
            fontSize: 14,
            fontWeight: 500,
          }}
        >
          {adding ? 'Adding…' : '+ Add date'}
        </button>
      </div>

      {error && (
        <div style={{
          padding: '10px 12px',
          background: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: 6,
          color: '#991b1b',
          fontSize: 13,
        }}>
          {error}
        </div>
      )}

      {/* Empty state */}
      {rows.length === 0 && (
        <div style={{
          padding: '32px 16px',
          textAlign: 'center',
          background: '#f9fafb',
          border: '1px dashed #d1d5db',
          borderRadius: 8,
          color: '#6b7280',
        }}>
          <div style={{ fontSize: 14, marginBottom: 4 }}>No scheduled dates yet.</div>
          <div style={{ fontSize: 12 }}>
            Add a date when you know <em>when</em> the deliverable goes out.
          </div>
        </div>
      )}

      {/* Rows — compact 6-column grid matching prototype */}
      {rows.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {sortedRows.map(row => {
            const isBusy = busyId === row.id
            const isHighlighted = highlightId === row.id
            const eff = effectiveStatus(row)
            const pill = statusPillStyle(eff)

            return (
              <div
                key={row.id}
                ref={el => { rowRefs.current[row.id] = el }}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '130px 150px 1fr 140px 130px 32px',
                  gap: 8,
                  padding: 10,
                  background: 'white',
                  border: isHighlighted
                    ? '2px solid #d99e2b'
                    : row.calendar_synced
                      ? '1px solid rgba(217, 158, 43, 0.4)'
                      : '1px solid #e5e7eb',
                  borderRadius: 6,
                  alignItems: 'center',
                  opacity: isBusy ? 0.6 : 1,
                  boxShadow: isHighlighted ? '0 0 0 4px rgba(217, 158, 43, 0.15)' : 'none',
                  transition: 'border-color 0.2s, box-shadow 0.2s',
                }}
              >
                {/* Date + Time stacked */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <input
                    type="date"
                    value={row.scheduled_date}
                    onChange={e => updateRow(row.id, { scheduled_date: e.target.value })}
                    disabled={isBusy}
                    style={{
                      padding: '5px 8px',
                      border: '1px solid #d1d5db',
                      borderRadius: 4,
                      fontSize: 12,
                      fontFamily: 'inherit',
                      width: '100%',
                    }}
                  />
                  <input
                    type="time"
                    value={trimTime(row.scheduled_time)}
                    onChange={e => updateRow(row.id, { scheduled_time: e.target.value || null })}
                    disabled={isBusy}
                    title="Time (optional)"
                    style={{
                      padding: '4px 8px',
                      border: '1px solid #d1d5db',
                      borderRadius: 4,
                      fontSize: 11,
                      fontFamily: 'JetBrains Mono, monospace',
                      width: '100%',
                      color: '#6b7280',
                    }}
                  />
                </div>

                {/* Type */}
                <select
                  value={row.type}
                  onChange={e => updateRow(row.id, { type: e.target.value })}
                  disabled={isBusy}
                  style={{
                    padding: '6px 8px',
                    border: '1px solid #d1d5db',
                    borderRadius: 4,
                    fontSize: 12,
                    background: 'white',
                    fontFamily: 'inherit',
                  }}
                >
                  {SCHEDULE_TYPES.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.icon} {t.label}
                    </option>
                  ))}
                </select>

                {/* Title */}
                <input
                  type="text"
                  value={row.title || ''}
                  onChange={e => updateRow(row.id, { title: e.target.value || null })}
                  disabled={isBusy}
                  placeholder="What's going out?"
                  style={{
                    padding: '6px 8px',
                    border: '1px solid #d1d5db',
                    borderRadius: 4,
                    fontSize: 12,
                    fontFamily: 'inherit',
                    width: '100%',
                  }}
                />

                {/* Owner */}
                <select
                  value={row.owner_id || ''}
                  onChange={e => updateRow(row.id, { owner_id: e.target.value || null })}
                  disabled={isBusy}
                  style={{
                    padding: '6px 8px',
                    border: '1px solid #d1d5db',
                    borderRadius: 4,
                    fontSize: 12,
                    background: 'white',
                    fontFamily: 'inherit',
                  }}
                >
                  <option value="">— Owner —</option>
                  {team.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>

                {/* Status pill (color-coded, click to change) */}
                <select
                  value={row.status}
                  onChange={e => updateRow(row.id, { status: e.target.value })}
                  disabled={isBusy}
                  style={{
                    padding: '6px 8px',
                    border: 'none',
                    borderRadius: 4,
                    fontSize: 11,
                    background: pill.bg,
                    color: pill.fg,
                    fontWeight: 600,
                    fontFamily: 'inherit',
                    textAlign: 'center',
                    cursor: 'pointer',
                  }}
                  title={eff === 'past_due' ? 'Scheduled date has passed — mark as sent or update date' : ''}
                >
                  {STATUS_OPTIONS.map(s => (
                    <option key={s.id} value={s.id} style={{ background: 'white', color: '#1a1f2e' }}>
                      {s.label}
                    </option>
                  ))}
                </select>

                {/* Delete */}
                <button
                  onClick={() => deleteRow(row.id)}
                  disabled={isBusy}
                  title="Delete row"
                  style={{
                    background: 'transparent',
                    border: '1px solid #e5e7eb',
                    color: '#dc2626',
                    borderRadius: 4,
                    cursor: isBusy ? 'wait' : 'pointer',
                    fontSize: 12,
                    padding: '6px 4px',
                    width: 32,
                  }}
                >
                  ✕
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Footer note */}
      {rows.length > 0 && (
        <div style={{ fontSize: 12, color: '#9ca3af' }}>
          {rows.length} {rows.length === 1 ? 'date' : 'dates'} scheduled.
          Changes save automatically.
        </div>
      )}
    </div>
  )
}
