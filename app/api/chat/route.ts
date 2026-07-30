// app/api/chat/route.ts
// Website chatbot (Alex) — streams Claude responses and logs sessions to chatbot_sessions.
// POST body:
//   messages: { role: "user" | "assistant"; content: string }[]
//   session: {
//     page_url?: string; referrer?: string; device?: string;
//     time_on_page_seconds?: number; is_ab_site?: boolean; client_name?: string;
//   }
//   lead?: {
//     name?: string; email?: string; company?: string;
//     industry?: string; notes?: string; booked_call?: boolean; slot_booked?: string;
//   }
//   meta?: { topics?: string[]; services_mentioned?: string[]; pain_points?: string }
//   save?: boolean   // pass true on conversation end to persist the session

import { NextRequest, NextResponse } from "next/server";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!;
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const SYSTEM_PROMPT = `You are Alex, the AI assistant for A&B Consulting Group — a full-service digital marketing and AI business solutions agency based in Burr Ridge, IL. Tagline: "You're not a client. You're the only client."

A&B specializes in serving wholesale distributors and contractors in the construction supply industry. Services include: SEO, Google Ads, LSA, Meta Ads, social media management, email marketing, website design, reputation management, and AI business solutions.

Your job:
1. Warmly greet visitors and understand their business and marketing goals.
2. Ask qualifying questions: What kind of business do you run? What's your biggest marketing challenge? Have you tried digital marketing before?
3. When you have their name, email, and website — let them know A&B will prepare a free marketing assessment for them.
4. Encourage them to book a strategy call: https://abconsultingg.com/assessment
5. Keep responses concise, warm, and direct. No fluff. Never quote specific pricing.
6. If asked about services, give a brief overview and pivot to understanding their needs.`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { messages = [], session = {}, lead = {}, meta = {}, save = false } = body;

    // --- Stream Claude response ---
    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages,
        stream: true,
      }),
    });

    if (!claudeRes.ok) {
      const err = await claudeRes.text();
      return NextResponse.json({ error: `Claude error: ${claudeRes.status}`, detail: err }, { status: 502 });
    }

    // --- Persist session to Supabase when save=true ---
    if (save) {
      const transcript = messages
        .map((m: { role: string; content: string }) => `${m.role.toUpperCase()}: ${m.content}`)
        .join("\n\n");

      await fetch(`${SUPABASE_URL}/rest/v1/chatbot_sessions`, {
        method: "POST",
        headers: {
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          page_url: session.page_url ?? null,
          referrer: session.referrer ?? null,
          device: session.device ?? null,
          time_on_page_seconds: session.time_on_page_seconds ?? null,
          is_ab_site: session.is_ab_site ?? true,
          client_name: session.client_name ?? null,
          message_count: messages.filter((m: { role: string }) => m.role === "user").length,
          duration_seconds: session.duration_seconds ?? null,
          lead_captured: !!(lead.email),
          lead_name: lead.name ?? null,
          lead_email: lead.email ?? null,
          lead_company: lead.company ?? null,
          lead_industry: lead.industry ?? null,
          lead_notes: lead.notes ?? null,
          booked_call: lead.booked_call ?? false,
          slot_booked: lead.slot_booked ?? null,
          topics: meta.topics ?? null,
          services_mentioned: meta.services_mentioned ?? null,
          pain_points: meta.pain_points ?? null,
          transcript,
        }),
      }).catch((e) => console.error("[chat] chatbot_sessions insert failed", e));
    }

    // Stream the response back to the client
    return new NextResponse(claudeRes.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (e) {
    console.error("[chat] route error", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
