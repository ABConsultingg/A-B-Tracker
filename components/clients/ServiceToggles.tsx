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
  seo?: {
    seo_frequency?: string
    github_repo?: string | null
    target_keywords?: string[]
    seo_notification_email?: string | null
  }
  reputation?: {
    google_place_id?: string | null
    review_platforms?: string[]
    review_request_sms_template?: string
    review_request_email_template?: string
    review_trigger?: string
    aggregation_page_enabled?: boolean
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
  { key: 'seo_agent_enabled',       label: 'SEO Agent',         hint: 'Automated SEO work',                         panel: 'seo' },
  { key: 'reputation_mgmt_enabled', label: 'Reputation Manager', hint: 'Review requests and the public review page', panel: 'reputation' },
] as const

const DAYS: Array<[string, string]> = [
  ['mon', 'Mon'], ['tue', 'Tue'], ['wed', 'Wed'], ['thu', 'Thu'],
  ['fri', 'Fri'], ['sat', 'Sat'], ['sun', 'Sun'],
]

const L = 'block text-[11px] font-semibold text-gray-500 uppercase mb-1'
const I = 'w-full rounded border px-2 py-1.5 text-sm'
const BORDER = { borderColor: '#e5e7eb' }

// Mirrors DEFAULT_REVIEW_SMS in lib/reviews/defaults.ts
const DEFAULT_TEMPLATE =
  "Hi {customer_name}, thank you for choosing {business_name}! We'd love your feedback — it only takes 30 seconds: {review_link}"

