import type { WorkOrder, WoStage } from './types'

/**
 * SLA threshold (days in stage) per WO stage.
 * Pipeline Health "Stale" KPI = WOs where daysInStage >= STAGE_SLAS[stage].
 * Critically stale = daysInStage >= 2 × SLA.
 * Stages 'paid' and 'archived' are sentinel (999) — never stale.
 *
 * Source: v7 handoff, Session 6 plan.
 */
export const STAGE_SLAS: Record<WoStage, number> = {
  'submitted': 2,
  'on-hold': 14,
  'not-started': 7,
  'in-progress': 14,
  'deliverables-completed': 3,
  'sent-for-approval': 7,
  'revisions-received': 5,
  'approved': 3,
  'deliverables-executed': 5,
  'invoiced': 30,
  'paid': 999,
  'archived': 999,
}

/**
 * Days the WO has been in its current stage.
 * Uses stage_entered_at (set by the wo_stage_changed trigger) and falls back
 * to submitted_at if the column is null (shouldn't happen after backfill,
 * but defensive).
 */
export function daysInStage(wo: Pick<WorkOrder, 'stage_entered_at' | 'submitted_at'>): number {
  const anchor = wo.stage_entered_at || wo.submitted_at
  if (!anchor) return 0
  const ms = Date.now() - new Date(anchor).getTime()
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)))
}

/**
 * True if the WO has been in its current stage at or beyond the SLA threshold.
 * Never returns true for 'paid' or 'archived'.
 */
export function isStale(wo: Pick<WorkOrder, 'stage' | 'stage_entered_at' | 'submitted_at'>): boolean {
  if (wo.stage === 'paid' || wo.stage === 'archived') return false
  const sla = STAGE_SLAS[wo.stage] ?? 0
  return daysInStage(wo) >= sla
}

/**
 * True if days-in-stage is at or beyond 2× the SLA threshold.
 * Implies isStale(wo) is also true. Drives red highlighting in alerts.
 */
export function isCriticallyStale(wo: Pick<WorkOrder, 'stage' | 'stage_entered_at' | 'submitted_at'>): boolean {
  if (wo.stage === 'paid' || wo.stage === 'archived') return false
  const sla = STAGE_SLAS[wo.stage] ?? 0
  return daysInStage(wo) >= sla * 2
}

/**
 * True if the WO is past its due date (today >= due_date).
 * Returns false if due_date is null or the WO is paid/archived.
 */
export function isOverdue(wo: Pick<WorkOrder, 'due_date' | 'stage'>): boolean {
  if (!wo.due_date) return false
  if (wo.stage === 'paid' || wo.stage === 'archived') return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(wo.due_date)
  due.setHours(0, 0, 0, 0)
  return due < today
}

/**
 * Format days-in-stage for display: "3d", "12d", "534d".
 * No abbreviation past 365 — keeps the actual neglect honest on cards.
 */
export function fmtDaysInStage(days: number): string {
  return `${days}d`
}
