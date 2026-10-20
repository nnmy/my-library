/* =====================================================================
   AI: minh họa "Ngữ cảnh càng dài, tốn càng nhiều?" (id: seq-cost, trang 6-mamba.html)
   Transformer: KV cache = 2 (K và V) × 32 lớp × 8 KV-head × 128 chiều × 2 byte (fp16) = 128 KiB / token
     (cấu hình kiểu Llama 3 8B, có GQA).
   Mamba: trạng thái cố định, ƯỚC LƯỢNG ~20 MB cho một mô hình cỡ tương đương
     (64 lớp × d_inner 8192 × N 16 × 2 byte + trạng thái conv), không phụ thuộc độ dài.
   Dữ liệu đọc cho mỗi token mới ≈ trọng số (16 GB, fp16) + KV cache hoặc trạng thái.
   Chạy độc lập: lib/demos/run.html?demo=seq-cost
   EDIT: các hằng số ở đầu file.
   ===================================================================== */
(() => {
const { COLORS: C, watchCanvas, setTxt, num, range, fmt } = TFG;
const KV_PER_TOK = 2 * 32 * 8 * 128 * 2;          // byte
const MAMBA_STATE = 64 * 8192 * 16 * 2 + 64 * 8192 * 3 * 2;   // byte, ~20 MB
const WEIGHTS = 16e9;                               // byte, mô hình 8B fp16
const GPU = 80e9;
const N0 = 10, N1 = 21;   // 2^10 .. 2^21 token

TFG.demo('seq-cost', {
  html: `<div class="demo-title"><h4>Ngữ cảnh càng dài, tốn càng nhiều?</h4><span>Kéo độ dài ngữ cảnh, so bộ nhớ của Transformer với Mamba</span></div>
    <div class="demo-body">
      <div class="stagebox">
        <canvas id="scCv" class="ar" role="img" aria-label="Đồ thị thang log: bộ nhớ KV cache của Transformer tăng theo độ dài, trạng thái của Mamba nằm ngang."></canvas>
      </div>
      <div class="panel">
        <div class="ctrl"><label for="scN">Độ dài ngữ cảnh</label><output for="scN"></output>
          <input type="range" id="scN" min="${N0}" max="${N1}" step="0.05" value="17"></div>
        <dl class="readout">
          <dt>Cỡ chừng</dt><dd id="scPg" style="font-family:var(--body)">—</dd>
          <dt>KV cache (Transformer)</dt><dd id="scKv" class="big">—</dd>
          <dt>Trạng thái Mamba (cố định)</dt><dd id="scSt">—</dd>
          <dt>Đọc mỗi token, Transformer</dt><dd id="scRt">—</dd>
          <dt>Đọc mỗi token, Mamba</dt><dd id="scRm">—</dd>
          <dt>Transformer chậm hơn cỡ</dt><dd id="scX" class="big">—</dd>
        </dl>
        <p class="note-s">Khi sinh chữ, máy bị nghẽn ở khâu đọc bộ nhớ: mỗi token mới phải đọc hết trọng số mô hình, cộng thêm KV cache (Transformer) hoặc trạng thái (Mamba). Số liệu tính cho một chuỗi, cấu hình kiểu Llama 3 8B; số của Mamba là ước lượng cho mô hình cỡ tương đương.</p>
      </div>
    </div>`,
  init() {
    const cv = document.getElementById('scCv'), st = {};
    const n = range('scN', { map: v => Math.round(Math.pow(2, v)), show: v => v.toLocaleString('vi-VN') + ' token', onInput: () => draw() });
    watchCanvas(cv, st, () => draw());
    n.upd();
    function draw() {
      const L = n.get(), kv = L * KV_PER_TOK;
      setTxt('scPg', '≈ ' + Math.max(1, Math.round(L / 500)).toLocaleString('vi-VN') + ' trang sách');
      setTxt('scKv', fmt(kv, 'B', 3)); setTxt('scSt', fmt(MAMBA_STATE, 'B', 3));
      setTxt('scRt', fmt(WEIGHTS + kv, 'B', 3)); setTxt('scRm', fmt(WEIGHTS + MAMBA_STATE, 'B', 3));
      setTxt('scX', num((WEIGHTS + kv) / (WEIGHTS + MAMBA_STATE), 3) + ' lần');
      if (!st.ctx) return;
      const { ctx, W, H } = st; ctx.clearRect(0, 0, W, H);
      const l = 62, r = 16, t = 26, b = 44, pw = W - l - r, ph = H - t - b;
      const E0 = 6, E1 = 12; // 1 MB .. 1 TB (log10 byte)
      const X = e2 => l + (e2 - N0) / (N1 - N0) * pw, Y = bytes => t + (E1 - Math.log10(bytes)) / (E1 - E0) * ph;
      ctx.font = '12px "Be Vietnam Pro", sans-serif';
      // lưới
      ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.fillStyle = C.muted; ctx.textAlign = 'right';
      [[6, '1 MB'], [7, '10 MB'], [8, '100 MB'], [9, '1 GB'], [10, '10 GB'], [11, '100 GB'], [12, '1 TB']].forEach(([e, s]) => { ctx.beginPath(); ctx.moveTo(l, Y(10 ** e)); ctx.lineTo(l + pw, Y(10 ** e)); ctx.stroke(); ctx.fillText(s, l - 6, Y(10 ** e) + 4); });
      ctx.textAlign = 'center';
      [[10, '1K'], [13, '8K'], [15, '32K'], [17, '128K'], [19, '512K'], [21, '2M']].forEach(([e, s]) => { ctx.beginPath(); ctx.moveTo(X(e), t); ctx.lineTo(X(e), t + ph); ctx.stroke(); ctx.fillText(s, X(e), t + ph + 16); });
      ctx.fillText('độ dài ngữ cảnh (token, thang log)', l + pw / 2, H - 6);
      // GPU 80 GB
      ctx.strokeStyle = C.ink; ctx.setLineDash([6, 4]); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(l, Y(GPU)); ctx.lineTo(l + pw, Y(GPU)); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = C.ink; ctx.textAlign = 'left'; ctx.fillText('bộ nhớ một GPU cỡ bự (80 GB)', l + 6, Y(GPU) - 6);
      // đường
      ctx.lineWidth = 3;
      ctx.strokeStyle = C.pos; ctx.beginPath(); ctx.moveTo(X(N0), Y(2 ** N0 * KV_PER_TOK)); ctx.lineTo(X(N1), Y(2 ** N1 * KV_PER_TOK)); ctx.stroke();
      ctx.strokeStyle = C.sea; ctx.beginPath(); ctx.moveTo(X(N0), Y(MAMBA_STATE)); ctx.lineTo(X(N1), Y(MAMBA_STATE)); ctx.stroke();
      ctx.font = '600 12.5px "Be Vietnam Pro", sans-serif';
      ctx.fillStyle = C.pos; ctx.fillText('KV cache của Transformer', X(N0) + 6, Y(2 ** N0 * KV_PER_TOK) - 10);
      ctx.fillStyle = C.sea; ctx.fillText('trạng thái của Mamba', X(N0) + 6, Y(MAMBA_STATE) - 8);
      // vị trí đang chọn
      const e2 = Math.log2(L);
      ctx.strokeStyle = C.gold; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(X(e2), t); ctx.lineTo(X(e2), t + ph); ctx.stroke();
      [[kv, C.pos], [MAMBA_STATE, C.sea]].forEach(([v, c]) => { ctx.fillStyle = c; ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(X(e2), Y(v), 6, 0, 7); ctx.fill(); ctx.stroke(); });
    }
  },
});
})();
