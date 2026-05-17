import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const formData = await request.formData()
  const email = String(formData.get('email') || '').toLowerCase().trim()
  const password = String(formData.get('password') || '')

  const cookieStore = cookies()
  const cookiesToSet: { name: string; value: string; options?: any }[] = []

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookies: { name: string; value: string; options?: any }[]) {
          cookiesToSet.push(...cookies)
        },
      },
    }
  )

  const { error, data } = await supabase.auth.signInWithPassword({ email, password })

  console.log('LOGIN ATTEMPT:', { 
    email, 
    success: !error, 
    hasSession: !!data?.session,
    cookieCount: cookiesToSet.length,
    cookieNames: cookiesToSet.map(c => c.name),
    error: error?.message 
  })

  if (error) {
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(error.message)}`, request.url),
      { status: 303 }
    )
  }

  const response = NextResponse.redirect(new URL('/dashboard', request.url), {
    status: 303,
  })

  for (const { name, value, options } of cookiesToSet) {
    response.cookies.set(name, value, options)
  }

  return response
}