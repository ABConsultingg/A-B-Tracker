'use client'

// app/reviews/[slug]/ReviewsListingClient.tsx
// Presentation for the public review listing. Every accent colour derives from
// the client's brand_color, so one config value re-themes the whole page.
//
// Styling is inline rather than Tailwind: this page renders for the public
// outside the dashboard's layout, and inline styles cannot be lost to a purge.
import { useMemo, useState, useEffect } from 'react'
import type { GoogleReview, ReviewSource, SocialLinks } from './page'

type Props = {
  businessName: string
  tagline: string | null
  brandColor: string
  brandLogoUrl: string | null
  socialLinks: SocialLinks
  chatbotEnabled: boolean
  services: string[]
  serviceArea: string | null
  reviewSources: ReviewSource[]
  weightedRating: number | null
  totalCount: number
  reviews: GoogleReview[]
  reviewLink: string | null
  coverPhotoUrl: string | null
  mapSrc: string | null
  hours: string[]
  openNow: boolean | null
  phone: string | null
  address: string | null
  website: string | null
  mapsUrl: string | null
}

const INK = '#111827'
const MUTED = '#6b7280'
const LINE = '#e5e7eb'
const CARD = '#ffffff'
const PAGE = '#f7f7f5'

const PLATFORM_LABELS: Record<string, string> = {
  google: 'Google',
  facebook: 'Facebook',
  yelp: 'Yelp',
  trustpilot: 'Trustpilot',
  bbb: 'BBB',
  angi: 'Angi',
}

const platformLabel = (p: string) => PLATFORM_LABELS[p] ?? p.charAt(0).toUpperCase() + p.slice(1)

/** #rgb / #rrggbb → {r,g,b}. Falls back to near-black for unusable values. */
function parseHex(hex: string): { r: number; g: number; b: number } {
  let h = (hex || '').trim().replace('#', '')
  if (h.length === 3) h = h.split('').map(c => c + c).join('')
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return { r: 17, g: 24, b: 39 }
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  }
}

const rgba = (hex: string, a: number) => {
  const { r, g, b } = parseHex(hex)
  return `rgba(${r},${g},${b},${a})`
}

function shift(hex: string, amount: number): string {
  const { r, g, b } = parseHex(hex)
  const f = (v: number) =>
    Math.max(0, Math.min(255, Math.round(amount >= 0 ? v + (255 - v) * amount : v * (1 + amount))))
  return `#${[f(r), f(g), f(b)].map(v => v.toString(16).padStart(2, '0')).join('')}`
}

/** White or near-black, whichever stays readable on the brand colour. */
function readableOn(hex: string): string {
  const { r, g, b } = parseHex(hex)
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return lum > 0.6 ? INK : '#ffffff'
}

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? '')
    .join('') || '?'

const AVATARS = ['#4f46e5', '#0891b2', '#c2410c', '#15803d', '#7c3aed', '#b91c1c', '#0f766e', '#a16207']
const avatarColor = (name: string) => {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return AVATARS[h % AVATARS.length]
}

function Stars({ rating, color, size = 15 }: { rating: number; color: string; size?: number }) {
  const pct = Math.max(0, Math.min(100, (rating / 5) * 100))
  return (
    <span
      role="img"
      aria-label={`${rating.toFixed(1)} out of 5`}
      style={{ position: 'relative', display: 'inline-block', fontSize: size, lineHeight: 1, letterSpacing: 2 }}
    >
      <span style={{ color: LINE }}>★★★★★</span>
      <span
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: `${pct}%`,
          overflow: 'hidden',
          whiteSpace: 'nowrap',
          color,
        }}
      >
        ★★★★★
      </span>
    </span>
  )
}

