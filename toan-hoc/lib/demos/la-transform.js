/* =====================================================================
   Toán học: minh họa "Ma trận biến đổi mặt phẳng" (id: la-transform, trang 8-dai-so-tuyen-tinh.html)
   Hai cột của A là ảnh của e₁ (đỏ) và e₂ (xanh lá): kéo đầu mũi tên hoặc gõ số.
   Lưới xanh là ảnh của lưới ô vuông; hình bình hành là ảnh của ô vuông đơn vị, diện tích = |det A|.
   Thanh trượt "mức biến đổi" đi từ I (t = 0) tới A (t = 1): M(t) = (1 − t)I + tA.
   ===================================================================== */
(() => {
const { COLORS: C, setTxt, drag, watchCanvas, REDUCED } = LT;
const PRE = {
  scale: { m: [2, 0, 0, 1], v: [2, 1], note: 'Thành phần x nhân 2, thành phần y giữ nguyên: vector bị kéo dài theo phương ngang và đổi hướng.' },
  shear: { m: [2, 1, 0, 1], v: [1, 1.5], note: 'Cột 1 = Ae₁ = (2; 0), cột 2 = Ae₂ = (1; 1). Biết hai cột là biết ảnh của mọi vector: Av = x·(cột 1) + y·(cột 2), đúng như đường gấp khúc mảnh trên hình.' },
  rot: { m: [0, -1, 1, 0], v: [2, 1], note: 'Quay 90° ngược chiều kim đồng hồ: độ dài và diện tích giữ nguyên (det = 1) nhưng mọi vector khác 0 đều đổi phương.' },
  refl: { m: [-1, 0, 0, 1], v: [2, 1], note: 'Phản chiếu qua trục tung: diện tích giữ nguyên nhưng hình bị lật như soi gương, nên det = −1.' },
  sym: { m: [2, 1, 1, 3], v: [1, 1], note: 'det = 2·3 − 1·1 = 5: mọi hình phóng to 5 lần về diện tích.' },
  sing: { m: [1, 2, 0.5, 1], v: [1, 1], note: 'Hai cột (1; 0,5) và (2; 1) cùng phương: cả mặt phẳng bị ép xuống một đường thẳng.' },
};
const mul = (m, p) => [m[0] * p[0] + m[1] * p[1], m[2] * p[0] + m[3] * p[1]];
LT.demo('la-transform', {
  deps: ['la2'],
  html: `<div class="demo-title"><h4>Ma trận biến đổi mặt phẳng</h4><span>Kéo đầu mũi tên đỏ, xanh lá (hai cột của A) và tím (vector v)</span></div>
  <div class="demo-body">
    <div class="stagebox"><canvas id="cvTf" class="ar" role="img" aria-label="Lưới tọa độ trước và sau phép biến đổi bởi ma trận A, ảnh của ô vuông đơn vị và của vector v"></canvas></div>
    <div class="panel">
      <div class="ctrl"><label for="tfPre">Ví dụ</label><select id="tfPre">
        <option value="scale">Kéo giãn ngang [[2, 0], [0, 1]]</option><option value="shear">Trượt [[2, 1], [0, 1]]</option>
        <option value="rot">Quay 90°</option><option value="refl">Phản chiếu qua trục tung</option>
        <option value="sym">det = 5: [[2, 1], [1, 3]]</option><option value="sing">Ép thành đường thẳng (det = 0)</option>
        <option value="custom" disabled>Tự nhập</option></select></div>
      <div class="matrow"><span>A =</span><div class="mat-edit" role="group" aria-label="Các phần tử của ma trận A; cột 1 tô đỏ, cột 2 tô xanh lá">
        <input type="number" id="tfA" class="k1" step="0.1" min="-4.5" max="4.5" aria-label="Hàng 1, cột 1"><input type="number" id="tfB" class="k2" step="0.1" min="-4.5" max="4.5" aria-label="Hàng 1, cột 2">
        <input type="number" id="tfC" class="k1" step="0.1" min="-4.5" max="4.5" aria-label="Hàng 2, cột 1"><input type="number" id="tfD" class="k2" step="0.1" min="-4.5" max="4.5" aria-label="Hàng 2, cột 2">
      </div></div>
      <div class="ctrl"><label for="tfT">Mức biến đổi, từ I tới A</label><output for="tfT"></output><input type="range" id="tfT" min="0" max="100" value="100"></div>
      <div class="btnrow"><button class="btn" type="button" id="tfPlay">Chạy lại phép biến đổi</button></div>
      <dl class="readout" aria-live="polite">
        <dt>v</dt><dd id="tfV">—</dd>
        <dt>Av</dt><dd class="big" id="tfAv">—</dd>
        <dt>det A = ad − bc</dt><dd id="tfDet">—</dd>
        <dt>Diện tích</dt><dd id="tfS">—</dd>
      </dl>
      <p class="note-s" id="tfCalc"></p>
      <p class="note-s" id="tfNote"></p>
      <div class="legend"><span><i style="background:#d8312a"></i>Ae₁ (cột 1)</span><span><i style="background:#3f9d6a"></i>Ae₂ (cột 2)</span><span><i style="background:#8f63c9"></i>v, Av</span><span><i style="background:rgba(242,194,48,.55)"></i>ảnh của ô vuông đơn vị</span></div>
    </div>
  </div>`,
  init(root) {
    const L = LT.la, COL = L.COL, n = L.n, np = L.np;
    const cv = root.querySelector('#cvTf'), st = {}, sel = root.querySelector('#tfPre');
    let A = PRE.scale.m.slice(), v = PRE.scale.v.slice(), t = 1, G = null, raf = 0;
    const tEl = root.querySelector('#tfT'), tOut = root.querySelector('output[for="tfT"]');
    const setT = x => { t = x; tEl.value = Math.round(x * 100); tOut.textContent = Math.round(x * 100) + '%'; };
    const M = L.bindMat(root, ['tfA', 'tfB', 'tfC', 'tfD'], m => { A = m; sel.value = 'custom'; stop(); setT(1); draw(); });
    tEl.addEventListener('input', () => { stop(); setT(tEl.value / 100); draw(); });
    const stop = () => { if (raf) cancelAnimationFrame(raf); raf = 0; };
    const play = () => {
      stop();
      if (REDUCED) { setT(1); draw(); return; }
      const t0 = performance.now(), dur = 1600;
      const step = now => { const u = Math.min(1, (now - t0) / dur); setT(u < .5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2); draw(); raf = u < 1 ? requestAnimationFrame(step) : 0; };
      setT(0); draw(); raf = requestAnimationFrame(step);
    };
    root.querySelector('#tfPlay').addEventListener('click', play);
    const load = k => { const p = PRE[k]; A = p.m.slice(); v = p.v.slice(); M.set(A); play(); };
    sel.addEventListener('change', () => load(sel.value));
    const snap = x => Math.max(-4.5, Math.min(4.5, Math.round(x * 10) / 10));
    drag(cv, {
      pick: (x, y) => {
        if (!G) return null;
        const pts = { e1: [A[0], A[2]], e2: [A[1], A[3]], v };
        if (t < 1) { pts.e1 = null; pts.e2 = null; }
        let best = null, bd = 22;
        for (const k in pts) { const p = pts[k]; if (!p) continue; const d = Math.hypot(x - G.X(p[0]), y - G.Y(p[1])); if (d < bd) { bd = d; best = k; } }
        return best;
      },
      move: (k, x, y) => {
        const p = [snap(G.ix(x)), snap(G.iy(y))];
        if (k === 'v') v = p;
        else { if (k === 'e1') { A[0] = p[0]; A[2] = p[1]; } else { A[1] = p[0]; A[3] = p[1]; } M.set(A); sel.value = 'custom'; }
        draw();
      },
    });
    function draw() {
      if (!st.ctx) return;
      const { ctx } = st;
      G = L.plane(st, { half: 4.6 });
      const Mt = [1 + (A[0] - 1) * t, A[1] * t, A[2] * t, 1 + (A[3] - 1) * t];
      const e1 = [Mt[0], Mt[2]], e2 = [Mt[1], Mt[3]], dt = Mt[0] * Mt[3] - Mt[1] * Mt[2];
      const X = p => G.X(p[0]), Y = p => G.Y(p[1]), O = [0, 0];
      L.grid(ctx, G);
      L.lattice(ctx, G, e1, e2, COL.tgrid);
      L.line(ctx, G, e1, 'rgba(216,49,42,.45)', 1.5, []); L.line(ctx, G, e2, 'rgba(63,157,106,.5)', 1.5, []);
      // ô vuông đơn vị gốc (nét đứt) và ảnh của nó
      ctx.setLineDash([4, 4]); ctx.strokeStyle = C.muted; ctx.lineWidth = 1; ctx.strokeRect(G.X(0), G.Y(1), G.s, G.s); ctx.setLineDash([]);
      const q = [O, e1, [e1[0] + e2[0], e1[1] + e2[1]], e2];
      ctx.beginPath(); q.forEach((p, i) => (i ? ctx.lineTo(X(p), Y(p)) : ctx.moveTo(X(p), Y(p)))); ctx.closePath();
      ctx.fillStyle = dt >= 0 ? 'rgba(242,194,48,.40)' : 'rgba(216,49,42,.20)'; ctx.fill();
      ctx.strokeStyle = dt >= 0 ? '#B8901A' : C.pos; ctx.lineWidth = 1.5; ctx.stroke();
      if (Math.abs(dt) > 0.15) {
        const cx = (e1[0] + e2[0]) / 2, cy = (e1[1] + e2[1]) / 2;
        L.label(ctx, (dt < 0 ? 'lật, ' : '') + 'S = ' + n(Math.abs(dt)), G.X(cx), G.Y(cy), C.ink, 'center', 'middle', 13);
      }
      // Av = x·(cột 1) + y·(cột 2): đường gấp khúc mảnh
      const Av = mul(Mt, v), p1 = [v[0] * e1[0], v[0] * e1[1]];
      ctx.lineWidth = 1.5; ctx.setLineDash([2, 3]);
      ctx.strokeStyle = COL.c1; ctx.beginPath(); ctx.moveTo(X(O), Y(O)); ctx.lineTo(X(p1), Y(p1)); ctx.stroke();
      ctx.strokeStyle = COL.c2; ctx.beginPath(); ctx.moveTo(X(p1), Y(p1)); ctx.lineTo(X(Av), Y(Av)); ctx.stroke(); ctx.setLineDash([]);
      // v (nét đứt, đầu rỗng) và Av
      ctx.setLineDash([6, 4]); LT.arrow(ctx, X(O), Y(O), X(v), Y(v), COL.v, 2, 10); ctx.setLineDash([]);
      LT.arrow(ctx, X(O), Y(O), X(Av), Y(Av), COL.v, 3.2, 12);
      // hai cột
      LT.arrow(ctx, X(O), Y(O), X(e1), Y(e1), COL.c1, 3, 11); LT.arrow(ctx, X(O), Y(O), X(e2), Y(e2), COL.c2, 3, 11);
      if (t >= 1) { L.handle(ctx, X(e1), Y(e1), COL.c1); L.handle(ctx, X(e2), Y(e2), COL.c2); }
      L.handle(ctx, X(v), Y(v), COL.v, true);
      L.tipLabel(ctx, G, e1, 'Ae₁', COL.c1); L.tipLabel(ctx, G, e2, 'Ae₂', COL.c2);
      L.tipLabel(ctx, G, v, 'v', COL.v); if (Math.hypot(Av[0] - v[0], Av[1] - v[1]) > 0.35) L.tipLabel(ctx, G, Av, t < 1 ? 'M(t)v' : 'Av', COL.v);
      // số liệu (luôn theo A, không theo M(t))
      const AvF = mul(A, v), det = A[0] * A[3] - A[1] * A[2];
      setTxt('tfV', L.vec(v)); setTxt('tfAv', L.vec(AvF)); setTxt('tfDet', n(det, 3));
      setTxt('tfS', Math.abs(det) < 1e-9 ? 'ép về 0' : '× ' + n(Math.abs(det), 3) + (det < 0 ? ', lật hướng' : ''));
      setTxt('tfCalc', `Av = (${n(A[0])}·${np(v[0])} + ${n(A[1])}·${np(v[1])}; ${n(A[2])}·${np(v[0])} + ${n(A[3])}·${np(v[1])}) = ${L.vec(AvF)}: mỗi thành phần là tích vô hướng của một hàng của A với v.`);
      const gen = Math.abs(det) < 1e-9
        ? 'det A = 0: mặt phẳng bị ép xuống một đường thẳng (hoặc một điểm). Nhiều vector khác nhau có cùng ảnh, nên không suy ngược được từ Av ra v: A không có nghịch đảo.'
        : det < 0 ? `det A < 0: hình bị lật như soi gương (đi từ cột 1 sang cột 2 thành cùng chiều kim đồng hồ); mọi diện tích nhân ${n(-det, 3)}.`
        : `det A > 0: giữ nguyên hướng; mọi diện tích nhân ${n(det, 3)}${det > 1 + 1e-9 ? ' (phóng to)' : det < 1 - 1e-9 ? ' (thu nhỏ)' : ' (không đổi)'}.`;
      setTxt('tfNote', (PRE[sel.value] ? PRE[sel.value].note + ' ' : '') + gen);
    }
    M.set(A); setT(1);
    watchCanvas(cv, st, draw);
  },
});
})();
