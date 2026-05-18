#!/bin/bash
set -e
cd ~/ab-tracker

echo "→ Creating Recent Changes activity feed..."

mkdir -p components/work-orders

cat > components/work-orders/RecentChangesClient.tsx << 'EOF'
'use client'
import { useState, useMemo } from 'react'
import { STAGES } from '@/lib/types'

type Event = {
  id: string
  type: 'created' | 'stage_change' | 'updated'
  woId: string
  woTitle: string
  clientName?: string
  at: string
  by?: string
  fromStage?: string
  toStage?: string
}

export default function RecentChangesClient({ events }: { events: Event[] }) {
  const [range, setRange] = useState<'24h' | '7d' | '30d' | 'all'>('7d')

  const filtered = useMemo(() => {
    if (range === 'all') return events
    const cutoff = new Date()
    if (range === '24h') cutoff.setDate(cutoff.getDate() - 1)
    if (range === '7d') cutoff.setDate(cutoff.getDate() - 7)
    if (range === '30d') cutoff.setDate(cutoff.getDate() - 30)
    return events.filter(e => new Date(e.at) > cutoff)
  }, [events, range])

  function relativeTime(iso: string) {
    const diff = Date.now() - new Date(iso).getTime()
    const m = Math.floor(diff / 60000)
    const h = Math.floor(diff / 3600000)
    const d = Math.floor(diff / 86400000)
    if (m < 1) return 'just now'
    if (m < 60) return `${m}m ago`
    if (h < 24) return `${h}h ago`
    if (d < 7) return `${d}d ago`
    return new Date(iso).toLocaleDateString()
  }

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-gray-900">Recent Changes</h1>
        <p className="text-sm text-gray-500 mt-1">New work orders, stage changes, and edits across your team</p>
      </div>

      <div className="flex gap-2 mb-4">
        {(['24h','7d','30d','all'] as const).map(r => (
          <button key={r} onClick={() => setRange(r)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
              range === r ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}>
            {r === '24h' ? 'Last 24 hours' : r === '7d' ? 'Last 7 days' : r === '30d' ? 'Last 30 days' : 'All time'}
          </button>
        ))}
        <div className="ml-auto text-xs text-gray-500 self-center">{filtered.length} events</div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-50">
        {filtered.length === 0 ? (
          <div className="text-center text-gray-400 py-12 text-sm">No activity in this period</div>
        ) : filtered.map(e => {
          const toStage = e.toStage ? STAGES.find(s => s.id === e.toStage) : null
          const fromStage = e.fromStage ? STAGES.find(s => s.id === e.fromStage) : null
          return (
            <a key={e.id} href={`/dashboard?wo=${e.woId}`}
              className="flex items-start gap-3 p-3 md:p-4 hover:bg-blue-50 transition-colors">
              <div className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-base mt-0.5"
                style={{
                  background: e.type === 'created' ? '#dcfce7' :
                              e.type === 'stage_change' ? (toStage?.color || '#e0e7ff') + '33' :
                              '#fef3c7',
                }}>
                {e.type === 'created' ? '🆕' : e.type === 'stage_change' ? '🔄' : '✏️'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-gray-700 leading-snug">
                  {e.type === 'created' && <><span className="font-semibold text-gray-900">{e.woTitle}</span> <span className="text-gray-500">was created</span></>}
                  {e.type === 'stage_change' && (
                    <>
                      <span className="font-semibold text-gray-900">{e.woTitle}</span>
                      <span className="text-gray-500"> moved to </span>
                      <span className="font-medium" style={{ color: toStage?.color }}>{toStage?.label || e.toStage}</span>
                      {fromStage && <span className="text-gray-400 text-xs"> from {fromStage.label}</span>}
                    </>
                  )}
                  {e.type === 'updated' && <><span className="font-semibold text-gray-900">{e.woTitle}</span> <span className="text-gray-500">was edited</span></>}
                </div>
                <div className="text-xs text-gray-500 mt-1 flex flex-wrap items-center gap-x-2">
                  {e.clientName && <><span>🏢 {e.clientName}</span><span>·</span></>}
                  <span title={new Date(e.at).toLocaleString()}>{relativeTime(e.at)}</span>
                  {e.by && <><span>·</span><span>by {e.by}</span></>}
                </div>
              </div>
            </a>
          )
        })}
      </div>
    </div>
  )
}
EOF

