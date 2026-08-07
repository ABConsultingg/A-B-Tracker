'use client'
import { useEffect, useState } from 'react'

export type BrandProfile = {
  id?: string
  client_id?: string | null
  client_name?: string | null
  brand_voice?: string | null
  tone_words?: string[] | null
  avoid_words?: string[] | null
  what_makes_different?: string | null
  key_services?: string | null
  service_area?: string | null
  target_audience?: string | null
  ideal_customer?: string | null
  customer_problem?: string | null
  social_proof?: string | null
  awards?: string | null
  cta_style?: string | null
  content_pillars?: string[] | null
  topics_to_avoid?: string | null
}

const csv = (v: string[] | null | undefined) => (v && v.length ? v.join(', ') : '')

type Draft = Record<string, string>

function draftFrom(p: BrandProfile | null): Draft {
  return {
    brand_voice: p?.brand_voice ?? '',
    tone_words: csv(p?.tone_words),
    avoid_words: csv(p?.avoid_words),
    what_makes_different: p?.what_makes_different ?? '',
    key_services: p?.key_services ?? '',
    service_area: p?.service_area ?? '',
    target_audience: p?.target_audience ?? '',
    ideal_customer: p?.ideal_customer ?? '',
    customer_problem: p?.customer_problem ?? '',
    social_proof: p?.social_proof ?? '',
    awards: p?.awards ?? '',
    cta_style: p?.cta_style ?? '',
    content_pillars: csv(p?.content_pillars),
    topics_to_avoid: p?.topics_to_avoid ?? '',
  }
}

const FIELDS: Array<{ key: keyof Draft & string; label: string; hint?: string; rows?: number }> = [
  { key: 'brand_voice',          label: 'Brand voice',        hint: 'How they sound — e.g. warm, direct, no jargon', rows: 2 },
  { key: 'tone_words',           label: 'Tone words',         hint: 'Comma separated' },
  { key: 'avoid_words',          label: 'Words to avoid',     hint: 'Comma separated' },
  { key: 'what_makes_different', label: 'What makes them different', rows: 2 },
  { key: 'key_services',         label: 'Key services',       hint: 'What they sell, in their words', rows: 2 },
  { key: 'service_area',         label: 'Service area',       hint: 'Cities / radius the receptionist can quote' },
  { key: 'target_audience',      label: 'Target audience' },
  { key: 'ideal_customer',       label: 'Ideal customer' },
  { key: 'customer_problem',     label: 'Customer problem',   rows: 2 },
  { key: 'social_proof',         label: 'Social proof',       hint: 'Reviews, volume, notable jobs', rows: 2 },
  { key: 'awards',               label: 'Awards' },
  { key: 'cta_style',            label: 'CTA style',          hint: 'How they ask for the next step' },
  { key: 'content_pillars',      label: 'Content pillars',    hint: 'Comma separated' },
  { key: 'topics_to_avoid',      label: 'Topics to avoid',    rows: 2 },
]

/**
 * Edits the client's social_brand_profiles row — the single source the chatbot,
 * receptionist, Social Hub and Pancho all read from. Saving here changes what
 * every one of them knows.
 */
export default function BrandProfileSection({
  clientId,
  clientName,
  initial,
}: {
  clientId: string
  clientName: string
  initial: BrandProfile | null
}) {
  const [open, setOpen] = useState(false)
  const [d, setD] = useState<Draft>(() => draftFrom(initial))
  const [saved, setSaved] = useState<Draft>(() => draftFrom(initial))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState(false)

  // Re-seed when a different client is selected.
  useEffect(() => {
    const next = draftFrom(initial)
    setD(next)
    setSaved(next)
    setError(null)
    setOk(false)
  }, [clientId, initial])

  const dirty = JSON.stringify(d) !== JSON.stringify(saved)
  const filled = Object.values(saved).filter(v => v.trim()).length

  async function save() {
    setSaving(true)
    setError(null)
    setOk(false)
    try {
      const res = await fetch(`/api/clients/${clientId}/brand-profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...d, client_name: initial?.client_name || clientName }),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        throw new Error(b.error || `Save failed (${res.status})`)
      }
      setSaved(d)
      setOk(true)
      setTimeout(() => setOk(false), 2500)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-6 border-t pt-5">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 text-left"
      >
        <span className="text-xs text-gray-400">{open ? '▾' : '▸'}</span>
        <h3 className="text-xs font-semibold text-gray-500 uppercase flex-1">
          Brand Profile
        </h3>
        <span className="text-[10px] text-gray-400">
          {initial ? `${filled}/${FIELDS.length} fields` : 'not set up'}
        </span>
      </button>

      {!open && (
        <p className="text-[11px] text-gray-400 mt-1 ml-5">
          Powers the chatbot, AI receptionist, Social Hub and Pancho.
        </p>
      )}

      {open && (
        <div className="mt-3">
          <p className="text-[11px] text-gray-500 mb-3">
            One source of truth. Saving updates what the chatbot, AI receptionist,
            Social Hub and Pancho all know about {clientName}.
          </p>

          {error && (
            <div className="mb-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5">
              {error}
            </div>
          )}

          <div className="space-y-3">
            {FIELDS.map(f => (
              <div key={f.key}>
                <label className="block text-[11px] font-semibold text-gray-500 uppercase mb-1">
                  {f.label}
                  {f.hint && <span className="ml-1 font-normal normal-case text-gray-400">— {f.hint}</span>}
                </label>
                {f.rows ? (
                  <textarea
                    value={d[f.key]}
                    onChange={e => setD(s => ({ ...s, [f.key]: e.target.value }))}
                    rows={f.rows}
                    className="w-full rounded border px-2 py-1.5 text-sm"
                    style={{ borderColor: 'var(--border, #e5e7eb)' }}
                  />
                ) : (
                  <input
                    type="text"
                    value={d[f.key]}
                    onChange={e => setD(s => ({ ...s, [f.key]: e.target.value }))}
                    className="w-full rounded border px-2 py-1.5 text-sm"
                    style={{ borderColor: 'var(--border, #e5e7eb)' }}
                  />
                )}
              </div>
            ))}
          </div>

          <div className="flex items-center gap-3 mt-4">
            <button
              type="button"
              onClick={save}
              disabled={!dirty || saving}
              className="px-4 py-2 rounded-md text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: '#1a2b4a' }}
            >
              {saving ? 'Saving…' : dirty ? 'Save brand profile' : 'Saved'}
            </button>
            {ok && <span className="text-xs text-green-700">✓ Updated everywhere</span>}
          </div>
        </div>
      )}
    </div>
  )
}
