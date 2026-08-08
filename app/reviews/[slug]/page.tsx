// app/reviews/[slug]/page.tsx
// Public review listing for a client. No login — customers reach it from a QR
// code, an SMS review request, or a link the client hands out.
//
// Server component: it holds the service-role read and the Places key, and
// hands ReviewsListingClient a fully-resolved set of props. Nothing secret
// crosses that boundary — see resolvePhotoUrl and mapEmbedSrc below.
import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/service'
import ReviewsListingClient from './ReviewsListingClient'

export const dynamic = 'force-dynamic'

const DEFAULT_BRAND = '#1a2b4a'

const PLACES_FIELDS = [
  'name',
  'formatted_address',
  'formatted_phone_number',
  'website',
  'opening_hours',
  'rating',
  'user_ratings_total',
  'reviews',
  'url',
  'photos',
  'address_components',
  'geometry',
].join(',')

export type GoogleReview = {
  author_name: string
  rating: number
  text: string
  relative_time_description: string
  profile_photo_url?: string
  author_url?: string
}

export type ReviewSource = {
  platform: string
  rating: number | null
  review_count: number | null
  url: string | null
}

export type SocialLinks = {
  facebook?: string | null
  instagram?: string | null
  linkedin?: string | null
}

type PlaceDetails = {
  name: string | null
  formatted_address: string | null
  formatted_phone_number: string | null
  website: string | null
  weekday_text: string[]
  open_now: boolean | null
  rating: number | null
  user_ratings_total: number | null
  reviews: GoogleReview[]
  url: string | null
  photo_reference: string | null
  lat: number | null
  lng: number | null
  locality: string | null
  region: string | null
  postal_code: string | null
  street_address: string | null
}

const EMPTY_PLACE: PlaceDetails = {
  name: null,
  formatted_address: null,
  formatted_phone_number: null,
  website: null,
  weekday_text: [],
  open_now: null,
  rating: null,
  user_ratings_total: null,
  reviews: [],
  url: null,
  photo_reference: null,
  lat: null,
  lng: null,
  locality: null,
  region: null,
  postal_code: null,
  street_address: null,
}

function componentOf(
  components: Array<{ long_name?: string; short_name?: string; types?: string[] }>,
  type: string,
  short = false
): string | null {
  const hit = components.find(c => Array.isArray(c.types) && c.types.includes(type))
  if (!hit) return null
  return (short ? hit.short_name : hit.long_name) ?? null
}

/** Places Details. Never throws — the page degrades to config-only data. */
async function fetchPlaceDetails(placeId: string): Promise<PlaceDetails> {
  const key = process.env.GOOGLE_PLACES_API_KEY
  if (!key) {
    console.error('[reviews] GOOGLE_PLACES_API_KEY is not configured')
    return EMPTY_PLACE
  }

  const url =
    `https://maps.googleapis.com/maps/api/place/details/json` +
    `?place_id=${encodeURIComponent(placeId)}` +
    `&fields=${encodeURIComponent(PLACES_FIELDS)}` +
    `&reviews_sort=newest&key=${key}`

  try {
    const res = await fetch(url, { next: { revalidate: 3600 } })
    if (!res.ok) {
      console.error('[reviews] Places lookup failed', { placeId, error: `HTTP ${res.status}` })
      return EMPTY_PLACE
    }

    const json = await res.json()
    if (json.status !== 'OK') {
      console.error('[reviews] Places lookup failed', {
        placeId,
        error: `${json.status}${json.error_message ? `: ${json.error_message}` : ''}`,
      })
      return EMPTY_PLACE
    }

    const r = (json.result ?? {}) as Record<string, any>
    const components = Array.isArray(r.address_components) ? r.address_components : []

    const streetNumber = componentOf(components, 'street_number')
    const route = componentOf(components, 'route')

    return {
      name: r.name ?? null,
      formatted_address: r.formatted_address ?? null,
      formatted_phone_number: r.formatted_phone_number ?? null,
      website: r.website ?? null,
      weekday_text: Array.isArray(r.opening_hours?.weekday_text)
        ? r.opening_hours.weekday_text.map((x: unknown) => String(x))
        : [],
      open_now: typeof r.opening_hours?.open_now === 'boolean' ? r.opening_hours.open_now : null,
      rating: typeof r.rating === 'number' ? r.rating : null,
      user_ratings_total: typeof r.user_ratings_total === 'number' ? r.user_ratings_total : null,
      reviews: Array.isArray(r.reviews)
        ? r.reviews.map((x: Record<string, unknown>) => ({
            author_name: String(x.author_name ?? 'Google user'),
            rating: Number(x.rating) || 0,
            text: String(x.text ?? '').trim(),
            relative_time_description: String(x.relative_time_description ?? ''),
            profile_photo_url: x.profile_photo_url ? String(x.profile_photo_url) : undefined,
            author_url: x.author_url ? String(x.author_url) : undefined,
          }))
        : [],
      url: r.url ?? null,
      photo_reference:
        Array.isArray(r.photos) && r.photos[0]?.photo_reference
          ? String(r.photos[0].photo_reference)
          : null,
      lat: typeof r.geometry?.location?.lat === 'number' ? r.geometry.location.lat : null,
      lng: typeof r.geometry?.location?.lng === 'number' ? r.geometry.location.lng : null,
      locality: componentOf(components, 'locality'),
      region: componentOf(components, 'administrative_area_level_1', true),
      postal_code: componentOf(components, 'postal_code'),
      street_address: streetNumber && route ? `${streetNumber} ${route}` : route,
    }
  } catch (e) {
    console.error('[reviews] Places request failed', { placeId, error: e })
    return EMPTY_PLACE
  }
}

