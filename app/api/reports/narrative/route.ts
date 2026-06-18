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
      max_tokens: 600,
      messages: [{
        role: 'user',
        content: question
          ? `You are a senior digital marketing strategist. Client: ${clientName}. Month: ${month}. All currency values are in USD ($).\n\nData:\n${summary}\n\n${question}`
          : `You are a senior digital marketing strategist writing a concise monthly performance narrative for a client report.

Client: ${clientName}
Month: ${month}

Data:
${summary}

Write 3 short paragraphs (2-3 sentences each):
1. The strongest positive result this month with a specific number
2. The biggest concern or gap with a specific number and why it matters
3. One clear recommendation the client should act on next month

Rules: plain language, lead with the most important fact, be specific, no headers or bullets, no "This month" or "Overall" openers, sound like a strategic advisor. All currency values are in USD — always use $ symbol, never £ or € or any other currency symbol.`,
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
