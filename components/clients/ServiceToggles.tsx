'use client'
import { useState } from 'react'

export type TransferContact = { name: string; phone: string }

export type AiServiceConfig = {
  receptionist?: {
    name?: string
    tone?: string
    transfer_contacts?: TransferContact[]
    business_hours?: Record<string, { open?: string; close?: string; closed?: boolean }>
    after_hours_behavior?: string
  }
  chatbot?: {
    bot_name?: string
    greeting?: string
    cta_text?: string
    brand_color?: string | null
    booking_enabled?: boolean
  }
}

export type AiServiceFlags = {
  chatbot_enabled?: boolean | null
  receptionist_enabled?: boolean | null
  seo_agent_enabled?: boolean | null
  reputation_mgmt_enabled?: boolean | null
}

const SERVICES = [
  { key: 'chatbot_enabled',         label: 'Website Chatbot',   hint: 'Chat widget answers visitors on their site', panel: 'chatbot' },
  { key: 'receptionist_enabled',    label: 'AI Receptionist',   hint: 'Alex answers inbound phone calls',           panel: 'receptionist' },
  { key: 'seo_agent_enabled',       label: 'SEO Agent',         hint: 'Automated SEO work',                         panel: null },
  { key: 'reputation_mgmt_enabled', label: 'Reputation Mgmt',   hint: 'Review monitoring and responses',            panel: null },
] as const

const DAYS: Array<[string, string]> = [
  ['mon', 'Mon'], ['tue', 'Tue'], ['wed', 'Wed'], ['thu', 'Thu'],
  ['fri', 'Fri'], ['sat', 'Sat'], ['sun', 'Sun'],
]

const L = 'block text-[11px] font-semibold text-gray-500 uppercase mb-1'
const I = 'w-full rounded border px-2 py-1.5 text-sm'
const BORDER = { borderColor: '#e5e7eb' }

