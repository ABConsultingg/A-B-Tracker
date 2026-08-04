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

const WANTED = ['New Client Onboarding', 'Lost Lead Nurture']

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
    urlHostSuffix: AC_URL ? AC_URL.replace(/^https?:\/\/[^.]+/, '<subdomain>') : null,
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
    const names: string[] = (autos?.automations || []).map((a: { name?: string }) => a.name || '')
    out.authOk = true
    out.automationCount = names.length
    out.automationNames = names
    out.wanted = WANTED.map(w => ({
      name: w,
      found: names.some(n => n.toLowerCase() === w.toLowerCase()),
    }))

    const tags = await get('/api/3/tags?search=pipeline&limit=100')
    out.existingPipelineTags = (tags?.tags || [])
      .map((t: { tag?: string }) => t.tag)
      .filter((t: string) => t?.startsWith('pipeline-'))

    out.ok = (out.wanted as { found: boolean }[]).every(w => w.found)
    return NextResponse.json(out)
  } catch (e) {
    out.ok = false
    out.authOk = false
    out.detail = e instanceof Error ? e.message : String(e)
    return NextResponse.json(out, { status: 200 })
  }
}
