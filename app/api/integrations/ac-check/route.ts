// app/api/integrations/ac-check/route.ts
// Read-only preflight for the pipeline -> ActiveCampaign sync. Confirms the
// credentials work and that the automations the sync looks up by name actually
// exist, without creating contacts, tags, or enrollments.
//
// Never returns the API key.
import { NextResponse } from 'next/server'
import { checkSalesAccess } from '@/lib/auth/sales'

const AC_URL = process.env.ACTIVECAMPAIGN_API_URL || process.env.ACTIVECAMPAIGN_URL || ''
const AC_KEY = process.env.ACTIVECAMPAIGN_API_KEY || ''

// Automations triggered by the tags the pipeline sends.
const WANTED = ['New Lead Introduction', 'New Client Onboarding', 'Lost Lead Nurture']

// Every tag the sync can send, so the preflight can report which already exist.
const EXPECTED_TAGS = [
  'pipeline-new', 'pipeline-contacted', 'pipeline-discovery', 'pipeline-proposal',
  'pipeline-contract-sent', 'pipeline-won', 'pipeline-lost', 'pipeline-disqualified',
]

export async function GET() {
  const { allowed, reason } = await checkSalesAccess()
  if (!allowed) {
    return reason === 'unauthenticated'
      ? NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
      : NextResponse.json({ error: 'Requires owner or sales role' }, { status: 403 })
  }

  const out: Record<string, unknown> = {
    urlConfigured: Boolean(AC_URL),
    keyConfigured: Boolean(AC_KEY),
  }

  if (!AC_URL || !AC_KEY) {
    out.ok = false
    out.detail = 'ACTIVECAMPAIGN_API_URL / ACTIVECAMPAIGN_API_KEY not both set'
    return NextResponse.json(out)
  }

  const get = async (path: string) => {
    const res = await fetch(`${AC_URL.replace(/\/$/, '')}${path}`, {
      headers: { 'Api-Token': AC_KEY, 'Content-Type': 'application/json' },
    })
    const text = await res.text()
    if (!res.ok) throw new Error(`${path} -> ${res.status} ${text.slice(0, 160)}`)
    return JSON.parse(text)
  }

  try {
    const autos = await get('/api/3/automations?limit=100')
    out.authOk = true
    // meta.total is the real count; the array above is capped by limit.
    out.automationTotal = autos?.meta?.total ?? null
    out.automationSampleSize = (autos?.automations || []).length

    // Resolve each wanted automation the same way syncLeadStage does — a
    // server-side filtered lookup, so the 100-item page cap cannot hide it.
    out.wanted = await Promise.all(
      WANTED.map(async w => {
        const r = await get(`/api/3/automations?filters[name]=${encodeURIComponent(w)}&limit=100`)
        const list: { name?: string; id?: string }[] = r?.automations || []
        const exact = list.find(a => a.name?.toLowerCase() === w.toLowerCase())
        return {
          name: w,
          found: Boolean(exact),
          resolvedId: exact?.id ?? null,
          // What the sync would fall back to if there is no exact match.
          filterMatches: list.map(a => a.name).slice(0, 10),
        }
      })
    )

    const tags = await get('/api/3/tags?search=pipeline&limit=100')
    const existing: string[] = (tags?.tags || [])
      .map((t: { tag?: string }) => t.tag)
      .filter((t: string) => t?.startsWith('pipeline-'))
    out.existingPipelineTags = existing
    // Absent tags are not a problem — ensureTag creates them on first use.
    out.expectedTags = EXPECTED_TAGS.map(t => ({ tag: t, exists: existing.includes(t) }))

    out.ok = (out.wanted as { found: boolean }[]).every(w => w.found)
    return NextResponse.json(out)
  } catch (e) {
    out.ok = false
    out.authOk = false
    out.detail = e instanceof Error ? e.message : String(e)
    return NextResponse.json(out, { status: 200 })
  }
}
