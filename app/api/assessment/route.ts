// app/api/assessment/route.ts
// Website marketing assessment form — mirrors the phone scorecard pipeline in scorecard.ts:
//   1. Receives form submission (name, email, website, business, industry, service_focus)
//   2. Pulls live Semrush data for their domain
//   3. Claude generates score / grade / gap analysis / recommendations / full report
//   4. Row inserted into marketing_assessments
//   5. Contact synced to ActiveCampaign
//   6. Report emailed via Resend to prospect + info@
// POST body:
//   { name, email, website, business_name, industry?, location?, service_focus?, source_page? }

import { NextRequest, NextResponse } from "next/server";

const SEMRUSH_API_KEY = process.env.SEMRUSH_API_KEY!;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!;
const RESEND_API_KEY = process.env.RESEND_API_KEY!;
const AC_API_URL = process.env.ACTIVECAMPAIGN_API_URL!;
const AC_API_KEY = process.env.ACTIVECAMPAIGN_API_KEY!;
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const FROM_EMAIL = process.env.CI_FROM_EMAIL || "info@abconsultingg.com";
const MODEL = process.env.CI_CLAUDE_MODEL || "claude-haiku-4-5-20251001";

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cleanDomain(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0];
}

function parseSemrushCsv(text: string): Record<string, string> {
  const lines = text.trim().split("\n");
  if (lines.length < 2 || lines[0].startsWith("ERROR")) return {};
  const headers = lines[0].split(";");
  const values = lines[1].split(";");
  const out: Record<string, string> = {};
  headers.forEach((h, i) => (out[h.trim()] = (values[i] || "").trim()));
  return out;
}

// ─── Semrush ──────────────────────────────────────────────────────────────────

async function fetchSemrush(domain: string): Promise<SemrushData> {
  const data: SemrushData = {};
  try {
    const rankRes = await fetch(
      `https://api.semrush.com/?type=domain_rank&key=${SEMRUSH_API_KEY}&domain=${encodeURIComponent(domain)}&database=us&export_columns=Db,Dn,Rk,Or,Ot,Oc,Ad,At,Ac`
    );
    const rank = parseSemrushCsv(await rankRes.text());
    data.organicKeywords = rank["Organic Keywords"] || rank["Or"];
    data.organicTraffic = rank["Organic Traffic"] || rank["Ot"];
    data.paidKeywords = rank["Adwords Keywords"] || rank["Ad"];
  } catch (e) {
    console.error("[assessment] Semrush domain_rank failed", e);
  }
  try {
    const blRes = await fetch(
      `https://api.semrush.com/analytics/v1/?key=${SEMRUSH_API_KEY}&type=backlinks_overview&target=${encodeURIComponent(domain)}&target_type=root_domain&export_columns=ascore,total,domains_num`
    );
    const bl = parseSemrushCsv(await blRes.text());
    data.authorityScore = bl["ascore"];
    data.backlinks = bl["total"];
    data.refDomains = bl["domains_num"];
  } catch (e) {
    console.error("[assessment] Semrush backlinks failed", e);
  }
  return data;
}

// ─── Claude ───────────────────────────────────────────────────────────────────

