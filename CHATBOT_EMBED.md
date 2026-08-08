# Chatbot — Client Site Install

The A&B AI sales chatbot (`public/chatbot.js`) is a self-contained widget that
can be embedded on a client website. It is served from the tracker at
**app.abconsultingg.com** and talks to three endpoints there: `/api/chatbot`,
`/api/chatbot/book`, and `/api/chatbot/availability`.

> **Migrating an existing install.** The marketing site
> (`www.abconsultingg.com`) still serves `/chatbot.js`, `/api/chat` and
> `/api/chatbot` from a separate Vercel project, so older snippets keep working
> — but against a stale copy of the code, with its own CORS allowlist and
> without brand profiles or session logging. Re-point any existing snippet at
> `app.abconsultingg.com` and bump the `?v=` cache-buster.

## The snippet

Paste this immediately before `</body>` on every page of the client site.

```html
<script>
  window.ABChatConfig = {
    apiBase: "https://app.abconsultingg.com",

    isABSite: false,
    businessName: "KBC Exteriors",
    industry: "Roofing & Exterior Contractor",
    location: "Chicago, IL",

    agentName: "Adrian",
    agentEmail: "adrian@abconsultingg.com",
    calendarId: "adrian@abconsultingg.com",

    services: ["Roof replacement", "Siding", "Gutters", "Storm damage repair"],
    customContext: "Serving the Chicago suburbs since 2010. Free estimates.",

    brandColor: "#C0392B",
    brandName: "KBC Assistant"
  };
</script>
<script src="https://app.abconsultingg.com/chatbot.js?v=6" async></script>
```

### `apiBase` is required

The widget still **defaults** to `https://www.abconsultingg.com` when `apiBase`
is omitted, which sends traffic to the old marketing-site copy. Always set it
explicitly. `app.abconsultingg.com` has no apex/`www` variant and does not
redirect, so the preflight problem that affected the old host does not apply
here.

Bump the `?v=` on the `<script src>` whenever `public/chatbot.js` changes —
browsers on client sites cache it aggressively, and a stale widget silently
keeps the old behaviour.

## Config reference

Every key the widget actually reads:

| Key | Required | Notes |
|---|---|---|
| `apiBase` | yes | `https://app.abconsultingg.com`. Defaults to the old `www` host if unset |
| `isABSite` | yes | `false` on client sites. `true` only on abconsultingg.com |
| `businessName` | yes | The bot introduces itself as this business, not as A&B |
| `industry` | yes | Shapes the system prompt |
| `location` | yes | Used for local context in answers |
| `agentName` | yes | Who the booking is with |
| `agentEmail` | yes | Booking notifications |
| `calendarId` | for booking | Google Calendar the availability check reads |
| `services` | recommended | Array of strings |
| `customContext` | recommended | Free text — service area, years in business, differentiators |
| `brandColor` | **strongly recommended** | Drives the header, launcher, send button, message bubbles, and slot buttons. Defaults to A&B orange `#E8541A` — set it or the widget looks like A&B |
| `brandDark` | optional | Header colour override. On client sites the header follows `brandColor` unless you set this |
| `brandName` | optional | Widget header label. Defaults to `businessName` |
| `botName` | optional | What the assistant calls itself. Left unset on client sites (it just speaks as the business) |
| `greeting` | optional | Override the opening line entirely |
| `bookingLabel` | optional | Override the CTA button. Defaults to "Get a Free Estimate" on client sites |

> `acListId` is documented in the header of `chatbot.js` but is **not read by
> the code**. Setting it does nothing today.

Note that identity does **not** come from this config. The API resolves the
client from the validated `Origin` against `clients.website_domain`, because the
widget is a public static file and anything it sends is caller-supplied.
`businessName` and friends only shape wording.

## What `isABSite: false` changes

The widget and the API are fully white-labeled when this is set:

- **Greeting** — "Hi! I'm here to help with any questions about {businessName}.
  Looking for a free estimate, or have questions about our services?"
- **CTA button** — "Get a Free Estimate" (not "Book a call with Adrian")
- **Header colour** — follows `brandColor`, not A&B navy
- **Identity** — the bot never names Alex, Adrian, or A&B. If asked who it is,
  it says it's part of the team at the client business
- **No marketing content** — the marketing-score/assessment flow, A&B's service
  list, and all A&B pricing context are excluded from the system prompt
  entirely. It cannot offer an audit because it does not know one exists

The `Powered by A&B AI` footer is the only A&B branding that remains, by design.

## Where the bot's knowledge comes from

