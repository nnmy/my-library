/* =====================================================================
   AI: minh họa "Tokenizer BPE thu nhỏ" (id: bpe, trang 2-transformer.html)
   Huấn luyện Byte-Pair Encoding (mức ký tự, đánh dấu đầu từ bằng ▁ như SentencePiece)
   trên một kho văn bản nhỏ ngay trong trình duyệt, rồi tách câu người dùng nhập.
   Chạy độc lập: lib/demos/run.html?demo=bpe
   EDIT: kho văn bản huấn luyện ở CORPUS; câu mẫu ở EXAMPLES.
   ===================================================================== */
(() => {
const { range, setTxt, pressGroup } = TFG;

const CORPUS = `
mô hình học sâu học các biểu diễn từ dữ liệu. mô hình transformer dùng cơ chế attention để mỗi token nhìn thấy mọi token khác.
mỗi câu được tách thành các token, mỗi token được đổi thành một vector embedding. các vector này đi qua nhiều lớp attention và lớp truyền thẳng.
mô hình ngôn ngữ lớn được huấn luyện để dự đoán token tiếp theo. khi sinh văn bản, mô hình chọn từng token một rồi nối vào câu.
học sâu hiện đại dùng dữ liệu rất lớn và mô hình rất lớn. dữ liệu văn bản, dữ liệu hình ảnh và dữ liệu âm thanh đều có thể đổi thành token.
the transformer model uses attention so that every token can attend to every other token in the sequence.
large language models are trained to predict the next token. the model learns a representation of language from a large dataset.
training a model on more data and with more parameters usually makes the model better at predicting the next token.
attention is all you need. the attention layer computes queries keys and values for every token.
học máy, học sâu, mô hình, dữ liệu, huấn luyện, dự đoán, attention, token, transformer, embedding, vector.
`.repeat(1);

const EXAMPLES = [
  ['Tiếng Việt', 'mô hình học sâu dự đoán token tiếp theo'],
  ['English', 'the model predicts the next token'],
  ['Từ hiếm', 'antidisestablishmentarianism và phở bò'],
  ['Số & code', 'x = 12345 + 678; print(x)'],
];

/* ---------- huấn luyện BPE ---------- */
function train(text, maxMerges) {
  const freq = new Map();
  text.normalize('NFC').toLowerCase().split(/\s+/).filter(Boolean).forEach(w => freq.set(w, (freq.get(w) || 0) + 1));
  let words = [...freq].map(([w, f]) => ({ sym: ['▁', ...w], f }));
  const base = new Set(); words.forEach(w => w.sym.forEach(c => base.add(c)));
  const merges = [];
  for (let m = 0; m < maxMerges; m++) {
    const pc = new Map();
    words.forEach(w => { for (let i = 0; i < w.sym.length - 1; i++) { const k = w.sym[i] + '\u0000' + w.sym[i + 1]; pc.set(k, (pc.get(k) || 0) + w.f); } });
    let best = null, bc = 1;
    pc.forEach((c, k) => { if (c > bc) { bc = c; best = k; } });
    if (!best) break;
    const [a, b] = best.split('\u0000');
    merges.push({ a, b, ab: a + b, count: bc });
    words.forEach(w => {
      const out = [];
      for (let i = 0; i < w.sym.length; i++) {
        if (i < w.sym.length - 1 && w.sym[i] === a && w.sym[i + 1] === b) { out.push(a + b); i++; } else out.push(w.sym[i]);
      }
      w.sym = out;
    });
  }
  return { base: [...base].sort(), merges };
}

/* ---------- tách một câu bằng k phép gộp đầu tiên ---------- */
function encode(text, model, k) {
  const rank = new Map(); model.merges.slice(0, k).forEach((m, i) => rank.set(m.a + '\u0000' + m.b, i));
  const toks = [];
  text.normalize('NFC').toLowerCase().split(/\s+/).filter(Boolean).forEach(w => {
    let sym = ['▁', ...w];
    for (;;) {
      let bi = -1, br = Infinity;
      for (let i = 0; i < sym.length - 1; i++) { const r = rank.get(sym[i] + '\u0000' + sym[i + 1]); if (r !== undefined && r < br) { br = r; bi = i; } }
      if (bi < 0) break;
      sym = [...sym.slice(0, bi), sym[bi] + sym[bi + 1], ...sym.slice(bi + 2)];
    }
    toks.push(...sym);
  });
  return toks;
}

TFG.demo('bpe', {
  html: `<div class="demo-title"><h4>Tokenizer BPE thu nhỏ</h4><span>Chỉnh số phép gộp, gõ câu bất kỳ</span></div>
    <div class="demo-body">
      <div class="stagebox"><div class="pad">
        <label for="bpIn" class="note-s">Câu cần tách (chữ thường; ▁ đánh dấu đầu một từ)</label>
        <textarea id="bpIn" class="inp" rows="2"></textarea>
        <div class="btnrow" style="margin:10px 0 14px" id="bpEx"></div>
        <div class="chips" id="bpOut" aria-live="polite"></div>
        <p class="note-s" style="margin-top:14px">Số nhỏ dưới mỗi token là ID trong từ vựng. Ô viền đỏ: ký tự không có trong kho huấn luyện; tokenizer thật dùng <i>byte fallback</i> (tách thành các byte UTF-8) nên không bao giờ gặp token lạ.</p>
        <h5 style="margin:16px 0 6px;font-size:15px">Các phép gộp mới nhất</h5>
        <div class="chips" id="bpMerges"></div>
      </div></div>
      <div class="panel">
        <div class="ctrl"><label for="bpK">Số phép gộp (merges)</label><output for="bpK"></output>
          <input type="range" id="bpK" min="0" max="400" step="1" value="120"></div>
        <dl class="readout">
          <dt>Kích thước từ vựng</dt><dd class="big" id="bpV">—</dd>
          <dt>Số ký tự</dt><dd id="bpC">—</dd>
          <dt>Số token</dt><dd class="big" id="bpN">—</dd>
          <dt>Ký tự / token</dt><dd id="bpR">—</dd>
        </dl>
        <p class="note-s">0 phép gộp = tách từng ký tự (chuỗi rất dài). Càng gộp nhiều, các cụm hay gặp như "▁mô", "▁token" trở thành một token, chuỗi ngắn lại nhưng từ vựng lớn hơn. Từ không có trong kho vẫn tách được, chỉ là thành nhiều mảnh nhỏ.</p>
        <p class="note-s">Kho huấn luyện ở đây chỉ vài trăm từ. GPT-4 dùng khoảng 100 nghìn token, Llama 3 khoảng 128 nghìn.</p>
      </div>
    </div>`,
  init() {
    const model = train(CORPUS, 400);
    const kEl = document.getElementById('bpK'); kEl.max = model.merges.length;
    const inp = document.getElementById('bpIn'), out = document.getElementById('bpOut'), mg = document.getElementById('bpMerges');
    const exBox = document.getElementById('bpEx');
    const exBtns = EXAMPLES.map(([lab, txt]) => {
      const b = document.createElement('button'); b.className = 'btn'; b.type = 'button'; b.textContent = lab; b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', () => { inp.value = txt; pressGroup(exBtns, b); draw(); }); exBox.appendChild(b); return b;
    });
    inp.value = EXAMPLES[0][1]; pressGroup(exBtns, exBtns[0]);
    const k = range('bpK', { show: v => v + ' / ' + model.merges.length, onInput: () => draw() });
    inp.addEventListener('input', () => { pressGroup(exBtns, null); draw(); });
    function draw() {
      const K = k.get();
      const vocab = [...model.base, ...model.merges.slice(0, K).map(m => m.ab)];
      const id = new Map(vocab.map((t, i) => [t, i]));
      const toks = encode(inp.value, model, K);
      out.innerHTML = '';
      toks.forEach((t, i) => {
        const c = document.createElement('span'); c.className = 'chip c' + (i % 5);
        const known = id.has(t);
        if (!known) c.style.borderColor = 'var(--pos)', c.style.borderWidth = '2px';
        c.innerHTML = `<span></span><small>${known ? id.get(t) : '?'}</small>`; c.firstChild.textContent = t;
        out.appendChild(c);
      });
      mg.innerHTML = '';
      model.merges.slice(Math.max(0, K - 8), K).reverse().forEach(m => {
        const c = document.createElement('span'); c.className = 'chip';
        c.innerHTML = '<span></span><small>×' + m.count + '</small>'; c.firstChild.textContent = m.a + ' + ' + m.b + ' → ' + m.ab; mg.appendChild(c);
      });
      if (!K) mg.textContent = '(chưa gộp gì: mỗi ký tự là một token)';
      const chars = inp.value.replace(/\s+/g, ' ').trim().length;
      setTxt('bpV', vocab.length); setTxt('bpC', chars); setTxt('bpN', toks.length);
      setTxt('bpR', toks.length ? (chars / toks.length).toFixed(2).replace('.', ',') : '—');
    }
    k.upd();
  },
});
})();
