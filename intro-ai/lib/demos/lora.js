/* =====================================================================
   AI: minh họa "LoRA: cập nhật hạng thấp" (id: lora, trang 5-llm.html)
   Ma trận cập nhật "lý tưởng" ΔW* (24×24) có cấu trúc gần hạng thấp + nhiễu nhỏ.
   Xấp xỉ hạng r tốt nhất (theo định lý Eckart–Young) tính bằng SVD (phân rã trị riêng Jacobi của ΔWᵀΔW).
   LoRA thật học B, A bằng gradient descent; xấp xỉ SVD là giới hạn tốt nhất mà hạng r có thể đạt.
   Chạy độc lập: lib/demos/run.html?demo=lora
   ===================================================================== */
(() => {
const { COLORS: C, range, watchCanvas, setTxt, diverge, rng, num } = TFG;
const d = 24;

function jacobiEig(S) {           // S đối xứng n×n -> { val, vec (cột) }
  const n = S.length, A = S.map(r => [...r]), V = A.map((_, i) => A.map((_, j) => +(i === j)));
  for (let sweep = 0; sweep < 60; sweep++) {
    let off = 0; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += A[i][j] ** 2;
    if (off < 1e-18) break;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
      if (Math.abs(A[p][q]) < 1e-15) continue;
      const th = (A[q][q] - A[p][p]) / (2 * A[p][q]), t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < n; k++) { const a = A[k][p], b = A[k][q]; A[k][p] = c * a - s * b; A[k][q] = s * a + c * b; }
      for (let k = 0; k < n; k++) { const a = A[p][k], b = A[q][k]; A[p][k] = c * a - s * b; A[q][k] = s * a + c * b; }
      for (let k = 0; k < n; k++) { const a = V[k][p], b = V[k][q]; V[k][p] = c * a - s * b; V[k][q] = s * a + c * b; }
    }
  }
  return { val: A.map((r, i) => r[i]), vec: V };
}

