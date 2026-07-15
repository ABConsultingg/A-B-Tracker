// app/api/call-intelligence/ai-gather/route.ts
// The Alex loop — v1.3 LATENCY PATCH.
//   • ONE Supabase read + ONE write per turn (was 7-8 round trips)
//   • Speech hints from client config → much better recognition
//   • actionOnEmptyResult → Twilio always posts back, loop can't strand
//   • Tighter reply budget → faster Claude turns, snappier feel

import twilio from "twilio";
import { waitUntil } from "@vercel/functions";
import {
  getClientByTwilioNumber,
  getCallBySid,
  updateCall,
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
  speechHintsFor,
  type IntakeFields,
} from "@/lib/call-intelligence/intake-agent";
import type { CIClient } from "@/lib/call-intelligence/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_TURNS = 16;

type VoiceResponseInstance = InstanceType<typeof twilio.twiml.VoiceResponse>;

function gatherSpeech(response: VoiceResponseInstance, client: CIClient, say: string) {
  const gather = response.gather({
    input: ["speech", "dtmf"],
    numDigits: 11,
    finishOnKey: "#",
    speechTimeout: "auto",
    speechModel: "phone_call",
    enhanced: true,
    hints: speechHintsFor(client),
    actionOnEmptyResult: true, // silence still POSTs back — no stranded calls
    action: "/api/call-intelligence/ai-gather",
    method: "POST",
  });
  gather.say(VOICE, say);
}

export async function POST(req: Request) {
  const url = new URL(req.url);
  const start = url.searchParams.get("start");

  const { valid, params } = await readTwilioWebhook(req);
  if (!valid) return forbidden();

  const callSid = params.CallSid;
  const response = new twilio.twiml.VoiceResponse();

  // ONE read: client + call in parallel
  const [client, call] = await Promise.all([
    getClientByTwilioNumber(params.To),
    getCallBySid(callSid),
  ]);

  if (!client || !call) {
    response.say(VOICE, "Sorry, something went wrong. Goodbye.");
    response.hangup();
    return xml(response);
  }

  const now = new Date().toISOString();

  // ---------- First entry: greet + first question ----------
  if (start === "1") {
    const opener = openerFor(client);
    gatherSpeech(response, client, opener);

    // Respond NOW; DB write + recording start happen after the response ships.
    waitUntil(
      Promise.all([
        updateCall(callSid, {
          ivr_selection: "ai",
          transcript: [...(call.transcript || []), { role: "assistant", text: opener, at: now }],
        }),
        twilioClient
          .calls(callSid)
          .recordings.create({
            recordingStatusCallback: `${BASE_URL}/api/call-intelligence/recording`,
            recordingStatusCallbackMethod: "POST",
          })
          .catch((e) => console.error("[CI] recording start failed", e)),
      ])
    );
    return xml(response);
  }

  // ---------- A turn arrived (speech, keypad, or silence) ----------
  const keyed = (params.Digits || "").trim();
  const speech = keyed
    ? `My callback number is ${keyed.split("").join(" ")}`
    : (params.SpeechResult || "").trim();
  const turnCount = ((call.ai_state?.turns as number) || 0) + 1;
  const retries = (call.ai_state?.retries as number) || 0;

  // Silence handling — no redirect hop, handle inline
  if (!speech) {
    if (retries >= 2) {
      response.say(VOICE, "No problem — we'll follow up with you at this number. Thanks for calling!");
      response.hangup();
      waitUntil(updateCall(callSid, { ai_state: { ...call.ai_state, retries: retries + 1 } }));
      return xml(response);
    }
    gatherSpeech(response, client, retries === 0 ? "Sorry, I didn't catch that. Go ahead." : "Are you still there?");
    waitUntil(updateCall(callSid, { ai_state: { ...call.ai_state, retries: retries + 1 } }));
    return xml(response);
  }

  // Build the caller-turn transcript locally (no DB write yet)
  const transcriptWithCaller = [
    ...(call.transcript || []),
    { role: "caller" as const, text: speech, at: now },
  ];

  // Claude turn — pass the local transcript, zero extra reads
  const callForTurn = { ...call, transcript: transcriptWithCaller };
  const result = await runIntakeTurn(client, callForTurn, speech, !!call.is_business_hours);

  // ---------- Trouble counter: bail out gracefully instead of looping ----------
  const priorTrouble = (call.ai_state?.trouble as number) || 0;
  const trouble = result.fallback ? priorTrouble + 1 : 0; // consecutive failures only
  if (trouble >= 3) {
    if (call.is_business_hours && (client.real_number || client.forward_from_number)) {
      response.say(VOICE, "I'm sorry about that — let me get you straight to the team.");
      const dial = response.dial({
        action: "/api/call-intelligence/complete?leg=dial",
        method: "POST",
        timeout: 25,
      });
      dial.number(client.real_number || client.forward_from_number || "");
      waitUntil(
        updateCall(callSid, {
          ivr_selection: "transfer",
          transcript: transcriptWithCaller,
          ai_state: { ...call.ai_state, trouble, escalated: true },
          intent_level: call.intent_level ?? "medium",
        })
      );
    } else {
      response.say(
        VOICE,
        "I'm sorry about that. No problem — the team will call you right back at this number. Thanks for calling!"
      );
      response.hangup();
      waitUntil(
        updateCall(callSid, {
          transcript: transcriptWithCaller,
          ai_state: { ...call.ai_state, trouble, escalated: true },
          caller_name: call.caller_name ?? "Callback requested",
          intent_level: call.intent_level ?? "medium",
        })
      );
    }
    return xml(response);
  }

  const existing = (call.ai_state?.fields as IntakeFields) || {};
  const merged = mergeFields(existing, result.fields);

  const done = result.done || result.action === "end" || turnCount >= MAX_TURNS;

  // Respond to Twilio FIRST in structure: build TwiML now
  if (done) {
    response.say(VOICE, result.say);
    response.hangup();
  } else {
    gatherSpeech(response, client, result.say);
  }

  // ONE write — in the background, AFTER the response ships. Saves ~300-400ms per turn.
  waitUntil(
    updateCall(callSid, {
      transcript: [...transcriptWithCaller, { role: "assistant", text: result.say, at: now }],
      ai_state: { ...call.ai_state, fields: merged, turns: turnCount, retries: 0, trouble },
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
    })
  );

  return xml(response);
}
