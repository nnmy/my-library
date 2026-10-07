/* =====================================================================
   Foto Album — core
   State, page geometry, templates, photo-in-frame math, caption
   sanitizer, EXIF formatting, IndexedDB storage, undo/redo.
   All lengths are in millimetres unless the name says otherwise.
   ===================================================================== */
(function () {
'use strict';
const FA = window.FA = window.FA || {};

/* ---------- small utils ---------- */
const uid = (p = 'id') => p + '-' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const PT = 25.4 / 72;                 // 1 pt in mm
const deepClone = o => JSON.parse(JSON.stringify(o));
function getPath(obj, path) { return path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj); }
function setPath(obj, path, val) {
  const ks = path.split('.'); let o = obj;
  for (let i = 0; i < ks.length - 1; i++) { if (o[ks[i]] == null) o[ks[i]] = {}; o = o[ks[i]]; }
  o[ks[ks.length - 1]] = val;
}
Object.assign(FA, { uid, clamp, esc, PT, deepClone, getPath, setPath });

/* ---------- page sizes ---------- */
FA.PAGE_SIZES = {
  A4:       { label: 'A4 (210 × 280 mm)',       w: 210, h: 280 },
  A5:       { label: 'A5 (148 × 210 mm)',       w: 148, h: 210 },
  A5SQ:     { label: 'A5 vuông (148 × 148 mm)', w: 148, h: 148 },
  POCKET:   { label: 'Bỏ túi (105 × 148 mm)',   w: 105, h: 148 },
  CUSTOM:   { label: 'Tuỳ chỉnh…',             w: 200, h: 200 },
};

FA.FONTS = {
  serif:  { label: 'Có chân (Serif)',  css: 'Georgia, "Times New Roman", "Noto Serif", serif', docx: 'Georgia' },
  sans:   { label: 'Không chân (Sans)', css: '"Segoe UI", "Helvetica Neue", Arial, "Noto Sans", sans-serif', docx: 'Arial' },
  hand:   { label: 'Viết tay',          css: '"Segoe Print", "Bradley Hand", "Comic Sans MS", cursive', docx: 'Segoe Print' },
  mono:   { label: 'Đơn cách (Mono)',   css: 'Consolas, "Courier New", monospace', docx: 'Consolas' },
};

/* Photo filters: CSS filter strings by intensity a ∈ [0,1]. The same string is
   used in the editor (CSS), when baking (canvas ctx.filter) and, where canvas
   filters are missing, through the colour-matrix fallback below. */
FA.FILTERS = {
  none:     { label: 'Không', css: () => '' },
  bw:       { label: 'Trắng đen', css: a => `grayscale(${a})` },
  bwhi:     { label: 'Trắng đen tương phản', css: a => `grayscale(${a}) contrast(${1 + 0.3 * a})` },
  sepia:    { label: 'Nâu cổ (sepia)', css: a => `sepia(${0.85 * a})` },
  warm:     { label: 'Ấm', css: a => `sepia(${0.25 * a}) saturate(${1 + 0.25 * a}) hue-rotate(${-8 * a}deg)` },
  cool:     { label: 'Lạnh', css: a => `saturate(${1 - 0.1 * a}) hue-rotate(${12 * a}deg) brightness(${1 + 0.03 * a})` },
  fade:     { label: 'Phai màu', css: a => `contrast(${1 - 0.18 * a}) brightness(${1 + 0.08 * a}) saturate(${1 - 0.3 * a})` },
  vintage:  { label: 'Hoài cổ', css: a => `sepia(${0.45 * a}) contrast(${1 - 0.1 * a}) brightness(${1 + 0.05 * a}) saturate(${1 - 0.15 * a})` },
  vivid:    { label: 'Rực rỡ', css: a => `saturate(${1 + 0.4 * a}) contrast(${1 + 0.1 * a})` },
};
FA.filterCss = s => { const f = FA.FILTERS[s.filter.name] || FA.FILTERS.none; return f.css(clamp(+s.filter.amount, 0, 1)); };

/* CSS filter string -> 3x4 affine colour matrix (Filter Effects spec). */
FA.filterMatrix = function (css) {
  let M = [1,0,0,0, 0,1,0,0, 0,0,1,0];
  const mul = (A, B) => { // A∘B : apply B then A
    const r = new Array(12);
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) r[i*4+j] = A[i*4]*B[j] + A[i*4+1]*B[4+j] + A[i*4+2]*B[8+j];
      r[i*4+3] = A[i*4]*B[3] + A[i*4+1]*B[7] + A[i*4+2]*B[11] + A[i*4+3];
    }
    return r;
  };
  const re = /([a-z-]+)\(([-\d.]+)(deg)?\)/g; let m;
  while ((m = re.exec(css))) {
    const fn = m[1], v = parseFloat(m[2]); let F;
    if (fn === 'grayscale' || fn === 'sepia') {
      const s = 1 - clamp(v, 0, 1);
      F = fn === 'grayscale'
        ? [.2126+.7874*s, .7152-.7152*s, .0722-.0722*s, 0, .2126-.2126*s, .7152+.2848*s, .0722-.0722*s, 0, .2126-.2126*s, .7152-.7152*s, .0722+.9278*s, 0]
        : [.393+.607*s, .769-.769*s, .189-.189*s, 0, .349-.349*s, .686+.314*s, .168-.168*s, 0, .272-.272*s, .534-.534*s, .131+.869*s, 0];
    } else if (fn === 'saturate') {
      const s = v;
      F = [.213+.787*s, .715-.715*s, .072-.072*s, 0, .213-.213*s, .715+.285*s, .072-.072*s, 0, .213-.213*s, .715-.715*s, .072+.928*s, 0];
    } else if (fn === 'hue-rotate') {
      const t = v * Math.PI / 180, c = Math.cos(t), s = Math.sin(t);
      F = [.213+c*.787-s*.213, .715-c*.715-s*.715, .072-c*.072+s*.928, 0,
           .213-c*.213+s*.143, .715+c*.285+s*.140, .072-c*.072-s*.283, 0,
           .213-c*.213-s*.787, .715-c*.715+s*.715, .072+c*.928+s*.072, 0];
    } else if (fn === 'brightness') {
      F = [v,0,0,0, 0,v,0,0, 0,0,v,0];
    } else if (fn === 'contrast') {
      const o = (0.5 - 0.5 * v) * 255;
      F = [v,0,0,o, 0,v,0,o, 0,0,v,o];
    } else continue;
    M = mul(F, M);
  }
  return M;
};

