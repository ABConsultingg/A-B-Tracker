// app/api/call-intelligence/clients/route.ts
// Powers the Tracker "Add Call Intelligence Client" form.
// GET  → list clients (config + subscription status)
// POST → upsert a client config
// Protected by CI_INTERNAL_TOKEN.

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const INTERNAL_TOKEN = process.env.CI_INTERNAL_TOKEN!;

function sb(path: string, init: RequestInit = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
    cache: "no-store",
  });
}

function authed(req: Request): boolean {
  return req.headers.get("authorization") === `Bearer ${INTERNAL_TOKEN}`;
}

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!authed(req)) return new Response("Forbidden", { status: 403 });
  const res = await sb(
    "call_intelligence_clients?select=*,call_intelligence_subscriptions(plan,status,monthly_amount_cents)&order=created_at.desc"
  );
  return Response.json(await res.json());
}

export async function POST(req: Request) {
  if (!authed(req)) return new Response("Forbidden", { status: 403 });
  const body = await req.json();

  const allowed = [
    "client_id", "business_name", "twilio_number", "forward_from_number",
    "real_number", "timezone", "business_hours", "crm_type", "crm_api_key",
    "attribution_method", "departments", "scheduling_link", "services",
    "ai_name", "ai_enabled", "greeting_override", "notify_sms", "notify_email",
    "is_active",
  ];
  const record: Record<string, unknown> = {};
  for (const k of allowed) if (body[k] !== undefined) record[k] = body[k];

  if (!record.client_id || !record.business_name) {
    return Response.json({ ok: false, error: "client_id and business_name required" }, { status: 400 });
  }

  const res = await sb("call_intelligence_clients?on_conflict=client_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(record),
  });

  if (!res.ok) return Response.json({ ok: false, error: await res.text() }, { status: 500 });
  return Response.json({ ok: true, client: (await res.json())?.[0] });
}
