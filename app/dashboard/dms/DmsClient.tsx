'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Dm = {
  id: string
  from_member_id: string | null
  to_member_id: string
  body: string
  wo_id: string | null
  sent_via: string | null
  read_at: string | null
  created_at: string
}

type Member = { id: string; name: string }

function timeAgo(d: string) {
  const ms = Date.now() - new Date(d).getTime()
  const m = Math.floor(ms / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const days = Math.floor(h / 24)
  if (days < 7) return `${days}d ago`
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function DmsClient({
  initialDms, team, currentMemberId,
}: {
  initialDms: Dm[]
  team: Member[]
  currentMemberId: string
}) {
  const supabase = createClient()
  const [dms, setDms] = useState<Dm[]>(initialDms)

  const unread = dms.filter(d => !d.read_at && d.to_member_id === currentMemberId).length

  async function markRead(id: string) {
    await supabase.from('direct_messages').update({ read_at: new Date().toISOString() }).eq('id', id)
    setDms(prev => prev.map(d => d.id === id ? { ...d, read_at: new Date().toISOString() } : d))
  }

  async function markAllRead() {
    const ids = dms.filter(d => !d.read_at && d.to_member_id === currentMemberId).map(d => d.id)
    for (const id of ids) {
      await supabase.from('direct_messages').update({ read_at: new Date().toISOString() }).eq('id', id)
    }
    setDms(prev => prev.map(d => ids.includes(d.id) ? { ...d, read_at: new Date().toISOString() } : d))
  }

  function memberName(id: string | null) {
    if (!id) return '✦ Mav'
    return team.find(t => t.id === id)?.name || 'Someone'
  }

  return (
    <div>
      {unread > 0 && (
        <div className="flex items-center justify-between mb-4 px-4 py-2 bg-blue-50 rounded-lg border border-blue-200">
          <span className="text-sm text-blue-700 font-medium">{unread} unread message{unread > 1 ? 's' : ''}</span>
          <button onClick={markAllRead} className="text-xs text-blue-600 hover:underline">Mark all read</button>
        </div>
      )}

      {dms.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <div className="text-4xl mb-3">✦</div>
          <div className="text-sm">No direct messages yet.</div>
          <div className="text-xs mt-1">Ask Mav to send you something — try "send me a summary of overdue WOs"</div>
        </div>
      ) : (
        <div className="space-y-3">
          {dms.map(dm => {
            const isToMe = dm.to_member_id === currentMemberId
            const isUnread = isToMe && !dm.read_at
            const fromName = dm.sent_via === 'mav' && !dm.from_member_id ? '✦ Mav' : memberName(dm.from_member_id)
            const toName = memberName(dm.to_member_id)
            return (
              <div key={dm.id}
                className={`bg-white rounded-xl border p-4 transition-colors ${isUnread ? 'border-blue-200 shadow-sm' : 'border-gray-200'}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className="text-xs font-bold text-gray-900">{fromName}</span>
                      <span className="text-xs text-gray-400">→ {toName}</span>
                      {isUnread && (
                        <span className="text-xs bg-blue-500 text-white rounded-full px-1.5 py-0.5 font-medium">New</span>
                      )}
                      {dm.sent_via === 'mav' && (
                        <span className="text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-1.5 py-0.5">via Mav</span>
                      )}
                      <span className="text-xs text-gray-400 ml-auto">{timeAgo(dm.created_at)}</span>
                    </div>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{dm.body}</p>
                    {dm.wo_id && (
                      <a href={`/dashboard/wo/${dm.wo_id}`}
                        className="inline-block mt-2 text-xs text-blue-600 hover:underline">
                        View work order →
                      </a>
                    )}
                  </div>
                  {isUnread && (
                    <button onClick={() => markRead(dm.id)}
                      className="text-xs text-gray-400 hover:text-gray-600 whitespace-nowrap flex-shrink-0">
                      Mark read
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