/* ---------- default project ---------- */
FA.defaultSettings = () => ({
  pageSize: 'A4', custom: { w: 200, h: 200 },
  margin: { top: 14, bottom: 16, outer: 12, inner: 12 },
  gutter: 8,              // binding gutter, added to the inner margin
  gap: 4,                 // space between photos
  bleed: 0,               // mm added around each page on export
  allowReuse: false,
  sortBy: 'date',
  caption: { position: 'below', height: 8, font: 'serif', size: 9, color: '#3a3a3a', align: 'center' },
  text: { font: 'serif', titleSize: 26, bodySize: 11, color: '#222222' },
  exif: { labels: 'icon', font: 'sans', size: 7, color: '#777777', italic: false,
          fields: { datetime: true, camera: true, lens: true, focal: true, aperture: true, shutter: true, iso: true, gps: false } },
  border: { width: 0, color: '#ffffff' },
  look: { background: '#ffffff', filter: { name: 'none', amount: 1 }, shape: 'rect', radius: 3 },  // default for new pages
  groupTitle: 'title',    // template used for a group's title page
  albumTitle: true,       // album title page as page 1 (not in any group)
  blankAfterTitle: false, // empty page right after the album title page
  header: { enabled: false, text: '{title}', align: 'outer' },
  footer: { enabled: false, text: '', align: 'center' },
  pageNumber: { enabled: false, align: 'outer', format: 'arabic', start: 1, skipCover: true, skipCredit: true },
  hf: { font: 'sans', size: 8, color: '#777777' },
  guides: { margins: true, gutter: true, bleed: true, dpi: true },
  export: { format: 'pdf-print', dpi: 300, includeBleed: true },
});

FA.newProject = () => ({
  version: 1,
  id: uid('album'),
  title: 'Album ảnh',
  settings: FA.defaultSettings(),
  groups: [],   // {id, name}
  photos: [],   // {id, name, type, size, w, h, date, exif:{...}, order, group}
  pages: [],    // {id, template, group, look:{background, filter, shape, radius}, items:[{photo, caption, crop, exif}], texts:{}, stash:[], index:{scope, numbers}}
});

/* Fill in any missing settings (projects saved by an older version). */
FA.normalizeProject = function (p) {
  const old = p.settings || {};
  const legacyLook = old.background || old.filter || (old.border && old.border.shape) ? {
    background: old.background || '#ffffff', filter: old.filter || { name: 'none', amount: 1 },
    shape: (old.border && old.border.shape) || 'rect', radius: (old.border && old.border.radius) || 3 } : null;
  const legacyExifOn = old.exif && old.exif.enabled;
  if (old.exif && old.exif.fields && 'date' in old.exif.fields) delete old.exif.fields;
  ['background', 'filter'].forEach(k => delete old[k]);
  if (old.exif) ['enabled', 'layout', 'dateFormat'].forEach(k => delete old.exif[k]);
  if (old.border) { delete old.border.shape; delete old.border.radius; }
  if (legacyLook && !old.look) old.look = legacyLook;
  const base = FA.newProject();
  const merge = (dst, src) => {
    for (const k of Object.keys(src)) {
      if (dst[k] === undefined) dst[k] = deepClone(src[k]);
      else if (src[k] && typeof src[k] === 'object' && !Array.isArray(src[k]) && typeof dst[k] === 'object') merge(dst[k], src[k]);
    }
  };
  merge(p, base);
  const gids = new Set(p.groups.map(g => g.id));
  // projects from older versions: a cover as page 1 becomes the album title page
  if (p.pages[0] && p.pages[0].template === 'cover' && !p.pages.some(x => x.role === 'album-title')) p.pages[0].role = 'album-title';
  p.photos.forEach(ph => { if (ph.group && !gids.has(ph.group)) ph.group = null; });
  p.pages.forEach(pg => {
    pg.items = pg.items || []; pg.texts = pg.texts || {}; pg.stash = pg.stash || [];
    if (!FA.TEMPLATES[pg.template]) pg.template = FA.DEFAULT_TEMPLATE;
    if (pg.group && !gids.has(pg.group)) pg.group = null;
    pg.look = Object.assign(deepClone(p.settings.look), pg.look || {});
    pg.look.filter = Object.assign({ name: 'none', amount: 1 }, pg.look.filter || {});
    pg.index = Object.assign({ scope: 'album', numbers: true, gap: 2 }, pg.index || {});
    if (FA.isUngroupedPage(pg)) pg.group = null;
    pg.items.forEach(it => {
      it.crop = Object.assign(FA.defaultCrop(), it.crop || {}); if (it.caption == null) it.caption = '';
      if (it.exif == null) it.exif = !!(legacyExifOn && it.photo);
    });
  });
  return p;
};

