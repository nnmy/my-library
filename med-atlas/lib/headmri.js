/* =====================================================================
   MRI đầu: mô và độ dẫn điện (head-mri.html). Không dùng thư viện hay dịch vụ ngoài.
   Bốn ảnh cùng một lát, cùng lưới voxel: T1 | T2 | phân vùng mô | độ dẫn điện (σ, 10 kHz).
   Dữ liệu trong lib/data/head-mri/ (x nhanh nhất, RAS, 1 mm), tạo bằng tools/prepare_head_mri.py:
     meta.json      kích thước, gốc tọa độ, cửa sổ hiển thị, thống kê từng mô
     tissues.json   tên, màu, vị trí, đặc điểm trên MRI, độ dẫn điện của từng mô (SỬA NỘI DUNG Ở ĐÂY)
     t1/t2/seg.u8.gz, cond.u16.gz (σ × cond_scale)
   Cách dùng trên trang:  HEADMRI.start({ data: 'lib/data/head-mri/', printHeader, printTitle, printFile })
   Trang tự tính khối ảnh (head-seg.html): HEADMRI.show({ mods: ['t1', 't2', 'seg'], organ, ... }, { meta, T, vol })
     meta: dims, origin_mm, window {t1, t2}, tissues {nhãn: {voxels}}; T: nội dung tissues.json; vol: Uint8Array mỗi ảnh.
     Không có ảnh 'cond' thì mọi chỗ ghi độ dẫn điện (σ) được ẩn.

   Thao tác:
     rê chuột    chữ thập cùng vị trí trên cả bốn ảnh, mỗi ảnh ghi giá trị của nó tại điểm đó
     nhấp        khóa vị trí (nhãn có ổ khóa); nhấp lần nữa, bấm vào nhãn ổ khóa hoặc Esc để mở khóa
     bấm tên mô  (bảng Các mô, hoặc ô Tìm mô) nhảy tới lát chứa nhiều mô đó nhất, viền mô màu hồng
                 trên cả bốn ảnh, và dải "mật độ" cho biết những lát nào có mô đó (bấm dải để nhảy lát)

   Mục lục file:
     1. tiện ích, trạng thái
     2. hình học lát cắt (ax / cor / sag, quy ước thần kinh: bên phải người bệnh ở bên phải màn hình)
     3. dựng ảnh lát cắt, bảng màu
     4. vẽ, con trỏ, khóa, bàn phím
     5. mô được chọn: dải mật độ theo lát
     6. khung thông tin + bảng Các mô
     7. danh sách ghim (IndexedDB, organ theo cfg.organ, mặc định 'head-mri') và xuất PDF
   ===================================================================== */
