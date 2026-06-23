import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { clientId, clientName, month, summary, question } = await req.json()
  if (!summary) return NextResponse.json({ error: 'No data' }, { status: 400 })

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: question
          ? `You are a senior digital marketing strategist. Client: ${clientName}. Month: ${month}. All currency values are in USD ($).\n\nData:\n${summary}\n\n${question}`
          : `You are a senior digital marketing strategist writing a concise monthly performance narrative for a client report.

Client: ${clientName}
Month: ${month}

Data:
${summary}

Write 3 short paragraphs (2-3 sentences each) for a business owner who is not a marketing expert. Explain what happened this month and why it is great for their business in plain everyday language.
1. The biggest win this month — explain what the number means in real terms (e.g. "732 people searched and clicked to call" not "impressions increased")
2. How the different marketing efforts worked together to bring in more customers or grow the brand — explain it like talking to a friend
3. What this momentum means for the business going forward — encouraging and forward-looking

Rules: no marketing jargon, write like texting a smart friend who owns a business, purely positive and celebratory, connect every number to a real business outcome, no headers or bullets, no "This month" or "Overall" openers, no concerns or problems, no recommendations or action items. All currency values are in USD — always use $ symbol.`,
      }],
    }),
  })

  const data = await response.json()
  const narrative = (data.content || [])
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
    .join('')

  return NextResponse.json({ narrative })
}
