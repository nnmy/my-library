/* =====================================================================
   Robotics: minh họa "Bộ lọc Kalman: bánh xe + GPS" (id: kalman-1d, trang 3-dinh-vi.html)
   Xe chạy trên đường thẳng. Mỗi 0,1 s:
     - bộ đếm bánh xe báo vận tốc u = v_thật·(1 + 4%) + nhiễu   (lệch 4%: trôi dần)
     - dự đoán:  x̂ ← x̂ + u·Δt,   P ← P + Q
   Mỗi 1 s (trừ khi đang trong hầm), GPS báo z = x_thật + nhiễu (độ lệch chuẩn σ):
     - cập nhật: K = P / (P + σ²),  x̂ ← x̂ + K (z − x̂),  P ← (1 − K) P
   Đồ thị: sai lệch so với vị trí thật của GPS (chấm đỏ), chỉ dùng bánh xe (xám), Kalman (xanh, dải ±2√P).
   Chạy độc lập: lib/demos/run.html?demo=kalman-1d
   ===================================================================== */
(() => {
const { COLORS: C, watchCanvas, setTxt, num, range, rng, loopWhenVisible } = TFG;
const DT = 0.1, GPS_EVERY = 10, WIN = 30, BIAS = 0.04, ENC_SD = 0.6, YR = 25;
TFG.demo('kalman-1d', {
  html: `<div class="demo-title"><h4>Bộ lọc Kalman: bánh xe + GPS</h4><span>Trộn hai nguồn tin dở thành một ước lượng tốt</span></div>
    <div class="demo-body">
      <div class="stagebox">
        <canvas id="kfCv" class="ar" role="img" aria-label="Đồ thị sai lệch so với vị trí thật theo thời gian: GPS (chấm đỏ), chỉ dùng bánh xe (đường xám), Kalman (đường xanh có dải bất định)."></canvas>
        <canvas id="kfRoad" class="profile" style="height:120px" role="img" aria-label="Con đường: xe thật ở giữa, các ước lượng vị trí quanh nó."></canvas>
      </div>
      <div class="panel">
        <div class="ctrl"><label for="kfR">Nhiễu GPS (độ lệch chuẩn σ)</label><output for="kfR"></output>
          <input type="range" id="kfR" min="1" max="15" step="0.5" value="6"></div>
        <div class="ctrl"><label for="kfQ">Bộ lọc nghi ngờ bánh xe cỡ nào (Q)</label><output for="kfQ"></output>
          <input type="range" id="kfQ" min="-3.5" max="1" step="0.1" value="-0.7"></div>
        <div class="btnrow">
          <button class="btn" type="button" id="kfTun" aria-pressed="false">Chạy vô hầm (mất GPS)</button>
          <button class="btn" type="button" id="kfReset">Làm lại</button>
        </div>
        <dl class="readout">
          <dt>Hệ số Kalman K</dt><dd id="kfK" class="big">—</dd>
          <dt>Bất định ±2√P</dt><dd id="kfP">—</dd>
          <dt>Sai số TB, GPS</dt><dd id="kfEg">—</dd>
          <dt>Sai số TB, bánh xe</dt><dd id="kfEo">—</dd>
          <dt>Sai số TB, Kalman</dt><dd id="kfEk" class="big">—</dd>
        </dl>
        <p class="note-s" id="kfKn" style="margin-top:-6px"></p>
        <p class="note-s">Bánh xe đo mượt nhưng lệch 4%, nên càng chạy càng trôi xa. GPS hổng trôi nhưng nhảy lung tung vài mét. Kalman lấy chỗ mạnh của mỗi bên. Vô hầm: dải bất định phình ra dần, ra khỏi hầm gặp GPS là co lại liền. Thử kéo Q xuống thật nhỏ: bộ lọc tin bánh xe quá mức và trôi theo luôn; kéo Q thật lớn: nó nhảy theo GPS. Chỉnh Q đúng mức là nửa cái nghề.</p>
      </div>
    </div>`,
  init(el) {
    const cv = document.getElementById('kfCv'), cr = document.getElementById('kfRoad'), st = {}, sr = {};
    const R = range('kfR', { show: v => num(v, 3) + ' m' });
    const Qs = range('kfQ', { map: v => Math.pow(10, v), show: v => num(v, 2) + ' m²' });
    const tb = document.getElementById('kfTun');
    let tunnel = false; tb.onclick = () => { tunnel = !tunnel; tb.setAttribute('aria-pressed', tunnel); tb.textContent = tunnel ? 'Ra khỏi hầm' : 'Chạy vô hầm (mất GPS)'; };
    let r, t, x, v, xo, xk, P, n, K, hist, lastZ, acc = 0;
    function reset() { r = rng(11); t = 0; x = 0; v = 10; xo = 0; xk = 0; P = 1; n = 0; K = null; hist = []; lastZ = null; acc = 0; }
    document.getElementById('kfReset').onclick = reset;
    reset(); R.upd(); Qs.upd();
    function step() {
      t += DT; n++;
      v = 10 + 2 * Math.sin(0.3 * t) + 0.3 * r.gauss(); x += v * DT;
      const u = v * (1 + BIAS) + ENC_SD * r.gauss();
      xo += u * DT; xk += u * DT; P += Qs.get();
      let z = null;
      if (n % GPS_EVERY === 0 && !tunnel) {
        const s = R.get(); z = x + s * r.gauss(); lastZ = z;
        K = P / (P + s * s); xk += K * (z - xk); P *= 1 - K;
      }
      hist.push({ t, eo: xo - x, ek: xk - x, eg: z === null ? null : z - x, sd: Math.sqrt(P), tun: tunnel });
      while (hist.length && hist[0].t < t - WIN) hist.shift();
    }
    const rms = a => a.length ? Math.sqrt(a.reduce((s, q) => s + q * q, 0) / a.length) : NaN;
    loopWhenVisible(el, dt => { acc += dt * 2; while (acc >= DT) { step(); acc -= DT; } draw(); });
    watchCanvas(cv, st, () => draw()); watchCanvas(cr, sr, () => draw());
    function draw() {
      setTxt('kfK', K === null ? '—' : num(K, 3)); setTxt('kfKn', K === null ? '' : `K gần 1: tin GPS; gần 0: tin dự đoán. Lúc này K = ${num(K, 2)}, nghiêng về ${K > 0.5 ? 'GPS' : 'dự đoán từ bánh xe'}. TB: trung bình 30 giây qua.`);
      setTxt('kfP', '±' + num(2 * Math.sqrt(P), 3) + ' m');
      setTxt('kfEg', num(rms(hist.filter(h => h.eg !== null).map(h => h.eg)), 3) + ' m');
      setTxt('kfEo', num(rms(hist.map(h => h.eo)), 3) + ' m'); setTxt('kfEk', num(rms(hist.map(h => h.ek)), 3) + ' m');
      if (st.ctx) {
        const { ctx, W, H } = st; ctx.clearRect(0, 0, W, H);
        const l = 50, rr = 14, tp = 26, b = 30, w = W - l - rr, h = H - tp - b;
        const t1 = Math.max(t, WIN), X = tt => l + (tt - (t1 - WIN)) / WIN * w, Y = e => tp + (1 - (Math.max(-YR, Math.min(YR, e)) + YR) / (2 * YR)) * h;
        // hầm
        ctx.fillStyle = 'rgba(89,96,107,.12)';
        hist.forEach((q, i) => { if (q.tun) ctx.fillRect(X(q.t - DT), tp, X(q.t) - X(q.t - DT) + 0.5, h); });
        ctx.strokeStyle = C.line; ctx.fillStyle = C.muted; ctx.font = '11.5px "Be Vietnam Pro", sans-serif'; ctx.textAlign = 'right';
        [-20, -10, 0, 10, 20].forEach(e => { ctx.beginPath(); ctx.moveTo(l, Y(e)); ctx.lineTo(l + w, Y(e)); ctx.stroke(); ctx.fillText((e > 0 ? '+' : '') + e + ' m', l - 6, Y(e) + 4); });
        ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(l, Y(0)); ctx.lineTo(l + w, Y(0)); ctx.stroke();
        // dải ±2σ
        if (hist.length > 1) {
          ctx.fillStyle = 'rgba(123,205,232,.35)'; ctx.beginPath();
          hist.forEach((q, i) => { const yy = Y(q.ek + 2 * q.sd); i ? ctx.lineTo(X(q.t), yy) : ctx.moveTo(X(q.t), yy); });
          for (let i = hist.length - 1; i >= 0; i--) ctx.lineTo(X(hist[i].t), Y(hist[i].ek - 2 * hist[i].sd)); ctx.closePath(); ctx.fill();
        }
        const line = (k, col, wdt, dash) => { ctx.strokeStyle = col; ctx.lineWidth = wdt; ctx.setLineDash(dash || []); ctx.beginPath(); hist.forEach((q, i) => i ? ctx.lineTo(X(q.t), Y(q[k])) : ctx.moveTo(X(q.t), Y(q[k]))); ctx.stroke(); ctx.setLineDash([]); };
        line('eo', '#9DA4AD', 2, [6, 4]); line('ek', C.sea, 2.6);
        ctx.fillStyle = C.pos; hist.forEach(q => { if (q.eg !== null) { ctx.beginPath(); ctx.arc(X(q.t), Y(q.eg), 3.5, 0, 7); ctx.fill(); } });
        ctx.font = '12px "Be Vietnam Pro", sans-serif'; ctx.textAlign = 'left';
        ctx.fillStyle = C.ink; ctx.fillText('sai lệch so với vị trí thật, 30 giây gần nhất', l, 16);
        const lg = [['● GPS', C.pos], ['- - chỉ bánh xe', '#59606B'], ['— Kalman (dải xanh: ±2√P)', C.sea]];
        let lx = l; lg.forEach(([s, c]) => { ctx.fillStyle = c; ctx.fillText(s, lx, H - 8); lx += ctx.measureText(s).width + 18; });
      }
      if (sr.ctx) {
        const { ctx, W, H } = sr; ctx.clearRect(0, 0, W, H);
        const cx = W / 2, sc = (W - 40) / 60, ry = H / 2 + 8;
        ctx.fillStyle = '#E6EAEE'; ctx.fillRect(0, ry - 22, W, 44);
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.setLineDash([16, 14]); ctx.lineDashOffset = (x * sc) % 30; ctx.beginPath(); ctx.moveTo(0, ry); ctx.lineTo(W, ry); ctx.stroke(); ctx.setLineDash([]); ctx.lineDashOffset = 0;
        const P2 = e => cx + Math.max(-29, Math.min(29, e)) * sc;
        // xe thật
        ctx.fillStyle = C.gold; ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.fillRect(cx - 18, ry - 10, 36, 20); ctx.strokeRect(cx - 18, ry - 10, 36, 20);
        // Kalman ±2σ
        const ek = xk - x, s2 = 2 * Math.sqrt(P);
        ctx.fillStyle = 'rgba(123,205,232,.45)'; ctx.fillRect(P2(ek - s2), ry - 30, P2(ek + s2) - P2(ek - s2), 8);
        ctx.fillStyle = C.sea; ctx.beginPath(); ctx.moveTo(P2(ek), ry - 18); ctx.lineTo(P2(ek) - 7, ry - 32); ctx.lineTo(P2(ek) + 7, ry - 32); ctx.fill();
        ctx.strokeStyle = '#59606B'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(P2(xo - x), ry + 18); ctx.lineTo(P2(xo - x) - 7, ry + 32); ctx.lineTo(P2(xo - x) + 7, ry + 32); ctx.closePath(); ctx.stroke();
        if (lastZ !== null) { ctx.fillStyle = C.pos; ctx.beginPath(); ctx.arc(P2(lastZ - x), ry - 40, 5, 0, 7); ctx.fill(); }
        ctx.font = '11.5px "Be Vietnam Pro", sans-serif'; ctx.fillStyle = C.muted; ctx.textAlign = 'left';
        ctx.fillText(W < 560 ? 'xe thật ở giữa; ▼ Kalman, ▲ bánh xe, ● GPS' : 'xe thật ở giữa; ▼ xanh: Kalman, ▲ xám: chỉ bánh xe, ● đỏ: GPS gần nhất', 8, H - 6);
      }
    }
  },
});
})();