const HEADMRI = (() => {
'use strict';

/* ---------------- 1. tiện ích ---------------- */
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sgn = v => (v < 0 ? '−' + Math.abs(v) : String(v));          // dấu trừ chuẩn
const num = (v, d) => v.toFixed(d).replace('.', ',');                 // số thập phân kiểu Việt
const AXN = ['x', 'y', 'z'];
let MODS = ['t1', 't2', 'seg', 'cond'];             // các ảnh đang hiện (cfg.mods)
const HL = [236, 72, 153];          // màu viền mô được chọn (hồng)
const SCALES = { full: 2.0, low: 0.5 };                               // thang màu σ (S/m)

async function fetchBytes(url, onBytes) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Không tải được ' + url + ' (HTTP ' + res.status + ')');
  if (!res.body || !res.body.getReader) { const b = new Uint8Array(await res.arrayBuffer()); onBytes(b.length); return b; }
  const rd = res.body.getReader(), parts = []; let n = 0;
  for (;;) { const { done, value } = await rd.read(); if (done) break; parts.push(value); n += value.length; onBytes(value.length); }
  const out = new Uint8Array(n); let o = 0; parts.forEach(p => { out.set(p, o); o += p.length; });
  return out;
}
/* Giải nén nếu còn ở dạng gzip (2 byte đầu 1F 8B); một số server đã tự giải nén trước. */
async function gunzipIfNeeded(b) {
  if (b[0] !== 0x1f || b[1] !== 0x8b) return b;
  if (!('DecompressionStream' in window)) throw new Error('Trình duyệt quá cũ: thiếu DecompressionStream để giải nén dữ liệu.');
  const st = new Blob([b]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(st).arrayBuffer());
}

const S = {
  cfg: null, meta: null, T: null, dims: null, X: 0, Y: 0, Z: 0, MAXD: 1,
  vol: {},            // t1, t2, seg: Uint8Array; cond: Uint16Array
  lut: {}, colors: [],
  orient: 'ax', slice: { ax: 0, cor: 0, sag: 0 },
  scale: 'full',
  cur: null,          // voxel đang trỏ
  lock: null,         // voxel đã khóa
  hl: null,           // số nhãn của mô được chọn (viền hồng + dải mật độ), hoặc null
  counts: {},         // hướng cắt -> Uint32Array(16 * số lát): số voxel của mỗi mô trên mỗi lát
  sl: null, films: [], lockHover: null, infoMin: false,
};
const idx = (x, y, z) => x + S.X * (y + S.Y * z);
const mm = p => [0, 1, 2].map(a => Math.round(S.meta.origin_mm[a] + p[a]));
const condAt = i => S.vol.cond[i] / S.meta.cond_scale;
const hasCond = () => !!S.vol.cond;
const organ = () => S.cfg.organ || 'head-mri';
const compact = () => !!S.cfg.compact;              // gọn (head-seg.html): không ghi số nhãn, mục trên cùng dòng, bảng chỉ tên tiếng Anh
const tissue = l => (l && S.T.tissues[l]) || null;
const stat = l => S.meta.tissues[l] || {};

/* ---------------- 2. hình học lát cắt ----------------
   ax  (z cố định): cột u theo x, hàng v theo y (trước ở trên)
   cor (y cố định): cột u theo x, hàng v theo z (trên ở trên)
   sag (x cố định): cột u theo y (trước ở bên trái), hàng v theo z */
const OR = {
  ax: { axis: 2, name: 'Axial', vi: 'ngang', W: () => S.X, H: () => S.Y,
        toV: (u, v, s) => [u, S.Y - 1 - v, s], toUV: p => [p[0], S.Y - 1 - p[1]], edge: ['L', 'R', 'A', 'P'] },
  cor: { axis: 1, name: 'Coronal', vi: 'đứng ngang', W: () => S.X, H: () => S.Z,
        toV: (u, v, s) => [u, s, S.Z - 1 - v], toUV: p => [p[0], S.Z - 1 - p[2]], edge: ['L', 'R', 'S', 'I'] },
  sag: { axis: 0, name: 'Sagittal', vi: 'đứng dọc', W: () => S.Y, H: () => S.Z,
        toV: (u, v, s) => [s, S.Y - 1 - u, S.Z - 1 - v], toUV: p => [S.Y - 1 - p[1], S.Z - 1 - p[2]], edge: ['A', 'P', 'S', 'I'] },
};
/* chữ ở mép ảnh: [trái, phải, trên, dưới]; R/L phải/trái người bệnh, A/P trước/sau, S/I trên/dưới */

/* ---------------- 3. dựng ảnh lát cắt ---------------- */
const canvasOf = (W, H) => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
/* bảng màu jet: t trong [0, 1] -> [r, g, b] */
const jet = t => [4 * t - 3, 4 * t - 2, 4 * t - 1].map(c => Math.round(255 * Math.max(0, Math.min(1, 1.5 - Math.abs(c)))));
const JET = Array.from({ length: 256 }, (_, i) => jet(i / 255));
const jetCss = t => 'rgb(' + jet(t).join(',') + ')';

/* bốn ảnh của lát s theo hướng o: { W, H, lab, cv: { t1, t2, seg, cond } } */
function buildSlice(o, s) {
  const D = OR[o], W = D.W(), H = D.H(), n = W * H, src = new Int32Array(n), lab = new Uint8Array(n);
  for (let v = 0; v < H; v++) for (let u = 0; u < W; u++) { const p = D.toV(u, v, s); src[u + W * v] = idx(p[0], p[1], p[2]); }
  const seg = S.vol.seg, cond = S.vol.cond, top = cond ? SCALES[S.scale] * S.meta.cond_scale : 1, cv = {};
  for (let i = 0; i < n; i++) lab[i] = seg[src[i]];
  for (const m of MODS) {
    const im = new ImageData(W, H), d = im.data;
    for (let i = 0; i < n; i++) {
      const j = src[i], k = 4 * i; let r, g, b;
      if (m === 'seg') { const c = S.colors[lab[i]]; if (c) [r, g, b] = c; else r = g = b = 0; }
      else if (m === 'cond') {
        if (!lab[i] && !cond[j]) r = g = b = 0;                    // ngoài đầu, khoang khí: nền đen
        else [r, g, b] = JET[Math.min(255, Math.round(cond[j] / top * 255))];
      } else r = g = b = S.lut[m][S.vol[m][j]];
      d[k] = r; d[k + 1] = g; d[k + 2] = b; d[k + 3] = 255;
    }
    const c = canvasOf(W, H); c.getContext('2d').putImageData(im, 0, 0); cv[m] = c;
  }
  return { o, s, W, H, lab, cv };
}
/* viền 1 voxel của mô l trong lát (màu HL), vẽ chồng lên cả bốn ảnh */
function edgeCanvas(sl, l) {
  const { W, H, lab } = sl, im = new ImageData(W, H), d = im.data;
  for (let v = 0; v < H; v++) for (let u = 0; u < W; u++) {
    const i = u + W * v; if (lab[i] !== l) continue;
    if (u === 0 || v === 0 || u === W - 1 || v === H - 1 || lab[i - 1] !== l || lab[i + 1] !== l || lab[i - W] !== l || lab[i + W] !== l) {
      d[4 * i] = HL[0]; d[4 * i + 1] = HL[1]; d[4 * i + 2] = HL[2]; d[4 * i + 3] = 255;
    }
  }
  const c = canvasOf(W, H); c.getContext('2d').putImageData(im, 0, 0); return c;
}
function refresh(full) {
  const s = S.slice[S.orient];
  if (full || !S.sl || S.sl.o !== S.orient || S.sl.s !== s) { S.sl = buildSlice(S.orient, s); S.sl.edgeOf = null; }
  if (S.hl && S.sl.edgeOf !== S.hl) { S.sl.edge = edgeCanvas(S.sl, S.hl); S.sl.edgeOf = S.hl; }
  drawAll(); readout(); renderStrip();
}

/* ---------------- 4. vẽ, con trỏ, khóa ---------------- */
function geom(f) {
  const W = S.sl.W, H = S.sl.H, cw = f.cv.width, ch = f.cv.height;
  const sc = Math.min(cw, ch) / S.MAXD;                             // cùng tỉ lệ mm/pixel cho mọi hướng cắt
  return { sc, ox: (cw - W * sc) / 2, oy: (ch - H * sc) / 2, W, H };
}
/* chữ cạnh giao điểm chữ thập: giá trị của từng ảnh tại voxel p */
function valueText(m, p) {
  const i = idx(...p);
  if (m === 't1') return 'T1 ' + S.vol.t1[i];
  if (m === 't2') return 'T2 ' + S.vol.t2[i];
  if (m === 'seg') { const t = tissue(S.vol.seg[i]); return t ? t.en : 'Background'; }
  return 'σ ' + num(condAt(i), 3) + ' S/m';
}
function drawFilm(f) {
  const ctx = f.ctx, g = geom(f), dpr = window.devicePixelRatio || 1, cw = f.cv.width, ch = f.cv.height;
  f.lockRect = null;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, cw, ch);
  ctx.imageSmoothingEnabled = f.mod === 't1' || f.mod === 't2'; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(S.sl.cv[f.mod], g.ox, g.oy, g.W * g.sc, g.H * g.sc);
  ctx.imageSmoothingEnabled = false;
  if (S.hl && S.sl.edge) ctx.drawImage(S.sl.edge, g.ox, g.oy, g.W * g.sc, g.H * g.sc);
  const e = OR[S.orient].edge, fs = Math.max(11, Math.round(12 * dpr));
  ctx.font = `600 ${fs}px "Be Vietnam Pro", system-ui, sans-serif`; ctx.fillStyle = 'rgba(220,227,234,.85)'; ctx.textBaseline = 'middle';
  ctx.textAlign = 'left'; ctx.fillText(e[0], 6 * dpr, ch / 2);
  ctx.textAlign = 'right'; ctx.fillText(e[1], cw - 6 * dpr, ch / 2);
  ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(e[2], cw / 2, 5 * dpr);
  if (f.mod !== 'cond') { ctx.textBaseline = 'bottom'; ctx.fillText(e[3], cw / 2, ch - 5 * dpr); }
  else colorBar(ctx, cw, ch, dpr);
  // đường chữ thập: nét liền trên lát chứa điểm; nét đứt khi điểm khóa nằm ở lát khác
  const p = S.lock || S.cur; if (!p) return;
  const D = OR[S.orient], [u, v] = D.toUV(p), off = p[D.axis] !== S.slice[S.orient];
  const X = g.ox + (u + 0.5) * g.sc, Y = g.oy + (v + 0.5) * g.sc, gap = 6 * dpr;
  ctx.save();
  ctx.strokeStyle = S.lock ? '#f2c230' : 'rgba(255,255,255,.75)'; ctx.lineWidth = Math.max(1, dpr);
  if (off) ctx.setLineDash([4 * dpr, 4 * dpr]);
  ctx.beginPath();
  ctx.moveTo(g.ox, Y); ctx.lineTo(X - gap, Y); ctx.moveTo(X + gap, Y); ctx.lineTo(g.ox + g.W * g.sc, Y);
  ctx.moveTo(X, g.oy); ctx.lineTo(X, Y - gap); ctx.moveTo(X, Y + gap); ctx.lineTo(X, g.oy + g.H * g.sc);
  ctx.stroke(); ctx.restore();
  if (off) return;
  // giá trị tại điểm; khi đang khóa, nhãn có icon ổ khóa và bấm vào để mở khóa
  const txt = valueText(f.mod, p);
  ctx.font = `600 ${Math.round(12 * dpr)}px ui-monospace, Menlo, Consolas, monospace`;
  const ic = S.lock ? 13 * dpr : 0, th = 20 * dpr, tw = ctx.measureText(txt).width + 10 * dpr + ic;
  let tx = X + 10 * dpr, ty = Y - 10 * dpr - th;
  if (tx + tw > cw - 4) tx = X - 10 * dpr - tw;
  if (ty < 4) ty = Y + 10 * dpr;
  ctx.fillStyle = 'rgba(27,25,32,.85)'; ctx.fillRect(tx, ty, tw, th);
  const fg = S.lock ? '#f2c230' : '#fff';
  if (S.lock) {
    ctx.strokeStyle = S.lockHover === f ? '#fff' : fg; ctx.lineWidth = 1; ctx.strokeRect(tx + 0.5, ty + 0.5, tw - 1, th - 1);
    const lx = tx + 5 * dpr, ly = ty + th / 2;                    // ổ khóa: thân + quai
    ctx.fillStyle = fg; ctx.fillRect(lx, ly - 1 * dpr, 9 * dpr, 6.5 * dpr);
    ctx.strokeStyle = fg; ctx.lineWidth = 1.6 * dpr; ctx.beginPath();
    ctx.moveTo(lx + 2 * dpr, ly - 1 * dpr); ctx.lineTo(lx + 2 * dpr, ly - 3.2 * dpr); ctx.arc(lx + 4.5 * dpr, ly - 3.2 * dpr, 2.5 * dpr, Math.PI, 0); ctx.lineTo(lx + 7 * dpr, ly - 1 * dpr); ctx.stroke();
    f.lockRect = [tx, ty, tw, th];
  }
  ctx.fillStyle = fg; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(txt, tx + 5 * dpr + ic, ty + th / 2 + 0.5);
}
/* thang màu σ ở đáy ảnh độ dẫn điện */
function colorBar(ctx, cw, ch, dpr) {
  const top = SCALES[S.scale], w = Math.min(cw * 0.5, 200 * dpr), h = 7 * dpr, x = cw - w - 10 * dpr, y = ch - h - 20 * dpr;
  const gr = ctx.createLinearGradient(x, 0, x + w, 0);
  for (let t = 0; t <= 1.0001; t += 0.125) gr.addColorStop(Math.min(1, t), jetCss(t));
  ctx.fillStyle = gr; ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(220,227,234,.7)'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  ctx.font = `600 ${Math.round(10.5 * dpr)}px ui-monospace, Menlo, Consolas, monospace`; ctx.fillStyle = 'rgba(220,227,234,.9)'; ctx.textBaseline = 'top';
  ctx.textAlign = 'left'; ctx.fillText('0', x, y + h + 2 * dpr);
  ctx.textAlign = 'center'; ctx.fillText(num(top / 2, top < 1 ? 2 : 0), x + w / 2, y + h + 2 * dpr);
  ctx.textAlign = 'right'; ctx.fillText('≥' + num(top, 1), x + w, y + h + 2 * dpr);
  ctx.textBaseline = 'middle'; ctx.fillText('S/m', x - 6 * dpr, y + h / 2);
}
function drawAll() { S.films.forEach(drawFilm); }

