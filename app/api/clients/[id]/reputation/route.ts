// app/api/clients/[id]/reputation/route.ts
// Reputation Management panel: logo, brand colour, Place ID, social links,
// review sources and the chatbot toggle.
//
// PATCH saves any subset of those fields, so the panel can save one field on
// blur or all of them from the Save button without a second endpoint.
// POST takes the logo file itself.
//
// Admin/owner only, matching ../ai-services — these fields drive a public page
// and the widget a client's own customers talk to.
//
// Written with the service client because the clients update policy is
// is_admin() OR role = 'sales', so an OWNER cannot update clients under RLS.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

const BUCKET = 'social-assets'
const SOCIAL_KEYS = ['facebook', 'instagram', 'linkedin', 'youtube', 'tiktok'] as const
const REVIEW_PLATFORMS = ['google', 'facebook', 'yelp', 'bbb', 'trustpilot', 'angi']

const MAX_LOGO_BYTES = 2 * 1024 * 1024
const LOGO_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
}

const str = (v: unknown, max = 400): string | null => {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t ? t.slice(0, max) : null
}

/** Only http(s). Blocks javascript: and data: URLs, which reach a public page. */
function cleanUrl(v: unknown, max = 500): string | null {
  const s = str(v, max)
  if (!s) return null
  try {
    const u = new URL(s)
    return u.protocol === 'http:' || u.protocol === 'https:' ? s : null
  } catch {
    return null
  }
}

const cleanHex = (v: unknown): string | null => {
  const s = str(v, 9)
  return s && /^#[0-9a-fA-F]{6}$/.test(s) ? s : null
}

function cleanSocialLinks(input: unknown): Record<string, string | null> {
  const src = (input ?? {}) as Record<string, unknown>
  const out: Record<string, string | null> = {}
  for (const k of SOCIAL_KEYS) out[k] = cleanUrl(src[k])
  return out
}

/** [{ platform, rating, review_count, url }] — rows without a platform dropped. */
function cleanReviewSources(input: unknown) {
  const rows = Array.isArray(input) ? input : []
  return rows
    .map(r => {
      const row = (r ?? {}) as Record<string, unknown>
      const platform = str(row.platform, 40)?.toLowerCase()
      if (!platform) return null

      const ratingNum = Number(row.rating)
      const countNum = Number(row.review_count)

      return {
        platform: REVIEW_PLATFORMS.includes(platform) ? platform : platform.slice(0, 40),
        rating:
          Number.isFinite(ratingNum) && ratingNum >= 0 && ratingNum <= 5
            ? Math.round(ratingNum * 10) / 10
            : null,
        review_count:
          Number.isFinite(countNum) && countNum >= 0 ? Math.floor(countNum) : null,
        url: cleanUrl(row.url),
      }
    })
    .filter(Boolean)
    .slice(0, 12)
}

/** admin or owner, active. Returns null when allowed, a response when not. */
async function guard() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: member } = await supabase
    .from('team_members')
    .select('id, role, active')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (!(member?.active === true && (member.role === 'admin' || member.role === 'owner'))) {
    return NextResponse.json({ error: 'admin or owner required' }, { status: 403 })
  }
  return null
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = await guard()
  if (denied) return denied

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const admin = createServiceClient()

  const { data: existing } = await admin
    .from('clients')
    .select('id, ai_service_config')
    .eq('id', params.id)
    .maybeSingle()
  if (!existing) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

  const current = (existing.ai_service_config ?? {}) as Record<string, unknown>
  const merged: Record<string, unknown> = { ...current }
  const updates: Record<string, unknown> = {}

  // brand_color is written to both the top level and the chatbot block: the
  // public page reads chatbot.brand_color first, and the widget config reads the
  // same key, so splitting them would let the two drift apart.
  if ('brand_color' in body) {
    const colour = cleanHex(body.brand_color)
    merged.brand_color = colour
    merged.chatbot = { ...((current.chatbot ?? {}) as Record<string, unknown>), brand_color: colour }
  }

  // Same key the reputation panel in ServiceToggles writes, deliberately — one
  // Place ID per client, not one per panel.
  if ('google_place_id' in body) {
    merged.reputation = {
      ...((current.reputation ?? {}) as Record<string, unknown>),
      google_place_id: str(body.google_place_id, 200),
    }
  }

  if ('social_links' in body) merged.social_links = cleanSocialLinks(body.social_links)
  if ('review_sources' in body) merged.review_sources = cleanReviewSources(body.review_sources)

  if ('logo_url' in body) updates.logo_url = cleanUrl(body.logo_url)
  if ('chatbot_enabled' in body) updates.chatbot_enabled = body.chatbot_enabled === true

  const touchedConfig =
    'brand_color' in body ||
    'google_place_id' in body ||
    'social_links' in body ||
    'review_sources' in body
  if (touchedConfig) updates.ai_service_config = merged

  if (!Object.keys(updates).length) {
    return NextResponse.json({ error: 'No recognised fields' }, { status: 400 })
  }

  const { data, error } = await admin
    .from('clients')
    .update(updates)
    .eq('id', params.id)
    .select('id, logo_url, chatbot_enabled, ai_service_config')
    .maybeSingle()

  if (error) {
    console.error('[reputation] update failed', { clientId: params.id, error: error.message })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, client: data })
}

/** Logo upload. multipart/form-data with a `file` field. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = await guard()
  if (denied) return denied

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 })
  }

  const file = form.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Missing file' }, { status: 400 })
  }

  const ext = LOGO_TYPES[file.type]
  if (!ext) {
    return NextResponse.json(
      { error: `Unsupported type ${file.type || 'unknown'} — use PNG, JPEG, WebP or SVG` },
      { status: 415 }
    )
  }
  if (file.size > MAX_LOGO_BYTES) {
    return NextResponse.json({ error: 'Logo must be 2 MB or smaller' }, { status: 413 })
  }

  const admin = createServiceClient()

  const { data: existing } = await admin
    .from('clients')
    .select('id')
    .eq('id', params.id)
    .maybeSingle()
  if (!existing) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

  // Fixed path per the spec, so a re-upload replaces rather than accumulates.
  const path = `clients/${params.id}/logo.${ext}`

  const { error: upErr } = await admin.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: true })

  if (upErr) {
    console.error('[reputation] logo upload failed', { clientId: params.id, error: upErr.message })
    return NextResponse.json({ error: upErr.message }, { status: 500 })
  }

  const {
    data: { publicUrl },
  } = admin.storage.from(BUCKET).getPublicUrl(path)

  // upsert keeps one path per client, so the URL is stable and a replaced logo
  // would still be served from cache. A version marker avoids that.
  const versioned = `${publicUrl}?v=${Date.now()}`

  const { error } = await admin.from('clients').update({ logo_url: versioned }).eq('id', params.id)
  if (error) {
    console.error('[reputation] logo_url write failed', { clientId: params.id, error: error.message })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, logo_url: versioned })
}
