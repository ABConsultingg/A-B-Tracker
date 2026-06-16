import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Friendly labels for account IDs (shown in campaign table)
const ACCOUNT_LABELS: Record<string, string> = {
  '618-975-6542': 'Exteriors',
  '468-650-8437': 'Design & Build',
};

// Culture Construction has two accounts: roofing + design&build
const WINDSOR_GADS_ACCOUNTS: Record<string, string[]> = {
  'a-b-consulting-group':         ['322-970-4937'],
  'apollo-events':                ['393-171-0754'],
  'culture':                      ['618-975-6542', '468-650-8437'],
  'rbs':                          ['484-689-6100'],
  'midwest-constrcution-experts': ['157-596-0991'],
  'mvp-chiro':                    ['896-510-0450'],
  'affiliated-control':           ['985-466-7547'],
  'kbc':                          ['432-640-3511'],
  'nico-roofing':                 ['284-714-0647'],
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get('clientId');
  const month = searchParams.get('month') || new Date().toISOString().slice(0, 7);
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 });

  const accountIds = WINDSOR_GADS_ACCOUNTS[clientId];
  if (!accountIds?.length) return NextResponse.json({ configured: false, message: 'Google Ads not configured for this client', data: null });

  const apiKey = process.env.WINDSOR_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'WINDSOR_API_KEY not set' }, { status: 500 });

  try {
    const [year, mon] = month.split('-').map(Number);
    const pad = (n: number) => String(n).padStart(2, '0');
    const dateFrom = `${year}-${pad(mon)}-01`;
    const dateTo = `${year}-${pad(mon)}-${new Date(year, mon, 0).getDate()}`;

    const params = new URLSearchParams({
      api_key: apiKey,
      date_from: dateFrom,
      date_to: dateTo,
      fields: 'date,datasource,account_name,account_id,campaign,impressions,clicks,spend,conversions,conversion_value',
      select_accounts: accountIds.map(id => `google_ads__${id}`).join(','),
    });

    const res = await fetch(`https://connectors.windsor.ai/all?${params}`);
    if (!res.ok) throw new Error(`Windsor: ${res.status}`);

    const rows = ((await res.json()).data || []) as Record<string, unknown>[];
    if (!rows.length) return NextResponse.json({ configured: true, clientId, month, data: null, message: 'No data for this period' });

    const n = (v: unknown) => Number(v) || 0;

    const t = rows.reduce<{ impressions: number; clicks: number; cost: number; conversions: number; conversion_value: number }>(
      (a, r) => ({
        impressions:      a.impressions      + n(r.impressions),
        clicks:           a.clicks           + n(r.clicks),
        cost:             a.cost             + n(r.spend),
        conversions:      a.conversions      + n(r.conversions),
        conversion_value: a.conversion_value + n(r.conversion_value),
      }),
      { impressions: 0, clicks: 0, cost: 0, conversions: 0, conversion_value: 0 }
    );

    // Fetch markup from most recent WO for this client this month
    const supabase = await createClient();
    const { data: woData } = await supabase
      .from('work_orders')
      .select('markup_percentage')
      .eq('client_id', clientId)
      .gte('created_at', `${dateFrom}T00:00:00Z`)
      .lte('created_at', `${dateTo}T23:59:59Z`)
      .not('markup_percentage', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1);

    const markupPct: number = Number(woData?.[0]?.markup_percentage) || 0;
    const billedSpend: number = markupPct > 0 ? t.cost * (1 + markupPct / 100) : t.cost;

    // Aggregate by account + campaign
    const campaignMap: Record<string, { cost: number; impressions: number; clicks: number; conversions: number; account: string }> = {};
    rows.forEach(r => {
      const key = `${String(r.account_name)}__${String(r.campaign || 'Unknown')}`;
      const rawAccountId = String(r.account_id || '');
      const friendlyAccount = ACCOUNT_LABELS[rawAccountId] || String(r.account_name || '');
      if (!campaignMap[key]) campaignMap[key] = { cost: 0, impressions: 0, clicks: 0, conversions: 0, account: friendlyAccount };
      campaignMap[key].cost        += n(r.spend);
      campaignMap[key].impressions += n(r.impressions);
      campaignMap[key].clicks      += n(r.clicks);
      campaignMap[key].conversions += n(r.conversions);
    });
    const campaigns = Object.entries(campaignMap)
      .map(([key, v]) => ({
        name:        key.split('__')[1] || key,
        account:     v.account,
        cost:        v.cost,
        impressions: v.impressions,
        clicks:      v.clicks,
        conversions: v.conversions,
        ctr: v.impressions > 0 ? parseFloat(((v.clicks / v.impressions) * 100).toFixed(2)) : 0,
      }))
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 8);

    return NextResponse.json({
      configured: true, clientId, month,
      data: {
        spend:             t.cost,
        billedSpend,
        markupPct,
        impressions:       t.impressions,
        clicks:            t.clicks,
        conversions:       t.conversions,
        ctr:               t.impressions > 0 ? parseFloat(((t.clicks / t.impressions) * 100).toFixed(2)) : 0,
        cpc:               t.clicks > 0      ? parseFloat((t.cost / t.clicks).toFixed(2)) : 0,
        cpm:               t.impressions > 0 ? parseFloat(((t.cost / t.impressions) * 1000).toFixed(2)) : 0,
        roas:              t.cost > 0        ? parseFloat((t.conversion_value / t.cost).toFixed(2)) : 0,
        costPerConversion: t.conversions > 0 ? parseFloat((t.cost / t.conversions).toFixed(2)) : 0,
        campaigns,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Google Ads]', msg);
    return NextResponse.json({ error: msg, configured: true, data: null }, { status: 500 });
  }
}
