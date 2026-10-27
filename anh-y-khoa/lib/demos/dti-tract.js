/* =====================================================================
   Ảnh y khoa: minh họa "Theo dõi bó sợi" (id: dti-tract, trang 6-dti-tractography.html)
   Lát cắt ngang giả lập 64 × 64 voxel (2 mm, lưới vuông để hướng sợi không bị méo): một bó hình vòm, một bó thẳng cắt chéo qua vòm (~65°),
   một não thất (dịch, FA ≈ 0), nền chất xám gần đẳng hướng. Mỗi voxel trộn tensor của các thành phần
   theo tỉ lệ thể tích, cộng chút nhiễu. Tensor được nội suy song tuyến giữa các voxel.
   Ba cách theo dõi:
     - Tensor, tất định: đi theo e1 với bước 0,5 voxel, dừng khi FA < ngưỡng, rẽ gắt hơn ngưỡng góc, ra khỏi não.
     - Tensor, xác suất: như trên nhưng mỗi bước lệch ngẫu nhiên quanh e1, lệch nhiều khi tensor kém "dài";
       100 đường mỗi điểm gieo.
     - Nhiều sợi: giả định mô hình nhiều sợi (kiểu CSD) đã ước lượng đúng hướng từng bó trong voxel
       (ở đây lấy thẳng từ phantom), chọn hướng gần với hướng đang đi nhất.
   Hiển thị theo quy ước thần kinh: bên phải màn hình là bên phải bệnh nhân (R), phía trên là phía trước (A).
   ===================================================================== */
