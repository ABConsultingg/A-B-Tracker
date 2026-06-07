import { NextRequest, NextResponse } from 'next/server'
import { jsPDF } from 'jspdf'
import path from 'path'
import { readFileSync } from 'fs'

function fmt(n: number) {
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export async function POST(req: NextRequest) {
  try {
    const data = await req.json()
    const doc = new jsPDF({ unit: 'pt', format: 'letter' })

    const W = 612
    const margin = 43
    const contentW = W - margin * 2
    let y = 36

    // Colors
    const navy = [26, 39, 68] as [number, number, number]
    const gray = [100, 100, 100] as [number, number, number]
    const lightGray = [220, 220, 220] as [number, number, number]
    const black = [30, 30, 30] as [number, number, number]
    const rowAlt = [250, 250, 250] as [number, number, number]

    // ── LOGO ──────────────────────────────────────────────────────────────
    try {
      const logoPath = path.join(process.cwd(), 'public', 'ab-logo.png')
      const logoData = readFileSync(logoPath)
      const logoB64 = logoData.toString('base64')
      doc.addImage(logoB64, 'PNG', margin, y, 110, 24)
    } catch {
      doc.setFont('helvetica', 'bold').setFontSize(14).setTextColor(...navy)
      doc.text('A & B Consulting Group', margin, y + 16)
    }

    // Company info (right side)
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...gray)
    const compInfo = ['A & B Consulting Group', '1333 Burr Ridge Pkwy Ste 200-260', 'Burr Ridge, IL 60527-6423', 'info@abconsultingg.com | (708) 377-5727']
    compInfo.forEach((line, i) => {
      if (i === 0) doc.setFont('helvetica', 'bold')
      else doc.setFont('helvetica', 'normal')
      doc.text(line, W - margin, y + (i * 10), { align: 'right' })
    })

    // Invoice ref (far right)
    const invX = W - margin
    doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(...black)
    doc.text(`Invoice #${data.invoice_number}`, invX, y + 8, { align: 'right' })
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...gray)
    doc.text('Issue date', invX, y + 20, { align: 'right' })
    doc.text(data.issue_date, invX, y + 30, { align: 'right' })

    y += 50
    doc.setDrawColor(...lightGray).setLineWidth(0.5).line(margin, y, W - margin, y)
    y += 18

    // ── TITLE ─────────────────────────────────────────────────────────────
    doc.setFont('helvetica', 'bold').setFontSize(22).setTextColor(...black)
    doc.text('MIscellaneous', margin, y)
    y += 14
    doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...gray)
    doc.text('We appreciate your business.', margin, y)
    y += 14
    doc.setDrawColor(...lightGray).line(margin, y, W - margin, y)
    y += 14

    // ── CUSTOMER / DETAILS / PAYMENT ─────────────────────────────────────
    const total = data.line_items.reduce((s: number, i: any) => s + i.qty * i.price, 0)
    const c = data.customer
    const col1 = margin, col2 = margin + 180, col3 = margin + 360

    doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(...black)
    doc.text('Customer', col1, y)
    doc.text('Invoice Details', col2, y)
    doc.text('Payment', col3, y)
    y += 12
    doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...black)

    const custLines = [c.name, c.company, c.email, c.phone, ...(c.address || '').split('\n')].filter(Boolean)
    custLines.forEach(line => { doc.text(line, col1, y); y += 11 })

    const detY = y - (custLines.length * 11)
    doc.text(`PDF created ${data.issue_date}`, col2, detY + 11)
    doc.text(fmt(total), col2, detY + 22)
    doc.text(`Due ${data.issue_date}`, col3, detY + 11)
    doc.text(fmt(total), col3, detY + 22)

    y += 8
    doc.setDrawColor(...lightGray).line(margin, y, W - margin, y)
    y += 12

    // ── LINE ITEMS ────────────────────────────────────────────────────────
    const colDesc = margin, colQty = margin + 320, colPrice = margin + 380, colAmt = W - margin
    const rowH = 22

    // Header row
    doc.setFillColor(248, 248, 248)
    doc.rect(margin, y - 10, contentW, rowH, 'F')
    doc.setFont('helvetica', 'bold').setFontSize(8.5).setTextColor(...gray)
    doc.text('Items', colDesc, y + 4)
    doc.text('Quantity', colQty + 20, y + 4, { align: 'right' })
    doc.text('Price', colPrice + 30, y + 4, { align: 'right' })
    doc.text('Amount', colAmt, y + 4, { align: 'right' })
    doc.setDrawColor(...lightGray).line(margin, y + 12, W - margin, y + 12)
    y += rowH + 2

    // Line items
    data.line_items.forEach((item: any, idx: number) => {
      const amt = item.qty * item.price
      const descLines = doc.splitTextToSize(item.description, 290) as string[]
      const subItems = item.sub_items || []
      const itemH = Math.max(rowH, (descLines.length + subItems.length) * 11 + 12)

      // Check page break
      if (y + itemH > 750) {
        doc.addPage()
        y = 40
      }

      // Alt row background
      if (idx % 2 === 1) {
        doc.setFillColor(...rowAlt)
        doc.rect(margin, y - 8, contentW, itemH, 'F')
      }

      doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...black)
      descLines.forEach((line: string, li: number) => doc.text(line, colDesc, y + li * 11))

      // Sub-items in italic gray
      if (subItems.length > 0) {
        const subY = y + descLines.length * 11
        doc.setFont('helvetica', 'italic').setFontSize(7.5).setTextColor(...gray)
        subItems.forEach((si: any, si_i: number) => {
          doc.text(`${si.description}  ${fmt(si.price)}`, colDesc + 8, subY + si_i * 10)
        })
      }

      doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...black)
      doc.text(String(item.qty), colQty + 20, y, { align: 'right' })
      doc.text(fmt(item.price), colPrice + 30, y, { align: 'right' })
      doc.text(fmt(amt), colAmt, y, { align: 'right' })

      y += itemH
    })

    doc.setDrawColor(...lightGray).line(margin, y, W - margin, y)
    y += 12

    // ── TOTALS ────────────────────────────────────────────────────────────
    doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...black)
    doc.text('Subtotal', margin + 330, y)
    doc.text(fmt(total), colAmt, y, { align: 'right' })
    y += 16

    doc.setDrawColor(...black).setLineWidth(1).line(margin + 320, y - 4, W - margin, y - 4)
    doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(...black)
    doc.text('Total Paid', margin + 330, y + 8)
    doc.text(fmt(total), colAmt, y + 8, { align: 'right' })

    const pdfBuffer = Buffer.from(doc.output('arraybuffer'))

    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="invoice-${data.invoice_number || 'draft'}.pdf"`,
      }
    })
  } catch (e: any) {
    console.error('Invoice generation error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
