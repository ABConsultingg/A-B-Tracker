import { type NextRequest, NextResponse } from 'next/server'

// Lightweight middleware: routes portal (client) users to /portal and team users
// to /dashboard. It does NOT touch the Supabase session — the app manages auth via
// a hand-rolled `sb-<ref>-auth-token` cookie set by /api/login, and any attempt to
// refresh/validate it here (via @supabase/ssr) rewrites it into an incompatible
// format and breaks the session. So we read cookies directly and never mutate them.

function projectRef() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  return url.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] || 'default'
}

export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname
  const onDashboard = path === '/dashboard' || path.startsWith('/dashboard/')
  const onPortal = path === '/portal' || path.startsWith('/portal/')

  // Only the two app surfaces need routing; everything else passes through.
  if (!onDashboard && !onPortal) return NextResponse.next()

  // Logged in? The hand-rolled session cookie (possibly chunked .0/.1) must exist.
  const ref = projectRef()
  const base = `sb-${ref}-auth-token`
  const hasSession = !!(
    request.cookies.get(base)?.value ||
    request.cookies.get(`${base}.0`)?.value
  )
  if (!hasSession) {
    // Not logged in — let the page's own guard send them to /login.
    return NextResponse.next()
  }

  // Role flag is written at login. If absent (older session), don't guess —
  // let the page render; the layout guards do the authoritative check.
  const flag = request.cookies.get('ab-portal')?.value
  const isPortalUser = flag === '1'
  const isTeamUser = flag === '0'

  if (isPortalUser && onDashboard) {
    return NextResponse.redirect(new URL('/portal', request.url))
  }
  if (isTeamUser && onPortal) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)']
}
