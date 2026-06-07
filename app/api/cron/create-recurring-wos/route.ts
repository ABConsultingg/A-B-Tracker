import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Map recurring_services labels to service IDs
function labelToServiceId(label: string): string {
  const l = label.toLowerCase()
  if (l.includes('social media') || l === 'social') return 'ab-social'
  if (l.includes('website') || l.includes('web maint')) return 'ab-web-maint'
  if (l.includes('consulting') || l.includes('retainer') || l.includes('full service')) return 'ab-consulting'
  if (l.includes('reputation') || l.includes('gmb') || l.includes('seo') || l.includes('blog')) return 'ab-reputation'
  if (l.includes('ppc') || l.includes('google ads') || l.includes('google ad') || l.includes('sem')) return 'ab-ppc'
  if (l.includes('email')) return 'ab-email'
  return 'ab-consulting' // fallback
}

export async function GET(req: NextRequest) {
  // Verify cron secret to prevent unauthorized calls
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const monthLabel = now.toLocaleString('en-US', { month: 'long', year: 'numeric' })

  // Get all active recurring services
  const { data: services, error: svcErr } = await supabase
    .from('recurring_services')
    .select('id, client_id, label, amount')
    .eq('active', true)

  if (svcErr) return NextResponse.json({ error: svcErr.message }, { status: 500 })

  // Get Tanya's team member ID for default owner
  const { data: tanya } = await supabase
    .from('team_members')
    .select('id')
    .ilike('name', '%tanya%')
    .maybeSingle()

  const results: { client_id: string; label: string; status: string }[] = []

  for (const svc of (services || [])) {
    // Check if WO already exists for this client/service/month
    const { data: existing } = await supabase
      .from('work_orders')
      .select('id')
      .eq('client_id', svc.client_id)
      .eq('occurrence', 'Recurring')
      .ilike('title', `%${svc.label}%${monthLabel}%`)
      .maybeSingle()

    if (existing) {
      results.push({ client_id: svc.client_id, label: svc.label, status: 'skipped — already exists' })
      continue
    }

    const serviceId = labelToServiceId(svc.label)
    const title = `${svc.label} — ${monthLabel}`

    const { error: woErr } = await supabase.from('work_orders').insert({
      title,
      client_id: svc.client_id,
      service_id: serviceId,
      owner_id: tanya?.id || null,
      stage: 'not-started',
      priority: 'medium',
      occurrence: 'Recurring',
      est_cost: Number(svc.amount) || 0,
      submitted_at: now.toISOString(),
      notes: `Auto-created from recurring service registry for ${monthLabel}.`,
    })

    if (woErr) {
      results.push({ client_id: svc.client_id, label: svc.label, status: 'error: ' + woErr.message })
    } else {
      results.push({ client_id: svc.client_id, label: svc.label, status: 'created' })
    }
  }

  const created = results.filter(r => r.status === 'created').length
  const skipped = results.filter(r => r.status.startsWith('skipped')).length
  const errors = results.filter(r => r.status.startsWith('error')).length

  return NextResponse.json({
    ok: true,
    month: monthLabel,
    summary: `${created} created, ${skipped} skipped, ${errors} errors`,
    results,
  })
}
