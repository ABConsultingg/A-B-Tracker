import type { WorkOrder, WoStage } from './types'

/**
 * Flat staleness threshold (days). A WO is "stale" if it's been in its
 * current stage for STALE_DAYS or more (excluding paid/archived).
 * "Critically stale" = 2 × STALE_DAYS (i.e. 20d).
 *
 * Chosen over per-stage SLAs (Session 6, May 19 2026) for simplicity:
 * one number to communicate, one number to remember.
 */
export const STALE_DAYS = 10
export const CRITICALLY_STALE_DAYS = STALE_DAYS * 2

/**
 * Per-stage SLA values (legacy / reference only).
 * Kept as a constant so future code can opt into per-stage behavior
 * (e.g. per-client SLA overrides, per-stage alerts), but the live
 * KPI + alerts logic uses STALE_DAYS above.
 *
 * Stages 'paid' and 'archived' are sentinel (999) — never stale.
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
 * Stages considered "actively in delivery."
 * Used by the Active KPI on Pipeline Health (Session 6 spec):
 * the team is currently doing the work for these WOs.
 *
 * Explicitly excludes: submitted, not-started, on-hold (not started yet),
 * invoiced (delivered, waiting on payment), paid, archived (done).
 */
export const ACTIVE_DELIVERY_STAGES: WoStage[] = [
  'in-progress',
  'deliverables-completed',
  'sent-for-approval',
  'revisions-received',
  'approved',
  'deliverables-executed',
]

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
 * True if the WO has been in its current stage at or beyond STALE_DAYS.
 * Never returns true for 'paid' or 'archived'.
 */
export function isStale(wo: Pick<WorkOrder, 'stage' | 'stage_entered_at' | 'submitted_at'>): boolean {
  if (['paid', 'archived', 'on-hold', 'deliverables-completed', 'sent-for-approval', 'revisions-received', 'approved', 'deliverables-executed', 'invoiced'].includes(wo.stage)) return false
  return daysInStage(wo) >= STALE_DAYS
}

/**
 * True if days-in-stage is at or beyond CRITICALLY_STALE_DAYS (20d).
 * Implies isStale(wo) is also true. Drives red highlighting in alerts.
 */
export function isCriticallyStale(wo: Pick<WorkOrder, 'stage' | 'stage_entered_at' | 'submitted_at'>): boolean {
  if (['paid', 'archived', 'on-hold', 'deliverables-completed', 'sent-for-approval', 'revisions-received', 'approved', 'deliverables-executed', 'invoiced'].includes(wo.stage)) return false
  return daysInStage(wo) >= CRITICALLY_STALE_DAYS
}

/**
 * True if the WO is past its due date (today >= due_date).
 * Returns false if due_date is null or the WO is paid/archived.
 */
export function isOverdue(wo: Pick<WorkOrder, 'due_date' | 'stage'>): boolean {
  if (!wo.due_date) return false
  if (['paid', 'archived', 'on-hold', 'deliverables-completed', 'sent-for-approval', 'revisions-received', 'approved', 'deliverables-executed', 'invoiced'].includes(wo.stage)) return false
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
