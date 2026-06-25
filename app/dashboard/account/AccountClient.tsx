'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function AccountClient({ email, memberId }: { email: string; memberId: string }) {
  const supabase = createClient()

  // Password
  const [pw, setPw] = useState('')
  const [confirm, setConfirm] = useState('')
  const [savingPw, setSavingPw] = useState(false)
  const [pwMsg, setPwMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  // Notification prefs
  const [phone, setPhone] = useState('')
  const [waNumber, setWaNumber] = useState('')
  const [notifSms, setNotifSms] = useState(true)
  const [notifWa, setNotifWa] = useState(false)
  const [savingNotif, setSavingNotif] = useState(false)
  const [notifMsg, setNotifMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [loadingNotif, setLoadingNotif] = useState(true)

  useEffect(() => {
    if (!memberId) return
    supabase.from('team_members').select('phone, whatsapp_number, notif_sms, notif_whatsapp').eq('id', memberId).maybeSingle()
      .then(({ data }) => {
        if (data) {
          setPhone(data.phone || '')
          setWaNumber(data.whatsapp_number || '')
          setNotifSms(data.notif_sms !== false)
          setNotifWa(data.notif_whatsapp === true)
        }
        setLoadingNotif(false)
      })
  }, [memberId])

  async function savePw() {
    setPwMsg(null)
    if (pw.length < 8) { setPwMsg({ kind: 'err', text: 'Password must be at least 8 characters.' }); return }
    if (pw !== confirm) { setPwMsg({ kind: 'err', text: 'Passwords do not match.' }); return }
    setSavingPw(true)
    const { error } = await supabase.auth.updateUser({ password: pw })
    setSavingPw(false)
    if (error) { setPwMsg({ kind: 'err', text: error.message }); return }
    setPw(''); setConfirm('')
    setPwMsg({ kind: 'ok', text: 'Password updated.' })
  }

  async function saveNotif() {
    setSavingNotif(true)
    setNotifMsg(null)
    const { error } = await supabase.from('team_members').update({
      phone: phone.trim() || null,
      whatsapp_number: waNumber.trim() || null,
      notif_sms: notifSms,
      notif_whatsapp: notifWa,
    }).eq('id', memberId)
    setSavingNotif(false)
    if (error) { setNotifMsg({ kind: 'err', text: error.message }); return }
    setNotifMsg({ kind: 'ok', text: 'Notification settings saved.' })
  }

  const inputCls = 'w-full text-sm px-3 py-2 border border-gray-300 rounded focus:border-blue-500 focus:outline-none'
  const labelCls = 'block text-xs font-medium text-gray-600 mb-1'

  return (
    <div className="p-4 md:p-6 max-w-lg mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Account</h1>
      <p className="text-sm text-gray-500 mb-6">{email}</p>

      {/* Password */}
      <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-4 mb-5">
        <h2 className="text-sm font-semibold text-gray-900">Change password</h2>
        <div>
          <label className={labelCls}>New password</label>
          <input type="password" value={pw} onChange={e => setPw(e.target.value)} autoComplete="new-password" className={inputCls} placeholder="At least 8 characters" />
        </div>
        <div>
          <label className={labelCls}>Confirm new password</label>
          <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="new-password" className={inputCls} placeholder="Re-enter password" />
        </div>
        {pwMsg && <div className={`text-xs px-3 py-2 rounded ${pwMsg.kind === 'ok' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{pwMsg.text}</div>}
        <button onClick={savePw} disabled={savingPw || !pw || !confirm} className="px-4 py-1.5 rounded-lg text-sm font-semibold text-white disabled:opacity-40" style={{ background: '#1a2b4a' }}>
          {savingPw ? 'Saving…' : 'Update password'}
        </button>
      </div>

      {/* Notifications */}
      <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Notification settings</h2>
          <p className="text-xs text-gray-500 mt-0.5">Get notified when WOs are assigned, stages change, or you're mentioned.</p>
        </div>

        {loadingNotif ? (
          <div className="text-xs text-gray-400">Loading…</div>
        ) : (
          <>
            <div>
              <label className={labelCls}>Phone number (SMS — US team)</label>
              <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} className={inputCls} placeholder="+1 (708) 555-0100" />
              <p className="text-xs text-gray-400 mt-1">US number for SMS alerts. Format: +1XXXXXXXXXX</p>
            </div>
            <div>
              <label className={labelCls}>WhatsApp number (Mexico team)</label>
              <input type="tel" value={waNumber} onChange={e => setWaNumber(e.target.value)} className={inputCls} placeholder="+52 55 1234 5678" />
              <p className="text-xs text-gray-400 mt-1">WhatsApp-enabled number. Format: +52XXXXXXXXXX</p>
            </div>
            <div className="space-y-2">
              <label className={labelCls}>Alert channels</label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={notifSms} onChange={e => setNotifSms(e.target.checked)} className="rounded" />
                <span className="text-sm text-gray-700">SMS notifications</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={notifWa} onChange={e => setNotifWa(e.target.checked)} className="rounded" />
                <span className="text-sm text-gray-700">WhatsApp notifications</span>
              </label>
            </div>
            <div className="rounded-lg p-3 text-xs" style={{ background: '#f0f9ff', color: '#0369a1' }}>
              <strong>You'll be notified when:</strong> a WO is assigned to you · a stage changes on your WO · someone @mentions you · a client approves or requests revisions
            </div>
            {notifMsg && <div className={`text-xs px-3 py-2 rounded ${notifMsg.kind === 'ok' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{notifMsg.text}</div>}
            <button onClick={saveNotif} disabled={savingNotif} className="px-4 py-1.5 rounded-lg text-sm font-semibold text-white disabled:opacity-40" style={{ background: '#1a2b4a' }}>
              {savingNotif ? 'Saving…' : 'Save notification settings'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
