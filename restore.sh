#!/bin/bash
# ab-tracker — restore the full app after auth fix
# Run from inside ~/ab-tracker: bash restore.sh

set -e
cd ~/ab-tracker

echo "→ Restoring middleware (real version with auth refresh, no redirects)..."

cat > middleware.ts << 'EOF'
import { type NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet: { name: string; value: string; options?: any }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options))
        }
      }
    }
  )

  // Just refresh the session if needed; let pages handle their own auth checks
  await supabase.auth.getUser()
  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)']
}
EOF

echo "→ Restoring dashboard layout (auth check + sidebar)..."

cat > app/dashboard/layout.tsx << 'EOF'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/layout/Sidebar'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: member } = await supabase
    .from('team_members')
    .select('*')
    .eq('auth_user_id', user.id)
    .single()

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar member={member} />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  )
}
EOF

echo "→ Restoring main dashboard page (kanban board)..."

cat > app/dashboard/page.tsx << 'EOF'
import { createClient } from '@/lib/supabase/server'
import BoardClient from '@/components/work-orders/BoardClient'

export default async function DashboardPage() {
  const supabase = createClient()

  const { data: workOrders } = await supabase
    .from('work_orders')
    .select(`
      *,
      clients!work_orders_client_id_fkey(name),
      services!work_orders_service_id_fkey(name, category),
      team_members!work_orders_owner_id_fkey(name)
    `)
    .not('stage', 'eq', 'archived')
    .order('created_at', { ascending: false })
    .limit(500)

  const { data: clients } = await supabase
    .from('clients').select('id, name').order('name')

  const { data: services } = await supabase
    .from('services').select('id, name, category, base_price, occurrence').order('name')

  const { data: team } = await supabase
    .from('team_members').select('id, name, role').order('name')

  return (
    <BoardClient
      initialWorkOrders={workOrders || []}
      clients={clients || []}
      services={services || []}
      team={team || []}
    />
  )
}
EOF

echo "→ Restoring All Work Orders page..."

cat > app/dashboard/all/page.tsx << 'EOF'
import { createClient } from '@/lib/supabase/server'
import { STAGES } from '@/lib/types'

