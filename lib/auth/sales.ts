// lib/auth/sales.ts
// Shared gate for the sales pipeline surfaces (/pipeline and the leads API).
// Mirrors the public.is_sales_or_owner() SQL helper backing the RLS policy on
// public.leads, so the app layer and the database agree on who has access.
import { createClient } from '@/lib/supabase/server'

export const SALES_ROLES = ['owner', 'sales'] as const

export type SalesAccess = {
  supabase: ReturnType<typeof createClient>
  member: { id: string; name: string | null; role: string } | null
  allowed: boolean
  // 'unauthenticated' -> send to /login or 401; 'forbidden' -> 403.
  reason: 'unauthenticated' | 'forbidden' | null
}

export async function checkSalesAccess(): Promise<SalesAccess> {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase, member: null, allowed: false, reason: 'unauthenticated' }

  const { data: member } = await supabase
    .from('team_members')
    .select('id, name, role, active')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  const allowed =
    !!member && member.active === true && (SALES_ROLES as readonly string[]).includes(member.role)

  return {
    supabase,
    member: member ? { id: member.id, name: member.name, role: member.role } : null,
    allowed,
    reason: allowed ? null : 'forbidden',
  }
}
