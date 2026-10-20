/* =====================================================================
   Robotics: minh họa "Bộ lọc hạt: robot đi lạc tìm lại mình" (id: particle, trang 3-dinh-vi.html)
   Định vị Monte Carlo (Dellaert, Fox, Burgard, Thrun 1999) trên một căn phòng 10 m × 7 m có đồ đạc.
   Robot đo khoảng cách tới vật cản theo 8 tia (cách nhau 45°, tối đa 6 m, có nhiễu).
   Mỗi bước: (1) dời mọi hạt theo đúng lệnh di chuyển của robot, cộng nhiễu;
             (2) chấm điểm mỗi hạt: nếu robot đứng ở đó thì 8 tia đo ra có giống số đo thật hông;
             (3) bốc lại hạt theo điểm (resampling), hạt điểm cao được nhân bản, hạt điểm thấp bị bỏ;
             1% hạt được rải ngẫu nhiên lại để còn cứu được khi robot bị "bắt cóc".
   Chạy độc lập: lib/demos/run.html?demo=particle
   EDIT: đồ đạc trong phòng ở BOXES (x, y, rộng, cao, đơn vị mét).
   ===================================================================== */
(() => {
const { COLORS: C, watchCanvas, setTxt, num, range, rng, loopWhenVisible } = TFG;
const RW = 10, RH = 7, MAXR = 6, NRAY = 8;
const BOXES = [[2, 1.4, 1.3, 1.0], [6.4, 0.9, 1.6, 0.8], [4.3, 3.9, 0.8, 2.3], [7.6, 4.4, 1.5, 1.3], [0.9, 4.9, 1.5, 0.6], [8.9, 2.6, 0.5, 0.5]];
const inside = (x, y) => x > 0.15 && y > 0.15 && x < RW - 0.15 && y < RH - 0.15 && !BOXES.some(([bx, by, bw, bh]) => x > bx - 0.15 && x < bx + bw + 0.15 && y > by - 0.15 && y < by + bh + 0.15);
function cast(x, y, a) {
  const c = Math.cos(a), s = Math.sin(a);
  let t = Infinity;
  if (c > 1e-9) t = Math.min(t, (RW - x) / c); if (c < -1e-9) t = Math.min(t, -x / c);
  if (s > 1e-9) t = Math.min(t, (RH - y) / s); if (s < -1e-9) t = Math.min(t, -y / s);
  for (const [bx, by, bw, bh] of BOXES) {
    let t0 = -Infinity, t1 = Infinity;
    if (Math.abs(c) < 1e-9) { if (x < bx || x > bx + bw) continue; } else { const a1 = (bx - x) / c, a2 = (bx + bw - x) / c; t0 = Math.max(t0, Math.min(a1, a2)); t1 = Math.min(t1, Math.max(a1, a2)); }
    if (Math.abs(s) < 1e-9) { if (y < by || y > by + bh) continue; } else { const b1 = (by - y) / s, b2 = (by + bh - y) / s; t0 = Math.max(t0, Math.min(b1, b2)); t1 = Math.min(t1, Math.max(b1, b2)); }
    if (t1 >= t0 && t0 > 0) t = Math.min(t, t0);
  }
  return Math.min(t, MAXR);
}
const scan = (x, y, th) => [...Array(NRAY)].map((_, k) => cast(x, y, th + k * 2 * Math.PI / NRAY));

TFG.demo('particle', {
  html: `<div class="demo-title"><h4>Bộ lọc hạt: robot đi lạc tìm lại mình</h4><span>Mỗi chấm xanh là một phỏng đoán “robot đang ở đây”</span></div>
    <div class="demo-body">
      <div class="stagebox"><canvas id="pfCv" class="ar" role="img" aria-label="Bản đồ căn phòng có đồ đạc; tam giác vàng là robot thật, các chấm xanh là các phỏng đoán vị trí, vòng tròn xanh đậm là ước lượng."></canvas></div>
      <div class="panel">
        <div class="btnrow">
          <button class="btn" type="button" id="pfRun" aria-pressed="false">Chạy</button>
          <button class="btn" type="button" id="pfStep">Đi 1 bước</button>
        </div>
        <div class="btnrow">
          <button class="btn" type="button" id="pfSpread">Rải hạt lại khắp phòng</button>
          <button class="btn" type="button" id="pfKid">Bắt cóc robot</button>
        </div>
        <div class="ctrl"><label for="pfN">Số hạt</label><output for="pfN"></output>
          <input type="range" id="pfN" min="100" max="3000" step="100" value="1500"></div>
        <div class="ctrl"><label for="pfS">Nhiễu cảm biến khoảng cách</label><output for="pfS"></output>
          <input type="range" id="pfS" min="0.05" max="0.6" step="0.05" value="0.15"></div>
        <div class="checks"><label><input type="checkbox" id="pfRays" checked> Hiện 8 tia đo của robot</label></div>
        <dl class="readout">
          <dt>Số bước</dt><dd id="pfK">0</dd>
          <dt>Độ tản của các hạt</dt><dd id="pfSp" class="big">—</dd>
          <dt>Ước lượng lệch so với thật</dt><dd id="pfE">—</dd>
          <dt>Tình trạng</dt><dd id="pfSt" style="font-family:var(--body)">—</dd>
        </dl>
        <p class="note-s">Lúc đầu robot hổng biết mình ở đâu: hạt rải khắp phòng. Đi vài bước, đo vài lần, những chỗ “đo hổng khớp” bị loại dần. Có lúc hạt tụ thành hai, ba cụm: đó là những chỗ trong phòng trông giống nhau với cảm biến của robot.</p>
      </div>
    </div>`,
  init(el) {
    const cv = document.getElementById('pfCv'), st = {};
    const r = rng(5);
    const N = range('pfN', { show: v => v }), S = range('pfS', { show: v => num(v, 2) + ' m' });
    const rays = document.getElementById('pfRays');
    let bot = { x: 1.2, y: 0.8, th: 0.3 }, P = [], k = 0, running = false, acc = 0, z = scan(bot.x, bot.y, bot.th);
    const randPose = () => { let x, y; do { x = r() * RW; y = r() * RH; } while (!inside(x, y)); return { x, y, th: r() * 2 * Math.PI, w: 1 }; };
    const spread = () => { P = [...Array(N.get())].map(randPose); k = 0; };
    const runB = document.getElementById('pfRun');
    const setRun = v => { running = v; runB.setAttribute('aria-pressed', v); runB.textContent = v ? 'Dừng' : 'Chạy'; };
    runB.onclick = () => setRun(!running);
    document.getElementById('pfStep').onclick = () => { step(); draw(); };
    document.getElementById('pfSpread').onclick = () => { spread(); draw(); };
    document.getElementById('pfKid').onclick = () => { const p = randPose(); bot = { x: p.x, y: p.y, th: p.th }; z = scan(bot.x, bot.y, bot.th); draw(); };
    N.el.addEventListener('change', () => { spread(); draw(); });
    N.upd(); S.upd(); spread();
    function step() {
      // robot đi tới; gần vật cản phía trước thì quẹo
      let d = 0.35, dth = 0.15 * r.gauss();
      if (cast(bot.x, bot.y, bot.th) < 0.9) { dth = (r() < 0.5 ? 1 : -1) * (0.9 + 0.8 * r()); d = 0; }
      const nth = bot.th + dth, nx = bot.x + d * Math.cos(nth), ny = bot.y + d * Math.sin(nth);
      bot.th = nth; if (inside(nx, ny)) { bot.x = nx; bot.y = ny; }
      const sd = S.get(); z = scan(bot.x, bot.y, bot.th).map(v => Math.min(MAXR, Math.max(0, v + sd * r.gauss())));
      // (1) dời hạt
      P.forEach(p => { p.th += dth + 0.06 * r.gauss(); const dd = d * (1 + 0.1 * r.gauss()); p.x += dd * Math.cos(p.th) + 0.03 * r.gauss(); p.y += dd * Math.sin(p.th) + 0.03 * r.gauss(); });
      // (2) chấm điểm (log), sigma nới rộng chút cho chắc ăn
      const sl = sd + 0.2; let mx = -Infinity;
      P.forEach(p => {
        if (!inside(p.x, p.y)) { p.lw = -Infinity; return; }
        const zp = scan(p.x, p.y, p.th); let s = 0; for (let i = 0; i < NRAY; i++) { const e = z[i] - zp[i]; s -= e * e / (2 * sl * sl); }
        p.lw = s; if (s > mx) mx = s;
      });
      let tot = 0; P.forEach(p => { p.w = isFinite(p.lw) ? Math.exp(p.lw - mx) : 0; tot += p.w; });
      // (3) bốc lại (low-variance resampling) + 1% hạt ngẫu nhiên
      const n = N.get(), out = [], nr = Math.round(n * 0.01);
      if (tot > 0) {
        const stepW = tot / (n - nr); let u = r() * stepW, c = P[0].w, i = 0;
        for (let m = 0; m < n - nr; m++) { const U = u + m * stepW; while (U > c && i < P.length - 1) { i++; c += P[i].w; } const q = P[i]; out.push({ x: q.x, y: q.y, th: q.th, w: 1 }); }
      }
      while (out.length < n) out.push(randPose());
      P = out; k++;
    }
    loopWhenVisible(el, dt => { if (!running) return; acc += dt; if (acc < 0.22) return; acc = 0; step(); draw(); });
    watchCanvas(cv, st, () => draw());
    function draw() {
      const mxx = P.reduce((s, p) => s + p.x, 0) / P.length, myy = P.reduce((s, p) => s + p.y, 0) / P.length;
      const sp = Math.sqrt(P.reduce((s, p) => s + (p.x - mxx) ** 2 + (p.y - myy) ** 2, 0) / P.length);
      setTxt('pfK', k); setTxt('pfSp', num(sp, 3) + ' m'); setTxt('pfSt', sp < 0.5 ? 'Chắc rồi' : sp < 1.5 ? 'Gần chắc' : 'Còn mơ hồ');
      setTxt('pfE', sp < 1 ? num(Math.hypot(mxx - bot.x, myy - bot.y), 3) + ' m' : '—');
      if (!st.ctx) return;
      const { ctx, W, H } = st; ctx.clearRect(0, 0, W, H);
      const s = Math.min((W - 30) / RW, (H - 30) / RH), ox = (W - RW * s) / 2, oy = (H + RH * s) / 2;
      const X = x => ox + x * s, Y = y => oy - y * s;
      ctx.fillStyle = '#fff'; ctx.fillRect(X(0), Y(RH), RW * s, RH * s);
      ctx.fillStyle = '#59606B'; BOXES.forEach(([bx, by, bw, bh]) => ctx.fillRect(X(bx), Y(by + bh), bw * s, bh * s));
      ctx.strokeStyle = C.ink; ctx.lineWidth = 3; ctx.strokeRect(X(0), Y(RH), RW * s, RH * s);
      // hạt
      ctx.fillStyle = 'rgba(55,135,196,.55)';
      P.forEach(p => { ctx.fillRect(X(p.x) - 1.6, Y(p.y) - 1.6, 3.2, 3.2); });
      // tia đo
      if (rays.checked) {
        ctx.strokeStyle = 'rgba(216,49,42,.55)'; ctx.lineWidth = 1.3;
        z.forEach((d, i) => { const a = bot.th + i * 2 * Math.PI / NRAY; ctx.beginPath(); ctx.moveTo(X(bot.x), Y(bot.y)); ctx.lineTo(X(bot.x + d * Math.cos(a)), Y(bot.y + d * Math.sin(a))); ctx.stroke();
          ctx.fillStyle = C.pos; ctx.beginPath(); ctx.arc(X(bot.x + d * Math.cos(a)), Y(bot.y + d * Math.sin(a)), 2.5, 0, 7); ctx.fill(); });
      }
      // robot thật
      const a = bot.th, R0 = 0.28 * s;
      ctx.fillStyle = C.gold; ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.beginPath();
      ctx.moveTo(X(bot.x) + R0 * 1.4 * Math.cos(-a), Y(bot.y) + R0 * 1.4 * Math.sin(-a));
      ctx.lineTo(X(bot.x) + R0 * Math.cos(-a + 2.4), Y(bot.y) + R0 * Math.sin(-a + 2.4));
      ctx.lineTo(X(bot.x) + R0 * Math.cos(-a - 2.4), Y(bot.y) + R0 * Math.sin(-a - 2.4)); ctx.closePath(); ctx.fill(); ctx.stroke();
      // ước lượng
      if (sp < 1) { ctx.strokeStyle = C.sea; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(X(mxx), Y(myy), Math.max(10, 2 * sp * s), 0, 7); ctx.stroke(); }
      ctx.fillStyle = C.muted; ctx.font = '11.5px "Be Vietnam Pro", sans-serif'; ctx.textAlign = 'left';
      ctx.fillText('phòng 10 m × 7 m; khối xám là đồ đạc', X(0), Y(RH) - 6);
    }
  },
});
})();
