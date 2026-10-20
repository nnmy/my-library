/* =====================================================================
   Robotics: minh họa "Động học thuận" (id: arm-fk, trang 1-dong-hoc.html)
   Cánh tay phẳng hai khâu nhìn từ trên xuống (kiểu robot SCARA trên bàn).
   Chỉnh góc khớp -> tính tọa độ đầu tay; bật "để lại vệt"; "Quét vùng với tới" rải điểm ngẫu nhiên.
   Chạy độc lập: lib/demos/run.html?demo=arm-fk
   ===================================================================== */
(() => {
const { COLORS: C, watchCanvas, setTxt, num, range } = TFG;
TFG.demo('arm-fk', {
  deps: ['arm-common'],
  html: `<div class="demo-title"><h4>Động học thuận</h4><span>Vặn hai khớp, coi đầu tay chạy tới đâu</span></div>
    <div class="demo-body">
      <div class="stagebox"><canvas id="fkCv" class="ar" role="img" aria-label="Cánh tay hai khâu trên lưới tọa độ, với góc hai khớp và vị trí đầu tay."></canvas></div>
      <div class="panel">
        <div class="ctrl"><label for="fkT1">Góc khớp 1, θ₁</label><output for="fkT1"></output>
          <input type="range" id="fkT1" min="-180" max="180" step="1" value="40"></div>
        <div class="ctrl"><label for="fkT2">Góc khớp 2, θ₂</label><output for="fkT2"></output>
          <input type="range" id="fkT2" min="-170" max="170" step="1" value="-55"></div>
        <div class="ctrl"><label for="fkL1">Độ dài khâu 1, L₁</label><output for="fkL1"></output>
          <input type="range" id="fkL1" min="0.3" max="1.2" step="0.05" value="1"></div>
        <div class="ctrl"><label for="fkL2">Độ dài khâu 2, L₂</label><output for="fkL2"></output>
          <input type="range" id="fkL2" min="0.2" max="1.2" step="0.05" value="0.8"></div>
        <div class="checks"><label><input type="checkbox" id="fkTrail" checked> Để lại vệt đầu tay</label></div>
        <div class="btnrow"><button class="btn" type="button" id="fkSweep">Quét vùng với tới</button><button class="btn" type="button" id="fkClear">Xóa vệt</button></div>
        <dl class="readout">
          <dt>Đầu tay x</dt><dd id="fkX" class="big">—</dd>
          <dt>Đầu tay y</dt><dd id="fkY" class="big">—</dd>
          <dt>Cách gốc</dt><dd id="fkR">—</dd>
        </dl>
        <p class="note-s" id="fkCalc" style="font-family:var(--mono)"></p>
      </div>
    </div>`,
  init() {
    const { fk, view, grid, draw, rad } = TFG.ARM;
    const cv = document.getElementById('fkCv'), st = {};
    let trail = [], cloud = [];
    const t1 = range('fkT1', { show: v => v + '°', onInput: () => step() });
    const t2 = range('fkT2', { show: v => v + '°', onInput: () => step() });
    const l1 = range('fkL1', { show: v => num(v, 3) + ' m', onInput: () => { trail = []; cloud = []; step(); } });
    const l2 = range('fkL2', { show: v => num(v, 3) + ' m', onInput: () => { trail = []; cloud = []; step(); } });
    const tr = document.getElementById('fkTrail');
    document.getElementById('fkClear').onclick = () => { trail = []; cloud = []; draw2(); };
    document.getElementById('fkSweep').onclick = () => {
      const L = [l1.get(), l2.get()]; cloud = [];
      for (let i = 0; i < 4000; i++) { const p = fk([Math.random() * 2 * Math.PI - Math.PI, rad(-170 + Math.random() * 340)], L); cloud.push(p[2]); }
      draw2();
    };
    const cur = () => fk([rad(t1.get()), rad(t2.get())], [l1.get(), l2.get()]);
    watchCanvas(cv, st, () => draw2());
    function step() { const p = cur(); if (tr.checked) { trail.push(p[2]); if (trail.length > 1500) trail.shift(); } draw2(); }
    t1.upd(); t2.upd(); l1.upd(); l2.upd(); trail = [];
    draw2();
    function draw2() {
      const pts = cur(), [, j, e] = pts, a1 = rad(t1.get()), a2 = rad(t2.get());
      setTxt('fkX', num(e[0], 3) + ' m'); setTxt('fkY', num(e[1], 3) + ' m'); setTxt('fkR', num(Math.hypot(e[0], e[1]), 3) + ' m');
      setTxt('fkCalc', `x = ${num(l1.get(), 2)}·cos ${t1.get()}° + ${num(l2.get(), 2)}·cos(${t1.get() + t2.get()}°) = ${num(e[0], 3)}`);
      if (!st.ctx) return;
      const { ctx, W, H } = st; ctx.clearRect(0, 0, W, H);
      const v = view(W, H, l1.get() + l2.get() + 0.2); grid(ctx, v, W, H);
      ctx.fillStyle = 'rgba(55,135,196,.28)'; cloud.forEach(p => ctx.fillRect(v.X(p[0]) - 1, v.Y(p[1]) - 1, 2, 2));
      ctx.strokeStyle = C.gold; ctx.lineWidth = 2; ctx.beginPath(); trail.forEach((p, i) => i ? ctx.lineTo(v.X(p[0]), v.Y(p[1])) : ctx.moveTo(v.X(p[0]), v.Y(p[1]))); ctx.stroke();
      // đường kéo dài khâu 1 và cung góc
      ctx.save(); ctx.setLineDash([5, 4]); ctx.strokeStyle = '#9DA4AD'; ctx.lineWidth = 1.4; ctx.beginPath();
      ctx.moveTo(v.X(j[0]), v.Y(j[1])); ctx.lineTo(v.X(j[0] + 0.5 * Math.cos(a1)), v.Y(j[1] + 0.5 * Math.sin(a1))); ctx.stroke(); ctx.restore();
      ctx.strokeStyle = C.pos; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(v.X(0), v.Y(0), 34, -0, -a1, a1 > 0); ctx.stroke();
      ctx.beginPath(); ctx.arc(v.X(j[0]), v.Y(j[1]), 30, -a1, -(a1 + a2), a2 > 0); ctx.stroke();
      ctx.fillStyle = C.pos; ctx.font = '700 13px "Be Vietnam Pro", sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('θ₁', v.X(0) + 48 * Math.cos(-a1 / 2), v.Y(0) + 48 * Math.sin(-a1 / 2));
      ctx.fillText('θ₂', v.X(j[0]) + 44 * Math.cos(-(a1 + a2 / 2)), v.Y(j[1]) + 44 * Math.sin(-(a1 + a2 / 2)));
      draw(ctx, v, pts);
      ctx.fillStyle = C.ink; ctx.font = '600 12.5px "Be Vietnam Pro", sans-serif'; ctx.textAlign = 'left';
      ctx.fillText(`(${num(e[0], 2)}; ${num(e[1], 2)})`, v.X(e[0]) + 10, v.Y(e[1]) - 10);
    }
  },
});
})();
