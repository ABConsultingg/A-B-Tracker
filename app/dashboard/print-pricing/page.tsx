import { redirect } from 'next/navigation'

export default function PrintPricingRedirect() {
  redirect('/dashboard/services?tab=print-pricing')
}
