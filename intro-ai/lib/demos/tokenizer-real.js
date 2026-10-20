/* =====================================================================
   AI: minh họa "Tokenizer thật của GPT" (id: tokenizer-real, trang 2-transformer.html)
   ⚠ DÙNG DỊCH VỤ BÊN NGOÀI: tải thư viện gpt-tokenizer@2.9.0 (bản UMD) từ CDN jsDelivr,
   gồm 3 bảng từ vựng thật: r50k_base (GPT-2/GPT-3), cl100k_base (GPT-3.5/GPT-4), o200k_base (GPT-4o).
   Tổng dung lượng tải khoảng 3,5 MB, chỉ tải khi cuộn tới minh họa.
   Nếu CDN không phản hồi: minh họa tự ẩn và hiện thông báo (xem TFG.externalDown trong lib/tfg.js).
   Chạy độc lập: lib/demos/run.html?demo=tokenizer-real
   EDIT: phiên bản thư viện ở VER; câu mẫu ở EXAMPLES.
   ===================================================================== */
(() => {
const { setTxt, pressGroup, num } = TFG;
const VER = '2.9.0';
const CDN = `https://cdn.jsdelivr.net/npm/gpt-tokenizer@${VER}/dist/`;
const ENC = [
  { file: 'r50k_base', glob: 'GPTTokenizer_r50k_base', name: 'GPT-2 / GPT-3', vocab: '≈ 50 nghìn' },
  { file: 'cl100k_base', glob: 'GPTTokenizer_cl100k_base', name: 'GPT-3.5 / GPT-4', vocab: '≈ 100 nghìn' },
  { file: 'o200k_base', glob: 'GPTTokenizer_o200k_base', name: 'GPT-4o', vocab: '≈ 200 nghìn' },
];
const EXAMPLES = [
  ['Tiếng Việt', 'Mô hình học sâu dự đoán token tiếp theo.'],
  ['English (cùng nghĩa)', 'The deep learning model predicts the next token.'],
  ['strawberry', 'How many r are in strawberry?'],
  ['Số', '1234567 + 89 = 1234656'],
  ['Emoji', 'Chúc mừng sinh nhật 🎂🎉'],
];
let loading = null;
const loadOne = e => new Promise((res, rej) => {
  if (window[e.glob]) return res();
  const s = document.createElement('script'); s.src = CDN + e.file + '.js'; s.async = true;
  s.onload = () => (window[e.glob] ? res() : rej(new Error('Thư viện không tạo biến ' + e.glob)));
  s.onerror = () => rej(new Error('Không tải được ' + s.src));
  document.head.appendChild(s);
});
const loadAll = () => loading || (loading = Promise.all(ENC.map(loadOne)).catch(err => { loading = null; throw err; }));

TFG.demo('tokenizer-real', {
  external: { name: 'jsDelivr CDN (thư viện gpt-tokenizer)', check: loadAll, timeout: 25000 },
  html: `<div class="demo-title"><h4>Tokenizer thật của GPT</h4><span>So sánh 3 thế hệ tokenizer trên cùng một câu</span></div>
    <div class="demo-body stack">
      <div class="stagebox"><div class="pad">
        <label for="trIn" class="note-s">Gõ câu bất kỳ</label>
        <textarea id="trIn" class="inp" rows="2"></textarea>
        <div class="btnrow" style="margin:10px 0 6px" id="trEx"></div>
        <div id="trRows"></div>
        <p class="note-s" style="margin-top:6px">Dấu · là khoảng trắng nằm ở đầu token. Ô có ký hiệu � chứa một phần của một ký tự nhiều byte (UTF-8): tokenizer làm việc trên byte, không phải trên ký tự.</p>
      </div></div>
      <div class="panel">
        <table class="mini"><thead><tr><th>Tokenizer</th><th>Từ vựng</th><th>Số token</th><th>Ký tự / token</th></tr></thead><tbody id="trTab"></tbody></table>
        <p class="note-s">Thử nút "Tiếng Việt" rồi "English": cùng một ý, GPT-2 tốn gấp nhiều lần token cho tiếng Việt, còn GPT-4o đã thu hẹp khoảng cách nhờ từ vựng lớn gấp 4 và dữ liệu đa ngôn ngữ hơn. Nút "strawberry" cho thấy vì sao LLM khó đếm chữ cái.</p>
      </div>
    </div>`,
  init() {
    const enc = ENC.map(e => ({ ...e, tk: window[e.glob] }));
    const inp = document.getElementById('trIn'), ex = document.getElementById('trEx');
    const bs = EXAMPLES.map(([lab, t]) => { const b = document.createElement('button'); b.className = 'btn'; b.type = 'button'; b.textContent = lab;
      b.addEventListener('click', () => { inp.value = t; pressGroup(bs, b); draw(); }); ex.appendChild(b); return b; });
    inp.value = EXAMPLES[0][1]; pressGroup(bs, bs[0]);
    inp.addEventListener('input', () => { pressGroup(bs, null); draw(); });
    const rows = document.getElementById('trRows');
    rows.innerHTML = enc.map((e, k) => `<h5 style="margin:12px 0 6px;font-size:15px">${e.name} <span class="note-s" id="trN${k}"></span></h5><div class="chips" id="trC${k}"></div>`).join('');
    function draw() {
      const t = inp.value, chars = [...t].length;
      document.getElementById('trTab').innerHTML = enc.map((e, k) => {
        const ids = e.tk.encode(t), box = document.getElementById('trC' + k); box.innerHTML = '';
        ids.slice(0, 300).forEach((id, i) => {
          const c = document.createElement('span'); c.className = 'chip c' + (i % 5);
          c.innerHTML = '<span></span><small></small>';
          c.firstChild.textContent = e.tk.decode([id]).replace(/^ /, '·').replace(/\n/g, '⏎'); c.lastChild.textContent = id;
          box.appendChild(c);
        });
        setTxt('trN' + k, ids.length + ' token');
        return `<tr><td>${e.name}</td><td>${e.vocab}</td><td>${ids.length}</td><td>${ids.length ? num(chars / ids.length, 3) : '—'}</td></tr>`;
      }).join('');
    }
    draw();
  },
});
})();
