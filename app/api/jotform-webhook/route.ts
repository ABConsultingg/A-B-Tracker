import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * Jotform webhook endpoint.
 *
 * Auth: ?token=<JOTFORM_WEBHOOK_TOKEN>
 *
 * Configure in Jotform → Settings → Integrations → Webhooks:
 *   https://app.abconsultingg.com/api/jotform-webhook?token=YOUR_TOKEN
 *
 * Jotform POSTs as application/x-www-form-urlencoded with a `rawRequest` field
 * containing a JSON-encoded string of all form answers, plus top-level fields
 * (formID, submissionID, etc.).
 *
 * Every submission is logged to jotform_webhook_log regardless of outcome —
 * gives us a debug trail when something fails.
 */

// ============================================================
// Form ID constants
// ============================================================
const FORM_RBS_MARKETING_WO = '243245428504050'
const FORM_RBS_PRODUCT_PURCHASE = '222854697649879'
const FORM_RBS_EVENT_FLYER = '220905170640851'
const FORM_RBS_LINECARD_ORDERS = '230264553360854'

// ============================================================
// Type of Project → service_id mapping (Form 1)
// ============================================================
const TYPE_OF_PROJECT_TO_SERVICE: Record<string, string> = {
  'design': 'ab-design',
  'video creation': 'ab-video',
  'campaign': 'ab-marketing-campaign',
  'mailing campaign': 'ab-marketing-campaign',
  'email campaign': 'ab-email',
  'full marketing campaign': 'ab-marketing-campaign',
  'social media campaign': 'ab-social',
  'ppc campaign': 'ab-ppc',
  'other': 'ab-misc-onetime',
}

