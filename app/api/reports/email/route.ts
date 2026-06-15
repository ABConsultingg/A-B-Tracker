import { NextRequest, NextResponse } from 'next/server';

const AC_CLIENT_MAP: Record<string, { tag?: string; label: string }> = {
  'culture':            { tag: 'culture-construction', label: 'Culture Construction' },
  'rbs':                { tag: 'rbs', label: 'RBS' },
  'mvp-chiro':          { tag: 'mvp-chiropractic', label: 'MVP Chiropractic' },
  'nico-roofing':       { tag: 'nico-roofing', label: 'Nico Roofing' },
  'apollo-events':      { tag: 'apollo-supply', label: 'Apollo Supply' },
  'affiliated-control': { tag: 'affiliated-control', label: 'Affiliated Control' },
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get('clientId');
  const month = searchParams.get('month') || new Date().toISOString().slice(0, 7);
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 });

  if (!AC_CLIENT_MAP[clientId]) return NextResponse.json({ configured: false, message: 'Email marketing not configured', data: null });

  const apiKey = process.env.ACTIVECAMPAIGN_API_KEY;
  const baseUrl = process.env.ACTIVECAMPAIGN_API_URL;
  if (!apiKey || !baseUrl) return NextResponse.json({ error: 'ActiveCampaign env vars not set' }, { status: 500 });

  try {
    const [year, mon] = month.split('-').map(Number);
    const pad = (n: number) => String(n).padStart(2, '0');
    const dateFrom = `${year}-${pad(mon)}-01T00:00:00-00:00`;
    const dateTo = `${year}-${pad(mon)}-${new Date(year, mon, 0).getDate()}T23:59:59-00:00`;
    const headers = { 'Api-Token': apiKey, 'Content-Type': 'application/json' };

    const res = await fetch(
      `${baseUrl}/api/3/campaigns?filters[sdate_after]=${encodeURIComponent(dateFrom)}&filters[sdate_before]=${encodeURIComponent(dateTo)}&limit=50`,
      { headers }
    );
    if (!res.ok) throw new Error(`ActiveCampaign: ${res.status}`);

    const campaigns = ((await res.json()).campaigns || []).filter((c: Record<string, string>) => c.status === '5' || c.status === '1');
    if (!campaigns.length) return NextResponse.json({ configured: true, clientId, month, data: null, message: 'No campaigns sent this month' });

    const t = campaigns.reduce((a: Record<string, number>, c: Record<string, string>) => ({
      sends: a.sends + (parseInt(c.send_amt) || 0),
      opens: a.opens + (parseInt(c.uniqueopens) || 0),
      clicks: a.clicks + (parseInt(c.uniquelinkclicks) || 0),
      unsubscribes: a.unsubscribes + (parseInt(c.unsubscribes) || 0),
      bounces: a.bounces + (parseInt(c.hardbounces) || 0) + (parseInt(c.softbounces) || 0),
    }), { sends: 0, opens: 0, clicks: 0, unsubscribes: 0, bounces: 0 });

    return NextResponse.json({
      configured: true, clientId, month,
      data: {
        campaignCount: campaigns.length, ...t,
        openRate: t.sends > 0 ? parseFloat(((t.opens / t.sends) * 100).toFixed(1)) : 0,
        clickRate: t.opens > 0 ? parseFloat(((t.clicks / t.opens) * 100).toFixed(1)) : 0,
        unsubRate: t.sends > 0 ? parseFloat(((t.unsubscribes / t.sends) * 100).toFixed(2)) : 0,
        campaigns: campaigns.slice(0, 5).map((c: Record<string, string>) => ({
          name: c.name, subject: c.subject, sentDate: c.sdate,
          sends: parseInt(c.send_amt) || 0, opens: parseInt(c.uniqueopens) || 0,
          clicks: parseInt(c.uniquelinkclicks) || 0,
          openRate: (parseInt(c.send_amt) || 0) > 0
            ? ((parseInt(c.uniqueopens) / parseInt(c.send_amt)) * 100).toFixed(1) : '0',
        })),
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Email]', msg);
    return NextResponse.json({ error: msg, configured: true, data: null }, { status: 500 });
  }
}
