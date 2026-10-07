/* =====================================================================
   Foto Album — rendering
   One function (FA.pageHTML) draws a page as self-contained HTML with
   inline styles. The editor, the print view and the PNG/PDF rasterizer
   all use it, so what you see is what gets exported.
   ===================================================================== */
(function () {
'use strict';
const FA = window.FA, { esc, PT } = FA;

const r2 = v => Math.round(v * 100) / 100;

function shapeRadius(s, w, h, k) {
  const b = s.border;
  if (b.shape === 'ellipse') return '50%';
  if (b.shape === 'rounded') return r2(Math.min(+b.radius || 0, Math.min(w, h) / 2) * k) + 'px';
  return '0';
}

function alignFor(a, isLeft) {
  if (a === 'outer') return isLeft ? 'left' : 'right';
  if (a === 'inner') return isLeft ? 'right' : 'left';
  return a || 'center';
}

/* EXIF line: own font, size, colour; always on a separate line under the caption. */
function exifLineHTML(s, item, photo, k) {
  if (!item || !item.exif || !photo) return '';
  const ex = FA.exifHTML(photo, s); if (!ex) return '';
  const f = FA.FONTS[s.exif.font] || FA.FONTS.sans;
  return `<div style="font-family:${esc(f.css)};font-size:${r2(+s.exif.size * PT * k)}px;line-height:1.3;color:${esc(s.exif.color)};font-style:${s.exif.italic ? 'italic' : 'normal'};margin-top:${r2(0.4 * k)}px">${ex}</div>`;
}

/* o = { s: px per mm, mode: 'edit'|'export', off: mm of bleed around the page,
         src: slotIndex -> { url, baked } | null, selected: slotIndex, dpi: bool } */
FA.pageHTML = function (project, idx, o) {
  const s = FA.eff(project, idx), page = project.pages[idx], L = FA.layoutPage(project, idx);
  const k = o.s, off = o.off || 0, edit = o.mode === 'edit';
  const X = mm => r2((mm + off) * k), D = mm => r2(mm * k);
  const photoById = id => project.photos.find(p => p.id === id);
  const fCap = FA.FONTS[s.caption.font] || FA.FONTS.serif, fTxt = FA.FONTS[s.text.font] || FA.FONTS.serif, fHf = FA.FONTS[s.hf.font] || FA.FONTS.sans;
  const filt = FA.filterCss(s);
  let h = '';

  // photos
  L.photos.forEach((fr, si) => {
    const item = page.items[si] || FA.emptyItem(), photo = item.photo ? photoById(item.photo) : null;
    const rad = fr.bleed ? '0' : shapeRadius(s, fr.w, fr.h, k);
    const sel = edit && o.selected === si;
    h += `<div data-slot="${si}" style="position:absolute;left:${X(fr.x)}px;top:${X(fr.y)}px;width:${D(fr.w)}px;height:${D(fr.h)}px;overflow:hidden;border-radius:${rad};${edit && !photo ? 'background:repeating-linear-gradient(45deg,#ececec 0 6px,#f6f6f6 6px 12px);' : ''}">`;
    if (photo) {
      const src = o.src && o.src(si, item, photo, fr);
      if (src && src.baked) {
        h += `<img src="${esc(src.url)}" alt="" style="position:absolute;left:0;top:0;width:100%;height:100%;display:block"/>`;
      } else if (src) {
        const P = FA.placePhoto(fr.w, fr.h, photo.w, photo.h, item.crop);
        h += `<img src="${esc(src.url)}" alt="" draggable="false" style="position:absolute;left:${D(fr.w / 2 + P.dx)}px;top:${D(fr.h / 2 + P.dy)}px;width:${D(P.iw)}px;height:${D(P.ih)}px;max-width:none;transform:translate(-50%,-50%) rotate(${P.rot}deg);${filt ? 'filter:' + filt + ';' : ''}display:block;user-select:none;pointer-events:none"/>`;
        if (edit && o.dpi) h += `<span class="fa-dpi fa-dpi-${FA.dpiClass(P.dpi)}">${Math.round(P.dpi)} dpi</span>`;
        if (edit && photo.group) { const gn = FA.groupName(project, photo.group); if (gn) h += `<span class="fa-grp" title="Nhóm ${esc(gn)}">${esc(gn.length > 18 ? gn.slice(0, 18) + '…' : gn)}</span>`; }
      }
    } else if (edit) {
      h += `<span class="fa-empty">+</span>`;
    }
    const bw = fr.bleed || !photo ? 0 : Math.max(0, +s.border.width || 0);
    if (bw > 0) h += `<div style="position:absolute;left:0;top:0;right:0;bottom:0;border:${D(bw)}px solid ${esc(s.border.color)};border-radius:${rad};pointer-events:none"></div>`;
    if (sel) h += `<div class="fa-sel"></div>`;
    h += `</div>`;

    // caption
    if (fr.cap && s.caption.position === 'below') {
      const capTxt = FA.sanitize(item.caption), exL = exifLineHTML(s, item, photo, k);
      const fs = D(+s.caption.size * PT), any = capTxt || exL;
      h += `<div data-cap="${si}" style="position:absolute;left:${X(fr.cap.x)}px;top:${X(fr.cap.y)}px;width:${D(fr.cap.w)}px;height:${D(fr.cap.h)}px;overflow:hidden;box-sizing:border-box;padding-top:${D(1.2)}px;text-align:${esc(s.caption.align)};${edit ? 'outline:1px dotted rgba(0,0,0,' + (any ? '0' : '.18') + ');outline-offset:-1px;' : ''}">${capTxt ? `<div style="font-family:${esc(fCap.css)};font-size:${fs}px;line-height:1.25;color:${esc(s.caption.color)}">${capTxt}</div>` : ''}${exL}</div>`;
    }
  });

  // text blocks
  L.texts.forEach(t => {
    const raw = page.texts[t.key] || '';
    const html = FA.sanitize(raw);
    const size = t.role === 'title' ? s.text.titleSize : s.text.bodySize;
    const jc = t.valign === 'end' ? 'flex-end' : t.valign === 'center' ? 'center' : 'flex-start';
    const body = html || (edit ? `<span style="opacity:.3">${esc(t.ph).replace(/\n/g, '<br/>')}</span>` : '');
    h += `<div data-text="${esc(t.key)}" style="position:absolute;left:${X(t.x)}px;top:${X(t.y)}px;width:${D(t.w)}px;height:${D(t.h)}px;overflow:hidden;display:flex;flex-direction:column;justify-content:${jc};font-family:${esc(fTxt.css)};font-size:${D(+size * PT)}px;line-height:${t.role === 'title' ? 1.12 : 1.4};font-weight:${t.role === 'title' ? 600 : 400};color:${esc(s.text.color)};text-align:${t.align}"><div>${body}</div></div>`;
  });

  // index page: thumbnails of every photo used in the album or group
  if (L.grid) {
    const ents = FA.indexEntries(project, idx), cells = FA.indexCells(project, idx, L, ents.length);
    if (!ents.length && edit) h += `<div style="position:absolute;left:${X(L.grid.x)}px;top:${X(L.grid.y)}px;width:${D(L.grid.w)}px;height:${D(L.grid.h)}px;display:grid;place-items:center;color:#9aa0a8;font:${D(3.6)}px system-ui,sans-serif;outline:1px dotted rgba(0,0,0,.18)">Chưa có ảnh nào được đặt vào trang</div>`;
    cells.forEach((c, i) => {
      const e = ents[i], src = o.indexSrc && o.indexSrc(e.photo);
      if (src) h += `<img src="${esc(src.url)}" alt="" draggable="false" style="position:absolute;left:${X(c.x)}px;top:${X(c.y)}px;width:${D(c.w)}px;height:${D(c.h)}px;object-fit:cover;display:block;max-width:none;${!src.baked && filt ? 'filter:' + filt + ';' : ''}pointer-events:none"/>`;
      if (c.num) h += `<div style="position:absolute;left:${X(c.num.x)}px;top:${X(c.num.y)}px;width:${D(c.num.w)}px;height:${D(c.num.h)}px;display:flex;align-items:center;justify-content:center;font-family:${esc(fHf.css)};font-size:${D(+s.hf.size * PT * 0.9)}px;color:${esc(s.hf.color)}">${esc(FA.pageNumberText(project, e.page))}</div>`;
    });
  }

  // header / footer / page number
  const c = FA.contentBox(s, L.isLeft), hfFs = D(+s.hf.size * PT);
  const band = (y0, y1, align, text) => `<div style="position:absolute;left:${X(c.x)}px;top:${X(y0)}px;width:${D(c.w)}px;height:${D(y1 - y0)}px;display:flex;align-items:center;justify-content:${align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center'};font-family:${esc(fHf.css)};font-size:${hfFs}px;color:${esc(s.hf.color)};white-space:pre">${text}</div>`;
  const hideHF = FA.isPlainPage(page);
  if (s.header.enabled && !hideHF) {
    const t = FA.fillTokens(s.header.text, project, idx);
    if (t) h += band(0, +s.margin.top, alignFor(s.header.align, L.isLeft), esc(t));
  }
  const pnOn = FA.showsPageNumber(project, idx), pnAlign = alignFor(s.pageNumber.align, L.isLeft);
  const fAlign = alignFor(s.footer.align, L.isLeft);
  const fText = s.footer.enabled && !hideHF ? FA.fillTokens(s.footer.text, project, idx) : '';
  const yF0 = L.H - (+s.margin.bottom), yF1 = L.H;
  if (fText && pnOn && fAlign === pnAlign) h += band(yF0, yF1, fAlign, esc(fText) + '    ' + esc(FA.pageNumberText(project, idx)));
  else {
    if (fText) h += band(yF0, yF1, fAlign, esc(fText));
    if (pnOn) h += band(yF0, yF1, pnAlign, esc(FA.pageNumberText(project, idx)));
  }

  return `<div data-page="${idx}" style="position:relative;width:${D(L.W + 2 * off)}px;height:${D(L.H + 2 * off)}px;overflow:hidden;background:${esc(s.background)};box-sizing:border-box">${h}</div>`;
};

/* Editor-only guides: margins (magenta), binding gutter (violet hatch),
   bleed (red, outside edges), drawn as an SVG over the page. */
FA.guidesSVG = function (project, idx, k) {
  const s = project.settings, g = s.guides, { W, H } = FA.pageDims(s), isLeft = FA.isLeftPage(idx);
  const c = FA.contentBox(s, isLeft), gut = +s.gutter, bl = +s.bleed;
  let svg = `<svg class="fa-guides" width="${r2(W * k)}" height="${r2(H * k)}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">`;
  svg += `<defs><pattern id="hatch${idx}" width="2" height="2" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="2" height="2" fill="rgba(124,77,255,.08)"/><line x1="0" y1="0" x2="0" y2="2" stroke="rgba(124,77,255,.45)" stroke-width=".5"/></pattern></defs>`;
  if (g.gutter && gut > 0) svg += `<rect x="${isLeft ? W - gut : 0}" y="0" width="${gut}" height="${H}" fill="url(#hatch${idx})"/>`;
  if (g.margins) svg += `<rect x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}" fill="none" stroke="#e0399b" stroke-width="${0.9 / k}" stroke-dasharray="${4 / k} ${3 / k}"/>`;
  svg += `</svg>`;
  if (g.bleed && bl > 0) {
    // outside edges only (not across the spine)
    const L = -bl * k, T = -bl * k, Wp = W * k, Hp = H * k, B = bl * k;
    const box = `position:absolute;top:${T}px;height:${Hp + 2 * B}px;border:1px dashed #e5322d;pointer-events:none;`;
    svg += isLeft
      ? `<div class="fa-bleed" style="${box}left:${L}px;width:${Wp + B}px;border-right:0"></div>`
      : `<div class="fa-bleed" style="${box}left:0;width:${Wp + B}px;border-left:0"></div>`;
  }
  return svg;
};

/* ---------- photo sources ---------- */
FA.loadBitmap = async function (photoId, kind = 'orig') {
  let blob = await FA.store.get('blobs', FA.blobKey(photoId, kind));
  if (!blob) blob = await FA.store.get('blobs', FA.blobKey(photoId, 'orig'));
  if (!blob) blob = await FA.store.get('blobs', FA.blobKey(photoId, 'prev'));
  if (!blob) throw new Error('Không tìm thấy ảnh gốc trong bộ nhớ trình duyệt.');
  return createImageBitmap(blob, { imageOrientation: 'from-image' });
};

const HAS_CTX_FILTER = (() => { try { const c = document.createElement('canvas').getContext('2d'); return 'filter' in c && (c.filter = 'grayscale(1)', c.filter === 'grayscale(1)'); } catch (e) { return false; } })();

function applyMatrix(ctx, w, h, M) {
  const d = ctx.getImageData(0, 0, w, h), p = d.data;
  for (let i = 0; i < p.length; i += 4) {
    const r = p[i], g = p[i + 1], b = p[i + 2];
    p[i]     = M[0] * r + M[1] * g + M[2] * b + M[3];
    p[i + 1] = M[4] * r + M[5] * g + M[6] * b + M[7];
    p[i + 2] = M[8] * r + M[9] * g + M[10] * b + M[11];
  }
  ctx.putImageData(d, 0, 0);
}

function shapePath(ctx, x, y, w, h, s, pxmm) {
  ctx.beginPath();
  const b = s.border;
  if (b.shape === 'ellipse') ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  else if (b.shape === 'rounded') {
    const r = Math.min((+b.radius || 0) * pxmm, w / 2, h / 2);
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  } else ctx.rect(x, y, w, h);
}

/* Render the cropped/rotated/filtered photo for one frame at print resolution.
   withShape: also clip to the frame shape and draw the border (used for DOCX). */
FA.bakeSlot = function (bitmap, photo, fr, crop, s, dpi, withShape) {
  if (fr.bleed) withShape = false;
  const pxmm = dpi / 25.4;
  const MAX = 9000;
  let cw = Math.max(2, Math.round(fr.w * pxmm)), ch = Math.max(2, Math.round(fr.h * pxmm));
  const sc = Math.min(1, MAX / Math.max(cw, ch)); cw = Math.round(cw * sc); ch = Math.round(ch * sc);
  const k = pxmm * sc;
  const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
  const ctx = cv.getContext('2d');
  const transparent = withShape && s.border.shape !== 'rect';
  if (transparent) { shapePath(ctx, 0, 0, cw, ch, s, k); ctx.save(); ctx.clip(); }
  ctx.fillStyle = s.background; ctx.fillRect(0, 0, cw, ch);
  const P = FA.placePhoto(fr.w, fr.h, photo.w, photo.h, crop);
  const css = FA.filterCss(s);
  ctx.save();
  if (css && HAS_CTX_FILTER) ctx.filter = css;
  ctx.translate(cw / 2 + P.dx * k, ch / 2 + P.dy * k);
  ctx.rotate(P.rot * Math.PI / 180);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, -P.iw * k / 2, -P.ih * k / 2, P.iw * k, P.ih * k);
  ctx.restore();
  if (css && !HAS_CTX_FILTER) applyMatrix(ctx, cw, ch, FA.filterMatrix(css));
  if (transparent) ctx.restore();
  const bw = withShape ? Math.max(0, +s.border.width || 0) * k : 0;
  if (bw > 0) {
    ctx.save(); ctx.strokeStyle = s.border.color; ctx.lineWidth = bw;
    shapePath(ctx, bw / 2, bw / 2, cw - bw, ch - bw, s, k); ctx.stroke(); ctx.restore();
  }
  return { canvas: cv, transparent };
};

FA.canvasBlob = (cv, type = 'image/jpeg', q = 0.92) => new Promise((res, rej) => cv.toBlob(b => (b ? res(b) : rej(new Error('Không tạo được ảnh từ canvas.'))), type, q));
FA.blobToDataURL = b => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(b); });

