'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';

interface Message {
  id: string;
  body: string;
  authorName?: string;
  authorMemberId?: string;
  from_member_id?: string;
  to_member_id?: string;
  sent_by?: string;
  direction?: string;
  created_at: string;
  work_order_id?: string;
  wo_id?: string;
  replies?: Message[];
}

interface DmThread { partnerId: string; partnerName: string; isPancho: boolean; lastMessage: string; lastAt: string; unread: number; }
interface ClientThread { clientId: string; clientName: string; lastMessage: string | null; lastAt: string | null; unread: number; }
interface SidebarData { channels: string[]; dmThreads: DmThread[]; clientThreads: ClientThread[]; unreadTotal: number; }

const MEMBER_ID = typeof window !== 'undefined' ? (localStorage.getItem('ab_member_id') ?? 'adrian') : 'adrian';
const CHANNEL_ICONS: Record<string, string> = { general: '#', standup: '☀', checkout: '✓', design: '✦', social: '◈', web: '⌗', ads: '◎' };

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function Avatar({ name, size = 30 }: { name: string; size?: number }) {
  const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  const colors = ['#2D4A6E','#5B3A6E','#1A5C4A','#6E3A1A','#1A3A6E','#4A1A5C'];
  const color = colors[name.charCodeAt(0) % colors.length];
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.38, fontWeight: 600, color: '#fff', flexShrink: 0 }}>
      {initials}
    </div>
  );
}

