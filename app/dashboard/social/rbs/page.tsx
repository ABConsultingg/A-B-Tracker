'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

type Branch = {
  profile_id: string
  display_name: string
  short_name: string
  city: string
  state: string
  rvp: string
  manager: string
  posts: number
  engagements: number
  avg_eng: number
  zero_eng_pct: number
  is_colorado: boolean
  status: 'Strong' | 'Active' | 'Low' | 'Silent' | 'New'
}

function shortName(displayName: string): string {
  return displayName
    .replace('Richards Building Supply', 'RBS')
    .replace('Richards Building Supply - ', '')
    .replace('Richards Building Supply-', '')
    .trim()
}

function branchStatus(posts: number, avgEng: number, isNew: boolean): Branch['status'] {
  if (isNew) return 'New'
  if (posts === 0) return 'Silent'
  if (avgEng >= 10) return 'Strong'
  if (avgEng >= 2) return 'Active'
  if (avgEng >= 0.5) return 'Low'
  return 'Silent'
}

const STATUS_STYLE: Record<Branch['status'], { bg: string; text: string }> = {
  Strong:  { bg: '#EAF3DE', text: '#3B6D11' },
  Active:  { bg: '#EDF4FB', text: '#185FA5' },
  Low:     { bg: '#FAEEDA', text: '#854F0B' },
  Silent:  { bg: '#FCEBEB', text: '#A32D2D' },
  New:     { bg: '#F0EDFB', text: '#5B21B6' },
}

