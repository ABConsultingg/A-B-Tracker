import { NextResponse } from 'next/server'

const SPROUT_TOKEN = process.env.SPROUT_API_TOKEN!
const SPROUT_CUSTOMER_ID = '1068501'

export async function GET() {
  const res = await fetch(
    `https://api.sproutsocial.com/v1/${SPROUT_CUSTOMER_ID}/metadata/customer`,
    {
      headers: {
        'Authorization': `Bearer ${SPROUT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    }
  )

  if (!res.ok) {
    const text = await res.text()
    return NextResponse.json({ error: `Sprout API error: ${res.status}`, detail: text }, { status: 500 })
  }

  const data = await res.json()
  const profiles = (data.data ?? []).map((p: any) => ({
    id: p.id,
    name: p.name,
    network: p.network_type,
    native_id: p.native_id,
    // Use these IDs to build the CLIENT_MAP in the sync route
  }))

  return NextResponse.json({
    total: profiles.length,
    profiles,
  })
}
