import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Generates a fresh signed URL for a stored DM attachment path
export async function GET(req: NextRequest) {
  const path = new URL(req.url).searchParams.get('path')
  if (!path) return NextResponse.json({ error: 'Missing path' }, { status: 400 })

  const { data, error } = await supabaseAdmin.storage
    .from('ab-files')
    .createSignedUrl(path, 60 * 60 * 24) // 24h

  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: error?.message ?? 'Failed' }, { status: 500 })
  }

  return NextResponse.json({ signedUrl: data.signedUrl })
}
