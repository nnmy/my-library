/* =====================================================================
   Robotics: minh họa "PID giữ độ cao drone" (id: pid-drone, trang 2-dieu-khien.html)
   Drone 1 chiều: m·a = u − m·g, lực đẩy u bị giới hạn trong [0, UMAX].
   Bộ điều khiển: u = Kp·e + Ki·∫e dt − Kd·v   (e = đích − độ cao; khâu D lấy theo vận tốc đo được,
   giống đạo hàm của e khi đích đứng yên nhưng không bị "giật" khi đổi đích).
   Chống tích phân bão hòa (anti-windup): ngưng cộng dồn khi lực đẩy đã chạm giới hạn.
   Chế độ "Bật–tắt": u = UMAX nếu thấp hơn đích, u = 0 nếu cao hơn.
   Chạy độc lập: lib/demos/run.html?demo=pid-drone
   ===================================================================== */
(() => {
const { COLORS: C, watchCanvas, setTxt, num, range, pressGroup, loopWhenVisible, arrow } = TFG;
const G = 9.81, UMAX = 25, YMAX = 10, WIN = 15, DT = 0.002;
const PRESETS = { 'Bật–tắt': null, 'Chỉ P': [6, 0, 0], 'PD': [6, 0, 4], 'PID': [6, 3, 4] };

TFG.demo('pid-drone', {
  html: `<div class="demo-title"><h4>PID giữ độ cao drone</h4><span>Chỉnh ba núm Kp, Ki, Kd rồi coi drone bay</span></div>
    <div class="demo-body">
      <div class="stagebox"><canvas id="pdCv" class="ar" role="img" aria-label="Bên trái: drone bay lên xuống theo thước đo độ cao. Bên phải: đồ thị độ cao theo thời gian và đường đích."></canvas></div>
      <div class="panel">
        <div class="btnrow" id="pdPre" role="group" aria-label="Kiểu điều khiển"></div>
        <div class="ctrl"><label for="pdKp">Kp (hiện tại)</label><output for="pdKp"></output>
          <input type="range" id="pdKp" min="0" max="20" step="0.5" value="6"></div>
        <div class="ctrl"><label for="pdKi">Ki (quá khứ)</label><output for="pdKi"></output>
          <input type="range" id="pdKi" min="0" max="10" step="0.25" value="3"></div>
        <div class="ctrl"><label for="pdKd">Kd (tương lai)</label><output for="pdKd"></output>
          <input type="range" id="pdKd" min="0" max="10" step="0.25" value="4"></div>
        <div class="ctrl"><label for="pdRef">Độ cao muốn tới</label><output for="pdRef"></output>
          <input type="range" id="pdRef" min="1" max="9" step="0.5" value="5"></div>
        <div class="btnrow">
          <button class="btn" type="button" id="pdGust">Gió giật xuống</button>
          <button class="btn" type="button" id="pdLoad" aria-pressed="false">Chở thêm hàng</button>
          <button class="btn" type="button" id="pdReset">Hạ cánh, làm lại</button>
        </div>
        <dl class="readout">
          <dt>Độ cao</dt><dd id="pdY" class="big">—</dd>
          <dt>Sai số lúc này</dt><dd id="pdE">—</dd>
          <dt>Lực đẩy</dt><dd id="pdU">—</dd>
          <dt>Vọt lố lần đổi đích gần nhất</dt><dd id="pdOv">—</dd>
        </dl>
      </div>
    </div>`,
  init(el) {
    const cv = document.getElementById('pdCv'), st = {};
    let y = 0, v = 0, I = 0, u = 0, t = 0, mass = 1, mode = 'pid', hist = [], acc = 0, stepFrom = 0, stepRef = 5, peak = 0, sampleT = 0;
    const kp = range('pdKp', { show: x => num(x, 3) }), ki = range('pdKi', { show: x => num(x, 3) }), kd = range('pdKd', { show: x => num(x, 3) });
    const ref = range('pdRef', { show: x => num(x, 3) + ' m', onInput: x => markStep(x) });
    const sliders = [kp, ki, kd];
    function markStep(r) { stepFrom = y; stepRef = r; peak = y; }
    const box = document.getElementById('pdPre');
    const btns = Object.keys(PRESETS).map(name => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'btn'; b.textContent = name;
      b.onclick = () => { const p = PRESETS[name]; pressGroup(btns, b); mode = p ? 'pid' : 'bang';
        if (p) { kp.set(p[0]); ki.set(p[1]); kd.set(p[2]); } sliders.forEach(s => { s.el.disabled = !p; s.el.closest('.ctrl').style.opacity = p ? 1 : 0.4; }); };
      box.appendChild(b); return b;
    });
    pressGroup(btns, btns[3]);
    sliders.forEach(s => s.el.addEventListener('input', () => pressGroup(btns, null)));
    document.getElementById('pdGust').onclick = () => { v -= 4; };
    const lb = document.getElementById('pdLoad');
    lb.onclick = () => { mass = mass === 1 ? 1.5 : 1; lb.setAttribute('aria-pressed', mass > 1); };
    document.getElementById('pdReset').onclick = () => { y = 0; v = 0; I = 0; t = 0; hist = []; markStep(ref.get()); };
    kp.upd(); ki.upd(); kd.upd(); ref.upd(); markStep(ref.get());
    function sim(dt) {
      const r = ref.get(), e = r - y;
      if (mode === 'bang') u = e > 0 ? UMAX : 0;
      else {
        const raw = kp.get() * e + ki.get() * I - kd.get() * v;
        u = Math.max(0, Math.min(UMAX, raw));
        if (u === raw || (raw > UMAX && e < 0) || (raw < 0 && e > 0)) I += e * dt;   // anti-windup
      }
      v += (u / mass - G) * dt; y += v * dt;
      if (y <= 0) { y = 0; if (v < 0) v = 0; }
      if (y > YMAX + 2) { y = YMAX + 2; v = Math.min(v, 0); }
      t += dt;
      if (stepRef >= stepFrom) peak = Math.max(peak, y); else peak = Math.min(peak, y);
    }
    loopWhenVisible(el, dt => {
      if (dt <= 0) return; acc += dt;
      while (acc >= DT) { sim(DT); acc -= DT; sampleT += DT; if (sampleT >= 0.03) { sampleT = 0; hist.push([t, y, ref.get()]); while (hist.length && hist[0][0] < t - WIN) hist.shift(); } }
      draw();
    });
    watchCanvas(cv, st, () => draw());
    function draw() {
      const r = ref.get(), span = Math.abs(stepRef - stepFrom);
      setTxt('pdY', num(y, 3) + ' m'); setTxt('pdE', num(r - y, 2) + ' m');
      setTxt('pdU', num(u, 3) + ' N' + (u >= UMAX - 1e-6 ? ' (hết ga)' : u <= 1e-6 ? ' (tắt máy)' : ''));
      setTxt('pdOv', span < 0.25 ? '—' : num(Math.max(0, (stepRef >= stepFrom ? peak - stepRef : stepRef - peak)) / span * 100, 3) + ' %');
      if (!st.ctx) return;
      const { ctx, W, H } = st; ctx.clearRect(0, 0, W, H);
      const t0 = 22, b0 = 34, ph = H - t0 - b0, Y = h => t0 + (1 - h / YMAX) * ph;
      // cột drone
      const cw = Math.min(150, W * 0.26), cx = cw / 2 + 30;
      ctx.fillStyle = C.muted; ctx.font = '11.5px "Be Vietnam Pro", sans-serif'; ctx.textAlign = 'right';
      for (let h = 0; h <= YMAX; h += 2) { ctx.strokeStyle = C.line; ctx.beginPath(); ctx.moveTo(30, Y(h)); ctx.lineTo(W - 12, Y(h)); ctx.stroke(); ctx.fillText(h + ' m', 26, Y(h) + 4); }
      ctx.fillStyle = '#C9D3BC'; ctx.fillRect(30, Y(0), cw, 6);
      ctx.setLineDash([6, 4]); ctx.strokeStyle = C.pos; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(30, Y(r)); ctx.lineTo(W - 12, Y(r)); ctx.stroke(); ctx.setLineDash([]);
      const dy = Math.min(Y(Math.min(y, YMAX + 0.5)), H - b0) - 10;
      // lực đẩy
      if (u > 0.2) { ctx.save(); ctx.globalAlpha = 0.85; arrow(ctx, cx, dy + 12, cx, dy + 12 + u * 2.6, C.gold, 5, 10); ctx.restore(); }
      ctx.fillStyle = C.ink; ctx.fillRect(cx - 26, dy - 6, 52, 14);
      ctx.fillRect(cx - 42, dy - 10, 20, 4); ctx.fillRect(cx + 22, dy - 10, 20, 4);
      ctx.fillStyle = mass > 1 ? C.pos : C.sea; ctx.fillRect(cx - 10, dy + 8, 20, mass > 1 ? 12 : 6);
      // đồ thị
      const gx = cw + 50, gw = W - gx - 14;
      ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5; ctx.strokeRect(gx, t0, gw, ph);
      const tEnd = Math.max(t, WIN), X = tt => gx + (tt - (tEnd - WIN)) / WIN * gw;
      ctx.strokeStyle = C.sea; ctx.lineWidth = 2.4; ctx.beginPath();
      hist.forEach((p, i) => { const yy = Y(Math.min(p[1], YMAX + 1)); i ? ctx.lineTo(X(p[0]), yy) : ctx.moveTo(X(p[0]), yy); }); ctx.stroke();
      ctx.fillStyle = C.muted; ctx.textAlign = 'center'; ctx.fillText('thời gian (15 giây gần nhất) →', gx + gw / 2, H - 10);
      ctx.textAlign = 'left'; ctx.fillStyle = C.pos; ctx.fillText('đích', gx + 6, Y(r) - 6);
      ctx.fillStyle = C.sea; ctx.fillText('độ cao thật', gx + 6, t0 + 14);
    }
  },
});
})();
