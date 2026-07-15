// lib/call-intelligence/crm.ts
// CRM push adapters. Routes on client.crm_type.

import type { CIClient, CICall } from "./supabase";

type CrmResult = { ok: boolean; recordId?: string; error?: string };

function splitName(full: string | null): { first: string; last: string } {
  const parts = (full || "").trim().split(/\s+/);
  return { first: parts[0] || "Unknown", last: parts.slice(1).join(" ") || "Caller" };
}

function transcriptSummary(call: CICall): string {
  return [
    call.service_type,
    call.source ? `Source: ${call.source}` : null,
    call.property_type,
    call.is_insurance ? "Insurance claim" : call.is_insurance === false ? "Out of pocket" : null,
    call.intent_level ? `Intent: ${call.intent_level}` : null,
  ]
    .filter(Boolean)
    .join(" | ");
}

async function pushAccuLynx(client: CIClient, call: CICall): Promise<CrmResult> {
  const { first, last } = splitName(call.caller_name);
  try {
    const res = await fetch("https://api.acculynx.com/api/v1/leads", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${client.crm_api_key}`,
      },
      body: JSON.stringify({
        firstName: first,
        lastName: last,
        phone: call.caller_number,
        address: call.caller_address,
        leadSource: "A&B Call Intelligence",
        notes: transcriptSummary(call),
      }),
    });
    if (!res.ok) return { ok: false, error: `AccuLynx ${res.status}: ${await res.text()}` };
    const data = await res.json().catch(() => ({}));
    return { ok: true, recordId: data.id || data.leadId || "created" };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

async function pushJobNimbus(client: CIClient, call: CICall): Promise<CrmResult> {
  const { first, last } = splitName(call.caller_name);
  try {
    const res = await fetch("https://app.jobnimbus.com/api1/contacts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${client.crm_api_key}`,
      },
      body: JSON.stringify({
        first_name: first,
        last_name: last,
        home_phone: call.caller_number,
        address_line1: call.caller_address,
        source_name: "A&B Call Intelligence",
        description: transcriptSummary(call),
        record_type_name: "Lead",
      }),
    });
    if (!res.ok) return { ok: false, error: `JobNimbus ${res.status}: ${await res.text()}` };
    const data = await res.json().catch(() => ({}));
    return { ok: true, recordId: data.jnid || "created" };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function pushToCrm(client: CIClient, call: CICall): Promise<CrmResult> {
  if (client.crm_type === "acculynx") return pushAccuLynx(client, call);
  if (client.crm_type === "jobnimbus") return pushJobNimbus(client, call);
  return { ok: true, recordId: "none" }; // crm_type 'none' — Tracker only
}