/** Admin/owner only — the parent decides whether to render this at all. */
export default function ServiceToggles({
  clientId,
  initial,
  initialConfig = {},
  initialDomains = [],
}: {
  clientId: string
  initial: AiServiceFlags
  initialConfig?: AiServiceConfig
  initialDomains?: string[]
}) {
  const [flags, setFlags] = useState<AiServiceFlags>(initial)
  const [cfg, setCfg] = useState<AiServiceConfig>(initialConfig)
  const [domains, setDomains] = useState<string>(initialDomains.join(', '))
  const [open, setOpen] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [savedNote, setSavedNote] = useState<string | null>(null)

  async function send(payload: Record<string, unknown>, tag: string) {
    setBusy(tag)
    setError(null)
    try {
      const res = await fetch(`/api/clients/${clientId}/ai-services`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const b = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(b.error || `Failed (${res.status})`)
      // Trust the server's normalised copy over local state.
      if (b.client?.ai_service_config) setCfg(b.client.ai_service_config)
      setSavedNote(tag)
      setTimeout(() => setSavedNote(n => (n === tag ? null : n)), 2000)
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save')
      return false
    } finally {
      setBusy(null)
    }
  }

  async function toggle(key: string, next: boolean) {
    const prev = flags
    setFlags(f => ({ ...f, [key]: next }))
    const ok = await send({ [key]: next }, key)
    if (!ok) setFlags(prev)
    else if (next) setOpen(key) // opening the panel is the natural next step
  }

  const rec = cfg.receptionist ?? {}
  const bot = cfg.chatbot ?? {}
  const setRec = (patch: Record<string, unknown>) =>
    setCfg(c => ({ ...c, receptionist: { ...(c.receptionist ?? {}), ...patch } }))
  const setBot = (patch: Record<string, unknown>) =>
    setCfg(c => ({ ...c, chatbot: { ...(c.chatbot ?? {}), ...patch } }))

  const contacts: TransferContact[] = rec.transfer_contacts ?? []
  const hours = rec.business_hours ?? {}

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
          const expanded = on && s.panel && open === s.key
          return (
            <div key={s.key}>
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  onClick={() => toggle(s.key, !on)}
                  disabled={busy === s.key}
                  aria-pressed={on}
                  className="mt-0.5 relative inline-flex h-5 w-9 flex-shrink-0 rounded-full transition-colors disabled:opacity-50"
                  style={{ background: on ? '#16a34a' : '#d1d5db' }}
                >
                  <span
                    className="absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform"
                    style={{ transform: on ? 'translateX(18px)' : 'translateX(2px)' }}
                  />
                </button>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-gray-900 flex items-center gap-2">
                    {s.label}
                    {busy === s.key && <span className="text-[10px] text-gray-400">saving…</span>}
                    {savedNote === s.key && <span className="text-[10px] text-green-700">✓</span>}
                  </div>
                  <div className="text-[11px] text-gray-500">{s.hint}</div>
                </div>
                {on && s.panel && (
                  <button
                    type="button"
                    onClick={() => setOpen(o => (o === s.key ? null : s.key))}
                    className="text-[11px] text-blue-700 hover:underline flex-shrink-0"
                  >
                    {expanded ? 'Hide settings' : 'Settings'}
                  </button>
                )}
              </div>

              {/* ── AI Receptionist settings ── */}
              {expanded && s.panel === 'receptionist' && (
                <div className="ml-12 mt-3 mb-2 p-3 rounded-lg bg-gray-50 border" style={BORDER}>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={L}>Receptionist name</label>
                      <input className={I} style={BORDER} value={rec.name ?? 'Alex'}
                        onChange={e => setRec({ name: e.target.value })} />
                    </div>
                    <div>
                      <label className={L}>Tone</label>
                      <select className={I} style={BORDER} value={rec.tone ?? 'professional'}
                        onChange={e => setRec({ tone: e.target.value })}>
                        <option value="professional">Professional</option>
                        <option value="friendly">Friendly</option>
                        <option value="casual">Casual</option>
                      </select>
                    </div>
                  </div>

                  <div className="mt-3">
                    <label className={L}>After hours</label>
                    <select className={I} style={BORDER} value={rec.after_hours_behavior ?? 'voicemail'}
                      onChange={e => setRec({ after_hours_behavior: e.target.value })}>
                      <option value="voicemail">Take a voicemail</option>
                      <option value="transfer">Transfer the call</option>
                      <option value="both">Try transfer, then voicemail</option>
                    </select>
                  </div>

                  <div className="mt-3">
                    <label className={L}>Transfer contacts</label>
                    {contacts.length === 0 && (
                      <p className="text-[11px] text-gray-400 mb-1">None yet.</p>
                    )}
                    {contacts.map((c, i) => (
                      <div key={i} className="flex gap-2 mb-1.5">
                        <input className={I} style={BORDER} placeholder="Name" value={c.name}
                          onChange={e => setRec({
                            transfer_contacts: contacts.map((x, j) => j === i ? { ...x, name: e.target.value } : x),
                          })} />
                        <input className={I} style={BORDER} placeholder="+1 708 555 0000" value={c.phone}
                          onChange={e => setRec({
                            transfer_contacts: contacts.map((x, j) => j === i ? { ...x, phone: e.target.value } : x),
                          })} />
                        <button type="button" className="px-2 text-red-600 text-sm"
                          onClick={() => setRec({ transfer_contacts: contacts.filter((_, j) => j !== i) })}>
                          ×
                        </button>
                      </div>
                    ))}
                    <button type="button" className="text-[11px] text-blue-700 hover:underline"
                      onClick={() => setRec({ transfer_contacts: [...contacts, { name: '', phone: '' }] })}>
                      + Add contact
                    </button>
                  </div>

                  <div className="mt-3">
                    <label className={L}>Business hours</label>
                    <div className="space-y-1">
                      {DAYS.map(([d, lbl]) => {
                        const row = hours[d] ?? {}
                        const closed = row.closed === true
                        return (
                          <div key={d} className="flex items-center gap-2 text-sm">
                            <span className="w-9 text-gray-600">{lbl}</span>
                            <input type="time" className="rounded border px-1.5 py-1 text-sm" style={BORDER}
                              value={row.open ?? '08:00'} disabled={closed}
                              onChange={e => setRec({ business_hours: { ...hours, [d]: { ...row, open: e.target.value } } })} />
                            <span className="text-gray-400">–</span>
                            <input type="time" className="rounded border px-1.5 py-1 text-sm" style={BORDER}
                              value={row.close ?? '17:00'} disabled={closed}
                              onChange={e => setRec({ business_hours: { ...hours, [d]: { ...row, close: e.target.value } } })} />
                            <label className="flex items-center gap-1 text-[11px] text-gray-500 ml-1">
                              <input type="checkbox" checked={closed}
                                onChange={e => setRec({ business_hours: { ...hours, [d]: { ...row, closed: e.target.checked } } })} />
                              closed
                            </label>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  <button type="button" disabled={busy === 'receptionist'}
                    onClick={() => send({ config: { receptionist: rec } }, 'receptionist')}
                    className="mt-3 px-3 py-1.5 rounded text-sm font-semibold text-white disabled:opacity-50"
                    style={{ background: '#1a2b4a' }}>
                    {busy === 'receptionist' ? 'Saving…' : 'Save receptionist settings'}
                  </button>
                  {savedNote === 'receptionist' && (
                    <span className="ml-2 text-xs text-green-700">✓ Saved</span>
                  )}
                </div>
              )}

              {/* ── Chatbot settings ── */}
              {expanded && s.panel === 'chatbot' && (
                <div className="ml-12 mt-3 mb-2 p-3 rounded-lg bg-gray-50 border" style={BORDER}>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={L}>Bot name</label>
                      <input className={I} style={BORDER} value={bot.bot_name ?? ''}
                        placeholder="Assistant"
                        onChange={e => setBot({ bot_name: e.target.value })} />
                    </div>
                    <div>
                      <label className={L}>Brand colour</label>
                      <input className={I} style={BORDER} value={bot.brand_color ?? ''}
                        placeholder="#1a2b4a"
                        onChange={e => setBot({ brand_color: e.target.value })} />
                    </div>
                  </div>

                  <div className="mt-3">
                    <label className={L}>Greeting</label>
                    <textarea className={I} style={BORDER} rows={2} value={bot.greeting ?? ''}
                      placeholder="Hi! Can I help you find something?"
                      onChange={e => setBot({ greeting: e.target.value })} />
                  </div>

                  <div className="mt-3">
                    <label className={L}>CTA text</label>
                    <input className={I} style={BORDER} value={bot.cta_text ?? ''}
                      placeholder="Book a call"
                      onChange={e => setBot({ cta_text: e.target.value })} />
                  </div>

                  <label className="flex items-center gap-2 mt-3 text-sm text-gray-700">
                    <input type="checkbox" checked={bot.booking_enabled === true}
                      onChange={e => setBot({ booking_enabled: e.target.checked })} />
                    Allow booking from the chat
                  </label>

                  <div className="mt-3">
                    <label className={L}>
                      Website domains
                      <span className="ml-1 font-normal normal-case text-gray-400">
                        — comma separated. This is what matches the visitor&apos;s site to this client.
                      </span>
                    </label>
                    <input className={I} style={BORDER} value={domains}
                      placeholder="cultureccc.com, cultureconstruction.com"
                      onChange={e => setDomains(e.target.value)} />
                  </div>

                  <button type="button" disabled={busy === 'chatbot'}
                    onClick={() => send({
                      config: { chatbot: bot },
                      website_domain: domains.split(',').map(d => d.trim()).filter(Boolean),
                    }, 'chatbot')}
                    className="mt-3 px-3 py-1.5 rounded text-sm font-semibold text-white disabled:opacity-50"
                    style={{ background: '#1a2b4a' }}>
                    {busy === 'chatbot' ? 'Saving…' : 'Save chatbot settings'}
                  </button>
                  {savedNote === 'chatbot' && (
                    <span className="ml-2 text-xs text-green-700">✓ Saved</span>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