/**
 * Turns a photo_reference into a public image URL.
 *
 * The Places Photo endpoint needs our API key but answers with a redirect to a
 * keyless googleusercontent URL. Following that redirect here means the browser
 * never sees the key — handing the client the /place/photo URL directly would
 * publish it on an unauthenticated page.
 */
async function resolvePhotoUrl(photoReference: string | null): Promise<string | null> {
  const key = process.env.GOOGLE_PLACES_API_KEY
  if (!photoReference || !key) return null

  const url =
    `https://maps.googleapis.com/maps/api/place/photo` +
    `?maxwidth=1600&photo_reference=${encodeURIComponent(photoReference)}&key=${key}`

  try {
    const res = await fetch(url, { redirect: 'manual', next: { revalidate: 3600 } })
    const location = res.headers.get('location')
    return location && location.startsWith('https://') ? location : null
  } catch {
    return null
  }
}

/**
 * Keyless map embed. The Maps Embed API would need a key in an iframe src,
 * which is public by definition; this classic endpoint needs none.
 */
function mapEmbedSrc(place: PlaceDetails, businessName: string): string | null {
  if (place.lat != null && place.lng != null) {
    return `https://maps.google.com/maps?q=${place.lat},${place.lng}&z=15&output=embed`
  }
  const q = place.formatted_address || businessName
  return q ? `https://maps.google.com/maps?q=${encodeURIComponent(q)}&z=15&output=embed` : null
}

// Not exported: Next only permits a page module to export its own route hooks.
// lib/reviews/google.ts has the shared copy the QR route uses.
function reviewLinkFor(placeId: string): string {
  return `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId)}`
}

/**
 * reviewSources comes from ai_service_config.review_sources so a client can list
 * platforms we have no API for. The Google entry is refreshed from the live
 * Places response when we have one — a stale rating on a public page is worse
 * than an inconsistent one.
 */
function buildSources(
  raw: unknown,
  place: PlaceDetails
): { sources: ReviewSource[]; weightedRating: number | null; totalCount: number } {
  const configured: ReviewSource[] = Array.isArray(raw)
    ? raw
        .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object')
        .map(s => ({
          platform: String(s.platform ?? 'unknown').toLowerCase(),
          rating: typeof s.rating === 'number' ? s.rating : null,
          review_count: typeof s.review_count === 'number' ? s.review_count : null,
          url: s.url ? String(s.url) : null,
        }))
    : []

  const sources = configured.map(s =>
    s.platform === 'google' && place.rating != null
      ? {
          ...s,
          rating: place.rating,
          review_count: place.user_ratings_total ?? s.review_count,
          url: s.url ?? place.url,
        }
      : s
  )

  // No configured sources but Google answered — show Google rather than nothing.
  if (!sources.length && place.rating != null) {
    sources.push({
      platform: 'google',
      rating: place.rating,
      review_count: place.user_ratings_total,
      url: place.url,
    })
  }

  const scored = sources.filter(s => s.rating != null && (s.review_count ?? 0) > 0)
  const totalCount = scored.reduce((n, s) => n + (s.review_count ?? 0), 0)
  const weightedRating = totalCount
    ? scored.reduce((n, s) => n + (s.rating ?? 0) * (s.review_count ?? 0), 0) / totalCount
    : sources.find(s => s.rating != null)?.rating ?? null

  return { sources, weightedRating, totalCount }
}

