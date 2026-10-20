/* =====================================================================
   AI: minh họa "Lượng tử hóa trọng số" (id: quant, trang 5-llm.html)
   Lượng tử hóa đối xứng theo absmax: scale = max|w| / (2^(b−1) − 1), q = round(w / scale), ŵ = q·scale.
   Per-tensor: một scale cho cả tensor. Per-group: một scale cho mỗi nhóm 64 trọng số (như GPTQ / AWQ / GGUF).
   Trọng số giả lập ~ N(0, 0,02²), có thể thêm vài giá trị ngoại lai (outlier).
   Sai số tương đối chỉ tính trên các trọng số thường (không tính ngoại lai), để thấy thiệt hại do scale phình to.
   Đơn vị bộ nhớ: GB = 10⁹ byte.
   Chạy độc lập: lib/demos/run.html?demo=quant
   ===================================================================== */
(() => {
const { COLORS: C, range, watchCanvas, setTxt, pressGroup, rng, num } = TFG;
const NW = 8192, GS = 64;

TFG.demo('quant', {
  html: `<div class="demo-title"><h4>Lượng tử hóa trọng số</h4><span>Chỉnh số bit, cách chia scale, bật giá trị ngoại lai</span></div>
    <div class="demo-body">
      <div class="stagebox"><canvas id="cvQu" class="ar" role="img" aria-label="Histogram trọng số gốc với các mức lượng tử hóa; bên dưới là histogram sai số."></canvas>
        <canvas id="cvQe" class="profile" role="img" aria-label="Histogram sai số lượng tử hóa."></canvas></div>
      <div class="panel">
        <div class="ctrl"><label for="quB">Số bit</label><output for="quB"></output>
          <input type="range" id="quB" min="2" max="8" step="1" value="4"></div>
        <div class="btnrow" role="group" aria-label="Cách chia scale">
          <button class="btn" type="button" data-g="0" aria-pressed="false">Per-tensor</button>
          <button class="btn" type="button" data-g="1" aria-pressed="true">Per-group (64)</button>
        </div>
        <div class="checks"><label><input type="checkbox" id="quO"> Thêm 8 giá trị ngoại lai (×25)</label></div>
        <dl class="readout">
          <dt>Số mức biểu diễn</dt><dd id="quL">—</dd>
          <dt>Sai số tương đối (trọng số thường)</dt><dd class="big" id="quE">—</dd>
          <dt>Bit / trọng số thực tế</dt><dd id="quBp">—</dd>
          <dt>Llama 3 8B</dt><dd id="qu8">—</dd>
          <dt>Llama 3 70B</dt><dd id="qu70">—</dd>
        </dl>
        <p class="note-s">Một giá trị ngoại lai làm scale phình to, mọi trọng số bình thường bị dồn vào vài mức quanh 0. Chia nhóm giới hạn thiệt hại trong 64 trọng số, đổi lại tốn thêm 16 bit scale cho mỗi nhóm (0,25 bit/trọng số).</p>
      </div>
    </div>`,
  init(root) {
    const cv = document.getElementById('cvQu'), ce = document.getElementById('cvQe'); const st = {}, se = {};
    const R = rng(9), base = Float64Array.from({ length: NW }, () => 0.02 * R.gauss());
    const outIdx = [...Array(8)].map(() => Math.floor(R() * NW)), outVal = outIdx.map(i => 25 * 0.02 * Math.sign(base[i] || 1) * (1 + R() * 0.2));
    let grp = true;
    const bR = range('quB', { show: v => v + ' bit', onInput: () => draw() });
    const gb = [...root.querySelectorAll('[data-g]')];
    gb.forEach(b => b.addEventListener('click', () => { grp = b.dataset.g === '1'; pressGroup(gb, b); draw(); }));
    const oc = document.getElementById('quO'); oc.addEventListener('change', draw);
    watchCanvas(cv, st, draw); watchCanvas(ce, se, draw);
    function draw() {
      const b = bR.get(), qmax = 2 ** (b - 1) - 1, w = Float64Array.from(base);
      if (oc.checked) outIdx.forEach((i, k) => { w[i] = outVal[k]; });
      const wq = new Float64Array(NW), gsz = grp ? GS : NW; let tsc = 0;
      for (let g = 0; g < NW; g += gsz) {
        let am = 0; for (let i = g; i < g + gsz; i++) am = Math.max(am, Math.abs(w[i]));
        const s = am / qmax || 1; if (g === 0 || !grp) tsc = s;
        for (let i = g; i < g + gsz; i++) wq[i] = Math.max(-qmax, Math.min(qmax, Math.round(w[i] / s))) * s;
      }
      let se2 = 0, s2 = 0; const err = new Float64Array(NW), isOut = new Set(oc.checked ? outIdx : []);
      for (let i = 0; i < NW; i++) { err[i] = wq[i] - w[i]; if (!isOut.has(i)) { se2 += err[i] ** 2; s2 += w[i] ** 2; } }
      const rel = Math.sqrt(se2 / s2), bpw = b + (grp ? 16 / GS : 0);
      setTxt('quL', (2 * qmax + 1) + ' (từ −' + qmax + ' đến +' + qmax + ')'); setTxt('quE', num(rel * 100, 3) + '%');
      setTxt('quBp', num(bpw, 3)); setTxt('qu8', num(8.03e9 * bpw / 8 / 1e9, 3) + ' GB (16 bit: 16 GB)'); setTxt('qu70', num(70.6e9 * bpw / 8 / 1e9, 3) + ' GB (16 bit: 141 GB)');
      if (st.ctx) {
        const { ctx, W, H } = st; ctx.clearRect(0, 0, W, H);
        const l = 20, w2 = W - 40, t = 30, h = H - 60, lim = 0.09, nb = 120, hist = new Array(nb).fill(0);
        for (let i = 0; i < NW; i++) { const k = Math.floor((w[i] + lim) / (2 * lim) * nb); if (k >= 0 && k < nb) hist[k]++; }
        const mh = Math.max(...hist), X = v => l + (v + lim) / (2 * lim) * w2;
        hist.forEach((c, k) => { ctx.fillStyle = '#B9C1CA'; const hh = c / mh * (h - 20); ctx.fillRect(l + k / nb * w2, t + h - hh, w2 / nb - 1, hh); });
        // các mức lượng tử (theo scale của nhóm đầu tiên / cả tensor)
        ctx.strokeStyle = C.sea; ctx.lineWidth = 1.5;
        for (let q = -qmax; q <= qmax; q++) { const x = X(q * tsc); if (x < l || x > l + w2) continue; ctx.beginPath(); ctx.moveTo(x, t); ctx.lineTo(x, t + h); ctx.stroke(); }
        ctx.strokeStyle = C.ink; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(l, t + h); ctx.lineTo(l + w2, t + h); ctx.stroke();
        ctx.fillStyle = C.muted; ctx.font = '12px "Be Vietnam Pro", sans-serif'; ctx.textAlign = 'center';
        [-0.08, -0.04, 0, 0.04, 0.08].forEach(v => ctx.fillText(num(v, 2), X(v), t + h + 15)); ctx.textAlign = 'left';
        ctx.fillStyle = C.ink; ctx.font = '600 13px "Be Vietnam Pro", sans-serif';
        ctx.fillText('Histogram trọng số; vạch xanh: các giá trị biểu diễn được' + (grp ? ' (của nhóm đầu tiên)' : ''), l, t - 12);
        if (oc.checked) { ctx.fillStyle = C.pos; ctx.fillText('ngoại lai ±0,5 nằm ngoài khung →', l + w2 - 230, t + 14); }
      }
      if (se.ctx) {
        const { ctx, W, H } = se; ctx.clearRect(0, 0, W, H);
        const l = 20, w2 = W - 40, t = 22, h = H - 40, lim = 0.03, nb = 100, hist = new Array(nb).fill(0);
        for (let i = 0; i < NW; i++) { const k = Math.floor((err[i] + lim) / (2 * lim) * nb); if (k >= 0 && k < nb) hist[k]++; }
        const mh = Math.max(...hist);
        hist.forEach((c, k) => { ctx.fillStyle = C.pos; const hh = c / mh * h; ctx.fillRect(l + k / nb * w2, t + h - hh, w2 / nb - 1, hh); });
        ctx.fillStyle = C.ink; ctx.font = '600 12px "Be Vietnam Pro", sans-serif'; ctx.fillText('Sai số ŵ − w (khung ±0,03)', l, t - 6);
      }
    }
    bR.upd();
  },
});
})();
