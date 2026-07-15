// lib/call-intelligence/scorecard.ts
// Phone marketing scorecard — SAME PIPELINE as the website chatbot (Alex):
//   1. Live Semrush data for the caller's domain
//   2. Claude generates score / grade / gap analysis / recommendations / full report
//   3. Row inserted into marketing_assessments (appears in Tracker Assessments tab)
//   4. Contact synced to ActiveCampaign (ac_contact_id stored)
//   5. Report emailed via Resend to prospect + info@
// Fires from the complete handler for agency-brain AI calls that collected website + email.

import type { CIClient, CICall } from "./supabase";

const SEMRUSH_API_KEY = process.env.SEMRUSH_API_KEY!;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!;
const RESEND_API_KEY = process.env.RESEND_API_KEY!;
const AC_API_URL = process.env.ACTIVECAMPAIGN_API_URL!;   // e.g. https://abconsultingg.api-us1.com
const AC_API_KEY = process.env.ACTIVECAMPAIGN_API_KEY!;
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const FROM_EMAIL = process.env.CI_FROM_EMAIL || "info@abconsultingg.com";
const MODEL = process.env.CI_CLAUDE_MODEL || "claude-haiku-4-5-20251001";

type PhoneCall = CICall & { website?: string | null; caller_email?: string | null };

type SemrushData = {
  organicKeywords?: string;
  organicTraffic?: string;
  paidKeywords?: string;
  authorityScore?: string;
  backlinks?: string;
  refDomains?: string;
};

type Assessment = {
  score: number;
  grade: string;
  gap_analysis: string;
  recommendations: string;
  full_report: string;
};

function cleanDomain(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0];
}

/** property_type on agency calls holds "Business Name — industry" free text. */
function splitBusinessIndustry(raw: string | null): { business: string; industry: string } {
  const text = (raw || "").trim();
  const parts = text.split(/\s*[—–-]\s+/);
  if (parts.length >= 2) return { business: parts[0], industry: parts.slice(1).join(" ") };
  return { business: text || "Unknown business", industry: "" };
}

/** Semrush returns semicolon-delimited CSV: header line 0, data line 1. */
function parseSemrushCsv(text: string): Record<string, string> {
  const lines = text.trim().split("\n");
  if (lines.length < 2 || lines[0].startsWith("ERROR")) return {};
  const headers = lines[0].split(";");
  const values = lines[1].split(";");
  const out: Record<string, string> = {};
  headers.forEach((h, i) => (out[h.trim()] = (values[i] || "").trim()));
  return out;
}

async function fetchSemrush(domain: string): Promise<SemrushData> {
  const data: SemrushData = {};
  try {
    const rankRes = await fetch(
      `https://api.semrush.com/?type=domain_rank&key=${SEMRUSH_API_KEY}&domain=${encodeURIComponent(
        domain
      )}&database=us&export_columns=Db,Dn,Rk,Or,Ot,Oc,Ad,At,Ac`
    );
    const rank = parseSemrushCsv(await rankRes.text());
    data.organicKeywords = rank["Organic Keywords"] || rank["Or"];
    data.organicTraffic = rank["Organic Traffic"] || rank["Ot"];
    data.paidKeywords = rank["Adwords Keywords"] || rank["Ad"];
  } catch (e) {
    console.error("[CI] Semrush domain_rank failed", e);
  }
  try {
    const blRes = await fetch(
      `https://api.semrush.com/analytics/v1/?key=${SEMRUSH_API_KEY}&type=backlinks_overview&target=${encodeURIComponent(
        domain
      )}&target_type=root_domain&export_columns=ascore,total,domains_num`
    );
    const bl = parseSemrushCsv(await blRes.text());
    data.authorityScore = bl["ascore"];
    data.backlinks = bl["total"];
    data.refDomains = bl["domains_num"];
  } catch (e) {
    console.error("[CI] Semrush backlinks failed", e);
  }
  return data;
}

