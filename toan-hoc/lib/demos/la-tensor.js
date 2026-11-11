/* =====================================================================
   Toán học: minh họa "Tensor đối xứng 3×3 và ellipsoid" (id: la-tensor, trang 8-dai-so-tuyen-tinh.html)
   Dựng D = λ₁e₁e₁ᵀ + λ₂e₂e₂ᵀ + λ₃e₃e₃ᵀ = QΛQᵀ từ ba trị riêng và hướng sợi (φ, θ).
   Ellipsoid = ảnh của mặt cầu đơn vị qua D: bán trục λᵢ theo hướng eᵢ.
   Màu theo quy ước DTI: đỏ = trái–phải (x), xanh lá = sau–trước (y), xanh dương = dưới–trên (z), độ đậm theo FA.
   Chế độ độ dẫn điện: σ = s·D, s chọn sao cho (σ₁σ₂σ₃)^(1/3) = σ đẳng hướng của mô (chuẩn hóa thể tích).
   Vector u (tím) và Du (xanh): chỉ khi u trùng một vector riêng thì Du (hay J = σE) cùng phương với u (hay E).
   ===================================================================== */
(() => {
const { COLORS: C, setTxt, drag, watchCanvas, pressGroup } = LT;
const PRE = {
  wm: { l: [1.7, 0.3, 0.3], phi: 0, th: 0, iso: 0.126, tissue: 'chất trắng',
    note: 'Bó sợi song song, ví dụ thân thể chai chạy theo hướng trái–phải: nước khuếch tán dọc sợi dễ hơn nhiều so với ngang sợi. Ellipsoid dài như điếu xì gà, màu đỏ vì hướng chính gần trục x.' },
  cst: { l: [1.6, 0.35, 0.3], phi: 90, th: 75, iso: 0.126, tissue: 'chất trắng',
    note: 'Bó sợi chạy gần theo phương trên–dưới, như bó vỏ não–tủy sống: hướng chính gần trục z nên màu xanh dương.' },
  cross: { l: [1.1, 1.0, 0.3], phi: 40, th: 15, iso: 0.126, tissue: 'chất trắng',
    note: 'Hai bó sợi bắt chéo trong cùng một voxel: hai trị riêng lớn gần bằng nhau, ellipsoid dẹt như cái đĩa và hướng chính gần như không xác định. Đây là hạn chế đã biết của mô hình một tensor.' },
  gm: { l: [0.9, 0.8, 0.7], phi: 30, th: 40, iso: 0.275, tissue: 'chất xám',
    note: 'Chất xám: khuếch tán gần như đều mọi hướng, FA nhỏ.' },
  csf: { l: [3.0, 3.0, 3.0], phi: 0, th: 0, iso: 1.654, tissue: 'dịch não tủy',
    note: 'Dịch não tủy: nước gần như tự do, khuếch tán nhanh và đều mọi hướng (khoảng 3 × 10⁻³ mm²/s ở 37°C). Ellipsoid là mặt cầu, FA = 0, mọi hướng đều là vector riêng.' },
};
const rad = d => d * Math.PI / 180, dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const mv = (M, v) => M.map(r => dot(r, v)), norm = v => Math.hypot(v[0], v[1], v[2]);
function frame(phi, th) {
  const p = rad(phi), t = rad(th);
  return [[Math.cos(t) * Math.cos(p), Math.cos(t) * Math.sin(p), Math.sin(t)], [-Math.sin(p), Math.cos(p), 0], [-Math.sin(t) * Math.cos(p), -Math.sin(t) * Math.sin(p), Math.cos(t)]];
}
const tensor = (l, E) => [0, 1, 2].map(r => [0, 1, 2].map(c => l[0] * E[0][r] * E[0][c] + l[1] * E[1][r] * E[1][c] + l[2] * E[2][r] * E[2][c]));
const FA = l => { const s = Math.hypot(l[0], l[1], l[2]); return s ? Math.SQRT1_2 * Math.hypot(l[0] - l[1], l[1] - l[2], l[2] - l[0]) / s : 0; };
LT.demo('la-tensor', {
  deps: ['la2'],
  html: `<div class="demo-title"><h4>Tensor đối xứng 3×3 và ellipsoid</h4><span>Ba trị riêng là ba bán trục, ba vector riêng là ba hướng chính; kéo hình để xoay</span></div>
  <div class="demo-body">
    <div class="stagebox"><canvas id="cvTs" class="ar sq" role="img" aria-label="Ellipsoid của tensor 3×3 với ba trục chính, tô màu theo hướng chính"></canvas></div>
    <div class="panel">
      <div class="btnrow" role="group" aria-label="Đại lượng">
        <button class="btn" type="button" data-ts="D" aria-pressed="true">Khuếch tán D</button><button class="btn" type="button" data-ts="S" aria-pressed="false">Độ dẫn điện σ</button>
      </div>
      <div class="ctrl"><label for="tsPre">Mô</label><select id="tsPre">
        <option value="wm">Chất trắng: bó sợi trái–phải</option><option value="cst">Chất trắng: bó sợi trên–dưới</option>
        <option value="cross">Chất trắng: hai bó sợi bắt chéo</option><option value="gm">Chất xám</option><option value="csf">Dịch não tủy</option>
        <option value="custom" disabled>Tự chỉnh</option></select></div>
      <div class="ctrl"><label for="tsL1">λ₁ theo e₁ (dọc sợi)</label><output for="tsL1"></output><input type="range" id="tsL1" min="5" max="320" step="5" value="170"></div>
      <div class="ctrl"><label for="tsL2">λ₂ theo e₂</label><output for="tsL2"></output><input type="range" id="tsL2" min="5" max="320" step="5" value="30"></div>
      <div class="ctrl"><label for="tsL3">λ₃ theo e₃</label><output for="tsL3"></output><input type="range" id="tsL3" min="5" max="320" step="5" value="30"></div>
      <div class="ctrl"><label for="tsPhi">Hướng sợi: góc phương vị φ</label><output for="tsPhi"></output><input type="range" id="tsPhi" min="0" max="180" value="0"></div>
      <div class="ctrl"><label for="tsTh">Hướng sợi: góc nâng θ</label><output for="tsTh"></output><input type="range" id="tsTh" min="-90" max="90" value="0"></div>
      <div class="ctrl"><label for="tsBeta" id="tsBetaL">Hướng đo u: lệch khỏi e₁ một góc</label><output for="tsBeta"></output><input type="range" id="tsBeta" min="0" max="90" value="35"></div>
      <div class="btnrow"><button class="btn" type="button" id="tsView">Đặt lại góc nhìn</button></div>
      <div class="matrow" id="tsMat"></div>
      <dl class="readout" aria-live="polite">
        <dt id="tsLamL">λ₁ ≥ λ₂ ≥ λ₃</dt><dd id="tsLam">—</dd>
        <dt id="tsMDL">MD = vết / 3</dt><dd id="tsMD">—</dd>
        <dt>FA</dt><dd class="big" id="tsFA">—</dd>
        <dt>Hướng chính e₁</dt><dd id="tsE1">—</dd>
        <dt id="tsUL">uᵀDu</dt><dd id="tsU">—</dd>
        <dt id="tsAngL">Góc giữa Du và u</dt><dd id="tsAng">—</dd>
      </dl>
      <p class="note-s" id="tsNow"></p>
      <p class="note-s" id="tsNote"></p>
    </div>
  </div>`,
  init(root) {
    const L = LT.la, n = L.n;
    const cv = root.querySelector('#cvTs'), st = {}, sel = root.querySelector('#tsPre');
    let mode = 'D', iso = PRE.wm.iso, tissue = PRE.wm.tissue, yaw = rad(-32), pitch = rad(18);
    const custom = () => { sel.value = 'custom'; };
    const rL = [1, 2, 3].map(i => LT.range('tsL' + i, { map: v => v / 100, show: v => n(v, 2), onInput: () => { custom(); draw(); } }));
    const rPhi = LT.range('tsPhi', { show: v => v + '°', onInput: () => { custom(); draw(); } });
    const rTh = LT.range('tsTh', { show: v => String(v).replace('-', '−') + '°', onInput: () => { custom(); draw(); } });
    const rB = LT.range('tsBeta', { show: v => v + '°', onInput: () => draw() });
    const mb = [...root.querySelectorAll('[data-ts]')];
    mb.forEach(b => b.addEventListener('click', () => { pressGroup(mb, b); mode = b.dataset.ts; draw(); }));
    root.querySelector('#tsView').addEventListener('click', () => { yaw = rad(-32); pitch = rad(18); draw(); });
    const load = k => {
      const p = PRE[k]; iso = p.iso; tissue = p.tissue;
      p.l.forEach((v, i) => { rL[i].el.value = Math.round(v * 100); rL[i].upd(); });
      rPhi.el.value = p.phi; rPhi.upd(); rTh.el.value = p.th; rTh.upd(); sel.value = k; setTxt('tsNote', p.note); draw();
    };
    sel.addEventListener('change', () => load(sel.value));
    drag(cv, {
      pick: (x, y) => ({ x, y, yaw, pitch }),
      move: (o, x, y) => { yaw = o.yaw + (x - o.x) * 0.012; pitch = Math.max(-1.5, Math.min(1.5, o.pitch + (y - o.y) * 0.012)); draw(); },
    });
    function draw() {
      if (!st.ctx) return;
      const { ctx, W, H } = st;
      const l = rL.map(r => r.get()), E = frame(rPhi.get(), rTh.get()), D = tensor(l, E);
      const pairs = l.map((v, i) => [v, E[i]]).sort((a, b) => b[0] - a[0]);
      const fa = FA(l), md = (l[0] + l[1] + l[2]) / 3, s = mode === 'S' ? iso / Math.cbrt(l[0] * l[1] * l[2]) : 1;
      const e1 = pairs[0][1], dirc = e1.map(v => Math.abs(v));
      // ---------- vẽ ----------
      ctx.fillStyle = C.paper; ctx.fillRect(0, 0, W, H);
      const R = Math.min(W, H) * 0.45 / 3.3, cx = W / 2, cy = H / 2 + 6;
      const cyw = Math.cos(yaw), syw = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
      const view = p => { const x1 = p[0] * cyw - p[1] * syw, y1 = p[0] * syw + p[1] * cyw, z1 = p[2]; return [x1, y1 * cp - z1 * sp, y1 * sp + z1 * cp]; };   // [ngang, độ sâu, dọc]
      const scr = q => [cx + q[0] * R, cy - q[2] * R];
      const P2 = p => scr(view(p));
      // trục tọa độ x, y, z (vẽ trước, phần giữa bị ellipsoid che)
      const AX = [[[1, 0, 0], '#d8312a', 'x: trái–phải'], [[0, 1, 0], '#2e9d4f', 'y: sau–trước'], [[0, 0, 1], '#3060c8', 'z: dưới–trên']];
      AX.forEach(([d, col, lab]) => {
        const a = P2(d.map(v => -v * 3.4)), b = P2(d.map(v => v * 3.6));
        ctx.globalAlpha = 0.7; LT.arrow(ctx, a[0], a[1], b[0], b[1], col, 1.5, 8); ctx.globalAlpha = 1;
        const right = b[0] > W - 130 || (b[0] < cx - 20 && b[0] > 130);
        L.label(ctx, lab, Math.max(6, Math.min(W - 6, b[0] + (right ? -4 : 4))), Math.max(16, Math.min(H - 6, b[1] - 4)), col, right ? 'right' : 'left', 'bottom', 12, 600);
      });
      // màu: xám (đẳng hướng) pha với màu hướng theo FA
      const w = Math.min(1, fa * 1.15), grey = [196, 204, 212], dcol = dirc.map(v => 45 + 205 * v);
      const base = grey.map((g, i) => g * (1 - w) + dcol[i] * w);
      const Lt = (() => { const v = [-0.45, -0.75, 0.55], m = norm(v); return v.map(x => x / m); })();
      const nu = 44, nv = 22, pts = [];
      for (let i = 0; i <= nv; i++) { pts.push([]); const v = Math.PI * i / nv;
        for (let j = 0; j <= nu; j++) { const u = 2 * Math.PI * j / nu, a = Math.cos(v), b = Math.sin(v) * Math.cos(u), c = Math.sin(v) * Math.sin(u);
          const p = [0, 1, 2].map(k => l[0] * a * E[0][k] + l[1] * b * E[1][k] + l[2] * c * E[2][k]); pts[i].push(view(p)); } }
      const quads = [];
      for (let i = 0; i < nv; i++) for (let j = 0; j < nu; j++) {
        const v = Math.PI * (i + 0.5) / nv, u = 2 * Math.PI * (j + 0.5) / nu, a = Math.cos(v), b = Math.sin(v) * Math.cos(u), c = Math.sin(v) * Math.sin(u);
        let nw = [0, 1, 2].map(k => a / l[0] * E[0][k] + b / l[1] * E[1][k] + c / l[2] * E[2][k]); const nn = norm(nw); nw = nw.map(x => x / nn);
        const nvw = view(nw); if (nvw[1] > 0.03) continue;   // mặt quay ra sau
        const q = [pts[i][j], pts[i + 1][j], pts[i + 1][j + 1], pts[i][j + 1]];
        quads.push({ q, z: (q[0][1] + q[1][1] + q[2][1] + q[3][1]) / 4, k: 0.42 + 0.58 * Math.max(0, dot(nvw, Lt)) });
      }
      quads.sort((A, B) => B.z - A.z);
      quads.forEach(({ q, k }) => {
        const col = `rgb(${base.map(c => Math.round(Math.min(255, c * k + 18 * k * k))).join(',')})`;
        ctx.beginPath(); q.forEach((p, i) => { const s2 = scr(p); i ? ctx.lineTo(s2[0], s2[1]) : ctx.moveTo(s2[0], s2[1]); }); ctx.closePath();
        ctx.fillStyle = col; ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = 0.7; ctx.stroke();
      });
      // ba trục chính: đoạn nhô ra khỏi bề mặt
      E.forEach((e, i) => [1, -1].forEach(sg => {
        const a = P2(e.map(v => sg * v * l[i])), b = P2(e.map(v => sg * v * (l[i] + 0.45)));
        const front = view(e.map(v => sg * v))[1] <= 0.02;
        ctx.strokeStyle = C.ink; ctx.lineWidth = i === 0 ? 2.6 : 1.6; ctx.globalAlpha = front ? 1 : 0.35;
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); ctx.globalAlpha = 1;
        if (sg === 1) L.label(ctx, 'e' + '₁₂₃'[i], b[0] + 5, b[1] - 3, C.ink, 'left', 'bottom', 13, 700);
      }));
      // u và Du (hoặc E và J = σE)
      const bt = rad(rB.get()), u = [0, 1, 2].map(k => Math.cos(bt) * E[0][k] + Math.sin(bt) * E[1][k]), Du = mv(D, u);
      const o = P2([0, 0, 0]), pu = P2(u), pd = P2(Du);
      LT.arrow(ctx, o[0], o[1], pd[0], pd[1], C.sea, 3.2, 11);
      LT.arrow(ctx, o[0], o[1], pu[0], pu[1], L.COL.v, 3, 10);
      L.label(ctx, mode === 'S' ? 'E' : 'u', pu[0] + 6, pu[1] - 4, L.COL.v, 'left', 'bottom', 14, 700);
      L.label(ctx, mode === 'S' ? 'J = σE' : 'Du', pd[0] + 6, pd[1] + 4, C.sea, 'left', 'top', 14, 700);
      L.label(ctx, 'Kéo để xoay góc nhìn', 10, H - 8, C.muted, 'left', 'bottom', 12.5, 500);
      // ---------- số liệu ----------
      const unit = mode === 'S' ? ' S/m' : ' ×10⁻³ mm²/s', U = mode === 'S' ? ' (S/m)' : ' (10⁻³ mm²/s)', dec = mode === 'S' ? 3 : 2, sv = pairs.map(p => p[0] * s);
      setTxt('tsLamL', (mode === 'S' ? 'σ₁, σ₂, σ₃' : 'λ₁, λ₂, λ₃') + U);
      setTxt('tsLam', sv.map(v => n(v, dec)).join('; '));
      setTxt('tsMDL', (mode === 'S' ? 'σ trung bình' : 'MD') + U);
      setTxt('tsMD', n(md * s, dec));
      setTxt('tsFA', fa.toFixed(2).replace('.', ','));
      const tie = pairs[0][0] - pairs[1][0] < 0.051;
      root.querySelector('#tsE1').innerHTML = (fa < 0.02 ? 'không xác định' : tie ? 'gần như không xác định' : L.vec(e1.map(v => (e1[2] < 0 || (Math.abs(e1[2]) < 1e-9 && e1[0] < 0) ? -v : v)), 2))
        + `<span class="swatch" title="Màu DTI: (|x|, |y|, |z|) × FA" style="background:rgb(${dirc.map(v => Math.round(255 * Math.min(1, v * fa * 1.1 + 0.02))).join(',')})"></span>`;
      const uDu = dot(u, Du), cosA = uDu / norm(Du), ang = Math.acos(Math.max(-1, Math.min(1, cosA))) * 180 / Math.PI;
      setTxt('tsUL', mode === 'S' ? '|J| khi E = 1 V/m (A/m²)' : 'uᵀDu' + U);
      setTxt('tsU', mode === 'S' ? n(norm(Du) * s, 3) : n(uDu, 3));
      setTxt('tsAngL', mode === 'S' ? 'Góc giữa J và E' : 'Góc giữa Du và u');
      setTxt('tsAng', n(ang, 1) + '°');
      const sym = mode === 'S' ? 'σ' : 'D', M = D.map(r => r.map(v => v * s));
      root.querySelector('#tsMat').innerHTML = `<span>${sym} =</span>${L.matHTML(M.map(r => r.map(v => n(v, dec))))}<span class="op">${unit.trim()}; đối xứng: ${sym}ᵢⱼ = ${sym}ⱼᵢ</span>`;
      const b = rB.get();
      setTxt('tsNow', (mode === 'S'
        ? `Chuẩn hóa thể tích với σ ${tissue} = ${n(iso, 3)} S/m: σ = ${n(s, 3)} × D (D tính bằng 10⁻³ mm²/s). Hình không đổi vì σ tỉ lệ với D; FA cũng không đổi. `
        : '')
        + (b === 0 || b === 90 || ang < 0.05
          ? `u nằm trên một trục chính nên ${mode === 'S' ? 'J cùng phương với E' : 'Du cùng phương với u'}: đó là định nghĩa của vector riêng.`
          : `u lệch khỏi trục chính nên ${mode === 'S' ? 'dòng điện J bị kéo lệch về phía sợi, không còn cùng phương với điện trường E' : 'Du bị kéo lệch về phía trục có trị riêng lớn hơn'} (lệch ${n(ang, 1)}°).`));
    }
    watchCanvas(cv, st, draw);
    load('wm');
  },
});
})();
