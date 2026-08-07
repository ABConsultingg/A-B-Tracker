# Chatbot — Client Site Install

The A&B AI sales chatbot (`public/chatbot.js`) is a self-contained widget that
can be embedded on a client website. It talks to three endpoints on
abconsultingg.com: `/api/chat`, `/api/book`, and `/api/availability`.

## The snippet

Paste this immediately before `</body>` on every page of the client site.

```html
<script>
  window.ABChatConfig = {
    apiBase: "https://www.abconsultingg.com",

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
<script src="https://www.abconsultingg.com/chatbot.js?v=5" async></script>
```

### `apiBase` must be the `www` host

`https://abconsultingg.com` (no `www`) **301/308-redirects** to the `www` host.
Browsers do **not** follow redirects on a CORS preflight, so a preflighted
`POST` to the apex fails outright and the widget goes silent. Always use
`https://www.abconsultingg.com`. The same applies to the `<script src>`.

## Config reference

Every key the widget actually reads:

| Key | Required | Notes |
|---|---|---|
| `apiBase` | yes | Must be `https://www.abconsultingg.com` (see above) |
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
- **Client site content** — on the first message the API fetches the client's
  homepage (the validated `Origin`), strips it to text, and passes it to the
  model as the source of truth about the business. Cached for 6 hours per
  serverless instance; a fetch failure is cached for 10 minutes and the bot
  falls back to `services` + `customContext` + `location` from the config

The `Powered by A&B AI` footer is the only A&B branding that remains, by design.

## Before a client can go live

1. **Add their domain to the allowlist** in `src/lib/cors.ts` and deploy.
   Requests from any other origin are rejected with `403`. The apex domain and
   its `www.` subdomain are both accepted from a single entry.
2. **Grant calendar access** for the `calendarId` you configure, or booking
   will fail even though chat works.
3. **Verify the install** — see below.

## Currently allowlisted

`abconsultingg.com` · `cultureccc.com` · `cultureconstruction.com` ·
`apollosupplyevents.com` · `mvpchiropractic.com` · `richardsbuildingsupply.com` ·
`kbcexteriors.com` · `nicoroofingexteriors.com`

> The allowlist must contain the domain the browser actually sends as `Origin`.
> Culture's live site is **cultureccc.com**; allowlisting only
> `cultureconstruction.com` left every request from the real site blocked with
> a `403` preflight, which presents as a chatbot that silently does nothing.
> Confirm the real domain before going live — `curl -i -X OPTIONS` (below) is
> the fastest check.

## Rate limiting

Each origin gets **100 requests per hour**. Over that, the API returns `429`
with `Retry-After` and `X-RateLimit-*` headers.

Two caveats worth knowing:

- The counter is **in-memory per serverless instance**, so under scale-out the
  real ceiling is higher than 100. It is a cost guard on A&B's Anthropic key,
  not a hard quota. A global limit needs Supabase or KV backing.
- The budget is **shared across all visitors of a client site**, not per
  visitor. A busy site can exhaust it — every chat message is one request.
  Raise `RATE_LIMIT_MAX` in `src/lib/cors.ts` if a client hits the ceiling.

## Verifying an install

From a terminal, confirm the preflight is accepted for the client's origin:

```bash
curl -i -X OPTIONS https://www.abconsultingg.com/api/chat \
  -H "Origin: https://kbcexteriors.com" \
  -H "Access-Control-Request-Method: POST"
```

Expect `204` and `access-control-allow-origin: https://kbcexteriors.com`.
A `403` means the domain is not allowlisted. A `308` means you used the apex
host instead of `www`.

Then load the client site and confirm the launcher appears bottom-right, opens,
and returns a reply. If the widget is silent, check the browser console — a CORS
failure names the blocked origin.
