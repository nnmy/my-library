/* =====================================================================
   AI: minh họa "Nhiều head, một câu" (id: attn-heads, trang 2-transformer.html)
   Ma trận attention N×N của một câu cho vài head có "chuyên môn" khác nhau,
   bật/tắt mask nhân quả (causal mask). Trọng số được ĐẶT TAY để minh họa các
   mẫu hình thường thấy trong mô hình thật, không phải xuất ra từ mô hình đã huấn luyện.
   Chạy độc lập: lib/demos/run.html?demo=attn-heads
   EDIT: câu ở WORDS, logit của từng head ở HEADS (hàm (i, j) -> logit).
   ===================================================================== */
(() => {
const { COLORS: C, watchCanvas, softmax, heat, setTxt, pressGroup, xy } = TFG;
const WORDS = ['Con', 'mèo', 'đuổi', 'con', 'chuột', 'vì', 'nó', 'đói'];
const N = WORDS.length;
const HEADS = [
  { name: 'Head 1: token liền trước', desc: 'Mỗi token nhìn chủ yếu vào token ngay trước nó. Head kiểu này giúp mô hình nắm thứ tự cục bộ (giống một bộ lọc tích chập kích thước 2).',
    f: (i, j) => (j === i - 1 ? 4 : j === i ? 2 : 0) },
  { name: 'Head 2: đồng tham chiếu', desc: 'Đại từ "nó" dồn attention vào "mèo": head này nối đại từ với danh từ mà nó thay thế. Các token khác chủ yếu nhìn chính mình.',
    f: (i, j) => (i === 6 ? ({ 1: 4.2, 4: 2.6, 0: 1, 6: 1 }[j] || 0) : i === 7 ? ({ 6: 3, 1: 2.4 }[j] || 0) : j === i ? 3 : 0) },
  { name: 'Head 3: ai làm gì ai', desc: 'Động từ "đuổi" nhìn về chủ ngữ "mèo" và tân ngữ "chuột"; "đói" nhìn về "nó". Head kiểu này nắm quan hệ ngữ pháp ở xa.',
    f: (i, j) => ({ 2: { 1: 3.5, 4: 3.2 }, 4: { 2: 3.5, 3: 1.5 }, 7: { 6: 3.4, 5: 1.6 }, 1: { 0: 2.5, 2: 2.5 }, 5: { 2: 2, 7: 2.5 } }[i] || {})[j] || (j === i ? 1.5 : 0) },
  { name: 'Head 4: phân tán', desc: 'Trọng số gần đều: head này lấy "trung bình" cả câu, cho một bức tranh tổng quát. Các head như vậy cũng hay dồn trọng số vào token đầu câu (attention sink).',
    f: (i, j) => (j === 0 ? 1.2 : 0.4) },
];

TFG.demo('attn-heads', {
  html: `<div class="demo-title"><h4>Nhiều head, một câu</h4><span>Chọn head, bấm vào một hàng (token đang hỏi), bật mask nhân quả</span></div>
    <div class="demo-body">
      <div class="stagebox"><canvas id="cvAH" class="ar tall" role="img" aria-label="Câu ở phía trên với các cung attention; ma trận attention dạng heatmap ở dưới."></canvas>
        <div class="hint">Hàng = query (token đang hỏi), cột = key (token được nhìn)</div></div>
      <div class="panel">
        <div class="ctrl"><label for="ahH">Head</label>
          <select id="ahH">${HEADS.map((h, i) => `<option value="${i}">${h.name}</option>`).join('')}<option value="avg">Trung bình 4 head</option></select></div>
        <p class="note-s" id="ahDesc"></p>
        <div class="btnrow" role="group" aria-label="Loại attention">
          <button class="btn" type="button" data-m="0" aria-pressed="true">Hai chiều (encoder)</button>
          <button class="btn" type="button" data-m="1" aria-pressed="false">Nhân quả (decoder)</button>
        </div>
        <dl class="readout">
          <dt>Token đang hỏi</dt><dd class="big" id="ahQ">—</dd>
          <dt>Nhìn nhiều nhất</dt><dd id="ahTop">—</dd>
          <dt>Ô bị che</dt><dd id="ahMask">—</dd>
        </dl>
        <p class="note-s">Mask nhân quả đặt logit = −∞ cho mọi key nằm sau query, nên token thứ i chỉ thấy các token 1…i. Đây là điều kiện để mô hình sinh văn bản từ trái sang phải mà không "nhìn trộm" tương lai. Trọng số trong demo được đặt tay để minh họa.</p>
      </div>
    </div>`,
  init() {
    const cv = document.getElementById('cvAH'); const st = {};
    let head = 1, causal = false, sel = 6, L = null;
    const sh = document.getElementById('ahH'); sh.value = '1';
    sh.addEventListener('change', () => { head = sh.value === 'avg' ? 'avg' : +sh.value; draw(); });
    const mb = [...cv.closest('.demo').querySelectorAll('[data-m]')];
    mb.forEach(b => b.addEventListener('click', () => { causal = b.dataset.m === '1'; pressGroup(mb, b); draw(); }));
    const matrix = h => [...Array(N)].map((_, i) => softmax([...Array(N)].map((_, j) => (causal && j > i ? -Infinity : HEADS[h].f(i, j)))));
    cv.addEventListener('pointerdown', e => {
      if (!L) return; const [x, y] = xy(cv, e);
      if (y > L.top && y < L.top + N * L.cell && x > L.left - 70 && x < L.left + N * L.cell) { sel = Math.floor((y - L.top) / L.cell); draw(); }
      else if (y < L.top - 30) { const k = L.wx.findIndex(([a, b]) => x >= a && x <= b); if (k >= 0) { sel = k; draw(); } }
    });
    watchCanvas(cv, st, draw);
    function draw() {
      const { ctx, W, H } = st; if (!ctx) return;
      const A = head === 'avg' ? matrix(0).map((r, i) => r.map((_, j) => HEADS.reduce((s, _, h) => s + matrix(h)[i][j], 0) / HEADS.length)) : matrix(head);
      document.getElementById('ahDesc').textContent = head === 'avg' ? 'Trung bình 4 head. Trong mô hình thật, đầu ra các head được nối lại (concat) rồi nhân với ma trận W_O, chứ không lấy trung bình; ở đây chỉ để thấy tổng thể.' : HEADS[head].desc;
      ctx.clearRect(0, 0, W, H);
      // câu + cung
      ctx.font = '600 15px "Be Vietnam Pro", sans-serif'; ctx.textBaseline = 'alphabetic';
      const gap = 14, ws = WORDS.map(w => ctx.measureText(w).width), tot = ws.reduce((a, b) => a + b, 0) + gap * (N - 1);
      const sc = Math.min(1, (W - 20) / tot); let x0 = (W - tot * sc) / 2; const ty = Math.max(78, H * 0.19);
      const cx = [], wx = [];
      ctx.save(); ctx.translate(0, 0);
      WORDS.forEach((w, i) => { const ww = ws[i] * sc; cx.push(x0 + ww / 2); wx.push([x0, x0 + ww]); x0 += ww + gap * sc; });
      A[sel].forEach((a, j) => {
        if (a < 0.03) return;
        const xa = cx[sel], xb = cx[j], h = j === sel ? 18 : 26 + Math.abs(xb - xa) * 0.35;
        ctx.strokeStyle = C.sea; ctx.globalAlpha = Math.min(1, 0.15 + a * 1.4); ctx.lineWidth = 1 + a * 9;
        ctx.beginPath();
        if (j === sel) ctx.ellipse(xa, ty - 26, 9, 12, 0, 0, Math.PI * 2); else { ctx.moveTo(xa, ty - 20); ctx.bezierCurveTo(xa, ty - 20 - h, xb, ty - 20 - h, xb, ty - 20); }
        ctx.stroke(); ctx.globalAlpha = 1;
      });
      WORDS.forEach((w, i) => {
        ctx.fillStyle = i === sel ? C.ink : C.muted;
        ctx.font = (i === sel ? '700 ' : '500 ') + Math.round(15 * sc + 1) + 'px "Be Vietnam Pro", sans-serif';
        ctx.textAlign = 'center'; ctx.fillText(w, cx[i], ty);
        if (i === sel) { ctx.fillStyle = C.ink; ctx.fillRect(wx[i][0], ty + 5, wx[i][1] - wx[i][0], 2); }
      });
      ctx.restore();
      // heatmap
      const top = ty + 34, avail = Math.min(W - 110, H - top - 78), cell = Math.max(14, Math.floor(avail / N)), left = (W - cell * N) / 2 + 30;
      L = { top, left, cell, wx };
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
        const masked = causal && j > i;
        ctx.fillStyle = masked ? '#E6E9ED' : heat(A[i][j] / 0.8); ctx.fillRect(left + j * cell, top + i * cell, cell, cell);
        if (masked) { ctx.strokeStyle = '#B9C1CA'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(left + j * cell + 3, top + i * cell + cell - 3); ctx.lineTo(left + j * cell + cell - 3, top + i * cell + 3); ctx.stroke(); }
        else if (cell > 34) { ctx.fillStyle = A[i][j] > 0.45 ? '#fff' : C.ink; ctx.font = '11px ui-monospace, monospace'; ctx.textAlign = 'center'; ctx.fillText(A[i][j].toFixed(2).slice(1), left + j * cell + cell / 2, top + i * cell + cell / 2 + 4); }
      }
      ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.strokeRect(left, top, cell * N, cell * N);
      ctx.strokeStyle = C.pos; ctx.lineWidth = 3; ctx.strokeRect(left - 1, top + sel * cell, cell * N + 2, cell);
      ctx.fillStyle = C.ink; ctx.font = '500 13px "Be Vietnam Pro", sans-serif'; ctx.textAlign = 'right';
      WORDS.forEach((w, i) => { ctx.fillStyle = i === sel ? C.pos : C.ink; ctx.fillText(w, left - 6, top + i * cell + cell / 2 + 4); });
      ctx.textAlign = 'center'; ctx.fillStyle = C.ink;
      WORDS.forEach((w, j) => { ctx.save(); ctx.translate(left + j * cell + cell / 2, top + N * cell + 8); ctx.rotate(-0.6); ctx.textAlign = 'right'; ctx.fillText(w, 0, 6); ctx.restore(); });
      ctx.textAlign = 'left';
      setTxt('ahQ', WORDS[sel] + ' (#' + (sel + 1) + ')');
      const r = A[sel], tj = r.indexOf(Math.max(...r));
      setTxt('ahTop', WORDS[tj] + ' (#' + (tj + 1) + '), ' + Math.round(r[tj] * 100) + '%');
      setTxt('ahMask', causal ? N * (N - 1) / 2 + ' / ' + N * N : '0 / ' + N * N);
    }
  },
});
})();
