'use client'
import { useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import MentionBadge from './MentionBadge'
import { useViewMode } from '@/lib/useViewMode'

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
  { href: '/dashboard/tasks/all', label: 'All Tasks',       icon: '✓✓', section: 'filters' },
  { href: '/dashboard/mentions',  label: 'My Mentions',     icon: '@', section: 'filters' },
  { href: '/dashboard/recent',    label: 'Recent Changes',  icon: '🔔', section: 'filters' },
]

// Board-applicable toggle filters that operate via URL params
type BoardFilter = {
  key: 'assignedToMe' | 'ownedByMe' | 'flagged' | 'stale' | 'overdue'
  label: string
  icon: string
  countKey: keyof SidebarCounts
}

const BOARD_FILTERS: BoardFilter[] = [
  { key: 'assignedToMe', label: 'Assigned to me', icon: '👤', countKey: 'assignedToMe' },
  { key: 'ownedByMe',    label: 'Owned by me',    icon: '★',  countKey: 'ownedByMe' },
  { key: 'flagged',      label: 'Flagged',        icon: '⚑',  countKey: 'flagged' },
  { key: 'stale',        label: 'Stale',          icon: '◷',  countKey: 'stale' },
  { key: 'overdue',      label: 'Overdue',        icon: '!',  countKey: 'overdue' },
]

export type SidebarCounts = {
  clients?: number
  allWos?: number
  myTasks?: number
  assignedToMe?: number
  ownedByMe?: number
  flagged?: number
  stale?: number
  overdue?: number
}

export type ClientBadge = {
  id: string
  name: string
  count: number
}

export type TeamMemberBadge = {
  id: string
  name: string
  slug: string
  isAdmin: boolean
}

