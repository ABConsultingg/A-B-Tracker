/**
 * Campaign builder catalog + helpers.
 *
 * When a work order's service is Storm Response or Marketing Campaign,
 * the user picks à-la-carte items from CAMPAIGN_ITEMS. Picked items are
 * saved as rows in `wo_line_items` on WO save. See Session 9 handoff.
 *
 * v1: catalog is hardcoded. v2 may move to a DB table with an admin page.
 */

/** Services that trigger the campaign builder UI. */
export const CAMPAIGN_SERVICE_IDS = ['ab-storm-response', 'ab-marketing-campaign'] as const
export type CampaignServiceId = typeof CAMPAIGN_SERVICE_IDS[number]

/**
 * Pricing model for a campaign item:
 *  - flat:       fixed price; qty is fixed at 1
 *  - per_unit:   price × qty (e.g. mailers @ $1.25 each)
 *  - monthly:    price × months
 *  - no_charge:  included free
 */
export type CampaignItemPricing = 'flat' | 'per_unit' | 'monthly' | 'no_charge'

export interface CampaignItem {
  id: string
  name: string
  description: string
  pricing: CampaignItemPricing
  /** Default unit price. Editable per-line in the UI. */
  price: number
  /** Default quantity. Required for per_unit / monthly. Defaults to 1 otherwise. */
  defaultQty: number
  /** Short label for the qty unit (e.g. "mailers", "months"). Omit for flat / no_charge. */
  unitLabel?: string
  /** Human-readable default pricing note shown under the item name. */
  unitNote: string
}

/**
 * A user's selection for one item on one work order.
 * Stored as state in the modal; flattened to wo_line_items rows on save.
 */
export interface CampaignPick {
  id: string
  qty: number
  /** Only present when the user overrode the default unit price. */
  unitPrice?: number
}

/**
 * The shared catalog used by both Storm Response and Marketing Campaign.
 * The prototype reuses one menu for both services; we match that.
 */
export const CAMPAIGN_ITEMS: CampaignItem[] = [
  {
    id: 'storm-email-blasts',
    name: '3 bi-weekly email blasts',
    description: 'Email sent to branch list (unlimited email addresses)',
    pricing: 'flat',
    price: 600,
    defaultQty: 1,
    unitNote: '$200 per email × 3 emails',
  },
  {
    id: 'storm-mailer',
    name: 'Direct Mailer',
    description: 'Flyer / self-mailer sent to branch list',
    pricing: 'per_unit',
    price: 1.25,
    defaultQty: 250,
    unitLabel: 'mailers',
    unitNote: '$1.25 per mailer',
  },
  {
    id: 'storm-social-fb',
    name: 'Social Media Post (branch FB page)',
    description: 'Social media post added to the branch FB page',
    pricing: 'no_charge',
    price: 0,
    defaultQty: 1,
    unitNote: 'No charge',
  },
  {
    id: 'storm-social-no-fb',
    name: 'Social Media Post (no branch FB page)',
    description: 'Posted on Corporate page, targeted to the branch',
    pricing: 'monthly',
    price: 50,
    defaultQty: 1,
    unitLabel: 'months',
    unitNote: '$50 per month',
  },
  {
    id: 'storm-social-ad',
    name: '30-day Social Media Ad',
    description: 'Social ad targeted to 50 miles around the branch',
    pricing: 'monthly',
    price: 600,
    defaultQty: 1,
    unitLabel: 'months',
    unitNote: '$600 per month',
  },
  {
    id: 'storm-google-ad',
    name: 'Google Ad — Search',
    description: 'Google search campaign for suppliers within 50 miles',
    pricing: 'monthly',
    price: 600,
    defaultQty: 1,
    unitLabel: 'months',
    unitNote: '$600 per month',
  },
]

/** True if the service triggers the campaign builder. */
export function isCampaignService(serviceId: string | null | undefined): boolean {
  if (!serviceId) return false
  return (CAMPAIGN_SERVICE_IDS as readonly string[]).includes(serviceId)
}

/** Lookup helper. */
export function campaignItemById(id: string): CampaignItem | undefined {
  return CAMPAIGN_ITEMS.find(i => i.id === id)
}

/**
 * Cost of one picked item given a qty and optional unit-price override.
 * Pure function — no state, no rounding (caller decides).
 */
export function campaignItemCost(
  item: CampaignItem | undefined,
  qty: number,
  unitPrice?: number
): number {
  if (!item) return 0
  if (item.pricing === 'no_charge') return 0
  const p = (typeof unitPrice === 'number' && !isNaN(unitPrice)) ? unitPrice : item.price
  if (item.pricing === 'flat')     return p
  if (item.pricing === 'per_unit') return p * (qty || 0)
  if (item.pricing === 'monthly')  return p * (qty || 0)
  return 0
}

/** Sum of all picked items. */
export function campaignItemsTotal(picks: CampaignPick[]): number {
  if (!picks || !picks.length) return 0
  return picks.reduce((sum, p) => {
    const item = campaignItemById(p.id)
    return sum + campaignItemCost(item, p.qty, p.unitPrice)
  }, 0)
}

/** True if the user has changed the unit price from the default. */
export function isPriceOverridden(item: CampaignItem, unitPrice: number | undefined): boolean {
  if (typeof unitPrice !== 'number' || isNaN(unitPrice)) return false
  return Math.abs(unitPrice - item.price) > 0.001
}

/** True if this item type needs a qty input rendered. */
export function needsQty(item: CampaignItem): boolean {
  return item.pricing === 'per_unit' || item.pricing === 'monthly'
}
