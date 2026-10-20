/* =====================================================================
   Robotics: minh họa "RRT: rải cây ngẫu nhiên" (id: rrt, trang 4-tim-duong.html)
   Mỗi lần: bốc ngẫu nhiên một điểm (hoặc chính đích, với xác suất "thiên về đích"),
   tìm nút gần nhất trên cây, mọc một nhánh dài tối đa "bước" về phía điểm đó nếu nhánh hổng đụng vật cản.
   Khi một nút mới đủ gần đích và nối thẳng được: có đường. "Làm mượt": lặp lại việc nối tắt hai điểm ngẫu nhiên trên đường.
   Chạy độc lập: lib/demos/run.html?demo=rrt
   EDIT: vật cản ở OBS (x, y, rộng, cao, mét), không gian 10 × 7 m.
   ===================================================================== */
(() => {
const { COLORS: C, watchCanvas, setTxt, num, range, loopWhenVisible } = TFG;
const RW = 10, RH = 7, S0 = [0.6, 0.6], G0 = [9.3, 6.3], M = 0.12;
const OBS = [[2, 0, 0.6, 5.2], [4.4, 1.8, 0.6, 5.2], [6.8, 0, 0.6, 5.0], [7.4, 5.6, 1.2, 0.4], [0.8, 3.0, 0.9, 0.5]];
const free = (x, y) => x > M && y > M && x < RW - M && y < RH - M && !OBS.some(([a, b, w, h]) => x > a - M && x < a + w + M && y > b - M && y < b + h + M);
const segFree = (p, q) => { const n = Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / 0.04); for (let i = 0; i <= n; i++) { const t = i / n; if (!free(p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1]))) return false; } return true; };
const len = P => P.reduce((s, p, i) => i ? s + Math.hypot(p[0] - P[i - 1][0], p[1] - P[i - 1][1]) : 0, 0);
TFG.demo('rrt', {
  html: `<div class="demo-title"><h4>RRT: rải cây ngẫu nhiên</h4><span>Cây mọc từ điểm đầu, lan khắp chỗ trống cho tới khi chạm đích</span></div>
    <div class="demo-body">
      <div class="stagebox"><canvas id="rtCv" class="ar" role="img" aria-label="Không gian 10 × 7 mét có các bức vách xám; cây RRT màu xanh mọc từ góc dưới trái; đường vàng nối tới đích ở góc trên phải."></canvas></div>
      <div class="panel">
        <div class="btnrow">
          <button class="btn" type="button" id="rtRun" aria-pressed="false">Mọc cây</button>
          <button class="btn" type="button" id="rtSmooth">Làm mượt đường</button>
          <button class="btn" type="button" id="rtReset">Làm lại</button>
        </div>
        <div class="ctrl"><label for="rtStep">Bước mọc nhánh</label><output for="rtStep"></output>
          <input type="range" id="rtStep" min="0.15" max="1.5" step="0.05" value="0.5"></div>
        <div class="ctrl"><label for="rtBias">Thiên về đích</label><output for="rtBias"></output>
          <input type="range" id="rtBias" min="0" max="0.5" step="0.05" value="0.05"></div>
        <dl class="readout">
          <dt>Số nút trên cây</dt><dd id="rtN" class="big">—</dd>
          <dt>Độ dài đường</dt><dd id="rtL">—</dd>
          <dt>Sau khi làm mượt</dt><dd id="rtLs">—</dd>
        </dl>
        <p class="note-s">RRT hổng chia lưới, hổng cần biết hình dạng vật cản; nó chỉ cần hỏi được “điểm này có đụng hông?”. Nhờ vậy nó xài được cho cánh tay 6, 7 khớp, nơi lưới ô là bất khả thi. Đường RRT tìm ra thường ngoằn ngoèo, nên hay được làm mượt sau đó. Thử tăng “thiên về đích”: tới lẹ hơn ở bản đồ thoáng, nhưng dễ kẹt ở bản đồ có nhiều ngõ cụt.</p>
      </div>
    </div>`,
  init(el) {
    const cv = document.getElementById('rtCv'), st = {};
    const step = range('rtStep', { show: v => num(v, 2) + ' m' }), bias = range('rtBias', { show: v => Math.round(v * 100) + ' %' });
    let nodes = [{ p: S0, par: -1 }], path = null, smooth = null, running = false, acc = 0, tries = 0;
    const reset = () => { nodes = [{ p: S0, par: -1 }]; path = null; smooth = null; tries = 0; draw(); };
    const runB = document.getElementById('rtRun');
    const setRun = v => { running = v; runB.setAttribute('aria-pressed', v); runB.textContent = v ? 'Dừng' : (path ? 'Đã tới đích' : 'Mọc cây'); };
    runB.onclick = () => { if (!path) setRun(!running); };
    document.getElementById('rtReset').onclick = () => { setRun(false); reset(); setRun(false); };
    document.getElementById('rtSmooth').onclick = () => {
      if (!path) return; let P = (smooth || path).slice();
      for (let k = 0; k < 200 && P.length > 2; k++) { const i = Math.floor(Math.random() * (P.length - 2)), j = i + 2 + Math.floor(Math.random() * (P.length - i - 2)); if (j < P.length && segFree(P[i], P[j])) P = P.slice(0, i + 1).concat(P.slice(j)); }
      smooth = P; draw();
    };
    function grow() {
      if (path) return; tries++;
      const q = Math.random() < bias.get() ? G0 : [Math.random() * RW, Math.random() * RH];
      let bi = 0, bd = Infinity; nodes.forEach((n, i) => { const d = (n.p[0] - q[0]) ** 2 + (n.p[1] - q[1]) ** 2; if (d < bd) { bd = d; bi = i; } });
      const a = nodes[bi].p, d = Math.sqrt(bd), s = Math.min(step.get(), d); if (d < 1e-6) return;
      const nw = [a[0] + (q[0] - a[0]) / d * s, a[1] + (q[1] - a[1]) / d * s];
      if (!segFree(a, nw)) return;
      nodes.push({ p: nw, par: bi });
      if (Math.hypot(nw[0] - G0[0], nw[1] - G0[1]) < step.get() && segFree(nw, G0)) {
        nodes.push({ p: G0, par: nodes.length - 1 });
        path = []; let k = nodes.length - 1; while (k >= 0) { path.push(nodes[k].p); k = nodes[k].par; } path.reverse(); setRun(false);
      }
    }
    loopWhenVisible(el, dt => { if (!running) return; acc += dt; if (acc < 0.03) return; acc = 0; for (let i = 0; i < 4; i++) grow(); draw(); });
    watchCanvas(cv, st, () => draw());
    step.upd(); bias.upd(); reset();
    function draw() {
      setTxt('rtN', nodes.length); setTxt('rtL', path ? num(len(path), 3) + ' m' : '—'); setTxt('rtLs', smooth ? num(len(smooth), 3) + ' m' : '—');
      if (!st.ctx) return;
      const { ctx, W, H } = st; ctx.clearRect(0, 0, W, H);
      const s = Math.min((W - 30) / RW, (H - 30) / RH), ox = (W - RW * s) / 2, oy = (H + RH * s) / 2, X = x => ox + x * s, Y = y => oy - y * s;
      ctx.fillStyle = '#fff'; ctx.fillRect(X(0), Y(RH), RW * s, RH * s);
      ctx.fillStyle = '#59606B'; OBS.forEach(([a, b, w, h]) => ctx.fillRect(X(a), Y(b + h), w * s, h * s));
      ctx.strokeStyle = C.ink; ctx.lineWidth = 2.5; ctx.strokeRect(X(0), Y(RH), RW * s, RH * s);
      ctx.strokeStyle = 'rgba(55,135,196,.7)'; ctx.lineWidth = 1.2; ctx.beginPath();
      nodes.forEach(n => { if (n.par < 0) return; const p = nodes[n.par].p; ctx.moveTo(X(p[0]), Y(p[1])); ctx.lineTo(X(n.p[0]), Y(n.p[1])); }); ctx.stroke();
      ctx.fillStyle = C.sea; nodes.forEach(n => ctx.fillRect(X(n.p[0]) - 1.5, Y(n.p[1]) - 1.5, 3, 3));
      const pl = (P, col, w, dash) => { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.setLineDash(dash || []); ctx.lineJoin = 'round'; ctx.beginPath(); P.forEach((p, i) => i ? ctx.lineTo(X(p[0]), Y(p[1])) : ctx.moveTo(X(p[0]), Y(p[1]))); ctx.stroke(); ctx.setLineDash([]); };
      if (path) pl(path, C.gold, smooth ? 2.5 : 4, smooth ? [6, 4] : null);
      if (smooth) pl(smooth, '#3f9d6a', 4);
      [[S0, '#3f9d6a'], [G0, C.pos]].forEach(([p, col]) => { ctx.fillStyle = col; ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(X(p[0]), Y(p[1]), 8, 0, 7); ctx.fill(); ctx.stroke(); });
      ctx.fillStyle = C.muted; ctx.font = '11.5px "Be Vietnam Pro", sans-serif'; ctx.textAlign = 'left';
      ctx.fillText('10 m × 7 m; xanh lá: đầu, đỏ: đích' + (smooth ? '; đường xanh lá: đã làm mượt' : ''), X(0), Y(RH) - 6);
    }
  },
});
})();
