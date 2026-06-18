import { NextRequest, NextResponse } from 'next/server'

const CLIENT_FORMS: Record<string, { leads: string; signup?: string }> = {
  'affiliated-control': {
    leads:  '241304023249849',
    signup: '241336108655859',
  },
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const clientId = searchParams.get('clientId')
  const month    = searchParams.get('month') || new Date().toISOString().slice(0, 7)

  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })

  const forms = CLIENT_FORMS[clientId]
  if (!forms) return NextResponse.json({ configured: false, message: 'No Jotform configured for this client', data: null })

  const apiKey = process.env.JOTFORM_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'JOTFORM_API_KEY not set' }, { status: 500 })

  const [year, mon] = month.split('-').map(Number)
  const pad = (n: number) => String(n).padStart(2, '0')
  const startDate = `${year}-${pad(mon)}-01 00:00:00`
  const lastDay   = new Date(year, mon, 0).getDate()
  const endDate   = `${year}-${pad(mon)}-${lastDay} 23:59:59`

  const fetchForm = async (formId: string) => {
    const filter = encodeURIComponent(JSON.stringify({ 'created_at:gte': startDate, 'created_at:lte': endDate }))
    const url = `https://api.jotform.com/form/${formId}/submissions?apiKey=${apiKey}&limit=1000&filter=${filter}`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Jotform ${formId}: ${res.status}`)
    const json = await res.json()
    return (json.content || []) as Record<string, any>[]
  }

  const findAnswer = (answers: Record<string, any>, keyword: string): string => {
    const key = Object.keys(answers).find(k =>
      (answers[k].text || '').toLowerCase().includes(keyword.toLowerCase())
    )
    return key ? String(answers[key].answer || '') : ''
  }

  try {
    const [leadsRaw, signupRaw] = await Promise.all([
      fetchForm(forms.leads),
      forms.signup ? fetchForm(forms.signup) : Promise.resolve([]),
    ])

    const leads = leadsRaw.map((s: Record<string, any>) => {
      const a: Record<string, any> = s.answers || {}
      return {
        id:            s.id,
        date:          String(s.created_at || '').slice(0, 10),
        name:          findAnswer(a, 'name'),
        email:         findAnswer(a, 'email'),
        phone:         findAnswer(a, 'phone'),
        company:       findAnswer(a, 'company'),
        manufacturer:  findAnswer(a, 'manufacturer'),
        contactMethod: findAnswer(a, 'contact'),
        source:        findAnswer(a, 'find out'),
        request:       findAnswer(a, 'help'),
      }
    })

    const manufacturerCounts: Record<string, number> = {}
    const sourceCounts: Record<string, number> = {}
    leads.forEach((l: any) => {
      if (l.manufacturer) manufacturerCounts[l.manufacturer] = (manufacturerCounts[l.manufacturer] || 0) + 1
      if (l.source)        sourceCounts[l.source]             = (sourceCounts[l.source]             || 0) + 1
    })

    return NextResponse.json({
      configured: true, clientId, month,
      data: {
        totalLeads:       leads.length,
        totalSignups:     signupRaw.length,
        topManufacturers: Object.entries(manufacturerCounts).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, count]) => ({ name, count })),
        topSources:       Object.entries(sourceCounts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, count]) => ({ name, count })),
        recentLeads:      leads.slice(0, 10),
      },
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg, configured: true, data: null }, { status: 500 })
  }
}
