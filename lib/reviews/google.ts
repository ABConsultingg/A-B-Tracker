// lib/reviews/google.ts
// Public review page data: the client's reputation config, brand colour, and
// their Google reviews.
//
// Reads ai_service_config->reputation, so everything the reputation panel sets
// drives this page with no second source.
import { createServiceClient } from '@/lib/supabase/service'

export type GoogleReview = {
  author_name: string
  rating: number
  text: string
  relative_time_description: string
  profile_photo_url?: string
}

export type ReviewPageData = {
  clientId: string
  businessName: string
  brandColor: string
  placeId: string | null
  enabled: boolean
  rating: number | null
  totalRatings: number | null
  reviews: GoogleReview[]
  /** Set when the Places lookup could not be completed. */
  fetchError: string | null
}

const DEFAULT_BRAND = '#1a2b4a'

export function reviewLinkFor(placeId: string): string {
  return `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId)}`
}

type ReputationConfig = {
  google_place_id?: string
  aggregation_page_enabled?: boolean
}

/** Google reviews for a place. Never throws — the page degrades instead. */
async function fetchGoogleReviews(placeId: string): Promise<{
  rating: number | null
  total: number | null
  reviews: GoogleReview[]
  error: string | null
}> {
  const key = process.env.GOOGLE_PLACES_API_KEY
  if (!key) {
    return { rating: null, total: null, reviews: [], error: 'GOOGLE_PLACES_API_KEY is not configured' }
  }

  const url =
    `https://maps.googleapis.com/maps/api/place/details/json` +
    `?place_id=${encodeURIComponent(placeId)}` +
    `&fields=name,rating,user_ratings_total,reviews` +
    `&reviews_sort=newest&key=${key}`

  try {
    const res = await fetch(url, { next: { revalidate: 3600 } })
    if (!res.ok) return { rating: null, total: null, reviews: [], error: `Places HTTP ${res.status}` }

    const json = await res.json()
    if (json.status !== 'OK') {
      return {
        rating: null, total: null, reviews: [],
        error: `Places status ${json.status}${json.error_message ? `: ${json.error_message}` : ''}`,
      }
    }

    const r = json.result ?? {}
    return {
      rating: typeof r.rating === 'number' ? r.rating : null,
      total: typeof r.user_ratings_total === 'number' ? r.user_ratings_total : null,
      reviews: Array.isArray(r.reviews)
        ? r.reviews.map((x: Record<string, unknown>) => ({
            author_name: String(x.author_name ?? 'Google user'),
            rating: Number(x.rating) || 0,
            text: String(x.text ?? '').trim(),
            relative_time_description: String(x.relative_time_description ?? ''),
            profile_photo_url: x.profile_photo_url ? String(x.profile_photo_url) : undefined,
          }))
        : [],
      error: null,
    }
  } catch (e) {
    return {
      rating: null, total: null, reviews: [],
      error: e instanceof Error ? e.message : 'Places request failed',
    }
  }
}

/**
 * Everything the public page needs. Returns null when the slug is not a client,
 * so the page can 404 rather than leak which slugs exist.
 */
export async function getReviewPageData(slug: string): Promise<ReviewPageData | null> {
  const sb = createServiceClient()

  const { data: client } = await sb
    .from('clients')
    .select('id, name, company, report_color, ai_service_config, reputation_mgmt_enabled')
    .eq('id', slug)
    .maybeSingle()

  if (!client) return null

  const cfg = (client.ai_service_config ?? {}) as Record<string, unknown>
  const rep = (cfg.reputation ?? {}) as ReputationConfig
  const bot = (cfg.chatbot ?? {}) as { brand_color?: string | null }

  // social_brand_profiles has no colour column, so the brand colour comes from
  // the chatbot config, then the client's report colour, then a default.
  const brandColor = bot.brand_color || client.report_color || DEFAULT_BRAND

  const placeId = rep.google_place_id?.trim() || null
  const enabled = client.reputation_mgmt_enabled === true && rep.aggregation_page_enabled === true

  const g = placeId
    ? await fetchGoogleReviews(placeId)
    : { rating: null, total: null, reviews: [], error: null }

  return {
    clientId: client.id,
    businessName: client.company || client.name || client.id,
    brandColor,
    placeId,
    enabled,
    rating: g.rating,
    totalRatings: g.total,
    reviews: g.reviews,
    fetchError: g.error,
  }
}
