// lib/auth/sales.ts
// Shared gate for the sales pipeline surfaces (/pipeline and the leads API).
// Mirrors the public.is_sales_or_owner() SQL helper backing the RLS policy on
// public.leads, so the app layer and the database agree on who has access.
import { createClient } from '@/lib/supabase/server'

export const SALES_ROLES = ['owner', 'sales'] as const

export type SalesAccess = {
  supabase: ReturnType<typeof createClient>
  member: { id: string; name: string | null; role: string; sales_access: boolean } | null
  allowed: boolean
  /**
   * Whether this person may see money — deal values, pipeline and won totals,
   * per-column $/mo. Driven by the explicit sales_access flag rather than role,
   * so granting someone the board does not implicitly reveal financials.
   */
  canSeeFinancials: boolean
  // 'unauthenticated' -> send to /login or 401; 'forbidden' -> 403.
  reason: 'unauthenticated' | 'forbidden' | null
}

export async function checkSalesAccess(): Promise<SalesAccess> {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { supabase, member: null, allowed: false, canSeeFinancials: false, reason: 'unauthenticated' }
  }

  const { data: member } = await supabase
    .from('team_members')
    .select('id, name, role, active, sales_access')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  const salesAccess = member?.sales_access === true

  // Mirrors public.is_sales_or_owner(): owner/sales by role, or anyone flagged
  // with sales_access. Keep the two in step — the RLS policy on leads is the
  // real enforcement, this just avoids serving an empty page.
  const allowed =
    !!member &&
    member.active === true &&
    ((SALES_ROLES as readonly string[]).includes(member.role) || salesAccess)

  return {
    supabase,
    member: member
      ? { id: member.id, name: member.name, role: member.role, sales_access: salesAccess }
      : null,
    allowed,
    canSeeFinancials: allowed && salesAccess,
    reason: allowed ? null : 'forbidden',
  }
}
