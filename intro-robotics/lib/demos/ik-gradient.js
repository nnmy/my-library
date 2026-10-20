/* =====================================================================
   Robotics: minh họa "Động học ngược bằng cách lăn xuống dốc" (id: ik-gradient, trang 1-dong-hoc.html)
   Cánh tay 3 khâu (thừa bậc tự do). Sai số E = ½|p(θ) − đích|². Mỗi bước: θ ← θ − α · Jᵀ (p − đích),
   với J là ma trận Jacobian (đạo hàm vị trí đầu tay theo từng góc khớp) = gradient descent trên E.
   Chạy độc lập: lib/demos/run.html?demo=ik-gradient
   ===================================================================== */
(() => {
const { COLORS: C, watchCanvas, setTxt, num, range, drag, loopWhenVisible, arrow } = TFG;
const L = [0.9, 0.7, 0.5];
TFG.demo('ik-gradient', {
  deps: ['arm-common'],
  html: `<div class="demo-title"><h4>Động học ngược bằng cách lăn xuống dốc</h4><span>Cánh tay 3 khâu tự dò góc, từng bước nhỏ</span></div>
    <div class="demo-body">
      <div class="stagebox">
        <canvas id="igCv" class="ar" role="img" aria-label="Cánh tay ba khâu tiến dần tới điểm đích; mũi tên chỉ sai số."></canvas>
        <canvas id="igErr" class="profile" role="img" aria-label="Đồ thị sai số theo số bước."></canvas>
        <span class="hint" style="top:6px;bottom:auto">Kéo dấu cộng đỏ tới chỗ khác</span>
      </div>
      <div class="panel">
        <div class="ctrl"><label for="igA">Cỡ bước α</label><output for="igA"></output>
          <input type="range" id="igA" min="-1.6" max="0.4" step="0.05" value="-0.6"></div>
        <div class="btnrow">
          <button class="btn" type="button" id="igRun" aria-pressed="true">Dừng</button>
          <button class="btn" type="button" id="igStep">Đi 1 bước</button>
          <button class="btn" type="button" id="igShake">Xáo tư thế</button>
        </div>
        <dl class="readout">
          <dt>Sai số (khoảng cách tới đích)</dt><dd id="igE" class="big">—</dd>
          <dt>Số bước</dt><dd id="igN">0</dd>
          <dt>Góc ba khớp</dt><dd id="igTh">—</dd>
        </dl>
        <p class="note-s">Cánh tay có 3 khớp mà đích chỉ cần 2 con số (x, y), nên có vô số tư thế với tới, như bạn chạm mũi được bằng nhiều cách gập tay. Thuật toán không cần công thức đóng: mỗi bước, nó hỏi “nhích mỗi khớp một chút thì đầu tay lại gần đích hơn bao nhiêu?” rồi nhích theo hướng đó. Bấm “Xáo tư thế” để coi nó tìm ra tư thế khác. Cho α quá lớn thì tay giật qua giật lại.</p>
      </div>
    </div>`,
  init(el) {
    const { fk, view, grid, draw, target, deg, wrap } = TFG.ARM;
    const cv = document.getElementById('igCv'), ce = document.getElementById('igErr'), st = {}, se = {};
    let th = [0.6, 0.6, 0.4], T = [0.6, 1.3], steps = 0, hist = [], running = true, v = null;
    const al = range('igA', { map: x => Math.pow(10, x), show: x => num(x, 2) });
    const runB = document.getElementById('igRun');
    const setRun = r => { running = r; runB.setAttribute('aria-pressed', r); runB.textContent = r ? 'Dừng' : 'Chạy'; };
    runB.onclick = () => setRun(!running);
    document.getElementById('igStep').onclick = () => { step(); draw2(); };
    document.getElementById('igShake').onclick = () => { th = th.map(() => (Math.random() * 2 - 1) * Math.PI); steps = 0; hist = []; draw2(); };
    drag(cv, { pick: () => 'T', move: (o, x, y) => { if (!v) return; T = v.inv(x, y).map(q => Math.max(-2.3, Math.min(2.3, q))); steps = 0; hist = []; draw2(); } });
    const err = () => { const e = fk(th, L)[3]; return Math.hypot(e[0] - T[0], e[1] - T[1]); };
    function step() {
      const pts = fk(th, L), e = pts[3], dx = e[0] - T[0], dy = e[1] - T[1], a = al.get();
      // Jacobian: ∂p/∂θ_j = Σ_{i≥j} L_i (−sin φ_i, cos φ_i) = (−(y_e − y_j), x_e − x_j)
      const g = th.map((_, j) => dx * -(e[1] - pts[j][1]) + dy * (e[0] - pts[j][0]));
      th = th.map((t, j) => wrap(t - a * g[j]));
      steps++; hist.push(err()); if (hist.length > 300) hist.shift();
    }
    let acc = 0;
    loopWhenVisible(el, dt => { if (!running) return; acc += dt; if (acc < 0.05) return; acc = 0; if (err() > 1e-4 || steps < 2) { step(); draw2(); } });
    watchCanvas(cv, st, () => draw2()); watchCanvas(ce, se, () => draw2());
    al.upd(); draw2();
    function draw2() {
      const pts = fk(th, L), e = pts[3];
      setTxt('igE', num(err(), 3) + ' m'); setTxt('igN', steps); setTxt('igTh', th.map(t => Math.round(deg(t)) + '°').join(', '));
      if (st.ctx) {
        const { ctx, W, H } = st; ctx.clearRect(0, 0, W, H);
        v = view(W, H, 2.25); grid(ctx, v, W, H);
        ctx.save(); ctx.strokeStyle = C.sky; ctx.setLineDash([5, 4]); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(v.X(0), v.Y(0), (L[0] + L[1] + L[2]) * v.s, 0, 7); ctx.stroke(); ctx.restore();
        draw(ctx, v, pts, { width: 13 });
        target(ctx, v, T);
        if (err() > 0.03) arrow(ctx, v.X(e[0]), v.Y(e[1]), v.X(T[0]), v.Y(T[1]), C.pos, 1.6, 8);
      }
      if (se.ctx) {
        const { ctx, W, H } = se; ctx.clearRect(0, 0, W, H);
        const l = 46, r = 12, t = 18, b = 22, w = W - l - r, h = H - t - b, mx = Math.max(0.1, ...hist);
        ctx.strokeStyle = C.line; ctx.beginPath(); ctx.moveTo(l, t + h); ctx.lineTo(l + w, t + h); ctx.stroke();
        ctx.fillStyle = C.muted; ctx.font = '11.5px "Be Vietnam Pro", sans-serif'; ctx.textAlign = 'right';
        ctx.fillText(num(mx, 2) + ' m', l - 6, t + 8); ctx.fillText('0', l - 6, t + h);
        ctx.textAlign = 'left'; ctx.fillStyle = C.ink; ctx.fillText('sai số theo số bước', l + 6, t - 5);
        ctx.strokeStyle = C.pos; ctx.lineWidth = 2; ctx.beginPath();
        hist.forEach((q, i) => { const x = l + i / 299 * w, y = t + h - q / mx * h; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke();
      }
    }
  },
});
})();
