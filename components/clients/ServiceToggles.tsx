'use client'
import { useState } from 'react'

export type AiServiceFlags = {
  chatbot_enabled?: boolean | null
  receptionist_enabled?: boolean | null
  seo_agent_enabled?: boolean | null
  reputation_mgmt_enabled?: boolean | null
}

const SERVICES = [
  { key: 'chatbot_enabled',         label: 'Website Chatbot',   hint: 'Chat widget answers visitors on their site' },
  { key: 'receptionist_enabled',    label: 'AI Receptionist',   hint: 'Alex answers inbound phone calls' },
  { key: 'seo_agent_enabled',       label: 'SEO Agent',         hint: 'Automated SEO work' },
  { key: 'reputation_mgmt_enabled', label: 'Reputation Mgmt',   hint: 'Review monitoring and responses' },
] as const

/**
 * Admin/owner only — the parent decides whether to render this at all.
 * Each toggle turns on behaviour aimed at the client's own customers, so it is
 * saved immediately and reverted in place if the request fails.
 */
export default function ServiceToggles({
  clientId,
  initial,
}: {
  clientId: string
  initial: AiServiceFlags
}) {
  const [flags, setFlags] = useState<AiServiceFlags>(initial)
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function toggle(key: string, next: boolean) {
    const prev = flags
    setFlags(f => ({ ...f, [key]: next }))
    setSaving(key)
    setError(null)
    try {
      const res = await fetch(`/api/clients/${clientId}/ai-services`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: next }),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        throw new Error(b.error || `Failed (${res.status})`)
      }
    } catch (e) {
      setFlags(prev)
      setError(e instanceof Error ? e.message : 'Could not save')
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="mt-6 border-t pt-5">
      <div className="flex items-baseline justify-between mb-1">
        <h3 className="text-xs font-semibold text-gray-500 uppercase">AI Services</h3>
        <span className="text-[10px] text-gray-400">admin &amp; owner only</span>
      </div>
      <p className="text-[11px] text-gray-400 mb-3">
        Off by default. Turning one on lets it act toward this client&apos;s customers.
      </p>

      {error && (
        <div className="mb-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5">
          {error}
        </div>
      )}

      <div className="space-y-2">
        {SERVICES.map(s => {
          const on = flags[s.key as keyof AiServiceFlags] === true
          return (
            <label
              key={s.key}
              className="flex items-start gap-3 cursor-pointer group"
            >
              <button
                type="button"
                onClick={() => toggle(s.key, !on)}
                disabled={saving === s.key}
                aria-pressed={on}
                className="mt-0.5 relative inline-flex h-5 w-9 flex-shrink-0 rounded-full transition-colors disabled:opacity-50"
                style={{ background: on ? '#16a34a' : '#d1d5db' }}
              >
                <span
                  className="absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform"
                  style={{ transform: on ? 'translateX(18px)' : 'translateX(2px)' }}
                />
              </button>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-gray-900">
                  {s.label}
                  {saving === s.key && <span className="ml-2 text-[10px] text-gray-400">saving…</span>}
                </span>
                <span className="block text-[11px] text-gray-500">{s.hint}</span>
              </span>
            </label>
          )
        })}
      </div>
    </div>
  )
}