/* Bitmap cache used during one export run (originals can be large). */
FA.BitmapCache = class {
  constructor(max = 4, kind = 'orig') { this.max = max; this.kind = kind; this.m = new Map(); }
  async get(id) {
    if (this.m.has(id)) { const b = this.m.get(id); this.m.delete(id); this.m.set(id, b); return b; }
    const b = await FA.loadBitmap(id, this.kind); this.m.set(id, b);
    while (this.m.size > this.max) { const [k0, v0] = this.m.entries().next().value; v0.close && v0.close(); this.m.delete(k0); }
    return b;
  }
  clear() { this.m.forEach(b => b.close && b.close()); this.m.clear(); }
};

/* Bake every photo of a page. Returns slotIndex -> Blob */
FA.bakePage = async function (project, idx, dpi, cache, withShape = false) {
  const L = FA.layoutPage(project, idx), page = project.pages[idx], out = {}, s = FA.eff(project, idx);
  for (let si = 0; si < L.photos.length; si++) {
    const it = page.items[si]; if (!it || !it.photo) continue;
    const photo = project.photos.find(p => p.id === it.photo); if (!photo) continue;
    const bmp = await cache.get(photo.id);
    const { canvas, transparent } = FA.bakeSlot(bmp, photo, L.photos[si], it.crop, s, dpi, withShape);
    out[si] = { blob: await FA.canvasBlob(canvas, transparent ? 'image/png' : 'image/jpeg', 0.92), w: canvas.width, h: canvas.height, transparent };
    canvas.width = canvas.height = 1;
  }
  return out;
};

