'use client'

// components/clients/ReputationPanel.tsx
// Reputation Management panel on the client detail page. Everything here feeds
// the public /reviews/[slug] listing, so the fields are grouped the way they
// appear on that page rather than by which column they land in.
//
// Fields save individually on blur; the Save button sends the whole set. Both
// go to PATCH /api/clients/[id]/reputation, which accepts any subset.
import { useState, useRef } from 'react'

type SocialLinks = {
  facebook?: string | null
  instagram?: string | null
  linkedin?: string | null
  youtube?: string | null
  tiktok?: string | null
}

type ReviewSource = {
  platform: string
  rating: number | null
  review_count: number | null
  url: string | null
}

type Props = {
  clientId: string
  initialLogoUrl: string | null
  initialChatbotEnabled: boolean
  initialConfig: Record<string, unknown>
}

const SOCIALS: Array<{ key: keyof SocialLinks; label: string; placeholder: string }> = [
  { key: 'facebook', label: 'Facebook', placeholder: 'https://facebook.com/yourpage' },
  { key: 'instagram', label: 'Instagram', placeholder: 'https://instagram.com/yourhandle' },
  { key: 'linkedin', label: 'LinkedIn', placeholder: 'https://linkedin.com/company/you' },
  { key: 'youtube', label: 'YouTube', placeholder: 'https://youtube.com/@yourchannel' },
  { key: 'tiktok', label: 'TikTok', placeholder: 'https://tiktok.com/@yourhandle' },
]

const PLATFORMS = ['google', 'facebook', 'yelp', 'bbb', 'trustpilot', 'angi']

const I = 'w-full border rounded px-2 py-1.5 text-sm'
const L = 'block text-[11px] font-semibold text-gray-500 mb-1'
const BORDER = { borderColor: '#e5e7eb' }

