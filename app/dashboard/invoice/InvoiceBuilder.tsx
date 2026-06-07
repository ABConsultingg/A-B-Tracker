'use client'
import { useState, useMemo } from 'react'

type Client = {
  id: string
  name: string
  contact_name: string | null
  contact_email: string | null
  contact_phone: string | null
  address: string | null
}

type LineItem = {
  id: string
  description: string
  qty: number
  unit_price: number
  total: number
  sort_order: number
}

type WO = {
  id: string
  title: string
  stage: string
  est_cost: number
  add_cost: number
  client_id: string
  clients: { name: string }[] | null
  wo_line_items: LineItem[]
}

function fmt(n: number) {
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function InvoiceBuilder({
  clients, workOrders,
}: {
  clients: Client[]
  workOrders: WO[]
}) {
  const [selectedClientId, setSelectedClientId] = useState('')
  const [selectedWoIds, setSelectedWoIds] = useState<Set<string>>(new Set())
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [issueDate, setIssueDate] = useState(new Date().toISOString().split('T')[0])
  const [generating, setGenerating] = useState(false)
  const [contactName, setContactName] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [contactAddress, setContactAddress] = useState('')

  const client = clients.find(c => c.id === selectedClientId)
  const clientWos = useMemo(() =>
    workOrders.filter(w => w.client_id === selectedClientId),
    [workOrders, selectedClientId]
  )
  const selectedWos = useMemo(() =>
    clientWos.filter(w => selectedWoIds.has(w.id)),
    [clientWos, selectedWoIds]
  )
  const total = selectedWos.reduce((sum, w) => sum + (w.est_cost || 0) + (w.add_cost || 0), 0)

  function selectClient(id: string) {
    const c = clients.find(cl => cl.id === id)
    setSelectedClientId(id)
    setSelectedWoIds(new Set())
    setContactName(c?.contact_name || '')
    setContactEmail(c?.contact_email || '')
    setContactPhone(c?.contact_phone || '')
    setContactAddress(c?.address || '')
  }

  function toggleWo(id: string) {
    setSelectedWoIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function selectAll() {
    setSelectedWoIds(new Set(clientWos.map(w => w.id)))
  }

  async function generate() {
    if (!selectedClientId || selectedWoIds.size === 0) return
    setGenerating(true)
    try {
      const payload = {
        invoice_number: invoiceNumber || 'DRAFT',
        issue_date: new Date(issueDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
        customer: {
          name: contactName,
          company: client?.name || '',
          email: contactEmail,
          phone: contactPhone,
          address: contactAddress,
        },
        line_items: selectedWos.map(w => ({
          description: w.title,
          qty: 1,
          price: (w.est_cost || 0) + (w.add_cost || 0),
          sub_items: (w.wo_line_items || [])
            .sort((a, b) => a.sort_order - b.sort_order)
            .map(li => ({ description: li.description, price: Number(li.total) }))
        }))
      }

      const res = await fetch('/api/invoice/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) { alert('Failed to generate invoice'); return }

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `invoice-${client?.name?.replace(/\s+/g, '-')}-${invoiceNumber || 'draft'}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setGenerating(false)
    }
  }

  const stageLabel: Record<string, string> = {
    'approved': 'Approved',
    'deliverables-executed': 'Ready to Invoice',
    'invoiced': 'Invoiced',
  }
  const stageBg: Record<string, string> = {
    'approved': 'bg-purple-50 text-purple-700',
    'deliverables-executed': 'bg-green-50 text-green-700',
    'invoiced': 'bg-yellow-50 text-yellow-700',
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* LEFT — config */}
      <div className="lg:col-span-2 space-y-5">

        {/* Client picker */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">1. Select Client</div>
          <select value={selectedClientId} onChange={e => selectClient(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm">
            <option value="">Choose a client…</option>
            {clients.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* Contact info */}
        {selectedClientId && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">2. Customer Info</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Contact Name</label>
                <input value={contactName} onChange={e => setContactName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Email</label>
                <input value={contactEmail} onChange={e => setContactEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Phone</label>
                <input value={contactPhone} onChange={e => setContactPhone(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Address</label>
                <input value={contactAddress} onChange={e => setContactAddress(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
              </div>
            </div>
          </div>
        )}

        {/* WO picker */}
        {selectedClientId && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs font-bold text-gray-500 uppercase tracking-wide">3. Select Work Orders</div>
              {clientWos.length > 0 && (
                <button onClick={selectAll} className="text-xs text-blue-600 hover:underline">Select all</button>
              )}
            </div>
            {clientWos.length === 0 ? (
              <p className="text-sm text-gray-400">No billable work orders for this client.</p>
            ) : (
              <div className="space-y-2">
                {clientWos.map(w => {
                  const cost = (w.est_cost || 0) + (w.add_cost || 0)
                  const selected = selectedWoIds.has(w.id)
                  return (
                    <div key={w.id}
                      onClick={() => toggleWo(w.id)}
                      className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        selected ? 'border-blue-300 bg-blue-50/40' : 'border-gray-200 hover:border-gray-300'
                      }`}>
                      <input type="checkbox" checked={selected} onChange={() => {}} className="mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900 truncate">{w.title}</div>
                        {w.wo_line_items?.length > 0 && (
                          <div className="text-xs text-gray-400 mt-0.5">
                            {w.wo_line_items.length} sub-item{w.wo_line_items.length > 1 ? 's' : ''}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${stageBg[w.stage] || 'bg-gray-100 text-gray-600'}`}>
                          {stageLabel[w.stage] || w.stage}
                        </span>
                        <span className="text-sm font-mono font-semibold text-gray-900">{fmt(cost)}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* RIGHT — summary + download */}
      <div className="space-y-5">
        <div className="bg-white rounded-xl border border-gray-200 p-5 sticky top-6">
          <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-4">Invoice Details</div>

          <div className="space-y-3 mb-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Invoice Number</label>
              <input value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)}
                placeholder="e.g. 001150"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Issue Date</label>
              <input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
            </div>
          </div>

          {selectedWos.length > 0 && (
            <div className="border-t border-gray-100 pt-4 mb-4">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Summary</div>
              {selectedWos.map(w => (
                <div key={w.id} className="flex justify-between items-start gap-2 text-xs py-1">
                  <span className="text-gray-600 truncate flex-1">{w.title}</span>
                  <span className="font-mono text-gray-900 flex-shrink-0">{fmt((w.est_cost||0)+(w.add_cost||0))}</span>
                </div>
              ))}
              <div className="border-t border-gray-200 mt-2 pt-2 flex justify-between">
                <span className="text-sm font-bold text-gray-900">Total</span>
                <span className="text-sm font-bold font-mono text-gray-900">{fmt(total)}</span>
              </div>
            </div>
          )}

          <button
            onClick={generate}
            disabled={generating || !selectedClientId || selectedWoIds.size === 0}
            className="w-full py-3 rounded-lg text-sm font-bold text-white transition-opacity disabled:opacity-40"
            style={{ background: '#1a2744' }}>
            {generating ? '⏳ Generating…' : '⬇ Download Invoice PDF'}
          </button>
          {selectedWoIds.size === 0 && selectedClientId && (
            <p className="text-xs text-gray-400 text-center mt-2">Select at least one work order</p>
          )}
        </div>
      </div>
    </div>
  )
}
