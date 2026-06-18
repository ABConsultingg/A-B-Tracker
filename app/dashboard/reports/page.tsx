'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Client {
  id: string;
  name: string;
  status: string;
  reports_enabled: boolean;
  report_color: string;
  report_initials: string;
  sprout_profiles: string[];
}

interface ChannelData {
  configured: boolean;
  message?: string;
  data: Record<string, any> | null;
  error?: string;
}

interface ClientReportData {
  gmb: ChannelData | null;
  meta: ChannelData | null;
  gads: ChannelData | null;
  ga4: ChannelData | null;
  social: ChannelData | null;
  email: ChannelData | null;
  loading: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number | undefined | null, dec = 0) {
  if (n === undefined || n === null || isNaN(n)) return '—';
  return n.toLocaleString('en-US', { maximumFractionDigits: dec });
}
function money(n: number | undefined | null) {
  if (n === undefined || n === null || isNaN(n)) return '—';
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function pct(n: number | undefined | null) {
  if (n === undefined || n === null || isNaN(n)) return '—';
  return n.toFixed(1) + '%';
}
function starStr(ratingStr: string) {
  const map: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };
  const n = map[ratingStr] || parseInt(ratingStr) || 0;
  return '★'.repeat(n) + '☆'.repeat(5 - n);
}
function monthLabel(m: string) {
  const [y, mo] = m.split('-');
  return new Date(parseInt(y), parseInt(mo) - 1, 1)
    .toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}
function monthOptions() {
  const opts = [];
  const now = new Date();
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const val = d.toISOString().slice(0, 7);
    opts.push({ value: val, label: monthLabel(val) });
  }
  return opts;
}

// ─── Shared UI atoms ──────────────────────────────────────────────────────────

function Tile({
  label, value, sub, hi,
}: { label: string; value: string; sub?: string; hi?: 'good' | 'warn' | 'bad' | null }) {
  const accent =
    hi === 'good' ? { background: '#f0fdf4', borderColor: '#86efac' } :
    hi === 'warn' ? { background: '#fffbeb', borderColor: '#fcd34d' } :
    hi === 'bad'  ? { background: '#fef2f2', borderColor: '#fca5a5' } : {};
  return (
    <div style={{
      background: 'var(--bg-elevated)', border: '1px solid var(--border)',
      borderRadius: 10, padding: '12px 14px', minWidth: 0, ...accent,
    }}>
      <div style={{ fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600, marginBottom: 5 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--brand-navy)', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

function TileGrid({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8, marginBottom: 14 }}>
      {children}
    </div>
  );
}

function SecHead({ icon, title, configured }: { icon: string; title: string; configured: boolean | null }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12 }}>
      <span style={{ fontSize: 15 }}>{icon}</span>
      <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--brand-navy)', letterSpacing: '-0.01em' }}>{title}</span>
      {configured === false && (
        <span style={{ fontSize: 10, color: '#92400e', background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 20, padding: '1px 7px', fontWeight: 600 }}>
          Not configured
        </span>
      )}
    </div>
  );
}

function NoData({ msg }: { msg?: string }) {
  return (
    <p style={{ fontSize: 12, color: 'var(--text-muted)', background: 'var(--bg-sunken)', borderRadius: 7, padding: '9px 12px', margin: 0 }}>
      {msg || 'No data available for this period.'}
    </p>
  );
}