function voxelAt(f, clientX, clientY) {
  const r = f.cv.getBoundingClientRect(), dpr = f.cv.width / r.width, g = geom(f);
  const u = Math.floor(((clientX - r.left) * dpr - g.ox) / g.sc), v = Math.floor(((clientY - r.top) * dpr - g.oy) / g.sc);
  if (u < 0 || v < 0 || u >= g.W || v >= g.H) return null;
  return OR[S.orient].toV(u, v, S.slice[S.orient]);
}
function onLockTag(f, cx, cy) {
  if (!f.lockRect) return false;
  const r = f.cv.getBoundingClientRect(), dpr = f.cv.width / r.width, x = (cx - r.left) * dpr, y = (cy - r.top) * dpr, [tx, ty, tw, th] = f.lockRect;
  return x >= tx - 3 && x <= tx + tw + 3 && y >= ty - 3 && y <= ty + th + 3;
}
function screenOf(f, p) {
  const r = f.cv.getBoundingClientRect(), dpr = f.cv.width / r.width, g = geom(f), [u, v] = OR[S.orient].toUV(p);
  return [r.left + (g.ox + (u + 0.5) * g.sc) / dpr, r.top + (g.oy + (v + 0.5) * g.sc) / dpr];
}

const tip = () => $('hmTip');
function showTip(l, x, y) {
  const t = tissue(l);
  showTipHtml(t ? `<b><i style="background:${t.color}"></i>${esc(t.en)}</b><small>${esc(t.vi)}</small>` : '<b>Background</b><small>Nền: không khí, ngoài đầu</small>', x, y);
}
function showTipHtml(html, x, y) {
  const t = tip();
  t.innerHTML = html; t.hidden = false;
  const w = t.offsetWidth, h = t.offsetHeight;
  let tx = x + 16, ty = y + 18;
  if (tx + w > window.innerWidth - 8) tx = x - 16 - w;
  if (ty + h > window.innerHeight - 8) ty = y - 18 - h;
  t.style.left = tx + 'px'; t.style.top = ty + 'px';
}
function setCur(p) { S.cur = p; drawAll(); readout(); }
function setLock(p) { S.lock = p ? p.slice() : null; drawAll(); readout(); renderInfo(); }
function setSlice(v) {
  const D = OR[S.orient], max = S.dims[D.axis] - 1;
  S.slice[S.orient] = Math.max(0, Math.min(max, Math.round(v)));
  $('hmSlice').value = S.slice[S.orient]; sliceLabel();
  if (S.cur) S.cur[D.axis] = S.slice[S.orient];
  refresh();
}
function sliceLabel() {
  const a = OR[S.orient].axis, s = S.slice[S.orient];
  $('hmSliceOut').textContent = `${AXN[a]} = ${sgn(Math.round(S.meta.origin_mm[a] + s))} mm`;
}
function setOrient(o) {
  S.orient = o;
  const D = OR[o], p = S.lock || S.cur;
  if (p) S.slice[o] = p[D.axis];
  else if (S.hl) S.slice[o] = bestSlice(S.hl, o);
  const sl = $('hmSlice'); sl.max = S.dims[D.axis] - 1; sl.value = S.slice[o];
  document.querySelectorAll('[data-orient]').forEach(b => b.setAttribute('aria-pressed', b.dataset.orient === o));
  sliceLabel(); refresh(true);
}
function readout() {
  const el = $('hmReadout'), p = S.lock || S.cur;
  if (!p) { el.innerHTML = '<span class="q">Rê chuột lên ảnh để đọc giá trị; nhấp để khóa vị trí.</span>'; return; }
  const i = idx(...p), l = S.vol.seg[i], t = tissue(l);
  el.innerHTML = [
    `<span>${S.lock ? '<span class="q">Đã khóa</span> ' : ''}<b>${mm(p).map(sgn).join(', ')}</b> mm</span>`,
    `<span>T1 <b>${S.vol.t1[i]}</b></span>`, `<span>T2 <b>${S.vol.t2[i]}</b></span>`,
    `<span><i class="hm-sw" style="background:${t ? t.color : '#000'}"></i><b>${esc(t ? t.en : 'Background')}</b></span>`,
    hasCond() ? `<span>σ <b>${num(condAt(i), 3)}</b> S/m${t ? ` <span class="q">(tham chiếu ${fmtS(stat(l).ref)})</span>` : ''}</span>` : '',
  ].join('');
}

