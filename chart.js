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

  /* Coin candles: 1-minute OHLC from db.prices + volume bars (change of volume.m5). */
  function candles(canvas, list, exitLine) {
    const H = 260;
    const { ctx, w, h } = setup(canvas, H);
    const cs = (list || []).filter(c => c.o != null && c.h != null && c.l != null && c.c != null);
    const priceBot = h * 0.74, top = 12, volTop = h * 0.80, volBot = h - 4;
    if (!cs.length) { ctx.fillStyle = C.sec; ctx.font = "15px " + FONT; ctx.textAlign = "center";
      ctx.fillText("No candles yet", w / 2, h / 2); ctx.textAlign = "left"; return; }
    let lo = Math.min(...cs.map(c => c.l)), hi = Math.max(...cs.map(c => c.h));
    if (exitLine != null) { lo = Math.min(lo, exitLine); hi = Math.max(hi, exitLine); }
    if (hi - lo < 1e-15) { hi *= 1.01; lo *= 0.99; }
    const pad = (hi - lo) * 0.08; lo -= pad; hi += pad;
    const n = Math.max(cs.length, 30), cw = w / n, bw = Math.max(1.5, cw * 0.6);
    const Y = v => priceBot - (v - lo) / (hi - lo) * (priceBot - top);
    const off = w - cs.length * cw;
    const vols = cs.map(c => (c.vol != null && c.vol > 0) ? c.vol : 0);
    const vmax = Math.max(...vols, 1e-9);
    cs.forEach((c, i) => {
      const x = off + i * cw + cw / 2, up = c.c >= c.o, col = up ? C.green : C.red;
      ctx.strokeStyle = col; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, Y(c.h)); ctx.lineTo(x, Y(c.l)); ctx.stroke();
      const y1 = Y(Math.max(c.o, c.c)), y2 = Y(Math.min(c.o, c.c));
      ctx.fillStyle = col; ctx.fillRect(x - bw / 2, y1, bw, Math.max(1, y2 - y1));
      if (vols[i] > 0) { const vh = (volBot - volTop) * vols[i] / vmax;
        ctx.fillStyle = up ? "rgba(0,211,90,0.45)" : "rgba(255,69,58,0.45)"; ctx.fillRect(x - bw / 2, volBot - vh, bw, vh); }
    });
    if (exitLine != null) {
      const y = Y(exitLine);
      ctx.setLineDash([6, 5]); ctx.strokeStyle = C.orange; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); ctx.setLineDash([]);
      ctx.font = "600 12px " + FONT; ctx.fillStyle = C.orange; ctx.fillText("Risk trailing stop", 4, y - 7);
    }
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

  window.DeskChart = { line, candles, ring };
})();
