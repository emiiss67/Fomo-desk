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

  /* Home line: points [[iso, value]], marks [{ts, text, color}], start = night start value. */
  function line(canvas, data, prev) {
    const C = themeC();
    const pts = (data.points || []).map(p => [Date.parse(p[0]), p[1]]).filter(p => p[1] !== null);
    const marks = data.marks || [];
    const H = 220;
    const prevLen = prev && prev.len || 0, prevMarks = prev && prev.marks || 0;
    const grow = pts.length > prevLen && prevLen > 0;
    function draw(p, markAlpha) {
      const { ctx, w, h } = setup(canvas, H);
      const top = 64, bot = h - 12;
      if (pts.length === 0) {
        ctx.setLineDash([3, 5]); ctx.strokeStyle = C.ter; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, (top + bot) / 2); ctx.lineTo(w, (top + bot) / 2); ctx.stroke(); ctx.setLineDash([]);
        return;
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
      ctx.font = "600 12px " + FONT; ctx.textBaseline = "middle";
      const rows = [];
      const yAt = x => { let best = xy[0]; for (const q of xy) if (Math.abs(q[0] - x) < Math.abs(best[0] - x)) best = q; return best[1]; };
      marks.map(m => ({ ...m, x: X(Date.parse(m.ts)) })).filter(m => m.x >= -1 && m.x <= w + 1)
        .sort((a, b) => a.x - b.x).forEach((m, i) => {
          const tw = ctx.measureText(m.text).width + 14;
          let x = Math.min(Math.max(m.x - tw / 2, 0), w - tw);
          let r = 0;
          while (rows[r] && rows[r].some(s => x < s[1] + 4 && x + tw > s[0] - 4)) r++;
          (rows[r] = rows[r] || []).push([x, x + tw]);
          let y = Math.min(yAt(m.x) - 18 - r * 22, bot - 10);
          y = Math.max(y, 10);
          const col = { blue: C.blue, green: C.green, red: C.red }[m.color] || C.blue;
          ctx.globalAlpha = i >= prevMarks ? markAlpha : 1;
          ctx.fillStyle = rgba(col, 0.2); roundRect(ctx, x, y - 10, tw, 20, 10); ctx.fill();
          ctx.fillStyle = col; ctx.fillText(m.text, x + 7, y + 0.5);
          ctx.beginPath(); ctx.arc(m.x, yAt(m.x), 3, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 1;
        });
    }
    if (grow || marks.length > prevMarks) {
      anim(250, p => draw(p, Math.min(1, p * 250 / 200)));
    } else draw(1, 1);
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
    const F = opts.fmt || fmtP, entryLine = opts.entryLine != null && isFinite(opts.entryLine) ? opts.entryLine : null;
    if (opts.emptyText || real.length < (opts.min || 3)) {
      ctx.fillStyle = C.sec; ctx.font = "15px " + FONT; ctx.textAlign = "center";
      ctx.fillText(opts.emptyText || (opts.loading ? "Loading chart…" : "Chart builds as trades come in"), w / 2, h / 2 - 10); ctx.textAlign = "left";
      canvas._last = null; return null;
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
    if (exitLine != null && exitLine > lo * 0.5 && exitLine < hi * 1.5) { lo = Math.min(lo, exitLine); hi = Math.max(hi, exitLine); }
    if (entryLine != null && entryLine > lo * 0.5 && entryLine < hi * 1.5) { lo = Math.min(lo, entryLine); hi = Math.max(hi, entryLine); }
    if (hi - lo <= hi * 1e-6) { hi *= 1.02; lo *= 0.98; }
    const pad = (hi - lo) * 0.06; lo -= pad; hi += pad;
    const Y = v => priceBot - (v - lo) / (hi - lo) * (priceBot - top);
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
    if (entryLine != null) {
      const y = Y(entryLine);
      if (y >= top && y <= priceBot) {
        ctx.strokeStyle = C.cyan; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.9;
        ctx.beginPath(); ctx.moveTo(0, Math.round(y) + 0.5); ctx.lineTo(plotW, Math.round(y) + 0.5); ctx.stroke(); ctx.globalAlpha = 1;
        ctx.font = "600 12px " + FONT; ctx.fillStyle = C.cyan; ctx.textAlign = "right";
        ctx.fillText("Entry " + F(entryLine), plotW - 4, y - 7); ctx.textAlign = "left";
      }
    }
    if (exitLine != null) {
      const y = Y(exitLine);
      if (y >= top && y <= priceBot) {
        ctx.setLineDash([6, 5]); ctx.strokeStyle = C.orange; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(plotW, y); ctx.stroke(); ctx.setLineDash([]);
        ctx.font = "600 12px " + FONT; ctx.fillStyle = C.orange; ctx.fillText("Risk trailing stop", 4, y - 7);
      }
    }
    const prevC = canvas._lastC; canvas._lastC = last.c;
    if (prevC != null && prevC !== last.c && !RM() && !st.off) {
      const snap = ctx.getImageData(0, 0, canvas.width, canvas.height), dpr = window.devicePixelRatio || 1;
      anim(450, p => { ctx.putImageData(snap, 0, 0); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); drawTag(prevC + (last.c - prevC) * p); });
    } else drawTag(last.c);
    bindChart(canvas);
    const lx = X(n - 1);
    canvas._last = st.off ? null : { x: lx, y: Y(Math.max(last.o, last.c)), h: Math.max(4, Y(Math.min(last.o, last.c)) - Y(Math.max(last.o, last.c))), w: bw, up: last.c >= last.o };
    return canvas._last;
  }

  function bindChart(canvas) {
    if (canvas._drag) return;
    canvas._drag = true;
    canvas.style.touchAction = "none";
    const pts = new Map();
    let x0 = null, o0 = 0, pinching = false, pSlot = SLOT_DEF, pDist = 0, pMid = 0;
    const plotX = ev => {
      const r = canvas.getBoundingClientRect();
      return ev.clientX - r.left;
    };
    canvas.addEventListener("pointerdown", e => {
      canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) {
        pinching = true; x0 = null;
        const [a, b] = [...pts.values()];
        pDist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        pSlot = stOf(canvas).slot;
        const r = canvas.getBoundingClientRect();
        pMid = (a.x + b.x) / 2 - r.left;
      } else if (pts.size === 1) {
        pinching = false; x0 = e.clientX; o0 = stOf(canvas).off;
      }
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
      if (x0 == null || pinching) return;
      const slot = stOf(canvas).slot;
      canvas._st.off = Math.max(0, o0 + (e.clientX - x0) / slot);
      canvas._draw && canvas._draw();
    });
    const end = e => {
      pts.delete(e.pointerId);
      if (pts.size < 2) pinching = false;
      if (pts.size === 0) x0 = null;
    };
    ["pointerup", "pointercancel", "pointerleave"].forEach(ev => canvas.addEventListener(ev, end));
    canvas.addEventListener("dblclick", () => { zoom(canvas, "reset"); });
    canvas.addEventListener("wheel", e => {
      e.preventDefault();
      zoomAt(canvas, stOf(canvas).slot * (e.deltaY > 0 ? 1 / 1.12 : 1.12), plotX(e));
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
