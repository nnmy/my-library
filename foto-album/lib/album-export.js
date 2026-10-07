/* =====================================================================
   Foto Album — import / export
   - Photo variants (thumbnail + preview) made on import
   - PDF via the browser print dialog (vector text)
   - PDF direct download (pages rasterized, pdf-lib)
   - PNG per page in a ZIP (fflate)
   - DOCX (docx.js) with floating images and text frames
   - Project file (.album.zip) that can be opened again
   ===================================================================== */
(function () {
'use strict';
const FA = window.FA, { PT } = FA;

FA.download = function (blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
};
FA.slug = s => (FA.plainText(s) || 'album').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
  .replace(/[^\w-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'album';

/* ---------- import: decode once, make thumbnail and editor preview ---------- */
function scaled(bmp, max, type, q) {
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(bmp.width * k)); cv.height = Math.max(1, Math.round(bmp.height * k));
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, 0, 0, cv.width, cv.height);
  return FA.canvasBlob(cv, type, q);
}
FA.makeVariants = async function (blob) {
  const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  try {
    const out = { w: bmp.width, h: bmp.height };
    out.thumb = await scaled(bmp, 360, 'image/jpeg', 0.82);
    out.prev = await scaled(bmp, 1800, 'image/jpeg', 0.88);
    return out;
  } finally { bmp.close && bmp.close(); }
};
FA.isHeic = f => /\.(heic|heif)$/i.test(f.name || '') || /hei[cf]/i.test(f.type || '');

/* ---------- PDF via print dialog ---------- */
let printCleanup = null;
FA.printAlbum = async function (project, dpi, progress) {
  if (printCleanup) printCleanup();
  const s = project.settings, includeBleed = s.export.includeBleed && +s.bleed > 0;
  const off = includeBleed ? +s.bleed : 0, { W, H } = FA.pageDims(s);
  const cache = new FA.BitmapCache(), urls = [];
  const root = document.createElement('div'); root.id = 'fa-print';
  try {
    for (let i = 0; i < project.pages.length; i++) {
      progress && progress(i, project.pages.length, 'Chuẩn bị trang ' + (i + 1));
      const baked = await FA.bakePage(project, i, dpi, cache);
      const map = {}, imap = {};
      for (const si in baked) { const u = URL.createObjectURL(baked[si].blob); urls.push(u); map[si] = u; }
      const ix = await FA.bakeIndex(project, i, dpi);
      for (const id in ix) { const u = URL.createObjectURL(ix[id]); urls.push(u); imap[id] = u; }
      const wrap = document.createElement('div'); wrap.className = 'fa-print-page';
      wrap.innerHTML = FA.pageHTML(project, i, { s: 96 / 25.4, mode: 'export', off, src: si => (map[si] ? { url: map[si], baked: true } : null),
        indexSrc: ph => (imap[ph.id] ? { url: imap[ph.id], baked: true } : null) });
      root.appendChild(wrap);
    }
  } finally { cache.clear(); }
  const st = document.createElement('style'); st.id = 'fa-print-style';
  st.textContent = `@page { size: ${W + 2 * off}mm ${H + 2 * off}mm; margin: 0; }`;
  document.head.appendChild(st); document.body.appendChild(root);
  await Promise.all([...root.querySelectorAll('img')].map(im => (im.decode ? im.decode().catch(() => {}) : null)));
  document.body.classList.add('fa-printing');
  printCleanup = () => { document.body.classList.remove('fa-printing'); root.remove(); st.remove(); urls.forEach(u => URL.revokeObjectURL(u)); printCleanup = null; window.removeEventListener('afterprint', onAfter); };
  const onAfter = () => setTimeout(() => printCleanup && printCleanup(), 300);
  window.addEventListener('afterprint', onAfter);
  progress && progress(project.pages.length, project.pages.length, 'Mở hộp thoại in…');
  window.print();
};

/* ---------- PDF direct (raster pages) ---------- */
FA.exportPdfDirect = async function (project, dpi, progress) {
  const s = project.settings, includeBleed = s.export.includeBleed && +s.bleed > 0, off = includeBleed ? +s.bleed : 0;
  const { W, H } = FA.pageDims(s), cache = new FA.BitmapCache();
  const pdf = await PDFLib.PDFDocument.create();
  pdf.setTitle(FA.plainText(project.title)); pdf.setCreator('Foto Album');
  try {
    for (let i = 0; i < project.pages.length; i++) {
      progress && progress(i, project.pages.length, 'Vẽ trang ' + (i + 1));
      const cv = await FA.rasterPage(project, i, dpi, cache, includeBleed);
      const bytes = new Uint8Array(await (await FA.canvasBlob(cv, 'image/jpeg', 0.92)).arrayBuffer());
      cv.width = cv.height = 1;
      const img = await pdf.embedJpg(bytes);
      const pw = (W + 2 * off) / PT, ph = (H + 2 * off) / PT;
      const pg = pdf.addPage([pw, ph]);
      pg.drawImage(img, { x: 0, y: 0, width: pw, height: ph });
      if (off) pg.setTrimBox(off / PT, off / PT, W / PT, H / PT);
    }
  } finally { cache.clear(); }
  progress && progress(project.pages.length, project.pages.length, 'Đóng gói PDF…');
  return new Blob([await pdf.save()], { type: 'application/pdf' });
};

/* ---------- PNG per page, zipped ---------- */
const zipAsync = (files, opts) => new Promise((res, rej) => fflate.zip(files, opts || { level: 0 }, (e, d) => (e ? rej(e) : res(d))));
const unzipAsync = u8 => new Promise((res, rej) => fflate.unzip(u8, (e, d) => (e ? rej(e) : res(d))));

FA.exportPngZip = async function (project, dpi, progress) {
  const s = project.settings, includeBleed = s.export.includeBleed && +s.bleed > 0, cache = new FA.BitmapCache(), files = {};
  const digits = String(project.pages.length).length < 3 ? 3 : String(project.pages.length).length;
  try {
    for (let i = 0; i < project.pages.length; i++) {
      progress && progress(i, project.pages.length, 'Vẽ trang ' + (i + 1));
      const cv = await FA.rasterPage(project, i, dpi, cache, includeBleed);
      files['trang-' + String(i + 1).padStart(digits, '0') + '.png'] = new Uint8Array(await (await FA.canvasBlob(cv, 'image/png')).arrayBuffer());
      cv.width = cv.height = 1;
    }
  } finally { cache.clear(); }
  progress && progress(project.pages.length, project.pages.length, 'Nén ZIP…');
  return new Blob([await zipAsync(files)], { type: 'application/zip' });
};

/* ---------- DOCX ---------- */
const MM_TWIP = 1440 / 25.4, MM_EMU = 36000, MM_PX = 96 / 25.4;
let colorCtx = null;
function hexColor(c) {
  if (!c) return undefined;
  colorCtx = colorCtx || document.createElement('canvas').getContext('2d');
  colorCtx.fillStyle = '#000000'; colorCtx.fillStyle = c;
  const v = colorCtx.fillStyle;
  return /^#[0-9a-f]{6}$/i.test(v) ? v.slice(1).toUpperCase() : undefined;
}
function cssSizeToPt(v, basePt) {
  const m = /^([\d.]+)(px|pt|em|rem|%)?$/.exec(String(v).trim()); if (!m) return basePt;
  const n = +m[1];
  switch (m[2]) { case 'px': return n * 0.75; case 'pt': return n; case 'em': case 'rem': return n * basePt; case '%': return n / 100 * basePt; default: return n * 0.75; }
}
/* sanitized HTML -> array of docx TextRun */
function htmlRuns(html, base) {
  const D = window.docx, runs = [];
  const doc = new DOMParser().parseFromString('<body>' + html + '</body>', 'text/html');
  const walk = (node, st) => {
    node.childNodes.forEach(n => {
      if (n.nodeType === 3) {
        if (n.nodeValue) runs.push(new D.TextRun({ text: n.nodeValue, bold: st.bold, italics: st.italic, underline: st.underline ? {} : undefined,
          strike: st.strike, color: st.color, size: Math.round(st.size * 2), font: st.font, superScript: st.sup, subScript: st.sub,
          shading: st.bg ? { type: D.ShadingType.CLEAR, fill: st.bg, color: 'auto' } : undefined }));
        return;
      }
      if (n.nodeType !== 1) return;
      const t = n.tagName;
      if (t === 'BR') { runs.push(new D.TextRun({ text: '', break: 1, size: Math.round(st.size * 2), font: st.font })); return; }
      const s2 = Object.assign({}, st);
      if (t === 'B' || t === 'STRONG') s2.bold = true;
      if (t === 'I' || t === 'EM') s2.italic = true;
      if (t === 'U') s2.underline = true;
      if (t === 'S' || t === 'DEL') s2.strike = true;
      if (t === 'SMALL') s2.size = st.size * 0.85;
      if (t === 'BIG') s2.size = st.size * 1.2;
      if (t === 'SUP') s2.sup = true;
      if (t === 'SUB') s2.sub = true;
      if (t === 'MARK') s2.bg = 'FFF59D';
      const css = n.getAttribute('style') || '';
      css.split(';').forEach(d => {
        const i = d.indexOf(':'); if (i < 0) return;
        const k = d.slice(0, i).trim(), v = d.slice(i + 1).trim();
        if (k === 'color') s2.color = hexColor(v) || s2.color;
        else if (k === 'background-color') s2.bg = hexColor(v) || s2.bg;
        else if (k === 'font-weight') s2.bold = /bold|[6-9]00/.test(v);
        else if (k === 'font-style') s2.italic = /italic|oblique/.test(v);
        else if (k === 'text-decoration') { if (/underline/.test(v)) s2.underline = true; if (/line-through/.test(v)) s2.strike = true; }
        else if (k === 'font-size') s2.size = cssSizeToPt(v, st.size);
        else if (k === 'font-family') s2.font = v.split(',')[0].replace(/["']/g, '').trim() || s2.font;
      });
      walk(n, s2);
    });
  };
  walk(doc.body, base);
  return runs;
}

/* EXIF icons as small PNGs for Word (inline pictures). */
const iconCache = new Map();
async function iconPng(name, color) {
  const key = name + color; if (iconCache.has(key)) return iconCache.get(key);
  const svg = FA.iconSVG(name, '64').replace('stroke="currentColor"', `stroke="${color}"`).replace(/style="[^"]*"/, '');
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); });
  const cv = document.createElement('canvas'); cv.width = cv.height = 64; cv.getContext('2d').drawImage(img, 0, 0, 64, 64);
  const bytes = new Uint8Array(await (await FA.canvasBlob(cv, 'image/png')).arrayBuffer());
  iconCache.set(key, bytes); return bytes;
}
async function exifRuns(photo, s) {
  const D = window.docx, parts = FA.exifParts(photo, s); if (!parts.length) return [];
  const f = FA.FONTS[s.exif.font] || FA.FONTS.sans, color = hexColor(s.exif.color) || '777777';
  const base = { size: Math.round(+s.exif.size * 2), font: f.docx, color, italics: !!s.exif.italic };
  if (s.exif.labels !== 'icon') return [new D.TextRun({ ...base, text: parts.map(p => p.plain || p.text).join(' · ') })];
  const px = Math.max(6, Math.round(+s.exif.size * 96 / 72 * 0.95)), runs = [];
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (i) runs.push(new D.TextRun({ ...base, text: '   ' }));
    if (p.icon) runs.push(new D.ImageRun({ type: 'png', data: await iconPng(p.icon, '#' + color), transformation: { width: px, height: px } }));
    runs.push(new D.TextRun({ ...base, text: (p.icon ? '\u00a0' : '') + p.text }));
  }
  return runs;
}

