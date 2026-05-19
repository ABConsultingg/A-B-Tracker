'use client'
import { useState } from 'react'
import { usePathname } from 'next/navigation'
import MentionBadge from './MentionBadge'

type NavItem = {
  href: string
  label: string
  icon: string
  adminOnly?: boolean
  countKey?: keyof SidebarCounts
  section: 'views' | 'filters'
}

const NAV: NavItem[] = [
  { href: '/dashboard',           label: 'Board',           icon: '⬜', section: 'views' },
  { href: '/dashboard/pipeline',  label: 'Pipeline Health', icon: '📊', section: 'views' },
  { href: '/dashboard/finance',   label: 'Finance',         icon: '💰', adminOnly: true, section: 'views' },
  { href: '/dashboard/clients',   label: 'Clients',         icon: '🏢', adminOnly: true, countKey: 'clients', section: 'views' },
  { href: '/dashboard/services',  label: 'Services',        icon: '⚙️', adminOnly: true, section: 'views' },
  { href: '/dashboard/all',       label: 'All Work Orders', icon: '☰', countKey: 'allWos', section: 'views' },
  { href: '/dashboard/tasks',     label: 'My Tasks',        icon: '✓', countKey: 'myTasks',  section: 'filters' },
  { href: '/dashboard/mentions',  label: 'My Mentions',     icon: '@', section: 'filters' },
  { href: '/dashboard/recent',    label: 'Recent Changes',  icon: '🔔', section: 'filters' },
]

export type SidebarCounts = {
  clients?: number
  allWos?: number
  myTasks?: number
}

export default function Sidebar({
  member,
  counts = {},
}: {
  member: any
  counts?: SidebarCounts
}) {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const isAdmin = member?.role === 'admin'
  const items = NAV.filter(n => !n.adminOnly || isAdmin)

  const viewItems    = items.filter(i => i.section === 'views')
  const filterItems  = items.filter(i => i.section === 'filters')

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
          <span className="font-serif text-base font-semibold text-brand-navy">
            A<span className="text-brand-accent">&amp;</span>B Tracker
          </span>
        </div>
        <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white"
             style={{ background: 'var(--brand-navy)' }}>
          {member?.name?.[0] || '?'}
        </div>
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 bg-black/50 z-40" onClick={() => setMobileOpen(false)} />
      )}

      {/* Sidebar — fixed slide-in on mobile, static column on desktop */}
      <aside
        className={`sidebar-navy fixed md:static top-0 left-0 bottom-0 z-50 w-64 md:w-56 flex-shrink-0 flex flex-col transition-transform md:transition-none ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
        style={{
          background: 'var(--brand-navy)',
          color: '#cdd5e3',
          borderRight: '1px solid var(--brand-navy)',
        }}
      >
        {/* Logo area */}
        <div
          className="px-4 pt-5 pb-4 flex items-start justify-between"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}
        >
          <div>
            <div className="font-serif text-[22px] leading-none font-semibold text-white tracking-tight">
              A<span style={{ color: 'var(--brand-accent)' }}>&amp;</span>B
              <span className="ml-1.5">Consulting Group</span>
            </div>
            <div
              className="text-[10px] uppercase font-medium mt-2 pl-0.5"
              style={{ color: 'rgba(255,255,255,0.5)', letterSpacing: '0.12em' }}
            >
              Operations
            </div>
          </div>
          <button
            onClick={() => setMobileOpen(false)}
            className="md:hidden text-white/60 hover:text-white text-2xl leading-none w-8 h-8 flex items-center justify-center"
          >×</button>
        </div>

        {/* Nav body */}
        <nav className="flex-1 px-2.5 pt-3 pb-3 overflow-y-auto">
          {/* VIEWS section */}
          <SectionEyebrow>Views</SectionEyebrow>
          <div className="flex flex-col gap-0.5 mb-4">
            {viewItems.map(item => (
              <NavRow
                key={item.href}
                item={item}
                pathname={pathname}
                onClick={() => setMobileOpen(false)}
                count={item.countKey ? counts[item.countKey] : undefined}
              />
            ))}
          </div>

          {/* QUICK FILTERS section */}
          <SectionEyebrow>Quick Filters</SectionEyebrow>
          <div className="flex flex-col gap-0.5">
            {filterItems.map(item => (
              <NavRow
                key={item.href}
                item={item}
                pathname={pathname}
                onClick={() => setMobileOpen(false)}
                count={item.countKey ? counts[item.countKey] : undefined}
              />
            ))}
          </div>
        </nav>

        {/* User footer */}
        <div
          className="px-3 py-3"
          style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}
        >
          <div className="flex items-center gap-3 px-2 py-1.5 mb-1">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
              style={{ background: 'var(--brand-accent)', color: 'var(--brand-navy)' }}
            >
              {member?.name?.[0] || '?'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-white truncate">{member?.name || 'User'}</div>
              <div className="text-[11px] capitalize" style={{ color: 'rgba(255,255,255,0.5)' }}>
                {member?.role}
              </div>
            </div>
          </div>
          <form action="/api/logout" method="POST">
            <button
              type="submit"
              className="w-full px-3 py-1.5 text-[12px] rounded-md text-left transition-colors hover:bg-white/5"
              style={{ color: 'rgba(255,255,255,0.65)' }}
            >
              Sign out
            </button>
          </form>
        </div>
      </aside>
    </>
  )
}

function SectionEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="text-[10px] font-semibold uppercase px-2.5 pt-3 pb-1.5"
      style={{ color: 'rgba(255,255,255,0.4)', letterSpacing: '0.12em' }}
    >
      {children}
    </div>
  )
}

function NavRow({
  item,
  pathname,
  onClick,
  count,
}: {
  item: NavItem
  pathname: string
  onClick: () => void
  count?: number
}) {
  const active =
    pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))

  return (
    <a
      href={item.href}
      onClick={onClick}
      className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-[13px] font-medium transition-colors group"
      style={
        active
          ? {
              background: 'rgba(217, 158, 43, 0.15)',
              color: 'white',
              boxShadow: 'inset 2px 0 0 var(--brand-accent)',
            }
          : { color: 'rgba(255,255,255,0.85)' }
      }
      onMouseEnter={e => {
        if (!active) {
          e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
          e.currentTarget.style.color = 'white'
        }
      }}
      onMouseLeave={e => {
        if (!active) {
          e.currentTarget.style.background = 'transparent'
          e.currentTarget.style.color = 'rgba(255,255,255,0.85)'
        }
      }}
    >
      <span className="text-[14px] w-4 text-center flex-shrink-0">{item.icon}</span>
      <span className="flex-1 truncate">{item.label}</span>
      {item.adminOnly && (
        <span className="text-[10px]" style={{ color: 'var(--brand-accent)' }}>★</span>
      )}
      {typeof count === 'number' && (
        <span
          className="font-mono text-[11px] tabular-nums"
          style={{ color: active ? 'var(--brand-accent)' : 'rgba(255,255,255,0.4)' }}
        >
          {count}
        </span>
      )}
      {item.href === '/dashboard/mentions' && <MentionBadge />}
    </a>
  )
}
