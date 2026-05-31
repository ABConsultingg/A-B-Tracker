import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

// Portal shell. Server-guards: only active portal users reach /portal/*.
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Is this an active portal user? (RLS lets them read their own portal_users row.)
  const { data: pu } = await supabase
    .from('portal_users')
    .select('client_id, name, active')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (!pu || pu.active === false) {
    // Not a portal user (or revoked) — send team users to their dashboard.
    redirect('/dashboard')
  }

  const { data: client } = await supabase
    .from('clients')
    .select('id, name, company')
    .eq('id', pu.client_id)
    .maybeSingle()

  const displayName = client?.name || pu.client_id
  const initials = displayName.split(/\s+/).map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()

  return (
    <div style={{ minHeight: '100vh', background: '#fafaf7' }}>
      <div style={{ background: '#0f1b34', color: 'white', padding: '14px 24px',
                    display: 'flex', alignItems: 'center', gap: 16 }}>
        <span style={{ fontFamily: 'Georgia, serif', fontSize: 20, fontWeight: 600 }}>
          A<span style={{ color: '#d99e2b' }}>&amp;</span>B
        </span>
        <span style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.18)' }} />
        <span style={{ width: 30, height: 30, borderRadius: '50%', background: '#d99e2b',
                       color: '#0f1b34', display: 'inline-flex', alignItems: 'center',
                       justifyContent: 'center', fontWeight: 700, fontSize: 13 }}>{initials}</span>
        <span style={{ fontWeight: 500 }}>{displayName}</span>
        <span style={{ flex: 1 }} />
        <form action="/api/logout" method="POST">
          <button type="submit" style={{ background: 'rgba(255,255,255,0.1)', color: 'white',
            border: '1px solid rgba(255,255,255,0.2)', padding: '7px 14px', borderRadius: 6,
            fontSize: 13, cursor: 'pointer' }}>Sign out</button>
        </form>
      </div>
      {children}
    </div>
  )
}