function bindFilm(f) {
  const cv = f.cv;
  cv.addEventListener('pointermove', e => {
    if (e.pointerType === 'touch') return;
    const onTag = onLockTag(f, e.clientX, e.clientY);
    if (onTag !== (S.lockHover === f)) { S.lockHover = onTag ? f : null; cv.style.cursor = onTag ? 'pointer' : ''; drawFilm(f); }
    if (onTag) { showTipHtml('<b>Bấm để mở khóa</b>', e.clientX, e.clientY); return; }
    const p = voxelAt(f, e.clientX, e.clientY);
    if (!p) { tip().hidden = true; if (S.cur) setCur(null); return; }
    setCur(p); showTip(S.vol.seg[idx(...p)], e.clientX, e.clientY);
  });
  cv.addEventListener('pointerleave', () => { tip().hidden = true; S.lockHover = null; cv.style.cursor = ''; setCur(null); });
  cv.addEventListener('click', e => {
    if (onLockTag(f, e.clientX, e.clientY)) { S.lockHover = null; cv.style.cursor = ''; setLock(null); tip().hidden = true; return; }
    const p = voxelAt(f, e.clientX, e.clientY); if (!p) return;
    // đang khóa trên lát này: nhấp lần nữa để mở khóa
    if (S.lock && e.pointerType !== 'touch' && S.lock[OR[S.orient].axis] === S.slice[S.orient]) { S.cur = p; setLock(null); return; }
    S.cur = p.slice(); setLock(p);
    showTip(S.vol.seg[idx(...p)], e.clientX, e.clientY);
    if (e.pointerType === 'touch' || e.detail === 0) { clearTimeout(f.tt); f.tt = setTimeout(() => { tip().hidden = true; }, 1800); }
  });
  let acc = 0;
  cv.addEventListener('wheel', e => {
    e.preventDefault();
    acc += e.deltaY; const step = Math.trunc(acc / 40);
    if (step) { acc -= step * 40; setSlice(S.slice[S.orient] - step); }
    if (S.cur) showTip(S.vol.seg[idx(...S.cur)], e.clientX, e.clientY);
  }, { passive: false });
  cv.addEventListener('keydown', e => {
    const D = OR[S.orient], k = e.key, n = e.shiftKey ? 5 : 1;
    let p = S.cur || S.lock || null;
    if (k === 'Escape') { setLock(null); tip().hidden = true; e.preventDefault(); return; }
    if (k === 'PageUp' || k === '+' || k === '=') { setSlice(S.slice[S.orient] + n); e.preventDefault(); return; }
    if (k === 'PageDown' || k === '-') { setSlice(S.slice[S.orient] - n); e.preventDefault(); return; }
    const mv = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[k];
    if (mv) {
      if (!p || p[D.axis] !== S.slice[S.orient]) p = D.toV(Math.floor(D.W() / 2), Math.floor(D.H() / 2), S.slice[S.orient]);
      let [u, v] = D.toUV(p); u = Math.max(0, Math.min(D.W() - 1, u + mv[0] * n)); v = Math.max(0, Math.min(D.H() - 1, v + mv[1] * n));
      const q = D.toV(u, v, S.slice[S.orient]); setCur(q);
      const [sx, sy] = screenOf(f, q); showTip(S.vol.seg[idx(...q)], sx, sy);
      e.preventDefault(); return;
    }
    if ((k === 'Enter' || k === ' ') && S.cur) { setLock(S.cur); e.preventDefault(); }
  });
  cv.addEventListener('blur', () => { tip().hidden = true; });
}
function fitFilm(f) {
  const r = f.cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  f.cv.width = Math.max(1, Math.round(r.width * dpr)); f.cv.height = Math.max(1, Math.round(r.height * dpr));
  f.ctx = f.cv.getContext('2d');
  if (S.sl) drawFilm(f);
}

