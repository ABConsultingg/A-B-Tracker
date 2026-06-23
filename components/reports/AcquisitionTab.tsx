'use client'
import { useState, useEffect } from 'react'

function m$(n: number | null | undefined) {
  if (n == null) return '—'
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}
function f(n: number | null | undefined) {
  if (n == null) return '—'
  return n.toLocaleString()
}

export default function AcquisitionTab({ clientId, month }: { clientId: string; month: string }) {
  const [gads, setGads] = useState<any>(null)
  const [meta, setMeta] = useState<any>(null)
  const [lsa, setLsa]   = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      fetch(`/api/reports/google-ads?clientId=${clientId}&month=${month}`).then(r => r.json()).catch(() => null),
      fetch(`/api/reports/meta?clientId=${clientId}&month=${month}`).then(r => r.json()).catch(() => null),
      fetch(`/api/reports/culture-lsa?clientId=${clientId}&month=${month}`).then(r => r.json()).catch(() => null),
    ]).then(([g, m, l]) => {
      setGads(g?.data || null)
      setMeta(m?.data || null)
      setLsa(l?.data || null)
      setLoading(false)
    })
  }, [clientId, month])

  if (loading) return <div style={{ color: 'var(--text-muted)', fontSize: 14, padding: '32px 0' }}>Loading acquisition data…</div>

  const hasGads = gads && (gads.spend > 0 || (gads.campaigns || []).length > 0)
  const hasMeta = meta && (meta.spend > 0 || meta.conversions > 0)
  const hasLsa  = lsa && (lsa.total > 0 || lsa.cpl)

  if (!hasGads && !hasMeta && !hasLsa) {
    return <div style={{ color: 'var(--text-muted)', fontSize: 14, padding: '32px 0', textAlign: 'center' }}>No acquisition data for this period.</div>
  }

  // Build channels list
  const channels: { name: string; spend: number; conv: number; cpl: number | null; color: string }[] = []

  if (hasGads) {
    for (const c of (gads.campaigns || [])) {
      const cpl = c.conversions > 0 ? c.cost / c.conversions : null
      const color = cpl == null ? '#8a96a4' : cpl < 100 ? '#4a90c9' : cpl < 400 ? '#c25613' : '#c1373c'
      channels.push({ name: (c.account ? `[${c.account}] ` : '') + c.name, spend: c.cost, conv: c.conversions, cpl, color })
    }
  }

  if (hasMeta) {
    channels.push({
      name: 'Meta Ads',
      spend: meta.spend || 0,
      conv: meta.conversions || 0,
      cpl: meta.conversions > 0 ? meta.spend / meta.conversions : null,
      color: '#8b5cf6',
    })
  }

  const filtered = channels.filter(c => c.spend > 0 || c.conv > 0)
  const maxCPL = Math.max(...filtered.filter(c => c.cpl != null).map(c => c.cpl as number), 1)
  const bestCh  = filtered.filter(c => c.cpl != null).sort((a, b) => (a.cpl ?? 0) - (b.cpl ?? 0))[0]
  const worstCh = filtered.filter(c => c.cpl != null).sort((a, b) => (b.cpl ?? 0) - (a.cpl ?? 0))[0]
  const highCpl = filtered.filter(c => c.cpl != null && c.cpl > 400)
  const NAVY = 'var(--brand-navy, #0f1e3f)'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
        {bestCh && (
          <div className="rounded-xl border p-4" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}>
            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.7px', color: 'var(--text-muted)', fontWeight: 600, marginBottom: 4 }}>Best CPL</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#16a34a' }}>{m$(bestCh.cpl)}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{bestCh.name}</div>
          </div>
        )}
        {worstCh && (
          <div className="rounded-xl border p-4" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}>
            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.7px', color: 'var(--text-muted)', fontWeight: 600, marginBottom: 4 }}>Worst CPL</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: NAVY }}>{m$(worstCh.cpl)}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{f(worstCh.conv)} conv</div>
          </div>
        )}
        {hasGads && gads.costPerConversion > 0 && (
          <div className="rounded-xl border p-4" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}>
            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.7px', color: 'var(--text-muted)', fontWeight: 600, marginBottom: 4 }}>Blended CPL</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: NAVY }}>{m$(gads.costPerConversion)}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>All Google channels</div>
          </div>
        )}
        {hasLsa && lsa.cpl && (
          <div className="rounded-xl border p-4" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}>
            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.7px', color: 'var(--text-muted)', fontWeight: 600, marginBottom: 4 }}>LSA CPL</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: NAVY }}>{m$(lsa.cpl)}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{f(lsa.charged)} charged leads</div>
          </div>
        )}
      </div>

      {/* Channel bar chart */}
      {filtered.length > 0 && (
        <div className="rounded-xl border p-5" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>CPL by Channel</div>
            <div style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: `${NAVY}15`, color: NAVY }}>CAC when CRM connects</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {filtered.map((ch, i) => (
              <div key={i} style={{ display: 'grid', alignItems: 'center', gap: 12, gridTemplateColumns: '200px 1fr 80px 90px' }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: NAVY }}>{ch.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{f(ch.conv)} conv · {m$(ch.spend)}</div>
                </div>
                <div style={{ height: 20, borderRadius: 4, overflow: 'hidden', background: 'var(--border)' }}>
                  {ch.cpl != null && (
                    <div style={{ height: '100%', borderRadius: 4, background: ch.color, width: `${Math.max(3, (ch.cpl / maxCPL) * 100)}%` }} />
                  )}
                </div>
                <div style={{ textAlign: 'right', fontSize: 13, fontWeight: 700, color: ch.cpl == null ? 'var(--text-muted)' : ch.cpl < 100 ? '#16a34a' : ch.cpl < 400 ? '#c25613' : '#c1373c' }}>
                  {ch.cpl != null ? m$(ch.cpl) : '—'}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 6, background: ch.cpl == null ? 'var(--bg-sunken)' : ch.cpl < 100 ? '#e8f3eb' : ch.cpl < 400 ? '#fbe5d6' : '#fae3e4', color: ch.cpl == null ? 'var(--text-muted)' : ch.cpl < 100 ? '#16a34a' : ch.cpl < 400 ? '#c25613' : '#c1373c' }}>
                    {ch.cpl == null ? 'New' : ch.cpl < 100 ? '✓ Good' : ch.cpl < 400 ? '⚠ Watch' : '✕ Pause'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* High CPL alert */}
      {highCpl.length > 0 && (
        <div style={{ padding: '12px 16px', borderRadius: 10, background: '#fae3e4', border: '1px solid #f9a8a8' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#c1373c', marginBottom: 4 }}>
            ⚠️ {highCpl.length} campaign{highCpl.length > 1 ? 's' : ''} with CPL over $400
          </div>
          <div style={{ fontSize: 12, color: '#c1373c' }}>
            {highCpl.map(c => `${c.name}: ${m$(c.spend)} spent · ${f(c.conv)} conv · ${m$(c.cpl)} CPL`).join(' · ')}
          </div>
        </div>
      )}

      {/* CAC coming soon */}
      <div className="rounded-xl border p-4" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)', borderStyle: 'dashed' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: NAVY, marginBottom: 4 }}>🔗 True CAC — Coming soon</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          CPL → CAC requires CRM data (signed contracts per channel) + Cira.ai call data. Once connected: revenue per channel, ROAS, close rate, and cost per signed contract.
        </div>
      </div>
    </div>
  )
}
