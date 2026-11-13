/* Grok Bot desk app. Plan B: polls public JSON files written by api.py. No framework, no build. */
(function () {
  "use strict";
  function nat(v) { return v == null ? "n/a" : Number(v).toPrecision(4); }
  const SUPA = "https://arbqqmxcmzkfvksapiaw.supabase.co/storage/v1/object/public/desk/d/";
  const LOCAL = ["localhost", "127.0.0.1"].includes(location.hostname);
  const QS = new URLSearchParams(location.search);
  const FIXTURE = LOCAL ? QS.get("fixture") : null;          // local screenshots only
  const POLL_VISIBLE_S = 2, POLL_HIDDEN_S = 15, POLL_S = POLL_VISIBLE_S, MAX_BACKOFF = 60;
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
              reports: null, report: {}, missing: {}, err: false, lastGood: null, next: 0, range: "LIVE", search: "", showSearch: false,
              tpDraft: {}, tpPart: {}, slDraft: {}, slPart: {}, lineDraft: {}, book: null };
  const view = document.getElementById("view"), offline = document.getElementById("offline");
  let chartPrev = null, odoPrev = null, beam = {}, execAnim = null;

  // ---------- appearance (device-only; theme + candle colors + chart zoom) ----------
  try { S.deskTab = localStorage.getItem("desk.deskTab") || null; } catch (e) {}
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
    navy: { label: "Navy", bg: "#0a1328", text: "#e8eef8", sec: "rgba(220,230,245,.62)", ter: "rgba(220,230,245,.34)",
      sep: "rgba(140,170,220,.12)", card: "rgba(16,28,54,.88)", card2: "rgba(122,168,255,.10)",
      green: "#3ee0b0", red: "#ff6b7d", orange: "#ffb02e", cyan: "#7ec8ff", blue: "#7aa8ff", yellow: "#ffd84d", pink: "#ff7ab6",
      accent: "#7aa8ff", wash: "rgba(122,168,255,.16)", wash2: "rgba(62,224,176,.07)", hair: "rgba(140,170,220,.14)",
      ctaText: "#071018", tabbar: "rgba(10,19,40,.82)", themeColor: "#0a1328" },
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
      ctaText: "#ffffff", tabbar: "rgba(255,255,255,.82)", themeColor: "#eef0f4" },
    graphite: { label: "Graphite", bg: "#0c0e11", text: "#eef0f3", sec: "rgba(238,240,243,.62)", ter: "rgba(238,240,243,.34)",
      sep: "rgba(197,201,208,.10)", card: "rgba(28,32,38,.88)", card2: "rgba(197,201,208,.10)",
      green: "#3ee0a0", red: "#ff5c7a", orange: "#ffb02e", cyan: "#8ec8ff", blue: "#7aa2ff", yellow: "#ffd84d", pink: "#ff7ab6",
      accent: "#c5c9d0", wash: "rgba(197,201,208,.10)", wash2: "rgba(62,224,160,.06)", hair: "rgba(197,201,208,.12)",
      ctaText: "#0c0e11", tabbar: "rgba(12,14,17,.80)", themeColor: "#0c0e11" },
    forest: { label: "Forest", bg: "#07110c", text: "#e8f6ee", sec: "rgba(232,246,238,.62)", ter: "rgba(232,246,238,.34)",
      sep: "rgba(143,219,110,.10)", card: "rgba(14,32,22,.86)", card2: "rgba(143,219,110,.10)",
      green: "#3ee08c", red: "#ff6b7d", orange: "#ffb02e", cyan: "#7ad4c0", blue: "#5aa88a", yellow: "#ffd84d", pink: "#ff8aa0",
      accent: "#8fdb6e", wash: "rgba(143,219,110,.14)", wash2: "rgba(62,224,140,.06)", hair: "rgba(143,219,110,.14)",
      ctaText: "#061208", tabbar: "rgba(7,17,12,.80)", themeColor: "#07110c" },
    rose: { label: "Rose", bg: "#14080c", text: "#fdeef2", sec: "rgba(253,238,242,.62)", ter: "rgba(253,238,242,.34)",
      sep: "rgba(255,122,162,.10)", card: "rgba(36,16,22,.86)", card2: "rgba(255,122,162,.10)",
      green: "#3dd68c", red: "#ff4d6d", orange: "#ffb02e", cyan: "#ffb3c8", blue: "#ff8aa8", yellow: "#ffd84d", pink: "#ff7aa2",
      accent: "#ff7aa2", wash: "rgba(255,122,162,.14)", wash2: "rgba(61,214,140,.06)", hair: "rgba(255,122,162,.14)",
      ctaText: "#1a0408", tabbar: "rgba(20,8,12,.80)", themeColor: "#14080c" }
  };
  const CANDLES = {
    classic: { label: "Green / red", up: null, down: null },
    asian:   { label: "Red / green", up: "#e63946", down: "#2a9d8f" },
    cyan:    { label: "Cyan / orange", up: "#5ad8ff", down: "#ff9f0a" },
    gold:    { label: "Gold / red", up: "#ffd60a", down: "#ff453a" },
    blue:    { label: "Blue / pink", up: "#4c9dff", down: "#ff7ab6" },
    mono:    { label: "Solid / red", up: "text", down: "#ff5c7a" }
  };
  const UIS = {
    nova: { label: "Nova", blurb: "The current design — a floating tab bar and rounded cards." },
    classic: { label: "Classic", blurb: "The previous look, if you want to go back." },
    terminal: { label: "Terminal", blurb: "A tighter trading desk — mono numbers and a flush tab bar." },
    studio: { label: "Studio", blurb: "Airy and large, with a soft pill tab bar." },
    pulse: { label: "Pulse", blurb: "Bolder accents and a stronger color wash." },
    editorial: { label: "Editorial", blurb: "A financial journal — serif type, hairlines, and almost no chrome." },
    block: { label: "Block", blurb: "Brutal and boxed, with heavy type and hard edges." },
    halo: { label: "Halo", blurb: "A soft consumer app — rounded type and a circular balance." },
    blotter: { label: "Blotter", blurb: "A market blotter — mono type, dense rows, and a ticker header." }
  };
  const UI_IDS = Object.keys(UIS);
  const COLOR_KEYS = [
    { key: "bg", label: "Background" },
    { key: "text", label: "Text" },
    { key: "card", label: "Cards" },
    { key: "accent", label: "Accent" },
    { key: "green", label: "Profit" },
    { key: "red", label: "Loss" },
    { key: "blue", label: "Links" },
    { key: "orange", label: "Warning" }
  ];
  const CANDLE_COLOR_KEYS = [
    { key: "up", label: "Candle up" },
    { key: "down", label: "Candle down" }
  ];
  const COLOR_PALETTES = {
    ice:    { label: "Ice",    bg: "#071018", text: "#e8f4ff", card: "#0e1a24", accent: "#7ad7ff", green: "#3ee0b0", red: "#ff6b8a", blue: "#7ad7ff", orange: "#ffc86b", up: "#3ee0b0", down: "#ff6b8a" },
    solar:  { label: "Solar",  bg: "#140e08", text: "#ffeccc", card: "#1c140c", accent: "#ffb020", green: "#c6d44a", red: "#ff6a3d", blue: "#ffc46b", orange: "#ff8a3d", up: "#e6c35c", down: "#ff6a3d" },
    neon:   { label: "Neon",   bg: "#05050a", text: "#f4f4ff", card: "#101018", accent: "#d94cff", green: "#00ff9c", red: "#ff2d6a", blue: "#3df0ff", orange: "#ffb020", up: "#00ff9c", down: "#ff2d6a" },
    sage:   { label: "Sage",   bg: "#0c1210", text: "#e6eee8", card: "#141c18", accent: "#8fbfa0", green: "#6fbf8a", red: "#e07a6a", blue: "#7aa8a0", orange: "#d4a574", up: "#6fbf8a", down: "#e07a6a" },
    paper:  { label: "Paper",  bg: "#f4efe6", text: "#1a1714", card: "#fffaf3", accent: "#b5451a", green: "#2a7a4a", red: "#c43c2e", blue: "#2a5fa8", orange: "#c67a16", up: "#2a7a4a", down: "#c43c2e" },
    royal:  { label: "Royal",  bg: "#0b1020", text: "#f0e6c8", card: "#141a30", accent: "#d4b15a", green: "#6bcf9a", red: "#e06b6b", blue: "#8aa4ff", orange: "#e0a04a", up: "#d4b15a", down: "#e06b6b" },
    candy:  { label: "Candy",  bg: "#140814", text: "#ffe8f4", card: "#1c101c", accent: "#ff5aa5", green: "#5ee0c0", red: "#ff4d6d", blue: "#c9a0ff", orange: "#ffb347", up: "#5ee0c0", down: "#ff4d6d" },
    mono:   { label: "Mono",   bg: "#0a0a0a", text: "#f2f2f2", card: "#161616", accent: "#f2f2f2", green: "#d0d0d0", red: "#888888", blue: "#c0c0c0", orange: "#a0a0a0", up: "#ffffff", down: "#666666" }
  };
  const CHIP_COLORS = ["#000000","#1c1c1e","#3a3a3c","#8e8e93","#e5e5ea","#f5f5f7","#ffffff","#0a84ff","#5e5ce6","#bf5af2","#ff2d55","#ff453a","#ff9f0a","#ffd60a","#30d158","#00c7be","#64d2ff","#ac8e68"];
  let colorTarget = { key: "accent", group: "ui" };
  const pref = (key, allowed, fallback) => { try { const v = localStorage.getItem(key); return allowed.includes(v) ? v : fallback; } catch (e) { return fallback; } };
  const themeId = () => { try { return THEMES[localStorage.getItem("desk.theme")] ? localStorage.getItem("desk.theme") : "midnight"; } catch (e) { return "midnight"; } };
  const candleId = () => { try { const v = localStorage.getItem("desk.candles"); if (v === "custom") return "custom"; return CANDLES[v] ? v : "classic"; } catch (e) { return "classic"; } };
  const uiId = () => pref("desk.ui", UI_IDS, "nova");
  const typeId = () => pref("desk.type", ["default", "large"], "default");
  const densId = () => pref("desk.density", ["comfortable", "compact"], "comfortable");
  const fxId = () => pref("desk.fx", ["full", "calm"], "full");
  const radId = () => pref("desk.radius", ["soft", "sharp"], "soft");
  const fontId = () => pref("desk.font", ["default", "rounded"], "default");
  const volOn = () => { try { return localStorage.getItem("desk.vol") !== "0"; } catch (e) { return true; } };
  function parseHex(v) {
    if (typeof v !== "string") return null;
    const m = v.trim().match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
    if (!m) return null;
    let h = m[1];
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    return "#" + h.toLowerCase();
  }
  function hexRgb(h) {
    h = (parseHex(h) || "").slice(1);
    if (h.length !== 6) return null;
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  function rgbaHex(h, a) {
    const rgb = hexRgb(h);
    return rgb ? "rgba(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + "," + a + ")" : h;
  }
  function isLightHex(h) {
    const rgb = hexRgb(h);
    return rgb ? (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000 > 160 : false;
  }
  function onHex(h) { return isLightHex(h) ? "#111111" : "#ffffff"; }
  function toInputHex(v, fallback) {
    const h = parseHex(v);
    if (h) return h;
    const m = String(v || "").match(/^rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    if (m) return "#" + [m[1], m[2], m[3]].map(n => ("0" + Number(n).toString(16)).slice(-2)).join("");
    return parseHex(fallback) || "#000000";
  }
  function loadCustom() {
    try {
      const o = JSON.parse(localStorage.getItem("desk.custom") || "{}");
      if (!o || typeof o !== "object") return {};
      const out = {};
      COLOR_KEYS.forEach(k => { const h = parseHex(o[k.key]); if (h) out[k.key] = h; });
      return out;
    } catch (e) { return {}; }
  }
  function loadCandleCustom() {
    try {
      const o = JSON.parse(localStorage.getItem("desk.candleCustom") || "{}");
      return { up: parseHex(o && o.up), down: parseHex(o && o.down) };
    } catch (e) { return { up: null, down: null }; }
  }
  function hasCustomColors() {
    const c = loadCustom(), k = loadCandleCustom();
    return Object.keys(c).length > 0 || !!(k.up || k.down);
  }
  function withCustom(t) {
    const c = loadCustom();
    const out = Object.assign({}, t, c);
    if (c.text) { out.sec = rgbaHex(c.text, 0.62); out.ter = rgbaHex(c.text, 0.34); }
    if (c.bg) {
      const ink = isLightHex(c.bg) ? "#111111" : "#ffffff";
      out.themeColor = c.bg;
      out.tabbar = rgbaHex(c.bg, 0.80);
      out.sep = rgbaHex(ink, 0.10);
      out.hair = rgbaHex(ink, 0.10);
    }
    if (c.card) out.card2 = rgbaHex(c.text || t.text, isLightHex(out.bg) ? 0.08 : 0.10);
    if (c.accent) out.wash = rgbaHex(c.accent, 0.14);
    if (c.blue) out.wash2 = rgbaHex(c.blue, 0.08);
    out.ctaText = onHex(out.accent);
    out.ctaSellText = onHex(out.red);
    out.ctaWarnText = onHex(out.orange);
    return out;
  }
  function candlePair(th) {
    const t = th || THEMES[themeId()] || THEMES.midnight;
    const cc = loadCandleCustom();
    if (candleId() === "custom") return { up: cc.up || t.green, down: cc.down || t.red };
    const c = CANDLES[candleId()] || CANDLES.classic;
    return { up: c.up == null ? t.green : c.up === "text" ? t.text : c.up, down: c.down == null ? t.red : c.down };
  }
  function applyAppearance() {
    const id = themeId(), t = withCustom(THEMES[id] || THEMES.midnight), c = candlePair(t);
    const r = document.documentElement;
    r.setAttribute("data-theme", id);
    r.setAttribute("data-ui", uiId());
    r.setAttribute("data-type", typeId());
    r.setAttribute("data-density", densId());
    r.setAttribute("data-fx", fxId());
    r.setAttribute("data-radius", radId());
    r.setAttribute("data-vol", volOn() ? "on" : "off");
    r.setAttribute("data-font", fontId());
    const set = (k, v) => r.style.setProperty(k, v);
    ["bg","text","sec","ter","sep","card","card2","green","red","orange","cyan","blue","yellow","pink","accent","wash","wash2","hair"].forEach(k => set("--" + k, t[k]));
    set("--cta-text", t.ctaText);
    set("--cta-sell-text", t.ctaSellText || onHex(t.red));
    set("--cta-warn-text", t.ctaWarnText || onHex(t.orange));
    set("--tabbar", t.tabbar);
    set("--candle-up", c.up);
    set("--candle-down", c.down);
    if (fontId() === "rounded") {
      const f = 'ui-rounded,"SF Pro Rounded","Hiragino Maru Gothic ProN","Arial Rounded MT Bold",sans-serif';
      set("--textf", f); set("--display", f);
    } else {
      r.style.removeProperty("--textf");
      r.style.removeProperty("--display");
    }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", t.themeColor || t.bg);
    const sb = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
    if (sb) sb.setAttribute("content", isLightHex(t.bg) ? "default" : "black");
    document.body && (document.body.style.backgroundColor = t.bg);
    try {
      const slot = parseFloat(localStorage.getItem("desk.slot"));
      if (slot >= 3 && slot <= 24) S.chartSlot = slot;
    } catch (e) {}
  }
  function setCustom(key, hex, group) {
    const h = parseHex(hex);
    if (!h) return;
    try {
      if (group === "candle") {
        const o = loadCandleCustom();
        o[key] = h;
        localStorage.setItem("desk.candleCustom", JSON.stringify({ up: o.up, down: o.down }));
        localStorage.setItem("desk.candles", "custom");
      } else {
        const o = loadCustom();
        o[key] = h;
        localStorage.setItem("desk.custom", JSON.stringify(o));
      }
      localStorage.removeItem("desk.palette");
    } catch (e) {}
    applyAppearance();
    const cvs = document.getElementById("candles"); if (cvs) cvs._lastC = null;
    const picker = document.querySelector('.picker input[data-ckey="' + key + '"][data-cgroup="' + (group || "ui") + '"]');
    const row = picker && picker.closest(".picker");
    if (row) {
      const sw = row.querySelector(".sw"); if (sw) sw.style.background = h;
      const col = row.querySelector('input[type=color]'); if (col && col.value !== h) col.value = h;
      const hx = row.querySelector("input.phex"); if (hx && hx !== document.activeElement) hx.value = h;
    }
    const reset = document.getElementById("resetcolors");
    if (reset) reset.hidden = false;
    if (group === "candle") {
      document.querySelectorAll("#candlesel [data-candle]").forEach(b => {
        const on = b.dataset.candle === "custom";
        b.classList.toggle("on", on);
        b.setAttribute("aria-pressed", String(on));
      });
    }
  }
  function resetCustomColors() {
    try { localStorage.removeItem("desk.custom"); localStorage.removeItem("desk.candleCustom"); localStorage.removeItem("desk.palette"); } catch (e) {}
    if (candleId() === "custom") { try { localStorage.setItem("desk.candles", "classic"); } catch (e) {} }
    applyAppearance();
    const cvs = document.getElementById("candles"); if (cvs) cvs._lastC = null;
    render();
  }
  function applyPalette(id) {
    const p = COLOR_PALETTES[id];
    if (!p) return;
    const custom = {};
    COLOR_KEYS.forEach(k => { if (p[k.key]) custom[k.key] = p[k.key]; });
    try {
      localStorage.setItem("desk.custom", JSON.stringify(custom));
      localStorage.setItem("desk.candleCustom", JSON.stringify({ up: p.up, down: p.down }));
      localStorage.setItem("desk.candles", "custom");
      localStorage.setItem("desk.palette", id);
    } catch (e) {}
    applyAppearance();
    const cvs = document.getElementById("candles"); if (cvs) cvs._lastC = null;
    render();
  }
  function paletteId() {
    try { const id = localStorage.getItem("desk.palette"); return COLOR_PALETTES[id] ? id : ""; } catch (e) { return ""; }
  }
  function setTheme(id) { try { localStorage.setItem("desk.theme", THEMES[id] ? id : "midnight"); } catch (e) {} applyAppearance(); const cvs = document.getElementById("candles"); if (cvs) cvs._lastC = null; render(); }
  function setCandles(id) { try { localStorage.setItem("desk.candles", (id === "custom" || CANDLES[id]) ? id : "classic"); } catch (e) {} applyAppearance(); const cvs = document.getElementById("candles"); if (cvs) cvs._lastC = null; render(); }
  function setPref(key, val, allowed) {
    if (!allowed.includes(val)) return;
    try { localStorage.setItem(key, val); } catch (e) {}
    applyAppearance();
    const cvs = document.getElementById("candles"); if (cvs) cvs._lastC = null;
    render();
  }
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
  const shortAddr = a => { a = a == null ? "" : String(a); return a.length <= 12 ? a : a.slice(0, 4) + "…" + a.slice(-4); };
  function activeBook() {
    if (S.book === "misses" || S.book === "LIVE" || S.book === "PAPER") return S.book;
    return (S.state && S.state.mode === "LIVE") ? "LIVE" : "PAPER";
  }
  function bookSnap() {
    const book = activeBook();
    if (book === "misses") return null;
    const st = S.state || {};
    if (st.books && st.books[book]) return st.books[book];
    if (book === (st.paper ? "PAPER" : "LIVE")) return st;
    return null;
  }
  function bookChart() {
    const book = activeBook(), ch = S.chart || {};
    if (ch.books && ch.books[book]) return ch.books[book];
    if (book === ((S.state && S.state.paper) ? "PAPER" : "LIVE")) return ch;
    return { ranges: {}, start_value: null };
  }
  // 2026-11-11 half-manual desk: Sell / Take profit open the desk bot in Telegram with a /start payload.
  // The app holds no key or token: the bot only obeys the owner's own chat, and a full sell needs a Confirm tap there.
  const DESK_BOT = "https://t.me/Tradingaibotgrok_bot?start=";
  const posId = id => Number.isInteger(id) && id > 0 ? id : null;
  const tgLink = payload => /^[A-Za-z0-9_-]{1,64}$/.test(payload) ? DESK_BOT + payload : null;
  const tpText = (pct, part) => pct == null ? null : "+" + (+pct).toLocaleString("en-US", { maximumFractionDigits: 2 }) + "% · sell " + (part === "half" ? "half" : "all");
  function tpPayload(id, pct, part, prefix) {
    const v = Math.round(+pct * 10) / 10;
    if (!posId(id) || !isFinite(v) || v <= 0 || v > 100000) return null;
    const whole = Math.trunc(v), dec = Math.round((v - whole) * 10);
    return `${prefix || "tp_"}${id}_${whole}${dec ? "p" + dec : ""}_${part === "half" ? "half" : "all"}`;
  }
  function slPayload(id, pct, part, prefix) {
    const v = Math.round(+pct * 10) / 10;
    if (!posId(id) || !isFinite(v) || v <= 0 || v >= 100) return null;
    const whole = Math.trunc(v), dec = Math.round((v - whole) * 10);
    return `${prefix || "sl_"}${id}_${whole}${dec ? "p" + dec : ""}_${part === "half" ? "half" : "all"}`;
  }
  const cssVar = (n, fb) => { try { const v = getComputedStyle(document.documentElement).getPropertyValue(n).trim(); return v || fb; } catch (e) { return fb; } };
  function linePctTxt(kind, source, pct) {
    const who = source === "you" ? "you" : "risk";
    const n = pct == null || !isFinite(+pct) ? null : +pct;
    if (kind === "tp") return "TP (" + who + ")" + (n == null ? "" : " +" + n.toFixed(Math.abs(n) >= 10 ? 0 : 1) + "%");
    if (kind === "sl") return "SL (" + who + ")" + (n == null ? "" : " " + n.toFixed(Math.abs(n) >= 10 ? 0 : 1) + "%");
    return kind;
  }
  function athFrom(c, list) {
    const launchT = c && c.launched_at ? Date.parse(c.launched_at) / 1000 : null;
    const first = list && list.length ? list[0].t : null;
    let hi = null;
    if (launchT && first != null && isFinite(first) && first <= launchT + 1800) {
      const mx = Math.max(...list.map(x => x.h).filter(v => v != null && isFinite(v)));
      if (isFinite(mx)) hi = mx;
    }
    if (c && c.ath != null && isFinite(+c.ath)) hi = hi == null ? +c.ath : Math.max(hi, +c.ath);
    return hi;
  }
  function posChartLines(entry, snap, draft, ath, sc) {
    const sx = v => (v == null || !isFinite(v)) ? null : (sc ? sc(v) : v);
    const out = [];
    if (entry != null && isFinite(entry)) out.push({ id: "entry", kind: "entry", price: sx(entry), label: "Entry", color: cssVar("--cyan", "#64d2ff"), drag: false });
    if (ath != null && isFinite(ath)) out.push({ id: "ath", kind: "ath", price: sx(ath), label: "ATH", color: cssVar("--yellow", "#ffd60a"), drag: false, dash: true });
    const riskSl = snap && snap.sl_risk_price;
    const userSl = draft && draft.slPrice != null ? draft.slPrice : (snap && snap.sl_price);
    const userSlPct = draft && draft.slPct != null ? draft.slPct : (snap && snap.sl_pct);
    const riskPct = snap && snap.sl_risk_pct;
    if (userSl != null && isFinite(userSl)) {
      if (riskSl != null && isFinite(riskSl) && Math.abs(riskSl - userSl) / Math.max(Math.abs(riskSl), 1e-18) > 0.002)
        out.push({ id: "sl-risk", kind: "sl", price: sx(riskSl), label: linePctTxt("sl", "risk", riskPct), color: cssVar("--red", "#ff453a"), drag: false, source: "risk", dash: true });
      const pct = userSlPct != null ? -Math.abs(+userSlPct) : (entry ? 100 * (userSl / entry - 1) : null);
      out.push({ id: "sl", kind: "sl", price: sx(userSl), label: linePctTxt("sl", "you", pct), color: cssVar("--red", "#ff453a"), drag: true, source: "you" });
    } else if (riskSl != null && isFinite(riskSl)) {
      out.push({ id: "sl", kind: "sl", price: sx(riskSl), label: linePctTxt("sl", "risk", riskPct), color: cssVar("--red", "#ff453a"), drag: true, source: "risk", dash: true });
    }
    const userTp = draft && draft.tpPrice != null ? draft.tpPrice : (snap && snap.tp_price);
    const userTpPct = draft && draft.tpPct != null ? draft.tpPct : (snap && snap.tp_pct);
    if (userTp != null && isFinite(userTp)) {
      out.push({ id: "tp", kind: "tp", price: sx(userTp), label: linePctTxt("tp", "you", userTpPct), color: cssVar("--green", "#00d35a"), drag: true, source: "you" });
    }
    return out.filter(L => L.price != null && isFinite(L.price));
  }
  function heldFor(iso) {
    if (!iso) return "—";
    const s = Math.max(0, (Date.now() - new Date(iso)) / 1000);
    if (s < 60) return "<1m";
    if (s < 3600) return Math.round(s / 60) + "m";
    if (s < 86400) return Math.floor(s / 3600) + "h " + Math.round((s % 3600) / 60) + "m";
    return Math.floor(s / 86400) + "d " + Math.floor((s % 86400) / 3600) + "h";
  }
  const moneyS = v => v == null ? "—" : (v >= 0 ? "+" : "-") + "$" + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const kfmt = v => v == null ? "—" : v >= 1e6 ? "$" + (v / 1e6).toFixed(2) + "M" : v >= 1e3 ? "$" + (v / 1e3).toFixed(1) + "K" : "$" + v.toFixed(0);
  // same subscript-zero format as the chart axis: 0.000000001458 -> "$0.0₈1458" (never "e-" notation)
  const price = v => v == null || !isFinite(v) ? "—" : "$" + (v >= 1 && v < 1000 ? v.toFixed(4) : window.DeskChart.fmtP(v));
  const sgn = (v, d = 2) => v == null ? "—" : (v >= 0 ? "+" : "") + v.toFixed(d) + "%";
  // Mark-to-market: size * price / entry. Missing price or entry → null, never a made-up number.
  function markValue(size, entry, px) {
    if (size == null || entry == null || !(entry > 0) || px == null || !isFinite(size) || !isFinite(px)) return null;
    return size * px / entry;
  }
  function markPct(entry, px) {
    if (entry == null || !(entry > 0) || px == null || !isFinite(px)) return null;
    return 100 * (px / entry - 1);
  }
  function posMark(p, mint, c) {
    if (!p) return { now: null, pnl: null, pct: null, afterFees: false };
    if (p.open) {
      const px = c ? livePrice(mint, c) : null;
      const now = markValue(p.sizeUsd, p.entryPrice, px);
      const pnl = now == null || p.sizeUsd == null ? null : now - p.sizeUsd;
      return { now, pnl, pct: markPct(p.entryPrice, px), afterFees: false };
    }
    const now = p.exitValueUsd != null ? p.exitValueUsd : markValue(p.sizeUsd, p.entryPrice, p.exitPrice);
    const afterFees = p.pnlUsd != null;
    const pnl = afterFees ? p.pnlUsd : (now == null || p.sizeUsd == null ? null : now - p.sizeUsd);
    const pct = afterFees && p.sizeUsd ? 100 * p.pnlUsd / p.sizeUsd : markPct(p.entryPrice, p.exitPrice);
    return { now, pnl, pct, afterFees };
  }
  function posPnlBlock(p, mint, c) {
    const m = posMark(p, mint, c);
    const cls = m.pct == null && m.pnl == null ? "ter" : (m.pct != null ? m.pct : m.pnl) >= 0 ? "green" : "red";
    const feeLab = m.afterFees ? "after fees" : "before fees";
    const key = (mint || "pos") + (p.open ? "o" : "x");
    return `<div class="pospnl">
      <div class="posnow"><div class="posbig">${tick("pv" + key, m.now, money)}</div><div class="s">now</div></div>
      <div class="poschg"><div class="posbig ${cls}">${tick("pp" + key, m.pct, v => sgn(v, 2))}</div><div class="s">${feeLab}</div></div>
    </div>
    <div class="kv"><span class="sec">Put in</span><span>${money(p.sizeUsd)}</span></div>
    <div class="kv"><span class="sec">P&amp;L · ${feeLab}</span><span class="${cls}">${moneyS(m.pnl)}</span></div>`;
  }
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
    const sep = rel.includes("?") ? "&" : "?";
    const r = await fetch(BASE + rel + sep + "v=" + Date.now(), {
      cache: "no-store", headers: { "Cache-Control": "no-cache", Pragma: "no-cache" }
    });
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
  function pollDelayS() { return document.hidden ? POLL_HIDDEN_S : POLL_VISIBLE_S; }
  let pollTimer = null, pollInFlight = false, pollAgain = false;
  function schedulePoll(ms) {
    clearTimeout(pollTimer);
    const delay = ms != null ? ms : pollDelayS() * 1000;
    S.next = Date.now() + delay;
    pollTimer = setTimeout(poll, delay);
  }
  function pollNow() { schedulePoll(0); }
  async function poll() {
    if (pollInFlight) { pollAgain = true; return; }
    pollInFlight = true;
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
        if (first || need("bot.json") || !S.bot) {
          try { S.bot = await get("bot.json"); S.botMissing = false; } catch (e) { if (e.status) S.botMissing = true; else throw e; }
        }
        if (first || need("desk.json") || !S.desk) {
          try { S.desk = await get("desk.json"); S.deskMissing = false; } catch (e) { if (e.status) S.deskMissing = true; else throw e; }
        }
        S.chart = chart; S.account = account;
        if (S.activity[0] !== act) S.activity = [act];
        S.reports = reps;
        S.state = st; changedSomething = true;
        checkEvents();
        await loadRoute(first ? null : changed);
      }
      if (S.err) changedSomething = true;
      S.err = false; S.lastGood = new Date(); S.backoff = pollDelayS();
    } catch (e) {
      if (!S.err) changedSomething = true;
      S.err = true; S.backoff = Math.min((S.backoff || pollDelayS()) * 2, MAX_BACKOFF);
    }
    if (changedSomething) render();
    pollInFlight = false;
    if (pollAgain) { pollAgain = false; schedulePoll(0); }
    else schedulePoll(S.err ? S.backoff * 1000 : pollDelayS() * 1000);
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden) pollNow(); });
  window.addEventListener("focus", () => pollNow());
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
        <div class="foot"><span id="exectxt" class="${filled ? "green" : "sec"}">${l ? (filled ? "✓ Filled " + money(l.sizeUsd) : (l.status === "sent" ? "Put " + money(l.sizeUsd) + " on FOMO" : esc(l.status))) : "No signal yet"}</span>
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
          txt.textContent = p < 1 ? `Executing... ${Math.round(p * 100)}%` : ("✓ Filled" + (l.sizeUsd != null ? " " + money(l.sizeUsd) : "")); if (p >= 1) txt.className = "green"; else requestAnimationFrame(step); };
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

  function logoFor(mint) {
    if (!mint) return null;
    const c = S.coin[mint];
    if (c && c.logo) return c.logo;
    for (const page of S.activity || []) {
      for (const r of page.rows || []) if (r.mint === mint && r.logo) return r.logo;
    }
    for (const n of (S.state && S.state.new_coins) || []) if (n.mint === mint && n.logo) return n.logo;
    return null;
  }
  function markName(m) {
    const c = m.mint && S.coin[m.mint];
    if (c && c.name) return c.name;
    if (m.kind === "bought" && m.text) return String(m.text).replace(/^Bought /, "");
    for (const page of S.activity || []) {
      for (const r of page.rows || []) {
        if (r.mint === m.mint && r.title) return String(r.title).replace(/^(Bought|Sold|Stopped|Rejected) /, "");
      }
    }
    return m.mint ? String(m.mint).slice(0, 2) : "?";
  }
  function enrichMarks(list) {
    return (list || []).map(m => {
      const kind = m.kind || (/^Bought /i.test(m.text || "") ? "bought" : (m.color === "red" ? "stopped" : "sold"));
      const size = m.sizeUsd != null ? money(m.sizeUsd) : (m.sizeSol != null && isFinite(m.sizeSol)
        ? (Number(m.sizeSol).toFixed(4).replace(/0+$/, "").replace(/\.$/, "") + " SOL") : "");
      const label = m.label || (kind === "bought" ? (size ? "Buy " + size : "Buy") : (m.text || (kind === "stopped" ? "Stop" : "Sell")));
      return { ...m, kind, label, name: markName({ ...m, kind }), logo: logoFor(m.mint) };
    });
  }
  function paintChartMarks(canvas, items) {
    const wrap = canvas && canvas.parentNode;
    if (!wrap) return;
    let layer = wrap.querySelector(".chartmarks");
    if (!layer) { layer = document.createElement("div"); layer.className = "chartmarks"; wrap.appendChild(layer); }
    layer.innerHTML = (items || []).map(it => {
      const href = it.mint ? coinHref(it.mint) : "#";
      const title = it.text || it.label || "";
      const col = it.color || (it.kind === "bought" ? "blue" : it.kind === "stopped" ? "red" : "green");
      return `<a class="cmark ${esc(col)}" href="${href}" style="left:${it.x}px;top:${it.y}px;width:${it.w}px" title="${esc(title)}" aria-label="${esc(title)}">${logo(it.name, it.logo, 16)}<span>${esc(it.label)}</span></a>`;
    }).join("");
  }

  function mixCards() {
    const mix = (S.state && S.state.mix) || {};
    if (!mix.active) return null;
    const book = activeBook() === "misses" ? ((S.state.paper) ? "PAPER" : "LIVE") : (activeBook() || "LIVE");
    const snap = (mix.books && mix.books[book]) || {};
    return snap.cards || [];
  }
  const MIX_ICON = {
    sniper: '<svg viewBox="0 0 24 24" class="mixico"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>',
    whale: '<svg viewBox="0 0 24 24" class="mixico"><path d="M3 14c2-6 7-8 11-7 3 .6 5 3 6 5 2 0 3 2 2 3h-3c-1 3-4 5-8 5-4 0-7-2-8-6z"/><circle cx="8" cy="12" r="1.2"/></svg>',
    momentum: '<svg viewBox="0 0 24 24" class="mixico"><path d="M4 16l5-5 4 3 7-8"/><path d="M14 6h6v6"/></svg>',
    dip: '<svg viewBox="0 0 24 24" class="mixico"><path d="M3 8c4 0 5 10 9 10s5-10 9-10"/><path d="M12 18v4M9 20h6"/></svg>'
  };
  function mixSpark(pts, w, h) {
    if (!pts || pts.length < 2) return "";
    const vs = pts.map(p => Number(p.v)).filter(v => isFinite(v));
    if (vs.length < 2) return "";
    const mn = Math.min(...vs), mx = Math.max(...vs), span = mx - mn || 1;
    const step = (w - 2) / (vs.length - 1);
    const d = vs.map((v, i) => `${i === 0 ? "M" : "L"}${(1 + i * step).toFixed(1)},${(h - 1 - (v - mn) / span * (h - 2)).toFixed(1)}`).join(" ");
    const up = vs[vs.length - 1] >= vs[0];
    return `<svg class="mixspark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><path d="${d}" fill="none" stroke="${up ? "var(--green)" : "var(--red)"}" stroke-width="1.5"/></svg>`;
  }
  function mixCard(c) {
    const href = c.coin && c.coin.mint ? coinHref(c.coin.mint) : null;
    const pill = c.pnl_pct == null ? "" : `<span class="cpill ${c.pnl_pct >= 0 ? "up" : "down"}">${sgn(c.pnl_pct, 1)}</span>`;
    const coin = c.coin
      ? `${logo(c.coin.name || c.coin.mint, c.coin.logo, 22)}<span class="mixticker">${esc(c.coin.name)}</span>${pill}`
      : `<span class="ter">no fill yet</span>`;
    const st = c.status === "feed_down" ? "feed_down" : c.status === "unavailable" ? "unavailable" : c.status === "active" ? "active" : "idle";
    const scan = st === "feed_down" ? (c.note || "Feed down")
      : c.available ? `Scanning ${c.scanning || 0} pair${c.scanning === 1 ? "" : "s"}`
      : (c.note || "Unavailable");
    const pnl = c.pnl_usd == null ? "—" : money(c.pnl_usd);
    const inner = `<div class="mixhead">${MIX_ICON[c.id] || ""}<div class="mixtit"><div class="t">${esc(c.name)}</div><div class="s wrap">${esc(c.subtitle)}</div></div></div>
      <div class="mixscan"><i class="live ${st === "active" ? "running" : (st === "unavailable" || st === "feed_down") ? "paused" : ""}"></i><span class="s wrap">${esc(scan)}</span><span class="mixst ${st}">${esc(st === "feed_down" ? "feed down" : st)}</span></div>
      <div class="mixcoin">${coin}</div>
      <div class="mixchart">${mixSpark(c.chart, 140, 36) || '<span class="ter">—</span>'}</div>
      <div class="mixfoot"><span>${c.wins || 0}W · ${c.losses || 0}L</span><span class="${(c.pnl_usd || 0) >= 0 ? "green" : "red"}">${esc(pnl)}</span></div>`;
    return href ? `<a class="mixcard glass" href="${href}">${inner}</a>` : `<div class="mixcard glass">${inner}</div>`;
  }
  function home() {

    if (!S.state) return loadingHome();
    const st = S.state, book = activeBook(), missesOn = book === "misses", bk = bookSnap() || {};
    const bal = missesOn ? (st.misses || []).length : (bk.balance != null ? bk.balance : st.balance);
    const odo = missesOn ? { html: esc(String(bal)), roll: false } : odometer(money(bal));
    const today = missesOn ? null : (bk.today_pct != null || (bk.balance != null) ? bk.today_pct : st.today_pct);
    const mult = missesOn ? null : (bk.multiplier != null || (bk.balance != null) ? bk.multiplier : st.multiplier);
    const unpriced = missesOn ? 0 : (bk.balance_unpriced_positions != null ? bk.balance_unpriced_positions : st.balance_unpriced_positions);
    const ch = bookChart();
    const rng = (ch && ch.ranges && ch.ranges[S.range]) || { points: [], marks: [] };
    const paperLabel = st.mode === "LIVE" ? "PAPER shadow" : "PAPER";
    const heroLabel = missesOn ? "Misses tonight" : (book === "LIVE" ? "LIVE stack" : (st.mode === "LIVE" ? "PAPER shadow stack" : "PAPER stack"));
    const bookseg = `<div class="ranges bookseg" role="tablist" aria-label="Book">${[["LIVE","LIVE"],["PAPER",paperLabel],["misses","Misses"]].map(([id, label]) =>
      `<button type="button" data-book="${id}" class="${id === book ? "on" : ""}">${esc(label)}</button>`).join("")}</div>`;
    const missRows = (st.misses || []).map(missRow).join("");
    const rows = ((S.activity[0] && S.activity[0].rows) || []).slice(0, 5);
    const results = S.showSearch ? searchResults() : "";
    const heroBody = missesOn
      ? `<div class="bigrow"><span class="big glow" aria-label="${esc(String(bal))}">${odo.html}</span></div>
         <div class="today"><span class="sec">passed coins not taken on LIVE</span></div>
         <div class="list misslist">${missRows || '<div class="empty">no data yet</div>'}</div>`
      : `<div class="bigrow"><span class="big odo glow" aria-label="${esc(money(bal))}">${odo.html}</span></div>
         <div class="today"><span class="${today == null ? "sec" : today >= 0 ? "green" : "red"}">${today == null ? "—" : sgn(today)}</span><span class="sec">today</span>
         ${mult != null ? `<span class="pill mult">${Number(mult).toFixed(2)}×</span>` : ""}${unpriced ? `<span class="ter">${unpriced} position${unpriced > 1 ? "s" : ""} not priced yet</span>` : ""}</div>
        <div class="chartwrap"><canvas id="line"></canvas>${rng.points.length ? "" : `<div class="chartempty">${book === "LIVE" && st.paper ? "no LIVE data yet" : "Waiting for the first trade"}</div>`}</div>
        <div class="ranges">${["LIVE", "1H", "4H", "1D", "1W", "ALL"].map(r => `<button data-range="${r}" class="${r === S.range ? "on" : ""}">${r}</button>`).join("")}</div>`;
    const mixOn = !!(S.state && S.state.mix && S.state.mix.active) && !missesOn;
    const mixBoard = mixOn ? `<div class="mixgrid">${(mixCards() || []).map(mixCard).join("")}</div>` : "";
    const html = navbar(S.showSearch ? `<div class="search"><input id="q" type="search" placeholder="Name, symbol or mint" value="${esc(S.search)}" autocomplete="off" autocapitalize="off"></div><div class="results">${results}</div>` : "") +
      `<section class="hero glass"><div class="herotop"><span class="ter">${esc(heroLabel)}</span>${book === "PAPER" ? '<span class="pill paper">PAPER</span>' : book === "LIVE" ? '<span class="pill redp">LIVE</span>' : ""}${mixOn ? '<span class="pill">Mix</span>' : ""}${book === "LIVE" && (bk.wallet && bk.wallet.stale) ? '<span class="pill stale">sync stale</span>' : ""}</div>
       ${bookseg}
       ${heroBody}${(!missesOn && mixOn) ? mixBoard : ""}
      <div class="achips">${st.agents.map(a => `<a class="achip" href="#/agents"><i class="live ${esc(a.paused ? "paused" : a.status)}"></i>${TITLE[a.name]}</a>`).join("")}</div></section>
      ${missesOn ? "" : (book === "LIVE" ? `<div class="sh"><h2>Holdings</h2><span class="ter sm">${((bk.wallet && bk.wallet.holdings) || []).length || ""}</span></div>
      <div class="list glass">${((bk.wallet && bk.wallet.holdings) || []).length ? (bk.wallet.holdings).map(holdRow).join("") : `<div class="empty">${bk.wallet && bk.wallet.stale ? "Wallet sync stale" : "No holdings over $1"}</div>`}</div>`
        : `<div class="sh"><h2>Open positions</h2><span class="ter sm">${openPositions().length || ""}</span></div>
      <div class="list glass">${openPositions().length ? openPositions().map(posRow).join("") : '<div class="empty">No open positions</div>'}</div>`)}
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
      const line = document.getElementById("line");
      if (line && window.DeskChart) {
        const start = (ch && ch.start_value != null) ? ch.start_value : (S.chart && S.chart.start_value);
        chartPrev = DeskChart.line(line, { points: rng.points, marks: enrichMarks(rng.marks), start, onMarks: items => paintChartMarks(line, items) }, chartPrev);
      }
      afterCards();
    } };
  }
  function holdAmt(v) {
    if (v == null || !isFinite(Number(v))) return "—";
    const n = Number(v);
    if (Math.abs(n) >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
    if (Math.abs(n) >= 1) return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
    return String(Number(n.toPrecision(4)));
  }
  function holdRow(h) {
    const name = h.name || h.symbol || h.mint || "—";
    const amt = holdAmt(h.amount) + (h.symbol ? " " + h.symbol : "");
    const usd = h.usd == null ? "—" : money(h.usd);
    const sub = amt + " · " + usd + (h.usd == null ? " · no price" : "");
    const pnl = h.pnl_pct;
    const inner = `${logo(name, h.logo, 40)}<span class="main"><div class="t">${esc(name)}</div>
      <div class="s wrap">${esc(sub)}</div></span>
      <span class="v">${pnl == null ? '<span class="ter">—</span>' : `<span class="cpill ${pnl >= 0 ? "up" : "down"}">${sgn(pnl, 1)}</span>`}</span>`;
    return (h.mint && h.mint !== "SOL") ? `<a class="row" href="${coinHref(h.mint)}">${inner}</a>` : `<div class="row">${inner}</div>`;
  }
  function missRow(m) {

    const after = m.afterwardsPct, paper = m.paper;
    let paperTxt = "no PAPER fill";
    if (paper) {
      const pnl = paper.pnlUsd;
      paperTxt = "PAPER " + (paper.status || (paper.closed ? "closed" : "open"))
        + (paper.sizeUsd != null ? " " + money(paper.sizeUsd) : "")
        + (pnl == null ? "" : " · " + money(pnl));
    }
    const reason = m.reason || m.status || "missed";
    return `<a class="row" href="${coinHref(m.mint)}">${logo(m.name || m.mint, m.logo, 40)}<span class="main"><div class="t">${esc(m.name || m.mint)}</div>
      <div class="s wrap">${esc(reason)} · signal ${m.signalPrice == null ? "—" : nat(m.signalPrice)} → now ${m.priceNow == null ? "—" : nat(m.priceNow)} · ${esc(paperTxt)}</div></span>
      <span class="v">${after == null ? '<span class="ter">—</span>' : `<span class="cpill ${after >= 0 ? "up" : "down"}">${sgn(after, 1)}</span>`}</span></a>`;
  }
  function openPositions() {
    // Prefer the selected book's positions (state.books[book].open_positions). The activity feed
    // only keeps the newest ~30 rows on Home, so a hold from an earlier night would otherwise vanish.
    const book = activeBook();
    const fromBook = S.state && S.state.books && S.state.books[book] && Array.isArray(S.state.books[book].open_positions)
      ? S.state.books[book].open_positions
      : (S.state && Array.isArray(S.state.open_positions) && book === ((S.state.paper) ? "PAPER" : "LIVE") ? S.state.open_positions : null);
    if (fromBook) {
      return fromBook.map(r => ({
        row: { mint: r.mint, title: "Bought " + (r.name || r.mint), logo: r.logo,
               value: r.sizeUsd != null ? money(r.sizeUsd) : "", hold: !!r.hold, tpPct: r.tpPct, tpPart: r.tpPart },
        coin: S.coin[r.mint]
      }));
    }
    const rows = S.activity.flatMap(p => p.rows || []), latest = new Map();
    rows.forEach(r => { if (r.mint && ["bought", "sold", "stopped"].includes(r.kind) && !latest.has(r.mint)) latest.set(r.mint, r); });
    return [...latest.values()].filter(r => r.kind === "bought").map(r => ({ row: r, coin: S.coin[r.mint] }));
  }
  function posRow(o) {
    const r = o.row, c = o.coin, p = c && c.position, m = p ? posMark(p, r.mint, c) : null;
    const name = (r.title || "").replace(/^Bought /, "");
    const sub = p ? (m && m.now != null ? money(p.sizeUsd) + " in → " + money(m.now) : money(p.sizeUsd) + " in")
      : esc(r.value || r.subtitle || "");
    const pct = m && m.pct;
    const held = (p && p.hold) || r.hold;
    const tpPct = r.tpPct != null ? r.tpPct : p && p.open ? p.tpPct : null, tpPart = r.tpPct != null ? r.tpPart : p && p.tpPart;
    const tp = tpText(tpPct, tpPart);
    return `<a class="row" href="${coinHref(r.mint)}">${logo(name, r.logo || (c && c.logo), 40)}<span class="main"><div class="t">${esc(name)}${held ? ' <span class="pill paper">HOLD</span>' : ""}</div>
      <div class="s">${sub}${tp ? ` · <span class="green">TP ${esc(tp)}</span>` : ""}</div></span>
      <span class="v">${pct == null ? '<span class="ter">—</span>' : `<span class="cpill ${pct >= 0 ? "up" : "down"}">${sgn(pct, 1)}</span>`}</span></a>`;
  }
  function manualBlock(p, mint) {
    const id = posId(p.id);
    if (!id) return `<div class="kv"><span class="sec">Take profit</span><span class="red">n/a</span></div>`;
    const tp = tpText(p.tpPct, p.tpPart), live = p.mode === "LIVE";
    const draft = S.tpDraft[mint] != null ? S.tpDraft[mint] : p.tpPct != null ? String(p.tpPct) : "";
    const part = S.tpPart[mint] || p.tpPart || "all";
    const slSaved = p.slPct != null ? p.slPct : (S.lineDraft[mint] && S.lineDraft[mint].slPct);
    const slDraft = S.slDraft[mint] != null ? S.slDraft[mint] : (slSaved != null ? String(Math.round(Math.abs(slSaved) * 10) / 10) : "");
    const slPart = S.slPart[mint] || p.slPart || "all";
    const slRisk = p.lines && p.lines.sl_risk_pct;
    const slLabel = p.slPct != null ? ("-" + Number(p.slPct).toLocaleString("en-US", { maximumFractionDigits: 2 }) + "% · sell " + (p.slPart === "half" ? "half" : "all") + " (you)")
      : (slRisk != null ? (Number(slRisk).toFixed(Math.abs(slRisk) >= 10 ? 0 : 1) + "% · risk") : "risk stop");
    const sell = tgLink("sell_" + id), go = tgLink(tpPayload(id, draft, part) || ""), off = tgLink("tpoff_" + id);
    const slGo = tgLink(slPayload(id, slDraft, slPart) || ""), slOff = tgLink("sloff_" + id);
    return `<div class="kv"><span class="sec">Take profit</span><span class="${tp ? "green" : "ter"}">${tp ? esc(tp) : "off"}</span></div>
      <div class="kv"><span class="sec">Stop loss</span><span class="${p.slPct != null ? "red" : "ter"}">${esc(slLabel)}</span></div>
      <div class="manual">
        <div class="tprow"><label class="tpin"><span>+</span><input id="tpin" type="number" inputmode="decimal" min="0.1" max="100000" step="any" placeholder="50" value="${esc(draft)}" aria-label="Take profit percent"><span>%</span></label>
          <div class="seg" id="tpseg" role="group" aria-label="Sell when it hits"><button type="button" data-part="all" class="${part === "all" ? "on" : ""}">All</button><button type="button" data-part="half" class="${part === "half" ? "on" : ""}">Half</button></div></div>
        <div class="mbtns"><a class="mbtn${go ? "" : " off"}" id="tpgo" ${go ? `href="${esc(go)}"` : ""} target="_blank" rel="noopener">Set TP</a>
          ${tp && off ? `<a class="mbtn ghost" href="${esc(off)}" target="_blank" rel="noopener">Clear TP</a>` : ""}</div>
        <div class="tprow"><label class="tpin"><span>−</span><input id="slin" type="number" inputmode="decimal" min="0.1" max="99" step="any" placeholder="6" value="${esc(slDraft)}" aria-label="Stop loss percent"><span>%</span></label>
          <div class="seg" id="slseg" role="group" aria-label="Sell when it hits the stop"><button type="button" data-part="all" class="${slPart === "all" ? "on" : ""}">All</button><button type="button" data-part="half" class="${slPart === "half" ? "on" : ""}">Half</button></div></div>
        <div class="mbtns"><a class="mbtn${slGo ? "" : " off"}" id="slgo" ${slGo ? `href="${esc(slGo)}"` : ""} target="_blank" rel="noopener">Set SL</a>
          ${p.slPct != null && slOff ? `<a class="mbtn ghost" href="${esc(slOff)}" target="_blank" rel="noopener">Clear SL</a>` : ""}
          ${sell ? `<a class="mbtn sell" href="${esc(sell)}" target="_blank" rel="noopener">Sell now</a>` : ""}</div>
        <div class="s wrap">Drag the SL handle on the chart, or type a percent. Opens Telegram to save it. ${live ? "LIVE: a hit sends “hit TP/SL — sell on FOMO”; the desk never places orders." : "PAPER: a hit fills at the current price."} The risk agent's stop / trail stay on; whichever fires first wins.</div>
      </div>`;
  }
  function bindManual(p, mint) {
    const inp = document.getElementById("tpin"), seg = document.getElementById("tpseg"), go = document.getElementById("tpgo");
    const sl = document.getElementById("slin"), slseg = document.getElementById("slseg"), slgo = document.getElementById("slgo");
    if (!p) return;
    const upd = () => {
      if (inp && go) {
        const url = tgLink(tpPayload(p.id, S.tpDraft[mint] != null ? S.tpDraft[mint] : inp.value, S.tpPart[mint] || p.tpPart || "all") || "");
        if (url) { go.href = url; go.classList.remove("off"); } else { go.removeAttribute("href"); go.classList.add("off"); }
      }
      if (sl && slgo) {
        const url = tgLink(slPayload(p.id, S.slDraft[mint] != null ? S.slDraft[mint] : sl.value, S.slPart[mint] || p.slPart || "all") || "");
        if (url) { slgo.href = url; slgo.classList.remove("off"); } else { slgo.removeAttribute("href"); slgo.classList.add("off"); }
      }
    };
    if (inp) inp.oninput = () => { S.tpDraft[mint] = inp.value; upd(); };
    if (seg) seg.querySelectorAll("button").forEach(b => b.onclick = () => {
      S.tpPart[mint] = b.dataset.part; seg.querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b)); upd();
    });
    if (sl) sl.oninput = () => { S.slDraft[mint] = sl.value; upd(); };
    if (slseg) slseg.querySelectorAll("button").forEach(b => b.onclick = () => {
      S.slPart[mint] = b.dataset.part; slseg.querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b)); upd();
    });
    upd();
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
    (S.state && S.state.open_positions || []).forEach(p => add(p.mint, p.name));
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
      ${c.pendingBuy && (!p || c.pendingBuy.add) ? `<div class="card glass"><h3>${c.pendingBuy.add ? (c.pendingBuy.mode === "LIVE" ? "Put this much more on FOMO" : "Add") : (c.pendingBuy.mode === "LIVE" ? "Put this much on FOMO" : "Ticket")} · ${money(c.pendingBuy.sizeUsd)}</h3>
          ${c.pendingBuy.sizeNative != null ? `<div class="kv"><span class="sec">${esc(c.pendingBuy.nativeSymbol || "SOL")}</span><span>${nqty(c.pendingBuy.sizeNative)} ${esc(c.pendingBuy.nativeSymbol || "")}</span></div>` : ""}
          <div class="kv"><span class="sec">Share of stack</span><span>${c.pendingBuy.stackPct == null ? "—" : c.pendingBuy.stackPct + "%"}</span></div>
          <div class="s wrap">${c.pendingBuy.mode === "LIVE" ? (c.pendingBuy.add ? "Buy this extra amount inside FOMO, then tap Bought in Telegram. The Sell button stays for the open position." : "Buy this amount inside FOMO, then tap Bought in Telegram.") : (c.pendingBuy.add ? "This is how much the desk wants to add on this dip." : "This is how much the desk sized for this coin.")}</div></div>` : ""}
      ${p ? `<div class="card glass poscard"><h3>Your position · ${esc(p.agent)}</h3>
          ${posPnlBlock(p, mint, c)}
          <div class="kv"><span class="sec">Entry${mcOn ? " MC" : ""}</span><span>${disp(p.entryPrice)}</span></div>
          ${p.hold ? `<div class="kv"><span class="sec">Hold</span><span>owner hold · no stop / trail / timeout (rug still exits)</span></div>` : ""}
          <div class="kv"><span class="sec">${esc(p.nativeSymbol || "SOL")} in</span><span>${nat(p.nativeIn)}</span></div>
          <div class="kv"><span class="sec">Entry fee</span><span>${p.entryFeeUsd == null ? "n/a" : money(p.entryFeeUsd)}</span></div>
          ${p.open ? manualBlock(p, mint) : ""}
          ${p.open ? "" : `<div class="kv"><span class="sec">Exit${mcOn ? " MC" : ""} · ${esc(p.exitReason)}</span><span>${disp(p.exitPrice)}</span></div>
          <div class="kv"><span class="sec">${esc(p.nativeSymbol || "SOL")} out</span><span>${nat(p.nativeOut)}</span></div>
          <div class="kv"><span class="sec">Fees (in + out)</span><span>${p.feesUsd == null ? "n/a" : money(p.feesUsd)}</span></div>`}</div>` : ""}
      ${x ? `<div class="card glass"><h3>Exit</h3>
          <div class="kv"><span class="sec">Stop line · -${x.stop_pct}%</span><span class="red">${disp(x.stop_line)}</span></div>
          <div class="kv"><span class="sec">Trail line · ${x.trail_pct}%</span><span class="${x.trail_active ? "green" : "ter"}">${x.trail_active ? disp(x.trail_line) : "not active yet"}</span></div>
          <div class="kv"><span class="sec">Time left to timeout</span><span>${p && p.hold ? "on hold · no auto-sell (rug still exits)" : left}</span></div></div>` : ""}
      ${audit}
      <div class="note mono">${esc(mint)}</div>
      <div class="spacer"></div>${safeUrl(c.link) ? `<div class="ctabar"><a class="cta ${p && p.open ? "sell" : ""}" href="${esc(c.link)}" target="_blank" rel="noopener">${esc(c.button)}</a></div>` : ""}`;
    return { html, after() {
      bindManual(p, mint);
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
      const rawList = k == null ? [] : list.map(q => {
        const px = k === 1 ? q.c : (q.c / k);
        return { ...q, px, mc: (fac != null && px != null && isFinite(px)) ? px * fac : null };
      });
      const ath = athFrom(c, base);
      const draft = S.lineDraft[mint] || {};
      const lines = (p && p.open) ? posChartLines(p.entryPrice, p.lines, draft, ath, sc) : (ath != null && k != null ? posChartLines(null, null, {}, ath, sc) : []);
      const lastC = DeskChart.candles(cv, rawList, null,
                        { loading: !!c.pool && (!g || g.loading), step, min: 1, fmt: mcOn ? kfmt : undefined,
                          lines, entryLine: null,
                          emptyText: mcOn && k == null ? "Market cap n/a" : undefined,
                          volume: volOn(),
                          mcFmt: kfmt,
                          tip: (candle, info) => {
                            const when = info && info.time ? info.time : "";
                            const px = candle.px != null ? candle.px : candle.c;
                            const mc = candle.mc;
                            return `<div class="t">${esc(when)}</div><div><span class="k">Price</span> ${esc(price(px))}</div>` +
                              (mc != null ? `<div><span class="k">MC</span> ${esc(kfmt(mc))}</div>` : "");
                          },
                          onDragEnd: (id, px, kind) => {
                            if (!p || !p.open || !p.entryPrice) return;
                            const raw = (k && k !== 1) ? px / k : px;
                            const entry = p.entryPrice;
                            S.lineDraft[mint] = S.lineDraft[mint] || {};
                            if (kind === "sl" || id === "sl") {
                              const pct = 100 * (1 - raw / entry);
                              S.lineDraft[mint].slPrice = raw; S.lineDraft[mint].slPct = pct;
                              S.slDraft[mint] = String(Math.round(Math.abs(pct) * 10) / 10);
                            } else if (kind === "tp" || id === "tp") {
                              const pct = 100 * (raw / entry - 1);
                              S.lineDraft[mint].tpPrice = raw; S.lineDraft[mint].tpPct = pct;
                              S.tpDraft[mint] = String(Math.round(pct * 10) / 10);
                            }
                            render();
                          }
                        });
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

  function pickerRow(key, label, value, group) {
    const hex = toInputHex(value);
    const on = colorTarget.key === key && colorTarget.group === (group || "ui");
    return `<label class="picker${on ? " on" : ""}"><span class="sw" style="background:${hex}"><input type="color" data-ckey="${esc(key)}" data-cgroup="${esc(group || "ui")}" value="${hex}" aria-label="${esc(label)}"></span><span class="plab">${esc(label)}</span><input class="phex" type="text" value="${hex}" maxlength="7" spellcheck="false" autocapitalize="off" autocomplete="off" aria-label="${esc(label)} hex" data-ckey="${esc(key)}" data-cgroup="${esc(group || "ui")}"></label>`;
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
        <div class="setrow" id="uipref">
          <div class="sl"><span>Layout</span></div>
          <div class="s wrap">${esc(UIS[uiId()].blurb)} Editorial, Block, Halo, and Blotter are full redesigns. The first five stay as they are. Your colors work on every look.</div>
          <div class="dswatches" id="uiseg" role="group" aria-label="Layout">${UI_IDS.map(id =>
            `<button type="button" class="dswatch${uiId() === id ? " on" : ""}" data-ui="${id}" aria-pressed="${uiId() === id}" aria-label="${esc(UIS[id].label)}"><i class="dprev ${id}"></i><span>${esc(UIS[id].label)}</span></button>`).join("")}</div>
        </div>
        <div class="setrow" id="typepref">
          <div class="sl"><span>Text size</span></div>
          <div class="seg wide" id="typeseg" role="group" aria-label="Text size">
            <button type="button" data-type="default" class="${typeId() === "default" ? "on" : ""}" aria-pressed="${typeId() === "default"}">Default</button>
            <button type="button" data-type="large" class="${typeId() === "large" ? "on" : ""}" aria-pressed="${typeId() === "large"}">Large</button>
          </div>
        </div>
        <div class="setrow" id="denspref">
          <div class="sl"><span>Spacing</span></div>
          <div class="seg wide" id="densseg" role="group" aria-label="Spacing">
            <button type="button" data-density="comfortable" class="${densId() === "comfortable" ? "on" : ""}" aria-pressed="${densId() === "comfortable"}">Comfortable</button>
            <button type="button" data-density="compact" class="${densId() === "compact" ? "on" : ""}" aria-pressed="${densId() === "compact"}">Compact</button>
          </div>
        </div>
        <div class="setrow" id="radpref">
          <div class="sl"><span>Corners</span></div>
          <div class="seg wide" id="radseg" role="group" aria-label="Corners">
            <button type="button" data-radius="soft" class="${radId() === "soft" ? "on" : ""}" aria-pressed="${radId() === "soft"}">Soft</button>
            <button type="button" data-radius="sharp" class="${radId() === "sharp" ? "on" : ""}" aria-pressed="${radId() === "sharp"}">Sharp</button>
          </div>
        </div>
        <div class="setrow" id="fontpref">
          <div class="sl"><span>Font</span></div>
          <div class="seg wide" id="fontseg" role="group" aria-label="Font">
            <button type="button" data-font="default" class="${fontId() === "default" ? "on" : ""}" aria-pressed="${fontId() === "default"}">Default</button>
            <button type="button" data-font="rounded" class="${fontId() === "rounded" ? "on" : ""}" aria-pressed="${fontId() === "rounded"}">Rounded</button>
          </div>
        </div>
        <div class="setrow" id="fxpref">
          <div class="sl"><span>Effects</span></div>
          <div class="s wrap">Calm turns off glows, shadows, and pulsing status dots.</div>
          <div class="seg wide" id="fxseg" role="group" aria-label="Effects">
            <button type="button" data-fx="full" class="${fxId() === "full" ? "on" : ""}" aria-pressed="${fxId() === "full"}">Full</button>
            <button type="button" data-fx="calm" class="${fxId() === "calm" ? "on" : ""}" aria-pressed="${fxId() === "calm"}">Calm</button>
          </div>
        </div>
        <div class="setrow" id="volpref">
          <div class="sl"><span>Chart volume</span></div>
          <div class="s wrap">Volume bars under the candlesticks. Off gives the price more room.</div>
          <div class="seg wide" id="volseg" role="group" aria-label="Chart volume">
            <button type="button" data-vol="1" class="${volOn() ? "on" : ""}" aria-pressed="${volOn()}">On</button>
            <button type="button" data-vol="0" class="${volOn() ? "" : "on"}" aria-pressed="${!volOn()}">Off</button>
          </div>
        </div>
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
          <div class="s wrap">A starting palette for the whole app. Pick your own colors just below.</div>
          <div class="swatches" id="themes" role="group" aria-label="App colors">${Object.entries(THEMES).map(([id, th]) =>
            `<button type="button" class="swatch${themeId() === id ? " on" : ""}" data-theme="${id}" aria-pressed="${themeId() === id}" aria-label="${esc(th.label)}"><i class="swbg" style="background:${th.bg}"><b style="background:${th.accent}"></b></i><span>${esc(th.label)}</span></button>`).join("")}</div>
        </div>
        <div class="setrow" id="custompref">
          <div class="sl"><span>Your colors</span></div>
          <div class="s wrap">Tap a palette to color the whole app, or pick a row below and use a chip — or the color picker — to set that part yourself. These sit on top of the starting palette. Reset clears them.</div>
          <div class="pswatches" id="palettes" role="group" aria-label="Color palettes">${Object.entries(COLOR_PALETTES).map(([id, p]) =>
            `<button type="button" class="pswatch${paletteId() === id ? " on" : ""}" data-palette="${id}" aria-pressed="${paletteId() === id}" aria-label="${esc(p.label)}"><i class="pstripes"><b style="background:${p.bg}"></b><b style="background:${p.card}"></b><b style="background:${p.accent}"></b><b style="background:${p.green}"></b><b style="background:${p.red}"></b></i><span>${esc(p.label)}</span></button>`).join("")}</div>
          <div class="chips" id="colorchips" role="group" aria-label="Color chips">${CHIP_COLORS.map(h =>
            `<button type="button" class="chipc" data-hex="${h}" style="background:${h}" aria-label="${h}"></button>`).join("")}</div>
          <div class="pickers" id="colorpick">${(() => {
            const base = THEMES[themeId()] || THEMES.midnight, t = withCustom(base), c = candlePair(t);
            return COLOR_KEYS.map(k => pickerRow(k.key, k.label, t[k.key], "ui")).join("") +
              CANDLE_COLOR_KEYS.map(k => pickerRow(k.key, k.label, c[k.key], "candle")).join("");
          })()}</div>
          <button type="button" class="link" id="resetcolors"${hasCustomColors() ? "" : " hidden"}>Reset custom colors</button>
        </div>
        <div class="setrow" id="candlepref">
          <div class="sl"><span>Candlestick colors</span></div>
          <div class="s wrap">Presets, or Custom to use the candle colors you picked above.</div>
          <div class="swatches" id="candlesel" role="group" aria-label="Candlestick colors">${Object.entries(CANDLES).map(([id, ch]) => {
            const up = id === "classic" ? THEMES[themeId()].green : (ch.up === "text" ? THEMES[themeId()].text : ch.up);
            const down = id === "classic" ? THEMES[themeId()].red : ch.down;
            return `<button type="button" class="swatch${candleId() === id ? " on" : ""}" data-candle="${id}" aria-pressed="${candleId() === id}" aria-label="${esc(ch.label)}"><i class="csticks"><b style="background:${up}"></b><b style="background:${down}"></b></i><span>${esc(ch.label)}</span></button>`;
          }).join("")}${(() => {
            const c = candlePair(withCustom(THEMES[themeId()] || THEMES.midnight));
            return `<button type="button" class="swatch${candleId() === "custom" ? " on" : ""}" data-candle="custom" aria-pressed="${candleId() === "custom"}" aria-label="Custom"><i class="csticks"><b style="background:${c.up}"></b><b style="background:${c.down}"></b></i><span>Custom</span></button>`;
          })()}</div>
        </div>
        <div class="setrow" id="appver">
          <div class="sl"><span>App version</span><span class="val">v38</span></div>
          <div class="s wrap">If this isn’t v38, the phone is still on an old copy. Close the app from the app switcher and reopen it.</div>
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
      document.querySelectorAll("#uiseg [data-ui]").forEach(b => b.onclick = e => { e.preventDefault(); setPref("desk.ui", b.dataset.ui, UI_IDS); });
      document.querySelectorAll("#typeseg [data-type]").forEach(b => b.onclick = e => { e.preventDefault(); setPref("desk.type", b.dataset.type, ["default", "large"]); });
      document.querySelectorAll("#densseg [data-density]").forEach(b => b.onclick = e => { e.preventDefault(); setPref("desk.density", b.dataset.density, ["comfortable", "compact"]); });
      document.querySelectorAll("#radseg [data-radius]").forEach(b => b.onclick = e => { e.preventDefault(); setPref("desk.radius", b.dataset.radius, ["soft", "sharp"]); });
      document.querySelectorAll("#fontseg [data-font]").forEach(b => b.onclick = e => { e.preventDefault(); setPref("desk.font", b.dataset.font, ["default", "rounded"]); });
      document.querySelectorAll("#fxseg [data-fx]").forEach(b => b.onclick = e => { e.preventDefault(); setPref("desk.fx", b.dataset.fx, ["full", "calm"]); });
      document.querySelectorAll("#volseg [data-vol]").forEach(b => b.onclick = e => { e.preventDefault(); setPref("desk.vol", b.dataset.vol, ["1", "0"]); });
      document.querySelectorAll("#themes [data-theme]").forEach(b => b.onclick = e => { e.preventDefault(); setTheme(b.dataset.theme); });
      document.querySelectorAll("#candlesel [data-candle]").forEach(b => b.onclick = e => { e.preventDefault(); setCandles(b.dataset.candle); });
      const onPick = ev => {
        const el = ev.target, key = el.dataset.ckey, group = el.dataset.cgroup;
        if (!key) return;
        const h = parseHex(el.value);
        if (!h) {
          if (ev.type === "change" || ev.type === "blur") {
            const base = withCustom(THEMES[themeId()] || THEMES.midnight);
            const v = group === "candle" ? candlePair(base)[key] : base[key];
            el.value = toInputHex(v);
          }
          return;
        }
        setCustom(key, h, group);
      };
      document.querySelectorAll("#colorpick input").forEach(el => {
        el.addEventListener("input", onPick);
        el.addEventListener("change", onPick);
        if (el.classList.contains("phex")) el.addEventListener("blur", onPick);
      });
      const setTarget = (key, group) => {
        colorTarget = { key, group: group || "ui" };
        document.querySelectorAll("#colorpick .picker").forEach(row => {
          const inp = row.querySelector("input[data-ckey]");
          const on = inp && inp.dataset.ckey === key && inp.dataset.cgroup === colorTarget.group;
          row.classList.toggle("on", !!on);
        });
      };
      document.querySelectorAll("#colorpick .picker").forEach(row => {
        const inp = row.querySelector("input[data-ckey]");
        if (!inp) return;
        row.addEventListener("click", () => setTarget(inp.dataset.ckey, inp.dataset.cgroup));
        row.querySelectorAll("input").forEach(el => el.addEventListener("focus", () => setTarget(inp.dataset.ckey, inp.dataset.cgroup)));
      });
      document.querySelectorAll("#colorchips [data-hex]").forEach(b => b.onclick = ev => { ev.preventDefault(); setCustom(colorTarget.key, b.dataset.hex, colorTarget.group); });
      document.querySelectorAll("#palettes [data-palette]").forEach(b => b.onclick = ev => { ev.preventDefault(); applyPalette(b.dataset.palette); });
      const rst = document.getElementById("resetcolors");
      if (rst) rst.onclick = ev => { ev.preventDefault(); resetCustomColors(); };
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
  // ---------- v28 Desk tab: Strategy · PnL calendar · Journal · Settings (desk.json, read-only) ----------
  const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const pctS = v => v == null ? "—" : (v >= 0 ? "+" : "") + Number(v).toFixed(1) + "%";
  const agoS = iso => { if (!iso) return "never"; const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
    return s < 120 ? Math.round(s) + "s ago" : s < 7200 ? Math.round(s / 60) + " min ago" : Math.floor(s / 3600) + "h " + Math.round(s % 3600 / 60) + "m ago"; };
  const vilnius = iso => { if (!iso) return "—"; try { return new Date(iso).toLocaleString("en-GB", { timeZone: "Europe/Vilnius", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }); } catch (e) { return iso; } };
  function deskSeg() {
    const cur = S.deskTab || "strategy";
    return `<div class="gut"><div class="seg wide dseg" id="dseg" role="tablist">${[["strategy","Strategy"],["pnl","PnL"],["journal","Journal"],["settings","Settings"]]
      .map(([k, l]) => `<button type="button" data-dt="${k}" class="${cur === k ? "on" : ""}">${l}</button>`).join("")}</div></div>`;
  }
  function strategyView(d) {
    const st = d.strategy || {}, v = st.values || {};
    const fmtV = (k, x) => x == null ? "—" : k === "scanner.min_volume_h1_usd" ? "$" + Number(x).toLocaleString("en-US") + " 1h vol"
      : k === "scanner.feed_max_room" ? x + " in room" : k === "executor.stack_pct" ? x + "% per coin"
      : k === "scanner.newpairs_poll_s" ? "poll " + x + "s" : (x ? "pairs < " + x + " min" : "any pair age");
    const card = p => {
      const on = st.active === p.name, link = tgLink("strategy_" + p.name);
      return `<div class="stcard${on ? " on" : ""}"><div class="sth"><span class="stn">${esc(p.label)}</span>${on ? '<span class="pill greenp">Active</span>' : ""}</div>
        <div class="s wrap">${esc(p.blurb)}</div>
        <div class="stv">${Object.entries(p.values).map(([k, x]) => `<span class="chipv">${esc(fmtV(k, x))}</span>`).join("")}</div>
        ${on ? "" : link ? `<a class="mbtn" href="${esc(link)}" target="_blank" rel="noopener">Switch to ${esc(p.label)}</a>` : ""}</div>`;
    };
    const ls = st.last_switch;
    return `<div class="sh"><h2>Strategy</h2><span class="sec">${esc(st.label || "—")}</span></div>
      <div class="gut stlist">${(st.presets || []).map(card).join("")}</div>
      <div class="list"><div class="row"><span class="main"><div class="t">Now</div><div class="s wrap">${Object.entries(v).map(([k, x]) => esc(fmtV(k, x))).join(" · ")}</div></span></div>
      ${ls ? `<div class="row"><span class="main"><div class="t">Last switch</div><div class="s">${esc(ls.old || "?")} → ${esc(ls.new)} · ${esc(vilnius(ls.ts))} (Europe/Vilnius)</div></span></div>` : ""}</div>
      <div class="gut s wrap" style="margin-top:10px">A switch opens the desk bot in Telegram: tap Start. Hard scam checks, the name blocklist, X check, socials and PAPER/LIVE never change with a strategy.</div>`;
  }
  function pnlView(d) {
    const modes = Object.keys(d.pnl_days || {});
    const mode = S.pnlMode && modes.includes(S.pnlMode) ? S.pnlMode : (modes.includes("LIVE") && d.mode === "LIVE" ? "LIVE" : modes[0] || "PAPER");
    const days = (d.pnl_days || {})[mode] || [], by = {};
    days.forEach(x => by[x.date] = x);
    const today = new Date(), tz = new Date(today.toLocaleString("en-US", { timeZone: "Europe/Vilnius" }));
    const ym = S.pnlMonth || `${tz.getFullYear()}-${String(tz.getMonth() + 1).padStart(2, "0")}`;
    const [Y, M] = ym.split("-").map(Number);
    const first = new Date(Date.UTC(Y, M - 1, 1)), nd = new Date(Date.UTC(Y, M, 0)).getUTCDate(), lead = (first.getUTCDay() + 6) % 7;
    const monthRows = days.filter(x => x.date.startsWith(ym));
    const mt = monthRows.reduce((a, x) => ({ pnl: a.pnl + x.pnl_usd, n: a.n + x.trades, w: a.w + x.wins, l: a.l + x.losses, inv: a.inv + (x.invested_usd || 0) }), { pnl: 0, n: 0, w: 0, l: 0, inv: 0 });
    const maxAbs = Math.max(0.01, ...monthRows.map(x => Math.abs(x.pnl_usd)));
    const todayKey = `${tz.getFullYear()}-${String(tz.getMonth() + 1).padStart(2, "0")}-${String(tz.getDate()).padStart(2, "0")}`;
    let cells = "";
    for (let i = 0; i < lead; i++) cells += `<div class="cd empty"></div>`;
    for (let dd = 1; dd <= nd; dd++) {
      const key = `${ym}-${String(dd).padStart(2, "0")}`, x = by[key];
      const a = x ? Math.min(1, 0.25 + 0.75 * Math.abs(x.pnl_usd) / maxAbs) : 0;
      const col = x ? (x.pnl_usd >= 0 ? `rgba(0,211,90,${a * 0.55})` : `rgba(255,69,58,${a * 0.55})`) : "";
      cells += `<button type="button" class="cd${x ? (x.pnl_usd >= 0 ? " up" : " dn") : ""}${key === todayKey ? " today" : ""}${S.pnlDay === key ? " sel" : ""}" data-day="${key}" ${col ? `style="background:${col}"` : ""}>
        <span class="dn1">${dd}</span>${x ? `<span class="dv">${x.pnl_usd >= 0 ? "+" : "-"}${Math.abs(x.pnl_usd) >= 10 ? Math.round(Math.abs(x.pnl_usd)) : Math.abs(x.pnl_usd).toFixed(1)}</span>` : ""}</button>`;
    }
    const prev = M === 1 ? `${Y - 1}-12` : `${Y}-${String(M - 1).padStart(2, "0")}`, next = M === 12 ? `${Y + 1}-01` : `${Y}-${String(M + 1).padStart(2, "0")}`;
    const sel = S.pnlDay && by[S.pnlDay];
    const dayRow = x => `<div class="row"><span class="main"><div class="t">${esc(reportDate(x.date))}</div>
        <div class="s">${x.trades} trade${x.trades === 1 ? "" : "s"} · ${x.wins}W / ${x.losses}L · fees ${money(x.fees_usd)}</div></span>
        <span class="v ${x.pnl_usd >= 0 ? "green" : "red"}">${moneyS(x.pnl_usd)}<div class="s ${x.pnl_usd >= 0 ? "green" : "red"}" style="text-align:right">${pctS(x.pct)}</div></span></div>`;
    return `<div class="sh"><h2>PnL calendar</h2>${modes.length > 1 ? `<div class="seg" id="pmode">${modes.map(m => `<button type="button" data-pm="${m}" class="${m === mode ? "on" : ""}">${m}</button>`).join("")}</div>` : `<span class="pill ${mode === "PAPER" ? "paper" : "greenp"}">${mode}</span>`}</div>
      <div class="gut"><div class="calcard">
        <div class="calh"><button type="button" class="calnav" data-month="${prev}" aria-label="Previous month">‹</button>
          <div class="calt"><div class="t">${MON[M - 1]} ${Y}</div><div class="calsum ${mt.pnl >= 0 ? "green" : "red"}">${mt.n ? moneyS(Math.round(mt.pnl * 100) / 100) + (mt.inv ? " · " + pctS(100 * mt.pnl / mt.inv) : "") : '<span class="ter">no closed trades</span>'}</div>
          <div class="s">${mt.n} trades · ${mt.w}W / ${mt.l}L</div></div>
          <button type="button" class="calnav" data-month="${next}" aria-label="Next month">›</button></div>
        <div class="calw">${["M","T","W","T","F","S","S"].map(x => `<span>${x}</span>`).join("")}</div>
        <div class="calg">${cells}</div></div></div>
      ${sel ? `<div class="sh"><h2 style="font-size:17px">${esc(reportDate(sel.date))}</h2></div><div class="list">${dayRow(sel)}</div>` : ""}
      <div class="sh"><h2>Daily PnL</h2><span class="sec">realized · ${mode}</span></div>
      <div class="list">${days.length ? days.slice().reverse().slice(0, 31).map(dayRow).join("") : '<div class="empty">No closed trades yet</div>'}</div>
      <div class="gut s wrap" style="margin-top:10px">Closed trades only, by Europe/Vilnius day, fees included. PAPER and LIVE are kept apart. Telegram: pnl today · pnl week · pnl month.</div>`;
  }
  function journalView(d) {
    const ls = d.lessons, jr = d.journal || [];
    const tagCls = t => /rugged|dumped|stop|gave back|quiet|loss|too early/.test(t) ? "redp" : "greenp";
    const lesson = ls ? `<div class="list"><div class="row"><span class="main"><div class="t">Lessons · ${esc(ls.night || "")}</div><div class="s wrap">${esc(ls.summary || "")}</div>
        ${ls.findings && ls.findings.tags ? `<div class="stv">${Object.entries(ls.findings.tags).slice(0, 6).map(([k, n]) => `<span class="pill ${tagCls(k)}">${esc(k)} ${n}</span>`).join("")}</div>` : ""}</span></div>
        ${(ls.applied || []).map(a => `<div class="row"><span class="main"><div class="t">Adjusted ${esc(a.key)}</div><div class="s wrap">${esc(a.old)} → ${esc(a.new)} · ${esc(a.why)}</div></span></div>`).join("")}
        ${(ls.proposals || []).map(p => `<div class="row"><span class="main"><div class="s wrap">💡 ${esc(p)}</div></span></div>`).join("")}
        ${!(ls.applied || []).length ? `<div class="row"><span class="main"><div class="s">No automatic changes in the last run.</div></span></div>` : ""}</div>`
      : `<div class="list"><div class="empty">First lessons after the next 08:00 night report</div></div>`;
    const row = r => `<div class="row jrow"><span class="main"><div class="t">${r.mint ? `<a class="cl" href="${coinHref(r.mint)}">${esc(r.name || r.mint.slice(0, 4) + "…")}</a>` : esc(r.name || "—")} <span class="ter">· ${esc(r.mode)}</span></div>
        <div class="s wrap">${esc(vilnius(r.closed_at))} · held ${r.hold_min == null ? "—" : Math.round(r.hold_min) + " min"} · ${esc(r.exit_reason || "")}${r.peak_pct != null ? " · peak " + pctS(r.peak_pct) : ""}</div>
        <div class="s wrap ter">${esc(r.entry_reason || "")}${r.source ? " · " + esc(r.source) : ""}${r.chain ? " · " + esc(r.chain) : ""}</div>
        <div class="stv">${(r.tags || []).map(t => `<span class="pill ${tagCls(t)}">${esc(t)}</span>`).join("")}</div></span>
        <span class="v ${r.pnl_usd >= 0 ? "green" : "red"}">${moneyS(r.pnl_usd)}<div class="s ${r.pnl_usd >= 0 ? "green" : "red"}" style="text-align:right">${pctS(r.pnl_pct)}</div></span></div>`;
    return `<div class="sh"><h2>What the desk learned</h2></div>${lesson}
      <div class="sh"><h2>Journal</h2><span class="sec">${jr.length} trades</span></div>
      <div class="list">${jr.length ? jr.map(row).join("") : '<div class="empty">No closed trades yet</div>'}</div>
      <div class="gut s wrap" style="margin-top:10px">Only small, capped changes are automatic (analyst score weights, ±0.05 a night, 0.5–1.5). Scam checks, ticket size and PAPER/LIVE are never touched. Telegram: journal · lessons.</div>`;
  }
  function settingsView(d) {
    const h = d.health || {}, st = d.settings || {}, g = d.live_gate || {}, wd = h.watchdog;
    const kv2 = (k, v, cls) => `<div class="kv"><span class="sec">${k}</span><span class="${cls || ""}">${v}</span></div>`;
    const hb = h.heartbeat_age_s || {};
    const hbOk = h.heartbeats_fresh;
    const w = st.weights || {};
    return `<div class="sh"><h2>Desk</h2><span class="pill ${d.mode === "PAPER" ? "paper" : "greenp"}">${esc(d.mode)}</span></div>
      <div class="gut"><div class="setcard">
        ${kv2("Mode", esc(d.mode))}
        ${kv2("Strategy", esc((d.strategy && d.strategy.label) || "—"))}
        ${kv2("Buying", h.buying_paused ? "paused" : "on", h.buying_paused ? "red" : "green")}
        ${kv2("Stack", money(st.stack) + " · " + esc(st.stack_pct) + "% per coin")}
        ${kv2("Min ticket · LIVE stack", money(st.min_ticket_usd) + " · " + money(st.live_stack))}
        ${kv2("LIVE gate", g.met ? `met · ${g.full_paper_nights} full PAPER night${g.full_paper_nights === 1 ? "" : "s"}` : "not met", g.met ? "green" : "red")}
      </div></div>
      <div class="sh"><h2>Health</h2><span class="${hbOk && h.service !== "inactive" ? "green" : "red"}">${hbOk ? "OK" : "check"}</span></div>
      <div class="gut"><div class="setcard">
        ${kv2("Service", esc(h.service || "n/a"))}
        ${kv2("Up since", esc(h.service_since || "—"))}
        ${kv2("Heartbeats", Object.entries(hb).map(([a, s]) => `<span class="${s != null && s <= 300 ? "green" : "red"}">${esc(a.slice(0, 3))} ${s == null ? "—" : s + "s"}</span>`).join(" "))}
        ${kv2("Last scanner decision", esc(agoS(h.last_scan_ts)))}
        ${kv2("Last executor signal", esc(agoS(h.last_signal_ts)) + (h.last_signal_status ? " · " + esc(h.last_signal_status) : ""))}
        ${kv2("Last fill", esc(agoS(h.last_fill_ts)))}
        ${kv2("WS reconnects · crashes (1h)", `${h.ws_reconnects_1h == null ? "n/a" : h.ws_reconnects_1h} · ${h.crashes_1h == null ? "n/a" : h.crashes_1h}`)}
        ${kv2("Watchdog", wd ? (wd.ok ? "ok" : esc(wd.problem)) + " · " + esc(agoS(wd.last_check)) : "no check yet", wd && wd.ok ? "green" : "red")}
        ${wd && wd.last_restart ? kv2("Last watchdog restart", esc(vilnius(wd.last_restart.ts)) + " · " + esc(wd.last_restart.reason)) : ""}
        ${kv2("Last health check", esc(vilnius(h.time)))}
      </div>
      <div class="mbtns" style="margin-top:10px">${["health", "settings"].map(x => `<a class="mbtn ghost" href="${esc(tgLink(x))}" target="_blank" rel="noopener">${x === "health" ? "Health in Telegram" : "Settings in Telegram"}</a>`).join("")}</div></div>
      <div class="sh"><h2>Key thresholds</h2></div>
      <div class="gut"><div class="setcard">
        ${kv2("1h volume ≥", money(st.min_volume_h1_usd))}
        ${kv2("Liquidity ≥", money(st.min_liquidity_usd))}
        ${kv2("Holders ≥ · MC ≥", esc(st.min_holders) + " · " + money(st.min_market_cap_usd))}
        ${kv2("Feed room · new pairs", esc(st.feed_max_room) + " · " + esc(st.newpairs_poll_s) + "s" + (st.newpairs_max_age_min ? " · < " + esc(st.newpairs_max_age_min) + " min" : ""))}
        ${kv2("Dev ≤ · top10 ≤ · LP locked ≥", `${esc(st.max_dev_pct)}% · ${esc(st.max_top10_pct)}% · ${esc(st.min_lp_locked_pct)}%`)}
        ${kv2("X check · socials", (st.x_check ? "on" : "off") + " · " + (st.require_socials ? "required" : "optional"))}
        ${kv2("Analyst score ≥", esc(st.min_score))}
        ${kv2("Score weights", `alive ${esc(w.alive)} · organic ${esc(w.organic)} · flush ${esc(w.flush)} · chase ${esc(w.chase)}`)}
        ${kv2("Stop · trail", `-${esc(st.stop_pct)}% · ${esc(st.trail_pct)}% from +${esc(st.trail_start_pct)}%`)}
        ${kv2("Timeout", esc(st.timeout_h) + "h")}
      </div></div>
      <div class="gut s wrap" style="margin-top:10px">Read-only. Change by Telegram (set …, strategy …, pause, resume). LIVE needs you to type LIVE in capitals; LIVE only sends FOMO links, it never places orders.</div>`;
  }
  function deskTab() {
    const d = S.desk;
    if (!d) return navbar() + deskSeg() + `<div class="gut" style="margin-top:12px">${S.deskMissing ? '<div class="list"><div class="empty">The desk hasn’t published desk.json yet</div></div>' : sk(420, null, "border-radius:14px")}</div>`;
    const t = S.deskTab || "strategy";
    const body = t === "pnl" ? pnlView(d) : t === "journal" ? journalView(d) : t === "settings" ? settingsView(d) : strategyView(d);
    return { html: navbar() + deskSeg() + body + `<div class="gut s ter" style="margin:14px 0 8px">Updated ${esc(agoS(d.updated_at))}</div>`, after() {
      view.querySelectorAll("[data-dt]").forEach(b => b.onclick = () => { S.deskTab = b.dataset.dt; try { localStorage.setItem("desk.deskTab", S.deskTab); } catch (e) {} render(); });
      view.querySelectorAll("[data-month]").forEach(b => b.onclick = () => { S.pnlMonth = b.dataset.month; S.pnlDay = null; render(); });
      view.querySelectorAll("[data-day]").forEach(b => b.onclick = () => { S.pnlDay = S.pnlDay === b.dataset.day ? null : b.dataset.day; render(); });
      view.querySelectorAll("[data-pm]").forEach(b => b.onclick = () => { S.pnlMode = b.dataset.pm; render(); });
    } };
  }

  // ---------- v33 Bot tab: the auto-trading bot's own book (bot.json, read-only; actions = Telegram deep links) ----------
  let botChartPrev = null;
  function botTab() {
    const b = S.bot;
    if (!b) return navbar() + `<div class="gut" style="margin-top:12px">${S.botMissing ? '<div class="list"><div class="empty">The desk hasn’t published bot.json yet</div></div>' : sk(420, null, "border-radius:14px")}</div>`;
    const sol = v => v == null ? "—" : Number(v).toFixed(4) + " SOL";
    const solS = v => v == null ? "—" : (v >= 0 ? "+" : "") + Number(v).toFixed(4) + " SOL";
    const cls = v => v == null ? "" : v >= 0 ? "green" : "red";
    const ch = b.chart || {};
    const RANGE_ORDER = ["LIVE","1H","4H","1D","1W","ALL"];
    const usdPts = (name) => ((ch.ranges && ch.ranges[name]) || {}).points_usd || [];
    const solPts = (name) => ((ch.ranges && ch.ranges[name]) || {}).points_sol || [];
    const hasUsd = RANGE_ORDER.some(n => usdPts(n).length);
    const hasSol = RANGE_ORDER.some(n => solPts(n).length);
    if (!S.botUnit) S.botUnit = (usdPts("ALL").length >= 2 && usdPts("ALL").length >= solPts("ALL").length) ? "usd" : "sol";
    if (S.botUnit === "usd" && !hasUsd && hasSol) S.botUnit = "sol";
    const unit = S.botUnit === "usd" ? "usd" : "sol";
    const botRange = S.botRange || "LIVE";
    const pickRange = (want) => {
      const start = Math.max(0, RANGE_ORDER.indexOf(want));
      const tryName = (n) => {
        const r = (ch.ranges && ch.ranges[n]) || { points_sol: [], points_usd: [], marks: [] };
        const pts = unit === "usd" ? (r.points_usd || []) : (r.points_sol || []);
        return pts.length ? { name: n, rng: r, points: pts } : null;
      };
      const own = tryName(want);
      if (own) return { ...own, shown: want, fallback: false };
      const hinted = ((ch.ranges && ch.ranges[want]) || {}).fallback;
      const hit = hinted && tryName(hinted);
      if (hit) return { ...hit, shown: hinted, fallback: true };
      for (const n of RANGE_ORDER.slice(start + 1)) {
        const hit2 = tryName(n);
        if (hit2) return { ...hit2, shown: n, fallback: true };
      }
      const empty = (ch.ranges && ch.ranges[want]) || { points_sol: [], points_usd: [], marks: [] };
      return { name: want, rng: empty, points: [], shown: want, fallback: false };
    };
    const viewed = pickRange(botRange);
    const rng = viewed.rng;
    const points = viewed.points;
    const solZ = v => {
      if (v == null) return "—";
      const n = Number(v);
      if (!Number.isFinite(n) || Math.abs(n) < 5e-7) return "0 SOL";
      return (n > 0 ? "+" : "") + n.toFixed(4).replace(/0+$/, "").replace(/\.$/, "") + " SOL";
    };
    const start = unit === "usd" ? ch.start_usd : ch.start_sol;
    const today = unit === "usd" ? ch.today_pct_usd : ch.today_pct_sol;
    const mult = unit === "usd" ? ch.multiplier_usd : ch.multiplier_sol;
    const headline = unit === "usd" ? (ch.value_usd != null ? money(ch.value_usd) : null)
      : (ch.value_sol != null ? sol(ch.value_sol) : null);
    const unitBtns = `<div class="ranges" style="margin-top:8px">${["sol","usd"].map(u => {
      const on = u === unit, empty = u === "usd" ? !hasUsd : !hasSol;
      return `<button type="button" data-botunit="${u}" class="${on ? "on" : ""}" ${empty && !on ? "disabled" : ""}>${u.toUpperCase()}</button>`;
    }).join("")}</div>`;
    const kv = (k, v, c) => `<div class="kv"><span class="sec">${k}</span><span class="${c || ""}">${v}</span></div>`;
    const btn = (pl, label, extra) => { const l = tgLink(pl); return l ? `<a class="mbtn${extra ? " " + extra : ""}" href="${esc(l)}" target="_blank" rel="noopener">${esc(label)}</a>` : ""; };
    const d = b.day || {}, lim = b.limits || {};
    const mode = b.mode === "LIVE" ? '<span class="pill redp">LIVE · real SOL</span>' : '<span class="pill paper">DRY · quotes only</span>';
    const onp = b.enabled ? '<span class="pill greenp">ON</span>' : '<span class="pill">OFF</span>';
    const putIn = p => {
      const usd = p.cost_usd != null ? money(p.cost_usd) : "—";
      const s = p.cost_sol != null ? sol(p.cost_sol) : (p.size_sol != null ? sol(p.size_sol) : "—");
      return usd + " · " + s;
    };
    const pos = (b.positions || []).map(p => `<a class="row" href="#/bot/${esc(p.id)}"><span class="main"><div class="t">${esc(p.name || (p.mint || "").slice(0, 6))} <span class="ter">#${esc(p.id)}</span></div>
        <div class="s">${esc(putIn(p))} in · now ${esc(sol(p.value_sol))}${p.status !== "open" ? " · " + esc(p.status) : ""}${p.tp_pct != null ? " · TP +" + esc(p.tp_pct) + "%" : ""}</div></span>
        <span class="v"><div class="${cls(p.pnl_pct)}">${esc(pctS(p.pnl_pct))}</div><div class="s ${cls(p.pnl_usd != null ? p.pnl_usd : p.pnl_sol)}">${p.pnl_usd != null ? esc(moneyS(p.pnl_usd)) : esc(solS(p.pnl_sol))}</div></span></a>`).join("");
    const trades = (b.trades || []).map(t => {
      const body = `<span class="main"><div class="t">${esc(t.side === "buy" ? "Bought" : t.side === "sell" ? "Sold" : (t.side || "Trade"))} ${esc(t.name || (t.mint || "").slice(0, 6))}</div>
        <div class="s wrap">${esc(vilnius(typeof t.ts === "number" ? new Date(t.ts * 1000).toISOString() : t.ts))} · ${esc(t.mode || "")} · ${esc(t.reason || "")}${t.error ? " · " + esc(t.error) : ""}</div></span>
        <span class="v"><div>${t.usd != null ? esc(money(t.usd)) : esc(sol(t.sol))}</div><div class="s ${t.status === "failed" ? "red" : ""}">${esc(t.status || "")}${t.link && safeUrl(t.link) ? ` · ${ext(t.link, "tx")}` : ""}</div></span>`;
      return t.position_id ? `<a class="row" href="#/bot/${esc(t.position_id)}">${body}</a>` : `<div class="row">${body}</div>`;
    }).join("");
    const todayLine = today == null
      ? `<span class="sec">Wallet — today</span>`
      : `<span class="${today >= 0 ? "green" : "red"}">Wallet ${esc(sgn(today))} today</span>`;
    const chartHint = viewed.fallback
      ? `<div class="charthint">Showing ${esc(viewed.shown)} · no new ${esc(botRange)} samples</div>`
      : "";
    const html = navbar() + `<section class="hero glass"><div class="herotop"><span class="botlabel">Bot wallet</span><span class="heropills">${b.mode === "DRY" ? '<span class="pill paper">DRY</span>' : '<span class="pill redp">LIVE</span>'}${b.enabled ? '<span class="pill greenp">ON</span>' : '<span class="pill">OFF</span>'}</span></div>
       <div class="bigrow"><span class="big glow">${headline != null ? esc(headline) : "—"}</span></div>
       <div class="today">${todayLine}
       ${mult != null ? `<span class="pill mult">${esc(String(mult))}×</span>` : ""}
       <span class="sec">· realized ${esc(solZ(b.realized_today_sol))}</span></div>
      <div class="chartwrap"><canvas id="botline"></canvas>${viewed.fallback ? "" : (points.length ? "" : '<div class="chartempty">no data yet</div>')}</div>
      <div class="ranges">${RANGE_ORDER.map(r => `<button type="button" data-botrange="${r}" class="${r === botRange ? "on" : ""}">${r}</button>`).join("")}</div>
      ${chartHint}${unitBtns}</section>
      <div class="card"><h3>Auto-trading bot</h3>
        <div class="kv"><span>${onp} ${mode}</span><span class="ter">${b.killing ? "killing…" : ""}</span></div>
        ${kv("Wallet SOL", esc(sol(b.sol_balance)))}
        ${b.mode === "DRY" ? kv("DRY book start", esc(sol(b.dry_start_sol))) : ""}
        ${kv("Wallet today", esc(pctS(d.loss_pct == null ? null : -d.loss_pct)), cls(d.loss_pct == null ? null : -d.loss_pct))}
        ${kv("Realized today", esc(solZ(b.realized_today_sol)), cls(b.realized_today_sol))}
        ${kv("Daily stop", d.stopped ? '<span class="red">HIT · no buys until 00:00</span>' : "ok · at -" + esc(lim.daily_stop_pct) + "%")}
        ${kv("Total realized", `${esc(solS(b.total_pnl_sol))} · ${esc(b.wins)}/${esc(b.closed)} wins`, cls(b.total_pnl_sol))}
        ${kv("Per trade", "up to " + esc(lim.max_trade_pct) + "% · " + esc(lim.reserve_sol) + " SOL kept for fees")}
        <div class="botbtns">${b.enabled ? btn("bot_off", "Turn off") : btn("bot_on", "Turn on")}${b.mode === "LIVE" ? btn("bot_dry", "Back to DRY") : ""}${btn("bot", "Status")}${btn("bot_pnl", "PnL")}${btn("bot_withdraw", "Withdraw")}${btn("bot_kill", "Kill · sell all", "danger")}</div>
        ${b.mode === "DRY" ? '<div class="s wrap ter" style="margin-top:8px">Real trades: type BOT LIVE (capitals) in the desk bot.</div>' : ""}</div>
      <div class="card"><h3>Wallet</h3><div class="addr" id="botaddr" title="${esc(b.address || "")}">${esc(b.address || "not created")}</div>
        ${b.address ? '<div class="botbtns"><button type="button" class="mbtn" id="botcopy">Copy address</button>' + ext("https://solscan.io/account/" + b.address, "Solscan", "mbtn") + "</div>" : ""}
        <div class="s wrap ter" style="margin-top:8px">Send SOL (Solana network) to this address to fund the bot. Only send what you can lose. Withdraw opens Telegram and sends only to your Phantom${b.owner_address ? " <span class=\"addr inline\">" + esc(shortAddr(b.owner_address)) + "</span>" : ""}; the destination cannot be changed.</div></div>
      <div class="sh"><h2>Open positions</h2></div><div class="list">${pos || '<div class="empty">No open bot coins</div>'}</div>
      <div class="sh"><h2>Trades</h2></div><div class="list">${trades || '<div class="empty">No bot trades yet</div>'}</div>
      <div class="gut s ter" style="margin:14px 0 8px">Updated ${esc(agoS(b.updated_at))}</div>`;
    return { html, after() {
      const c = document.getElementById("botcopy");
      if (c) c.onclick = async () => { try { await navigator.clipboard.writeText(b.address); toast("Address copied"); } catch (e) { toast(b.address); } };
      const line = document.getElementById("botline");
      if (line && window.DeskChart) {
        botChartPrev = DeskChart.line(line, { points, marks: enrichMarks(rng.marks || []), start, onMarks: items => paintChartMarks(line, items) }, botChartPrev);
      }
      view.querySelectorAll("[data-botrange]").forEach(b => b.onclick = () => { S.botRange = b.dataset.botrange; botChartPrev = null; render(); });
      view.querySelectorAll("[data-botunit]").forEach(b => b.onclick = () => { S.botUnit = b.dataset.botunit; botChartPrev = null; render(); });
    } };
  }

  function botPosScreen(id) {
    const b = S.bot;
    if (!b) return backbar("Bot", "#/bot") + `<div class="gut" style="margin-top:12px">${S.botMissing ? '<div class="list"><div class="empty">The desk hasn’t published bot.json yet</div></div>' : sk(420, null, "border-radius:14px")}</div>`;
    const p = (b.book || b.positions || []).find(x => String(x.id) === String(id));
    if (!p) return { html: backbar("Bot", "#/bot") + '<div class="empty" style="padding-top:120px">Not on the bot book</div>', after() {} };
    const sol = v => v == null ? "—" : Number(v).toFixed(4) + " SOL";
    const solS = v => v == null ? "—" : (v >= 0 ? "+" : "") + Number(v).toFixed(4) + " SOL";
    const cls = v => v == null ? "" : v >= 0 ? "green" : "red";
    const px = v => v == null || !isFinite(v) ? "—" : (v >= 1 ? Number(v).toPrecision(6) : Number(v).toPrecision(4));
    const btn = (pl, label, extra) => { const l = tgLink(pl); return l ? `<a class="mbtn${extra ? " " + extra : ""}" href="${esc(l)}" target="_blank" rel="noopener">${esc(label)}</a>` : ""; };
    const open = p.status !== "closed";
    const pnlCls = cls(p.pnl_usd != null ? p.pnl_usd : (p.pnl_pct != null ? p.pnl_pct : p.pnl_sol));
    const coin = S.coin[p.mint] || {};
    const key = "bot:" + p.id;
    const draft = S.lineDraft[key] || {};
    const snap = p.lines || (open ? { sl_risk_price: p.stop_price, sl_risk_kind: p.trail_active ? "trail" : "stop",
      sl_risk_pct: (p.entry_price && p.stop_price) ? 100 * (p.stop_price / p.entry_price - 1) : null,
      tp_price: p.tp_pct != null && p.entry_price ? p.entry_price * (1 + p.tp_pct / 100) : null,
      tp_pct: p.tp_pct, sl_price: p.sl_pct != null && p.entry_price ? p.entry_price * (1 - p.sl_pct / 100) : null,
      sl_pct: p.sl_pct } : null);
    const fac = (coin.stats && coin.stats.marketCap != null && (p.price || coin.price))
      ? coin.stats.marketCap / (p.price || coin.price) : null;
    const tpDraft = S.tpDraft[key] != null ? S.tpDraft[key] : (p.tp_pct != null ? String(p.tp_pct) : "");
    const slDraft = S.slDraft[key] != null ? S.slDraft[key] : (p.sl_pct != null ? String(p.sl_pct) : "");
    const tpPart = S.tpPart[key] || p.tp_part || "all";
    const slPart = S.slPart[key] || p.sl_part || "all";
    const tpGo = tgLink(tpPayload(p.id, tpDraft, tpPart, "bottp_") || "");
    const slGo = tgLink(slPayload(p.id, slDraft, slPart, "botsl_") || "");
    const solscan = p.mint ? "https://solscan.io/token/" + encodeURIComponent(p.mint) : (p.buy_link && safeUrl(p.buy_link) ? p.buy_link : "");
    const html = backbar("Bot", "#/bot") + `<div class="coinhead">
        <div class="cname">${logo(p.name || p.mint, coin.logo, 48)}<span class="cnm"><span>${esc(p.name || (p.mint || "").slice(0, 4) + "…" + (p.mint || "").slice(-3))}</span>
          <span class="sec sm">${esc(p.mode || "")} · ${esc(p.status || "")}${p.exit_reason ? " · " + esc(p.exit_reason) : ""}</span></span>
          ${p.pnl_pct != null ? `<span class="cpill lg2 ${p.pnl_pct >= 0 ? "up" : "down"}">${esc(sgn(p.pnl_pct, 2))}</span>` : ""}
          ${p.mode === "LIVE" ? '<span class="pill redp">LIVE</span>' : '<span class="pill paper">DRY</span>'}</div>
      </div>
      <div class="chartcard glass" id="botposchart"><div class="chsrc"><span class="srcl">desk prices · press and hold a candle</span></div>
        <div class="zoomrow"><span class="zoomctl" role="group" aria-label="Chart zoom"><button type="button" id="zout" aria-label="Zoom out">−</button><button type="button" id="zfit" aria-label="Show all candles">All</button><button type="button" id="zin" aria-label="Zoom in">+</button></span><span class="zoomhint">pinch or drag · drag SL/TP handles</span></div>
        <div class="chartwrap" style="position:relative"><canvas id="botcandles"></canvas>${(p.candles || []).length ? "" : '<div class="chartempty">no price data yet</div>'}</div></div>
      <div class="statgrid">
        <div class="cell"><div class="k">Invested</div><div class="v">${p.cost_usd != null ? esc(money(p.cost_usd)) : "—"}<span class="ter"> · ${esc(sol(p.cost_sol))}</span></div></div>
        <div class="cell"><div class="k">Value</div><div class="v">${p.value_usd != null ? esc(money(p.value_usd)) : "—"}<span class="ter"> · ${esc(sol(p.value_sol))}</span></div></div>
        <div class="cell"><div class="k">PnL</div><div class="v ${pnlCls}">${p.pnl_usd != null ? esc(moneyS(p.pnl_usd)) : "—"}<span class="ter"> · ${esc(solS(p.pnl_sol))}</span></div></div>
        <div class="cell"><div class="k">Entry</div><div class="v">${esc(px(p.entry_price))}</div></div>
        <div class="cell"><div class="k">Now</div><div class="v">${esc(px(p.price))}</div></div>
        <div class="cell"><div class="k">Held for</div><div class="v">${esc(heldFor(p.opened_at))}</div></div>
      </div>
      ${open ? `<div class="manual gutbot">
        <div class="tprow"><label class="tpin"><span>+</span><input id="bottpin" type="number" inputmode="decimal" min="0.1" max="100000" step="any" placeholder="50" value="${esc(tpDraft)}" aria-label="Take profit percent"><span>%</span></label>
          <div class="seg" id="bottpseg"><button type="button" data-part="all" class="${tpPart === "all" ? "on" : ""}">All</button><button type="button" data-part="half" class="${tpPart === "half" ? "on" : ""}">Half</button></div></div>
        <div class="mbtns"><a class="mbtn${tpGo ? "" : " off"}" id="bottpgo" ${tpGo ? `href="${esc(tpGo)}"` : ""} target="_blank" rel="noopener">Set TP</a>
          ${p.tp_pct != null ? `<a class="mbtn ghost" href="${esc(tgLink("bottpoff_" + p.id) || "")}" target="_blank" rel="noopener">Clear TP</a>` : ""}</div>
        <div class="tprow"><label class="tpin"><span>−</span><input id="botslin" type="number" inputmode="decimal" min="0.1" max="99" step="any" placeholder="6" value="${esc(slDraft)}" aria-label="Stop loss percent"><span>%</span></label>
          <div class="seg" id="botslseg"><button type="button" data-part="all" class="${slPart === "all" ? "on" : ""}">All</button><button type="button" data-part="half" class="${slPart === "half" ? "on" : ""}">Half</button></div></div>
        <div class="mbtns"><a class="mbtn${slGo ? "" : " off"}" id="botslgo" ${slGo ? `href="${esc(slGo)}"` : ""} target="_blank" rel="noopener">Set SL</a>
          ${p.sl_pct != null ? `<a class="mbtn ghost" href="${esc(tgLink("botsloff_" + p.id) || "")}" target="_blank" rel="noopener">Clear SL</a>` : ""}</div>
      </div>
      <div class="botacts">${btn("botsell_" + p.id, "Sell")}${btn("botsellhalf_" + p.id, "Half")}</div>
      <div class="s wrap ter gutbot">Saves in Telegram. A hit sells through the bot’s usual path. This does not turn the bot on.</div>` : ""}
      ${solscan && safeUrl(solscan) ? `<div class="solmini">${ext(solscan, "Solscan", "link")}</div>` : ""}
      <div class="note mono">${esc(p.mint || "")}</div>
      <div class="spacer"></div>`;
    return { html, after() {
      const bindLine = (inpId, goId, segId, draftKey, partKey, kind) => {
        const inp = document.getElementById(inpId), go = document.getElementById(goId), seg = document.getElementById(segId);
        const upd = () => {
          if (!inp || !go) return;
          const fn = kind === "tp" ? tpPayload : slPayload;
          const prefix = kind === "tp" ? "bottp_" : "botsl_";
          const url = tgLink(fn(p.id, S[draftKey][key] != null ? S[draftKey][key] : inp.value, S[partKey][key] || (kind === "tp" ? p.tp_part : p.sl_part) || "all", prefix) || "");
          if (url) { go.href = url; go.classList.remove("off"); } else { go.removeAttribute("href"); go.classList.add("off"); }
        };
        if (inp) inp.oninput = () => { S[draftKey][key] = inp.value; upd(); };
        if (seg) seg.querySelectorAll("button").forEach(b => b.onclick = () => {
          S[partKey][key] = b.dataset.part; seg.querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b)); upd();
        });
        upd();
      };
      bindLine("bottpin", "bottpgo", "bottpseg", "tpDraft", "tpPart", "tp");
      bindLine("botslin", "botslgo", "botslseg", "slDraft", "slPart", "sl");
      const cv = document.getElementById("botcandles");
      if (cv && window.DeskChart) {
        const list = deskCandles(p.candles || [], 60).map(q => ({ ...q, px: q.c, mc: (fac != null && q.c != null) ? q.c * fac : null }));
        const ath = athFrom(coin, list);
        const lines = open ? posChartLines(p.entry_price, snap, draft, ath) : (ath != null ? posChartLines(p.entry_price, null, {}, ath) : posChartLines(p.entry_price, null, {}, ath));
        DeskChart.candles(cv, list, null, { entryLine: null, lines, min: 1,
          emptyText: (p.candles || []).length ? undefined : "no price data yet",
          mcFmt: kfmt,
          tip: (candle, info) => {
            const when = info && info.time ? info.time : "";
            const pr = candle.px != null ? candle.px : candle.c;
            const mc = candle.mc;
            return `<div class="t">${esc(when)}</div><div><span class="k">Price</span> ${esc(price(pr))}</div>` +
              (mc != null ? `<div><span class="k">MC</span> ${esc(kfmt(mc))}</div>` : "");
          },
          onDragEnd: (id, raw, kind) => {
            if (!open || !p.entry_price) return;
            S.lineDraft[key] = S.lineDraft[key] || {};
            if (kind === "sl" || id === "sl") {
              const pct = 100 * (1 - raw / p.entry_price);
              S.lineDraft[key].slPrice = raw; S.lineDraft[key].slPct = pct;
              S.slDraft[key] = String(Math.round(Math.abs(pct) * 10) / 10);
            } else if (kind === "tp" || id === "tp") {
              const pct = 100 * (raw / p.entry_price - 1);
              S.lineDraft[key].tpPrice = raw; S.lineDraft[key].tpPct = pct;
              S.tpDraft[key] = String(Math.round(pct * 10) / 10);
            }
            render();
          }
        });
        const doZoom = dir => { DeskChart.zoom(cv, dir); };
        const zout = document.getElementById("zout"), zin = document.getElementById("zin"), zfit = document.getElementById("zfit");
        if (zout) zout.onclick = e => { e.preventDefault(); doZoom("out"); };
        if (zin) zin.onclick = e => { e.preventDefault(); doZoom("in"); };
        if (zfit) zfit.onclick = e => { e.preventDefault(); doZoom("fit"); };
      }
    } };
  }

  function render() {
    tickOffline();
    if (document.querySelector("canvas.inspecting, canvas.linedrag, canvas.holding")) return;
    if (document.activeElement && ["tpin", "slin", "bottpin", "botslin"].includes(document.activeElement.id)) return;
    const r = route();
    view.classList.toggle("bottab", r.name === "bot");
    document.querySelectorAll(".tab").forEach(t => t.classList.toggle("on", t.dataset.tab === r.name || ((r.name === "coin" || r.name === "audit") && t.dataset.tab === "home") || (r.name === "report" && t.dataset.tab === "activity")));
    const tabs = [...document.querySelectorAll(".tab")], on = tabs.findIndex(t => t.classList.contains("on")), ind = document.getElementById("tabind");
    if (ind && on >= 0) ind.style.transform = `translateX(${on * 100}%)`;
    if (!BASE) { if (!document.getElementById("gb")) { view.innerHTML = gate(); bindGate(); } document.getElementById("tabbar").hidden = true; return; }
    const out = r.name === "bot" && r.arg ? botPosScreen(decodeURIComponent(r.arg)) : r.name === "bot" ? botTab()
      : r.name === "desk" ? deskTab() : r.name === "agents" ? agentsTab() : r.name === "activity" ? activityTab() : r.name === "account" ? accountTab()
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
    view.querySelectorAll("[data-book]").forEach(b => b.onclick = () => { S.book = b.dataset.book; chartPrev = null; render(); });
  }
  let navAnim = false;
  window.addEventListener("hashchange", async () => {
    keepD(); navAnim = true;
    window.scrollTo(0, 0); render();
    if (S.state) { try { await loadRoute(null); } catch (e) {} render(); }
  });
  let rz; window.addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(render, 150); });

  if ("serviceWorker" in navigator && !LOCAL) {
    let swReload = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => { if (swReload) return; swReload = true; location.reload(); });
    navigator.serviceWorker.register("sw.js?v=37", { updateViaCache: "none" }).then(reg => { try { reg.update(); } catch (e) {} }).catch(() => {});
  }
  render();
  if (BASE) poll();
  window.desk = { S, render };
})();
