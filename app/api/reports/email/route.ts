import { NextRequest, NextResponse } from 'next/server';

// ActiveCampaign hosted account subdomains per client
const AC_CLIENT_ACCOUNTS: Record<string, string> = {
  'rbs':          'richardsbuildingsupply',
  'apollo-events': 'apollosupply',
  'a-b-consulting-group': 'abconsultingg',
};

async function getCustomerToken(accountSubdomain: string): Promise<string> {
  const clientId = process.env.AC_PARTNER_CLIENT_ID!;
  const clientSecret = process.env.AC_PARTNER_CLIENT_SECRET!;

  // Step 1: Get reseller token
  const step1 = await fetch(
    'https://partner-auth.activecampaign.com/realms/reseller-portal/protocol/openid-connect/token',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
      }),
    }
  );
  if (!step1.ok) throw new Error(`AC Step 1 failed: ${step1.status}`);
  const { access_token: subjectToken } = await step1.json();

  // Step 2: Exchange for account-scoped token
  const step2 = await fetch(
    'https://partner-auth.activecampaign.com/realms/reseller-portal/protocol/openid-connect/token',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
        subject_token: subjectToken,
        subject_token_type: 'urn:ietf:params:oauth:token-type:access_token',
        client_id: clientId,
        client_secret: clientSecret,
        resource: `https://${accountSubdomain}.activehosted.com`,
      }),
    }
  );
  if (!step2.ok) throw new Error(`AC Step 2 failed: ${step2.status}`);
  const { access_token: exchangeToken } = await step2.json();

  // Step 3: Get customer-scoped token
  const step3 = await fetch(
    `https://${accountSubdomain}.activehosted.com/auth/partner/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
        subject_token: exchangeToken,
        subject_token_type: 'urn:ietf:params:oauth:token-type:access_token',
        impersonate_user_id: '1',
      }),
    }
  );
  if (!step3.ok) throw new Error(`AC Step 3 failed: ${step3.status}`);
  const { accessToken } = await step3.json();
  return accessToken;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get('clientId');
  const month = searchParams.get('month') || new Date().toISOString().slice(0, 7);

  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 });

  const accountSubdomain = AC_CLIENT_ACCOUNTS[clientId];
  if (!accountSubdomain) {
    return NextResponse.json({ configured: false, message: 'Email marketing not configured for this client', data: null });
  }

  if (!process.env.AC_PARTNER_CLIENT_ID || !process.env.AC_PARTNER_CLIENT_SECRET) {
    return NextResponse.json({ error: 'AC_PARTNER_CLIENT_ID / AC_PARTNER_CLIENT_SECRET not set' }, { status: 500 });
  }

  try {
    const token = await getCustomerToken(accountSubdomain);

    // Build date range
    const [year, mon] = month.split('-').map(Number);
    const pad = (n: number) => String(n).padStart(2, '0');
    const dateFrom = `${year}-${pad(mon)}-01T00:00:00-00:00`;
    const dateTo = `${year}-${pad(mon)}-${new Date(year, mon, 0).getDate()}T23:59:59-00:00`;

    // Fetch campaigns via cookie auth
    const res = await fetch(
      `https://${accountSubdomain}.activehosted.com/api/3/campaigns?filters[sdate_after]=${encodeURIComponent(dateFrom)}&filters[sdate_before]=${encodeURIComponent(dateTo)}&limit=50`,
      { headers: { Cookie: `ac=${token}` } }
    );

    if (!res.ok) throw new Error(`AC campaigns API: ${res.status}`);

    const campaigns = ((await res.json()).campaigns || []).filter(
      (c: Record<string, string>) => c.status === '5' || c.status === '1'
    );

    if (!campaigns.length) {
      return NextResponse.json({ configured: true, clientId, month, data: null, message: 'No campaigns sent this month' });
    }

    const t = campaigns.reduce((a: Record<string, number>, c: Record<string, string>) => ({
      sends:        a.sends        + (parseInt(c.send_amt)         || 0),
      opens:        a.opens        + (parseInt(c.uniqueopens)      || 0),
      clicks:       a.clicks       + (parseInt(c.uniquelinkclicks) || 0),
      unsubscribes: a.unsubscribes + (parseInt(c.unsubscribes)     || 0),
      bounces:      a.bounces      + (parseInt(c.hardbounces)      || 0) + (parseInt(c.softbounces) || 0),
    }), { sends: 0, opens: 0, clicks: 0, unsubscribes: 0, bounces: 0 });

    return NextResponse.json({
      configured: true, clientId, month,
      data: {
        campaignCount: campaigns.length, ...t,
        openRate:  t.sends > 0 ? parseFloat(((t.opens  / t.sends) * 100).toFixed(1)) : 0,
        clickRate: t.opens > 0 ? parseFloat(((t.clicks / t.opens) * 100).toFixed(1)) : 0,
        unsubRate: t.sends > 0 ? parseFloat(((t.unsubscribes / t.sends) * 100).toFixed(2)) : 0,
        campaigns: campaigns.slice(0, 5).map((c: Record<string, string>) => ({
          name:      c.name,
          subject:   c.subject,
          sentDate:  c.sdate,
          sends:     parseInt(c.send_amt)         || 0,
          opens:     parseInt(c.uniqueopens)      || 0,
          clicks:    parseInt(c.uniquelinkclicks) || 0,
          openRate:  (parseInt(c.send_amt) || 0) > 0
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
