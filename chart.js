/* Hand-drawn canvas charts, devicePixelRatio aware. No library. */
(function () {
  const RM = () => window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const C = { green: "#00d35a", red: "#ff453a", orange: "#ff9f0a", blue: "#0a84ff", cyan: "#64d2ff",
              yellow: "#ffd60a", sec: "rgba(235,235,245,0.6)", ter: "rgba(235,235,245,0.3)", sep: "rgba(84,84,88,0.55)",
              card2: "#2c2c2e" };
  const FONT = '-apple-system,"SF Pro Text",BlinkMacSystemFont,"Helvetica Neue",Arial,sans-serif';

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
    const pts = (data.points || []).map(p => [Date.parse(p[0]), p[1]]).filter(p => p[1] !== null);
    const marks = data.marks || [];
    const H = 220;
    const prevLen = prev && prev.len || 0, prevMarks = prev && prev.marks || 0;
    const grow = pts.length > prevLen && prevLen > 0;
    function draw(p, markAlpha) {
      const { ctx, w, h } = setup(canvas, H);
      const top = 64, bot = h - 12;
      if (pts.length === 0) {
        if (data.start != null || true) {
          ctx.setLineDash([3, 5]); ctx.strokeStyle = C.ter; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(0, (top + bot) / 2); ctx.lineTo(w, (top + bot) / 2); ctx.stroke(); ctx.setLineDash([]);
        }
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
      if (grow && p < 1 && xy.length > 1) {          // new point slides in over 250ms
        const a = xy[xy.length - 2], b = xy[xy.length - 1];
        xy[xy.length - 1] = [a[0] + (b[0] - a[0]) * p, a[1] + (b[1] - a[1]) * p];
      }
      if (data.start != null) {
        ctx.setLineDash([3, 5]); ctx.strokeStyle = C.ter; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, Y(data.start)); ctx.lineTo(w, Y(data.start)); ctx.stroke(); ctx.setLineDash([]);
      }
      const g = ctx.createLinearGradient(0, top, 0, bot);
      g.addColorStop(0, "rgba(0,211,90,0.28)"); g.addColorStop(1, "rgba(0,211,90,0)");
      ctx.beginPath(); ctx.moveTo(xy[0][0], bot);
      xy.forEach(q => ctx.lineTo(q[0], q[1])); ctx.lineTo(xy[xy.length - 1][0], bot); ctx.closePath();
      ctx.fillStyle = g; ctx.fill();
      ctx.beginPath(); xy.forEach((q, i) => i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]));
      ctx.strokeStyle = C.green; ctx.lineWidth = 2; ctx.lineJoin = "round"; ctx.stroke();
      const last = xy[xy.length - 1];
      ctx.beginPath(); ctx.arc(last[0], last[1], 4, 0, Math.PI * 2); ctx.fillStyle = C.green; ctx.fill();
      // marks above the line, never overlapping: a later mark moves up a row
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
          y = Math.max(y, 10 + r * 0);
          const col = { blue: C.blue, green: C.green, red: C.red }[m.color] || C.blue;
          ctx.globalAlpha = i >= prevMarks ? markAlpha : 1;
          ctx.fillStyle = col + "33"; roundRect(ctx, x, y - 10, tw, 20, 10); ctx.fill();
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

  /* Small prices: 0.00009144 -> "0.0₄9144" (subscript = number of zeros after "0."), else 4 significant digits. */
  const SUB = "₀₁₂₃₄₅₆₇₈₉";
  function fmtP(v) {
    if (v == null || !isFinite(v)) return "—";
    if (v >= 1000) return v.toLocaleString("en-US", { maximumFractionDigits: 0 });
    if (v >= 1) return v.toFixed(v >= 100 ? 1 : 3);
    if (v >= 0.001) return v.toFixed(5).replace(/0+$/, "").replace(/\.$/, "");
    const z = Math.floor(-Math.log10(v));                           // zeros after "0."
    const digits = Math.round(v * Math.pow(10, z + 4)).toString().slice(0, 4).replace(/0+$/, "") || "0";
    return "0.0" + String(z).split("").map(d => SUB[+d]).join("") + digits;
  }
  function niceTicks(lo, hi, n) {
    const span = hi - lo, raw = span / n, mag = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / mag;
    const step = (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * mag, out = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-30; v += step) out.push(v);
    return out;
  }

  /* Coin candles (DexScreener style). list = [{t (unix s), o, h, l, c, vol}] oldest first, real OHLCV only.
     Fixed slot width (9px: ~6px body + gaps), right-aligned: a new coin is a compact cluster on the right, an older one fills
     the width. Minutes with no trade between real candles are drawn as a thin grey dash at the previous close ("no trade",
     not a candle; no price move invented). Drag sideways to scroll back. opts: {step (s), loading}. */
  const SLOT = 9;
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
  function candles(canvas, list, exitLine, opts) {
    opts = opts || {};
    const H = 280;
    const { ctx, w, h } = setup(canvas, H);
    const real = (list || []).filter(c => c && c.o != null && c.h != null && c.l != null && c.c != null && c.h > 0);
    const st = canvas._st || (canvas._st = { off: 0 });
    canvas._draw = () => candles(canvas, list, exitLine, opts);
    if (real.length < 3) {
      ctx.fillStyle = C.sec; ctx.font = "15px " + FONT; ctx.textAlign = "center";
      ctx.fillText(opts.loading ? "Loading chart…" : "Chart builds as trades come in", w / 2, h / 2 - 10); ctx.textAlign = "left";
      canvas._last = null; return null;
    }
    const all = fillGaps(real, opts.step);
    const AX = 64, plotW = w - AX, top = 10, priceBot = Math.round(h * 0.70), volTop = Math.round(h * 0.75), volBot = h - 22;
    const fit = Math.floor(plotW / SLOT);
    st.off = Math.max(0, Math.min(st.off, Math.max(0, all.length - fit)));
    const end = all.length - Math.round(st.off), cs = all.slice(Math.max(0, end - fit), end);
    const n = cs.length, bw = Math.max(2, Math.round(SLOT * 0.7));
    const X = i => plotW - (n - i) * SLOT + SLOT / 2;                     // right-aligned
    const vis = cs.filter(c => !c.gap);
    let lo = Math.min(...(vis.length ? vis : cs).map(c => c.l)), hi = Math.max(...(vis.length ? vis : cs).map(c => c.h));
    if (exitLine != null && exitLine > lo * 0.5 && exitLine < hi * 1.5) { lo = Math.min(lo, exitLine); hi = Math.max(hi, exitLine); }
    if (hi - lo <= hi * 1e-6) { hi *= 1.02; lo *= 0.98; }
    const pad = (hi - lo) * 0.06; lo -= pad; hi += pad;
    const Y = v => priceBot - (v - lo) / (hi - lo) * (priceBot - top);
    ctx.font = "11px " + FONT; ctx.textBaseline = "middle";
    niceTicks(lo, hi, 4).forEach(v => {
      const y = Math.round(Y(v)) + 0.5; if (y < top || y > priceBot) return;
      ctx.strokeStyle = "rgba(84,84,88,0.35)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(plotW, y); ctx.stroke();
      ctx.fillStyle = C.ter; ctx.fillText(fmtP(v), plotW + 6, y);
    });
    const vmax = Math.max(0, ...cs.map(c => c.gap ? 0 : (c.vol > 0 ? c.vol : 0)));
    cs.forEach((c, i) => {
      if (c.gap || !(vmax > 0 && c.vol > 0)) return;
      const vh = Math.max(1, (volBot - volTop) * c.vol / vmax), x = X(i);
      ctx.fillStyle = c.c >= c.o ? "rgba(0,211,90,0.40)" : "rgba(255,69,58,0.40)"; ctx.fillRect(Math.round(x - bw / 2), volBot - vh, bw, vh);
    });
    cs.forEach((c, i) => {
      const x = X(i);
      if (c.gap) { ctx.fillStyle = "rgba(235,235,245,0.22)"; ctx.fillRect(Math.round(x - bw / 2), Math.round(Y(c.c)), bw, 1); return; }
      const up = c.c >= c.o, col = up ? C.green : C.red, xs = Math.round(x) + 0.5;
      ctx.strokeStyle = col; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(xs, Y(c.h)); ctx.lineTo(xs, Y(c.l)); ctx.stroke();
      const y1 = Y(Math.max(c.o, c.c)), y2 = Y(Math.min(c.o, c.c));
      ctx.fillStyle = col; ctx.fillRect(Math.round(x - bw / 2), y1, bw, Math.max(1, y2 - y1));
    });
    // sparse time labels on round times, >= 64px apart
    const step = opts.step || 60, every = Math.max(1, Math.ceil(64 / SLOT)), lblStep = step * every;
    const nice = [60, 120, 300, 600, 900, 1800, 3600, 7200, 14400].find(x => x >= lblStep) || lblStep;
    ctx.fillStyle = C.ter; ctx.textBaseline = "alphabetic"; ctx.textAlign = "center";
    const hm = t => new Date(t * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
    let lastX = -1e9;
    cs.forEach((c, i) => { const x = X(i); if (c.t % nice === 0 && x - lastX >= 56 && x > 16 && x < plotW - 16) { ctx.fillText(hm(c.t), x, h - 6); lastX = x; } });
    if (lastX < 0 && n) ctx.fillText(hm(cs[0].t), Math.max(18, X(0)), h - 6);
    ctx.textAlign = "left";
    if (st.off > 0) { ctx.fillStyle = C.ter; ctx.font = "11px " + FONT; ctx.fillText("‹ history", 4, top + 4); }
    // last price line + tag (animates from the previous close on update)
    const last = cs[n - 1], lc = last.c >= last.o ? C.green : C.red;
    const drawTag = v => {
      const ly = Math.round(Y(v)) + 0.5;
      ctx.setLineDash([3, 3]); ctx.strokeStyle = lc; ctx.globalAlpha = 0.7; ctx.beginPath(); ctx.moveTo(0, ly); ctx.lineTo(plotW, ly); ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha = 1;
      ctx.fillStyle = lc; roundRect(ctx, plotW + 2, ly - 9, AX - 4, 18, 4); ctx.fill();
      ctx.fillStyle = "#000"; ctx.font = "600 11px " + FONT; ctx.textBaseline = "middle"; ctx.fillText(fmtP(v), plotW + 6, ly); ctx.textBaseline = "alphabetic";
    };
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
    // drag to scroll history (pointer events, once per canvas)
    if (!canvas._drag) { canvas._drag = true; canvas.style.touchAction = "pan-y";
      let x0 = null, o0 = 0;
      canvas.addEventListener("pointerdown", e => { x0 = e.clientX; o0 = canvas._st.off; });
      canvas.addEventListener("pointermove", e => { if (x0 == null) return; canvas._st.off = Math.max(0, o0 + (e.clientX - x0) / SLOT); canvas._draw(); });
      ["pointerup", "pointercancel", "pointerleave"].forEach(ev => canvas.addEventListener(ev, () => { x0 = null; }));
      canvas.addEventListener("dblclick", () => { canvas._st.off = 0; canvas._draw(); }); }
    // where the live candle is, so the page can make it breathe (CSS, GPU)
    const lx = X(n - 1);
    canvas._last = st.off ? null : { x: lx, y: Y(Math.max(last.o, last.c)), h: Math.max(4, Y(Math.min(last.o, last.c)) - Y(Math.max(last.o, last.c))), w: bw, up: last.c >= last.o };
    return canvas._last;
  }

  /* Score ring 0-100, green from the threshold. */
  function ring(canvas, score, threshold) {
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
    ctx.fillStyle = "#fff"; ctx.font = '600 26px -apple-system,"SF Pro Display",sans-serif';
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(score == null ? "–" : String(Math.round(score)), S / 2, S / 2 + 1); ctx.textAlign = "left";
  }

  window.DeskChart = { line, candles, ring, fmtP };
})();