export default function Sidebar({
  member,
  counts = {},
  clientBadges = [],
  teamMemberBadges = [],
}: {
  member: any
  counts?: SidebarCounts
  clientBadges?: ClientBadge[]
  teamMemberBadges?: TeamMemberBadge[]
}) {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [teamTasksOpen, setTeamTasksOpen] = useState(() =>
    pathname.startsWith('/dashboard/tasks/') && pathname !== '/dashboard/tasks/all'
  )
  const isAdmin = member?.role === 'admin'
  const [viewMode, setViewMode] = useViewMode(isAdmin)
  // In team mode, admin-only items are hidden even for admins.
  const items = NAV.filter(n => {
    if (!n.adminOnly) return true
    if (!isAdmin) return false
    return viewMode === 'admin'
  })

  const viewItems    = items.filter(i => i.section === 'views')
  const filterItems  = items.filter(i => i.section === 'filters')

  const onBoardOrAll = pathname === '/dashboard' || pathname === '/dashboard/all'
  const activeClient = searchParams.get('client') || ''

  function toggleBoardFilter(key: BoardFilter['key']) {
    const isCurrentlyActive = searchParams.get(key) === '1'
    const params = new URLSearchParams(searchParams.toString())
    if (isCurrentlyActive) {
      params.delete(key)
    } else {
      params.set(key, '1')
    }
    const qs = params.toString()
    const target = onBoardOrAll ? `${pathname}${qs ? '?' + qs : ''}` : `/dashboard${qs ? '?' + qs : ''}`
    router.push(target)
    setMobileOpen(false)
  }

  function toggleClientFilter(clientId: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (activeClient === clientId) {
      params.delete('client')
    } else {
      params.set('client', clientId)
    }
    const qs = params.toString()
    const target = onBoardOrAll ? `${pathname}${qs ? '?' + qs : ''}` : `/dashboard${qs ? '?' + qs : ''}`
    router.push(target)
    setMobileOpen(false)
  }

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

        {/* Admin/Team toggle — visible only to admins */}
        {isAdmin && (
          <div className="px-3 pt-3 pb-1">
            <div
              className="flex rounded-md p-[3px] gap-[2px]"
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.1)',
              }}
            >
              <button
                onClick={() => setViewMode('admin')}
                className="flex-1 py-1 rounded text-[11px] font-medium transition-colors"
                style={
                  viewMode === 'admin'
                    ? { background: 'var(--brand-accent)', color: 'var(--brand-navy)', fontWeight: 600 }
                    : { background: 'transparent', color: 'rgba(255,255,255,0.65)' }
                }
              >
                Admin
              </button>
              <button
                onClick={() => setViewMode('team')}
                className="flex-1 py-1 rounded text-[11px] font-medium transition-colors"
                style={
                  viewMode === 'team'
                    ? { background: 'var(--brand-accent)', color: 'var(--brand-navy)', fontWeight: 600 }
                    : { background: 'transparent', color: 'rgba(255,255,255,0.65)' }
                }
              >
                Team
              </button>
            </div>
          </div>
        )}

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
          <div className="flex flex-col gap-0.5 mb-1">
            {filterItems.map(item => (
              <NavRow
                key={item.href}
                item={item}
                pathname={pathname}
                onClick={() => setMobileOpen(false)}
                count={item.countKey ? counts[item.countKey] : undefined}
              />
            ))}
            {BOARD_FILTERS.map(f => {
              const active = searchParams.get(f.key) === '1'
              const count = counts[f.countKey]
              const isRed = f.key === 'flagged' || f.key === 'overdue'
              const isAmber = f.key === 'stale'
              return (
                <FilterToggleRow
                  key={f.key}
                  icon={f.icon}
                  label={f.label}
                  active={active}
                  count={count}
                  iconColor={isRed ? '#fca5a5' : isAmber ? '#fbbf24' : undefined}
                  onClick={() => toggleBoardFilter(f.key)}
                />
              )
            })}
          </div>

          {/* TEAM TASKS section — collapsible list of team members */}
          {teamMemberBadges.length > 0 && (
            <>
              <button
                onClick={() => setTeamTasksOpen(o => !o)}
                className="w-full text-left text-[10px] font-semibold uppercase px-2.5 pt-3 pb-1.5 flex items-center justify-between hover:text-white/60 transition-colors"
                style={{ color: 'rgba(255,255,255,0.4)', letterSpacing: '0.12em' }}
              >
                <span>Team Tasks</span>
                <span className="text-[10px]">{teamTasksOpen ? '▾' : '▸'}</span>
              </button>
              {teamTasksOpen && (
                <div className="flex flex-col gap-0.5 mb-2">
                  {teamMemberBadges.map(m => {
                    const href = `/dashboard/tasks/${m.slug}`
                    const active = pathname === href
                    return (
                      <a
                        key={m.id}
                        href={href}
                        onClick={() => setMobileOpen(false)}
                        className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-[13px] font-medium transition-colors"
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
                        <span
                          className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                          style={{
                            background: active ? 'var(--brand-accent)' : '#2d4a7c',
                            color: active ? 'var(--brand-navy)' : 'white',
                          }}
                        >
                          {m.name[0]?.toUpperCase()}
                        </span>
                        <span className="flex-1 truncate">{m.name}</span>
                        {m.isAdmin && (
                          <span className="text-[10px]" style={{ color: 'var(--brand-accent)' }}>★</span>
                        )}
                      </a>
                    )
                  })}
                </div>
              )}
            </>
          )}

          {/* CLIENTS section */}
          {clientBadges.length > 0 && (
            <>
              <SectionEyebrow>Clients</SectionEyebrow>
              <div className="flex flex-col gap-0.5 mb-2">
                {clientBadges.map(c => (
                  <FilterToggleRow
                    key={c.id}
                    icon="●"
                    label={c.name}
                    active={activeClient === c.id}
                    count={c.count}
                    iconColor="rgba(255,255,255,0.4)"
                    onClick={() => toggleClientFilter(c.id)}
                  />
                ))}
              </div>
            </>
          )}
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

function FilterToggleRow({
  icon,
  label,
  active,
  count,
  iconColor,
  onClick,
}: {
  icon: string
  label: string
  active: boolean
  count?: number
  iconColor?: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-[13px] font-medium transition-colors w-full text-left"
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
      <span
        className="text-[14px] w-4 text-center flex-shrink-0"
        style={iconColor ? { color: iconColor } : undefined}
      >
        {icon}
      </span>
      <span className="flex-1 truncate">{label}</span>
      {typeof count === 'number' && count > 0 && (
        <span
          className="font-mono text-[11px] tabular-nums"
          style={{ color: active ? 'var(--brand-accent)' : 'rgba(255,255,255,0.4)' }}
        >
          {count}
        </span>
      )}
    </button>
  )
}