FA.exportDocx = async function (project, dpi, progress) {
  const D = window.docx, { W, H } = FA.pageDims(project.settings);
  const cache = new FA.BitmapCache(), sections = [];
  const s0 = project.settings, fCap = FA.FONTS[s0.caption.font], fTxt = FA.FONTS[s0.text.font], fHf = FA.FONTS[s0.hf.font];
  const frame = (x, y, w, h) => ({ type: 'absolute', position: { x: Math.round(x * MM_TWIP), y: Math.round(y * MM_TWIP) },
    width: Math.round(w * MM_TWIP), height: Math.round(h * MM_TWIP), rule: D.HeightRule.EXACT,
    anchor: { horizontal: D.FrameAnchorType.PAGE, vertical: D.FrameAnchorType.PAGE } });
  const AL = a => (a === 'right' ? D.AlignmentType.RIGHT : a === 'center' ? D.AlignmentType.CENTER : a === 'justify' ? D.AlignmentType.JUSTIFIED : D.AlignmentType.LEFT);
  const floatImg = (bytes, type, x, y, w, h, z, behind) => new D.ImageRun({ type, data: bytes,
    transformation: { width: Math.max(1, Math.round(w * MM_PX)), height: Math.max(1, Math.round(h * MM_PX)) },
    floating: { horizontalPosition: { relative: D.HorizontalPositionRelativeFrom.PAGE, offset: Math.round(x * MM_EMU) },
      verticalPosition: { relative: D.VerticalPositionRelativeFrom.PAGE, offset: Math.round(y * MM_EMU) },
      wrap: { type: D.TextWrappingType.NONE }, allowOverlap: true, behindDocument: !!behind, zIndex: z } });

  // page background as a full-page picture (Word only prints page colour in some views)
  const bgCache = new Map();
  const bgBytes = async color => {
    const hx = hexColor(color); if (!hx || hx === 'FFFFFF') return null;
    if (bgCache.has(hx)) return bgCache.get(hx);
    const cv = document.createElement('canvas'); cv.width = cv.height = 8;
    const c = cv.getContext('2d'); c.fillStyle = '#' + hx; c.fillRect(0, 0, 8, 8);
    const b = new Uint8Array(await (await FA.canvasBlob(cv, 'image/png')).arrayBuffer()); bgCache.set(hx, b); return b;
  };
  const alignFor = (a, isLeft) => (a === 'outer' ? (isLeft ? 'left' : 'right') : a === 'inner' ? (isLeft ? 'right' : 'left') : a || 'center');

  try {
    for (let i = 0; i < project.pages.length; i++) {
      progress && progress(i, project.pages.length, 'Trang ' + (i + 1));
      const page = project.pages[i], L = FA.layoutPage(project, i), s = FA.eff(project, i);
      const baked = await FA.bakePage(project, i, dpi, cache, true);
      const imgs = [], paras = [];
      const bg = await bgBytes(s.background);
      if (bg) imgs.push(floatImg(bg, 'png', 0, 0, W, H, 0, true));
      for (let si = 0; si < L.photos.length; si++) {
        const fr = L.photos[si], item = page.items[si];
        if (baked[si]) {
          // clip full-bleed frames to the trim size (DOCX has no bleed)
          const x0 = Math.max(0, fr.x), y0 = Math.max(0, fr.y), x1 = Math.min(W, fr.x + fr.w), y1 = Math.min(H, fr.y + fr.h);
          let bytes = new Uint8Array(await baked[si].blob.arrayBuffer()), type = baked[si].transparent ? 'png' : 'jpg';
          if (x0 !== fr.x || y0 !== fr.y || x1 !== fr.x + fr.w || y1 !== fr.y + fr.h) {
            const bmp = await createImageBitmap(baked[si].blob), kx = bmp.width / fr.w, ky = bmp.height / fr.h;
            const cv = document.createElement('canvas'); cv.width = Math.round((x1 - x0) * kx); cv.height = Math.round((y1 - y0) * ky);
            cv.getContext('2d').drawImage(bmp, -(x0 - fr.x) * kx, -(y0 - fr.y) * ky); bmp.close && bmp.close();
            bytes = new Uint8Array(await (await FA.canvasBlob(cv, type === 'png' ? 'image/png' : 'image/jpeg', 0.92)).arrayBuffer());
          }
          imgs.push(floatImg(bytes, type, x0, y0, x1 - x0, y1 - y0, 10 + si, false));
        }
        if (fr.cap && s.caption.position === 'below' && item) {
          const photo = item.photo ? project.photos.find(p => p.id === item.photo) : null;
          const html = FA.sanitize(item.caption);
          const ex = item.exif && photo ? await exifRuns(photo, s) : [];
          const runs = html ? htmlRuns(html, { size: +s.caption.size, font: fCap.docx, color: hexColor(s.caption.color) }) : [];
          if (runs.length && ex.length) runs.push(new D.TextRun({ text: '', break: 1, size: Math.round(s.exif.size * 2) }));
          if (runs.length || ex.length) paras.push(new D.Paragraph({ frame: frame(fr.cap.x, fr.cap.y, fr.cap.w, fr.cap.h), alignment: AL(s.caption.align),
            spacing: { before: Math.round(0.8 * MM_TWIP), after: 0, line: 240 }, children: [...runs, ...ex] }));
        }
      }
      if (L.grid) {
        const ents = FA.indexEntries(project, i), cells = FA.indexCells(project, i, L, ents.length), ix = await FA.bakeIndex(project, i, dpi);
        for (let j = 0; j < cells.length; j++) {
          const c = cells[j], b = ix[ents[j].photo.id];
          if (b) imgs.push(floatImg(new Uint8Array(await b.arrayBuffer()), 'jpg', c.x, c.y, c.w, c.h, 10 + j, false));
          if (c.num) paras.push(new D.Paragraph({ frame: frame(c.num.x, c.num.y, c.num.w, c.num.h), alignment: D.AlignmentType.CENTER, spacing: { before: 0, after: 0 },
            children: [new D.TextRun({ text: FA.pageNumberText(project, ents[j].page), size: Math.round(s.hf.size * 1.8), font: fHf.docx, color: hexColor(s.hf.color) })] }));
        }
      }
      L.texts.forEach(t => {
        const html = FA.sanitize(page.texts[t.key] || ''); if (!html) return;
        const title = t.role === 'title';
        paras.push(new D.Paragraph({ frame: frame(t.x, t.y, t.w, t.h), alignment: AL(t.align), spacing: { before: 0, after: 0 },
          children: htmlRuns(html, { size: +(title ? s.text.titleSize : s.text.bodySize), font: fTxt.docx, color: hexColor(s.text.color), bold: title }) }));
      });
      const c = FA.contentBox(s, L.isLeft), hideHF = FA.isPlainPage(page);
      // narrow: separate frame at one edge (identical adjacent frames would be merged by Word)
      const hf = (y0, y1, align, text, narrow) => paras.push(new D.Paragraph({
        frame: narrow ? frame(align === 'left' ? c.x : align === 'right' ? c.x + c.w - 24 : c.x + c.w / 2 - 12, y0, 24, y1 - y0) : frame(c.x, y0, c.w, y1 - y0), alignment: AL(align),
        spacing: { before: Math.max(0, Math.round(((y1 - y0) / 2 - s.hf.size * PT * 0.6) * MM_TWIP)), after: 0 },
        children: [new D.TextRun({ text, size: Math.round(s.hf.size * 2), font: fHf.docx, color: hexColor(s.hf.color) })] }));
      if (s.header.enabled && !hideHF) { const t = FA.fillTokens(s.header.text, project, i); if (t) hf(0, +s.margin.top, alignFor(s.header.align, L.isLeft), t); }
      const pnOn = FA.showsPageNumber(project, i), pa = alignFor(s.pageNumber.align, L.isLeft), fa = alignFor(s.footer.align, L.isLeft);
      const ft = s.footer.enabled && !hideHF ? FA.fillTokens(s.footer.text, project, i) : '';
      if (ft && pnOn && fa === pa) hf(H - s.margin.bottom, H, fa, ft + '    ' + FA.pageNumberText(project, i));
      else { if (ft) hf(H - s.margin.bottom, H, fa, ft); if (pnOn) hf(H - s.margin.bottom, H, pa, FA.pageNumberText(project, i), !!ft); }

      sections.push({
        properties: { page: { size: { width: Math.round(W * MM_TWIP), height: Math.round(H * MM_TWIP) },
          margin: { top: 0, right: 0, bottom: 0, left: 0, header: 0, footer: 0, gutter: 0 } } },
        // framed paragraphs first: Word and LibreOffice anchor a frame to the next normal paragraph
        children: [...paras, new D.Paragraph({ children: imgs.length ? imgs : [new D.TextRun('')], spacing: { before: 0, after: 0, line: 20, lineRule: 'exact' } })],
      });
    }
  } finally { cache.clear(); }
  progress && progress(project.pages.length, project.pages.length, 'Đóng gói DOCX…');
  const doc = new D.Document({ creator: 'Foto Album', title: FA.plainText(project.title), sections });
  return D.Packer.toBlob(doc);
};

