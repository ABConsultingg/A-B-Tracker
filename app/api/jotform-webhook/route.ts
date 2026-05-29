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
      const norm = String(k).toLowerCase().trim().replace(/[_\s]+/g, '')
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

  const get = (label: string): string => {
    const target = label.toLowerCase().trim().replace(/\s+/g, '')
    for (const [k, v] of Object.entries(raw)) {
      const norm = String(k).toLowerCase().trim().replace(/[_\s]+/g, '')
      if (norm === target || norm.endsWith(target)) {
        if (typeof v === 'string') return v
        if (v && typeof v === 'object') return JSON.stringify(v)
        return ''
      }
    }
    return ''
  }

  // Extract product selections.
  // Jotform "my products" field arrives as either a stringified array, a
  // comma-separated list of "Product Name (amount=$X)" entries, or an object
  // with paid product structure. We handle the common shapes defensively.
  const productsRaw = get('myProducts') || get('products')
  const recipientName = get('recipientName') || get('recipient')
  const recipientEmail = get('email') || get('eMail')
  const branch = get('branch')
  const billingAddress = get('address')

  // --- Build title ---
  const branchStr = branch ? branch.trim() : 'Unknown Branch'
  const recipStr = recipientName ? recipientName.trim() : 'Unknown Recipient'
  const title = `${branchStr} - RBS Performance Plus Order - ${recipStr}`

  // --- Generate WO id ---
  const woId = 'WO-' + crypto.randomUUID().slice(0, 8)

  // --- Build notes ---
  const notesParts: string[] = []
  if (recipientEmail) notesParts.push(`Recipient email: ${recipientEmail}`)
  if (billingAddress) notesParts.push(`Billing address: ${billingAddress}`)
  if (productsRaw) notesParts.push(`Products (raw): ${productsRaw}`)
  notesParts.push(`(Imported from Jotform RBS Performance Plus submission ${submissionID})`)
  const combinedNotes = notesParts.join('\n\n')

  // --- Insert WO ---
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

  // --- Parse products into line items ---
  // The Performance Plus form has fixed pricing the admin knows:
  //   "50 Brochures RBS PLUS" → $222.30
  //   "100 Brochures RBS PLUS" → $326.30
  //   "Shipping" → $30.00 (always selected, required)
  //
  // Jotform sends the product field as a comma-separated string when
  // multiple are selected, e.g. "50 Brochures RBS PLUS, Shipping".
  // We parse by name and assign known prices.
  const PRICE_MAP: Record<string, number> = {
    '50 brochures rbs plus': 222.30,
    '100 brochures rbs plus': 326.30,
    'shipping': 30.00,
  }

  const lineItems: any[] = []
  if (productsRaw) {
    // Split on common Jotform delimiters
    const cleaned = productsRaw.replace(/[\[\]"]/g, '')
    const items = cleaned.split(/[,;\n]+/).map(s => s.trim()).filter(Boolean)
    let sortOrder = 1
    for (const item of items) {
      const normalized = item.toLowerCase().replace(/\s+/g, ' ').trim()
      // Try to find matching price by checking if product name is contained
      let price = 0
      let matchedName = item
      for (const [knownName, knownPrice] of Object.entries(PRICE_MAP)) {
        if (normalized.includes(knownName)) {
          price = knownPrice
          matchedName = knownName.replace(/\b\w/g, c => c.toUpperCase()) // Title Case
          break
        }
      }
      lineItems.push({
        work_order_id: woId,
        description: matchedName,
        qty: 1,
        unit_price: price,
        sort_order: sortOrder++,
        source: 'jotform',
      })
    }
  }

  if (lineItems.length > 0) {
    const { error: liError } = await supabase.from('wo_line_items').insert(lineItems)
    if (liError) {
      // WO already created, log but don't roll back
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
  // Idempotency
  if (submissionID) {
    const { data: existing } = await supabase
      .from('work_orders')
      .select('id')
      .eq('jotform_submission_id', submissionID)
      .maybeSingle()
    if (existing?.id) return { woId: existing.id }
  }

  const get = (label: string): string => {
    const target = label.toLowerCase().trim().replace(/\s+/g, '')
    for (const [k, v] of Object.entries(raw)) {
      const norm = String(k).toLowerCase().trim().replace(/[_\s]+/g, '')
      if (norm === target || norm.endsWith(target)) {
        if (typeof v === 'string') return v
        if (v && typeof v === 'object') return JSON.stringify(v)
        return ''
      }
    }
    return ''
  }

  // Extract fields. Form 3 has many fields per path; we grab everything
  // we can find and dump unmapped data into notes.
  const flyerType = get('selectTheFlyer') || get('flyerType') || get('selectYourOrder') || get('pleaseSelect')
  const branch = get('branch')
  const vendorBrand = get('vendorBrand') || get('vendor')
  const submitterEmail = get('branchManagerEmail') || get('email')
  const eventDate = get('eventDate') || get('startingDate') || get('starting')
  const endDate = get('endingDate') || get('ending')
  const eventType = get('eventType')
  const callToAction = get('callToAction')
  const startTime = get('eventStartTime') || get('startTime')
  const endTime = get('eventEndTime') || get('endTime')
  const lunch = get('areYouProvidingLunch') || get('lunch')
  const location = get('location')
  const locationAddress = get('provideLocationAddress') || get('locationAddress')
  const locationName = get('nameOfTheLocation') || get('locationName')
  const content = get('content')
  const additionalInstructions = get('additionalAndFurther') || get('additional')
  const printing = get('printing')
  const wantPrintedMailed = get('doYouWantYour') || get('wantPrinted')
  const howMany = get('howMany') || get('quantity')
  const guidelines = get('guidelinesForThe') || get('guidelines')
  const updateGmb = get('doYouWantUsToUpdate') || get('googleMyBusiness') || get('gmb')
  const targetedAdvertising = get('areYouInterestedIn') || get('targetedAdvertising')
  const dueDate = get('deliverablesDueDate') || get('dueDate')

  // --- Title ---
  const branchStr = branch ? branch.trim() : 'Unknown Branch'
  const flyerStr = flyerType ? flyerType.trim() : 'Event/Flyer'
  const vendorStr = vendorBrand ? vendorBrand.trim() : 'Unspecified'
  const title = `${branchStr} - RBS ${flyerStr} - ${vendorStr}`

  // --- Parse dates ---
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

  // --- Build notes (all the path-specific fields) ---
  const notesParts: string[] = []
  if (flyerType) notesParts.push(`Flyer type: ${flyerType}`)
  if (eventType) notesParts.push(`Event type: ${eventType}`)
  if (callToAction) notesParts.push(`Call to action: ${callToAction}`)
  if (startTime || endTime) notesParts.push(`Event time: ${startTime || '?'} - ${endTime || '?'}`)
  if (lunch) notesParts.push(`Lunch provided: ${lunch}`)
  if (location) notesParts.push(`Location: ${location}`)
  if (locationName) notesParts.push(`Location name: ${locationName}`)
  if (locationAddress) notesParts.push(`Location address: ${locationAddress}`)
  if (content) notesParts.push(`Content: ${content}`)
  if (guidelines) notesParts.push(`Guidelines: ${guidelines}`)
  if (additionalInstructions) notesParts.push(`Additional instructions: ${additionalInstructions}`)
  if (printing) notesParts.push(`Printing: ${printing}`)
  if (wantPrintedMailed) notesParts.push(`Printed/mailed: ${wantPrintedMailed}`)
  if (howMany) notesParts.push(`How many: ${howMany}`)
  if (updateGmb) notesParts.push(`Update Google My Business: ${updateGmb}`)
  if (targetedAdvertising) notesParts.push(`Targeted advertising: ${targetedAdvertising}`)
  notesParts.push(`(Imported from Jotform RBS Event/Flyer submission ${submissionID})`)
  const combinedNotes = notesParts.join('\n\n')

  // --- Generate WO id ---
  const woId = 'WO-' + crypto.randomUUID().slice(0, 8)

  // --- Insert WO ---
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

