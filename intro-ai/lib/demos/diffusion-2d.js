/* =====================================================================
   AI: minh họa "Khử nhiễu: từ nhiễu về dữ liệu" (id: diffusion-2d, trang 3-generative.html)
   Dữ liệu 2D là hỗn hợp Gauss (hai lớp: "vòng tròn" và "chữ thập"). Với dữ liệu này, phân phối
   nhiễu p_t cũng là hỗn hợp Gauss nên SCORE ∇log p_t(x) tính được CHÍNH XÁC, không cần huấn luyện.
   Trong mô hình thật, score (hay nhiễu ε) do mạng nơ-ron ước lượng; mọi thứ còn lại giống hệt.
   Lấy mẫu ngược DDPM:  x_{t−1} = (x_t + β_t·s(x_t, t)) / √α_t + √β_t·z
   Classifier-free guidance: s = s_uncond + w·(s_cond − s_uncond)
   Chạy độc lập: lib/demos/run.html?demo=diffusion-2d
   ===================================================================== */
(() => {
const { COLORS: C, range, watchCanvas, setTxt, rng, num, loopWhenVisible, REDUCED } = TFG;
const T = 200, M = 700, SIG0 = 0.07;
const beta = new Float64Array(T + 1), ab = new Float64Array(T + 1); ab[0] = 1;
for (let t = 1; t <= T; t++) { beta[t] = 1e-4 + (0.06 - 1e-4) * (t - 1) / (T - 1); ab[t] = ab[t - 1] * (1 - beta[t]); }
// thành phần của hỗn hợp: [x, y, lớp]
const COMP = [];
for (let i = 0; i < 32; i++) COMP.push([1.5 * Math.cos(i / 32 * 2 * Math.PI), 1.5 * Math.sin(i / 32 * 2 * Math.PI), 0]);
for (let i = -4; i <= 4; i++) { COMP.push([i * 0.2, 0, 1]); if (i) COMP.push([0, i * 0.2, 1]); }
const NC = [COMP.filter(c => c[2] === 0).length, COMP.filter(c => c[2] === 1).length];
const LOGPI = COMP.map(c => Math.log(0.5 / NC[c[2]]));

/* score có hướng dẫn tại (x, y), thời điểm t */
function score(x, y, t, cond, w) {
  const a = Math.sqrt(ab[t]), v = ab[t] * SIG0 * SIG0 + (1 - ab[t]);
  const lw = new Float64Array(COMP.length); let mU = -Infinity, mC = -Infinity;
  for (let i = 0; i < COMP.length; i++) {
    const dx = x - a * COMP[i][0], dy = y - a * COMP[i][1];
    lw[i] = LOGPI[i] - (dx * dx + dy * dy) / (2 * v);
    if (lw[i] > mU) mU = lw[i];
    if (COMP[i][2] === cond && lw[i] > mC) mC = lw[i];
  }
  let sU = 0, uX = 0, uY = 0, sC = 0, cX = 0, cY = 0;
  for (let i = 0; i < COMP.length; i++) {
    const mx = a * COMP[i][0] - x, my = a * COMP[i][1] - y, e = Math.exp(lw[i] - mU);
    sU += e; uX += e * mx; uY += e * my;
    if (COMP[i][2] === cond) { const f = Math.exp(lw[i] - mC); sC += f; cX += f * mx; cY += f * my; }
  }
  const su = [uX / sU / v, uY / sU / v];
  if (cond < 0) return su;
  const sc = [cX / sC / v, cY / sC / v];
  return [su[0] + w * (sc[0] - su[0]), su[1] + w * (sc[1] - su[1])];
}

TFG.demo('diffusion-2d', {
  html: `<div class="demo-title"><h4>Khử nhiễu: từ nhiễu về dữ liệu</h4><span>Bấm "Lấy mẫu"; đổi điều kiện và độ mạnh guidance</span></div>
    <div class="demo-body">
      <div class="stagebox"><canvas id="cvD2" class="ar" role="img" aria-label="Đám điểm 2D di chuyển từ nhiễu Gauss về hình vòng tròn và chữ thập; mũi tên xám là trường score."></canvas>
        <div class="hint">Chấm xám nhạt: hình dạng của dữ liệu thật</div></div>
      <div class="panel">
        <div class="btnrow">
          <button class="btn" type="button" id="d2R">▶ Lấy mẫu (ngược)</button>
          <button class="btn" type="button" id="d2F">Thêm nhiễu (thuận)</button>
        </div>
        <div class="ctrl"><label for="d2C">Điều kiện (prompt)</label>
          <select id="d2C"><option value="-1">Không điều kiện</option><option value="0">"vòng tròn"</option><option value="1">"chữ thập"</option></select></div>
        <div class="ctrl"><label for="d2W">Guidance scale w</label><output for="d2W"></output>
          <input type="range" id="d2W" min="0" max="8" step="0.1" value="1"></div>
        <div class="checks"><label><input type="checkbox" id="d2A" checked> Hiện trường score</label></div>
        <dl class="readout">
          <dt>Bước t</dt><dd class="big" id="d2T">—</dd>
          <dt>Trên vòng tròn</dt><dd id="d2P0">—</dd>
          <dt>Trên chữ thập</dt><dd id="d2P1">—</dd>
          <dt>Lạc ra ngoài</dt><dd id="d2P2">—</dd>
        </dl>
        <p class="note-s">Mỗi mũi tên chỉ từ một điểm nhiễu về vị trí dữ liệu "đoán được" từ nó. Với điều kiện "chữ thập": w = 0 bỏ qua prompt, w = 1 là mô hình có điều kiện thông thường, w lớn hơn đẩy mẫu về đúng lớp mạnh hơn nhưng co cụm, kém đa dạng.</p>
      </div>
    </div>`,
  init() {
    const cv = document.getElementById('cvD2'); const st = {};
    const wR = range('d2W', { show: v => num(v, 2), onInput: () => { if (!run) draw(); } });
    const cSel = document.getElementById('d2C'), arrows = document.getElementById('d2A');
    cSel.addEventListener('change', () => { if (!run) draw(); }); arrows.addEventListener('change', () => { if (!run) draw(); });
    let R = rng(1), P = new Float64Array(M * 2), X0 = new Float64Array(M * 2), E = new Float64Array(M * 2), t = T, run = null, acc = 0;
    function fromNoise() { for (let k = 0; k < M * 2; k++) P[k] = R.gauss(); t = T; }
    function fromData() {
      for (let m = 0; m < M; m++) { const c = COMP[Math.floor(R() * COMP.length)]; X0[2 * m] = c[0] + SIG0 * R.gauss(); X0[2 * m + 1] = c[1] + SIG0 * R.gauss(); E[2 * m] = R.gauss(); E[2 * m + 1] = R.gauss(); }
      t = 0; for (let k = 0; k < M * 2; k++) P[k] = X0[k];
    }
    fromNoise();
    function reverseStep() {
      const cond = +cSel.value, w = wR.get(), a = Math.sqrt(1 - beta[t]), sb = Math.sqrt(beta[t]);
      for (let m = 0; m < M; m++) {
        const s = score(P[2 * m], P[2 * m + 1], t, cond, w), zx = t > 1 ? R.gauss() : 0, zy = t > 1 ? R.gauss() : 0;
        P[2 * m] = (P[2 * m] + beta[t] * s[0]) / a + sb * zx;
        P[2 * m + 1] = (P[2 * m + 1] + beta[t] * s[1]) / a + sb * zy;
      }
      t--;
    }
    function forwardTo(tt) { const a = Math.sqrt(ab[tt]), b = Math.sqrt(1 - ab[tt]); for (let k = 0; k < M * 2; k++) P[k] = a * X0[k] + b * E[k]; t = tt; }
    document.getElementById('d2R').addEventListener('click', () => { fromNoise(); run = 'rev'; if (REDUCED) { while (t > 0) reverseStep(); run = null; } draw(); });
    document.getElementById('d2F').addEventListener('click', () => { fromData(); run = 'fwd'; if (REDUCED) { forwardTo(T); run = null; } draw(); });
    watchCanvas(cv, st, draw);
    loopWhenVisible(cv, dt => {
      if (!run) return;
      acc += dt * 70;                    // khoảng 70 bước mỗi giây
      while (acc >= 1 && run) {
        acc -= 1;
        if (run === 'rev') { reverseStep(); if (t <= 0) run = null; }
        else { forwardTo(Math.min(T, t + 1)); if (t >= T) run = null; }
      }
      draw();
    });
    function draw() {
      const { ctx, W, H } = st; if (!ctx) return;
      ctx.clearRect(0, 0, W, H);
      const S = Math.min(W, H) / 5.6, ox = W / 2, oy = H / 2, px = x => ox + x * S, py = y => oy - y * S;
      ctx.strokeStyle = C.line; ctx.beginPath(); ctx.moveTo(0, oy); ctx.lineTo(W, oy); ctx.moveTo(ox, 0); ctx.lineTo(ox, H); ctx.stroke();
      ctx.fillStyle = '#D5DAE0'; COMP.forEach(c => { ctx.beginPath(); ctx.arc(px(c[0]), py(c[1]), 5, 0, Math.PI * 2); ctx.fill(); });
      const cond = +cSel.value, w = wR.get();
      if (arrows.checked && t > 0) {
        const step = Math.max(26, Math.min(W, H) / 16), v1 = 1 - ab[t];
        ctx.globalAlpha = 0.55;
        for (let gx = step / 2; gx < W; gx += step) for (let gy = step / 2; gy < H; gy += step) {
          const x = (gx - ox) / S, y = (oy - gy) / S, s = score(x, y, t, cond, w);
          let dx = s[0] * v1 * S, dy = -s[1] * v1 * S; const L = Math.hypot(dx, dy), mx = step * 0.85;
          if (L > mx) { dx *= mx / L; dy *= mx / L; }
          TFG.arrow(ctx, gx, gy, gx + dx, gy + dy, '#7A828C', 1.2, 5);
        }
        ctx.globalAlpha = 1;
      }
      const cnt = [0, 0, 0], a = Math.sqrt(ab[t]), thr = 3 * Math.sqrt(ab[t] * SIG0 * SIG0 + (1 - ab[t])) + 0.02;
      ctx.fillStyle = C.sea;
      for (let m = 0; m < M; m++) {
        const x = P[2 * m], y = P[2 * m + 1];
        ctx.fillRect(px(x) - 1.6, py(y) - 1.6, 3.2, 3.2);
        let best = Infinity, bc = 2; COMP.forEach(c => { const d = Math.hypot(x - a * c[0], y - a * c[1]); if (d < best) { best = d; bc = c[2]; } });
        cnt[best < thr ? bc : 2]++;
      }
      ctx.fillStyle = C.ink; ctx.font = '600 14px "Be Vietnam Pro", sans-serif';
      ctx.fillText(run === 'rev' ? 'đang khử nhiễu…' : run === 'fwd' ? 'đang thêm nhiễu…' : t === 0 ? 'mẫu sinh ra (t = 0)' : t === T ? 'nhiễu Gauss thuần (t = T)' : '', 12, 22);
      setTxt('d2T', t + ' / ' + T);
      ['d2P0', 'd2P1', 'd2P2'].forEach((id, i) => setTxt(id, t > 20 ? '— (còn nhiễu)' : Math.round(cnt[i] / M * 100) + '%'));
    }
  },
});
})();
