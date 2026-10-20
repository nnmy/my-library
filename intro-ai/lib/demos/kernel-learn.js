/* =====================================================================
   AI: minh họa "Bộ lọc tự học" (id: kernel-learn, trang 1-cnn.html)
   Có một bộ lọc "đáp án" giấu kín. Ảnh đi qua bộ lọc đáp án cho ra bản đồ mục tiêu.
   Bộ lọc của mình bắt đầu ngẫu nhiên; mỗi bước: tích chập -> so với mục tiêu (MSE)
   -> backprop ra gradient của 9 trọng số -> trừ đi lr × gradient.
     dL/dK[i][j] = (2/n) Σ_{r,c} (out[r][c] − target[r][c]) · x[r+i][c+j]
   Chạy độc lập: lib/demos/run.html?demo=kernel-learn
   ===================================================================== */
(() => {
const { COLORS: C, watchCanvas, diverge, setTxt, num, range, rng, pressGroup, loopWhenVisible } = TFG;
const N = 16, M = N - 2;
const TARGETS = {
  'Cạnh dọc': [[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]],
  'Cạnh ngang': [[-1, -2, -1], [0, 0, 0], [1, 2, 1]],
  'Đường chéo': [[2, -1, -1], [-1, 2, -1], [-1, -1, 2]],
  'Làm nét': [[0, -1, 0], [-1, 5, -1], [0, -1, 0]],
};
// ảnh huấn luyện: vài hình khối và vài chấm lấm tấm (để đủ "đa dạng" cho 9 trọng số)
const R0 = rng(7);
const IMG = [...Array(N)].map((_, r) => [...Array(N)].map((_, c) => {
  if (r >= 3 && r <= 7 && c >= 2 && c <= 6) return 1;
  if ((r - 10) ** 2 + (c - 10) ** 2 <= 9) return 1;
  if (r + c === 14 && r < 6) return 1;
  return R0() < 0.08 ? 1 : 0;
}));
const conv = (x, K) => [...Array(M)].map((_, r) => [...Array(M)].map((_, c) => {
  let s = 0; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) s += x[r + i][c + j] * K[i][j]; return s;
}));

TFG.demo('kernel-learn', {
  html: `<div class="demo-title"><h4>Bộ lọc tự học</h4><span>Backprop tìm lại 9 trọng số của bộ lọc đáp án</span></div>
    <div class="demo-body">
      <div class="stagebox">
        <canvas id="klCv" role="img" aria-label="Bộ lọc đáp án và bộ lọc đang học, bản đồ mục tiêu và bản đồ hiện tại."></canvas>
        <canvas id="klLoss" class="profile" role="img" aria-label="Đồ thị độ lỗi theo số bước học."></canvas>
      </div>
      <div class="panel">
        <div><b style="font-size:15px">Bộ lọc đáp án (giấu kín)</b><div class="btnrow" id="klT" style="margin-top:6px"></div></div>
        <div class="ctrl"><label for="klLr">Tốc độ học (learning rate)</label><output for="klLr"></output>
          <input type="range" id="klLr" min="-2.5" max="-0.2" step="0.05" value="-0.8"></div>
        <div class="btnrow">
          <button class="btn" type="button" id="klStep">Học 1 bước</button>
          <button class="btn" type="button" id="klRun" aria-pressed="false">Tự chạy</button>
          <button class="btn" type="button" id="klReset">Làm lại từ đầu</button>
        </div>
        <dl class="readout">
          <dt>Số bước đã học</dt><dd id="klN">0</dd>
          <dt>Độ lỗi (MSE)</dt><dd id="klL" class="big">—</dd>
          <dt>Trạng thái</dt><dd id="klS">—</dd>
        </dl>
        <p class="note-s">Mạng hổng hề được cho coi bộ lọc đáp án, chỉ được coi ảnh vô và bản đồ mục tiêu. Vậy mà nhờ gradient, 9 con số tự “bò” về đúng chỗ. Kéo tốc độ học lên quá cao để coi chuyện gì xảy ra.</p>
      </div>
    </div>`,
  init(el) {
    const cv = document.getElementById('klCv'), cl = document.getElementById('klLoss'), st = {}, sl = {};
    let T = TARGETS['Cạnh dọc'], Y = conv(IMG, T), K, steps, hist, running = false, seed = 1, dead = false;
    const lr = range('klLr', { map: v => Math.pow(10, v), show: v => num(v, 2) });
    function reset() {
      const r = rng(seed++); K = [...Array(3)].map(() => [...Array(3)].map(() => r.gauss() * 0.5));
      steps = 0; dead = false; hist = [loss()]; info(); draw();
    }
    function loss() { const O = conv(IMG, K); let s = 0; for (let r = 0; r < M; r++) for (let c = 0; c < M; c++) s += (O[r][c] - Y[r][c]) ** 2; return s / (M * M); }
    function step() {
      if (dead) return;
      const O = conv(IMG, K), G = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], n = M * M;
      for (let r = 0; r < M; r++) for (let c = 0; c < M; c++) {
        const e = 2 * (O[r][c] - Y[r][c]) / n; if (!e) continue;
        for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) G[i][j] += e * IMG[r + i][c + j];
      }
      const a = lr.get();
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) K[i][j] -= a * G[i][j];
      steps++; const L = loss(); hist.push(L); if (hist.length > 400) hist.shift();
      if (!isFinite(L) || L > 1e6) { dead = true; setRun(false); }
    }
    function info() {
      const L = hist[hist.length - 1];
      setTxt('klN', steps); setTxt('klL', dead ? 'nổ tung' : num(L, 3));
      setTxt('klS', dead ? 'Phân kỳ: bước quá dài, nhảy qua lố đáy rồi càng lúc càng xa' : L < 1e-3 ? 'Tìm ra rồi! Trùng bộ lọc đáp án' : steps === 0 ? 'Chưa học' : 'Đang học…');
    }
    const tBtns = Object.keys(TARGETS).map(name => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'btn'; b.textContent = name;
      b.onclick = () => { T = TARGETS[name]; Y = conv(IMG, T); pressGroup(tBtns, b); reset(); };
      document.getElementById('klT').appendChild(b); return b;
    });
    pressGroup(tBtns, tBtns[0]);
    const runBtn = document.getElementById('klRun');
    const setRun = v => { running = v; runBtn.setAttribute('aria-pressed', v); runBtn.textContent = v ? 'Dừng' : 'Tự chạy'; };
    document.getElementById('klStep').onclick = () => { step(); info(); draw(); };
    runBtn.onclick = () => { if (dead) reset(); setRun(!running); };
    document.getElementById('klReset').onclick = () => { setRun(false); reset(); };
    let acc = 0;
    loopWhenVisible(el, dt => { if (!running) return; acc += dt; if (acc < 0.06) return; acc = 0; step(); step(); info(); draw(); });
    watchCanvas(cv, st, () => {
      const need = Math.round(Math.min(st.W, 760) * 0.5 + 40);
      if (Math.abs(st.H - need) > 1) { cv.style.height = need + 'px'; return; }
      draw();
    });
    watchCanvas(cl, sl, () => draw());
    lr.upd(); reset();

    function kernel(ctx, x, y, s, Kk, title) {
      const mx = 5;
      ctx.fillStyle = C.ink; ctx.font = '600 12.5px "Be Vietnam Pro", sans-serif'; ctx.textAlign = 'left'; ctx.fillText(title, x, y - 8);
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
        const v = Kk[i][j]; ctx.fillStyle = isFinite(v) ? diverge(v / mx) : '#ccc'; ctx.fillRect(x + j * s, y + i * s, s, s);
        ctx.fillStyle = Math.abs(v) > 3.2 ? '#fff' : C.ink; ctx.textAlign = 'center';
        ctx.font = `600 ${Math.max(10, Math.min(14, s * 0.3))}px ui-monospace, monospace`;
        ctx.fillText(isFinite(v) && Math.abs(v) < 1e4 ? num(v, 2) : '∞', x + j * s + s / 2, y + i * s + s / 2 + 4);
      }
      ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.strokeRect(x, y, 3 * s, 3 * s);
      ctx.strokeStyle = 'rgba(27,25,32,.25)'; ctx.lineWidth = 1; ctx.beginPath();
      for (let i = 1; i < 3; i++) { ctx.moveTo(x + i * s, y); ctx.lineTo(x + i * s, y + 3 * s); ctx.moveTo(x, y + i * s); ctx.lineTo(x + 3 * s, y + i * s); } ctx.stroke();
    }
    function map(ctx, x, y, c, A, mx, title) {
      ctx.fillStyle = C.ink; ctx.font = '600 12.5px "Be Vietnam Pro", sans-serif'; ctx.textAlign = 'left'; ctx.fillText(title, x, y - 8);
      for (let r = 0; r < A.length; r++) for (let q = 0; q < A[0].length; q++) { const v = A[r][q]; ctx.fillStyle = isFinite(v) ? diverge(v / mx) : '#ccc'; ctx.fillRect(x + q * c, y + r * c, c + 0.5, c + 0.5); }
      ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.strokeRect(x, y, A[0].length * c, A.length * c);
    }
    function draw() {
      if (st.ctx && K) {
        const { ctx, W, H } = st; ctx.clearRect(0, 0, W, H);
        const half = (W - 42) / 2, s = Math.min(46, half / 3 * 0.62), c = Math.min((H - 40) / M, (half - 3 * s - 18) / M);
        const mx = Math.max(1, ...Y.flat().map(Math.abs));
        const y0 = 28;
        kernel(ctx, 14, y0, s, T, 'Đáp án');
        map(ctx, 14 + 3 * s + 14, y0, c, Y, mx, 'Bản đồ mục tiêu');
        const x2 = 28 + half;
        kernel(ctx, x2, y0, s, K, 'Bộ lọc đang học');
        map(ctx, x2 + 3 * s + 14, y0, c, conv(IMG, K), mx, 'Bản đồ hiện tại');
        // ảnh vô nhỏ bên dưới bộ lọc đáp án
        const ci = Math.min((H - y0 - 3 * s - 44) / N, 3 * s / N);
        if (ci > 2) {
          ctx.fillStyle = C.muted; ctx.font = '12px "Be Vietnam Pro", sans-serif'; ctx.textAlign = 'left';
          ctx.fillText('Ảnh vô', 14, y0 + 3 * s + 26);
          for (let r = 0; r < N; r++) for (let q = 0; q < N; q++) { ctx.fillStyle = IMG[r][q] ? C.ink : '#fff'; ctx.fillRect(14 + q * ci, y0 + 3 * s + 34 + r * ci, ci, ci); }
          ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5; ctx.strokeRect(14, y0 + 3 * s + 34, N * ci, N * ci);
        }
      }
      if (sl.ctx && hist) {
        const { ctx, W, H } = sl; ctx.clearRect(0, 0, W, H);
        const l = 50, r = 14, t = 18, b = 26, w = W - l - r, h = H - t - b;
        const lg = hist.map(v => Math.log10(Math.max(1e-6, Math.min(1e6, v))));
        const top = Math.max(1, Math.ceil(Math.max(...lg))), bot = -6;
        const Y2 = v => t + (top - v) / (top - bot) * h;
        ctx.strokeStyle = C.line; ctx.fillStyle = C.muted; ctx.font = '11.5px "Be Vietnam Pro", sans-serif'; ctx.textAlign = 'right';
        for (let e = bot; e <= top; e += 2) { ctx.beginPath(); ctx.moveTo(l, Y2(e)); ctx.lineTo(l + w, Y2(e)); ctx.stroke(); ctx.fillText('10' + String(e).replace('-', '⁻').replace(/\d/g, d => '⁰¹²³⁴⁵⁶⁷⁸⁹'[d]), l - 6, Y2(e) + 4); }
        ctx.strokeStyle = C.pos; ctx.lineWidth = 2; ctx.beginPath();
        lg.forEach((v, i) => { const x = l + (hist.length < 2 ? 0 : i / (hist.length - 1)) * w; i ? ctx.lineTo(x, Y2(v)) : ctx.moveTo(x, Y2(v)); }); ctx.stroke();
        ctx.fillStyle = C.ink; ctx.textAlign = 'left'; ctx.fillText('độ lỗi (thang log) theo số bước học', l + 6, t - 4);
      }
    }
  },
});
})();