FA.defaultCrop = () => ({ z: 1, u: 0, v: 0, rot: 0, fit: 'cover' });
FA.emptyItem = () => ({ photo: null, caption: '', crop: FA.defaultCrop(), exif: false });
FA.newItem = photo => ({ photo, caption: '', crop: FA.defaultCrop(), exif: false });

/* ---------- page geometry ---------- */
FA.pageDims = s => {
  const ps = s.pageSize === 'CUSTOM' ? s.custom : FA.PAGE_SIZES[s.pageSize] || FA.PAGE_SIZES.A4;
  return { W: Math.max(40, +ps.w || 200), H: Math.max(40, +ps.h || 200) };
};
/* Settings merged with the page's own look (background, filter, frame shape). */
FA.eff = function (project, idx) {
  const s = project.settings, pg = project.pages[idx], l = (pg && pg.look) || s.look;
  return Object.assign({}, s, { background: l.background, filter: l.filter,
    border: { width: s.border.width, color: s.border.color, shape: l.shape, radius: l.radius } });
};
/* Page 0 (cover) is a right-hand page; then 1|2, 3|4 … */
FA.isLeftPage = idx => idx % 2 === 1;
FA.spreads = n => {
  const out = [];
  if (n === 0) return out;
  out.push([null, 0]);
  for (let i = 1; i < n; i += 2) out.push([i, i + 1 < n ? i + 1 : null]);
  return out;
};
FA.spreadOf = idx => (idx === 0 ? 0 : Math.floor((idx + 1) / 2));

FA.contentBox = (s, isLeft) => {
  const { W, H } = FA.pageDims(s), m = s.margin, inner = (+m.inner) + (+s.gutter);
  const left = isLeft ? +m.outer : inner, right = isLeft ? inner : +m.outer;
  return { x: left, y: +m.top, w: Math.max(10, W - left - right), h: Math.max(10, H - m.top - m.bottom) };
};

/* ---------- templates ----------
   layout(g) returns { photos:[{x,y,w,h,cap,bleed}], texts:[{key,role,x,y,w,h,align,valign,ph}] }
   g = { W,H, c:{x,y,w,h}, gap, capH, bleed, isLeft } */
function cell(g, x, y, w, h, withCap = true) {
  const capH = withCap ? g.capH : 0;
  return { x, y, w, h: Math.max(4, h - capH), cap: capH ? { x, y: y + h - capH, w, h: capH } : null };
}
function grid(g, cols, rows, box = g.c) {
  const out = [], cw = (box.w - g.gap * (cols - 1)) / cols, ch = (box.h - g.gap * (rows - 1)) / rows;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++)
    out.push(cell(g, box.x + c * (cw + g.gap), box.y + r * (ch + g.gap), cw, ch));
  return out;
}
const fullBleed = g => ({ x: -g.bleed, y: -g.bleed, w: g.W + 2 * g.bleed, h: g.H + 2 * g.bleed, cap: null, bleed: true });

