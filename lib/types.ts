export type WoStage =
  | 'submitted' | 'not-started' | 'in-progress' | 'deliverables-completed'
  | 'sent-for-approval' | 'revisions-received' | 'approved'
  | 'deliverables-executed' | 'invoiced' | 'paid' | 'on-hold' | 'archived'

export type WoOccurrence = 'One-time' | 'Recurring' | 'Quarterly' | 'Weekly'

export const STAGES: { id: WoStage; label: string; color: string }[] = [
  { id: 'submitted',              label: 'Submitted',          color: '#94a3b8' },
  { id: 'not-started',            label: 'Not Started',        color: '#64748b' },
  { id: 'in-progress',            label: 'In Progress',        color: '#2d4a7c' },
  { id: 'deliverables-completed', label: 'Deliverables Done',  color: '#0891b2' },
  { id: 'sent-for-approval',      label: 'Sent for Approval',  color: '#7c3aed' },
  { id: 'revisions-received',     label: 'Revisions',          color: '#f59e0b' },
  { id: 'approved',               label: 'Approved',           color: '#10b981' },
  { id: 'deliverables-executed',  label: 'Executed',           color: '#059669' },
  { id: 'invoiced',               label: 'Invoiced',           color: '#d99e2b' },
  { id: 'paid',                   label: 'Paid',               color: '#16a34a' },
  { id: 'on-hold',                label: 'On Hold',            color: '#ef4444' },
  { id: 'archived',               label: 'Archived',           color: '#475569' },
]

export interface WorkOrder {
  id: string
  title: string
  description?: string
  client_id: string
  service_id: string
  owner_id?: string
  stage: WoStage
  priority: 'low' | 'medium' | 'high' | 'urgent'
  occurrence?: WoOccurrence
  est_cost?: number
  add_cost?: number
  ad_spend?: number
  due_date?: string
  submitted_at?: string
  stage_entered_at?: string | null
  branch?: string | null
  vendor?: string | null
  deliverables_link?: string | null
  notes_link?: string | null
  notes?: string | null
  flagged?: boolean
  issue?: string | null
  created_at: string
  updated_at: string
  clients?: { name: string }
  services?: { name: string; category: string }
  team_members?: { name: string }
}