/* ---------------- 5. mô được chọn ---------------- */
/* đếm voxel của mỗi mô trên mỗi lát, cho cả ba hướng cắt (một lượt qua khối) */
function countTissues() {
  const ax = new Uint32Array(16 * S.Z), cor = new Uint32Array(16 * S.Y), sag = new Uint32Array(16 * S.X), seg = S.vol.seg;
  let i = 0;
  for (let z = 0; z < S.Z; z++) for (let y = 0; y < S.Y; y++) for (let x = 0; x < S.X; x++, i++) {
    const l = seg[i]; if (!l || l > 15) continue;
    ax[l * S.Z + z]++; cor[l * S.Y + y]++; sag[l * S.X + x]++;
  }
  S.counts = { ax, cor, sag };
}
const countsOf = (l, o) => { const n = S.dims[OR[o].axis]; return S.counts[o].subarray(l * n, (l + 1) * n); };
function bestSlice(l, o) {
  const c = countsOf(l, o); let best = 0;
  for (let s = 1; s < c.length; s++) if (c[s] > c[best]) best = s;
  return best;
}
/* chọn mô l (null = bỏ chọn): nhảy tới lát chứa nhiều mô đó nhất, trừ khi keep = true (giữ lát và điểm khóa) */
function selectTissue(l, keep) {
  S.hl = l || null;
  if (S.hl && !keep) {
    S.lock = null; S.cur = null;
    S.slice[S.orient] = bestSlice(S.hl, S.orient);
    $('hmSlice').value = S.slice[S.orient]; sliceLabel();
  }
  $('hmFind').value = S.hl ? String(S.hl) : '';
  refresh(); renderInfo();
}
/* dải mật độ: một ô mỗi lát, càng đậm càng nhiều voxel của mô; ▼ là lát đang xem. Bấm/kéo trên dải để đổi lát. */
function renderStrip() {
  const el = $('hmStrip');
  if (!S.hl) { el.hidden = true; return; }
  const o = S.orient, a = OR[o].axis, c = countsOf(S.hl, o), n = c.length, s = S.slice[o], t = tissue(S.hl);
  let top = 0, first = -1, last = -1;
  for (let k = 0; k < n; k++) if (c[k]) { if (c[k] > top) top = c[k]; if (first < 0) first = k; last = k; }
  const at = k => sgn(Math.round(S.meta.origin_mm[a] + k));
  const cells = [];
  for (let k = 0; k < n; k++) if (c[k]) cells.push(`<rect x="${k}" y="3" width="1" height="12" fill-opacity="${(0.15 + 0.85 * c[k] / top).toFixed(2)}"/>`);
  el.hidden = false;
  el.innerHTML = `<div class="hm-strip-head"><span><i class="hm-sw" style="background:${t.color}"></i><b>${esc(t.en)}</b> có ở ${AXN[a]} = ${at(first)} … ${at(last)} mm
      <span class="q">(đậm = nhiều; ▼ = lát này, ${c[s].toLocaleString('vi-VN')} voxel)</span></span>
      <button class="hm-clear" type="button" id="hmClear" title="Bỏ chọn mô (bỏ viền hồng)">✕ Bỏ chọn</button></div>
    <svg viewBox="0 0 ${n} 18" preserveAspectRatio="none" role="slider" tabindex="0" aria-label="Lát cắt theo mật độ ${esc(t.en)}"
      aria-valuemin="0" aria-valuemax="${n - 1}" aria-valuenow="${s}"><rect x="0" y="3" width="${n}" height="12" class="bg"/>
      <g class="cells">${cells.join('')}</g><rect x="${s}" y="0" width="1" height="18" class="now"/></svg>
    <div class="hm-strip-ticks"><span>${at(0)}</span><span>${AXN[a]} (mm)</span><span>${at(n - 1)}</span></div>`;
  $('hmClear').addEventListener('click', () => selectTissue(null));
}
function bindStrip() {
  const el = $('hmStrip');
  const go = e => {
    const sv = el.querySelector('svg'); if (!sv) return;
    const r = sv.getBoundingClientRect(), n = S.dims[OR[S.orient].axis];
    setSlice(Math.floor((e.clientX - r.left) / r.width * n));
  };
  let drag = false;
  el.addEventListener('pointerdown', e => { if (!e.target.closest('svg')) return; drag = true; el.setPointerCapture(e.pointerId); go(e); });
  el.addEventListener('pointermove', e => { if (drag) go(e); });
  el.addEventListener('pointerup', () => { drag = false; });
  el.addEventListener('keydown', e => {
    if (!e.target.closest('svg')) return;
    const d = { ArrowLeft: -1, ArrowRight: 1, ArrowDown: -1, ArrowUp: 1 }[e.key];
    if (d) { setSlice(S.slice[S.orient] + d * (e.shiftKey ? 5 : 1)); e.preventDefault(); el.querySelector('svg').focus(); }
  });
}

