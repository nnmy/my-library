/* =====================================================================
   AI: minh họa "Trạng thái nhớ rồi quên" (id: ssm-memory, trang 6-mamba.html)
   SSM một chiều: h_t = ā·h_{t−1} + (1 − ā)·x_t   (b̄ = 1 − ā cho dễ so; y_t = h_t, C = 1).
   Bấm lên hàng "đầu vào" để thêm / bỏ sự kiện. Tùy chọn: thêm hai trạng thái nhớ ngắn và nhớ dài.
   Chạy độc lập: lib/demos/run.html?demo=ssm-memory
   ===================================================================== */
(() => {
const { COLORS: C, watchCanvas, setTxt, num, range, xy } = TFG;
const T = 48;

TFG.demo('ssm-memory', {
  html: `<div class="demo-title"><h4>Trạng thái nhớ rồi quên</h4><span>Chỉnh độ nhớ ā, bấm để thêm sự kiện</span></div>
    <div class="demo-body">
      <div class="stagebox">
        <canvas id="smCv" class="ar" role="img" aria-label="Hàng trên: các sự kiện đầu vào theo thời gian. Dưới: giá trị trạng thái h theo thời gian."></canvas>
      </div>
      <div class="panel">
        <div class="ctrl"><label for="smA">Độ nhớ ā (giữ lại bao nhiêu mỗi bước)</label><output for="smA"></output>
          <input type="range" id="smA" min="0" max="0.98" step="0.01" value="0.8"></div>
        <div class="checks"><label><input type="checkbox" id="smMulti"> Hiện thêm trạng thái nhớ ngắn (ā = 0,5) và nhớ dài (ā = 0,97)</label></div>
        <div class="btnrow">
          <button class="btn" type="button" data-p="0">Một sự kiện</button>
          <button class="btn" type="button" data-p="1">Hai sự kiện</button>
          <button class="btn" type="button" data-p="2">Một đoạn dài</button>
        </div>
        <dl class="readout">
          <dt>Nhớ còn một nửa sau</dt><dd id="smHalf" class="big">—</dd>
          <dt>Mỗi bước ghi vô</dt><dd id="smB">—</dd>
        </dl>
        <p class="note-s"><b>Bấm lên hàng ô “đầu vào x”</b> để thêm hoặc bỏ sự kiện. Trạng thái h giống ly nước có lỗ rỉ: mỗi bước giữ lại phần ā, rỉ mất phần còn lại, rồi rót thêm một chút từ đầu vào. ā gần 1 thì nhớ dai mà ghi vô nhẹ; ā nhỏ thì phản ứng lẹ mà quên cũng lẹ. Một con số cố định hổng thể vừa nhớ dai vừa phản ứng lẹ, nên SSM thật xài hàng trăm trạng thái với các ā khác nhau.</p>
      </div>
    </div>`,
  init(el) {
    const cv = document.getElementById('smCv'), st = {};
    let X = Array(T).fill(0);
    const PRE = [
      () => { X = Array(T).fill(0); X[6] = 1; },
      () => { X = Array(T).fill(0); X[6] = 1; X[24] = 1; },
      () => { X = Array(T).fill(0); for (let i = 8; i < 20; i++) X[i] = 1; },
    ];
    PRE[1]();
    const run = ab => { let h = 0; return X.map(x => (h = ab * h + (1 - ab) * x)); };
    const a = range('smA', { show: v => num(v, 2), onInput: () => draw() });
    const multi = document.getElementById('smMulti');
    multi.addEventListener('change', () => draw());
    el.querySelectorAll('[data-p]').forEach(b => b.addEventListener('click', () => { PRE[+b.dataset.p](); draw(); }));
    let G = null;
    cv.addEventListener('pointerdown', e => {
      if (!G) return; const [x, y] = xy(cv, e);
      if (y < G.it - 4 || y > G.it + G.ih + 4) return;
      const k = Math.floor((x - G.l) / G.cw); if (k >= 0 && k < T) { X[k] = X[k] ? 0 : 1; draw(); }
    });
    watchCanvas(cv, st, () => draw());
    a.upd();

    function draw() {
      const ab = a.get();
      setTxt('smHalf', ab <= 0 ? 'quên liền' : num(Math.log(0.5) / Math.log(ab), 3) + ' bước');
      setTxt('smB', num(1 - ab, 2) + ' × đầu vào');
      if (!st.ctx) return;
      const { ctx, W, H } = st; ctx.clearRect(0, 0, W, H);
      const l = 64, r = 14, cw = (W - l - r) / T, it = 30, ih = Math.min(30, cw * 1.6);
      const pt = it + ih + 40, ph = H - pt - 34;
      G = { l, cw, it, ih };
      ctx.font = '600 12.5px "Be Vietnam Pro", sans-serif'; ctx.fillStyle = C.ink; ctx.textAlign = 'left';
      ctx.fillText('đầu vào x', 6, it + ih / 2 + 4);
      for (let k = 0; k < T; k++) {
        ctx.fillStyle = X[k] ? C.gold : '#fff'; ctx.fillRect(l + k * cw + 1, it, cw - 2, ih);
        ctx.strokeStyle = X[k] ? C.ink : C.line; ctx.lineWidth = 1; ctx.strokeRect(l + k * cw + 1, it, cw - 2, ih);
      }
      // khung đồ thị
      const Y = v => pt + (1 - v) * ph;
      ctx.strokeStyle = C.line; ctx.fillStyle = C.muted; ctx.font = '12px "Be Vietnam Pro", sans-serif'; ctx.textAlign = 'right';
      [0, 0.5, 1].forEach(v => { ctx.beginPath(); ctx.moveTo(l, Y(v)); ctx.lineTo(W - r, Y(v)); ctx.stroke(); ctx.fillText(num(v, 2), l - 8, Y(v) + 4); });
      ctx.textAlign = 'left'; ctx.fillStyle = C.ink; ctx.font = '600 12.5px "Be Vietnam Pro", sans-serif'; ctx.fillText('trạng thái h', 6, pt - 12);
      ctx.fillStyle = C.muted; ctx.font = '12px "Be Vietnam Pro", sans-serif'; ctx.textAlign = 'center'; ctx.fillText('thời gian (bước) →', l + (W - l - r) / 2, H - 8);
      // bóng mờ các sự kiện
      for (let k = 0; k < T; k++) if (X[k]) { ctx.fillStyle = 'rgba(242,194,48,.14)'; ctx.fillRect(l + k * cw, pt, cw, ph); }
      const line = (vals, color, w, dash) => {
        ctx.strokeStyle = color; ctx.lineWidth = w; ctx.setLineDash(dash || []); ctx.beginPath();
        vals.forEach((v, k) => { const x = l + (k + 0.5) * cw; k ? ctx.lineTo(x, Y(v)) : ctx.moveTo(x, Y(v)); }); ctx.stroke(); ctx.setLineDash([]);
        vals.forEach((v, k) => { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(l + (k + 0.5) * cw, Y(v), Math.min(3, w + 0.5), 0, 7); ctx.fill(); });
      };
      if (multi.checked) { line(run(0.5), C.violet || '#8f63c9', 1.6, [5, 4]); line(run(0.97), '#3f9d6a', 1.6, [5, 4]); }
      line(run(ab), C.sea, 2.6);
      if (multi.checked) {
        ctx.font = '12px "Be Vietnam Pro", sans-serif'; ctx.textAlign = 'left';
        ctx.fillStyle = '#8f63c9'; ctx.fillText('— — nhớ ngắn (0,5)', W - r - 300, pt - 12);
        ctx.fillStyle = '#3f9d6a'; ctx.fillText('— — nhớ dài (0,97)', W - r - 160, pt - 12);
      }
    }
  },
});
})();
