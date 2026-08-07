/**
 * A&B Consulting Group — Embeddable AI Sales Chatbot
 * 
 * INSTALL ON ANY SITE:
 * ─────────────────────────────────────────────────────
 * <script>
 *   window.ABChatConfig = {
 *     apiBase: "https://www.abconsultingg.com",   // your Vercel domain
 *
 *     // ── For A&B's own site ──
 *     isABSite: true,
 *
 *     // ── For client sites ──
 *     isABSite: false,
 *     businessName: "Smith Roofing",
 *     industry: "Roofing Contractor",
 *     location: "Chicago, IL",
 *     agentName: "Mike",
 *     agentEmail: "mike@smithroofing.com",
 *     calendarId: "mike@smithroofing.com",
 *     services: ["Roof replacement","Storm damage repair","Gutters"],
 *     customContext: "We serve the North Shore. 20 years in business.",
 *     acListId: "5",                          // NOTE: not read by this file
 *     brandColor: "#C0392B",                  // drives header, launcher, buttons
 *     brandDark: "#1a3d5c",                   // optional: header override
 *     brandName: "Smith Roofing Assistant",   // optional: widget header name
 *     botName: "Sam",                         // optional: what the bot calls itself
 *     greeting: "...",                        // optional: override opening line
 *     bookingLabel: "Get a Free Estimate",    // optional: override CTA button
 *   };
 *
 * With isABSite:false the widget is fully white-labeled — no A&B, Alex or
 * Adrian in the greeting, CTA, transcript, or system prompt. The only A&B
 * branding is the "Powered by A&B AI" footer, which is intentional.
 * </script>
 * <script src="https://www.abconsultingg.com/chatbot.js" async></script>
 * ─────────────────────────────────────────────────────
 */

