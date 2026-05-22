'use client'
import {
  CAMPAIGN_ITEMS,
  campaignItemCost,
  campaignItemsTotal,
  isPriceOverridden,
  needsQty,
  type CampaignItem,
  type CampaignPick,
} from '@/lib/campaign-items'

type Duration = { value: string; unit: 'days' | 'weeks' | 'months' }

interface Props {
  serviceId: string
  picks: CampaignPick[]
  onChange: (picks: CampaignPick[]) => void
  title: string
  onTitleChange: (s: string) => void
  duration: Duration
  onDurationChange: (d: Duration) => void
}

/**
 * Amber-themed à-la-carte item picker for Storm Response and Marketing Campaign
 * work orders. Only renders inside the New WO modal (v1 — see Session 9 handoff).
 *
 * Layout: stacked rows that work at any width. Each row is two visual lines —
 * (1) checkbox + name + badges + running line total
 * (2) description + price input + qty input + default-note
 *
 * Selected items are saved as wo_line_items rows on WO save.
 */
export default function CampaignBuilderSection(props: Props) {
  const { serviceId, picks, onChange, title, onTitleChange, duration, onDurationChange } = props

  const isMarketing = serviceId === 'ab-marketing-campaign'
  const heading = isMarketing ? '📣 Marketing Campaign Package' : '⛈ Storm Response Package'
  const sub = 'Select channels. Prices default from the rate card and are editable per-line.'

  const pickMap = new Map(picks.map(p => [p.id, p]))
  const total = campaignItemsTotal(picks)

  function togglePick(item: CampaignItem, checked: boolean) {
    if (checked) {
      onChange([...picks, { id: item.id, qty: item.defaultQty }])
    } else {
      onChange(picks.filter(p => p.id !== item.id))
    }
  }

  function updateQty(itemId: string, qty: number) {
    onChange(picks.map(p => p.id === itemId ? { ...p, qty } : p))
  }

  function updateUnitPrice(item: CampaignItem, newPrice: number) {
    const isOverridden = Math.abs(newPrice - item.price) > 0.001
    onChange(picks.map(p => {
      if (p.id !== item.id) return p
      if (isOverridden) return { ...p, unitPrice: newPrice }
      const { unitPrice, ...rest } = p
      return rest
    }))
  }

  function resetAllPrices() {
    onChange(picks.map(p => {
      const { unitPrice, ...rest } = p
      return rest
    }))
  }

  return (
    <div
      className="rounded-lg border p-4 space-y-3"
      style={{
        background: 'linear-gradient(to bottom, rgba(217, 158, 43, 0.06), var(--brand-accent-soft, #fdf6e8))',
        borderColor: 'rgba(217, 158, 43, 0.5)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--brand-accent-2, #b8851e)' }}>
            {heading}
          </div>
          <div className="text-[11px] text-gray-500 mt-0.5">{sub}</div>
        </div>
        <div className="font-mono font-bold text-lg whitespace-nowrap" style={{ color: 'var(--brand-accent-2, #b8851e)' }}>
          ${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
      </div>

      {/* Campaign meta row: title (marketing only) + duration (both) */}
      <div
        className="rounded border p-3 bg-white"
        style={{ borderColor: 'var(--border, #e5e7eb)' }}
      >
        <div className="space-y-3">
          {isMarketing && (
            <div>
              <label className="block text-[11px] font-semibold text-gray-600 uppercase tracking-wide mb-1">
                Campaign Title <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={e => onTitleChange(e.target.value)}
                placeholder="e.g. Spring Promo · Black Friday · Grand Opening Push"
                className="w-full text-sm px-2 py-1.5 border border-gray-300 rounded focus:border-blue-500 focus:outline-none"
              />
            </div>
          )}
          <div>
            <label className="block text-[11px] font-semibold text-gray-600 uppercase tracking-wide mb-1">
              Duration of campaign
            </label>
            <div className="flex gap-2 items-center">
              <input
                type="number"
                min={0}
                step={1}
                value={duration.value}
                onChange={e => onDurationChange({ ...duration, value: e.target.value })}
                placeholder="0"
                className="w-20 text-sm px-2 py-1.5 border border-gray-300 rounded font-mono text-right focus:border-blue-500 focus:outline-none"
              />
              <select
                value={duration.unit}
                onChange={e => onDurationChange({ ...duration, unit: e.target.value as Duration['unit'] })}
                className="text-sm px-2 py-1.5 border border-gray-300 rounded bg-white focus:border-blue-500 focus:outline-none"
              >
                <option value="days">days</option>
                <option value="weeks">weeks</option>
                <option value="months">months</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Item rows — stacked layout */}
      <div className="space-y-2">
        {CAMPAIGN_ITEMS.map(item => {
          const pick = pickMap.get(item.id)
          const isSelected = !!pick
          const qty = pick?.qty ?? item.defaultQty
          const unitPrice = pick?.unitPrice ?? item.price
          const isFree = item.pricing === 'no_charge'
          const showQty = needsQty(item)
          const lineCost = isSelected ? campaignItemCost(item, qty, pick?.unitPrice) : 0
          const overridden = pick && isPriceOverridden(item, pick.unitPrice)

          return (
            <div
              key={item.id}
              className="rounded border bg-white p-3 transition-colors"
              style={{ borderColor: isSelected ? 'rgba(217, 158, 43, 0.5)' : 'var(--border, #e5e7eb)' }}
            >
              {/* Row 1: checkbox + name + badges + line total */}
              <div className="flex items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={e => togglePick(item, e.target.checked)}
                  className="w-4 h-4 cursor-pointer mt-0.5 flex-shrink-0"
                  style={{ accentColor: 'var(--brand-accent, #d99e2b)' }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-sm font-medium text-gray-900">{item.name}</span>
                    {isFree && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-green-100 text-green-700 tracking-wide">N/C</span>
                    )}
                    {overridden && (
                      <span
                        className="text-[9px] font-bold px-1.5 py-0.5 rounded tracking-wide"
                        style={{ background: 'var(--brand-accent, #d99e2b)', color: 'var(--brand-navy, #0f1e3f)' }}
                        title={`Default $${item.price.toLocaleString()}`}
                      >CUSTOM</span>
                    )}
                  </div>
                </div>
                <div
                  className="font-mono font-semibold text-sm whitespace-nowrap flex-shrink-0"
                  style={{ color: isSelected ? 'var(--brand-accent-2, #b8851e)' : 'var(--text-faint, #9ca3af)' }}
                >
                  {isSelected
                    ? `$${lineCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    : '—'
                  }
                </div>
              </div>

              {/* Row 2: description (indented under checkbox) */}
              <div className="pl-7 mt-1">
                <div className="text-[11px] text-gray-500">{item.description}</div>
                <div className="text-[10px] text-gray-400 mt-0.5 italic">Default {item.unitNote}</div>
              </div>

              {/* Row 3: price + qty inputs (indented), only shown for selectable rows */}
              {!isFree && (
                <div className="pl-7 mt-2 flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-1">
                    <span className="text-[11px] text-gray-500">$</span>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={unitPrice}
                      disabled={!isSelected}
                      onChange={e => updateUnitPrice(item, parseFloat(e.target.value) || 0)}
                      title={`Default $${item.price.toLocaleString()}`}
                      className="w-[78px] text-right font-mono px-2 py-1 border border-gray-300 rounded text-xs focus:border-blue-500 focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed"
                      style={{
                        color: overridden ? 'var(--brand-accent-2, #b8851e)' : 'var(--brand-navy, #0f1e3f)',
                        fontWeight: overridden ? 600 : 500,
                      }}
                    />
                    {item.pricing === 'per_unit' && (
                      <span className="text-[10px] text-gray-500">/ea</span>
                    )}
                    {item.pricing === 'monthly' && (
                      <span className="text-[10px] text-gray-500">/mo</span>
                    )}
                  </div>

                  {showQty && (
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-gray-500 uppercase tracking-wide font-semibold">Qty</span>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={qty}
                        disabled={!isSelected}
                        onChange={e => updateQty(item.id, parseInt(e.target.value) || 0)}
                        className="w-16 text-right font-mono px-2 py-1 border border-gray-300 rounded text-xs focus:border-blue-500 focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed"
                      />
                      <span className="text-[10px] text-gray-500">{item.unitLabel}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Reset link */}
      <div className="text-right">
        <button
          type="button"
          onClick={resetAllPrices}
          className="text-[11px] text-gray-500 hover:text-gray-700 underline"
        >
          Reset all prices to defaults
        </button>
      </div>
    </div>
  )
}
