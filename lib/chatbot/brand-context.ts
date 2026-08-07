// lib/chatbot/brand-context.ts
// Resolves a chatbot request to a client and that client's brand profile.
//
// Identity comes from the Origin header matched against clients.website_domain,
// not from the embed script's clientConfig. The widget is a static public file,
// so anything it sends is caller-supplied; the Origin is validated against the
// CORS allowlist before this runs.
//
// social_brand_profiles is the single source of truth shared with the Social
// Hub, the AI receptionist and Pancho. Updating a profile changes all of them.
import { createServiceClient } from '@/lib/supabase/service'

export const AB_CLIENT_ID = 'a-b-consulting-group'

export type BrandProfileRow = {
  client_id: string | null
  client_name: string | null
  brand_voice: string | null
  tone_words: string[] | null
  avoid_words: string[] | null
  what_makes_different: string | null
  key_services: string | null
  service_area: string | null
  target_audience: string | null
  ideal_customer: string | null
  customer_problem: string | null
  social_proof: string | null
  awards: string | null
  cta_style: string | null
  content_pillars: string[] | null
  topics_to_avoid: string | null
  cta_phone: string | null
  cta_website: string | null
}

export type ChatbotClientContext = {
  /** null when the origin matches no client (and is not A&B). */
  clientId: string | null
  clientName: string | null
  isAB: boolean
  /** false only when a matched client has the chatbot switched off. */
  chatbotEnabled: boolean
  profile: BrandProfileRow | null
}

/** Apex host, lowercased, single leading www. removed. */
export function originHost(origin: string | null | undefined): string | null {
  if (!origin) return null
  try {
    return new URL(origin).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return null
  }
}

const PROFILE_COLUMNS = `client_id, client_name, brand_voice, tone_words, avoid_words,
  what_makes_different, key_services, service_area, target_audience, ideal_customer,
  customer_problem, social_proof, awards, cta_style, content_pillars, topics_to_avoid,
  cta_phone, cta_website`

/**
 * @param origin      raw Origin header
 * @param isABSiteFlag clientConfig.isABSite from the embed, if present
 */
export async function resolveChatbotClient(
  origin: string | null | undefined,
  isABSiteFlag?: boolean
): Promise<ChatbotClientContext> {
  const host = originHost(origin)
  const sb = createServiceClient()

  // A&B's own site, or an embed explicitly declaring itself the A&B site.
  const isAB = isABSiteFlag === true || host === 'abconsultingg.com'

  const lookupId = isAB ? AB_CLIENT_ID : null

  let client: { id: string; name: string; chatbot_enabled: boolean | null } | null = null

  if (lookupId) {
    const { data } = await sb
      .from('clients')
      .select('id, name, chatbot_enabled')
      .eq('id', lookupId)
      .maybeSingle()
    client = data ?? null
  } else if (host) {
    // website_domain is text[] — a client can front several domains.
    const { data } = await sb
      .from('clients')
      .select('id, name, chatbot_enabled')
      .contains('website_domain', [host])
      .limit(1)
    client = data?.[0] ?? null
  }

  if (!client) {
    return { clientId: null, clientName: null, isAB, chatbotEnabled: isAB, profile: null }
  }

  // A&B's own widget is not gated by the per-client toggle.
  const chatbotEnabled = isAB ? true : client.chatbot_enabled === true

  const { data: profile } = await sb
    .from('social_brand_profiles')
    .select(PROFILE_COLUMNS)
    .eq('client_id', client.id)
    .maybeSingle()

  return {
    clientId: client.id,
    clientName: client.name,
    isAB,
    chatbotEnabled,
    profile: (profile as BrandProfileRow) ?? null,
  }
}

/** Brand profile rendered for a system prompt. Empty string when there is none. */
export function brandProfilePrompt(ctx: ChatbotClientContext): string {
  const p = ctx.profile
  if (!p) return ''

  const line = (label: string, v: string | null | undefined) =>
    v && String(v).trim() ? `${label}: ${String(v).trim()}\n` : ''
  const listLine = (label: string, v: string[] | null | undefined) =>
    v && v.length ? `${label}: ${v.join(', ')}\n` : ''

  let out = `\n\nBUSINESS KNOWLEDGE (authoritative — prefer this over anything inferred):\n`
  out += line('Business', ctx.clientName || p.client_name)
  out += line('What they do', p.key_services)
  out += line('Service area', p.service_area)
  out += line('What makes them different', p.what_makes_different)
  out += line('Who they serve', p.target_audience)
  out += line('Ideal customer', p.ideal_customer)
  out += line('Problem they solve', p.customer_problem)
  out += line('Social proof', p.social_proof)
  out += line('Awards', p.awards)
  out += line('Brand voice', p.brand_voice)
  out += listLine('Tone', p.tone_words)
  out += listLine('Content themes', p.content_pillars)
  out += line('How to ask for the next step', p.cta_style)
  out += line('Phone', p.cta_phone)
  out += line('Website', p.cta_website)

  const avoid: string[] = []
  if (p.avoid_words?.length) avoid.push(`never use these words: ${p.avoid_words.join(', ')}`)
  if (p.topics_to_avoid?.trim()) avoid.push(`never discuss: ${p.topics_to_avoid.trim()}`)
  if (avoid.length) out += `Hard rules: ${avoid.join('; ')}\n`

  return out
}


/**
 * Brand profile for a known client id, rendered for a system prompt.
 * Used by the AI receptionist and by Pancho, so all three products read the
 * same row. Returns '' when the client has no profile.
 */
export async function brandKnowledgeForClient(clientId: string | null | undefined): Promise<string> {
  if (!clientId) return ''
  const sb = createServiceClient()

  const [{ data: client }, { data: profile }] = await Promise.all([
    sb.from('clients').select('id, name').eq('id', clientId).maybeSingle(),
    sb.from('social_brand_profiles').select(PROFILE_COLUMNS).eq('client_id', clientId).maybeSingle(),
  ])
  if (!profile) return ''

  return brandProfilePrompt({
    clientId,
    clientName: client?.name ?? null,
    isAB: clientId === AB_CLIENT_ID,
    chatbotEnabled: true,
    profile: profile as BrandProfileRow,
  })
}

/**
 * Best-effort: find which client a team member is asking about, by looking for a
 * client name or id in their message. Longest name first so "Richards Building
 * Supply Branches" is preferred over "RBS".
 */
export async function findClientMentioned(text: string): Promise<{ id: string; name: string } | null> {
  if (!text || text.trim().length < 3) return null
  const haystack = text.toLowerCase()
  const sb = createServiceClient()

  const { data } = await sb
    .from('clients')
    .select('id, name')
    .eq('status', 'active')

  const candidates = (data ?? [])
    .map(c => ({ id: c.id, name: (c.name ?? '').trim() }))
    .filter(c => c.name.length >= 3)
    .sort((a, b) => b.name.length - a.name.length)

  for (const c of candidates) {
    if (haystack.includes(c.name.toLowerCase())) return c
  }
  // Fall back to the slug, which is how staff often refer to clients.
  for (const c of candidates) {
    if (c.id.length >= 3 && haystack.includes(c.id.toLowerCase())) return c
  }
  return null
}
