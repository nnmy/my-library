/* =====================================================================
   AI: minh họa "Lăn xuống dốc" (id: grad-descent, trang 1-cnn.html)
   Một trọng số w, hàm mất mát L(w) có một đáy chính và hai đáy phụ.
   Mỗi bước: w <- w − lr · L'(w). Kéo trái banh để đổi điểm xuất phát.
   Chạy độc lập: lib/demos/run.html?demo=grad-descent
   ===================================================================== */
(() => {
const { COLORS: C, watchCanvas, setTxt, num, range, drag, arrow, loopWhenVisible } = TFG;
const f = w => 0.15 * (w - 2) ** 2 + 0.8 * Math.sin(1.6 * w) + 2;
const df = w => 0.3 * (w - 2) + 1.28 * Math.cos(1.6 * w);
const W0 = -4, W1 = 8, LMIN = 0.6, LMAX = 8;

TFG.demo('grad-descent', {
  html: `<div class="demo-title"><h4>Lăn xuống dốc</h4><span>Kéo trái banh, chỉnh tốc độ học, rồi cho nó lăn</span></div>
    <div class="demo-body">
      <div class="stagebox">
        <canvas id="gdCv" class="ar" role="img" aria-label="Đường cong độ lỗi theo trọng số w, một trái banh và các bước nhảy của gradient descent."></canvas>
        <span class="hint" style="top:6px;bottom:auto;left:auto;right:10px">Kéo trái banh qua lại để chọn chỗ xuất phát</span>
      </div>
      <div class="panel">
        <div class="ctrl"><label for="gdLr">Tốc độ học (learning rate)</label><output for="gdLr"></output>
          <input type="range" id="gdLr" min="-2" max="0.6" step="0.02" value="-0.7"></div>
        <div class="btnrow">
          <button class="btn" type="button" id="gdStep">Bước 1 lần</button>
          <button class="btn" type="button" id="gdRun" aria-pressed="false">Tự chạy</button>
          <button class="btn" type="button" id="gdReset">Về chỗ cũ</button>
        </div>
        <dl class="readout">
          <dt>Trọng số w</dt><dd id="gdW">—</dd>
          <dt>Độ lỗi L(w)</dt><dd id="gdL" class="big">—</dd>
          <dt>Độ dốc L′(w)</dt><dd id="gdD">—</dd>
          <dt>Số bước</dt><dd id="gdN">0</dd>
        </dl>
        <p class="note-s">Đường đỏ ngắn là độ dốc tại chỗ trái banh đứng. Dốc xuống bên phải thì bước qua phải, và ngược lại. Bước dài = tốc độ học × độ dốc. Thử ba cỡ: nhỏ xíu (bò chậm rì), vừa (xuống đáy ngon lành), quá lớn (nhảy loạn xạ). Thử xuất phát ở bên trái hoặc bên phải để thấy banh bị kẹt ở đáy phụ.</p>
      </div>
    </div>`,
  init(el) {
    const cv = document.getElementById('gdCv'), st = {};
    let start = -3.3, w = start, steps = 0, trail = [w], running = false;
    const lr = range('gdLr', { map: v => Math.pow(10, v), show: v => num(v, 2), onInput: () => draw() });
    const runBtn = document.getElementById('gdRun');
    const setRun = v => { running = v; runBtn.setAttribute('aria-pressed', v); runBtn.textContent = v ? 'Dừng' : 'Tự chạy'; };
    const step = () => { w = w - lr.get() * df(w); w = Math.max(W0 - 6, Math.min(W1 + 6, w)); steps++; trail.push(w); if (trail.length > 60) trail.shift(); };
    document.getElementById('gdStep').onclick = () => { step(); draw(); };
    runBtn.onclick = () => setRun(!running);
    document.getElementById('gdReset').onclick = () => { setRun(false); w = start; steps = 0; trail = [w]; draw(); };
    let acc = 0;
    loopWhenVisible(el, dt => { if (!running) return; acc += dt; if (acc < 0.25) return; acc = 0; step(); draw(); if (steps > 300) setRun(false); });

    let G = null; // hệ tọa độ hiện tại
    drag(cv, {
      pick: (x, y) => G && Math.hypot(x - G.X(w), y - G.Y(f(w)) + 11) < 22 ? 'ball' : null,
      move: (o, x) => { setRun(false); start = w = Math.max(W0, Math.min(W1, G.inv(x))); steps = 0; trail = [w]; draw(); },
    });
    watchCanvas(cv, st, () => draw());
    lr.upd(); draw();

    function draw() {
      if (!st.ctx) return;
      const { ctx, W, H } = st; ctx.clearRect(0, 0, W, H);
      const l = 46, r = 16, t = 22, b = 36, pw = W - l - r, ph = H - t - b;
      const X = v => l + (v - W0) / (W1 - W0) * pw, Y = v => t + (LMAX - v) / (LMAX - LMIN) * ph;
      G = { X, Y, inv: x => W0 + (x - l) / pw * (W1 - W0) };
      // trục
      ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.fillStyle = C.muted; ctx.font = '12px "Be Vietnam Pro", sans-serif'; ctx.textAlign = 'center';
      for (let v = -4; v <= 8; v += 2) { ctx.beginPath(); ctx.moveTo(X(v), t); ctx.lineTo(X(v), t + ph); ctx.stroke(); ctx.fillText(v, X(v), t + ph + 16); }
      ctx.fillText('trọng số w', l + pw / 2, H - 4);
      ctx.save(); ctx.translate(14, t + ph / 2); ctx.rotate(-Math.PI / 2); ctx.fillText('độ lỗi L', 0, 0); ctx.restore();
      // vùng dưới đường cong
      ctx.beginPath(); ctx.moveTo(X(W0), t + ph);
      for (let i = 0; i <= 300; i++) { const v = W0 + i / 300 * (W1 - W0); ctx.lineTo(X(v), Y(f(v))); }
      ctx.lineTo(X(W1), t + ph); ctx.closePath(); ctx.fillStyle = C.mist; ctx.fill();
      ctx.strokeStyle = C.ink; ctx.lineWidth = 2.2; ctx.beginPath();
      for (let i = 0; i <= 300; i++) { const v = W0 + i / 300 * (W1 - W0); i ? ctx.lineTo(X(v), Y(f(v))) : ctx.moveTo(X(v), Y(f(v))); } ctx.stroke();
      // nhãn đáy
      ctx.fillStyle = C.muted; ctx.font = '12px "Be Vietnam Pro", sans-serif';
      [[-0.57, 'đáy phụ'], [2.83, 'đáy chính'], [6.08, 'đáy phụ']].forEach(([v, s]) => ctx.fillText(s, X(v), Y(f(v)) + 20));
      // vệt các bước
      ctx.save(); ctx.beginPath(); ctx.rect(l, t - 10, pw, ph + 10); ctx.clip();
      for (let i = 1; i < trail.length; i++) {
        const a = trail[i - 1], c2 = trail[i];
        ctx.globalAlpha = 0.25 + 0.75 * i / trail.length;
        arrow(ctx, X(a), Y(f(a)) - 11, X(c2), Y(f(c2)) - 11, C.sea, 1.6, 7);
      }
      ctx.globalAlpha = 1;
      // tiếp tuyến
      const d = df(w), dx = 0.9;
      ctx.strokeStyle = C.pos; ctx.lineWidth = 2.5; ctx.beginPath();
      ctx.moveTo(X(w - dx), Y(f(w) - d * dx)); ctx.lineTo(X(w + dx), Y(f(w) + d * dx)); ctx.stroke();
      // trái banh
      const bx = X(w), by = Y(f(w)) - 11;
      ctx.fillStyle = C.gold; ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(bx, by, 10, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
      ctx.restore();
      if (w < W0 || w > W1) { ctx.fillStyle = C.pos; ctx.textAlign = 'center'; ctx.font = '600 14px "Be Vietnam Pro", sans-serif'; ctx.fillText('Văng ra ngoài rồi! Tốc độ học quá lớn.', l + pw / 2, t + 16); }
      setTxt('gdW', num(w, 3)); setTxt('gdL', num(f(w), 3)); setTxt('gdD', num(d, 3)); setTxt('gdN', steps);
    }
  },
});
})();
