import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'

function currentMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function monthLabel(m: string) {
  const [y, mo] = m.split('-')
  return new Date(Number(y), Number(mo) - 1, 1)
    .toLocaleString('default', { month: 'long', year: 'numeric' })
}

export const dynamic = 'force-dynamic'

export default async function ReportsPage() {
  const supabase = createClient()
  const month = currentMonth()
  const FILE_TYPES = ['profile_performance', 'post_performance', 'paid_performance', 'metrics_excel']

  const [{ data: uploads }, { data: reports }, { data: clientRows }] = await Promise.all([
    supabase.from('monthly_uploads').select('client_id, file_type, parse_status').eq('month', month),
    supabase.from('client_reports').select('client_id, status, narrative_generated_at').eq('month', month),
    supabase.from('clients').select('id, name, report_color, report_initials').eq('reports_enabled', true).order('name'),
  ])

  const CLIENTS = (clientRows || []).map((c: any) => ({
    id: c.id,
    name: c.name,
    initials: c.report_initials || (c.name.split(' ').slice(0,2).map((w: string) => w[0]?.toUpperCase() || '').join('')),
    color: c.report_color || '#6366f1',
  }))

  function uploadCountFor(clientId: string) {
    return uploads?.filter(u => u.client_id === clientId && u.parse_status === 'done').length || 0
  }

  function reportFor(clientId: string) {
    return reports?.find(r => r.client_id === clientId)
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <div className="border-b px-6 py-4"
        style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}>
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div>
            <Link href="/dashboard"
              style={{ fontSize: 13, color: 'var(--text-muted)', textDecoration: 'none' }}>
              ← Board
            </Link>
            <h1 className="text-2xl font-bold mt-1" style={{ color: 'var(--text)' }}>
              Client Reports
            </h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {monthLabel(month)} · Monthly performance reports
            </p>
          </div>
          <Link href="/reports/upload"
            className="px-4 py-2 rounded-lg text-sm font-semibold"
            style={{ background: 'var(--brand-accent, #d99e2b)', color: '#1a2744', textDecoration: 'none' }}>
            ⬆ Upload Files
          </Link>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8 space-y-3">
        {CLIENTS.map(client => {
          const uploadCount = uploadCountFor(client.id)
          const report = reportFor(client.id)
          const allFilesIn = uploadCount === FILE_TYPES.length
          const isApproved = report?.status === 'ready'
          const hasNarrative = !!report?.narrative_generated_at

          return (
            <div key={client.id}
              className="rounded-xl border p-5 flex items-center gap-4"
              style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}>

              <div className="w-12 h-12 rounded-xl flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
                style={{ background: client.color }}>
                {client.initials}
              </div>

              <div className="flex-1 min-w-0">
                <div className="font-semibold" style={{ color: 'var(--text)' }}>{client.name}</div>
                <div className="flex items-center gap-4 mt-1 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    {FILE_TYPES.map(ft => {
                      const uploaded = uploads?.some(u =>
                        u.client_id === client.id && u.file_type === ft && u.parse_status === 'done'
                      )
                      return (
                        <div key={ft} className="w-2 h-2 rounded-full" title={ft.replace(/_/g, ' ')}
                          style={{ background: uploaded ? '#10b981' : 'var(--border)' }} />
                      )
                    })}
                    <span className="text-xs ml-1" style={{ color: 'var(--text-muted)' }}>
                      {uploadCount}/{FILE_TYPES.length} files
                    </span>
                  </div>

                  {isApproved ? (
                    <span className="text-xs font-semibold" style={{ color: '#10b981' }}>
                      ✓ Live in portal
                    </span>
                  ) : hasNarrative ? (
                    <span className="text-xs" style={{ color: '#f59e0b' }}>
                      ⟳ Draft — needs approval
                    </span>
                  ) : uploadCount > 0 ? (
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      Files uploaded — generate narrative
                    </span>
                  ) : (
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      No files yet
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                <Link href={`/reports/upload?client=${client.id}`}
                  className="text-xs px-3 py-1.5 rounded-lg font-medium"
                  style={{ background: 'var(--bg-sunken, #f1f5f9)', color: 'var(--text-muted)', textDecoration: 'none' }}>
                  ⬆ Upload
                </Link>
                <Link href={`/reports/${client.id}`}
                  className="text-xs px-3 py-1.5 rounded-lg font-semibold"
                  style={{ background: client.color, color: 'white', textDecoration: 'none' }}>
                  View Report →
                </Link>
              </div>
            </div>
          )
        })}
      </div>

      <div className="max-w-4xl mx-auto px-4 pb-12">
        <div className="rounded-lg border p-5"
          style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}>
          <div className="text-sm font-semibold mb-3" style={{ color: 'var(--text)' }}>📋 Monthly workflow</div>
          <ol className="space-y-2">
            {[
              'Export Profile Performance, Post Performance, and Paid Performance CSVs from Sprout Social',
              "Export the client's metrics Excel file",
              'Click "Upload Files" → select client + month → drop all four files',
              'Open the client report → click "Generate" for the AI narrative',
              'Review with the team — edit if needed',
              'Click "Approve for Client" → report goes live in the portal',
            ].map((step, i) => (
              <li key={i} className="flex items-start gap-2 text-sm" style={{ color: 'var(--text-muted)' }}>
                <span className="font-mono text-xs mt-0.5 flex-shrink-0"
                  style={{ color: 'var(--brand-accent, #d99e2b)' }}>{i + 1}.</span>
                {step}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  )
}