function SocialIcon({ kind, size = 16 }: { kind: string; size?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'currentColor' as const }
  if (kind === 'facebook')
    return (
      <svg {...common} aria-hidden="true">
        <path d="M22 12a10 10 0 1 0-11.6 9.9v-7h-2.5V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.4h-1.2c-1.2 0-1.6.8-1.6 1.6V12h2.7l-.4 2.9h-2.3v7A10 10 0 0 0 22 12Z" />
      </svg>
    )
  if (kind === 'instagram')
    return (
      <svg {...common} aria-hidden="true">
        <path d="M12 2.2c3.2 0 3.6 0 4.9.1 1.2.1 1.8.3 2.2.4.6.2 1 .5 1.4.9.4.4.7.8.9 1.4.2.4.4 1 .4 2.2.1 1.3.1 1.7.1 4.9s0 3.6-.1 4.9c-.1 1.2-.3 1.8-.4 2.2-.2.6-.5 1-.9 1.4-.4.4-.8.7-1.4.9-.4.2-1 .4-2.2.4-1.3.1-1.7.1-4.9.1s-3.6 0-4.9-.1c-1.2-.1-1.8-.3-2.2-.4-.6-.2-1-.5-1.4-.9-.4-.4-.7-.8-.9-1.4-.2-.4-.4-1-.4-2.2-.1-1.3-.1-1.7-.1-4.9s0-3.6.1-4.9c.1-1.2.3-1.8.4-2.2.2-.6.5-1 .9-1.4.4-.4.8-.7 1.4-.9.4-.2 1-.4 2.2-.4 1.3-.1 1.7-.1 4.9-.1Zm0 5.6a4.2 4.2 0 1 0 0 8.4 4.2 4.2 0 0 0 0-8.4Zm0 6.9a2.7 2.7 0 1 1 0-5.4 2.7 2.7 0 0 1 0 5.4Zm5.3-7.1a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z" />
      </svg>
    )
  if (kind === 'linkedin')
    return (
      <svg {...common} aria-hidden="true">
        <path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM3 9h4v12H3V9Zm7 0h3.8v1.7h.05c.53-1 1.83-2.05 3.76-2.05 4.02 0 4.76 2.6 4.76 6V21h-4v-5.5c0-1.3-.02-3-1.85-3-1.85 0-2.13 1.44-2.13 2.9V21h-4V9Z" />
      </svg>
    )
  return null
}

