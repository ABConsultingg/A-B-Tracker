# Chatbot in A&B Tracker

Two separate chatbots now live in this repo. They must not be merged.

| | **Public widget** | **Portal assistant** |
|---|---|---|
| Route | `app/api/chatbot/*` | `app/api/portal/assistant` |
| Talks to | Anonymous website visitors | Logged-in client portal users |
| Sees tracker data | **No — never** | Yes, scoped to that one client |
| Auth | CORS origin allowlist | Supabase session + `portal_users` |
| Widget | `public/chatbot.js` | (UI not built yet) |

The public widget sits on client websites and talks to their customers. It must
never read tracker data. The portal assistant talks to the client themselves and
does. Keep the two route trees separate.

---

## 1. Public widget — what moved

Ported from `ab-consulting-web-main`, unchanged except for paths:

| Was | Now |
|---|---|
| `src/lib/cors.ts` | `lib/chatbot/cors.ts` |
| `src/app/api/chat/route.js` | `app/api/chatbot/route.js` |
| `src/app/api/book/route.js` | `app/api/chatbot/book/route.js` |
| `src/app/api/availability/route.js` | `app/api/chatbot/availability/route.js` |
| `public/chatbot.js` | `public/chatbot.js` |

Two edits were made:

1. Imports changed from `@/lib/cors` to `@/lib/chatbot/cors`. The alias
   resolves differently in the two repos — website `@/*` → `./src/*`, tracker
   `@/*` → `./*` — so this had to change even though the string looks similar.
2. `public/chatbot.js` now calls `/api/chatbot`, `/api/chatbot/book`, and
   `/api/chatbot/availability`.

`app/api/chat/route.ts` (the old single-tenant "Alex" bot) is still present and
is now unused. Nothing in the repo references it. Delete it once the new routes
are verified in production.

### Env vars this needs on Vercel

Copy from the website's Vercel project:

```
ANTHROPIC_API_KEY            # tracker already has this
NEXT_PUBLIC_SUPABASE_URL     # tracker already has this
SUPABASE_SERVICE_ROLE_KEY    # tracker already has this
GOOGLE_CLIENT_ID             # booking
GOOGLE_CLIENT_SECRET         # booking
GOOGLE_REDIRECT_URI          # booking
GOOGLE_REFRESH_TOKEN         # booking
AC_API_URL                   # ActiveCampaign
AC_API_KEY
AC_LIST_ID
CIRA_WEBHOOK_URL
NOTIFY_EMAIL
```

Booking uses **OAuth with a refresh token**, while the rest of the tracker uses
a **service account with domain-wide delegation**. Both work; the repo now has
two Google auth methods. Consolidating onto the service account is a sensible
follow-up, not a blocker.

### Before any client site is cut over

The widget's `apiBase` is set per-site in the embed snippet. Until every client
snippet is updated, **keep the website routes live** — deleting them first takes
every installed widget offline. See `CHATBOT_EMBED.md`.

---

## 2. Portal assistant — new

`app/api/portal/assistant/route.ts` + `lib/chatbot/portal-context.ts`.

POST `{ messages: [{ role, content }] }` → `{ reply }`.

### How isolation works

Two independent layers. Either alone should contain a client:

1. **RLS** — every read uses the user-scoped client from `@/lib/supabase/server`,
   never `createServiceClient()`.
2. **Explicit predicates** — every query also filters by `client_id`, or by an
   id set derived from a query that did.

Layer 2 exists because layer 1 can't be verified from code alone. `wo_tasks` and
`wo_schedule` aren't part of the portal UI, so their RLS posture for
`portal_users` is unknown; both are scoped here by `.in('work_order_id', …)`
against the client's own work orders.

`client_id` always comes from the caller's `portal_users` row, never from the
request body.

### What it reads

`clients`, `work_orders`, `wo_tasks`, `wo_schedule`, `social_monthly_mix`.

### What it deliberately does not read

`recurring_services` (owner-only — carries `amount`), `wo_line_items`,
`vendor_invoices`, `wo_comments`, `team_members`, and `est_cost` / `add_cost`
on work orders.

---

## 3. Still to do

### Build the portal UI
The API works; there's no front end. It needs a chat panel in `app/portal/`
that POSTs to `/api/portal/assistant`. Model it on the existing portal
components.

### Verify RLS in Supabase (do this before going live)
Confirm `portal_users` have appropriate policies on:

- `work_orders`, `wo_tasks`, `wo_schedule` — scoped to own `client_id`
- `social_monthly_mix` — see below
- `recurring_services` — portal users should have **no** access

The code does not depend on these being correct, but it should not be the only
thing standing between two clients.

### `social_monthly_mix` needs a `client_id` column
This is the weakest part of the design, and it needs a schema change.

The table is keyed by a free-text `client_name` with no FK to `clients`. A
string match is therefore the only tenant boundary available, which causes two
problems:

1. **Names don't match.** `clients.name` and `social_monthly_mix.client_name`
   diverge in real data — e.g. `MVP Chiro` vs `MVP Chiropractic`, `APEK` vs
   `APEK Inc.`, `Midway Windows & Doors` vs `Midway Windows`, `KBC` vs
   `KBC Exteriors`. For those clients the assistant will find no social plan and
   say so. The code matches on both `name` and `company` to improve the hit
   rate, but that is a workaround.
2. **Duplicate names would leak.** Two clients with the same name string would
   see each other's content calendar.

Proper fix: add `client_id uuid references clients(id)` to
`social_monthly_mix`, backfill it, and switch the query to match on it. Then
add an RLS policy. Needs Adrian's sign-off — it touches the social hub.

### Conversation history is client-supplied
The route is stateless; the browser sends the full message array. A malicious
client could forge `assistant` turns to try to jailbreak the model. The system
prompt addresses this explicitly, but instruction-only defenses are not
absolute. The blast radius is bounded by what's in context — one client's own
data — which is why the scoping above matters more than the prompt does. If
this ever needs to be airtight, persist conversations server-side.

### Rate limiting is per serverless instance
`checkRateLimit` in `lib/chatbot/cors.ts` counts in memory, so under scale-out
the real ceiling is higher than configured. It's a cost guard, not a quota.
The `inbound_rate_limit` table used by `app/api/leads/inbound` is the pattern to
copy if a hard limit is needed.

### Not yet wired
Chatbot leads do not create pipeline leads. `app/api/leads/inbound` already
accepts `source: 'chatbot'`, so the path exists; the widget still posts to the
website's `/api/assessment`.
