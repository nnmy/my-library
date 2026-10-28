/* =====================================================================
   Bioelectromagnetics: minh họa "Độ phân giải của mô hình voxel" (id: voxel-slice, trang 7-mo-hinh-voxel.html)
   Nhúng vào trang: <div class="demo" id="demoVoxel" data-demo="voxel-slice"></div> + lib/bem.js
   Chạy độc lập:    lib/demos/run.html?demo=voxel-slice
   Cần: lib/demos/gabriel-data.js (σ, εᵣ của mô theo tần số)
   Cơ thể SƠ ĐỒ tự dựng (không phải mô hình giải phẫu thật): lát cắt đứng dọc, nhìn từ phía trước,
   ghép từ elip, hộp bo góc và đoạn thẳng có bán kính (hàm khoảng cách có dấu, đơn vị mm).
   Mỗi voxel lấy nhãn của điểm ở TÂM voxel (cách đơn giản nhất; mô hình thật thường lấy nhãn chiếm đa số).
   ===================================================================== */
(() => {
const { COLORS: C, fmt, num, range, watchCanvas } = BEM;

/* nhãn 0 = không khí; các nhãn khác tra bảng Gabriel bằng khóa k */
const TIS = [
  { vi: 'Không khí', col: C.paper },
  { k: 'skind', col: '#e3a982' },
  { k: 'fat', col: '#f3d77a' },
  { k: 'muscle', col: '#c0514a' },
  { k: 'bone', col: '#f6f2e9' },
  { k: 'csf', col: '#7bcde8' },
  { k: 'grey', col: '#9b8fb0' },
  { k: 'white', col: '#e2dcec' },
  { k: 'lung', col: '#f2c4c8' },
  { k: 'heart', col: '#8b1d16' },
  { k: 'liver', col: '#6e3a2c' },
];
const HS = [1, 1.5, 2, 3, 4, 6, 8, 12, 16];           // các kích thước voxel (mm)
const X0 = -320, BW = 640, BH = 1750;                 // khung chứa cơ thể (mm)
const BODY_VOL = 0.065;                                // thể tích cơ thể ~65 lít, để ước tính số voxel 3D
const ZOOM_MIN = 200;                                  // vùng phóng to luôn thấy ít nhất 200 × 200 mm
const PRESETS = [
  { n: 'Đầu (da, xương sọ, dịch não tủy, não)', x: 0, y: 118 },
  { n: 'Ngực (phổi, tim)', x: 0, y: 500 },
  { n: 'Cẳng tay và bàn tay', x: 270, y: 820 },
  { n: 'Đầu gối', x: 90, y: 1270 },
];

/* ---------- hình học (mm) ---------- */
const sdE = (x, y, cx, cy, rx, ry) => (Math.hypot((x - cx) / rx, (y - cy) / ry) - 1) * Math.min(rx, ry);
function sdSeg(x, y, ax, ay, bx, by, r) {
  const px = x - ax, py = y - ay, vx = bx - ax, vy = by - ay;
  const t = Math.max(0, Math.min(1, (px * vx + py * vy) / (vx * vx + vy * vy)));
  return Math.hypot(px - vx * t, py - vy * t) - r;
}
function sdBox(x, y, cx, cy, hx, hy, r) {
  const qx = Math.abs(x - cx) - hx + r, qy = Math.abs(y - cy) - hy + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}
function label(x, y) {
  const ax = Math.abs(x);
  const dHead = sdE(x, y, 0, 118, 80, 112);
  const dNeck = sdSeg(x, y, 0, 200, 0, 300, 52);
  const dTorso = sdBox(x, y, 0, 575, 170, 300, 80);
  const dArm = Math.min(sdSeg(ax, y, 200, 330, 262, 790, 42), sdSeg(ax, y, 262, 790, 285, 900, 30));
  const dLeg = Math.min(sdSeg(ax, y, 88, 850, 92, 1270, 74), sdSeg(ax, y, 92, 1270, 96, 1680, 50), sdSeg(ax, y, 96, 1690, 110, 1712, 36));
  const d = Math.min(dHead, dNeck, dTorso, dArm, dLeg);
  if (d > 0) return 0;
  const t = -d;
  if (t < 1.5) return 1;                               // da ~1,5 mm
  if (dHead < 0 && y < 232) {                          // đầu: da đầu, xương sọ, dịch não tủy, chất xám, chất trắng
    const th = -dHead;
    if (th < 6) return 2;
    if (th < 13) return 4;
    if (th < 16) return 5;
    if (sdE(ax, y, 13, 108, 7, 26) < 0) return 5;      // não thất
    if (th < 19.5) return 6;
    return 7;
  }
  const fatT = dTorso <= d + 1e-9 ? 14 : 7;            // mỡ dưới da: thân dày hơn tay chân
  if (t < 1.5 + fatT) return 2;
  if (dTorso < 0) {
    if (sdE(x, y, 18, 520, 58, 52) < 0) return 9;      // tim
    if (sdE(ax, y, 82, 455, 62, 125) < 0) return 8;    // phổi
    if (sdE(x, y, -55, 665, 105, 55) < 0) return 10;   // gan (bên phải người, tức bên trái hình)
  }
  if (Math.min(sdSeg(ax, y, 205, 345, 258, 775, 11), sdSeg(ax, y, 262, 800, 282, 880, 8),
               sdSeg(ax, y, 90, 865, 92, 1250, 15), sdSeg(ax, y, 92, 1290, 96, 1660, 12)) < 0) return 4;
  return 3;
}

/* ---------- chia voxel (có bộ nhớ đệm) ---------- */
const cache = new Map();
function voxelize(h) {
  if (cache.has(h)) return cache.get(h);
  const nx = Math.ceil(BW / h), ny = Math.ceil(BH / h), lab = new Uint8Array(nx * ny), cnt = new Array(TIS.length).fill(0);
  for (let j = 0; j < ny; j++) {
    const y = (j + 0.5) * h;
    for (let i = 0; i < nx; i++) { const l = label(X0 + (i + 0.5) * h, y); lab[j * nx + i] = l; cnt[l]++; }
  }
  /* hai chỉ số "liền mạch":
     skin: trong các voxel cơ thể giáp không khí, bao nhiêu phần là da (lớp da còn phủ kín không)
     csf : trong các voxel não giáp mô khác, bao nhiêu phần giáp dịch não tủy chứ không chạm thẳng xương/mỡ/da */
  let sb = 0, sk = 0, bb = 0, bc = 0;
  const brain = l => l === 6 || l === 7;
  for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const p = j * nx + i, l = lab[p]; if (!l) continue;
    const nb = [lab[p - 1], lab[p + 1], lab[p - nx], lab[p + nx]];
    if (nb.includes(0)) { sb++; if (l === 1) sk++; }
    if (brain(l) && nb.some(n => !brain(n))) { bb++; if (nb.every(n => brain(n) || n === 5)) bc++; }
  }
  const v = { h, nx, ny, lab, cnt, skin: sb ? sk / sb : 0, csf: bb ? bc / bb : 0 };
  cache.set(h, v);
  return v;
}

/* thang màu cho σ (log), cùng tông với các hình khác của trang */
const RAMP = ['#fff3c9', '#f2c230', '#d8312a', '#5a1410'];
const S_LO = -4, S_HI = 0.5;                            // log10 σ (S/m)
const hex = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
const RAMP_RGB = RAMP.map(hex);
function rampRGB(u) {
  u = Math.max(0, Math.min(1, u)) * (RAMP_RGB.length - 1);
  const i = Math.min(RAMP_RGB.length - 2, Math.floor(u)), f = u - i, a = RAMP_RGB[i], b = RAMP_RGB[i + 1];
  return a.map((v, k) => Math.round(v + (b[k] - v) * f));
}

BEM.demo('voxel-slice', {
  domId: 'demoVoxel',
  title: 'Độ phân giải của mô hình voxel',
  page: '7-mo-hinh-voxel.html',
  deps: ['gabriel-data'],
  html: `<div class="demo-title"><h4>Độ phân giải của mô hình voxel</h4><span>Cơ thể sơ đồ, lát cắt đứng dọc nhìn từ phía trước</span></div>
  <style>
    #demoVoxel .readout { grid-template-columns: minmax(0, 1fr) max-content; }
    #demoVoxel .readout dd { overflow-wrap: normal; white-space: nowrap; }
    #demoVoxel .vx-cap { margin: 0 0 4px; font-size: 13.5px; font-weight: 600; color: var(--muted); }
    #demoVoxel .vx-leg { margin: 0; padding: 0; list-style: none; display: grid; grid-template-columns: 1fr 1fr; gap: 0 14px; font-size: 13.5px; }
    #demoVoxel .vx-leg li { display: flex; align-items: center; gap: 6px; padding: 3px 0; border-bottom: 1px solid var(--line); min-width: 0; }
    #demoVoxel .vx-leg .t { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    #demoVoxel .vx-leg .n { font-family: var(--mono); white-space: nowrap; }
    #demoVoxel .vx-sw { flex: none; width: 12px; height: 12px; border: 1px solid var(--ink); }
    #demoVoxel .vx-ramp { height: 10px; border: 1px solid var(--ink); background: linear-gradient(90deg, ${RAMP.join(', ')}); }
    #demoVoxel .vx-rampl { display: flex; justify-content: space-between; font-size: 12.5px; color: var(--muted); }
  </style>
  <div class="demo-body">
    <div class="stagebox"><canvas id="cvVox" class="ar" role="img" aria-label="Bên trái: toàn thân cơ thể sơ đồ chia thành voxel. Bên phải: vùng phóng to cho thấy từng voxel và các lớp mô mỏng."></canvas></div>
    <div class="panel">
      <div class="ctrl"><label for="vxH">Kích thước voxel</label><output for="vxH"></output><input type="range" id="vxH" min="0" max="${HS.length - 1}" step="1" value="2"></div>
      <div class="ctrl"><label for="vxZ">Vùng phóng to</label><select id="vxZ">${PRESETS.map((p, i) => `<option value="${i}">${p.n}</option>`).join('')}</select></div>
      <div class="btnrow" role="group" aria-label="Tô màu theo">
        <button type="button" class="btn" id="vxMT" aria-pressed="true">Tô theo loại mô</button>
        <button type="button" class="btn" id="vxMS" aria-pressed="false">Tô theo σ</button>
      </div>
      <div class="ctrl"><label for="vxF">Tần số f</label><output for="vxF"></output><input type="range" id="vxF" min="1" max="10" step="0.01" value="8.95"></div>
      <dl class="readout" aria-live="polite">
        <dt>Voxel trong lát cắt</dt><dd id="vxN">—</dd>
        <dt>Voxel cả cơ thể (3D)</dt><dd class="big" id="vxN3">—</dd>
        <dt>Bước sóng λ trong cơ</dt><dd id="vxL">—</dd>
        <dt>FDTD cần voxel ≤ λ/10</dt><dd id="vxLok">—</dd>
        <dt>Da phủ bề mặt cơ thể</dt><dd class="big" id="vxSk">—</dd>
        <dt>Não được dịch não tủy bao bọc</dt><dd class="big" id="vxCs">—</dd>
        <dt>Mô tại con trỏ</dt><dd id="vxP">—</dd>
        <dt>σ; εᵣ của mô đó</dt><dd id="vxPS">—</dd>
      </dl>
      <div id="vxKey"></div>
      <p class="note-s">Mỗi voxel lấy nhãn của điểm ở tâm voxel. Hai chỉ số liền mạch xét các voxel ở mép cơ thể (có phải da không) và ở mép não (chỉ giáp dịch não tủy, hay chạm thẳng xương sọ). Số voxel 3D ước tính cho cơ thể 65 lít. σ, εᵣ theo mô hình Gabriel (tin cậy trên 1 MHz).</p>
    </div>
  </div>`,
  init() {
    const G = BEM.GABRIEL, cv = document.getElementById('cvVox'), st = {};
    const off = document.createElement('canvas'), octx = off.getContext('2d');
    TIS.forEach(t => { if (t.k) { t.vi = G.T[t.k].vi; t.en = G.T[t.k].en; } });
    let V = null, mode = 'tis', zx = PRESETS[0].x, zy = PRESETS[0].y, hover = null;
    const set = (id, v) => { document.getElementById(id).textContent = v; };

    const rH = range('vxH', { map: v => HS[v | 0], show: v => num(v, 3) + ' mm', onInput: () => rebuild() });
    const rF = range('vxF', { map: v => 10 ** v, show: v => fmt(v, 'Hz'), onInput: () => { if (mode === 'sig') paint(); info(); } });
    const bT = document.getElementById('vxMT'), bS = document.getElementById('vxMS'), selZ = document.getElementById('vxZ');
    const setMode = m => { mode = m; bT.setAttribute('aria-pressed', m === 'tis'); bS.setAttribute('aria-pressed', m === 'sig'); paint(); };
    bT.addEventListener('click', () => setMode('tis'));
    bS.addEventListener('click', () => setMode('sig'));
    selZ.addEventListener('change', () => { const p = PRESETS[+selZ.value]; zx = p.x; zy = p.y; hover = null; draw(); });

    /* tính chất của nhãn l ở tần số f */
    const prop = (l, f) => l ? G.eps(TIS[l].k, f) : null;

    function rebuild() {
      V = voxelize(rH.get());
      off.width = V.nx; off.height = V.ny;
      paint(); info();
    }
    /* tô ảnh voxel (mỗi voxel một pixel), rồi phóng to khi vẽ */
    function paint() {
      if (!V) return;
      const f = rF.get(), lut = TIS.map((t, l) => {
        if (mode === 'tis' || !l) return hex(t.col);
        return rampRGB((Math.log10(prop(l, f).sigma) - S_LO) / (S_HI - S_LO));
      });
      const img = octx.createImageData(V.nx, V.ny), d = img.data;
      for (let p = 0; p < V.lab.length; p++) { const c = lut[V.lab[p]]; d[4 * p] = c[0]; d[4 * p + 1] = c[1]; d[4 * p + 2] = c[2]; d[4 * p + 3] = 255; }
      octx.putImageData(img, 0, 0);
      key(); draw();
    }
    /* bảng chú giải: màu (hoặc σ) và diện tích so với lưới 1 mm */
    function key() {
      const f = rF.get();
      const rows = TIS.map((t, l) => {
        if (!l) return '';
        const sw = mode === 'tis' ? t.col : 'rgb(' + rampRGB((Math.log10(prop(l, f).sigma) - S_LO) / (S_HI - S_LO)).join(',') + ')';
        return `<li title="${t.vi}: σ = ${num(prop(l, f).sigma, 3)} S/m ở ${fmt(f, 'Hz')}"><span class="vx-sw" style="background:${sw}"></span><span class="t">${t.vi}</span>` +
          (mode === 'sig' ? `<span class="n">${num(prop(l, f).sigma, 2)}</span>` : '') + `</li>`;
      }).join('');
      const ramp = mode === 'sig' ? `<div class="vx-ramp" aria-hidden="true"></div><div class="vx-rampl"><span>σ = 10⁻⁴ S/m</span><span>thang log</span><span>3 S/m</span></div>` : '';
      document.getElementById('vxKey').innerHTML = ramp + `<p class="vx-cap">${mode === 'sig' ? 'Mô và σ (S/m) ở tần số đang chọn' : 'Các mô'}</p><ul class="vx-leg">${rows}</ul>`;
    }
    function info() {
      if (!V) return;
      const h = V.h, f = rF.get();
      set('vxN', (V.nx * V.ny - V.cnt[0]).toLocaleString('vi-VN'));
      set('vxN3', '≈ ' + sciCount(BODY_VOL / (h * 1e-3) ** 3));
      set('vxSk', Math.round(V.skin * 100) + ' %'); set('vxCs', Math.round(V.csf * 100) + ' %');
      const lam = G.wave('muscle', f).lambda;
      set('vxL', lam > 100 ? '> 100 m' : fmt(lam, 'm'));
      const hmax = lam / 10;
      set('vxLok', hmax > 1 ? 'không đáng kể' : fmt(hmax, 'm') + (h * 1e-3 <= hmax ? ' (đủ mịn)' : ' (quá thô)'));
      if (hover) {
        const l = V.lab[hover.j * V.nx + hover.i], t = TIS[l];
        set('vxP', t.vi);
        const e = prop(l, f);
        set('vxPS', e ? num(e.sigma, 3) + ' S/m; ' + num(e.re, 3) : '—');
      } else { set('vxP', '—'); set('vxPS', '—'); }
    }
    const sciCount = n => n >= 1e6 ? num(n / 1e6, 3) + ' triệu' : n >= 1e3 ? num(n / 1e3, 3) + ' nghìn' : num(n, 3);

    /* ---------- bố cục canvas ---------- */
    function layout() {
      const { W, H } = st, top = 26, pad = 10, gap = 18;
      const bh = H - top - pad, bw = Math.min(bh * BW / BH, W * 0.3), s = Math.min(bh / BH, bw / BW);
      const bx = pad + (bw - BW * s) / 2, by = top + (bh - BH * s) / 2;
      const zx0 = pad + bw + gap, zw = Math.max(40, W - zx0 - pad), zh = bh;
      const zs = Math.min(zw, zh) / ZOOM_MIN;               // px trên mm của vùng phóng to
      return { top, pad, s, bw, bh, bx, by, zx0, zw, zh, zs, ZW: zw / zs, ZH: zh / zs };
    }
    /* giữ vùng phóng to trong khung */
    function clampZoom(Lo) {
      const halfW = Math.min(Lo.ZW, BW) / 2, halfH = Math.min(Lo.ZH, BH) / 2;
      zx = Math.max(X0 + halfW, Math.min(X0 + BW - halfW, zx));
      zy = Math.max(halfH, Math.min(BH - halfH, zy));
    }
    function draw() {
      if (!st.ctx || !V) return;
      const { ctx, W, H } = st, Lo = layout(), h = V.h;
      clampZoom(Lo);
      ctx.clearRect(0, 0, W, H); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
      ctx.imageSmoothingEnabled = false;
      ctx.font = '600 13px "Be Vietnam Pro", system-ui, sans-serif'; ctx.fillStyle = C.ink; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
      ctx.fillText('Toàn thân', Lo.pad, 18);
      ctx.fillText(`Phóng to: ${Math.round(Lo.ZW)} × ${Math.round(Lo.ZH)} mm`, Lo.zx0, 18);
      // toàn thân
      ctx.fillStyle = C.paper; ctx.fillRect(Lo.pad, Lo.top, Lo.bw, Lo.bh);
      ctx.save(); ctx.beginPath(); ctx.rect(Lo.pad, Lo.top, Lo.bw, Lo.bh); ctx.clip();
      ctx.drawImage(off, Lo.bx, Lo.by, V.nx * h * Lo.s, V.ny * h * Lo.s);
      ctx.restore();
      ctx.strokeStyle = C.sea; ctx.lineWidth = 2;
      ctx.strokeRect(Lo.bx + (zx - Lo.ZW / 2 - X0) * Lo.s, Lo.by + (zy - Lo.ZH / 2) * Lo.s, Lo.ZW * Lo.s, Lo.ZH * Lo.s);
      ctx.strokeStyle = C.ink; ctx.lineWidth = 1; ctx.strokeRect(Lo.pad + 0.5, Lo.top + 0.5, Lo.bw - 1, Lo.bh - 1);
      // vùng phóng to: mm -> px
      const zs = Lo.zs, mx0 = zx - Lo.ZW / 2, my0 = zy - Lo.ZH / 2;
      const X = xm => Lo.zx0 + (xm - mx0) * zs, Y = ym => Lo.top + (ym - my0) * zs;
      ctx.fillStyle = C.paper; ctx.fillRect(Lo.zx0, Lo.top, Lo.zw, Lo.zh);
      ctx.save(); ctx.beginPath(); ctx.rect(Lo.zx0, Lo.top, Lo.zw, Lo.zh); ctx.clip();
      // chỉ lấy phần ảnh nguồn nằm trong khung (tránh lệch khi nguồn vượt biên)
      const i0 = Math.max(0, Math.floor((mx0 - X0) / h)), i1 = Math.min(V.nx, Math.ceil((mx0 + Lo.zw / zs - X0) / h));
      const j0 = Math.max(0, Math.floor(my0 / h)), j1 = Math.min(V.ny, Math.ceil((my0 + Lo.ZH) / h));
      if (i1 > i0 && j1 > j0) ctx.drawImage(off, i0, j0, i1 - i0, j1 - j0, X(X0 + i0 * h), Y(j0 * h), (i1 - i0) * h * zs, (j1 - j0) * h * zs);
      if (h * zs >= 7) {                                   // vẽ lưới khi mỗi voxel đủ lớn trên màn hình
        ctx.strokeStyle = 'rgba(27,25,32,.16)'; ctx.lineWidth = 1; ctx.beginPath();
        for (let i = i0; i <= i1; i++) { const x = Math.round(X(X0 + i * h)) + 0.5; ctx.moveTo(x, Lo.top); ctx.lineTo(x, Lo.top + Lo.zh); }
        for (let j = j0; j <= j1; j++) { const y = Math.round(Y(j * h)) + 0.5; ctx.moveTo(Lo.zx0, y); ctx.lineTo(Lo.zx0 + Lo.zw, y); }
        ctx.stroke();
      }
      if (hover) {
        ctx.strokeStyle = C.ink; ctx.lineWidth = 2;
        ctx.strokeRect(X(X0 + hover.i * h), Y(hover.j * h), Math.max(3, h * zs), Math.max(3, h * zs));
      }
      // thước tỉ lệ 2 cm
      const sb = 20 * zs, sx = Lo.zx0 + 12, sy = Lo.top + Lo.zh - 14;
      ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fillRect(sx - 6, sy - 20, sb + 12, 28);
      ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + sb, sy); ctx.stroke();
      ctx.fillStyle = C.ink; ctx.font = '600 12px "Be Vietnam Pro", system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('2 cm', sx + sb / 2, sy - 6);
      ctx.restore();
      ctx.strokeStyle = C.ink; ctx.lineWidth = 1; ctx.strokeRect(Lo.zx0 + 0.5, Lo.top + 0.5, Lo.zw - 1, Lo.zh - 1);
      st.Lo = Lo; st.map = { mx0, my0, zs };
    }

    /* ---------- con trỏ: bấm/kéo ở toàn thân để chọn vùng, di chuột để xem voxel ---------- */
    let dragging = false;
    function at(ev) {
      const r = cv.getBoundingClientRect(), px = ev.clientX - r.left, py = ev.clientY - r.top, Lo = st.Lo;
      if (!Lo) return null;
      if (px >= Lo.pad && px <= Lo.pad + Lo.bw && py >= Lo.top && py <= Lo.top + Lo.bh)
        return { pane: 'full', x: X0 + (px - Lo.bx) / Lo.s, y: (py - Lo.by) / Lo.s };
      if (px >= Lo.zx0 && px <= Lo.zx0 + Lo.zw && py >= Lo.top && py <= Lo.top + Lo.zh)
        return { pane: 'zoom', x: st.map.mx0 + (px - Lo.zx0) / st.map.zs, y: st.map.my0 + (py - Lo.top) / st.map.zs };
      return null;
    }
    function pick(p) {
      const i = Math.floor((p.x - X0) / V.h), j = Math.floor(p.y / V.h);
      hover = (i >= 0 && j >= 0 && i < V.nx && j < V.ny) ? { i, j } : null;
    }
    cv.addEventListener('pointerdown', ev => {
      const p = at(ev); if (!p) return;
      if (p.pane === 'full') { dragging = true; cv.setPointerCapture(ev.pointerId); zx = p.x; zy = p.y; }
      pick(p); info(); draw();
    });
    cv.addEventListener('pointermove', ev => {
      const p = at(ev);
      if (dragging && p && p.pane === 'full') { zx = p.x; zy = p.y; }
      if (p) pick(p);
      info(); draw();
    });
    const stop = () => { dragging = false; };
    cv.addEventListener('pointerup', stop); cv.addEventListener('pointercancel', stop);

    watchCanvas(cv, st, draw);
    rH.upd(); rF.upd(); rebuild();
  },
});
})();