export default function ReviewsListingClient(props: Props) {
  const {
    businessName,
    tagline,
    brandColor,
    brandLogoUrl,
    socialLinks,
    chatbotEnabled,
    services,
    serviceArea,
    reviewSources,
    weightedRating,
    totalCount,
    reviews,
    reviewLink,
    coverPhotoUrl,
    mapSrc,
    hours,
    openNow,
    phone,
    address,
    website,
    mapsUrl,
  } = props

  const onBrand = useMemo(() => readableOn(brandColor), [brandColor])
  const [expanded, setExpanded] = useState<Record<number, boolean>>({})
  const [platform, setPlatform] = useState<string>('all')
  const [chatOpen, setChatOpen] = useState(false)

  // Resolved after mount: the server runs in UTC, so highlighting "today" there
  // would show the wrong row to a viewer near midnight — and a server/client
  // mismatch would trip hydration.
  const [todayIdx, setTodayIdx] = useState<number | null>(null)
  useEffect(() => {
    // weekday_text is Monday-first; getDay() is Sunday-first.
    setTodayIdx((new Date().getDay() + 6) % 7)
  }, [])

  const socials = useMemo(
    () =>
      (['facebook', 'instagram', 'linkedin'] as const)
        .map(k => ({ kind: k, url: socialLinks?.[k] ?? null }))
        .filter((s): s is { kind: 'facebook' | 'instagram' | 'linkedin'; url: string } => !!s.url),
    [socialLinks]
  )

  const platforms = useMemo(() => {
    const fromReviews = reviews.length ? ['google'] : []
    return Array.from(new Set([...reviewSources.map(s => s.platform), ...fromReviews]))
  }, [reviewSources, reviews])

  // Only Google returns review bodies today; other platforms contribute their
  // rating to the aggregate but have no cards to filter to.
  const visibleReviews = platform === 'all' || platform === 'google' ? reviews : []

  const btn = {
    background: brandColor,
    color: onBrand,
    padding: '10px 18px',
    borderRadius: 8,
    fontWeight: 700,
    fontSize: 14,
    textDecoration: 'none',
    display: 'inline-block',
    border: 'none',
    cursor: 'pointer',
  } as const

  const card = {
    background: CARD,
    border: `1px solid ${LINE}`,
    borderRadius: 14,
    padding: 18,
  } as const

  return (
    <div style={{ minHeight: '100vh', background: PAGE, color: INK, fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif' }}>
      {/* ── Sticky brand header ── */}
      {/* Layout and type are Tailwind so the md: breakpoints work; only the
          runtime brand colours stay inline. */}
      <header
        className="sticky top-0 z-50"
        style={{
          background: brandColor,
          color: onBrand,
          boxShadow: '0 1px 8px rgba(0,0,0,0.15)',
        }}
      >
        <div className="mx-auto flex max-w-[1120px] items-center gap-4 px-5 py-4 md:gap-5 md:py-5">
          {brandLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={brandLogoUrl}
              alt={businessName}
              className="h-10 w-auto max-w-[180px] rounded-md object-contain"
            />
          ) : (
            <div
              aria-hidden="true"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] text-base font-bold"
              style={{ background: rgba(onBrand === '#ffffff' ? '#ffffff' : '#000000', 0.16) }}
            >
              {initialsOf(businessName)}
            </div>
          )}

          <span className="truncate text-lg font-bold tracking-tight md:text-xl">{businessName}</span>

          <div className="ml-auto flex items-center gap-2.5 md:gap-3">
            {socials.map(s => (
              <a
                key={s.kind}
                href={s.url}
                target="_blank"
                rel="noreferrer noopener"
                aria-label={platformLabel(s.kind)}
                className="inline-flex rounded-lg p-2 opacity-85 transition-opacity hover:opacity-100"
                style={{
                  color: onBrand,
                  background: rgba(onBrand === '#ffffff' ? '#ffffff' : '#000000', 0.12),
                }}
              >
                <SocialIcon kind={s.kind} size={18} />
              </a>
            ))}
            {reviewLink && (
              <a
                href={reviewLink}
                target="_blank"
                rel="noreferrer noopener"
                className="whitespace-nowrap rounded-lg px-4 py-2.5 text-sm font-bold no-underline"
                style={{ background: onBrand, color: brandColor }}
              >
                Write a Review
              </a>
            )}
          </div>
        </div>
      </header>

      {/* ── Cover photo, or a brand gradient when Places has no usable image ── */}
      <div
        style={{
          height: 220,
          background: coverPhotoUrl
            ? `linear-gradient(${rgba('#000000', 0.28)}, ${rgba('#000000', 0.28)}), url(${coverPhotoUrl}) center/cover no-repeat`
            : `linear-gradient(135deg, ${shift(brandColor, -0.25)} 0%, ${brandColor} 45%, ${shift(brandColor, 0.35)} 100%)`,
        }}
      />

      <main style={{ maxWidth: 1120, margin: '0 auto', padding: '0 20px 64px' }}>
        {/* ── Hero ── */}
        <section
          style={{
            ...card,
            marginTop: -56,
            position: 'relative',
            padding: 24,
            boxShadow: '0 4px 20px rgba(0,0,0,0.06)',
          }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
            <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, letterSpacing: -0.5 }}>{businessName}</h1>
            <span
              title="This business has been verified"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                background: rgba(brandColor, 0.1),
                color: brandColor,
                border: `1px solid ${rgba(brandColor, 0.25)}`,
                padding: '4px 10px',
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M9.5 16.6 5 12.1l1.4-1.4 3.1 3.1 8.1-8.1L19 7.1z" />
              </svg>
              Claimed
            </span>
          </div>

          {tagline && <p style={{ margin: '8px 0 0', color: MUTED, fontSize: 14 }}>{tagline}</p>}

          {weightedRating != null && (
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginTop: 14 }}>
              <span style={{ fontSize: 30, fontWeight: 800, lineHeight: 1 }}>{weightedRating.toFixed(1)}</span>
              <Stars rating={weightedRating} color={brandColor} size={19} />
              {totalCount > 0 && (
                <span style={{ color: MUTED, fontSize: 14 }}>
                  {totalCount.toLocaleString()} review{totalCount === 1 ? '' : 's'}
                  {reviewSources.length > 1 ? ' across all sources' : ''}
                </span>
              )}
            </div>
          )}

          {/* Source breakdown pills */}
          {reviewSources.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
              {reviewSources.map(s => (
                <span
                  key={s.platform}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    border: `1px solid ${LINE}`,
                    background: '#fff',
                    borderRadius: 999,
                    padding: '6px 12px',
                    fontSize: 12.5,
                    color: INK,
                  }}
                >
                  <strong style={{ fontWeight: 700 }}>{platformLabel(s.platform)}</strong>
                  {s.rating != null && (
                    <>
                      <span style={{ color: brandColor, fontWeight: 700 }}>{s.rating.toFixed(1)}</span>
                      <span style={{ color: MUTED }}>
                        ({(s.review_count ?? 0).toLocaleString()})
                      </span>
                    </>
                  )}
                </span>
              ))}
            </div>
          )}
        </section>

        {/* ── Reviews from the web (only meaningful with more than one source) ── */}
        {reviewSources.length > 1 && (
          <section style={{ marginTop: 24 }}>
            <h2 style={{ fontSize: 15, fontWeight: 800, margin: '0 0 10px' }}>Reviews from the web</h2>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))',
                gap: 12,
              }}
            >
              {reviewSources.map(s => {
                const inner = (
                  <>
                    <div style={{ fontWeight: 700, fontSize: 13.5 }}>{platformLabel(s.platform)}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                      <span style={{ fontSize: 22, fontWeight: 800 }}>{s.rating?.toFixed(1) ?? '—'}</span>
                      {s.rating != null && <Stars rating={s.rating} color={brandColor} size={13} />}
                    </div>
                    <div style={{ color: MUTED, fontSize: 12, marginTop: 4 }}>
                      {(s.review_count ?? 0).toLocaleString()} review{s.review_count === 1 ? '' : 's'}
                    </div>
                  </>
                )
                return s.url ? (
                  <a
                    key={s.platform}
                    href={s.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    style={{ ...card, padding: 14, textDecoration: 'none', color: INK, display: 'block' }}
                  >
                    {inner}
                  </a>
                ) : (
                  <div key={s.platform} style={{ ...card, padding: 14 }}>
                    {inner}
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* ── Two-column body ── */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(260px, 320px) minmax(0, 1fr)',
            gap: 24,
            marginTop: 24,
            alignItems: 'start',
          }}
        >
          {/* Sidebar */}
          <aside style={{ display: 'grid', gap: 16, minWidth: 0 }}>
            {mapSrc && (
              <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
                <iframe
                  src={mapSrc}
                  title={`Map of ${businessName}`}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  style={{ width: '100%', height: 190, border: 0, display: 'block' }}
                />
              </div>
            )}

            {(address || phone || website || mapsUrl) && (
              <div style={card}>
                <h2 style={{ fontSize: 14, fontWeight: 800, margin: '0 0 12px' }}>Contact</h2>
                <div style={{ display: 'grid', gap: 10, fontSize: 13.5 }}>
                  {address && (
                    <div style={{ color: MUTED, lineHeight: 1.5 }}>
                      {address}
                      {mapsUrl && (
                        <>
                          {' · '}
                          <a href={mapsUrl} target="_blank" rel="noreferrer noopener" style={{ color: brandColor, fontWeight: 600 }}>
                            Directions
                          </a>
                        </>
                      )}
                    </div>
                  )}
                  {phone && (
                    <a href={`tel:${phone.replace(/[^\d+]/g, '')}`} style={{ color: brandColor, fontWeight: 700, textDecoration: 'none' }}>
                      {phone}
                    </a>
                  )}
                  {website && (
                    <a
                      href={website}
                      target="_blank"
                      rel="noreferrer noopener"
                      style={{ color: brandColor, fontWeight: 600, textDecoration: 'none', wordBreak: 'break-all' }}
                    >
                      {website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                    </a>
                  )}
                  {serviceArea && <div style={{ color: MUTED }}>Serving {serviceArea}</div>}
                </div>
              </div>
            )}

            {hours.length > 0 && (
              <div style={card}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <h2 style={{ fontSize: 14, fontWeight: 800, margin: 0 }}>Hours</h2>
                  {openNow != null && (
                    <span
                      style={{
                        fontSize: 11.5,
                        fontWeight: 700,
                        color: openNow ? '#15803d' : '#b91c1c',
                        background: openNow ? '#dcfce7' : '#fee2e2',
                        padding: '2px 8px',
                        borderRadius: 999,
                      }}
                    >
                      {openNow ? 'Open now' : 'Closed'}
                    </span>
                  )}
                </div>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 4, fontSize: 13 }}>
                  {hours.map((line, i) => {
                    const isToday = todayIdx === i
                    const [day, ...rest] = line.split(': ')
                    return (
                      <li
                        key={i}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          gap: 10,
                          padding: '5px 8px',
                          borderRadius: 7,
                          background: isToday ? rgba(brandColor, 0.09) : 'transparent',
                          fontWeight: isToday ? 700 : 400,
                          color: isToday ? INK : MUTED,
                        }}
                      >
                        <span>{day}</span>
                        <span>{rest.join(': ')}</span>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}

            {services.length > 0 && (
              <div style={card}>
                <h2 style={{ fontSize: 14, fontWeight: 800, margin: '0 0 12px' }}>Services</h2>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {services.map(s => (
                    <span
                      key={s}
                      style={{
                        background: rgba(brandColor, 0.1),
                        color: brandColor,
                        border: `1px solid ${rgba(brandColor, 0.22)}`,
                        borderRadius: 999,
                        padding: '6px 12px',
                        fontSize: 12.5,
                        fontWeight: 600,
                        textTransform: 'capitalize',
                      }}
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {socials.length > 0 && (
              <div style={card}>
                <h2 style={{ fontSize: 14, fontWeight: 800, margin: '0 0 12px' }}>Follow Us</h2>
                <div style={{ display: 'grid', gap: 8 }}>
                  {socials.map(s => (
                    <a
                      key={s.kind}
                      href={s.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        color: INK,
                        textDecoration: 'none',
                        fontSize: 13.5,
                        fontWeight: 600,
                        padding: '8px 10px',
                        border: `1px solid ${LINE}`,
                        borderRadius: 9,
                      }}
                    >
                      <span style={{ color: brandColor, display: 'inline-flex' }}>
                        <SocialIcon kind={s.kind} size={18} />
                      </span>
                      {platformLabel(s.kind)}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </aside>

          {/* Main column */}
          <section style={{ minWidth: 0 }}>
            {platforms.length > 1 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                {['all', ...platforms].map(p => {
                  const active = platform === p
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPlatform(p)}
                      style={{
                        borderRadius: 999,
                        padding: '7px 14px',
                        fontSize: 13,
                        fontWeight: 700,
                        cursor: 'pointer',
                        border: `1px solid ${active ? brandColor : LINE}`,
                        background: active ? brandColor : '#fff',
                        color: active ? onBrand : MUTED,
                      }}
                    >
                      {p === 'all' ? 'All reviews' : platformLabel(p)}
                    </button>
                  )
                })}
              </div>
            )}

            {visibleReviews.length > 0 ? (
              <div style={{ display: 'grid', gap: 12 }}>
                {visibleReviews.map((r, i) => {
                  const isLong = r.text.length > 320
                  const open = !!expanded[i]
                  return (
                    <article key={i} style={card}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                        <div
                          aria-hidden="true"
                          style={{
                            width: 40,
                            height: 40,
                            borderRadius: '50%',
                            flexShrink: 0,
                            background: avatarColor(r.author_name),
                            color: '#fff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 700,
                            fontSize: 14,
                          }}
                        >
                          {initialsOf(r.author_name)}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 14 }}>{r.author_name}</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                            <Stars rating={r.rating} color={brandColor} size={13} />
                            <span style={{ fontSize: 12, color: MUTED }}>{r.relative_time_description}</span>
                          </div>
                        </div>
                        <span style={{ marginLeft: 'auto', fontSize: 11.5, color: MUTED, fontWeight: 600 }}>
                          Google
                        </span>
                      </div>

                      {r.text && (
                        <>
                          <p
                            style={{
                              margin: '12px 0 0',
                              fontSize: 14,
                              lineHeight: 1.65,
                              color: '#374151',
                              whiteSpace: 'pre-wrap',
                              ...(isLong && !open
                                ? {
                                    display: '-webkit-box',
                                    WebkitLineClamp: 4,
                                    WebkitBoxOrient: 'vertical' as const,
                                    overflow: 'hidden',
                                  }
                                : {}),
                            }}
                          >
                            {r.text}
                          </p>
                          {isLong && (
                            <button
                              type="button"
                              onClick={() => setExpanded(e => ({ ...e, [i]: !open }))}
                              style={{
                                marginTop: 8,
                                background: 'none',
                                border: 'none',
                                padding: 0,
                                color: brandColor,
                                fontWeight: 700,
                                fontSize: 13,
                                cursor: 'pointer',
                              }}
                            >
                              {open ? 'Show less' : 'Read more'}
                            </button>
                          )}
                        </>
                      )}
                    </article>
                  )
                })}
              </div>
            ) : (
              <div style={{ ...card, textAlign: 'center', color: MUTED, fontSize: 14 }}>
                {platform === 'all'
                  ? 'No reviews to show yet — be the first.'
                  : `No review text available from ${platformLabel(platform)}.`}
              </div>
            )}

            {reviews.length > 0 && (
              <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 12 }}>
                Reviews shown are the most recent supplied by Google, which returns up to five.
              </p>
            )}

            {reviewLink && (
              <div
                style={{
                  ...card,
                  marginTop: 20,
                  textAlign: 'center',
                  background: rgba(brandColor, 0.06),
                  borderColor: rgba(brandColor, 0.2),
                }}
              >
                <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>Had a good experience?</h2>
                <p style={{ margin: '6px 0 14px', fontSize: 13.5, color: MUTED }}>
                  Leaving a review takes about 30 seconds and helps others find {businessName}.
                </p>
                <a href={reviewLink} target="_blank" rel="noreferrer noopener" style={btn}>
                  Write a Google review
                </a>
              </div>
            )}
          </section>
        </div>

        <footer style={{ marginTop: 44, textAlign: 'center', fontSize: 11, color: '#9ca3af' }}>
          Powered by A&amp;B Consulting Group
        </footer>
      </main>

      {/* ── Floating chat widget ── */}
      {chatbotEnabled && (
        <div style={{ position: 'fixed', right: 20, bottom: 20, zIndex: 60 }}>
          {chatOpen && (
            <div
              style={{
                ...card,
                width: 300,
                marginBottom: 12,
                boxShadow: '0 12px 32px rgba(0,0,0,0.18)',
              }}
            >
              <div style={{ fontWeight: 800, fontSize: 14 }}>Questions?</div>
              <p style={{ margin: '6px 0 12px', fontSize: 13, color: MUTED, lineHeight: 1.5 }}>
                Send {businessName} a message and someone will get back to you.
              </p>
              {phone && (
                <a href={`tel:${phone.replace(/[^\d+]/g, '')}`} style={{ ...btn, display: 'block', textAlign: 'center' }}>
                  Call {phone}
                </a>
              )}
            </div>
          )}
          <button
            type="button"
            onClick={() => setChatOpen(o => !o)}
            aria-expanded={chatOpen}
            aria-label={chatOpen ? 'Close chat' : 'Open chat'}
            style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              border: 'none',
              cursor: 'pointer',
              background: brandColor,
              color: onBrand,
              boxShadow: '0 6px 20px rgba(0,0,0,0.22)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginLeft: 'auto',
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              {chatOpen ? (
                <path d="M19 6.4 17.6 5 12 10.6 6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12z" />
              ) : (
                <path d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2Z" />
              )}
            </svg>
          </button>
        </div>
      )}
    </div>
  )
}
