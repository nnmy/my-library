/* =====================================================================
   AI: minh họa "Cross-attention: chữ nào điều khiển vùng nào" (id: cross-attn, trang 4-multimodal.html)
   Query từ mỗi vị trí của ảnh ẩn 32×32, key từ các token của prompt. Với mỗi vị trí, softmax lấy
   theo các TOKEN. Bản đồ của một token = cột tương ứng của ma trận attention.
   Logit được DỰNG TAY từ mặt nạ của từng vật trong cảnh (làm mờ), mô phỏng hành vi đã quan sát
   ở Stable Diffusion (ví dụ: token mở đầu <bos> nhận rất nhiều attention).
   Chạy độc lập: lib/demos/run.html?demo=cross-attn
   EDIT: prompt và token -> vật ở TOKENS.
   ===================================================================== */
(() => {
const { COLORS: C, watchCanvas, setTxt, heat, xy, softmax } = TFG;
const G = 32;
// [chữ, vật trong cảnh (hoặc null), mức gắn với vật, độ ưu tiên nền]
const TOKENS = [
  ['<bos>', null, 0, 2.6], ['một', null, 0, 0.3], ['con', 'meo', 2.2, 0], ['mèo', 'meo', 4.6, 0], ['ngồi', 'meo', 2.4, 0.2],
  ['trước', 'nha', 1.2, 0.3], ['ngôi', 'nha', 2.0, 0], ['nhà', 'nha', 4.4, 0], [',', null, 0, 0.4], ['cạnh', 'cay', 1.2, 0.3],
  ['cái', 'cay', 1.8, 0], ['cây', 'cay', 4.4, 0], ['dưới', 'bau', 1.4, 0.2], ['mặt', 'troi', 2.6, 0], ['trời', 'troi', 4.6, 0], ['<eos>', null, 0, 1.2],
];

TFG.demo('cross-attn', {
  deps: ['sprites'],
  html: `<div class="demo-title"><h4>Cross-attention: chữ nào điều khiển vùng nào</h4><span>Rê chuột lên một từ (bản đồ của token) hoặc lên ảnh (phân phối của pixel)</span></div>
    <div class="demo-body">
      <div class="stagebox"><div class="pad" style="padding-bottom:6px"><div class="chips" id="caTok" aria-label="Các token của prompt"></div></div>
        <canvas id="cvCa" class="ar tall" role="img" aria-label="Ảnh cảnh vật với lớp phủ bản đồ attention của token đang chọn."></canvas></div>
      <div class="panel">
        <dl class="readout">
          <dt>Token đang xem</dt><dd class="big" id="caT">—</dd>
          <dt>Tổng attention của token</dt><dd id="caS">—</dd>
        </dl>
        <div>
          <div class="note-s" style="margin-bottom:4px">Pixel <b id="caP">(chưa chọn)</b> chia attention cho các token:</div>
          <div class="bars" id="caB"></div>
        </div>
        <p class="note-s">Mỗi vị trí của ảnh hỏi "token nào mô tả tôi?". Vì softmax lấy theo token, mỗi pixel phân phối đúng 100% attention cho prompt. Token mở đầu &lt;bos&gt; hút nhiều attention ở mọi nơi: nó đóng vai "chỗ đổ" khi pixel không cần thông tin gì đặc biệt. Bản đồ trong demo được dựng tay theo hình dạng các vật, mô phỏng hành vi quan sát được ở Stable Diffusion.</p>
      </div>
    </div>`,
  init() {
    const cv = document.getElementById('cvCa'); const st = {};
    const sc = TFG.SPR.scene(64), sm = TFG.SPR.scene(G);
    // làm mờ mặt nạ (hộp 5×5)
    const blur = m => { const o = new Float32Array(G * G); for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) { let s = 0, c = 0;
      for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) { const a = i + di, b = j + dj; if (a >= 0 && b >= 0 && a < G && b < G) { s += m[b * G + a]; c++; } } o[j * G + i] = s / c; } return o; };
    const M = {}; Object.keys(sm.masks).forEach(k => M[k] = blur(sm.masks[k]));
    // A[p][t]: softmax theo token
    const A = [];
    for (let p = 0; p < G * G; p++) A.push(softmax(TOKENS.map(([, obj, a, b]) => b + (obj ? a * M[obj][p] : 0))));
    let tok = 3, pix = null;
    const box = document.getElementById('caTok');
    const chips = TOKENS.map(([w], t) => { const c = document.createElement('span'); c.className = 'chip'; c.textContent = w; c.style.cursor = 'pointer'; c.tabIndex = 0;
      const pick = () => { tok = t; pix = null; draw(); }; c.addEventListener('pointerenter', pick); c.addEventListener('click', pick); c.addEventListener('focus', pick); box.appendChild(c); return c; });
    let geo = null;
    cv.addEventListener('pointermove', e => { if (!geo) return; const [x, y] = xy(cv, e); const i = Math.floor((x - geo.x) / geo.c), j = Math.floor((y - geo.y) / geo.c);
      if (i >= 0 && j >= 0 && i < G && j < G) { pix = [i, j]; draw(); } });
    watchCanvas(cv, st, draw);
    function draw() {
      chips.forEach((c, t) => { c.style.background = t === tok ? 'var(--ink)' : '#fff'; c.style.color = t === tok ? '#fff' : 'var(--ink)'; });
      const { ctx, W, H } = st; if (!ctx) return;
      ctx.clearRect(0, 0, W, H);
      const size = Math.min(W - 24, H - 24), x0 = (W - size) / 2, y0 = (H - size) / 2, c = size / G;
      geo = { x: x0, y: y0, c };
      const col = A.map(r => r[tok]), mx = Math.max(...col);
      TFG.SPR.draw(ctx, sc, x0, y0, size);
      ctx.globalAlpha = 0.78;
      for (let p = 0; p < G * G; p++) { ctx.fillStyle = heat(col[p] / mx); ctx.fillRect(x0 + (p % G) * c, y0 + Math.floor(p / G) * c, Math.ceil(c), Math.ceil(c)); }
      ctx.globalAlpha = 1;
      ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.strokeRect(x0, y0, size, size);
      if (pix) { ctx.strokeStyle = C.pos; ctx.lineWidth = 3; ctx.strokeRect(x0 + pix[0] * c - 1, y0 + pix[1] * c - 1, c + 2, c + 2); }
      setTxt('caT', TOKENS[tok][0] + ' (cực đại ' + Math.round(mx * 100) + '%)');
      setTxt('caS', Math.round(col.reduce((a, b) => a + b, 0) / (G * G) * 100) + '% toàn ảnh');
      const bars = document.getElementById('caB');
      if (pix) {
        const r = A[pix[1] * G + pix[0]], ord = r.map((v, t) => t).sort((a, b) => r[b] - r[a]).slice(0, 6);
        setTxt('caP', '(' + pix[0] + ', ' + pix[1] + ')');
        bars.innerHTML = ord.map(t => `<span class="lab">${TOKENS[t][0].replace('<', '&lt;')}</span><div class="bar"><i style="width:${(r[t] * 100).toFixed(1)}%"></i></div><span class="v">${(r[t] * 100).toFixed(0)}%</span>`).join('');
      } else { setTxt('caP', '(chưa chọn)'); bars.innerHTML = '<span class="note-s" style="grid-column:1/-1">Rê chuột lên ảnh để xem.</span>'; }
    }
  },
});
})();
