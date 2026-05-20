import type { PrintProduct, PrintProductTier } from './types'

/**
 * Get all tiers for a product, sorted by qty ascending.
 */
export function tiersFor(productId: string, tiers: PrintProductTier[]): PrintProductTier[] {
  return tiers
    .filter(t => t.product_id === productId)
    .sort((a, b) => a.qty - b.qty)
}

/**
 * Resolve unit/tier price for a given qty using "tier-up" logic:
 *   - If qty matches a tier exactly → exact match
 *   - If qty falls between tiers → use the next-higher tier price
 *   - If qty is below the smallest tier → use the smallest tier price
 *   - If qty is above the largest tier → use the largest tier price (no extrapolation)
 *
 * Returns the resolved tier and the matching tier-row, so the UI can show
 * a hint like "Auto-priced at 500-tier ($375.70). Type to override."
 *
 * Returns null when the product has no tiers at all.
 */
export function tierPriceFor(
  productId: string,
  qty: number,
  tiers: PrintProductTier[]
): {
  price: number
  tierUsed: PrintProductTier
  exact: boolean
} | null {
  const productTiers = tiersFor(productId, tiers)
  if (productTiers.length === 0) return null
  if (!qty || qty <= 0) {
    // No qty entered yet — show smallest tier as the default reference
    return { price: productTiers[0].price, tierUsed: productTiers[0], exact: false }
  }
  // Exact match
  const exact = productTiers.find(t => t.qty === qty)
  if (exact) return { price: exact.price, tierUsed: exact, exact: true }
  // Below smallest tier → smallest
  if (qty < productTiers[0].qty) {
    return { price: productTiers[0].price, tierUsed: productTiers[0], exact: false }
  }
  // Above largest tier → largest
  const last = productTiers[productTiers.length - 1]
  if (qty > last.qty) {
    return { price: last.price, tierUsed: last, exact: false }
  }
  // In between → tier up (next-higher tier wins)
  const next = productTiers.find(t => t.qty >= qty)!
  return { price: next.price, tierUsed: next, exact: false }
}
