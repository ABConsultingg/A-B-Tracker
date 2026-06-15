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
  const d = ch.data;
  return (
    <div>
      <SecHead icon="⭐" title="Reputation Management" configured={ch.configured} />
      {!ch.configured
        ? <NoData msg="GMB location not mapped. Add to GMB_LOCATION_MAP in app/api/reports/gmb/route.ts" />
        : !d ? <NoData msg={ch.message} />
        : (
          <>
            <TileGrid>
              <Tile label="Avg Rating" value={d.reviews.avgRating ? `${d.reviews.avgRating} ★` : '—'} sub={`${fmt(d.reviews.total)} total`} hi={d.reviews.avgRating >= 4.5 ? 'good' : d.reviews.avgRating >= 4 ? 'warn' : 'bad'} />
              <Tile label="New Reviews" value={fmt(d.reviews.thisMonth)} sub="this month" />
              <Tile label="Search Views" value={fmt(d.insights.viewsSearch)} />
              <Tile label="Maps Views" value={fmt(d.insights.viewsMaps)} />
              <Tile label="Calls" value={fmt(d.insights.actionsPhone)} />
              <Tile label="Website Clicks" value={fmt(d.insights.actionsWebsite)} />
              <Tile label="Directions" value={fmt(d.insights.actionsDriving)} />
            </TileGrid>
            {d.reviews.recent?.length > 0 && (
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
              <Tile label="Spend" value={money(d.spend)} />
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
                cols={['Campaign', 'Spend', 'Clicks', 'CTR', 'Conv.']}
                rows={d.campaigns.map((c: { name: string; cost: number; clicks: number; ctr: number; conversions: number }) => [c.name, money(c.cost), fmt(c.clicks), pct(c.ctr), fmt(c.conversions)])}
              />
            )}
          </>
        )}
    </div>
  );
}

function GA4Section({ ch }: { ch: ChannelData | null }) {
  if (!ch) return <div><SecHead icon="📊" title="Website (GA4)" configured={null} /><NoData msg="Loading…" /></div>;
  const d = ch.data;
  return (
    <div>
      <SecHead icon="📊" title="Website (GA4)" configured={ch.configured} />
      {!ch.configured
        ? <NoData msg="GA4 property not mapped for this client." />
        : !d ? <NoData msg={ch.message} />
        : (
          <TileGrid>
            <Tile label="Sessions" value={fmt(d.sessions)} />
            <Tile label="Users" value={fmt(d.users)} />
            <Tile label="New Users" value={fmt(d.newUsers)} />
            <Tile label="Bounce Rate" value={pct(d.bounceRate)} hi={d.bounceRate < 40 ? 'good' : d.bounceRate < 60 ? 'warn' : 'bad'} />
            <Tile label="Avg Session" value={d.avgSessionDuration ? `${Math.floor(d.avgSessionDuration / 60)}m ${Math.round(d.avgSessionDuration % 60)}s` : '—'} />
            <Tile label="Conversions" value={fmt(d.conversions)} />
            {d.topChannel && <Tile label="Top Channel" value={d.topChannel} />}
          </TileGrid>
        )}
    </div>
  );
}

function SocialSection({ ch }: { ch: ChannelData | null }) {
  if (!ch) return <div><SecHead icon="🌱" title="Social Media" configured={null} /><NoData msg="Loading…" /></div>;
  const d = ch.data;
  const PLATFORM_ICONS: Record<string, string> = {
    facebook: '👥', instagram: '📸', x: '𝕏', linkedin: '💼', youtube: '▶️', tiktok: '🎵',
  };
  return (
    <div>
      <SecHead icon="🌱" title="Social Media (Sprout)" configured={ch.configured} />
      {!ch.configured
        ? <NoData msg="No Sprout Social data uploaded for this month." />
        : !d?.platforms || Object.keys(d.platforms).length === 0
        ? <NoData msg={ch.message || 'No social data for this period.'} />
        : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {Object.entries(d.platforms).map(([platform, stats]) => {
              const s = stats as Record<string, number>;
              return (
                <div key={platform}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span>{PLATFORM_ICONS[platform] || '📱'}</span>
                    <span style={{ textTransform: 'capitalize' }}>{platform}</span>
                  </div>
                  <TileGrid>
                    <Tile label="Posts" value={fmt(s.posts)} />
                    <Tile label="Impressions" value={fmt(s.impressions)} />
                    <Tile label="Engagements" value={fmt(s.engagements)} />
                    <Tile label="Followers Gained" value={fmt(s.audience_gained)} hi={s.audience_gained > 0 ? 'good' : null} />
                  </TileGrid>
                </div>
              );
            })}
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
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().toISOString().slice(0, 7));
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
    const { data, error } = await supabase
      .from('report_data')
      .select('platform, metric, value')
      .eq('client_id', clientId)
      .eq('month', month)
      .eq('section', 'social_organic');

    if (error || !data?.length) {
      return { configured: false, message: 'No Sprout Social data for this period.', data: null };
    }

    const platforms: Record<string, Record<string, number>> = {};
    (data as { platform: string; metric: string; value: number }[]).forEach((row) => {
      if (!platforms[row.platform]) platforms[row.platform] = {};
      platforms[row.platform][row.metric] = Number(row.value) || 0;
    });

    return { configured: true, data: { platforms } };
  }, [supabase]);

  const fetchClientData = useCallback(async (clientId: string, month: string) => {
    setReportData(prev => ({
      ...prev,
      [clientId]: { gmb: null, meta: null, gads: null, ga4: null, social: null, email: null, loading: true },
    }));

    const q = `clientId=${clientId}&month=${month}`;
    const [gmbRes, metaRes, gadsRes, ga4Res, socialRes, emailRes] = await Promise.allSettled([
      fetch(`/api/reports/gmb?${q}`).then(r => r.json()),
      fetch(`/api/reports/meta?${q}`).then(r => r.json()),
      fetch(`/api/reports/google-ads?${q}`).then(r => r.json()),
      fetch(`/api/reports/ga4?${q}`).then(r => r.json()),
      fetchSocial(clientId, month),
      fetch(`/api/reports/email?${q}`).then(r => r.json()),
    ]);

    const val = <T,>(r: PromiseSettledResult<T>): T | null =>
      r.status === 'fulfilled' ? r.value : null;

    setReportData(prev => ({
      ...prev,
      [clientId]: {
        gmb: val(gmbRes), meta: val(metaRes), gads: val(gadsRes),
        ga4: val(ga4Res), social: val(socialRes), email: val(emailRes),
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
        {[['⭐','Reputation'],['📘','Meta Ads'],['🔵','Google Ads'],['📊','GA4'],['🌱','Social'],['✉️','Email']].map(([icon, label]) => (
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
                      {[['⭐','Reputation'],['📘','Meta'],['🔵','G Ads'],['📊','GA4'],['🌱','Social'],['✉️','Email']].map(([icon, lbl]) => (
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