FA.TEMPLATES = {
  grid4:  { name: '2 × 2', group: 'Ảnh', layout: g => ({ photos: grid(g, 2, 2), texts: [] }) },
  grid1:  { name: '1 ảnh', group: 'Ảnh', layout: g => ({ photos: grid(g, 1, 1), texts: [] }) },
  grid2h: { name: '2 cạnh nhau', group: 'Ảnh', layout: g => ({ photos: grid(g, 2, 1), texts: [] }) },
  grid2v: { name: '2 trên dưới', group: 'Ảnh', layout: g => ({ photos: grid(g, 1, 2), texts: [] }) },
  grid3:  { name: '1 lớn + 2', group: 'Ảnh', layout: g => {
    const c = g.c, topH = (c.h - g.gap) * 0.58;
    return { photos: [cell(g, c.x, c.y, c.w, topH), ...grid(g, 2, 1, { x: c.x, y: c.y + topH + g.gap, w: c.w, h: c.h - topH - g.gap })], texts: [] };
  } },
  grid6:  { name: '2 × 3', group: 'Ảnh', layout: g => ({ photos: grid(g, 2, 3), texts: [] }) },
  full:   { name: 'Tràn trang', group: 'Ảnh', layout: g => ({ photos: [fullBleed(g)], texts: [] }) },
  cover:  { name: 'Bìa', group: 'Đặc biệt', layout: g => {
    const ph = g.H * 0.68;
    const p = { x: -g.bleed, y: -g.bleed, w: g.W + 2 * g.bleed, h: ph + g.bleed, cap: null, bleed: true };
    const ty = ph + (g.H - ph) * 0.16, th = (g.H - ph) * 0.7;
    return { photos: [p], texts: [
      { key: 'title', role: 'title', x: g.c.x, y: ty, w: g.c.w, h: th * 0.6, align: 'center', valign: 'end', ph: 'Tên album' },
      { key: 'subtitle', role: 'body', x: g.c.x, y: ty + th * 0.62, w: g.c.w, h: th * 0.38, align: 'center', valign: 'start', ph: 'Dòng phụ: thời gian, địa điểm…' },
    ] };
  } },
  title:  { name: 'Tiêu đề (ảnh lớn + chữ)', group: 'Đặc biệt', layout: g => {
    const c = g.c, ph = c.h * 0.64;
    return { photos: [cell(g, c.x, c.y, c.w, ph, false)], texts: [
      { key: 'title', role: 'title', x: c.x, y: c.y + ph + g.gap * 2, w: c.w, h: (c.h - ph) * 0.34, align: 'left', valign: 'end', ph: 'Tiêu đề chương' },
      { key: 'body', role: 'body', x: c.x, y: c.y + ph + g.gap * 2 + (c.h - ph) * 0.36, w: c.w, h: (c.h - ph) * 0.64 - g.gap * 2, align: 'left', valign: 'start', ph: 'Vài dòng giới thiệu…' },
    ] };
  } },
  text:   { name: 'Văn bản', group: 'Đặc biệt', layout: g => {
    const c = g.c;
    return { photos: [], texts: [
      { key: 'title', role: 'title', x: c.x, y: c.y, w: c.w, h: c.h * 0.18, align: 'left', valign: 'end', ph: 'Tiêu đề' },
      { key: 'body', role: 'body', x: c.x, y: c.y + c.h * 0.22, w: c.w, h: c.h * 0.78, align: 'left', valign: 'start', ph: 'Nội dung…' },
    ] };
  } },
  credit: { name: 'Lời cảm ơn', group: 'Đặc biệt', layout: g => {
    const c = g.c;
    return { photos: [], texts: [
      { key: 'title', role: 'title', x: c.x, y: c.y + c.h * 0.22, w: c.w, h: c.h * 0.14, align: 'center', valign: 'end', ph: 'Lời cảm ơn' },
      { key: 'body', role: 'body', x: c.x + c.w * 0.1, y: c.y + c.h * 0.4, w: c.w * 0.8, h: c.h * 0.5, align: 'center', valign: 'start', ph: 'Ảnh: …\nThực hiện: …' },
    ] };
  } },
  index:  { name: 'Mosaic ảnh', group: 'Đặc biệt', layout: g => {
    const c = g.c, th = Math.min(16, c.h * 0.1);
    return { photos: [], grid: { x: c.x, y: c.y + th + g.gap, w: c.w, h: c.h - th - g.gap }, texts: [
      { key: 'title', role: 'title', x: c.x, y: c.y, w: c.w, h: th, align: 'left', valign: 'end', ph: 'Mục lục ảnh', small: true },
    ] };
  } },
  blank:  { name: 'Trang trống', group: 'Đặc biệt', layout: () => ({ photos: [], texts: [] }) },
};
/* Layout used for new photo pages and automatic layout. */
FA.DEFAULT_TEMPLATE = 'grid2v';
const slotMemo = {};
FA.slotCount = t => {
  if (slotMemo[t] != null) return slotMemo[t];
  return slotMemo[t] = FA.TEMPLATES[t].layout({ W: 100, H: 100, c: { x: 0, y: 0, w: 100, h: 100 }, gap: 2, capH: 0, bleed: 0, isLeft: false }).photos.length;
};

FA.layoutPage = function (project, idx) {
  const s = project.settings, page = project.pages[idx], { W, H } = FA.pageDims(s);
  const isLeft = FA.isLeftPage(idx);
  const capH = s.caption.position === 'below' ? Math.max(0, +s.caption.height) : 0;
  const g = { W, H, c: FA.contentBox(s, isLeft), gap: Math.max(0, +s.gap), capH, bleed: Math.max(0, +s.bleed), isLeft };
  const L = FA.TEMPLATES[page.template].layout(g);
  return { W, H, isLeft, gap: g.gap, ...L };
};

/* ---------- photo inside a frame ----------
   crop: z (zoom ≥ 1 of cover/contain fit), u,v (pan in fractions of the
   image size, in the image's own axes), rot (deg), fit ('cover'|'contain').
   Returns image size (mm) and the offset of its centre from the frame centre. */