/* ---------------- 6. khung thông tin ---------------- */
const fmtS = v => v == null ? '–' : num(v, v < 0.1 ? 3 : 2);
function tissueBlock(l) {
  const t = tissue(l), st = stat(l);
  const row = compact() ? (h, v) => v ? `<p class="hm-row"><b>${h}:</b> ${esc(v)}</p>` : '' : (h, v) => v ? `<dt>${h}</dt><dd>${esc(v)}</dd>` : '';
  const wrap = compact() ? x => x : x => `<dl>${x}</dl>`;
  return `<h3>${esc(t.en)}${t.ipa ? ` <span class="ipa" lang="en-fonipa">/${esc(t.ipa)}/</span>` : ''}</h3>
    <p class="sub-vi">${esc(t.vi)}</p>
    <div class="chips">${compact() ? `<span class="chip"><i style="background:${t.color}"></i>${esc(t.group || '')}</span>`
      : `<span class="chip"><i style="background:${t.color}"></i>Nhãn ${l}</span>${t.group ? `<span class="chip">${esc(t.group)}</span>` : ''}`}<span class="chip">${num(st.voxels / 1000, 1)} mL</span></div>
    ${wrap(row('Vị trí', t.where) + row('Trên T1 và T2', t.mri) + (hasCond() ? row('Độ dẫn điện', t.cond) : ''))}
    ${hasCond() ? `<p class="where">σ dự đoán (trung vị trong mô): ${fmtS(st.median)} S/m; 90% voxel trong khoảng ${fmtS(st.p5)}–${fmtS(st.p95)}. Tham chiếu: ${fmtS(st.ref)} S/m.</p>` : ''}`;
}
function renderInfo() {
  const box = $('hmInfo'), btn = (id, txt, cls = '') => `<button class="btn ${cls}" type="button" id="${id}">${txt}</button>`;
  let html = '', name = '';
  if (S.lock) {
    const p = S.lock, i = idx(...p), l = S.vol.seg[i], t = tissue(l);
    const where = `Điểm ${mm(p).map(sgn).join(', ')} mm: T1 ${S.vol.t1[i]}, T2 ${S.vol.t2[i]}` + (hasCond() ? `, σ ${num(condAt(i), 3)} S/m.` : '.');
    if (!t) {
      name = 'Background';
      html = `<h3>Background</h3><p class="sub-vi">Nền: không khí ngoài đầu hoặc trong xoang, hốc mũi. Không có mô.</p><p class="where">${esc(where)}</p>
        <div class="btnrow">${btn('hmUnlock', 'Bỏ khóa')}</div>`;
    } else {
      name = t.en;
      html = `<p class="where hm-at">${esc(where)}</p>${tissueBlock(l)}
        <div class="btnrow">${btn('hmSave', 'Ghim', 'primary')}${S.hl === l ? '' : btn('hmShow', 'Viền mô này')}${btn('hmUnlock', 'Bỏ khóa')}</div>`;
    }
  } else if (S.hl) {
    name = tissue(S.hl).en;
    html = tissueBlock(S.hl) + `<div class="btnrow">${btn('hmSave', 'Ghim', 'primary')}${btn('hmUnsel', 'Bỏ chọn')}</div>`;
  } else {
    html = '<p class="info-empty">Nhấp vào một điểm trên ảnh để khóa vị trí và xem mô tại đó, hoặc bấm tên một mô trong bảng dưới đây để biết mô đó nằm ở những lát nào.</p>';
  }
  $('hmInfoName').textContent = name;
  box.innerHTML = html + tableHtml();
  const on = (id, fn) => { const b = $(id); if (b) b.addEventListener('click', fn); };
  on('hmUnlock', () => setLock(null));
  on('hmSave', saveNote);
  on('hmShow', () => selectTissue(S.vol.seg[idx(...S.lock)], true));
  on('hmUnsel', () => selectTissue(null));
  box.querySelectorAll('tr[data-t]').forEach(tr => {
    const pick = () => selectTissue(+tr.dataset.t === S.hl ? null : +tr.dataset.t);
    tr.addEventListener('click', pick);
    tr.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { pick(); e.preventDefault(); } });
  });
  if (S.infoMin && (S.lock || S.hl) && window.matchMedia('(max-width: 979px)').matches) setInfoMin(false);
}
/* các mô có trong ảnh; bảng Các mô xếp theo thể tích (lớn trước), ô Tìm mô xếp theo tên tiếng Anh */
const present = () => Object.keys(S.T.tissues).map(Number).filter(l => stat(l).voxels);
const byVolume = () => present().sort((a, b) => stat(b).voxels - stat(a).voxels);
/* bảng Các mô: bấm một dòng để chọn mô (bấm lại để bỏ chọn) */
function tableHtml() {
  const rows = byVolume().map(l => {
    const t = tissue(l), st = stat(l), sel = l === S.hl;
    return `<tr data-t="${l}" tabindex="0"${sel ? ' class="sel" aria-selected="true"' : ''} title="Bấm để xem mô này nằm ở những lát nào">
      <td><i class="hm-sw" style="background:${t.color}"></i>${esc(t.en)}${compact() ? '' : `<small>${esc(t.vi)}</small>`}</td>
      <td>${num(st.voxels / 1000, 1)}</td>${hasCond() ? `<td>${fmtS(st.ref)}</td>` : ''}</tr>`;
  }).join('');
  return `<h4 class="hm-th">Các mô trong ảnh</h4>
    <table class="hm-table"><thead><tr><th>Mô</th><th title="Thể tích">mL</th>${hasCond() ? '<th title="Độ dẫn điện tham chiếu của mô ở 10 kHz">σ tham chiếu</th>' : ''}</tr></thead>
    <tbody>${rows}</tbody></table>
    <p class="hm-tnote">${hasCond() ? 'σ tính bằng S/m, ở 10 kHz. ' : ''}Bấm tên một mô để viền mô đó (màu hồng) và xem những lát có mô đó.</p>`;
}
const MIN_SVG = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3 8h10" stroke="currentColor" stroke-width="2.2"/></svg>';
const MAX_SVG = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M2.5 2.5h11v11h-11z" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
function setInfoMin(v) {
  S.infoMin = v;
  $('hmViewer').classList.toggle('info-min', v);
  const b = $('hmInfoMin'); b.setAttribute('aria-expanded', !v);
  b.innerHTML = v ? MAX_SVG : MIN_SVG; b.title = v ? 'Mở khung thông tin' : 'Thu gọn khung thông tin';
  S.films.forEach(fitFilm);
}
function setCtlMin(v) {
  const c = $('hmControls'), b = $('hmCtlMin');
  c.classList.toggle('min', v); b.setAttribute('aria-expanded', !v);
  b.innerHTML = v ? MAX_SVG : MIN_SVG; b.title = v ? 'Mở bảng điều khiển' : 'Thu gọn bảng điều khiển';
}

/* ---------------- 7. danh sách ghim + PDF ---------------- */
const DB = (() => {
  let dbp = null, mem = [], memId = 1, useMem = false;
  function open() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      if (!('indexedDB' in window)) { rej(new Error('no idb')); return; }
      const r = indexedDB.open('med-atlas', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('notes', { keyPath: 'id', autoIncrement: true });
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    }).catch(err => { useMem = true; console.warn('IndexedDB không dùng được, danh sách ghim chỉ giữ trong phiên này.', err); return null; });
    return dbp;
  }
  function run(mode, fn) {
    return open().then(db => db ? new Promise((res, rej) => {
      const t = db.transaction('notes', mode), st = t.objectStore('notes'); let out;
      const r = fn(st); if (r) r.onsuccess = () => { out = r.result; };
      t.oncomplete = () => res(out); t.onerror = () => rej(t.error);
    }) : null);
  }
  return {
    get volatile() { return useMem; },
    async all(organ) { const r = await run('readonly', st => st.getAll()); return (useMem ? mem : r || []).filter(n => n.organ === organ).sort((a, b) => a.time - b.time); },
    async add(n) { const r = await run('readwrite', st => st.add(n)); if (useMem) { n.id = memId++; mem.push(n); } return r; },
    async del(id) { await run('readwrite', st => st.delete(id)); if (useMem) mem = mem.filter(n => n.id !== id); },
    async put(n) { await run('readwrite', st => st.put(n)); if (useMem) mem = mem.map(m => m.id === n.id ? n : m); },
  };
})();

