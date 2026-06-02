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

  // edit-in-place state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [editAmount, setEditAmount] = useState('')
  const [editBundle, setEditBundle] = useState(false)
  const [editCoverage, setEditCoverage] = useState('')

  function startEdit(e: Row) {
    setEditingId(e.id)
    setEditLabel(e.label)
    setEditAmount(String(e.amount))
    setEditBundle(e.is_bundle)
    setEditCoverage(e.coverage_notes || '')
  }
  function cancelEdit() { setEditingId(null) }

  async function updateEntry(id: string) {
    if (!editLabel.trim() || !editAmount) { alert('Label and amount are required.'); return }
    setBusy(true)
    const patch = {
      label: editLabel.trim(),
      amount: Number(editAmount),
      is_bundle: editBundle,
      coverage_notes: editCoverage.trim() || null,
    }
    const { error } = await supabase.from('recurring_services').update(patch).eq('id', id)
    setBusy(false)
    if (error) { alert('Error: ' + error.message); return }
    setRows(rs => rs.map(r => r.id === id ? { ...r, ...patch } : r))
    setEditingId(null)
    router.refresh()
  }

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

      {/* List grouped by client — WO-style cards */}
      <div className="space-y-6">
        {grouped.map(g => (
          <div key={g.name}>
            <div className="flex items-center justify-between mb-2 px-1">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-gray-900"></span>
                <h3 className="font-semibold text-gray-900 text-sm">{g.name}</h3>
              </div>
              <span className="text-xs font-mono text-gray-500">{fmt(g.subtotal)}/mo</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {g.entries.map(e => (
                <div
                  key={e.id}
                  className={`bg-white rounded-lg border p-4 flex flex-col gap-2 transition-opacity ${e.active ? 'border-gray-200' : 'border-gray-200 opacity-55'}`}
                  style={e.active ? { borderLeft: '3px solid var(--brand-accent)' } : { borderLeft: '3px solid #d1d5db' }}
                >
                  {editingId === e.id ? (
                    <div className="flex flex-col gap-2">
                      <input value={editLabel} onChange={ev => setEditLabel(ev.target.value)}
                        placeholder="Label"
                        className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm" />
                      <div className="flex items-center gap-2">
                        <span className="text-gray-400 text-sm">$</span>
                        <input type="number" value={editAmount} onChange={ev => setEditAmount(ev.target.value)}
                          placeholder="amount"
                          className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-sm font-mono" />
                        <span className="text-gray-400 text-xs">/mo</span>
                      </div>
                      <label className="flex items-center gap-2 text-xs text-gray-600">
                        <input type="checkbox" checked={editBundle} onChange={ev => setEditBundle(ev.target.checked)} />
                        Bundle (flat all-in)
                      </label>
                      <input value={editCoverage} onChange={ev => setEditCoverage(ev.target.value)}
                        placeholder="coverage notes (optional)"
                        className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs" />
                      <div className="flex items-center gap-2 mt-1">
                        <button onClick={() => updateEntry(e.id)} disabled={busy}
                          className="flex-1 px-2 py-1 rounded text-xs font-medium text-white disabled:opacity-50"
                          style={{ background: 'var(--brand-navy)' }}>
                          {busy ? 'Saving…' : 'Save'}
                        </button>
                        <button onClick={cancelEdit} disabled={busy}
                          className="flex-1 px-2 py-1 rounded text-xs font-medium text-gray-600 border border-gray-300 hover:bg-gray-50 disabled:opacity-50">
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                  <>
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-medium text-gray-900 text-sm leading-snug">{e.label}</div>
                    {e.is_bundle
                      ? <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-50 text-purple-700 border border-purple-200 flex-shrink-0">Bundle</span>
                      : <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-50 text-gray-500 border border-gray-200 flex-shrink-0">Itemized</span>}
                  </div>
                  {e.coverage_notes && <div className="text-xs text-gray-400 leading-snug">{e.coverage_notes}</div>}
                  <div className="text-xl font-bold font-mono text-gray-900">{fmt(Number(e.amount) || 0)}<span className="text-xs font-normal text-gray-400">/mo</span></div>
                  <div className="flex items-center justify-between mt-1 pt-2 border-t border-gray-50">
                    <button
                      onClick={() => togglePause(e)}
                      disabled={busy}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors disabled:opacity-50 ${
                        e.active
                          ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'
                          : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                      }`}
                      title={e.active ? 'Click to pause (removes from MRR)' : 'Click to reactivate'}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${e.active ? 'bg-green-500' : 'bg-amber-500'}`}></span>
                      {e.active ? 'Active' : 'Paused'}
                    </button>
                    <div className="flex items-center gap-3">
                      <button onClick={() => startEdit(e)} disabled={busy}
                        className="text-[11px] text-gray-400 hover:text-gray-800 transition-colors">Edit</button>
                      <button onClick={() => remove(e)} disabled={busy}
                        className="text-[11px] text-gray-400 hover:text-red-600 transition-colors">Delete</button>
                    </div>
                  </div>
                  </>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
        {rows.length === 0 && (
          <div className="bg-white rounded-lg border border-gray-200 px-6 py-8 text-center text-gray-400 text-sm">
            No recurring services yet. Add one above.
          </div>
        )}
      </div>
    </div>
  )
}
