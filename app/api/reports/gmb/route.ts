import { NextRequest, NextResponse } from 'next/server';
import { GoogleAuth } from 'google-auth-library';

const GMB_LOCATION_MAP: Record<string, string> = {
  'culture': '',
  'rbs': '',
  'mvp-chiro': '',
  'nico-roofing': '',
  'apollo-events': '',
  'affiliated-control': '',
};

function getAuth() {
  return new GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/business.manage'],
    clientOptions: { subject: process.env.GOOGLE_IMPERSONATION_EMAIL || 'adrian@abconsultingg.com' },
  });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get('clientId');
  const month = searchParams.get('month') || new Date().toISOString().slice(0, 7);
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 });

  const locationName = GMB_LOCATION_MAP[clientId];
  if (!locationName) return NextResponse.json({ configured: false, message: 'GMB location not configured', data: null });

  try {
    const auth = getAuth();
    const client = await auth.getClient();
    const { token } = await client.getAccessToken();
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

    const [year, mon] = month.split('-').map(Number);
    const pad = (n: number) => String(n).padStart(2, '0');
    const startDate = `${year}-${pad(mon)}-01`;
    const endDate = `${year}-${pad(mon)}-${new Date(year, mon, 0).getDate()}`;

    const [reviewsRes, insightsRes] = await Promise.all([
      fetch(`https://mybusiness.googleapis.com/v4/${locationName}/reviews?pageSize=50`, { headers }),
      fetch(`https://mybusiness.googleapis.com/v4/${locationName}:reportInsights`, {
        method: 'POST', headers,
        body: JSON.stringify({
          locationNames: [locationName],
          basicRequest: {
            metricRequests: [
              { metric: 'QUERIES_DIRECT' }, { metric: 'QUERIES_INDIRECT' },
              { metric: 'VIEWS_MAPS' }, { metric: 'VIEWS_SEARCH' },
              { metric: 'ACTIONS_WEBSITE' }, { metric: 'ACTIONS_PHONE' },
              { metric: 'ACTIONS_DRIVING_DIRECTIONS' },
            ],
            timeRange: { startTime: `${startDate}T00:00:00Z`, endTime: `${endDate}T23:59:59Z` },
          },
        }),
      }),
    ]);

    const reviewsData = reviewsRes.ok ? await reviewsRes.json() : { reviews: [] };
    const insightsData = insightsRes.ok ? await insightsRes.json() : null;
    const reviews: { createTime?: string; starRating?: string; comment?: string; reviewer?: { displayName?: string } }[] = reviewsData.reviews || [];
    const monthReviews = reviews.filter(r => r.createTime?.slice(0, 7) === month);
    const ratingMap: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };
    const allRatings = reviews.map(r => ratingMap[r.starRating || ''] || 0);
    const avgRating = allRatings.length ? parseFloat((allRatings.reduce((a, b) => a + b, 0) / allRatings.length).toFixed(1)) : 0;

    const locationInsights = insightsData?.locationMetrics?.[0]?.metricValues || [];
    const getM = (name: string) => {
      const m = locationInsights.find((v: { metric: string; totalValue?: { value?: string } }) => v.metric === name);
      return m?.totalValue?.value ? parseInt(m.totalValue.value) : 0;
    };

    return NextResponse.json({
      configured: true, clientId, month,
      data: {
        reviews: {
          total: reviews.length, thisMonth: monthReviews.length, avgRating,
          recent: monthReviews.slice(0, 5).map(r => ({
            rating: r.starRating, text: r.comment?.slice(0, 200),
            author: r.reviewer?.displayName, date: r.createTime?.slice(0, 10),
          })),
        },
        insights: {
          viewsSearch: getM('VIEWS_SEARCH'), viewsMaps: getM('VIEWS_MAPS'),
          queriesDirect: getM('QUERIES_DIRECT'), queriesIndirect: getM('QUERIES_INDIRECT'),
          actionsPhone: getM('ACTIONS_PHONE'), actionsWebsite: getM('ACTIONS_WEBSITE'),
          actionsDriving: getM('ACTIONS_DRIVING_DIRECTIONS'),
        },
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[GMB]', msg);
    return NextResponse.json({ error: msg, configured: true, data: null }, { status: 500 });
  }
}
