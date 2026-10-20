/* =====================================================================
   Robotics: minh họa "Không gian cấu hình của cánh tay" (id: cspace-arm, trang 4-tim-duong.html)
   Trái: cánh tay 2 khâu (L1 = 1 m, L2 = 0,8 m) và hai vật cản tròn kéo được.
   Phải: không gian cấu hình (θ1, θ2) ∈ [−180°, 180°]², lưới 120 × 120. Ô tô màu = tư thế đó đụng vật cản cùng màu.
   Bấm-kéo bên phải để chọn tư thế; cánh tay bên trái đổi theo (đỏ nếu đụng).
   Kiểm tra va chạm: khoảng cách từ tâm vật cản tới từng đoạn khâu < bán kính + nửa bề dày khâu.
   Chạy độc lập: lib/demos/run.html?demo=cspace-arm
   ===================================================================== */
(() => {
const { COLORS: C, watchCanvas, setTxt, num, xy } = TFG;
const L = [1, 0.8], N = 120, TH = 0.06, R = 2.1;
const OB_COL = [[216, 49, 42], [143, 99, 201]];
function segDist(px, py, ax, ay, bx, by) { const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy))); return Math.hypot(px - ax - t * dx, py - ay - t * dy); }
TFG.demo('cspace-arm', {
  deps: ['arm-common'],
  html: `<div class="demo-title"><h4>Không gian cấu hình của cánh tay</h4><span>Mỗi điểm bên phải là một tư thế của cánh tay bên trái</span></div>
    <div class="demo-body stack">
      <div class="stagebox"><canvas id="csCv" role="img" aria-label="Trái: cánh tay hai khâu với hai vật cản tròn. Phải: bản đồ không gian cấu hình theo hai góc khớp, vùng tô màu là các tư thế đụng vật cản."></canvas>
        <span class="hint">Trái: kéo vật cản tròn. Phải: bấm-kéo để chọn tư thế.</span></div>
      <div class="panel" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px 26px">
        <dl class="readout">
          <dt>θ₁, θ₂</dt><dd id="csTh" class="big">—</dd>
          <dt>Tình trạng</dt><dd id="csS" style="font-family:var(--body)">—</dd>
        </dl>
        <p class="note-s">Hai vật cản tròn trơn tru bên trái biến thành những mảng méo mó bên phải. Bản đồ bên phải cuộn vòng: mép trái nối mép phải, mép trên nối mép dưới, vì −180° và 180° là cùng một góc. Tìm đường cho cánh tay chính là tìm đường cho một <b>điểm</b> trên bản đồ bên phải, né mấy mảng màu.</p>
      </div>
    </div>`,
  init() {
    const { fk, draw: drawArm } = TFG.ARM;
    const cv = document.getElementById('csCv'), st = {};
    let obs = [{ x: 1.0, y: 0.9, r: 0.3 }, { x: -0.9, y: -0.6, r: 0.35 }], th = [0.3, 0.6], map = null, lay = null, mode = null, dragOb = -1;
    const collide = (t1, t2) => {
      const p = fk([t1, t2], L); const hit = [];
      obs.forEach((o, k) => { for (let i = 0; i < 2; i++) if (segDist(o.x, o.y, p[i][0], p[i][1], p[i + 1][0], p[i + 1][1]) < o.r + TH / 2) { hit.push(k); break; } });
      return hit;
    };
    function build() {
      map = new ImageData(N, N);
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const t1 = -Math.PI + (i + 0.5) / N * 2 * Math.PI, t2 = Math.PI - (j + 0.5) / N * 2 * Math.PI, h = collide(t1, t2), q = (j * N + i) * 4;
        const col = h.length ? OB_COL[h[0]] : [255, 255, 255];
        map.data[q] = col[0]; map.data[q + 1] = col[1]; map.data[q + 2] = col[2]; map.data[q + 3] = h.length ? 200 : 255;
      }
    }
    const off = document.createElement('canvas'); off.width = off.height = N;
    cv.addEventListener('pointerdown', e => {
      if (!lay) return; const [x, y] = xy(cv, e);
      if (x >= lay.cx && x <= lay.cx + lay.cs && y >= lay.cy && y <= lay.cy + lay.cs) { mode = 'pose'; setPose(x, y); }
      else { const w = lay.inv(x, y); dragOb = obs.findIndex(o => Math.hypot(o.x - w[0], o.y - w[1]) < o.r + 0.1); if (dragOb >= 0) mode = 'ob'; }
      if (mode) { cv.setPointerCapture(e.pointerId); e.preventDefault(); }
    });
    cv.addEventListener('pointermove', e => { if (!mode) return; const [x, y] = xy(cv, e);
      if (mode === 'pose') setPose(x, y); else { const w = lay.inv(x, y); obs[dragOb].x = Math.max(-R, Math.min(R, w[0])); obs[dragOb].y = Math.max(-R, Math.min(R, w[1])); build(); draw(); } });
    const up = () => { mode = null; }; cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    function setPose(x, y) { th = [-Math.PI + Math.max(0, Math.min(1, (x - lay.cx) / lay.cs)) * 2 * Math.PI, Math.PI - Math.max(0, Math.min(1, (y - lay.cy) / lay.cs)) * 2 * Math.PI]; draw(); }
    watchCanvas(cv, st, () => { const two = st.W < 620, need = two ? Math.round(st.W * 2 + 80) : Math.round(st.W / 2 + 50); if (Math.abs(st.H - need) > 1) { cv.style.height = need + 'px'; return; } draw(); });
    build(); draw();
    function draw() {
      const h = collide(th[0], th[1]);
      setTxt('csTh', Math.round(th[0] * 180 / Math.PI) + '°, ' + Math.round(th[1] * 180 / Math.PI) + '°');
      setTxt('csS', h.length ? 'Đụng vật cản!' : 'Hổng đụng gì');
      if (!st.ctx) return;
      const { ctx, W, H } = st; ctx.clearRect(0, 0, W, H);
      const two = W < 620, side = two ? Math.min(W - 40, (H - 60) / 2) : Math.min(W / 2 - 40, H - 50);
      const wx = two ? (W - side) / 2 : 20, wy = 28, cx = two ? (W - side) / 2 : W / 2 + 20, cy = two ? wy + side + 36 : 28;
      const s = side / (2 * R), X = x => wx + side / 2 + x * s, Y = y => wy + side / 2 - y * s;
      lay = { cx, cy, cs: side, inv: (px, py) => [(px - wx - side / 2) / s, (wy + side / 2 - py) / s] };
      ctx.font = '600 12.5px "Be Vietnam Pro", sans-serif'; ctx.fillStyle = C.ink; ctx.textAlign = 'left';
      ctx.fillText('Không gian làm việc (mét)', wx, wy - 10); ctx.fillText('Không gian cấu hình (θ₁, θ₂)', cx, cy - 10);
      ctx.fillStyle = '#fff'; ctx.fillRect(wx, wy, side, side); ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5; ctx.strokeRect(wx, wy, side, side);
      ctx.strokeStyle = C.line; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.arc(X(0), Y(0), (L[0] + L[1]) * s, 0, 7); ctx.stroke(); ctx.setLineDash([]);
      obs.forEach((o, k) => { ctx.fillStyle = `rgba(${OB_COL[k].join(',')},.75)`; ctx.beginPath(); ctx.arc(X(o.x), Y(o.y), o.r * s, 0, 7); ctx.fill(); ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5; ctx.stroke(); });
      const v = { s, X, Y };
      drawArm(ctx, v, fk(th, L), { colors: h.length ? [C.pos, '#F6A49F'] : undefined, width: 12 });
      // bản đồ C
      off.getContext('2d').putImageData(map, 0, 0);
      ctx.imageSmoothingEnabled = false; ctx.drawImage(off, cx, cy, side, side); ctx.imageSmoothingEnabled = true;
      ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5; ctx.strokeRect(cx, cy, side, side);
      ctx.fillStyle = C.muted; ctx.font = '11px "Be Vietnam Pro", sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('θ₁: −180° → 180°', cx + side / 2, cy + side + 14);
      ctx.save(); ctx.translate(cx - 8, cy + side / 2); ctx.rotate(-Math.PI / 2); ctx.fillText('θ₂: −180° → 180°', 0, 0); ctx.restore();
      const px = cx + (th[0] + Math.PI) / (2 * Math.PI) * side, py = cy + (Math.PI - th[1]) / (2 * Math.PI) * side;
      ctx.fillStyle = C.gold; ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(px, py, 7, 0, 7); ctx.fill(); ctx.stroke();
    }
  },
});
})();
