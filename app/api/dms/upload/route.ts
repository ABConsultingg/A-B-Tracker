import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const woId = formData.get('wo_id') as string | null
  const memberId = formData.get('member_id') as string | null

  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })

  const ext = file.name.split('.').pop()
  const storagePath = `dms/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  const { error: uploadErr } = await supabaseAdmin.storage
    .from('ab-files')
    .upload(storagePath, buffer, { contentType: file.type, upsert: false })

  if (uploadErr) return NextResponse.json({ error: uploadErr.message }, { status: 500 })

  // If a WO is tagged, log the file into wo_files too
  if (woId) {
    await supabaseAdmin.from('wo_files').insert({
      work_order_id: woId,
      name: file.name,
      storage_path: storagePath,
      mime_type: file.type,
      size_bytes: file.size,
      uploaded_by_type: 'member',
      uploaded_by_id: memberId ?? 'unknown',
      internal_only: true,
    })
  }

  // Generate a signed URL valid for 7 days for immediate display
  const { data: signed } = await supabaseAdmin.storage
    .from('ab-files')
    .createSignedUrl(storagePath, 60 * 60 * 24 * 7)

  return NextResponse.json({ storagePath, signedUrl: signed?.signedUrl })
}