export default function RBSScorecardPage() {
  const now = new Date()
  const currentMonth = now.getMonth()
  const [selectedMonth, setSelectedMonth] = useState(currentMonth)
  const [selectedYear] = useState(now.getFullYear())
  const [branches, setBranches] = useState<Branch[]>([])
  const [loading, setLoading] = useState(true)
  const [sortBy, setSortBy] = useState<'avg_eng' | 'posts' | 'engagements' | 'name'>('avg_eng')
  const [filterRVP, setFilterRVP] = useState('All')
  const [filterStatus, setFilterStatus] = useState('All')
  const [search, setSearch] = useState('')

  const months3 = [-2, -1, 0].map(offset => {
    const m = (currentMonth + offset + 12) % 12
    return { label: MONTH_LABELS[m], value: m }
  })

  useEffect(() => { loadData() }, [selectedMonth, selectedYear])

  async function loadData() {
    setLoading(true)
    const monthStart = new Date(selectedYear, selectedMonth, 1).toISOString().split('T')[0]
    const monthEnd = new Date(selectedYear, selectedMonth + 1, 0).toISOString().split('T')[0]

    // All RBS Facebook profiles
    const { data: profiles } = await supabase
      .from('sprout_profiles')
      .select('profile_id, display_name')
      .eq('client_name', 'Richards Building Supply')
      .eq('network', 'facebook')
      .order('display_name')

    // Branch directory for location/manager/RVP
    const { data: directory } = await supabase
      .from('rbs_branch_directory')
      .select('store_code, location, city, state, manager, rvp')

    // Posts for the month grouped by profile
    const { data: posts } = await supabase
      .from('sprout_posts')
      .select('profile_id, engagements')
      .eq('client_name', 'Richards Building Supply')
      .gte('published_at', monthStart + 'T00:00:00')
      .lte('published_at', monthEnd + 'T23:59:59')

    // Build profile → post stats map
    const postMap: Record<string, { count: number; eng: number; zero: number }> = {}
    for (const p of posts ?? []) {
      if (!postMap[p.profile_id]) postMap[p.profile_id] = { count: 0, eng: 0, zero: 0 }
      postMap[p.profile_id].count++
      postMap[p.profile_id].eng += p.engagements ?? 0
      if ((p.engagements ?? 0) === 0) postMap[p.profile_id].zero++
    }

    // Build directory lookup by city (rough match)
    const dirMap: Record<string, { city: string; state: string; manager: string; rvp: string }> = {}
    for (const d of directory ?? []) {
      const key = (d.city ?? '').toLowerCase()
      dirMap[key] = { city: d.city ?? '', state: d.state ?? '', manager: d.manager ?? '', rvp: d.rvp ?? '' }
    }

    function lookupBranch(displayName: string) {
      // Try to extract city from display name
      const cityPart = displayName
        .replace('Richards Building Supply - ', '')
        .replace('Richards Building Supply-', '')
        .replace('Richards Building Supply', 'Corporate')
        .split(',')[0].trim().toLowerCase()
      return dirMap[cityPart] ?? { city: cityPart, state: '', manager: '', rvp: '' }
    }

    const COLORADO = ['52nd Ave, CO', 'Colorado Springs, CO', 'Loveland, CO', 'York Street, CO']

    const branchList: Branch[] = (profiles ?? []).map(p => {
      const stats = postMap[p.profile_id] ?? { count: 0, eng: 0, zero: 0 }
      const dir = lookupBranch(p.display_name)
      const name = shortName(p.display_name)
      const isColorado = COLORADO.some(c => p.display_name.includes(c.split(',')[0]))
      const avgEng = stats.count > 0 ? parseFloat((stats.eng / stats.count).toFixed(1)) : 0
      const zeroPct = stats.count > 0 ? Math.round((stats.zero / stats.count) * 100) : 0

      return {
        profile_id: p.profile_id,
        display_name: p.display_name,
        short_name: name,
        city: dir.city || name,
        state: dir.state,
        rvp: dir.rvp,
        manager: dir.manager,
        posts: stats.count,
        engagements: stats.eng,
        avg_eng: avgEng,
        zero_eng_pct: zeroPct,
        is_colorado: isColorado,
        status: branchStatus(stats.count, avgEng, isColorado && stats.count < 5),
      }
    })

    setBranches(branchList)
    setLoading(false)
  }

  // Derived stats
  const totalPosts = branches.reduce((a, b) => a + b.posts, 0)
  const totalEng = branches.reduce((a, b) => a + b.engagements, 0)
  const activeBranches = branches.filter(b => b.posts > 0).length
  const silentBranches = branches.filter(b => b.status === 'Silent').length

  // Filters
  const rvps = ['All', ...Array.from(new Set(branches.map(b => b.rvp).filter(Boolean))).sort()]
  const statuses = ['All', 'Strong', 'Active', 'Low', 'Silent', 'New']

  const filtered = branches
    .filter(b => filterRVP === 'All' || b.rvp === filterRVP)
    .filter(b => filterStatus === 'All' || b.status === filterStatus)
    .filter(b => !search || b.short_name.toLowerCase().includes(search.toLowerCase()) || b.city.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === 'avg_eng') return b.avg_eng - a.avg_eng
      if (sortBy === 'posts') return b.posts - a.posts
      if (sortBy === 'engagements') return b.engagements - a.engagements
      return a.short_name.localeCompare(b.short_name)
    })

  const ink = '#1C1917'
  const muted = '#78716C'
  const rule = '#E7E5E4'
  const mono = "'JetBrains Mono', monospace"

  return (
    <div style={{ minHeight: '100vh', background: '#FAFAF9', color: ink, fontFamily: "'Inter', system-ui, sans-serif" }}>

      {/* Header */}
      <header style={{ borderBottom: `1px solid ${rule}` }}>
        <div style={{ maxWidth: 1300, margin: '0 auto', padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Link href="/dashboard/social" style={{ color: muted, textDecoration: 'none', fontSize: 13 }}>← Social Hub</Link>
            <span style={{ color: rule }}>/</span>
            <div>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, color: muted }}>Richards Building Supply</div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>Branch Scorecard</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: 4, borderRadius: 8, background: '#F5F5F4' }}>
            {months3.map(m => (
              <button key={m.value} onClick={() => setSelectedMonth(m.value)} style={{
                padding: '6px 12px', fontSize: 13, fontWeight: 500, borderRadius: 6, border: 'none', cursor: 'pointer',
                background: m.value === selectedMonth ? '#1C1917' : 'transparent',
                color: m.value === selectedMonth ? '#FAFAF9' : ink,
              }}>{m.label}</button>
            ))}
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 1300, margin: '0 auto', padding: '28px 24px' }}>

        {/* KPI row */}
        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, background: '#D6D3D1', border: `1px solid ${rule}`, borderRadius: 8, overflow: 'hidden', marginBottom: 28 }}>
          {[
            { label: 'Total branches', value: branches.length.toString() },
            { label: 'Branches active', value: loading ? '…' : activeBranches.toString(), color: '#047857' },
            { label: 'Total posts', value: loading ? '…' : totalPosts.toLocaleString() },
            { label: 'Silent branches', value: loading ? '…' : silentBranches.toString(), color: silentBranches > 5 ? '#b91c1c' : ink },
          ].map((k, i) => (
            <div key={i} style={{ background: 'white', padding: '16px 20px' }}>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, color: muted }}>{k.label}</div>
              <div style={{ fontFamily: mono, fontSize: 28, fontWeight: 600, marginTop: 8, color: k.color ?? ink }}>{k.value}</div>
            </div>
          ))}
        </section>

        {/* Filters */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <input
            placeholder="Search branch or city…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ padding: '7px 12px', borderRadius: 6, border: `1px solid ${rule}`, fontSize: 13, background: 'white', minWidth: 200 }}
          />
          <select value={filterRVP} onChange={e => setFilterRVP(e.target.value)}
            style={{ padding: '7px 10px', borderRadius: 6, border: `1px solid ${rule}`, fontSize: 13, background: 'white' }}>
            {rvps.map(r => <option key={r}>{r}</option>)}
          </select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            style={{ padding: '7px 10px', borderRadius: 6, border: `1px solid ${rule}`, fontSize: 13, background: 'white' }}>
            {statuses.map(s => <option key={s}>{s}</option>)}
          </select>
          <div style={{ marginLeft: 'auto', fontSize: 12, color: muted }}>
            Sort: {['avg_eng','posts','engagements','name'].map(s => (
              <button key={s} onClick={() => setSortBy(s as any)} style={{
                marginLeft: 6, fontSize: 12, fontWeight: sortBy === s ? 600 : 400,
                color: sortBy === s ? ink : muted, border: 'none', background: 'none', cursor: 'pointer',
                textDecoration: sortBy === s ? 'underline' : 'none',
              }}>
                {s === 'avg_eng' ? 'Avg eng' : s === 'posts' ? 'Posts' : s === 'engagements' ? 'Total eng' : 'Name'}
              </button>
            ))}
          </div>
          <span style={{ fontSize: 12, color: muted }}>{filtered.length} branches</span>
        </div>

        {/* Branch table */}
        <div style={{ border: `1px solid ${rule}`, borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
              <thead style={{ background: '#FAFAF9', borderBottom: `1px solid ${rule}` }}>
                <tr>
                  {['Branch', 'RVP', 'Posts', 'Engagements', 'Avg eng/post', 'Zero-eng %', 'Status'].map(h => (
                    <th key={h} style={{
                      padding: '10px 14px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em',
                      fontWeight: 600, color: muted, textAlign: ['Posts','Engagements','Avg eng/post','Zero-eng %'].includes(h) ? 'right' : 'left',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} style={{ padding: 32, textAlign: 'center', color: muted }}>Loading…</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={7} style={{ padding: 32, textAlign: 'center', color: muted }}>No branches match filters</td></tr>
                ) : filtered.map((b, i) => {
                  const st = STATUS_STYLE[b.status]
                  return (
                    <tr key={b.profile_id} style={{ borderTop: i > 0 ? `1px solid ${rule}` : undefined }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#F5F5F4')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ fontWeight: 500 }}>{b.short_name}</div>
                        {b.city && b.state && <div style={{ fontSize: 11, color: muted }}>{b.city}, {b.state}</div>}
                        {b.manager && <div style={{ fontSize: 11, color: muted }}>{b.manager}</div>}
                      </td>
                      <td style={{ padding: '10px 14px', color: muted, fontSize: 12 }}>{b.rvp || '—'}</td>
                      <td style={{ padding: '10px 14px', fontFamily: mono, textAlign: 'right' }}>{b.posts}</td>
                      <td style={{ padding: '10px 14px', fontFamily: mono, textAlign: 'right' }}>{b.engagements.toLocaleString()}</td>
                      <td style={{ padding: '10px 14px', fontFamily: mono, textAlign: 'right', fontWeight: 600,
                        color: b.avg_eng >= 10 ? '#047857' : b.avg_eng >= 2 ? '#B45309' : b.avg_eng > 0 ? '#b91c1c' : muted }}>
                        {b.avg_eng > 0 ? b.avg_eng.toFixed(1) : '—'}
                      </td>
                      <td style={{ padding: '10px 14px', fontFamily: mono, textAlign: 'right',
                        color: b.zero_eng_pct >= 80 ? '#b91c1c' : b.zero_eng_pct >= 50 ? '#B45309' : muted }}>
                        {b.posts > 0 ? `${b.zero_eng_pct}%` : '—'}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 9999, fontSize: 11, fontWeight: 600, background: st.bg, color: st.text }}>
                          {b.status}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Colorado callout */}
        {branches.filter(b => b.is_colorado).length > 0 && (
          <div style={{ marginTop: 20, padding: '16px 20px', borderLeft: '3px solid #D97706', background: '#FFFBEB', borderRadius: '0 8px 8px 0' }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>⚠ Colorado branches (new launch)</div>
            <div style={{ fontSize: 13, color: muted }}>52nd Ave, Colorado Springs, Loveland, York Street — standard engagement KPIs don't apply for 60–90 days post-launch. Focus on audience-building content.</div>
          </div>
        )}

      </main>
    </div>
  )
}
