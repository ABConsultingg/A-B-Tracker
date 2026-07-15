// lib/call-intelligence/square.ts
// Square billing: one subscription per client.
// Prereq: run scripts/setup-square-plans.mjs once to create the three plans,
// then put the returned variation IDs in env vars below.

const SQUARE_ACCESS_TOKEN = process.env.SQUARE_ACCESS_TOKEN!;
const SQUARE_ENV = process.env.SQUARE_ENV || "sandbox"; // 'sandbox' | 'production'
const SQUARE_LOCATION_ID = process.env.SQUARE_LOCATION_ID!;

const BASE =
  SQUARE_ENV === "production"
    ? "https://connect.squareup.com"
    : "https://connect.squareupsandbox.com";

export const PLAN_VARIATIONS: Record<string, string | undefined> = {
  ai_receptionist: process.env.SQUARE_PLAN_AI_RECEPTIONIST, // $225/mo
  call_tracking: process.env.SQUARE_PLAN_CALL_TRACKING,     // $175/mo
  enterprise: process.env.SQUARE_PLAN_ENTERPRISE,           // $900/mo
};

async function square(path: string, init: RequestInit = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${SQUARE_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
      "Square-Version": "2026-01-22",
      ...(init.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Square ${res.status}: ${JSON.stringify(data.errors || data)}`);
  return data;
}

export async function createSquareCustomer(businessName: string, email?: string, phone?: string) {
  const data = await square("/v2/customers", {
    method: "POST",
    body: JSON.stringify({
      company_name: businessName,
      email_address: email,
      phone_number: phone,
      note: "A&B Call Intelligence client",
    }),
  });
  return data.customer.id as string;
}

/**
 * Create a subscription. If no card on file, Square bills via emailed invoice
 * each cycle — good enough for v1; card-on-file can be added from the Square
 * dashboard or a Web Payments SDK flow later.
 */
export async function createSquareSubscription(opts: {
  customerId: string;
  plan: "ai_receptionist" | "call_tracking" | "enterprise";
  cardId?: string;
}) {
  const planVariationId = PLAN_VARIATIONS[opts.plan];
  if (!planVariationId) throw new Error(`No Square plan variation configured for ${opts.plan}`);

  const data = await square("/v2/subscriptions", {
    method: "POST",
    body: JSON.stringify({
      idempotency_key: crypto.randomUUID(),
      location_id: SQUARE_LOCATION_ID,
      plan_variation_id: planVariationId,
      customer_id: opts.customerId,
      ...(opts.cardId ? { card_id: opts.cardId } : {}),
    }),
  });
  return data.subscription.id as string;
}

export async function cancelSquareSubscription(subscriptionId: string) {
  await square(`/v2/subscriptions/${subscriptionId}/cancel`, { method: "POST" });
}
