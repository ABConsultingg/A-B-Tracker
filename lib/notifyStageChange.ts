import { STAGES } from './types'

const STAGE_NOTIFIES_CLIENT = new Set(['sent-for-approval', 'ordered', 'deliverables-executed'])
const STAGE_NOTIFIES_TEAM   = new Set(['approved', 'revisions-received', 'deliverables-completed', 'deliverables-executed'])

export async function notifyStageChange({
  stage,
  woId,
  woTitle,
  clientId,
  ownerAuthId,
  assigneeAuthIds = [],
  senderName,
}: {
  stage: string
  woId: string
  woTitle: string
  clientId: string | null
  ownerAuthId: string | null
  assigneeAuthIds?: string[]
  senderName?: string
}) {
  const stageLabel = STAGES.find(s => s.id === stage)?.label || stage
  const notifications: any[] = []

  if (STAGE_NOTIFIES_CLIENT.has(stage) && clientId) {
    notifications.push({ client_id: clientId, type: 'stage_change_client', stage, stage_label: stageLabel })
  }

  if (STAGE_NOTIFIES_TEAM.has(stage)) {
    const teamIds = [...new Set([ownerAuthId, ...assigneeAuthIds].filter(Boolean))] as string[]
    teamIds.forEach(uid => {
      notifications.push({ user_id: uid, type: 'stage_change_team', stage, stage_label: stageLabel })
    })
  }

  if (!notifications.length) return

  try {
    await fetch('/api/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notifications, wo_title: woTitle, wo_id: woId, sender_name: senderName }),
    })
  } catch (e) {
    console.error('notifyStageChange error:', e)
  }
}
