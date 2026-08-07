import { preflight, guard, withCors } from "@/lib/chatbot/cors";
import { google } from "googleapis";

// ─── Booking rules ────────────────────────────────────────────────────────────
const BOOKING_RULES = {
  allowedDays: [3, 4, 5],   // Wed=3, Thu=4, Fri=5 (0=Sun)
  startHour: 8,              // 8am CT
  endHour: 13,               // 1pm CT (last slot starts at 12pm)
  slotDuration: 60,          // minutes
  daysAhead: 14,             // look 2 weeks out
  timezone: "America/Chicago",
};

function getOAuthClient() {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  auth.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
  });
  return auth;
}

function toChicagoDate(date) {
  return new Date(
    date.toLocaleString("en-US", { timeZone: BOOKING_RULES.timezone })
  );
}

async function handlePost(request) {
  try {
    const { calendarId } = await request.json();
    const targetCalendar = calendarId || "adrian@abconsultingg.com";

    const auth = getOAuthClient();
    const calendar = google.calendar({ version: "v3", auth });

    const now = new Date();
    const rangeEnd = new Date(now);
    rangeEnd.setDate(rangeEnd.getDate() + BOOKING_RULES.daysAhead);

    // Fetch existing events
    const eventsRes = await calendar.events.list({
      calendarId: targetCalendar,
      timeMin: now.toISOString(),
      timeMax: rangeEnd.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
    });

    const busyBlocks = (eventsRes.data.items || [])
      .filter((e) => e.status !== "cancelled")
      .map((e) => ({
        start: new Date(e.start.dateTime || e.start.date),
        end: new Date(e.end.dateTime || e.end.date),
      }));

    // Generate open slots
    const slots = [];
    const cursor = new Date(now);
    cursor.setMinutes(0, 0, 0);
    cursor.setHours(cursor.getHours() + 1); // start from next full hour

    while (cursor < rangeEnd && slots.length < 9) {
      const local = toChicagoDate(cursor);
      const day = local.getDay();
      const hour = local.getHours();

      if (
        BOOKING_RULES.allowedDays.includes(day) &&
        hour >= BOOKING_RULES.startHour &&
        hour < BOOKING_RULES.endHour
      ) {
        const slotEnd = new Date(cursor);
        slotEnd.setMinutes(slotEnd.getMinutes() + BOOKING_RULES.slotDuration);

        const overlaps = busyBlocks.some(
          (b) => cursor < b.end && slotEnd > b.start
        );

        if (!overlaps) {
          slots.push({
            start: cursor.toISOString(),
            end: slotEnd.toISOString(),
            label: local.toLocaleString("en-US", {
              weekday: "long",
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
              timeZoneName: "short",
              timeZone: BOOKING_RULES.timezone,
            }),
          });
        }
      }

      cursor.setMinutes(cursor.getMinutes() + BOOKING_RULES.slotDuration);
    }

    return Response.json({ slots });
  } catch (err) {
    console.error("Availability error:", err);
    return Response.json({ error: "Could not fetch availability" }, { status: 500 });
  }
}

// ── CORS + rate limiting for cross-origin embeds (see src/lib/cors.ts) ──
export async function OPTIONS(request) {
  return preflight(request);
}

export async function POST(request) {
  const blocked = guard(request);
  if (blocked) return blocked;
  return withCors(request, await handlePost(request));
}
