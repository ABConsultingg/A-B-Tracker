// app/api/call-intelligence/recording/route.ts
// Receives recording status callbacks and voicemail transcription callbacks.

import { updateCall } from "@/lib/call-intelligence/supabase";
import { readTwilioWebhook, forbidden } from "@/lib/call-intelligence/twilio";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const url = new URL(req.url);
  const type = url.searchParams.get("type");

  const { valid, params } = await readTwilioWebhook(req);
  if (!valid) return forbidden();

  const callSid = params.CallSid;

  // Voicemail transcription ready
  if (type === "voicemail" && params.TranscriptionText) {
    await updateCall(callSid, {
      voicemail_transcript: params.TranscriptionText,
      voicemail_url: params.RecordingUrl || undefined,
    });
    return new Response("", { status: 204 });
  }

  // Full-call recording ready
  if (params.RecordingStatus === "completed" && params.RecordingUrl) {
    await updateCall(callSid, { recording_url: params.RecordingUrl });
  }

  return new Response("", { status: 204 });
}