(() => {
const { COLORS: C, num, range, watchCanvas, setTxt, rng, pressGroup, xy } = LT;
const NX = 64, NY = 64, VOX = 2, H = 0.5, MAXN = 500;
const LP = 1.7, LN = 0.3;
const ARC = { cx: 0.5, cy: 0.16, R: 0.5, sd: 0.045 };
const LB = { x0: 0.17, y0: 0.06, x1: 0.63, y1: 0.96, sd: 0.04 };
const VEN = { cx: 0.66, cy: 0.36, rx: 0.07, ry: 0.12 };
const MASK = { cx: 0.5, cy: 0.5, rx: 0.47, ry: 0.47 };
const WHY = { fa: 'FA thấp', goc: 'rẽ quá gắt', ngoai: 'ra khỏi não', dai: 'quá dài', bo: 'hết bó sợi' };

// thành phần bó sợi tại (u, v) chuẩn hóa 0…1, v hướng lên (phía trước)
function bundles(u, v) {
  const ax = u - ARC.cx, ay = v - ARC.cy, r = Math.hypot(ax, ay) || 1e-9, dA = r - ARC.R, ang = Math.atan2(ay, ax);
  const wA = ang < 0.15 || ang > Math.PI - 0.15 ? 0 : Math.exp(-dA * dA / (2 * ARC.sd ** 2));
  const bx = LB.x1 - LB.x0, by = LB.y1 - LB.y0, L = Math.hypot(bx, by), tx = bx / L, ty = by / L;
  const px = u - LB.x0, py = v - LB.y0, s = px * tx + py * ty, dB = px * ty - py * tx;
  let wB = Math.exp(-dB * dB / (2 * LB.sd ** 2)); if (s < 0 || s > L) wB *= Math.exp(-((s < 0 ? s : s - L) ** 2) / (2 * 0.02 ** 2));
  return [{ w: wA, dx: -ay / r, dy: ax / r }, { w: wB, dx: tx, dy: ty }];
}
const inMask = (u, v) => ((u - MASK.cx) / MASK.rx) ** 2 + ((v - MASK.cy) / MASK.ry) ** 2 <= 1;
const csfW = (u, v) => { const e = ((u - VEN.cx) / VEN.rx) ** 2 + ((v - VEN.cy) / VEN.ry) ** 2; return 1 / (1 + Math.exp((e - 1) * 8)); };

function buildField() {
  const r = rng(11), D = new Float32Array(NX * NY * 4), M = new Uint8Array(NX * NY);
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    const u = (i + .5) / NX, v = (j + .5) / NY, k = j * NX + i;
    if (!inMask(u, v)) continue; M[k] = 1;
    const B = bundles(u, v); let ws = B[0].w + B[1].w; if (ws > 1) { B.forEach(b => b.w /= ws); ws = 1; }
    const th = r() * Math.PI, c = Math.cos(th), s = Math.sin(th), l1 = 0.86, l2 = 0.78;   // nền: chất xám
    let xx = (1 - ws) * (l1 * c * c + l2 * s * s), xy_ = (1 - ws) * (l1 - l2) * c * s, yy = (1 - ws) * (l1 * s * s + l2 * c * c), zz = (1 - ws) * 0.74;
    B.forEach(b => { xx += b.w * (LN + (LP - LN) * b.dx * b.dx); xy_ += b.w * (LP - LN) * b.dx * b.dy; yy += b.w * (LN + (LP - LN) * b.dy * b.dy); zz += b.w * LN; });
    const wc = csfW(u, v);
    xx = xx * (1 - wc) + 3 * wc; xy_ *= 1 - wc; yy = yy * (1 - wc) + 3 * wc; zz = zz * (1 - wc) + 3 * wc;
    const n = 0.025;
    D[k * 4] = xx + n * r.gauss(); D[k * 4 + 1] = xy_ + n * r.gauss(); D[k * 4 + 2] = yy + n * r.gauss(); D[k * 4 + 3] = zz + n * r.gauss();
  }
  return { D, M };
}
// trị riêng, vector riêng trong mặt phẳng; FA tính với cả thành phần trên–dưới zz
function eig(xx, xy_, yy, zz) {
  const tr = (xx + yy) / 2, dd = Math.sqrt(((xx - yy) / 2) ** 2 + xy_ * xy_), l1 = tr + dd, l2 = tr - dd;
  let ex = xy_, ey = l1 - xx; if (Math.abs(ex) + Math.abs(ey) < 1e-9) { ex = xx >= yy ? 1 : 0; ey = xx >= yy ? 0 : 1; }
  const n = Math.hypot(ex, ey), md = (l1 + l2 + zz) / 3;
  const num_ = (l1 - md) ** 2 + (l2 - md) ** 2 + (zz - md) ** 2, den = l1 * l1 + l2 * l2 + zz * zz;
  return { l1, l2, zz, ex: ex / n, ey: ey / n, fa: den > 0 ? Math.sqrt(1.5 * num_ / den) : 0, cl: l1 > 0 ? (l1 - l2) / (l1 + l2) : 0 };
}

LT.demo('dti-tract', {
  html: `<div class="demo-title"><h4>Theo dõi bó sợi</h4><span>Bấm lên lát cắt để gieo điểm, kéo điểm gieo để di chuyển</span></div>
  <div class="demo-body">
    <div class="stagebox">
      <canvas id="dtCv" class="ar tall" role="img" aria-label="Lát cắt ngang giả lập tô màu theo hướng khuếch tán, với các đường tractography đi ra từ những điểm gieo."></canvas>
      <span class="hint">Bấm để gieo (tối đa 4 điểm), kéo để dời</span>
    </div>
    <div class="panel">
      <div class="btnrow" role="group" aria-label="Cách theo dõi">
        <button class="btn" type="button" data-dt="det">Tensor, tất định</button><button class="btn" type="button" data-dt="prob">Tensor, xác suất</button><button class="btn" type="button" data-dt="multi">Nhiều sợi</button>
      </div>
      <div class="ctrl"><label for="dtFa">Ngưỡng FA để dừng</label><output for="dtFa"></output><input type="range" id="dtFa" min="0.05" max="0.5" step="0.01" value="0.2"></div>
      <div class="ctrl"><label for="dtAng">Góc rẽ tối đa mỗi bước</label><output for="dtAng"></output><input type="range" id="dtAng" min="5" max="80" step="1" value="45"></div>
      <div class="checks">
        <label><input type="checkbox" id="dtGly"> Hiện tensor từng voxel</label>
        <label><input type="checkbox" id="dtTruth"> Hiện bó sợi thật</label>
      </div>
      <div class="btnrow"><button class="btn" type="button" id="dtClear">Xóa điểm gieo</button><button class="btn" type="button" id="dtDef">Điểm gieo mặc định</button></div>
      <dl class="readout">
        <dt>FA tại điểm gieo</dt><dd id="dtSf">—</dd>
        <dt>Chiều dài đường</dt><dd id="dtLen" class="big">—</dd>
        <dt>Dừng vì</dt><dd id="dtWhy">—</dd>
      </dl>
      <p class="note-s" id="dtNote"></p>
    </div>
  </div>`,
  init(root) {
    const cv = root.querySelector('#dtCv'), st = {}, F = buildField();
    const DEF = [[0.22 * NX, 0.15 * NY], [0.12 * NX, 0.485 * NY]];
    let seeds = DEF.map(s => s.slice()), active = 0, mode = 'det', tracks = [], G = null;
    const rFa = range('dtFa', { show: v => num(v, 2), onInput: recompute }), rAng = range('dtAng', { show: v => v + '°', onInput: recompute });
    const bs = [...root.querySelectorAll('[data-dt]')];
    const NOTE = {
      det: 'Một điểm gieo cho đúng một đường. Đường gieo trên bó thẳng (dưới trái) tới chỗ giao với vòm thì quẹo theo vòm: tensor ở đó là hình đĩa, hướng chính nằm giữa hai bó. Bật “Hiện bó sợi thật” để so.',
      prob: 'Mỗi điểm gieo cho 100 đường, mỗi bước lệch ngẫu nhiên quanh hướng chính. Chỗ nhiều đường đi qua thì đậm. Kết quả cho biết độ chắc chắn, nhưng vẫn dùng một tensor mỗi voxel nên chỗ giao nhau vẫn bị lẫn.',
      multi: 'Giả định mô hình nhiều sợi đã tách đúng hai hướng trong voxel giao nhau, rồi chọn hướng gần với hướng đang đi nhất. Đường đi thẳng qua chỗ giao. Thực tế phải ước lượng các hướng này từ dữ liệu nhiều hướng gradient (HARDI), và cũng có sai số.',
    };
    bs.forEach(b => b.addEventListener('click', () => { mode = b.dataset.dt; pressGroup(bs, b); setTxt('dtNote', NOTE[mode]); recompute(); }));
    const gly = root.querySelector('#dtGly'), truth = root.querySelector('#dtTruth');
    gly.addEventListener('change', draw); truth.addEventListener('change', draw);
    root.querySelector('#dtClear').onclick = () => { seeds = []; recompute(); };
    root.querySelector('#dtDef').onclick = () => { seeds = DEF.map(s => s.slice()); active = 0; recompute(); };

    function sample(x, y) {
      const gx = x - .5, gy = y - .5, i = Math.floor(gx), j = Math.floor(gy), fx = gx - i, fy = gy - j, o = [0, 0, 0, 0];
      let ws = 0;
      for (const [di, dj, w] of [[0, 0, (1 - fx) * (1 - fy)], [1, 0, fx * (1 - fy)], [0, 1, (1 - fx) * fy], [1, 1, fx * fy]]) {
        const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= NX || jj >= NY) continue;
        const k = jj * NX + ii; if (!F.M[k]) continue;
        for (let c = 0; c < 4; c++) o[c] += w * F.D[k * 4 + c]; ws += w;
      }
      if (ws < 0.5) return null;
      return eig(o[0] / ws, o[1] / ws, o[2] / ws, o[3] / ws);
    }
    // một nửa đường, đi từ (sx, sy) theo hướng (dx, dy)
    function half(sx, sy, dx, dy, r) {
      const cosT = Math.cos(rAng.get() * Math.PI / 180), fa = rFa.get(), pts = [];
      let x = sx, y = sy, why = 'dai';
      for (let n = 0; n < MAXN; n++) {
        const e = sample(x, y); if (!e) { why = 'ngoai'; break; }
        if (e.fa < fa) { why = 'fa'; break; }
        let ex, ey;
        if (mode === 'multi') {
          const u = x / NX, v = y / NY, B = bundles(u, v).filter(b => b.w > 0.12 && csfW(u, v) < 0.5);
          if (!B.length) { why = 'bo'; break; }
          let best = null, bd = -2; B.forEach(b => { const d = Math.abs(b.dx * dx + b.dy * dy); if (d > bd) { bd = d; best = b; } });
          ex = best.dx; ey = best.dy;
        } else { ex = e.ex; ey = e.ey; }
        if (ex * dx + ey * dy < 0) { ex = -ex; ey = -ey; }
        if (r) { const a = r.gauss() * (0.06 + 0.5 * (1 - Math.min(1, e.cl / 0.7))), c = Math.cos(a), s = Math.sin(a); [ex, ey] = [ex * c - ey * s, ex * s + ey * c]; }
        if (n > 0 && ex * dx + ey * dy < cosT) { why = 'goc'; break; }
        dx = ex; dy = ey; x += H * dx; y += H * dy; pts.push([x, y]);
      }
      return { pts, why };
    }
    function trackFrom(sx, sy, r) {
      const e = sample(sx, sy); if (!e) return { pts: [[sx, sy]], why: ['ngoai', 'ngoai'], fa: 0 };
      let dx = e.ex, dy = e.ey;
      if (mode === 'multi') { const B = bundles(sx / NX, sy / NY); const b = B[0].w >= B[1].w ? B[0] : B[1]; if (b.w > 0.12) { dx = b.dx; dy = b.dy; } }
      const a = half(sx, sy, dx, dy, r), b = half(sx, sy, -dx, -dy, r);
      return { pts: [...b.pts.reverse(), [sx, sy], ...a.pts], why: [a.why, b.why], fa: e.fa };
    }
    function recompute() {
      tracks = seeds.map((s, k) => {
        if (mode === 'prob') { const r = rng(500 + k * 31); return { many: Array.from({ length: 100 }, () => trackFrom(s[0], s[1], r)), one: trackFrom(s[0], s[1], null) }; }
        return { one: trackFrom(s[0], s[1], null) };
      });
      draw();
    }

    // ảnh nền: bản đồ màu hướng (DEC), độ sáng theo FA
    const off = document.createElement('canvas'); off.width = NX; off.height = NY;
    (() => {
      const o = off.getContext('2d'), img = o.createImageData(NX, NY);
      for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
        const k = j * NX + i, p = ((NY - 1 - j) * NX + i) * 4; img.data[p + 3] = 255;
        if (!F.M[k]) continue;
        const e = eig(F.D[k * 4], F.D[k * 4 + 1], F.D[k * 4 + 2], F.D[k * 4 + 3]), b = Math.min(1, e.fa * 1.35) * 255;
        img.data[p] = Math.abs(e.ex) * b; img.data[p + 1] = Math.abs(e.ey) * b; img.data[p + 2] = 0.12 * b;
      }
      o.putImageData(img, 0, 0);
    })();

    // gieo và kéo
    let dragIdx = -1;
    const pickSeed = (x, y) => G ? seeds.findIndex(s => Math.hypot(G.X(s[0]) - x, G.Y(s[1]) - y) < 12) : -1;
    cv.addEventListener('pointerdown', e => {
      if (!G) return; const [x, y] = xy(cv, e); let k = pickSeed(x, y);
      if (k < 0) { const vx = G.ix(x), vy = G.iy(y); if (vx < 0 || vy < 0 || vx > NX || vy > NY) return; if (seeds.length >= 4) seeds.shift(); seeds.push([vx, vy]); k = seeds.length - 1; }
      active = k; dragIdx = k; cv.setPointerCapture(e.pointerId); cv.classList.add('grabbing'); recompute(); e.preventDefault();
    });
    cv.addEventListener('pointermove', e => {
      if (!G) return; const [x, y] = xy(cv, e);
      if (dragIdx < 0) { cv.classList.toggle('grab', pickSeed(x, y) >= 0); return; }
      seeds[dragIdx] = [Math.max(0.5, Math.min(NX - 0.5, G.ix(x))), Math.max(0.5, Math.min(NY - 0.5, G.iy(y)))]; recompute();
    });
    const up = () => { dragIdx = -1; cv.classList.remove('grabbing'); };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);

    watchCanvas(cv, st, () => draw());
    pressGroup(bs, bs[0]); setTxt('dtNote', NOTE.det);
    rFa.upd(); rAng.upd();

    function draw() {
      if (!st.ctx) return;
      const { ctx, W, H: Hc } = st, font = getComputedStyle(document.body).fontFamily;
      ctx.fillStyle = C.paper; ctx.fillRect(0, 0, W, Hc);
      const pad = 26, s = Math.min((W - 2 * pad) / NX, (Hc - 2 * pad) / NY), ox = (W - NX * s) / 2, oy = (Hc - NY * s) / 2;
      G = { X: x => ox + x * s, Y: y => oy + (NY - y) * s, ix: x => (x - ox) / s, iy: y => NY - (y - oy) / s };
      ctx.imageSmoothingEnabled = false; ctx.drawImage(off, ox, oy, NX * s, NY * s);
      ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.strokeRect(ox - 1, oy - 1, NX * s + 2, NY * s + 2);
      ctx.fillStyle = C.ink; ctx.font = '600 13px ' + font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('A', W / 2, oy - 13); ctx.fillText('P', W / 2, oy + NY * s + 13); ctx.fillText('L', ox - 13, oy + NY * s / 2); ctx.fillText('R', ox + NX * s + 13, oy + NY * s / 2);
      // tensor từng voxel (glyph)
      if (gly.checked) {
        ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 1;
        for (let j = 1; j < NY; j += 2) for (let i = 1; i < NX; i += 2) {
          const k = j * NX + i; if (!F.M[k]) continue;
          const e = eig(F.D[k * 4], F.D[k * 4 + 1], F.D[k * 4 + 2], F.D[k * 4 + 3]), sc = s * 0.95 / 3.0;
          ctx.beginPath(); ctx.ellipse(G.X(i + .5), G.Y(j + .5), Math.max(0.5, e.l1 * sc), Math.max(0.5, e.l2 * sc), -Math.atan2(e.ey, e.ex), 0, 7); ctx.stroke();
        }
      }
      // bó sợi thật
      if (truth.checked) {
        ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]);
        ctx.beginPath(); for (let a = 0.15; a <= Math.PI - 0.15; a += 0.02) { const u = ARC.cx + ARC.R * Math.cos(a), v = ARC.cy + ARC.R * Math.sin(a); if (!inMask(u, v)) continue; ctx.lineTo(G.X(u * NX), G.Y(v * NY)); } ctx.stroke();
        ctx.beginPath(); ctx.moveTo(G.X(LB.x0 * NX), G.Y(LB.y0 * NY)); ctx.lineTo(G.X(LB.x1 * NX), G.Y(LB.y1 * NY)); ctx.stroke();
        ctx.setLineDash([]);
      }
      // đường
      const poly = (pts, col, w) => { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineJoin = 'round'; ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(G.X(x), G.Y(y)) : ctx.moveTo(G.X(x), G.Y(y))); ctx.stroke(); };
      tracks.forEach(t => {
        if (t.many) { ctx.globalAlpha = 0.12; t.many.forEach(m => poly(m.pts, C.gold, 2)); ctx.globalAlpha = 1; }
        else { poly(t.one.pts, C.ink, 5); poly(t.one.pts, C.gold, 2.6); }
      });
      seeds.forEach((sd, k) => { ctx.fillStyle = k === active ? C.gold : '#fff'; ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(G.X(sd[0]), G.Y(sd[1]), 6, 0, 7); ctx.fill(); ctx.stroke(); });
      // số liệu của điểm gieo đang chọn
      const t = tracks[active];
      if (!t) { setTxt('dtSf', '—'); setTxt('dtLen', '—'); setTxt('dtWhy', '—'); return; }
      setTxt('dtSf', num(t.one.fa, 2));
      if (t.many) {
        const L = t.many.map(m => (m.pts.length - 1) * H * VOX).sort((a, b) => a - b);
        setTxt('dtLen', 'trung vị ' + Math.round(L[50]) + ' mm');
        const c = {}; t.many.forEach(m => m.why.forEach(w => { c[w] = (c[w] || 0) + 1; }));
        const top = Object.entries(c).sort((a, b) => b[1] - a[1])[0];
        setTxt('dtWhy', 'hay gặp nhất: ' + WHY[top[0]]);
      } else {
        setTxt('dtLen', Math.round((t.one.pts.length - 1) * H * VOX) + ' mm');
        setTxt('dtWhy', [...new Set(t.one.why)].map(w => WHY[w]).join(' / '));
      }
    }
  },
});
})();
