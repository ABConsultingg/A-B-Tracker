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
 * Selected items are saved as wo_line_items rows on WO save. This component
 * is purely UI — the parent owns the state.
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
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--brand-accent-2, #b8851e)' }}>
            {heading}
          </div>
          <div className="text-[11px] text-gray-500 mt-0.5">{sub}</div>
        </div>
        <div className="font-mono font-bold text-lg" style={{ color: 'var(--brand-accent-2, #b8851e)' }}>
          ${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
      </div>

      {/* Campaign meta row: title (marketing only) + duration (both) */}
      <div
        className="rounded border p-3 bg-white"
        style={{ borderColor: 'var(--border, #e5e7eb)' }}
      >
        <div className={`grid gap-3 items-end ${isMarketing ? 'grid-cols-[1fr_200px]' : 'grid-cols-1'}`}>
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
                className="w-16 text-sm px-2 py-1.5 border border-gray-300 rounded font-mono text-right focus:border-blue-500 focus:outline-none"
              />
              <select
                value={duration.unit}
                onChange={e => onDurationChange({ ...duration, unit: e.target.value as Duration['unit'] })}
                className="flex-1 text-sm px-2 py-1.5 border border-gray-300 rounded bg-white focus:border-blue-500 focus:outline-none"
              >
                <option value="days">days</option>
                <option value="weeks">weeks</option>
                <option value="months">months</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Item rows */}
      <div className="space-y-1.5">
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
              className="grid grid-cols-[24px_1fr_110px_110px_90px] gap-2.5 items-center p-2.5 rounded border bg-white"
              style={{ borderColor: isSelected ? 'rgba(217, 158, 43, 0.5)' : 'var(--border, #e5e7eb)' }}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={e => togglePick(item, e.target.checked)}
                className="w-4 h-4 cursor-pointer"
                style={{ accentColor: 'var(--brand-accent, #d99e2b)' }}
              />

              <div className="min-w-0">
                <div className="text-sm font-medium text-gray-900 flex items-center gap-1.5 flex-wrap">
                  <span>{item.name}</span>
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
                <div className="text-[11px] text-gray-500 mt-0.5">{item.description}</div>
                <div className="text-[10px] text-gray-400 mt-0.5 italic">Default {item.unitNote}</div>
              </div>

              <div className="text-center">
                {isFree ? (
                  <span className="text-[11px] text-green-600 font-semibold">N/C</span>
                ) : (
                  <div className="flex items-center gap-1 justify-end">
                    <span className="text-[11px] text-gray-500">$</span>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={unitPrice}
                      disabled={!isSelected}
                      onChange={e => updateUnitPrice(item, parseFloat(e.target.value) || 0)}
                      title={`Default $${item.price.toLocaleString()}`}
                      className="w-[72px] text-right font-mono px-1.5 py-1 border border-gray-300 rounded text-xs focus:border-blue-500 focus:outline-none disabled:opacity-40"
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
                )}
              </div>

              <div className="text-center">
                {showQty ? (
                  <div className="flex items-center gap-1 justify-center">
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={qty}
                      disabled={!isSelected}
                      onChange={e => updateQty(item.id, parseInt(e.target.value) || 0)}
                      className="w-14 text-right font-mono px-1.5 py-1 border border-gray-300 rounded text-xs focus:border-blue-500 focus:outline-none disabled:opacity-40"
                    />
                    <span className="text-[10px] text-gray-500">{item.unitLabel}</span>
                  </div>
                ) : (
                  <span className="text-[11px] text-gray-400">—</span>
                )}
              </div>

              <div
                className="text-right font-mono font-semibold text-sm"
                style={{ color: isSelected ? 'var(--brand-accent-2, #b8851e)' : 'var(--text-faint, #9ca3af)' }}
              >
                {isSelected
                  ? `$${lineCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  : '—'
                }
              </div>
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