The bot is grounded in the client's `social_brand_profiles` row, looked up by
`client_id` from the validated `Origin`. That row is maintained by the A&B team
in the tracker (client detail → Brand Profile) and is shared with the AI
receptionist, the Social Hub and Pancho, so all of them answer from one source.
Editing the profile changes every product at once.

It supplies services, service area, differentiators, audience, ideal customer,
the problem the business solves, social proof, awards, voice, tone words,
content pillars, CTA style, phone and website — plus hard rules from
`avoid_words` and `topics_to_avoid`.

> Earlier versions scraped the client's homepage at request time and told the
> model to treat that text as the source of truth above everything else. That
> was removed: it outranked the profile the team maintains, and put a
> third-party fetch on the request path.

If a client has no brand profile, the bot falls back to `services`,
`customContext` and `location` from the snippet config.

## Before a client can go live

1. **Add their domain to the allowlist** in `lib/chatbot/cors.ts` and deploy.
   Requests from any other origin are rejected with `403`. The apex domain and
   its `www.` subdomain are both accepted from a single entry.
2. **Add the domain to the client row** — `clients.website_domain` is a `text[]`,
   so one client can front several sites. This is what maps `Origin` to the
   brand profile. A domain that passes CORS but matches no client gets a generic
   bot with no business knowledge.
3. **Turn the chatbot on for that client** — the `Chatbot` toggle on the client
   detail page (`clients.chatbot_enabled`). This is a per-client kill switch: a
   client that is allowlisted but switched off returns
   `403 {"error":"Chatbot is not enabled for this site."}`. A&B's own widget is
   never gated by it.
4. **Fill in the brand profile** — see above. Chat works without it, but the bot
   knows nothing specific about the business.
5. **Grant calendar access** for the `calendarId` you configure, or booking will
   fail even though chat works.
6. **Verify the install** — see below.

## Currently allowlisted

`abconsultingg.com` · `cultureccc.com` · `apollosupplyevents.com` ·
`mvpchiropractic.com` · `richardsbuildingsupply.com` · `kbcexteriors.com` ·
`nicoroofingexteriors.com` · `midwestconstructionexperts.com`

> The allowlist must contain the domain the browser actually sends as `Origin`.
> Culture's live site is **cultureccc.com**; when only `cultureconstruction.com`
> was allowlisted, every request from the real site was blocked with a `403`
> preflight, which presents as a chatbot that silently does nothing. Confirm the
> real domain before going live — `curl -i -X OPTIONS` (below) is the fastest
> check.

## Rate limiting

Each origin gets **100 requests per hour**. Over that, the API returns `429`
with `Retry-After` and `X-RateLimit-*` headers.

Two caveats worth knowing:

- The counter is **in-memory per serverless instance**, so under scale-out the
  real ceiling is higher than 100. It is a cost guard on A&B's Anthropic key,
  not a hard quota. A global limit needs Supabase or KV backing.
- The budget is **shared across all visitors of a client site**, not per
  visitor. A busy site can exhaust it — every chat message is one request.
  Raise `RATE_LIMIT_MAX` in `lib/chatbot/cors.ts` if a client hits the ceiling.

## Session logging

Every turn is written to `chatbot_sessions`, upserted against a session id the
widget generates per page load, so one conversation is one row that grows as it
goes. Older cached copies of `chatbot.js` do not send that id and their
conversations are **not** logged — another reason to bump `?v=` when
re-pointing a client at the new host.

## Verifying an install

From a terminal, confirm the preflight is accepted for the client's origin:

```bash
curl -i -X OPTIONS https://app.abconsultingg.com/api/chatbot \
  -H "Origin: https://kbcexteriors.com" \
  -H "Access-Control-Request-Method: POST"
```

Expect `204` and `access-control-allow-origin: https://kbcexteriors.com`.
A `403` means the domain is not allowlisted.

Then confirm the bot answers **as the client**. Send `clientConfig` exactly as
the snippet would — without it the reply comes back in A&B's voice even when the
`Origin` resolves to a client, because the config is what selects white-label
mode:

```bash
curl -s -X POST https://app.abconsultingg.com/api/chatbot \
  -H "Origin: https://kbcexteriors.com" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"What do you do?"}],
       "clientConfig":{"isABSite":false,"businessName":"KBC Exteriors"}}'
```

A correct reply names the business and its real services — those come from the
brand profile, so if the answer is generic, check step 4.

`{"error":"Chatbot is not enabled for this site."}` means the domain resolved to
a client whose toggle is off — step 3 above, not a CORS problem.

Then load the client site and confirm the launcher appears bottom-right, opens,
and returns a reply. If the widget is silent, check the browser console — a CORS
failure names the blocked origin.