/* Ảnh thu nhỏ của lát s: 2 × 2 (T1 | T2 / phân vùng | σ), hoặc một hàng khi có 3 ảnh; viền mô l, chữ thập tại p (nếu có). */
function thumbnail(o, s, l, p) {
  const sl = buildSlice(o, s), P = 220, GAP = 3, k = P / S.MAXD, edge = l ? edgeCanvas(sl, l) : null;
  const cols = MODS.length === 3 ? 3 : 2, rows = Math.ceil(MODS.length / cols);
  const cvs = canvasOf(cols * P + (cols - 1) * GAP, rows * P + (rows - 1) * GAP), ctx = cvs.getContext('2d'), D = OR[o];
  ctx.fillStyle = '#1B1920'; ctx.fillRect(0, 0, cvs.width, cvs.height);
  const TAG = { t1: 'T1', t2: 'T2', seg: 'Mô', cond: 'σ' };
  MODS.forEach((m, j) => {
    const ox = (j % cols) * (P + GAP), oy = Math.floor(j / cols) * (P + GAP), dx = ox + (P - sl.W * k) / 2, dy = oy + (P - sl.H * k) / 2;
    ctx.fillStyle = '#000'; ctx.fillRect(ox, oy, P, P);
    ctx.imageSmoothingEnabled = m === 't1' || m === 't2'; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(sl.cv[m], dx, dy, sl.W * k, sl.H * k);
    ctx.imageSmoothingEnabled = false;
    if (edge) ctx.drawImage(edge, dx, dy, sl.W * k, sl.H * k);
    if (p) {
      const [u, v] = D.toUV(p), X = dx + (u + 0.5) * k, Y = dy + (v + 0.5) * k;
      ctx.strokeStyle = '#f2c230'; ctx.lineWidth = 2; ctx.beginPath();
      ctx.moveTo(X - 9, Y); ctx.lineTo(X - 3, Y); ctx.moveTo(X + 3, Y); ctx.lineTo(X + 9, Y);
      ctx.moveTo(X, Y - 9); ctx.lineTo(X, Y - 3); ctx.moveTo(X, Y + 3); ctx.lineTo(X, Y + 9); ctx.stroke();
    }
    ctx.fillStyle = '#fff'; ctx.font = '20px VT323, monospace'; ctx.textBaseline = 'top'; ctx.fillText(TAG[m], ox + 6, oy + 4);
  });
  return cvs.toDataURL('image/jpeg', 0.88);
}
async function saveNote() {
  const p = S.lock, l = p ? S.vol.seg[idx(...p)] : S.hl;
  if (!tissue(l)) return;
  const o = S.orient, s = p ? p[OR[o].axis] : S.slice[o];
  const note = { organ: organ(), time: Date.now(), tissue: l, orient: o, slice: s, min: true };
  if (p) { const i = idx(...p); Object.assign(note, { vox: p.slice(), pos: mm(p), t1: S.vol.t1[i], t2: S.vol.t2[i] }); if (hasCond()) note.cond = condAt(i); }
  else note.pos_s = Math.round(S.meta.origin_mm[OR[o].axis] + s);
  note.thumb = thumbnail(o, s, S.hl === l || !p ? l : null, p);
  await DB.add(note);
  const b = $('hmSave'); if (b) { b.textContent = 'Đã ghim'; b.disabled = true; }
  renderNotebook();
}
const notePos = n => n.vox ? `${n.pos.map(sgn).join(', ')} mm; T1 ${n.t1}, T2 ${n.t2}${n.cond != null ? `, σ ${num(n.cond, 3)} S/m` : ''}; ${OR[n.orient].name.toLowerCase()}`
  : `${OR[n.orient].name}, ${AXN[OR[n.orient].axis]} = ${sgn(n.pos_s)} mm`;
