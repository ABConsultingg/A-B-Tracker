import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const { path } = await req.json()

  if (!path) {
    return NextResponse.json({ error: 'Missing path' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin.storage
    .from('social-assets')
    .createSignedUploadUrl(path, { upsert: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const { data: { publicUrl } } = supabaseAdmin.storage
    .from('social-assets')
    .getPublicUrl(path)

  // token + path are what the browser needs to upload directly; publicUrl is what gets saved on the slot
  return NextResponse.json({ token: data.token, path: data.path, publicUrl })
}
