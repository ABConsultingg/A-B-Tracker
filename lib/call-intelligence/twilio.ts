// lib/call-intelligence/twilio.ts
import twilio from "twilio";

const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID!;
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN!;
export const BASE_URL = process.env.CI_BASE_URL!; // e.g. https://tracker.abconsultingg.com

export const twilioClient = twilio(ACCOUNT_SID, AUTH_TOKEN);

/**
 * Parse + validate a Twilio webhook in a Next.js App Router route.
 * Twilio sends application/x-www-form-urlencoded and signs the FULL public URL.
 * Behind Vercel we rebuild the URL from BASE_URL + pathname + search.
 */
export async function readTwilioWebhook(
  req: Request
): Promise<{ valid: boolean; params: Record<string, string> }> {
  const raw = await req.text();
  const params: Record<string, string> = {};
  new URLSearchParams(raw).forEach((v, k) => (params[k] = v));

  const url = new URL(req.url);
  const publicUrl = `${BASE_URL}${url.pathname}${url.search}`;
  const signature = req.headers.get("x-twilio-signature") || "";

  const valid = twilio.validateRequest(AUTH_TOKEN, signature, publicUrl, params);
  return { valid, params };
}

/** Standard XML response for TwiML. */
export function xml(twiml: { toString(): string }): Response {
  return new Response(twiml.toString(), {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}

export function forbidden(): Response {
  return new Response("Forbidden", { status: 403 });
}

export async function sendSms(to: string, from: string, body: string): Promise<void> {
  try {
    await twilioClient.messages.create({ to, from, body });
  } catch (e) {
    console.error("[CI] SMS send failed", e);
  }
}

/** Consistent voice across the product. */
export const VOICE = { voice: "Polly.Joanna-Neural", language: "en-US" } as const;
