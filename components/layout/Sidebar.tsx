'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useViewMode } from '@/lib/useViewMode'
import { createClient } from '@/lib/supabase/client'

type NavItem = {
  href: string
  label: string
  icon: string
  adminOnly?: boolean
  ownerOnly?: boolean
  countKey?: keyof SidebarCounts
  section: 'views' | 'tools'
}

const NAV: NavItem[] = [
  { href: '/dashboard',           label: 'Board',              icon: '⬜', section: 'views' },
  { href: '/dashboard/pipeline',  label: 'Pipeline Health',    icon: '📊', section: 'views' },
  { href: '/dashboard/schedule',  label: 'Execution Schedule', icon: '📅', countKey: 'schedule', section: 'views' },
  { href: '/dashboard/finance',   label: 'Finance',            icon: '💰', ownerOnly: true, section: 'views' },
  { href: '/dashboard/clients',   label: 'Clients',            icon: '🏢', adminOnly: true, countKey: 'clients', section: 'views' },
  { href: '/dashboard/all',       label: 'All Work Orders',    icon: '☰',  countKey: 'allWos', section: 'views' },
  { href: '/dashboard/tasks',     label: 'Tasks',              icon: '✓',  countKey: 'myTasks', section: 'views' },
  { href: '/reports',             label: 'Reports',            icon: '📈', adminOnly: true, section: 'tools' },
  { href: '/dashboard/social',    label: 'Social Hub',         icon: '📱', section: 'tools' },
  { href: '/dashboard/ppc',       label: 'PPC Hub',            icon: '🎯', adminOnly: true, section: 'tools' },
  { href: '/dashboard/services',  label: 'Services & Pricing', icon: '⚙️', adminOnly: true, section: 'tools' },
]

const HQ_ITEMS = [
  { href: '/dashboard/standup?channel=general', label: 'Wall',         icon: '☀️', adminOnly: false },
  { href: '/dashboard/dms',                     label: 'Pancho Direct', icon: '✦',  adminOnly: false },
  { href: '/dashboard/claude',                  label: 'Pancho',       icon: '✦',  adminOnly: false },
  { href: '/dashboard/comms',                   label: 'Comms',        icon: '📨', adminOnly: true  },
  { href: '/dashboard/meetings',                label: 'Meetings',     icon: '📋', adminOnly: false },
]

type BoardFilter = {
  key: 'assignedToMe' | 'ownedByMe' | 'flagged' | 'stale' | 'overdue' | 'recurring'
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
  { key: 'recurring',    label: 'Recurring',      icon: '↺',  countKey: 'recurring' },
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
  recurring?: number
  schedule?: number
}

export type ClientBadge = { id: string; name: string; count: number }
export type TeamMemberBadge = { id: string; name: string; slug: string; isAdmin: boolean }

