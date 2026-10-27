/* =====================================================================
   AI: minh họa "Bias và variance" (id: bias-variance, trang 1-cnn.html)
   Hàm thật f(x) = sin(2,6x) + 0,4·cos(5,5x) trên [−1, 1]; tập huấn luyện n điểm có nhiễu σ.
   Mô hình: đa thức bậc d (khớp bình phương tối thiểu trên cơ sở Legendre, thêm ridge rất nhỏ cho ổn định).
   "Lấy 40 tập khác" vẽ 40 mô hình học từ 40 tập huấn luyện khác nhau: độ tản ra là variance,
   khoảng cách từ đường trung bình tới hàm thật là bias.
   Khung dưới: trung bình trên 40 tập của lỗi huấn luyện, lỗi kiểm tra, bias², variance theo bậc d.
   Chạy độc lập: lib/demos/run.html?demo=bias-variance
   ===================================================================== */
(() => {
const { COLORS: C, watchCanvas, setTxt, num, range, rng } = TFG;
const VIOLET = '#8f63c9', DMAX = 12, K = 40, NG = 121;
const f = x => Math.sin(2.6 * x) + 0.4 * Math.cos(5.5 * x);
const GX = Array.from({ length: NG }, (_, i) => -1 + 2 * i / (NG - 1));
const FG = GX.map(f);

function legendre(x, d) { const p = [1]; if (d >= 1) p.push(x); for (let k = 1; k < d; k++) p.push(((2 * k + 1) * x * p[k] - k * p[k - 1]) / (k + 1)); return p; }
function solve(A, b) {   // khử Gauss có chọn trụ
  const n = b.length; A = A.map(r => r.slice()); b = b.slice();
  for (let i = 0; i < n; i++) {
    let m = i; for (let j = i + 1; j < n; j++) if (Math.abs(A[j][i]) > Math.abs(A[m][i])) m = j;
    [A[i], A[m]] = [A[m], A[i]]; [b[i], b[m]] = [b[m], b[i]];
    for (let j = i + 1; j < n; j++) { const c = A[j][i] / A[i][i]; for (let k = i; k < n; k++) A[j][k] -= c * A[i][k]; b[j] -= c * b[i]; }
  }
  const x = new Array(n); for (let i = n - 1; i >= 0; i--) { let s = b[i]; for (let k = i + 1; k < n; k++) s -= A[i][k] * x[k]; x[i] = s / A[i][i]; }
  return x;
}
function fit(xs, ys, d) {
  const m = d + 1, A = Array.from({ length: m }, () => new Array(m).fill(0)), b = new Array(m).fill(0);
  xs.forEach((x, i) => { const p = legendre(x, d); for (let a = 0; a < m; a++) { b[a] += p[a] * ys[i]; for (let c = 0; c < m; c++) A[a][c] += p[a] * p[c]; } });
  for (let a = 0; a < m; a++) A[a][a] += 1e-6 * xs.length;
  const c = solve(A, b);
  return x => legendre(x, d).reduce((s, v, i) => s + v * c[i], 0);
}
// một tập huấn luyện: x rải đều có xáo nhẹ trên [−1, 1], y = f(x) + nhiễu
function dataset(seed, n, sig) { const r = rng(seed), xs = [], ys = []; for (let i = 0; i < n; i++) { const x = -1 + 2 * (i + r()) / n; xs.push(x); ys.push(f(x) + sig * r.gauss()); } return { xs, ys }; }
const mse = (a, b) => a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0) / a.length;

TFG.demo('bias-variance', {
  html: `<div class="demo-title"><h4>Bias và variance</h4><span>Đổi độ phức tạp của mô hình, rồi lấy thêm tập huấn luyện khác để xem nó dao động cỡ nào</span></div>
    <div class="demo-body">
      <div class="stagebox">
        <canvas id="bvCv" class="ar" role="img" aria-label="Hàm thật (đường đứt nét), các điểm huấn luyện có nhiễu và đường cong đa thức mô hình học được."></canvas>
        <canvas id="bvErr" class="profile" role="img" aria-label="Lỗi huấn luyện, lỗi kiểm tra, bias bình phương và variance theo bậc đa thức. Bấm vào để chọn bậc."></canvas>
      </div>
      <div class="panel">
        <div class="ctrl"><label for="bvD">Độ phức tạp: bậc đa thức d</label><output for="bvD"></output>
          <input type="range" id="bvD" min="0" max="${DMAX}" step="1" value="3"></div>
        <div class="ctrl"><label for="bvN">Số điểm huấn luyện n</label><output for="bvN"></output>
          <input type="range" id="bvN" min="14" max="80" step="1" value="20"></div>
        <div class="ctrl"><label for="bvS">Mức nhiễu trong dữ liệu</label><output for="bvS"></output>
          <input type="range" id="bvS" min="0.05" max="0.6" step="0.01" value="0.3"></div>
        <div class="btnrow">
          <button class="btn" type="button" id="bvNew">Lấy tập huấn luyện khác</button>
          <button class="btn" type="button" id="bvMany" aria-pressed="false">Hiện 40 tập khác</button>
        </div>
        <dl class="readout">
          <dt>Số tham số</dt><dd id="bvP">—</dd>
          <dt>Lỗi huấn luyện</dt><dd id="bvTr">—</dd>
          <dt>Lỗi kiểm tra</dt><dd id="bvTe" class="big">—</dd>
          <dt>Chẩn đoán</dt><dd id="bvDx">—</dd>
        </dl>
        <div class="legend"><span><i style="background:${C.ink}"></i>hàm thật</span><span><i style="background:${C.sea}"></i>mô hình</span><span><i style="background:${C.sky}"></i>40 mô hình khác</span><span><i style="background:${C.gold}"></i>trung bình của 40</span></div>
        <p class="note-s">Lỗi kiểm tra đo trên dữ liệu mới, không dùng lúc học. Bậc thấp: cả hai lỗi đều cao, 40 đường giống nhau nhưng cùng lệch (bias). Bậc cao: lỗi huấn luyện gần 0, còn 40 đường quẫy mỗi đường một kiểu (variance). Tăng n để thấy variance giảm. Bấm vào khung dưới để chọn bậc.</p>
      </div>
    </div>`,
  init(el) {
    const cv = document.getElementById('bvCv'), ce = document.getElementById('bvErr'), st = {}, se = {};
    let seed = 1, many = false, curves = null, G = null;
    const rD = range('bvD', { map: v => Math.round(v), show: v => String(v), onInput: () => draw() });
    const rN = range('bvN', { map: v => Math.round(v), show: v => String(v), onInput: () => { curves = null; draw(); } });
    const rS = range('bvS', { show: v => num(v, 2), onInput: () => { curves = null; draw(); } });
    document.getElementById('bvNew').onclick = () => { seed++; draw(); };
    const manyBtn = document.getElementById('bvMany');
    manyBtn.onclick = () => { many = !many; manyBtn.setAttribute('aria-pressed', many); draw(); };

    // trung bình trên K tập huấn luyện, cho mọi bậc d (tính lại khi đổi n hoặc σ)
    function computeCurves() {
      const n = rN.get(), sig = rS.get(), out = [];
      const sets = Array.from({ length: K }, (_, k) => dataset(1000 + k, n, sig));
      for (let d = 0; d <= DMAX; d++) {
        let tr = 0; const F = sets.map(s => { const h = fit(s.xs, s.ys, d); tr += mse(s.xs.map(h), s.ys); return GX.map(h); });
        let b2 = 0, v = 0;
        for (let j = 0; j < NG; j++) { let m = 0; F.forEach(a => m += a[j]); m /= K; b2 += (m - FG[j]) ** 2; F.forEach(a => v += (a[j] - m) ** 2 / K); }
        b2 /= NG; v /= NG;
        out.push({ tr: tr / K, b2, v, te: b2 + v + sig * sig, F });
      }
      return out;
    }

    watchCanvas(cv, st, () => draw());
    watchCanvas(ce, se, () => draw());
    ce.style.cursor = 'pointer';
    ce.addEventListener('click', e => { if (!G) return; const rc = ce.getBoundingClientRect(), d = Math.round(G.inv(e.clientX - rc.left)); if (d >= 0 && d <= DMAX) rD.set(d); });
    rD.upd(); rN.upd(); rS.upd();

    function draw() {
      if (!st.ctx || !se.ctx) return;
      const d = rD.get(), n = rN.get(), sig = rS.get(), font = '"Be Vietnam Pro", sans-serif';
      if (!curves) curves = computeCurves();
      const cur = dataset(seed * 7 + 3, n, sig), h = fit(cur.xs, cur.ys, d), hg = GX.map(h);
      const trErr = mse(cur.xs.map(h), cur.ys), teErr = mse(hg, FG) + sig * sig;
      // ---------- khung trên ----------
      {
        const { ctx, W, H } = st; ctx.clearRect(0, 0, W, H);
        const l = 34, r = 12, t = 12, b = 26, pw = W - l - r, ph = H - t - b, YL = -2.4, YH = 2.4;
        const X = x => l + (x + 1) / 2 * pw, Y = y => t + (YH - y) / (YH - YL) * ph;
        ctx.fillStyle = '#fff'; ctx.fillRect(l, t, pw, ph);
        ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.fillStyle = C.muted; ctx.font = '12px ' + font; ctx.textAlign = 'right';
        for (let y = -2; y <= 2; y++) { ctx.beginPath(); ctx.moveTo(l, Y(y)); ctx.lineTo(l + pw, Y(y)); ctx.stroke(); ctx.fillText(y, l - 5, Y(y) + 4); }
        ctx.textAlign = 'center'; ctx.fillText('đầu vào x', l + pw / 2, H - 6);
        ctx.save(); ctx.beginPath(); ctx.rect(l, t, pw, ph); ctx.clip();
        const curve = (arr, col, wdt, dash) => { ctx.strokeStyle = col; ctx.lineWidth = wdt; ctx.setLineDash(dash || []); ctx.beginPath(); arr.forEach((v, j) => { const yy = Y(Math.max(-50, Math.min(50, v))); j ? ctx.lineTo(X(GX[j]), yy) : ctx.moveTo(X(GX[j]), yy); }); ctx.stroke(); ctx.setLineDash([]); };
        if (many) {
          ctx.globalAlpha = 0.45; curves[d].F.forEach(a => curve(a, C.sky, 1.2)); ctx.globalAlpha = 1;
          const mean = GX.map((_, j) => curves[d].F.reduce((s, a) => s + a[j], 0) / K);
          curve(mean, C.gold, 3);
        }
        curve(FG, C.ink, 2, [6, 4]);
        curve(hg, C.sea, 2.6);
        cur.xs.forEach((x, i) => { ctx.fillStyle = '#fff'; ctx.strokeStyle = C.ink; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.arc(X(x), Y(cur.ys[i]), 3.8, 0, 7); ctx.fill(); ctx.stroke(); });
        ctx.restore();
        ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5; ctx.strokeRect(l + .5, t + .5, pw - 1, ph - 1);
      }
      // ---------- khung dưới: lỗi theo bậc ----------
      {
        const { ctx, W, H } = se; ctx.clearRect(0, 0, W, H); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
        const l = 44, r = 12, t = 12, b = 30, pw = W - l - r, ph = H - t - b, ymax = curves[0].te * 1.25;
        const X = k => l + k / DMAX * pw, Y = v => t + (1 - Math.min(v, ymax * 1.05) / ymax) * ph;
        G = { inv: x => (x - l) / pw * DMAX };
        ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.fillStyle = C.muted; ctx.font = '12px ' + font; ctx.textAlign = 'center';
        for (let k = 0; k <= DMAX; k++) { ctx.beginPath(); ctx.moveTo(X(k), t); ctx.lineTo(X(k), t + ph); ctx.stroke(); ctx.fillText(k, X(k), t + ph + 14); }
        ctx.fillText('bậc đa thức d (độ phức tạp)', l + pw / 2, H - 3);
        ctx.save(); ctx.translate(12, t + ph / 2); ctx.rotate(-Math.PI / 2); ctx.fillText('lỗi', 0, 0); ctx.restore();
        // vạch đang chọn
        ctx.fillStyle = 'rgba(242,194,48,.25)'; ctx.fillRect(X(d) - pw / DMAX / 2, t, pw / DMAX, ph);
        ctx.save(); ctx.beginPath(); ctx.rect(l, t - 2, pw, ph + 2); ctx.clip();
        const line = (key, col, wdt, dash) => { ctx.strokeStyle = col; ctx.lineWidth = wdt; ctx.setLineDash(dash || []); ctx.beginPath(); curves.forEach((c, k) => k ? ctx.lineTo(X(k), Y(c[key])) : ctx.moveTo(X(k), Y(c[key]))); ctx.stroke(); ctx.setLineDash([]); };
        ctx.strokeStyle = C.muted; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(l, Y(sig * sig)); ctx.lineTo(l + pw, Y(sig * sig)); ctx.stroke(); ctx.setLineDash([]);
        line('b2', C.gold, 2, [6, 3]); line('v', VIOLET, 2, [6, 3]); line('tr', C.sea, 2.2); line('te', C.pos, 2.6);
        ctx.restore();
        // nhãn
        ctx.font = '600 12px ' + font; ctx.textAlign = 'left';
        const labs = [['lỗi kiểm tra', C.pos], ['lỗi huấn luyện', C.sea], ['bias²', '#B58A00'], ['variance', VIOLET], ['nhiễu', C.muted]];
        let lx = l + 8, ly = t + 13;   // chú thích tự xuống dòng khi khung hẹp
        labs.forEach(([s, c]) => { const wd = ctx.measureText(s).width; if (lx + wd > l + pw - 4 && lx > l + 8) { lx = l + 8; ly += 15; } ctx.fillStyle = c; ctx.fillText(s, lx, ly); lx += wd + 14; });
        if (curves.some(c => c.te > ymax)) { ctx.fillStyle = C.muted; ctx.font = '12px ' + font; ctx.textAlign = 'right'; ctx.fillText('↑ vượt khung', l + pw - 4, ly + 15); }
      }
      // ---------- số liệu ----------
      let best = 0; curves.forEach((c, k) => { if (c.te < curves[best].te) best = k; });
      const c = curves[d], worse = c.te > 1.15 * curves[best].te;
      const dx = !worse ? 'Vừa khéo' : d < best ? 'Học thiếu: bias cao' : 'Học vẹt: variance cao';
      setTxt('bvP', (d + 1) + ' (n = ' + n + ' điểm)');
      setTxt('bvTr', num(trErr, 3)); setTxt('bvTe', num(teErr, 3)); setTxt('bvDx', dx);
    }
  },
});
})();
