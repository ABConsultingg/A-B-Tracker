// lib/call-intelligence/supabase.ts
// Server-side Supabase access via REST (matches existing Tracker pattern).
// Uses the SERVICE ROLE key — server only, never expose to client.

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function headers(extra: Record<string, string> = {}) {
  return {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

export type CIClient = {
  id: string;
  client_id: string;
  business_name: string;
  twilio_number: string;
  forward_from_number: string | null;
  real_number: string | null;
  timezone: string;
  business_hours: Record<string, { open: string; close: string } | null>;
  crm_type: "acculynx" | "jobnimbus" | "none";
  crm_api_key: string | null;
  attribution_method: "dni" | "self_reported";
  departments: Record<string, string>;
  scheduling_link: string | null;
  services: string[];
  ai_name: string;
  ai_enabled: boolean;
  greeting_override: string | null;
  notify_sms: string | null;
  notify_email: string | null;
  is_active: boolean;
};

export type CICall = {
  id: string;
  client_id: string;
  call_sid: string;
  caller_number: string | null;
  caller_name: string | null;
  caller_address: string | null;
  is_business_hours: boolean | null;
  ivr_selection: string | null;
  source: string | null;
  service_type: string | null;
  property_type: string | null;
  is_insurance: boolean | null;
  intent_level: string | null;
  is_new_customer: boolean | null;
  call_reason: string | null;
  transcript: Array<{ role: "assistant" | "caller"; text: string; at: string }>;
  ai_state: Record<string, unknown>;
  crm_pushed: boolean;
  status: string;
};

export async function getClientByTwilioNumber(twilioNumber: string): Promise<CIClient | null> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/call_intelligence_clients?twilio_number=eq.${encodeURIComponent(
      twilioNumber
    )}&is_active=eq.true&limit=1`,
    { headers: headers(), cache: "no-store" }
  );
  const rows = await res.json();
  return rows?.[0] ?? null;
}

export async function createCall(record: Partial<CICall>): Promise<void> {
  await fetch(`${SUPABASE_URL}/rest/v1/call_intelligence_calls`, {
    method: "POST",
    headers: headers({ Prefer: "resolution=ignore-duplicates" }),
    body: JSON.stringify(record),
  });
}

export async function getCallBySid(callSid: string): Promise<CICall | null> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/call_intelligence_calls?call_sid=eq.${encodeURIComponent(callSid)}&limit=1`,
    { headers: headers(), cache: "no-store" }
  );
  const rows = await res.json();
  return rows?.[0] ?? null;
}

export async function updateCall(callSid: string, patch: Record<string, unknown>): Promise<void> {
  await fetch(
    `${SUPABASE_URL}/rest/v1/call_intelligence_calls?call_sid=eq.${encodeURIComponent(callSid)}`,
    { method: "PATCH", headers: headers(), body: JSON.stringify(patch) }
  );
}

/** Append transcript turns atomically-ish (read-modify-write; fine at call volume). */
export async function appendTranscript(
  callSid: string,
  turns: Array<{ role: "assistant" | "caller"; text: string }>
): Promise<void> {
  const call = await getCallBySid(callSid);
  if (!call) return;
  const now = new Date().toISOString();
  const transcript = [...(call.transcript || []), ...turns.map((t) => ({ ...t, at: now }))];
  await updateCall(callSid, { transcript });
}
