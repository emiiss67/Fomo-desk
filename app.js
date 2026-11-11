/* Grok Bot desk app. Plan B: polls public JSON files written by api.py. No framework, no build. */
(function () {
  "use strict";
  function nat(v) { return v == null ? "n/a" : Number(v).toPrecision(4); }
  const SUPA = "https://arbqqmxcmzkfvksapiaw.supabase.co/storage/v1/object/public/desk/d/";
  const LOCAL = ["localhost", "127.0.0.1"].includes(location.hostname);
  const QS = new URLSearchParams(location.search);
  const FIXTURE = LOCAL ? QS.get("fixture") : null;          // local screenshots only
  const POLL_S = 5, MAX_BACKOFF = 60;
  const AGENTS = ["scanner", "auditor", "analyst", "executor", "risk"];
  const TITLE = { scanner: "Scanner", auditor: "Auditor", analyst: "Analyst", executor: "Executor", risk: "Risk" };
  const COLOR = { scanner: "cyan", auditor: "", analyst: "yellow", executor: "green", risk: "pink" };
  const RM = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------- data path: kept in the URL fragment (never sent to the server) + localStorage ----------
  const hashD = () => { const m = location.hash.match(/[#?&]d=([^&]+)/); return m ? decodeURIComponent(m[1]).trim() : null; };
  const dp0 = hashD();
  if (dp0) localStorage.setItem("desk.d", dp0);
  if (location.hash.startsWith("#d=") && dp0) history.replaceState(null, "", location.pathname + location.search + "#/home?d=" + encodeURIComponent(dp0));
  const DP = dp0 || localStorage.getItem("desk.d");
  // keep ?d= in the fragment on every route, so "Open in Safari" and Add to Home Screen carry it
  const keepD = () => { if (!DP || FIXTURE || hashD()) return; const h = location.hash || "#/home";
    history.replaceState(null, "", location.pathname + location.search + h + (h.includes("?") ? "&" : "?") + "d=" + encodeURIComponent(DP)); };
  keepD();
  // Home Screen apps on iPhone open the manifest start_url and have their own storage, so the start_url must carry d
  if (DP && !FIXTURE) { try {
    const root = new URL("./", location.href).href;
    const m = { name: "Grok Bot", short_name: "Grok Bot", start_url: root + "#/home?d=" + encodeURIComponent(DP), scope: root,
      display: "standalone", background_color: "#000000", theme_color: "#000000",
      icons: [{ src: root + "icons/icon-192.png", sizes: "192x192", type: "image/png" }, { src: root + "icons/icon-512.png", sizes: "512x512", type: "image/png" },
              { src: root + "icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }] };
    const mf = document.getElementById("mf");
    if (mf) mf.href = "data:application/manifest+json," + encodeURIComponent(JSON.stringify(m));
  } catch (e) {} }
  const BASE = FIXTURE ? "/" + FIXTURE.replace(/[^\w-]/g, "") + "/" : (DP ? SUPA + encodeURIComponent(DP) + "/" : null);

  const S = { tf: {}, chartOff: {}, chartSlot: 9, state: null, chart: null, account: null, activity: [], coin: {}, audit: {}, decisions: {},
              reports: null, report: {}, missing: {}, err: false, lastGood: null, next: 0, range: "LIVE", search: "", showSearch: false };
  const view = document.getElementById("view"), offline = document.getElementById("offline");
  let chartPrev = null, odoPrev = null, beam = {}, execAnim = null;

  // ---------- appearance (device-only; theme + candle colors + chart zoom) ----------
  const THEMES = {
    midnight: { label: "Midnight", bg: "#05070a", text: "#f4f6f8", sec: "rgba(226,232,240,.62)", ter: "rgba(226,232,240,.34)",
      sep: "rgba(255,255,255,.07)", card: "rgba(22,26,32,.82)", card2: "rgba(255,255,255,.10)",
      green: "#00e38c", red: "#ff5c7a", orange: "#ffb02e", cyan: "#5ad8ff", blue: "#4c9dff", yellow: "#ffd84d", pink: "#ff7ab6",
      accent: "#00e38c", wash: "rgba(0,227,140,.10)", wash2: "rgba(90,216,255,.07)", hair: "rgba(255,255,255,.08)",
      ctaText: "#00140b", tabbar: "rgba(10,12,16,.72)", themeColor: "#05070a" },
    ocean: { label: "Ocean", bg: "#06141c", text: "#e8f4fa", sec: "rgba(220,236,245,.62)", ter: "rgba(220,236,245,.34)",
      sep: "rgba(160,210,230,.10)", card: "rgba(10,28,40,.82)", card2: "rgba(90,216,255,.10)",
      green: "#3ee0b0", red: "#ff6b7d", orange: "#ffb02e", cyan: "#5ad8ff", blue: "#4cc9ff", yellow: "#ffd84d", pink: "#ff7ab6",
      accent: "#5ad8ff", wash: "rgba(90,216,255,.14)", wash2: "rgba(62,224,176,.07)", hair: "rgba(160,210,230,.12)",
      ctaText: "#021018", tabbar: "rgba(6,20,28,.78)", themeColor: "#06141c" },
    ember: { label: "Ember", bg: "#140c08", text: "#fbf3ea", sec: "rgba(251,243,234,.62)", ter: "rgba(251,243,234,.34)",
      sep: "rgba(255,200,140,.10)", card: "rgba(36,22,14,.84)", card2: "rgba(255,176,46,.10)",
      green: "#3dd68c", red: "#ff5c5c", orange: "#ffb02e", cyan: "#ffd19a", blue: "#ff9f4a", yellow: "#ffd84d", pink: "#ff8a6a",
      accent: "#ffb02e", wash: "rgba(255,176,46,.14)", wash2: "rgba(255,92,80,.06)", hair: "rgba(255,200,140,.12)",
      ctaText: "#1a0c02", tabbar: "rgba(20,12,8,.78)", themeColor: "#140c08" },
    violet: { label: "Violet", bg: "#0c0816", text: "#f2eefe", sec: "rgba(242,238,254,.62)", ter: "rgba(242,238,254,.34)",
      sep: "rgba(180,140,255,.12)", card: "rgba(24,18,40,.84)", card2: "rgba(180,140,255,.12)",
      green: "#5ef0c0", red: "#ff6b9a", orange: "#ffb02e", cyan: "#9ad4ff", blue: "#8aa4ff", yellow: "#ffd84d", pink: "#ff7ab6",
      accent: "#b48cff", wash: "rgba(180,140,255,.16)", wash2: "rgba(94,240,192,.06)", hair: "rgba(180,140,255,.14)",
      ctaText: "#14081c", tabbar: "rgba(12,8,22,.78)", themeColor: "#0c0816" },
    contrast: { label: "Contrast", bg: "#000000", text: "#ffffff", sec: "rgba(255,255,255,.70)", ter: "rgba(255,255,255,.42)",
      sep: "rgba(255,255,255,.16)", card: "rgba(22,22,22,.92)", card2: "rgba(255,255,255,.14)",
      green: "#00ff9a", red: "#ff3355", orange: "#ffb020", cyan: "#5ad8ff", blue: "#4c9dff", yellow: "#ffe14d", pink: "#ff7ab6",
      accent: "#00ff9a", wash: "rgba(0,255,154,.14)", wash2: "rgba(255,51,85,.06)", hair: "rgba(255,255,255,.16)",
      ctaText: "#00140b", tabbar: "rgba(0,0,0,.82)", themeColor: "#000000" },
    daylight: { label: "Daylight", bg: "#eef0f4", text: "#111318", sec: "rgba(17,19,24,.62)", ter: "rgba(17,19,24,.40)",
      sep: "rgba(17,19,24,.10)", card: "rgba(255,255,255,.90)", card2: "rgba(17,19,24,.08)",
      green: "#007a4d", red: "#d0163c", orange: "#c47a00", cyan: "#007a9c", blue: "#0b5fff", yellow: "#b88600", pink: "#c43a7a",
      accent: "#007a4d", wash: "rgba(0,122,77,.12)", wash2: "rgba(11,95,255,.06)", hair: "rgba(17,19,24,.10)",
      ctaText: "#ffffff", tabbar: "rgba(255,255,255,.82)", themeColor: "#eef0f4" }
  };
  const CANDLES = {
    classic: { label: "Green / red", up: null, down: null },
    asian:   { label: "Red / green", up: "#e63946", down: "#2a9d8f" },
    cyan:    { label: "Cyan / orange", up: "#5ad8ff", down: "#ff9f0a" },
    gold:    { label: "Gold / red", up: "#ffd60a", down: "#ff453a" },
    blue:    { label: "Blue / pink", up: "#4c9dff", down: "#ff7ab6" },
    mono:    { label: "Solid / red", up: "text", down: "#ff5c7a" }
  };
  const themeId = () => { try { return THEMES[localStorage.getItem("desk.theme")] ? localStorage.getItem("desk.theme") : "midnight"; } catch (e) { return "midnight"; } };
  const candleId = () => { try { return CANDLES[localStorage.getItem("desk.candles")] ? localStorage.getItem("desk.candles") : "classic"; } catch (e) { return "classic"; } };
  function candlePair(th) {
    const id = candleId(), t = th || THEMES[themeId()] || THEMES.midnight, c = CANDLES[id] || CANDLES.classic;
    const up = c.up == null ? t.green : c.up === "text" ? t.text : c.up;
    const down = c.down == null ? t.red : c.down;
    return { up, down };
  }
  function applyAppearance() {
    const id = themeId(), t = THEMES[id] || THEMES.midnight, c = candlePair(t);
    const r = document.documentElement;
    r.setAttribute("data-theme", id);
    const set = (k, v) => r.style.setProperty(k, v);
    ["bg","text","sec","ter","sep","card","card2","green","red","orange","cyan","blue","yellow","pink","accent","wash","wash2","hair"].forEach(k => set("--" + (k === "ctaText" ? "cta-text" : k), t[k]));
    set("--cta-text", t.ctaText); set("--tabbar", t.tabbar);
    set("--candle-up", c.up); set("--candle-down", c.down);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", t.themeColor);
    const sb = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
    if (sb) sb.setAttribute("content", id === "daylight" ? "default" : "black");
    document.body && (document.body.style.backgroundColor = t.bg);
    try {
      const slot = parseFloat(localStorage.getItem("desk.slot"));
      if (slot >= 3 && slot <= 24) S.chartSlot = slot;
    } catch (e) {}
  }
  function setTheme(id) { try { localStorage.setItem("desk.theme", THEMES[id] ? id : "midnight"); } catch (e) {} applyAppearance(); const cvs = document.getElementById("candles"); if (cvs) cvs._lastC = null; render(); }
  function setCandles(id) { try { localStorage.setItem("desk.candles", CANDLES[id] ? id : "classic"); } catch (e) {} applyAppearance(); const cvs = document.getElementById("candles"); if (cvs) cvs._lastC = null; render(); }
  function saveSlot(cv) {
    if (!cv || !cv._st) return;
    S.chartSlot = cv._st.slot;
    try { localStorage.setItem("desk.slot", String(cv._st.slot)); } catch (e) {}
  }
  applyAppearance();

  // ---------- helpers ----------
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const safeUrl = u => { try { const x = new URL(u); return x.protocol === "https:" ? u : null; } catch (e) { return null; } };
  const ext = (u, inner, cls) => { const s = safeUrl(u); return s ? `<a class="${cls || ""}" href="${esc(s)}" target="_blank" rel="noopener">${inner}</a>` : inner; };
  const money = v => v == null ? "—" : (v < 0 ? "-" : "") + "$" + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const kfmt = v => v == null ? "—" : v >= 1e6 ? "$" + (v / 1e6).toFixed(2) + "M" : v >= 1e3 ? "$" + (v / 1e3).toFixed(1) + "K" : "$" + v.toFixed(0);
  // same subscript-zero format as the chart axis: 0.000000001458 -> "$0.0₈1458" (never "e-" notation)
  const price = v => v == null || !isFinite(v) ? "—" : "$" + (v >= 1 && v < 1000 ? v.toFixed(4) : window.DeskChart.fmtP(v));
  const sgn = (v, d = 2) => v == null ? "—" : (v >= 0 ? "+" : "") + v.toFixed(d) + "%";
  const hm = iso => iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }) : "";
  const card = n => S.state && S.state.agents.find(a => a.name === n);
  const route = () => { const h = location.hash.replace(/^#\/?/, "").split("?")[0].split("/"); return { name: h[0] || "home", arg: h[1] || null }; };
  const sk = (h, w, extra) => `<div class="sk" style="height:${h}px;${w ? "width:" + w + ";" : ""}${extra || ""}"></div>`;
  // coin logo: DexScreener info.imageUrl (server checks it is on DexScreener's CDN); no logo / load error -> letter
  const HUES = [200, 145, 48, 330, 270, 20, 180, 0];
  const small = u => u.replace(/width=\d+&height=\d+/, "width=128&height=128");
  function logo(name, url, size, extraCls) {
    const n = String(name || "?").replace(/[^\p{L}\p{N}]/gu, "") || "?";
    let h = 0; for (const ch of n) h = (h * 31 + ch.codePointAt(0)) >>> 0;
    const u = url && safeUrl(url);
    return `<span class="lg ${extraCls || ""}" style="--s:${size || 36}px;--h:${HUES[h % HUES.length]}">${esc(n[0].toUpperCase())}` +
      (u ? `<img src="${esc(small(u))}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.remove()">` : "") + "</span>";
  }
  const coinHref = m => "#/coin/" + encodeURIComponent(m);
  // pump.fun-style pop-in: a coin that shows up after the first load pops in once (only in the render it first appears)
  const seenAt = new Map(); let seenReady = false;
  function pop(key) {
    if (!key) return "";
    const now = Date.now();
    if (!seenAt.has(key)) seenAt.set(key, seenReady ? now : 0);
    return seenReady && now - seenAt.get(key) < 1500 ? " pop" : "";
  }
  const ago = iso => { if (!iso) return ""; const m = Math.max(0, Math.round((Date.now() - new Date(iso)) / 60000)); return m < 60 ? m + "m" : Math.floor(m / 60) + "h"; };

  // ================= effects (all off under prefers-reduced-motion) =================
  // ticker: a number that changed since the last render rolls in and glows green/red
  const lastVal = new Map();
  function tick(key, v, fmt) {
    const prev = lastVal.get(key); lastVal.set(key, v);
    const dir = prev == null || v == null || prev === v || RM() ? "" : v > prev ? " up" : " down";
    return `<span class="tick${dir}">${esc(fmt(v))}</span>`;
  }
  function breathe(lc) {
    const b = document.getElementById("breath"); if (!b) return;
    if (!lc || RM()) { b.hidden = true; return; }
    b.hidden = false; b.className = "breath " + (lc.up ? "up" : "down");
    b.style.transform = `translate(${lc.x - lc.w / 2 + 16}px, ${lc.y}px)`; b.style.width = lc.w + "px"; b.style.height = lc.h + "px";
  }
  // one shared overlay canvas for bursts, confetti and coin rain; rAF only while something is alive
  const FX = { parts: [], cv: null, run: false };
  function fxCanvas() {
    if (!FX.cv) { FX.cv = document.createElement("canvas"); FX.cv.className = "confetti"; document.body.appendChild(FX.cv); }
    const dpr = window.devicePixelRatio || 1;
    if (FX.cv.width !== innerWidth * dpr) { FX.cv.width = innerWidth * dpr; FX.cv.height = innerHeight * dpr; }
    return FX.cv;
  }
  function fxLoop() {
    if (FX.run) return; FX.run = true;
    const cv = fxCanvas(), x = cv.getContext("2d"), dpr = window.devicePixelRatio || 1;
    const step = () => {
      x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, innerWidth, innerHeight);
      FX.parts = FX.parts.filter(p => p.life > 0);
      FX.parts.forEach(p => {
        p.vy += p.g; p.vx *= p.drag; p.vy *= p.drag; p.x += p.vx; p.y += p.vy; p.r += p.vr; p.life -= 1;
        x.save(); x.globalAlpha = Math.min(1, p.life / 30) * p.a; x.translate(p.x, p.y); x.rotate(p.r);
        if (p.kind === "coin") { const sx = Math.abs(Math.cos(p.r * 2)); x.scale(Math.max(.15, sx), 1);
          x.fillStyle = "#ffd60a"; x.beginPath(); x.arc(0, 0, p.s, 0, Math.PI * 2); x.fill();
          x.strokeStyle = "#b8860b"; x.lineWidth = 2; x.stroke(); x.fillStyle = "#8a6400"; x.font = `700 ${p.s}px -apple-system,sans-serif`;
          x.textAlign = "center"; x.textBaseline = "middle"; x.fillText("$", 0, 1); }
        else if (p.kind === "dot") { x.fillStyle = p.c; x.shadowColor = p.c; x.shadowBlur = 8; x.beginPath(); x.arc(0, 0, p.s, 0, Math.PI * 2); x.fill(); }
        else { x.fillStyle = p.c; x.fillRect(-p.s, -p.s * .6, p.s * 2, p.s * 1.2); }
        x.restore();
      });
      if (FX.parts.length) requestAnimationFrame(step); else { x.clearRect(0, 0, innerWidth, innerHeight); FX.run = false; }
    };
    requestAnimationFrame(step);
  }
  const COLS = ["#00d35a", "#ffd60a", "#64d2ff", "#ff6b9a", "#ffffff", "#ff9f0a"];
  function burst(cx, cy, col, n) {            // a coin passed the Auditor / a new signal
    if (RM()) return;
    for (let i = 0; i < (n || 28); i++) { const a = Math.random() * Math.PI * 2, v = 2 + Math.random() * 5;
      FX.parts.push({ kind: "dot", x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: .04, drag: .96, r: 0, vr: 0, s: 1.5 + Math.random() * 2.5, c: col || COLS[i % 4], a: 1, life: 50 + Math.random() * 30 }); }
    fxLoop();
  }
  function confetti() {                        // bigger confetti + coin rain on a profitable Sold
    if (RM()) return;
    const W = innerWidth, H = innerHeight;
    for (let i = 0; i < 160; i++) FX.parts.push({ kind: "rect", x: W / 2 + (Math.random() - .5) * 120, y: H * .38, vx: (Math.random() - .5) * 15, vy: -Math.random() * 14 - 4,
      g: .32, drag: .99, r: Math.random() * 3, vr: (Math.random() - .5) * .35, s: 3 + Math.random() * 3.5, c: COLS[i % COLS.length], a: 1, life: 150 + Math.random() * 40 });
    for (let i = 0; i < 26; i++) FX.parts.push({ kind: "coin", x: Math.random() * W, y: -20 - Math.random() * H * .6, vx: (Math.random() - .5) * 1.2, vy: 2 + Math.random() * 3,
      g: .08, drag: .995, r: Math.random() * 3, vr: .05 + Math.random() * .08, s: 9 + Math.random() * 5, a: 1, life: 190 });
    fxLoop();
    if (navigator.vibrate) try { navigator.vibrate([20, 40, 20]); } catch (e) {}
  }
  function stopShake() {                       // red shake on a stop-loss
    if (RM()) return;
    document.body.classList.remove("shake"); void document.body.offsetWidth; document.body.classList.add("shake");
    setTimeout(() => document.body.classList.remove("shake"), 700);
    if (navigator.vibrate) try { navigator.vibrate(60); } catch (e) {}
  }
  // new events since the last poll (never on the first load)
  const evSeen = { ready: false, rows: new Set(), aud: null, sig: null };
  function checkEvents() {
    const rows = (S.activity[0] && S.activity[0].rows) || [];
    const fresh = rows.filter(r => !evSeen.rows.has(r.id)); rows.forEach(r => evSeen.rows.add(r.id));
    const au = card("auditor"), ac = au && au.current, audKey = ac && ac.text === "8/8 → Executor" ? ac.mint : null;
    const ex = card("executor"), sigKey = ex && ex.last ? ex.last.mint + ex.last.status : null;
    if (evSeen.ready) {
      if (fresh.some(r => r.kind === "sold" && /^\+/.test(String(r.value || "")))) confetti();
      if (fresh.some(r => r.kind === "stopped")) stopShake();
      const W = innerWidth;
      if (audKey && audKey !== evSeen.aud) burst(W / 2, innerHeight * .45, "#00d35a", 34);
      if (sigKey && sigKey !== evSeen.sig) burst(W / 2, innerHeight * .45, "#64d2ff", 28);
    }
    evSeen.aud = audKey; evSeen.sig = sigKey; evSeen.ready = true;
  }
  // subtle drifting particle background: ~40 low-alpha dots, one rAF loop, paused while the tab is hidden
  (function particleBg() {
    if (RM()) return;
    const cv = document.createElement("canvas"); cv.className = "bgfx"; document.body.prepend(cv);
    const x = cv.getContext("2d"); let W, H, dpr, ps, raf = null;
    const size = () => { dpr = Math.min(2, window.devicePixelRatio || 1); W = innerWidth; H = innerHeight; cv.width = W * dpr; cv.height = H * dpr; };
    size(); addEventListener("resize", size);
    ps = Array.from({ length: 40 }, () => ({ x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - .5) * .15, vy: -.05 - Math.random() * .2,
      s: .6 + Math.random() * 1.6, a: .05 + Math.random() * .12, c: Math.random() < .5 ? "100,210,255" : Math.random() < .5 ? "0,211,90" : "255,255,255" }));
    const step = () => { x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, W, H);
      ps.forEach(p => { p.x += p.vx; p.y += p.vy; if (p.y < -5) { p.y = H + 5; p.x = Math.random() * W; } if (p.x < -5) p.x = W + 5; if (p.x > W + 5) p.x = -5;
        x.fillStyle = `rgba(${p.c},${p.a})`; x.beginPath(); x.arc(p.x, p.y, p.s, 0, 6.283); x.fill(); });
      raf = requestAnimationFrame(step); };
    const go = () => { if (raf == null && !document.hidden) raf = requestAnimationFrame(step); };
    document.addEventListener("visibilitychange", () => { if (document.hidden) { cancelAnimationFrame(raf); raf = null; } else go(); });
    go();
  })();
  // ripple on taps (rows, cards, buttons, tabs)
  document.addEventListener("pointerdown", e => {
    if (RM()) return;
    const el = e.target.closest && e.target.closest("a.row, .acard, button, .cta, .tab, .feed .fr, .chip");
    if (!el) return;
    const r = el.getBoundingClientRect(), d = Math.max(r.width, r.height) * 2, sp = document.createElement("span");
    sp.className = "ripple"; sp.style.width = sp.style.height = d + "px";
    sp.style.left = (e.clientX - r.left - d / 2) + "px"; sp.style.top = (e.clientY - r.top - d / 2) + "px";
    if (getComputedStyle(el).position === "static") el.style.position = "relative";
    el.style.overflow = "hidden"; el.appendChild(sp); setTimeout(() => sp.remove(), 600);
  }, { passive: true });

  function toast(t) { const el = document.getElementById("toast"); el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => el.hidden = true, 1800); }

  // ---------- fetch ----------
  async function get(rel) {
    const r = await fetch(BASE + rel + "?v=" + Date.now(), { cache: "no-store" });
    if (r.status !== 200) { const e = new Error("HTTP " + r.status); e.status = r.status; throw e; }
    return r.json();
  }
  async function getOpt(rel, store, key) {           // per-coin files: a missing one is "not on the desk", not offline
    try { store[key] = await get(rel); delete S.missing[rel]; }
    catch (e) { if (e.status) S.missing[rel] = true; else throw e; }
  }
  async function loadRoute(changed) {
    const r = route(), ch = f => !changed || changed.includes(f);
    if (r.name === "coin" && r.arg && (ch(`coin/${r.arg}.json`) || !S.coin[r.arg])) await getOpt(`coin/${r.arg}.json`, S.coin, r.arg);
    if (r.name === "coin" && r.arg && S.coin[r.arg] && S.coin[r.arg].audit_chip && (ch(`audit/${r.arg}.json`) || !S.audit[r.arg])) await getOpt(`audit/${r.arg}.json`, S.audit, r.arg);
    if (r.name === "home") for (const o of openPositions()) if (ch(`coin/${o.row.mint}.json`) || !S.coin[o.row.mint]) await getOpt(`coin/${o.row.mint}.json`, S.coin, o.row.mint);
    const am = r.name === "audit" ? (r.arg || auditMint()) : null;
    if (am && (ch(`audit/${am}.json`) || !S.audit[am])) await getOpt(`audit/${am}.json`, S.audit, am);
    if (r.name === "agents") for (const a of AGENTS) if (ch(`decisions/${a}.json`) || !S.decisions[a]) await getOpt(`decisions/${a}.json`, S.decisions, a);
    if (r.name === "report" && r.arg && /^\d{4}-\d{2}-\d{2}$/.test(r.arg) && (ch(`reports/${r.arg}.json`) || !S.report[r.arg]))
      await getOpt(`reports/${r.arg}.json`, S.report, r.arg);
  }
  async function poll() {
    let changedSomething = false;
    try {
      const st = await get("state.json");
      const first = !S.state;
      const changed = first ? null : (st.seq !== S.state.seq ? (st.changed || []) : []);
      if (first || changed.length || st.seq !== S.state.seq) {
        const need = f => first || changed.includes(f);
        const [chart, account, act, reps] = await Promise.all([
          need("chart.json") || !S.chart ? get("chart.json") : S.chart,
          need("account.json") || !S.account ? get("account.json") : S.account,
          need("activity.json") || !S.activity.length ? get("activity.json") : S.activity[0],
          need("reports/index.json") || S.reports == null
            ? get("reports/index.json").catch(e => { if (e.status) return S.reports || { reports: [] }; throw e; })
            : S.reports]);
        S.chart = chart; S.account = account;
        if (S.activity[0] !== act) S.activity = [act];
        S.reports = reps;
        S.state = st; changedSomething = true;
        checkEvents();
        await loadRoute(first ? null : changed);
      }
      if (S.err) changedSomething = true;
      S.err = false; S.lastGood = new Date(); S.backoff = POLL_S;
    } catch (e) {
      if (!S.err) changedSomething = true;
      S.err = true; S.backoff = Math.min((S.backoff || POLL_S) * 2, MAX_BACKOFF);
    }
    S.next = Date.now() + S.backoff * 1000;
    if (changedSomething) render();
    setTimeout(poll, S.backoff * 1000);
  }
  function tickOffline() {
    if (!S.err) { offline.hidden = true; return; }
    const n = Math.max(0, Math.ceil((S.next - Date.now()) / 1000));
    offline.hidden = false;
    offline.textContent = `Desk offline · retrying in ${n}s · last update ${S.lastGood ? S.lastGood.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }) : "never"}`;
  }
  setInterval(tickOffline, 1000);

  // ---------- odometer: each changed digit rolls 600ms ease-out, 30ms stagger right to left ----------
  function odometer(text) {
    const prev = odoPrev; odoPrev = text;
    const chars = text.split(""), pchars = (prev || text).padStart(text.length, " ").slice(-text.length).split("");
    const roll = !RM() && prev && prev !== text;
    let html = "", k = 0;
    for (let i = chars.length - 1; i >= 0; i--) {
      const c = chars[i];
      if (!/\d/.test(c)) { html = `<span class="fixed">${esc(c)}</span>` + html; continue; }
      const from = /\d/.test(pchars[i]) ? +pchars[i] : 0, to = +c, changed = roll && from !== to;
      const delay = changed ? (k++) * 30 : 0;
      html = `<span class="col"><span class="strip" data-to="${to}" style="transform:translateY(-${(changed ? from : to) * 1.05}em);transition-delay:${delay}ms">` +
        "0123456789".split("").map(d => `<span>${d}</span>`).join("") + "</span></span>" + html;
    }
    return { html, roll };
  }
  function runOdometer() {
    requestAnimationFrame(() => requestAnimationFrame(() =>
      view.querySelectorAll(".odo .strip").forEach(s => s.style.transform = `translateY(-${(+s.dataset.to) * 1.05}em)`)));
  }

  // ---------- shared pieces ----------
  function navbar(extra) {
    const handle = S.account && S.account.fomo_handle;
    const unread = unreadCount() > 0;
    return `<div class="navbar">
      <a class="iconbtn" href="#/account" aria-label="Account"><span class="avatar">${esc((handle || "G")[0].toUpperCase())}</span></a>
      <a class="title" href="#/agents">Grok Bot&nbsp;<span class="ter">›</span></a>
      <button class="iconbtn" id="searchbtn" aria-label="Search"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg></button>
      <a class="iconbtn" href="#/activity" aria-label="Notifications"><svg viewBox="0 0 24 24"><path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>${unread ? '<i class="dot"></i>' : ""}</a>
    </div>${extra || ""}`;
  }
  function backbar(label, href) {
    return `<div class="navbar"><a class="back" href="${href || "#/home"}">‹ ${esc(label || "Back")}</a><span class="title"></span>
      ${S.state && S.state.paper ? '<span class="pill paper">PAPER</span>' : ""}</div>`;
  }
  function unreadCount() {
    const rows = (S.activity[0] && S.activity[0].rows) || [];
    const seen = localStorage.getItem("desk.seen") || "";
    return rows.filter(r => ["bought", "sold", "stopped"].includes(r.kind) && r.ts > seen).length;
  }
  function actRow(r) {
    const ic = { bought: "B", sold: "S", stopped: "!", rejected: "×" }[r.kind] || "•";
    const href = r.mint ? (r.opens === "coin" ? `#/coin/${encodeURIComponent(r.mint)}` : `#/audit/${encodeURIComponent(r.mint)}`) : null;
    const v = esc(r.value || "");
    const vcls = r.kind === "sold" ? (String(r.value).startsWith("-") ? "red" : "green") : r.kind === "stopped" ? "red" : r.kind === "rejected" ? "ter" : "";
    const name = (r.title || "").replace(/^(Bought|Sold|Stopped|Rejected) /, "");
    const icon = r.mint ? `<span class="lgw">${logo(name, r.logo, 36)}<span class="badge ${r.kind}">${ic}</span></span>` : `<span class="ic ${r.kind}">${ic}</span>`;
    const inner = `${icon}<span class="main"><div class="t">${esc(r.title)}</div><div class="s">${esc(r.subtitle)}</div></span><span class="v ${vcls}">${v}</span>`;
    const pc = pop("a" + r.id);
    return href ? `<a class="row${pc}" href="${href}">${inner}</a>` : `<div class="row${pc}">${inner}</div>`;
  }
  function statusDot(a) { return `<i class="sd ${esc(a.status)}"></i>`; }

  // ---------- agent cards ----------
  function agentCard(a) {
    const head = `<div class="ah">${statusDot(a)}<span class="${COLOR[a.name]}">${TITLE[a.name]}</span><span class="ter" style="margin-left:auto;font-weight:400">${a.paused ? "paused" : esc(a.status)}</span></div>`;
    if (a.name === "scanner") {
      const feed = (a.feed || []).slice(0, 5).map(f => f.verdict === "kill"
        ? `<a class="fr killed${pop("f" + f.mint)}" href="${coinHref(f.mint)}">${logo(f.name, f.logo, 20)}<span class="n">${esc(f.name)}</span><span class="r">${esc(f.reason)}</span></a>`
        : `<a class="fr${pop("f" + f.mint)}" href="${coinHref(f.mint)}">${logo(f.name, f.logo, 20)}<span class="n">${esc(f.name)} · liq ${kfmt(f.liquidityUsd)}</span><span class="cyan">→ auditor</span></a>`).join("");
      return `<div class="acard">${head}<div class="stat">${a.pools} pools</div>
        ${feed ? `<div class="feed">${feed}</div>` : `<div class="sub">Listening for graduations</div>`}</div>`;
    }
    if (a.name === "auditor") {
      const c = a.current;
      const strips = (c ? c.strips : Array(8).fill(null)).map(p => `<i class="${p === true ? "ok" : p === false ? "bad" : ""}"></i>`).join("");
      const txt = c ? (c.text === "8/8 → Executor" ? `<span class="green">8/8 → Executor</span>` : c.text === "taking apart..." ? `<span class="cyan">taking apart...</span>` : `<span class="red">${esc(c.text)}</span>`) : `<span class="sec">No coin taken apart yet</span>`;
      return `<a class="acard" href="#/audit${c ? "/" + encodeURIComponent(c.mint) : ""}">${head}<div class="stat">${a.taken_apart} taken apart</div>
        <div class="sub cl">${c ? logo(c.name, c.logo, 18) + " " + esc(c.name) : ""}</div><div class="strips">${strips}</div>
        <div class="foot"><span>${txt}</span><span class="sec" style="margin-left:auto">${a.rejected} rejected</span></div></a>`;
    }
    if (a.name === "analyst") {
      const l = a.last;
      return `<div class="acard">${head}<div class="stat">Scoring</div>
        <div class="ringwrap"><canvas class="ring" data-score="${l && l.score != null ? l.score : ""}" data-th="${a.min_score}"></canvas>
        <div><div>${l ? `<a href="${coinHref(l.mint)}" class="cl">${logo(l.name, l.logo, 20)} ${esc(l.name)}</a>` : "—"}</div><div class="sub">${l ? (l.passed ? '<span class="green">passed</span>' : esc(l.reason || "rejected")) : "No coin scored yet"}</div>
        <div class="sub">${a.scored} scored · ${a.mode === "rules" ? "rules" : "Jev"}</div></div></div></div>`;
    }
    if (a.name === "executor") {
      const l = a.last;
      const filled = l && l.filled;
      return `<div class="acard">${head}<div class="stat">${a.trades} trades</div>
        <div class="sub">${l && l.sizeUsd != null ? money(l.sizeUsd) : "—"} · ${a.stack_pct}% of stack</div>
        <div class="bar"><i id="execbar" style="width:${filled ? 100 : 0}%"></i></div>
        <div class="foot"><span id="exectxt" class="${filled ? "green" : "sec"}">${l ? (filled ? "✓ Filled" : esc(l.status)) : "No signal yet"}</span>
        <span class="sec" style="margin-left:auto">${l ? `<a href="${coinHref(l.mint)}" class="cl">${logo(l.name, l.logo, 18)} ${esc(l.name)}</a>` : ""}</span></div></div>`;
    }
    const pills = `<span class="pill mono redp">${esc(a.pills.stop)}</span><span class="pill mono greenp">${esc(a.pills.trail)}</span>`;
    return `<div class="acard">${head}<div class="stat">${a.guarding ? "Guarding" : "Idle"}</div>
      <div class="sub">${a.guarding ? a.guarding + " open" : "Nothing open"}${a.last_exit ? " · last exit " + esc(a.last_exit) : ""}</div>
      <div class="foot">${pills}</div></div>`;
  }
  function afterCards() {
    view.querySelectorAll("canvas.ring").forEach(c => DeskChart.ring(c, c.dataset.score === "" ? null : +c.dataset.score, +c.dataset.th));
    const ex = card("executor"), l = ex && ex.last;
    const key = l ? l.mint + l.status : null;
    if (l && l.filled && execAnim !== null && execAnim !== key && !RM()) {   // a new fill: bar runs 1.2s
      const bar = document.getElementById("execbar"), txt = document.getElementById("exectxt");
      if (bar) { bar.style.transition = "none"; bar.style.width = "0%"; txt.textContent = "Executing... 0%"; txt.className = "sec";
        requestAnimationFrame(() => { bar.style.transition = ""; bar.style.width = "100%"; });
        const t0 = performance.now(); const step = t => { const p = Math.min(1, (t - t0) / 1200);
          txt.textContent = p < 1 ? `Executing... ${Math.round(p * 100)}%` : "✓ Filled"; if (p >= 1) txt.className = "green"; else requestAnimationFrame(step); };
        requestAnimationFrame(step); }
    }
    execAnim = key;
  }

  // ---------- screens ----------
  function loadingHome() {
    return navbar() + `<div class="gut">${sk(70, "70%", "margin-top:8px")}${sk(20, "40%", "margin-top:10px")}</div>
      <div class="gut" style="margin-top:16px">${sk(220)}</div><div class="gut" style="margin-top:28px">${sk(24, "50%")}</div>
      <div class="carousel" style="margin-top:12px"><div class="acard sk"></div></div>
      <div class="gut" style="margin-top:28px">${sk(300)}</div>`;
  }
  function home() {
    if (!S.state) return loadingHome();
    const st = S.state, bal = st.balance;
    const odo = odometer(money(bal));
    const today = st.today_pct, mult = st.multiplier;
    const rng = (S.chart && S.chart.ranges[S.range]) || { points: [], marks: [] };
    const rows = ((S.activity[0] && S.activity[0].rows) || []).slice(0, 5);
    const results = S.showSearch ? searchResults() : "";
    const html = navbar(S.showSearch ? `<div class="search"><input id="q" type="search" placeholder="Name, symbol or mint" value="${esc(S.search)}" autocomplete="off" autocapitalize="off"></div><div class="results">${results}</div>` : "") +
      `<section class="hero glass"><div class="herotop"><span class="ter">${st.paper ? "PAPER stack" : "Stack"}</span>${st.paper ? '<span class="pill paper">PAPER</span>' : ""}</div>
       <div class="bigrow"><span class="big odo glow" aria-label="${esc(money(bal))}">${odo.html}</span></div>
       <div class="today"><span class="${today == null ? "sec" : today >= 0 ? "green" : "red"}">${today == null ? "—" : sgn(today)}</span><span class="sec">today</span>
       ${mult != null ? `<span class="pill mult">${mult.toFixed(2)}×</span>` : ""}${st.balance_unpriced_positions ? `<span class="ter">${st.balance_unpriced_positions} position${st.balance_unpriced_positions > 1 ? "s" : ""} not priced yet</span>` : ""}</div>
      <div class="chartwrap"><canvas id="line"></canvas>${rng.points.length ? "" : '<div class="chartempty">Waiting for the first trade</div>'}</div>
      <div class="ranges">${["LIVE", "1H", "4H", "1D", "1W", "ALL"].map(r => `<button data-range="${r}" class="${r === S.range ? "on" : ""}">${r}</button>`).join("")}</div>
      <div class="achips">${st.agents.map(a => `<a class="achip" href="#/agents"><i class="live ${esc(a.paused ? "paused" : a.status)}"></i>${TITLE[a.name]}</a>`).join("")}</div></section>
      <div class="sh"><h2>Open positions</h2><span class="ter sm">${openPositions().length || ""}</span></div>
      <div class="list glass">${openPositions().length ? openPositions().map(posRow).join("") : '<div class="empty">No open positions</div>'}</div>
      <div class="sh"><h2>Agents · ${st.running} running</h2></div>
      <div class="carousel">${st.agents.map(agentCard).join("")}</div>
      <div class="sh"><h2>New coins</h2><span class="ter sm">${(st.new_coins || []).length ? "live" : ""}${(st.new_coins || []).length ? '<i class="live running" style="margin-left:6px"></i>' : ""}</span></div>
      <div class="list glass">${(st.new_coins || []).length ? st.new_coins.slice(0, 8).map(newCoinRow).join("") : '<div class="empty">Listening for graduations</div>'}</div>
      ${latestReports().length ? `<div class="sh"><h2>Morning report</h2><a href="#/activity">See all</a></div>
      <div class="list glass">${reportRow(latestReports()[0])}</div>` : ""}
      <div class="sh"><h2>Activity</h2><a href="#/activity">See all</a></div>
      <div class="list glass">${rows.length ? rows.map(actRow).join("") : '<div class="empty">Nothing yet tonight</div>'}</div>`;
    return { html, after() {
      if (odo.roll) runOdometer();
      chartPrev = DeskChart.line(document.getElementById("line"), { points: rng.points, marks: rng.marks, start: S.chart && S.chart.start_value }, chartPrev);
      afterCards();
    } };
  }
  function openPositions() {
    const rows = S.activity.flatMap(p => p.rows || []), latest = new Map();
    rows.forEach(r => { if (r.mint && ["bought", "sold", "stopped"].includes(r.kind) && !latest.has(r.mint)) latest.set(r.mint, r); });
    return [...latest.values()].filter(r => r.kind === "bought").map(r => ({ row: r, coin: S.coin[r.mint] }));
  }
  function posRow(o) {
    const r = o.row, c = o.coin, p = c && c.position, since = p && p.since_entry_pct;
    const name = (r.title || "").replace(/^Bought /, "");
    return `<a class="row" href="${coinHref(r.mint)}">${logo(name, r.logo || (c && c.logo), 40)}<span class="main"><div class="t">${esc(name)}</div>
      <div class="s">${p ? money(p.sizeUsd) + " in · entry " + price(p.entryPrice) : esc(r.subtitle || "")}</div></span>
      <span class="v">${since == null ? '<span class="ter">—</span>' : `<span class="cpill ${since >= 0 ? "up" : "down"}">${sgn(since, 1)}</span>`}</span></a>`;
  }
  const STAGE = { watching: ["Watching", "cyan"], killed: ["Skipped", "ter"], passed: ["→ Auditor", "cyan"], auditing: ["Auditing", "cyan"],
                  rejected: ["Rejected", "red"], cleared: ["Cleared", "green"], holding: ["Holding", "green"], traded: ["Traded", "sec"] };
  function newCoinRow(c) {
    const [lab, cls] = STAGE[c.stage] || [c.stage, "sec"];
    const ch = c.p5 == null ? "" : `<span class="cpill ${c.p5 >= 0 ? "up" : "down"}">${sgn(c.p5, 1)}</span>`;
    return `<a class="row coinrow${pop("n" + c.mint)}" href="${coinHref(c.mint)}">${logo(c.name, c.logo, 40)}
      <span class="main"><div class="t">${esc(c.name)} <span class="ter" style="font-size:14px">${esc(c.symbol || "")}</span></div>
      <div class="s">${ago(c.migrated_at)} · MC ${kfmt(c.marketCap)} · Liq ${kfmt(c.liquidityUsd)}</div></span>
      <span class="v">${ch}<span class="stage ${cls}">${esc(lab)}</span>${c.reason ? `<div class="s ter" style="font-size:12px">${esc(c.reason)}</div>` : ""}</span></a>`;
  }
  function knownCoins() {
    const m = new Map();
    const add = (mint, name) => { if (mint && !m.has(mint)) m.set(mint, name || mint); else if (mint && name && m.get(mint) === mint) m.set(mint, name); };
    (S.state ? S.state.coins : []).forEach(x => add(x));
    S.activity.forEach(p => (p.rows || []).forEach(r => add(r.mint, (r.title || "").replace(/^(Bought|Sold|Stopped|Rejected) /, ""))));
    const sc = card("scanner"); (sc && sc.feed || []).forEach(f => add(f.mint, f.name));
    return m;
  }
  function searchResults() {
    const q = S.search.trim().toLowerCase();
    if (!q) return "";
    const hits = [...knownCoins()].filter(([mint, name]) => mint.toLowerCase().includes(q) || String(name).toLowerCase().includes(q)).slice(0, 8);
    if (!hits.length) return `<div class="note">${q.length >= 32 ? `<a class="link" href="#/coin/${encodeURIComponent(S.search.trim())}">Open ${esc(S.search.trim())}</a>` : "Not seen by the desk tonight"}</div>`;
    const lg = new Map(); (S.state && S.state.new_coins || []).forEach(c => lg.set(c.mint, c.logo));
    return `<div class="list">${hits.map(([mint, name]) => `<a class="row" href="#/coin/${encodeURIComponent(mint)}">${logo(name, lg.get(mint), 32)}<span class="main"><div class="t">${esc(name)}</div><div class="s">${esc(mint)}</div></span></a>`).join("")}</div>`;
  }

  function agentsTab() {
    if (!S.state) return navbar() + `<div class="sh"><h2>Agents</h2></div>` + AGENTS.map(() => `<div class="gut" style="margin-bottom:14px">${sk(260, null, "border-radius:20px")}</div>`).join("");
    const count = a => ({ scanner: `${a.pools} pools`, auditor: `${a.taken_apart} taken apart`, analyst: `${a.scored} scored`,
                          executor: `${a.trades} trades`, risk: a.guarding ? `Guarding ${a.guarding}` : "Nothing open" })[a.name];
    const html = navbar() + `<div class="sh"><h2>Agents · ${S.state.running} running</h2></div>` + S.state.agents.map(a => {
      const d = S.decisions[a.name];
      const locked = a.name === "risk" && a.pause_locked;
      const decs = d ? (d.decisions.length ? d.decisions.map(x => `<div class="d"><span class="sec">${hm(x.ts)}</span>
          <span class="cn"><a class="cl" href="${coinHref(x.mint)}">${logo(x.name, x.logo, 20)} ${esc(x.name)}</a></span>
          <span class="${/kill|red|reject|skipped|missed/.test(x.verdict) ? "red" : /pass|bought|closed/.test(x.verdict) ? "green" : "sec"}">${esc(x.verdict)}${x.reason ? " · " + esc(x.reason) : ""}</span></div>`).join("")
          : '<div class="empty">No decisions yet tonight</div>') : sk(120, null, "margin-top:10px");
      return `<div class="agentfull"><div class="top">${statusDot(a)}<span class="name ${COLOR[a.name]}">${TITLE[a.name]}</span>
          <span class="sec">${esc(count(a))}</span>
          <span class="swwrap" title="${locked ? "Locked while a position is open" : "Pause or resume by Telegram"}"><span class="switch ${a.paused ? "" : "on"} ${locked ? "locked" : ""}"></span></span></div>
        <div class="note" style="padding:6px 0 0">${a.paused ? "Paused" : a.status === "running" ? "Running" : esc(a.status)} · ${locked ? "Risk can't be paused while a position is open." : `Type “${a.paused ? "resume" : "pause"} ${TITLE[a.name]}” in Telegram.`}</div>
        <div class="dec">${decs}</div>
        <a class="link" href="#/account?sec=${a.name}">Settings</a></div>`;
    }).join("");
    return { html, after() {} };
  }

  function activityTab() {
    if (!S.state) return navbar() + `<div class="sh"><h2>Activity</h2></div><div class="gut">${sk(480, null, "border-radius:14px")}</div>`;
    const rows = S.activity.flatMap(p => p.rows || []);
    const last = S.activity[S.activity.length - 1];
    if (rows.length) localStorage.setItem("desk.seen", rows[0].ts);
    const reps = latestReports();
    const html = navbar() + (reps.length ? `<div class="sh"><h2>Morning reports</h2></div><div class="list">${reps.map(reportRow).join("")}</div>` : "")
      + `<div class="sh"><h2>Activity</h2></div>
      <div class="list">${rows.length ? rows.map(actRow).join("") : '<div class="empty">Nothing yet tonight</div>'}</div>
      ${last && last.next ? `<div class="gut" style="text-align:center"><button class="link" id="older">Load older</button></div>` : ""}`;
    return { html, after() {
      const b = document.getElementById("older");
      if (b) b.onclick = async () => { try { S.activity.push(await get(last.next)); render(); } catch (e) { toast("Couldn't load older rows"); } };
    } };
  }

  const moneyS = v => v == null ? "—" : (v >= 0 ? "+" : "-") + "$" + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const nqty = v => v == null || !isFinite(Number(v)) ? "—" : String(Number(v));
  function reportLabel(c) {
    return (c && (c.name || c.symbol)) || (c && c.mint ? c.mint.slice(0, 4) + "…" + c.mint.slice(-4) : "—");
  }
  function reportDate(d) {
    const m = String(d || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return d || "";
    return Number(m[3]) + " " + ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][Number(m[2]) - 1] + " " + m[1];
  }
  function latestReports() { return (S.reports && S.reports.reports) || []; }
  function reportCoinLink(c) {
    const name = reportLabel(c);
    const page = c && c.mint ? `<a class="cl" href="${coinHref(c.mint)}">${esc(name)}</a>` : esc(name);
    return page + (c && c.link ? ext(c.link, `<span class="ter"> FOMO ›</span>`, "") : "");
  }
  function reportRow(r) {
    const pnl = r.pnl_usd, cls = pnl == null ? "ter" : pnl >= 0 ? "green" : "red";
    const when = [r.from, r.to].filter(Boolean).join(" → ");
    const trades = r.trades_closed == null ? "" : `${r.trades_closed} trade${r.trades_closed === 1 ? "" : "s"}`;
    return `<a class="row" href="#/report/${esc(r.date)}"><span class="main"><div class="t">Morning report · ${esc(reportDate(r.date))}</div>
      <div class="s">${esc([r.mode, when, trades].filter(Boolean).join(" · "))}</div></span>
      <span class="v ${cls}">${moneyS(pnl)}</span></a>`;
  }
  function reportTrade(t) {
    const pnl = t.pnl_usd, cls = pnl == null ? "ter" : pnl >= 0 ? "green" : "red";
    const sym = t.native_symbol ? " " + t.native_symbol : "";
    const io = (t.native_in != null || t.native_out != null) ? ` · ${nqty(t.native_in)} → ${nqty(t.native_out)}${esc(sym)}` : "";
    const hold = t.hold ? " · HOLD" : "";
    const rule = t.rule ? " · " + esc(t.rule) : (t.status && t.status !== "closed" ? " · " + esc(t.status) : "");
    return `<div class="row"><span class="main"><div class="t">${reportCoinLink(t)}</div>
      <div class="s wrap">${esc(t.chain || "solana")} · ${money(t.size_usd)} in${io}${rule}${hold}
      · ${esc(t.opened || "")}–${esc(t.closed || "open")} · fees ${money(t.fees_usd)}</div></span>
      <span class="v ${cls}">${pnl == null ? "open" : moneyS(pnl)}${t.pnl_pct == null ? "" : `<div class="s ${cls}">${sgn(t.pnl_pct, 1)}</div>`}</span></div>`;
  }
  function reportScreen(date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) return backbar("Activity", "#/activity") + `<div class="empty" style="padding-top:120px">No morning report for that day</div>`;
    if (S.missing[`reports/${date}.json`]) return backbar("Activity", "#/activity") + `<div class="empty" style="padding-top:120px">No morning report for ${esc(reportDate(date))}</div>`;
    const r = S.report[date];
    if (!r) return backbar("Activity", "#/activity") + `<div class="sh"><h2>Morning report</h2></div><div class="gut">${sk(120, null, "border-radius:14px")}${sk(280, null, "border-radius:14px;margin-top:16px")}${sk(400, null, "border-radius:14px;margin-top:16px")}</div>`;
    const pnl = r.pnl_usd, pcls = pnl == null ? "sec" : pnl >= 0 ? "green" : "red";
    const up = r.uptime || {};
    const down = (up.downtime || []).map(g => `${g.from}–${g.to} (${g.min} min)`).join(", ") || "none";
    const fees = "Fees paid " + money(r.fees_paid_usd) + " on closed trades (already in P&L)"
      + (r.fees_paid_open_entry_usd ? " + " + money(r.fees_paid_open_entry_usd) + " entry on open" : "");
    const native = Object.entries(r.native_totals || {}).map(([sym, v]) => {
      const miss = (v.in_missing ? ` (${v.in_missing} in n/a)` : "") + (v.out_missing ? ` (${v.out_missing} out n/a)` : "");
      return `<div class="kv"><span>${esc(sym)} in → out</span><span>${nqty(v.in)} → ${nqty(v.out)} ${esc(sym)}${esc(miss)}</span></div>`;
    }).join("");
    const kv = (k, v) => `<div class="kv"><span>${k}</span><span>${v}</span></div>`;
    const sc = r.scanner || {};
    const by = sc.by_source ? Object.entries(sc.by_source).map(([k, v]) => `${k} ${v.passes} passed / ${v.kills} killed`).join(", ") : "";
    const kills = Object.entries(sc.kills_by_reason || {}).map(([reason, g]) => {
      const more = (g.count || 0) - ((g.coins || []).length);
      const names = (g.coins || []).map(reportCoinLink).join(", ");
      return `<div class="rptline"><div class="t">${esc(reason)} · ${g.count || 0}</div><div class="s wrap">${names}${more > 0 ? ` <span class="ter">… +${more} more</span>` : ""}</div></div>`;
    }).join("") || `<div class="empty">No kills.</div>`;
    const lines = (arr, fn, empty) => arr && arr.length ? arr.map(fn).join("") : `<div class="empty">${empty}</div>`;
    const refLine = x => `<div class="row"><span class="main"><div class="t">${reportCoinLink(x)}</div>
      <div class="s wrap">${esc([x.time, x.layer != null ? "layer " + x.layer + " " + (x.layer_name || "") : "", x.value || x.failed_rule || x.reason || ""].filter(Boolean).join(" · "))}${x.score != null ? " (score " + esc(x.score) + ")" : ""}</div></span></div>`;
    const skipLine = x => `<div class="row"><span class="main"><div class="t">${reportCoinLink(x)}</div>
      <div class="s wrap">pushed ${esc(x.pushed || "")} at ${price(x.signal_price)} · last ${price(x.last_price)} (${x.move_pct == null ? "—" : sgn(x.move_pct, 1)}) · high after ${price(x.high_after)}</div></span></div>`;
    const jev = r.jev || {}, xc = r.x_cost || {};
    const html = backbar("Activity", "#/activity") + `<div class="sh"><h2>Morning report · ${esc(reportDate(r.date))}</h2></div>
      <div class="note">${esc(r.mode || "")} · ${esc((r.night && r.night.from) || "")} → ${esc((r.night && r.night.to) || "")} (${esc((r.night && r.night.tz) || "Europe/Vilnius")})</div>
      ${r.layer8_down_kills ? `<div class="note red">Layer 8 was down: ${r.layer8_down_kills} coins went red on it.</div>` : ""}
      <div class="card rptsum"><div class="rptpnl ${pcls}">${moneyS(pnl)}</div><div class="s">P&L${r.pnl_includes_fees ? " after fees" : ""}</div>
        ${kv("Balance", `${money(r.balance_start)} → ${money(r.balance_end)}`)}
        ${kv("Trades closed", r.trades_closed == null ? "—" : String(r.trades_closed))}
        ${kv("Fees", fees)}
        ${native}
        ${kv("Coins seen", r.coins_seen == null ? "—" : String(r.coins_seen))}
        ${kv("Uptime", (up.pct == null ? "—" : up.pct + "%") + (up.up_minutes != null ? ` (${up.up_minutes}/${up.total_minutes} min)` : ""))}
        ${kv("Downtime", esc(down))}
        ${kv("Full PAPER night", r.full_paper_night ? "yes" : "no" + (r.full_paper_night_why ? " · " + esc(r.full_paper_night_why) : ""))}
      </div>
      ${r.open_at_end && r.open_at_end.length ? `<div class="sh"><h2>Still open at report time</h2></div><div class="list">${r.open_at_end.map(t => `<div class="row"><span class="main"><div class="t">${reportCoinLink(t)}${t.hold ? ' <span class="pill paper">HOLD</span>' : ""}</div>
        <div class="s wrap">${money(t.size_usd)} · ${nqty(t.native_in)} ${esc(t.native_symbol || "")} in · entry fee ${money(t.entry_fee_usd)} · entry ${price(t.entry_price)} · opened ${esc(t.opened || "")}</div></span></div>`).join("")}</div>` : ""}
      <div class="sh"><h2>Red trades</h2></div><div class="list">${lines(r.red_trades, reportTrade, "None.")}</div>
      <div class="sh"><h2>Green trades</h2></div><div class="list">${lines(r.green_trades, reportTrade, "None.")}</div>
      <div class="sh"><h2>Scanner · ${sc.passes == null ? "—" : sc.passes} passed, ${sc.kills == null ? "—" : sc.kills} killed</h2></div>
      ${by ? `<div class="note">${esc(by)}</div>` : ""}
      <div class="card">${kills}</div>
      <div class="sh"><h2>Auditor refusals</h2></div><div class="list">${lines(r.auditor_refusals, refLine, "None.")}</div>
      <div class="sh"><h2>Analyst rejects</h2></div><div class="list">${lines(r.analyst_rejects, refLine, "None.")}</div>
      ${r.executor_skips && r.executor_skips.length ? `<div class="sh"><h2>Executor skips</h2></div><div class="list">${r.executor_skips.map(refLine).join("")}</div>` : ""}
      <div class="sh"><h2>Coins you skipped</h2></div><div class="list">${lines(r.skipped_by_you, skipLine, "None.")}</div>
      <div class="sh"><h2>Jev</h2></div>
      <div class="note">Mode ${esc(jev.analyst_mode || "—")} · tokens ${jev.input_tokens == null ? "—" : esc(jev.input_tokens)} · cost ${money(jev.cost_usd)}${jev.note ? " · " + esc(jev.note) : ""}</div>
      <div class="sh"><h2>X buzz API</h2></div>
      <div class="note">Coins ${xc.coins == null ? "—" : xc.coins} · counts ${xc.counts == null ? "—" : xc.counts} · posts ${xc.posts == null ? "—" : xc.posts} · cost ${money(xc.cost_usd)}</div>
      ${r.signup_url ? `<div class="note">${ext(r.signup_url, "New to FOMO?", "link")}</div>` : ""}`;
    return { html, after() {} };
  }

  function auditMint() { const a = card("auditor"); return a && a.current ? a.current.mint : null; }
  function auditScreen(arg) {
    if (!S.state) return backbar("Home") + `<div style="width:220px;margin:16px auto">${sk(236)}</div><div class="gut">${sk(360, null, "border-radius:14px")}</div>`;
    const mint = arg || auditMint();
    const a = mint && S.audit[mint];
    if (!mint || (a && a.state === "none") || S.missing[`audit/${mint}.json`])
      return { html: backbar("Home") + `<div class="empty" style="padding-top:120px">No coin taken apart yet</div>`, after() {} };
    if (!a) return backbar("Home") + `<div style="width:220px;margin:16px auto">${sk(236)}</div><div class="gut">${sk(360, null, "border-radius:14px")}</div>`;
    const present = a.layers.filter(l => l.pass !== null).length;     // only layers the server sent
    const b = beam[mint] || (beam[mint] = { shown: RM() ? present : 0, running: false });
    if (RM()) b.shown = present;
    const discs = a.layers.map((l, i) => `<div class="disc ${i < b.shown ? (l.pass ? "ok" : "bad") : ""}" data-i="${i}" style="top:${i * 29}px">${i < b.shown ? `<span class="ck ${l.pass ? "green" : "red"}">${l.pass ? "✓" : "✕"}</span>` : ""}</div>`).join("");
    const head = a.header && b.shown >= present && a.state !== "running"
      ? `<div class="vt ${a.state === "rejected" ? "red" : "green"}">${esc(a.header.title)}</div><div class="vs">${esc(a.header.subtitle)}</div>`
      : `<div class="vt cyan">Taking apart...</div><div class="vs">${esc(a.name)}</div>`;
    const rows = a.layers.map((l, i) => `<div class="lrow"><span>${l.n} · ${esc(l.name)}</span><span class="lv ${i < b.shown ? (l.pass ? "" : "red") : "nc"}">${i < b.shown ? esc(l.value) : "not checked"}</span></div>`).join("");
    const html = backbar("Home") + `<div class="coinhead"><a class="cname" href="${coinHref(mint)}">${logo(a.name, a.logo, 36)}${esc(a.name)}<span class="ter" style="font-size:17px;font-weight:400">Coin page ›</span></a></div>
      <div class="discs" id="discs">${discs}<div class="beam" id="beam"></div></div>
      <div class="verdict" id="verdict">${head}</div>
      <div class="list" id="lrows">${rows}</div>
      <div class="card"><div class="kv"><span>Take apart before buying</span><span class="switch ${a.auditor_enabled ? "on" : ""} locked"></span></div>
        <div class="note" style="padding:4px 0 0">Change it in Telegram: “set auditor enabled off” (asks twice).</div></div>
      <div class="spacer"></div>${safeUrl(a.link) ? `<a class="cta" href="${esc(a.link)}" target="_blank" rel="noopener">Open on FOMO</a>` : ""}`;
    return { html, after() { runBeam(mint, a, present); } };
  }
  function runBeam(mint, a, present) {
    const b = beam[mint];
    const beamEl = document.getElementById("beam");
    if (!beamEl) return;
    const waiting = a.state === "running" && present < 8;
    const place = i => { beamEl.style.top = (i * 29 + 11) + "px"; beamEl.style.opacity = 1; };
    if (b.running) return;
    if (b.shown >= present) {
      if (waiting && !RM()) place(present); else beamEl.style.opacity = 0;    // beam waits on the layer the server hasn't sent
      return;
    }
    b.running = true;
    const step = () => {
      const i = b.shown;
      if (!document.getElementById("beam")) { b.running = false; return; }
      place(i);
      setTimeout(() => {                                   // 350ms on the layer, then 150ms to green/red
        setTimeout(() => {
          b.shown = i + 1;
          const l = a.layers[i], d = view.querySelector(`.disc[data-i="${i}"]`);
          if (d) { d.className = "disc " + (l.pass ? "ok" : "bad"); d.innerHTML = `<span class="ck ${l.pass ? "green" : "red"}">${l.pass ? "✓" : "✕"}</span>`; }
          const r = view.querySelectorAll("#lrows .lrow .lv")[i];
          if (r) { r.className = "lv " + (l.pass ? "" : "red"); r.textContent = l.value; }
          if (b.shown < present) step();
          else { b.running = false; if (waiting) place(present); else { beamEl.style.opacity = 0; render(); } }
        }, 150);
      }, 350);
    };
    step();
  }

  // ---------- real OHLCV: GeckoTerminal public API (no key, CORS *), fetched by the phone; ~30 calls/min/IP limit ----------
  // One request per coin per 30s, at most one in flight, 60s back-off after a 429/error. Desk prices are the fallback.
  const OHLC = {}; let gtBusy = false, gtPauseUntil = 0, gtQueue = [];
  // timeframe -> [GeckoTerminal endpoint, aggregate, seconds per candle]
  const TFS = { "1m": ["minute", 1, 60], "5m": ["minute", 5, 300], "15m": ["minute", 15, 900], "1h": ["hour", 1, 3600] };
  const tfFor = (mint, ageH) => S.tf[mint] || (ageH != null && ageH > 3 ? "5m" : "1m");
  const ohlcKey = (mint, ageH) => mint + "|" + tfFor(mint, ageH);
  function gtWanted(mint, pool, ageH) {
    const tf = tfFor(mint, ageH), key = mint + "|" + tf, o = OHLC[key];
    if (!pool || (o && (o.loading || Date.now() - o.at < 30000))) return;
    if (gtBusy || Date.now() < gtPauseUntil) {                       // queue it: runs as soon as the slot frees / back-off ends
      if (!gtQueue.some(q => q[0] === key)) gtQueue.push([key, mint, pool, ageH]);
      OHLC[key] = Object.assign(o || { cs: [] }, { loading: true, waitUntil: gtPauseUntil });
      if (!gtBusy) setTimeout(gtNext, Math.max(0, gtPauseUntil - Date.now()) + 50);
      return;
    }
    gtBusy = true;
    const [ep, agg, step] = TFS[tf];
    OHLC[key] = Object.assign(o || { cs: [] }, { loading: true });
    const url = `https://api.geckoterminal.com/api/v2/networks/solana/pools/${encodeURIComponent(pool)}/ohlcv/${ep}?aggregate=${agg}&limit=150&currency=usd`;
    fetch(url, { headers: { Accept: "application/json" }, referrerPolicy: "no-referrer", cache: "no-store" })
      .then(r => { if (r.status !== 200) { const e = new Error("HTTP " + r.status); e.status = r.status; throw e; } return r.json(); })
      .then(j => {
        const l = (((j || {}).data || {}).attributes || {}).ohlcv_list || [];
        const cs = l.map(x => ({ t: +x[0], o: +x[1], h: +x[2], l: +x[3], c: +x[4], vol: +x[5] }))
          .filter(c => [c.t, c.o, c.h, c.l, c.c].every(isFinite)).sort((a, b) => a.t - b.t);
        OHLC[key] = { at: Date.now(), cs, label: tf, step, loading: false };
      })
      .catch(e => {
        if (!e || !e.status || e.status === 429) {                                   // rate limited: back off 15s, keep it queued (shows "retry in Ns")
          gtPauseUntil = Date.now() + 15000;
          OHLC[key] = Object.assign(OHLC[key] || { cs: [] }, { at: 0, loading: true, waitUntil: gtPauseUntil });
          if (!gtQueue.some(q => q[0] === key)) gtQueue.push([key, mint, pool, ageH]);
        } else OHLC[key] = Object.assign(OHLC[key] || { cs: [] }, { at: Date.now(), loading: false, failed: true });   // unknown pool etc: desk prices, retry in 30s
      })
      .finally(() => { gtBusy = false; setTimeout(gtNext, Math.max(0, gtPauseUntil - Date.now()) + 50);
        if (route().name === "coin" && decodeURIComponent(route().arg || "") === mint) render(); });
  }
  function gtNext() {
    if (gtBusy || Date.now() < gtPauseUntil || !gtQueue.length) return;
    const r = route(), cur = r.name === "coin" ? decodeURIComponent(r.arg || "") : null;
    gtQueue = gtQueue.filter(q => q[1] === cur);                       // only the coin on screen
    const q = gtQueue.shift(); if (!q) return;
    if (OHLC[q[0]]) { OHLC[q[0]].loading = false; OHLC[q[0]].at = 0; }
    gtWanted(q[1], q[2], q[3]);
  }
  // Desk fallback: db.prices 1-minute OHLC. A minute with one sample has o=c; open it at the previous close so the
  // body shows the move (both are real prices). Minutes with no sample are not drawn.
  function deskCandles(list, step) {
    const one = []; let prev = null;
    (list || []).forEach(c => { if (c.c == null) return; const t = typeof c.t === "number" ? c.t : Date.parse(c.t) / 1000;
      const o = prev != null && c.o === c.c ? prev : c.o;
      one.push({ t, o, h: Math.max(c.h, o), l: Math.min(c.l, o), c: c.c, vol: c.vol }); prev = c.c; });
    if (!step || step <= 60) return one;
    const out = [];                                                    // aggregate 1m desk candles into the chosen timeframe
    one.forEach(c => { const b = Math.floor(c.t / step) * step, last = out[out.length - 1];
      if (last && last.t === b) { last.h = Math.max(last.h, c.h); last.l = Math.min(last.l, c.l); last.c = c.c;
        last.vol = (last.vol || 0) + (c.vol > 0 ? c.vol : 0); }
      else out.push({ t: b, o: c.o, h: c.h, l: c.l, c: c.c, vol: c.vol > 0 ? c.vol : 0 }); });
    return out;
  }
  const dash = v => v == null ? "—" : v;
  const mcMode = () => { try { return localStorage.getItem("desk.mcmode") === "1"; } catch (e) { return false; } };
  const setMcMode = on => { try { localStorage.setItem("desk.mcmode", on ? "1" : "0"); } catch (e) { /* private mode */ } };
  const applyMcMode = on => { setMcMode(!!on); const cvs = document.getElementById("candles"); if (cvs) cvs._lastC = null; render(); };

  // header price: the newest real price we have (GeckoTerminal's last candle close if it is newer than the desk sample)
  function livePrice(mint, c) {
    const g = OHLC[ohlcKey(mint, c.age_h)], last = g && g.cs && g.cs.length ? g.cs[g.cs.length - 1] : null;
    const deskT = c.price_ts ? Date.parse(c.price_ts) / 1000 : 0;
    return last && (c.price == null || last.t + 60 > deskT) ? last.c : c.price;
  }
  function chartSrc(mint, c) {
    const cur = tfFor(mint, c.age_h), g = OHLC[mint + "|" + cur];
    const wait = g && g.waitUntil && g.waitUntil > Date.now() ? Math.ceil((g.waitUntil - Date.now()) / 1000) : 0;
    const src = g && g.cs && g.cs.length ? `${cur} · GeckoTerminal` : (g ? g.loading : !!c.pool) ? (wait ? `GeckoTerminal busy · retry in ${wait}s` : `Loading ${cur}…`)
      : (c.candles || []).length ? `${cur} · desk prices` : "";
    return `<span class="tfs">${Object.keys(TFS).map(k => `<button type="button" data-tf="${k}" class="${k === cur ? "on" : ""}" aria-pressed="${k === cur}">${k}</button>`).join("")}</span><span class="srcl">${esc(src)}</span>`;
  }
  function coinScreen(mint) {
    const loading = backbar("Home") + `<div class="gut">${sk(34, "60%")}${sk(18, "40%", "margin-top:8px")}${sk(56, "50%", "margin-top:14px")}</div>
      <div class="gut" style="margin-top:14px">${sk(260)}</div><div class="gut" style="margin-top:16px">${sk(130, null, "border-radius:14px")}</div>`;
    if (!S.state) return loading;
    if (S.missing[`coin/${mint}.json`]) return { html: backbar("Home") + `<div class="empty" style="padding-top:120px">Not on the desk tonight</div>`, after() {} };
    const c = S.coin[mint];
    if (!c) return loading;
    const p = c.position, x = c.exit;
    const chipOk = c.audit_chip === "8/8";
    const since = p && p.since_entry_pct;
    const left = x ? `${Math.floor(x.timeout_left_s / 3600)}h ${Math.floor(x.timeout_left_s % 3600 / 60)}m` : null;
    const chg = since != null ? [since, "since entry"] : c.stats.change24h != null ? [c.stats.change24h, "24h"] : c.stats.change1h != null ? [c.stats.change1h, "1h"] : null;
    const IC = { mc: '<path d="M4 19V9m5 10V5m5 14v-7m5 7V3"/>', liq: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>',
      vol: '<path d="M3 17l5-5 4 4 8-9"/><path d="M15 7h5v5"/>', hold: '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M16 4a3 3 0 0 1 0 6m2 4c2 .7 3 2.6 3 6"/>',
      v1: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>', bs: '<path d="M7 17V7l-3 3m3-3 3 3M17 7v10l-3-3m3 3 3-3"/>' };
    const tile = (ic, k, v) => `<div class="tile"><svg viewBox="0 0 24 24">${IC[ic]}</svg><div class="k">${k}</div><div class="vv">${v}</div></div>`;
    // Market cap toggle: price readouts switch to implied market cap = currentMC * (thatPrice / currentPrice), constant
    // supply. No current MC or price = n/a, never a made-up number. Saved in localStorage.
    const mcOn = mcMode(), curMC = c.stats.marketCap, curP = livePrice(mint, c) ?? c.price;
    const fac = curMC != null && curP != null && curP > 0 && isFinite(curMC / curP) ? curMC / curP : null;
    const disp = v => !mcOn ? price(v) : v == null || fac == null ? "n/a" : kfmt(v * fac);
    const mcTile = `<button type="button" class="tile tog${mcOn ? " on" : ""}" id="mctog" aria-pressed="${mcOn}"><svg viewBox="0 0 24 24">${IC.mc}</svg>
      <div class="k">Market cap <span class="tgl">${mcOn ? "showing MC · tap for price" : "tap to show MC"}</span></div><div class="vv">${kfmt(curMC)}</div></button>`;
    const au = S.audit[mint];
    const audit = au && au.layers ? `<div class="sh"><h2>Audit</h2><a href="#/audit/${encodeURIComponent(mint)}">${esc(c.audit_chip || "")} ›</a></div>
      <div class="list glass checklist">${au.layers.map(l => `<div class="ck"><span class="tk ${l.pass === true ? "ok" : l.pass === false ? "bad" : "nc"}">${l.pass === true ? "✓" : l.pass === false ? "✕" : "–"}</span>
        <span class="cn">${l.n} · ${esc(l.name)}</span><span class="cv ${l.pass === false ? "red" : l.pass == null ? "ter" : ""}">${esc(l.value == null ? "—" : l.value)}</span></div>`).join("")}</div>` : "";
    const html = backbar("Home") + `<div class="coinhead">
        <div class="cname">${logo(c.name || mint, c.logo, 48)}<span class="cnm"><span>${esc(c.name || mint.slice(0, 4) + "…" + mint.slice(-3))}</span>
          <span class="sec sm">${esc(c.symbol || "")} · ${esc(c.chain)} · ${c.age_h == null ? "age —" : c.age_h < 1 ? Math.round(c.age_h * 60) + "m old" : Math.floor(c.age_h) + "h old"}</span></span>
          ${c.audit_chip ? `<a href="#/audit/${encodeURIComponent(mint)}" class="chip ${chipOk ? "ok" : "bad"}">🛡 ${esc(c.audit_chip)}</a>` : ""}</div>
        <button type="button" class="pricerow" id="pricetog" aria-pressed="${mcOn}" aria-label="${mcOn ? "Show token price" : "Show market cap"}"><span class="big pricebig glow">${mcOn ? tick("m" + mint, fac == null ? null : (livePrice(mint, c) == null ? null : livePrice(mint, c) * fac), v => v == null ? "n/a" : kfmt(v)) : tick("p" + mint, livePrice(mint, c), price)}</span>${mcOn ? `<span class="ter sm mclbl">MC</span>` : ""}
          ${chg ? `<span class="cpill lg2 ${chg[0] >= 0 ? "up" : "down"}">${chg[0] >= 0 ? "▲" : "▼"} ${Math.abs(chg[0]).toFixed(chg[1] === "since entry" ? 2 : 1)}% <span class="ter">${chg[1]}</span></span>` : ""}
          <span class="mctip">${mcOn ? "tap to show price" : "tap to show market cap"}</span></button>
      </div>
      <div class="chartcard glass" id="chartcard"><div class="chsrc">${chartSrc(mint, c)}</div>
        <div class="zoomrow"><span class="zoomctl" role="group" aria-label="Chart zoom"><button type="button" id="zout" aria-label="Zoom out">−</button><button type="button" id="zfit" aria-label="Show all candles">All</button><button type="button" id="zin" aria-label="Zoom in">+</button></span><span class="zoomhint">pinch or drag</span></div>
        <div class="chartwrap" style="position:relative"><canvas id="candles"></canvas><i id="breath" class="breath" hidden></i><div class="chshim"></div></div></div>
      <div class="tiles">${mcTile}${tile("liq", "Liquidity", kfmt(c.stats.liquidityUsd))}
        ${tile("vol", "24h volume", kfmt(c.stats.volume24h))}${tile("hold", "Holders", c.stats.holders == null ? "—" : c.stats.holders.toLocaleString())}
        ${tile("v1", "1h volume", kfmt(c.stats.volume1h))}${tile("bs", "1h buys / sells", c.stats.buys1h == null ? "—" : c.stats.buys1h + " / " + dash(c.stats.sells1h))}</div>
      <div class="chg glass">${[["5m", c.stats.change5m], ["1h", c.stats.change1h], ["24h", c.stats.change24h]].map(([k, v]) =>
        `<div><span class="k">${k}</span><span class="${v == null ? "ter" : v >= 0 ? "green" : "red"}">${v == null ? "—" : sgn(v, 1)}</span></div>`).join("")}</div>
      ${p ? `<div class="card glass"><h3>Your position · ${money(p.sizeUsd)} in · ${esc(p.agent)}</h3>
          <div class="kv"><span class="sec">Entry${mcOn ? " MC" : ""}</span><span>${disp(p.entryPrice)}</span></div>
          ${p.hold ? `<div class="kv"><span class="sec">Hold</span><span>owner hold · no stop / trail / timeout (rug still exits)</span></div>` : ""}
          <div class="kv"><span class="sec">${esc(p.nativeSymbol || "SOL")} in</span><span>${nat(p.nativeIn)}</span></div>
          <div class="kv"><span class="sec">Entry fee</span><span>${p.entryFeeUsd == null ? "n/a" : money(p.entryFeeUsd)}</span></div>
          ${p.open ? "" : `<div class="kv"><span class="sec">Exit${mcOn ? " MC" : ""} · ${esc(p.exitReason)}</span><span>${disp(p.exitPrice)}</span></div>
          <div class="kv"><span class="sec">${esc(p.nativeSymbol || "SOL")} out</span><span>${nat(p.nativeOut)}</span></div>
          <div class="kv"><span class="sec">Fees (in + out)</span><span>${p.feesUsd == null ? "n/a" : money(p.feesUsd)}</span></div>
          <div class="kv"><span class="sec">PnL after fees</span><span class="${p.pnlUsd >= 0 ? "green" : "red"}">${money(p.pnlUsd)}</span></div>`}</div>` : ""}
      ${x ? `<div class="card glass"><h3>Exit</h3>
          <div class="kv"><span class="sec">Stop line · -${x.stop_pct}%</span><span class="red">${disp(x.stop_line)}</span></div>
          <div class="kv"><span class="sec">Trail line · ${x.trail_pct}%</span><span class="${x.trail_active ? "green" : "ter"}">${x.trail_active ? disp(x.trail_line) : "not active yet"}</span></div>
          <div class="kv"><span class="sec">Time left to timeout</span><span>${p && p.hold ? "on hold · no auto-sell (rug still exits)" : left}</span></div></div>` : ""}
      ${audit}
      <div class="note mono">${esc(mint)}</div>
      <div class="spacer"></div>${safeUrl(c.link) ? `<div class="ctabar"><a class="cta ${p && p.open ? "sell" : ""}" href="${esc(c.link)}" target="_blank" rel="noopener">${esc(c.button)}</a></div>` : ""}`;
    return { html, after() {
      gtWanted(mint, c.pool, c.age_h);
      const tf = tfFor(mint, c.age_h), step = TFS[tf][2], g = OHLC[mint + "|" + tf], gt = g && g.cs && g.cs.length ? g.cs : null;
      const cv = document.getElementById("candles");
      if (cv) {
        cv._st = Object.assign(cv._st || {}, {
          off: S.chartOff[mint] != null ? S.chartOff[mint] : (cv._st && cv._st.off) || 0,
          slot: S.chartSlot || (cv._st && cv._st.slot) || (window.DeskChart && DeskChart.SLOT_DEF) || 9
        });
      }
      const wrap = document.getElementById("chartcard");
      if (wrap) wrap.classList.toggle("loading", !!(g && g.loading && !gt));
      const base = gt || deskCandles(c.candles, step), k = mcOn ? fac : 1;
      const list = k == null ? [] : k === 1 ? base : base.map(q => ({ ...q, o: q.o * k, h: q.h * k, l: q.l * k, c: q.c * k }));
      const sc = v => v == null || k == null ? null : v * k;
      const lastC = DeskChart.candles(cv, list, x ? sc(x.risk_trailing_stop) : null,
                        { loading: !!c.pool && (!g || g.loading), step, min: 1, fmt: mcOn ? kfmt : undefined,
                          entryLine: p && p.entryPrice != null ? sc(p.entryPrice) : null,
                          emptyText: mcOn && k == null ? "Market cap n/a" : undefined });
      const flipMc = e => { e.preventDefault(); applyMcMode(!mcMode()); };
      const tg = document.getElementById("mctog");
      if (tg) tg.onclick = flipMc;
      const pg = document.getElementById("pricetog");
      if (pg) pg.onclick = flipMc;
      if (cv) {
        cv.addEventListener("pointerup", () => { if (cv._st) { S.chartOff[mint] = cv._st.off; saveSlot(cv); } });
        const doZoom = dir => { if (!window.DeskChart) return; DeskChart.zoom(cv, dir); if (cv._st) { S.chartOff[mint] = cv._st.off; saveSlot(cv); } };
        const zout = document.getElementById("zout"), zin = document.getElementById("zin"), zfit = document.getElementById("zfit");
        if (zout) zout.onclick = e => { e.preventDefault(); doZoom("out"); };
        if (zin) zin.onclick = e => { e.preventDefault(); doZoom("in"); };
        if (zfit) zfit.onclick = e => { e.preventDefault(); doZoom("fit"); };
      }
      breathe(lastC);
      view.querySelectorAll("[data-tf]").forEach(b => b.onclick = e => { e.preventDefault(); if (S.tf[mint] === b.dataset.tf) return;
        S.tf[mint] = b.dataset.tf; S.chartOff[mint] = 0; const cvs = document.getElementById("candles");
        if (cvs) { cvs._st = Object.assign(cvs._st || {}, { off: 0 }); cvs._lastC = null; }
        render(); });
    } };
  }

  function accountTab() {
    if (!S.state || !S.account) return navbar() + `<div class="sh"><h2>Account</h2></div><div class="gut">${sk(120, null, "border-radius:14px")}${sk(220, null, "border-radius:14px;margin-top:16px")}${sk(400, null, "border-radius:14px;margin-top:16px")}</div>`;
    const a = S.account;
    const grp = (S.state && new URLSearchParams(location.hash.split("?")[1] || "").get("sec")) || null;
    const order = [...AGENTS, "desk"];
    const groups = Object.entries(a.settings).sort((x, y) => order.indexOf(x[0]) - order.indexOf(y[0])).map(([sec, list]) => `<div class="grp" id="sec-${esc(sec)}">${esc(sec === "desk" ? "Desk" : TITLE[sec] || sec)}</div>
      <div class="list">${list.map(s => {
        const num = typeof s.value === "number" && s.min != null;
        return `<div class="setrow"><div class="sl"><span>${esc(s.name.replace(/_/g, " "))}</span><span class="val">${esc(s.value)}</span></div>
          ${num ? `<input type="range" disabled min="${s.min}" max="${s.max}" step="any" value="${s.value}" aria-label="${esc(s.name)}">` : ""}</div>`;
      }).join("")}</div>`).join("");
    const tc = a.ticket_check && a.ticket_check.message;
    const html = navbar() + `<div class="sh"><h2>Account</h2></div>
      <div class="list">
        <div class="row"><span class="main"><div class="t">Mode</div><div class="s wrap">Type “paper” or “live” in Telegram. LIVE asks you to type LIVE and needs 1 full PAPER night.</div></span>
          <span class="seg"><span class="${a.mode === "PAPER" ? "on" : ""}">PAPER</span><span class="${a.mode === "LIVE" ? "on" : ""}">LIVE</span></span></div>
        <div class="row"><span class="main"><div class="t">Stack</div><div class="s wrap">${a.mode === "LIVE" ? "Set in Telegram: “stack 20”" : "PAPER balance, starts at " + money(a.paper_start_stack)}</div></span><span class="v">${money(a.stack)}</span></div>
        ${tc ? `<div class="row"><span class="main"><div class="s orange">${esc(tc)}</div></span></div>` : ""}
        <div class="row">${ext(a.profile_url, `<span class="main"><div class="t">Your FOMO profile</div><div class="s">@${esc(a.fomo_handle)}</div></span><span class="ter">›</span>`, "row-in")}</div>
        <button class="row" id="invite" style="width:100%;text-align:left"><span class="main"><div class="t">Invite a friend</div><div class="s">Share your FOMO invite link</div></span><span class="ter">›</span></button>
      </div>
      <div class="grp">App</div>
      <div class="list">
        <div class="setrow" id="mcpref">
          <div class="sl"><span>Price readouts</span></div>
          <div class="s wrap">Token price or implied market cap, on the coin price, chart, entry, and stop. You can also tap the price or the Market cap tile.</div>
          <div class="seg wide" id="mcseg" role="group" aria-label="Price readouts">
            <button type="button" data-mc="0" class="${mcMode() ? "" : "on"}" aria-pressed="${!mcMode()}">Price</button>
            <button type="button" data-mc="1" class="${mcMode() ? "on" : ""}" aria-pressed="${mcMode()}">Market cap</button>
          </div>
        </div>
        <div class="setrow" id="themepref">
          <div class="sl"><span>App colors</span></div>
          <div class="s wrap">Background and accent for the whole app. Profit and loss stay green and red.</div>
          <div class="swatches" id="themes" role="group" aria-label="App colors">${Object.entries(THEMES).map(([id, th]) =>
            `<button type="button" class="swatch${themeId() === id ? " on" : ""}" data-theme="${id}" aria-pressed="${themeId() === id}" aria-label="${esc(th.label)}"><i class="swbg" style="background:${th.bg}"><b style="background:${th.accent}"></b></i><span>${esc(th.label)}</span></button>`).join("")}</div>
        </div>
        <div class="setrow" id="candlepref">
          <div class="sl"><span>Candlestick colors</span></div>
          <div class="s wrap">Up and down candles, and the volume bars under them, on the coin chart.</div>
          <div class="swatches" id="candlesel" role="group" aria-label="Candlestick colors">${Object.entries(CANDLES).map(([id, ch]) => {
            const up = id === "classic" ? THEMES[themeId()].green : (ch.up === "text" ? THEMES[themeId()].text : ch.up);
            const down = id === "classic" ? THEMES[themeId()].red : ch.down;
            return `<button type="button" class="swatch${candleId() === id ? " on" : ""}" data-candle="${id}" aria-pressed="${candleId() === id}" aria-label="${esc(ch.label)}"><i class="csticks"><b style="background:${up}"></b><b style="background:${down}"></b></i><span>${esc(ch.label)}</span></button>`;
          }).join("")}</div>
        </div>
      </div>
      <div class="grp">Notifications</div>
      <div class="list">
        <div class="row"><span class="main"><div class="t">Telegram</div><div class="s">${a.telegram.connected ? "Connected · pushes come here" : "Not connected"}</div></span><span class="${a.telegram.connected ? "green" : "red"}">${a.telegram.connected ? "●" : "○"}</span></div>
        <div class="row"><span class="main"><div class="t">Send test push</div><div class="s">Type “status” in Telegram to get one.</div></span></div>
        <div class="row"><span class="main"><div class="t">Web push</div><div class="s wrap">${esc(a.web_push.note)}</div></span></div>
      </div>
      <div class="note">${esc(a.settings_note)}</div>
      ${groups}`;
    return { html: html.replace('class="row-in"', 'style="display:flex;flex:1;align-items:center;gap:12px"'), after() {
      document.querySelectorAll("#mcseg [data-mc]").forEach(b => b.onclick = e => { e.preventDefault(); applyMcMode(b.dataset.mc === "1"); });
      document.querySelectorAll("#themes [data-theme]").forEach(b => b.onclick = e => { e.preventDefault(); setTheme(b.dataset.theme); });
      document.querySelectorAll("#candlesel [data-candle]").forEach(b => b.onclick = e => { e.preventDefault(); setCandles(b.dataset.candle); });
      const inv = document.getElementById("invite");
      if (inv) inv.onclick = async () => {
        const url = a.signup_url;
        try { if (navigator.share) { await navigator.share({ title: "FOMO", url }); return; } } catch (e) { if (e && e.name === "AbortError") return; }
        try { await navigator.clipboard.writeText(url); toast("Link copied"); } catch (e) { toast(url); }
      };
      if (grp) { const el = document.getElementById("sec-" + grp); if (el) el.scrollIntoView(); }
    } };
  }

  function gate() {
    return `<div class="gate"><h1>Open the desk link</h1><p>Type “status” to your Grok Bot in Telegram, copy the desk link it sends, and paste it here.</p>
      <input id="gl" class="gin" type="url" inputmode="url" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Paste the desk link">
      <button id="gb" class="gbtn">Open desk</button><p id="ge" class="gerr" hidden>That isn't a desk link. Copy the whole link from Telegram.</p></div>`;
  }
  function bindGate() {
    const b = document.getElementById("gb"); if (!b) return;
    b.onclick = () => { const v = (document.getElementById("gl").value || "").trim();
      const m = v.match(/[#?&]d=([^&\s]+)/); const dp = m ? decodeURIComponent(m[1]).trim() : "";
      if (dp.length < 32) { document.getElementById("ge").hidden = false; return; }
      localStorage.setItem("desk.d", dp); location.replace(location.pathname + location.search + "#/home?d=" + encodeURIComponent(dp)); location.reload(); };
  }

  // ---------- render / routing ----------
  function render() {
    tickOffline();
    const r = route();
    document.querySelectorAll(".tab").forEach(t => t.classList.toggle("on", t.dataset.tab === r.name || ((r.name === "coin" || r.name === "audit") && t.dataset.tab === "home") || (r.name === "report" && t.dataset.tab === "activity")));
    const tabs = [...document.querySelectorAll(".tab")], on = tabs.findIndex(t => t.classList.contains("on")), ind = document.getElementById("tabind");
    if (ind && on >= 0) ind.style.transform = `translateX(${on * 100}%)`;
    if (!BASE) { if (!document.getElementById("gb")) { view.innerHTML = gate(); bindGate(); } document.getElementById("tabbar").hidden = true; return; }
    const out = r.name === "agents" ? agentsTab() : r.name === "activity" ? activityTab() : r.name === "account" ? accountTab()
      : r.name === "coin" && r.arg ? coinScreen(decodeURIComponent(r.arg)) : r.name === "audit" ? auditScreen(r.arg && decodeURIComponent(r.arg))
      : r.name === "report" && r.arg ? reportScreen(decodeURIComponent(r.arg)) : home();
    const o = typeof out === "string" ? { html: out } : out;
    const ae = document.activeElement && document.activeElement.id === "q";
    view.innerHTML = o.html;
    if (navAnim && !RM()) { view.classList.remove("enter"); void view.offsetWidth; view.classList.add("enter");
      view.querySelectorAll(".list > .row, .acard, .agentfull, .stats > div").forEach((el, i) => el.style.setProperty("--i", Math.min(i, 12))); }
    navAnim = false;
    if (S.state) seenReady = true;
    if (o.after) o.after();
    bind(ae);
  }
  function bind(refocus) {
    const sb = document.getElementById("searchbtn");
    if (sb) sb.onclick = () => { S.showSearch = !S.showSearch; render(); const q = document.getElementById("q"); if (q) q.focus(); };
    const q = document.getElementById("q");
    if (q) { q.oninput = () => { S.search = q.value; const pos = q.selectionStart; render(); const n = document.getElementById("q"); n.focus(); n.setSelectionRange(pos, pos); };
      if (refocus) q.focus(); }
    view.querySelectorAll("[data-range]").forEach(b => b.onclick = () => { S.range = b.dataset.range; chartPrev = null; render(); });
  }
  let navAnim = false;
  window.addEventListener("hashchange", async () => {
    keepD(); navAnim = true;
    window.scrollTo(0, 0); render();
    if (S.state) { try { await loadRoute(null); } catch (e) {} render(); }
  });
  let rz; window.addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(render, 150); });

  if ("serviceWorker" in navigator && !LOCAL) navigator.serviceWorker.register("sw.js?v=16", { updateViaCache: "none" }).catch(() => {});
  render();
  if (BASE) poll();
  window.desk = { S, render };
})();
