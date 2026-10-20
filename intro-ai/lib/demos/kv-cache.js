/* =====================================================================
   AI: minh họa "Bộ nhớ khi chạy LLM" (id: kv-cache, trang 5-llm.html)
   Trọng số: số tham số × số byte. KV cache: 2 (K và V) × L lớp × n_kv head × d_head × T token × batch × byte.
   Cấu hình theo model card công khai (Llama 2/3, Mistral). Bỏ qua bộ nhớ hoạt hóa và overhead khung phần mềm.
   Chạy độc lập: lib/demos/run.html?demo=kv-cache
   EDIT: thêm mô hình vào PRESETS.
   ===================================================================== */
(() => {
const { COLORS: C, range, watchCanvas, setTxt, num } = TFG;
const PRESETS = [
  { name: 'Llama 2 7B', P: 6.74e9, L: 32, h: 32, kv: 32, dh: 128 },
  { name: 'Mistral 7B', P: 7.24e9, L: 32, h: 32, kv: 8, dh: 128 },
  { name: 'Llama 3 8B', P: 8.03e9, L: 32, h: 32, kv: 8, dh: 128 },
  { name: 'Llama 3 70B', P: 70.6e9, L: 80, h: 64, kv: 8, dh: 128 },
  { name: 'Llama 3.1 405B', P: 405e9, L: 126, h: 128, kv: 8, dh: 128 },
];
const GB = 1e9;   // GB thập phân, như cách thường ghi kích thước mô hình và GPU
const gb = v => (v / GB >= 100 ? Math.round(v / GB).toLocaleString('vi-VN') : num(v / GB, 3)) + ' GB';

TFG.demo('kv-cache', {
  html: `<div class="demo-title"><h4>Bộ nhớ khi chạy LLM</h4><span>Chọn mô hình, độ dài ngữ cảnh, độ chính xác</span></div>
    <div class="demo-body">
      <div class="stagebox"><canvas id="cvKv" class="ar" role="img" aria-label="Thanh bộ nhớ trọng số và KV cache so với dung lượng GPU; đồ thị KV cache theo độ dài ngữ cảnh."></canvas></div>
      <div class="panel">
        <div class="ctrl"><label for="kvM">Mô hình</label><select id="kvM">${PRESETS.map((p, i) => `<option value="${i}"${i === 2 ? ' selected' : ''}>${p.name}</option>`).join('')}</select></div>
        <div class="ctrl"><label for="kvT">Ngữ cảnh T (token)</label><output for="kvT"></output>
          <input type="range" id="kvT" min="10" max="17" step="0.25" value="13"></div>
        <div class="ctrl"><label for="kvB">Số yêu cầu chạy song song (batch)</label><output for="kvB"></output>
          <input type="range" id="kvB" min="0" max="6" step="1" value="0"></div>
        <div class="ctrl"><label for="kvW">Trọng số</label><select id="kvW"><option value="2">16 bit (bf16)</option><option value="1">8 bit</option><option value="0.5">4 bit</option></select></div>
        <div class="checks"><label><input type="checkbox" id="kvG" checked> Dùng GQA (theo cấu hình gốc)</label><label><input type="checkbox" id="kv8"> KV cache 8 bit</label></div>
        <dl class="readout">
          <dt>Trọng số</dt><dd id="kvPw">—</dd>
          <dt>KV cache</dt><dd id="kvPk">—</dd>
          <dt>Tổng</dt><dd class="big" id="kvPt">—</dd>
          <dt>KV mỗi token</dt><dd id="kvPp">—</dd>
        </dl>
        <p class="note-s">Bỏ qua bộ nhớ hoạt hóa tạm thời và phần mềm, nên con số thật cao hơn một chút. GQA <span class="en">(grouped-query attention)</span>: nhiều head query dùng chung một cặp K, V, giảm KV cache 4–16 lần.</p>
      </div>
    </div>`,
  init() {
    const cv = document.getElementById('cvKv'); const st = {};
    const tR = range('kvT', { map: v => Math.round(2 ** v), show: v => v.toLocaleString('vi-VN'), onInput: () => draw() });
    const bR = range('kvB', { map: v => 2 ** v, show: v => v, onInput: () => draw() });
    ['kvM', 'kvW', 'kvG', 'kv8'].forEach(id => document.getElementById(id).addEventListener('change', draw));
    const cfg = () => { const p = PRESETS[+document.getElementById('kvM').value]; return { ...p, kv: document.getElementById('kvG').checked ? p.kv : p.h }; };
    const kvTok = p => 2 * p.L * p.kv * p.dh * (document.getElementById('kv8').checked ? 1 : 2);
    watchCanvas(cv, st, draw);
    function draw() {
      const p = cfg(), T = tR.get(), Bt = bR.get(), wB = p.P * +document.getElementById('kvW').value, kB = kvTok(p) * T * Bt;
      setTxt('kvPw', gb(wB)); setTxt('kvPk', gb(kB)); setTxt('kvPt', gb(wB + kB)); setTxt('kvPp', num(kvTok(p) / 1024, 3) + ' KiB');
      const { ctx, W, H } = st; if (!ctx) return;
      ctx.clearRect(0, 0, W, H);
      const GPUS = [[24, 'GPU 24 GB'], [80, 'H100 80 GB'], [640, '8×H100']];
      const l = 20, w = W - 40, top = 34, bh = 34, tot = (wB + kB) / GB, scale = Math.max(tot, 80) * 1.08;
      ctx.fillStyle = C.ink; ctx.font = '600 14px "Be Vietnam Pro", sans-serif'; ctx.fillText('Bộ nhớ cần thiết', l, top - 12);
      ctx.fillStyle = C.sea; ctx.fillRect(l, top, wB / GB / scale * w, bh);
      ctx.fillStyle = C.gold; ctx.fillRect(l + wB / GB / scale * w, top, kB / GB / scale * w, bh);
      ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.strokeRect(l, top, Math.min(w, tot / scale * w), bh);
      GPUS.forEach(([g, lab]) => { if (g > scale) return; const x = l + g / scale * w; ctx.strokeStyle = C.pos; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(x, top - 6); ctx.lineTo(x, top + bh + 6); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = C.pos; ctx.font = '11.5px "Be Vietnam Pro", sans-serif'; ctx.fillText(lab, x + 3, top + bh + 16); });
      ctx.font = '12px "Be Vietnam Pro", sans-serif'; ctx.fillStyle = C.sea; ctx.fillRect(l, top + bh + 26, 10, 10); ctx.fillStyle = C.ink; ctx.fillText('trọng số', l + 14, top + bh + 35);
      ctx.fillStyle = C.gold; ctx.fillRect(l + 84, top + bh + 26, 10, 10); ctx.fillStyle = C.ink; ctx.fillText('KV cache', l + 98, top + bh + 35);
      // đồ thị KV theo T
      const gx = 56, gy = top + bh + 64, gw = W - gx - 20, gh = H - gy - 34;
      if (gh < 60) return;
      const Ts = [0, 32768, 65536, 98304, 131072], maxK = kvTok(p) * 131072 * Bt / GB * 1.1;
      const X = t => gx + t / 131072 * gw, Y = v => gy + gh - v / maxK * gh;
      ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.strokeRect(gx, gy, gw, gh);
      ctx.fillStyle = C.muted; ctx.font = '11.5px "Be Vietnam Pro", sans-serif'; ctx.textAlign = 'center';
      Ts.forEach(t => ctx.fillText(t ? t / 1024 + 'k' : '0', X(t), gy + gh + 14)); ctx.fillText('độ dài ngữ cảnh (token)', gx + gw / 2, gy + gh + 28);
      ctx.textAlign = 'right'; ctx.fillText(gb(maxK / 1.1 * GB), gx - 4, Y(maxK / 1.1) + 4); ctx.fillText('0', gx - 4, gy + gh); ctx.textAlign = 'left';
      ctx.strokeStyle = C.gold; ctx.lineWidth = 2.5; ctx.beginPath();
      ctx.moveTo(X(0), Y(0)); ctx.lineTo(X(131072), Y(kvTok(p) * 131072 * Bt / GB)); ctx.stroke();
      const v0 = kB / GB; ctx.fillStyle = C.pos; ctx.beginPath(); ctx.arc(X(T), Y(v0), 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = C.ink; ctx.font = '600 12px "Be Vietnam Pro", sans-serif'; ctx.fillText('KV cache (tăng tuyến tính theo T)', gx + 6, gy + 14);
    }
    tR.upd(); bR.upd();
  },
});
})();