async function generateAssessment(
  name: string,
  business: string,
  industry: string,
  domain: string,
  serviceFocus: string,
  semrush: SemrushData
): Promise<Assessment> {
  const prompt = `You are generating a marketing assessment for A&B Consulting Group (full-service digital marketing + AI business solutions agency, Burr Ridge IL, tagline "You're not a client. You're the only client."). The prospect submitted the website assessment form.

Prospect: ${name}
Business: ${business}${industry ? ` (${industry})` : ""}
Website: ${domain}
What they need help with: ${serviceFocus || "general marketing help"}

Live SEO data for ${domain} (Semrush; treat missing values as limited visibility):
- Organic keywords ranking: ${semrush.organicKeywords ?? "n/a"}
- Estimated monthly organic traffic: ${semrush.organicTraffic ?? "n/a"}
- Paid keywords running: ${semrush.paidKeywords ?? "n/a"}
- Authority score: ${semrush.authorityScore ?? "n/a"}
- Backlinks: ${semrush.backlinks ?? "n/a"} from ${semrush.refDomains ?? "n/a"} referring domains

Produce the 7-section audit (grade each A-F, 2-3 plain-language sentences per section):
1. Website & Technology (if the site appears dated, note performance/security risks)
2. SEO Visibility (use the real numbers above)
3. Social Media Presence (frame as strategy-call review + one sharp diagnostic question)
4. Paid Advertising (use paid keywords data)
5. Online Reputation (strategy-call review + one diagnostic question)
6. Lead Follow-Up System (strategy-call review + one diagnostic question)
7. AI Readiness (they found us online and used our assessment tool — use that context)

Rules: never quote specific pricing (programs are tailored). Weave in ONCE that multi-channel systems beat single-channel marketing. Warm, direct, zero fluff. End with overall grade, the single biggest opportunity, and CTA: "Adrian's team will be reaching out shortly — or book directly: https://abconsultingg.com/assessment".

Respond with ONLY a JSON object, no markdown fences:
{
  "score": <0-100 integer>,
  "grade": "<single letter A-F>",
  "gap_analysis": "<2-3 sentence summary of biggest gaps>",
  "recommendations": "<2-3 sentence summary of top recommended moves>",
  "full_report": "<complete 7-section audit as PLAIN TEXT email body, sections separated by blank lines, no markdown symbols>"
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

// ─── ActiveCampaign ───────────────────────────────────────────────────────────

async function syncActiveCampaign(
  name: string,
  email: string,
  business: string
): Promise<string | null> {
  try {
    const parts = name.trim().split(/\s+/);
    const res = await fetch(`${AC_API_URL}/api/3/contact/sync`, {
      method: "POST",
      headers: { "Api-Token": AC_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        contact: {
          email,
          firstName: parts[0] || "",
          lastName: parts.slice(1).join(" ") || "",
          fieldValues: business ? [{ field: "COMPANY", value: business }] : [],
        },
      }),
    });
    if (!res.ok) {
      console.error("[assessment] AC sync failed", res.status, await res.text());
      return null;
    }
    const data = await res.json();
    return data?.contact?.id ? String(data.contact.id) : null;
  } catch (e) {
    console.error("[assessment] AC sync error", e);
    return null;
  }
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      name = "",
      email = "",
      website = "",
      business_name = "",
      industry = "",
      location = "",
      service_focus = "",
      source_page = "website-assessment-form",
    } = body;

    if (!email || !website) {
      return NextResponse.json({ error: "email and website are required" }, { status: 400 });
    }

    const domain = cleanDomain(website);
    if (!domain || !domain.includes(".")) {
      return NextResponse.json({ error: "Invalid website URL" }, { status: 400 });
    }

    // Run Semrush + Claude in parallel for speed
    const [semrush] = await Promise.all([fetchSemrush(domain)]);
    const assessment = await generateAssessment(name, business_name, industry, domain, service_focus, semrush);

    // Send report email
    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: `A&B Consulting Group <${FROM_EMAIL}>`,
        to: [email],
        cc: [FROM_EMAIL],
        subject: `Your Free Marketing Assessment — ${business_name || domain} (Grade: ${assessment.grade})`,
        text:
          `Hi ${name || "there"},\n\nHere's your personalized marketing assessment from A&B Consulting Group:\n\n` +
          assessment.full_report +
          `\n\n—\nA&B Consulting Group | Burr Ridge, IL\nYou're not a client. You're the only client.\nabconsultingg.com`,
      }),
    });
    const emailSent = emailRes.ok;
    if (!emailSent) console.error("[assessment] Resend failed", emailRes.status, await emailRes.text());

    // Sync to ActiveCampaign
    const acContactId = await syncActiveCampaign(name, email, business_name);

    // Log to Supabase
    await fetch(`${SUPABASE_URL}/rest/v1/marketing_assessments`, {
      method: "POST",
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        business_name: business_name || null,
        industry: industry || null,
        location: location || null,
        source_page,
        service_focus: service_focus || null,
        answers: {
          channel: "website-form",
          name,
          website,
          domain,
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
    }).catch((e) => console.error("[assessment] Supabase insert failed", e));

    return NextResponse.json({
      success: true,
      score: assessment.score,
      grade: assessment.grade,
      gap_analysis: assessment.gap_analysis,
      recommendations: assessment.recommendations,
      email_sent: emailSent,
    });
  } catch (e) {
    console.error("[assessment] route error", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
