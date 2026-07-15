// app/api/call-intelligence/ai-gather/route.ts
// The Alex loop. Each hit = one conversation turn.
//   ?start=1  → greet + first question (no speech yet)
//   otherwise → SpeechResult arrives, Claude processes, next prompt returned.

import twilio from "twilio";
import {
  getClientByTwilioNumber,
  getCallBySid,
  updateCall,
  appendTranscript,
} from "@/lib/call-intelligence/supabase";
import {
  readTwilioWebhook,
  xml,
  forbidden,
  twilioClient,
  VOICE,
  BASE_URL,
} from "@/lib/call-intelligence/twilio";
import {
  runIntakeTurn,
  mergeFields,
  openerFor,
  type IntakeFields,
} from "@/lib/call-intelligence/intake-agent";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_TURNS = 16; // hard stop so a call can never loop forever

type VoiceResponseInstance = InstanceType<typeof twilio.twiml.VoiceResponse>;

function gatherSpeech(response: VoiceResponseInstance, say: string) {
  const gather = response.gather({
    input: ["speech"],
    speechTimeout: "auto",
    speechModel: "phone_call",
    enhanced: true,
    action: "/api/call-intelligence/ai-gather",
    method: "POST",
  });
  gather.say(VOICE, say);
  // If silence: one gentle retry, then wrap up gracefully
  response.say(VOICE, "Sorry, I didn't catch that.");
  response.redirect({ method: "POST" }, "/api/call-intelligence/ai-gather?start=retry");
}

export async function POST(req: Request) {
  const url = new URL(req.url);
  const start = url.searchParams.get("start");

  const { valid, params } = await readTwilioWebhook(req);
  if (!valid) return forbidden();

  const callSid = params.CallSid;
  const client = await getClientByTwilioNumber(params.To);
  const call = await getCallBySid(callSid);
  const response = new twilio.twiml.VoiceResponse();

  if (!client || !call) {
    response.say(VOICE, "Sorry, something went wrong. Goodbye.");
    response.hangup();
    return xml(response);
  }

  // ---------- First entry: greet + first question ----------
  if (start === "1") {
    await updateCall(callSid, { ivr_selection: "ai" });

    // Lazily start full-call recording (call is in-progress by now)
    try {
      await twilioClient.calls(callSid).recordings.create({
        recordingStatusCallback: `${BASE_URL}/api/call-intelligence/recording`,
        recordingStatusCallbackMethod: "POST",
      });
    } catch (e) {
      console.error("[CI] recording start failed", e);
    }

    const opener = openerFor(client);
    await appendTranscript(callSid, [{ role: "assistant", text: opener }]);
    gatherSpeech(response, opener);
    return xml(response);
  }

  // ---------- Silence retry ----------
  if (start === "retry") {
    const retryCount = ((call.ai_state?.retries as number) || 0) + 1;
    if (retryCount > 2) {
      response.say(
        VOICE,
        "No problem — we'll follow up with you at this number. Thanks for calling!"
      );
      response.hangup();
      await updateCall(callSid, { ai_state: { ...call.ai_state, retries: retryCount } });
      return xml(response);
    }
    await updateCall(callSid, { ai_state: { ...call.ai_state, retries: retryCount } });
    gatherSpeech(response, "Are you still there?");
    return xml(response);
  }

  // ---------- Normal turn: caller spoke ----------
  const speech = (params.SpeechResult || "").trim();
  const turnCount = ((call.ai_state?.turns as number) || 0) + 1;

  if (!speech) {
    response.redirect({ method: "POST" }, "/api/call-intelligence/ai-gather?start=retry");
    return xml(response);
  }

  await appendTranscript(callSid, [{ role: "caller", text: speech }]);
  const freshCall = await getCallBySid(callSid); // re-read with caller turn included

  const result = await runIntakeTurn(client, freshCall!, speech, !!call.is_business_hours);

  const existing = (call.ai_state?.fields as IntakeFields) || {};
  const merged = mergeFields(existing, result.fields);

  // Persist fields to first-class columns as they land
  await updateCall(callSid, {
    ai_state: { ...call.ai_state, fields: merged, turns: turnCount, retries: 0 },
    caller_name: merged.caller_name ?? call.caller_name,
    caller_address: merged.caller_address ?? call.caller_address,
    service_type: merged.service_type ?? call.service_type,
    property_type: merged.property_type ?? call.property_type,
    is_insurance: merged.is_insurance ?? call.is_insurance,
    source: merged.source ?? call.source,
    intent_level: merged.intent_level ?? call.intent_level,
    is_new_customer: merged.is_new_customer ?? call.is_new_customer,
    call_reason: merged.call_reason ?? call.call_reason,
    website: merged.website ?? (call as unknown as { website?: string }).website,
    caller_email: merged.caller_email ?? (call as unknown as { caller_email?: string }).caller_email,
  });

  await appendTranscript(callSid, [{ role: "assistant", text: result.say }]);

  if (result.done || result.action === "end" || turnCount >= MAX_TURNS) {
    response.say(VOICE, result.say);
    response.hangup();
    return xml(response);
  }

  gatherSpeech(response, result.say);
  return xml(response);
}
