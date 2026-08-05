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

// Every stage sends `pipeline-<status>`. Three of those tags are automation
// triggers on the ActiveCampaign side — the tag is what starts the sequence,
// so nothing here enrolls contacts directly:
//   pipeline-new  -> "New Lead Introduction"
//   pipeline-won  -> "New Client Onboarding"
//   pipeline-lost -> "Lost Lead Nurture"
// The rest (contacted, discovery, proposal, contract-sent, disqualified) are
// tags only, for segmentation and reporting.

export type AcSyncResult = {
  ok: boolean
  skipped: boolean
  warning: string | null
  steps: string[]
}

export function stageTagName(stage: string) {
  return `pipeline-${stage}`
}

/** Dated note line used when a sync is skipped or fails. */
export function warningNote(warning: string) {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date())
  return `[${day}] ⚠ ${warning}`
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

/** Look up a contact id by email. Null when AC has no such contact. */
async function findContactId(email: string): Promise<string | null> {
  const d = await ac(`/api/3/contacts?email=${encodeURIComponent(email)}`)
  const id = (d?.contacts || [])[0]?.id
  return id ? String(id) : null
}

/**
 * Add or remove a single tag on a contact, by email. Used by the staleness job.
 * Never throws.
 */
export async function setContactTag(
  email: string | null,
  tag: string,
  mode: 'add' | 'remove'
): Promise<AcSyncResult> {
  if (!email) {
    return { ok: false, skipped: true, warning: `Cannot ${mode} tag "${tag}" — lead has no email.`, steps: [] }
  }
  if (!configured()) {
    return { ok: false, skipped: true, warning: `Cannot ${mode} tag "${tag}" — ActiveCampaign not configured.`, steps: [] }
  }

  try {
    if (mode === 'add') {
      const contactId = await syncContact({ email })
      const tagId = await ensureTag(tag)
      await addTag(contactId, tagId)
      return { ok: true, skipped: false, warning: null, steps: [`tagged ${tag}`] }
    }

    // Removal needs the contactTag join row id, not the tag id.
    const contactId = await findContactId(email)
    if (!contactId) {
      return { ok: true, skipped: true, warning: null, steps: [`no AC contact for ${email}; nothing to remove`] }
    }
    const joins = await ac(`/api/3/contacts/${contactId}/contactTags`)
    const rows: { id?: string; tag?: string }[] = joins?.contactTags || []
    const tagId = await ensureTag(tag)
    const match = rows.find(r => String(r.tag) === String(tagId))
    if (!match?.id) {
      return { ok: true, skipped: true, warning: null, steps: [`${tag} not present on contact`] }
    }
    await ac(`/api/3/contactTags/${match.id}`, { method: 'DELETE' })
    return { ok: true, skipped: false, warning: null, steps: [`removed ${tag}`] }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[ac-set-tag]', msg)
    return { ok: false, skipped: false, warning: `Tag ${mode} failed for "${tag}": ${msg}`, steps: [] }
  }
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

    // No explicit automation enrollment: the automations in AC are triggered
    // by these tags, so adding the tag is what starts them. Calling
    // contactAutomations as well would enroll the contact twice and can send
    // duplicate emails.
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