export default async function AllWorkOrdersPage() {
  const supabase = createClient()
  const { data: wos } = await supabase
    .from('work_orders')
    .select(`
      *,
      clients!work_orders_client_id_fkey(name),
      services!work_orders_service_id_fkey(name),
      team_members!work_orders_owner_id_fkey(name)
    `)
    .order('created_at', { ascending: false })
    .limit(500)

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">All Work Orders</h1>
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr className="text-left text-xs text-gray-500 uppercase tracking-wider">
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Client</th>
              <th className="px-4 py-3">Service</th>
              <th className="px-4 py-3">Assignee</th>
              <th className="px-4 py-3">Stage</th>
              <th className="px-4 py-3 text-right">Cost</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {(wos || []).map((wo: any) => {
              const stage = STAGES.find(s => s.id === wo.stage)
              return (
                <tr key={wo.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{wo.title}</td>
                  <td className="px-4 py-3 text-gray-600">{wo.clients?.name || '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{wo.services?.name || '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{wo.team_members?.name || '—'}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs px-2 py-1 rounded font-medium text-white"
                      style={{ background: stage?.color }}>{stage?.label}</span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-gray-900">
                    ${((wo.est_cost || 0) + (wo.add_cost || 0)).toLocaleString()}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
EOF

echo "→ Restoring My Tasks page..."

cat > app/dashboard/tasks/page.tsx << 'EOF'
import { createClient } from '@/lib/supabase/server'
import { STAGES } from '@/lib/types'

export default async function MyTasksPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: member } = await supabase.from('team_members').select('id').eq('auth_user_id', user!.id).single()

  const { data: wos } = await supabase
    .from('work_orders')
    .select(`
      *,
      clients!work_orders_client_id_fkey(name),
      services!work_orders_service_id_fkey(name)
    `)
    .eq('owner_id', member?.id)
    .not('stage', 'in', '(paid,archived)')
    .order('due_date', { ascending: true })

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">My Tasks</h1>
      <div className="space-y-2">
        {(wos || []).map((wo: any) => {
          const stage = STAGES.find(s => s.id === wo.stage)
          return (
            <div key={wo.id} className="bg-white rounded-lg border border-gray-200 p-4 flex items-center justify-between">
              <div>
                <div className="font-medium text-gray-900">{wo.title}</div>
                <div className="text-sm text-gray-500 mt-1">
                  {wo.clients?.name} · {wo.services?.name}
                  {wo.due_date && ` · Due ${new Date(wo.due_date).toLocaleDateString()}`}
                </div>
              </div>
              <span className="text-xs px-2 py-1 rounded font-medium text-white"
                style={{ background: stage?.color }}>{stage?.label}</span>
            </div>
          )
        })}
        {(!wos || wos.length === 0) && <div className="text-center text-gray-500 py-12">No active tasks 🎉</div>}
      </div>
    </div>
  )
}
EOF

echo "→ Restoring Pipeline Health page..."

cat > app/dashboard/pipeline/page.tsx << 'EOF'
import { createClient } from '@/lib/supabase/server'
import { STAGES } from '@/lib/types'

export default async function PipelinePage() {
  const supabase = createClient()
  const { data: wos } = await supabase.from('work_orders').select('stage, est_cost, add_cost')

  const byStage: Record<string, { count: number; value: number }> = {}
  STAGES.forEach(s => byStage[s.id] = { count: 0, value: 0 })
  ;(wos || []).forEach(wo => {
    if (!byStage[wo.stage]) return
    byStage[wo.stage].count++
    byStage[wo.stage].value += (wo.est_cost || 0) + (wo.add_cost || 0)
  })

  const totalCount = (wos || []).length
  const totalValue = Object.values(byStage).reduce((sum, s) => sum + s.value, 0)

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Pipeline Health</h1>
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <div className="text-sm text-gray-500">Total Work Orders</div>
          <div className="text-3xl font-bold mt-1">{totalCount}</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <div className="text-sm text-gray-500">Total Pipeline Value</div>
          <div className="text-3xl font-bold mt-1">${totalValue.toLocaleString()}</div>
        </div>
      </div>
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="font-semibold text-gray-900 mb-4">By Stage</h2>
        <div className="space-y-3">
          {STAGES.map(s => {
            const data = byStage[s.id]
            const pct = totalCount ? (data.count / totalCount) * 100 : 0
            return (
              <div key={s.id}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ background: s.color }} />
                    <span className="font-medium">{s.label}</span>
                  </div>
                  <span className="text-gray-500">{data.count} · ${data.value.toLocaleString()}</span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: s.color }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
EOF

echo "→ Restoring Finance page..."

cat > app/dashboard/finance/page.tsx << 'EOF'
import { createClient } from '@/lib/supabase/server'

export default async function FinancePage() {
  const supabase = createClient()
  const { data: wos } = await supabase
    .from('work_orders')
    .select(`stage, est_cost, add_cost, clients!work_orders_client_id_fkey(name)`)

  const invoiced = (wos || []).filter(w => w.stage === 'invoiced')
                              .reduce((s, w) => s + (w.est_cost || 0) + (w.add_cost || 0), 0)
  const paid = (wos || []).filter(w => w.stage === 'paid')
                          .reduce((s, w) => s + (w.est_cost || 0) + (w.add_cost || 0), 0)
  const pending = (wos || []).filter(w => !['paid','archived','invoiced'].includes(w.stage))
                             .reduce((s, w) => s + (w.est_cost || 0) + (w.add_cost || 0), 0)

  const clientStats: Record<string, { wos: number; revenue: number }> = {}
  ;(wos || []).forEach((w: any) => {
    const name = w.clients?.name || 'Unknown'
    if (!clientStats[name]) clientStats[name] = { wos: 0, revenue: 0 }
    clientStats[name].wos++
    if (['paid','archived'].includes(w.stage)) clientStats[name].revenue += (w.est_cost || 0) + (w.add_cost || 0)
  })
  const clientRows = Object.entries(clientStats)
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.revenue - a.revenue)

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Finance</h1>
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <div className="text-sm text-gray-500">Paid (YTD)</div>
          <div className="text-2xl font-bold mt-1 text-green-600">${paid.toLocaleString()}</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <div className="text-sm text-gray-500">Invoiced (Open)</div>
          <div className="text-2xl font-bold mt-1" style={{ color: '#d99e2b' }}>${invoiced.toLocaleString()}</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <div className="text-sm text-gray-500">In Pipeline</div>
          <div className="text-2xl font-bold mt-1 text-gray-700">${pending.toLocaleString()}</div>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Revenue by Client</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr className="text-left text-xs text-gray-500 uppercase tracking-wider">
              <th className="px-6 py-3">Client</th>
              <th className="px-6 py-3 text-right">Work Orders</th>
              <th className="px-6 py-3 text-right">Revenue</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {clientRows.map(c => (
              <tr key={c.name} className="hover:bg-gray-50">
                <td className="px-6 py-3 font-medium text-gray-900">{c.name}</td>
                <td className="px-6 py-3 text-right text-gray-500 font-mono">{c.wos}</td>
                <td className="px-6 py-3 text-right font-mono font-semibold text-gray-900">${c.revenue.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
EOF

echo "→ Restoring Clients page..."

cat > app/dashboard/clients/page.tsx << 'EOF'
import { createClient } from '@/lib/supabase/server'

export default async function ClientsPage() {
  const supabase = createClient()
  const { data: clients } = await supabase.from('clients').select('*').order('name')
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Clients</h1>
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr className="text-left text-xs text-gray-500 uppercase tracking-wider">
              <th className="px-6 py-3">Name</th>
              <th className="px-6 py-3">Status</th>
              <th className="px-6 py-3">Account Lead</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {(clients || []).map((c: any) => (
              <tr key={c.id} className="hover:bg-gray-50">
                <td className="px-6 py-3 font-medium text-gray-900">{c.name}</td>
                <td className="px-6 py-3"><span className="text-xs px-2 py-0.5 rounded bg-green-100 text-green-700">{c.status || 'active'}</span></td>
                <td className="px-6 py-3 text-gray-600">{c.account_lead || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
EOF

echo "→ Restoring Services page..."

cat > app/dashboard/services/page.tsx << 'EOF'
import { createClient } from '@/lib/supabase/server'

export default async function ServicesPage() {
  const supabase = createClient()
  const { data: services } = await supabase.from('services').select('*').order('name')
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Services</h1>
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr className="text-left text-xs text-gray-500 uppercase tracking-wider">
              <th className="px-6 py-3">Service</th>
              <th className="px-6 py-3">Category</th>
              <th className="px-6 py-3">Occurrence</th>
              <th className="px-6 py-3 text-right">Base Price</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {(services || []).map((s: any) => (
              <tr key={s.id} className="hover:bg-gray-50">
                <td className="px-6 py-3 font-medium text-gray-900">{s.name}</td>
                <td className="px-6 py-3 text-gray-600">{s.category}</td>
                <td className="px-6 py-3 text-gray-600">{s.occurrence}</td>
                <td className="px-6 py-3 text-right font-mono">${(s.base_price || 0).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
EOF

echo "→ Adding sign-out route handler..."

mkdir -p app/api/logout
cat > app/api/logout/route.ts << 'EOF'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const response = NextResponse.redirect(new URL('/login', request.url), { status: 303 })
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] || 'default'
  response.cookies.delete(`sb-${projectRef}-auth-token`)
  return response
}
EOF

echo "→ Updating Sidebar to use logout route..."

cat > components/layout/Sidebar.tsx << 'EOF'
'use client'
import { usePathname } from 'next/navigation'

const NAV = [
  { href: '/dashboard',           label: 'Board',           icon: '⬜' },
  { href: '/dashboard/pipeline',  label: 'Pipeline Health', icon: '📊' },
  { href: '/dashboard/finance',   label: 'Finance',         icon: '💰', adminOnly: true },
  { href: '/dashboard/clients',   label: 'Clients',         icon: '🏢', adminOnly: true },
  { href: '/dashboard/services',  label: 'Services',        icon: '⚙️',  adminOnly: true },
  { href: '/dashboard/tasks',     label: 'My Tasks',        icon: '✓' },
  { href: '/dashboard/all',       label: 'All Work Orders', icon: '☰' },
]

export default function Sidebar({ member }: { member: any }) {
  const pathname = usePathname()
  const isAdmin = member?.role === 'admin'

  return (
    <aside className="w-56 flex-shrink-0 flex flex-col border-r border-gray-200 bg-white">
      <div className="px-4 py-5 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm"
            style={{ background: '#1a2b4a', color: '#d99e2b' }}>A</div>
          <div>
            <div className="font-semibold text-sm text-gray-900">A&amp;B Tracker</div>
            <div className="text-xs text-gray-400">Work Orders</div>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {NAV.filter(n => !n.adminOnly || isAdmin).map(item => {
          const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
          return (
            <a key={item.href} href={item.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                active ? 'text-white' : 'text-gray-600 hover:bg-gray-100'
              }`}
              style={active ? { background: '#1a2b4a' } : {}}>
              <span className="text-base">{item.icon}</span>
              {item.label}
            </a>
          )
        })}
      </nav>

      <div className="px-3 py-4 border-t border-gray-100">
        <div className="flex items-center gap-3 px-3 py-2 mb-2">
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white"
            style={{ background: '#2d4a7c' }}>
            {member?.name?.[0] || '?'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-gray-900 truncate">{member?.name || 'User'}</div>
            <div className="text-xs text-gray-400 capitalize">{member?.role}</div>
          </div>
        </div>
        <form action="/api/logout" method="POST">
          <button type="submit" className="w-full px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg text-left">
            Sign out
          </button>
        </form>
      </div>
    </aside>
  )
}
EOF

echo ""
echo "✅ All files restored!"
echo ""
echo "Next: build + push"
echo "  cd ~/ab-tracker && npm run build && git add -A && git commit -m 'Restore: real app pages' && git push"
echo ""
