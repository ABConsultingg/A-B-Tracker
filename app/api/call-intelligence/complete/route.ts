// app/api/call-intelligence/complete/route.ts
// Two jobs:
//  1. Status callback (CallStatus=completed) → finalize record, CRM push, notify team
//  2. Action URL for <Dial>/<Record> legs → return closing TwiML
// Configure the number's statusCallback to this route with event 'completed'.

import twilio from "twilio";
import {
  getClientByTwilioNumber,
  getCallBySid,
  updateCall,
} from "@/lib/call-intelligence/supabase";
import { readTwilioWebhook, xml, forbidden, VOICE } from "@/lib/call-intelligence/twilio";
import { pushToCrm } from "@/lib/call-intelligence/crm";
import { notifyTeam } from "@/lib/call-intelligence/notify";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: Request) {
  const url = new URL(req.url);
  const leg = url.searchParams.get("leg");

  const { valid, params } = await readTwilioWebhook(req);
  if (!valid) return forbidden();

  const callSid = params.CallSid;
  const callStatus = params.CallStatus;

  // ---------- <Dial> action leg: dial finished or failed ----------
  if (leg === "dial") {
    const response = new twilio.twiml.VoiceResponse();
    const dialStatus = params.DialCallStatus;
    if (dialStatus === "completed" || dialStatus === "answered") {
      response.hangup();
    } else {
      // No answer on transfer → offer voicemail
      response.say(VOICE, "Sorry, no one is available right now. Please leave a message after the beep.");
      response.record({
        action: "/api/call-intelligence/complete",
        maxLength: 120,
        transcribe: true,
        playBeep: true,
      });
    }
    return xml(response);
  }

  // ---------- <Record> action leg ----------
  if (params.RecordingUrl && !params.RecordingStatus) {
    await updateCall(callSid, { voicemail_url: params.RecordingUrl });
    const response = new twilio.twiml.VoiceResponse();
    response.say(VOICE, "Thanks. We'll get back to you soon. Goodbye!");
    response.hangup();
    return xml(response);
  }

  // ---------- Status callback: call ended ----------
  if (callStatus === "completed" || callStatus === "no-answer" || callStatus === "failed" || callStatus === "busy") {
    const call = await getCallBySid(callSid);
    if (call && call.status === "in_progress") {
      const client = await getClientByTwilioNumber(params.To);
      const duration = parseInt(params.CallDuration || "0", 10);

      await updateCall(callSid, { status: "completed", duration_seconds: duration });

      if (client) {
        const finalized = await getCallBySid(callSid);
        const hasLead = !!(finalized?.caller_name || finalized?.caller_number);

        // CRM push: AI-collected leads (any hours per v1 — after-hours per spec, but a lead is a lead)
        if (finalized && hasLead && finalized.ivr_selection === "ai" && client.crm_type !== "none") {
          const result = await pushToCrm(client, finalized);
          await updateCall(callSid, {
            crm_pushed: result.ok,
            crm_record_id: result.recordId ?? null,
            crm_error: result.error ?? null,
          });
        }

        // Team notify on any AI lead or voicemail
        if (finalized && hasLead && (finalized.ivr_selection === "ai" || finalized.ivr_selection === "voicemail")) {
          await notifyTeam(client, finalized);
        }
      }
    }
    return new Response("", { status: 204 });
  }

  return new Response("", { status: 204 });
}