/** Admin/owner only — the parent decides whether to render this at all. */
export default function ServiceToggles({
  clientId,
  initial,
  initialConfig = {},
  initialDomains = [],
  twilioNumber = null,
}: {
  clientId: string
  initial: AiServiceFlags
  initialConfig?: AiServiceConfig
  initialDomains?: string[]
  /** Read-only: assigned in call_intelligence_clients, not editable here. */
  twilioNumber?: string | null
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

  const seo = cfg.seo ?? {}
  const rep = cfg.reputation ?? {}
  const setSeo = (patch: Record<string, unknown>) =>
    setCfg(c => ({ ...c, seo: { ...(c.seo ?? {}), ...patch } }))
  const setRep = (patch: Record<string, unknown>) =>
    setCfg(c => ({ ...c, reputation: { ...(c.reputation ?? {}), ...patch } }))

  const platforms = rep.review_platforms ?? []
  const togglePlatform = (name: string, on: boolean) =>
    setRep({
      review_platforms: on
        ? Array.from(new Set([...platforms, name]))
        : platforms.filter(p => p !== name),
    })

  // Derived, never stored — they must not drift from place id / slug.
  const reviewLink = rep.google_place_id
    ? `https://search.google.com/local/writereview?placeid=${rep.google_place_id}`
    : ''
  const aggUrl = `app.abconsultingg.com/reviews/${clientId}`

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

                  <div className="mt-3">
                    <label className={L}>
                      Twilio number
                      <span className="ml-1 font-normal normal-case text-gray-400">— assigned, read-only</span>
                    </label>
                    <input className={I + ' bg-gray-100 text-gray-500'} style={BORDER} readOnly
                      value={twilioNumber ?? 'Not assigned'} />
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
                      <div className="flex gap-2 items-center">
                        <input type="color" className="h-8 w-10 rounded border" style={BORDER}
                          value={/^#[0-9a-fA-F]{6}$/.test(bot.brand_color ?? '') ? (bot.brand_color as string) : '#1a2b4a'}
                          onChange={e => setBot({ brand_color: e.target.value })} />
                        <input className={I} style={BORDER} value={bot.brand_color ?? ''}
                          placeholder="#1a2b4a"
                          onChange={e => setBot({ brand_color: e.target.value })} />
                      </div>
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

              {/* ── SEO Agent settings ── */}
              {expanded && s.panel === 'seo' && (
                <div className="ml-12 mt-3 mb-2 p-3 rounded-lg bg-gray-50 border" style={BORDER}>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={L}>Frequency</label>
                      <select className={I} style={BORDER} value={seo.seo_frequency ?? 'monthly'}
                        onChange={e => setSeo({ seo_frequency: e.target.value })}>
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                      </select>
                    </div>
                    <div>
                      <label className={L}>Notification email</label>
                      <input className={I} style={BORDER} value={seo.seo_notification_email ?? ''}
                        placeholder="seo@abconsultingg.com"
                        onChange={e => setSeo({ seo_notification_email: e.target.value })} />
                    </div>
                  </div>
                  <div className="mt-3">
                    <label className={L}>GitHub repo</label>
                    <input className={I} style={BORDER} value={seo.github_repo ?? ''}
                      placeholder="Adrian-AB-17/culture-construction"
                      onChange={e => setSeo({ github_repo: e.target.value })} />
                  </div>
                  <div className="mt-3">
                    <label className={L}>
                      Target keywords
                      <span className="ml-1 font-normal normal-case text-gray-400">— comma separated</span>
                    </label>
                    <textarea className={I} style={BORDER} rows={2}
                      value={(seo.target_keywords ?? []).join(', ')}
                      placeholder="roofing chicago, storm damage repair"
                      onChange={e => setSeo({ target_keywords: e.target.value.split(',').map(k => k.trim()).filter(Boolean) })} />
                  </div>
                  <button type="button" disabled={busy === 'seo'}
                    onClick={() => send({ config: { seo } }, 'seo')}
                    className="mt-3 px-3 py-1.5 rounded text-sm font-semibold text-white disabled:opacity-50"
                    style={{ background: '#1a2b4a' }}>
                    {busy === 'seo' ? 'Saving…' : 'Save SEO settings'}
                  </button>
                  {savedNote === 'seo' && <span className="ml-2 text-xs text-green-700">✓ Saved</span>}
                </div>
              )}

              {/* ── Reputation Manager settings ── */}
              {expanded && s.panel === 'reputation' && (
                <div className="ml-12 mt-3 mb-2 p-3 rounded-lg bg-gray-50 border" style={BORDER}>
                  <div>
                    <label className={L}>Google Place ID</label>
                    <input className={I} style={BORDER} value={rep.google_place_id ?? ''}
                      placeholder="ChIJ..."
                      onChange={e => setRep({ google_place_id: e.target.value })} />
                  </div>

                  <div className="mt-3">
                    <label className={L}>
                      Review link
                      <span className="ml-1 font-normal normal-case text-gray-400">— generated from the Place ID</span>
                    </label>
                    <input className={I + ' bg-gray-100 text-gray-500'} style={BORDER} readOnly
                      value={reviewLink || 'Enter a Place ID to generate'} />
                  </div>

                  <div className="mt-3">
                    <label className={L}>Platforms</label>
                    <div className="flex flex-wrap gap-3">
                      {[['google','Google'],['yelp','Yelp'],['bbb','BBB'],['facebook','Facebook']].map(([id,lbl]) => (
                        <label key={id} className="flex items-center gap-1.5 text-sm text-gray-700">
                          <input type="checkbox" checked={platforms.includes(id)}
                            onChange={e => togglePlatform(id, e.target.checked)} />
                          {lbl}
                        </label>
                      ))}
                    </div>
                    <p className="text-[11px] text-gray-400 mt-1">
                      The public page shows Google reviews only for now; the others are recorded for later.
                    </p>
                  </div>

                  <div className="mt-3">
                    <label className={L}>SMS request template</label>
                    <textarea className={I} style={BORDER} rows={3}
                      value={rep.review_request_sms_template ?? DEFAULT_TEMPLATE}
                      onChange={e => setRep({ review_request_sms_template: e.target.value })} />
                  </div>
                  <div className="mt-3">
                    <label className={L}>Email request template</label>
                    <textarea className={I} style={BORDER} rows={3}
                      value={rep.review_request_email_template ?? DEFAULT_TEMPLATE}
                      onChange={e => setRep({ review_request_email_template: e.target.value })} />
                  </div>
                  <p className="text-[11px] text-gray-400 mt-1">
                    Placeholders: {'{customer_name}'}, {'{business_name}'}, {'{review_link}'}
                  </p>

                  <div className="mt-3">
                    <label className={L}>Request trigger</label>
                    <select className={I} style={BORDER} value={rep.review_trigger ?? 'manual'}
                      onChange={e => setRep({ review_trigger: e.target.value })}>
                      <option value="manual">Manual</option>
                      <option value="after_wo_completion">After WO completion</option>
                      <option value="automated_3_day">Automated (3-day delay)</option>
                    </select>
                    <p className="text-[11px] text-amber-700 mt-1">
                      Sending is not built yet — this records the intent only.
                    </p>
                  </div>

                  <label className="flex items-center gap-2 mt-3 text-sm text-gray-700">
                    <input type="checkbox" checked={rep.aggregation_page_enabled === true}
                      onChange={e => setRep({ aggregation_page_enabled: e.target.checked })} />
                    Publish the public review page
                  </label>

                  <div className="mt-2">
                    <label className={L}>Public page</label>
                    <input className={I + ' bg-gray-100 text-gray-500'} style={BORDER} readOnly value={aggUrl} />
                    <div className="flex gap-3 mt-1">
                      <a href={`/reviews/${clientId}`} target="_blank" rel="noreferrer"
                        className="text-[11px] text-blue-700 hover:underline">Open page</a>
                      <a href={`/reviews/${clientId}/qr`}
                        className="text-[11px] text-blue-700 hover:underline">Download QR (PNG)</a>
                    </div>
                  </div>

                  <button type="button" disabled={busy === 'reputation'}
                    onClick={() => send({ config: { reputation: rep } }, 'reputation')}
                    className="mt-3 px-3 py-1.5 rounded text-sm font-semibold text-white disabled:opacity-50"
                    style={{ background: '#1a2b4a' }}>
                    {busy === 'reputation' ? 'Saving…' : 'Save reputation settings'}
                  </button>
                  {savedNote === 'reputation' && <span className="ml-2 text-xs text-green-700">✓ Saved</span>}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
