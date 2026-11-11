/* =====================================================================
   Toán học: minh họa "Chéo hóa: nhìn theo trục riêng" (id: la-diag, trang 8-dai-so-tuyen-tinh.html)
   x được tách theo hai trục riêng: x = c₁v₁ + c₂v₂ với c = V⁻¹x (nét đứt).
   Áp dụng A k lần: mỗi thành phần chỉ nhân với λᵏ của trục mình, Aᵏx = c₁λ₁ᵏv₁ + c₂λ₂ᵏv₂ = VΛᵏV⁻¹x (nét liền).
   Các ví dụ đều có trị riêng dương nên k không nguyên vẫn có nghĩa (Aᵏ = VΛᵏV⁻¹), giúp chuyển động liền mạch.
   Ví dụ ma trận khuyết: không có V; Aᵏ = 2ᵏ[[1, k/2], [0, 1]] tính trực tiếp.
   ===================================================================== */
(() => {
const { COLORS: C, setTxt, drag, watchCanvas, REDUCED } = LT;
const PRE = {
  shear: { m: [2, 1, 0, 1], V: [[1, 0], [-1, 1]], l: [2, 1], x: [-0.5, 1.5], kMax: 2.5, k: 1, view: { cx: 1.8, cy: 0.9, half: 2.75 }, lat: 1,
    note: 'A không đối xứng nên hai trục riêng không vuông góc: lưới trục riêng bị xiên. Thành phần theo v₁ nhân đôi sau mỗi lần áp dụng A, thành phần theo v₂ giữ nguyên, nên Aᵏx chạy ra xa dọc theo phương v₁.' },
  sym: { m: [2, 1, 1, 2], V: [[1, 1], [1, -1]], l: [3, 1], x: [0.5, -0.25], kMax: 2.5, k: 1, view: { cx: 1, cy: 0.7, half: 2.7 }, lat: 1,
    note: 'A đối xứng: hai trục riêng vuông góc. Nếu chuẩn hóa v₁, v₂ về độ dài 1 thì V thành ma trận trực giao Q và V⁻¹ = Qᵀ, không cần tính nghịch đảo.' },
  markov: { m: [0.9, 0.2, 0.1, 0.8], V: [[1, 0.5], [1, -1]], l: [1, 0.7], x: [0.2, 0.8], kMax: 20, k: 3, view: { cx: 0.45, cy: 0.52, half: 0.56 }, lat: 0.25, axes: ['tỉ lệ ở thành phố', 'tỉ lệ ở nông thôn'],
    note: 'Mỗi năm 10% dân thành phố về nông thôn và 20% dân nông thôn lên thành phố (mỗi cột của A có tổng bằng 1). Thành phần theo λ₂ = 0,7 tắt dần vì 0,7ᵏ → 0; chỉ còn thành phần theo λ₁ = 1, nên tỉ lệ dân cư tiến tới 2 : 1 bất kể lúc đầu thế nào.' },
  defect: { m: [2, 1, 0, 2], defect: true, x: [-0.5, 1], kMax: 2, k: 1, view: { cx: 0.7, cy: 1.7, half: 2.75 }, lat: 1,
    note: 'Chỉ có một phương riêng (trục hoành), không lập được V khả nghịch. Aᵏ = 2ᵏ[[1, k/2], [0, 1]]: không tách được thành hai phép co giãn độc lập; điểm vừa phóng to vừa bị kéo lệch dần về phía phương riêng duy nhất.' },
};
const SUP = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
const sup = k => String(k).split('').map(c => SUP[c]).join('');
LT.demo('la-diag', {
  deps: ['la2'],
  html: `<div class="demo-title"><h4>Chéo hóa: nhìn theo trục riêng</h4><span>Kéo điểm x; tăng k để xem Aᵏx = VΛᵏV⁻¹x</span></div>
  <div class="demo-body">
    <div class="stagebox"><canvas id="cvDg" class="ar" role="img" aria-label="Điểm x tách theo hai trục riêng, và Aᵏx sau k lần áp dụng A"></canvas><span class="hint" style="top:8px;bottom:auto;left:auto;right:10px">Kéo điểm x (tím, rỗng)</span></div>
    <div class="panel">
      <div class="ctrl"><label for="dgPre">Ma trận</label><select id="dgPre">
        <option value="shear">Không đối xứng [[2, 1], [0, 1]]</option><option value="sym">Đối xứng [[2, 1], [1, 2]]</option>
        <option value="markov">Di cư thành phố, nông thôn</option><option value="defect">Ma trận khuyết [[2, 1], [0, 2]]</option></select></div>
      <div class="matrow" id="dgMats"></div>
      <div class="ctrl"><label for="dgK">Số lần áp dụng A: k</label><output for="dgK"></output><input type="range" id="dgK" min="0" max="50" value="20"></div>
      <div class="btnrow"><button class="btn" type="button" id="dgPlay">Chạy k từ 0</button><button class="btn" type="button" id="dgInt">Làm tròn k</button></div>
      <dl class="readout" aria-live="polite">
        <dt>x</dt><dd id="dgX">—</dd>
        <dt>c = V⁻¹x</dt><dd id="dgC">—</dd>
        <dt>Λᵏc</dt><dd id="dgLc">—</dd>
        <dt>Aᵏx = VΛᵏc</dt><dd class="big" id="dgAx">—</dd>
        <dt>Nhân A trực tiếp</dt><dd id="dgChk">—</dd>
      </dl>
      <p class="note-s" id="dgNow"></p>
      <p class="note-s" id="dgNote"></p>
      <div class="legend"><span><i style="background:#d8312a"></i>theo v₁</span><span><i style="background:#3f9d6a"></i>theo v₂</span><span><i style="background:#8f63c9"></i>x, Aᵏx</span></div>
    </div>
  </div>`,
  init(root) {
    const L = LT.la, COL = L.COL, n = L.n;
    const cv = root.querySelector('#cvDg'), st = {}, sel = root.querySelector('#dgPre');
    const kEl = root.querySelector('#dgK'), kOut = root.querySelector('output[for="dgK"]');
    let P = PRE.shear, x = P.x.slice(), k = 1, G = null, raf = 0;
    const SC = 20;   // k = giá trị thanh trượt / 20
    const setK = v => { k = Math.max(0, Math.min(P.kMax, v)); kEl.value = Math.round(k * SC); kOut.textContent = n(k, 2); };
    kEl.addEventListener('input', () => { stop(); setK(kEl.value / SC); draw(); });
    const stop = () => { if (raf) cancelAnimationFrame(raf); raf = 0; };
    root.querySelector('#dgInt').addEventListener('click', () => { stop(); setK(Math.round(k)); draw(); });
    root.querySelector('#dgPlay').addEventListener('click', () => {
      stop();
      if (REDUCED) { setK(P.kMax); draw(); return; }
      const t0 = performance.now(), dur = P.kMax > 5 ? 4500 : 2600;
      const step = now => { const u = Math.min(1, (now - t0) / dur); setK(u * P.kMax); draw(); raf = u < 1 ? requestAnimationFrame(step) : 0; };
      setK(0); draw(); raf = requestAnimationFrame(step);
    });
    const load = key => {
      stop(); P = PRE[key]; x = P.x.slice(); kEl.max = P.kMax * SC; setK(P.k);
      const mats = root.querySelector('#dgMats');
      if (P.defect) mats.innerHTML = `<span>A =</span>${L.matHTML([[2, 1], [0, 2]])}<span class="op">: không có V khả nghịch</span>`;
      else {
        const [v1, v2] = P.V, det = v1[0] * v2[1] - v2[0] * v1[1];
        const Vi = [[v2[1] / det, -v2[0] / det], [-v1[1] / det, v1[0] / det]];
        P.Vi = Vi;
        mats.innerHTML = `<span>A =</span>${L.matHTML([[P.m[0], P.m[1]], [P.m[2], P.m[3]]])}<span>=</span>`
          + `${L.matHTML([[v1[0], v2[0]], [v1[1], v2[1]]], 'vcols')}${L.matHTML([[P.l[0], 0], [0, P.l[1]]])}${L.matHTML(Vi)}`
          + `<span class="op">V (cột: v₁, v₂) · Λ · V⁻¹</span>`;
      }
      setTxt('dgNote', P.note);
      draw();
    };
    sel.addEventListener('change', () => load(sel.value));
    drag(cv, {
      pick: (px, py) => (G && Math.hypot(px - G.X(x[0]), py - G.Y(x[1])) < 22 ? 'x' : null),
      move: (o, px, py) => { const s = P.lat / 20; x = [Math.round(G.ix(px) / s) * s, Math.round(G.iy(py) / s) * s]; draw(); },
    });
    /* Aᵗx: theo trục riêng, hoặc trực tiếp với ma trận khuyết */
    const coef = p => [P.Vi[0][0] * p[0] + P.Vi[0][1] * p[1], P.Vi[1][0] * p[0] + P.Vi[1][1] * p[1]];
    const powx = t => {
      if (P.defect) { const s = Math.pow(2, t); return [s * (x[0] + t / 2 * x[1]), s * x[1]]; }
      const c = coef(x), a = c[0] * Math.pow(P.l[0], t), b = c[1] * Math.pow(P.l[1], t), [v1, v2] = P.V;
      return [a * v1[0] + b * v2[0], a * v1[1] + b * v2[1]];
    };
    function draw() {
      if (!st.ctx) return;
      const { ctx } = st;
      G = L.plane(st, P.view);
      L.grid(ctx, G);
      const X = p => G.X(p[0]), Y = p => G.Y(p[1]), O = [0, 0];
      if (!P.defect) {
        const [v1, v2] = P.V;
        L.lattice(ctx, G, v1, v2, 'rgba(216,49,42,.20)', 'rgba(63,157,106,.26)', 1, P.lat);
        L.line(ctx, G, v1, COL.c1, 1.8); L.line(ctx, G, v2, COL.c2, 1.8);
        // nhãn trục riêng ở mép khung
        [[v1, P.l[0], COL.c1, '₁'], [v2, P.l[1], COL.c2, '₂']].forEach(([v, l, col, s]) => {
          const m = Math.hypot(v[0], v[1]); let best = null;
          for (let r = 8; r > 0.05; r *= 0.93) for (const sg of [1, -1]) {
            const p = [sg * v[0] / m * r * P.view.half / 2.5, sg * v[1] / m * r * P.view.half / 2.5];
            if (!best && X(p) > 30 && X(p) < G.W - 110 && Y(p) > 24 && Y(p) < G.H - 30) best = p;
          }
          if (best) L.label(ctx, `v${s} (λ${s} = ${n(l)})`, X(best) + 6, Y(best) - 4, col, 'left', 'bottom', 13);
        });
      } else {
        L.line(ctx, G, [1, 0], COL.c1, 1.8);
        L.label(ctx, 'phương riêng duy nhất (λ = 2)', G.W - 10, G.Y(0) - 6, COL.c1, 'right', 'bottom', 13);
      }
      if (P.axes) {
        L.label(ctx, P.axes[0] + ' →', G.W - 8, G.Y(0) + 18, C.ink, 'right', 'top', 12.5, 500);
        L.label(ctx, '↑ ' + P.axes[1], G.X(0) + 8, 8, C.ink, 'left', 'top', 12.5, 500);
        // trạng thái cân bằng: vector riêng ứng với λ = 1, cùng tổng với x
        const sum = x[0] + x[1], eq = [sum * 2 / 3, sum / 3];
        ctx.fillStyle = C.gold; ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5; ctx.beginPath();
        ctx.moveTo(X(eq), Y(eq) - 8); ctx.lineTo(X(eq) + 8, Y(eq)); ctx.lineTo(X(eq), Y(eq) + 8); ctx.lineTo(X(eq) - 8, Y(eq)); ctx.closePath(); ctx.fill(); ctx.stroke();
        L.label(ctx, 'cân bằng', X(eq) + 11, Y(eq) + 2, C.ink, 'left', 'top', 12.5);
      }
      // quỹ đạo Aᵗx, chấm tại k nguyên
      ctx.strokeStyle = 'rgba(27,25,32,.55)'; ctx.lineWidth = 1.5; ctx.setLineDash([2, 3]); ctx.beginPath();
      const N = 160; for (let i = 0; i <= N; i++) { const p = powx(k * i / N); i ? ctx.lineTo(X(p), Y(p)) : ctx.moveTo(X(p), Y(p)); }
      ctx.stroke(); ctx.setLineDash([]);
      for (let j = 1; j <= Math.floor(k + 1e-9); j++) { const p = powx(j); ctx.fillStyle = C.ink; ctx.beginPath(); ctx.arc(X(p), Y(p), 3, 0, 2 * Math.PI); ctx.fill(); }
      const R = powx(k);
      if (!P.defect) {
        const [v1, v2] = P.V, c = coef(x), a = c[0] * Math.pow(P.l[0], k), b = c[1] * Math.pow(P.l[1], k);
        const pc = [c[0] * v1[0], c[0] * v1[1]], pa = [a * v1[0], a * v1[1]];
        // x = c₁v₁ + c₂v₂ (nét đứt)
        ctx.setLineDash([5, 4]);
        LT.arrow(ctx, X(O), Y(O), X(pc), Y(pc), COL.c1, 2, 9); LT.arrow(ctx, X(pc), Y(pc), X(x), Y(x), COL.c2, 2, 9);
        ctx.setLineDash([]);
        // Aᵏx = c₁λ₁ᵏv₁ + c₂λ₂ᵏv₂ (nét liền)
        LT.arrow(ctx, X(O), Y(O), X(pa), Y(pa), COL.c1, 3.2, 11); LT.arrow(ctx, X(pa), Y(pa), X(R), Y(R), COL.c2, 3.2, 11);
      } else {
        ctx.setLineDash([5, 4]); LT.arrow(ctx, X(O), Y(O), X(x), Y(x), COL.v, 2, 9); ctx.setLineDash([]);
        LT.arrow(ctx, X(O), Y(O), X(R), Y(R), COL.v, 3.2, 11);
      }
      const kInt = Math.abs(k - Math.round(k)) < 1e-9, kr = Math.round(k);
      const rl = kInt ? (kr === 0 ? 'x' : kr === 1 ? 'Ax' : 'A' + sup(kr) + 'x') : 'Aᵏx';
      L.handle(ctx, X(R), Y(R), COL.v, false, 6.5);
      L.handle(ctx, X(x), Y(x), COL.v, true, 7.5);
      L.label(ctx, 'x', X(x) - 10, Y(x) - 8, COL.v, 'right', 'bottom', 15, 700);
      if (Math.hypot(X(R) - X(x), Y(R) - Y(x)) > 16) L.label(ctx, rl, X(R) + 10, Y(R) - 8, COL.v, 'left', 'bottom', 15, 700);
      // số liệu
      setTxt('dgX', L.vec(x, 3)); setTxt('dgAx', L.vec(R, 3));
      if (P.defect) {
        setTxt('dgC', '— (không có V)'); setTxt('dgLc', '—');
        setTxt('dgNow', `Aᵏ = 2ᵏ[[1, k/2], [0, 1]] với 2ᵏ = ${n(Math.pow(2, k), 3)}.`);
      } else {
        const c = coef(x), lk = [Math.pow(P.l[0], k), Math.pow(P.l[1], k)];
        setTxt('dgC', L.vec(c, 3)); setTxt('dgLc', L.vec([c[0] * lk[0], c[1] * lk[1]], 3));
        setTxt('dgNow', `Với k = ${n(k, 2)}: thành phần theo v₁ nhân λ₁ᵏ = ${n(P.l[0], 2)}ᵏ = ${n(lk[0], 3)}; thành phần theo v₂ nhân λ₂ᵏ = ${n(P.l[1], 2)}ᵏ = ${n(lk[1], 3)}.`);
      }
      if (kInt) {
        let p = x.slice(); const m = P.m;
        for (let j = 0; j < kr; j++) p = [m[0] * p[0] + m[1] * p[1], m[2] * p[0] + m[3] * p[1]];
        setTxt('dgChk', L.vec(p, 3) + ' ✓');
      } else setTxt('dgChk', 'chỉ khi k nguyên');
    }
    load('shear');
    watchCanvas(cv, st, draw);
  },
});
})();
