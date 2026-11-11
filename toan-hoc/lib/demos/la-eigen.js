/* =====================================================================
   Toán học: minh họa "Đi tìm vector riêng" (id: la-eigen, trang 8-dai-so-tuyen-tinh.html)
   Vector đơn vị v (tím) quay quanh gốc; Av (xanh dương) là ảnh của nó. Khi Av cùng phương với v, v là vector riêng.
   Đồ thị phía dưới: f(θ) = v × Av = |Av|·sin(góc từ v tới Av), chia cho độ giãn lớn nhất của A.
   f = 0 đúng tại phương riêng: cắt trục = hai phương riêng, chỉ chạm trục = nghiệm kép, không chạm = trị riêng phức.
   ===================================================================== */
(() => {
const { COLORS: C, setTxt, drag, watchCanvas } = LT;
const PRE = {
  diag: { m: [2, 0, 0, 3], th: 30 },
  sym: { m: [2, 1, 1, 2], th: 20 },
  shear: { m: [2, 1, 0, 1], th: 60 },
  swap: { m: [0, 1, 1, 0], th: 20 },
  sing: { m: [1, 2, 0.5, 1], th: 70 },
  defect: { m: [2, 1, 0, 2], th: 50 },
  scalar: { m: [2, 0, 0, 2], th: 35 },
  rot: { m: [0, -1, 1, 0], th: 30 },
};
const SUB = ['₁', '₂'];
LT.demo('la-eigen', {
  deps: ['la2', 'plot'],
  html: `<div class="demo-title"><h4>Đi tìm vector riêng</h4><span>Xoay v; khi Av nằm trên cùng đường thẳng với v, v là vector riêng</span></div>
  <div class="demo-body">
    <div class="stagebox"><canvas id="cvEg" class="ar" role="img" aria-label="Vector đơn vị v, ảnh Av, vòng tròn đơn vị và ảnh của nó"></canvas>
      <canvas id="cvEgP" class="profile" role="img" aria-label="Đồ thị độ lệch phương giữa v và Av theo góc của v"></canvas>
      <span class="hint" style="top:8px;bottom:auto;left:auto;right:10px">Kéo đầu vector v (tím)</span></div>
    <div class="panel">
      <div class="ctrl"><label for="egPre">Ma trận</label><select id="egPre">
        <option value="diag">Đường chéo [[2, 0], [0, 3]]</option><option value="sym">Đối xứng [[2, 1], [1, 2]]</option>
        <option value="shear">Không đối xứng [[2, 1], [0, 1]]</option><option value="swap">Hoán đổi x, y [[0, 1], [1, 0]]</option>
        <option value="sing">Suy biến, det = 0</option><option value="defect">Ma trận khuyết [[2, 1], [0, 2]]</option>
        <option value="scalar">2I [[2, 0], [0, 2]]</option><option value="rot">Quay 90° [[0, −1], [1, 0]]</option>
        <option value="custom" disabled>Tự nhập</option></select></div>
      <div class="matrow"><span>A =</span><div class="mat-edit" role="group" aria-label="Các phần tử của ma trận A">
        <input type="number" id="egA" step="0.1" min="-4" max="4" aria-label="Hàng 1, cột 1"><input type="number" id="egB" step="0.1" min="-4" max="4" aria-label="Hàng 1, cột 2">
        <input type="number" id="egC" step="0.1" min="-4" max="4" aria-label="Hàng 2, cột 1"><input type="number" id="egD" step="0.1" min="-4" max="4" aria-label="Hàng 2, cột 2">
      </div></div>
      <div class="ctrl"><label for="egTh">Góc của v</label><output for="egTh"></output><input type="range" id="egTh" min="0" max="3600" value="300"></div>
      <div class="btnrow"><button class="btn" type="button" id="egSweep" aria-pressed="false">Quét tự động</button></div>
      <div class="checks"><label><input type="checkbox" id="egShow"> Hiện phương riêng</label><label><input type="checkbox" id="egEll" checked> Hiện ảnh của vòng tròn</label></div>
      <p class="note-s" id="egNow" aria-live="polite"></p>
      <dl class="readout">
        <dt>Phương trình</dt><dd id="egCh">—</dd>
        <dt>Trị riêng</dt><dd class="big" id="egL">—</dd>
        <dt>Vector riêng</dt><dd id="egV">—</dd>
        <dt>AM / GM</dt><dd id="egM">—</dd>
        <dt>Chéo hóa?</dt><dd id="egDg">—</dd>
      </dl>
      <p class="note-s" id="egNote"></p>
    </div>
  </div>`,
  init(root) {
    const L = LT.la, COL = L.COL, n = L.n;
    const cv = root.querySelector('#cvEg'), cp = root.querySelector('#cvEgP'), st = {}, sp = {}, sel = root.querySelector('#egPre');
    const thEl = root.querySelector('#egTh'), thOut = root.querySelector('output[for="egTh"]');
    const showEl = root.querySelector('#egShow'), ellEl = root.querySelector('#egEll'), swBtn = root.querySelector('#egSweep');
    let A = PRE.diag.m.slice(), th = PRE.diag.th, E = null, G = null, raf = 0;
    const M = L.bindMat(root, ['egA', 'egB', 'egC', 'egD'], m => { A = m; sel.value = 'custom'; update(); });
    /* các góc (độ, 0–360) của phương riêng thực */
    const eigAngles = () => {
      if (!E || E.kind === 'complex' || E.scalar) return [];
      const out = [];
      [[E.v1, E.l1], [E.v2, E.l2]].forEach(([v, l], i) => {
        if (!v) return; const a = (Math.atan2(v[1], v[0]) * 180 / Math.PI + 360) % 360;
        out.push({ a, l, i }, { a: (a + 180) % 360, l, i });
      });
      return out;
    };
    const snapTh = x => { x = ((x % 360) + 360) % 360; for (const e of eigAngles()) { const d = Math.abs(((x - e.a + 540) % 360) - 180); if (d < 1.5) return e.a; } return x; };
    const setTh = (x, snap = true) => { th = snap ? snapTh(x) : ((x % 360) + 360) % 360; thEl.value = Math.round(th * 10); thOut.textContent = n(th, 1) + '°'; };
    thEl.addEventListener('input', () => { stopSweep(); setTh(thEl.value / 10); draw(); });
    showEl.addEventListener('change', draw); ellEl.addEventListener('change', draw);
    const stopSweep = () => { if (raf) cancelAnimationFrame(raf); raf = 0; swBtn.setAttribute('aria-pressed', 'false'); swBtn.textContent = 'Quét tự động'; };
    swBtn.addEventListener('click', () => {
      if (raf) { stopSweep(); return; }
      swBtn.setAttribute('aria-pressed', 'true'); swBtn.textContent = 'Dừng quét';
      let last = performance.now();
      const step = now => {
        const dt = Math.min(0.05, (now - last) / 1000); last = now;
        // chậm lại gần phương riêng để kịp nhìn thấy
        const near = eigAngles().some(e => Math.abs(((th - e.a + 540) % 360) - 180) < 6);
        setTh(th + dt * (near ? 9 : 36), false); draw(); raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    });
    sel.addEventListener('change', () => { const p = PRE[sel.value]; A = p.m.slice(); M.set(A); th = p.th; update(); });
    drag(cv, {
      pick: (x, y) => { if (!G) return null; const v = [Math.cos(th * Math.PI / 180), Math.sin(th * Math.PI / 180)]; return Math.hypot(x - G.X(v[0]), y - G.Y(v[1])) < 26 ? 'v' : null; },
      move: (o, x, y) => { stopSweep(); setTh(Math.atan2(G.iy(y), G.ix(x)) * 180 / Math.PI); draw(); },
    });
    function update() { E = L.eig2(...A); setTh(th); readout(); draw(); }
    function readout() {
      const tr = E.tr, det = E.det;
      const term = (k, s) => (Math.abs(k) < 1e-9 ? '' : (k > 0 ? ' + ' : ' − ') + (Math.abs(Math.abs(k) - 1) < 1e-9 && s ? '' : n(Math.abs(k))) + s);
      setTxt('egCh', 'λ²' + term(-tr, 'λ') + term(det, '') + ' = 0');
      let lam, vecs, mult, dg, note;
      const neg = E.kind !== 'complex' && (E.l2 < -1e-9);
      if (E.kind === 'complex') {
        const im = Math.abs(E.im - 1) < 1e-9 ? 'i' : n(E.im) + 'i';
        lam = (Math.abs(E.re) < 1e-9 ? '±' : n(E.re) + ' ± ') + im;
        vecs = 'không có (thực)';
        mult = '1 / 1 (trên ℂ)'; dg = 'chỉ trên ℂ';
        note = 'Đường cong phía dưới không chạm trục: không có phương nào giữ nguyên. Trị riêng là cặp số phức liên hợp a ± bi: trong một hệ trục thích hợp, A là phép quay một góc arg(a + bi) kèm co giãn |a + bi| lần. Trên ℝ không chéo hóa được; trên ℂ hai trị riêng phân biệt nên chéo hóa được.';
      } else if (E.kind === 'repeated') {
        lam = n(E.l1) + ' (nghiệm kép)';
        if (E.scalar) {
          vecs = 'mọi vector khác 0'; mult = '2 / 2'; dg = 'Có';
          note = 'A = ' + n(E.l1) + 'I chỉ co giãn đều mọi phương: mọi vector đều là vector riêng, đường cong nằm sát trục. Trị riêng lặp nhưng vẫn chéo hóa được.';
        } else {
          vecs = L.vec(E.v1) + ', chỉ một'; mult = '2 / 1'; dg = 'Không (khuyết)';
          note = 'Đường cong chỉ chạm trục rồi quay lại (nghiệm kép) thay vì cắt qua: chỉ có một phương riêng, thiếu một vector riêng độc lập để chéo hóa.';
        }
      } else {
        lam = 'λ₁ = ' + n(E.l1) + '; λ₂ = ' + n(E.l2);
        vecs = L.vec(E.v1) + ', ' + L.vec(E.v2);
        mult = '1 / 1 mỗi λ'; dg = 'Có';
        const dot = E.v1[0] * E.v2[0] + E.v1[1] * E.v2[1];
        note = 'Hai trị riêng phân biệt nên chéo hóa được. ' + (E.sym ? 'Ma trận đối xứng: hai phương riêng vuông góc với nhau.' : Math.abs(dot) < 1e-9 ? 'Hai phương riêng vuông góc.' : 'Ma trận không đối xứng: hai phương riêng không vuông góc.');
        if (Math.abs(E.l2) < 1e-9 || Math.abs(E.l1) < 1e-9) note += ' Có λ = 0: vector trên phương đó bị ép về 0, nên det A = 0 (tích các trị riêng).';
        else if (neg) note += ' λ âm: vector riêng bị lật ngược chiều nhưng vẫn nằm trên cùng đường thẳng.';
        note += ' Kiểm tra: λ₁ + λ₂ = ' + n(E.l1 + E.l2) + ' = vết (a + d); λ₁·λ₂ = ' + n(E.l1 * E.l2) + ' = det A.';
      }
      setTxt('egL', lam); setTxt('egV', vecs); setTxt('egM', mult); setTxt('egDg', dg); setTxt('egNote', note);
    }
    function draw() {
      if (!st.ctx || !E) return;
      const { ctx } = st, [a, b, c, d] = A;
      const sm = L.smax(a, b, c, d), half = Math.max(1.7, Math.min(6, 1.22 * Math.max(1, sm)));
      G = L.plane(st, { half });
      L.grid(ctx, G);
      const X = p => G.X(p[0]), Y = p => G.Y(p[1]);
      // vòng tròn đơn vị và ảnh của nó
      ctx.strokeStyle = '#B9C4CC'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(G.X(0), G.Y(0), G.s, 0, 2 * Math.PI); ctx.stroke();
      if (ellEl.checked) {
        ctx.strokeStyle = 'rgba(55,135,196,.75)'; ctx.lineWidth = 2; ctx.setLineDash([6, 4]); ctx.beginPath();
        for (let k = 0; k <= 180; k++) { const u = k / 180 * 2 * Math.PI, p = [a * Math.cos(u) + b * Math.sin(u), c * Math.cos(u) + d * Math.sin(u)]; k ? ctx.lineTo(X(p), Y(p)) : ctx.moveTo(X(p), Y(p)); }
        ctx.stroke(); ctx.setLineDash([]);
      }
      // phương riêng
      if (showEl.checked) {
        if (E.kind !== 'complex' && E.scalar) {
          for (let k = 0; k < 12; k++) { const u = k * Math.PI / 12; L.line(ctx, G, [Math.cos(u), Math.sin(u)], 'rgba(143,99,201,.28)', 1.2, [3, 5]); }
        } else if (E.kind !== 'complex') {
          [[E.v1, E.l1, COL.c1], [E.v2, E.l2, COL.c2]].forEach(([v, l, col], i) => {
            if (!v) return; L.line(ctx, G, v, col, 2);
            const m = Math.hypot(v[0], v[1]), r = Math.min(G.x1 - G.x0, G.y1 - G.y0) * 0.44;
            let p = [v[0] / m * r, v[1] / m * r]; if (p[1] < 0) p = [-p[0], -p[1]];
            L.label(ctx, 'λ' + SUB[i] + ' = ' + n(l), X(p) + 6, Y(p) - 4, col, 'left', 'bottom', 13);
          });
        }
      }
      // v và Av
      const r = th * Math.PI / 180, v = [Math.cos(r), Math.sin(r)], Av = [a * v[0] + b * v[1], c * v[0] + d * v[1]];
      const nAv = Math.hypot(Av[0], Av[1]), cross = v[0] * Av[1] - v[1] * Av[0], dot = v[0] * Av[0] + v[1] * Av[1];
      const aligned = nAv < 1e-6 || Math.abs(cross) / nAv < 0.012;
      if (aligned) { L.line(ctx, G, v, 'rgba(242,194,48,.9)', 6, []); }
      LT.arrow(ctx, X([0, 0]), Y([0, 0]), X(Av), Y(Av), C.sea, 3.2, 12);
      LT.arrow(ctx, X([0, 0]), Y([0, 0]), X(v), Y(v), COL.v, 3, 11);
      L.handle(ctx, X(v), Y(v), COL.v);
      L.tipLabel(ctx, G, v, 'v', COL.v); if (nAv > 0.2 && Math.hypot(Av[0] - v[0], Av[1] - v[1]) > 0.25) L.tipLabel(ctx, G, Av, 'Av', C.sea);
      if (aligned) L.label(ctx, nAv < 1e-6 ? 'Av = 0 = 0·v' : 'Av = ' + n(dot) + '·v', 12, 22, C.ink, 'left', 'bottom', 15, 700);
      const ang = Math.atan2(cross, dot) * 180 / Math.PI;
      setTxt('egNow', aligned
        ? (nAv < 1e-6 ? 'v bị ép về 0: v là vector riêng với λ = 0.' : `Av = ${n(dot)}·v: v là vector riêng, trị riêng λ = ${n(dot)}${dot < 0 ? ' (Av ngược chiều v)' : ''}.`)
        : `Av lệch phương so với v ${n(Math.abs(Math.abs(ang) > 90 ? 180 - Math.abs(ang) : ang), 1)}°: v không phải vector riêng.`);
      drawProfile(sm);
    }
    function drawProfile(sm) {
      if (!sp.ctx) return;
      const [a, b, c, d] = A, f = t => { const u = t * Math.PI / 180, co = Math.cos(u), si = Math.sin(u); return (c * co * co + (d - a) * si * co - b * si * si) / (sm || 1); };
      const P = LT.plot(sp, { x0: 0, x1: 360, y0: -1.15, y1: 1.15, l: 40, b: 24, t: 8 });
      P.frame({ xstep: 45, ystep: 1, xlab: v => v + '°', ylab: v => LT.la.n(v) });
      P.curve(f, C.sea, 2.2);
      eigAngles().forEach(e => P.dot(e.a, 0, e.i ? COL.c2 : COL.c1, 4.5));
      const ctx = P.ctx; ctx.strokeStyle = COL.v; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(P.X(th), P.t); ctx.lineTo(P.X(th), P.t + P.ph); ctx.stroke();
      P.dot(th, f(th), COL.v, 5);
      P.text(P.pw > 430 ? 'độ lệch phương của Av so với v (bằng 0 ⇔ v là vector riêng)' : 'lệch phương (0 ⇔ vector riêng)', P.l + 6, P.t + 4, C.muted, 'left', 'top');
    }
    watchCanvas(cv, st, draw); watchCanvas(cp, sp, () => draw());
    M.set(A); update();
  },
});
})();
