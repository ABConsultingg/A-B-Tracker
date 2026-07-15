// app/api/call-intelligence/crm-push/route.ts
// Internal route — manual/retry CRM push from the Tracker UI.
// Protected by CI_INTERNAL_TOKEN (not a Twilio webhook).

import {
  getCallBySid,
  updateCall,
} from "@/lib/call-intelligence/supabase";
import { pushToCrm } from "@/lib/call-intelligence/crm";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const INTERNAL_TOKEN = process.env.CI_INTERNAL_TOKEN!;

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${INTERNAL_TOKEN}`) {
    return new Response("Forbidden", { status: 403 });
  }

  const { call_sid } = await req.json();
  const call = await getCallBySid(call_sid);
  if (!call) return Response.json({ ok: false, error: "call not found" }, { status: 404 });

  const clientRes = await fetch(
    `${SUPABASE_URL}/rest/v1/call_intelligence_clients?client_id=eq.${encodeURIComponent(call.client_id)}&limit=1`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }, cache: "no-store" }
  );
  const client = (await clientRes.json())?.[0];
  if (!client) return Response.json({ ok: false, error: "client not found" }, { status: 404 });

  const result = await pushToCrm(client, call);
  await updateCall(call_sid, {
    crm_pushed: result.ok,
    crm_record_id: result.recordId ?? null,
    crm_error: result.error ?? null,
  });

  return Response.json(result);
}
