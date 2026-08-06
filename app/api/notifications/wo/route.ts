// app/api/notifications/wo/route.ts
// HTTP wrapper over lib/work-order-notify. The dispatch logic lives in the lib
// so server routes (work-order create / PATCH) can call it directly instead of
// making an HTTP request to themselves.
import { NextRequest, NextResponse } from 'next/server'
import {
  notifyWoCreated,
  notifyWoAssigned,
  notifyWoStageChanged,
  notifyWoClientDecision,
} from '@/lib/work-order-notify'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body?.event || !body?.woId) {
    return NextResponse.json({ error: 'event and woId required' }, { status: 400 })
  }

  const { event, woId } = body

  switch (event) {
    case 'wo_created':
      return NextResponse.json(await notifyWoCreated(woId))

    case 'wo_assigned':
      return NextResponse.json(
        await notifyWoAssigned(woId, {
          newOwner: body.newOwner ?? null,
          addedAssignees: body.addedAssignees ?? [],
        })
      )

    case 'stage_changed':
      if (!body.newStage) {
        return NextResponse.json({ error: 'newStage required' }, { status: 400 })
      }
      return NextResponse.json(await notifyWoStageChanged(woId, body.newStage))

    case 'client_approved':
      return NextResponse.json(await notifyWoClientDecision(woId, 'approved'))

    case 'client_revision':
      return NextResponse.json(await notifyWoClientDecision(woId, 'revision'))

    default:
      return NextResponse.json({ error: 'unknown event' }, { status: 400 })
  }
}
