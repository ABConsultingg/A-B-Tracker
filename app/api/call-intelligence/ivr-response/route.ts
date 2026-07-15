// app/api/call-intelligence/ivr-response/route.ts
// Handles the digit press from the IVR menu.

import twilio from "twilio";
import {
  getClientByTwilioNumber,
  getCallBySid,
  updateCall,
} from "@/lib/call-intelligence/supabase";
import { readTwilioWebhook, xml, forbidden, sendSms, VOICE, BASE_URL } from "@/lib/call-intelligence/twilio";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { valid, params } = await readTwilioWebhook(req);
  if (!valid) return forbidden();

  const digit = params.Digits;
  const callSid = params.CallSid;
  const client = await getClientByTwilioNumber(params.To);
  const call = await getCallBySid(callSid);
  const response = new twilio.twiml.VoiceResponse();

  if (!client || !call) {
    response.say(VOICE, "Sorry, something went wrong. Goodbye.");
    response.hangup();
    return xml(response);
  }

  const open = !!call.is_business_hours;

  // ---------- BUSINESS HOURS ----------
  if (open) {
    if (digit === "1") {
      await updateCall(callSid, { ivr_selection: "transfer" });
      response.say(VOICE, "Connecting you now.");
      const dial = response.dial({
        action: "/api/call-intelligence/complete?leg=dial",
        method: "POST",
        timeout: 25,
        record: "record-from-answer-dual",
        recordingStatusCallback: `${BASE_URL}/api/call-intelligence/recording`,
      });
      dial.number(client.real_number || client.forward_from_number || "");
      return xml(response);
    }
    if (digit === "2") {
      await updateCall(callSid, { ivr_selection: "billing" });
      const billing = client.departments?.billing;
      if (billing) {
        response.say(VOICE, "Connecting you to billing.");
        const dial = response.dial({
          action: "/api/call-intelligence/complete?leg=dial",
          method: "POST",
          timeout: 25,
        });
        dial.number(billing);
      } else {
        response.say(VOICE, "Please leave a message for our billing team after the beep.");
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
    if (digit === "3") {
      await updateCall(callSid, { ivr_selection: "scheduling" });
      if (client.scheduling_link && call.caller_number) {
        await sendSms(
          call.caller_number,
          client.twilio_number,
          `${client.business_name}: book a time here — ${client.scheduling_link}`
        );
        response.say(VOICE, "Perfect. I just texted you our scheduling link. Talk soon!");
      } else {
        response.say(VOICE, "One moment while I connect you.");
        const dial = response.dial({ timeout: 25 });
        dial.number(client.departments?.scheduling || client.real_number || "");
      }
      response.hangup();
      return xml(response);
    }
  }

  // ---------- AFTER HOURS ----------
  if (!open) {
    if (digit === "1") {
      await updateCall(callSid, { ivr_selection: "voicemail" });
      response.say(VOICE, "Please leave a message for our team after the beep.");
      response.record({
        action: "/api/call-intelligence/complete",
        maxLength: 120,
        transcribe: true,
        transcribeCallback: `${BASE_URL}/api/call-intelligence/recording?type=voicemail`,
        playBeep: true,
      });
      return xml(response);
    }
    if (digit === "2") {
      await updateCall(callSid, { ivr_selection: "scheduling" });
      if (client.scheduling_link && call.caller_number) {
        await sendSms(
          call.caller_number,
          client.twilio_number,
          `${client.business_name}: book a time here — ${client.scheduling_link}`
        );
        response.say(VOICE, "Perfect. I just texted you our scheduling link. Talk soon!");
      }
      response.hangup();
      return xml(response);
    }
  }

  // Any other digit, or a digit with no route → AI (or replay menu)
  if (client.ai_enabled) {
    response.redirect({ method: "POST" }, "/api/call-intelligence/ai-gather?start=1");
  } else {
    response.redirect({ method: "POST" }, "/api/call-intelligence/inbound");
  }
  return xml(response);
}
