import { createClient } from '@/lib/supabase/server'

export default async function FinancePage() {
  const supabase = createClient()
  const { data: wos } = await supabase
    .from('work_orders')
    .select(`id, stage, est_cost, add_cost, occurrence, paid_at, updated_at, created_at,
             clients!work_orders_client_id_fkey(name),
             services!work_orders_service_id_fkey(name)`)

  const all = wos || []

  // MRR: Recurring WOs in active stages
  const mrrActiveStages = ['submitted','not-started','in-progress','deliverables-completed','sent-for-approval','revisions-received','approved','deliverables-executed','invoiced']
  const mrrRows = all.filter((w: any) => w.occurrence === 'Recurring' && mrrActiveStages.includes(w.stage))
  const mrr = mrrRows.reduce((s: number, w: any) => s + (w.est_cost || 0), 0)

  // Ready to Invoice: deliverables-executed
  const rtiRows = all.filter((w: any) => w.stage === 'deliverables-executed')
  const readyToInvoice = rtiRows.reduce((s: number, w: any) => s + (w.est_cost || 0) + (w.add_cost || 0), 0)

  // Outstanding: invoiced
  const outRows = all.filter((w: any) => w.stage === 'invoiced')
  const outstanding = outRows.reduce((s: number, w: any) => s + (w.est_cost || 0) + (w.add_cost || 0), 0)

  // Paid this month
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const paidRows = all.filter((w: any) => w.stage === 'paid' && w.paid_at && new Date(w.paid_at) >= monthStart)
  const paidThisMonth = paidRows.reduce((s: number, w: any) => s + (w.est_cost || 0) + (w.add_cost || 0), 0)
  const monthLabel = now.toLocaleString('en-US', { month: 'long', year: 'numeric' })

  // Archived YTD
  const yearStart = new Date(now.getFullYear(), 0, 1)
  const archRows = all.filter((w: any) => w.stage === 'archived' && w.updated_at && new Date(w.updated_at) >= yearStart)
  const archivedYTD = archRows.reduce((s: number, w: any) => s + (w.est_cost || 0) + (w.add_cost || 0), 0)

  // Active Subscriptions (all Recurring, including on-hold)
  const subscriptions = all
    .filter((w: any) => w.occurrence === 'Recurring' && !['paid','archived'].includes(w.stage))
    .map((w: any) => {
      const started = w.created_at ? new Date(w.created_at) : null
      const monthsActive = started
        ? Math.max(1, Math.round((now.getTime() - started.getTime()) / (1000 * 60 * 60 * 24 * 30)))
        : 0
      return {
        id: w.id,
        client: w.clients?.name || 'Unknown',
        service: w.services?.name || '—',
        started: started ? started.toLocaleString('en-US', { month: 'short', year: 'numeric' }) : '—',
        monthsActive,
        stage: w.stage,
        onHold: w.stage === 'on-hold',
        rate: w.est_cost || 0,
      }
    })
    .sort((a: any, b: any) => b.rate - a.rate)

  // Revenue by Client (kept from original)
  const clientStats: Record<string, { wos: number; revenue: number; pipeline: number }> = {}
  all.forEach((w: any) => {
    const name = w.clients?.name || 'Unknown'
    if (!clientStats[name]) clientStats[name] = { wos: 0, revenue: 0, pipeline: 0 }
    clientStats[name].wos++
    const v = (w.est_cost || 0) + (w.add_cost || 0)
    if (['paid','archived'].includes(w.stage)) clientStats[name].revenue += v
    else clientStats[name].pipeline += v
  })
  const clientRows = Object.entries(clientStats)
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => (b.revenue + b.pipeline) - (a.revenue + a.pipeline))

  function fmt(n: number) { return '$' + Math.round(n).toLocaleString() }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Finance</h1>
        <p className="text-sm text-gray-500 mt-1">A/R pipeline and recurring revenue</p>
      </div>

      {/* A/R PIPELINE — 5 tiles */}
      <div className="mb-2 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">A/R Pipeline</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-8">
        <div className="bg-white rounded-lg border border-gray-200 p-5 border-l-4 border-l-blue-500">
          <div className="text-[11px] text-gray-500 uppercase tracking-wide font-semibold flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span> MRR
          </div>
          <div className="text-2xl font-bold mt-1 font-mono text-gray-900">{fmt(mrr)}</div>
          <div className="text-xs text-gray-400 mt-1">{mrrRows.length} subscriptions active</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-5 border-l-4 border-l-green-500">
          <div className="text-[11px] text-gray-500 uppercase tracking-wide font-semibold flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span> Ready to Invoice
          </div>
          <div className="text-2xl font-bold mt-1 font-mono text-gray-900">{fmt(readyToInvoice)}</div>
          <div className="text-xs text-gray-400 mt-1">{rtiRows.length} work orders</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-5 border-l-4" style={{ borderLeftColor: '#d99e2b' }}>
          <div className="text-[11px] text-gray-500 uppercase tracking-wide font-semibold flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#d99e2b' }}></span> Outstanding
          </div>
          <div className="text-2xl font-bold mt-1 font-mono text-gray-900">{fmt(outstanding)}</div>
          <div className="text-xs text-gray-400 mt-1">{outRows.length} invoices sent</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-5 border-l-4 border-l-emerald-500">
          <div className="text-[11px] text-gray-500 uppercase tracking-wide font-semibold flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Paid (this month)
          </div>
          <div className="text-2xl font-bold mt-1 font-mono text-gray-900">{fmt(paidThisMonth)}</div>
          <div className="text-xs text-gray-400 mt-1">{paidRows.length} collected · {monthLabel}</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-5 border-l-4 border-l-gray-400">
          <div className="text-[11px] text-gray-500 uppercase tracking-wide font-semibold flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-gray-400"></span> Archived (YTD)
          </div>
          <div className="text-2xl font-bold mt-1 font-mono text-gray-900">{fmt(archivedYTD)}</div>
          <div className="text-xs text-gray-400 mt-1">{archRows.length} completed · {now.getFullYear()}</div>
        </div>
      </div>

      {/* ACTIVE SUBSCRIPTIONS */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden mb-8">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-900">Active Subscriptions</h2>
            <p className="text-xs text-gray-500 mt-0.5">Recurring services that contribute to MRR</p>
          </div>
          <span className="text-xs text-gray-400">{subscriptions.length} subscriptions</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr className="text-left text-[11px] text-gray-500 uppercase tracking-wider">
                <th className="px-6 py-3">Client</th>
                <th className="px-6 py-3">Service</th>
                <th className="px-6 py-3">Started</th>
                <th className="px-6 py-3 text-right">Months Active</th>
                <th className="px-6 py-3">Latest WO</th>
                <th className="px-6 py-3">Stage</th>
                <th className="px-6 py-3 text-right">Monthly Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {subscriptions.map((s: any) => (
                <tr key={s.id} className={`hover:bg-gray-50 ${s.onHold ? 'opacity-60' : ''}`}>
                  <td className="px-6 py-3 font-medium text-gray-900">
                    <span className="inline-flex items-center gap-2">
                      <span className={`w-1.5 h-1.5 rounded-full ${s.onHold ? 'bg-gray-400' : 'bg-gray-900'}`}></span>
                      {s.client}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-gray-700">{s.service}</td>
                  <td className="px-6 py-3 text-gray-500">{s.started}</td>
                  <td className="px-6 py-3 text-right text-gray-600 font-mono">{s.monthsActive}</td>
                  <td className="px-6 py-3 text-gray-400 font-mono text-xs">{s.id.substring(0,11)}</td>
                  <td className="px-6 py-3">
                    {s.onHold ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200">On Hold</span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-200">{s.stage}</span>
                    )}
                  </td>
                  <td className="px-6 py-3 text-right font-mono font-semibold text-gray-900">{fmt(s.rate)}</td>
                </tr>
              ))}
              {subscriptions.length === 0 && (
                <tr><td colSpan={7} className="px-6 py-8 text-center text-gray-400 text-sm">No active subscriptions</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* REVENUE BY CLIENT (kept from original) */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Revenue by Client</h2>
          <span className="text-xs text-gray-400">{clientRows.length} clients</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr className="text-left text-[11px] text-gray-500 uppercase tracking-wider">
                <th className="px-6 py-3">Client</th>
                <th className="px-6 py-3 text-right">WOs</th>
                <th className="px-6 py-3 text-right">Pipeline</th>
                <th className="px-6 py-3 text-right">Revenue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {clientRows.map(c => (
                <tr key={c.name} className="hover:bg-gray-50">
                  <td className="px-6 py-3 font-medium text-gray-900">{c.name}</td>
                  <td className="px-6 py-3 text-right text-gray-500 font-mono">{c.wos}</td>
                  <td className="px-6 py-3 text-right font-mono text-gray-600">{fmt(c.pipeline)}</td>
                  <td className="px-6 py-3 text-right font-mono font-semibold text-green-600">{fmt(c.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
