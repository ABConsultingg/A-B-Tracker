import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { clientName, month, summary, question } = await req.json()
  if (!question || !summary) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: `You are a senior digital marketing strategist reviewing a monthly performance report for ${clientName} (${month}).

Report data:
${summary}

Question from the A&B Consulting team:
${question}

Give a direct, specific answer in 2-4 sentences. Reference actual numbers from the data. Sound like a strategic advisor, not a report generator.`,
      }],
    }),
  })

  const data = await response.json()
  const answer = (data.content || [])
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
    .join('')

  return NextResponse.json({ answer })
}
