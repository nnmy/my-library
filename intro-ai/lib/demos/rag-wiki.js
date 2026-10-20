/* =====================================================================
   AI: minh họa "RAG trên Wikipedia" (id: rag-wiki, trang 5-llm.html)
   ⚠ DÙNG DỊCH VỤ BÊN NGOÀI: MediaWiki Action API của Wikipedia (vi / en), công khai, không cần khóa,
   gọi trực tiếp từ trình duyệt nhờ tham số origin=* (CORS).
     1. list=search  : tìm 5 bài liên quan đến câu hỏi
     2. prop=extracts: lấy phần mở đầu (văn bản thuần) của các bài đó
     3. Cắt thành đoạn 2–3 câu, xếp hạng bằng TF-IDF cosine với câu hỏi, lấy top-k, ghép prompt.
   Nếu API không phản hồi: minh họa tự ẩn và hiện thông báo (TFG.externalDown trong lib/tfg.js).
   Chạy độc lập: lib/demos/run.html?demo=rag-wiki
   ===================================================================== */
(() => {
const { range, setTxt, pressGroup } = TFG;
const API = lang => `https://${lang}.wikipedia.org/w/api.php`;
const QUERIES = { vi: ['Ai phát minh ra máy hơi nước?', 'Vịnh Hạ Long có bao nhiêu hòn đảo?', 'Transformer trong học máy là gì?'],
  en: ['Who invented the steam engine?', 'How many islands are in Ha Long Bay?', 'What is a transformer in machine learning?'] };
const STOP = new Set(('là của và các có được với cho một những này để thì khi ra vào như trong từ bao nhiêu thế nào ra sao làm gì vì sao ở ai ' +
  'the a an of and or to in on at is are was were be by for with what who how many which does do it its as from that this').split(' '));
const words = s => s.normalize('NFC').toLowerCase().split(/[^0-9a-zà-ỹđ]+/u).filter(w => w && !STOP.has(w));
const terms = s => { const w = words(s); return [...w, ...w.slice(1).map((x, i) => w[i] + ' ' + x)]; };
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const get = (lang, params) => TFG.withTimeout(fetch(API(lang) + '?' + new URLSearchParams({ format: 'json', origin: '*', ...params })).then(r => {
  if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }), 12000, 'Wikipedia không phản hồi');

const EXT = { name: 'Wikipedia API (wikipedia.org)', check: () => get('vi', { action: 'query', meta: 'siteinfo' }).then(j => { if (!j.query) throw new Error('Phản hồi lạ'); }) };

TFG.demo('rag-wiki', {
  external: EXT,
  html: `<div class="demo-title"><h4>RAG trên Wikipedia</h4><span>Truy hồi thật từ Wikipedia, xếp hạng đoạn, ghép prompt</span></div>
    <div class="demo-body">
      <div class="stagebox"><div class="pad">
        <label for="rwQ" class="note-s">Câu hỏi</label>
        <div style="display:flex;gap:8px"><input id="rwQ" class="inp" type="text"><button class="btn" type="button" id="rwGo">Tìm</button></div>
        <div class="btnrow" style="margin:10px 0 12px" id="rwEx"></div>
        <div class="note-s" id="rwStatus" aria-live="polite"></div>
        <div class="note-s" style="margin:10px 0 6px">Đoạn được truy hồi (xếp theo cosine TF-IDF với câu hỏi):</div>
        <div id="rwChunks"></div>
        <div class="note-s" style="margin:14px 0 6px">Prompt gửi cho LLM:</div>
        <pre class="promptbox" id="rwP"></pre>
      </div></div>
      <div class="panel">
        <div class="btnrow" role="group" aria-label="Phiên bản Wikipedia">
          <button class="btn" type="button" data-l="vi" aria-pressed="true">Tiếng Việt</button>
          <button class="btn" type="button" data-l="en" aria-pressed="false">English</button>
        </div>
        <div class="ctrl"><label for="rwK">Số đoạn đưa vào prompt (top-k)</label><output for="rwK"></output>
          <input type="range" id="rwK" min="1" max="6" step="1" value="3"></div>
        <dl class="readout">
          <dt>Bài tìm thấy</dt><dd id="rwA">—</dd>
          <dt>Số đoạn ứng viên</dt><dd id="rwN">—</dd>
          <dt>Độ dài prompt</dt><dd id="rwL">—</dd>
        </dl>
        <div><div class="note-s" style="margin-bottom:4px">Nguồn (bài Wikipedia):</div><ol class="refs" id="rwSrc" style="margin:0"></ol></div>
        <p class="note-s">Đây là hai tầng truy hồi giống hệ thống thật: công cụ tìm kiếm của Wikipedia chọn bài (tầng thô), rồi TF-IDF chọn đoạn trong bài (tầng tinh, thay cho reranker). Bước cuối, gửi prompt cho LLM, không thực hiện ở đây.</p>
      </div>
    </div>`,
  init(root) {
    let lang = 'vi', chunks = [], busy = false;
    const q = document.getElementById('rwQ'), exBox = document.getElementById('rwEx');
    let exBtns = [];
    const setEx = () => { exBox.innerHTML = ''; exBtns = QUERIES[lang].map(t => { const b = document.createElement('button'); b.className = 'btn'; b.type = 'button'; b.textContent = t;
      b.addEventListener('click', () => { q.value = t; pressGroup(exBtns, b); search(); }); exBox.appendChild(b); return b; }); };
    const lb = [...root.querySelectorAll('[data-l]')];
    lb.forEach(b => b.addEventListener('click', () => { lang = b.dataset.l; pressGroup(lb, b); setEx(); q.value = QUERIES[lang][0]; pressGroup(exBtns, exBtns[0]); search(); }));
    document.getElementById('rwGo').addEventListener('click', () => { pressGroup(exBtns, null); search(); });
    q.addEventListener('keydown', e => { if (e.key === 'Enter') { pressGroup(exBtns, null); search(); } });
    const kR = range('rwK', { show: v => v, onInput: () => rank() });
    async function search() {
      const query = q.value.trim(); if (!query || busy) return;
      busy = true; setTxt('rwStatus', 'Đang tìm trên ' + lang + '.wikipedia.org…');
      try {
        const s = await get(lang, { action: 'query', list: 'search', srsearch: query, srlimit: 5 });
        const hits = (s.query && s.query.search) || [];
        if (!hits.length) { chunks = []; setTxt('rwStatus', 'Không tìm thấy bài nào. Thử diễn đạt khác.'); rank(); return; }
        const e = await get(lang, { action: 'query', prop: 'extracts', exintro: 1, explaintext: 1, exlimit: 20, pageids: hits.map(h => h.pageid).join('|') });
        const pages = Object.values((e.query && e.query.pages) || {}).sort((a, b) => hits.findIndex(h => h.pageid === a.pageid) - hits.findIndex(h => h.pageid === b.pageid));
        chunks = [];
        pages.forEach(p => {
          const sents = (p.extract || '').replace(/\s+/g, ' ').split(/(?<=[.!?])\s+(?=[A-ZÀ-ỸĐ0-9"“(])/u).filter(x => x.length > 20);
          for (let i = 0; i < sents.length; i += 2) chunks.push({ title: p.title, text: sents.slice(i, i + 2).join(' ') });
        });
        document.getElementById('rwSrc').innerHTML = pages.map(p => `<li><a href="https://${lang}.wikipedia.org/?curid=${p.pageid}" rel="noopener">${esc(p.title)}</a></li>`).join('');
        setTxt('rwA', pages.length); setTxt('rwStatus', 'Nội dung lấy trực tiếp từ Wikipedia (CC BY-SA), có thể thay đổi theo thời gian.');
        rank();
      } catch (err) { TFG.externalDown(root, EXT, err); }
      finally { busy = false; }
    }
    function rank() {
      const query = q.value, K = kR.get(), box = document.getElementById('rwChunks');
      setTxt('rwN', chunks.length);
      if (!chunks.length) { box.innerHTML = ''; document.getElementById('rwP').textContent = ''; setTxt('rwL', '—'); return; }
      const docT = chunks.map(c => terms(c.title + ' ' + c.text)), df = new Map();
      docT.forEach(ts => new Set(ts).forEach(t => df.set(t, (df.get(t) || 0) + 1)));
      const idf = t => Math.log((chunks.length + 1) / ((df.get(t) || 0) + 1)) + 1;
      const vec = ts => { const m = new Map(); ts.forEach(t => m.set(t, (m.get(t) || 0) + 1)); const v = new Map(); m.forEach((c, t) => v.set(t, (1 + Math.log(c)) * idf(t))); return v; };
      const nrm = v => Math.sqrt([...v.values()].reduce((s, x) => s + x * x, 0)) || 1;
      const qv = vec(terms(query)), qn = nrm(qv), qw = new Set(words(query));
      const sc = docT.map(ts => { const v = vec(ts); let s = 0; qv.forEach((x, t) => { if (v.has(t)) s += x * v.get(t); }); return s / (qn * nrm(v)); });
      const ord = sc.map((s, i) => i).sort((a, b) => sc[b] - sc[a]), top = ord.slice(0, K), mx = Math.max(sc[ord[0]], 1e-9);
      const mark = t => esc(t).replace(/[0-9a-zà-ỹđ]+/giu, w => (qw.has(w.normalize('NFC').toLowerCase()) ? `<mark class="hit">${w}</mark>` : w));
      box.innerHTML = ord.slice(0, 8).map((i, r) => `<div style="display:grid;grid-template-columns:52px minmax(0,1fr);gap:4px 10px;margin-bottom:8px;${r < K ? '' : 'opacity:.45'}">
          <div><div class="bars" style="grid-template-columns:1fr"><div class="bar${r < K ? '' : ' off'}"><i style="width:${(sc[i] / mx * 100).toFixed(0)}%"></i></div></div><span class="v" style="font:600 12px var(--mono)">${sc[i].toFixed(2).replace('.', ',')}</span></div>
          <div style="font-size:14px"><b>${esc(chunks[i].title)}</b>: ${mark(chunks[i].text)}</div></div>`).join('');
      const ctx = top.map((i, k) => `[${k + 1}] (${esc(chunks[i].title)}) ${mark(chunks[i].text)}`).join('\n');
      document.getElementById('rwP').innerHTML = `<span class="dim">[system]</span> Trả lời CHỈ dựa trên các tài liệu dưới đây và trích dẫn số [n]. Nếu tài liệu không đủ, hãy nói "Tôi không tìm thấy thông tin".\n\n<span class="dim">[tài liệu]</span>\n${ctx}\n\n<span class="dim">[câu hỏi]</span> ${esc(query)}`;
      setTxt('rwL', '≈ ' + Math.round(document.getElementById('rwP').textContent.length / 3.5) + ' token');
    }
    setEx(); q.value = QUERIES.vi[0]; pressGroup(exBtns, exBtns[0]); kR.upd(); search();
  },
});
})();
