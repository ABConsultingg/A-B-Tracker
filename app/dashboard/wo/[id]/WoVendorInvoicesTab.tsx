'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Invoice = {
  id: string
  work_order_id: string | null
  invoice_number: string
  invoice_date: string | null
  amount: number | null
  balance_due: number | null
  client_text: string | null
  wo_number_text: string | null
  pdf_filename: string | null
  pdf_url: string | null
  email_received_at: string | null
  vendor: string
  source: string
  created_at: string
}

const money = (n: number | null | undefined) =>
  typeof n === 'number' && !Number.isNaN(n)
    ? n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
    : '—'

const fmtDate = (d: string | null) => {
  if (!d) return '—'
  try {
    return new Date(d + (d.includes('T') ? '' : 'T00:00:00')).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    })
  } catch {
    return d
  }
}

const today = () => {
  const d = new Date()
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0')
}

export default function WoVendorInvoicesTab({
  invoices,
  woId,
}: {
  invoices: Invoice[]
  woId: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [showForm, setShowForm] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [invoiceDate, setInvoiceDate] = useState(today())
  const [amount, setAmount] = useState('')
  const [balanceDue, setBalanceDue] = useState('')
  const [pdfUrl, setPdfUrl] = useState('')

  const woShortId = woId.slice(0, 11)

  const resetForm = () => {
    setInvoiceNumber('')
    setInvoiceDate(today())
    setAmount('')
    setBalanceDue('')
    setPdfUrl('')
    setFormError(null)
  }

  const handleSubmit = async () => {
    setFormError(null)

    if (!invoiceNumber.trim()) {
      setFormError('Invoice number is required')
      return
    }
    if (!invoiceDate) {
      setFormError('Invoice date is required')
      return
    }
    const amt = parseFloat(amount)
    if (Number.isNaN(amt) || amt < 0) {
      setFormError('Amount must be a positive number')
      return
    }
    const bal = balanceDue.trim() === '' ? amt : parseFloat(balanceDue)
    if (Number.isNaN(bal) || bal < 0) {
      setFormError('Balance due must be a positive number')
      return
    }

    setSubmitting(true)

    const supabase = createClient()
    const { error } = await supabase
      .from('wo_vendor_invoices')
      .insert({
        work_order_id: woId,
        invoice_number: invoiceNumber.trim(),
        invoice_date: invoiceDate,
        amount: amt,
        balance_due: bal,
        wo_number_text: woShortId,
        pdf_url: pdfUrl.trim() || null,
        vendor: 'Accurate Printing',
        source: 'manual',
      })

    setSubmitting(false)

    if (error) {
      if (error.code === '23505') {
        setFormError('Invoice number ' + invoiceNumber.trim() + ' already exists for this vendor')
      } else {
        setFormError(error.message || 'Failed to add invoice')
      }
      return
    }

    resetForm()
    setShowForm(false)
    startTransition(() => {
      router.refresh()
    })
  }

  const handleDelete = async (invoice: Invoice) => {
    const confirmed = window.confirm(
      'Delete invoice #' + invoice.invoice_number + '?\n\nThis cannot be undone.'
    )
    if (!confirmed) return

    const supabase = createClient()
    const { error } = await supabase
      .from('wo_vendor_invoices')
      .delete()
      .eq('id', invoice.id)

    if (error) {
      window.alert('Failed to delete: ' + error.message)
      return
    }

    startTransition(() => {
      router.refresh()
    })
  }

  const total = invoices.reduce((sum, i) => sum + (Number(i.amount) || 0), 0)
  const balanceTotal = invoices.reduce((sum, i) => sum + (Number(i.balance_due) || 0), 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>🧾 Vendor Invoices</h2>
          <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>
            Internal-only view of vendor invoices linked to this work order.
            Auto-flow from Accurate Printing via Apps Script. Manual entries supported.
          </div>
        </div>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            style={{
              padding: '8px 14px',
              background: '#2563eb',
              color: 'white',
              border: 'none',
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            + Add invoice
          </button>
        )}
      </div>

      {/* Add form */}
      {showForm && (
        <div style={{
          padding: 16,
          background: '#f9fafb',
          border: '1px solid #d1d5db',
          borderRadius: 8,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Add invoice manually</div>
            <button
              onClick={() => { resetForm(); setShowForm(false) }}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#6b7280',
                cursor: 'pointer',
                fontSize: 13,
              }}
              disabled={submitting}
            >
              Cancel
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Invoice #" required>
              <input
                type="text"
                value={invoiceNumber}
                onChange={e => setInvoiceNumber(e.target.value)}
                placeholder="e.g. 68903"
                style={inputStyle}
                disabled={submitting}
              />
            </Field>
            <Field label="Invoice date" required>
              <input
                type="date"
                value={invoiceDate}
                onChange={e => setInvoiceDate(e.target.value)}
                style={inputStyle}
                disabled={submitting}
              />
            </Field>
            <Field label="Amount" required>
              <input
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0.00"
                style={inputStyle}
                disabled={submitting}
              />
            </Field>
            <Field label="Balance due" hint="defaults to amount if blank">
              <input
                type="number"
                step="0.01"
                min="0"
                value={balanceDue}
                onChange={e => setBalanceDue(e.target.value)}
                placeholder={amount || '0.00'}
                style={inputStyle}
                disabled={submitting}
              />
            </Field>
          </div>

          <Field label="PDF link (optional)" hint="Google Drive or other URL">
            <input
              type="url"
              value={pdfUrl}
              onChange={e => setPdfUrl(e.target.value)}
              placeholder="https://drive.google.com/..."
              style={inputStyle}
              disabled={submitting}
            />
          </Field>

          {formError && (
            <div style={{
              padding: '8px 12px',
              background: '#fee2e2',
              color: '#991b1b',
              border: '1px solid #fca5a5',
              borderRadius: 6,
              fontSize: 13,
            }}>
              {formError}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button
              onClick={() => { resetForm(); setShowForm(false) }}
              style={{
                padding: '8px 14px',
                background: 'white',
                color: '#374151',
                border: '1px solid #d1d5db',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
              }}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              style={{
                padding: '8px 14px',
                background: submitting ? '#9ca3af' : '#2563eb',
                color: 'white',
                border: 'none',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 600,
                cursor: submitting ? 'wait' : 'pointer',
              }}
              disabled={submitting || isPending}
            >
              {submitting ? 'Adding...' : 'Add invoice'}
            </button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {invoices.length === 0 && !showForm && (
        <div style={{
          padding: '32px 16px',
          textAlign: 'center',
          background: '#f9fafb',
          border: '1px dashed #d1d5db',
          borderRadius: 8,
          color: '#6b7280',
        }}>
          <div style={{ fontSize: 14, marginBottom: 8 }}>No invoices linked yet.</div>
          <div style={{ fontSize: 12, marginBottom: 16 }}>
            Invoices flow in automatically from Accurate Printing emails.
            Match is by WO number reference in the PDF (e.g. <code style={{ background: '#e5e7eb', padding: '1px 4px', borderRadius: 3 }}>{woShortId}</code>).
          </div>
          <button
            onClick={() => setShowForm(true)}
            style={{
              padding: '8px 16px',
              background: '#2563eb',
              color: 'white',
              border: 'none',
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            + Add invoice manually
          </button>
        </div>
      )}

      {/* Summary */}
      {invoices.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 12,
        }}>
          <SummaryCard label="Total Invoiced" value={money(total)} />
          <SummaryCard label="Balance Due" value={money(balanceTotal)} />
          <SummaryCard label="Invoices" value={String(invoices.length)} />
        </div>
      )}

      {/* Table */}
      {invoices.length > 0 && (
        <div style={{
          background: 'white',
          border: '1px solid #e5e7eb',
          borderRadius: 8,
          overflow: 'hidden',
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead style={{ background: '#f9fafb' }}>
              <tr>
                <Th>Invoice #</Th>
                <Th>Date</Th>
                <Th align="right">Amount</Th>
                <Th align="right">Balance</Th>
                <Th>Client (parsed)</Th>
                <Th>WO ref</Th>
                <Th>Source</Th>
                <Th>PDF</Th>
                <Th>{"\u00A0"}</Th>
              </tr>
            </thead>
            <tbody>
              {invoices.map(inv => {
                const isLinked = inv.work_order_id !== null
                const isManual = inv.source === 'manual'
                return (
                  <tr
                    key={inv.id}
                    style={{
                      borderTop: '1px solid #f3f4f6',
                      background: isLinked ? 'white' : '#fffbeb',
                    }}
                  >
                    <Td>
                      <span style={{ fontWeight: 600, fontFamily: 'JetBrains Mono, monospace' }}>
                        #{inv.invoice_number}
                      </span>
                      {!isLinked && (
                        <span style={{
                          marginLeft: 8,
                          fontSize: 10,
                          padding: '2px 6px',
                          background: '#fef3c7',
                          color: '#92400e',
                          borderRadius: 10,
                          fontWeight: 600,
                        }}>
                          fuzzy match
                        </span>
                      )}
                    </Td>
                    <Td>{fmtDate(inv.invoice_date)}</Td>
                    <Td align="right" mono>{money(inv.amount)}</Td>
                    <Td align="right" mono>{money(inv.balance_due)}</Td>
                    <Td>{inv.client_text || '—'}</Td>
                    <Td mono>{inv.wo_number_text || '—'}</Td>
                    <Td>
                      {isManual ? (
                        <span style={{
                          fontSize: 10,
                          padding: '2px 6px',
                          background: '#dbeafe',
                          color: '#1e40af',
                          borderRadius: 10,
                          fontWeight: 600,
                        }}>
                          manual
                        </span>
                      ) : (
                        <span style={{ fontSize: 11, color: '#6b7280' }}>auto</span>
                      )}
                    </Td>
                    <Td>
                      {inv.pdf_url ? (
                        <a
                          href={inv.pdf_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: '#2563eb', textDecoration: 'underline', fontSize: 12 }}
                        >
                          📄 View
                        </a>
                      ) : (
                        <span style={{ color: '#9ca3af' }}>—</span>
                      )}
                    </Td>
                    <Td>
                      {isManual ? (
                        <button
                          onClick={() => handleDelete(inv)}
                          title="Delete this manual entry"
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#9ca3af',
                            cursor: 'pointer',
                            fontSize: 14,
                            padding: '4px 8px',
                            borderRadius: 4,
                          }}
                          onMouseEnter={e => {
                            e.currentTarget.style.color = '#dc2626'
                            e.currentTarget.style.background = '#fef2f2'
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.color = '#9ca3af'
                            e.currentTarget.style.background = 'transparent'
                          }}
                        >
                          ✕
                        </button>
                      ) : (
                        <span style={{ color: '#d1d5db', fontSize: 11 }}>—</span>
                      )}
                    </Td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Footnote */}
      {invoices.length > 0 && (
        <div style={{ fontSize: 12, color: '#9ca3af' }}>
          Showing {invoices.length} {invoices.length === 1 ? 'invoice' : 'invoices'}.
          Rows highlighted in amber are matched by WO number reference only
          (no direct foreign-key link yet). Only manual entries can be deleted
          from this view — auto-imported invoices are managed from the source
          Sheet to prevent re-creation.
        </div>
      )}
    </div>
  )
}

// ============================================================
// Small UI helpers
// ============================================================

const inputStyle: React.CSSProperties = {
  padding: '6px 10px',
  border: '1px solid #d1d5db',
  borderRadius: 4,
  fontSize: 13,
  fontFamily: 'inherit',
  width: '100%',
  boxSizing: 'border-box',
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string
  required?: boolean
  hint?: string
  children: React.ReactNode
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>
        {label}
        {required && <span style={{ color: '#dc2626', marginLeft: 4 }}>*</span>}
        {hint && <span style={{ fontWeight: 400, color: '#9ca3af', marginLeft: 6 }}>({hint})</span>}
      </div>
      {children}
    </label>
  )
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      padding: 14,
      background: 'white',
      border: '1px solid #e5e7eb',
      borderRadius: 8,
    }}>
      <div style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: '#1a1f2e', marginTop: 4 }}>
        {value}
      </div>
    </div>
  )
}

function Th({ children, align }: { children: React.ReactNode; align?: 'right' }) {
  return (
    <th style={{
      textAlign: align || 'left',
      padding: '10px 12px',
      fontSize: 11,
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.04em',
      color: '#6b7280',
    }}>
      {children}
    </th>
  )
}

function Td({
  children,
  align,
  mono,
}: {
  children: React.ReactNode
  align?: 'right'
  mono?: boolean
}) {
  return (
    <td style={{
      textAlign: align || 'left',
      padding: '10px 12px',
      fontFamily: mono ? 'JetBrains Mono, monospace' : 'inherit',
      color: '#1a1f2e',
    }}>
      {children}
    </td>
  )
}
