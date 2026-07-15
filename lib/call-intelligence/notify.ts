// lib/call-intelligence/notify.ts
// Business-hours lead alerts: SMS the team + email via Resend.

import type { CIClient, CICall } from "./supabase";
import { sendSms } from "./twilio";

const RESEND_API_KEY = process.env.RESEND_API_KEY!;
const FROM_EMAIL = process.env.CI_FROM_EMAIL || "info@abconsultingg.com";

function leadSummaryText(call: CICall): string {
  return [
    `New lead via ${call.ivr_selection === "ai" ? "Alex (AI)" : call.ivr_selection}`,
    `Name: ${call.caller_name || "Unknown"}`,
    `Phone: ${call.caller_number || "Unknown"}`,
    `Service: ${call.service_type || "-"} (${call.property_type || "-"})`,
    `Source: ${call.source || "-"}`,
    `Intent: ${call.intent_level || "-"}`,
    call.caller_address ? `Address: ${call.caller_address}` : null,
    call.is_insurance != null ? (call.is_insurance ? "Insurance claim" : "Out of pocket") : null,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function notifyTeam(client: CIClient, call: CICall): Promise<void> {
  const summary = leadSummaryText(call);

  if (client.notify_sms) {
    await sendSms(client.notify_sms, client.twilio_number, `📞 ${client.business_name}\n${summary}`);
  }

  if (client.notify_email) {
    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: `A&B Call Intelligence <${FROM_EMAIL}>`,
          to: [client.notify_email],
          subject: `New call lead — ${call.caller_name || call.caller_number || "Unknown"} (${call.intent_level || "?"} intent)`,
          text: summary + `\n\nFull transcript and recording in the A&B Tracker.`,
        }),
      });
    } catch (e) {
      console.error("[CI] Resend notify failed", e);
    }
  }
}
