/* =====================================================================
   Robotics: minh họa "Xe giữ cây gậy đứng" (id: balance, trang 2-dieu-khien.html)
   Con lắc ngược trên xe (mô hình cart-pole của Barto, Sutton, Anderson 1983):
   xe 1 kg, gậy 0,2 kg dài 1 m, lực đẩy xe tối đa 30 N, đường ray ±2,4 m có tường chặn.
   Điều khiển: F = Kp·θ + Kd·θ′ (+ 3·x + 4,5·v nếu bật "giữ xe ở giữa"), θ > 0 là gậy nghiêng qua phải.
   Chạy độc lập: lib/demos/run.html?demo=balance
   ===================================================================== */
(() => {
const { COLORS: C, watchCanvas, setTxt, num, range, loopWhenVisible, arrow } = TFG;
const g = 9.81, M = 1, m = 0.2, l = 0.5, FMAX = 30, TRACK = 2.4, DT = 0.001;
TFG.demo('balance', {
  html: `<div class="demo-title"><h4>Xe giữ cây gậy đứng</h4><span>Đẩy cây gậy, coi bộ điều khiển chụp lại</span></div>
    <div class="demo-body">
      <div class="stagebox">
        <canvas id="blCv" class="ar" role="img" aria-label="Một chiếc xe chạy trên đường ray, trên xe dựng một cây gậy; mũi tên vàng là lực đẩy xe."></canvas>
        <canvas id="blPlot" class="profile" role="img" aria-label="Đồ thị góc nghiêng của gậy theo thời gian."></canvas>
        <span class="hint" style="top:6px;bottom:auto">Bấm nửa trái hay nửa phải khung hình để đẩy gậy</span>
      </div>
      <div class="panel">
        <div class="ctrl"><label for="blKp">Kp (nghiêng bao nhiêu)</label><output for="blKp"></output>
          <input type="range" id="blKp" min="0" max="80" step="1" value="40"></div>
        <div class="ctrl"><label for="blKd">Kd (đang ngã nhanh cỡ nào)</label><output for="blKd"></output>
          <input type="range" id="blKd" min="0" max="15" step="0.5" value="8"></div>
        <div class="checks"><label><input type="checkbox" id="blPos" checked> Giữ xe ở giữa đường ray</label></div>
        <div class="btnrow">
          <button class="btn" type="button" id="blL">Đẩy gậy qua trái</button>
          <button class="btn" type="button" id="blR">Đẩy gậy qua phải</button>
          <button class="btn" type="button" id="blReset">Dựng lại</button>
        </div>
        <dl class="readout">
          <dt>Góc nghiêng</dt><dd id="blTh" class="big">—</dd>
          <dt>Lực đẩy xe</dt><dd id="blF">—</dd>
          <dt>Vị trí xe</dt><dd id="blX">—</dd>
          <dt>Tình trạng</dt><dd id="blS" style="font-family:var(--body)">—</dd>
        </dl>
      </div>
    </div>`,
  init(el) {
    const cv = document.getElementById('blCv'), cp = document.getElementById('blPlot'), st = {}, sp = {};
    let x = 0, xd = 0, th = 0.05, thd = 0, F = 0, fell = false, t = 0, hist = [], acc = 0, sT = 0, wall = false;
    const kp = range('blKp', { show: v => num(v, 3) }), kd = range('blKd', { show: v => num(v, 3) });
    const pos = document.getElementById('blPos');
    const push = s => { if (!fell) thd += s * 1.2; };
    document.getElementById('blL').onclick = () => push(-1); document.getElementById('blR').onclick = () => push(1);
    document.getElementById('blReset').onclick = () => { x = xd = thd = 0; th = 0.05; fell = false; wall = false; };
    cv.addEventListener('pointerdown', e => { const r = cv.getBoundingClientRect(); push(e.clientX - r.left < r.width / 2 ? -1 : 1); });
    kp.upd(); kd.upd();
    function sim(dt) {
      if (fell) return;
      F = kp.get() * th + kd.get() * thd + (pos.checked ? 3 * x + 4.5 * xd : 0);
      F = Math.max(-FMAX, Math.min(FMAX, F));
      const s = Math.sin(th), c = Math.cos(th), tot = M + m, tmp = (F + m * l * thd * thd * s) / tot;
      const thdd = (g * s - c * tmp) / (l * (4 / 3 - m * c * c / tot)), xdd = tmp - m * l * thdd * c / tot;
      xd += xdd * dt; x += xd * dt; thd += thdd * dt; th += thd * dt; t += dt;
      if (Math.abs(x) > TRACK) { x = Math.sign(x) * TRACK; xd = 0; wall = true; }
      if (Math.abs(th) > 1.25) { fell = true; th = Math.sign(th) * 1.4; }
    }
    loopWhenVisible(el, dt => {
      if (dt <= 0) return; acc += dt;
      while (acc >= DT) { sim(DT); acc -= DT; sT += DT; if (sT > 0.02) { sT = 0; hist.push(th); if (hist.length > 500) hist.shift(); } }
      draw();
    });
    watchCanvas(cv, st, () => draw()); watchCanvas(cp, sp, () => draw());
    function draw() {
      setTxt('blTh', num(th * 180 / Math.PI, 3) + '°'); setTxt('blF', num(F, 3) + ' N' + (Math.abs(F) >= FMAX - 1e-6 ? ' (hết ga)' : ''));
      setTxt('blX', num(x, 3) + ' m');
      setTxt('blS', fell ? 'Ngã rồi! Bấm “Dựng lại”.' : wall ? 'Xe đụng tường!' : Math.abs(th) < 0.02 ? 'Đứng vững' : 'Đang chụp lại…');
      if (st.ctx) {
        const { ctx, W, H } = st; ctx.clearRect(0, 0, W, H);
        const s = (W - 40) / (2 * TRACK + 0.8), ox = W / 2, gy = H * 0.78, X = q => ox + q * s;
        ctx.fillStyle = C.mist; ctx.fillRect(0, gy, W, H - gy);
        ctx.strokeStyle = C.ink; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(X(-TRACK - 0.3), gy); ctx.lineTo(X(TRACK + 0.3), gy); ctx.stroke();
        ctx.fillStyle = C.muted; [-1, 1].forEach(d => ctx.fillRect(X(d * (TRACK + 0.3)) - (d > 0 ? 0 : 8), gy - 46, 8, 46));
        ctx.font = '11.5px "Be Vietnam Pro", sans-serif'; ctx.textAlign = 'center';
        for (let q = -2; q <= 2; q++) { ctx.fillText(q + ' m', X(q), gy + 18); ctx.fillRect(X(q) - 0.5, gy, 1, 6); }
        const cw = Math.max(46, 0.5 * s), ch = cw * 0.45, cx = X(x), cy = gy - ch / 2 - 10;
        ctx.fillStyle = C.sea; ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.fillRect(cx - cw / 2, cy - ch / 2, cw, ch); ctx.strokeRect(cx - cw / 2, cy - ch / 2, cw, ch);
        ctx.fillStyle = C.ink; [-1, 1].forEach(d => { ctx.beginPath(); ctx.arc(cx + d * cw * 0.3, gy - 6, 6, 0, 7); ctx.fill(); });
        const L = Math.min(2 * l * s, gy - 30), px = cx + L * Math.sin(th), py = cy - ch / 2 - L * Math.cos(th);
        ctx.strokeStyle = C.ink; ctx.lineWidth = 9; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(cx, cy - ch / 2); ctx.lineTo(px, py); ctx.stroke();
        ctx.strokeStyle = fell ? C.pos : C.gold; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(cx, cy - ch / 2); ctx.lineTo(px, py); ctx.stroke();
        ctx.fillStyle = C.ink; ctx.beginPath(); ctx.arc(px, py, 8, 0, 7); ctx.fill();
        ctx.save(); ctx.setLineDash([4, 4]); ctx.strokeStyle = '#9DA4AD'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(cx, cy - ch / 2); ctx.lineTo(cx, cy - ch / 2 - L); ctx.stroke(); ctx.restore();
        if (Math.abs(F) > 0.5) arrow(ctx, cx, cy, cx + F / FMAX * 90, cy, C.gold, 5, 12);
        if (fell) { ctx.fillStyle = C.pos; ctx.font = '700 18px "Be Vietnam Pro", sans-serif'; ctx.fillText('Ngã rồi!', W / 2, 30); }
      }
      if (sp.ctx) {
        const { ctx, W, H } = sp; ctx.clearRect(0, 0, W, H);
        const l0 = 46, t0 = 18, w = W - l0 - 12, h = H - t0 - 20, Y = a => t0 + h / 2 - a / 0.5 * h / 2;
        ctx.strokeStyle = C.line; ctx.beginPath(); ctx.moveTo(l0, Y(0)); ctx.lineTo(l0 + w, Y(0)); ctx.stroke();
        ctx.fillStyle = C.muted; ctx.font = '11.5px "Be Vietnam Pro", sans-serif'; ctx.textAlign = 'right';
        ctx.fillText('+29°', l0 - 6, Y(0.5) + 8); ctx.fillText('0°', l0 - 6, Y(0) + 4); ctx.fillText('−29°', l0 - 6, Y(-0.5));
        ctx.textAlign = 'left'; ctx.fillStyle = C.ink; ctx.fillText('góc nghiêng của gậy theo thời gian (10 giây gần nhất)', l0 + 6, t0 - 5);
        ctx.save(); ctx.beginPath(); ctx.rect(l0, t0, w, h); ctx.clip();
        ctx.strokeStyle = C.sea; ctx.lineWidth = 2; ctx.beginPath();
        hist.forEach((a, i) => { const xx = l0 + i / 499 * w; i ? ctx.lineTo(xx, Y(a)) : ctx.moveTo(xx, Y(a)); }); ctx.stroke(); ctx.restore();
      }
    }
  },
});
})();
