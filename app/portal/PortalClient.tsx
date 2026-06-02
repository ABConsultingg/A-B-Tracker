'use client'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { stageView, HIDDEN_STAGES, FINISHED_STAGES } from '@/lib/portal/stages'
import PortalApprovalModal from './PortalApprovalModal'
import PortalRequestModal from './PortalRequestModal'

type WO = {
  id: string; title: string; stage: string; service_id: string | null;
  due_date: string | null; est_cost: number; add_cost: number; created_at: string;
  deliverables_link: string | null; description: string | null; branch: string | null;
  services?: { name?: string } | null;
}
type Sched = { id: string; work_order_id: string; scheduled_date: string;
  scheduled_time: string | null; type: string; title: string | null; status: string }
type Svc = { id: string; name: string; active: boolean }
type Client = { id: string; name: string; company: string | null;
  looker_enabled: boolean | null; looker_url: string | null } | null

const money = (n: number) => '$' + (n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })
const todayISO = () => new Date().toISOString().slice(0, 10)
function fmtDate(d: string | null) {
  if (!d) return ''
  try { return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) }
  catch { return d }
}

export default function PortalClient({
  greetingName, client, workOrders, schedule, services, currentUserId,
}: {
  greetingName: string
  client: Client
  workOrders: WO[]
  schedule: Sched[]
  services: Svc[]
  currentUserId: string
}) {
  const router = useRouter()
  const [approvalWo, setApprovalWo] = useState<WO | null>(null)
  const [requestOpen, setRequestOpen] = useState(false)

  const visible = useMemo(
    () => workOrders.filter(w => !HIDDEN_STAGES.has(w.stage)),
    [workOrders]
  )
  const waitingOnYou = useMemo(
    () => visible.filter(w => w.stage === 'sent-for-approval'),
    [visible]
  )
  const active = useMemo(
    () => visible.filter(w => !FINISHED_STAGES.has(w.stage)),
    [visible]
  )
  const completedThisMonth = useMemo(() => {
    const now = new Date(); const m = now.getMonth(); const y = now.getFullYear()
    return visible.filter(w => {
      if (w.stage !== 'paid') return false
      const d = new Date(w.created_at)
      return d.getMonth() === m && d.getFullYear() === y
    }).length
  }, [visible])

  const upcoming = useMemo(() => {
    const t = todayISO()
    return schedule
      .filter(s => s.scheduled_date >= t && s.status !== 'cancelled')
      .slice(0, 6)
  }, [schedule])

  const cost = (w: WO) => (w.est_cost || 0) + (w.add_cost || 0)
  const showCost = (w: WO) => ['invoiced', 'paid'].includes(w.stage) && cost(w) > 0

  return (
    <>
      {/* Hero */}
      <div style={{ background: 'linear-gradient(180deg,#0f1b34,#1e2a4a)', color: 'white',
                    padding: '32px 24px 56px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase',
                        color: 'rgba(255,255,255,0.6)', marginBottom: 8 }}>
            Welcome back{greetingName ? `, ${greetingName}` : ''}
          </div>
          <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 32, fontWeight: 400, lineHeight: 1.2 }}>
            {waitingOnYou.length > 0
              ? <>You have <span style={{ color: '#d99e2b', fontStyle: 'italic' }}>
                  {waitingOnYou.length} {waitingOnYou.length === 1 ? 'thing' : 'things'} to review</span>
                  {active.length > 0 && <> and {active.length} {active.length === 1 ? 'project' : 'projects'} in motion.</>}</>
              : active.length > 0
                ? <>{active.length} {active.length === 1 ? 'project' : 'projects'} in motion.</>
                : <>Everything's up to date.</>}
          </h1>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: '-32px auto 60px', padding: '0 24px' }}>

        {/* Request a project */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
          <button onClick={() => setRequestOpen(true)}
            style={{ background: '#d99e2b', color: '#0f1b34', border: 'none', borderRadius: 8,
                     padding: '10px 18px', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
            + Request a project
          </button>
        </div>

        {/* Waiting on you */}
        {waitingOnYou.length > 0 && (
          <div style={{ background: 'white', border: '1px solid rgba(234,88,12,0.18)', borderRadius: 16,
                        padding: '20px 24px', marginBottom: 24, boxShadow: '0 4px 20px rgba(15,27,52,0.06)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ea580c' }} />
              <span style={{ fontFamily: 'Georgia, serif', fontSize: 20, color: '#0f1b34' }}>Waiting on you</span>
              <span style={{ background: '#ea580c', color: 'white', fontSize: 12, fontWeight: 700,
                             padding: '2px 10px', borderRadius: 20 }}>{waitingOnYou.length}</span>
            </div>
            {waitingOnYou.map(w => (
              <div key={w.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                gap: 16, padding: '12px 0', borderTop: '1px solid #e8e6dd' }}>
                <div>
                  <div style={{ fontWeight: 600, color: '#0f1b34' }}>{w.title}</div>
                  <div style={{ fontSize: 13, color: '#6b6a63', marginTop: 2 }}>
                    {w.services?.name || 'Project'}{w.due_date ? ` · due ${fmtDate(w.due_date)}` : ''}
                  </div>
                </div>
                <button onClick={() => setApprovalWo(w)}
                  style={{ background: '#0f1b34', color: 'white', border: 'none', padding: '9px 18px',
                           borderRadius: 6, fontWeight: 600, fontSize: 13, cursor: 'pointer', flexShrink: 0 }}>
                  Review
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Stat cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginBottom: 28 }}>
          <Stat label="Active projects" value={active.length} />
          <Stat label="Awaiting approval" value={waitingOnYou.length}
                sub={waitingOnYou.length ? 'Need your review' : undefined} subColor="#ea580c" />
          <Stat label="Completed this month" value={completedThisMonth} />
        </div>

        {/* Looker */}
        {client?.looker_enabled && client?.looker_url && (
          <a href={client.looker_url} target="_blank" rel="noopener"
             style={{ display: 'block', textDecoration: 'none', background: 'linear-gradient(135deg,#1a2b4a,#2d4a7c)',
                      borderRadius: 14, padding: '24px 28px', marginBottom: 24, color: 'white' }}>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.12em',
                          color: '#d99e2b', fontWeight: 700, marginBottom: 8 }}>Your analytics dashboard</div>
            <div style={{ fontFamily: 'Georgia, serif', fontSize: 22 }}>Live marketing performance →</div>
          </a>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24 }}>
          {/* Your projects */}
          <div style={{ background: 'white', border: '1px solid #e8e6dd', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '18px 24px', borderBottom: '1px solid #e8e6dd' }}>
              <span style={{ fontFamily: 'Georgia, serif', fontSize: 18, color: '#0f1b34' }}>Your projects</span>
            </div>
            <div>
              {visible.length === 0 && (
                <div style={{ padding: 32, textAlign: 'center', color: '#a3a097', fontSize: 14 }}>
                  No projects yet. Use “Request a project” to get started.
                </div>
              )}
              {visible.map(w => {
                const sv = stageView(w.stage)
                return (
                  <div key={w.id} onClick={() => router.push(`/portal/wo/${w.id}`)}
                    style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 14,
                             alignItems: 'center', padding: '14px 24px', borderTop: '1px solid #e8e6dd',
                             cursor: 'pointer' }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: sv.dot }} />
                    <div>
                      <div style={{ fontWeight: 600, color: '#0f1b34', fontSize: 14.5 }}>{w.title}</div>
                      <div style={{ fontSize: 12.5, color: '#6b6a63', marginTop: 2 }}>
                        <span style={{ color: sv.color, fontWeight: 500 }}>{sv.label}</span>
                        {w.services?.name ? ` · ${w.services.name}` : ''}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', fontSize: 12, color: '#6b6a63', fontFamily: 'monospace' }}>
                      {showCost(w) && <div style={{ color: '#0f1b34', fontWeight: 600 }}>{money(cost(w))}</div>}
                      {w.due_date && <div>{fmtDate(w.due_date)}</div>}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* What's coming up */}
          <div style={{ background: 'white', border: '1px solid #e8e6dd', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '18px 24px', borderBottom: '1px solid #e8e6dd' }}>
              <span style={{ fontFamily: 'Georgia, serif', fontSize: 18, color: '#0f1b34' }}>What's coming up</span>
            </div>
            <div style={{ padding: '8px 24px 16px' }}>
              {upcoming.length === 0 && (
                <div style={{ padding: '16px 0', color: '#a3a097', fontSize: 13 }}>Nothing scheduled yet.</div>
              )}
              {upcoming.map(s => (
                <div key={s.id} style={{ display: 'grid', gridTemplateColumns: '48px 1fr', gap: 12, padding: '12px 0' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 9, textTransform: 'uppercase', color: '#6b6a63', letterSpacing: '0.08em' }}>
                      {new Date(s.scheduled_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short' })}
                    </div>
                    <div style={{ fontFamily: 'Georgia, serif', fontSize: 18, fontWeight: 600, color: '#0f1b34' }}>
                      {new Date(s.scheduled_date + 'T00:00:00').getDate()}
                    </div>
                  </div>
                  <div style={{ borderLeft: '3px solid #d99e2b', paddingLeft: 12 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#0f1b34' }}>{s.title || s.type}</div>
                    <div style={{ fontSize: 12.5, color: '#6b6a63', marginTop: 2 }}>{s.type}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {approvalWo && (
        <PortalApprovalModal
          wo={approvalWo}
          currentUserId={currentUserId}
          onClose={() => setApprovalWo(null)}
          onDone={() => { setApprovalWo(null); router.refresh() }}
        />
      )}
      {requestOpen && (
        <PortalRequestModal
          clientId={client?.id || ''}
          isRBS={client?.id === 'rbs'}
          services={services}
          onClose={() => setRequestOpen(false)}
          onDone={() => { setRequestOpen(false); router.refresh() }}
        />
      )}
    </>
  )
}

function Stat({ label, value, sub, subColor }: { label: string; value: number; sub?: string; subColor?: string }) {
  return (
    <div style={{ background: 'white', border: '1px solid #e8e6dd', borderRadius: 12, padding: 20 }}>
      <div style={{ fontSize: 11, color: '#a3a097', textTransform: 'uppercase', letterSpacing: '0.08em',
                    fontWeight: 600, marginBottom: 6 }}>{label}</div>
      <div style={{ fontFamily: 'Georgia, serif', fontSize: 30, fontWeight: 500, color: '#0f1b34' }}>{value}</div>
      {sub && <div style={{ fontSize: 13, marginTop: 4, color: subColor || '#6b6a63' }}>{sub}</div>}
    </div>
  )
}