async function generateAssessment(
  call: PhoneCall,
  business: string,
  industry: string,
  domain: string,
  semrush: SemrushData
): Promise<Assessment> {
  const prompt = `You are generating a marketing assessment for A&B Consulting Group (full-service digital marketing + AI business solutions agency, Burr Ridge IL, tagline "You're not a client. You're the only client."). The prospect just CALLED the office and spoke with Alex, the AI assistant. This mirrors the website chatbot's 7-section marketing audit.

Prospect: ${call.caller_name || "there"}
Business: ${business}${industry ? ` (${industry})` : ""}
Website: ${domain}
Stated need: ${call.service_type || "general marketing help"}
How they found A&B: ${call.source || "unknown"}

Live SEO data for ${domain} (Semrush; treat missing values as limited visibility):
- Organic keywords ranking: ${semrush.organicKeywords ?? "n/a"}
- Estimated monthly organic traffic: ${semrush.organicTraffic ?? "n/a"}
- Paid keywords running: ${semrush.paidKeywords ?? "n/a"}
- Authority score: ${semrush.authorityScore ?? "n/a"}
- Backlinks: ${semrush.backlinks ?? "n/a"} from ${semrush.refDomains ?? "n/a"} referring domains

Produce the 7-section audit (grade each A-F, 2-3 plain-language sentences per section):
1. Website & Technology (if the site is WordPress or dated, note performance/security risks)
2. SEO Visibility (use the real numbers)
3. Social Media Presence (frame as strategy-call review + one sharp diagnostic question)
4. Paid Advertising (use paid keywords data)
5. Online Reputation (strategy-call review + diagnostic question)
6. Lead Follow-Up System (strategy-call review + diagnostic question)
7. AI Readiness (they just experienced AI answering the phone — use that)

Rules: never quote specific pricing (programs are tailored, "starting at" framing only). Weave in ONCE that multi-channel systems beat single-channel marketing. Warm, direct, zero fluff. End the report with overall grade, the single biggest opportunity, and CTA: "Adrian's team will be reaching out shortly — or book directly: https://abconsultingg.com/assessment".

Respond with ONLY a JSON object, no markdown fences:
{
  "score": <0-100 integer overall marketing score>,
  "grade": "<single letter A-F>",
  "gap_analysis": "<2-3 sentence summary of the biggest gaps>",
  "recommendations": "<2-3 sentence summary of top recommended moves>",
  "full_report": "<the complete 7-section audit as PLAIN TEXT email body, sections separated by blank lines, no markdown symbols>"
}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({ model: MODEL, max_tokens: 2500, messages: [{ role: "user", content: prompt }] }),
  });
  if (!res.ok) throw new Error(`Claude assessment failed: ${res.status}`);
  const data = await res.json();
  const text = (data.content || [])
    .filter((b: { type: string }) => b.type === "text")
    .map((b: { text: string }) => b.text)
    .join("");
  const clean = text.replace(/```json|```/g, "").trim();
  const parsed = JSON.parse(clean) as Assessment;
  return {
    score: Math.max(0, Math.min(100, Math.round(parsed.score ?? 50))),
    grade: (parsed.grade || "C").slice(0, 2),
    gap_analysis: parsed.gap_analysis || "",
    recommendations: parsed.recommendations || "",
    full_report: parsed.full_report || "",
  };
}

/** Sync contact to ActiveCampaign; returns contact id or null. Same as chatbot flow. */
async function syncActiveCampaign(call: PhoneCall, business: string): Promise<string | null> {
  try {
    const name = (call.caller_name || "").trim().split(/\s+/);
    const res = await fetch(`${AC_API_URL}/api/3/contact/sync`, {
      method: "POST",
      headers: { "Api-Token": AC_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        contact: {
          email: call.caller_email,
          firstName: name[0] || "",
          lastName: name.slice(1).join(" ") || "",
          phone: call.caller_number || "",
        },
      }),
    });
    if (!res.ok) {
      console.error("[CI] AC sync failed", res.status, await res.text());
      return null;
    }
    const data = await res.json();
    return data?.contact?.id ? String(data.contact.id) : null;
  } catch (e) {
    console.error("[CI] AC sync error", e);
    return null;
  }
}

async function logAssessment(
  call: PhoneCall,
  business: string,
  industry: string,
  assessment: Assessment,
  emailSent: boolean,
  acContactId: string | null
): Promise<void> {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/marketing_assessments`, {
      method: "POST",
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: call.caller_email,
        business_name: business,
        industry: industry || null,
        location: call.caller_address || null,
        source_page: "phone-call-alex",
        service_focus: call.service_type || null,
        answers: {
          channel: "phone",
          call_sid: call.call_sid,
          caller_number: call.caller_number,
          website: call.website,
          call_reason: call.call_reason,
          source: call.source,
          intent_level: call.intent_level,
        },
        score: assessment.score,
        grade: assessment.grade,
        gap_analysis: assessment.gap_analysis,
        recommendations: assessment.recommendations,
        full_report: assessment.full_report,
        email_sent: emailSent,
        booked_call: false,
        ac_contact_id: acContactId,
      }),
    });
  } catch (e) {
    console.error("[CI] marketing_assessments insert failed", e);
  }
}

export async function sendPhoneScorecard(client: CIClient, call: PhoneCall): Promise<boolean> {
  if (!call.website || !call.caller_email) return false;
  const domain = cleanDomain(call.website);
  if (!domain || !domain.includes(".")) return false;

  const { business, industry } = splitBusinessIndustry(call.property_type);

  try {
    const semrush = await fetchSemrush(domain);
    const assessment = await generateAssessment(call, business, industry, domain, semrush);

    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: `A&B Consulting Group <${FROM_EMAIL}>`,
        to: [call.caller_email],
        cc: [FROM_EMAIL],
        subject: `Your Marketing Scorecard — ${business} (Grade: ${assessment.grade})`,
        text:
          assessment.full_report +
          `\n\n—\nA&B Consulting Group | Burr Ridge, IL\nYou're not a client. You're the only client.\nabconsultingg.com`,
      }),
    });
    const emailSent = emailRes.ok;

    const acContactId = await syncActiveCampaign(call, business);
    await logAssessment(call, business, industry, assessment, emailSent, acContactId);

    return emailSent;
  } catch (e) {
    console.error("[CI] Phone scorecard failed", e);
    return false;
  }
}