export default function ReputationPanel({
  clientId,
  initialLogoUrl,
  initialChatbotEnabled,
  initialConfig,
}: Props) {
  const cfg = initialConfig ?? {}
  const rep = (cfg.reputation ?? {}) as Record<string, unknown>
  const bot = (cfg.chatbot ?? {}) as Record<string, unknown>

  const [open, setOpen] = useState(false)
  const [logoUrl, setLogoUrl] = useState<string | null>(initialLogoUrl)
  const [chatbotEnabled, setChatbotEnabled] = useState(initialChatbotEnabled)
  const [brandColor, setBrandColor] = useState<string>(
    (bot.brand_color as string) || (cfg.brand_color as string) || '#1a2b4a'
  )
  const [placeId, setPlaceId] = useState<string>((rep.google_place_id as string) ?? '')
  const [social, setSocial] = useState<SocialLinks>((cfg.social_links ?? {}) as SocialLinks)
  const [sources, setSources] = useState<ReviewSource[]>(
    Array.isArray(cfg.review_sources) ? (cfg.review_sources as ReviewSource[]) : []
  )

  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function send(patch: Record<string, unknown>, tag: string) {
    setBusy(tag)
    setError(null)
    try {
      const res = await fetch(`/api/clients/${clientId}/reputation`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || `Save failed (${res.status})`)
      setNote(tag)
      setTimeout(() => setNote(n => (n === tag ? null : n)), 2000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setBusy(null)
    }
  }

  async function uploadLogo(file: File) {
    setBusy('logo')
    setError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(`/api/clients/${clientId}/reputation`, { method: 'POST', body: fd })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || `Upload failed (${res.status})`)
      setLogoUrl(json.logo_url)
      setNote('logo')
      setTimeout(() => setNote(n => (n === 'logo' ? null : n)), 2000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setBusy(null)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const setSource = (i: number, patch: Partial<ReviewSource>) =>
    setSources(rows => rows.map((r, n) => (n === i ? { ...r, ...patch } : r)))

  const saveAll = () =>
    send(
      {
        brand_color: brandColor,
        google_place_id: placeId,
        social_links: social,
        review_sources: sources,
        chatbot_enabled: chatbotEnabled,
      },
      'all'
    )

  return (
    <div className="border rounded-lg" style={BORDER}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2 text-left"
      >
        <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
          Reputation Management
        </span>
        <span className="text-gray-400 text-xs">{open ? '−' : '+'}</span>
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-4">
          {error && (
            <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5">
              {error}
            </div>
          )}

          {/* ── Logo ── */}
          <div>
            <label className={L}>Logo</label>
            <div className="flex items-center gap-3">
              <div
                className="w-14 h-14 rounded border flex items-center justify-center bg-gray-50 overflow-hidden shrink-0"
                style={BORDER}
              >
                {logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoUrl} alt="Logo" className="max-w-full max-h-full object-contain" />
                ) : (
                  <span className="text-[10px] text-gray-400">None</span>
                )}
              </div>
              <div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  disabled={busy === 'logo'}
                  onChange={e => {
                    const f = e.target.files?.[0]
                    if (f) uploadLogo(f)
                  }}
                  className="text-xs"
                />
                <p className="text-[10px] text-gray-400 mt-1">
                  PNG, JPEG, WebP or SVG · max 2 MB · replaces the current logo
                </p>
                {busy === 'logo' && <p className="text-[10px] text-gray-500">Uploading…</p>}
                {note === 'logo' && <p className="text-[10px] text-green-700">✓ Uploaded</p>}
              </div>
            </div>
          </div>

          {/* ── Brand colour ── */}
          <div>
            <label className={L}>Brand color</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={/^#[0-9a-fA-F]{6}$/.test(brandColor) ? brandColor : '#1a2b4a'}
                onChange={e => setBrandColor(e.target.value)}
                onBlur={() => send({ brand_color: brandColor }, 'color')}
                className="w-10 h-8 border rounded cursor-pointer"
                style={BORDER}
              />
              <input
                className={I + ' font-mono'}
                style={BORDER}
                value={brandColor}
                placeholder="#1a2b4a"
                onChange={e => setBrandColor(e.target.value)}
                onBlur={() => send({ brand_color: brandColor }, 'color')}
              />
              {note === 'color' && <span className="text-[11px] text-green-700">✓</span>}
            </div>
            <p className="text-[10px] text-gray-400 mt-1">
              Themes the public review page and the chat widget.
            </p>
          </div>

          {/* ── Google Place ID ── */}
          <div>
            <label className={L}>Google Place ID</label>
            <input
              className={I}
              style={BORDER}
              value={placeId}
              placeholder="ChIJ…"
              onChange={e => setPlaceId(e.target.value)}
              onBlur={() => send({ google_place_id: placeId }, 'place')}
            />
            {note === 'place' && <span className="text-[11px] text-green-700">✓ Saved</span>}
            <p className="text-[10px] text-gray-400 mt-1">
              Shared with the Reputation Manager panel under the service toggles — one Place ID per
              client.
            </p>
          </div>

          {/* ── Social links ── */}
          <div>
            <label className={L}>Social links</label>
            <div className="space-y-2">
              {SOCIALS.map(s => (
                <div key={s.key} className="flex items-center gap-2">
                  <span className="text-[11px] text-gray-500 w-16 shrink-0">{s.label}</span>
                  <input
                    className={I}
                    style={BORDER}
                    value={social[s.key] ?? ''}
                    placeholder={s.placeholder}
                    onChange={e => setSocial(v => ({ ...v, [s.key]: e.target.value }))}
                    onBlur={() => send({ social_links: social }, 'social')}
                  />
                </div>
              ))}
            </div>
            {note === 'social' && <span className="text-[11px] text-green-700">✓ Saved</span>}
          </div>

          {/* ── Review sources ── */}
          <div>
            <label className={L}>Review sources</label>
            {sources.length > 0 && (
              <div className="space-y-2">
                <div className="flex gap-2 text-[10px] text-gray-400 font-semibold">
                  <span className="w-24">Platform</span>
                  <span className="w-14">Rating</span>
                  <span className="w-16">Count</span>
                  <span className="flex-1">URL</span>
                  <span className="w-5" />
                </div>
                {sources.map((row, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <select
                      className={I + ' w-24'}
                      style={BORDER}
                      value={row.platform}
                      onChange={e => setSource(i, { platform: e.target.value })}
                      onBlur={() => send({ review_sources: sources }, 'sources')}
                    >
                      {PLATFORMS.map(p => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                    <input
                      className={I + ' w-14'}
                      style={BORDER}
                      type="number"
                      min={0}
                      max={5}
                      step={0.1}
                      value={row.rating ?? ''}
                      onChange={e =>
                        setSource(i, { rating: e.target.value === '' ? null : Number(e.target.value) })
                      }
                      onBlur={() => send({ review_sources: sources }, 'sources')}
                    />
                    <input
                      className={I + ' w-16'}
                      style={BORDER}
                      type="number"
                      min={0}
                      value={row.review_count ?? ''}
                      onChange={e =>
                        setSource(i, {
                          review_count: e.target.value === '' ? null : Number(e.target.value),
                        })
                      }
                      onBlur={() => send({ review_sources: sources }, 'sources')}
                    />
                    <input
                      className={I + ' flex-1'}
                      style={BORDER}
                      value={row.url ?? ''}
                      placeholder="https://…"
                      onChange={e => setSource(i, { url: e.target.value })}
                      onBlur={() => send({ review_sources: sources }, 'sources')}
                    />
                    <button
                      type="button"
                      title="Delete row"
                      onClick={() => {
                        const next = sources.filter((_, n) => n !== i)
                        setSources(next)
                        send({ review_sources: next }, 'sources')
                      }}
                      className="w-5 text-gray-400 hover:text-red-600 text-sm"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={() =>
                setSources(rows => [
                  ...rows,
                  { platform: 'google', rating: null, review_count: null, url: null },
                ])
              }
              className="mt-2 text-[11px] text-blue-700 hover:underline"
            >
              + Add row
            </button>
            {note === 'sources' && <span className="ml-2 text-[11px] text-green-700">✓ Saved</span>}
            <p className="text-[10px] text-gray-400 mt-1">
              The public page weights its overall rating by review count. Google&apos;s row is
              refreshed live from Places, so its numbers here are a fallback.
            </p>
          </div>

          {/* ── Chatbot toggle ── */}
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={chatbotEnabled}
              onChange={e => {
                setChatbotEnabled(e.target.checked)
                send({ chatbot_enabled: e.target.checked }, 'chatbot')
              }}
            />
            Chatbot enabled
            {note === 'chatbot' && <span className="text-[11px] text-green-700">✓</span>}
          </label>

          <div className="pt-1">
            <button
              type="button"
              disabled={busy === 'all'}
              onClick={saveAll}
              className="px-3 py-1.5 rounded text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: '#1a2b4a' }}
            >
              {busy === 'all' ? 'Saving…' : 'Save all'}
            </button>
            {note === 'all' && <span className="ml-2 text-xs text-green-700">✓ Saved</span>}
          </div>
        </div>
      )}
    </div>
  )
}
