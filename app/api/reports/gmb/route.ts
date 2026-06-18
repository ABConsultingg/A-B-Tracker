import { NextRequest, NextResponse } from 'next/server';
import { GoogleAuth } from 'google-auth-library';

const RBS_BRANCH_MAP: Record<string, { city: string; state: string; area_manager: string; regional_vp: string; location: string }> = {
  "01": {
    "city": "Chicago",
    "state": "IL",
    "area_manager": "Ed Waxmansky",
    "regional_vp": "Angelos Manolis",
    "location": "111TH ST."
  },
  "02": {
    "city": "Joliet",
    "state": "IL",
    "area_manager": "Ed Waxmansky",
    "regional_vp": "Angelos Manolis",
    "location": "JOLIET"
  },
  "03": {
    "city": "Chicago",
    "state": "IL",
    "area_manager": "Ed Waxmansky",
    "regional_vp": "Angelos Manolis",
    "location": "63RD ST."
  },
  "04": {
    "city": "Kankakee",
    "state": "IL",
    "area_manager": "Dave McCourt",
    "regional_vp": "Angelos Manolis",
    "location": "KANKAKEE"
  },
  "10": {
    "city": "Homer Glen",
    "state": "IL",
    "area_manager": ".",
    "regional_vp": ".",
    "location": "HOMER GLEN"
  },
  "11": {
    "city": "Michigan City",
    "state": "IN",
    "area_manager": "Brendan Kiernan",
    "regional_vp": "Cory Evans",
    "location": "MICHIGAN CITY"
  },
  "13": {
    "city": "West Allis",
    "state": "WI",
    "area_manager": "Honey Schult",
    "regional_vp": "Cory Evans",
    "location": "WEST ALLIS"
  },
  "15": {
    "city": "Frankfort",
    "state": "IL",
    "area_manager": "Ed Waxmansky",
    "regional_vp": "Angelos Manolis",
    "location": "FRANKFORT"
  },
  "19": {
    "city": "Calumet City",
    "state": "IL",
    "area_manager": "Joe Linn",
    "regional_vp": "Angelos Manolis",
    "location": "CALUMET CITY"
  },
  "21": {
    "city": "Rolling Meadows",
    "state": "IL",
    "area_manager": "Ed Waxmansky",
    "regional_vp": "Angelos Manolis",
    "location": "ROLLING MEADOWS"
  },
  "22": {
    "city": "Carol Stream",
    "state": "IL",
    "area_manager": "Joe Linn",
    "regional_vp": "Angelos Manolis",
    "location": "CAROL STREAM"
  },
  "24": {
    "city": "Holland",
    "state": "MI",
    "area_manager": "Bill Seech",
    "regional_vp": "Cory Evans",
    "location": "HOLLAND"
  },
  "25": {
    "city": "Muskegon",
    "state": "MI",
    "area_manager": "Bill Seech",
    "regional_vp": "Cory Evans",
    "location": "MUSKEGON"
  },
  "26": {
    "city": "Peoria",
    "state": "IL",
    "area_manager": "Dave McCourt",
    "regional_vp": "Angelos Manolis",
    "location": "PEORIA"
  },
  "27": {
    "city": "Decatur",
    "state": "IL",
    "area_manager": "Dave McCourt",
    "regional_vp": "Angelos Manolis",
    "location": "DECATUR"
  },
  "28": {
    "city": "Champaign",
    "state": "IL",
    "area_manager": "Dave McCourt",
    "regional_vp": "Angelos Manolis",
    "location": "CHAMPAIGN"
  },
  "29": {
    "city": "Rock Island",
    "state": "IL",
    "area_manager": "Shane Seymore",
    "regional_vp": "Angelos Manolis",
    "location": "ROCK ISLAND"
  },
  "31": {
    "city": "Elkhart",
    "state": "IN",
    "area_manager": "Brendan Kiernan",
    "regional_vp": "Cory Evans",
    "location": "ELKHART"
  },
  "32": {
    "city": "Merrillville",
    "state": "IN",
    "area_manager": "Brendan Kiernan",
    "regional_vp": "Cory Evans",
    "location": "MERRILLVILLE"
  },
  "33": {
    "city": "Westfield",
    "state": "IN",
    "area_manager": "Brendan Kiernan",
    "regional_vp": "Cory Evans",
    "location": "WESTFIELD"
  },
  "34": {
    "city": "South Bend",
    "state": "IN",
    "area_manager": "Brendan Kiernan",
    "regional_vp": "Cory Evans",
    "location": "SOUTH BEND"
  },
  "37": {
    "city": "Lindenhurst",
    "state": "IL",
    "area_manager": "Ed Waxmansky",
    "regional_vp": "Angelos Manolis",
    "location": "LINDENHURST"
  },
  "38": {
    "city": "Itasca",
    "state": "IL",
    "area_manager": "Ed Waxmansky",
    "regional_vp": "Angelos Manolis",
    "location": "ITASCA"
  },
  "39": {
    "city": "Ballwin",
    "state": "MO",
    "area_manager": "Samatha Smith",
    "regional_vp": "Cory Evans",
    "location": "BALLWIN"
  },
  "40": {
    "city": "Kaiser",
    "state": "MO",
    "area_manager": "Samatha Smith",
    "regional_vp": "Cory Evans",
    "location": "KAISER"
  },
  "45": {
    "city": "Chicago",
    "state": "IL",
    "area_manager": "Joe Linn",
    "regional_vp": "Angelos Manolis",
    "location": "BELMONT AVE."
  },
  "46": {
    "city": "Ft. Wayne",
    "state": "IN",
    "area_manager": "Bill Seech",
    "regional_vp": "Cory Evans",
    "location": "FT. WAYNE"
  },
  "47": {
    "city": "Lima",
    "state": "OH",
    "area_manager": "Bill Seech",
    "regional_vp": "Cory Evans",
    "location": "LIMA"
  },
  "49": {
    "city": "Columbus",
    "state": "OH",
    "area_manager": "Cory Price",
    "regional_vp": "Cory Evans",
    "location": "COLUMBUS"
  },
  "53": {
    "city": "Normal",
    "state": "IL",
    "area_manager": "Dave McCourt",
    "regional_vp": "Angelos Manolis",
    "location": "NORMAL"
  },
  "54": {
    "city": "Maryland Heights",
    "state": "MO",
    "area_manager": "Samatha Smith",
    "regional_vp": "Cory Evans",
    "location": "MARYLAND HEIGHTS"
  },
  "55": {
    "city": "Poughkeepsie",
    "state": "NY",
    "area_manager": "Steve Smith",
    "regional_vp": "Angelos Manolis",
    "location": "POUGHKEEPSIE"
  },
  "56": {
    "city": "Middletown",
    "state": "NY",
    "area_manager": "Steve Smith",
    "regional_vp": "Angelos Manolis",
    "location": "MIDDLETOWN"
  },
  "57": {
    "city": "Albany",
    "state": "NY",
    "area_manager": "Steve Smith",
    "regional_vp": "Angelos Manolis",
    "location": "COLONIE"
  },
  "59": {
    "city": "Danbury",
    "state": "CT",
    "area_manager": "Steve Smith",
    "regional_vp": "Angelos Manolis",
    "location": "DANBURY"
  },
  "60": {
    "city": "Milford",
    "state": "CT",
    "area_manager": "Steve Smith",
    "regional_vp": "Angelos Manolis",
    "location": "MILFORD"
  },
  "63": {
    "city": "Jackson",
    "state": "MI",
    "area_manager": "Bill Seech",
    "regional_vp": "Cory Evans",
    "location": "JACKSON"
  },
  "64": {
    "city": "Hampton",
    "state": "VA",
    "area_manager": "Mike Shenton",
    "regional_vp": "Paige Barwick",
    "location": "HAMPTON"
  },
  "65": {
    "city": "Chesapeake",
    "state": "VA",
    "area_manager": "Mike Shenton",
    "regional_vp": "Paige Barwick",
    "location": "CHESAPEAKE"
  },
  "66": {
    "city": "Richmond",
    "state": "VA",
    "area_manager": "Mike Shenton",
    "regional_vp": "Paige Barwick",
    "location": "RICHMOND"
  },
  "68": {
    "city": "Elizabeth City",
    "state": "NC",
    "area_manager": "Mike Shenton",
    "regional_vp": "Paige Barwick",
    "location": "ELIZABETH CITY"
  },
  "69": {
    "city": "Winston-Salem",
    "state": "NC",
    "area_manager": "Craig Miller",
    "regional_vp": "Paige Barwick",
    "location": "WINSTON-SALEM"
  },
  "70": {
    "city": "Johnson City",
    "state": "TN",
    "area_manager": "Craig Miller",
    "regional_vp": "Paige Barwick",
    "location": "JOHNSON CITY"
  },
  "71": {
    "city": "Goldsboro",
    "state": "NC",
    "area_manager": "Paige Barwick",
    "regional_vp": "Paige Barwick",
    "location": "GOLDSBORO"
  },
  "72": {
    "city": "Fayetteville",
    "state": "NC",
    "area_manager": "Chris Heston",
    "regional_vp": "Paige Barwick",
    "location": "FAYETTEVILLE"
  },
  "73": {
    "city": "Wilmington",
    "state": "NC",
    "area_manager": "Mike Shenton",
    "regional_vp": "Paige Barwick",
    "location": "WILMINGTON"
  },
  "74": {
    "city": "Winterville",
    "state": "NC",
    "area_manager": "Chris Heston",
    "regional_vp": "Paige Barwick",
    "location": "WINTERVILLE"
  },
  "75": {
    "city": "Rocky Mount",
    "state": "NC",
    "area_manager": "Chris Heston",
    "regional_vp": "Paige Barwick",
    "location": "ROCKY MOUNT"
  },
  "76": {
    "city": "Jacksonville",
    "state": "NC",
    "area_manager": "Mike Shenton",
    "regional_vp": "Paige Barwick",
    "location": "JACKSONVILLE"
  },
  "77": {
    "city": "Myrtle Beach",
    "state": "SC",
    "area_manager": "Erin Oliver",
    "regional_vp": "Paige Barwick",
    "location": "MYRTLE BEACH"
  },
  "78": {
    "city": "Ladson",
    "state": "SC",
    "area_manager": "Erin Oliver",
    "regional_vp": "Paige Barwick",
    "location": "LADSON"
  },
  "79": {
    "city": "Raleigh",
    "state": "NC",
    "area_manager": "Chris Heston",
    "regional_vp": "Paige Barwick",
    "location": "RALEIGH"
  },
  "80": {
    "city": "Greer",
    "state": "SC",
    "area_manager": "Erin Oliver",
    "regional_vp": "Paige Barwick",
    "location": "GREER"
  },
  "81": {
    "city": "Charlotte",
    "state": "NC",
    "area_manager": "Glenn Waters",
    "regional_vp": "Paige Barwick",
    "location": "CHARLOTTE"
  },
  "82": {
    "city": "Hardy",
    "state": "VA",
    "area_manager": "Craig Miller",
    "regional_vp": "Paige Barwick",
    "location": "HARDY"
  },
  "83": {
    "city": "Kansas City",
    "state": "KS",
    "area_manager": "Samatha Smith",
    "regional_vp": "Cory Evans",
    "location": "KANSAS CITY"
  },
  "85": {
    "city": "Rockford",
    "state": "IL",
    "area_manager": "Dave McCourt",
    "regional_vp": "Angelos Manolis",
    "location": "ROCKFORD"
  },
  "88": {
    "city": "Commerce",
    "state": "GA",
    "area_manager": "Erin Oliver",
    "regional_vp": "Paige Barwick",
    "location": "COMMERCE"
  },
  "89": {
    "city": "Springfield",
    "state": "IL",
    "area_manager": "Dave McCourt",
    "regional_vp": "Angelos Manolis",
    "location": "SPRINGFIELD"
  },
  "90": {
    "city": "Des Moines",
    "state": "IA",
    "area_manager": "Shane Seymore",
    "regional_vp": "Angelos Manolis",
    "location": "DES MOINES"
  },
  "92": {
    "city": "Dayton",
    "state": "OH",
    "area_manager": "Cory Price",
    "regional_vp": "Cory Evans",
    "location": "DAYTON"
  },
  "93": {
    "city": "Montgomery",
    "state": "IL",
    "area_manager": "Ed Waxmansky",
    "regional_vp": "Angelos Manolis",
    "location": "MONTGOMERY"
  },
  "94": {
    "city": "Fond du Lac",
    "state": "WI",
    "area_manager": "Honey Schult",
    "regional_vp": "Cory Evans",
    "location": "FOND DU LAC"
  },
  "95": {
    "city": "Colorado Springs",
    "state": "CO",
    "area_manager": "Shane Seymore",
    "regional_vp": "Angelos Manolis",
    "location": "COLORADO SPRINGS"
  },
  "96": {
    "city": "Loveland",
    "state": "CO",
    "area_manager": "Shane Seymore",
    "regional_vp": "Angelos Manolis",
    "location": "LOVELAND"
  },
  "97": {
    "city": "Denver",
    "state": "CO",
    "area_manager": "Shane Seymore",
    "regional_vp": "Angelos Manolis",
    "location": "52ND AVE"
  },
  "98": {
    "city": "Denver",
    "state": "CO",
    "area_manager": "Shane Seymore",
    "regional_vp": "Angelos Manolis",
    "location": "YORK ST."
  }
}

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

  // Try CSV-uploaded data from gmb_location_data first
  try {
    const { createClient } = await import('@/lib/supabase/server');
    const supabase = createClient();
    const { data: locations } = await supabase
      .from('gmb_location_data')
      .select('*')
      .eq('client_id', clientId)
      .eq('month', month);

    if (locations && locations.length > 0) {
      const totals = locations.reduce((acc: Record<string, number>, loc: any) => {
        acc.search_mobile    = (acc.search_mobile    || 0) + (loc.search_mobile    || 0)
        acc.search_desktop   = (acc.search_desktop   || 0) + (loc.search_desktop   || 0)
        acc.maps_mobile      = (acc.maps_mobile      || 0) + (loc.maps_mobile      || 0)
        acc.maps_desktop     = (acc.maps_desktop     || 0) + (loc.maps_desktop     || 0)
        acc.calls            = (acc.calls            || 0) + (loc.calls            || 0)
        acc.directions       = (acc.directions       || 0) + (loc.directions       || 0)
        acc.website_clicks   = (acc.website_clicks   || 0) + (loc.website_clicks   || 0)
        return acc
      }, {})

      return NextResponse.json({
        configured: true, clientId, month,
        data: {
          totalImpressions: totals.search_mobile + totals.search_desktop + totals.maps_mobile + totals.maps_desktop,
          searchViews:      totals.search_mobile + totals.search_desktop,
          mapsViews:        totals.maps_mobile + totals.maps_desktop,
          calls:            totals.calls,
          directions:       totals.directions,
          websiteClicks:    totals.website_clicks,
          locations:        locations.map((l: any) => {
            // Extract city from address e.g. "4150 E 81st Ave, Merrillville, IN 46410" -> "Merrillville, IN"
            const addrParts = (l.address || '').split(',')
            const city = addrParts.length >= 3
              ? `${addrParts[addrParts.length - 2].trim()}, ${addrParts[addrParts.length - 1].trim().split(' ')[0]}`
              : l.address || l.business_name
            return {
              name:          city || l.business_name,
              fullName:      l.business_name,
              address:       l.address,
              storeCode:     l.store_code,
              searchViews:   (l.search_mobile || 0) + (l.search_desktop || 0),
              mapsViews:     (l.maps_mobile   || 0) + (l.maps_desktop   || 0),
              calls:         l.calls || 0,
              directions:    l.directions || 0,
              websiteClicks: l.website_clicks || 0,
              areaManager:   l.area_manager || (l.store_code ? RBS_BRANCH_MAP[String(l.store_code).padStart(2,'0')]?.area_manager : null) || 'Unknown',
              regionalVp:    l.store_code ? RBS_BRANCH_MAP[String(l.store_code).padStart(2,'0')]?.regional_vp || 'Unknown' : 'Unknown',
            }
          }),
          source: 'csv',
        },
      })
    }
  } catch {}

  // Fall back to API if no CSV data
  const locationName = GMB_LOCATION_MAP[clientId];
  if (!locationName) return NextResponse.json({ configured: false, message: 'GMB location not mapped. Upload CSV at /reports/upload', data: null });

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
