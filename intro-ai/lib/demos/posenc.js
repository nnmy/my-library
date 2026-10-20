/* =====================================================================
   AI: minh họa "Mã hóa vị trí hình sin" (id: posenc, trang 2-transformer.html)
   PE(pos, 2i) = sin(pos / 10000^(2i/d)), PE(pos, 2i+1) = cos(...).
   Trên: heatmap vị trí × chiều. Dưới: độ tương đồng cos giữa vị trí đã chọn và mọi vị trí.
   Chạy độc lập: lib/demos/run.html?demo=posenc
   ===================================================================== */
(() => {
const { COLORS: C, range, watchCanvas, diverge, setTxt, num, xy } = TFG;
const P = 100;
const pe = (pos, d) => { const v = new Float64Array(d); for (let i = 0; i < d; i += 2) { const w = pos / Math.pow(10000, i / d); v[i] = Math.sin(w); if (i + 1 < d) v[i + 1] = Math.cos(w); } return v; };

TFG.demo('posenc', {
  html: `<div class="demo-title"><h4>Mã hóa vị trí hình sin</h4><span>Chỉnh số chiều d, chọn một vị trí (hoặc bấm lên heatmap)</span></div>
    <div class="demo-body">
      <div class="stagebox">
        <canvas id="cvPE" class="ar" role="img" aria-label="Heatmap mã hóa vị trí: trục dọc là vị trí, trục ngang là chiều embedding."></canvas>
        <canvas id="cvPEs" class="profile" role="img" aria-label="Đồ thị độ tương đồng giữa vị trí đã chọn và các vị trí khác."></canvas>
      </div>
      <div class="panel">
        <div class="ctrl"><label for="peD">Số chiều d</label><output for="peD"></output>
          <input type="range" id="peD" min="8" max="128" step="8" value="64"></div>
        <div class="ctrl"><label for="peP">Vị trí đã chọn</label><output for="peP"></output>
          <input type="range" id="peP" min="0" max="${P - 1}" step="1" value="30"></div>
        <dl class="readout">
          <dt>Bước sóng ngắn nhất</dt><dd>2π ≈ 6,3 vị trí</dd>
          <dt>Bước sóng dài nhất</dt><dd id="peL">—</dd>
          <dt>cos(PE₃₀, PE₃₁)</dt><dd id="peN">—</dd>
        </dl>
        <p class="note-s">Mỗi cặp cột là một đồng hồ quay với tốc độ khác nhau: cột trái quay nhanh (như kim giây), cột phải quay rất chậm (như kim giờ). Bộ "giờ" của tất cả đồng hồ cho biết vị trí. Đồ thị dưới: vị trí càng gần thì vector càng giống nhau, nên mô hình suy ra được khoảng cách tương đối.</p>
      </div>
    </div>`,
  init() {
    const cv = document.getElementById('cvPE'), cs = document.getElementById('cvPEs'); const st = {}, ss = {};
    const d = range('peD', { show: v => v, onInput: () => draw() });
    const p = range('peP', { show: v => v, onInput: () => draw() });
    let box = null;
    cv.addEventListener('pointerdown', e => { if (!box) return; const [, y] = xy(cv, e); const k = Math.floor((y - box.y) / box.h * P); if (k >= 0 && k < P) p.set(k); });
    watchCanvas(cv, st, draw); watchCanvas(cs, ss, draw);
    function draw() {
      const D = d.get(), sel = p.get();
      const M = [...Array(P)].map((_, i) => pe(i, D));
      if (st.ctx) {
        const { ctx, W, H } = st; ctx.clearRect(0, 0, W, H);
        const l = 46, t = 14, w = W - l - 14, h = H - t - 30; box = { y: t, h };
        const cw = w / D, ch = h / P;
        for (let i = 0; i < P; i++) for (let j = 0; j < D; j++) { ctx.fillStyle = diverge(M[i][j]); ctx.fillRect(l + j * cw, t + i * ch, Math.ceil(cw), Math.ceil(ch)); }
        ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5; ctx.strokeRect(l, t, w, h);
        ctx.strokeStyle = C.gold; ctx.lineWidth = 3; ctx.strokeRect(l - 2, t + sel * ch - 1, w + 4, ch + 2);
        ctx.fillStyle = C.ink; ctx.font = '12px "Be Vietnam Pro", sans-serif'; ctx.textAlign = 'right';
        [0, 25, 50, 75, 99].forEach(k => ctx.fillText(k, l - 6, t + k * ch + ch / 2 + 4));
        ctx.save(); ctx.translate(12, t + h / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'; ctx.fillText('vị trí (pos)', 0, 0); ctx.restore();
        ctx.textAlign = 'left'; ctx.fillText('chiều 0 (nhanh)', l, H - 10); ctx.textAlign = 'right'; ctx.fillText('chiều ' + (D - 1) + ' (chậm)', l + w, H - 10);
        ctx.textAlign = 'center'; ctx.fillStyle = C.muted; ctx.fillText('đỏ = −1   trắng = 0   xanh = +1', l + w / 2, H - 10); ctx.textAlign = 'left';
      }
      if (ss.ctx) {
        const { ctx, W, H } = ss; ctx.clearRect(0, 0, W, H);
        const l = 46, r = 14, t = 16, b = 24, w = W - l - r, h = H - t - b;
        const v0 = M[sel], n0 = Math.hypot(...v0);
        const sim = M.map(v => v.reduce((s, x, k) => s + x * v0[k], 0) / (Math.hypot(...v) * n0));
        const Y = s => t + (1 - (s + 0.2) / 1.2) * h;
        ctx.strokeStyle = C.line; ctx.beginPath(); ctx.moveTo(l, Y(0)); ctx.lineTo(l + w, Y(0)); ctx.stroke();
        ctx.strokeStyle = C.sea; ctx.lineWidth = 2; ctx.beginPath();
        sim.forEach((s, i) => { const x = l + i / (P - 1) * w; i ? ctx.lineTo(x, Y(s)) : ctx.moveTo(x, Y(s)); }); ctx.stroke();
        const xs = l + sel / (P - 1) * w; ctx.strokeStyle = C.gold; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(xs, t); ctx.lineTo(xs, t + h); ctx.stroke();
        ctx.fillStyle = C.ink; ctx.font = '12px "Be Vietnam Pro", sans-serif'; ctx.textAlign = 'right';
        ctx.fillText('1', l - 6, Y(1) + 4); ctx.fillText('0', l - 6, Y(0) + 4);
        ctx.textAlign = 'left'; ctx.fillText('cos(PE_' + sel + ', PE_j) theo vị trí j', l + 6, t + 2);
      }
      setTxt('peL', '≈ ' + Math.round(2 * Math.PI * Math.pow(10000, (D - 2) / D)).toLocaleString('vi-VN') + ' vị trí');
      const a = pe(30, D), b2 = pe(31, D);
      setTxt('peN', num(a.reduce((s, x, k) => s + x * b2[k], 0) / (Math.hypot(...a) * Math.hypot(...b2)), 3));
    }
    p.upd(); d.upd();
  },
});
})();
