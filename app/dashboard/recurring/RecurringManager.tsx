'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

type Row = {
  id: string
  client_id: string
  label: string
  amount: number
  is_bundle: boolean
  coverage_notes: string | null
  active: boolean
  start_date: string
}
type Client = { id: string; name: string }

function fmt(n: number) { return '$' + Math.round(n).toLocaleString() }

export default function RecurringManager({
  initialRows, clients,
}: { initialRows: Row[]; clients: Client[] }) {
  const supabase = createClient()
  const router = useRouter()
  const [rows, setRows] = useState<Row[]>(initialRows)
  const [busy, setBusy] = useState(false)

  // add-form state
  const [clientId, setClientId] = useState(clients[0]?.id || '')
  const [label, setLabel] = useState('')
  const [amount, setAmount] = useState('')
  const [isBundle, setIsBundle] = useState(false)
  const [coverage, setCoverage] = useState('')

  const clientName = (id: string) => clients.find(c => c.id === id)?.name || id
  const activeRows = rows.filter(r => r.active)
  const committed = activeRows.reduce((s, r) => s + (Number(r.amount) || 0), 0)

  // group active by client
  const groups: Record<string, { name: string; entries: Row[]; subtotal: number }> = {}
  for (const r of rows) {
    const name = clientName(r.client_id)
    if (!groups[name]) groups[name] = { name, entries: [], subtotal: 0 }
    groups[name].entries.push(r)
    if (r.active) groups[name].subtotal += Number(r.amount) || 0
  }
  const grouped = Object.values(groups).sort((a, b) => b.subtotal - a.subtotal)

  async function addEntry() {
    if (!clientId || !label.trim() || !amount) { alert('Client, label, and amount are required.'); return }
    setBusy(true)
    const { data, error } = await supabase
      .from('recurring_services')
      .insert({
        client_id: clientId,
        label: label.trim(),
        amount: Number(amount),
        is_bundle: isBundle,
        coverage_notes: coverage.trim() || null,
      })
      .select('id, client_id, label, amount, is_bundle, coverage_notes, active, start_date')
      .single()
    setBusy(false)
    if (error) { alert('Error: ' + error.message); return }
    setRows(r => [...r, data as Row])
    setLabel(''); setAmount(''); setIsBundle(false); setCoverage('')
    router.refresh()
  }

  async function togglePause(row: Row) {
    setBusy(true)
    const { error } = await supabase
      .from('recurring_services')
      .update({ active: !row.active })
      .eq('id', row.id)
    setBusy(false)
    if (error) { alert('Error: ' + error.message); return }
    setRows(rs => rs.map(r => r.id === row.id ? { ...r, active: !r.active } : r))
    router.refresh()
  }

  async function remove(row: Row) {
    if (!confirm(`Delete "${row.label}" for ${clientName(row.client_id)}?`)) return
    setBusy(true)
    const { error } = await supabase.from('recurring_services').delete().eq('id', row.id)
    setBusy(false)
    if (error) { alert('Error: ' + error.message); return }
    setRows(rs => rs.filter(r => r.id !== row.id))
    router.refresh()
  }

  return (
    <div>
      {/* Committed MRR banner */}
      <div className="bg-white rounded-lg border border-gray-200 p-5 mb-6 flex items-center justify-between">
        <div>
          <div className="text-[11px] text-gray-500 uppercase tracking-wide font-semibold">Committed MRR</div>
          <div className="text-3xl font-bold font-mono text-gray-900 mt-1">{fmt(committed)}</div>
        </div>
        <div className="text-right text-xs text-gray-400">
          {activeRows.length} active {activeRows.length === 1 ? 'entry' : 'entries'}<br />
          across {grouped.filter(g => g.subtotal > 0).length} clients
        </div>
      </div>

      {/* Add form */}
      <div className="bg-white rounded-lg border border-gray-200 p-5 mb-6">
        <h2 className="font-semibold text-gray-900 mb-3 text-sm">Add recurring service</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] text-gray-500 uppercase font-semibold mb-1">Client</label>
            <select value={clientId} onChange={e => setClientId(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm">
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] text-gray-500 uppercase font-semibold mb-1">Monthly amount ($)</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="850"
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm font-mono" />
          </div>
          <div>
            <label className="block text-[11px] text-gray-500 uppercase font-semibold mb-1">Label</label>
            <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Social Media / Full Service Retainer"
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
          </div>
          <div className="flex items-end gap-3">
            <label className="flex items-center gap-2 text-sm text-gray-700 mb-2">
              <input type="checkbox" checked={isBundle} onChange={e => setIsBundle(e.target.checked)} />
              Bundle (flat all-in)
            </label>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-[11px] text-gray-500 uppercase font-semibold mb-1">Coverage notes (optional)</label>
            <input value={coverage} onChange={e => setCoverage(e.target.value)} placeholder="includes consulting, social, SEO, web, email"
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
          </div>
        </div>
        <button onClick={addEntry} disabled={busy}
          className="mt-4 px-4 py-2 rounded-md text-sm font-medium text-white disabled:opacity-50"
          style={{ background: 'var(--brand-navy)' }}>
          {busy ? 'Saving…' : 'Add service'}
        </button>
      </div>

      {/* List grouped by client */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr className="text-left text-[11px] text-gray-500 uppercase tracking-wider">
              <th className="px-6 py-3">Client</th>
              <th className="px-6 py-3">Service</th>
              <th className="px-6 py-3">Type</th>
              <th className="px-6 py-3 text-right">Monthly</th>
              <th className="px-6 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {grouped.map(g => g.entries.map((e, idx) => (
              <tr key={e.id} className={`hover:bg-gray-50 ${!e.active ? 'opacity-50' : ''}`}>
                <td className="px-6 py-3 font-medium text-gray-900">{idx === 0 ? g.name : ''}</td>
                <td className="px-6 py-3 text-gray-700">
                  {e.label}
                  {e.coverage_notes && <div className="text-xs text-gray-400">{e.coverage_notes}</div>}
                </td>
                <td className="px-6 py-3">
                  {e.is_bundle
                    ? <span className="inline-flex px-2 py-0.5 rounded text-[11px] font-medium bg-purple-50 text-purple-700 border border-purple-200">Bundle</span>
                    : <span className="inline-flex px-2 py-0.5 rounded text-[11px] font-medium bg-gray-50 text-gray-600 border border-gray-200">Itemized</span>}
                  {!e.active && <span className="ml-1 inline-flex px-2 py-0.5 rounded text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200">Paused</span>}
                </td>
                <td className="px-6 py-3 text-right font-mono font-semibold text-gray-900">{fmt(Number(e.amount) || 0)}</td>
                <td className="px-6 py-3 text-right whitespace-nowrap">
                  <button onClick={() => togglePause(e)} disabled={busy}
                    className="text-xs text-gray-500 hover:text-gray-800 mr-3">
                    {e.active ? 'Pause' : 'Resume'}
                  </button>
                  <button onClick={() => remove(e)} disabled={busy}
                    className="text-xs text-red-500 hover:text-red-700">Delete</button>
                </td>
              </tr>
            )))}
            {rows.length === 0 && (
              <tr><td colSpan={5} className="px-6 py-8 text-center text-gray-400 text-sm">No recurring services yet. Add one above.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
