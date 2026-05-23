'use client'

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

export default function WoVendorInvoicesTab({
  invoices,
  woId,
}: {
  invoices: Invoice[]
  woId: string
}) {
  const total = invoices.reduce((sum, i) => sum + (Number(i.amount) || 0), 0)
  const balanceTotal = invoices.reduce((sum, i) => sum + (Number(i.balance_due) || 0), 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>🧾 Vendor Invoices</h2>
        <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>
          Internal-only view of vendor invoices linked to this work order.
          Currently sourced from Accurate Printing via Apps Script.
        </div>
      </div>

      {/* Empty state */}
      {invoices.length === 0 && (
        <div style={{
          padding: '32px 16px',
          textAlign: 'center',
          background: '#f9fafb',
          border: '1px dashed #d1d5db',
          borderRadius: 8,
          color: '#6b7280',
        }}>
          <div style={{ fontSize: 14, marginBottom: 4 }}>No invoices linked yet.</div>
          <div style={{ fontSize: 12 }}>
            Invoices flow in automatically from Accurate Printing emails.
            Match is by WO number reference in the PDF (e.g. <code style={{ background: '#e5e7eb', padding: '1px 4px', borderRadius: 3 }}>WO-{woId.slice(0, 8)}</code>).
          </div>
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
                <Th>Vendor</Th>
                <Th>PDF</Th>
              </tr>
            </thead>
            <tbody>
              {invoices.map(inv => {
                const isLinked = inv.work_order_id !== null
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
                    <Td>{inv.vendor}</Td>
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
          (no direct foreign-key link yet).
        </div>
      )}
    </div>
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
