import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GA4 Property IDs per client
const GA4_PROPERTIES: Record<string, string> = {
  'a-b-consulting-group':         '290594151',
  'apollo-events':                '318435061',
  'culture':                      '420061105',
  'kbc':                          '393206566',
  'midwest-constrcution-experts': '400265387',
  'mvp-chiro':                    '468364599',
  'rbs':                          '305212769',
  'affiliated-control':           '364563880',
  'midway-windows-doors':         '254852905',
}

const IMPERSONATE_EMAIL = 'adrian@abconsultingg.com'
const SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!
const PRIVATE_KEY = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n')

async function getAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({
    iss: SERVICE_ACCOUNT_EMAIL,
    sub: IMPERSONATE_EMAIL,
    scope: 'https://www.googleapis.com/auth/analytics.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })).toString('base64url')

  const { createSign } = await import('crypto')
  const sign = createSign('RSA-SHA256')
  sign.update(`${header}.${payload}`)
  const signature = sign.sign(PRIVATE_KEY, 'base64url')
  const jwt = `${header}.${payload}.${signature}`

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })
  const data = await res.json()
  if (!data.access_token) throw new Error('Failed to get access token: ' + JSON.stringify(data))
  return data.access_token
}

async function fetchGA4Metrics(propertyId: string, token: string, startDate: string, endDate: string) {
  const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      dateRanges: [{ startDate, endDate }],
      metrics: [
        { name: 'sessions' },
        { name: 'totalUsers' },
        { name: 'newUsers' },
        { name: 'bounceRate' },
        { name: 'averageSessionDuration' },
        { name: 'screenPageViews' },
        { name: 'conversions' },
      ],
    }),
  })
  return res.json()
}

async function fetchGA4ChannelBreakdown(propertyId: string, token: string, startDate: string, endDate: string) {
  const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: 'sessionDefaultChannelGroup' }],
      metrics: [{ name: 'sessions' }, { name: 'totalUsers' }, { name: 'conversions' }],
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
      limit: 10,
    }),
  })
  return res.json()
}

