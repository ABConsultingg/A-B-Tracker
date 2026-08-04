// lib/activecampaign/pipeline-sync.ts
// Pushes pipeline stage transitions to ActiveCampaign (v3 API):
//   1. contact/sync  — create or update the contact by email
//   2. tags          — ensure a 'pipeline-<stage>' tag exists, then attach it
//   3. automations   — enroll won/lost leads in their nurture automation
//
// Runs from the Next.js server (not Postgres) because the credentials live in
// Vercel env vars. Every call is best-effort: a failure here must never fail
// the user's stage change, so results are reported, not thrown.

// The codebase already standardised on ACTIVECAMPAIGN_API_URL; ACTIVECAMPAIGN_URL
// is accepted as an alias.
const AC_URL = process.env.ACTIVECAMPAIGN_API_URL || process.env.ACTIVECAMPAIGN_URL || ''
const AC_KEY = process.env.ACTIVECAMPAIGN_API_KEY || ''

// Stages that enroll the contact in an automation, by automation name.
// IDs can be pinned via env to skip the name lookup.
const STAGE_AUTOMATIONS: Record<string, { name: string; envId?: string }> = {
  won:  { name: 'New Client Onboarding', envId: process.env.AC_AUTOMATION_WON_ID },
  lost: { name: 'Lost Lead Nurture',     envId: process.env.AC_AUTOMATION_LOST_ID },
}

export type AcSyncResult = {
  ok: boolean
  skipped: boolean
  warning: string | null
  steps: string[]
}

export function stageTagName(stage: string) {
  return `pipeline-${stage}`
}

function configured() {
  return Boolean(AC_URL && AC_KEY)
}

async function ac(path: string, init?: RequestInit) {
  const res = await fetch(`${AC_URL.replace(/\/$/, '')}${path}`, {
    ...init,
    headers: {
      'Api-Token': AC_KEY,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`AC ${path} -> ${res.status} ${body.slice(0, 200)}`)
  }
  return res.json()
}

/** Create or update the contact, returning its AC id. */
async function syncContact(lead: {
  email: string
  name?: string | null
  phone?: string | null
}): Promise<string> {
  const parts = (lead.name || '').trim().split(/\s+/).filter(Boolean)

  // Only send fields we actually have. contact/sync overwrites what it is
  // given, so sending '' would blank out names/phones already in AC.
  const contact: Record<string, string> = { email: lead.email }
  if (parts[0]) contact.firstName = parts[0]
  if (parts.length > 1) contact.lastName = parts.slice(1).join(' ')
  if (lead.phone) contact.phone = lead.phone

  const data = await ac('/api/3/contact/sync', {
    method: 'POST',
    body: JSON.stringify({ contact }),
  })
  const id = data?.contact?.id
  if (!id) throw new Error('AC contact/sync returned no contact id')
  return String(id)
}

/** Find a tag by exact name, creating it when absent. */
async function ensureTag(name: string): Promise<string> {
  const found = await ac(`/api/3/tags?search=${encodeURIComponent(name)}&limit=100`)
  const match = (found?.tags || []).find(
    (t: { tag?: string; id?: string }) => t.tag?.toLowerCase() === name.toLowerCase()
  )
  if (match?.id) return String(match.id)

  const created = await ac('/api/3/tags', {
    method: 'POST',
    body: JSON.stringify({ tag: { tag: name, tagType: 'contact', description: 'A&B sales pipeline stage' } }),
  })
  const id = created?.tag?.id
  if (!id) throw new Error(`Could not create AC tag "${name}"`)
  return String(id)
}

async function addTag(contactId: string, tagId: string) {
  await ac('/api/3/contactTags', {
    method: 'POST',
    body: JSON.stringify({ contactTag: { contact: contactId, tag: tagId } }),
  })
}

/** Resolve an automation id by name. Returns null when no automation matches. */
async function findAutomationId(name: string): Promise<string | null> {
  const data = await ac(`/api/3/automations?filters[name]=${encodeURIComponent(name)}&limit=100`)
  const list = data?.automations || []
  const exact = list.find(
    (a: { name?: string; id?: string }) => a.name?.toLowerCase() === name.toLowerCase()
  )
  return exact?.id ? String(exact.id) : (list[0]?.id ? String(list[0].id) : null)
}

async function addToAutomation(contactId: string, automationId: string) {
  await ac('/api/3/contactAutomations', {
    method: 'POST',
    body: JSON.stringify({ contactAutomation: { contact: contactId, automation: automationId } }),
  })
}

/**
 * Sync one stage transition. Never throws.
 * A lead with no email is skipped with a warning for the caller to record.
 */
export async function syncLeadStage(
  lead: { email: string | null; name?: string | null; phone?: string | null; business_name?: string },
  newStatus: string
): Promise<AcSyncResult> {
  const steps: string[] = []

  // Disqualified means the lead never belonged in the pipeline — often spam or
  // a wrong number. Pushing those into ActiveCampaign would pollute the CRM
  // (and bill for the contact), so they are not synced. Remove this branch if
  // you do want a 'pipeline-disqualified' tag in AC.
  if (newStatus === 'disqualified') {
    return {
      ok: true,
      skipped: true,
      warning: null,
      steps: ['skipped: disqualified leads are not pushed to ActiveCampaign'],
    }
  }

  if (!lead.email) {
    return {
      ok: false,
      skipped: true,
      warning: `ActiveCampaign sync skipped for stage "${newStatus}" — no email address on this lead.`,
      steps,
    }
  }

  if (!configured()) {
    return {
      ok: false,
      skipped: true,
      warning: `ActiveCampaign sync skipped for stage "${newStatus}" — ACTIVECAMPAIGN_API_URL / ACTIVECAMPAIGN_API_KEY not configured.`,
      steps,
    }
  }

  try {
    const contactId = await syncContact({ email: lead.email, name: lead.name, phone: lead.phone })
    steps.push(`contact ${contactId} synced`)

    const tagName = stageTagName(newStatus)
    const tagId = await ensureTag(tagName)
    await addTag(contactId, tagId)
    steps.push(`tagged ${tagName}`)

    const automation = STAGE_AUTOMATIONS[newStatus]
    if (automation) {
      const automationId = automation.envId || (await findAutomationId(automation.name))
      if (automationId) {
        await addToAutomation(contactId, automationId)
        steps.push(`enrolled in "${automation.name}"`)
      } else {
        return {
          ok: true,
          skipped: false,
          warning: `Tagged ${tagName}, but no ActiveCampaign automation named "${automation.name}" was found — enrollment skipped.`,
          steps,
        }
      }
    }

    return { ok: true, skipped: false, warning: null, steps }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[ac-pipeline-sync]', msg)
    return {
      ok: false,
      skipped: false,
      warning: `ActiveCampaign sync failed for stage "${newStatus}": ${msg}`,
      steps,
    }
  }
}