TFG.demo('lora', {
  html: `<div class="demo-title"><h4>LoRA: cập nhật hạng thấp</h4><span>Chỉnh hạng r; so sánh số tham số và sai số</span></div>
    <div class="demo-body">
      <div class="stagebox"><canvas id="cvLo" class="ar" role="img" aria-label="Ba heatmap: ma trận cập nhật cần học, xấp xỉ B·A hạng r, và phần sai số; bên dưới là các giá trị kỳ dị."></canvas></div>
      <div class="panel">
        <div class="ctrl"><label for="loR">Hạng r</label><output for="loR"></output>
          <input type="range" id="loR" min="0" max="24" step="1" value="2"></div>
        <dl class="readout">
          <dt>Tham số: cập nhật toàn phần</dt><dd>${d}×${d} = ${d * d}</dd>
          <dt>Tham số: LoRA (B và A)</dt><dd class="big" id="loP">—</dd>
          <dt>Sai số tương đối</dt><dd id="loE">—</dd>
        </dl>
        <h5 style="margin:2px 0 0;font-size:15px">Với một ma trận thật 4096 × 4096</h5>
        <dl class="readout">
          <dt>Toàn phần</dt><dd>16 777 216</dd>
          <dt>LoRA hạng r</dt><dd class="big" id="loQ">—</dd>
          <dt>Tiết kiệm</dt><dd id="loX">—</dd>
        </dl>
        <p class="note-s">Phần lớn "năng lượng" của ΔW* nằm ở vài giá trị kỳ dị đầu tiên, nên r = 3 đã gần bắt kịp cập nhật toàn phần. Giả thuyết của LoRA: khi tinh chỉnh, phần thay đổi của trọng số cũng có hạng thấp như vậy.</p>
      </div>
    </div>`,
  init() {
    const cv = document.getElementById('cvLo'); const st = {};
    const R = rng(21), rv = () => { const v = [...Array(d)].map(() => R.gauss()); const n = Math.hypot(...v); return v.map(x => x / n); };
    const comps = [[3.2, rv(), rv()], [1.9, rv(), rv()], [1.1, rv(), rv()]];
    const T = [...Array(d)].map((_, i) => [...Array(d)].map((_, j) => comps.reduce((s, [sg, u, v]) => s + sg * u[i] * v[j], 0) + 0.015 * R.gauss()));
    const M = [...Array(d)].map((_, i) => [...Array(d)].map((_, j) => T.reduce((s, row) => s + row[i] * row[j], 0)));
    const { val, vec } = jacobiEig(M);
    const ord = val.map((v, i) => i).sort((a, b) => val[b] - val[a]);
    const sig = ord.map(i => Math.sqrt(Math.max(0, val[i]))), Vc = ord.map(i => vec.map(r => r[i]));
    const Uc = Vc.map((v, k) => T.map(row => row.reduce((s, x, j) => s + x * v[j], 0) / (sig[k] || 1)));
    const nT = Math.sqrt(T.flat().reduce((s, x) => s + x * x, 0));
    const rR = range('loR', { show: v => v, onInput: () => draw() });
    watchCanvas(cv, st, draw);
    function draw() {
      const r = rR.get();
      const Ap = T.map((_, i) => T.map((_, j) => { let s = 0; for (let k = 0; k < r; k++) s += sig[k] * Uc[k][i] * Vc[k][j]; return s; }));
      const Er = T.map((row, i) => row.map((x, j) => x - Ap[i][j]));
      const err = Math.sqrt(Er.flat().reduce((s, x) => s + x * x, 0)) / nT;
      setTxt('loP', '2·' + d + '·' + r + ' = ' + 2 * d * r); setTxt('loE', num(err * 100, 3) + '%');
      setTxt('loQ', (2 * 4096 * r).toLocaleString('vi-VN')); setTxt('loX', r ? '≈ ' + Math.round(4096 / (2 * r)) + ' lần' : '—');
      const { ctx, W, H } = st; if (!ctx) return;
      ctx.clearRect(0, 0, W, H);
      const mx = Math.max(...T.flat().map(Math.abs));
      const sz = Math.min((W - 80) / 3, H - 170), cell = sz / d, y0 = 34;
      const panels = [['ΔW* (cần học)', T], ['B·A (hạng ' + r + ')', Ap], ['Phần còn thiếu', Er]];
      panels.forEach(([lab, Mx], k) => {
        const x0 = 20 + k * (sz + 20);
        for (let i = 0; i < d; i++) for (let j = 0; j < d; j++) { ctx.fillStyle = diverge(Mx[i][j] / mx); ctx.fillRect(x0 + j * cell, y0 + i * cell, Math.ceil(cell), Math.ceil(cell)); }
        ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5; ctx.strokeRect(x0, y0, sz, sz);
        ctx.fillStyle = C.ink; ctx.font = '600 13px "Be Vietnam Pro", sans-serif'; ctx.fillText(lab, x0, y0 - 10);
        if (k < 2) { ctx.font = '20px "Be Vietnam Pro", sans-serif'; ctx.fillStyle = C.muted; ctx.fillText(k ? '+' : '=', x0 + sz + 4, y0 + sz / 2 + 7); }
      });
      // giá trị kỳ dị
      const gy = y0 + sz + 40, gh = H - gy - 26, bw = (W - 60) / d;
      if (gh < 40) return;
      ctx.fillStyle = C.ink; ctx.font = '600 13px "Be Vietnam Pro", sans-serif'; ctx.fillText('Giá trị kỳ dị σ của ΔW* (giữ lại r giá trị đầu)', 20, gy - 10);
      sig.forEach((s, k) => { const h = s / sig[0] * gh; ctx.fillStyle = k < r ? C.sea : '#C9CED6'; ctx.fillRect(30 + k * bw, gy + gh - h, bw - 3, h); });
      ctx.strokeStyle = C.ink; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(26, gy + gh); ctx.lineTo(W - 20, gy + gh); ctx.stroke();
      if (r > 0 && r < d) { const x = 30 + r * bw - 1.5; ctx.strokeStyle = C.pos; ctx.lineWidth = 2; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(x, gy - 4); ctx.lineTo(x, gy + gh + 4); ctx.stroke(); ctx.setLineDash([]); }
      ctx.fillStyle = C.muted; ctx.font = '11.5px "Be Vietnam Pro", sans-serif'; ctx.fillText('σ₁', 30, gy + gh + 14); ctx.fillText('σ₂₄', 30 + 23 * bw, gy + gh + 14);
    }
    rR.upd();
  },
});
})();
