/* =====================================================================
   Ảnh y khoa: minh họa "Một voxel, một tensor" (id: dti-ellipsoid, trang 6-dti-tractography.html)
   Tensor khuếch tán D = λ1·e1e1ᵀ + λ2·e2e2ᵀ + λ3·e3e3ᵀ (đơn vị 10⁻³ mm²/s = µm²/ms).
   Các phân tử nước làm bước ngẫu nhiên với hiệp phương sai 2·D·t; hình bầu dục là mặt 2 độ lệch chuẩn
   ở thời điểm t (chạy 0 → 60 ms rồi thả lại). Chiếu vuông góc lên màn hình; kéo để xoay góc nhìn.
   Màu theo quy ước bản đồ màu hướng: đỏ = trái–phải (R), xanh lá = trước–sau (A), xanh dương = trên–dưới (S).
   ===================================================================== */
(() => {
const { COLORS: C, num, range, watchCanvas, setTxt, rng, loopWhenVisible, pressGroup, xy } = LT;
const PRESET = {   // λ1, λ2, λ3 (10⁻³ mm²/s), phương vị φ, độ nghiêng θ (độ)
  csf: [3.0, 3.0, 3.0, 0, 0],
  gm: [0.95, 0.82, 0.72, 30, 10],
  cc: [1.7, 0.3, 0.3, 0, 0],
  cst: [1.6, 0.35, 0.35, 90, 80],
  cross: [1.15, 1.05, 0.35, 45, 0],
};
const TMAX = 60, M = 360;
const fa = (a, b, c) => { const md = (a + b + c) / 3, n = (a - md) ** 2 + (b - md) ** 2 + (c - md) ** 2, d = a * a + b * b + c * c; return d > 0 ? Math.sqrt(1.5 * n / d) : 0; };
const norm = v => { const n = Math.hypot(...v) || 1; return v.map(x => x / n); };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

LT.demo('dti-ellipsoid', {
  html: `<div class="demo-title"><h4>Một voxel, một tensor</h4><span>Chọn loại mô hoặc tự chỉnh ba giá trị riêng, xem nước tản ra theo hình gì</span></div>
  <div class="demo-body">
    <div class="stagebox">
      <canvas id="deCv" class="ar" role="img" aria-label="Đám phân tử nước tản ra từ một điểm, hình bầu dục khuếch tán tô màu theo hướng, và ba trục R, A, S."></canvas>
      <span class="hint">Kéo để xoay góc nhìn</span>
    </div>
    <div class="panel">
      <div class="btnrow" role="group" aria-label="Loại mô">
        <button class="btn" type="button" data-de="csf">Dịch não tủy</button><button class="btn" type="button" data-de="gm">Chất xám</button><button class="btn" type="button" data-de="cc">Thể chai</button><button class="btn" type="button" data-de="cst">Bó tháp</button><button class="btn" type="button" data-de="cross">Hai bó giao nhau</button>
      </div>
      <div class="ctrl"><label for="deL1">λ1 (dọc hướng chính)</label><output for="deL1"></output><input type="range" id="deL1" min="0.1" max="3.2" step="0.05" value="1.7"></div>
      <div class="ctrl"><label for="deL2">λ2</label><output for="deL2"></output><input type="range" id="deL2" min="0.1" max="3.2" step="0.05" value="0.3"></div>
      <div class="ctrl"><label for="deL3">λ3</label><output for="deL3"></output><input type="range" id="deL3" min="0.1" max="3.2" step="0.05" value="0.3"></div>
      <div class="ctrl"><label for="dePhi">Hướng chính: xoay trong mặt phẳng ngang</label><output for="dePhi"></output><input type="range" id="dePhi" min="0" max="180" step="1" value="0"></div>
      <div class="ctrl"><label for="deTh">Hướng chính: nghiêng lên trên</label><output for="deTh"></output><input type="range" id="deTh" min="0" max="90" step="1" value="0"></div>
      <dl class="readout">
        <dt>FA (dị hướng)</dt><dd id="deFa" class="big">—</dd>
        <dt>MD (trung bình)</dt><dd id="deMd">—</dd>
        <dt>AD / RD</dt><dd id="deAr">—</dd>
        <dt>Màu trên bản đồ</dt><dd><span id="deSw" style="display:inline-block;width:46px;height:16px;border:1px solid #1B1920;vertical-align:-3px"></span></dd>
      </dl>
      <p class="note-s" id="deNote"></p>
    </div>
  </div>`,
  init(root) {
    const cv = root.querySelector('#deCv'), st = {}, r = rng(3);
    const P = Array.from({ length: M }, () => [0, 0, 0]);
    let t = 0, yaw = -0.6, pitch = 0.32, E = null, L = [1.7, 0.3, 0.3];
    const show = v => num(v, 3) + ' × 10⁻³ mm²/s';
    const l1 = range('deL1', { show, onInput: upd }), l2 = range('deL2', { show, onInput: upd }), l3 = range('deL3', { show, onInput: upd });
    const ph = range('dePhi', { show: v => v + '°', onInput: upd }), th = range('deTh', { show: v => v + '°', onInput: upd });
    const bs = [...root.querySelectorAll('[data-de]')];
    bs.forEach(b => b.addEventListener('click', () => {
      const p = PRESET[b.dataset.de];
      [l1, l2, l3, ph, th].forEach((s, i) => { s.el.value = p[i]; });
      [l1, l2, l3, ph].forEach(s => s.upd()); th.upd(); pressGroup(bs, b); restart();
    }));
    [l1, l2, l3, ph, th].forEach(s => s.el.addEventListener('input', () => pressGroup(bs, null)));
    function restart() { P.forEach(p => { p[0] = p[1] = p[2] = 0; }); t = 0; }
    function upd() {
      L = [l1.get(), l2.get(), l3.get()];
      const f = ph.get() * Math.PI / 180, q = th.get() * Math.PI / 180;
      const e1 = [Math.cos(q) * Math.cos(f), Math.cos(q) * Math.sin(f), Math.sin(q)];
      let e2 = cross([0, 0, 1], e1); if (Math.hypot(...e2) < 1e-6) e2 = [1, 0, 0]; e2 = norm(e2);
      E = [e1, e2, cross(e1, e2)];
      const F = fa(...L), md = (L[0] + L[1] + L[2]) / 3;
      setTxt('deFa', num(F, 2)); setTxt('deMd', num(md, 3)); setTxt('deAr', num(L[0], 3) + ' / ' + num((L[1] + L[2]) / 2, 3));
      const c = e1.map(v => Math.round(Math.abs(v) * Math.min(1, F) * 255));
      root.querySelector('#deSw').style.background = `rgb(${c.join(',')})`;
      const big = Math.max(...L), sorted = [...L].sort((a, b) => b - a);
      let note;
      if (F < 0.15) note = 'Gần như đẳng hướng: nước đi về mọi phía như nhau, hình bầu dục gần thành hình cầu. Hướng chính lúc này vô nghĩa, và trên bản đồ màu voxel gần như đen.';
      else if (sorted[0] - sorted[1] < 0.35 * (sorted[1] - sorted[2])) note = 'Hai giá trị riêng lớn gần bằng nhau: hình đĩa dẹt. Đây là cái tensor “thấy” khi hai bó sợi giao nhau trong một voxel: nó chỉ biết nước đi dễ trong một mặt phẳng, không biết là hai hướng nào.';
      else note = 'Hình điếu xì gà: nước đi dọc hướng chính dễ hơn đi ngang. Tractography đi theo trục dài này (vector riêng e1).';
      if (L[0] < big - 1e-9) note += ' Lưu ý: λ1 đang không phải giá trị lớn nhất, nên trục dài thật nằm ở hướng khác thanh trượt.';
      setTxt('deNote', note);
      restart();
    }
    // kéo để xoay
    let drag = null;
    cv.addEventListener('pointerdown', e => { drag = [...xy(cv, e), yaw, pitch]; cv.setPointerCapture(e.pointerId); cv.classList.add('grabbing'); });
    cv.addEventListener('pointermove', e => { if (!drag) return; const [x, y] = xy(cv, e); yaw = drag[2] + (x - drag[0]) * 0.01; pitch = Math.max(-1.4, Math.min(1.4, drag[3] + (y - drag[1]) * 0.01)); if (LT.REDUCED) draw(); });
    const up = () => { drag = null; cv.classList.remove('grabbing'); };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.classList.add('grab');

    watchCanvas(cv, st, () => draw());
    l1.upd(); l2.upd(); l3.upd(); ph.upd(); th.upd();
    pressGroup(bs, bs[2]);
    if (LT.REDUCED) { t = 50; P.forEach(p => { const g = E.map((e, k) => Math.sqrt(2 * L[k] * t) * r.gauss()); for (let i = 0; i < 3; i++) p[i] = g[0] * E[0][i] + g[1] * E[1][i] + g[2] * E[2][i]; }); draw(); }
    loopWhenVisible(root, dt => {
      if (LT.REDUCED) return;
      const h = dt * 30;   // 1 giây thật = 30 ms mô phỏng
      if (t + h > TMAX) restart(); else {
        t += h;
        P.forEach(p => { const g = [0, 1, 2].map(k => Math.sqrt(2 * L[k] * h) * r.gauss()); for (let i = 0; i < 3; i++) p[i] += g[0] * E[0][i] + g[1] * E[1][i] + g[2] * E[2][i]; });
      }
      draw();
    });

    function draw() {
      if (!st.ctx || !E) return;
      const { ctx, W, H } = st, font = getComputedStyle(document.body).fontFamily;
      ctx.fillStyle = C.paper; ctx.fillRect(0, 0, W, H);
      const cx = W / 2, cy = H / 2 + 6, s = Math.min(W, H) * 0.42 / 45;   // px trên µm (45 µm ≈ 0,42 khung)
      const cyw = Math.cos(yaw), syw = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
      const U = [cyw, -syw, 0], V = [sp * syw, sp * cyw, cp], Dp = [syw * cp, cyw * cp, -sp];   // phải, lên, chiều sâu
      const pr = p => [cx + dot(p, U) * s, cy - dot(p, V) * s, dot(p, Dp)];
      // trục R, A, S
      const ax = [[[1, 0, 0], '#d8312a', 'R'], [[0, 1, 0], '#3f9d6a', 'A'], [[0, 0, 1], '#3787c4', 'S']];
      ctx.lineWidth = 1.5; ctx.font = '600 13px ' + font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ax.forEach(([v, col]) => { const a = pr(v.map(x => -x * 44)), b = pr(v.map(x => x * 44)); ctx.strokeStyle = col; ctx.globalAlpha = 0.35; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1; });
      // hình bầu dục: mặt 2σ, hiệp phương sai 2·D·t, chiếu xuống mặt phẳng màn hình
      const D = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
      for (let k = 0; k < 3; k++) for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) D[i][j] += L[k] * E[k][i] * E[k][j];
      const Dv = v => [0, 1, 2].map(i => dot(D[i], v));
      const a = 2 * t * dot(U, Dv(U)), b = 2 * t * dot(U, Dv(V)), c = 2 * t * dot(V, Dv(V));
      const tr = (a + c) / 2, dd = Math.sqrt(((a - c) / 2) ** 2 + b * b), q1 = tr + dd, q2 = Math.max(0, tr - dd), ang = Math.atan2(q1 - a, b || 1e-9);
      const F = fa(...L), hue = E[0].map(v => Math.abs(v)), mxh = Math.max(...hue);
      const col = hue.map(v => Math.round(200 + (v / mxh * 255 - 200) * Math.min(1, F * 1.3)));
      if (t > 0.5) {
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(-ang);
        const rx = 2 * Math.sqrt(q1) * s, ry = 2 * Math.sqrt(q2) * s;
        const g = ctx.createRadialGradient(-rx * 0.25, -ry * 0.3, 1, 0, 0, Math.max(rx, ry));
        g.addColorStop(0, `rgba(${col.map(v => Math.min(255, v + 60)).join(',')},.55)`); g.addColorStop(1, `rgba(${col.join(',')},.55)`);
        ctx.fillStyle = g; ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.ellipse(0, 0, Math.max(rx, 0.5), Math.max(ry, 0.5), 0, 0, 7); ctx.fill(); ctx.stroke();
        ctx.restore();
      }
      // các phân tử nước (xa thì nhạt)
      ctx.fillStyle = C.sea;
      P.forEach(p => { const [x, y, z] = pr(p); ctx.globalAlpha = 0.45 + 0.4 * Math.max(-1, Math.min(1, -z / 40)); ctx.fillRect(x - 1.4, y - 1.4, 2.8, 2.8); });
      ctx.globalAlpha = 1;
      // hướng chính e1
      if (F >= 0.15) { const a1 = pr(E[0].map(x => -x * 46)), b1 = pr(E[0].map(x => x * 46)); ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.setLineDash([7, 4]); ctx.beginPath(); ctx.moveTo(a1[0], a1[1]); ctx.lineTo(b1[0], b1[1]); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = C.ink; ctx.fillText('e1', a1[0] + (a1[0] < cx ? -12 : 12), a1[1] - 10); }
      // nhãn trục
      ax.forEach(([v, colr, lab]) => { const b2 = pr(v.map(x => x * 50)); ctx.fillStyle = '#fff'; ctx.strokeStyle = colr; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(b2[0], b2[1], 10, 0, 7); ctx.fill(); ctx.stroke(); ctx.fillStyle = colr; ctx.fillText(lab, b2[0], b2[1] + 1); });
      // thời gian và thước
      ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillStyle = C.ink; ctx.font = '600 13px ' + font;
      ctx.fillText(`t = ${Math.round(t)} ms`, 12, 10);
      ctx.font = '12px ' + font; ctx.fillStyle = C.muted; ctx.fillText('mỗi chấm là một phân tử nước', 12, 28);
      const bar = 10 * s; ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(W - 14 - bar, H - 30); ctx.lineTo(W - 14, H - 30); ctx.stroke();
      ctx.fillStyle = C.ink; ctx.textAlign = 'right'; ctx.fillText('10 µm', W - 14, H - 24);
    }
  },
});
})();
