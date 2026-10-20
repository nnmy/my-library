/* =====================================================================
   AI: minh họa "Nhớ có chọn lọc" (id: selective, trang 6-mamba.html)
   Trạng thái h_T = Σ_t w_t · e(x_t), với w_t = (1 − ā_t) · Π_{s>t} ā_s,  ā_t = exp(−Δ_t).
   - Cố định (như S4): Δ_t giống nhau cho mọi token.
   - Chọn lọc (như Mamba): Δ_t tùy token. Ở đây LUẬT ĐẶT TAY cho dễ thấy:
       từ đệm (ờ, ừm, thì, nha…) -> Δ ≈ 0 (bỏ qua),  tên riêng / con số -> Δ lớn (ghi đậm),  còn lại -> Δ nhỏ.
     Trong Mamba thật, Δ (và B, C) do một lớp tuyến tính HỌC ra từ dữ liệu.
   Thanh dưới mỗi token = phần token đó còn chiếm trong trạng thái, sau khi đọc tới token T.
   Chạy độc lập: lib/demos/run.html?demo=selective
   EDIT: danh sách từ đệm ở FILLER, câu mẫu ở SAMPLES.
   ===================================================================== */
(() => {
const { setTxt, num, range, pressGroup } = TFG;
const FILLER = new Set(['ờ', 'ừ', 'ừm', 'à', 'ạ', 'thì', 'mà', 'là', 'nha', 'nè', 'đó', 'á', 'ha', 'hen', 'hả', 'nhen', 'kiểu', 'ủa', 'ê', 'ò']);
const SAMPLES = [
  'ờ thì hôm qua ừm tui gặp Lan ở chợ Bến Thành nha mà ờ Lan nói là thứ 7 ổng về Huế đó ha',
  'ừm số phòng của anh Tư là 302 nha ờ thì nhớ giùm tui hen kiểu ừm hổng có quên đó nha',
];
const D_FILL = 0.01, D_NORM = 0.1, D_KEY = 0.9;
const kind = w => { const c = w.replace(/[.,!?;:]/g, ''); if (FILLER.has(c.toLowerCase())) return 'fill'; if (/\d/.test(c) || (c[0] && c[0] !== c[0].toLowerCase())) return 'key'; return 'norm'; };

TFG.demo('selective', {
  html: `<div class="demo-title"><h4>Nhớ có chọn lọc</h4><span>So SSM cố định với SSM chọn lọc trên cùng một câu</span></div>
    <div class="demo-body stack">
      <div class="stagebox"><div class="pad">
        <div id="slToks" style="display:flex;flex-wrap:wrap;gap:10px 4px;align-items:flex-end"></div>
        <p class="note-s" style="margin-top:12px">Ô viền đậm: token đang đọc. Thanh dưới mỗi token: token đó còn chiếm bao nhiêu phần trong “cuốn sổ” h. Chữ in nghiêng mờ: token chưa đọc tới.</p>
      </div></div>
      <div class="panel" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px 26px">
        <div style="display:flex;flex-direction:column;gap:12px">
          <div class="btnrow" role="group" aria-label="Kiểu SSM">
            <button class="btn" type="button" id="slFix">SSM cố định (kiểu S4)</button>
            <button class="btn" type="button" id="slSel">SSM chọn lọc (kiểu Mamba)</button>
          </div>
          <div class="ctrl" id="slDbox"><label for="slD">Δ cố định cho mọi token</label><output for="slD"></output>
            <input type="range" id="slD" min="0.02" max="1.2" step="0.02" value="0.3"></div>
          <div class="ctrl"><label for="slT">Đọc tới token thứ</label><output for="slT"></output>
            <input type="range" id="slT" min="1" max="10" step="1" value="10"></div>
        </div>
        <div style="display:flex;flex-direction:column;gap:12px">
          <label for="slIn" style="font-weight:600;font-size:15px">Câu đầu vào (sửa thoải mái)</label>
          <textarea id="slIn" class="inp" rows="2"></textarea>
          <div class="btnrow" id="slSamples"></div>
          <dl class="readout"><dt>Sổ đang nhớ nhiều nhất</dt><dd id="slTop" class="big" style="font-family:var(--body)">—</dd></dl>
        </div>
      </div>
    </div>`,
  init() {
    let mode = 'sel', words = [];
    const inp = document.getElementById('slIn');
    const D = range('slD', { show: v => num(v, 2) + ' (ā = ' + num(Math.exp(-v), 2) + ')', onInput: () => draw() });
    const Tn = range('slT', { show: v => v + ' / ' + words.length, onInput: () => draw() });
    const bFix = document.getElementById('slFix'), bSel = document.getElementById('slSel');
    const setMode = m => { mode = m; pressGroup([bFix, bSel], m === 'sel' ? bSel : bFix); document.getElementById('slDbox').style.opacity = m === 'sel' ? 0.4 : 1; D.el.disabled = m === 'sel'; draw(); };
    bFix.onclick = () => setMode('fix'); bSel.onclick = () => setMode('sel');
    const load = s => { inp.value = s; parse(); Tn.el.value = words.length; Tn.upd(); };
    function parse() {
      words = inp.value.trim().split(/\s+/).filter(Boolean).slice(0, 60);
      Tn.el.max = Math.max(1, words.length); if (+Tn.el.value > words.length) Tn.el.value = words.length;
    }
    inp.addEventListener('input', () => { const atEnd = +Tn.el.value >= +Tn.el.max; parse(); if (atEnd) Tn.el.value = words.length; Tn.upd(); });
    SAMPLES.forEach((s, i) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn'; b.textContent = 'Câu mẫu ' + (i + 1); b.onclick = () => load(s); document.getElementById('slSamples').appendChild(b); });
    D.upd(); load(SAMPLES[0]); setMode('sel');

    function draw() {
      const T = Math.min(words.length, Tn.get()), box = document.getElementById('slToks'); box.innerHTML = '';
      const dl = words.map(w => mode === 'fix' ? D.get() : ({ fill: D_FILL, key: D_KEY, norm: D_NORM })[kind(w)]);
      const ab = dl.map(d => Math.exp(-d));
      // trọng số còn lại của token t sau khi đọc tới T
      const wt = words.map((_, t) => { if (t >= T) return 0; let p = 1 - ab[t]; for (let s = t + 1; s < T; s++) p *= ab[s]; return p; });
      const mx = Math.max(1e-9, ...wt);
      words.forEach((w, t) => {
        const k = kind(w), seen = t < T;
        const col = document.createElement('div'); col.style.cssText = 'display:flex;flex-direction:column;align-items:stretch;gap:3px;min-width:34px';
        const chip = document.createElement('span'); chip.className = 'chip ' + (k === 'key' ? 'c1' : k === 'fill' ? '' : 'c0');
        chip.style.cssText = `font:600 14px var(--body);${seen ? '' : 'opacity:.35;font-style:italic;'}${t === T - 1 ? 'outline:3px solid var(--gold);outline-offset:1px;' : ''}`;
        chip.textContent = w;
        const sm = document.createElement('small'); sm.textContent = mode === 'sel' ? 'Δ ' + num(dl[t], 2) : ''; chip.appendChild(sm);
        const bar = document.createElement('div'); bar.style.cssText = 'height:46px;border:1px solid var(--ink);background:#fff;position:relative';
        const fillb = document.createElement('i'); fillb.style.cssText = `position:absolute;left:0;right:0;bottom:0;height:${(wt[t] / mx * 100).toFixed(1)}%;background:${k === 'key' ? 'var(--sea)' : k === 'fill' ? '#B9C1CA' : 'var(--sky)'}`;
        bar.appendChild(fillb); bar.title = `${w}: ${num(wt[t] * 100, 2)}% của trạng thái`;
        col.append(chip, bar); box.appendChild(col);
      });
      const top = words.map((w, t) => [w, wt[t]]).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, 3).map(x => x[0]);
      setTxt('slTop', top.length ? top.join(', ') : '—');
    }
  },
});
})();
