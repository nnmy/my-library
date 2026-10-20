/* =====================================================================
   AI: minh họa "RAG thu nhỏ" (id: rag, trang 5-llm.html)
   Truy hồi top-k đoạn văn từ một kho nhỏ bằng TF-IDF + cosine (trên âm tiết và cặp âm tiết),
   rồi ghép thành prompt gửi cho LLM. Hệ thống thật dùng embedding từ mạng nơ-ron (dense retrieval),
   thường kết hợp BM25; TF-IDF ở đây chỉ để thấy được cơ chế và chạy ngay trên trình duyệt.
   Chạy độc lập: lib/demos/run.html?demo=rag
   EDIT: kho văn bản ở DOCS; câu hỏi mẫu ở QUERIES.
   ===================================================================== */
(() => {
const { range, setTxt, pressGroup } = TFG;
const DOCS = [
  ['Transformer', 'Self-attention tính softmax của QK^T chia cho căn bậc hai của d_k. Phép chia này giữ cho tích vô hướng không quá lớn khi số chiều tăng, tránh làm softmax bão hòa và gradient biến mất.'],
  ['Transformer', 'Mask nhân quả chặn mỗi token nhìn các token phía sau nó. Nhờ đó mô hình decoder như GPT có thể được huấn luyện để dự đoán token tiếp theo trên cả câu cùng lúc.'],
  ['Tokenizer', 'Byte-Pair Encoding bắt đầu từ ký tự và lặp lại việc gộp cặp token xuất hiện nhiều nhất. Tiếng Việt thường tốn nhiều token hơn tiếng Anh vì tokenizer học chủ yếu trên dữ liệu tiếng Anh.'],
  ['Diffusion', 'Mô hình diffusion học cách đoán nhiễu đã được cộng vào ảnh. Khi sinh ảnh, mô hình bắt đầu từ nhiễu thuần và khử nhiễu dần qua hai mươi đến năm mươi bước.'],
  ['Diffusion', 'Stable Diffusion chạy diffusion trong không gian ẩn của một VAE: ảnh 512 nhân 512 được nén thành ảnh ẩn 64 nhân 64 với 4 kênh, nhỏ hơn khoảng 48 lần.'],
  ['CLIP', 'CLIP được huấn luyện trên 400 triệu cặp ảnh và chú thích bằng hàm mất mát tương phản InfoNCE. Cặp đúng được kéo lại gần nhau, cặp sai bị đẩy ra xa trong không gian embedding chung.'],
  ['CLIP', 'Phân loại zero-shot với CLIP: viết câu mô tả cho mỗi lớp, mã hóa thành vector, rồi chọn câu có độ tương đồng cosine cao nhất với ảnh. Không cần huấn luyện thêm.'],
  ['LoRA', 'LoRA đóng băng trọng số gốc và chỉ học hai ma trận nhỏ B và A có hạng r. Với ma trận 4096 nhân 4096 và r bằng 8, số tham số cần học giảm khoảng 256 lần.'],
  ['Lượng tử hóa', 'Lượng tử hóa lưu trọng số bằng ít bit hơn, ví dụ 4 bit thay vì 16 bit, giúp mô hình 70 tỉ tham số chạy được trên ít GPU hơn với sai số nhỏ.'],
  ['KV cache', 'KV cache lưu key và value của các token đã xử lý để không phải tính lại khi sinh token mới. Bộ nhớ KV cache tăng tuyến tính theo độ dài ngữ cảnh và số yêu cầu chạy song song.'],
  ['Ẩm thực', 'Phở bò Hà Nội có nước dùng ninh từ xương bò với quế, hồi, gừng nướng. Bánh phở mềm, ăn kèm hành lá và thịt bò tái hoặc chín.'],
  ['Thời tiết', 'Kyoto có mùa thu đẹp nhất vào tháng mười một khi lá phong chuyển đỏ. Mùa hè ở Kyoto nóng và ẩm, nhiệt độ thường trên ba mươi độ.'],
];
const QUERIES = ['Vì sao chia cho căn bậc hai của d_k?', 'Stable Diffusion nén ảnh bao nhiêu lần?', 'LoRA giảm bao nhiêu tham số?', 'Zero-shot với CLIP làm ra sao?', 'Ăn gì ở Hà Nội?'];
const STOP = new Set('là của và các có được với cho một những này để thì khi ra vào như trong từ bao nhiêu thế nào ra sao làm gì vì sao ở'.split(' '));
const words = s => s.normalize('NFC').toLowerCase().split(/[^0-9a-zà-ỹđ_]+/u).filter(w => w && !STOP.has(w));
const terms = s => { const w = words(s); return [...w, ...w.slice(1).map((x, i) => w[i] + ' ' + x)]; };

TFG.demo('rag', {
  html: `<div class="demo-title"><h4>RAG thu nhỏ</h4><span>Gõ câu hỏi; xem đoạn nào được truy hồi và prompt cuối cùng</span></div>
    <div class="demo-body">
      <div class="stagebox"><div class="pad">
        <label for="rgQ" class="note-s">Câu hỏi</label>
        <input id="rgQ" class="inp" type="text">
        <div class="btnrow" style="margin:10px 0 14px" id="rgEx"></div>
        <div class="note-s" style="margin-bottom:6px">Điểm cosine TF-IDF giữa câu hỏi và từng đoạn trong kho (${DOCS.length} đoạn):</div>
        <div class="bars" id="rgBars" style="grid-template-columns:max-content minmax(0,1fr) 46px"></div>
        <div class="note-s" style="margin:14px 0 6px">Prompt gửi cho LLM:</div>
        <pre class="promptbox" id="rgP"></pre>
      </div></div>
      <div class="panel">
        <div class="ctrl"><label for="rgK">Số đoạn truy hồi (top-k)</label><output for="rgK"></output>
          <input type="range" id="rgK" min="1" max="5" step="1" value="2"></div>
        <dl class="readout">
          <dt>Đoạn tốt nhất</dt><dd class="big" id="rgTop">—</dd>
          <dt>Điểm cao nhất</dt><dd id="rgS">—</dd>
          <dt>Độ dài prompt</dt><dd id="rgL">—</dd>
        </dl>
        <p class="note-s"><b>Tô vàng</b>: từ khớp với câu hỏi. Thử hỏi "Ăn gì ở Hà Nội?": kho có đúng một đoạn liên quan. Thử một câu không có trong kho: điểm đều thấp, và prompt dặn LLM nói "không biết" thay vì bịa.</p>
        <p class="note-s">TF-IDF chỉ khớp <i>từ</i>. Embedding từ mạng nơ-ron khớp <i>ý nghĩa</i>: "giảm tham số" và "ít trọng số cần học" sẽ gần nhau dù không chung từ nào.</p>
      </div>
    </div>`,
  init() {
    const docT = DOCS.map(d => terms(d[1]));
    const df = new Map(); docT.forEach(ts => new Set(ts).forEach(t => df.set(t, (df.get(t) || 0) + 1)));
    const idf = t => Math.log((DOCS.length + 1) / ((df.get(t) || 0) + 1)) + 1;
    const vec = ts => { const m = new Map(); ts.forEach(t => m.set(t, (m.get(t) || 0) + 1)); const v = new Map(); m.forEach((c, t) => v.set(t, (1 + Math.log(c)) * idf(t))); return v; };
    const nrm = v => Math.sqrt([...v.values()].reduce((s, x) => s + x * x, 0)) || 1;
    const DV = docT.map(vec), DN = DV.map(nrm);
    const q = document.getElementById('rgQ'), ex = document.getElementById('rgEx');
    const bs = QUERIES.map(t => { const b = document.createElement('button'); b.className = 'btn'; b.type = 'button'; b.textContent = t;
      b.addEventListener('click', () => { q.value = t; pressGroup(bs, b); run(); }); ex.appendChild(b); return b; });
    q.value = QUERIES[0]; pressGroup(bs, bs[0]);
    q.addEventListener('input', () => { pressGroup(bs, null); run(); });
    const kR = range('rgK', { show: v => v, onInput: () => run() });
    const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    function mark(text, qw) { return esc(text).replace(/[0-9a-zà-ỹđ_]+/giu, w => (qw.has(w.normalize('NFC').toLowerCase()) ? `<mark class="hit">${w}</mark>` : w)); }
    function run() {
      const qv = vec(terms(q.value)), qn = nrm(qv), qw = new Set(words(q.value));
      const sc = DV.map((v, i) => { let s = 0; qv.forEach((x, t) => { if (v.has(t)) s += x * v.get(t); }); return s / (qn * DN[i]); });
      const ord = sc.map((s, i) => i).sort((a, b) => sc[b] - sc[a]), K = kR.get(), top = ord.slice(0, K).filter(i => sc[i] > 0);
      document.getElementById('rgBars').innerHTML = ord.map(i => `<span class="lab" style="${top.includes(i) ? 'font-weight:700' : 'color:var(--muted)'}">${i + 1}. ${DOCS[i][0]}</span><div class="bar${top.includes(i) ? '' : ' off'}"><i style="width:${(sc[i] / Math.max(sc[ord[0]], 1e-9) * 100).toFixed(1)}%"></i></div><span class="v">${sc[i].toFixed(2).replace('.', ',')}</span>`).join('');
      const ctxs = top.map((i, k) => `[${k + 1}] (${DOCS[i][0]}) ${mark(DOCS[i][1], qw)}`).join('\n');
      const prompt = `<span class="dim">[system]</span> Trả lời câu hỏi CHỈ dựa trên các tài liệu dưới đây. Trích dẫn số [n]. Nếu tài liệu không chứa câu trả lời, hãy nói "Tôi không tìm thấy thông tin".\n\n<span class="dim">[tài liệu]</span>\n${ctxs || '(không tìm thấy đoạn nào khớp)'}\n\n<span class="dim">[câu hỏi]</span> ${esc(q.value)}`;
      document.getElementById('rgP').innerHTML = prompt;
      setTxt('rgTop', top.length ? '#' + (top[0] + 1) + ' ' + DOCS[top[0]][0] : '(không có)'); setTxt('rgS', sc[ord[0]].toFixed(3).replace('.', ','));
      setTxt('rgL', '≈ ' + Math.round(document.getElementById('rgP').textContent.length / 3.2) + ' token');
    }
    kR.upd();
  },
});
})();
