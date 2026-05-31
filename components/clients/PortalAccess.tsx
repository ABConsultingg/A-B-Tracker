'use client'
import { useState } from 'react'

export type PortalUser = {
  id: string
  client_id: string
  name: string
  email: string
  role: string
  auth_user_id: string | null
  active: boolean
  last_login_at?: string | null
}

export default function PortalAccess({
  clientId,
  clientName,
  defaultEmail,
  defaultName,
  initial,
}: {
  clientId: string
  clientName: string
  defaultEmail?: string | null
  defaultName?: string | null
  initial: PortalUser | null
}) {
  const [pu, setPu] = useState<PortalUser | null>(initial)
  const [busy, setBusy] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [email, setEmail] = useState(defaultEmail || '')
  const [name, setName] = useState(defaultName || clientName || '')
  const [pw, setPw] = useState('')

  async function call(payload: any): Promise<any> {
    setBusy(true)
    try {
      const res = await fetch('/api/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) { alert(data?.error || 'Request failed.'); return null }
      return data
    } catch (e: any) {
      alert(e?.message || 'Network error.')
      return null
    } finally {
      setBusy(false)
    }
  }

  async function createLogin() {
    if (!email.trim() || !name.trim()) { alert('Name and email are required.'); return }
    if (pw.length < 8) { alert('Temporary password must be at least 8 characters.'); return }
    const data = await call({ action: 'create', clientId, email: email.trim(), name: name.trim(), password: pw })
    if (data?.portalUser) {
      setPu(data.portalUser)
      setShowCreate(false)
      setPw('')
      alert(`Portal login created for ${data.portalUser.email}. Share the temporary password with the client securely — they can change it from their Account page after first login.`)
    }
  }

  async function resetPassword() {
    if (!pu?.auth_user_id) return
    const np = prompt('Enter a new temporary password (min 8 chars). Share it with the client securely.')
    if (np === null) return
    if (np.length < 8) { alert('Password must be at least 8 characters.'); return }
    const data = await call({ action: 'reset', authUserId: pu.auth_user_id, password: np })
    if (data?.ok) alert('Password reset. Share the new temporary password with the client securely.')
  }

  async function revoke() {
    if (!pu) return
    if (!confirm(`Revoke portal access for ${pu.email}? They will be unable to log in until restored.`)) return
    const data = await call({ action: 'revoke', id: pu.id })
    if (data?.portalUser) setPu(data.portalUser)
  }

  async function restore() {
    if (!pu) return
    const data = await call({ action: 'restore', id: pu.id })
    if (data?.portalUser) setPu(data.portalUser)
  }

  return (
    <div className="space-y-3">
      <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 pb-1">
        Portal access
      </div>

      {!pu && !showCreate && (
        <div className="flex items-center justify-between gap-3 bg-gray-50 rounded-lg p-3">
          <div className="text-sm text-gray-600">
            No portal login yet. Create one so this client can sign in and see their work orders.
          </div>
          <button onClick={() => setShowCreate(true)} disabled={busy}
            className="px-3 py-2 rounded-md text-sm font-semibold text-white flex-shrink-0 disabled:opacity-50"
            style={{ background: '#1a2b4a' }}>
            Create login
          </button>
        </div>
      )}

      {!pu && showCreate && (
        <div className="bg-gray-50 rounded-lg p-3 space-y-2.5">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Login name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)}
              className="w-full text-sm px-3 py-2 border border-gray-200 rounded focus:border-blue-500 focus:outline-none" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="contact@client.com"
              className="w-full text-sm px-3 py-2 border border-gray-200 rounded focus:border-blue-500 focus:outline-none" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Temporary password</label>
            <input type="text" value={pw} onChange={e => setPw(e.target.value)}
              placeholder="min 8 characters"
              className="w-full text-sm px-3 py-2 border border-gray-200 rounded font-mono focus:border-blue-500 focus:outline-none" />
            <div className="text-[11px] text-gray-500 mt-1">
              You set this and share it with the client securely. They change it from their Account page after first login.
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={createLogin} disabled={busy}
              className="flex-1 py-2.5 rounded-lg font-semibold text-white text-sm disabled:opacity-50"
              style={{ background: '#1a2b4a' }}>
              {busy ? 'Creating…' : 'Create login'}
            </button>
            <button onClick={() => { setShowCreate(false); setPw('') }} disabled={busy}
              className="px-4 py-2.5 rounded-lg font-semibold text-gray-600 hover:bg-gray-100 text-sm">
              Cancel
            </button>
          </div>
        </div>
      )}

      {pu && (
        <div className="bg-gray-50 rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-sm font-medium text-gray-900 truncate">{pu.email}</div>
              <div className="text-[11px] text-gray-500">
                {pu.active
                  ? (pu.last_login_at ? `Last login ${new Date(pu.last_login_at).toLocaleDateString()}` : 'Never logged in')
                  : 'Access revoked'}
              </div>
            </div>
            <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded font-mono flex-shrink-0"
              style={pu.active
                ? { background: '#d1fae5', color: '#065f46' }
                : { background: '#f3f4f6', color: '#6b7280' }}>
              {pu.active ? 'Active' : 'Revoked'}
            </span>
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            {pu.active ? (
              <>
                <button onClick={resetPassword} disabled={busy}
                  className="text-xs px-3 py-1.5 rounded-md font-semibold text-gray-700 bg-white border border-gray-200 hover:bg-gray-100 disabled:opacity-50">
                  Reset password
                </button>
                <button onClick={revoke} disabled={busy}
                  className="text-xs px-3 py-1.5 rounded-md font-semibold text-red-700 bg-red-50 hover:bg-red-100 disabled:opacity-50">
                  Revoke access
                </button>
              </>
            ) : (
              <button onClick={restore} disabled={busy}
                className="text-xs px-3 py-1.5 rounded-md font-semibold text-green-700 bg-green-50 hover:bg-green-100 disabled:opacity-50">
                Restore access
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
