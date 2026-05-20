'use client'
import { useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { PrintProduct, PrintProductTier } from '@/lib/types'
import { tiersFor } from '@/lib/print-pricing'

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

export default function PrintPricingClient({
  products: initialProducts,
  tiers: initialTiers,
  currentMember,
}: {
  products: PrintProduct[]
  tiers: PrintProductTier[]
  currentMember?: { id: string; role: string } | null
}) {
  const supabase = createClient()
  const isAdmin = currentMember?.role === 'admin'

  const [products, setProducts] = useState<PrintProduct[]>(initialProducts)
  const [tiers, setTiers] = useState<PrintProductTier[]>(initialTiers)
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(initialProducts.map(p => p.id)))
  const [addingTierFor, setAddingTierFor] = useState<string | null>(null)
  const [newTierQty, setNewTierQty] = useState<string>('')
  const [newTierPrice, setNewTierPrice] = useState<string>('')
  const [showNewProduct, setShowNewProduct] = useState(false)
  const [newProductDraft, setNewProductDraft] = useState({ name: '', spec: '', vendor: 'Accurate Printing' })
  const [busy, setBusy] = useState(false)

  const filteredProducts = useMemo(() => {
    if (!search.trim()) return products
    const q = search.toLowerCase()
    return products.filter(
      p =>
        p.name.toLowerCase().includes(q) ||
        (p.spec || '').toLowerCase().includes(q) ||
        (p.vendor || '').toLowerCase().includes(q)
    )
  }, [products, search])

  function toggleExpanded(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // ── Product mutations ──────────────────────────────────────────────
  async function patchProduct(id: string, patch: Partial<PrintProduct>) {
    if (!isAdmin) return
    const prev = products
    setProducts(curr => curr.map(p => (p.id === id ? { ...p, ...patch } as PrintProduct : p)))
    const { error } = await supabase.from('print_products').update(patch).eq('id', id)
    if (error) {
      setProducts(prev)
      alert('Save failed: ' + error.message)
    }
  }

  async function createProduct() {
    if (!isAdmin) return
    const name = newProductDraft.name.trim()
    if (!name) { alert('Product name is required.'); return }
    let id = slugify(name)
    if (!id) { alert('Product name must contain at least one letter or number.'); return }
    if (products.some(p => p.id === id)) {
      id = id + '-' + Math.random().toString(36).slice(2, 6)
    }
    setBusy(true)
    const payload = {
      id,
      name,
      spec: newProductDraft.spec.trim() || null,
      vendor: newProductDraft.vendor.trim() || 'Accurate Printing',
      active: true,
      sort_order: products.length + 100,
    }
    const { data, error } = await supabase
      .from('print_products')
      .insert(payload)
      .select()
      .single()
    setBusy(false)
    if (error) { alert('Failed to create product: ' + error.message); return }
    setProducts(prev => [...prev, data as PrintProduct])
    setExpanded(prev => new Set([...prev, (data as PrintProduct).id]))
    setNewProductDraft({ name: '', spec: '', vendor: 'Accurate Printing' })
    setShowNewProduct(false)
  }

  async function deleteProduct(id: string) {
    if (!isAdmin) return
    const p = products.find(x => x.id === id)
    if (!p) return
    const tierCount = tiersFor(id, tiers).length
    const msg = tierCount > 0
      ? `Delete "${p.name}" and its ${tierCount} tier(s) permanently? Past work orders that referenced this product keep their stored prices, but this product won't appear in new line items.`
      : `Delete "${p.name}" permanently?`
    if (!confirm(msg)) return
    setBusy(true)
    // Tiers cascade-delete via FK, so just delete the product
    const { error } = await supabase.from('print_products').delete().eq('id', id)
    setBusy(false)
    if (error) { alert('Failed to delete: ' + error.message); return }
    setProducts(prev => prev.filter(p => p.id !== id))
    setTiers(prev => prev.filter(t => t.product_id !== id))
  }

  // ── Tier mutations ─────────────────────────────────────────────────
  async function patchTier(id: string, patch: Partial<PrintProductTier>) {
    if (!isAdmin) return
    const prev = tiers
    setTiers(curr => curr.map(t => (t.id === id ? { ...t, ...patch } as PrintProductTier : t)))
    const { error } = await supabase.from('print_product_tiers').update(patch).eq('id', id)
    if (error) {
      setTiers(prev)
      alert('Save failed: ' + error.message)
    }
  }

  async function addTier(productId: string) {
    if (!isAdmin) return
    const qty = parseInt(newTierQty)
    const price = parseFloat(newTierPrice)
    if (isNaN(qty) || qty <= 0) { alert('Qty must be a positive integer'); return }
    if (isNaN(price) || price < 0) { alert('Price must be a non-negative number'); return }
    // Unique constraint on (product_id, qty) — check locally before insert
    if (tiers.some(t => t.product_id === productId && t.qty === qty)) {
      alert(`A tier for qty ${qty} already exists for this product`)
      return
    }
    setBusy(true)
    const productTiers = tiersFor(productId, tiers)
    const nextSort = productTiers.length > 0 ? Math.max(...productTiers.map(t => t.sort_order)) + 1 : 0
    const { data, error } = await supabase
      .from('print_product_tiers')
      .insert({ product_id: productId, qty, price, sort_order: nextSort })
      .select()
      .single()
    setBusy(false)
    if (error) { alert('Failed to add tier: ' + error.message); return }
    setTiers(prev => [...prev, data as PrintProductTier])
    setNewTierQty('')
    setNewTierPrice('')
    setAddingTierFor(null)
  }

  async function deleteTier(id: string) {
    if (!isAdmin) return
    if (!confirm('Delete this tier?')) return
    const prev = tiers
    setTiers(curr => curr.filter(t => t.id !== id))
    const { error } = await supabase.from('print_product_tiers').delete().eq('id', id)
    if (error) {
      setTiers(prev)
      alert('Failed to delete: ' + error.message)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Print Pricing</h1>
          <p className="text-sm text-gray-500 mt-1">
            {isAdmin
              ? 'Manage Accurate Printing tier pricing. Used by the line items vendor picker on work orders.'
              : 'Print product pricing reference. Tier prices apply to line items on work orders.'}
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowNewProduct(true)}
            className="px-3 md:px-4 py-2 rounded-md text-sm font-semibold transition-all flex items-center gap-1.5 flex-shrink-0"
            style={{ background: 'var(--brand-accent, #d99e2b)', color: 'var(--brand-navy, #1a2b4a)' }}
          >
            <span className="text-base">+</span> <span className="hidden sm:inline">New product</span><span className="sm:hidden">New</span>
          </button>
        )}
      </div>

      <div className="mb-4 flex flex-wrap gap-2 items-center">
        <input
          type="text"
          placeholder="🔍 Search products..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 min-w-[200px] max-w-md px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <div className="text-xs text-gray-500 font-mono ml-auto">
          {filteredProducts.length} of {products.length}
        </div>
      </div>

      {/* New product form */}
      {showNewProduct && isAdmin && (
        <div className="mb-4 bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-3">
          <div className="text-sm font-semibold text-amber-900">New print product</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Name *</label>
              <input
                type="text"
                value={newProductDraft.name}
                onChange={e => setNewProductDraft({ ...newProductDraft, name: e.target.value })}
                placeholder="e.g. Postcards"
                className="w-full text-sm px-2 py-1.5 border border-gray-200 rounded focus:border-blue-500 focus:outline-none bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Spec</label>
              <input
                type="text"
                value={newProductDraft.spec}
                onChange={e => setNewProductDraft({ ...newProductDraft, spec: e.target.value })}
                placeholder='e.g. 4x6&quot; | 4/4 | 14pt'
                className="w-full text-sm px-2 py-1.5 border border-gray-200 rounded focus:border-blue-500 focus:outline-none bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Vendor</label>
              <input
                type="text"
                value={newProductDraft.vendor}
                onChange={e => setNewProductDraft({ ...newProductDraft, vendor: e.target.value })}
                className="w-full text-sm px-2 py-1.5 border border-gray-200 rounded focus:border-blue-500 focus:outline-none bg-white"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={createProduct}
              disabled={busy || !newProductDraft.name.trim()}
              className="px-3 py-1.5 rounded font-semibold text-xs text-white disabled:opacity-50"
              style={{ background: '#1a2b4a' }}
            >
              {busy ? 'Creating…' : 'Create product'}
            </button>
            <button
              onClick={() => { setShowNewProduct(false); setNewProductDraft({ name: '', spec: '', vendor: 'Accurate Printing' }) }}
              className="px-3 py-1.5 rounded text-xs text-gray-600 hover:bg-amber-100"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Product list */}
      <div className="space-y-3">
        {filteredProducts.length === 0 && (
          <div className="text-center text-gray-400 py-12 text-sm bg-white border border-gray-200 rounded-lg">
            No products match your search.
          </div>
        )}

        {filteredProducts.map(product => {
          const productTiers = tiersFor(product.id, tiers)
          const isOpen = expanded.has(product.id)
          return (
            <div key={product.id} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              {/* Product header */}
              <div
                className={`px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-gray-50 transition-colors ${
                  !product.active ? 'opacity-60' : ''
                }`}
                onClick={() => toggleExpanded(product.id)}
              >
                <span className="text-gray-400 text-xs w-3 text-center">{isOpen ? '▾' : '▸'}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="font-semibold text-gray-900 text-sm">{product.name}</div>
                    {!product.active && (
                      <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-gray-200 text-gray-600">
                        Inactive
                      </span>
                    )}
                    <span className="text-[10px] uppercase font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                      {product.vendor || 'Accurate Printing'}
                    </span>
                  </div>
                  {product.spec && (
                    <div className="text-xs text-gray-500 mt-0.5">{product.spec}</div>
                  )}
                </div>
                <div className="text-xs text-gray-400 font-mono whitespace-nowrap">
                  {productTiers.length} tier{productTiers.length === 1 ? '' : 's'}
                </div>
              </div>

              {/* Tiers (when expanded) */}
              {isOpen && (
                <div className="border-t border-gray-100 px-4 py-3 bg-gray-50/40">
                  {/* Product detail edits (admin) */}
                  {isAdmin && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4 pb-4 border-b border-gray-200">
                      <div>
                        <label className="block text-[10px] font-semibold text-gray-500 uppercase mb-1">Name</label>
                        <input
                          type="text"
                          defaultValue={product.name}
                          onBlur={e => {
                            const v = e.target.value.trim()
                            if (v && v !== product.name) patchProduct(product.id, { name: v })
                          }}
                          className="w-full text-sm px-2 py-1.5 border border-gray-200 rounded focus:border-blue-500 focus:outline-none bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-gray-500 uppercase mb-1">Spec</label>
                        <input
                          type="text"
                          defaultValue={product.spec || ''}
                          onBlur={e => {
                            const v = e.target.value.trim()
                            if (v !== (product.spec || '')) patchProduct(product.id, { spec: v || null })
                          }}
                          className="w-full text-sm px-2 py-1.5 border border-gray-200 rounded focus:border-blue-500 focus:outline-none bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-gray-500 uppercase mb-1">Vendor</label>
                        <input
                          type="text"
                          defaultValue={product.vendor || 'Accurate Printing'}
                          onBlur={e => {
                            const v = e.target.value.trim()
                            if (v !== (product.vendor || '')) patchProduct(product.id, { vendor: v || 'Accurate Printing' })
                          }}
                          className="w-full text-sm px-2 py-1.5 border border-gray-200 rounded focus:border-blue-500 focus:outline-none bg-white"
                        />
                      </div>
                      <div className="md:col-span-3 flex items-center gap-4">
                        <label className="inline-flex items-center gap-2 text-xs text-gray-700">
                          <input
                            type="checkbox"
                            checked={product.active}
                            onChange={e => patchProduct(product.id, { active: e.target.checked })}
                            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span>{product.active ? 'Active — shown in line items picker' : 'Inactive — hidden from picker'}</span>
                        </label>
                        <button
                          onClick={() => deleteProduct(product.id)}
                          disabled={busy}
                          className="ml-auto text-xs text-red-600 hover:bg-red-50 px-2 py-1 rounded disabled:opacity-50"
                        >
                          🗑 Delete product
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Tier table */}
                  {productTiers.length === 0 ? (
                    <div className="text-xs text-gray-400 italic py-2">
                      No tiers configured yet. {isAdmin ? 'Add the first tier below.' : ''}
                    </div>
                  ) : (
                    <div className="bg-white border border-gray-200 rounded overflow-hidden">
                      <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-gray-50 border-b border-gray-200 text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                        <div className="col-span-3 text-right">Qty</div>
                        <div className="col-span-3 text-right">Tier Price</div>
                        <div className="col-span-3 text-right">Unit Price</div>
                        <div className="col-span-3"></div>
                      </div>
                      <div className="divide-y divide-gray-100">
                        {productTiers.map(tier => {
                          const unit = tier.qty > 0 ? tier.price / tier.qty : 0
                          return (
                            <div key={tier.id} className="grid grid-cols-12 gap-2 px-3 py-2 items-center hover:bg-gray-50/60">
                              <div className="col-span-3 text-right">
                                {isAdmin ? (
                                  <input
                                    type="number"
                                    defaultValue={tier.qty}
                                    onBlur={e => {
                                      const v = parseInt(e.target.value)
                                      if (!isNaN(v) && v > 0 && v !== tier.qty) patchTier(tier.id, { qty: v })
                                    }}
                                    className="w-full text-sm text-right bg-transparent border-0 px-1 py-0.5 font-mono tabular-nums focus:outline-none focus:bg-white focus:border focus:border-blue-500 focus:rounded"
                                    step="1"
                                    min="1"
                                  />
                                ) : (
                                  <span className="text-sm font-mono tabular-nums">{tier.qty}</span>
                                )}
                              </div>
                              <div className="col-span-3 text-right relative">
                                {isAdmin ? (
                                  <>
                                    <span className="absolute left-2 top-1 text-xs text-gray-400">$</span>
                                    <input
                                      type="number"
                                      defaultValue={tier.price}
                                      onBlur={e => {
                                        const v = parseFloat(e.target.value)
                                        if (!isNaN(v) && v >= 0 && v !== tier.price) patchTier(tier.id, { price: v })
                                      }}
                                      className="w-full text-sm text-right bg-transparent border-0 pl-5 pr-1 py-0.5 font-mono tabular-nums focus:outline-none focus:bg-white focus:border focus:border-blue-500 focus:rounded"
                                      step="any"
                                      min="0"
                                    />
                                  </>
                                ) : (
                                  <span className="text-sm font-mono tabular-nums font-semibold">${tier.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                )}
                              </div>
                              <div className="col-span-3 text-right text-xs font-mono tabular-nums text-gray-500">
                                ${unit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                              </div>
                              <div className="col-span-3 text-right">
                                {isAdmin && (
                                  <button
                                    onClick={() => deleteTier(tier.id)}
                                    className="text-gray-300 hover:text-red-500 text-sm leading-none px-1"
                                    title="Delete tier"
                                  >
                                    ×
                                  </button>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Add tier form */}
                  {isAdmin && (
                    addingTierFor === product.id ? (
                      <div className="mt-3 grid grid-cols-12 gap-2 items-center">
                        <input
                          type="number"
                          value={newTierQty}
                          onChange={e => setNewTierQty(e.target.value)}
                          placeholder="Qty"
                          className="col-span-3 text-sm text-right px-2 py-1.5 border border-gray-200 rounded font-mono focus:border-blue-500 focus:outline-none bg-white"
                          step="1"
                          min="1"
                        />
                        <div className="col-span-3 relative">
                          <span className="absolute left-2 top-1.5 text-xs text-gray-400">$</span>
                          <input
                            type="number"
                            value={newTierPrice}
                            onChange={e => setNewTierPrice(e.target.value)}
                            placeholder="Price"
                            className="w-full text-sm pl-5 pr-2 py-1.5 border border-gray-200 rounded font-mono text-right focus:border-blue-500 focus:outline-none bg-white"
                            step="any"
                            min="0"
                          />
                        </div>
                        <div className="col-span-6 flex gap-2">
                          <button
                            onClick={() => addTier(product.id)}
                            disabled={busy}
                            className="px-3 py-1.5 rounded text-xs font-semibold text-white disabled:opacity-50"
                            style={{ background: '#1a2b4a' }}
                          >
                            {busy ? '…' : 'Add tier'}
                          </button>
                          <button
                            onClick={() => { setAddingTierFor(null); setNewTierQty(''); setNewTierPrice('') }}
                            className="px-3 py-1.5 rounded text-xs text-gray-600 hover:bg-gray-100"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setAddingTierFor(product.id)}
                        className="mt-3 text-xs text-gray-500 hover:text-gray-900 px-2 py-1.5 border border-dashed border-gray-300 rounded hover:border-gray-400"
                      >
                        + Add tier
                      </button>
                    )
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {isAdmin && (
        <p className="text-xs text-gray-400 italic mt-6">
          Tier prices apply when this product is selected in a work order's line items.
          The qty-to-tier resolution uses "tier up" — a request for 350 prints uses the 500-tier price.
        </p>
      )}
    </div>
  )
}
