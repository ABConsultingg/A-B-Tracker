#!/bin/bash
set -e
cd ~/ab-tracker

echo "→ Adding Today's Due + Overdue widget to BoardClient..."

python3 << 'PYEOF'
path = 'components/work-orders/BoardClient.tsx'
with open(path) as f:
    c = f.read()

# Add mounted state for time-safe rendering (avoid hydration mismatch)
if 'const [mounted, setMounted]' not in c:
    # Add useEffect import if not present (it should be)
    if 'useEffect' not in c.split('\n')[1]:
        c = c.replace(
            "import { useState, useMemo, useEffect } from 'react'",
            "import { useState, useMemo, useEffect } from 'react'"
        )
    # Insert mounted state right after the existing component state declarations
    c = c.replace(
        "const [workOrders, setWorkOrders] = useState<WorkOrder[]>(initialWorkOrders)",
        "const [workOrders, setWorkOrders] = useState<WorkOrder[]>(initialWorkOrders)\n  const [mounted, setMounted] = useState(false)\n  useEffect(() => { setMounted(true) }, [])"
    )
    print("✅ mounted state added")

# Add useMemo for due-today + overdue computation
old_grouped = """  const grouped = useMemo(() => {"""

new_grouped = """  // Today's Due + Overdue work orders (active stages only)
  const dueAlerts = useMemo(() => {
    if (!mounted) return { dueToday: [], overdue: [] }
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const todayEnd = new Date(todayStart)
    todayEnd.setDate(todayEnd.getDate() + 1)
    const dueToday: WorkOrder[] = []
    const overdue: WorkOrder[] = []
    workOrders.forEach(wo => {
      if (!wo.due_date) return
      if (['paid', 'archived'].includes(wo.stage)) return
      const dd = new Date(wo.due_date)
      if (dd >= todayStart && dd < todayEnd) dueToday.push(wo)
      else if (dd < todayStart) overdue.push(wo)
    })
    // Sort overdue by oldest first
    overdue.sort((a, b) => new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime())
    return { dueToday, overdue }
  }, [workOrders, mounted])

  const grouped = useMemo(() => {"""

if old_grouped in c and 'dueAlerts' not in c:
    c = c.replace(old_grouped, new_grouped)
    print("✅ dueAlerts computation added")

# Add widget UI right before the desktop kanban board
old_desktop = """      {/* Desktop */}
      <div className="hidden md:block flex-1 overflow-x-auto px-6 py-4">"""

new_desktop = """      {/* Today's Due + Overdue widget (desktop) */}
      {mounted && (dueAlerts.dueToday.length > 0 || dueAlerts.overdue.length > 0) && (
        <div className="hidden md:flex gap-3 px-6 pt-4 pb-2">
          {dueAlerts.overdue.length > 0 && (
            <div className="flex-1 bg-red-50 border border-red-200 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-red-600">⚠️</span>
                  <span className="text-xs font-bold text-red-700 uppercase tracking-wide">
                    Overdue ({dueAlerts.overdue.length})
                  </span>
                </div>
              </div>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {dueAlerts.overdue.slice(0, 5).map(wo => (
                  <button key={wo.id} onClick={() => setSelectedWo(wo)}
                    className="block w-full text-left text-xs bg-white hover:bg-red-100 border border-red-100 rounded px-2 py-1.5 transition-colors">
                    <div className="font-medium text-gray-900 truncate">{wo.title}</div>
                    <div className="text-red-600 text-[10px] mt-0.5">
                      {wo.clients?.name && <span>{wo.clients.name} · </span>}
                      Due {new Date(wo.due_date!).toLocaleDateString()}
                      {wo.team_members?.name && <span> · {wo.team_members.name}</span>}
                    </div>
                  </button>
                ))}
                {dueAlerts.overdue.length > 5 && (
                  <div className="text-[10px] text-red-500 italic pt-1">+ {dueAlerts.overdue.length - 5} more</div>
                )}
              </div>
            </div>
          )}
          {dueAlerts.dueToday.length > 0 && (
            <div className="flex-1 bg-amber-50 border border-amber-200 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span>📅</span>
                  <span className="text-xs font-bold text-amber-700 uppercase tracking-wide">
                    Due Today ({dueAlerts.dueToday.length})
                  </span>
                </div>
              </div>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {dueAlerts.dueToday.slice(0, 5).map(wo => (
                  <button key={wo.id} onClick={() => setSelectedWo(wo)}
                    className="block w-full text-left text-xs bg-white hover:bg-amber-100 border border-amber-100 rounded px-2 py-1.5 transition-colors">
                    <div className="font-medium text-gray-900 truncate">{wo.title}</div>
                    <div className="text-amber-700 text-[10px] mt-0.5">
                      {wo.clients?.name && <span>{wo.clients.name}</span>}
                      {wo.team_members?.name && <span> · {wo.team_members.name}</span>}
                    </div>
                  </button>
                ))}
                {dueAlerts.dueToday.length > 5 && (
                  <div className="text-[10px] text-amber-600 italic pt-1">+ {dueAlerts.dueToday.length - 5} more</div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Today's Due + Overdue widget (mobile) */}
      {mounted && (dueAlerts.dueToday.length > 0 || dueAlerts.overdue.length > 0) && (
        <div className="md:hidden px-3 pt-3 pb-1 space-y-2">
          {dueAlerts.overdue.length > 0 && (
            <button onClick={() => {/* could filter to overdue */}}
              className="w-full bg-red-50 border border-red-200 rounded-lg p-2.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span>⚠️</span>
                <span className="text-xs font-bold text-red-700 uppercase">{dueAlerts.overdue.length} Overdue</span>
              </div>
              <span className="text-[10px] text-red-600 truncate ml-2">
                {dueAlerts.overdue[0].title.substring(0, 30)}
                {dueAlerts.overdue.length > 1 ? ` +${dueAlerts.overdue.length - 1}` : ''}
              </span>
            </button>
          )}
          {dueAlerts.dueToday.length > 0 && (
            <button onClick={() => { if (dueAlerts.dueToday[0]) setSelectedWo(dueAlerts.dueToday[0]) }}
              className="w-full bg-amber-50 border border-amber-200 rounded-lg p-2.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span>📅</span>
                <span className="text-xs font-bold text-amber-700 uppercase">{dueAlerts.dueToday.length} Due Today</span>
              </div>
              <span className="text-[10px] text-amber-700 truncate ml-2">
                {dueAlerts.dueToday[0].title.substring(0, 30)}
                {dueAlerts.dueToday.length > 1 ? ` +${dueAlerts.dueToday.length - 1}` : ''}
              </span>
            </button>
          )}
        </div>
      )}

      {/* Desktop */}
      <div className="hidden md:block flex-1 overflow-x-auto px-6 py-4">"""

if old_desktop in c:
    c = c.replace(old_desktop, new_desktop)
    print("✅ Widget UI added")

with open(path, 'w') as f:
    f.write(c)

print("\n✅ Today's Due + Overdue widget complete!")
PYEOF

echo ""
echo "Run: cd ~/ab-tracker && npm run build && git add -A && git commit -m 'Feature: Today Due + Overdue widget on board' && git push"