(function () {
  "use strict";

  // ─── Config ────────────────────────────────────────────────────────────────
  const cfg = window.ABChatConfig || {};
  const API = (cfg.apiBase || "https://www.abconsultingg.com").replace(/\/$/, "");
  const IS_AB       = cfg.isABSite !== false;
  const BRAND_COLOR = cfg.brandColor || "#E8541A";
  // Header colour. On a client site it follows their brandColor unless they
  // explicitly set brandDark — otherwise every client header rendered in
  // A&B navy regardless of their branding.
  const BRAND_DARK  = cfg.brandDark  || (IS_AB ? "#0F1C2E" : BRAND_COLOR);
  const WIDGET_NAME = cfg.brandName  || (IS_AB ? "A&B Consulting" : cfg.businessName || "Assistant");
  // Only fall back to A&B's own agent on A&B's own site. On a client site an
  // unset agentName must never leak "Adrian" into the UI.
  const AGENT_NAME  = cfg.agentName  || (IS_AB ? "Adrian" : "");
  const BUSINESS    = cfg.businessName || WIDGET_NAME;
  // Name the bot uses for itself. "Alex" is A&B's persona, not a client's.
  const BOT_NAME    = cfg.botName || (IS_AB ? "Alex" : "");

  // Opening line. On client sites it must not mention A&B, and must not offer
  // the marketing-score flow, which is an A&B-only feature.
  const GREETING = cfg.greeting || (IS_AB
    ? "Hey — I'm Alex from A&B. I can answer questions, show you our work, or run a free marketing score for your business right now and email it to you. What brought you here today?"
    : `Hi! I'm here to help with any questions about ${BUSINESS}. Looking for a free estimate, or have questions about our services?`);

  // Booking CTA. "Book a call with Adrian" is A&B-specific.
  const BOOK_LABEL = cfg.bookingLabel || (IS_AB
    ? (AGENT_NAME ? "Book a call with " + AGENT_NAME : "Book a call")
    : "Get a Free Estimate");

  // Who we say will follow up when no slots are open.
  const FOLLOWUP_WHO = AGENT_NAME || "our team";

  // Header avatar initial. Must never read index 0 of an empty string — on a
  // client site with no agentName that renders the literal text "undefined".
  const AVATAR_CHAR =
    String(BOT_NAME || BUSINESS || WIDGET_NAME || "?").trim().charAt(0).toUpperCase() || "?";

  // Calendar booking needs a per-client calendarId plus Google OAuth access to
  // it. Client sites do not have that, so the CTA captures a lead in-chat
  // instead of calling /api/availability (which failed and left the button
  // reading "Try again").
  const CAN_BOOK = IS_AB || !!cfg.calendarId;

  // Config values are set by whoever installs the widget and are interpolated
  // into innerHTML, so escape them.
  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // ─── State ─────────────────────────────────────────────────────────────────
  let messages    = [];
  let transcript  = [];
  let open        = false;
  let typing      = false;
  let lead        = null;
  let slots       = [];
  let sessionStart = Date.now();

  // ─── Behavior tracking ─────────────────────────────────────────────────────
  function getContext() {
    return {
      page:        window.location.pathname,
      referrer:    document.referrer,
      timeOnPage:  Math.round((Date.now() - sessionStart) / 1000),
      device:      window.innerWidth < 768 ? "mobile" : "desktop",
      title:       document.title,
    };
  }

  // ─── Styles ────────────────────────────────────────────────────────────────
  const style = document.createElement("style");
  style.textContent = `
    #ab-chat-root * { box-sizing: border-box; font-family: Inter, system-ui, sans-serif; margin: 0; padding: 0; }
    #ab-chat-btn {
      position: fixed; bottom: 24px; right: 24px; z-index: 99998;
      width: 56px; height: 56px; border-radius: 50%;
      background: ${BRAND_COLOR}; border: none; cursor: pointer;
      box-shadow: 0 4px 16px rgba(0,0,0,0.18);
      display: flex; align-items: center; justify-content: center;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    #ab-chat-btn:hover { transform: scale(1.06); box-shadow: 0 6px 20px rgba(0,0,0,0.22); }
    #ab-chat-btn svg { width: 26px; height: 26px; fill: white; }
    #ab-chat-badge {
      position: absolute; top: -4px; right: -4px;
      background: #e74c3c; color: white; border-radius: 50%;
      width: 18px; height: 18px; font-size: 11px; font-weight: 600;
      display: flex; align-items: center; justify-content: center;
      display: none;
    }
    #ab-chat-window {
      position: fixed; bottom: 92px; right: 24px; z-index: 99999;
      width: 360px; max-width: calc(100vw - 32px);
      height: 520px; max-height: calc(100vh - 120px);
      background: #fff; border-radius: 16px;
      box-shadow: 0 8px 40px rgba(0,0,0,0.16);
      display: flex; flex-direction: column; overflow: hidden;
      transform: scale(0.92) translateY(12px); opacity: 0;
      transition: transform 0.22s cubic-bezier(0.34,1.56,0.64,1), opacity 0.18s;
      pointer-events: none;
    }
    #ab-chat-window.open { transform: scale(1) translateY(0); opacity: 1; pointer-events: all; }
    #ab-chat-header {
      background: ${BRAND_DARK}; color: white; padding: 14px 16px;
      display: flex; align-items: center; gap: 10px; flex-shrink: 0;
    }
    #ab-chat-header .avatar {
      width: 36px; height: 36px; border-radius: 50%;
      background: ${BRAND_COLOR}; display: flex; align-items: center;
      justify-content: center; font-weight: 700; font-size: 15px; flex-shrink: 0;
    }
    #ab-chat-header .info { flex: 1; min-width: 0; }
    #ab-chat-header .name { font-weight: 600; font-size: 14px; }
    #ab-chat-header .status { font-size: 11px; opacity: 0.7; margin-top: 1px; }
    #ab-chat-close {
      background: none; border: none; color: rgba(255,255,255,0.7);
      cursor: pointer; padding: 4px; border-radius: 4px; flex-shrink: 0;
      font-size: 20px; line-height: 1; transition: color 0.15s;
    }
    #ab-chat-close:hover { color: white; }
    #ab-chat-messages {
      flex: 1; overflow-y: auto; padding: 16px 14px;
      display: flex; flex-direction: column; gap: 10px;
      scroll-behavior: smooth;
    }
    #ab-chat-messages::-webkit-scrollbar { width: 4px; }
    #ab-chat-messages::-webkit-scrollbar-thumb { background: #e0e0e0; border-radius: 2px; }
    .ab-msg { max-width: 82%; display: flex; flex-direction: column; gap: 2px; }
    .ab-msg.bot { align-self: flex-start; }
    .ab-msg.user { align-self: flex-end; }
    .ab-bubble {
      padding: 10px 13px; border-radius: 14px; font-size: 13.5px;
      line-height: 1.5; word-break: break-word;
    }
    .ab-msg.bot .ab-bubble { background: #f3f4f6; color: #1a1a1a; border-bottom-left-radius: 4px; }
    .ab-msg.user .ab-bubble { background: ${BRAND_COLOR}; color: white; border-bottom-right-radius: 4px; }
    .ab-time { font-size: 10px; color: #aaa; padding: 0 4px; }
    .ab-msg.user .ab-time { text-align: right; }
    .ab-typing { display: flex; gap: 4px; align-items: center; padding: 12px 14px; }
    .ab-typing span {
      width: 7px; height: 7px; border-radius: 50%; background: #aaa;
      animation: ab-bounce 1.2s infinite;
    }
    .ab-typing span:nth-child(2) { animation-delay: 0.2s; }
    .ab-typing span:nth-child(3) { animation-delay: 0.4s; }
    @keyframes ab-bounce { 0%,60%,100%{transform:translateY(0)} 30%{transform:translateY(-5px)} }
    #ab-chat-slots { padding: 10px 14px; display: flex; flex-direction: column; gap: 7px; flex-shrink: 0; }
    #ab-chat-slots .slot-label { font-size: 12px; font-weight: 600; color: #555; margin-bottom: 2px; }
    .ab-slot-btn {
      width: 100%; padding: 9px 12px; border: 1.5px solid ${BRAND_COLOR};
      color: ${BRAND_COLOR}; background: white; border-radius: 8px;
      font-size: 12.5px; font-weight: 500; cursor: pointer; text-align: left;
      transition: background 0.15s, color 0.15s;
    }
    .ab-slot-btn:hover { background: ${BRAND_COLOR}; color: white; }
    #ab-chat-footer {
      border-top: 1px solid #f0f0f0; padding: 10px 12px;
      display: flex; gap: 8px; flex-shrink: 0;
    }
    #ab-chat-input {
      flex: 1; border: 1.5px solid #e5e7eb; border-radius: 10px;
      padding: 9px 12px; font-size: 13.5px; outline: none; resize: none;
      max-height: 100px; transition: border-color 0.15s; line-height: 1.4;
      font-family: inherit;
    }
    #ab-chat-input:focus { border-color: ${BRAND_COLOR}; }
    #ab-chat-send {
      width: 38px; height: 38px; border-radius: 10px; border: none;
      background: ${BRAND_COLOR}; color: white; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0; transition: opacity 0.15s; align-self: flex-end;
    }
    #ab-chat-send:hover { opacity: 0.88; }
    #ab-chat-send svg { width: 17px; height: 17px; fill: white; }
    .ab-confirm-card {
      background: #f0faf5; border: 1.5px solid #34d399; border-radius: 10px;
      padding: 12px 14px; font-size: 12.5px; color: #065f46; margin: 4px 0;
    }
    .ab-confirm-card strong { display: block; font-size: 13px; margin-bottom: 4px; }
    .ab-powered { text-align: center; font-size: 10px; color: #ccc; padding: 4px 0 2px; flex-shrink: 0; }
    @media (max-width: 860px) {
      /* Sit above the site's sticky mobile CTA bar so they don't overlap */
      #ab-chat-btn { right: 16px; bottom: 84px; }
      #ab-chat-window { bottom: 150px; }
    }
    @media (max-width: 400px) {
      #ab-chat-window { right: 8px; bottom: 150px; width: calc(100vw - 16px); }
      #ab-chat-btn { right: 16px; bottom: 84px; }
    }
  `;
  document.head.appendChild(style);

  // ─── DOM ───────────────────────────────────────────────────────────────────
  const root = document.createElement("div");
  root.id = "ab-chat-root";
  root.innerHTML = `
    <button id="ab-chat-btn" aria-label="Chat with us">
      <span id="ab-chat-badge">1</span>
      <svg viewBox="0 0 24 24"><path d="M20 2H4a2 2 0 00-2 2v18l4-4h14a2 2 0 002-2V4a2 2 0 00-2-2zm-2 10H6v-2h12v2zm0-4H6V6h12v2z"/></svg>
    </button>
    <div id="ab-chat-window" role="dialog" aria-label="Chat assistant">
      <div id="ab-chat-header">
        <div class="avatar">${AVATAR_CHAR}</div>
        <div class="info">
          <div class="name">${WIDGET_NAME}</div>
          <div class="status">● Online now</div>
        </div>
        <button id="ab-chat-close" aria-label="Close chat">×</button>
      </div>
      <div id="ab-chat-messages"></div>
      <div id="ab-chat-slots" style="display:none"></div>
      <div class="ab-powered">Powered by A&B AI</div>
      <div id="ab-chat-footer">
        <textarea id="ab-chat-input" placeholder="Type a message…" rows="1" aria-label="Message"></textarea>
        <button id="ab-chat-send" aria-label="Send">
          <svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(root);

  // ─── Element refs ──────────────────────────────────────────────────────────
  const btn      = root.querySelector("#ab-chat-btn");
  const win      = root.querySelector("#ab-chat-window");
  const msgList  = root.querySelector("#ab-chat-messages");
  const input    = root.querySelector("#ab-chat-input");
  const sendBtn  = root.querySelector("#ab-chat-send");
  const badge    = root.querySelector("#ab-chat-badge");
  const slotsEl  = root.querySelector("#ab-chat-slots");

  // ─── Helpers ───────────────────────────────────────────────────────────────
  function parseMarkdown(text) {
    return text
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g, '<a href="$2" target="_blank" style="color:#E8541A;text-decoration:underline">$1</a>')
      .replace(/`([^`]+)`/g, '<code style="background:rgba(0,0,0,0.1);padding:2px 4px;border-radius:3px;font-size:12px">$1</code>');
  }

  function ts() {
    return new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }

  function addMsg(role, text) {
    const wrap = document.createElement("div");
    wrap.className = `ab-msg ${role}`;
    wrap.innerHTML = `<div class="ab-bubble">${parseMarkdown(text).replace(/\n/g, "<br>")}</div><div class="ab-time">${ts()}</div>`;
    msgList.appendChild(wrap);
    msgList.scrollTop = msgList.scrollHeight;
    return wrap;
  }

  function showTyping() {
    const el = document.createElement("div");
    el.className = "ab-msg bot";
    el.id = "ab-typing-indicator";
    el.innerHTML = `<div class="ab-bubble ab-typing"><span></span><span></span><span></span></div>`;
    msgList.appendChild(el);
    msgList.scrollTop = msgList.scrollHeight;
  }

  function hideTyping() {
    const el = root.querySelector("#ab-typing-indicator");
    if (el) el.remove();
  }

  function showBadge(n) {
    badge.textContent = n;
    badge.style.display = n > 0 ? "flex" : "none";
  }

  // ─── Slot picker ───────────────────────────────────────────────────────────
  function renderSlots(availableSlots) {
    slots = availableSlots;
    slotsEl.style.display = "flex";
    slotsEl.innerHTML = `<div class="slot-label">Pick a time — all times CT</div>`;
    availableSlots.slice(0, 3).forEach((s, i) => {
      const b = document.createElement("button");
      b.className = "ab-slot-btn";
      b.textContent = s.label;
      b.onclick = () => selectSlot(i);
      slotsEl.appendChild(b);
    });
  }

  function selectSlot(index) {
    const slot = slots[index];
    slotsEl.style.display = "none";
    // Ask for name + email if we don't have them yet
    addMsg("user", slot.label);
    messages.push({ role: "user", content: `I'd like to book the ${slot.label} slot.` });
    transcript.push(`User selected slot: ${slot.label}`);
    // Store selected slot for booking
    root._pendingSlot = slot;
    sendToAPI(`I'd like to book the ${slot.label} slot.`);
  }

  // ─── Booking ───────────────────────────────────────────────────────────────
  async function bookAppointment(selectedLead, slot) {
    try {
      const res = await fetch(`${API}/api/chatbot/book`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead: selectedLead,
          slot,
          calendarId: cfg.calendarId || null,
          // Never fall back to A&B's own agent on a client site — the booking
          // confirmation would name the wrong person.
          agentName:  cfg.agentName  || (IS_AB ? "Adrian" : BUSINESS),
          agentEmail: cfg.agentEmail || (IS_AB ? "adrian@abconsultingg.com" : null),
          transcript: transcript.join("\n"),
        }),
      });
      const data = await res.json();
      if (data.success) {
        const card = document.createElement("div");
        card.className = "ab-confirm-card ab-msg bot";
        card.innerHTML = `
          <strong>✓ You're booked!</strong>
          ${slot.label}<br>
          A calendar invite is on its way to ${selectedLead.email}.
          ${data.meetLink ? `<br><a href="${data.meetLink}" target="_blank" style="color:#047857;font-weight:600">Join link →</a>` : ""}
        `;
        msgList.appendChild(card);
        msgList.scrollTop = msgList.scrollHeight;
      }
    } catch (e) {
      console.error("Booking failed:", e);
    }
  }

  // ─── API call ──────────────────────────────────────────────────────────────
  async function sendToAPI(text) {
    if (typing) return;
    typing = true;
    showTyping();

    try {
      const res = await fetch(`${API}/api/chatbot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages,
          context: getContext(),
          clientConfig: cfg.isABSite === false
            ? {
                isABSite: false,
                businessName: cfg.businessName,
                industry:     cfg.industry,
                location:     cfg.location,
                agentName:    cfg.agentName,
                services:     cfg.services || [],
                customContext: cfg.customContext || "",
                // Lets the prompt know whether calendar booking is even
                // possible, so it asks for contact details instead of
                // offering times that cannot be shown.
                canBook:      CAN_BOOK,
              }
            : { isABSite: true },
        }),
      });

      const data = await res.json();
      hideTyping();

      if (data.message) {
        addMsg("bot", data.message);
        messages.push({ role: "assistant", content: data.message });
        transcript.push(`Assistant: ${data.message}`);
      }

      // Lead captured — store and attempt booking if slot pending
      // `data.lead` is only present on the single turn the lead is first
      // captured. A visitor almost always picks a slot on a *later* turn, so
      // gating on it alone meant the booking silently never happened. Fall
      // back to the cached `lead` from an earlier turn.
      if (data.lead) lead = data.lead;
      if (lead) {
        if (root._pendingSlot) {
          await bookAppointment(lead, root._pendingSlot);
          root._pendingSlot = null;
        }
      }

      // Show booking slots. Only when a calendar is actually configured, and
      // never allowed to break the message render if availability fails.
      if (data.showBooking && CAN_BOOK) {
        try {
          const avRes = await fetch(`${API}/api/chatbot/availability`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ calendarId: cfg.calendarId || null }),
          });
          const avData = await avRes.json();
          if (avData.slots && avData.slots.length) {
            renderSlots(avData.slots);
          }
        } catch (err) {
          console.warn("Availability lookup failed:", err);
        }
      }

    } catch (e) {
      hideTyping();
      addMsg("bot", "Sorry, something went wrong. Please try again.");
      console.error("Chat error:", e);
    } finally {
      typing = false;
    }
  }

  // ─── Send message ──────────────────────────────────────────────────────────
  function handleSend() {
    const text = input.value.trim();
    if (!text || typing) return;
    input.value = "";
    input.style.height = "auto";
    addMsg("user", text);
    messages.push({ role: "user", content: text });
    transcript.push(`Visitor: ${text}`);
    sendToAPI(text);
  }

  // ─── Open / close ──────────────────────────────────────────────────────────
  function openChat() {
    open = true;
    win.classList.add("open");
    showBadge(0);
    input.focus();
    if (messages.length === 0) {
      const greeting = GREETING;
      addMsg("bot", greeting);
      messages.push({ role: "assistant", content: greeting });
      const quickBtn = document.createElement("div");
      quickBtn.style.cssText = "padding: 4px 14px 10px;";
      quickBtn.innerHTML = '<button onclick="window._abBookNow(this)" style="background:' + BRAND_COLOR + ';color:white;border:none;border-radius:8px;padding:9px 16px;font-size:13px;font-weight:600;cursor:pointer;width:100%">📅 ' + escapeHtml(BOOK_LABEL) + '</button>';
      msgList.appendChild(quickBtn);
      msgList.scrollTop = msgList.scrollHeight;
    }
  }

  function closeChat() {
    open = false;
    win.classList.remove("open");
    // Remember the visitor dismissed it — don't proactively reopen this session.
    try { sessionStorage.setItem("ab-chat-dismissed", "1"); } catch (e) {}
  }

  // ─── Events ────────────────────────────────────────────────────────────────
  btn.addEventListener("click", () => (open ? closeChat() : openChat()));
  root.querySelector("#ab-chat-close").addEventListener("click", closeChat);
  sendBtn.addEventListener("click", handleSend);

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });

  input.addEventListener("input", () => {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 100) + "px";
  });

  // Book now handler
  window._abBookNow = function(btn) {
    // No calendar configured (typical client site): skip the availability
    // check entirely and collect the lead in conversation.
    if (!CAN_BOOK) {
      if (btn && btn.parentElement) btn.parentElement.style.display = 'none';
      const prompt = cfg.estimatePrompt ||
        "Happy to help with that. What's your name, the best phone number or email to reach you, and a quick description of what you need? I'll pass it straight to the team.";
      addMsg('bot', prompt);
      messages.push({ role: 'assistant', content: prompt });
      transcript.push((BOT_NAME || WIDGET_NAME) + ': ' + prompt);
      input.focus();
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Checking availability...';
    fetch(API + "/api/chatbot/availability", {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ calendarId: cfg.calendarId || null })
    })
    .then(r => r.json())
    .then(d => {
      btn.parentElement.style.display = 'none';
      if (d.slots && d.slots.length) {
        addMsg('bot', 'Here are some open times — pick what works for you:');
        renderSlots(d.slots);
      } else {
        addMsg('bot', "Hmm, no open slots right now. Drop your email and I'll have " + FOLLOWUP_WHO + " reach out directly.");
      }
    })
    .catch(() => {
      btn.textContent = 'Try again';
      btn.disabled = false;
    });
  };

  // ─── Proactive engagement (intent-based, never on load) ─────────────────────
  // Show a subtle "1" nudge badge on the collapsed bubble right away…
  showBadge(1);

  // …but only OPEN the panel once real intent is detected: ~18s dwell,
  // 40% scroll depth, or exit-intent — whichever comes first. Never on load,
  // never more than once per session, and never on the focused quiz flow.
  let proactiveDone = false;
  const dismissed = (() => { try { return sessionStorage.getItem("ab-chat-dismissed") === "1"; } catch (e) { return false; } })();
  const onAssessment = /\/assessment/.test(window.location.pathname);

  function maybeProactiveOpen() {
    if (proactiveDone || open || messages.length > 0 || dismissed || onAssessment) return;
    proactiveDone = true;
    cleanupIntent();
    // On phones the panel fills the screen, so don't force it open — just keep
    // the nudge badge inviting a tap.
    if (window.innerWidth < 768) { showBadge(1); return; }
    openChat();
  }

  const dwellTimer = setTimeout(maybeProactiveOpen, 18000);

  function onScroll() {
    const scrolled = window.scrollY + window.innerHeight;
    const docH = document.documentElement.scrollHeight;
    if (docH > 0 && scrolled / docH >= 0.4) maybeProactiveOpen();
  }
  function onExitIntent(e) {
    if (e.clientY <= 0) maybeProactiveOpen();
  }
  function cleanupIntent() {
    clearTimeout(dwellTimer);
    window.removeEventListener("scroll", onScroll);
    document.removeEventListener("mouseout", onExitIntent);
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  document.addEventListener("mouseout", onExitIntent);

})();