function MiniTable({ cols, rows }: { cols: string[]; rows: (string | number)[][] }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', fontSize: 12 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: 'var(--bg-sunken)' }}>
            {cols.map(c => (
              <th key={c} style={{ textAlign: 'left', padding: '6px 10px', fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
              {row.map((cell, j) => (
                <td key={j} style={{ padding: '7px 10px', color: j === 0 ? 'var(--brand-navy)' : 'var(--text)', fontFamily: j > 0 ? 'monospace' : undefined, fontWeight: j === 0 ? 500 : 400, maxWidth: j === 0 ? 180 : undefined, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Divider() {
  return <div style={{ height: 1, background: 'var(--border)', margin: '16px 0' }} />;
}

// ─── Channel sections ─────────────────────────────────────────────────────────

function GmbSection({ ch }: { ch: ChannelData | null }) {
  if (!ch) return <div><SecHead icon="⭐" title="Reputation Management" configured={null} /><NoData msg="Loading…" /></div>;
  const d = ch.data as any;
  const isCSV = d?.source === 'csv'
  return (
    <div>
      <SecHead icon="⭐" title="Reputation Management" configured={ch.configured} />
      {!ch.configured
        ? <NoData msg="No GMB data. Upload CSV at /reports/upload → GMB Performance" />
        : !d ? <NoData msg={ch.message} />
        : isCSV ? (
          <>
            <TileGrid>
              <Tile label="Search Views"   value={fmt(d.searchViews)} />
              <Tile label="Maps Views"     value={fmt(d.mapsViews)} />
              <Tile label="Total Views"    value={fmt(d.totalImpressions)} />
              <Tile label="Calls"          value={fmt(d.calls)} />
              <Tile label="Directions"     value={fmt(d.directions)} />
              <Tile label="Website Clicks" value={fmt(d.websiteClicks)} />
            </TileGrid>
            {d.locations?.length > 0 && (() => {
              const byVp: Record<string, Record<string, any[]>> = {}
              d.locations.forEach((l: any) => {
                const vp = l.regionalVp && l.regionalVp !== 'Unknown' ? l.regionalVp : null
                const am = l.areaManager && l.areaManager !== 'Unknown' ? l.areaManager : null
                const vpKey = vp || 'All Locations'
                const amKey = am || 'Unknown'
                if (!byVp[vpKey]) byVp[vpKey] = {}
                if (!byVp[vpKey][amKey]) byVp[vpKey][amKey] = []
                byVp[vpKey][amKey].push(l)
              })
              const hasVpData = Object.keys(byVp).some(k => k !== 'All Locations')
              const renderTable = (locs: any[]) => (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                  <thead><tr style={{ background: 'var(--bg-sunken)' }}>
                    {['Location','Search','Maps','Calls','Dir.','Website'].map((h: string) => (
                      <th key={h} style={{ textAlign: 'left', padding: '4px 10px', fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {locs.map((l: any, i: number) => (
                      <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                        <td style={{ padding: '5px 10px', fontWeight: 500, color: 'var(--text)' }}>{l.name}</td>
                        <td style={{ padding: '5px 10px', fontFamily: 'monospace', color: 'var(--text-muted)' }}>{fmt(l.searchViews)}</td>
                        <td style={{ padding: '5px 10px', fontFamily: 'monospace', color: 'var(--text-muted)' }}>{fmt(l.mapsViews)}</td>
                        <td style={{ padding: '5px 10px', fontFamily: 'monospace', color: 'var(--text-muted)' }}>{fmt(l.calls)}</td>
                        <td style={{ padding: '5px 10px', fontFamily: 'monospace', color: 'var(--text-muted)' }}>{fmt(l.directions)}</td>
                        <td style={{ padding: '5px 10px', fontFamily: 'monospace', color: 'var(--text-muted)' }}>{fmt(l.websiteClicks)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
              if (!hasVpData) return (
                <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginTop: 10 }}>
                  {renderTable(d.locations)}
                </div>
              )
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
                  {Object.entries(byVp).map(([vp, areas]) => {
                    const vpLocs = Object.values(areas).flat() as any[]
                    const vpC = vpLocs.reduce((a,l)=>({calls:a.calls+l.calls,websiteClicks:a.websiteClicks+l.websiteClicks}),{calls:0,websiteClicks:0})
                    return (
                      <div key={vp} style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                        <div style={{ padding: '7px 12px', background: 'var(--brand-navy,#1a2744)', color: 'white', fontSize: 12, fontWeight: 700, display: 'flex', justifyContent: 'space-between' }}>
                          <span>🏢 {vp}</span>
                          <span style={{ fontWeight: 400, fontSize: 11, opacity: 0.8 }}>{vpLocs.length} loc · {fmt(vpC.calls)} calls · {fmt(vpC.websiteClicks)} clicks</span>
                        </div>
                        {Object.entries(areas).map(([am, locs]) => {
                          const amC = (locs as any[]).reduce((a,l)=>({calls:a.calls+l.calls,websiteClicks:a.websiteClicks+l.websiteClicks}),{calls:0,websiteClicks:0})
                          return (
                            <div key={am}>
                              <div style={{ padding: '4px 12px', background: 'var(--bg-sunken)', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)' }}>
                                <span>👤 {am}</span><span>{(locs as any[]).length} loc · {fmt(amC.calls)} calls · {fmt(amC.websiteClicks)} clicks</span>
                              </div>
                              {renderTable(locs as any[])}
                            </div>
                          )
                        })}
                      </div>
                    )
                  })}
                </div>
              )
            })()}
          </>
        ) : (
          <>
            <TileGrid>
              <Tile label="Avg Rating" value={d.reviews?.avgRating ? `${d.reviews.avgRating} ★` : '—'} sub={`${fmt(d.reviews?.total)} total`} hi={d.reviews?.avgRating >= 4.5 ? 'good' : d.reviews?.avgRating >= 4 ? 'warn' : 'bad'} />
              <Tile label="New Reviews" value={fmt(d.reviews?.thisMonth)} sub="this month" />
              <Tile label="Search Views" value={fmt(d.insights?.viewsSearch)} />
              <Tile label="Maps Views" value={fmt(d.insights?.viewsMaps)} />
              <Tile label="Calls" value={fmt(d.insights?.actionsPhone)} />
              <Tile label="Website Clicks" value={fmt(d.insights?.actionsWebsite)} />
              <Tile label="Directions" value={fmt(d.insights?.actionsDriving)} />
            </TileGrid>
            {d.reviews?.recent?.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Recent Reviews</div>
                {d.reviews.recent.map((r: { rating: string; text?: string; author?: string; date?: string }, i: number) => (
                  <div key={i} style={{ background: 'var(--bg-sunken)', borderRadius: 7, padding: '8px 12px', fontSize: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3 }}>
                      <span style={{ color: '#f59e0b', fontSize: 11 }}>{starStr(r.rating)}</span>
                      <span style={{ fontWeight: 600, color: 'var(--brand-navy)' }}>{r.author}</span>
                      <span style={{ color: 'var(--text-faint)', fontSize: 10 }}>{r.date}</span>
                    </div>
                    {r.text && <div style={{ color: 'var(--text)', lineHeight: 1.5 }}>{r.text}</div>}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
    </div>
  );
}

function MetaSection({ ch }: { ch: ChannelData | null }) {
  if (!ch) return <div><SecHead icon="📘" title="Meta Ads" configured={null} /><NoData msg="Loading…" /></div>;
  const d = ch.data;
  return (
    <div>
      <SecHead icon="📘" title="Meta Ads" configured={ch.configured} />
      {!ch.configured
        ? <NoData msg="Meta Ads account not mapped. Add to WINDSOR_META_ACCOUNTS in app/api/reports/meta/route.ts" />
        : !d ? <NoData msg={ch.message} />
        : (
          <>
            <TileGrid>
              <Tile label="Spend" value={money(d.spend)} />
              <Tile label="Impressions" value={fmt(d.impressions)} />
              <Tile label="Reach" value={fmt(d.reach)} />
              <Tile label="Clicks" value={fmt(d.clicks)} />
              <Tile label="CTR" value={pct(d.ctr)} />
              <Tile label="CPC" value={money(d.cpc)} />
              <Tile label="CPM" value={money(d.cpm)} />
              <Tile label="Conversions" value={fmt(d.conversions)} />
              <Tile label="ROAS" value={`${d.roas}x`} hi={d.roas >= 3 ? 'good' : d.roas >= 1 ? 'warn' : 'bad'} />
            </TileGrid>
            {d.campaigns?.length > 0 && (
              <MiniTable
                cols={['Campaign', 'Spend', 'Impressions', 'Clicks', 'Conv.']}
                rows={d.campaigns.map((c: { name: string; spend: number; impressions: number; clicks: number; conversions: number }) => [c.name, money(c.spend), fmt(c.impressions), fmt(c.clicks), fmt(c.conversions)])}
              />
            )}
          </>
        )}
    </div>
  );
}

function GAdsSection({ ch }: { ch: ChannelData | null }) {
  if (!ch) return <div><SecHead icon="🔵" title="Google Ads" configured={null} /><NoData msg="Loading…" /></div>;
  const d = ch.data;
  return (
    <div>
      <SecHead icon="🔵" title="Google Ads" configured={ch.configured} />
      {!ch.configured
        ? <NoData msg="Google Ads account not mapped. Add to WINDSOR_GADS_ACCOUNTS in app/api/reports/google-ads/route.ts" />
        : !d ? <NoData msg={ch.message} />
        : (
          <>
            <TileGrid>
              <Tile label="Raw Spend" value={money(d.spend)} sub="billed to Google" />
              <Tile label="Billed to Client" value={money(d.billedSpend)} sub={d.markupPct > 0 ? `${d.markupPct}% markup` : 'no markup'} hi={d.markupPct > 0 ? 'good' : null} />
              <Tile label="Impressions" value={fmt(d.impressions)} />
              <Tile label="Clicks" value={fmt(d.clicks)} />
              <Tile label="CTR" value={pct(d.ctr)} />
              <Tile label="CPC" value={money(d.cpc)} />
              <Tile label="CPM" value={money(d.cpm)} />
              <Tile label="Conversions" value={fmt(d.conversions)} />
              <Tile label="Cost/Conv." value={money(d.costPerConversion)} />
              <Tile label="ROAS" value={`${d.roas}x`} hi={d.roas >= 3 ? 'good' : d.roas >= 1 ? 'warn' : 'bad'} />
            </TileGrid>
            {d.campaigns?.length > 0 && (
              <MiniTable
                cols={['Campaign', 'Account', 'Spend', 'Clicks', 'CTR', 'Conv.']}
                rows={d.campaigns.map((c: { name: string; account: string; cost: number; clicks: number; ctr: number; conversions: number }) => [c.name, c.account, money(c.cost), fmt(c.clicks), pct(c.ctr), fmt(c.conversions)])}
              />
            )}
          </>
        )}
    </div>
  );
}

function GA4Section({ ch }: { ch: ChannelData | null }) {
  if (!ch) return <div><SecHead icon="📊" title="Website (GA4)" configured={null} /><NoData msg="Loading…" /></div>;
  const d = ch.data as any;
  const fmtDur = (s: number) => s ? `${Math.floor(s/60)}m ${Math.round(s%60)}s` : '—'
  const fmtPct = (n: number) => n ? n.toFixed(1) + '%' : '—'
  return (
    <div>
      <SecHead icon="📊" title="Website (GA4)" configured={ch.configured} />
      {!ch.configured
        ? <NoData msg="GA4 property not mapped for this client." />
        : !d ? <NoData msg={ch.message} />
        : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <TileGrid>
              <Tile label="Sessions"    value={fmt(d.sessions)} />
              <Tile label="Users"       value={fmt(d.users)} />
              <Tile label="New Users"   value={fmt(d.newUsers)} />
              <Tile label="Page Views"  value={fmt(d.pageViews)} />
              <Tile label="Bounce Rate" value={pct(d.bounceRate)} hi={d.bounceRate < 40 ? 'good' : d.bounceRate < 60 ? 'warn' : 'bad'} />
              <Tile label="Avg Session" value={fmtDur(d.avgSessionDuration)} />
              <Tile label="Conversions" value={fmt(d.conversions)} />
              {d.topChannel && <Tile label="Top Channel" value={d.topChannel} />}
            </TileGrid>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {/* Traffic Channels */}
              {d.channels?.length > 0 && (
                <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                  <div style={{ padding: '6px 12px', background: 'var(--bg-sunken)', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Traffic Sources</div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead><tr style={{ background: 'var(--bg-sunken)' }}>
                      <th style={{ padding: '4px 10px', textAlign: 'left', fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>Channel</th>
                      <th style={{ padding: '4px 10px', textAlign: 'right', fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>Sessions</th>
                      <th style={{ padding: '4px 10px', textAlign: 'right', fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>Conv.</th>
                    </tr></thead>
                    <tbody>
                      {d.channels.slice(0, 6).map((c: any, i: number) => (
                        <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                          <td style={{ padding: '5px 10px', color: 'var(--text)', fontWeight: 500, textTransform: 'capitalize' }}>{c.channel}</td>
                          <td style={{ padding: '5px 10px', textAlign: 'right', fontFamily: 'monospace', color: 'var(--text-muted)' }}>{fmt(c.sessions)}</td>
                          <td style={{ padding: '5px 10px', textAlign: 'right', fontFamily: 'monospace', color: 'var(--text-muted)' }}>{fmt(c.conversions)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Devices */}
              {d.devices?.length > 0 && (
                <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                  <div style={{ padding: '6px 12px', background: 'var(--bg-sunken)', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Devices</div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead><tr style={{ background: 'var(--bg-sunken)' }}>
                      <th style={{ padding: '4px 10px', textAlign: 'left', fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>Device</th>
                      <th style={{ padding: '4px 10px', textAlign: 'right', fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>Sessions</th>
                      <th style={{ padding: '4px 10px', textAlign: 'right', fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>Users</th>
                    </tr></thead>
                    <tbody>
                      {d.devices.map((dv: any, i: number) => (
                        <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                          <td style={{ padding: '5px 10px', color: 'var(--text)', fontWeight: 500, textTransform: 'capitalize' }}>{dv.device}</td>
                          <td style={{ padding: '5px 10px', textAlign: 'right', fontFamily: 'monospace', color: 'var(--text-muted)' }}>{fmt(dv.sessions)}</td>
                          <td style={{ padding: '5px 10px', textAlign: 'right', fontFamily: 'monospace', color: 'var(--text-muted)' }}>{fmt(dv.users)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Top Events */}
            {d.events?.length > 0 && (
              <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                <div style={{ padding: '6px 12px', background: 'var(--bg-sunken)', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Top Events</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead><tr style={{ background: 'var(--bg-sunken)' }}>
                    <th style={{ padding: '4px 10px', textAlign: 'left', fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>Event</th>
                    <th style={{ padding: '4px 10px', textAlign: 'right', fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>Count</th>
                    <th style={{ padding: '4px 10px', textAlign: 'right', fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>Users</th>
                  </tr></thead>
                  <tbody>
                    {d.events.map((ev: any, i: number) => (
                      <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                        <td style={{ padding: '5px 10px', color: 'var(--text)', fontWeight: 500, fontFamily: 'monospace', fontSize: 11 }}>{ev.name}</td>
                        <td style={{ padding: '5px 10px', textAlign: 'right', fontFamily: 'monospace', color: 'var(--text-muted)' }}>{fmt(ev.count)}</td>
                        <td style={{ padding: '5px 10px', textAlign: 'right', fontFamily: 'monospace', color: 'var(--text-muted)' }}>{fmt(ev.users)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Top Pages */}
            {d.topPages?.length > 0 && (
              <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                <div style={{ padding: '6px 12px', background: 'var(--bg-sunken)', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Top Pages</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead><tr style={{ background: 'var(--bg-sunken)' }}>
                    <th style={{ padding: '4px 10px', textAlign: 'left', fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>Page</th>
                    <th style={{ padding: '4px 10px', textAlign: 'right', fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>Views</th>
                    <th style={{ padding: '4px 10px', textAlign: 'right', fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>Users</th>
                    <th style={{ padding: '4px 10px', textAlign: 'right', fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>Avg Time</th>
                  </tr></thead>
                  <tbody>
                    {d.topPages.map((pg: any, i: number) => (
                      <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                        <td style={{ padding: '5px 10px', color: 'var(--text)', fontFamily: 'monospace', fontSize: 11, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pg.page}</td>
                        <td style={{ padding: '5px 10px', textAlign: 'right', fontFamily: 'monospace', color: 'var(--text-muted)' }}>{fmt(pg.views)}</td>
                        <td style={{ padding: '5px 10px', textAlign: 'right', fontFamily: 'monospace', color: 'var(--text-muted)' }}>{fmt(pg.users)}</td>
                        <td style={{ padding: '5px 10px', textAlign: 'right', fontFamily: 'monospace', color: 'var(--text-muted)' }}>{fmtDur(pg.avgDuration)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
    </div>
  );
}

function LeadsSection({ ch }: { ch: ChannelData | null }) {
  if (!ch) return null
  if (!ch.configured) return null
  const d = ch.data as any
  if (!d) return <div><SecHead icon="🎯" title="Leads (Jotform)" configured={ch.configured} /><NoData msg={ch.message || 'No leads this month.'} /></div>
  return (
    <div>
      <SecHead icon="🎯" title="Leads (Jotform)" configured={ch.configured} />
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
        <Tile label="Total Leads" value={String(d.totalLeads || 0)} />
        {d.totalSignups > 0 && <Tile label="Signups" value={String(d.totalSignups)} />}
        {d.topManufacturers?.[0] && <Tile label="Top Manufacturer" value={d.topManufacturers[0].name} sub={`${d.topManufacturers[0].count} leads`} />}
      </div>
      {d.topManufacturers?.length > 0 && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginTop: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--bg-sunken)' }}>
                <th style={{ textAlign: 'left', padding: '6px 12px', fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Manufacturer</th>
                <th style={{ textAlign: 'right', padding: '6px 12px', fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Leads</th>
              </tr>
            </thead>
            <tbody>
              {d.topManufacturers.map((m: any, i: number) => (
                <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '6px 12px', color: 'var(--text)', fontWeight: 500 }}>{m.name}</td>
                  <td style={{ padding: '6px 12px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600, color: 'var(--brand-navy, #1a2744)' }}>{m.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function SocialSection({ ch }: { ch: ChannelData | null }) {
  if (!ch) return <div><SecHead icon="🌱" title="Social Media" configured={null} /><NoData msg="Loading…" /></div>;
  const d = ch.data as any;
  if (!ch.configured) return <div><SecHead icon="🌱" title="Social Media (Sprout)" configured={ch.configured} /><NoData msg="No Sprout Social data uploaded for this month." /></div>;
  if (!d?.platforms) return <div><SecHead icon="🌱" title="Social Media (Sprout)" configured={ch.configured} /><NoData msg={ch.message || 'No social data.'} /></div>;

  // Aggregate totals across all platforms
  const totals = Object.values(d.platforms as Record<string, Record<string, number>>).reduce((acc: Record<string, number>, s) => {
    acc.impressions       = (acc.impressions       || 0) + (s.impressions       || 0)
    acc.engagements       = (acc.engagements       || 0) + (s.engagements       || 0)
    acc.post_link_clicks  = (acc.post_link_clicks  || 0) + (s.post_link_clicks  || 0)
    acc.video_views       = (acc.video_views       || 0) + (s.video_views       || 0)
    acc.posts             = (acc.posts             || 0) + (s.posts             || 0)
    return acc
  }, {})
  const engRate = totals.impressions > 0 ? ((totals.engagements / totals.impressions) * 100).toFixed(1) + '%' : '—'

  // Per-profile table from profiles_json if available
  const profiles: any[] = d.profiles || []

  const NETWORK_ICONS: Record<string, string> = { facebook: '👥', instagram: '📸', x: '𝕏', linkedin: '💼', youtube: '▶️', tiktok: '🎵', pinterest: '📌' }

  return (
    <div>
      <SecHead icon="🌱" title="Social Media (Sprout)" configured={ch.configured} />
      <TileGrid>
        <Tile label="Impressions"      value={fmt(totals.impressions)} />
        <Tile label="Engagements"      value={fmt(totals.engagements)} />
        <Tile label="Post Link Clicks" value={fmt(totals.post_link_clicks)} />
        <Tile label="Engagement Rate"  value={engRate} />
        <Tile label="Video Views"      value={fmt(totals.video_views)} />
      </TileGrid>
      {profiles.length > 0 ? (
        <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginTop: 10 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--bg-sunken)' }}>
                {['Profile','Audience','Net Growth','Posts','Impressions','Engagements','Eng. Rate','Video Views'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '6px 10px', fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {profiles.map((p: any, i: number) => {
                const er = p.impressions > 0 ? ((p.engagements / p.impressions) * 100).toFixed(1) + '%' : '0%'
                return (
                  <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '6px 10px', fontWeight: 500, color: 'var(--text)', whiteSpace: 'nowrap' }}>
                      <span style={{ marginRight: 4 }}>{NETWORK_ICONS[p.network] || '📱'}</span>{p.profile}
                    </td>
                    <td style={{ padding: '6px 10px', fontFamily: 'monospace', color: 'var(--text-muted)' }}>{fmt(p.audience)}</td>
                    <td style={{ padding: '6px 10px', fontFamily: 'monospace', color: p.net_audience_growth > 0 ? '#10b981' : p.net_audience_growth < 0 ? '#ef4444' : 'var(--text-muted)' }}>
                      {p.net_audience_growth > 0 ? '+' : ''}{fmt(p.net_audience_growth)}
                    </td>
                    <td style={{ padding: '6px 10px', fontFamily: 'monospace', color: 'var(--text-muted)' }}>{fmt(p.posts)}</td>
                    <td style={{ padding: '6px 10px', fontFamily: 'monospace', color: 'var(--text-muted)' }}>{fmt(p.impressions)}</td>
                    <td style={{ padding: '6px 10px', fontFamily: 'monospace', color: 'var(--text-muted)' }}>{fmt(p.engagements)}</td>
                    <td style={{ padding: '6px 10px', fontFamily: 'monospace', color: 'var(--text-muted)' }}>{er}</td>
                    <td style={{ padding: '6px 10px', fontFamily: 'monospace', color: 'var(--text-muted)' }}>{fmt(p.video_views)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginTop: 10 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--bg-sunken)' }}>
                {['Platform','Posts','Impressions','Engagements','Eng. Rate','Video Views','Followers Gained'].map((h: string) => (
                  <th key={h} style={{ textAlign: 'left', padding: '6px 10px', fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.entries(d.platforms as Record<string, Record<string, number>>).map(([platform, s]) => {
                const er = s.impressions > 0 ? ((s.engagements / s.impressions) * 100).toFixed(1) + '%' : '0%'
                return (
                  <tr key={platform} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '6px 10px', fontWeight: 500 }}>
                      <span style={{ marginRight: 4 }}>{NETWORK_ICONS[platform] || '📱'}</span>
                      <span style={{ textTransform: 'capitalize' }}>{platform}</span>
                    </td>
                    <td style={{ padding: '6px 10px', fontFamily: 'monospace', color: 'var(--text-muted)' }}>{fmt(s.posts)}</td>
                    <td style={{ padding: '6px 10px', fontFamily: 'monospace', color: 'var(--text-muted)' }}>{fmt(s.impressions)}</td>
                    <td style={{ padding: '6px 10px', fontFamily: 'monospace', color: 'var(--text-muted)' }}>{fmt(s.engagements)}</td>
                    <td style={{ padding: '6px 10px', fontFamily: 'monospace', color: 'var(--text-muted)' }}>{er}</td>
                    <td style={{ padding: '6px 10px', fontFamily: 'monospace', color: 'var(--text-muted)' }}>{fmt(s.video_views)}</td>
                    <td style={{ padding: '6px 10px', fontFamily: 'monospace', color: 'var(--text-muted)' }}>{fmt(s.audience_gained)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function EmailSection({ ch }: { ch: ChannelData | null }) {
  if (!ch) return <div><SecHead icon="✉️" title="Email Marketing" configured={null} /><NoData msg="Loading…" /></div>;
  const d = ch.data;
  return (
    <div>
      <SecHead icon="✉️" title="Email Marketing" configured={ch.configured} />
      {!ch.configured
        ? <NoData msg="ActiveCampaign not mapped for this client. Add to AC_CLIENT_MAP in app/api/reports/email/route.ts" />
        : !d ? <NoData msg={ch.message} />
        : (
          <>
            <TileGrid>
              <Tile label="Campaigns" value={fmt(d.campaignCount)} sub="sent" />
              <Tile label="Sends" value={fmt(d.sends)} />
              <Tile label="Opens" value={fmt(d.opens)} />
              <Tile label="Open Rate" value={pct(d.openRate)} hi={d.openRate >= 25 ? 'good' : d.openRate >= 15 ? 'warn' : 'bad'} />
              <Tile label="Clicks" value={fmt(d.clicks)} />
              <Tile label="Click Rate" value={pct(d.clickRate)} hi={d.clickRate >= 3 ? 'good' : d.clickRate >= 1 ? 'warn' : 'bad'} />
              <Tile label="Unsubscribes" value={fmt(d.unsubscribes)} sub={pct(d.unsubRate) + ' rate'} />
            </TileGrid>
            {d.campaigns?.length > 0 && (
              <MiniTable
                cols={['Campaign', 'Subject', 'Sends', 'Open Rate', 'Clicks']}
                rows={d.campaigns.map((c: { name: string; subject: string; sends: number; openRate: string; clicks: number }) => [c.name, c.subject || '—', fmt(c.sends), c.openRate + '%', fmt(c.clicks)])}
              />
            )}
          </>
        )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const supabase = createClient();
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    // Default to previous month if we're in the first week, otherwise current month
    const now = new Date()
    if (now.getDate() <= 20) {
      // First 10 days — likely no data for current month yet, show previous
      const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      return prev.toISOString().slice(0, 7)
    }
    return now.toISOString().slice(0, 7)
  });
  const [expanded, setExpanded] = useState<string | null>(null);
  const [reportData, setReportData] = useState<Record<string, ClientReportData>>({});
  const [loadingClients, setLoadingClients] = useState(true);
  const MONTHS = monthOptions();

  useEffect(() => {
    supabase
      .from('clients')
      .select('id, name, status, reports_enabled, report_color, report_initials, sprout_profiles')
      .eq('status', 'active')
      .order('name')
      .then(({ data }: { data: Client[] | null }) => {
        setClients(data || []);
        setLoadingClients(false);
      });
  }, []);

  const fetchSocial = useCallback(async (clientId: string, month: string): Promise<ChannelData> => {
    const [{ data, error }, { data: profileData }] = await Promise.all([
      supabase.from('report_data').select('platform, metric, value')
        .eq('client_id', clientId).eq('month', month).eq('section', 'social_organic'),
      supabase.from('report_data').select('value')
        .eq('client_id', clientId).eq('month', month).eq('section', 'social_profiles').eq('metric', 'profiles_json').maybeSingle(),
    ]);

    if (error || !data?.length) {
      return { configured: false, message: 'No Sprout Social data for this period.', data: null };
    }

    const platforms: Record<string, Record<string, number>> = {};
    (data as { platform: string; metric: string; value: number }[]).forEach((row) => {
      if (!platforms[row.platform]) platforms[row.platform] = {};
      platforms[row.platform][row.metric] = Number(row.value) || 0;
    });

    let profiles: any[] = []
    try { if (profileData?.value) profiles = JSON.parse(String(profileData.value)) } catch {}

    return { configured: true, data: { platforms, profiles } };
  }, [supabase]);

  const fetchClientData = useCallback(async (clientId: string, month: string) => {
    setReportData(prev => ({
      ...prev,
      [clientId]: { gmb: null, meta: null, gads: null, ga4: null, social: null, email: null, leads: null, loading: true },
    }));

    const q = `clientId=${clientId}&month=${month}`;
    const [gmbRes, metaRes, gadsRes, ga4Res, socialRes, emailRes, leadsRes] = await Promise.allSettled([
      fetch(`/api/reports/gmb?${q}`).then(r => r.json()),
      fetch(`/api/reports/meta?${q}`).then(r => r.json()),
      fetch(`/api/reports/google-ads?${q}`).then(r => r.json()),
      fetch(`/api/reports/ga4?${q}`).then(r => r.json()),
      fetchSocial(clientId, month),
      fetch(`/api/reports/email?${q}`).then(r => r.json()),
      fetch(`/api/reports/jotform?${q}`).then(r => r.json()),
    ]);

    const val = <T,>(r: PromiseSettledResult<T>): T | null =>
      r.status === 'fulfilled' ? r.value : null;

    setReportData(prev => ({
      ...prev,
      [clientId]: {
        gmb: val(gmbRes), meta: val(metaRes), gads: val(gadsRes),
        ga4: val(ga4Res), social: val(socialRes), email: val(emailRes),
        leads: val(leadsRes),
        loading: false,
      },
    }));
  }, [fetchSocial]);

  const handleExpand = (clientId: string) => {
    if (expanded === clientId) { setExpanded(null); return; }
    setExpanded(clientId);
    fetchClientData(clientId, selectedMonth);
  };

  useEffect(() => {
    if (expanded) fetchClientData(expanded, selectedMonth);
  }, [selectedMonth]); // eslint-disable-line

  const reportingCount = clients.filter(c => c.reports_enabled).length;

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1120, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--brand-navy)', margin: 0, letterSpacing: '-0.02em' }}>Reports</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 3, marginBottom: 0 }}>
            {reportingCount} reporting · {clients.length} active clients
          </p>
        </div>
        <select
          value={selectedMonth}
          onChange={e => setSelectedMonth(e.target.value)}
          style={{ fontSize: 13, padding: '7px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-elevated)', color: 'var(--brand-navy)', fontWeight: 600, cursor: 'pointer' }}
        >
          {MONTHS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      <div style={{ display: 'flex', gap: 14, marginBottom: 18, flexWrap: 'wrap' }}>
        {[['⭐','Reputation'],['📘','Meta Ads'],['🔵','Google Ads'],['📊','GA4'],['🌱','Social'],['✉️','Email'],['🎯','Leads']].map(([icon, label]) => (
          <span key={label} style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
            {icon} {label}
          </span>
        ))}
      </div>

      {loadingClients ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Loading clients…</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {clients.map(client => {
            const isOpen = expanded === client.id;
            const d = reportData[client.id];
            const color = client.report_color || '#1a2744';
            const initials = client.report_initials || client.name.slice(0, 2).toUpperCase();
            return (
              <div key={client.id} style={{ border: `1px solid ${isOpen ? color : 'var(--border)'}`, borderRadius: 12, overflow: 'hidden', background: 'var(--bg-elevated)', transition: 'border-color 0.15s' }}>
                <div onClick={() => handleExpand(client.id)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', cursor: 'pointer', userSelect: 'none', background: isOpen ? `${color}0a` : 'transparent' }}>
                  <div style={{ width: 36, height: 36, borderRadius: 9, background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#fff', flexShrink: 0, letterSpacing: '0.02em' }}>
                    {initials}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--brand-navy)' }}>{client.name}</span>
                      {!client.reports_enabled && <span style={{ fontSize: 10, background: '#f3f4f6', color: '#9ca3af', borderRadius: 20, padding: '1px 6px', fontWeight: 600 }}>Reporting off</span>}
                    </div>
                    <div style={{ display: 'flex', gap: 10, marginTop: 2 }}>
                      {[['⭐','Reputation'],['📘','Meta'],['🔵','G Ads'],['📊','GA4'],['🌱','Social'],['✉️','Email'],['🎯','Leads']].map(([icon, lbl]) => (
                        <span key={lbl} style={{ fontSize: 10, color: 'var(--text-faint)' }}>{icon} {lbl}</span>
                      ))}
                    </div>
                  </div>
                  <span style={{ color: 'var(--text-muted)', fontSize: 13, transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }}>▾</span>
                </div>

                {isOpen && (
                  <div style={{ borderTop: `1px solid ${color}25`, padding: '18px 20px', background: 'var(--bg)' }}>
                    {d?.loading && <div style={{ padding: '20px 0', color: 'var(--text-muted)', fontSize: 13 }}>Loading {monthLabel(selectedMonth)} data…</div>}
                    {d && !d.loading && (
                      <>
                        <GmbSection ch={d.gmb} />
                        <Divider />
                        <MetaSection ch={d.meta} />
                        <Divider />
                        <GAdsSection ch={d.gads} />
                        <Divider />
                        <GA4Section ch={d.ga4} />
                        <Divider />
                        <SocialSection ch={d.social} />
                        <Divider />
                        <EmailSection ch={d.email} />
                        {(d as any).leads?.configured && <LeadsSection ch={(d as any).leads} />}
                        <div style={{ display: 'flex', gap: 8, marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                          <a href={`/reports/${client.id}`} style={{ fontSize: 12, fontWeight: 600, color: color, border: `1px solid ${color}`, borderRadius: 7, padding: '6px 12px', textDecoration: 'none' }}>Full Report →</a>
                          <button onClick={(e) => { e.stopPropagation(); fetchClientData(client.id, selectedMonth); }} style={{ fontSize: 12, color: 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: 7, padding: '6px 12px', background: 'transparent', cursor: 'pointer' }}>↺ Refresh</button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