// ============================================================
// Main handler
// ============================================================
export async function POST(req: NextRequest) {
  // --- Auth check ---
  const token = req.nextUrl.searchParams.get('token')
  const expected = process.env.JOTFORM_WEBHOOK_TOKEN

  if (!expected) {
    console.error('[jotform-webhook] JOTFORM_WEBHOOK_TOKEN env var not set')
    return NextResponse.json({ error: 'server misconfigured' }, { status: 500 })
  }

  if (!token || token !== expected) {
    console.warn('[jotform-webhook] auth failed')
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  // --- Parse Jotform payload ---
  let formData: FormData
  try {
    formData = await req.formData()
  } catch (e) {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }

  const formID = String(formData.get('formID') || '')
  const submissionID = String(formData.get('submissionID') || '')
  const formTitle = String(formData.get('formTitle') || '')
  const rawRequestStr = String(formData.get('rawRequest') || '{}')

  let rawRequest: Record<string, any> = {}
  try {
    rawRequest = JSON.parse(rawRequestStr)
  } catch {
    // Keep going — log will show the raw string
  }

  // Build full payload object for logging
  const fullPayload: Record<string, any> = {
    formID,
    submissionID,
    formTitle,
    rawRequest,
  }
  for (const [k, v] of formData.entries()) {
    if (k !== 'rawRequest' && !fullPayload[k]) {
      fullPayload[k] = String(v)
    }
  }

  // --- Route to mapping function ---
  const supabase = createServiceClient()

  let status: 'success' | 'error' | 'skipped' = 'skipped'
  let errorMessage: string | null = null
  let parsedWoId: string | null = null

  try {
    if (formID === FORM_RBS_MARKETING_WO) {
      const result = await handleMarketingWO(supabase, rawRequest, submissionID)
      status = 'success'
      parsedWoId = result.woId
    } else if (formID === FORM_RBS_PRODUCT_PURCHASE) {
      const result = await handlePerformancePlus(supabase, rawRequest, submissionID)
      status = 'success'
      parsedWoId = result.woId
    } else if (formID === FORM_RBS_EVENT_FLYER) {
      const result = await handleEventFlyer(supabase, rawRequest, submissionID)
      status = 'success'
      parsedWoId = result.woId
    } else if (formID === FORM_RBS_LINECARD_ORDERS) {
      const result = await handleLinecardOrder(supabase, rawRequest, submissionID)
      status = 'success'
      parsedWoId = result.woId
    } else {
      status = 'skipped'
      errorMessage = `Unknown form ID: ${formID}`
    }
  } catch (e: any) {
    status = 'error'
    errorMessage = e?.message || String(e)
    console.error('[jotform-webhook] handler error:', e)
  }

  // --- Log everything ---
  try {
    await supabase.from('jotform_webhook_log').insert({
      form_id: formID,
      form_title: formTitle || null,
      jotform_submission_id: submissionID || null,
      raw_payload: fullPayload,
      parsed_wo_id: parsedWoId,
      status,
      error_message: errorMessage,
    })
  } catch (logErr) {
    // Don't fail the webhook just because logging failed
    console.error('[jotform-webhook] log insert failed:', logErr)
  }

  return NextResponse.json({
    ok: status !== 'error',
    status,
    wo_id: parsedWoId,
    error: errorMessage,
  })
}

// ============================================================
// Form 1 mapping: RBS Marketing Work Order Form → work_orders
// ============================================================
async function handleMarketingWO(
  supabase: ReturnType<typeof createServiceClient>,
  raw: Record<string, any>,
  submissionID: string
): Promise<{ woId: string }> {
  // Idempotency: check if this submission already became a WO
  if (submissionID) {
    const { data: existing } = await supabase
      .from('work_orders')
      .select('id')
      .eq('jotform_submission_id', submissionID)
      .maybeSingle()

    if (existing?.id) {
      return { woId: existing.id }
    }
  }

  // Jotform fields arrive under q-prefixed keys keyed by question ID.
  // We accept lowercased label matches (with or without underscores).
  const get = (label: string): string => {
    const target = label.toLowerCase().trim().replace(/\s+/g, '')
    for (const [k, v] of Object.entries(raw)) {
      const norm = String(k).toLowerCase().trim().replace(/^q\d+_/, '').replace(/\d+$/, '').replace(/[_\s]+/g, '')
      // Match if the key ends with the target (handles q3_email, q4_typeOfProject, etc.)
      if (norm === target || norm.endsWith(target)) {
        if (typeof v === 'string') return v
        if (v && typeof v === 'object') return JSON.stringify(v)
        return ''
      }
    }
    return ''
  }

  // --- Extract fields ---
  const email = get('email')
  const typeOfProject = get('typeOfProject')
  const branchAllocation = get('branchAllocation')
  const projectName = get('projectName')
  const dueDate = get('dueDate')
  const startDateRaw = get('startDateOfProject') || get('startDate')
  const endDateRaw = get('endDate')
  const notes = get('notes')
  const instructions = get('listVideoInstructionsOrOther') || get('listVideoInstructions')
  const campaignGoals = get('campaignGoals')
  const targetMarket = get('targetMarket')
  const description = get('pleaseDescribe') || get('pleaseDescribeYourCampaign') || get('describe')
  const deliverables = get('deliverablesNeeded')
  const qrNeededRaw = get('qrNeeded')
  const qrUrl = get('whereShouldThe') || get('whereShouldTheQrDirectTo') || get('qrUrl')
  const manufacturer = get('manufacturer')
  const forwardToVendorRaw = get('forwardToVendor')
  const approvalNeededByRaw = get('approvalNeededBy')

  // --- Map service ---
  const serviceKey = String(typeOfProject).toLowerCase().trim()
  const serviceId = TYPE_OF_PROJECT_TO_SERVICE[serviceKey] || 'ab-misc-onetime'

  // --- Helpers ---
  const truthy = (s: string): boolean => {
    const v = String(s).toLowerCase().trim()
    return v === 'yes' || v === 'true' || v === '1' || v === 'on'
  }

  const parseJotformDate = (s: string): string | null => {
    if (!s) return null
    try {
      const obj = JSON.parse(s)
      if (obj && typeof obj === 'object' && obj.year && obj.month && obj.day) {
        return `${obj.year}-${String(obj.month).padStart(2, '0')}-${String(obj.day).padStart(2, '0')}`
      }
    } catch {}
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
    if (/^\d{1,2}\/\d{1,2}\/\d{4}/.test(s)) {
      const [m, d, y] = s.split('/')
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
    }
    return null
  }

  // --- Build notes (only fields that have no dedicated column) ---
  const notesParts: string[] = []
  if (notes) notesParts.push(notes)
  if (instructions) notesParts.push(`Instructions: ${instructions}`)
  notesParts.push(`(Imported from Jotform RBS Marketing WO submission ${submissionID})`)
  const combinedNotes = notesParts.join('\n\n')

  // --- Generate a new WO id ---
  const woId = 'WO-' + crypto.randomUUID().slice(0, 8)

  // --- Insert the work order ---
  const { error } = await supabase.from('work_orders').insert({
    id: woId,
    client_id: 'rbs',
    title: projectName || '(Untitled — Jotform import)',
    service_id: serviceId,
    branch: branchAllocation || null,
    due_date: parseJotformDate(dueDate),
    start_date: parseJotformDate(startDateRaw),
    end_date: parseJotformDate(endDateRaw),
    approval_by: parseJotformDate(approvalNeededByRaw),
    notes: combinedNotes || null,
    description: description || null,
    campaign_goals: campaignGoals || null,
    target_market: targetMarket || null,
    deliverables_needed: deliverables || null,
    qr_needed: truthy(qrNeededRaw),
    qr_url: qrUrl || null,
    forward_to_vendor: truthy(forwardToVendorRaw),
    manufacturer: manufacturer || null,
    submitted_via: 'jotform',
    submitted_by_email: email || null,
    jotform_submission_id: submissionID || null,
    owner_id: 'tanya',
    stage: 'submitted',
    priority: 'medium',
    occurrence: 'One-time',
    submitted_at: new Date().toISOString(),
  })

  if (error) {
    throw new Error(`work_orders insert failed: ${error.message}`)
  }

  return { woId }
}


// ============================================================
// Form 2 mapping: RBS Performance Plus Order Form → work_orders
// ============================================================
async function handlePerformancePlus(
  supabase: ReturnType<typeof createServiceClient>,
  raw: Record<string, any>,
  submissionID: string
): Promise<{ woId: string }> {
  // Idempotency
  if (submissionID) {
    const { data: existing } = await supabase
      .from('work_orders')
      .select('id')
      .eq('jotform_submission_id', submissionID)
      .maybeSingle()
    if (existing?.id) return { woId: existing.id }
  }

  // Strip Jotform's q{N}_ prefix and trailing digit suffix so we can match
  // duplicate field keys consistently. Examples:
  //   q199_branch199    → branch
  //   q5_email          → email
  //   q3_myProducts3    → myproducts
  const normKey = (k: string): string =>
    String(k)
      .toLowerCase()
      .replace(/^q\d+_/, '')
      .replace(/\d+$/, '')
      .trim()

  const get = (label: string): string => {
    const target = label.toLowerCase().trim().replace(/\s+/g, '')
    for (const [k, v] of Object.entries(raw)) {
      if (normKey(k) === target) {
        if (typeof v === 'string') {
          if (v.trim()) return v
        } else if (v && typeof v === 'object') {
          return JSON.stringify(v)
        }
      }
    }
    return ''
  }

  // Recipient name is {first, last} in real Jotform payloads
  const parseRecipientName = (): string => {
    for (const [k, v] of Object.entries(raw)) {
      const norm = String(k).toLowerCase().replace(/[_\s]+/g, '')
      if (norm.includes('recipientname')) {
        if (typeof v === 'string' && v.trim()) return v.trim()
        if (v && typeof v === 'object') {
          const first = String((v as any).first || '').trim()
          const last = String((v as any).last || '').trim()
          const combined = `${first} ${last}`.trim()
          if (combined) return combined
        }
      }
    }
    return ''
  }

  // Products field q3_myProducts3 is a structured object: { products: [...] }
  // Extract array directly instead of trying to parse a comma-separated string.
  const findProductsArray = (): Array<any> => {
    for (const [k, v] of Object.entries(raw)) {
      const norm = String(k).toLowerCase().replace(/[_\s]+/g, '')
      if (norm.includes('myproducts') && v && typeof v === 'object') {
        const products = (v as any).products
        if (Array.isArray(products)) return products
      }
    }
    return []
  }

  const recipientName = parseRecipientName()
  const recipientEmail = get('email') || get('eMail')
  const branch = get('branch')
  const billingAddress = get('address')
  const products = findProductsArray()

  const branchStr = branch ? branch.trim() : 'Unknown Branch'
  const recipStr = recipientName || 'Unknown Recipient'
  const title = `${branchStr} - RBS Performance Plus Order - ${recipStr}`

  const woId = 'WO-' + crypto.randomUUID().slice(0, 8)

  const notesParts: string[] = []
  if (recipientEmail) notesParts.push(`Recipient email: ${recipientEmail}`)
  if (billingAddress) notesParts.push(`Billing address: ${billingAddress}`)
  if (products.length > 0) {
    const summary = products
      .map((p) => `${p.productName} x${p.quantity} = $${p.subTotal}`)
      .join(', ')
    notesParts.push(`Products: ${summary}`)
  }
  notesParts.push(`(Imported from Jotform RBS Performance Plus submission ${submissionID})`)
  const combinedNotes = notesParts.join('\n\n')

  const { error: woError } = await supabase.from('work_orders').insert({
    id: woId,
    client_id: 'rbs',
    title,
    service_id: 'ab-print',
    branch: branch || null,
    notes: combinedNotes,
    submitted_via: 'jotform',
    submitted_by_email: recipientEmail || null,
    submitted_by_name: recipientName || null,
    jotform_submission_id: submissionID || null,
    owner_id: 'tanya',
    stage: 'submitted',
    priority: 'medium',
    occurrence: 'One-time',
    submitted_at: new Date().toISOString(),
  })

  if (woError) {
    throw new Error(`work_orders insert failed: ${woError.message}`)
  }

  // Line items from the structured products array.
  const lineItems = products.map((p, idx) => ({
    work_order_id: woId,
    description: String(p.productName || `Item ${idx + 1}`),
    qty: Number(p.quantity) || 1,
    unit_price: Number(p.unitPrice) || 0,
    sort_order: idx + 1,
    source: 'jotform',
  }))

  if (lineItems.length > 0) {
    const { error: liError } = await supabase.from('wo_line_items').insert(lineItems)
    if (liError) {
      console.error('[jotform-webhook] line items insert failed:', liError.message)
    }
  }

  return { woId }
}


// ============================================================
// Form 3 mapping: RBS Event/Flyer Form → work_orders
// ============================================================
async function handleEventFlyer(
  supabase: ReturnType<typeof createServiceClient>,
  raw: Record<string, any>,
  submissionID: string
): Promise<{ woId: string }> {
  if (submissionID) {
    const { data: existing } = await supabase
      .from('work_orders')
      .select('id')
      .eq('jotform_submission_id', submissionID)
      .maybeSingle()
    if (existing?.id) return { woId: existing.id }
  }

  // Strip Jotform's q{N}_ prefix and trailing digit suffix so we can match
  // duplicate field keys consistently. Examples:
  //   q199_branch199    → branch
  //   q5_email          → email
  //   q3_myProducts3    → myproducts
  const normKey = (k: string): string =>
    String(k)
      .toLowerCase()
      .replace(/^q\d+_/, '')
      .replace(/\d+$/, '')
      .trim()

  const get = (label: string): string => {
    const target = label.toLowerCase().trim().replace(/\s+/g, '')
    for (const [k, v] of Object.entries(raw)) {
      if (normKey(k) === target) {
        if (typeof v === 'string') {
          if (v.trim()) return v
        } else if (v && typeof v === 'object') {
          return JSON.stringify(v)
        }
      }
    }
    return ''
  }

  // Clean overly-verbose flyer type names: take everything before first '(' or ':'.
  const cleanFlyerType = (s: string): string => {
    if (!s) return ''
    return s.replace(/\s*[(:].*$/, '').trim()
  }

  const rawFlyerType =
    get('pleaseSelect') ||
    get('selectTheFlyer') ||
    get('flyerType') ||
    get('selectYourOrder')
  const flyerType = cleanFlyerType(rawFlyerType)
  const branch = get('branch')
  const vendorBrand = get('vendorBrand') || get('vendor')
  const submitterEmail = get('branchManager') || get('email')
  const eventDate = get('eventDate') || get('startingDate')
  const endDate = get('endingDate')
  const eventType = get('eventType')
  const callToAction = get('callTo')
  const startTime = get('eventStart')
  const endTime = get('eventEnd')
  const location = get('location')
  const locationAddress = get('provideLocation')
  const locationName = get('nameOf')
  const additionalInstructions = get('additionalAnd')
  const howMany = get('howMany')
  const guidelines = get('guidelinesFor')
  const dueDate = get('deliverableDue')

  const branchStr = branch ? branch.trim() : 'Unknown Branch'
  const flyerStr = flyerType || 'Event/Flyer'
  const vendorStr = vendorBrand ? vendorBrand.trim() : 'Unspecified'
  const title = `${branchStr} - RBS ${flyerStr} - ${vendorStr}`

  const parseJotformDate = (s: string): string | null => {
    if (!s) return null
    try {
      const obj = JSON.parse(s)
      if (obj && typeof obj === 'object' && obj.year && obj.month && obj.day) {
        return `${obj.year}-${String(obj.month).padStart(2, '0')}-${String(obj.day).padStart(2, '0')}`
      }
    } catch {}
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
    if (/^\d{1,2}\/\d{1,2}\/\d{4}/.test(s)) {
      const [m, d, y] = s.split('/')
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
    }
    return null
  }

  const notesParts: string[] = []
  if (rawFlyerType) notesParts.push(`Order type: ${rawFlyerType}`)
  if (eventType) notesParts.push(`Event type: ${eventType}`)
  if (callToAction) notesParts.push(`Call to action: ${callToAction}`)
  if (startTime || endTime) notesParts.push(`Event time: ${startTime || '?'} - ${endTime || '?'}`)
  if (location) notesParts.push(`Location: ${location}`)
  if (locationName) notesParts.push(`Location name: ${locationName}`)
  if (locationAddress) notesParts.push(`Location address: ${locationAddress}`)
  if (guidelines) notesParts.push(`Guidelines: ${guidelines}`)
  if (additionalInstructions) notesParts.push(`Additional instructions: ${additionalInstructions}`)
  if (howMany) notesParts.push(`How many: ${howMany}`)
  notesParts.push(`(Imported from Jotform RBS Event/Flyer submission ${submissionID})`)
  const combinedNotes = notesParts.join('\n\n')

  const woId = 'WO-' + crypto.randomUUID().slice(0, 8)

  const { error } = await supabase.from('work_orders').insert({
    id: woId,
    client_id: 'rbs',
    title,
    service_id: 'ab-print',
    branch: branch || null,
    due_date: parseJotformDate(dueDate),
    start_date: parseJotformDate(eventDate),
    end_date: parseJotformDate(endDate),
    notes: combinedNotes,
    submitted_via: 'jotform',
    submitted_by_email: submitterEmail || null,
    jotform_submission_id: submissionID || null,
    owner_id: 'tanya',
    stage: 'submitted',
    priority: 'medium',
    occurrence: 'One-time',
    submitted_at: new Date().toISOString(),
  })

  if (error) {
    throw new Error(`work_orders insert failed: ${error.message}`)
  }

  return { woId }
}


// ============================================================
// Form 4 mapping: RBS Linecard Orders → work_orders
// ============================================================
// Fields: Name, Email, My Products (product name + quantity), Submission Date.
// A linecard order is a print job, so it lands as a single work order with the
// products summarised in notes. Line items are deliberately not written — see
// wo_line_items in handlePerformancePlus if per-quantity reporting is wanted
// later.
async function handleLinecardOrder(
  supabase: ReturnType<typeof createServiceClient>,
  raw: Record<string, any>,
  submissionID: string
): Promise<{ woId: string }> {
  // Idempotency: a Jotform retry must not create a second work order.
  if (submissionID) {
    const { data: existing } = await supabase
      .from('work_orders')
      .select('id')
      .eq('jotform_submission_id', submissionID)
      .maybeSingle()
    if (existing?.id) return { woId: existing.id }
  }

  // Jotform keys arrive as q{N}_label{N} — strip both so lookups are stable.
  const normKey = (k: string): string =>
    String(k).toLowerCase().replace(/^q\d+_/, '').replace(/\d+$/, '').replace(/[_\s]+/g, '').trim()

  const get = (label: string): string => {
    const target = label.toLowerCase().replace(/[_\s]+/g, '').trim()
    for (const [k, v] of Object.entries(raw)) {
      if (normKey(k) === target) {
        if (typeof v === 'string' && v.trim()) return v.trim()
        if (v && typeof v === 'object') return JSON.stringify(v)
      }
    }
    return ''
  }

  // Name may be a plain string or Jotform's {first, last} object.
  const parseName = (): string => {
    for (const [k, v] of Object.entries(raw)) {
      if (normKey(k) !== 'name') continue
      if (typeof v === 'string' && v.trim()) return v.trim()
      if (v && typeof v === 'object') {
        const combined = [String((v as any).first || ''), String((v as any).last || '')]
          .map(s => s.trim()).filter(Boolean).join(' ')
        if (combined) return combined
      }
    }
    return ''
  }

  // "My Products" is a structured control: { products: [ { productName, quantity, ... } ] }.
  // Fall back to any raw string value so an unexpected shape still gets recorded
  // rather than silently dropped.
  const productsField = (): { list: Array<any>; rawText: string } => {
    for (const [k, v] of Object.entries(raw)) {
      if (!normKey(k).includes('myproducts')) continue
      if (v && typeof v === 'object') {
        const products = (v as any).products
        if (Array.isArray(products)) return { list: products, rawText: '' }
        return { list: [], rawText: JSON.stringify(v) }
      }
      if (typeof v === 'string' && v.trim()) return { list: [], rawText: v.trim() }
    }
    return { list: [], rawText: '' }
  }

  const name = parseName()
  const email = get('email') || get('eMail')
  const submissionDate = get('submissionDate') || get('date')
  const { list: products, rawText: productsRaw } = productsField()

  const title = `${name || 'Unknown'} - Linecard Order`

  const notesParts: string[] = []
  if (name) notesParts.push(`Ordered by: ${name}`)
  if (email) notesParts.push(`Email: ${email}`)
  if (submissionDate) notesParts.push(`Submitted: ${submissionDate}`)

  if (products.length > 0) {
    const lines = products.map((p) => {
      const pname = String(p?.productName ?? p?.name ?? 'Item').trim() || 'Item'
      const qty = Number(p?.quantity) || 1
      return `- ${pname} x${qty}`
    })
    notesParts.push(`Products (${products.length}):\n${lines.join('\n')}`)
  } else if (productsRaw) {
    notesParts.push(`Products (unparsed):\n${productsRaw}`)
  } else {
    notesParts.push('Products: none listed on the submission')
  }

  notesParts.push(`(Imported from Jotform RBS Linecard Orders submission ${submissionID})`)

  const woId = 'WO-' + crypto.randomUUID().slice(0, 8)

  const { error } = await supabase.from('work_orders').insert({
    id: woId,
    client_id: 'rbs',
    title,
    service_id: 'ab-print',
    notes: notesParts.join('\n\n'),
    submitted_via: 'jotform',
    submitted_by_email: email || null,
    submitted_by_name: name || null,
    jotform_submission_id: submissionID || null,
    owner_id: 'tanya',
    stage: 'submitted',
    priority: 'medium',
    occurrence: 'One-time',
    submitted_at: new Date().toISOString(),
  })

  if (error) throw new Error(`work_orders insert failed: ${error.message}`)

  return { woId }
}