function WOBadge({ woId }: { woId: string }) {
  return (
    <a href={`/dashboard/work-orders/${woId}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'rgba(212,175,55,0.12)', border: '1px solid rgba(212,175,55,0.3)', borderRadius: 4, padding: '1px 7px', fontSize: 11, color: '#D4AF37', textDecoration: 'none', fontWeight: 500, marginTop: 4 }}>
      ⬡ WO
    </a>
  );
}

function MessageBubble({ msg, isMine, showAvatar = true }: { msg: Message; isMine: boolean; showAvatar?: boolean }) {
  const name = msg.authorName ?? msg.sent_by ?? msg.from_member_id ?? 'Unknown';
  const isClient = msg.direction === 'inbound';
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 2, flexDirection: isMine ? 'row-reverse' : 'row' }}>
      {showAvatar ? <Avatar name={name} /> : <div style={{ width: 30 }} />}
      <div style={{ maxWidth: '72%' }}>
        {showAvatar && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', marginBottom: 2, flexDirection: isMine ? 'row-reverse' : 'row' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: isClient ? '#D4AF37' : 'var(--text-secondary,#666)' }}>{isClient ? `🏢 ${name}` : name}</span>
            <span style={{ fontSize: 10, color: '#999' }}>{timeAgo(msg.created_at)}</span>
          </div>
        )}
        <div style={{ background: isMine ? '#1C2B42' : 'var(--bg-card,#f5f5f5)', border: `1px solid ${isMine ? 'rgba(212,175,55,0.2)' : 'var(--border,#e5e5e5)'}`, borderRadius: isMine ? '12px 4px 12px 12px' : '4px 12px 12px 12px', padding: '8px 12px', fontSize: 13, lineHeight: 1.5, color: isMine ? '#e8e8e8' : 'var(--text,#111)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {msg.body}
        </div>
        {(msg.work_order_id || msg.wo_id) && <WOBadge woId={(msg.work_order_id ?? msg.wo_id)!} />}
        {msg.replies?.length ? (
          <div style={{ marginTop: 6, marginLeft: 8, borderLeft: '2px solid var(--border,#e5e5e5)', paddingLeft: 10 }}>
            {msg.replies.map((r, i) => <MessageBubble key={r.id} msg={r} isMine={r.authorMemberId === MEMBER_ID} showAvatar={i === 0} />)}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Composer({ onSend }: { onSend: (body: string, woId?: string) => void }) {
  const [body, setBody] = useState('');
  const [woId, setWoId] = useState('');
  const [showWo, setShowWo] = useState(false);
  const [woSearch, setWoSearch] = useState('');
  const [woResults, setWoResults] = useState<any[]>([]);

  useEffect(() => {
    if (woSearch.length < 2) { setWoResults([]); return; }
    const t = setTimeout(async () => {
      const r = await fetch(`/api/work-orders?search=${encodeURIComponent(woSearch)}&limit=6`);
      const d = await r.json();
      setWoResults(d.workOrders ?? d.data ?? []);
    }, 300);
    return () => clearTimeout(t);
  }, [woSearch]);

  const submit = () => {
    if (!body.trim()) return;
    onSend(body.trim(), woId || undefined);
    setBody(''); setWoId(''); setShowWo(false);
  };

  return (
    <div style={{ borderTop: '1px solid var(--border,#e5e5e5)', padding: '12px 16px', background: 'var(--bg,#fff)' }}>
      {woId && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <WOBadge woId={woId} />
          <button onClick={() => setWoId('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#999', fontSize: 12 }}>✕</button>
        </div>
      )}
      {showWo && (
        <div style={{ background: 'var(--bg-card,#f5f5f5)', border: '1px solid var(--border,#e5e5e5)', borderRadius: 8, padding: 10, marginBottom: 8 }}>
          <input autoFocus placeholder="Search work orders…" value={woSearch} onChange={e => setWoSearch(e.target.value)}
            style={{ width: '100%', padding: '6px 10px', border: '1px solid var(--border,#e5e5e5)', borderRadius: 6, fontSize: 13, background: 'var(--bg,#fff)', color: 'var(--text,#111)' }} />
          {woResults.map((wo: any) => (
            <div key={wo.id} onClick={() => { setWoId(wo.id); setShowWo(false); setWoSearch(''); }}
              style={{ padding: '6px 8px', cursor: 'pointer', borderRadius: 4, marginTop: 4, fontSize: 12, display: 'flex', gap: 8 }}>
              <span style={{ color: '#D4AF37' }}>⬡</span><span>{wo.title}</span>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <button onClick={() => setShowWo(v => !v)} title="Attach WO"
          style={{ background: 'none', border: '1px solid var(--border,#e5e5e5)', borderRadius: 6, padding: '6px 10px', cursor: 'pointer', color: woId ? '#D4AF37' : '#999', fontSize: 13, flexShrink: 0 }}>⬡</button>
        <textarea value={body} onChange={e => setBody(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
          placeholder="Type a message… (@a&b to notify everyone)"
          rows={1}
          style={{ flex: 1, resize: 'none', border: '1px solid var(--border,#e5e5e5)', borderRadius: 8, padding: '8px 12px', fontSize: 13, lineHeight: 1.5, background: 'var(--bg-card,#f5f5f5)', color: 'var(--text,#111)', fontFamily: 'inherit', outline: 'none', maxHeight: 120 }} />
        <button onClick={submit} disabled={!body.trim()}
          style={{ background: body.trim() ? '#D4AF37' : '#ccc', border: 'none', borderRadius: 8, padding: '8px 14px', color: '#fff', cursor: body.trim() ? 'pointer' : 'default', fontSize: 15, flexShrink: 0 }}>↑</button>
      </div>
    </div>
  );
}

function MessagePane({ section, id, label, isClient }: { section: string; id: string; label: string; isClient?: boolean }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetch(`/api/feed?memberId=${MEMBER_ID}&section=${section}&id=${encodeURIComponent(id)}`);
    const d = await r.json();
    setMessages(d.messages ?? []);
    setLoading(false);
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  }, [section, id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = setInterval(load, 8000); return () => clearInterval(t); }, [load]);

  const handleSend = async (body: string, woId?: string) => {
    await fetch('/api/feed/post', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId: MEMBER_ID, section, channelOrId: id, body, workOrderId: woId }),
    });
    load();
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border,#e5e5e5)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, background: 'var(--bg,#fff)' }}>
        <span style={{ fontSize: 18 }}>{section === 'channel' ? (CHANNEL_ICONS[id] ?? '#') : section === 'pancho' ? '✦' : isClient ? '🏢' : '●'}</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{label}</div>
          {isClient && <div style={{ fontSize: 11, color: '#999' }}>Client communications</div>}
          {section === 'pancho' && <div style={{ fontSize: 11, color: '#999' }}>Private AI assistant</div>}
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {loading && <div style={{ textAlign: 'center', color: '#999', fontSize: 13, padding: 20 }}>Loading…</div>}
        {!loading && messages.length === 0 && <div style={{ textAlign: 'center', color: '#999', fontSize: 13, padding: 40 }}>Nothing here yet — start the conversation.</div>}
        {messages.map((msg, i) => {
          const prev = messages[i - 1];
          const sameAuthor = prev && (prev.authorMemberId ?? prev.from_member_id) === (msg.authorMemberId ?? msg.from_member_id) && new Date(msg.created_at).getTime() - new Date(prev.created_at).getTime() < 180000;
          const isMine = (msg.authorMemberId ?? msg.from_member_id ?? msg.sent_by) === MEMBER_ID || msg.direction === 'outbound';
          return <MessageBubble key={msg.id} msg={msg} isMine={isMine} showAvatar={!sameAuthor} />;
        })}
        <div ref={bottomRef} />
      </div>
      <Composer onSend={handleSend} />
    </div>
  );
}

export default function FeedPage() {
  const searchParams = useSearchParams();
  const [sidebar, setSidebar] = useState<SidebarData | null>(null);
  const [active, setActive] = useState<{ section: string; id: string; label: string } | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    const load = () => fetch(`/api/feed?memberId=${MEMBER_ID}&section=sidebar`).then(r => r.json()).then(setSidebar);
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const dm = searchParams.get('dm');
    const client = searchParams.get('client');
    if (dm === 'pancho') setActive({ section: 'pancho', id: 'pancho', label: 'Pancho' });
    else if (dm) setActive({ section: 'dm', id: dm, label: dm });
    else if (client) setActive({ section: 'client', id: client, label: client });
    else setActive({ section: 'channel', id: 'general', label: 'general' });
  }, [searchParams]);

  const nav = (section: string, id: string, label: string) => setActive({ section, id, label });

  const Item = ({ section, id, label, unread, icon }: { section: string; id: string; label: string; unread?: number; icon?: string }) => {
    const isActive = active?.section === section && active?.id === id;
    return (
      <div onClick={() => nav(section, id, label)}
        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 13, background: isActive ? 'rgba(212,175,55,0.12)' : 'transparent', color: isActive ? '#D4AF37' : 'var(--text,#111)', fontWeight: isActive ? 600 : 400 }}>
        <span style={{ width: 16, textAlign: 'center', flexShrink: 0, fontSize: 12 }}>{icon ?? '#'}</span>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        {unread ? <span style={{ background: '#D4AF37', color: '#fff', borderRadius: 10, fontSize: 10, fontWeight: 700, padding: '1px 6px' }}>{unread}</span> : null}
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 60px)', overflow: 'hidden', background: 'var(--bg,#fff)' }}>
      <div style={{ width: sidebarOpen ? 240 : 0, minWidth: sidebarOpen ? 240 : 0, borderRight: '1px solid var(--border,#e5e5e5)', display: 'flex', flexDirection: 'column', overflow: 'hidden', transition: 'width 0.2s, min-width 0.2s', background: 'var(--bg-sidebar,#fafafa)' }}>
        <div style={{ padding: '16px 12px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 800, fontSize: 15 }}>The Feed</span>
          {sidebar?.unreadTotal ? <span style={{ background: '#D4AF37', color: '#fff', borderRadius: 10, fontSize: 10, fontWeight: 700, padding: '2px 7px' }}>{sidebar.unreadTotal}</span> : null}
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 4px' }}>
          <div style={{ padding: '10px 8px 4px', fontSize: 10, fontWeight: 700, color: '#999', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Channels</div>
          {(sidebar?.channels ?? ['general','standup','checkout','design','social','web','ads']).map(ch => (
            <Item key={ch} section="channel" id={ch} label={ch} icon={CHANNEL_ICONS[ch] ?? '#'} />
          ))}
          <div style={{ padding: '14px 8px 4px', fontSize: 10, fontWeight: 700, color: '#999', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Clients</div>
          {(sidebar?.clientThreads ?? []).map(ct => (
            <Item key={ct.clientId} section="client" id={ct.clientId} label={ct.clientName} unread={ct.unread || undefined} icon="🏢" />
          ))}
          <div style={{ padding: '14px 8px 4px', fontSize: 10, fontWeight: 700, color: '#999', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Direct Messages</div>
          <Item section="pancho" id="pancho" label="Pancho" icon="✦" />
          {(sidebar?.dmThreads ?? []).filter(t => !t.isPancho).map(t => (
            <Item key={t.partnerId} section="dm" id={t.partnerId} label={t.partnerName} unread={t.unread || undefined} icon="•" />
          ))}
        </div>
      </div>
      <button onClick={() => setSidebarOpen(v => !v)}
        style={{ position: 'absolute', left: sidebarOpen ? 228 : 4, top: '50%', transform: 'translateY(-50%)', zIndex: 10, background: 'var(--bg-card,#f0f0f0)', border: '1px solid var(--border,#e5e5e5)', borderRadius: '50%', width: 24, height: 24, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#666', transition: 'left 0.2s' }}>
        {sidebarOpen ? '‹' : '›'}
      </button>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {active ? (
          <MessagePane section={active.section} id={active.id} label={active.label} isClient={active.section === 'client'} />
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999', fontSize: 14 }}>Select a channel, client, or DM</div>
        )}
      </div>
    </div>
  );
}
