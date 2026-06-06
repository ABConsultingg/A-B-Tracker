import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: pu } = await supabase
    .from('portal_users')
    .select('client_id, name, active')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (!pu || pu.active === false) redirect('/dashboard')

  const { data: client } = await supabase
    .from('clients')
    .select('id, name, company')
    .eq('id', pu.client_id)
    .maybeSingle()

  const displayName = client?.name || pu.client_id
  const initials = displayName.split(/\s+/).map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()

  return (
    <div style={{ minHeight: '100vh', background: '#fafaf7' }}>
      <div style={{ background: '#0f1b34', color: 'white', padding: '0 24px',
                    display: 'flex', alignItems: 'center', gap: 16, height: 56 }}>
        {/* Logo */}
        <span style={{ fontFamily: 'Georgia, serif', fontSize: 20, fontWeight: 600, flexShrink: 0 }}>
          A<span style={{ color: '#d99e2b' }}>&amp;</span>B
        </span>
        <span style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.18)', flexShrink: 0 }} />

        {/* Avatar + name */}
        <span style={{ width: 30, height: 30, borderRadius: '50%', background: '#d99e2b',
                       color: '#0f1b34', display: 'inline-flex', alignItems: 'center',
                       justifyContent: 'center', fontWeight: 700, fontSize: 13, flexShrink: 0 }}>
          {initials}
        </span>
        <span style={{ fontWeight: 500, flexShrink: 0 }}>{displayName}</span>

        {/* Nav tabs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginLeft: 16 }}>
          <a href="/portal"
            style={{ color: 'rgba(255,255,255,0.75)', textDecoration: 'none', fontSize: 13,
                     fontWeight: 500, padding: '6px 12px', borderRadius: 6,
                     transition: 'background 0.15s' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
            Dashboard
          </a>
          <a href="/portal/report"
            style={{ color: 'rgba(255,255,255,0.75)', textDecoration: 'none', fontSize: 13,
                     fontWeight: 500, padding: '6px 12px', borderRadius: 6,
                     transition: 'background 0.15s' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
            📊 Monthly Report
          </a>
        </div>

        <span style={{ flex: 1 }} />

        {/* Sign out */}
        <form action="/api/logout" method="POST">
          <button type="submit"
            style={{ background: 'rgba(255,255,255,0.1)', color: 'white',
                     border: '1px solid rgba(255,255,255,0.2)', padding: '7px 14px',
                     borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>
            Sign out
          </button>
        </form>
      </div>
      {children}
    </div>
  )
}
