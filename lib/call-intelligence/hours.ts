// lib/call-intelligence/hours.ts
import type { CIClient } from "./supabase";

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

/** Is it business hours right now in the client's timezone? */
export function isBusinessHours(client: CIClient, now = new Date()): boolean {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: client.timezone || "America/Chicago",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const weekday = parts.find((p) => p.type === "weekday")?.value.toLowerCase().slice(0, 3);
  const hour = parts.find((p) => p.type === "hour")?.value ?? "00";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";

  const key = DAY_KEYS.find((d) => d === weekday);
  if (!key) return false;

  const window = client.business_hours?.[key];
  if (!window || !window.open || !window.close) return false;

  const current = `${hour}:${minute}`;
  return current >= window.open && current < window.close;
}