const DEL_SVG = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
async function renderNotebook() {
  const notes = await DB.all(organ()), list = $('nbList');
  $('nbCount').textContent = notes.length;
  $('btnPdf').disabled = !notes.length;
  $('nbEmpty').hidden = !!notes.length;
  $('nbWarn').hidden = !DB.volatile;
  list.innerHTML = notes.map(n => {
    const t = tissue(n.tissue) || { en: '?', vi: '' }, title = t.en + (n.vox ? '' : ' (cả mô)');
    return `<li class="nb-item${n.min ? ' min' : ''}" data-id="${n.id}">
      <div class="nb-top"><div class="nm"><b>${esc(title)}</b><span class="vi">${esc(t.vi)}</span></div>
        <button class="iconbtn" type="button" data-min="${n.id}" aria-expanded="${!n.min}" title="${n.min ? 'Mở rộng' : 'Thu gọn'}">${n.min ? MAX_SVG : MIN_SVG}</button>
        <button class="iconbtn del" type="button" data-del="${n.id}" title="Bỏ ghim" aria-label="Bỏ ghim ${esc(title)}">${DEL_SVG}</button></div>
      <img src="${n.thumb}" alt="${esc(t.en)}: T1, T2, phân vùng mô và độ dẫn điện" loading="lazy">
      <small>${esc(notePos(n))}; ${new Date(n.time).toLocaleString('vi-VN')}</small></li>`;
  }).join('');
  list.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', async () => { await DB.del(+b.dataset.del); renderNotebook(); }));
  list.querySelectorAll('[data-min]').forEach(b => b.addEventListener('click', async () => {
    const n = notes.find(x => x.id === +b.dataset.min); n.min = !n.min; await DB.put(n); renderNotebook();
  }));
}
const pad2 = v => String(v).padStart(2, '0');
function noteHtml(n) {
  const t = tissue(n.tissue); if (!t) return '';
  const st = stat(n.tissue), p = (h, v) => v ? `<p><b>${h}.</b> ${esc(v)}</p>` : '';
  return `<article><img src="${n.thumb}" alt="">
    <div><h2>${esc(t.en)}${t.ipa ? ` <span class="ipa">/${esc(t.ipa)}/</span>` : ''}</h2>
    <p class="en">${esc(t.vi)}</p>
    <p class="pos">${esc(notePos(n))}</p>
    ${p('Vị trí', t.where)}${p('Trên T1 và T2', t.mri)}${st.ref != null ? p('Độ dẫn điện', t.cond) : ''}
    ${st.ref != null ? `<p>σ dự đoán (trung vị) ${fmtS(st.median)} S/m; tham chiếu ${fmtS(st.ref)} S/m; thể tích ${num(st.voxels / 1000, 1)} mL.</p>` : ''}</div></article>`;
}
/* Bản in: tự chia trang để ghi "Trang i/N" (như lib/atlas.js) */
const PAGE_H = 296, BODY_TOP = 20, BODY_BOTTOM = 16;
async function exportPdf() {
  const notes = await DB.all(organ()); if (!notes.length) return;
  const sh = $('printSheet'), pxmm = 96 / 25.4, avail = (PAGE_H - BODY_TOP - BODY_BOTTOM) * pxmm;
  const blocks = [`<h1>${esc(S.cfg.printTitle || 'MRI đầu')}</h1>`, ...notes.map(noteHtml).filter(Boolean)];
  sh.className = 'measure';
  sh.innerHTML = `<div class="pb">${blocks.join('')}</div>`;
  await Promise.all([...sh.querySelectorAll('img')].map(i => i.decode ? i.decode().catch(() => {}) : null));
  const els = [...sh.querySelector('.pb').children], pages = [];
  let cur = [], top = 0;
  els.forEach((el, i) => {
    const r0 = el.offsetTop, r1 = el.offsetTop + el.offsetHeight;
    if (cur.length && r1 - top > avail) { pages.push(cur); cur = []; }
    if (!cur.length) top = r0;
    cur.push(blocks[i]);
  });
  if (cur.length) pages.push(cur);
  const head = esc(S.cfg.printHeader || ''), N = pages.length;
  sh.className = '';
  sh.innerHTML = pages.map((pg, i) => `<section class="pg"><div class="ph">${head}</div><div class="pb">${pg.join('')}</div><div class="pf">Trang ${i + 1}/${N}</div></section>`).join('');
  await Promise.all([...sh.querySelectorAll('img')].map(i => i.decode ? i.decode().catch(() => {}) : null));
  const d = new Date(), old = document.title;
  document.title = `${S.cfg.printFile || 'ghichu'} ${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}_${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;
  const restore = () => { document.title = old; window.removeEventListener('afterprint', restore); };
  window.addEventListener('afterprint', restore);
  window.print();
}

/* ---------------- khởi động ---------------- */
function loaderMsg(html, err) {
  const ld = $('hmLoader'); ld.hidden = false; ld.classList.toggle('err', !!err); ld.innerHTML = `<div>${html}</div>`;
}
/* các ảnh (canvas hmCv-<ảnh>) và ResizeObserver: một lần cho mỗi trang */
function setup(cfg) {
  S.cfg = cfg;
  if (cfg.mods) MODS = cfg.mods;
  if (S.films.length) return;
  S.films = MODS.map(m => ({ mod: m, cv: $('hmCv-' + m) }));
  S.films.forEach(f => { f.ctx = f.cv.getContext('2d'); new ResizeObserver(() => fitFilm(f)).observe(f.cv); });
}
async function start(cfg) {
  setup(cfg);
  if (location.protocol === 'file:') {
    loaderMsg('Trang đang được mở trực tiếp từ ổ đĩa, nên trình duyệt chặn việc đọc dữ liệu ảnh.<br><br>Hãy mở qua một server tĩnh, ví dụ chạy <code>python -m http.server</code> trong thư mục <code>my-library</code> rồi vào <code>http://localhost:8000</code>, hoặc dùng Live Server của VS Code. Trên GitHub Pages trang chạy bình thường.', true);
    return;
  }
  try {
    const base = cfg.data;
    const [meta, T] = await Promise.all([fetch(base + 'meta.json').then(r => r.json()), fetch(base + 'tissues.json').then(r => r.json())]);
    S.meta = meta; S.T = T; S.dims = meta.dims; [S.X, S.Y, S.Z] = meta.dims; S.MAXD = Math.max(...meta.dims);
    const total = MODS.reduce((a, n) => a + (meta.bytes[n] || 0), 0);
    let got = 0;
    $('hmLoader').innerHTML = `<div>Đang tải ảnh MRI đầu (khoảng ${Math.round(total / 1e6)} MB, chỉ tải một lần)<div class="bar"><i id="hmBar"></i></div></div>`;
    const bufs = await Promise.all(MODS.map(m => fetchBytes(base + meta.files[m], k => { got += k; $('hmBar').style.width = Math.min(100, got / total * 100) + '%'; }).then(gunzipIfNeeded)));
    const N = S.X * S.Y * S.Z;
    MODS.forEach((m, i) => {
      const b = bufs[i], need = m === 'cond' ? 2 * N : N;
      if (b.length !== need) throw new Error(`File ${meta.files[m]} có ${b.length} byte, cần ${need}.`);
      // uint16 little-endian; mọi trình duyệt phổ biến đều little-endian
      S.vol[m] = m === 'cond' ? new Uint16Array(b.buffer, b.byteOffset, N) : b;
    });
  } catch (err) {
    console.error(err);
    loaderMsg('Không tải được dữ liệu ảnh: ' + esc(err.message), true);
    return;
  }
  init();
}
/* hiện khối ảnh do trang tự tính (head-seg.html); gọi lại được cho một lần tính mới */
function show(cfg, data) {
  setup(cfg);
  S.meta = data.meta; S.T = data.T; S.vol = data.vol;
  S.dims = S.meta.dims; [S.X, S.Y, S.Z] = S.dims; S.MAXD = Math.max(...S.dims);
  S.sl = null; S.cur = null; S.lock = null; S.hl = null;
  init();
}
function init() {
  for (const m of ['t1', 't2']) {
    const [lo, hi] = S.meta.window[m], t = new Uint8ClampedArray(256);
    for (let v = 0; v < 256; v++) t[v] = v === 0 ? 0 : (v - lo) / (hi - lo) * 255;
    S.lut[m] = t;
  }
  Object.entries(S.T.tissues).forEach(([l, t]) => { const h = t.color.replace('#', ''); S.colors[+l] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); });
  countTissues();
  // vị trí ban đầu: lát ngang qua giữa chất trắng, lát giữa cho hai hướng còn lại
  const wm = 13, ax = countsOf(wm, 'ax');
  let a0 = -1, a1 = -1; ax.forEach((c, k) => { if (c) { if (a0 < 0) a0 = k; a1 = k; } });
  S.slice = { ax: a0 >= 0 ? (a0 + a1) >> 1 : S.Z >> 1, cor: S.Y >> 1, sag: S.X >> 1 };
  const ld = $('hmLoader'); if (ld) ld.hidden = true;
  if (!S.wired) { S.wired = true; wireControls(); S.films.forEach(bindFilm); }
  fillFind();
  S.films.forEach(fitFilm);
  setOrient(S.orient); renderInfo(); renderNotebook();
}
/* ô Tìm mô: các mô có trong ảnh, theo tên tiếng Anh */
function fillFind() {
  $('hmFind').innerHTML = '<option value="">Chọn một mô…</option>' + present().sort((a, b) => tissue(a).en.localeCompare(tissue(b).en, 'en'))
    .map(l => `<option value="${l}">${esc(tissue(l).en)} - ${esc(tissue(l).vi)}</option>`).join('');
}
function wireControls() {
  document.querySelectorAll('[data-orient]').forEach(b => b.addEventListener('click', () => setOrient(b.dataset.orient)));
  $('hmSlice').addEventListener('input', e => setSlice(+e.target.value));
  const sc = $('hmScale');
  if (sc) { sc.value = S.scale; sc.addEventListener('change', () => { S.scale = sc.value; refresh(true); }); }
  const fd = $('hmFind');
  fd.addEventListener('change', () => selectTissue(+fd.value || null));
  bindStrip();
  $('btnPdf').addEventListener('click', exportPdf);
  $('hmInfoMin').addEventListener('click', () => setInfoMin(!S.infoMin));
  $('hmCtlMin').addEventListener('click', () => setCtlMin(!$('hmControls').classList.contains('min')));
  setInfoMin(false); setCtlMin(false);
  window.addEventListener('scroll', () => { tip().hidden = true; }, { passive: true });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && S.lock && !e.defaultPrevented) setLock(null); });
}

return { start, show };
})();