cat > app/dashboard/recent/page.tsx << 'EOF'
import { createClient } from '@/lib/supabase/server'
import RecentChangesClient from '@/components/work-orders/RecentChangesClient'

export const dynamic = 'force-dynamic'

export default async function RecentChangesPage() {
  const supabase = createClient()

  // Get all WOs with client name
  const { data: workOrders } = await supabase
    .from('work_orders')
    .select(`id, title, created_at, updated_at, clients!work_orders_client_id_fkey(name)`)
    .order('updated_at', { ascending: false })
    .limit(500)

  // Get stage history
  const { data: history } = await supabase
    .from('wo_stage_history')
    .select('id, work_order_id, from_stage, to_stage, changed_at, changed_by')
    .order('changed_at', { ascending: false })
    .limit(200)

  // Team for name lookup
  const { data: team } = await supabase.from('team_members').select('id, name, auth_user_id')
  const authMap: Record<string, string> = {}
  ;(team || []).forEach((t: any) => { if (t.auth_user_id) authMap[t.auth_user_id] = t.name })

  const woMap: Record<string, any> = {}
  ;(workOrders || []).forEach((w: any) => { woMap[w.id] = w })

  const events: any[] = []

  // Created events
  ;(workOrders || []).forEach((w: any) => {
    events.push({
      id: `c-${w.id}`,
      type: 'created',
      woId: w.id,
      woTitle: w.title,
      clientName: w.clients?.name,
      at: w.created_at,
    })
    // Updated events (only if updated_at differs significantly from created_at)
    if (w.updated_at && w.created_at && new Date(w.updated_at).getTime() - new Date(w.created_at).getTime() > 60000) {
      events.push({
        id: `u-${w.id}`,
        type: 'updated',
        woId: w.id,
        woTitle: w.title,
        clientName: w.clients?.name,
        at: w.updated_at,
      })
    }
  })

  // Stage change events
  ;(history || []).forEach((h: any) => {
    const wo = woMap[h.work_order_id]
    if (!wo) return
    events.push({
      id: `s-${h.id}`,
      type: 'stage_change',
      woId: h.work_order_id,
      woTitle: wo.title,
      clientName: wo.clients?.name,
      at: h.changed_at,
      by: h.changed_by ? authMap[h.changed_by] : undefined,
      fromStage: h.from_stage,
      toStage: h.to_stage,
    })
  })

  // Sort newest first
  events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())

  return <RecentChangesClient events={events.slice(0, 200)} />
}
EOF

# Add to sidebar between My Tasks and All Work Orders
python3 << 'PYEOF'
path = 'components/layout/Sidebar.tsx'
with open(path) as f:
    c = f.read()

# Look for the nav items array
old = "{ href: '/dashboard/tasks'"
if old in c and '/dashboard/recent' not in c:
    # Insert recent after tasks
    c = c.replace(
        "{ href: '/dashboard/all', label: 'All Work Orders'",
        "{ href: '/dashboard/recent', label: 'Recent Changes', icon: '🔔' },\n  { href: '/dashboard/all', label: 'All Work Orders'"
    )
    with open(path, 'w') as f:
        f.write(c)
    print("✅ Sidebar updated")
else:
    print("⚠️ Sidebar pattern not found or already added — add manually if needed")
PYEOF

echo ""
echo "✅ Recent Changes page built!"
echo ""
echo "Run: cd ~/ab-tracker && npm run build && git add -A && git commit -m 'Feature: Recent Changes activity feed' && git push"
