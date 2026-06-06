'use client'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { DeliverablePreview } from '@/lib/deliverablePreview'

export type WoLink = {
  id: string
  work_order_id: string
  label: string | null
  url: string
  sort_order: number
  created_at: string
}

type WoFile = {
  id: string
  work_order_id: string
  name: string
  storage_path: string
  mime_type: string | null
  size_bytes: number | null
  internal_only: boolean
  uploaded_by_id: string | null
  created_at: string
}

function fmtBytes(b: number | null) {
  if (!b) return ''
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / (1024 * 1024)).toFixed(1)} MB`
}

function fileIcon(mime: string | null) {
  if (!mime) return '📎'
  if (mime.includes('pdf')) return '📄'
  if (mime.includes('spreadsheet') || mime.includes('csv') || mime.includes('excel')) return '📊'
  if (mime.includes('word') || mime.includes('document')) return '📝'
  if (mime.includes('image')) return '🖼️'
  if (mime.includes('video')) return '🎬'
  if (mime.includes('zip') || mime.includes('archive')) return '🗜️'
  return '📎'
}

export default function WoFilesTab({
  woId, initialLinks, primaryLink, isAdmin,
}: {
  woId: string
  initialLinks: WoLink[]
  primaryLink: string | null
  isAdmin: boolean
}) {
  const supabase = createClient()

  // ── Deliverable links state ──────────────────────────────────────────────
  const [links, setLinks] = useState<WoLink[]>(initialLinks)
  const [label, setLabel] = useState('')
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)

  // ── File attachments state ───────────────────────────────────────────────
  const [files, setFiles] = useState<WoFile[]>([])
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({})
  const [loadingFiles, setLoadingFiles] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Load files on mount
  useEffect(() => {
    loadFiles()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [woId])

  async function loadFiles() {
    setLoadingFiles(true)
    const { data } = await supabase
      .from('wo_files')
      .select('*')
      .eq('work_order_id', woId)
      .order('created_at', { ascending: false })
    const list = (data || []) as WoFile[]
    setFiles(list)
    await generateSignedUrls(list)
    setLoadingFiles(false)
  }

  async function generateSignedUrls(list: WoFile[]) {
    const urls: Record<string, string> = {}
    await Promise.all(list.map(async f => {
      const { data } = await supabase.storage
        .from('ab-files')
        .createSignedUrl(f.storage_path, 3600)
      if (data?.signedUrl) urls[f.id] = data.signedUrl
    }))
    setSignedUrls(urls)
  }

  async function uploadFiles(fileList: FileList) {
    if (!fileList.length) return
    setUploading(true)
    const { data: { user } } = await supabase.auth.getUser()

    for (const file of Array.from(fileList)) {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `wo-files/${woId}/${Date.now()}_${safeName}`

      const { error: upErr } = await supabase.storage
        .from('ab-files')
        .upload(path, file, { cacheControl: '3600', upsert: false })

      if (upErr) { alert(`Upload failed for ${file.name}: ${upErr.message}`); continue }

      const { data: row, error: dbErr } = await supabase
        .from('wo_files')
        .insert({
          work_order_id: woId,
          name: file.name,
          storage_path: path,
          mime_type: file.type || null,
          size_bytes: file.size,
          uploaded_by_type: 'team',
          uploaded_by_id: user?.email ?? null,
          internal_only: true,
        })
        .select()
        .single()

      if (dbErr) { alert(`DB save failed for ${file.name}: ${dbErr.message}`); continue }

      const newFile = row as WoFile
      setFiles(prev => [newFile, ...prev])

      // Generate signed URL for the new file
      const { data: signed } = await supabase.storage
        .from('ab-files')
        .createSignedUrl(path, 3600)
      if (signed?.signedUrl) {
        setSignedUrls(prev => ({ ...prev, [newFile.id]: signed.signedUrl }))
      }
    }
    setUploading(false)
  }

  async function deleteFile(file: WoFile) {
    if (!isAdmin) return
    if (!confirm(`Delete "${file.name}"? This cannot be undone.`)) return
    await supabase.storage.from('ab-files').remove([file.storage_path])
    await supabase.from('wo_files').delete().eq('id', file.id)
    setFiles(prev => prev.filter(f => f.id !== file.id))
  }

  async function toggleVisibility(file: WoFile) {
    if (!isAdmin) return
    const next = !file.internal_only
    await supabase.from('wo_files').update({ internal_only: next }).eq('id', file.id)
    setFiles(prev => prev.map(f => f.id === file.id ? { ...f, internal_only: next } : f))
  }

  // ── Deliverable link helpers ─────────────────────────────────────────────
  async function addLink() {
    const u = url.trim()
    if (!u) return
    setBusy(true)
    const nextSort = links.length ? Math.max(...links.map(l => l.sort_order)) + 1 : 0
    const { data, error } = await supabase
      .from('wo_links')
      .insert({ work_order_id: woId, label: label.trim() || null, url: u, sort_order: nextSort })
      .select()
      .single()
    setBusy(false)
    if (error) { alert('Could not add link: ' + error.message); return }
    setLinks(prev => [...prev, data as WoLink])
    setLabel(''); setUrl('')
  }

  async function removeLink(id: string) {
    if (!confirm('Remove this deliverable link?')) return
    const prev = links
    setLinks(curr => curr.filter(l => l.id !== id))
    const { error } = await supabase.from('wo_links').delete().eq('id', id)
    if (error) { alert('Could not remove: ' + error.message); setLinks(prev) }
  }

  const hasAnyLinks = !!primaryLink || links.length > 0

  return (
    <div className="grid gap-6 max-w-3xl">

      {/* ── Section 1: Deliverable Links ───────────────────────────────── */}
      <div>
        <div className="text-xs font-bold uppercase tracking-wider mb-3"
          style={{ color: 'var(--text-muted)' }}>
          Deliverable Links
        </div>

        {isAdmin && (
          <div className="rounded-lg border p-4 mb-3"
            style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}>
            <div className="text-sm font-semibold mb-3" style={{ color: 'var(--text)' }}>
              Add a deliverable link
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input type="text" value={label} onChange={e => setLabel(e.target.value)}
                placeholder="Label (e.g. Final flyer)"
                className="rounded border px-3 py-2 text-sm sm:w-48"
                style={{ background: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text)' }} />
              <input type="url" value={url} onChange={e => setUrl(e.target.value)}
                placeholder="https://… (Drive, Slides, Dropbox, PDF, image)"
                onKeyDown={e => { if (e.key === 'Enter') addLink() }}
                className="flex-1 rounded border px-3 py-2 text-sm"
                style={{ background: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text)' }} />
              <button onClick={addLink} disabled={busy || !url.trim()}
                className="rounded px-4 py-2 text-sm font-medium"
                style={{ background: 'var(--brand-accent, #b8860b)', color: '#1a2744', opacity: busy || !url.trim() ? 0.5 : 1 }}>
                {busy ? 'Adding…' : 'Add'}
              </button>
            </div>
          </div>
        )}

        {!hasAnyLinks && (
          <div className="rounded-lg border p-6 text-center"
            style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
            No deliverables yet.{isAdmin ? ' Add a link above.' : ''}
          </div>
        )}

        {primaryLink && (
          <div className="rounded-lg border p-4 mb-3"
            style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}>
            <div className="text-sm font-semibold mb-3" style={{ color: 'var(--text)' }}>Primary deliverable</div>
            <DeliverablePreview link={primaryLink} label="Primary deliverable" />
          </div>
        )}

        {links.map(l => (
          <div key={l.id} className="rounded-lg border p-4 mb-3"
            style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}>
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                {l.label || 'Deliverable'}
              </div>
              {isAdmin && (
                <button onClick={() => removeLink(l.id)}
                  className="text-xs" style={{ color: '#dc2626' }}>Remove</button>
              )}
            </div>
            <DeliverablePreview link={l.url} label={l.label || 'Deliverable'} />
          </div>
        ))}
      </div>

      {/* ── Section 2: Attached Files ───────────────────────────────────── */}
      <div>
        <div className="text-xs font-bold uppercase tracking-wider mb-3"
          style={{ color: 'var(--text-muted)' }}>
          Attached Files
          <span className="ml-2 font-normal normal-case"
            style={{ color: 'var(--text-faint, #9ca3af)', fontSize: 10 }}>
            {isAdmin ? 'Team-only by default · toggle to share with client' : 'Files shared with you'}
          </span>
        </div>

        {/* Upload zone */}
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => {
            e.preventDefault(); setDragging(false)
            if (e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files)
          }}
          onClick={() => fileInputRef.current?.click()}
          className="rounded-lg border-2 border-dashed p-6 text-center cursor-pointer mb-4 transition-colors"
          style={{
            borderColor: dragging ? 'var(--brand-accent, #d99e2b)' : 'var(--border)',
            background: dragging ? 'rgba(217,158,43,0.04)' : 'var(--bg-elevated)',
          }}
        >
          <div className="text-2xl mb-2">📂</div>
          <div className="text-sm font-medium" style={{ color: 'var(--text)' }}>
            {uploading ? 'Uploading…' : 'Drop files here or click to browse'}
          </div>
          <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            Any file type · Max 100 MB each
          </div>
          <input ref={fileInputRef} type="file" multiple className="hidden"
            onChange={e => e.target.files && uploadFiles(e.target.files)} />
        </div>

        {/* File list */}
        {loadingFiles ? (
          <div className="text-sm text-center py-4" style={{ color: 'var(--text-muted)' }}>
            Loading files…
          </div>
        ) : files.length === 0 ? (
          <div className="text-sm text-center py-4" style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
            No files attached yet.
          </div>
        ) : (
          <div className="grid gap-2">
            {files.map(f => (
              <div key={f.id}
                className="rounded-lg border flex items-center gap-3 px-4 py-3 group"
                style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}>
                <span className="text-xl flex-shrink-0">{fileIcon(f.mime_type)}</span>
                <div className="flex-1 min-w-0">
                  <a
                    href={signedUrls[f.id] ?? '#'}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm font-medium truncate block hover:underline"
                    style={{ color: 'var(--accent, #6366f1)' }}
                  >
                    {f.name}
                  </a>
                  <div className="flex items-center gap-3 mt-0.5">
                    {f.size_bytes && (
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        {fmtBytes(f.size_bytes)}
                      </span>
                    )}
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {new Date(f.created_at).toLocaleDateString()}
                    </span>
                    {isAdmin && (
                      <span className="text-xs font-medium"
                        style={{ color: f.internal_only ? '#f59e0b' : '#10b981' }}>
                        {f.internal_only ? '🔒 Team only' : '🌐 Client visible'}
                      </span>
                    )}
                  </div>
                </div>
                {isAdmin && (
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    <button
                      onClick={() => toggleVisibility(f)}
                      title={f.internal_only ? 'Make visible to client' : 'Make team-only'}
                      className="text-xs px-2 py-1 rounded transition-colors"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {f.internal_only ? '🌐' : '🔒'}
                    </button>
                    <button
                      onClick={() => deleteFile(f)}
                      className="text-xs px-2 py-1 rounded transition-colors"
                      style={{ color: '#dc2626' }}
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
