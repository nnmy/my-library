/* =====================================================================
   AI: minh họa "Thêm nhiễu từng bước" (id: diffusion-forward, trang 3-generative.html)
   Quá trình thuận của DDPM: x_t = sqrt(ᾱ_t)·x_0 + sqrt(1 − ᾱ_t)·ε, ε ~ N(0, I), T = 1000.
   Hai lịch trình nhiễu: tuyến tính (Ho et al. 2020) và cosine (Nichol & Dhariwal 2021).
   Chạy độc lập: lib/demos/run.html?demo=diffusion-forward
   ===================================================================== */
(() => {
const { COLORS: C, range, watchCanvas, setTxt, pressGroup, rng, num } = TFG;
const T = 1000, N = 32;
function schedule(kind) {
  const ab = new Float64Array(T + 1); ab[0] = 1;
  if (kind === 'linear') { let p = 1; for (let t = 1; t <= T; t++) { const b = 1e-4 + (0.02 - 1e-4) * (t - 1) / (T - 1); p *= 1 - b; ab[t] = p; } }
  else { const f = t => Math.cos(((t / T) + 0.008) / 1.008 * Math.PI / 2) ** 2; for (let t = 1; t <= T; t++) ab[t] = Math.max(f(t) / f(0), 1e-5); }
  return ab;
}

TFG.demo('diffusion-forward', {
  deps: ['sprites'],
  html: `<div class="demo-title"><h4>Thêm nhiễu từng bước</h4><span>Kéo t từ 0 đến 1000; đổi lịch trình nhiễu</span></div>
    <div class="demo-body">
      <div class="stagebox">
        <canvas id="cvDF" class="ar" role="img" aria-label="Ảnh pixel x_t ở bước t đã chọn, bên dưới là dải ảnh ở các bước 0, 100, ..., 1000."></canvas>
        <canvas id="cvDFs" class="profile" role="img" aria-label="Đồ thị hệ số tín hiệu và hệ số nhiễu theo t."></canvas>
      </div>
      <div class="panel">
        <div class="ctrl"><label for="dfT">Bước t</label><output for="dfT"></output>
          <input type="range" id="dfT" min="0" max="${T}" step="1" value="150"></div>
        <div class="ctrl"><label for="dfI">Ảnh gốc x₀</label>
          <select id="dfI"><option value="scene">Cảnh (nhà, cây, mèo)</option><option value="meo">Mèo</option><option value="nha">Nhà</option><option value="ca">Cá</option></select></div>
        <div class="btnrow" role="group" aria-label="Lịch trình nhiễu">
          <button class="btn" type="button" data-s="linear" aria-pressed="true">Tuyến tính</button>
          <button class="btn" type="button" data-s="cosine" aria-pressed="false">Cosine</button>
          <button class="btn" type="button" id="dfN">Nhiễu mới</button>
        </div>
        <dl class="readout">
          <dt>Hệ số tín hiệu √ᾱₜ</dt><dd class="big" id="dfA">—</dd>
          <dt>Hệ số nhiễu √(1−ᾱₜ)</dt><dd id="dfB">—</dd>
          <dt>SNR = ᾱ/(1−ᾱ)</dt><dd id="dfS">—</dd>
        </dl>
        <p class="note-s">Mỗi bước chỉ thêm một chút nhiễu Gauss, nhưng nhờ tính chất cộng của phân phối Gauss ta nhảy thẳng tới bước t bất kỳ bằng một công thức. Ở t = 1000, ảnh gần như thuần nhiễu. Lịch trình tuyến tính phá hủy thông tin khá nhanh: khoảng một phần tư số bước cuối gần như thuần nhiễu. Lịch trình cosine giảm tín hiệu đều hơn, nên nhiều bước "hữu ích" hơn cho việc học.</p>
      </div>
    </div>`,
  init(root) {
    const cv = document.getElementById('cvDF'), cs = document.getElementById('cvDFs'); const st = {}, ss = {};
    let kind = 'linear', ab = schedule(kind), seed = 5, eps = null, x0 = null;
    const tR = range('dfT', { show: v => v + ' / ' + T, onInput: () => draw() });
    const sel = document.getElementById('dfI');
    const load = () => { x0 = sel.value === 'scene' ? TFG.SPR.scene(N) : TFG.SPR.render(sel.value, N); };
    const noise = () => { const R = rng(seed); eps = new Float32Array(N * N * 3); for (let k = 0; k < eps.length; k++) eps[k] = R.gauss(); };
    sel.addEventListener('change', () => { load(); draw(); });
    const bs = [...root.querySelectorAll('[data-s]')];
    bs.forEach(b => b.addEventListener('click', () => { kind = b.dataset.s; ab = schedule(kind); pressGroup(bs, b); draw(); }));
    document.getElementById('dfN').addEventListener('click', () => { seed++; noise(); draw(); });
    load(); noise();
    const xt = t => { const a = Math.sqrt(ab[t]), b = Math.sqrt(1 - ab[t]), d = new Float32Array(N * N * 3);
      for (let k = 0; k < d.length; k++) { const v = (x0.data[k] * 2 - 1) * a + b * eps[k]; d[k] = (v + 1) / 2; } return { N, data: d }; };
    watchCanvas(cv, st, draw); watchCanvas(cs, ss, draw);
    function draw() {
      const t = tR.get();
      if (st.ctx && x0) {
        const { ctx, W, H } = st; ctx.clearRect(0, 0, W, H);
        const stripH = Math.min(70, (W - 40) / 11 - 4), big = Math.min(H - stripH - 60, W - 40);
        if (big > 40) {
          const bx = (W - big) / 2, by = 12;
          TFG.SPR.draw(ctx, xt(t), bx, by, big); ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.strokeRect(bx, by, big, big);
          ctx.fillStyle = C.ink; ctx.font = '600 14px "Be Vietnam Pro", sans-serif'; ctx.fillText('xₜ', bx + big + 8, by + 16); ctx.font = '12px "Be Vietnam Pro", sans-serif'; ctx.fillText('t = ' + t, bx + big + 8, by + 34);
          const gap = 4, sw = stripH, total = 11 * sw + 10 * gap, sx = (W - total) / 2, sy = by + big + 22;
          for (let i = 0; i <= 10; i++) {
            const tt = i * 100, x = sx + i * (sw + gap);
            TFG.SPR.draw(ctx, xt(tt), x, sy, sw);
            ctx.strokeStyle = Math.abs(tt - t) < 50 ? C.pos : C.ink; ctx.lineWidth = Math.abs(tt - t) < 50 ? 3 : 1; ctx.strokeRect(x, sy, sw, sw);
            ctx.fillStyle = C.muted; ctx.font = '11px "Be Vietnam Pro", sans-serif'; ctx.textAlign = 'center'; ctx.fillText(tt, x + sw / 2, sy + sw + 13); ctx.textAlign = 'left';
          }
        }
      }
      if (ss.ctx) {
        const { ctx, W, H } = ss; ctx.clearRect(0, 0, W, H);
        const l = 40, r = 14, top = 14, b = 24, w = W - l - r, h = H - top - b;
        const X = tt => l + tt / T * w, Y = v => top + (1 - v) * h;
        ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(l, Y(0)); ctx.lineTo(l + w, Y(0)); ctx.moveTo(l, Y(1)); ctx.lineTo(l + w, Y(1)); ctx.stroke();
        [[tt => Math.sqrt(ab[tt]), C.sea, '√ᾱₜ (tín hiệu)'], [tt => Math.sqrt(1 - ab[tt]), C.pos, '√(1−ᾱₜ) (nhiễu)']].forEach(([f, col, lab], i) => {
          ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath(); for (let tt = 0; tt <= T; tt += 5) { tt ? ctx.lineTo(X(tt), Y(f(tt))) : ctx.moveTo(X(tt), Y(f(tt))); } ctx.stroke();
          ctx.fillStyle = col; ctx.font = '600 12px "Be Vietnam Pro", sans-serif'; ctx.fillText(lab, l + w - 150, top + 12 + i * 15);
        });
        ctx.strokeStyle = C.gold; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(X(t), top); ctx.lineTo(X(t), top + h); ctx.stroke();
        ctx.fillStyle = C.ink; ctx.font = '12px "Be Vietnam Pro", sans-serif'; ctx.textAlign = 'right'; ctx.fillText('1', l - 6, Y(1) + 4); ctx.fillText('0', l - 6, Y(0) + 4);
        ctx.textAlign = 'center'; ctx.fillText('t', l + w / 2, H - 6); ctx.textAlign = 'left';
      }
      setTxt('dfA', num(Math.sqrt(ab[t]), 3)); setTxt('dfB', num(Math.sqrt(1 - ab[t]), 3));
      const snr = ab[t] / Math.max(1e-12, 1 - ab[t]);
      setTxt('dfS', t === 0 ? '∞' : TFG.sci(snr, 3) + ' (' + num(10 * Math.log10(snr), 3) + ' dB)');
    }
    tR.upd();
  },
});
})();