/* Index page thumbnails (square, from the preview copy). Returns photoId -> Blob */
FA.bakeIndex = async function (project, idx, dpi) {
  const L = FA.layoutPage(project, idx), out = {}; if (!L.grid) return out;
  const ents = FA.indexEntries(project, idx), cells = FA.indexCells(project, idx, L, ents.length), s = FA.eff(project, idx);
  const cache = new FA.BitmapCache(2, 'prev');
  try {
    for (let i = 0; i < cells.length; i++) {
      const ph = ents[i].photo, bmp = await cache.get(ph.id);
      const { canvas } = FA.bakeSlot(bmp, ph, { w: cells[i].w, h: cells[i].h }, FA.defaultCrop(), s, Math.min(dpi, 200), false);
      out[ph.id] = await FA.canvasBlob(canvas, 'image/jpeg', 0.88); canvas.width = canvas.height = 1;
    }
  } finally { cache.clear(); }
  return out;
};

/* Rasterize one page (HTML -> SVG foreignObject -> canvas). */
FA.rasterPage = async function (project, idx, dpi, cache, includeBleed) {
  const off = includeBleed ? Math.max(0, +project.settings.bleed || 0) : 0;
  const baked = await FA.bakePage(project, idx, dpi, cache);
  const urls = {};
  for (const si in baked) urls[si] = await FA.blobToDataURL(baked[si].blob);
  const ix = await FA.bakeIndex(project, idx, dpi), ixu = {};
  for (const id in ix) ixu[id] = await FA.blobToDataURL(ix[id]);
  const k = dpi / 25.4;
  const html = FA.pageHTML(project, idx, { s: k, mode: 'export', off, src: si => (urls[si] ? { url: urls[si], baked: true } : null),
    indexSrc: ph => (ixu[ph.id] ? { url: ixu[ph.id], baked: true } : null) });
  const { W, H } = FA.pageDims(project.settings);
  const wpx = Math.round((W + 2 * off) * k), hpx = Math.round((H + 2 * off) * k);
  const doc = new DOMParser().parseFromString('<body>' + html + '</body>', 'text/html');
  const node = doc.body.firstElementChild;
  node.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
  const xhtml = new XMLSerializer().serializeToString(node);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${wpx}" height="${hpx}"><foreignObject x="0" y="0" width="100%" height="100%">${xhtml}</foreignObject></svg>`;
  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  const img = new Image(); img.decoding = 'sync';
  await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('Trình duyệt không vẽ được trang ' + (idx + 1) + '.')); img.src = url; });
  if (img.decode) { try { await img.decode(); } catch (e) { /* some engines reject decode for SVG */ } }
  const cv = document.createElement('canvas'); cv.width = wpx; cv.height = hpx;
  const ctx = cv.getContext('2d');
  const bg = FA.eff(project, idx).background;
  const paint = () => { ctx.clearRect(0, 0, wpx, hpx); ctx.fillStyle = bg; ctx.fillRect(0, 0, wpx, hpx); ctx.drawImage(img, 0, 0, wpx, hpx); };
  paint();
  // Safari sometimes paints nested images only on the second draw
  await new Promise(r => setTimeout(r, 30)); paint();
  return cv;
};
})();