function NotificationBell({ userId }: { userId: string | null }) {
  const [count, setCount] = useState(0)
  const [open, setOpen] = useState(false)
  const [notifs, setNotifs] = useState<any[]>([])
  const supabase = createClient()

  useEffect(() => {
    if (!userId) return
    async function load() {
      const { data } = await supabase
        .from('wo_notifications')
        .select('*')
        .eq('user_id', userId)
        .is('read_at', null)
        .order('created_at', { ascending: false })
        .limit(20)
      setNotifs(data || [])
      setCount((data || []).length)
    }
    load()
    const ch = supabase.channel('notif-bell')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'wo_notifications', filter: `user_id=eq.${userId}` }, () => load())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'wo_notifications', filter: `user_id=eq.${userId}` }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [userId])

  async function markAllRead() {
    if (!userId) return
    await supabase.from('wo_notifications').update({ read_at: new Date().toISOString() }).eq('user_id', userId).is('read_at', null)
    setCount(0)
    setNotifs([])
  }

  const SOURCE_ICON: Record<string, string> = {
    standup: '💬', mention: '@', stage_change: '🔄', task: '✓', client: '👤', default: '🔔'
  }

  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ position: 'relative', background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: 'rgba(255,255,255,0.7)', fontSize: 16, lineHeight: 1 }}>
        🔔
        {count > 0 && (
          <span style={{ position: 'absolute', top: 0, right: 0, background: '#ef4444', color: 'white', fontSize: 9, fontWeight: 700, borderRadius: 99, minWidth: 14, height: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px' }}>
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 998 }} />
          <div style={{ position: 'fixed', top: 60, left: 16, width: 320, background: 'var(--bg-elevated, #fff)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.18)', zIndex: 999, overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>🔔 Notifications</span>
              {count > 0 && (
                <button onClick={markAllRead} style={{ fontSize: 11, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                  Mark all read
                </button>
              )}
            </div>
            <div style={{ maxHeight: 400, overflowY: 'auto' }}>
              {notifs.length === 0 ? (
                <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                  You&apos;re all caught up 🎉
                </div>
              ) : notifs.map(n => (
                <a key={n.id} href={n.link_url || '#'} onClick={() => setOpen(false)}
                  style={{ display: 'flex', gap: 10, padding: '10px 16px', borderBottom: '1px solid var(--border)', textDecoration: 'none', background: 'var(--bg-elevated)', transition: 'background 0.15s' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg-elevated)')}>
                  <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>{SOURCE_ICON[n.source_type] || SOURCE_ICON.default}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.4, marginBottom: 2 }}>{n.body_preview}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {n.author_name && <span>{n.author_name} · </span>}
                      {new Date(n.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    </div>
                  </div>
                </a>
              ))}
            </div>
            <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)' }}>
              <a href="/dashboard/mentions" onClick={() => setOpen(false)}
                style={{ fontSize: 12, color: 'var(--text-muted)', textDecoration: 'none', display: 'block', textAlign: 'center' }}>
                View all mentions →
              </a>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default function Sidebar({ member, counts = {}, clientBadges = [], teamMemberBadges = [] }: {
  member: any; counts?: SidebarCounts; clientBadges?: ClientBadge[]; teamMemberBadges?: TeamMemberBadge[]
}) {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [hqOpen, setHqOpen] = useState(true)
  const [toolsOpen, setToolsOpen] = useState(false)
  const [teamTasksOpen, setTeamTasksOpen] = useState(() =>
    pathname.startsWith('/dashboard/tasks/') && pathname !== '/dashboard/tasks/all'
  )
  const isAdmin = member?.role === 'admin' || member?.role === 'owner'
  const isOwner = member?.role === 'owner'
  const [viewMode, setViewMode] = useViewMode(isAdmin)

  const items = NAV.filter(n => {
    if (n.ownerOnly) return isOwner && viewMode === 'admin'
    if (!n.adminOnly) return true
    if (!isAdmin) return false
    return viewMode === 'admin'
  })

  const viewItems  = items.filter(i => i.section === 'views')
  const toolItems  = items.filter(i => i.section === 'tools')

  const onBoardOrAll = pathname === '/dashboard' || pathname === '/dashboard/all'
  const activeClient = searchParams.get('client') || ''

  function toggleBoardFilter(key: BoardFilter['key']) {
    const isActive = searchParams.get(key) === '1'
    const params = new URLSearchParams(searchParams.toString())
    if (isActive) params.delete(key); else params.set(key, '1')
    const qs = params.toString()
    router.push(onBoardOrAll ? `${pathname}${qs ? '?' + qs : ''}` : `/dashboard${qs ? '?' + qs : ''}`)
    setMobileOpen(false)
  }

  function toggleClientFilter(clientId: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (activeClient === clientId) params.delete('client'); else params.set('client', clientId)
    const qs = params.toString()
    router.push(onBoardOrAll ? `${pathname}${qs ? '?' + qs : ''}` : `/dashboard${qs ? '?' + qs : ''}`)
    setMobileOpen(false)
  }

  return (
    <>
      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-30 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between shadow-sm">
        <button onClick={() => setMobileOpen(true)} className="p-1.5 -ml-1 rounded hover:bg-gray-100">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12h18M3 6h18M3 18h18" /></svg>
        </button>
        <Link href="/dashboard" className="flex items-center gap-2 no-underline">
          <span className="font-serif text-base font-semibold text-brand-navy">A<span className="text-brand-accent">&amp;</span>B Tracker</span>
        </Link>
        <Link href="/dashboard/account" className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white hover:opacity-80 transition-opacity" style={{ background: 'var(--brand-gold, #b8860b)' }}>
          {member?.name?.[0] || '?'}
        </Link>
      </div>

      {mobileOpen && <div className="md:hidden fixed inset-0 bg-black/50 z-40" onClick={() => setMobileOpen(false)} />}

      <aside
        className={`sidebar-navy fixed md:sticky md:top-0 md:h-screen top-0 left-0 bottom-0 z-50 w-64 md:w-56 flex-shrink-0 flex flex-col transition-transform md:transition-none ${mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}
        style={{ background: 'var(--brand-navy)', color: '#cdd5e3', borderRight: '1px solid var(--brand-navy)' }}
      >
        {/* Logo + Bell */}
        <div className="px-4 pt-5 pb-4 flex items-start justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div>
            <div className="font-serif text-[22px] leading-none font-semibold text-white tracking-tight">
              A<span style={{ color: 'var(--brand-accent)' }}>&amp;</span>B<span className="ml-1.5">Consulting Group</span>
            </div>
            <div className="text-[10px] uppercase font-medium mt-2 pl-0.5" style={{ color: 'rgba(255,255,255,0.5)', letterSpacing: '0.12em' }}>Operations</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
            <NotificationBell userId={member?.auth_user_id || null} />
            <button onClick={() => setMobileOpen(false)} className="md:hidden text-white/60 hover:text-white text-2xl leading-none w-8 h-8 flex items-center justify-center">×</button>
          </div>
        </div>

        {/* Admin/Team toggle */}
        {isAdmin && (
          <div className="px-3 pt-3 pb-1">
            <div className="flex rounded-md p-[3px] gap-[2px]" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
              <button onClick={() => setViewMode('admin')} className="flex-1 py-1 rounded text-[11px] font-medium transition-colors"
                style={viewMode === 'admin' ? { background: 'var(--brand-accent)', color: 'var(--brand-navy)', fontWeight: 600 } : { background: 'transparent', color: 'rgba(255,255,255,0.65)' }}>Admin</button>
              <button onClick={() => setViewMode('team')} className="flex-1 py-1 rounded text-[11px] font-medium transition-colors"
                style={viewMode === 'team' ? { background: 'var(--brand-accent)', color: 'var(--brand-navy)', fontWeight: 600 } : { background: 'transparent', color: 'rgba(255,255,255,0.65)' }}>Team</button>
            </div>
          </div>
        )}

        <nav className="flex-1 px-2.5 pt-3 pb-3 overflow-y-auto">
          {/* VIEWS */}
          <SectionEyebrow>Views</SectionEyebrow>
          <div className="flex flex-col gap-0.5 mb-3">
            {viewItems.map(item => (
              <NavRow key={item.href} item={item} pathname={pathname} onClick={() => setMobileOpen(false)} count={item.countKey ? counts[item.countKey] : undefined} />
            ))}
          </div>

          {/* BOARD FILTERS */}
          <SectionEyebrow>Quick Filters</SectionEyebrow>
          <div className="flex flex-col gap-0.5 mb-3">
            {BOARD_FILTERS.map(f => {
              const active = searchParams.get(f.key) === '1'
              const count = counts[f.countKey]
              return (
                <FilterToggleRow key={f.key} icon={f.icon} label={f.label} active={active} count={count}
                  iconColor={f.key === 'flagged' || f.key === 'overdue' ? '#fca5a5' : f.key === 'stale' ? '#fbbf24' : undefined}
                  onClick={() => toggleBoardFilter(f.key)} />
              )
            })}
          </div>

          {/* HQ */}
          <button onClick={() => setHqOpen(o => !o)}
            className="w-full text-left text-[10px] font-semibold uppercase px-2.5 pt-3 pb-1.5 flex items-center justify-between hover:text-white/60 transition-colors"
            style={{ color: 'rgba(255,255,255,0.4)', letterSpacing: '0.12em' }}>
            <span>HQ</span><span className="text-[10px]">{hqOpen ? '▾' : '▸'}</span>
          </button>
          {hqOpen && (
            <>
              <div className="flex flex-col gap-0.5 mb-2">
                {HQ_ITEMS.filter(item => !item.adminOnly || (isAdmin && viewMode === 'admin')).map(item => {
                  const active = pathname === item.href || pathname.startsWith(item.href.split('?')[0])
                  return (
                    <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)}
                      className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-[13px] font-medium transition-colors"
                      style={active ? { background: 'rgba(217,158,43,0.15)', color: 'white', boxShadow: 'inset 2px 0 0 var(--brand-accent)' } : { color: 'rgba(255,255,255,0.85)' }}
                      onMouseEnter={e => { if (!active) { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = 'white' }}}
                      onMouseLeave={e => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.85)' }}}>
                      <span className="w-4 text-center flex-shrink-0">{item.icon}</span>
                      <span className="flex-1 truncate">{item.label}</span>
                    </Link>
                  )
                })}
              </div>
              <div style={{ display: 'flex', gap: 4, paddingBottom: 6 }}>
                <button onClick={() => window.dispatchEvent(new CustomEvent('open-daily-popup', { detail: 'morning' }))}
                  style={{ flex: 1, fontSize: 11, padding: '4px 0', borderRadius: 6, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.8)', cursor: 'pointer', fontWeight: 500 }}>
                  ☀️ Standup
                </button>
                <button onClick={() => window.dispatchEvent(new CustomEvent('open-daily-popup', { detail: 'eod' }))}
                  style={{ flex: 1, fontSize: 11, padding: '4px 0', borderRadius: 6, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.8)', cursor: 'pointer', fontWeight: 500 }}>
                  🌙 EOD
                </button>
              </div>
            </>
          )}

          {/* TOOLS (collapsible) */}
          {toolItems.length > 0 && (
            <>
              <button onClick={() => setToolsOpen(o => !o)}
                className="w-full text-left text-[10px] font-semibold uppercase px-2.5 pt-3 pb-1.5 flex items-center justify-between hover:text-white/60 transition-colors"
                style={{ color: 'rgba(255,255,255,0.4)', letterSpacing: '0.12em' }}>
                <span>Tools</span><span className="text-[10px]">{toolsOpen ? '▾' : '▸'}</span>
              </button>
              {toolsOpen && (
                <div className="flex flex-col gap-0.5 mb-2">
                  {toolItems.map(item => (
                    <NavRow key={item.href} item={item} pathname={pathname} onClick={() => setMobileOpen(false)} count={item.countKey ? counts[item.countKey] : undefined} />
                  ))}
                </div>
              )}
            </>
          )}

          {/* TEAM TASKS */}
          {teamMemberBadges.length > 0 && (
            <>
              <button onClick={() => setTeamTasksOpen(o => !o)}
                className="w-full text-left text-[10px] font-semibold uppercase px-2.5 pt-3 pb-1.5 flex items-center justify-between hover:text-white/60 transition-colors"
                style={{ color: 'rgba(255,255,255,0.4)', letterSpacing: '0.12em' }}>
                <span>Team Tasks</span><span className="text-[10px]">{teamTasksOpen ? '▾' : '▸'}</span>
              </button>
              {teamTasksOpen && (
                <div className="flex flex-col gap-0.5 mb-2">
                  {teamMemberBadges.map(m => {
                    const href = `/dashboard/tasks/${m.slug}`
                    const active = pathname === href
                    return (
                      <a key={m.id} href={href} onClick={() => setMobileOpen(false)}
                        className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-[13px] font-medium transition-colors"
                        style={active ? { background: 'rgba(217,158,43,0.15)', color: 'white', boxShadow: 'inset 2px 0 0 var(--brand-accent)' } : { color: 'rgba(255,255,255,0.85)' }}
                        onMouseEnter={e => { if (!active) { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = 'white' }}}
                        onMouseLeave={e => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.85)' }}}>
                        <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                          style={{ background: active ? 'var(--brand-accent)' : '#2d4a7c', color: active ? 'var(--brand-navy)' : 'white' }}>
                          {m.name[0]?.toUpperCase()}
                        </span>
                        <span className="flex-1 truncate">{m.name}</span>
                        {m.isAdmin && <span className="text-[10px]" style={{ color: 'var(--brand-accent)' }}>★</span>}
                      </a>
                    )
                  })}
                </div>
              )}
            </>
          )}

          {/* CLIENTS */}
          {clientBadges.length > 0 && (
            <>
              <SectionEyebrow>Clients</SectionEyebrow>
              <div className="flex flex-col gap-0.5 mb-2">
                {clientBadges.map(c => (
                  <FilterToggleRow key={c.id} icon="●" label={c.name} active={activeClient === c.id} count={c.count} iconColor="rgba(255,255,255,0.4)" onClick={() => toggleClientFilter(c.id)} />
                ))}
              </div>
            </>
          )}
        </nav>

        {/* User footer */}
        <div className="px-3 py-3" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="flex items-center gap-3 px-2 py-1.5 mb-1">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0" style={{ background: 'var(--brand-accent)', color: 'var(--brand-navy)' }}>
              {member?.name?.[0] || '?'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-white truncate">{member?.name || 'User'}</div>
              <div className="text-[11px] capitalize" style={{ color: 'rgba(255,255,255,0.5)' }}>{member?.role}</div>
            </div>
          </div>
          <a href="/dashboard/account" className="block w-full px-3 py-1.5 text-[12px] rounded-md text-left transition-colors hover:bg-white/5 mb-0.5" style={{ color: 'rgba(255,255,255,0.65)' }}>⚙ Account</a>
          <form action="/api/logout" method="POST">
            <button type="submit" className="w-full px-3 py-1.5 text-[12px] rounded-md text-left transition-colors hover:bg-white/5" style={{ color: 'rgba(255,255,255,0.65)' }}>Sign out</button>
          </form>
        </div>
      </aside>

      <Link href="/dashboard/claude" className="md:hidden fixed top-1/2 -translate-y-1/2 right-4 z-50 w-14 h-14 rounded-full flex items-center justify-center shadow-lg"
        style={{ background: 'var(--brand-navy)', color: '#b8860b', fontSize: 22, fontWeight: 700, textDecoration: 'none' }}>✦</Link>
    </>
  )
}

function SectionEyebrow({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] font-semibold uppercase px-2.5 pt-3 pb-1.5" style={{ color: 'rgba(255,255,255,0.4)', letterSpacing: '0.12em' }}>{children}</div>
}

function NavRow({ item, pathname, onClick, count }: { item: NavItem; pathname: string; onClick: () => void; count?: number }) {
  const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
  return (
    <a href={item.href} onClick={onClick}
      className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-[13px] font-medium transition-colors group"
      style={active ? { background: 'rgba(217,158,43,0.15)', color: 'white', boxShadow: 'inset 2px 0 0 var(--brand-accent)' } : { color: 'rgba(255,255,255,0.85)' }}
      onMouseEnter={e => { if (!active) { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = 'white' }}}
      onMouseLeave={e => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.85)' }}}>
      <span className="text-[14px] w-4 text-center flex-shrink-0">{item.icon}</span>
      <span className="flex-1 truncate">{item.label}</span>
      {item.adminOnly && <span className="text-[10px]" style={{ color: 'var(--brand-accent)' }}>★</span>}
      {typeof count === 'number' && <span className="font-mono text-[11px] tabular-nums" style={{ color: active ? 'var(--brand-accent)' : 'rgba(255,255,255,0.4)' }}>{count}</span>}
    </a>
  )
}

function FilterToggleRow({ icon, label, active, count, iconColor, onClick }: { icon: string; label: string; active: boolean; count?: number; iconColor?: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-[13px] font-medium transition-colors w-full text-left"
      style={active ? { background: 'rgba(217,158,43,0.15)', color: 'white', boxShadow: 'inset 2px 0 0 var(--brand-accent)' } : { color: 'rgba(255,255,255,0.85)' }}
      onMouseEnter={e => { if (!active) { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = 'white' }}}
      onMouseLeave={e => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.85)' }}}>
      <span className="text-[14px] w-4 text-center flex-shrink-0" style={iconColor ? { color: iconColor } : undefined}>{icon}</span>
      <span className="flex-1 truncate">{label}</span>
      {typeof count === 'number' && count > 0 && <span className="font-mono text-[11px] tabular-nums" style={{ color: active ? 'var(--brand-accent)' : 'rgba(255,255,255,0.4)' }}>{count}</span>}
    </button>
  )
}
