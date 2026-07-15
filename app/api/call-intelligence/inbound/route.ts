// app/api/call-intelligence/inbound/route.ts
// Twilio voice webhook — fires on every incoming call.

import twilio from "twilio";
import {
  getClientByTwilioNumber,
  createCall,
} from "@/lib/call-intelligence/supabase";
import { readTwilioWebhook, xml, forbidden, VOICE, BASE_URL } from "@/lib/call-intelligence/twilio";
import { isBusinessHours } from "@/lib/call-intelligence/hours";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { valid, params } = await readTwilioWebhook(req);
  if (!valid) return forbidden();

  const to = params.To;
  const from = params.From;
  const callSid = params.CallSid;

  const client = await getClientByTwilioNumber(to);
  const response = new twilio.twiml.VoiceResponse();

  if (!client) {
    response.say(VOICE, "Sorry, this number is not configured. Goodbye.");
    response.hangup();
    return xml(response);
  }

  const open = isBusinessHours(client);

  // Log the call immediately
  await createCall({
    client_id: client.client_id,
    call_sid: callSid,
    caller_number: from,
    is_business_hours: open,
    status: "in_progress",
  });

  const name = client.business_name;
  const aiTail = client.ai_enabled ? " Or stay on the line and I'll help you now." : "";

  if (open) {
    const gather = response.gather({
      numDigits: 1,
      timeout: 2,
      action: "/api/call-intelligence/ivr-response",
      method: "POST",
    });
    gather.say(
      VOICE,
      client.greeting_override ||
        `Thanks for calling ${name}. To speak with someone directly, press 1. For billing, press 2. For scheduling, press 3.${aiTail}`
    );
  } else {
    const gather = response.gather({
      numDigits: 1,
      timeout: 2,
      action: "/api/call-intelligence/ivr-response",
      method: "POST",
    });
    const brandIntro = client.greeting_override
      ? client.greeting_override.split(/(?<=\.)\s/)[0] // first sentence = brand line
      : `Thanks for calling ${name}.`;
    gather.say(
      VOICE,
      `${brandIntro} We're currently closed. Press 1 to leave a message for our team. Press 2 for scheduling.${aiTail}`
    );
  }

  // No keypress → AI takes over (or voicemail if AI disabled)
  if (client.ai_enabled) {
    response.redirect({ method: "POST" }, "/api/call-intelligence/ai-gather?start=1");
  } else {
    response.say(VOICE, "Please leave a message after the beep.");
    response.record({
      action: "/api/call-intelligence/complete",
      maxLength: 120,
      transcribe: true,
      transcribeCallback: `${BASE_URL}/api/call-intelligence/recording?type=voicemail`,
      playBeep: true,
    });
  }

  return xml(response);
}
