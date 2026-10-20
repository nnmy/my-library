/* =====================================================================
   Robotics: minh họa "Biến hành động thành token" (id: action-tokens, trang 6-mo-hinh-nen-tang.html)
   Một khúc quỹ đạo bàn tay robot: 50 bước (cỡ 1 giây ở 50 Hz), mỗi bước 2 số (x, y) trong khoảng [−1, 1].
   Cách 1, chia thùng từng bước (kiểu RT-2): mỗi số của mỗi bước làm tròn về một trong N "thùng" -> 1 token. Luôn 100 token.
   Cách 2, nén cả khúc (kiểu FAST): biến đổi cosin rời rạc (DCT) theo thời gian cho từng chiều, giữ K hệ số tần số thấp,
     làm tròn mỗi hệ số tới bước 1/S rồi bỏ các hệ số bằng 0. Mỗi hệ số khác 0 -> 1 token.
   Vẽ lên khung để tạo quỹ đạo của riêng bạn.
   Chạy độc lập: lib/demos/run.html?demo=action-tokens
   ===================================================================== */
(() => {
const { COLORS: C, watchCanvas, setTxt, num, range, pressGroup, xy } = TFG;
const T = 50;
const PRESETS = {
  'Gắp rồi đặt': t => { const s = t / (T - 1); if (s < 0.35) return [-0.8 + s / 0.35 * 0.8, 0.5 - 1.2 * (s / 0.35) ** 2]; if (s < 0.5) return [0, -0.7 + (s - 0.35) / 0.15 * 0.0]; if (s < 0.65) return [0, -0.7 + (s - 0.5) / 0.15 * 1.1]; return [(s - 0.65) / 0.35 * 0.8, 0.4 - 0.9 * ((s - 0.65) / 0.35) ** 2]; },
  'Vòng tròn': t => { const a = t / (T - 1) * 2 * Math.PI; return [0.7 * Math.cos(a), 0.7 * Math.sin(a)]; },
  'Lau bàn': t => { const s = t / (T - 1); return [-0.8 + 1.6 * s, 0.35 * Math.sin(s * 6 * Math.PI)]; },
};
// DCT-II trực chuẩn và nghịch đảo
const dct = v => { const N = v.length; return v.map((_, k) => { let s = 0; for (let n = 0; n < N; n++) s += v[n] * Math.cos(Math.PI / N * (n + 0.5) * k); return s * Math.sqrt((k ? 2 : 1) / N); }); };
const idct = c => { const N = c.length; return c.map((_, n) => { let s = 0; for (let k = 0; k < N; k++) s += c[k] * Math.sqrt((k ? 2 : 1) / N) * Math.cos(Math.PI / N * (n + 0.5) * k); return s; }); };
TFG.demo('action-tokens', {
  html: `<div class="demo-title"><h4>Biến hành động thành token</h4><span>Chia thùng từng bước, hay nén cả khúc?</span></div>
    <div class="demo-body">
      <div class="stagebox">
        <canvas id="atCv" class="ar" role="img" aria-label="Quỹ đạo bàn tay robot: đường xám là quỹ đạo gốc, đường xanh là quỹ đạo dựng lại từ token."></canvas>
        <div class="pad" style="border-top:2px solid var(--ink)"><div class="chips" id="atChips" aria-label="Chuỗi token"></div></div>
        <span class="hint" style="top:6px;bottom:auto">Bấm-kéo trong khung để vẽ quỹ đạo của bạn</span>
      </div>
      <div class="panel">
        <div class="btnrow" id="atPre" role="group" aria-label="Quỹ đạo mẫu"></div>
        <div class="btnrow" role="group" aria-label="Cách mã hóa">
          <button class="btn" type="button" id="atBin">Chia thùng từng bước</button>
          <button class="btn" type="button" id="atDct">Nén cả khúc (DCT)</button>
        </div>
        <div class="ctrl" id="atNbox"><label for="atN">Số thùng N</label><output for="atN"></output>
          <input type="range" id="atN" min="2" max="8" step="1" value="8"></div>
        <div class="ctrl" id="atKbox"><label for="atK">Giữ K hệ số tần số thấp</label><output for="atK"></output>
          <input type="range" id="atK" min="1" max="25" step="1" value="10"></div>
        <dl class="readout">
          <dt>Số token</dt><dd id="atTok" class="big">—</dd>
          <dt>Sai lệch trung bình</dt><dd id="atErr" class="big">—</dd>
          <dt>(nếu tay dài 1 m)</dt><dd id="atMm">—</dd>
        </dl>
        <p class="note-s">Mỗi ô nhỏ bên dưới hình là một token, y như token chữ trong LLM. Chia thùng thì số token cố định (2 số × 50 bước = 100), muốn chính xác phải tăng số thùng. Nén cả khúc thì tận dụng chuyện chuyển động mượt: vài hệ số tần số thấp đã tả gần hết.</p>
      </div>
    </div>`,
  init() {
    const cv = document.getElementById('atCv'), st = {};
    let traj = [], mode = 'dct', G = null, drawing = null;
    const Nb = range('atN', { map: v => Math.pow(2, v), show: v => v, onInput: () => draw() });
    const K = range('atK', { show: v => v, onInput: () => draw() });
    const setPreset = f => { traj = [...Array(T)].map((_, t) => f(t)); };
    const pre = Object.entries(PRESETS).map(([name, f]) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn'; b.textContent = name;
      b.onclick = () => { setPreset(f); pressGroup(pre, b); draw(); }; document.getElementById('atPre').appendChild(b); return b; });
    pressGroup(pre, pre[0]); setPreset(PRESETS['Gắp rồi đặt']);
    const bB = document.getElementById('atBin'), bD = document.getElementById('atDct');
    const setMode = m => { mode = m; pressGroup([bB, bD], m === 'bin' ? bB : bD); document.getElementById('atNbox').style.display = m === 'bin' ? '' : 'none'; document.getElementById('atKbox').style.display = m === 'dct' ? '' : 'none'; draw(); };
    bB.onclick = () => setMode('bin'); bD.onclick = () => setMode('dct');
    // vẽ quỹ đạo bằng chuột
    cv.addEventListener('pointerdown', e => { if (!G) return; drawing = [G.inv(...xy(cv, e))]; cv.setPointerCapture(e.pointerId); e.preventDefault(); });
    cv.addEventListener('pointermove', e => { if (!drawing) return; const p = G.inv(...xy(cv, e)); const q = drawing[drawing.length - 1]; if (Math.hypot(p[0] - q[0], p[1] - q[1]) > 0.01) drawing.push(p); });
    const up = () => {
      if (!drawing) return; const P = drawing; drawing = null; if (P.length < 4) return;
      const L = [0]; for (let i = 1; i < P.length; i++) L.push(L[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
      traj = [...Array(T)].map((_, t) => { const d = t / (T - 1) * L[L.length - 1]; let i = 1; while (i < L.length - 1 && L[i] < d) i++; const u = (d - L[i - 1]) / Math.max(1e-9, L[i] - L[i - 1]); return [P[i - 1][0] + u * (P[i][0] - P[i - 1][0]), P[i - 1][1] + u * (P[i][1] - P[i - 1][1])]; });
      pressGroup(pre, null); draw();
    };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    function encode() {
      if (mode === 'bin') {
        const n = Nb.get(), q = v => Math.round((Math.max(-1, Math.min(1, v)) + 1) / 2 * (n - 1));
        const toks = [], rec = traj.map(p => { const a = q(p[0]), b = q(p[1]); toks.push(a, b); return [a / (n - 1) * 2 - 1, b / (n - 1) * 2 - 1]; });
        return { toks, rec };
      }
      const S = 20, k = K.get(), toks = [], dims = [0, 1].map(d => {
        const c = dct(traj.map(p => p[d])).map((v, i) => i < k ? Math.round(v * S) : 0);
        c.forEach((v, i) => { if (v !== 0) toks.push(v); });
        return idct(c.map(v => v / S));
      });
      return { toks, rec: traj.map((_, t) => [dims[0][t], dims[1][t]]) };
    }
    watchCanvas(cv, st, () => draw());
    Nb.upd(); K.upd(); setMode('dct');
    function draw() {
      const { toks, rec } = encode();
      const err = rec.reduce((s, p, t) => s + Math.hypot(p[0] - traj[t][0], p[1] - traj[t][1]), 0) / T;
      setTxt('atTok', toks.length); setTxt('atErr', num(err, 3)); setTxt('atMm', '≈ ' + Math.round(err * 1000 / 2) + ' mm');
      const box = document.getElementById('atChips'); box.innerHTML = '';
      toks.slice(0, 100).forEach((v, i) => { const s = document.createElement('span'); s.className = 'chip ' + (mode === 'bin' ? (i % 2 ? 'c1' : 'c0') : 'c2'); s.style.fontSize = '12px'; s.textContent = v; box.appendChild(s); });
      if (!st.ctx) return;
      const { ctx, W, H } = st; ctx.clearRect(0, 0, W, H);
      const s = Math.min(W, H - 56) / 2.15, ox = W / 2, oy = 26 + (H - 52) / 2, X = x => ox + x * s, Y = y => oy - y * s;
      G = { inv: (px, py) => [Math.max(-1, Math.min(1, (px - ox) / s)), Math.max(-1, Math.min(1, (oy - py) / s))] };
      ctx.fillStyle = '#fff'; ctx.fillRect(X(-1), Y(1), 2 * s, 2 * s); ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5; ctx.strokeRect(X(-1), Y(1), 2 * s, 2 * s);
      if (mode === 'bin') { const n = Nb.get(); if (n <= 32) { ctx.strokeStyle = 'rgba(157,164,173,.35)'; ctx.lineWidth = 1; ctx.beginPath();
        for (let i = 0; i < n; i++) { const v = i / (n - 1) * 2 - 1; ctx.moveTo(X(v), Y(-1)); ctx.lineTo(X(v), Y(1)); ctx.moveTo(X(-1), Y(v)); ctx.lineTo(X(1), Y(v)); } ctx.stroke(); } }
      const pl = (P, col, w, dots) => { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineJoin = 'round'; ctx.beginPath(); P.forEach((p, i) => i ? ctx.lineTo(X(p[0]), Y(p[1])) : ctx.moveTo(X(p[0]), Y(p[1]))); ctx.stroke();
        if (dots) { ctx.fillStyle = col; P.forEach(p => { ctx.beginPath(); ctx.arc(X(p[0]), Y(p[1]), 2.6, 0, 7); ctx.fill(); }); } };
      pl(traj, '#B9C1CA', 6, false); pl(rec, C.sea, 2.2, true);
      ctx.fillStyle = '#3f9d6a'; ctx.beginPath(); ctx.arc(X(traj[0][0]), Y(traj[0][1]), 6, 0, 7); ctx.fill();
      ctx.fillStyle = C.muted; ctx.font = '11.5px "Be Vietnam Pro", sans-serif'; ctx.textAlign = 'left';
      ctx.fillText(W < 560 ? 'xám: gốc; xanh: dựng lại từ token' : 'xám: quỹ đạo gốc; xanh: dựng lại từ token; chấm lá: điểm đầu', X(-1), Y(-1) + 16);
    }
  },
});
})();
