import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const formData = await request.formData()
  const email = String(formData.get('email') || '').toLowerCase().trim()
  const password = String(formData.get('password') || '')

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  )

  const { error, data } = await supabase.auth.signInWithPassword({ email, password })

  if (error || !data.session) {
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(error?.message || 'No session')}`, request.url),
      { status: 303 }
    )
  }

  const response = NextResponse.redirect(new URL('/dashboard', request.url), {
    status: 303,
  })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] || 'default'
  const cookieName = `sb-${projectRef}-auth-token`

  // @supabase/ssr expects base64-prefixed JSON
  const sessionPayload = {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_at: data.session.expires_at,
    expires_in: data.session.expires_in,
    token_type: data.session.token_type,
    user: data.session.user,
  }

  const base64Value = 'base64-' + Buffer.from(JSON.stringify(sessionPayload)).toString('base64')

  // Detect if we're running locally vs in production
  // secure:true forbids the cookie on http://localhost, so we relax it in dev only
  const isProduction = process.env.NODE_ENV === 'production'

  // Supabase chunks large cookies; for ~3KB session, single cookie works
  response.cookies.set(cookieName, base64Value, {
    path: '/',
    httpOnly: false,
    secure: isProduction,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7,
  })

  console.log('COOKIE SET v4:', { cookieName, format: 'base64', size: base64Value.length, secure: isProduction })

  return response
}
