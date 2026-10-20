/* =====================================================================
   AI: minh họa "Scaling law kiểu Chinchilla" (id: scaling, trang 5-llm.html)
   L(N, D) = E + A/N^α + B/D^β, với tham số ước lượng của Hoffmann et al. 2022 (cách 3):
   E = 1,69; A = 406,4; B = 410,7; α = 0,34; β = 0,28.  Ngân sách tính toán C ≈ 6·N·D FLOPs.
   Tìm N tối ưu bằng cách quét trên thang log (không dùng công thức đóng).
   Chạy độc lập: lib/demos/run.html?demo=scaling
   ===================================================================== */
(() => {
const { COLORS: C, range, watchCanvas, setTxt, num, sci } = TFG;
const E = 1.69, A = 406.4, B = 410.7, AL = 0.34, BE = 0.28;
const loss = (N, D) => E + A / Math.pow(N, AL) + B / Math.pow(D, BE);
const MODELS = [
  { name: 'GPT-3', N: 175e9, D: 300e9 },
  { name: 'Chinchilla', N: 70e9, D: 1.4e12 },
  { name: 'Gopher', N: 280e9, D: 300e9 },
  { name: 'Llama 3 8B', N: 8e9, D: 15e12 },
];
const fmtN = v => v >= 1e12 ? num(v / 1e12, 3) + ' nghìn tỉ' : v >= 1e9 ? num(v / 1e9, 3) + ' tỉ' : num(v / 1e6, 3) + ' triệu';
function opt(Cb) { let best = null; for (let lg = 6; lg <= 14; lg += 0.005) { const N = 10 ** lg, D = Cb / (6 * N); if (D < 1e6) break; const l = loss(N, D); if (!best || l < best.l) best = { N, D, l }; } return best; }

TFG.demo('scaling', {
  html: `<div class="demo-title"><h4>Scaling law kiểu Chinchilla</h4><span>Chỉnh ngân sách tính toán C; xem mô hình nào "đúng cỡ"</span></div>
    <div class="demo-body">
      <div class="stagebox"><canvas id="cvSc" class="ar" role="img" aria-label="Các đường cong loss theo số tham số N với ngân sách tính toán cố định; điểm tối ưu được đánh dấu."></canvas>
        <div class="hint">Mỗi đường: một ngân sách C cố định (iso-FLOP). Trục ngang: số tham số N (thang log).</div></div>
      <div class="panel">
        <div class="ctrl"><label for="scC">Ngân sách C (FLOPs)</label><output for="scC"></output>
          <input type="range" id="scC" min="19" max="26" step="0.05" value="23.5"></div>
        <dl class="readout">
          <dt>N tối ưu</dt><dd class="big" id="scN">—</dd>
          <dt>D tối ưu (token)</dt><dd id="scD">—</dd>
          <dt>Token / tham số</dt><dd id="scR">—</dd>
          <dt>Loss dự đoán</dt><dd id="scL">—</dd>
        </dl>
        <table class="mini"><thead><tr><th>Mô hình</th><th>C</th><th>Loss</th><th>D/N</th></tr></thead><tbody id="scT"></tbody></table>
        <p class="note-s">Với cùng ngân sách, mô hình quá lớn mà ít dữ liệu (bên phải đáy đường cong) hay quá nhỏ mà nhiều dữ liệu (bên trái) đều cho loss cao hơn. GPT-3 và Gopher nằm lệch về bên phải: "quá lớn so với dữ liệu". Llama 3 8B cố ý lệch sang trái: tốn tính toán khi huấn luyện, nhưng mô hình nhỏ thì rẻ khi chạy.</p>
      </div>
    </div>`,
  init() {
    const cv = document.getElementById('cvSc'); const st = {};
    const cR = range('scC', { map: v => 10 ** v, show: v => sci(v, 3), onInput: () => draw() });
    document.getElementById('scT').innerHTML = MODELS.map(m => `<tr><td>${m.name}</td><td>${sci(6 * m.N * m.D, 2)}</td><td>${loss(m.N, m.D).toFixed(3).replace('.', ',')}</td><td>${m.D / m.N < 10 ? num(m.D / m.N, 2) : Math.round(m.D / m.N)}</td></tr>`).join('');
    watchCanvas(cv, st, draw);
    function draw() {
      const { ctx, W, H } = st; if (!ctx) return;
      ctx.clearRect(0, 0, W, H);
      const l = 52, r = 16, t = 16, b = 46, w = W - l - r, h = H - t - b;
      const x0 = 8, x1 = 13, y0 = 1.85, y1 = 2.9;
      const X = N => l + (Math.log10(N) - x0) / (x1 - x0) * w, Y = L => t + (1 - (L - y0) / (y1 - y0)) * h;
      ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.fillStyle = C.muted; ctx.font = '12px "Be Vietnam Pro", sans-serif';
      for (let k = x0; k <= x1; k++) { ctx.beginPath(); ctx.moveTo(X(10 ** k), t); ctx.lineTo(X(10 ** k), t + h); ctx.stroke(); ctx.textAlign = 'center'; ctx.fillText('10' + String(k).split('').map(c => '⁰¹²³⁴⁵⁶⁷⁸⁹'[c]).join(''), X(10 ** k), t + h + 16); }
      for (let L = 2; L <= 2.85; L += 0.2) { ctx.beginPath(); ctx.moveTo(l, Y(L)); ctx.lineTo(l + w, Y(L)); ctx.stroke(); ctx.textAlign = 'right'; ctx.fillText(num(L, 2), l - 6, Y(L) + 4); }
      ctx.textAlign = 'center'; ctx.fillText('số tham số N', l + w / 2, H - 8);
      ctx.save(); ctx.translate(14, t + h / 2); ctx.rotate(-Math.PI / 2); ctx.fillText('loss', 0, 0); ctx.restore(); ctx.textAlign = 'left';
      ctx.save(); ctx.beginPath(); ctx.rect(l, t, w, h); ctx.clip();
      const curve = (Cb, col, lw) => { ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath(); let s = false;
        for (let lg = x0; lg <= x1; lg += 0.02) { const N = 10 ** lg, D = Cb / (6 * N); if (D < 1e7) break; const y = Y(loss(N, D)); s ? ctx.lineTo(X(N), y) : (ctx.moveTo(X(N), y), s = true); } ctx.stroke(); };
      const opts = [];
      for (let e = 20; e <= 26; e++) { curve(10 ** e, '#C9CED6', 1.2); opts.push(opt(10 ** e)); }
      ctx.strokeStyle = C.gold; ctx.lineWidth = 2; ctx.setLineDash([5, 4]); ctx.beginPath(); opts.forEach((o, i) => i ? ctx.lineTo(X(o.N), Y(o.l)) : ctx.moveTo(X(o.N), Y(o.l))); ctx.stroke(); ctx.setLineDash([]);
      const Cb = cR.get(); curve(Cb, C.sea, 3);
      const o = opt(Cb); ctx.fillStyle = C.pos; ctx.beginPath(); ctx.arc(X(o.N), Y(o.l), 6, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.stroke();
      MODELS.forEach(m => { const x = X(m.N), y = Y(loss(m.N, m.D)); ctx.fillStyle = C.ink; ctx.fillRect(x - 4, y - 4, 8, 8); ctx.font = '600 12px "Be Vietnam Pro", sans-serif'; ctx.fillText(m.name, x + 7, y - 6); });
      ctx.restore();
      ctx.fillStyle = C.gold; ctx.font = '600 12px "Be Vietnam Pro", sans-serif'; ctx.fillText('— — đường tối ưu', l + 8, t + 14);
      setTxt('scN', fmtN(o.N)); setTxt('scD', fmtN(o.D)); setTxt('scR', num(o.D / o.N, 3)); setTxt('scL', num(o.l, 4));
    }
    cR.upd();
  },
});
})();