export async function POST(req: NextRequest) {
  try {
    const { clientId, month } = await req.json()
    if (!clientId || !month) return NextResponse.json({ error: 'clientId and month required' }, { status: 400 })

    const propertyId = GA4_PROPERTIES[clientId]
    if (!propertyId) return NextResponse.json({ error: `No GA4 property configured for ${clientId}` }, { status: 404 })

    // Parse month (YYYY-MM) to date range
    const [year, mon] = month.split('-').map(Number)
    const startDate = `${year}-${String(mon).padStart(2, '0')}-01`
    const lastDay = new Date(year, mon, 0).getDate()
    const endDate = `${year}-${String(mon).padStart(2, '0')}-${lastDay}`

    const token = await getAccessToken()
    const [overview, channels] = await Promise.all([
      fetchGA4Metrics(propertyId, token, startDate, endDate),
      fetchGA4ChannelBreakdown(propertyId, token, startDate, endDate),
    ])

    // Extract metrics from overview
    const row = overview.rows?.[0]?.metricValues || []
    const metrics = [
      { metric: 'sessions',                 value: parseFloat(row[0]?.value || '0') },
      { metric: 'total_users',              value: parseFloat(row[1]?.value || '0') },
      { metric: 'new_users',                value: parseFloat(row[2]?.value || '0') },
      { metric: 'bounce_rate',              value: parseFloat(row[3]?.value || '0') },
      { metric: 'avg_session_duration_sec', value: parseFloat(row[4]?.value || '0') },
      { metric: 'page_views',               value: parseFloat(row[5]?.value || '0') },
      { metric: 'conversions',              value: parseFloat(row[6]?.value || '0') },
    ]

    // Channel breakdown
    const channelRows = (channels.rows || []).map((r: any) => ({
      channel: r.dimensionValues?.[0]?.value,
      sessions: parseFloat(r.metricValues?.[0]?.value || '0'),
      users: parseFloat(r.metricValues?.[1]?.value || '0'),
      conversions: parseFloat(r.metricValues?.[2]?.value || '0'),
    }))

    // Upsert into report_data
    const upsertRows = [
      ...metrics.map(m => ({
        client_id: clientId, month, section: 'web', platform: 'ga4',
        metric: m.metric, value: m.value, source: 'ga4_api',
      })),
      ...channelRows.map((c: any) => ({
        client_id: clientId, month, section: 'web', platform: 'ga4',
        metric: `channel__${c.channel?.toLowerCase().replace(/\s+/g, '_')}__sessions`,
        value: c.sessions, source: 'ga4_api',
      })),
    ]

    // Delete existing and re-insert
    await supabase.from('report_data')
      .delete()
      .eq('client_id', clientId)
      .eq('month', month)
      .eq('platform', 'ga4')

    const { error } = await supabase.from('report_data').insert(upsertRows)
    if (error) throw error

    return NextResponse.json({
      ok: true,
      client: clientId,
      month,
      metrics_saved: upsertRows.length,
      overview: metrics,
      channels: channelRows,
    })
  } catch (e: any) {
    console.error('GA4 sync error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get('clientId');
  const month = searchParams.get('month') || new Date().toISOString().slice(0, 7);
  if (!clientId || !month) return NextResponse.json({ error: 'clientId and month required' }, { status: 400 });

  const propertyId = GA4_PROPERTIES[clientId];
  if (!propertyId) return NextResponse.json({ configured: false, message: `No GA4 property configured for ${clientId}`, data: null });

  try {
    // First try to read cached data from report_data
    const { data: cached } = await supabase
      .from('report_data')
      .select('metric, value')
      .eq('client_id', clientId)
      .eq('month', month)
      .eq('platform', 'ga4');

    if (cached && cached.length > 0) {
      const get = (m: string) => cached.find(r => r.metric === m)?.value || 0;
      const channels = cached
        .filter(r => r.metric.startsWith('channel__'))
        .map(r => ({
          channel: r.metric.replace('channel__', '').replace(/__sessions$/, '').replace(/_/g, ' '),
          sessions: r.value,
        }))
        .sort((a, b) => b.sessions - a.sessions);
      return NextResponse.json({
        configured: true, clientId, month,
        data: {
          sessions:            get('sessions'),
          users:               get('total_users'),
          newUsers:            get('new_users'),
          bounceRate:          get('bounce_rate') * 100,
          avgSessionDuration:  get('avg_session_duration_sec'),
          pageViews:           get('page_views'),
          conversions:         get('conversions'),
          topChannel:          channels[0]?.channel || null,
          channels,
        },
      });
    }

    // No cached data — fetch live from GA4 and store
    const token = await getAccessToken();
    const [overview, channelsData] = await Promise.all([
      fetchGA4Metrics(propertyId, token,
        `${month}-01`,
        `${month}-${new Date(parseInt(month.split('-')[0]), parseInt(month.split('-')[1]), 0).getDate()}`
      ),
      fetchGA4ChannelBreakdown(propertyId, token,
        `${month}-01`,
        `${month}-${new Date(parseInt(month.split('-')[0]), parseInt(month.split('-')[1]), 0).getDate()}`
      ),
    ]);

    const row = overview.rows?.[0]?.metricValues || [];
    return NextResponse.json({
      configured: true, clientId, month,
      data: {
        sessions:           parseFloat(row[0]?.value || '0'),
        users:              parseFloat(row[1]?.value || '0'),
        newUsers:           parseFloat(row[2]?.value || '0'),
        bounceRate:         parseFloat(row[3]?.value || '0') * 100,
        avgSessionDuration: parseFloat(row[4]?.value || '0'),
        pageViews:          parseFloat(row[5]?.value || '0'),
        conversions:        parseFloat(row[6]?.value || '0'),
        topChannel: channelsData.rows?.[0]?.dimensionValues?.[0]?.value || null,
        channels: (channelsData.rows || []).map((r: any) => ({
          channel: r.dimensionValues?.[0]?.value,
          sessions: parseFloat(r.metricValues?.[0]?.value || '0'),
        })),
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[GA4 GET]', msg);
    return NextResponse.json({ error: msg, configured: true, data: null }, { status: 500 });
  }
}
