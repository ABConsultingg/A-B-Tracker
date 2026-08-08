import { createClient as createSbClient } from '@supabase/supabase-js'

/**
 * Service-role Supabase client. Bypasses RLS.
 *
 * Use ONLY in server-side contexts that don't have a user session, such as:
 *   - Webhook handlers (Jotform, Stripe, etc.)
 *   - Background jobs / cron
 *
 * Never expose this client to the browser. Never import in a Client Component.
 * Never log the service key.
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars')
  }

  return createSbClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      // supabase-js goes through global fetch, which Next.js patches — so its
      // REST reads can land in the Data Cache. That cache outlives a
      // deployment, so a row read here can be arbitrarily stale: the public
      // review page kept serving a client's pre-update config after the row
      // had changed, and the QR route reported no Place ID when one was set.
      // A cached database read is never what this client wants.
      fetch: (input: RequestInfo | URL, init?: RequestInit) =>
        fetch(input, { ...init, cache: 'no-store' }),
    },
  })
}
