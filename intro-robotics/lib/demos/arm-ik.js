/* =====================================================================
   Robotics: minh họa "Động học ngược" (id: arm-ik, trang 1-dong-hoc.html)
   Kéo điểm đích; công thức đóng (luật cos) tính ra hai nghiệm θ₁, θ₂ ("khuỷu kiểu A" và "khuỷu kiểu B").
     cos θ₂ = (r² − L₁² − L₂²) / (2 L₁ L₂),   θ₁ = atan2(y, x) − atan2(L₂ sin θ₂, L₁ + L₂ cos θ₂)
   Vòng xuyến màu nhạt: vùng với tới, |L₁ − L₂| ≤ r ≤ L₁ + L₂.
   Chạy độc lập: lib/demos/run.html?demo=arm-ik
   ===================================================================== */
(() => {
const { COLORS: C, watchCanvas, setTxt, num, range, drag, pressGroup } = TFG;
TFG.demo('arm-ik', {
  deps: ['arm-common'],
  html: `<div class="demo-title"><h4>Động học ngược</h4><span>Kéo điểm đích màu đỏ, cánh tay tự tính góc để với tới</span></div>
    <div class="demo-body">
      <div class="stagebox"><canvas id="ikCv" class="ar" role="img" aria-label="Cánh tay hai khâu với tới điểm đích; vòng xuyến là vùng với tới; bóng mờ là nghiệm thứ hai."></canvas>
        <span class="hint">Kéo dấu cộng đỏ (hoặc bấm chỗ bất kỳ)</span></div>
      <div class="panel">
        <div class="btnrow" role="group" aria-label="Chọn nghiệm">
          <button class="btn" type="button" id="ikA">Khuỷu kiểu A (θ₂ &gt; 0)</button>
          <button class="btn" type="button" id="ikB">Khuỷu kiểu B (θ₂ &lt; 0)</button>
        </div>
        <div class="checks"><label><input type="checkbox" id="ikGhost" checked> Hiện nghiệm còn lại (bóng mờ)</label></div>
        <div class="ctrl"><label for="ikL1">Độ dài khâu 1, L₁</label><output for="ikL1"></output>
          <input type="range" id="ikL1" min="0.3" max="1.2" step="0.05" value="1"></div>
        <div class="ctrl"><label for="ikL2">Độ dài khâu 2, L₂</label><output for="ikL2"></output>
          <input type="range" id="ikL2" min="0.2" max="1.2" step="0.05" value="0.7"></div>
        <dl class="readout">
          <dt>Khoảng cách tới đích r</dt><dd id="ikR">—</dd>
          <dt>θ₁</dt><dd id="ikT1" class="big">—</dd>
          <dt>θ₂</dt><dd id="ikT2" class="big">—</dd>
          <dt>Tình trạng</dt><dd id="ikS" style="font-family:var(--body)">—</dd>
        </dl>
        <p class="note-s">Hầu hết điểm đích có <b>hai</b> cách với tới, như tay người có thể chống khuỷu lên hoặc xuống. Kéo đích ra ngoài vòng xuyến: không có nghiệm, cánh tay chỉ duỗi thẳng về phía đích. Cho L₁ khác L₂ rồi kéo đích lại sát gốc: có một lỗ ở giữa mà tay cũng không với tới.</p>
      </div>
    </div>`,
  init() {
    const { fk, view, grid, draw, target, deg } = TFG.ARM;
    const cv = document.getElementById('ikCv'), st = {};
    let T = [1.1, 0.7], sol = 1, v = null;
    const l1 = range('ikL1', { show: x => num(x, 3) + ' m', onInput: () => draw2() });
    const l2 = range('ikL2', { show: x => num(x, 3) + ' m', onInput: () => draw2() });
    const bA = document.getElementById('ikA'), bB = document.getElementById('ikB'), gh = document.getElementById('ikGhost');
    bA.onclick = () => { sol = 1; pressGroup([bA, bB], bA); draw2(); }; bB.onclick = () => { sol = -1; pressGroup([bA, bB], bB); draw2(); };
    pressGroup([bA, bB], bA); gh.onchange = () => draw2();
    drag(cv, { pick: () => 'T', move: (o, x, y) => { if (!v) return; const p = v.inv(x, y); T = [Math.max(-2.6, Math.min(2.6, p[0])), Math.max(-2.6, Math.min(2.6, p[1]))]; draw2(); } });
    watchCanvas(cv, st, () => draw2());
    l1.upd(); l2.upd(); draw2();
    // trả về {th:[θ1,θ2], ok}
    function ik(L1, L2, x, y, s) {
      const r = Math.hypot(x, y); let c = (r * r - L1 * L1 - L2 * L2) / (2 * L1 * L2); const ok = c >= -1 - 1e-9 && c <= 1 + 1e-9;
      c = Math.max(-1, Math.min(1, c)); const t2 = s * Math.acos(c);
      const t1 = Math.atan2(y, x) - Math.atan2(L2 * Math.sin(t2), L1 + L2 * Math.cos(t2));
      return { th: [t1, t2], ok };
    }
    function draw2() {
      const L1 = l1.get(), L2 = l2.get(), r = Math.hypot(T[0], T[1]);
      const a = ik(L1, L2, T[0], T[1], sol), b = ik(L1, L2, T[0], T[1], -sol);
      setTxt('ikR', num(r, 3) + ' m'); setTxt('ikT1', num(deg(a.th[0]), 3) + '°'); setTxt('ikT2', num(deg(a.th[1]), 3) + '°');
      setTxt('ikS', a.ok ? (Math.abs(a.th[1]) < 1e-3 || Math.abs(Math.abs(a.th[1]) - Math.PI) < 1e-3 ? 'Với tới được, nhưng hai nghiệm trùng nhau (tay thẳng hoặc gập hết cỡ)' : 'Với tới được: có 2 nghiệm')
        : r > L1 + L2 ? 'Quá xa: ngoài tầm với' : 'Quá gần: lọt vô lỗ giữa');
      if (!st.ctx) return;
      const { ctx, W, H } = st; ctx.clearRect(0, 0, W, H);
      v = view(W, H, L1 + L2 + 0.25); grid(ctx, v, W, H);
      // vùng với tới (vòng xuyến)
      ctx.save(); ctx.fillStyle = 'rgba(123,205,232,.22)'; ctx.beginPath();
      ctx.arc(v.X(0), v.Y(0), (L1 + L2) * v.s, 0, 2 * Math.PI); ctx.moveTo(v.X(0) + Math.abs(L1 - L2) * v.s, v.Y(0)); ctx.arc(v.X(0), v.Y(0), Math.abs(L1 - L2) * v.s, 0, 2 * Math.PI, true); ctx.fill('evenodd');
      ctx.strokeStyle = C.sky; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.arc(v.X(0), v.Y(0), (L1 + L2) * v.s, 0, 7); ctx.stroke();
      if (Math.abs(L1 - L2) > 0.01) { ctx.beginPath(); ctx.arc(v.X(0), v.Y(0), Math.abs(L1 - L2) * v.s, 0, 7); ctx.stroke(); }
      ctx.restore();
      if (gh.checked && a.ok) draw(ctx, v, fk(b.th, [L1, L2]), { ghost: true });
      draw(ctx, v, fk(a.th, [L1, L2]));
      target(ctx, v, T, a.ok ? C.pos : '#9DA4AD');
      if (!a.ok) { const e = fk(a.th, [L1, L2])[2]; ctx.save(); ctx.setLineDash([4, 4]); ctx.strokeStyle = C.pos; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(v.X(e[0]), v.Y(e[1])); ctx.lineTo(v.X(T[0]), v.Y(T[1])); ctx.stroke(); ctx.restore(); }
    }
  },
});
})();
