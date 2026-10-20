/* =====================================================================
   AI: minh họa "Chọn token kế tiếp" (id: sampling, trang 3-generative.html)
   Logit cố định cho vài ngữ cảnh -> temperature -> top-k -> top-p -> chuẩn hóa lại -> lấy mẫu.
   Logit được ĐẶT TAY cho dễ thấy (không lấy từ mô hình thật).
   Chạy độc lập: lib/demos/run.html?demo=sampling
   EDIT: ngữ cảnh và logit ở CONTEXTS.
   ===================================================================== */
(() => {
const { range, softmax, setTxt, num, rng } = TFG;
const CONTEXTS = [
  { label: 'Câu mở', text: 'Hôm nay trời rất', toks: [['đẹp', 3.4], ['nóng', 3.0], ['nắng', 2.6], ['lạnh', 2.2], ['oi', 1.6], ['mưa', 1.2], ['xanh', 0.9], ['trong', 0.6], ['buồn', 0.2], ['dễ thương', -0.6], ['mặn', -2.2], ['nhanh', -2.6]] },
  { label: 'Câu hỏi sự thật', text: 'Thủ đô của Việt Nam là', toks: [['Hà Nội', 6.5], ['thành phố', 2.2], ['một', 1.6], ['TP.', 1.0], ['Huế', 0.7], ['Sài Gòn', 0.5], ['nơi', 0.4], ['Đà Nẵng', -0.4], ['Hải Phòng', -0.6], ['Paris', -2.5], ['con mèo', -4], ['42', -4.5]] },
  { label: 'Sáng tác', text: 'Ngày xửa ngày xưa, có một', toks: [['cô', 2.1], ['chàng', 2.0], ['ông', 1.9], ['con', 1.9], ['bà', 1.7], ['vị', 1.6], ['ngôi', 1.4], ['cậu', 1.4], ['nàng', 1.2], ['chú', 1.1], ['robot', 0.4], ['thuật toán', -0.8]] },
];

function filter(logits, T, k, p) {
  const prob = softmax(logits, Math.max(T, 1e-3));
  const order = prob.map((v, i) => i).sort((a, b) => prob[b] - prob[a]);
  const keep = new Array(prob.length).fill(false);
  let cum = 0;
  order.forEach((i, r) => {
    if (r >= k) return;
    if (cum < p || r === 0) keep[i] = true;
    cum += prob[i];
  });
  const z = prob.reduce((s, v, i) => s + (keep[i] ? v : 0), 0);
  return { prob, keep, fin: prob.map((v, i) => (keep[i] ? v / z : 0)) };
}

TFG.demo('sampling', {
  html: `<div class="demo-title"><h4>Chọn token kế tiếp</h4><span>Chỉnh temperature, top-k, top-p rồi lấy mẫu</span></div>
    <div class="demo-body">
      <div class="stagebox"><div class="pad">
        <div class="btnrow" id="smCtx" role="group" aria-label="Ngữ cảnh"></div>
        <p style="margin:14px 0 10px;font-size:19px"><span id="smText"></span> <b id="smOut" style="color:var(--sea);border-bottom:2px solid var(--sea)">___</b></p>
        <div class="bars" id="smBars" style="grid-template-columns:max-content minmax(0,1fr) 58px 46px"></div>
        <p class="note-s" style="margin-top:10px">Thanh xanh: xác suất cuối cùng (sau khi lọc và chuẩn hóa lại). Cột phải: số lần được chọn trong các lần lấy mẫu. Token bị gạch: bị top-k hoặc top-p loại.</p>
      </div></div>
      <div class="panel">
        <div class="ctrl"><label for="smT">Temperature T</label><output for="smT"></output>
          <input type="range" id="smT" min="0" max="2.5" step="0.05" value="1"></div>
        <div class="ctrl"><label for="smK">Top-k</label><output for="smK"></output>
          <input type="range" id="smK" min="1" max="12" step="1" value="12"></div>
        <div class="ctrl"><label for="smP">Top-p (nucleus)</label><output for="smP"></output>
          <input type="range" id="smP" min="0.05" max="1" step="0.01" value="1"></div>
        <div class="btnrow">
          <button class="btn" type="button" id="smOne">Lấy 1 mẫu</button>
          <button class="btn" type="button" id="smMany">Lấy 100 mẫu</button>
          <button class="btn" type="button" id="smClr">Xóa đếm</button>
        </div>
        <dl class="readout">
          <dt>Số token còn lại</dt><dd class="big" id="smN">—</dd>
          <dt>Entropy</dt><dd id="smH">—</dd>
          <dt>Số lần đã lấy</dt><dd id="smS">0</dd>
        </dl>
        <p class="note-s">T → 0 tương đương <b>greedy</b> (luôn chọn token xác suất cao nhất): ổn định nhưng dễ lặp. T lớn: đa dạng nhưng dễ ra token vô nghĩa. Top-k và top-p cắt bỏ phần đuôi phân phối, nơi chứa token "kỳ quặc".</p>
      </div>
    </div>`,
  init(root) {
    let ci = 0, counts = new Array(12).fill(0), total = 0; const R = rng(7);
    const T = range('smT', { show: v => (v < 0.05 ? '0 (greedy)' : num(v, 3)), onInput: () => draw() });
    const K = range('smK', { show: v => (v >= 12 ? 'tắt' : v), onInput: () => draw() });
    const Pp = range('smP', { show: v => (v >= 1 ? 'tắt' : num(v, 2)), onInput: () => draw() });
    const box = document.getElementById('smCtx');
    const bs = CONTEXTS.map((c, i) => { const b = document.createElement('button'); b.className = 'btn'; b.type = 'button'; b.textContent = c.label;
      b.addEventListener('click', () => { ci = i; TFG.pressGroup(bs, b); clear(); }); box.appendChild(b); return b; });
    TFG.pressGroup(bs, bs[0]);
    const cur = () => { const c = CONTEXTS[ci]; return filter(c.toks.map(t => t[1]), T.get() < 0.05 ? 1e-3 : T.get(), K.get(), Pp.get()); };
    function sample(n) {
      const { fin } = cur(); let last = 0;
      for (let s = 0; s < n; s++) { let u = R(), i = 0; while (i < fin.length - 1 && (u -= fin[i]) > 0) i++; while (fin[i] === 0 && i > 0) i--; counts[i]++; total++; last = i; }
      setTxt('smOut', CONTEXTS[ci].toks[last][0]); draw();
    }
    function clear() { counts = new Array(12).fill(0); total = 0; setTxt('smOut', '___'); draw(); }
    document.getElementById('smOne').addEventListener('click', () => sample(1));
    document.getElementById('smMany').addEventListener('click', () => sample(100));
    document.getElementById('smClr').addEventListener('click', clear);
    function draw() {
      const c = CONTEXTS[ci], { keep, fin } = cur();
      setTxt('smText', c.text);
      const mx = Math.max(...fin);
      document.getElementById('smBars').innerHTML = c.toks.map(([w], i) =>
        `<span class="lab${keep[i] ? '' : ' off'}">${w}</span><div class="bar${keep[i] ? '' : ' off'}"><i style="width:${(fin[i] / mx * 100).toFixed(1)}%"></i></div><span class="v">${(fin[i] * 100).toFixed(1)}%</span><span class="v" style="color:var(--muted)">${total ? counts[i] : ''}</span>`).join('');
      setTxt('smN', keep.filter(Boolean).length + ' / ' + keep.length);
      setTxt('smH', num(-fin.reduce((s, p) => s + (p > 0 ? p * Math.log2(p) : 0), 0), 3) + ' bit');
      setTxt('smS', total);
    }
    T.upd(); K.upd(); Pp.upd();
  },
});
})();
