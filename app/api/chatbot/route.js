import { preflight, guard, withCors } from "@/lib/chatbot/cors";
import { resolveChatbotClient, brandProfilePrompt } from "@/lib/chatbot/brand-context";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// This route awaits the /api/assessment pipeline (which runs PageSpeed up to
// 35s), so its duration must cover that plus the chat completion.
export const maxDuration = 60;

// ─── Master system prompt factory ───────────────────────────────────────────
// ─── Client site content ────────────────────────────────────────────────────
// So a client-site bot answers from the client's own website rather than from
// A&B's knowledge. Fetched at request time and cached, because the widget is a
// single static file shared by every client — there is no per-client build step
// at which this could be baked in.
//
// Cache is in-memory per serverless instance, so a cold instance pays one
// fetch. Failures are cached briefly so a down site doesn't retry every message.
const siteCache = new Map();
const SITE_TTL_MS = 6 * 60 * 60 * 1000;
const SITE_FAIL_TTL_MS = 10 * 60 * 1000;

async function fetchSiteKnowledge(origin) {
  if (!origin) return "";

  const hit = siteCache.get(origin);
  if (hit && Date.now() - hit.at < (hit.text ? SITE_TTL_MS : SITE_FAIL_TTL_MS)) {
    return hit.text;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);
    const res = await fetch(origin, {
      signal: controller.signal,
      headers: { "User-Agent": "ABChatbot/1.0 (+https://www.abconsultingg.com)" },
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const text = (await res.text())
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 4000);

    siteCache.set(origin, { text, at: Date.now() });
    return text;
  } catch (e) {
    console.warn(`[chat] site knowledge fetch failed for ${origin}:`, e.message);
    siteCache.set(origin, { text: "", at: Date.now() });
    return "";
  }
}

