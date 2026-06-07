'use client'
import { useState, useEffect } from 'react'

export type Embed =
  | { kind: 'image'; url: string }
  | { kind: 'iframe'; url: string }
  | null

export function buildEmbed(raw: string): Embed {
  let url: URL
  try { url = new URL(raw) } catch { return null }
  const href = url.href
  const host = url.hostname.replace(/^www\./, '')
  const path = url.pathname
  const lower = href.split('?')[0].toLowerCase()

  if (/\.(jpe?g|png|gif|webp|bmp|svg)$/.test(lower)) return { kind: 'image', url: href }
  if (/\.pdf$/.test(lower)) return { kind: 'iframe', url: href }

  if (host === 'docs.google.com' && path.includes('/presentation/')) {
    const m = path.match(/\/presentation\/d\/([^/]+)/)
    if (m) return { kind: 'iframe', url: `https://docs.google.com/presentation/d/${m[1]}/embed?start=false&loop=false` }
  }
  if (host === 'drive.google.com') {
    const m = path.match(/\/file\/d\/([^/]+)/)
    if (m) return { kind: 'iframe', url: `https://drive.google.com/file/d/${m[1]}/preview` }
    const id = url.searchParams.get('id')
    if (id) return { kind: 'iframe', url: `https://drive.google.com/file/d/${id}/preview` }
  }
  if (host === 'docs.google.com' && (path.includes('/document/') || path.includes('/spreadsheets/'))) {
    const m = path.match(/\/d\/([^/]+)/)
    const seg = path.includes('/document/') ? 'document' : 'spreadsheets'
    if (m) return { kind: 'iframe', url: `https://docs.google.com/${seg}/d/${m[1]}/preview` }
  }
  if (host === 'dropbox.com' || host.endsWith('.dropbox.com')) {
    // Dropbox blocks iframes and hijacks navigation — always show as plain link
    return null
  }
  return null
}

function Frame({ embed, height, onError }: { embed: Exclude<Embed, null>; height: number | string; onError: () => void }) {
  if (embed.kind === 'image') {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={embed.url} alt="Deliverable preview" onError={onError}
      style={{ display: 'block', width: '100%', height, maxHeight: height, objectFit: 'contain', background: 'var(--bg-sunken, #faf9f6)' }} />
  }
  return <iframe src={embed.url} title="Deliverable preview" onError={onError}
    style={{ display: 'block', width: '100%', height, border: 'none', background: 'var(--bg-sunken, #faf9f6)' }} allow="autoplay" />
}

export function DeliverablePreview({ link, label = 'Deliverable' }: { link: string; label?: string }) {
  const [failed, setFailed] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const embed = buildEmbed(link)

  useEffect(() => {
    if (!expanded) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setExpanded(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [expanded])

  if (!embed || failed) {
    return (
      <div style={{ background: 'var(--bg-sunken, #f5f5f0)', border: '2px dashed var(--border, #d5d2c5)',
                    borderRadius: 10, padding: 24, textAlign: 'center' }}>
        <a href={link} target="_blank" rel="noopener"
           style={{ color: 'var(--accent, #b8851e)', fontWeight: 600, textDecoration: 'none' }}>
          📎 Open the deliverable →
        </a>
        <div style={{ fontSize: 11, color: 'var(--text-muted, #a3a097)', marginTop: 8 }}>
          Preview not available for this link — opens in a new tab.
        </div>
      </div>
    )
  }

  return (
    <>
      <div>
        <div style={{ background: '#fff', border: '1px solid var(--border, #e8e6dd)', borderRadius: 10, overflow: 'hidden' }}>
          <Frame embed={embed} height={420} onError={() => setFailed(true)} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 14, marginTop: 6 }}>
          <button onClick={() => setExpanded(true)}
            style={{ color: 'var(--accent, #b8851e)', fontWeight: 600, fontSize: 13, background: 'none', border: 'none', cursor: 'pointer' }}>
            ⛶ Expand
          </button>
          <a href={link} target="_blank" rel="noopener"
             style={{ color: 'var(--accent, #b8851e)', fontWeight: 600, fontSize: 13, textDecoration: 'none' }}>
            Open full size ↗
          </a>
        </div>
      </div>

      {expanded && (
        <div onClick={e => { if (e.target === e.currentTarget) setExpanded(false) }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(8,12,24,0.85)', zIndex: 200,
                   display: 'flex', flexDirection: 'column', padding: '3vh 3vw' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ color: 'white', fontWeight: 600, fontSize: 14 }}>{label}</span>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
              <a href={link} target="_blank" rel="noopener" style={{ color: '#e7c46b', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
                Open full size ↗
              </a>
              <button onClick={() => setExpanded(false)}
                style={{ color: 'white', background: 'none', border: 'none', fontSize: 26, lineHeight: 1, cursor: 'pointer' }}>×</button>
            </div>
          </div>
          <div style={{ flex: 1, background: '#fff', borderRadius: 10, overflow: 'hidden' }}>
            <Frame embed={embed} height={'100%'} onError={() => setFailed(true)} />
          </div>
        </div>
      )}
    </>
  )
}