async function loadPage(slug: string) {
  const sb = createServiceClient()

  const { data: client } = await sb
    .from('clients')
    .select(
      'id, name, company, address, contact_phone, contact_email, website_domain, report_color, ai_service_config, reputation_mgmt_enabled, chatbot_enabled'
    )
    .eq('id', slug)
    .maybeSingle()

  if (!client) return null

  const cfg = (client.ai_service_config ?? {}) as Record<string, any>
  const rep = (cfg.reputation ?? {}) as Record<string, any>
  const bot = (cfg.chatbot ?? {}) as Record<string, any>

  // The publish switch has to actually withhold the page, otherwise every client
  // has a live public URL the moment they exist.
  const enabled = client.reputation_mgmt_enabled === true && rep.aggregation_page_enabled === true
  const placeId: string | null = rep.google_place_id?.trim() || null

  const { data: profile } = await sb
    .from('social_brand_profiles')
    .select('client_name, key_services, service_area, cta_phone, cta_website, tagline, one_sentence')
    .eq('client_id', slug)
    .maybeSingle()

  const place = placeId && enabled ? await fetchPlaceDetails(placeId) : EMPTY_PLACE
  const coverPhotoUrl = enabled ? await resolvePhotoUrl(place.photo_reference) : null

  const businessName =
    client.company || profile?.client_name || place.name || client.name || client.id

  const services = String(profile?.key_services ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)

  const { sources, weightedRating, totalCount } = buildSources(cfg.review_sources, place)

  const domain = Array.isArray(client.website_domain) ? client.website_domain[0] : null

  return {
    enabled,
    clientId: client.id,
    businessName,
    tagline: profile?.tagline || profile?.one_sentence || null,
    brandColor: bot.brand_color || cfg.brand_color || client.report_color || DEFAULT_BRAND,
    brandLogoUrl: (cfg.brand_logo_url as string | null) || null,
    socialLinks: (cfg.social_links ?? {}) as SocialLinks,
    chatbotEnabled: client.chatbot_enabled === true,
    services,
    serviceArea: profile?.service_area || null,
    reviewSources: sources,
    weightedRating,
    totalCount,
    reviews: place.reviews,
    reviewLink: placeId ? reviewLinkFor(placeId) : null,
    coverPhotoUrl,
    mapSrc: mapEmbedSrc(place, businessName),
    place,
    contact: {
      phone: place.formatted_phone_number || profile?.cta_phone || client.contact_phone || null,
      address: place.formatted_address || client.address || null,
      website:
        place.website || profile?.cta_website || (domain ? `https://${domain}` : null) || null,
      mapsUrl: place.url,
    },
  }
}

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const sb = createServiceClient()
  const { data: client } = await sb
    .from('clients')
    .select('id, name, company, ai_service_config, reputation_mgmt_enabled')
    .eq('id', params.slug)
    .maybeSingle()

  const rep = ((client?.ai_service_config ?? {}) as Record<string, any>).reputation ?? {}
  // Metadata must not name a client whose page is not published.
  if (!client || client.reputation_mgmt_enabled !== true || rep.aggregation_page_enabled !== true) {
    return { title: 'Reviews' }
  }

  const { data: profile } = await sb
    .from('social_brand_profiles')
    .select('client_name')
    .eq('client_id', params.slug)
    .maybeSingle()

  const name = client.company || profile?.client_name || client.name || client.id
  return {
    title: `${name} — Reviews`,
    description: `Read reviews for ${name} and leave your own.`,
  }
}

export default async function ReviewsPage({ params }: { params: { slug: string } }) {
  const data = await loadPage(params.slug)
  if (!data) notFound()

  // 404 rather than a "not published" notice, so the URL reveals nothing before
  // it is ready.
  if (!data.enabled) notFound()

  const { place, contact } = data

  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: data.businessName,
    url: contact.website || undefined,
    telephone: contact.phone || undefined,
    image: data.coverPhotoUrl || undefined,
    description: data.tagline || undefined,
    ...(data.services.length ? { makesOffer: data.services.map(s => ({ '@type': 'Offer', name: s })) } : {}),
    ...(contact.address
      ? {
          address: {
            '@type': 'PostalAddress',
            streetAddress: place.street_address || undefined,
            addressLocality: place.locality || undefined,
            addressRegion: place.region || undefined,
            postalCode: place.postal_code || undefined,
            addressCountry: 'US',
          },
        }
      : {}),
    ...(place.lat != null && place.lng != null
      ? { geo: { '@type': 'GeoCoordinates', latitude: place.lat, longitude: place.lng } }
      : {}),
    ...(place.weekday_text.length ? { openingHours: place.weekday_text } : {}),
    ...(data.weightedRating != null && data.totalCount > 0
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: Number(data.weightedRating.toFixed(1)),
            reviewCount: data.totalCount,
            bestRating: 5,
            worstRating: 1,
          },
        }
      : {}),
  }

  return (
    <>
      <script
        type="application/ld+json"
        // Serialised from our own data, not user input.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <ReviewsListingClient
        businessName={data.businessName}
        tagline={data.tagline}
        brandColor={data.brandColor}
        brandLogoUrl={data.brandLogoUrl}
        socialLinks={data.socialLinks}
        chatbotEnabled={data.chatbotEnabled}
        services={data.services}
        serviceArea={data.serviceArea}
        reviewSources={data.reviewSources}
        weightedRating={data.weightedRating}
        totalCount={data.totalCount}
        reviews={data.reviews}
        reviewLink={data.reviewLink}
        coverPhotoUrl={data.coverPhotoUrl}
        mapSrc={data.mapSrc}
        hours={place.weekday_text}
        openNow={place.open_now}
        phone={contact.phone}
        address={contact.address}
        website={contact.website}
        mapsUrl={contact.mapsUrl}
      />
    </>
  )
}