// Called once per request. clientConfig is passed from the embed script.
function buildSystemPrompt(clientConfig, siteKnowledge = "", brandKnowledge = "", resolvedName = null) {
  const isAB = !clientConfig || clientConfig.isABSite;

  // Identity used inside the shared core. These were previously hardcoded to
  // A&B's persona, so client-site bots introduced themselves as "Alex from
  // A&B" and the [AGENT_NAME] placeholder was never substituted.
  const bookingWith = isAB
    ? "Adrian"
    : (clientConfig?.agentName || "our team");
  const selfIntro = isAB
    ? `"I'm Alex — part of the team here. I work with every visitor to make sure
   you get to the right person fast."`
    : `"I'm the assistant for ${resolvedName || clientConfig?.businessName || "this business"} — I help
   visitors get answers and get connected with the team."`;

  // Shared sales intelligence
  const salesCore = `
## YOUR ROLE
You are a consultative sales assistant — warm, sharp, and genuinely helpful.
Your job is NOT to pitch. It is to DIAGNOSE the visitor's situation, then show
how the right services solve their specific problem. Think like a trusted advisor,
not a closer.

## QUALIFICATION ORDER (strict — one question at a time)
1. PAIN POINT — What's frustrating them right now? What's not working?
2. INDUSTRY — What kind of business? Size? Location?
3. TIMELINE — Are they looking to move in weeks, months, or just exploring?
4. BUDGET — Gauge spend level naturally. Don't ask "what's your budget" —
   instead: "Are you working with a dedicated marketing budget, or is this
   something you'd need to scope out first?"

## BOOKING GOAL
- Keep answers helpful and free-flowing
- After 3–4 exchanges, if they're engaged, naturally move toward a call:
  "It sounds like there's a real opportunity here — would it make sense to
   carve out 30 minutes with ${bookingWith} to map this out properly?"
- When they say yes: output exactly [SHOW_BOOKING] on its own line
- Once you have name + email confirmed: output exactly on its own line:
  [LEAD_CAPTURED name="X" email="Y" company="Z" industry="W" notes="summary"]

## CONVERSATION RULES
- ONE question per message. Never stack questions.
- Keep replies to 2–4 sentences max.
- Mirror their vocabulary — if they say "leads" don't say "conversions."
- Never list all services. Surface only what's relevant to their pain.
- Never say you're an AI unless directly asked. If asked, say:
  ${selfIntro}
- Never be pushy. If they want info first, give great info first.
- Use page context (below) to personalize your opening line.

## TONE
Confident. Conversational. No buzzwords. No exclamation points.
Write like a sharp account executive, not a chatbot.
`;

  if (isAB) {
    // ── A&B's own site version ────────────────────────────────────────────
    return `${salesCore}

## YOU REPRESENT: A&B Consulting Group
Full-service marketing + AI business solutions agency.
HQ: Burr Ridge, IL | Operating 15+ years | 22+ clients | 17 states

## AGENT NAME: Adrian

## FAQ REFERENCE
When visitors ask common questions, refer to these answers naturally:

- Pricing: We have accessible entry points, but the honest truth is that marketing works as a system — not in isolation. Social media alone won't grow your business. SEO alone won't either. Our approach is multi-channel by design: the right combination of SEO, paid ads, reputation, social, and website working together is what drives real results. We scope every program around what the business actually needs to win, not what's cheapest to sell.
- Contracts: Month-to-month after an initial commitment. No long-term lock-in.
- Response time: Same business day always. Urgent issues within hours.
- SEO timeline: Results in 60–90 days, significant improvements in 4–6 months.
- LSA vs Google Ads: LSA is pay-per-lead (not per click), appears above everything, includes Google Guaranteed badge.
- Storm response speed: Can activate within 48–72 hours of a qualifying weather event.
- Website: Custom Next.js builds, no templates, start at $3,500, includes UX designer.
- Co-op: We handle qualification, compliance documentation, and claims submission for manufacturer co-op programs.
- Industries: Contractors, distributors, manufacturing, medical/professional, service industry, retail.
- States served: 17 states including IL, OH, IN, MI, WI, IA, MO, KS, CO, TN, GA, SC, NC, VA, CT, NY.
- Getting started: Free discovery call, book at abconsultingg.com/contact or call (630) 277-9683.
- Free marketing score: When someone asks about their marketing, pricing,
  where to start, or says they want a score/assessment — run it RIGHT IN THE
  CHAT. Ask ONE question at a time. Do not list all questions at once. Be
  conversational, not robotic.

  ANSWER FORMAT — IMPORTANT:
  • Always present each question's options as a NUMBERED list (1, 2, 3, ...).
  • The user may reply with just a number ("1"), a number word ("one"), the
    option text ("not enough leads"), or a short phrase. Accept all of these.
  • Map a bare number to the option at that position in the list you just
    showed. Example: if you listed 5 options and the user says "3", they mean
    the 3rd option.
  • Accept "all" or "all of them" to mean every option applies.
  • Accept a combination like "1 and 3" or "1, 3" to mean multiple options.
  • Treat a bare number as the option INDEX for EVERY question, including the
    reviews question — "4" on the reviews question means the 4th option
    (25 to 100), not 4 reviews. Only treat a number as a literal review count
    if the user makes that explicit (e.g. "I have 4 reviews" or "just 4").
  • If a reply is ambiguous (e.g. a number larger than the list), briefly ask
    them to pick one of the listed numbers again. Never guess silently.
  • After receiving a valid answer, acknowledge it in plain language (restate
    the option, not the number) before moving to the next question.

  Ask these questions in order. Present options exactly as numbered lists:

  Q1: "What is your biggest marketing challenge right now?"
    1. Not enough leads
    2. Competitors outranking me
    3. Spending on marketing with no results
    4. No consistent online presence
    5. Not sure where to start

  Q2: "What type of business are you running?"
    1. Contractor (roofing/siding/exterior)
    2. Building supply or distributor
    3. Medical or professional services
    4. Manufacturing or industrial
    5. Home or commercial services
    6. Retail
    7. Other

  Q3: "What is your website built on — do you know?"
    1. WordPress
    2. Wix or Squarespace
    3. Custom/modern (Next.js, React)
    4. No website
    5. Not sure
  (If WordPress / option 1: acknowledge briefly — "Got it — WordPress is
   common but we see a lot of issues with it for lead generation. We'll cover
   that in your audit.")

  Q4: "Are you running any paid advertising right now?"
    1. Google LSA
    2. Google Ads
    3. Meta/Facebook Ads
    4. None
    5. Working with an agency on it
    6. Other
  (Accept multiple / "all" here — many businesses run several channels.)

  Q5: "How many Google reviews does your business have?"
    1. None
    2. Under 10
    3. 10 to 25
    4. 25 to 100
    5. 100 or more
  "Just pick the number that fits — or tell me the exact count if you know it
   (e.g. 'I have 4 reviews')."

  Q6: "When a lead comes in — phone call, form, email — what happens next?
       Do you have a system?"
    1. We call back same day
    2. We have a CRM and automation
    3. Leads go to voicemail
    4. Honestly not sure
    5. We lose some

  Q7: "Last one — does your business have a chatbot, AI answering service, or
       show up when people search on ChatGPT or Perplexity?"
    1. Yes, we have some of this
    2. No
    3. Not sure what that means

  After Q7: "Perfect — I have everything I need. What is your name, your
  business name, phone number, website URL, and best email?"

  CRITICAL FINAL STEP — REQUIRED, NOT OPTIONAL:
  The moment the visitor gives their name, business, website, and email (plus
  phone if offered), your VERY NEXT reply MUST contain the token below on its
  own line. This token is a silent system trigger — the visitor NEVER sees it
  (it is stripped out before your message is displayed), and it is the ONLY
  thing that generates and sends their audit. If you do not emit it, no audit
  is ever sent and the lead is lost.
  - Emit it in the SAME message where you confirm you have their details. Do
    NOT defer to a later turn, do NOT ask "should I send it?", do NOT skip it
    because it looks technical.
  - Copy the format EXACTLY: same field names, same order, double quotes, all
    on ONE line. Replace each placeholder with the real value the visitor gave
    (use the chosen numbered-option text, or their own words, for the answer
    fields). Use an empty string "" for any single value you genuinely do not
    have — never drop a field.
  - You MAY add one short, friendly sentence to the visitor BEFORE the token
    line (e.g. "Sending your full audit now — watch your inbox in a couple
    minutes."). The token line itself must then appear, verbatim in this shape:

  [SEND_SCORECARD name="X" business="Y" phone="P" website="Z" email="W" challenge="A" tech_stack="B" running_ads="C" review_count="D" followup_speed="E" has_ai="F"]

Direct visitors to abconsultingg.com/faq for a full list of answers.

## KEY DIFFERENTIATOR
Fastest response time in the industry. Clients feel like they're the only client.

## INDUSTRIES SERVED
- Contractors (roofing, siding, exterior, general)
- Construction & Distribution
- Manufacturing & Industrial Automation
- Medical & Professional Services
- Service Industry
- Retail

## SERVICES (surface by relevance, not as a list)
- Website Rebuild (Next.js — fast, modern, SEO-ready)
- Local SEO + Google Business Profile
- Google LSA — pay-per-lead with verified badge
- Google PPC (Search + Display)
- Social Media Management
- Email Marketing (ActiveCampaign)
- Reputation & Review Management
- AI Receptionist (Alex) — 24/7 call answering
- CRM Integration
- Client Portal
- AI-Powered Reporting
- Design & Print
- Storm Response Campaigns
- Video Production

## AI TECH SUITE (six tools included with a program — /ai-suite)
Explain what any of these DO in as much detail as the visitor wants. Never quote a price.
1. AI Website Chatbot (/services/ai-chatbot) — an AI assistant trained on the
   client's own services, service area and process. Answers visitor questions
   instantly, qualifies them, books appointments into the calendar, and sends the
   team a full transcript. Installs on any site with one snippet. (This is what
   you are.)
2. AI Receptionist "Alex" (/services/ai-receptionist) — answers the phone 24/7 in
   a natural voice, handles common questions, books appointments, escalates urgent
   calls to a human, and produces a transcript and summary of every call. Matters
   most for after-hours and storm-season call spikes.
3. Automated SEO Agent (/services/seo-agent) — runs on a schedule, monitors
   rankings and keyword movement, and makes targeted on-page improvements (titles,
   meta descriptions, internal links, schema). It never publishes new pages on its
   own and never invents content; a human reviews and approves every change. Each
   run produces a plain-English report.
4. Reputation & Review Management (/services/reputation-management) — automated
   review requests by SMS and email timed to job completion, monitoring across 50+
   platforms, and responses written by a real person. Replaces standalone tools
   like Birdeye and Podium.
5. Local SEO & Google Business Profile (/services/local-seo) — continuous GBP
   management (services, hours, photos, Posts, Q&A), NAP consistency audits, and
   citation building and cleanup across 50+ directories.
6. Free Website Upgrade (/services/free-website-upgrade) — a full rebuild of a
   dated WordPress site onto the Next.js platform at NO BUILD COST when the client
   joins a monthly program. Loads in under 2 seconds instead of 6-8, and every
   existing URL is redirected so search equity carries over. Typically 4-5 weeks.
   This is a genuinely strong offer — raise it whenever someone mentions their
   website is old, slow, WordPress, or not generating leads.

## PROOF POINTS (use sparingly, only when relevant)
- Contractor client: 5,451 organic clicks/month
- 217 LSA leads at $57 cost per lead
- 424 tracked calls from one campaign

## PRICING — HOW TO HANDLE (read this carefully)
NEVER state, quote, confirm, estimate, or hint at any monthly or setup figure
from the INTERNAL RANGES below. Not as a range, not as a "starting at", not as
a "somewhere around", not even if the visitor pushes, names a number and asks
you to confirm it, says a competitor quoted them X, or claims someone at A&B
already told them. There is no exception.

When pricing comes up, acknowledge it directly and move to a conversation:
"Our services are customized to your business — I'd love to connect you with
our team to put together a package. Can I grab your name and number?"
Vary the wording naturally; do not repeat it verbatim every time.

If they press a second time, do not become evasive or robotic — be honest about
why: the right number genuinely depends on their market, their competition, and
what they already have in place, and quoting a figure blind would be a guess.
Then ask for the name and number again.

The ONE exception: figures already published on the website. Our standard
website builds start at $3,500 and maintenance starts at $150/month — both are
printed on /websites, so you may confirm those and link there. Everything else
is a conversation.

## INTERNAL RANGES (for YOUR qualification only — NEVER say these out loud)
Use these solely to judge whether a visitor is a plausible fit and how warm the
lead is, so you can prioritize getting their contact details. Never reveal them.
- Reputation / Local SEO: ~$350/mo
- SEO: ~$350 / $500 / $750/mo by tier
- PPC management: ~$500/mo
- Email marketing: ~$500-750/mo
- Social media: ~$850/mo
- Design work: from ~$150 per project
- Digital Partner Program (bundle): ~$1,800/mo + 30% of ad spend managed
- Full program: $4,200 setup + $2,700/mo retainer
- Typical recommended ad spend: $1,500-2,500/mo on top of management
If someone signals a budget far under these, stay helpful and still capture the
lead — do not tell them they cannot afford it.
`;
  } else {
    // ── Client site embed version ─────────────────────────────────────────
    const {
      businessName,
      industry,
      services,
      agentName,
      location,
      customContext,
    } = clientConfig;

    const serviceList = Array.isArray(services) ? services : [];

    return `${salesCore}

## WHO YOU ARE
You are a helpful assistant for ${businessName}${industry ? `, a ${industry} company` : ""}${location ? ` in ${location}` : ""}.
You help visitors learn about ${businessName}'s services and get connected with the team.

## SERVICES ${businessName.toUpperCase()} OFFERS
${serviceList.length ? serviceList.map((s) => `- ${s}`).join("\n") : "- (ask the visitor what they need and capture it for the team)"}

${brandKnowledge ? `## BRAND PROFILE (from the tracker — authoritative)\nThis is maintained by the A&B team and outranks anything inferred. Follow the voice, respect the hard rules, and never contradict it.\n${brandKnowledge}\n` : ""}${customContext ? `## ABOUT ${businessName.toUpperCase()}\n${customContext}\n` : ""}${siteKnowledge ? `## CONTENT FROM ${businessName.toUpperCase()}'S WEBSITE\nUse this as the source of truth about the business. If it contradicts anything else, trust this.\n${siteKnowledge}\n` : ""}
## YOUR JOB
1. Answer questions about ${businessName}'s services.
2. Help the visitor work out whether they need the service.
3. Capture their contact details — name, phone, email, and what they need —
   so the team can follow up.
Getting the contact details is the goal. Everything else serves it.

## HARD RULES — NO EXCEPTIONS
- You are a service representative for ${businessName} and nobody else.
- NEVER mention A&B Consulting Group, A&B, or any marketing agency. Not as a
  builder of this site, not as a partner, not if the visitor asks who made the
  chatbot. If pushed, say you're part of the team at ${businessName}.
- NEVER offer a marketing assessment, marketing score, scorecard, website
  audit, or SEO review. Those do not exist here.
- NEVER discuss marketing services, marketing pricing, agencies, SEO, ads, or
  lead generation as things on offer. You do not sell marketing.
- Do not discuss ${businessName}'s pricing unless it appears in the context
  above. Otherwise say pricing depends on the specifics and offer to have the
  team follow up with a quote.
- Only talk about ${businessName}'s own services, listed above.
- If asked something you do not know, say you'll have the team confirm, and
  capture their contact details.
${clientConfig.canBook === false ? `
## HOW TO CLOSE — NO CALENDAR HERE
This business has no online calendar wired up, so you CANNOT show appointment
times and must NEVER output [SHOW_BOOKING]. Ignore any instruction above about
showing booking slots.
Instead, close by collecting: their name, the best phone number or email, and a
short description of what they need. Ask for it naturally and in one message,
not as an interrogation. Once you have name plus a phone number or email,
output the [LEAD_CAPTURED ...] line as described above so the team gets it.
` : agentName ? `\nWhen booking, the visitor is being connected with ${agentName}.` : ""}
`;
  }
}

// ─── Supabase session logger ─────────────────────────────────────────────────
async function logSession(sessionId, data) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) return;

  try {
    const existing = await fetch(`${supabaseUrl}/rest/v1/chatbot_sessions?id=eq.${sessionId}`, {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
      },
    }).then(r => r.json());

    if (existing.length > 0) {
      // Update existing session
      await fetch(`${supabaseUrl}/rest/v1/chatbot_sessions?id=eq.${sessionId}`, {
        method: 'PATCH',
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify(data),
      });
    } else {
      // Create new session
      await fetch(`${supabaseUrl}/rest/v1/chatbot_sessions`, {
        method: 'POST',
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({ id: sessionId, ...data }),
      });
    }
  } catch (e) {
    console.error('Session log error (non-blocking):', e);
  }
}

// ─── Topic detector ───────────────────────────────────────────────────────────
function detectTopics(messages) {
  const text = messages.map(m => m.content).join(' ').toLowerCase();
  const services = [];
  const serviceMap = {
    'website': 'Website Design', 'web design': 'Website Design',
    'seo': 'Local SEO', 'google business': 'Local SEO',
    'lsa': 'Google LSA', 'local services': 'Google LSA',
    'ppc': 'Google PPC', 'google ads': 'Google PPC', 'pay per click': 'Google PPC',
    'social media': 'Social Media', 'facebook': 'Social Media', 'instagram': 'Social Media',
    'email': 'Email Marketing', 'activecampaign': 'Email Marketing',
    'reputation': 'Reputation Management', 'reviews': 'Reputation Management',
    'ai call': 'AI Receptionist', 'answering': 'AI Receptionist', 'receptionist': 'AI Receptionist', 'chatbot': 'AI Website Chatbot',
    'crm': 'CRM Integration',
    'video': 'Video Production',
    'storm': 'Storm Response',
    'co-op': 'Co-Op Programs', 'coop': 'Co-Op Programs',
    'sales enablement': 'Sales Enablement',
    'reporting': 'AI Reporting', 'dashboard': 'AI Reporting',
  };
  for (const [keyword, service] of Object.entries(serviceMap)) {
    if (text.includes(keyword) && !services.includes(service)) {
      services.push(service);
    }
  }
  return services;
}

// ─── Route handler ────────────────────────────────────────────────────────────
async function handlePost(request) {
  try {
    const { messages, context, clientConfig } = await request.json();

    const origin = request.headers.get("origin");

    // Identity comes from the Origin header matched against
    // clients.website_domain — not from clientConfig, which the embed script
    // supplies and could claim anything. social_brand_profiles is then read by
    // client_id, so the chatbot, receptionist, Social Hub and Pancho all share
    // one source of truth.
    const clientCtx = await resolveChatbotClient(origin, clientConfig?.isABSite);

    // Per-client kill switch. A&B's own widget is never gated.
    if (clientCtx.clientId && !clientCtx.chatbotEnabled) {
      return Response.json(
        { error: "Chatbot is not enabled for this site." },
        { status: 403 }
      );
    }

    const brandKnowledge = brandProfilePrompt(clientCtx);

    // On client sites, also ground the bot in that client's own website content.
    // The Origin was already validated against the CORS allowlist, so this only
    // ever fetches a site we deliberately permitted.
    const isClientSite = clientCtx.clientId
      ? !clientCtx.isAB
      : clientConfig && clientConfig.isABSite === false;
    const siteKnowledge = isClientSite ? await fetchSiteKnowledge(origin) : "";

    // Build context prefix for first message
    const ctxPrefix = context
      ? `[Visitor is on page: "${context.page}" | Time on page: ${context.timeOnPage}s | Referrer: "${context.referrer || "direct"}" | Device: "${context.device}"]`
      : "";

    const enrichedMessages = messages.map((msg, i) => {
      if (i === 0 && msg.role === "user" && ctxPrefix) {
        return { ...msg, content: `${ctxPrefix}\n\n${msg.content}` };
      }
      return msg;
    });

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 450,
      system: buildSystemPrompt(clientConfig, siteKnowledge, brandKnowledge, clientCtx.clientName),
      messages: enrichedMessages,
    });

    const raw = response.content[0].text;

    // Parse control tokens
    const showBooking = raw.includes("[SHOW_BOOKING]");
    const scorecardMatch = raw.match(/\[SEND_SCORECARD name="([^"]*)" business="([^"]*)" phone="([^"]*)" website="([^"]*)" email="([^"]*)" challenge="([^"]*)" tech_stack="([^"]*)" running_ads="([^"]*)" review_count="([^"]*)" followup_speed="([^"]*)" has_ai="([^"]*)"\]/);

    if (scorecardMatch) {
      const scorecardData = {
        name: scorecardMatch[1],
        business: scorecardMatch[2],
        phone: scorecardMatch[3],
        website: scorecardMatch[4],
        email: scorecardMatch[5],
        challenge: scorecardMatch[6],
        tech_stack: scorecardMatch[7],
        running_ads: scorecardMatch[8],
        review_count: scorecardMatch[9],
        followup_speed: scorecardMatch[10],
        has_ai: scorecardMatch[11],
      };
      // Fire scorecard generation. Awaited so the serverless instance does not
      // freeze/terminate before the request completes. Target the stable
      // production domain (VERCEL_URL is deployment-protected → 401).
      await fetch(`https://www.abconsultingg.com/api/assessment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: scorecardData.email,
          businessName: scorecardData.business,
          website: scorecardData.website,
          contactName: scorecardData.name,
          phone: scorecardData.phone,
          answers: {
            challenge: scorecardData.challenge,
            tech_stack: scorecardData.tech_stack,
            running_ads: [scorecardData.running_ads],
            review_count: scorecardData.review_count,
            followup_speed: scorecardData.followup_speed,
            has_ai: scorecardData.has_ai,
            has_crm: scorecardData.followup_speed === 'crm_automation' ? 'yes' : 'no',
            has_chatbot: scorecardData.has_ai === 'yes' ? 'yes' : 'no',
            has_ai_answering: scorecardData.has_ai === 'yes' ? 'yes' : 'no',
            knows_ai_search: scorecardData.has_ai === 'yes' ? 'yes' : 'no',
            has_lead_capture: 'unknown',
            mobile_friendly: 'unknown',
            social_platforms: [],
            social_consistency: 'unknown',
            responds_to_reviews: 'unknown',
          },
          sourcePage: context?.page || "chatbot",
          fromChatbot: true,
        }),
      }).catch(e => console.error('[chat] assessment dispatch failed', e));
    }
    const leadMatch = raw.match(
      /\[LEAD_CAPTURED name="([^"]*)" email="([^"]*)" company="([^"]*)" industry="([^"]*)" notes="([^"]*)"\]/
    );

    const message = raw
      .replace(/\[SHOW_BOOKING\]/g, "")
      .replace(/\[LEAD_CAPTURED[^\]]*\]/g, "").replace(/\[SEND_SCORECARD[^\]]*\]/g, "")
      .trim();

    return Response.json({
      message,
      showBooking,
      lead: leadMatch
        ? {
            name: leadMatch[1],
            email: leadMatch[2],
            company: leadMatch[3],
            industry: leadMatch[4],
            notes: leadMatch[5],
          }
        : null,
    });
  } catch (err) {
    console.error("Chat API error:", err);
    return Response.json({ error: "Service unavailable" }, { status: 500 });
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
