import { preflight, guard, withCors } from "@/lib/chatbot/cors";
import { google } from "googleapis";

function getOAuthClient() {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  return auth;
}

async function pushToActiveCampaign(lead, notes) {
  const base = process.env.AC_API_URL;
  const key = process.env.AC_API_KEY;
  if (!base || !key) return;

  // Upsert contact
  const contactRes = await fetch(`${base}/api/3/contact/sync`, {
    method: "POST",
    headers: { "Api-Token": key, "Content-Type": "application/json" },
    body: JSON.stringify({
      contact: {
        email: lead.email,
        firstName: lead.name.split(" ")[0],
        lastName: lead.name.split(" ").slice(1).join(" "),
        fieldValues: [
          { field: "COMPANY", value: lead.company },
          { field: "INDUSTRY", value: lead.industry },
          { field: "LEAD_NOTES", value: notes },
          { field: "LEAD_SOURCE", value: lead.source || "Website Chatbot" },
        ],
      },
    }),
  });

  const contactData = await contactRes.json();
  const contactId = contactData?.contact?.id;

  // Add to list
  if (contactId && process.env.AC_LIST_ID) {
    await fetch(`${base}/api/3/contactLists`, {
      method: "POST",
      headers: { "Api-Token": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        contactList: {
          list: process.env.AC_LIST_ID,
          contact: contactId,
          status: 1,
        },
      }),
    });
  }
}

async function sendEmailAlert(lead, slot, notes) {
  const notifyEmail = process.env.NOTIFY_EMAIL || "info@abconsultingg.com";
  // Using AC transactional or simple fetch to your email provider
  // Placeholder — swap with your preferred email sender
  console.log(`[EMAIL ALERT] New booking:
    Name: ${lead.name}
    Email: ${lead.email}
    Company: ${lead.company}
    Industry: ${lead.industry}
    Slot: ${slot.label}
    Notes: ${notes}
    Notify: ${notifyEmail}
  `);
}

async function notifyCira(lead, slot) {
  const webhookUrl = process.env.CIRA_WEBHOOK_URL;
  if (!webhookUrl) return; // Phase 2 — skip if not configured

  await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      event: "new_lead_booked",
      lead: {
        name: lead.name,
        email: lead.email,
        phone: lead.phone || "",
        company: lead.company,
        industry: lead.industry,
      },
      appointment: {
        start: slot.start,
        end: slot.end,
        label: slot.label,
      },
    }),
  }).catch((e) => console.warn("Cira webhook failed (non-blocking):", e));
}

// ─── Route handler ────────────────────────────────────────────────────────────
async function handlePost(request) {
  try {
    const { lead, slot, calendarId, agentName, agentEmail, transcript } =
      await request.json();

    const targetCalendar = calendarId || "adrian@abconsultingg.com";
    const hostEmail = agentEmail || "adrian@abconsultingg.com";
    const hostName = agentName || "Adrian";

    const auth = getOAuthClient();
    const calendar = google.calendar({ version: "v3", auth });

    const notes = `
Industry: ${lead.industry}
Company: ${lead.company}
Source: ${lead.source || "Website chatbot"}

Conversation summary:
${lead.notes}

Full transcript:
${transcript || "(not provided)"}
    `.trim();

    // Create calendar event
    const event = await calendar.events.insert({
      calendarId: targetCalendar,
      sendUpdates: "all",
      requestBody: {
        summary: `Discovery Call — ${lead.name} (${lead.company})`,
        description: notes,
        start: { dateTime: slot.start, timeZone: "America/Chicago" },
        end: { dateTime: slot.end, timeZone: "America/Chicago" },
        attendees: [
          { email: lead.email, displayName: lead.name },
          { email: hostEmail, displayName: hostName },
        ],
        conferenceData: {
          createRequest: {
            requestId: `ab-${Date.now()}`,
            conferenceSolutionKey: { type: "hangoutsMeet" },
          },
        },
        reminders: {
          useDefault: false,
          overrides: [
            { method: "email", minutes: 1440 }, // 24hr
            { method: "popup", minutes: 30 },
          ],
        },
      },
      conferenceDataVersion: 1,
    });

    // Fire all integrations in parallel (non-blocking failures)
    await Promise.allSettled([
      pushToActiveCampaign(lead, notes),
      sendEmailAlert(lead, slot, notes),
      notifyCira(lead, slot),
    ]);

    return Response.json({
      success: true,
      eventId: event.data.id,
      meetLink: event.data.hangoutLink || null,
      slot: slot.label,
    });
  } catch (err) {
    console.error("Booking error:", err);
    return Response.json({ error: "Booking failed" }, { status: 500 });
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