FA.placePhoto = function (fw, fh, pw, ph, crop) {
  const t = (crop.rot || 0) * Math.PI / 180, c = Math.abs(Math.cos(t)), s = Math.abs(Math.sin(t));
  const ex = (fw * c + fh * s) / 2, ey = (fw * s + fh * c) / 2;
  const k0 = crop.fit === 'contain'
    ? Math.min(fw / (pw * c + ph * s), fh / (pw * s + ph * c))
    : Math.max(2 * ex / pw, 2 * ey / ph);
  const k = k0 * Math.max(1, crop.z || 1);
  const iw = pw * k, ih = ph * k;
  let u = crop.u || 0, v = crop.v || 0;
  if (crop.fit === 'contain') { u = clamp(u, -0.5, 0.5); v = clamp(v, -0.5, 0.5); }
  else { const mu = Math.max(0, 0.5 - ex / iw), mv = Math.max(0, 0.5 - ey / ih); u = clamp(u, -mu, mu); v = clamp(v, -mv, mv); }
  const px = u * iw, py = v * ih, cs = Math.cos(t), sn = Math.sin(t);
  const dx = -(px * cs - py * sn), dy = -(px * sn + py * cs);
  return { iw, ih, dx, dy, u, v, rot: crop.rot || 0, dpi: pw / (iw / 25.4) };
};
/* Pan by a screen-space delta (mm). Mutates crop. */
FA.panCrop = function (crop, ddx, ddy, fw, fh, pw, ph) {
  const P = FA.placePhoto(fw, fh, pw, ph, crop), t = (crop.rot || 0) * Math.PI / 180, cs = Math.cos(t), sn = Math.sin(t);
  const lx = ddx * cs + ddy * sn, ly = -ddx * sn + ddy * cs;
  crop.u = P.u - lx / P.iw; crop.v = P.v - ly / P.ih;
  const Q = FA.placePhoto(fw, fh, pw, ph, crop); crop.u = Q.u; crop.v = Q.v;
};
FA.dpiClass = d => (d >= 250 ? 'good' : d >= 150 ? 'ok' : 'low');

/* ---------- rich-text caption sanitizer ----------
   Allows a small HTML subset so captions can be styled, and blocks scripts
   or anything that could run when a project file from elsewhere is opened. */
