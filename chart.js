/* Hand-drawn canvas charts, devicePixelRatio aware. No library. */
(function () {
  const RM = () => window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const FALLBACK = { green: "#00d35a", red: "#ff453a", orange: "#ff9f0a", blue: "#0a84ff", cyan: "#64d2ff",
                     yellow: "#ffd60a", sec: "rgba(235,235,245,0.6)", ter: "rgba(235,235,245,0.3)", sep: "rgba(84,84,88,0.55)",
                     card2: "#2c2c2e", text: "#ffffff", bg: "#000000" };
  const FONT = '-apple-system,"SF Pro Text",BlinkMacSystemFont,"Helvetica Neue",Arial,sans-serif';
  const SLOT_MIN = 3, SLOT_MAX = 24, SLOT_DEF = 9;

  function cssColor(name, fallback) {
    try { const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim(); return v || fallback; }
    catch (e) { return fallback; }
  }
  function themeC() {
    const green = cssColor("--green", FALLBACK.green), red = cssColor("--red", FALLBACK.red);
    return {
      green, red,
      orange: cssColor("--orange", FALLBACK.orange),
      blue: cssColor("--blue", FALLBACK.blue),
      cyan: cssColor("--cyan", FALLBACK.cyan),
      yellow: cssColor("--yellow", FALLBACK.yellow),
      sec: cssColor("--sec", FALLBACK.sec),
      ter: cssColor("--ter", FALLBACK.ter),
      sep: cssColor("--sep", FALLBACK.sep),
      card2: cssColor("--card2", FALLBACK.card2),
      text: cssColor("--text", FALLBACK.text),
      bg: cssColor("--bg", FALLBACK.bg),
      up: cssColor("--candle-up", green),
      down: cssColor("--candle-down", red)
    };
  }
  function hexRgb(hex) {
    const h = String(hex || "").replace("#", "");
    const n = h.length === 3 ? h.split("").map(c => c + c).join("") : h;
    if (n.length < 6) return null;
    return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)];
  }
  function rgba(col, a) {
    const rgb = hexRgb(col);
    if (!rgb) return col;
    return "rgba(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + "," + a + ")";
  }
  function isLight(col) {
    const rgb = hexRgb(col);
    if (!rgb) return false;
    return (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000 > 160;
  }

  function setup(canvas, cssH) {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || canvas.parentNode.clientWidth;
    canvas.style.height = cssH + "px";
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(cssH * dpr)) {
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(cssH * dpr);
    }
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, cssH);
    return { ctx, w, h: cssH };
  }

  function anim(ms, fn) {
    if (RM() || ms <= 0) { fn(1); return; }
    const t0 = performance.now();
    function step(t) { const p = Math.min(1, (t - t0) / ms); fn(1 - Math.pow(1 - p, 3)); if (p < 1) requestAnimationFrame(step); }
    requestAnimationFrame(step);
  }

  /* Home line: points [[iso, value]], marks [{ts, text, color, kind, mint, label}], start = night start value.
     Dots stay on the canvas; compact icon chips are laid out and handed to data.onMarks. */
  function line(canvas, data, prev) {
    const C = themeC();
    const pts = (data.points || []).map(p => [Date.parse(p[0]), p[1]]).filter(p => p[1] !== null);
    const marks = data.marks || [];
    const H = 220;
    const prevLen = prev && prev.len || 0, prevMarks = prev && prev.marks || 0;
    const grow = pts.length > prevLen && prevLen > 0;
    function shortLabel(m) {
      if (m.label) return m.label;
      if (m.kind === "bought" || /^Bought /i.test(m.text || "")) {
        return (m.sizeUsd != null && isFinite(m.sizeUsd)) ? "Buy $" + Number(m.sizeUsd).toFixed(2) : "Buy";
      }
      return m.text || "";
    }
    function layoutMarks(ctx, w, X, yAt) {
      const MH = 22, GAP = 4, ICON = 16;
      ctx.font = "600 11px " + FONT;
      const vis = marks.map(m => ({ ...m, x: X(Date.parse(m.ts)), label: shortLabel(m) }))
        .filter(m => m.x >= -8 && m.x <= w + 8)
        .sort((a, b) => a.x - b.x);
      const boxes = [];
      const fits = (x, y, mw) => {
        if (y < 1 || y + MH > H - 1 || x < 0 || x + mw > w) return false;
        return boxes.every(b => x + mw + GAP <= b.x || b.x + b.w + GAP <= x || y + MH + 2 <= b.y || b.y + b.h + 2 <= y);
      };
      const nudges = [0, -10, 10, -20, 20, -32, 32, -46, 46, -60, 60];
      vis.forEach(m => {
        const tw = ctx.measureText(m.label).width;
        const mw = Math.ceil(3 + ICON + 4 + tw + 7);
        const ideal = Math.min(Math.max(m.x - mw / 2, 0), Math.max(0, w - mw));
        const yLine = yAt(m.x);
        let placed = null;
        const tryPos = (x, y) => { if (!placed && fits(x, y, mw)) placed = { x, y }; };
        for (let r = 0; r < 6 && !placed; r++) {
          const y = yLine - 8 - MH - r * (MH + GAP);
          for (const d of nudges) tryPos(Math.min(Math.max(ideal + d, 0), Math.max(0, w - mw)), y);
        }
        for (let r = 0; r < 6 && !placed; r++) {
          const y = yLine + 8 + r * (MH + GAP);
          for (const d of nudges) tryPos(Math.min(Math.max(ideal + d, 0), Math.max(0, w - mw)), y);
        }
        if (!placed) placed = { x: ideal, y: Math.max(2, Math.min(yLine - 8 - MH, H - MH - 2)) };
        boxes.push({ x: placed.x, y: placed.y, w: mw, h: MH, label: m.label, mint: m.mint, kind: m.kind,
          color: m.color, text: m.text, name: m.name, logo: m.logo, link: m.link });
      });
      return boxes;
    }
    function draw(p, markAlpha) {
      const { ctx, w, h } = setup(canvas, H);
      const top = 64, bot = h - 12;
      if (pts.length === 0) {
        ctx.setLineDash([3, 5]); ctx.strokeStyle = C.ter; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, (top + bot) / 2); ctx.lineTo(w, (top + bot) / 2); ctx.stroke(); ctx.setLineDash([]);
        return { ctx, w, X: () => 0, yAt: () => (top + bot) / 2 };
      }
      const vals = pts.map(q => q[1]).concat(data.start != null ? [data.start] : []);
      let lo = Math.min(...vals), hi = Math.max(...vals);
      if (hi - lo < 1e-9) { hi += 1; lo -= 1; }
      const pad = (hi - lo) * 0.12; lo -= pad; hi += pad;
      const t0 = pts[0][0], t1 = pts[pts.length - 1][0] || t0 + 1;
      const X = t => pts.length === 1 ? w / 2 : (t - t0) / ((t1 - t0) || 1) * w;
      const Y = v => bot - (v - lo) / (hi - lo) * (bot - top);
      let xy = pts.map(q => [X(q[0]), Y(q[1])]);
      if (grow && p < 1 && xy.length > 1) {
        const a = xy[xy.length - 2], b = xy[xy.length - 1];
        xy[xy.length - 1] = [a[0] + (b[0] - a[0]) * p, a[1] + (b[1] - a[1]) * p];
      }
      if (data.start != null) {
        ctx.setLineDash([3, 5]); ctx.strokeStyle = C.ter; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, Y(data.start)); ctx.lineTo(w, Y(data.start)); ctx.stroke(); ctx.setLineDash([]);
      }
      const g = ctx.createLinearGradient(0, top, 0, bot);
      g.addColorStop(0, rgba(C.green, 0.28)); g.addColorStop(1, rgba(C.green, 0));
      ctx.beginPath(); ctx.moveTo(xy[0][0], bot);
      xy.forEach(q => ctx.lineTo(q[0], q[1])); ctx.lineTo(xy[xy.length - 1][0], bot); ctx.closePath();
      ctx.fillStyle = g; ctx.fill();
      ctx.beginPath(); xy.forEach((q, i) => i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]));
      ctx.strokeStyle = C.green; ctx.lineWidth = 2; ctx.lineJoin = "round"; ctx.stroke();
      const last = xy[xy.length - 1];
      ctx.beginPath(); ctx.arc(last[0], last[1], 4, 0, Math.PI * 2); ctx.fillStyle = C.green; ctx.fill();
      const yAt = x => { let best = xy[0]; for (const q of xy) if (Math.abs(q[0] - x) < Math.abs(best[0] - x)) best = q; return best[1]; };
      marks.map(m => ({ ...m, x: X(Date.parse(m.ts)) })).filter(m => m.x >= -1 && m.x <= w + 1)
        .forEach((m, i) => {
          const col = { blue: C.blue, green: C.green, red: C.red }[m.color] || C.blue;
          ctx.globalAlpha = i >= prevMarks ? markAlpha : 1;
          ctx.beginPath(); ctx.arc(m.x, yAt(m.x), 3, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill();
          ctx.globalAlpha = 1;
        });
      return { ctx, w, X, yAt };
    }
    const geo = draw(1, 1);
    const items = pts.length && geo ? layoutMarks(geo.ctx, geo.w, geo.X, geo.yAt) : [];
    if (typeof data.onMarks === "function") data.onMarks(items);
    if (grow || marks.length > prevMarks) {
      anim(250, p => draw(p, Math.min(1, p * 250 / 200)));
    }
    return { len: pts.length, marks: marks.length };
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  const SUB = "₀₁₂₃₄₅₆₇₈₉";
  function fmtP(v) {
    if (v == null || !isFinite(v)) return "—";
    if (v >= 1000) return v.toLocaleString("en-US", { maximumFractionDigits: 0 });
    if (v >= 1) return v.toFixed(v >= 100 ? 1 : 3);
    if (v >= 0.001) return v.toFixed(5).replace(/0+$/, "").replace(/\.$/, "");
    if (v <= 0) return v === 0 ? "0" : "-" + fmtP(-v);
    let z = Math.floor(-Math.log10(v)), n = Math.round(v * Math.pow(10, z + 4));
    if (n >= 10000) { z -= 1; n = Math.round(n / 10); }
    const digits = String(n).slice(0, 4).replace(/0+$/, "") || "0";
    return "0.0" + String(z).split("").map(d => SUB[+d]).join("") + digits;
  }
  function niceTicks(lo, hi, n) {
    const span = hi - lo, raw = span / n, mag = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / mag;
    const step = (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * mag, out = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-30; v += step) out.push(v);
    return out;
  }

  /* Coin candles. list = [{t (unix s), o, h, l, c, vol}] oldest first, real OHLCV only.
     Slot width is zoomable (pinch, wheel, or − / + / All). Right-aligned. Minutes with no trade
     are a thin grey dash at the previous close (no invented price). Drag sideways to scroll back. */
  function fillGaps(cs, step) {
    if (!step || cs.length < 2) return cs.map(c => Object.assign({}, c));
    const out = [];
    for (let i = 0; i < cs.length; i++) {
      if (i) { let t = cs[i - 1].t + step, k = 0;
        while (t < cs[i].t - step / 2 && k < 600) { const p = cs[i - 1].c; out.push({ t, o: p, h: p, l: p, c: p, vol: 0, gap: true }); t += step; k++; } }
      out.push(Object.assign({}, cs[i]));
    }
    return out;
  }
  function clampSlot(s) { return Math.max(SLOT_MIN, Math.min(SLOT_MAX, s)); }
  function stOf(canvas) {
    const st = canvas._st || (canvas._st = { off: 0, slot: SLOT_DEF });
    if (!(st.slot > 0)) st.slot = SLOT_DEF;
    st.slot = clampSlot(st.slot);
    return st;
  }
  function zoomAt(canvas, newSlot, midX) {
    const st = stOf(canvas);
    const info = canvas._info || {};
    const w = canvas.clientWidth || (canvas.parentNode && canvas.parentNode.clientWidth) || 0;
    const plotW = Math.max(1, w - 64);
    const slots = info.slots || 0;
    const old = st.slot;
    let slot = clampSlot(newSlot);
    const fitNew = Math.max(1, Math.floor(plotW / slot));
    if (slot < old && slots && slots <= fitNew && st.off <= 0 && slot < SLOT_DEF) {
      slot = Math.max(slot, Math.min(old, plotW / Math.max(1, slots)));
    }
    const x = midX == null ? plotW / 2 : midX;
    const idx = (slots - st.off) - (plotW - x) / old;
    st.slot = clampSlot(slot);
    if (slots) st.off = Math.max(0, Math.min(Math.max(0, slots - Math.floor(plotW / st.slot)), slots - (idx + (plotW - x) / st.slot)));
    if (canvas._draw) canvas._draw();
    return st;
  }
  function zoom(canvas, dir) {
    const st = stOf(canvas);
    const w = canvas.clientWidth || 0, plotW = Math.max(1, w - 64);
    const slots = (canvas._info && canvas._info.slots) || 0;
    if (dir === "reset") { st.slot = SLOT_DEF; st.off = 0; if (canvas._draw) canvas._draw(); return st; }
    if (dir === "fit") {
      if (slots > 0) st.slot = clampSlot(plotW / slots);
      st.off = 0;
      if (canvas._draw) canvas._draw();
      return st;
    }
    return zoomAt(canvas, st.slot * (dir === "out" ? 1 / 1.35 : 1.35), plotW / 2);
  }

  function candles(canvas, list, exitLine, opts) {
    opts = opts || {};
    const C = themeC();
    const H = 280;
    const { ctx, w, h } = setup(canvas, H);
    const real = (list || []).filter(c => c && c.o != null && c.h != null && c.l != null && c.c != null && c.h > 0);
    const st = stOf(canvas);
    canvas._draw = () => candles(canvas, list, exitLine, opts);
    canvas._opts = opts;
    const F = opts.fmt || fmtP, entryLine = opts.entryLine != null && isFinite(opts.entryLine) ? opts.entryLine : null;
    if (opts.emptyText || real.length < (opts.min || 3)) {
      ctx.fillStyle = C.sec; ctx.font = "15px " + FONT; ctx.textAlign = "center";
      ctx.fillText(opts.emptyText || (opts.loading ? "Loading chart…" : "Chart builds as trades come in"), w / 2, h / 2 - 10); ctx.textAlign = "left";
      canvas._last = null; canvas._chart = null; hideInspect(canvas); return null;
    }
    const all = fillGaps(real, opts.step);
    const slot = st.slot;
    const showVol = opts.volume !== false;
    const AX = 64, plotW = w - AX, top = 10, priceBot = Math.round(h * (showVol ? 0.70 : 0.86)), volTop = Math.round(h * 0.75), volBot = h - 22;
    const fit = Math.max(1, Math.floor(plotW / slot));
    st.off = Math.max(0, Math.min(st.off, Math.max(0, all.length - fit)));
    const end = all.length - Math.round(st.off), cs = all.slice(Math.max(0, end - fit), end);
    const n = cs.length, bw = Math.max(2, Math.round(slot * 0.7));
    const X = i => plotW - (n - i) * slot + slot / 2;
    canvas._info = { real: real.length, slots: all.length, step: opts.step || null, first: real[0].t, last: real[real.length - 1].t,
                     sig: real.slice(-5).map(c => c.c.toPrecision(5)).join(","), slot, fit };
    const vis = cs.filter(c => !c.gap);
    let lo = Math.min(...(vis.length ? vis : cs).map(c => c.l)), hi = Math.max(...(vis.length ? vis : cs).map(c => c.h));
    const extraLines = [];
    if (exitLine != null && isFinite(exitLine)) extraLines.push({ id: "risk", price: exitLine, label: "SL (risk)", color: C.orange, dash: true });
    if (entryLine != null && isFinite(entryLine)) extraLines.push({ id: "entry", price: entryLine, label: "Entry", color: C.cyan, drag: false });
    const lines = (opts.lines || []).filter(L => L && L.price != null && isFinite(L.price)).concat(
      opts.lines ? [] : extraLines
    );
    lines.forEach(L => { lo = Math.min(lo, L.price); hi = Math.max(hi, L.price); });
    if (exitLine != null && opts.lines) { /* included in opts.lines by the caller */ }
    if (!opts.lines) {
      if (exitLine != null && exitLine > lo * 0.5 && exitLine < hi * 1.5) { lo = Math.min(lo, exitLine); hi = Math.max(hi, exitLine); }
      if (entryLine != null && entryLine > lo * 0.5 && entryLine < hi * 1.5) { lo = Math.min(lo, entryLine); hi = Math.max(hi, entryLine); }
    }
    if (hi - lo <= hi * 1e-6) { hi *= 1.02; lo *= 0.98; }
    const pad = (hi - lo) * 0.08; lo -= pad; hi += pad;
    const Y = v => priceBot - (v - lo) / (hi - lo) * (priceBot - top);
    const Yinv = y => lo + (priceBot - y) / (priceBot - top) * (hi - lo);
    ctx.font = "11px " + FONT; ctx.textBaseline = "middle";
    niceTicks(lo, hi, 4).forEach(v => {
      const y = Math.round(Y(v)) + 0.5; if (y < top || y > priceBot) return;
      ctx.strokeStyle = C.sep; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(plotW, y); ctx.stroke();
      ctx.fillStyle = C.ter; ctx.fillText(F(v), plotW + 6, y);
    });
    const vmax = showVol ? Math.max(0, ...cs.map(c => c.gap ? 0 : (c.vol > 0 ? c.vol : 0))) : 0;
    cs.forEach((c, i) => {
      if (!showVol || c.gap || !(vmax > 0 && c.vol > 0)) return;
      const vh = Math.max(1, (volBot - volTop) * c.vol / vmax), x = X(i);
      ctx.fillStyle = rgba(c.c >= c.o ? C.up : C.down, 0.40); ctx.fillRect(Math.round(x - bw / 2), volBot - vh, bw, vh);
    });
    cs.forEach((c, i) => {
      const x = X(i);
      if (c.gap) { ctx.fillStyle = C.ter; ctx.fillRect(Math.round(x - bw / 2), Math.round(Y(c.c)), bw, 1); return; }
      const up = c.c >= c.o, col = up ? C.up : C.down, xs = Math.round(x) + 0.5;
      ctx.strokeStyle = col; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(xs, Y(c.h)); ctx.lineTo(xs, Y(c.l)); ctx.stroke();
      const y1 = Y(Math.max(c.o, c.c)), y2 = Y(Math.min(c.o, c.c));
      ctx.fillStyle = col; ctx.fillRect(Math.round(x - bw / 2), y1, bw, Math.max(1, y2 - y1));
    });
    const step = opts.step || 60, every = Math.max(1, Math.ceil(64 / slot)), lblStep = step * every;
    const nice = [60, 120, 300, 600, 900, 1800, 3600, 7200, 14400].find(x => x >= lblStep) || lblStep;
    ctx.fillStyle = C.ter; ctx.textBaseline = "alphabetic"; ctx.textAlign = "center";
    const hm = t => new Date(t * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
    let lastX = -1e9;
    cs.forEach((c, i) => { const x = X(i); if (c.t % nice === 0 && x - lastX >= 56 && x > 16 && x < plotW - 16) { ctx.fillText(hm(c.t), x, h - 6); lastX = x; } });
    if (lastX < 0 && n) ctx.fillText(hm(cs[0].t), Math.max(18, X(0)), h - 6);
    ctx.textAlign = "left";
    if (st.off > 0) { ctx.fillStyle = C.ter; ctx.font = "11px " + FONT; ctx.fillText("‹ history", 4, top + 4); }
    const last = cs[n - 1], lc = last.c >= last.o ? C.up : C.down;
    const drawTag = v => {
      const ly = Math.round(Y(v)) + 0.5;
      ctx.setLineDash([3, 3]); ctx.strokeStyle = lc; ctx.globalAlpha = 0.7; ctx.beginPath(); ctx.moveTo(0, ly); ctx.lineTo(plotW, ly); ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha = 1;
      ctx.fillStyle = lc; roundRect(ctx, plotW + 2, ly - 9, AX - 4, 18, 4); ctx.fill();
      ctx.fillStyle = isLight(lc) ? "#111" : "#fff"; ctx.font = "600 11px " + FONT; ctx.textBaseline = "middle"; ctx.fillText(F(v), plotW + 6, ly); ctx.textBaseline = "alphabetic";
    };
    // Horizontal level lines (Entry / TP / SL / ATH). Draggable ones get a handle on the right.
    const drawn = [];
    lines.forEach(L => {
      const y = Y(L.price);
      if (y < top - 2 || y > priceBot + 2) return;
      const col = L.color || C.orange;
      ctx.save();
      ctx.strokeStyle = col; ctx.lineWidth = L.drag || L.source === "you" ? 1.8 : 1.4;
      ctx.globalAlpha = L.source === "risk" ? 0.85 : 0.95;
      if (L.dash !== false && L.source !== "you") ctx.setLineDash(L.dash === false ? [] : [6, 5]);
      if (L.source === "you") ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(0, Math.round(y) + 0.5); ctx.lineTo(plotW, Math.round(y) + 0.5); ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha = 1;
      ctx.font = "600 11px " + FONT; ctx.fillStyle = col; ctx.textAlign = "left"; ctx.textBaseline = "bottom";
      const lab = L.label || "";
      ctx.fillText(lab, 4, y - 3);
      if (L.drag) {
        const hx = plotW - 10, hy = y;
        ctx.beginPath(); ctx.arc(hx, hy, 7, 0, Math.PI * 2);
        ctx.fillStyle = col; ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = C.bg; ctx.stroke();
        drawn.push({ id: L.id, price: L.price, y, hx, hy, r: 16, color: col, kind: L.kind || L.id });
      }
      ctx.restore();
    });
    const prevC = canvas._lastC; canvas._lastC = last.c;
    if (prevC != null && prevC !== last.c && !RM() && !st.off && !st.inspect) {
      const snap = ctx.getImageData(0, 0, canvas.width, canvas.height), dpr = window.devicePixelRatio || 1;
      anim(450, p => { ctx.putImageData(snap, 0, 0); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); drawTag(prevC + (last.c - prevC) * p); });
    } else drawTag(last.c);
    canvas._chart = { Y, Yinv, lo, hi, top, priceBot, plotW, AX, h, cs, X, n, bw, lines, handles: drawn, F };
    bindChart(canvas);
    if (st.inspect && st.inspectI != null) showInspect(canvas, st.inspectI);
    const lx = X(n - 1);
    canvas._last = st.off ? null : { x: lx, y: Y(Math.max(last.o, last.c)), h: Math.max(4, Y(Math.min(last.o, last.c)) - Y(Math.max(last.o, last.c))), w: bw, up: last.c >= last.o };
    return canvas._last;
  }

  function overlay(canvas, cls) {
    const wrap = canvas.parentNode;
    if (!wrap) return null;
    let el = wrap.querySelector("." + cls);
    if (!el) {
      el = document.createElement("div");
      el.className = cls;
      el.hidden = true;
      wrap.appendChild(el);
    }
    return el;
  }
  function hideInspect(canvas) {
    const st = canvas._st;
    if (st) { st.inspect = false; st.inspectI = null; }
    canvas.classList.remove("inspecting");
    ["chx-v", "chx-h", "chtip"].forEach(c => { const el = canvas.parentNode && canvas.parentNode.querySelector("." + c); if (el) el.hidden = true; });
  }
  function candleAt(chart, x) {
    if (!chart || !chart.cs || !chart.cs.length) return null;
    let best = 0, bd = 1e9;
    for (let i = 0; i < chart.cs.length; i++) {
      const d = Math.abs(chart.X(i) - x);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }
  function showInspect(canvas, i) {
    const ch = canvas._chart, opts = canvas._opts || {}, st = stOf(canvas);
    if (!ch || !ch.cs[i] || ch.cs[i].gap) return;
    st.inspect = true; st.inspectI = i; canvas.classList.add("inspecting");
    const c = ch.cs[i], x = ch.X(i), y = ch.Y(c.c);
    const v = overlay(canvas, "chx-v"), h = overlay(canvas, "chx-h"), tip = overlay(canvas, "chtip");
    if (!v || !h || !tip) return;
    v.hidden = false; h.hidden = false; tip.hidden = false;
    v.style.left = Math.round(x) + "px";
    v.style.top = ch.top + "px";
    v.style.height = Math.max(0, ch.priceBot - ch.top) + "px";
    h.style.left = "0px";
    h.style.top = Math.round(y) + "px";
    h.style.width = ch.plotW + "px";
    const F = ch.F || fmtP;
    const when = new Date(c.t * 1000);
    const time = when.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
    const px = c.px != null && isFinite(c.px) ? c.px : c.c;
    const mc = c.mc != null && isFinite(c.mc) ? c.mc : null;
    let html;
    if (typeof opts.tip === "function") html = opts.tip(c, { time, price: px, mc, F });
    else {
      html = `<div class="t">${time}</div><div><span class="k">Price</span> ${F(px)}</div>` +
        (mc != null ? `<div><span class="k">MC</span> ${typeof opts.mcFmt === "function" ? opts.mcFmt(mc) : F(mc)}</div>` : "");
    }
    tip.innerHTML = html;
    const wrap = canvas.parentNode.getBoundingClientRect();
    // Position the tip so it stays inside the wrap and off the finger.
    tip.style.left = "0px"; tip.style.top = "0px";
    const tw = tip.offsetWidth || 140, th = tip.offsetHeight || 60;
    let left = x + 12, top = y - th - 10;
    if (left + tw > wrap.width - 8) left = x - tw - 12;
    if (left < 4) left = 4;
    if (top < 4) top = y + 12;
    tip.style.left = Math.round(left) + "px";
    tip.style.top = Math.round(top) + "px";
  }

  function bindChart(canvas) {
    if (canvas._drag) return;
    canvas._drag = true;
    canvas.style.touchAction = "none";
    canvas.style.webkitUserSelect = "none";
    canvas.style.userSelect = "none";
    const pts = new Map();
    let x0 = null, y0 = null, o0 = 0, pinching = false, pSlot = SLOT_DEF, pDist = 0, pMid = 0;
    let holdT = null, lineDrag = null, moved = false;
    const HOLD_MS = 380;
    const plotXY = ev => {
      const r = canvas.getBoundingClientRect();
      return { x: ev.clientX - r.left, y: ev.clientY - r.top };
    };
    const hitHandle = (x, y) => {
      const ch = canvas._chart;
      if (!ch || !ch.handles) return null;
      for (let i = ch.handles.length - 1; i >= 0; i--) {
        const h = ch.handles[i];
        if (Math.hypot(x - h.hx, y - h.hy) <= h.r) return h;
      }
      return null;
    };
    const clearHold = () => { if (holdT) { clearTimeout(holdT); holdT = null; } canvas.classList.remove("holding"); };
    canvas.addEventListener("contextmenu", e => { e.preventDefault(); });
    canvas.addEventListener("pointerdown", e => {
      canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
      const { x, y } = plotXY(e);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) {
        pinching = true; x0 = null; lineDrag = null; clearHold(); hideInspect(canvas);
        const [a, b] = [...pts.values()];
        pDist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        pSlot = stOf(canvas).slot;
        const r = canvas.getBoundingClientRect();
        pMid = (a.x + b.x) / 2 - r.left;
        return;
      }
      const handle = hitHandle(x, y);
      if (handle) {
        lineDrag = handle; moved = false; clearHold(); hideInspect(canvas);
        canvas.classList.add("linedrag");
        return;
      }
      pinching = false; x0 = e.clientX; y0 = e.clientY; o0 = stOf(canvas).off; moved = false;
      clearHold();
      canvas.classList.add("holding");
      holdT = setTimeout(() => {
        holdT = null;
        if (lineDrag || pinching || pts.size !== 1) return;
        const ch = canvas._chart;
        if (!ch) return;
        const i = candleAt(ch, plotXY(e).x);
        if (i == null) return;
        showInspect(canvas, i);
        x0 = null; // freeze pan once inspect starts
        try { navigator.vibrate && navigator.vibrate(10); } catch (err) {}
      }, HOLD_MS);
    });
    canvas.addEventListener("pointermove", e => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinching && pts.size >= 2) {
        const [a, b] = [...pts.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        const r = canvas.getBoundingClientRect();
        zoomAt(canvas, pSlot * (dist / pDist), (a.x + b.x) / 2 - r.left);
        return;
      }
      const { x, y } = plotXY(e);
      if (lineDrag) {
        const ch = canvas._chart, opts = canvas._opts || {};
        if (!ch) return;
        const price = Math.max(ch.lo, Math.min(ch.hi, ch.Yinv(y)));
        lineDrag.price = price;
        if (opts.lines) {
          const L = opts.lines.find(q => q.id === lineDrag.id);
          if (L) L.price = price;
        }
        if (typeof opts.onDrag === "function") opts.onDrag(lineDrag.id, price, lineDrag.kind);
        canvas._draw && canvas._draw();
        return;
      }
      const st = stOf(canvas);
      if (st.inspect) {
        const ch = canvas._chart;
        const i = candleAt(ch, x);
        if (i != null) showInspect(canvas, i);
        return;
      }
      if (x0 == null || pinching) return;
      if (!moved && (Math.abs(e.clientX - x0) > 10 || Math.abs(e.clientY - y0) > 10)) {
        moved = true; clearHold();
      }
      if (!moved) return;
      const slot = stOf(canvas).slot;
      canvas._st.off = Math.max(0, o0 + (e.clientX - x0) / slot);
      canvas._draw && canvas._draw();
    });
    const end = e => {
      pts.delete(e.pointerId);
      if (pts.size < 2) pinching = false;
      if (lineDrag && pts.size === 0) {
        const opts = canvas._opts || {}, L = lineDrag;
        canvas.classList.remove("linedrag");
        lineDrag = null;
        if (typeof opts.onDragEnd === "function") opts.onDragEnd(L.id, L.price, L.kind);
      }
      if (pts.size === 0) {
        x0 = null; y0 = null;
        clearHold();
        if (stOf(canvas).inspect) hideInspect(canvas);
      }
    };
    ["pointerup", "pointercancel", "pointerleave"].forEach(ev => canvas.addEventListener(ev, end));
    canvas.addEventListener("dblclick", () => { zoom(canvas, "reset"); });
    canvas.addEventListener("wheel", e => {
      e.preventDefault();
      zoomAt(canvas, stOf(canvas).slot * (e.deltaY > 0 ? 1 / 1.12 : 1.12), plotXY(e).x);
    }, { passive: false });
  }

  function ring(canvas, score, threshold) {
    const C = themeC();
    const S = 96;
    canvas.style.width = S + "px";
    const { ctx } = setup(canvas, S);
    const r = S / 2 - 7;
    ctx.lineWidth = 9; ctx.lineCap = "round";
    ctx.strokeStyle = C.card2; ctx.beginPath(); ctx.arc(S / 2, S / 2, r, 0, Math.PI * 2); ctx.stroke();
    if (score != null) {
      ctx.strokeStyle = score >= threshold ? C.green : C.yellow;
      ctx.beginPath(); ctx.arc(S / 2, S / 2, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, Math.min(100, score)) / 100);
      ctx.stroke();
    }
    ctx.fillStyle = C.text; ctx.font = '600 26px -apple-system,"SF Pro Display",sans-serif';
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(score == null ? "–" : String(Math.round(score)), S / 2, S / 2 + 1); ctx.textAlign = "left";
  }

  window.DeskChart = { line, candles, ring, fmtP, zoom, SLOT_DEF };
})();
