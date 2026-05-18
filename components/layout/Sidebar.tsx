'use client'
import { useState } from 'react'
import { usePathname } from 'next/navigation'

const NAV = [
  { href: '/dashboard',           label: 'Board',           icon: '⬜' },
  { href: '/dashboard/pipeline',  label: 'Pipeline Health', icon: '📊' },
  { href: '/dashboard/finance',   label: 'Finance',         icon: '💰', adminOnly: true },
  { href: '/dashboard/clients',   label: 'Clients',         icon: '🏢', adminOnly: true },
  { href: '/dashboard/services',  label: 'Services',        icon: '⚙️',  adminOnly: true },
  { href: '/dashboard/tasks',     label: 'My Tasks',        icon: '✓' },
  { href: '/dashboard/recent',    label: 'Recent Changes',  icon: '🔔' },
  { href: '/dashboard/all',       label: 'All Work Orders', icon: '☰' },
]

export default function Sidebar({ member }: { member: any }) {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const isAdmin = member?.role === 'admin'
  const items = NAV.filter(n => !n.adminOnly || isAdmin)

  return (
    <>
      {/* Mobile top bar with hamburger */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-30 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between shadow-sm">
        <button onClick={() => setMobileOpen(true)} className="p-1.5 -ml-1 rounded hover:bg-gray-100">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 12h18M3 6h18M3 18h18" />
          </svg>
        </button>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs"
               style={{ background: '#1a2b4a', color: '#d99e2b' }}>A</div>
          <span className="font-semibold text-sm text-gray-900">A&amp;B Tracker</span>
        </div>
        <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white"
             style={{ background: '#2d4a7c' }}>
          {member?.name?.[0] || '?'}
        </div>
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 bg-black/50 z-40" onClick={() => setMobileOpen(false)} />
      )}

      {/* Sidebar — fixed slide-in on mobile, static column on desktop */}
      <aside className={`fixed md:static top-0 left-0 bottom-0 z-50 w-64 md:w-56 flex-shrink-0 flex flex-col border-r border-gray-200 bg-white transition-transform md:transition-none ${
        mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
      }`}>
        {/* Logo */}
        <div className="px-4 py-5 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm"
              style={{ background: '#1a2b4a', color: '#d99e2b' }}>A</div>
            <div>
              <div className="font-semibold text-sm text-gray-900">A&amp;B Tracker</div>
              <div className="text-xs text-gray-400">Work Orders</div>
            </div>
          </div>
          <button onClick={() => setMobileOpen(false)} className="md:hidden text-gray-400 hover:text-gray-700 text-2xl leading-none w-8 h-8 flex items-center justify-center">×</button>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {items.map(item => {
            const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
            return (
              <a key={item.href} href={item.href} onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
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
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white"
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
    </>
  )
}
