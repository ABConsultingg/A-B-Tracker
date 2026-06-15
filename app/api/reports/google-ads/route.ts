import { NextRequest, NextResponse } from 'next/server';

const WINDSOR_GADS_ACCOUNTS: Record<string, string> = {
  'culture': '',
  'rbs': '',
  'mvp-chiro': '',
  'nico-roofing': '',
  'apollo-events': '',
  'affiliated-control': '',
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get('clientId');
  const month = searchParams.get('month') || new Date().toISOString().slice(0, 7);
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 });

  const accountId = WINDSOR_GADS_ACCOUNTS[clientId];
  if (!accountId) return NextResponse.json({ configured: false, message: 'Google Ads account not configured', data: null });

  const apiKey = process.env.WINDSOR_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'WINDSOR_API_KEY not set' }, { status: 500 });

  try {
    const [year, mon] = month.split('-').map(Number);
    const pad = (n: number) => String(n).padStart(2, '0');
    const dateFrom = `${year}-${pad(mon)}-01`;
    const dateTo = `${year}-${pad(mon)}-${new Date(year, mon, 0).getDate()}`;

    const params = new URLSearchParams({
      api_key: apiKey, date_from: dateFrom, date_to: dateTo, account_id: accountId,
      fields: 'impressions,clicks,cost,conversions,conversion_value,ctr,cpc,cpm',
      connector: 'google_ads',
    });
    const res = await fetch(`https://connectors.windsor.ai/google_ads?${params}`);
    if (!res.ok) throw new Error(`Windsor: ${res.status}`);

    const rows = ((await res.json()).data || []) as Record<string, string>[];
    if (!rows.length) return NextResponse.json({ configured: true, clientId, month, data: null, message: 'No data for this period' });

    const t = rows.reduce((a, r) => ({
      impressions: a.impressions + (Number(r.impressions) || 0),
      clicks: a.clicks + (Number(r.clicks) || 0),
      cost: a.cost + (Number(r.cost) || 0),
      conversions: a.conversions + (Number(r.conversions) || 0),
      conversion_value: a.conversion_value + (Number(r.conversion_value) || 0),
    }), { impressions: 0, clicks: 0, cost: 0, conversions: 0, conversion_value: 0 });

    return NextResponse.json({
      configured: true, clientId, month,
      data: {
        spend: t.cost, impressions: t.impressions, clicks: t.clicks, conversions: t.conversions,
        ctr: t.impressions > 0 ? parseFloat(((t.clicks / t.impressions) * 100).toFixed(2)) : 0,
        cpc: t.clicks > 0 ? parseFloat((t.cost / t.clicks).toFixed(2)) : 0,
        cpm: t.impressions > 0 ? parseFloat(((t.cost / t.impressions) * 1000).toFixed(2)) : 0,
        roas: t.cost > 0 ? parseFloat((t.conversion_value / t.cost).toFixed(2)) : 0,
        costPerConversion: t.conversions > 0 ? parseFloat((t.cost / t.conversions).toFixed(2)) : 0,
        campaigns: rows.sort((a, b) => (Number(b.cost) || 0) - (Number(a.cost) || 0)).slice(0, 5).map(r => ({
          name: r.campaign_name || 'Campaign',
          cost: Number(r.cost) || 0, impressions: Number(r.impressions) || 0,
          clicks: Number(r.clicks) || 0, conversions: Number(r.conversions) || 0,
          ctr: Number(r.ctr) || 0,
        })),
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Google Ads]', msg);
    return NextResponse.json({ error: msg, configured: true, data: null }, { status: 500 });
  }
}