/* ---------- project file ---------- */
const extOf = type => ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif', 'image/bmp': 'bmp' }[type] || 'bin');
FA.saveProjectFile = async function (project, progress) {
  const files = {}, enc = fflate.strToU8;
  const meta = { format: 'foto-album', version: project.version, saved: new Date().toISOString() };
  files['album.json'] = enc(JSON.stringify(meta, null, 1));
  files['project.json'] = enc(JSON.stringify(project, null, 1));
  for (let i = 0; i < project.photos.length; i++) {
    const p = project.photos[i];
    progress && progress(i, project.photos.length, p.name);
    const b = await FA.store.get('blobs', FA.blobKey(p.id, 'orig'));
    if (b) files['photos/' + p.id + '.' + extOf(p.type)] = [new Uint8Array(await b.arrayBuffer()), { level: 0 }];
  }
  return new Blob([await zipAsync(files, { level: 6 })], { type: 'application/zip' });
};

/* Returns { project, blobs: Map(photoId -> Blob) } — caller stores them. */
FA.readProjectFile = async function (file) {
  const u8 = new Uint8Array(await file.arrayBuffer());
  let files;
  try { files = await unzipAsync(u8); } catch (e) { throw new Error('File này không phải là ZIP hợp lệ.'); }
  const pj = files['project.json'];
  if (!pj) throw new Error('Không thấy project.json trong file. Đây có phải file dự án Foto Album không?');
  let project;
  try { project = JSON.parse(fflate.strFromU8(pj)); } catch (e) { throw new Error('project.json bị hỏng.'); }
  if (!project || !Array.isArray(project.pages) || !Array.isArray(project.photos)) throw new Error('Cấu trúc dự án không đúng.');
  if ((project.version || 1) > 1) throw new Error('Dự án được lưu bởi phiên bản mới hơn của công cụ.');
  const blobs = new Map();
  project.photos = project.photos.filter(p => p && typeof p.id === 'string' && /^[\w-]+$/.test(p.id));
  project.photos.forEach(p => {
    const key = Object.keys(files).find(k => k.startsWith('photos/' + p.id + '.'));
    if (key) blobs.set(p.id, new Blob([files[key]], { type: p.type || 'image/jpeg' }));
  });
  return { project: FA.normalizeProject(project), blobs };
};
})();
