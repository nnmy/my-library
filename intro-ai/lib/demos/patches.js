/* =====================================================================
   AI: minh họa "Ảnh thành chuỗi token" (id: patches, trang 4-multimodal.html)
   Cắt ảnh 64×64 thành các patch P×P, xếp theo thứ tự quét hàng thành một chuỗi (thêm [CLS]).
   Bảng điều khiển có máy tính số token cho ảnh độ phân giải thật.
   Chạy độc lập: lib/demos/run.html?demo=patches
   ===================================================================== */
(() => {
const { COLORS: C, range, watchCanvas, setTxt, xy } = TFG;
const IMG = 64;

TFG.demo('patches', {
  deps: ['sprites'],
  html: `<div class="demo-title"><h4>Ảnh thành chuỗi token</h4><span>Chọn kích thước patch; rê chuột lên ảnh hoặc kéo thanh "patch thứ i"</span></div>
    <div class="demo-body">
      <div class="stagebox"><canvas id="cvPa" class="ar tall" role="img" aria-label="Ảnh 64×64 chia lưới patch, bên dưới là chuỗi các patch đã duỗi thẳng."></canvas></div>
      <div class="panel">
        <div class="ctrl"><label for="paP">Kích thước patch P (ảnh 64×64)</label><output for="paP"></output>
          <input type="range" id="paP" min="0" max="3" step="1" value="2"></div>
        <div class="ctrl"><label for="paI">Patch thứ i</label><output for="paI"></output>
          <input type="range" id="paI" min="0" max="15" step="1" value="5"></div>
        <dl class="readout">
          <dt>Số patch N = (64/P)²</dt><dd class="big" id="paN">—</dd>
          <dt>Mỗi patch duỗi thẳng</dt><dd id="paD">—</dd>
          <dt>Ô attention N²</dt><dd id="paA">—</dd>
        </dl>
        <h5 style="margin:4px 0 0;font-size:15px">Máy tính cho ảnh thật</h5>
        <div class="ctrl"><label for="paR">Độ phân giải ảnh</label><output for="paR"></output>
          <input type="range" id="paR" min="0" max="5" step="1" value="0"></div>
        <div class="ctrl"><label for="paQ">Patch</label>
          <select id="paQ"><option value="14">14×14 (CLIP ViT-L/14, SigLIP)</option><option value="16" selected>16×16 (ViT-B/16)</option><option value="32">32×32 (ViT-B/32)</option></select></div>
        <dl class="readout">
          <dt>Số token ảnh</dt><dd class="big" id="paT">—</dd>
          <dt>Tương đương (từ tiếng Anh)</dt><dd id="paW">—</dd>
        </dl>
        <p class="note-s">Patch nhỏ: giữ chi tiết nhưng chuỗi dài, chi phí attention tăng theo bình phương. Vì vậy VLM thường giảm số token ảnh (gộp patch, cắt ảnh thành ô) trước khi đưa vào LLM.</p>
      </div>
    </div>`,
  init() {
    const cv = document.getElementById('cvPa'); const st = {};
    const img = TFG.SPR.scene(IMG);
    const PS = [4, 8, 16, 32], RES = [224, 336, 448, 672, 896, 1024];
    const iR = range('paI', { show: v => v + ' / ' + (Math.pow(IMG / PS[pR.get()], 2) - 1), onInput: () => draw() });
    const pR = range('paP', { show: v => PS[v] + ' × ' + PS[v], onInput: () => { const n = Math.pow(IMG / PS[pR.get()], 2); iR.el.max = n - 1; if (iR.get() > n - 1) iR.el.value = n - 1; iR.upd(); } });
    const rR = range('paR', { show: v => RES[v] + ' × ' + RES[v], onInput: () => calc() });
    document.getElementById('paQ').addEventListener('change', calc);
    function calc() { const r = RES[rR.get()], p = +document.getElementById('paQ').value, n = Math.floor(r / p) ** 2;
      setTxt('paT', n.toLocaleString('vi-VN')); setTxt('paW', '≈ ' + Math.round(n * 0.75).toLocaleString('vi-VN') + ' từ'); }
    let geo = null;
    cv.addEventListener('pointermove', e => { if (!geo) return; const [x, y] = xy(cv, e); const g = Math.floor((x - geo.x) / geo.cell), h = Math.floor((y - geo.y) / geo.cell);
      if (g >= 0 && h >= 0 && g < geo.n && h < geo.n) { iR.el.value = h * geo.n + g; iR.upd(); } });
    watchCanvas(cv, st, draw);
    function draw() {
      const { ctx, W, H } = st; if (!ctx) return;
      ctx.clearRect(0, 0, W, H);
      const P = PS[pR.get()], n = IMG / P, N = n * n, sel = Math.min(iR.get(), N - 1);
      const size = Math.min(W - 40, H * 0.55), ix = (W - size) / 2, iy = 12, cell = size / n;
      geo = { x: ix, y: iy, cell, n };
      TFG.SPR.draw(ctx, img, ix, iy, size);
      ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 1.5;
      for (let k = 1; k < n; k++) { ctx.beginPath(); ctx.moveTo(ix + k * cell, iy); ctx.lineTo(ix + k * cell, iy + size); ctx.moveTo(ix, iy + k * cell); ctx.lineTo(ix + size, iy + k * cell); ctx.stroke(); }
      ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.strokeRect(ix, iy, size, size);
      const sg = sel % n, sh = Math.floor(sel / n);
      ctx.strokeStyle = C.pos; ctx.lineWidth = 3; ctx.strokeRect(ix + sg * cell, iy + sh * cell, cell, cell);
      if (cell > 18) { ctx.fillStyle = 'rgba(27,25,32,.75)'; ctx.font = '600 11px ui-monospace, monospace';
        for (let k = 0; k < N; k++) ctx.fillText(k, ix + (k % n) * cell + 3, iy + Math.floor(k / n) * cell + 12); }
      // chuỗi
      const sy = iy + size + 34, avail = W - 24, show = Math.min(N, 64);
      const tw = Math.max(9, Math.min(46, (avail - 40) / Math.min(show + 1, 17)));
      const per = Math.max(1, Math.floor((avail - tw) / (tw + 3))), rowsMax = Math.max(1, Math.floor((H - sy - 30) / (tw + 18)));
      ctx.fillStyle = C.ink; ctx.font = '600 13px "Be Vietnam Pro", sans-serif';
      ctx.fillText('Chuỗi đầu vào của Transformer (' + (N + 1) + ' token):', 12, sy - 10);
      let k = -1, x = 12, y = sy, row = 0;
      const sub = new Float32Array(P * P * 3);
      for (; k < N && row < rowsMax; k++) {
        if (k === -1) { ctx.fillStyle = C.gold; ctx.fillRect(x, y, tw, tw); ctx.strokeStyle = C.ink; ctx.lineWidth = 1; ctx.strokeRect(x, y, tw, tw); ctx.fillStyle = C.ink; ctx.font = '600 9px ui-monospace, monospace'; ctx.fillText('CLS', x + 1, y + tw / 2 + 3); }
        else {
          const g = k % n, h = Math.floor(k / n);
          for (let j = 0; j < P; j++) for (let i = 0; i < P; i++) for (let c = 0; c < 3; c++) sub[(j * P + i) * 3 + c] = img.data[((h * P + j) * IMG + g * P + i) * 3 + c];
          TFG.SPR.draw(ctx, { N: P, data: sub }, x, y, tw);
          ctx.strokeStyle = k === sel ? C.pos : C.ink; ctx.lineWidth = k === sel ? 3 : 1; ctx.strokeRect(x, y, tw, tw);
        }
        ctx.fillStyle = C.muted; ctx.font = '10px ui-monospace, monospace'; ctx.textAlign = 'center'; ctx.fillText(k < 0 ? '' : k, x + tw / 2, y + tw + 11); ctx.textAlign = 'left';
        x += tw + 3; if (x + tw > W - 10) { x = 12; y += tw + 18; row++; }
      }
      if (k < N) { ctx.fillStyle = C.muted; ctx.font = '13px "Be Vietnam Pro", sans-serif'; ctx.fillText('… còn ' + (N - k) + ' patch nữa', 12, Math.min(H - 8, y + 14)); }
      setTxt('paN', N.toLocaleString('vi-VN')); setTxt('paD', P + '·' + P + '·3 = ' + (P * P * 3) + ' số');
      setTxt('paA', (N + 1) ** 2 > 1e5 ? TFG.sci((N + 1) ** 2, 3) : ((N + 1) ** 2).toLocaleString('vi-VN'));
    }
    pR.upd(); rR.upd(); calc();
  },
});
})();