const OK_TAGS = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'S', 'DEL', 'BR', 'SPAN', 'SMALL', 'BIG', 'SUP', 'SUB', 'MARK', 'FONT']);
const OK_CSS = new Set(['color', 'background-color', 'font-weight', 'font-style', 'text-decoration', 'font-size', 'font-family', 'letter-spacing', 'text-transform', 'font-variant']);
function cleanStyle(st) {
  const out = [];
  String(st || '').split(';').forEach(d => {
    const i = d.indexOf(':'); if (i < 0) return;
    const k = d.slice(0, i).trim().toLowerCase(), v = d.slice(i + 1).trim();
    if (!OK_CSS.has(k) || /url\(|expression|javascript:|[<>"]/i.test(v) || v.length > 80) return;
    out.push(k + ':' + v);
  });
  return out.join(';');
}
FA.sanitize = function (src) {
  src = String(src || '');
  if (!src.trim()) return '';
  const doc = new DOMParser().parseFromString('<body>' + src.replace(/\r?\n/g, '<br>') + '</body>', 'text/html');
  const walk = node => {
    let html = '';
    node.childNodes.forEach(n => {
      if (n.nodeType === 3) { html += esc(n.nodeValue); return; }
      if (n.nodeType !== 1) return;
      const tag = n.tagName;
      if (!OK_TAGS.has(tag)) { html += walk(n); return; }
      if (tag === 'BR') { html += '<br/>'; return; }
      let style = cleanStyle(n.getAttribute('style'));
      if (tag === 'FONT') {
        const c = n.getAttribute('color'); if (c && /^[#\w(),.\s%]+$/.test(c)) style = 'color:' + c + (style ? ';' + style : '');
        html += '<span' + (style ? ' style="' + esc(style) + '"' : '') + '>' + walk(n) + '</span>'; return;
      }
      const t = tag.toLowerCase();
      html += '<' + t + (style ? ' style="' + esc(style) + '"' : '') + '>' + walk(n) + '</' + t + '>';
    });
    return html;
  };
  return walk(doc.body);
};
FA.plainText = src => { const d = new DOMParser().parseFromString('<body>' + String(src || '').replace(/\r?\n/g, '<br>') + '</body>', 'text/html'); d.querySelectorAll('br').forEach(b => b.replaceWith('\n')); return d.body.textContent; };

/* ---------- EXIF line ----------
   Printed on its own line under the caption, only for frames whose
   "In thông số chụp" box is ticked. Icons replace repeated labels. */
FA.EXIF_FIELDS = { datetime: 'Ngày giờ', camera: 'Máy ảnh', lens: 'Ống kính', focal: 'Tiêu cự (chỉ ống zoom)',
  aperture: 'Khẩu độ', shutter: 'Tốc độ', iso: 'ISO', gps: 'Toạ độ GPS' };
const pad = n => String(n).padStart(2, '0');
FA.isZoomLens = e => {
  if (!e) return false;
  if (Array.isArray(e.lensInfo) && e.lensInfo[0] && e.lensInfo[1]) return Math.abs(e.lensInfo[1] - e.lensInfo[0]) > 0.5;
  return /\d+(\.\d+)?\s*[-–~]\s*\d+(\.\d+)?\s*mm/i.test(e.lens || '');
};
FA.exifParts = function (photo, s) {
  const e = photo && photo.exif; if (!e) return [];
  const F = s.exif.fields, out = [];
  const d = photo.date ? new Date(photo.date) : null;
  if (F.datetime && d && !isNaN(d)) out.push({ icon: 'clock', text: `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}` });
  if (F.camera && e.camera) out.push({ icon: 'camera', text: e.camera });
  if (F.lens && e.lens) out.push({ icon: 'lens', text: e.lens });
  if (F.focal && e.focal && FA.isZoomLens(e)) out.push({ icon: 'focal', text: Math.round(e.focal) + 'mm' });
  if (F.aperture && e.f) out.push({ icon: null, text: 'f/' + (+e.f).toFixed(1).replace(/\.0$/, '') });
  if (F.shutter && e.shutter) out.push({ icon: null, text: e.shutter >= 1 ? (+e.shutter).toFixed(1).replace(/\.0$/, '') + 's' : '1/' + Math.round(1 / e.shutter) + 's' });
  if (F.iso && e.iso) out.push({ icon: 'iso', text: String(e.iso), plain: 'ISO' + e.iso });
  if (F.gps && e.lat != null && e.lon != null) out.push({ icon: 'pin',
    text: `${Math.abs(e.lat).toFixed(4)}°${e.lat >= 0 ? 'N' : 'S'} ${Math.abs(e.lon).toFixed(4)}°${e.lon >= 0 ? 'E' : 'W'}` });
  return out;
};
/* 16×16 line icons, stroke = currentColor */
FA.EXIF_ICONS = {
  clock:  '<circle cx="8" cy="8" r="6.2"/><path d="M8 4.6V8l2.4 1.6"/>',
  camera: '<rect x="1.6" y="4.6" width="12.8" height="8.6" rx="1.2"/><path d="M5.4 4.6l1.1-1.8h3l1.1 1.8"/><circle cx="8" cy="8.9" r="2.4"/>',
  lens:   '<circle cx="8" cy="8" r="6.2"/><circle cx="8" cy="8" r="3.2"/><circle cx="8" cy="8" r=".6"/>',
  focal:  '<path d="M1.8 8h12.4M4.6 5.2L1.8 8l2.8 2.8M11.4 5.2L14.2 8l-2.8 2.8"/>',
  iso:    '<rect x="2" y="3" width="12" height="10" rx="1"/><rect x="5" y="6" width="6" height="4"/>',
  pin:    '<path d="M8 14.4s4.6-4.2 4.6-7.6A4.6 4.6 0 0 0 3.4 6.8c0 3.4 4.6 7.6 4.6 7.6z"/><circle cx="8" cy="6.8" r="1.6"/>',
};
FA.iconSVG = (name, sizeCss) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="${sizeCss}" height="${sizeCss}" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.14em;margin-right:0.28em">${FA.EXIF_ICONS[name]}</svg>`;
FA.exifHTML = function (photo, s) {
  const parts = FA.exifParts(photo, s); if (!parts.length) return '';
  if (s.exif.labels === 'icon')
    return parts.map(p => `<span style="white-space:nowrap">${p.icon ? FA.iconSVG(p.icon, '1em') : ''}${esc(p.text)}</span>`).join('<span style="display:inline-block;width:0.9em"></span>');
  return parts.map(p => esc(p.plain || p.text)).join(' · ');
};
FA.readExif = async function (file) {
  try {
    if (!window.exifr) return null;
    const x = await exifr.parse(file, { tiff: true, exif: true, gps: true, interop: false, ifd1: false, xmp: false, icc: false, iptc: false });
    if (!x) return null;
    let camera = [x.Make, x.Model].filter(Boolean).join(' ').trim();
    if (x.Make && x.Model && String(x.Model).toLowerCase().startsWith(String(x.Make).toLowerCase())) camera = String(x.Model);
    const dt = x.DateTimeOriginal || x.CreateDate;
    const li = x.LensInfo || x.LensSpecification;
    return { camera: camera || null, lens: x.LensModel || null, focal: x.FocalLength || null, f: x.FNumber || null,
             shutter: x.ExposureTime || null, iso: x.ISO || null, date: dt instanceof Date && !isNaN(dt) ? dt.toISOString() : null,
             lensInfo: Array.isArray(li) ? li.slice(0, 4).map(Number) : null,
             lat: typeof x.latitude === 'number' && isFinite(x.latitude) ? x.latitude : null,
             lon: typeof x.longitude === 'number' && isFinite(x.longitude) ? x.longitude : null };
  } catch (e) { return null; }
};

/* ---------- page labels (numbers, header/footer tokens) ---------- */
const roman = n => { if (n <= 0) return String(n); const r = [[1000,'m'],[900,'cm'],[500,'d'],[400,'cd'],[100,'c'],[90,'xc'],[50,'l'],[40,'xl'],[10,'x'],[9,'ix'],[5,'v'],[4,'iv'],[1,'i']]; let s = ''; for (const [v, c] of r) while (n >= v) { s += c; n -= v; } return s; };
FA.pageNumberText = (project, idx) => {
  const pn = project.settings.pageNumber, n = idx + (+pn.start || 1);
  return pn.format === 'roman' ? roman(n) : String(n);
};
FA.fillTokens = (text, project, idx) => String(text || '')
  .replace(/\{page\}/g, FA.pageNumberText(project, idx))
  .replace(/\{total\}/g, String(project.pages.length))
  .replace(/\{title\}/g, FA.plainText(project.title));
/* Album title page, the blank page after it and mosaic pages never belong to a group. */
FA.isUngroupedPage = pg => pg.role === 'album-title' || pg.role === 'after-title' || pg.template === 'index';
/* Pages without header, footer or page number. */
FA.isPlainPage = pg => pg.role === 'album-title' || pg.role === 'after-title' || pg.template === 'cover' || pg.template === 'full';
FA.showsPageNumber = (project, idx) => {
  const pn = project.settings.pageNumber, t = project.pages[idx].template;
  if (!pn.enabled) return false;
  if (project.pages[idx].role === 'after-title') return false;
  if (pn.skipCover && project.pages[idx].role === 'album-title') return false;
  if (pn.skipCover && (t === 'cover' || t === 'full')) return false;
  if (pn.skipCredit && t === 'credit') return false;
  return true;
};

/* ---------- usage bookkeeping ---------- */
FA.usage = function (project) {
  const m = new Map();
  project.pages.forEach((pg, pi) => {
    if (pg.role === 'album-title') return;   // its photo is a free copy of any imported photo
    const n = FA.slotCount(pg.template);
    pg.items.slice(0, n).forEach((it, si) => { if (it.photo) { if (!m.has(it.photo)) m.set(it.photo, []); m.get(it.photo).push({ page: pi, slot: si }); } });
  });
  return m;
};

/* Photos shown on a mosaic page: every photo used in the album (or in one
   group, by the photo's own group), in order of first appearance, with the
   page it first appears on. */
FA.indexEntries = function (project, idx) {
  const pg = project.pages[idx], scope = pg.index.scope, seen = new Set(), out = [];
  project.pages.forEach((p, pi) => {
    if (p.role === 'album-title') return;
    p.items.slice(0, FA.slotCount(p.template)).forEach(it => {
      if (it.photo && !seen.has(it.photo)) {
        const ph = project.photos.find(x => x.id === it.photo);
        if (ph && (scope === 'album' || ph.group === scope)) { seen.add(it.photo); out.push({ photo: ph, page: pi }); }
      }
    });
  });
  return out;
};
/* Square-ish cells that fit n thumbnails into the grid box. */
FA.indexCells = function (project, idx, L, n) {
  const box = L.grid; if (!box || !n) return [];
  const numH = project.pages[idx].index.numbers ? Math.max(3, +project.settings.hf.size * PT * 1.6) : 0;
  const gap = Math.max(0, +project.pages[idx].index.gap || 0);
  let best = null;
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    const cw = (box.w - gap * (cols - 1)) / cols, ch = (box.h - gap * (rows - 1)) / rows - numH;
    const side = Math.min(cw, ch);
    if (side > 0 && (!best || side > best.side)) best = { cols, rows, side, cw };
  }
  if (!best) return [];
  const out = [];
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / best.cols), c = i % best.cols;
    const x = box.x + c * (best.cw + gap) + (best.cw - best.side) / 2, y = box.y + r * (best.side + numH + gap);
    out.push({ x, y, w: best.side, h: best.side, num: numH ? { x, y: y + best.side, w: best.side, h: numH } : null });
  }
  return out;
};

/* ---------- groups ---------- */
FA.groupName = (project, id) => { const g = project.groups.find(x => x.id === id); return g ? g.name : ''; };
FA.dayKey = iso => { const d = iso ? new Date(iso) : null; return d && !isNaN(d) ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}` : null; };

/* Rebuild the album page order by group: album title page (+ blank page)
   first, then photo pages of ungrouped photos, then each group (opening page
   + photo pages), then every other hand-made page (mosaic, credit…) in order.
   Captions, crops and EXIF choices are kept. */
FA.rebuildByGroups = function (project) {
  const s = project.settings, keep = new Map();
  project.pages.forEach(pg => { if (pg.role !== 'album-title') pg.items.forEach(it => { if (it.photo && !keep.has(it.photo)) keep.set(it.photo, it); }); });
  const oldTitles = new Map(project.pages.filter(p => p.role === 'group-title').map(p => [p.group, p]));
  const GRID = new Set(['grid4', 'grid1', 'grid2h', 'grid2v', 'grid3', 'grid6']);
  const head = project.pages.filter(p => p.role === 'album-title').concat(project.pages.filter(p => p.role === 'after-title'));
  // every other hand-made page (title, full-bleed, text, credit, mosaic…) is kept, in order, at the end
  const tail = project.pages.filter(p => !head.includes(p) && !GRID.has(p.template) && p.role !== 'group-title');
  const item = ph => keep.get(ph.id) ? Object.assign({}, keep.get(ph.id)) : FA.newItem(ph.id);
  const used = new Set(tail.flatMap(p => p.items.slice(0, FA.slotCount(p.template)).map(i => i.photo)).filter(Boolean));
  const pagesOf = (photos, group) => {
    const out = [];
    const per = FA.slotCount(FA.DEFAULT_TEMPLATE);
    for (let i = 0; i < photos.length; i += per) {
      const pg = FA.newPage(project, FA.DEFAULT_TEMPLATE); pg.group = group;
      photos.slice(i, i + per).forEach((ph, j) => { pg.items[j] = item(ph); });
      out.push(pg);
    }
    return out;
  };
  const sorted = FA.sortPhotos(project.photos, s.sortBy).filter(p => s.allowReuse || !used.has(p.id));
  const pages = [...head, ...pagesOf(sorted.filter(p => !p.group), null)];
  project.groups.forEach(g => {
    const photos = sorted.filter(p => p.group === g.id);
    if (!photos.length) return;
    let title = oldTitles.get(g.id), rest = photos;
    if (!title && s.groupTitle !== 'none') {
      title = FA.newPage(project, s.groupTitle); title.group = g.id; title.role = 'group-title';
      title.texts.title = esc(g.name);
    }
    if (title) {
      title.items = []; FA.fitItems({ ...project, pages: [] }, title);
      if (title.items.length) { title.items[0] = item(photos[0]); if (!s.allowReuse) rest = photos.slice(1); }
      pages.push(title);
    }
    pages.push(...pagesOf(rest, g.id));
  });
  project.pages = [...pages, ...tail];
};

/* Make page.items match the template slot count; extra photos go to the
   page's stash so switching back restores them. */
FA.fitItems = function (project, page) {
  const n = FA.slotCount(page.template);
  while (page.items.length > n) {
    const it = page.items.pop();
    if (it.photo) page.stash.unshift(it);
  }
  const used = FA.usage(project);
  while (page.items.length < n) {
    let it = null;
    while (page.stash.length && !it) {
      const cand = page.stash.shift();
      if (project.settings.allowReuse || !used.has(cand.photo)) it = cand;
    }
    page.items.push(it || FA.emptyItem());
  }
  page.stash = page.stash.filter(it => project.photos.some(p => p.id === it.photo)).slice(0, 12);
};

FA.newPage = (project, template = FA.DEFAULT_TEMPLATE, lookFrom = null) => {
  const pg = { id: uid('pg'), template, group: null, items: [], texts: {}, stash: [],
    look: deepClone((lookFrom && lookFrom.look) || project.settings.look), index: { scope: 'album', numbers: true, gap: 2 } };
  FA.fitItems(project, pg);
  return pg;
};

FA.sortPhotos = (photos, by) => photos.slice().sort((a, b) => {
  if (by === 'name') return a.name.localeCompare(b.name, undefined, { numeric: true });
  if (by === 'added') return (a.order || 0) - (b.order || 0);
  const da = a.date || '', db = b.date || '';
  return da === db ? a.name.localeCompare(b.name, undefined, { numeric: true }) : (da < db ? -1 : 1);
});

/* ---------- IndexedDB: scratch space for this page's photos ---------- */
const DB_NAME = 'foto-album', DB_VER = 1;
let dbp = null;
function db() {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, DB_VER);
    r.onupgradeneeded = () => { const d = r.result; if (!d.objectStoreNames.contains('blobs')) d.createObjectStore('blobs'); if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv'); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}
async function tx(store, mode, fn) {
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction(store, mode), st = t.objectStore(store); let out;
    Promise.resolve(fn(st)).then(v => { out = v; });
    t.oncomplete = () => res(out instanceof IDBRequest ? out.result : out);
    t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
  });
}
/* ---------- per-page session ----------
   The album lives only while the page is open; nothing is restored on the
   next visit. IndexedDB is just scratch space for photos (too large for
   memory), every key prefixed by a fresh id for this page. Each open page
   holds a Web Lock named after its id; on start, data whose lock nobody
   holds (closed tabs, older versions) is deleted, so open tabs never wipe
   each other. */
const LOCK = 'foto-album:';
const SID = 's' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
FA.sessionInit = async function () {
  const alive = new Set([SID]);
  const locks = navigator.locks && navigator.locks.request ? navigator.locks : null;
  if (locks) {
    await new Promise(res => {
      locks.request(LOCK + SID, lock => { res(); return new Promise(() => {}); }).catch(res);  // held until the page closes
    });
    try { (await locks.query()).held.forEach(l => { if (l.name.startsWith(LOCK)) alive.add(l.name.slice(LOCK.length)); }); } catch (e) { /* ignore */ }
  }
  for (const store of ['blobs', 'kv']) {
    const keys = await tx(store, 'readonly', st => st.getAllKeys());
    const stale = keys.filter(k => { const i = String(k).indexOf('/'); return i < 0 || !alive.has(String(k).slice(0, i)); });
    if (stale.length) await tx(store, 'readwrite', st => { stale.forEach(k => st.delete(k)); });
  }
};
const K = key => SID + '/' + key;
FA.store = {
  put: (store, key, val) => tx(store, 'readwrite', st => { st.put(val, K(key)); }),
  get: (store, key) => tx(store, 'readonly', st => st.get(K(key))),
  del: (store, key) => tx(store, 'readwrite', st => { st.delete(K(key)); }),
  clear: store => tx(store, 'readwrite', st => { st.delete(IDBKeyRange.bound(SID + '/', SID + '/\uffff')); }),
  keys: async store => (await tx(store, 'readonly', st => st.getAllKeys(IDBKeyRange.bound(SID + '/', SID + '/\uffff')))).map(k => String(k).slice(SID.length + 1)),
};
FA.blobKey = (photoId, kind) => photoId + ':' + kind;  // kind: orig | prev | thumb

/* ---------- history (undo / redo) ---------- */
FA.History = class {
  constructor(get, set, limit = 120) { this.get = get; this.set = set; this.limit = limit; this.undo = []; this.redo = []; this.last = JSON.stringify(get()); }
  commit() {
    const now = JSON.stringify(this.get());
    if (now === this.last) return false;
    this.undo.push(this.last); if (this.undo.length > this.limit) this.undo.shift();
    this.redo = []; this.last = now; return true;
  }
  back() { this.commit(); if (!this.undo.length) return false; this.redo.push(this.last); this.last = this.undo.pop(); this.set(JSON.parse(this.last)); return true; }
  fwd() { if (!this.redo.length) return false; this.undo.push(this.last); this.last = this.redo.pop(); this.set(JSON.parse(this.last)); return true; }
  reset() { this.undo = []; this.redo = []; this.last = JSON.stringify(this.get()); }
};
})();
