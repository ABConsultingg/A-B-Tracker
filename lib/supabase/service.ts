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
  })
}
