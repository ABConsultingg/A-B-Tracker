'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { WoLineItem, PrintProduct, PrintProductTier } from '@/lib/types'
import { tiersFor, tierPriceFor } from '@/lib/print-pricing'

type Vendor = 'misc' | 'print'

type Draft = {
  vendor: Vendor
  description: string       // free-text in misc mode, ignored in print mode (we use printProductId)
  printProductId: string    // empty unless vendor === 'print'
  qty: number
  unit_price: number
  unitOverridden: boolean   // true once the user manually edited unit_price away from auto-fill
}

const EMPTY_DRAFT: Draft = {
  vendor: 'misc',
  description: '',
  printProductId: '',
  qty: 1,
  unit_price: 0,
  unitOverridden: false,
}

export default function WoLineItemsSection({
  workOrderId,
  onTotalChange,
  printProducts = [],
  printProductTiers = [],
}: {
  workOrderId: string
  /** Called whenever the sum of line item totals changes. Lets the parent
   *  show an up-to-date grand total without re-fetching. */
  onTotalChange?: (sum: number) => void
  /** Active print products (Accurate Printing catalog). Used by the Add row's
   *  Printing mode for description picker + tier-based auto-pricing. */
  printProducts?: PrintProduct[]
  /** All print product tiers. Indexed by product_id at lookup time. */
  printProductTiers?: PrintProductTier[]
}) {
  const supabase = createClient()
  const [items, setItems] = useState<WoLineItem[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)

  // Only show active products in the picker
  const activePrintProducts = useMemo(
    () => printProducts.filter(p => p.active),
    [printProducts]
  )

  // Load on mount + whenever WO changes
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    supabase
      .from('wo_line_items')
      .select('*')
      .eq('work_order_id', workOrderId)
      .order('sort_order', { ascending: true })
      .then(({ data }) => {
        if (cancelled) return
        setItems((data || []) as WoLineItem[])
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [workOrderId, supabase])

  // Bubble total up whenever items change
  const subtotal = useMemo(
    () => items.reduce((sum, i) => sum + (Number(i.total) || 0), 0),
    [items]
  )
  useEffect(() => {
    onTotalChange?.(subtotal)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subtotal])

  // ── Print mode helpers ─────────────────────────────────────────────
  const printResolved = useMemo(() => {
    if (draft.vendor !== 'print' || !draft.printProductId) return null
    return tierPriceFor(draft.printProductId, draft.qty || 0, printProductTiers)
  }, [draft.vendor, draft.printProductId, draft.qty, printProductTiers])

  const printQtyHint = useMemo(() => {
    if (draft.vendor !== 'print' || !draft.printProductId) return ''
    const t = tiersFor(draft.printProductId, printProductTiers)
    if (t.length === 0) return 'No tiers configured for this product'
    return 'Available qtys: ' + t.map(x => x.qty).join(', ')
  }, [draft.vendor, draft.printProductId, printProductTiers])

  // Auto-fill unit_price when print mode resolves a tier, unless user
  // manually overrode it. Cleared on product change.
  useEffect(() => {
    if (draft.vendor !== 'print') return
    if (draft.unitOverridden) return
    if (!printResolved) return
    // unit price = tier price / tier qty (per-unit cost)
    const unit = printResolved.tierUsed.qty > 0
      ? printResolved.price / printResolved.tierUsed.qty
      : 0
    if (Math.abs(unit - draft.unit_price) > 0.0001) {
      setDraft(d => ({ ...d, unit_price: Number(unit.toFixed(4)) }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [printResolved, draft.vendor, draft.unitOverridden])

  function switchVendor(v: Vendor) {
    if (v === draft.vendor) return
    setDraft({ ...EMPTY_DRAFT, vendor: v })
  }

  // ── Mutations ──────────────────────────────────────────────────────
  async function addLineItem() {
    let desc = ''
    if (draft.vendor === 'misc') {
      desc = draft.description.trim()
      if (!desc) return
    } else {
      const product = activePrintProducts.find(p => p.id === draft.printProductId)
      if (!product) { alert('Pick a print product first'); return }
      desc = product.name
      if (product.spec) desc += ` — ${product.spec}`
    }
    setAdding(true)
    const nextSort = items.length > 0 ? Math.max(...items.map(i => i.sort_order)) + 1 : 0
    const { data, error } = await supabase
      .from('wo_line_items')
      .insert({
        work_order_id: workOrderId,
        description: desc,
        qty: draft.qty || 1,
        unit_price: draft.unit_price || 0,
        sort_order: nextSort,
      })
      .select()
      .single()
    setAdding(false)
    if (error) {
      alert('Failed to add line item: ' + error.message)
      return
    }
    setItems(prev => [...prev, data as WoLineItem])
    // Reset draft, default back to misc mode
    setDraft(EMPTY_DRAFT)
  }

  async function patchLineItem(id: string, patch: Partial<Pick<WoLineItem, 'description' | 'qty' | 'unit_price'>>) {
    // Optimistic update. The `total` column is generated server-side from
    // qty * unit_price, so we mirror that math locally for instant feedback.
    setItems(prev =>
      prev.map(i => {
        if (i.id !== id) return i
        const nextQty = patch.qty != null ? patch.qty : i.qty
        const nextUnit = patch.unit_price != null ? patch.unit_price : i.unit_price
        return {
          ...i,
          ...patch,
          total: (nextQty || 0) * (nextUnit || 0),
        }
      })
    )
    const { error } = await supabase.from('wo_line_items').update(patch).eq('id', id)
    if (error) {
      alert('Failed to update line item: ' + error.message)
      // Reload to recover
      const { data } = await supabase
        .from('wo_line_items')
        .select('*')
        .eq('work_order_id', workOrderId)
        .order('sort_order', { ascending: true })
      setItems((data || []) as WoLineItem[])
    }
  }

  async function deleteLineItem(id: string) {
    if (!confirm('Delete this line item?')) return
    setItems(prev => prev.filter(i => i.id !== id))
    const { error } = await supabase.from('wo_line_items').delete().eq('id', id)
    if (error) alert('Failed to delete line item: ' + error.message)
  }

  if (loading) {
    return (
      <div className="text-xs text-gray-400 italic">Loading line items…</div>
    )
  }

  const canAdd =
    draft.vendor === 'misc'
      ? !!draft.description.trim()
      : !!draft.printProductId

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
          Line Items {items.length > 0 && (
            <span className="ml-1 normal-case text-gray-400 font-normal">({items.length})</span>
          )}
        </div>
        {subtotal > 0 && (
          <div className="text-xs font-mono tabular-nums text-gray-600">
            Subtotal <span className="font-semibold text-gray-900">${subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
        )}
      </div>

      {items.length === 0 && (
        <div className="text-xs text-gray-400 italic px-1 py-1">
          No line items yet. Add print orders or miscellaneous items below.
        </div>
      )}

      {items.length > 0 && (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          {/* Header row */}
          <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-gray-50 border-b border-gray-200 text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
            <div className="col-span-6">Description</div>
            <div className="col-span-1 text-right">Qty</div>
            <div className="col-span-2 text-right">Unit $</div>
            <div className="col-span-2 text-right">Total</div>
            <div className="col-span-1"></div>
          </div>
          {/* Data rows */}
          <div className="divide-y divide-gray-100">
            {items.map(item => (
              <LineItemRow
                key={item.id}
                item={item}
                onPatch={patch => patchLineItem(item.id, patch)}
                onDelete={() => deleteLineItem(item.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Add new line item */}
      <div className="space-y-2 pt-2">
        {/* Vendor toggle */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mr-1">
            + Add line item:
          </span>
          <div className="inline-flex rounded-md border border-gray-200 overflow-hidden" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={draft.vendor === 'misc'}
              onClick={() => switchVendor('misc')}
              className="px-2.5 py-1 text-xs font-semibold transition-colors"
              style={
                draft.vendor === 'misc'
                  ? { background: '#1a2b4a', color: 'white' }
                  : { background: 'white', color: '#374151' }
              }
            >
              Miscellaneous
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={draft.vendor === 'print'}
              onClick={() => switchVendor('print')}
              className="px-2.5 py-1 text-xs font-semibold transition-colors border-l border-gray-200"
              style={
                draft.vendor === 'print'
                  ? { background: '#1a2b4a', color: 'white' }
                  : { background: 'white', color: '#374151' }
              }
            >
              🖨 Pull from Print
            </button>
          </div>
        </div>

        {/* Input row — different shape per vendor */}
        {draft.vendor === 'misc' ? (
          <div className="grid grid-cols-12 gap-2 items-center">
            <input
              type="text"
              value={draft.description}
              onChange={e => setDraft({ ...draft, description: e.target.value })}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addLineItem() } }}
              placeholder="Description (e.g. mailer batch, vendor cost, custom item)"
              className="col-span-6 text-sm px-2 py-1.5 border border-dashed border-gray-300 rounded focus:border-blue-500 focus:border-solid focus:outline-none"
            />
            <input
              type="number"
              value={draft.qty || ''}
              onChange={e => setDraft({ ...draft, qty: parseFloat(e.target.value) || 0 })}
              placeholder="1"
              className="col-span-1 text-sm px-2 py-1.5 border border-gray-200 rounded font-mono text-right focus:border-blue-500 focus:outline-none"
              step="any"
              min="0"
            />
            <div className="col-span-2 relative">
              <span className="absolute left-2 top-1.5 text-xs text-gray-400">$</span>
              <input
                type="number"
                value={draft.unit_price || ''}
                onChange={e => setDraft({ ...draft, unit_price: parseFloat(e.target.value) || 0 })}
                placeholder="0.00"
                className="w-full text-sm pl-5 pr-2 py-1.5 border border-gray-200 rounded font-mono text-right focus:border-blue-500 focus:outline-none"
                step="any"
                min="0"
              />
            </div>
            <div className="col-span-2 text-right text-sm font-mono tabular-nums text-gray-500">
              ${((draft.qty || 0) * (draft.unit_price || 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="col-span-1 text-right">
              {canAdd && (
                <button
                  onClick={addLineItem}
                  disabled={adding}
                  className="px-2 py-1 rounded text-[11px] font-semibold text-white disabled:opacity-40"
                  style={{ background: '#1a2b4a' }}
                  title="Add line item"
                >
                  {adding ? '…' : 'Add'}
                </button>
              )}
            </div>
          </div>
        ) : (
          // Print mode
          <div className="space-y-1">
            <div className="grid grid-cols-12 gap-2 items-center">
              <select
                value={draft.printProductId}
                onChange={e => setDraft({ ...draft, printProductId: e.target.value, unitOverridden: false, unit_price: 0 })}
                className="col-span-6 text-sm px-2 py-1.5 border border-dashed border-gray-300 rounded focus:border-blue-500 focus:border-solid focus:outline-none bg-white"
              >
                <option value="">— Pick a print product —</option>
                {activePrintProducts.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name}{p.spec ? ` — ${p.spec}` : ''}
                  </option>
                ))}
              </select>
              <input
                type="number"
                value={draft.qty || ''}
                onChange={e => setDraft({ ...draft, qty: parseFloat(e.target.value) || 0, unitOverridden: false })}
                placeholder="1"
                className="col-span-1 text-sm px-2 py-1.5 border border-gray-200 rounded font-mono text-right focus:border-blue-500 focus:outline-none"
                step="1"
                min="0"
              />
              <div className="col-span-2 relative">
                <span className="absolute left-2 top-1.5 text-xs text-gray-400">$</span>
                <input
                  type="number"
                  value={draft.unit_price || ''}
                  onChange={e => setDraft({ ...draft, unit_price: parseFloat(e.target.value) || 0, unitOverridden: true })}
                  placeholder="0.00"
                  className="w-full text-sm pl-5 pr-2 py-1.5 border border-gray-200 rounded font-mono text-right focus:border-blue-500 focus:outline-none"
                  step="any"
                  min="0"
                />
              </div>
              <div className="col-span-2 text-right text-sm font-mono tabular-nums text-gray-500">
                ${((draft.qty || 0) * (draft.unit_price || 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="col-span-1 text-right">
                {canAdd && (
                  <button
                    onClick={addLineItem}
                    disabled={adding}
                    className="px-2 py-1 rounded text-[11px] font-semibold text-white disabled:opacity-40"
                    style={{ background: '#1a2b4a' }}
                    title="Add line item"
                  >
                    {adding ? '…' : 'Add'}
                  </button>
                )}
              </div>
            </div>
            {/* Print mode hints */}
            {draft.printProductId && (
              <div className="text-[11px] text-gray-500 px-1 flex items-center gap-2 flex-wrap">
                <span>{printQtyHint}</span>
                {printResolved && (
                  <span
                    className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded"
                    style={{
                      background: draft.unitOverridden ? '#f3f4f6' : 'var(--brand-accent-soft, #fdf6e8)',
                      color: draft.unitOverridden ? '#6b7280' : 'var(--brand-accent-2, #b8851e)',
                    }}
                  >
                    {draft.unitOverridden
                      ? 'Manual price'
                      : printResolved.exact
                        ? `Auto-priced at ${printResolved.tierUsed.qty}-tier ($${printResolved.price.toFixed(2)})`
                        : `Tier-up: using ${printResolved.tierUsed.qty}-tier ($${printResolved.price.toFixed(2)})`}
                  </span>
                )}
              </div>
            )}
            {activePrintProducts.length === 0 && (
              <div className="text-[11px] text-amber-700 italic px-1">
                No active print products. Add some in <span className="font-mono">Print Pricing</span> first.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function LineItemRow({
  item,
  onPatch,
  onDelete,
}: {
  item: WoLineItem
  onPatch: (patch: Partial<Pick<WoLineItem, 'description' | 'qty' | 'unit_price'>>) => void
  onDelete: () => void
}) {
  return (
    <div className="grid grid-cols-12 gap-2 px-3 py-2 items-center hover:bg-gray-50/60 transition-colors">
      <input
        type="text"
        defaultValue={item.description}
        onBlur={e => {
          const v = e.target.value.trim()
          if (v && v !== item.description) onPatch({ description: v })
          else if (!v) e.target.value = item.description
        }}
        className="col-span-6 text-sm bg-transparent border-0 px-1 py-0.5 focus:outline-none focus:bg-white focus:border focus:border-blue-500 focus:rounded"
      />
      <input
        type="number"
        defaultValue={item.qty}
        onBlur={e => {
          const v = parseFloat(e.target.value)
          if (!isNaN(v) && v !== item.qty) onPatch({ qty: v })
        }}
        className="col-span-1 text-sm bg-transparent border-0 px-1 py-0.5 font-mono tabular-nums text-right focus:outline-none focus:bg-white focus:border focus:border-blue-500 focus:rounded"
        step="any"
        min="0"
      />
      <div className="col-span-2 relative">
        <span className="absolute left-1 top-0.5 text-xs text-gray-400">$</span>
        <input
          type="number"
          defaultValue={item.unit_price}
          onBlur={e => {
            const v = parseFloat(e.target.value)
            if (!isNaN(v) && v !== item.unit_price) onPatch({ unit_price: v })
          }}
          className="w-full text-sm bg-transparent border-0 pl-4 pr-1 py-0.5 font-mono tabular-nums text-right focus:outline-none focus:bg-white focus:border focus:border-blue-500 focus:rounded"
          step="any"
          min="0"
        />
      </div>
      <div className="col-span-2 text-right text-sm font-mono tabular-nums font-semibold text-gray-900">
        ${(Number(item.total) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </div>
      <div className="col-span-1 text-right">
        <button
          onClick={onDelete}
          className="text-gray-300 hover:text-red-500 text-sm leading-none px-1"
          title="Delete line item"
        >
          ×
        </button>
      </div>
    </div>
  )
}
