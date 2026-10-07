/* =====================================================================
   Foto Album — user interface
   ===================================================================== */
(function () {
'use strict';
const FA = window.FA, { esc, clamp } = FA;
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

let P = FA.newProject();               // the project (plain JSON, autosaved)
const ui = { page: 0, slot: null, zoom: 1, k: 1, trayGroup: 'all', lookOpen: false };
const urls = { thumb: {}, prev: {} };  // photoId -> object URL
let hist = null;

const el = {
  side: $('.side'), insp: $('#insp'), stage: $('#stage'), wrap: $('#spreadWrap'), empty: $('#emptyState'),
  where: $('#whereLabel'), pageCount: $('#inPageCount'), saved: $('#savedLabel'),
  undo: $('#btnUndo'), redo: $('#btnRedo'), prev: $('#btnPrev'), next: $('#btnNext'),
  filePhotos: $('#filePhotos'), fileProject: $('#fileProject'),
  busy: $('#busy'), busyTitle: $('#busyTitle'), busyBar: $('#busyBar'), busyText: $('#busyText'), toast: $('#toast'),
};
const S = () => P.settings;
const curPage = () => P.pages[ui.page];
const photoById = id => P.photos.find(p => p.id === id);

/* ---------- feedback ---------- */
let toastT = 0;
function toast(msg, err = false) {
  el.toast.textContent = msg; el.toast.classList.toggle('err', err); el.toast.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(() => el.toast.classList.remove('on'), err ? 6000 : 3200);
}
const busy = {
  show(title) { el.busyTitle.textContent = title; el.busyBar.style.width = '0'; el.busyText.textContent = ''; el.busy.hidden = false; },
  step(i, n, text) { el.busyBar.style.width = (n ? Math.round(i / n * 100) : 0) + '%'; el.busyText.textContent = text || ''; },
  hide() { el.busy.hidden = true; },
};

/* ---------- persistence ----------
   Nothing is kept after the page closes. The label tells whether the
   current album has been saved to a project file. */
function save() { syncSavedLabel(); }
function syncSavedLabel() {
  const dirty = P.photos.length && JSON.stringify(P) !== savedSnap;
  el.saved.textContent = dirty ? 'Chưa lưu file dự án' : P.photos.length ? 'Đã lưu file dự án' : '';
  el.saved.classList.toggle('dirty', !!dirty);
}
function commit() { if (hist.commit()) save(); syncUndo(); }
let commitT = 0;
const commitSoon = (ms = 700) => { clearTimeout(commitT); commitT = setTimeout(commit, ms); };
function syncUndo() { if (!hist) return; el.undo.disabled = !hist.undo.length && JSON.stringify(P) === hist.last; el.redo.disabled = !hist.redo.length; }

function dropUrls() { for (const kind of ['thumb', 'prev']) { Object.values(urls[kind]).forEach(u => URL.revokeObjectURL(u)); urls[kind] = {}; } }

/* ---------- selection & navigation ---------- */
function clampSel() {
  if (!P.pages.length) { ui.page = 0; ui.slot = null; return; }
  ui.page = clamp(ui.page, 0, P.pages.length - 1);
  if (ui.slot != null && ui.slot >= FA.slotCount(curPage().template)) ui.slot = null;
}
function select(idx, slot) { ui.page = idx; ui.slot = slot; clampSel(); refresh({ trays: false }); }
function goSpread(delta) {
  const sp = FA.spreads(P.pages.length); if (!sp.length) return;
  const si = clamp(FA.spreadOf(ui.page) + delta, 0, sp.length - 1);
  const [a, b] = sp[si]; ui.page = a != null ? a : b; ui.slot = null; refresh({ trays: false });
}

/* ---------- rendering ---------- */
let rafId = 0, pending = { spread: false, trays: false };
function refresh(o = {}) {
  pending.spread = true; if (o.trays !== false) pending.trays = true;
  if (rafId) return;
  rafId = requestAnimationFrame(() => {
    rafId = 0; if (!hist) return; clampSel();
    if (pending.spread) renderSpread();
    if (pending.trays) renderTrays();
    pending = { spread: false, trays: false };
    renderTop(); renderInspector(); syncSettingsUI(); syncUndo(); schedulePagesTray();
  });
}

/* ---------- page thumbnails tray ----------
   Every page drawn small with the same renderer as the editor, grouped in
   spreads. Rebuilt shortly after the album changes; the current spread is
   highlighted on every refresh. */
const PAGE_TH = 76;   // thumbnail height, px
let pagesKey = '', pagesT = 0;
function schedulePagesTray() {
  const tray = $('[data-tray="pages"]');
  markCurrentPage();
  if (tray.classList.contains('min')) return;
  const key = JSON.stringify([P.pages, P.settings, P.title, P.groups, P.photos.length]);
  if (key === pagesKey) return;
  clearTimeout(pagesT);
  pagesT = setTimeout(() => { pagesKey = key; renderPagesTray(); }, pagesKey ? 300 : 0);
}
function renderPagesTray() {
  const tray = $('[data-tray="pages"]'), strip = $('[data-strip]', tray);
  $('[data-count]', tray).textContent = P.pages.length;
  if (!P.pages.length) { strip.innerHTML = ''; return; }
  const { W, H } = FA.pageDims(S()), k = PAGE_TH / H, w = (W * k).toFixed(1);
  const src = (si, item, photo) => ({ url: urls.thumb[photo.id] || '' });
  const one = idx => {
    if (idx == null) return `<div class="pt ghost" style="width:${w}px;height:${PAGE_TH}px"></div>`;
    const pg = P.pages[idx], gn = pg.group ? FA.groupName(P, pg.group) : '';
    const lock = pg.role === 'album-title' || pg.role === 'after-title';
    return `<div class="pt" role="button" tabindex="0" data-goto="${idx}" ${lock ? '' : 'draggable="true"'} title="${esc(pageLabel(idx).replace(/<[^>]*>/g, ''))}" style="width:${w}px;height:${PAGE_TH}px">`
      + `<div class="pt-in">${FA.pageHTML(P, idx, { s: k, mode: 'export', src, indexSrc: ph => ({ url: urls.thumb[ph.id] || '' }) })}</div>`
      + (gn ? `<span class="gtag">${esc(gn.length > 8 ? gn.slice(0, 8) + '…' : gn)}</span>` : '') + `</div>`;
  };
  strip.innerHTML = FA.spreads(P.pages.length).map(([a, b]) => {
    const nums = [a, b].filter(x => x != null).map(x => x + 1);
    return `<div class="pspread" data-spread="${a != null ? a : b}"><div class="pair">${one(a)}${one(b)}</div><span class="pnum">${nums.join('–')}</span></div>`;
  }).join('');
  markCurrentPage();
}
function markCurrentPage() {
  const strip = $('[data-tray="pages"] [data-strip]');
  const cur = FA.spreads(P.pages.length)[FA.spreadOf(ui.page)] || [];
  $$('.pt[data-goto]', strip).forEach(t => t.classList.toggle('cur', +t.dataset.goto === ui.page));
  $$('.pspread', strip).forEach(sp => {
    const on = cur.includes(+sp.dataset.spread);
    if (on && !sp.classList.contains('cur')) sp.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    sp.classList.toggle('cur', on);
  });
}
function movePage(from, to) {
  const head = headCount();
  if (from < head || to < head) { toast('Trang tiêu đề album (và trang trống sau nó) luôn đứng đầu.'); return; }
  if (from === to) return;
  const [pg] = P.pages.splice(from, 1);
  P.pages.splice(to, 0, pg);
  ui.page = to; ui.slot = null;
  commit(); refresh({ trays: false });
}

function renderSpread() {
  const n = P.pages.length;
  el.empty.hidden = n > 0;
  if (!n) { el.wrap.innerHTML = ''; return; }
  const { W, H } = FA.pageDims(S());
  const r = el.stage.getBoundingClientRect();
  const availW = Math.max(200, r.width - 72), availH = Math.max(160, r.height - 78);
  const k = ui.k = Math.max(0.4, Math.min(availW / (2 * W), availH / H) * ui.zoom);
  const sp = FA.spreads(n)[FA.spreadOf(ui.page)];
  const dpiOn = S().guides.dpi;
  let h = '<div class="spread">', labels = '';
  sp.forEach((idx, side) => {
    const cls = side === 0 ? 'left' : 'right';
    const st = `width:${(W * k).toFixed(2)}px;height:${(H * k).toFixed(2)}px`;
    if (idx == null) { h += `<div class="leaf ghost" style="${st}"></div>`; labels += '<span></span>'; return; }
    h += `<div class="leaf ${cls}${idx === ui.page ? ' current' : ''}" data-leaf="${idx}" style="${st}">`;
    h += FA.pageHTML(P, idx, { s: k, mode: 'edit', selected: idx === ui.page ? ui.slot : null, dpi: dpiOn,
      src: (si, item, photo) => ({ url: urls.prev[photo.id] || urls.thumb[photo.id] || '' }),
      indexSrc: photo => ({ url: urls.thumb[photo.id] || urls.prev[photo.id] || '' }) });
    h += FA.guidesSVG(P, idx, k) + '</div>';
    labels += `<span>${pageLabel(idx)}</span>`;
  });
  h += '</div>';
  el.wrap.innerHTML = h + `<div class="labels" style="width:${(2 * W * k).toFixed(2)}px">${labels}</div>`;
  $$('[data-leaf]', el.wrap).forEach(leaf => {
    const pg = P.pages[+leaf.dataset.leaf];
    $$('[data-slot]', leaf).forEach(sl => {
      const it = pg.items[+sl.dataset.slot];
      sl.classList.toggle('has-photo', !!(it && it.photo));
      sl.classList.toggle('is-sel', +leaf.dataset.leaf === ui.page && +sl.dataset.slot === ui.slot);
    });
    $$('[data-cap], [data-text]', leaf).forEach(c => {
      const inner = c.matches('[data-text]') ? c.firstElementChild : c;
      c.classList.toggle('over', !!inner && inner.scrollHeight > c.clientHeight + 1);
    });
  });
}
function pageLabel(idx) {
  const pg = P.pages[idx], extra = pg.role === 'album-title' ? ' (tiêu đề album)' : pg.role === 'after-title' ? ' (trống)' : pg.template === 'cover' ? ' (bìa)' : '';
  return 'Trang ' + (idx + 1) + extra + (pg.group ? ' · ' + esc(FA.groupName(P, pg.group)) : '');
}

/* Fast path while dragging / zooming a photo: restyle one <img>. */
function updateSlotImg(idx, si) {
  const slotEl = el.wrap.querySelector(`[data-leaf="${idx}"] [data-slot="${si}"]`); if (!slotEl) return;
  const img = slotEl.querySelector('img'); const it = P.pages[idx].items[si]; const ph = it && photoById(it.photo);
  if (!img || !ph) return;
  const fr = FA.layoutPage(P, idx).photos[si], k = ui.k, Pp = FA.placePhoto(fr.w, fr.h, ph.w, ph.h, it.crop);
  Object.assign(img.style, { left: (fr.w / 2 + Pp.dx) * k + 'px', top: (fr.h / 2 + Pp.dy) * k + 'px', width: Pp.iw * k + 'px', height: Pp.ih * k + 'px',
    transform: `translate(-50%,-50%) rotate(${Pp.rot}deg)` });
  const b = slotEl.querySelector('.fa-dpi');
  if (b) { b.textContent = Math.round(Pp.dpi) + ' dpi'; b.className = 'fa-dpi fa-dpi-' + FA.dpiClass(Pp.dpi); }
  syncInspector();
}

function renderTop() {
  const n = P.pages.length, sp = FA.spreads(n), cur = FA.spreadOf(ui.page);
  if (!n) el.where.textContent = 'Chưa có trang';
  else {
    const [a, b] = sp[cur], nums = [a, b].filter(x => x != null).map(x => x + 1);
    el.where.textContent = (nums.length === 2 ? `Trang ${nums[0]}–${nums[1]}` : `Trang ${nums[0]}`) + ` / ${n}`;
  }
  el.prev.disabled = !n || cur <= 0; el.next.disabled = !n || cur >= sp.length - 1;
  if (document.activeElement !== el.pageCount) el.pageCount.value = n;
}

/* ---------- photo trays & groups list ---------- */
const trayMatch = p => ui.trayGroup === 'all' || (ui.trayGroup === 'none' ? !p.group : p.group === ui.trayGroup);
function groupOptions(withAll) {
  return (withAll ? '<option value="all">Tất cả</option>' : '') + '<option value="none">Không nhóm</option>' +
    P.groups.map(g => `<option value="${g.id}">${esc(g.name)}</option>`).join('');
}
function renderTrays() {
  if (ui.trayGroup !== 'all' && ui.trayGroup !== 'none' && !P.groups.some(g => g.id === ui.trayGroup)) ui.trayGroup = 'all';
  const use = FA.usage(P), sorted = FA.sortPhotos(P.photos, S().sortBy).filter(trayMatch);
  const onPage = new Set((curPage() ? curPage().items : []).map(i => i.photo).filter(Boolean));
  const unused = sorted.filter(p => !use.has(p.id)), used = sorted.filter(p => use.has(p.id));
  const thumb = (p, isUsed) => {
    const where = use.get(p.id) || [];
    const tag = isUsed ? (where.length > 1 ? `<span class="tag multi">×${where.length}</span>` : `<span class="tag">tr. ${where[0].page + 1}</span>`) : '';
    const del = isUsed ? '' : `<button class="del" type="button" data-del="${p.id}" title="Xoá khỏi album" aria-label="Xoá ${esc(p.name)} khỏi album">✕</button>`;
    const gn = p.group ? FA.groupName(P, p.group) : '';
    const grp = gn ? ' · nhóm ' + gn : '';
    const gtag = isUsed && gn ? `<span class="gtag">${esc(gn.length > 8 ? gn.slice(0, 8) + '…' : gn)}</span>` : '';
    return `<div class="thumb${onPage.has(p.id) ? ' in-page' : ''}" role="button" tabindex="0" draggable="true" data-photo="${p.id}" title="${esc(p.name + grp)}"><img src="${urls.thumb[p.id] || ''}" alt="${esc(p.name)}" loading="lazy">${gtag}${tag}${del}</div>`;
  };
  const tu = $('[data-tray="unused"]'), td = $('[data-tray="used"]');
  $('[data-strip]', tu).innerHTML = unused.map(p => thumb(p, false)).join('');
  $('[data-strip]', td).innerHTML = used.map(p => thumb(p, true)).join('');
  $('[data-strip]', tu).dataset.empty = P.photos.length ? 'Không có ảnh chưa dùng ở đây.' : 'Chưa có ảnh nào.';
  $('[data-strip]', td).dataset.empty = 'Chưa đặt ảnh nào vào trang.';
  $('[data-count]', tu).textContent = unused.length; $('[data-count]', td).textContent = used.length;
  const allUnused = P.photos.filter(p => !use.has(p.id)).length;
  $('#photoStat').textContent = P.photos.length ? `${P.photos.length} ảnh, ${allUnused} chưa dùng.` : 'Chưa có ảnh.';
  const tg = $('#selTrayGroup'); tg.innerHTML = groupOptions(true); tg.value = ui.trayGroup;
  renderGroups(); titlePhotoUI();
}
const GROUP_TITLE_CHOICES = ['title', 'text', 'cover', 'grid1', 'none'];
function renderGroupTitleTiles() {
  const box = $('#gTitleTiles'), cur = S().groupTitle;
  box.innerHTML = GROUP_TITLE_CHOICES.map(t => {
    const name = { title: 'Tiêu đề', text: 'Văn bản', cover: 'Bìa', grid1: '1 ảnh', none: 'Không có' }[t];
    const icon = t === 'none' ? '<svg viewBox="0 0 10 13" aria-hidden="true"><path d="M2 2l6 9M8 2l-6 9" stroke="#b8bec7" stroke-width=".6"/></svg>' : tplIcon(t);
    return `<button type="button" class="tpl" role="radio" data-gtitle="${t}" aria-checked="${cur === t}" aria-pressed="${cur === t}" title="${esc(name)}">${icon}<span>${esc(name)}</span></button>`;
  }).join('');
}
function renderGroups() {
  renderGroupTitleTiles();
  const box = $('#groupList');
  if (document.activeElement && box.contains(document.activeElement)) return;  // don't fight typing
  if (!P.groups.length) { box.innerHTML = '<p class="hint">Chưa có nhóm. Album có thể chia ảnh thành nhóm (một chuyến đi, một ngày, một người…); mỗi nhóm mở đầu bằng một trang riêng.</p>'; return; }
  box.innerHTML = P.groups.map(g => {
    const n = P.photos.filter(p => p.group === g.id).length;
    return `<div class="grp grp5" data-group-drop="${g.id}"><input type="text" data-gname="${g.id}" value="${esc(g.name)}" aria-label="Tên nhóm"><span class="grp-n">${n}</span>
      <button class="ic sm" type="button" data-editgroup="${g.id}" title="Chọn lại ảnh của nhóm" aria-label="Chọn lại ảnh của nhóm">✎</button>
      <button class="ic sm" type="button" data-gogroup="${g.id}" title="Tới trang đầu của nhóm" aria-label="Tới nhóm">↗</button>
      <button class="ic sm" type="button" data-delgroup="${g.id}" title="Xoá nhóm (ảnh vẫn giữ)" aria-label="Xoá nhóm">✕</button></div>`;
  }).join('');
}

/* ---------- placing photos ---------- */
function assignPhoto(pageIdx, si, photoId) {
  const pg = P.pages[pageIdx]; FA.fitItems(P, pg);
  const target = pg.items[si]; if (!target) return false;
  if (pg.role === 'album-title') {   // any imported photo, even one used elsewhere
    if (target.photo === photoId) return false;
    pg.items[si] = Object.assign(FA.newItem(photoId), { caption: target.caption }); return true;
  }
  if (!S().allowReuse) {
    const where = (FA.usage(P).get(photoId) || [])[0];
    if (where) {
      if (where.page === pageIdx && where.slot === si) return false;
      const srcPg = P.pages[where.page], srcItem = srcPg.items[where.slot];
      srcPg.items[where.slot] = target.photo ? target : FA.emptyItem();
      pg.items[si] = srcItem;
      return true;
    }
  }
  pg.items[si] = Object.assign(FA.newItem(photoId), { caption: target.photo ? '' : target.caption });
  return true;
}
function placeFromTray(photoId) {
  const pg = curPage();
  if (!pg) { toast('Hãy thêm một trang trước.'); return; }
  let si = ui.slot;
  if (si == null) {
    const n = FA.slotCount(pg.template);
    si = pg.items.slice(0, n).findIndex(i => !i.photo);
    if (si < 0) {
      const where = (FA.usage(P).get(photoId) || [])[0];
      if (where) { select(where.page, where.slot); return; }
      toast(n ? 'Trang này đã đầy. Chọn một khung để thay ảnh.' : 'Mẫu trang này không có khung ảnh.'); return;
    }
  }
  if (assignPhoto(ui.page, si, photoId)) { ui.slot = si; commit(); refresh(); }
}
/* First photos of the album (or of a group that has no pages yet) are laid
   out automatically: optional group title page, then pages in the default layout (2 stacked). */
function layoutNew(photos, groupId) {
  photos = FA.sortPhotos(photos, S().sortBy);
  if (!photos.length) return 0;
  const first = P.pages.length, look = curPage() || null;
  if (groupId && S().groupTitle !== 'none') {
    const t = FA.newPage(P, S().groupTitle, look); t.group = groupId; t.role = 'group-title';
    t.texts.title = esc(FA.groupName(P, groupId));
    if (FA.slotCount(t.template)) { t.items[0] = FA.newItem(photos[0].id); if (!S().allowReuse) photos = photos.slice(1); }
    P.pages.push(t);
  }
  const per = FA.slotCount(FA.DEFAULT_TEMPLATE);
  for (let i = 0; i < photos.length; i += per) {
    const pg = FA.newPage(P, FA.DEFAULT_TEMPLATE, look); pg.group = groupId || null;
    photos.slice(i, i + per).forEach((p, j) => { pg.items[j] = FA.newItem(p.id); });
    P.pages.push(pg);
  }
  ui.page = first; ui.slot = null;
  return P.pages.length - first;
}

/* ---------- import photos ---------- */
async function importFiles(fileList) {
  const files = [...fileList];
  const heic = files.filter(FA.isHeic);
  const imgs = files.filter(f => !FA.isHeic(f) && /^image\//.test(f.type) && !/svg/.test(f.type));
  if (!imgs.length) {
    toast(heic.length ? 'Trình duyệt chưa đọc được ảnh HEIC. Hãy chuyển sang JPEG trước (Ảnh trên iPhone: Cài đặt › Camera › Định dạng › Tương thích nhất).' : 'Không có file ảnh nào được chọn.', true);
    return;
  }
  const group = null;
  const sigs = new Set(P.photos.map(p => p.sig));
  busy.show('Đang thêm ảnh');
  let dup = 0; const failed = [], added = [];
  let order = P.photos.reduce((m, p) => Math.max(m, p.order || 0), 0);
  for (let i = 0; i < imgs.length; i++) {
    const f = imgs[i], sig = f.name + '|' + f.size + '|' + f.lastModified;
    busy.step(i, imgs.length, f.name);
    if (sigs.has(sig)) { dup++; continue; }
    try {
      const v = await FA.makeVariants(f);
      const exif = await FA.readExif(f);
      const id = FA.uid('ph');
      await FA.store.put('blobs', FA.blobKey(id, 'orig'), new Blob([f], { type: f.type }));
      await FA.store.put('blobs', FA.blobKey(id, 'prev'), v.prev);
      await FA.store.put('blobs', FA.blobKey(id, 'thumb'), v.thumb);
      urls.prev[id] = URL.createObjectURL(v.prev); urls.thumb[id] = URL.createObjectURL(v.thumb);
      const ph = { id, sig, name: f.name, type: f.type, size: f.size, w: v.w, h: v.h,
        date: (exif && exif.date) || null, exif, order: ++order, group };
      P.photos.push(ph); added.push(ph);
      sigs.add(sig);
    } catch (e) { failed.push(f.name); }
  }
  busy.hide();
  let msg = `Đã thêm ${added.length} ảnh.`;
  const fresh = added.length && added.length === P.photos.length;
  if (fresh) { layoutNew(added, group); ensureTitlePages(); ui.page = 0; msg += ` Đã tạo ${P.pages.length} trang.`; }
  else if (added.length) msg += ' Ảnh mới nằm trong khay Chưa dùng.';
  if (dup) msg += ` Bỏ qua ${dup} ảnh đã có.`;
  if (heic.length) msg += ` Bỏ qua ${heic.length} ảnh HEIC (hãy chuyển sang JPEG).`;
  if (failed.length) msg += ` Không đọc được: ${failed.slice(0, 3).join(', ')}${failed.length > 3 ? '…' : ''}.`;
  toast(msg, !added.length);
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  commit(); refresh(); storageStat();
}

function deletePhoto(id) {
  const ph = photoById(id); if (!ph) return;
  P.pages.forEach(pg => {
    pg.items.forEach(it => { if (it.photo === id) { it.photo = null; it.crop = FA.defaultCrop(); it.exif = false; } });
    pg.stash = pg.stash.filter(it => it.photo !== id);
  });
  P.photos = P.photos.filter(p => p.id !== id);
  const gone = pruneGroups();
  commit(); refresh();
  toast(`Đã xoá “${ph.name}” khỏi album. Bấm Hoàn tác nếu xoá nhầm.` + gone);
}

/* Remove stored files no longer referenced by the project. */
async function collectGarbage() {
  try {
    const keep = new Set(P.photos.map(p => p.id));
    const keys = await FA.store.keys('blobs');
    for (const k of keys) { const id = String(k).split(':')[0]; if (!keep.has(id)) await FA.store.del('blobs', k); }
  } catch (e) { /* not critical */ }
}
async function storageStat() {
  const out = $('#storageStat');
  if (!navigator.storage || !navigator.storage.estimate) { out.textContent = ''; return; }
  try { const e = await navigator.storage.estimate(); out.textContent = `Bộ nhớ trình duyệt đang dùng: ${(e.usage / 1048576).toFixed(0)} MB.`; } catch (e) { /* ignore */ }
}

/* ---------- album title page (page 1) and optional blank page after it ---------- */
function ensureTitlePages() {
  const s = S();
  if (!P.photos.length && !P.pages.some(p => p.role === 'album-title')) return;
  let ti = P.pages.findIndex(p => p.role === 'album-title');
  if (s.albumTitle && ti < 0) {
    const pg = FA.newPage(P, 'cover', P.pages.find(p => !p.role)); pg.role = 'album-title';
    pg.texts.title = esc(P.title);
    const first = FA.sortPhotos(P.photos, s.sortBy)[0];
    if (first && FA.slotCount('cover')) pg.items[0] = FA.newItem(first.id);
    P.pages.unshift(pg); ti = 0;
  } else if (!s.albumTitle && ti >= 0) { P.pages.splice(ti, 1); ti = -1; }
  else if (ti > 0) { P.pages.unshift(P.pages.splice(ti, 1)[0]); ti = 0; }
  const bi = P.pages.findIndex(p => p.role === 'after-title'), want = s.albumTitle && s.blankAfterTitle;
  if (want && bi < 0) { const b = FA.newPage(P, 'blank', P.pages[0]); b.role = 'after-title'; P.pages.splice(1, 0, b); }
  else if (!want && bi >= 0) P.pages.splice(bi, 1);
  else if (want && bi !== 1) P.pages.splice(1, 0, P.pages.splice(bi, 1)[0]);
}
const headCount = () => P.pages.filter(p => p.role === 'album-title' || p.role === 'after-title').length;
function titlePhotoUI() {
  const t = P.pages.find(p => p.role === 'album-title'), id = t && t.items[0] && t.items[0].photo, img = $('#titlePhotoThumb');
  if (id && urls.thumb[id]) { img.src = urls.thumb[id]; img.hidden = false; } else { img.removeAttribute('src'); img.hidden = true; }
}
const pickEl = { box: $('#pickModal'), grid: $('#pickGrid') };
function openTitlePhotoPicker() {
  if (!P.photos.length) { toast('Hãy thêm ảnh trước.'); return; }
  ensureTitlePages();
  const t = P.pages.find(p => p.role === 'album-title');
  if (!t || !FA.slotCount(t.template)) { toast('Mẫu của trang tiêu đề hiện không có khung ảnh; hãy đổi mẫu trang ở bảng bên phải.'); return; }
  const cur = t.items[0] && t.items[0].photo;
  pickEl.grid.innerHTML = FA.sortPhotos(P.photos, S().sortBy).map(p => `<button type="button" class="pick" role="option" data-one="${p.id}" aria-pressed="${p.id === cur}" aria-selected="${p.id === cur}" title="${esc(p.name)}"><img src="${urls.thumb[p.id] || ''}" alt="${esc(p.name)}" loading="lazy"><span class="tick" aria-hidden="true">✓</span></button>`).join('');
  pickEl.box.hidden = false;
  setTimeout(() => { const b = $('[aria-pressed=true]', pickEl.grid) || $('[data-one]', pickEl.grid); if (b) b.focus(); }, 30);
}
pickEl.grid.addEventListener('click', e => {
  const b = e.target.closest('[data-one]'); if (!b) return;
  const ti = P.pages.findIndex(p => p.role === 'album-title');
  pickEl.box.hidden = true;
  if (ti >= 0 && assignPhoto(ti, 0, b.dataset.one)) { ui.page = ti; ui.slot = 0; commit(); refresh(); }
});
$('#pickCancel').addEventListener('click', () => { pickEl.box.hidden = true; });
pickEl.box.addEventListener('click', e => { if (e.target === pickEl.box) pickEl.box.hidden = true; });
pickEl.box.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); pickEl.box.hidden = true; } });
$('#btnTitlePhoto').addEventListener('click', openTitlePhotoPicker);

/* ---------- groups ---------- */
function addGroup(name) {
  const g = { id: FA.uid('grp'), name: name || `Nhóm ${P.groups.length + 1}` };
  P.groups.push(g); return g;
}
function rebuild(extra = '') {
  FA.rebuildByGroups(P); ui.page = 0; ui.slot = null; inspKey = '';
  commit(); refresh(); toast('Đã dàn lại trang theo nhóm. Bấm Hoàn tác nếu muốn quay lại.' + extra);
}
/* Remove a group; pages and photos stay, only the link is dropped.
   dropTitle: also remove the group's automatic opening page. */
function removeGroup(id, dropTitle = false) {
  P.groups = P.groups.filter(x => x.id !== id);
  P.photos.forEach(p => { if (p.group === id) p.group = null; });
  if (dropTitle) P.pages = P.pages.filter(p => !(p.role === 'group-title' && p.group === id));
  P.pages.forEach(p => { if (p.group === id) { p.group = null; if (p.role === 'group-title') delete p.role; } if (p.index.scope === id) p.index.scope = 'album'; });
  if (ui.trayGroup === id) ui.trayGroup = 'all';
}
/* Groups left without photos are deleted automatically. Returns a message. */
function pruneGroups() {
  const empty = P.groups.filter(g => !P.photos.some(p => p.group === g.id));
  empty.forEach(g => removeGroup(g.id, true));
  return empty.length ? ` Nhóm ${empty.map(g => '“' + g.name + '”').join(', ')} không còn ảnh nên đã được xoá.` : '';
}
function setPhotoGroup(photoId, gid) {
  const ph = photoById(photoId); if (!ph) return;
  ph.group = gid && gid !== 'none' ? gid : null;
  const gone = pruneGroups();
  commit(); refresh();
  toast((ph.group ? `Đã chuyển “${shortName(ph.name)}” vào nhóm ${FA.groupName(P, ph.group)}.` : `“${shortName(ph.name)}” không còn thuộc nhóm nào.`) + gone);
}

/* ---------- pages ---------- */
function setTemplate(t) {
  const pg = curPage(); if (!pg || pg.template === t) return;
  pg.template = t; FA.fitItems(P, pg);
  if (t === 'index') { pg.group = null; if (!pg.texts.title) pg.texts.title = 'Mosaic ảnh'; }
  if (ui.slot != null && ui.slot >= FA.slotCount(t)) ui.slot = null;
  commit(); refresh();
}
function addPage(at, template = FA.DEFAULT_TEMPLATE) {
  const pg = FA.newPage(P, template, curPage());
  if (curPage()) pg.group = curPage().group || null;
  P.pages.splice(at, 0, pg); ui.page = at; ui.slot = null;
  commit(); refresh();
}
const pageHasPhotos = pg => pg.items.slice(0, FA.slotCount(pg.template)).some(i => i.photo);
function setPageCount(n) {
  n = clamp(Math.round(+n || 0), 0, 400);
  if (n === P.pages.length) return;
  if (n < P.pages.length) {
    const cut = P.pages.slice(n), withPhotos = cut.filter(pageHasPhotos).length;
    if (withPhotos && !confirm(`Bỏ ${cut.length} trang cuối? ${withPhotos} trang trong số đó có ảnh; ảnh sẽ quay về khay Chưa dùng.`)) { renderTop(); return; }
    P.pages.length = n;
  } else while (P.pages.length < n) P.pages.push(FA.newPage(P, FA.DEFAULT_TEMPLATE, P.pages[P.pages.length - 1]));
  commit(); refresh();
}
function pageAction(act) {
  const i = ui.page, pg = curPage(); if (!pg) return;
  const head = headCount(), isHead = i < head;
  if ((act === 'left' || act === 'right') && (isHead || (act === 'left' && i <= head))) return;
  if (act === 'left' && i > 0) { [P.pages[i - 1], P.pages[i]] = [P.pages[i], P.pages[i - 1]]; ui.page = i - 1; }
  else if (act === 'right' && i < P.pages.length - 1) { [P.pages[i + 1], P.pages[i]] = [P.pages[i], P.pages[i + 1]]; ui.page = i + 1; }
  else if (act === 'insert') { const np = FA.newPage(P, FA.DEFAULT_TEMPLATE, pg); np.group = pg.group || null; P.pages.splice(i + 1, 0, np); ui.page = i + 1; }
  else if (act === 'delete') {
    if (pageHasPhotos(pg) && pg.role !== 'album-title' && !confirm('Xoá trang này? Ảnh trên trang sẽ quay về khay Chưa dùng.')) return;
    if (pg.role === 'album-title') { S().albumTitle = false; S().blankAfterTitle = false; P.pages = P.pages.filter(p => p.role !== 'after-title' && p !== pg); }
    else { if (pg.role === 'after-title') S().blankAfterTitle = false; P.pages.splice(i, 1); }
    ui.page = clamp(i - 1, 0, Math.max(0, P.pages.length - 1));
  }
  else if (act === 'look-all') {
    P.pages.forEach(p => { p.look = FA.deepClone(pg.look); });
    S().look = FA.deepClone(pg.look);
    toast('Đã áp dụng nền, hình khung và bộ lọc này cho mọi trang.');
  } else return;
  ui.slot = null; commit(); refresh();
}

/* ---------- inspector (current page + selected frame) ---------- */
let inspKey = '';
const shortName = n => (n.length > 20 ? n.slice(0, 20) + '…' : n);

/* A tiny pixel-art scene used to preview photo filters. */
const PIXEL_SCENE = (() => {
  const rows = [
    'ssssssssssssssss', 'ssssssssssssyyss', 'sssswwssssssyyss', 'sswwwwwssssssss', 'ssssssssssssssss',
    'sssssssmmssssss', 'ssssssmmmmssssss', 'ggssmmmmmmmsgggg', 'ggggmmmmmmmggggg', 'gggrggggggggrggg',
    'ggrrrgggppgrrrgg', 'gggrggggppggrggg',
  ];
  const col = { s: '#6fb6e8', y: '#ffd23f', w: '#ffffff', m: '#7a6e8a', g: '#4caf50', r: '#e5322d', p: '#e8b48f' };
  const cv = document.createElement('canvas'); cv.width = 16; cv.height = 12;
  const c = cv.getContext('2d');
  rows.forEach((r, y) => { for (let x = 0; x < 16; x++) { c.fillStyle = col[r[x] || 's']; c.fillRect(x, y, 1, 1); } });
  return cv.toDataURL('image/png');
})();
const SHAPE_ICONS = {
  rect: '<rect x="3" y="4" width="18" height="14"/>',
  rounded: '<rect x="3" y="4" width="18" height="14" rx="4"/>',
  ellipse: '<ellipse cx="12" cy="11" rx="9" ry="7"/>',
};
const SHAPE_NAMES = { rect: 'Chữ nhật', rounded: 'Bo góc', ellipse: 'Bầu dục' };

function tplIcon(t) {
  const s = S(), { W, H } = FA.pageDims(s), isLeft = FA.isLeftPage(ui.page);
  const capH = s.caption.position === 'below' ? +s.caption.height : 0;
  const L = FA.TEMPLATES[t].layout({ W, H, c: FA.contentBox(s, isLeft), gap: +s.gap, capH, bleed: 0, isLeft });
  let r = `<svg viewBox="0 0 ${W} ${H}" aria-hidden="true">`;
  L.photos.forEach(p => { r += `<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" fill="#9fb6c8"/>`; if (p.cap) r += `<rect x="${p.cap.x + p.cap.w * .2}" y="${p.cap.y + p.cap.h * .3}" width="${p.cap.w * .6}" height="${Math.max(1.5, p.cap.h * .25)}" fill="#c8cdd3"/>`; });
  if (L.grid) { const n = 4, gw = (L.grid.w - 3 * 3) / n; for (let r2 = 0; r2 < 4; r2++) for (let c2 = 0; c2 < n; c2++) r += `<rect x="${L.grid.x + c2 * (gw + 3)}" y="${L.grid.y + r2 * (gw + 6)}" width="${gw}" height="${gw}" fill="#9fb6c8"/>`; }
  L.texts.forEach(x => { const th = x.role === 'title' ? Math.min(x.h * .5, H * .05) : Math.min(x.h * .3, H * .03); const w = x.w * (x.role === 'title' ? .7 : .85);
    const xx = x.align === 'center' ? x.x + (x.w - w) / 2 : x.x; const yy = x.valign === 'end' ? x.y + x.h - th : x.y;
    r += `<rect x="${xx}" y="${yy}" width="${w}" height="${th}" fill="${x.role === 'title' ? '#6c7682' : '#c8cdd3'}"/>`; });
  return r + '</svg>';
}
function renderInspector() {
  const pg = curPage();
  if (!pg) { inspKey = ''; el.insp.innerHTML = `<h2>Chưa có trang</h2><p class="meta">Thêm ảnh để album tự tạo trang, hoặc bấm Thêm trang.</p>`; return; }
  const L = FA.layoutPage(P, ui.page), item = ui.slot != null ? pg.items[ui.slot] : null;
  const key = [pg.id, pg.template, ui.page, P.pages.length, ui.slot, item && item.photo, S().caption.position, S().pageSize, S().allowReuse,
    JSON.stringify(S().margin), S().gutter, S().gap, S().caption.height, pg.look.shape, pg.look.filter.name, P.groups.map(g => g.id + g.name).join(),
    item && item.photo && (photoById(item.photo) || {}).group].join('|');
  if (key === inspKey) { syncInspector(); return; }
  inspKey = key;
  const side = (pg.role === 'album-title' ? 'trang tiêu đề album, ' : pg.role === 'after-title' ? 'trang trống sau tiêu đề, ' : '') + (FA.isLeftPage(ui.page) ? 'trang trái' : 'trang phải');
  const head = headCount(), lockL = ui.page <= head || ui.page === 0, lockR = ui.page < head || ui.page >= P.pages.length - 1;
  const gname = pg.group ? FA.groupName(P, pg.group) : '';
  let h = `<h2>Trang ${ui.page + 1}</h2><p class="meta">${side}, mẫu “${esc(FA.TEMPLATES[pg.template].name)}”${gname ? ', nhóm ' + esc(gname) : ''}</p>`;

  h += `<div class="block"><h3>Mẫu trang</h3><div class="tpls">`;
  for (const [id, t] of Object.entries(FA.TEMPLATES))
    h += `<button type="button" class="tpl" data-tpl="${id}" aria-pressed="${pg.template === id}" title="${esc(t.name)}">${tplIcon(id)}<span>${esc(t.name)}</span></button>`;
  h += `</div></div>`;

  h += `<div class="block"><h3>Trang này</h3><div class="row-btns two-col">
    <button class="btn" type="button" data-act="left" ${lockL ? 'disabled' : ''}>◀ Dời</button>
    <button class="btn" type="button" data-act="right" ${lockR ? 'disabled' : ''}>Dời ▶</button>
    <button class="btn" type="button" data-act="insert">Chèn trang sau</button>
    <button class="btn danger" type="button" data-act="delete">Xoá trang</button></div>`;
  if (FA.isUngroupedPage(pg)) h += `<p class="hint">${pg.template === 'index' ? 'Trang mosaic' : 'Trang này'} không thuộc nhóm nào.</p>`;
  else if (P.groups.length) h += `<label class="f"><span>Thuộc nhóm</span><select id="pGroup">${groupOptions(false)}</select></label>`;
  h += `</div>`;

  // page look: background, frame shape, filter (this page only)
  h += `<details class="block look" id="lookBlock"${ui.lookOpen ? ' open' : ''}><summary><h3>Nền, khung, bộ lọc</h3><span class="look-sum">${esc(SHAPE_NAMES[pg.look.shape])}, ${esc(FA.FILTERS[pg.look.filter.name].label)}</span></summary>
    <label class="f"><span>Màu nền trang</span><input type="color" id="lkBg"></label>
    <div class="lbl">Hình khung ảnh</div>
    <div class="shapes" role="group" aria-label="Hình khung ảnh">${Object.keys(SHAPE_ICONS).map(k => `<button type="button" class="shape" data-shape="${k}" aria-pressed="${pg.look.shape === k}" title="${SHAPE_NAMES[k]}"><svg viewBox="0 0 24 22" aria-hidden="true">${SHAPE_ICONS[k]}</svg><span>${SHAPE_NAMES[k]}</span></button>`).join('')}</div>
    ${pg.look.shape === 'rounded' ? `<label class="f"><span>Bán kính bo góc</span><input type="number" id="lkRad" min="0" max="60" step="0.5"><em>mm</em></label>` : ''}
    <div class="lbl">Bộ lọc ảnh</div>
    <div class="filters" role="group" aria-label="Bộ lọc ảnh">${Object.entries(FA.FILTERS).map(([k, f]) => `<button type="button" class="filt" data-filter="${k}" aria-pressed="${pg.look.filter.name === k}"><img src="${PIXEL_SCENE}" alt="" style="filter:${f.css(k === pg.look.filter.name ? pg.look.filter.amount : 1) || 'none'}"><span>${esc(f.label)}</span></button>`).join('')}</div>
    ${pg.look.filter.name !== 'none' ? `<label class="f"><span>Cường độ <output id="lkAmtOut"></output></span><input type="range" id="lkAmt" min="0" max="1" step="0.05"></label>` : ''}
    <button class="btn" type="button" data-act="look-all">Áp dụng cho mọi trang</button>
  </details>`;

  if (L.texts.length) {
    h += `<div class="block"><h3>Chữ trên trang</h3>`;
    L.texts.forEach(t => {
      h += `<label class="f"><span>${t.role === 'title' ? 'Tiêu đề' : 'Đoạn văn'}</span><textarea data-text-key="${esc(t.key)}" rows="${t.role === 'title' ? 2 : 4}" placeholder="${esc(t.ph)}">${esc(pg.texts[t.key] || '')}</textarea></label>`;
    });
    h += `<p class="hint">Có thể dùng HTML đơn giản, ví dụ &lt;b&gt;đậm&lt;/b&gt;, &lt;i&gt;nghiêng&lt;/i&gt;, &lt;span style="color:#c0392b"&gt;màu&lt;/span&gt;.</p></div>`;
  }

  if (L.grid) {
    h += `<div class="block"><h3>Mosaic ảnh</h3>
      <label class="f"><span>Ảnh thuộc</span><select id="ixScope"><option value="album">Tất cả nhóm (cả album)</option>${P.groups.map(g => `<option value="${g.id}">Nhóm ${esc(g.name)}</option>`).join('')}</select></label>
      <label class="f"><span>Khoảng cách giữa ảnh</span><input type="number" id="ixGap" min="0" max="20" step="0.25"><em>mm</em></label>
      <label class="check"><input type="checkbox" id="ixNum"><span>Ghi số trang dưới mỗi ảnh</span></label>
      <p class="hint">Hiện mọi ảnh đã đặt vào trang, theo thứ tự xuất hiện. Ảnh tự thu nhỏ để vừa hết trên một trang và tự cập nhật khi album thay đổi.</p></div>`;
  }

  if (L.photos.length) {
    h += `<div class="block" id="frameBlock">`;
    if (ui.slot == null) h += `<h3>Khung ảnh</h3><p class="empty-note">Bấm vào một khung trên trang để chọn ảnh, cắt, xoay và viết chú thích.</p>`;
    else {
      const ph = item && item.photo ? photoById(item.photo) : null;
      const hasCap = !!(L.photos[ui.slot] && L.photos[ui.slot].cap) || S().caption.position !== 'below';
      h += `<h3>Khung ${ui.slot + 1}</h3>`;
      if (ph) {
        const where = (FA.usage(P).get(ph.id) || []).map(w => w.page + 1);
        h += `<div class="frame-head"><img src="${urls.thumb[ph.id] || ''}" alt=""><div><div class="nm" title="${esc(ph.name)}">${esc(shortName(ph.name))}</div><div class="meta" style="margin:0">${ph.w} × ${ph.h} px${where.length > 1 ? `, có trên trang ${where.join(', ')}` : ''}</div></div></div>
        <label class="f"><span>Phóng to <output id="fZoomOut"></output></span><input type="range" id="fZoom" min="1" max="6" step="0.01"></label>
        <label class="f"><span>Xoay <output id="fRotOut"></output></span><input type="range" id="fRot" min="-180" max="180" step="0.5"></label>
        ${hasCap ? `<label class="check"><input type="checkbox" id="fExif" ${ph.exif ? '' : 'disabled'}><span>In thông số chụp${ph.exif ? '' : ' (ảnh không có EXIF)'}</span></label>` : ''}
        ${P.groups.length ? `<label class="f"><span>Nhóm của ảnh</span><select id="fGroup">${groupOptions(false)}</select></label>` : ''}
        <button class="btn danger slim-full" type="button" data-act="remove">Gỡ ảnh khỏi khung</button>`;
      } else {
        h += `<p class="empty-note">Khung trống. Bấm một ảnh trong khay bên dưới để đặt vào đây, hoặc kéo thả ảnh vào khung.</p>`;
      }
      if (!hasCap) h += `<p class="hint">Mẫu trang này không có chỗ cho chú thích và thông số chụp dưới khung.</p>`;
      else if (S().caption.position === 'below') {
        h += `<label class="f"><span>Chú thích</span><textarea id="fCap" rows="3" placeholder="Viết chú thích…">${esc(item ? item.caption : '')}</textarea></label>
        <p class="hint">Có thể dùng HTML: &lt;b&gt;, &lt;i&gt;, &lt;u&gt;, &lt;span style="color:#c0392b"&gt;…&lt;/span&gt;. Xuống dòng bằng Enter.</p>
        <div class="preview-cap" id="fCapPrev" aria-label="Xem trước chú thích"></div>
        <p class="warn" id="fCapWarn" hidden>Chú thích dài hơn khung nên bị cắt. Tăng chiều cao chú thích hoặc giảm cỡ chữ ở bảng Chú thích và chữ.</p>`;
      } else h += `<p class="hint">Chú thích đang tắt (bảng Chú thích và chữ).</p>`;
    }
    h += `</div>`;
  }
  el.insp.innerHTML = h;
  const pgSel = $('#pGroup'); if (pgSel) pgSel.value = pg.group || 'none';
  const fg = $('#fGroup'); if (fg && item && item.photo) fg.value = (photoById(item.photo) || {}).group || 'none';
  const ix = $('#ixScope'); if (ix) ix.value = P.groups.some(g => g.id === pg.index.scope) ? pg.index.scope : 'album';
  syncInspector();
}
function syncInspector() {
  const pg = curPage(); if (!pg) return;
  const focus = document.activeElement;
  const bg = $('#lkBg'); if (bg && focus !== bg) bg.value = pg.look.background;
  const rad = $('#lkRad'); if (rad && focus !== rad) rad.value = pg.look.radius;
  const amt = $('#lkAmt'); if (amt && focus !== amt) amt.value = pg.look.filter.amount;
  const ao = $('#lkAmtOut'); if (ao) ao.textContent = Math.round(pg.look.filter.amount * 100) + '%';
  const ixn = $('#ixNum'); if (ixn) ixn.checked = !!pg.index.numbers;
  const ixg = $('#ixGap'); if (ixg && focus !== ixg) ixg.value = pg.index.gap;
  if (ui.slot == null) return;
  const item = pg.items[ui.slot]; if (!item) return;
  const ph = item.photo ? photoById(item.photo) : null;
  if (ph) {
    const z = $('#fZoom'); if (z && focus !== z) z.value = item.crop.z;
    const r = $('#fRot'); if (r && focus !== r) r.value = item.crop.rot;
    const zo = $('#fZoomOut'); if (zo) zo.textContent = Math.round(item.crop.z * 100) + '%';
    const ro = $('#fRotOut'); if (ro) ro.textContent = (+item.crop.rot).toFixed(1).replace(/\.0$/, '') + '°';
    const fx = $('#fExif'); if (fx) fx.checked = !!item.exif;
  }
  const cap = $('#fCap'); if (cap && focus !== cap && cap.value !== item.caption) cap.value = item.caption;
  const capEl = el.wrap.querySelector(`[data-leaf="${ui.page}"] [data-cap="${ui.slot}"]`), warn = $('#fCapWarn');
  if (warn) warn.hidden = !(capEl && capEl.classList.contains('over'));
  const prev = $('#fCapPrev');
  if (prev) {
    const s = FA.eff(P, ui.page), f = FA.FONTS[s.exif.font] || FA.FONTS.sans;
    let html = FA.sanitize(item.caption);
    const ex = item.exif && ph ? FA.exifHTML(ph, s) : '';
    if (ex) html += `<div style="font-family:${esc(f.css)};font-size:.86em;color:${esc(s.exif.color)};font-style:${s.exif.italic ? 'italic' : 'normal'};margin-top:2px">${ex}</div>`;
    prev.innerHTML = html || '<span style="opacity:.45">(chưa có chú thích)</span>';
    prev.style.fontFamily = FA.FONTS[s.caption.font].css; prev.style.textAlign = s.caption.align; prev.style.color = s.caption.color;
  }
}
function frameAction(act) {
  const pg = curPage(), it = pg && ui.slot != null ? pg.items[ui.slot] : null; if (!it) return false;
  if (act === 'remove') { it.photo = null; it.crop = FA.defaultCrop(); it.exif = false; }
  else return false;
  commit(); refresh();
  return true;
}

el.insp.addEventListener('click', e => {
  const t = e.target.closest('button'); if (!t) return;
  const pg = curPage();
  if (t.dataset.tpl) setTemplate(t.dataset.tpl);
  else if (t.dataset.shape) { pg.look.shape = t.dataset.shape; commit(); refresh({ trays: false }); }
  else if (t.dataset.filter) { pg.look.filter = { name: t.dataset.filter, amount: pg.look.filter.name === t.dataset.filter ? pg.look.filter.amount : 1 }; commit(); refresh({ trays: false }); }
  else if (t.dataset.act) { if (!frameAction(t.dataset.act)) pageAction(t.dataset.act); }
});
el.insp.addEventListener('toggle', e => { if (e.target.id === 'lookBlock') ui.lookOpen = e.target.open; }, true);
el.insp.addEventListener('input', e => {
  const t = e.target, pg = curPage(); if (!pg) return;
  if (t.dataset.textKey) { pg.texts[t.dataset.textKey] = t.value; refresh({ trays: false }); commitSoon(); }
  else if (t.id === 'ixGap') { const v = parseFloat(t.value); if (!isNaN(v)) { pg.index.gap = clamp(v, 0, 20); refresh({ trays: false }); commitSoon(); } }
  else if (t.id === 'fCap') { pg.items[ui.slot].caption = t.value; refresh({ trays: false }); commitSoon(); }
  else if (t.id === 'fZoom') { pg.items[ui.slot].crop.z = +t.value; updateSlotImg(ui.page, ui.slot); }
  else if (t.id === 'fRot') { pg.items[ui.slot].crop.rot = +t.value; updateSlotImg(ui.page, ui.slot); }
  else if (t.id === 'lkBg') { pg.look.background = t.value; refresh({ trays: false }); commitSoon(); }
  else if (t.id === 'lkRad') { pg.look.radius = clamp(+t.value || 0, 0, 60); refresh({ trays: false }); commitSoon(); }
  else if (t.id === 'lkAmt') {
    pg.look.filter.amount = +t.value; refresh({ trays: false }); commitSoon();
    const img = $(`[data-filter="${pg.look.filter.name}"] img`, el.insp); if (img) img.style.filter = FA.FILTERS[pg.look.filter.name].css(+t.value) || 'none';
  }
});
el.insp.addEventListener('change', e => {
  const t = e.target, pg = curPage(); if (!pg) return;
  if (t.id === 'fExif') { pg.items[ui.slot].exif = t.checked; commit(); refresh({ trays: false }); }
  else if (t.id === 'pGroup') { pg.group = t.value === 'none' ? null : t.value; commit(); refresh({ trays: false }); }
  else if (t.id === 'fGroup') setPhotoGroup(pg.items[ui.slot].photo, t.value);
  else if (t.id === 'ixScope') { pg.index.scope = t.value; commit(); refresh({ trays: false }); }
  else if (t.id === 'ixNum') { pg.index.numbers = t.checked; commit(); refresh({ trays: false }); }
  else if (/^(fZoom|fRot|fCap|lkBg|lkRad|lkAmt|ixGap)$/.test(t.id) || t.dataset.textKey) { commit(); refresh({ trays: false }); }
});

/* ---------- album-wide settings (left panel) ---------- */
function fillSelects() {
  $('#selPageSize').innerHTML = Object.entries(FA.PAGE_SIZES).map(([k, v]) => `<option value="${k}">${esc(v.label)}</option>`).join('');
  $$('[data-fonts]').forEach(s => { s.innerHTML = Object.entries(FA.FONTS).map(([k, v]) => `<option value="${k}">${esc(v.label)}</option>`).join(''); });
  $$('[data-aligns]').forEach(s => { s.innerHTML = '<option value="outer">Mép ngoài</option><option value="center">Giữa</option><option value="inner">Mép trong (gáy)</option>'; });
  $('#exifFields').innerHTML = Object.entries(FA.EXIF_FIELDS).map(([k, v]) => `<label class="check"><input type="checkbox" data-set="exif.fields.${k}"><span>${esc(v)}</span></label>`).join('');
}
const getSet = path => (path[0] === '@' ? P[path.slice(1)] : FA.getPath(S(), path));
function putSet(path, v) { if (path[0] === '@') P[path.slice(1)] = v; else FA.setPath(S(), path, v); }
function readInput(inp) {
  if (inp.type === 'checkbox') return inp.checked;
  if (inp.type === 'number' || inp.type === 'range' || inp.hasAttribute('data-num')) { const n = parseFloat(inp.value); return isNaN(n) ? null : n; }
  return inp.value;
}
function syncSettingsUI() {
  $$('[data-set]', el.side).forEach(inp => {
    if (inp === document.activeElement && inp.type !== 'checkbox' && inp.tagName !== 'SELECT') return;
    const v = getSet(inp.dataset.set);
    if (inp.type === 'checkbox') inp.checked = !!v; else if (v != null && String(inp.value) !== String(v)) inp.value = v;
  });
  $$('[data-out]', el.side).forEach(o => { o.textContent = Math.round(getSet(o.dataset.out) * 100) + '%'; });
  $$('[data-when]', el.side).forEach(w => {
    const cond = w.dataset.when; let ok;
    const m = /^([\w.]+)(!=|=)(.+)$/.exec(cond);
    if (m) { const v = String(getSet(m[1])); ok = m[2] === '=' ? v === m[3] : v !== m[3]; } else ok = !!getSet(cond);
    w.hidden = !ok;
  });
  const hints = { 'pdf-print': 'Mở hộp thoại in của trình duyệt; chọn “Lưu dưới dạng PDF”, lề “Không”, bật “Đồ hoạ nền”. Chữ giữ dạng vector. Kích thước giấy được đặt sẵn theo khổ album (tốt nhất trên Chrome/Edge).',
    'pdf-direct': 'Tải PDF ngay, mỗi trang là một ảnh ở độ phân giải đã chọn. Giữ đúng mọi định dạng chữ.',
    'docx': 'Ảnh được đặt cố định trên trang, chữ nằm trong khung văn bản sửa được. Word có thể hiển thị khác đôi chút; không có bleed.',
    'png-zip': 'Mỗi trang một file PNG, gom trong một ZIP.',
    'album': 'Lưu bố cục và ảnh gốc để mở lại sau bằng Mở file dự án.' };
  $('#exportHint').textContent = hints[S().export.format] || '';
  // sample EXIF line in the chosen style
  const s = S(), f = FA.FONTS[s.exif.font] || FA.FONTS.sans;
  const sample = { date: '2025-03-12T10:22:00', exif: { camera: 'X-T5', lens: 'XF16-80mmF4 R', lensInfo: [16, 80, 4, 4], focal: 50, f: 4, shutter: 1 / 250, iso: 400, lat: 15.88, lon: 108.325 } };
  const ex = $('#exifSample');
  ex.innerHTML = FA.exifHTML(sample, s) || '<span style="opacity:.5">(chưa chọn thông số nào)</span>';
  Object.assign(ex.style, { fontFamily: f.css, color: s.exif.color, fontStyle: s.exif.italic ? 'italic' : 'normal', fontSize: Math.max(10, s.exif.size * 1.5) + 'px' });
}
el.side.addEventListener('input', e => {
  const inp = e.target; if (!inp.dataset || !inp.dataset.set) return;
  let v = readInput(inp); if (v === null) return;
  if (inp.type === 'number') { const mn = inp.min !== '' ? +inp.min : -Infinity, mx = inp.max !== '' ? +inp.max : Infinity; v = clamp(v, mn, mx); }
  if (inp.dataset.set === '@title') {
    const t = P.pages.find(p => p.role === 'album-title');
    if (t && (t.texts.title || '') === esc(P.title)) t.texts.title = esc(v);
  }
  putSet(inp.dataset.set, v);
  if (inp.dataset.set === 'albumTitle' || inp.dataset.set === 'blankAfterTitle') { ensureTitlePages(); ui.slot = null; }
  if (inp.dataset.set === 'allowReuse' || inp.dataset.set === 'sortBy') refresh(); else refresh({ trays: false });
  if (inp.type === 'checkbox' || inp.tagName === 'SELECT' || inp.type === 'color') commit(); else commitSoon(900);
});
el.side.addEventListener('change', e => { if (e.target.dataset && e.target.dataset.set) { commit(); syncSettingsUI(); } });

/* ---------- spread: select, pan, zoom, drop ---------- */
let drag = null;
el.wrap.addEventListener('pointerdown', e => {
  if (e.button !== 0) return;
  const leaf = e.target.closest('[data-leaf]'); if (!leaf) return;
  const idx = +leaf.dataset.leaf;
  const slotEl = e.target.closest('[data-slot]'), capEl = e.target.closest('[data-cap]'), txtEl = e.target.closest('[data-text]');
  if (slotEl) {
    const si = +slotEl.dataset.slot, it = P.pages[idx].items[si];
    if (ui.page !== idx || ui.slot !== si) select(idx, si);
    if (it && it.photo) {
      drag = { idx, si, x: e.clientX, y: e.clientY, moved: false, id: e.pointerId };
      el.wrap.setPointerCapture(e.pointerId);
      slotEl.classList.add('dragging');
      e.preventDefault();
    }
  } else if (capEl) select(idx, +capEl.dataset.cap);
  else if (txtEl) { select(idx, null); setTimeout(() => { const t = $(`[data-text-key="${txtEl.dataset.text}"]`, el.insp); if (t) t.focus(); }, 30); }
  else if (ui.page !== idx || ui.slot != null) select(idx, null);
});
el.wrap.addEventListener('pointermove', e => {
  if (!drag || e.pointerId !== drag.id) return;
  const dx = (e.clientX - drag.x) / ui.k, dy = (e.clientY - drag.y) / ui.k;
  if (!dx && !dy) return;
  drag.x = e.clientX; drag.y = e.clientY; drag.moved = true;
  const it = P.pages[drag.idx].items[drag.si], ph = photoById(it.photo), fr = FA.layoutPage(P, drag.idx).photos[drag.si];
  FA.panCrop(it.crop, dx, dy, fr.w, fr.h, ph.w, ph.h);
  updateSlotImg(drag.idx, drag.si);
});
const endDrag = e => {
  if (!drag || (e && e.pointerId !== drag.id)) return;
  const moved = drag.moved; drag = null;
  $$('.dragging', el.wrap).forEach(x => x.classList.remove('dragging'));
  if (moved) commit();
};
el.wrap.addEventListener('pointerup', endDrag);
el.wrap.addEventListener('pointercancel', endDrag);
el.wrap.addEventListener('dblclick', e => {
  const capEl = e.target.closest('[data-cap]'), slotEl = e.target.closest('[data-slot]');
  if (capEl || slotEl) setTimeout(() => { const c = $('#fCap'); if (c) c.focus(); }, 40);
});
el.wrap.addEventListener('wheel', e => {
  const slotEl = e.target.closest('[data-slot]'), leaf = e.target.closest('[data-leaf]'); if (!slotEl || !leaf) return;
  const idx = +leaf.dataset.leaf, si = +slotEl.dataset.slot;
  if (idx !== ui.page || si !== ui.slot) return;
  const it = P.pages[idx].items[si]; if (!it || !it.photo) return;
  e.preventDefault();
  it.crop.z = clamp(it.crop.z * Math.exp(-e.deltaY * 0.0015), 1, 6);
  updateSlotImg(idx, si); commitSoon(400);
}, { passive: false });

const PHOTO_MIME = 'text/x-fa-photo';
el.wrap.addEventListener('dragover', e => {
  if (![...e.dataTransfer.types].includes(PHOTO_MIME)) return;
  const slotEl = e.target.closest('[data-slot]');
  $$('.drop-ok', el.wrap).forEach(x => x !== slotEl && x.classList.remove('drop-ok'));
  if (slotEl) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; slotEl.classList.add('drop-ok'); }
});
el.wrap.addEventListener('dragleave', e => { const s = e.target.closest && e.target.closest('[data-slot]'); if (s) s.classList.remove('drop-ok'); });
el.wrap.addEventListener('drop', e => {
  const id = e.dataTransfer.getData(PHOTO_MIME); if (!id) return;
  e.preventDefault(); e.stopPropagation();
  const slotEl = e.target.closest('[data-slot]'), leaf = e.target.closest('[data-leaf]'); if (!slotEl || !leaf) return;
  const idx = +leaf.dataset.leaf, si = +slotEl.dataset.slot;
  if (assignPhoto(idx, si, id)) { ui.page = idx; ui.slot = si; commit(); refresh(); }
});

/* ---------- trays ---------- */
$('#dock').addEventListener('click', e => {
  const del = e.target.closest('[data-del]'); if (del) { e.stopPropagation(); deletePhoto(del.dataset.del); return; }
  const roll = e.target.closest('[data-roll]');
  if (roll) { const strip = $('[data-strip]', roll.closest('.tray')); strip.scrollBy({ left: +roll.dataset.roll * strip.clientWidth * 0.8 }); return; }
  const tog = e.target.closest('.tray-toggle');
  if (tog) { const tr = tog.closest('.tray'); tr.classList.toggle('min'); tog.setAttribute('aria-expanded', String(!tr.classList.contains('min'))); requestAnimationFrame(() => refresh({ trays: false })); return; }
  const pt = e.target.closest('[data-goto]'); if (pt) { select(+pt.dataset.goto, null); return; }
  const th = e.target.closest('[data-photo]'); if (th) placeFromTray(th.dataset.photo);
});
$('#dock').addEventListener('keydown', e => {
  const pt = e.target.closest('[data-goto]');
  if (pt && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); select(+pt.dataset.goto, null); return; }
  const th = e.target.closest('[data-photo]');
  if (th && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); placeFromTray(th.dataset.photo); }
  if (th && (e.key === 'Delete' || e.key === 'Backspace') && $('.del', th)) { e.preventDefault(); deletePhoto(th.dataset.photo); }
});
const PAGE_MIME = 'text/x-fa-page';
$('#dock').addEventListener('dragstart', e => {
  const pt = e.target.closest('[data-goto]');
  if (pt) { e.dataTransfer.setData(PAGE_MIME, pt.dataset.goto); e.dataTransfer.effectAllowed = 'move'; pt.classList.add('dragging'); return; }
  const th = e.target.closest('[data-photo]'); if (!th) return;
  e.dataTransfer.setData(PHOTO_MIME, th.dataset.photo); e.dataTransfer.effectAllowed = 'copyMove';
});
$('#dock').addEventListener('dragend', () => $$('.pt.dragging, .pt.drop-before, .pt.drop-after').forEach(x => x.classList.remove('dragging', 'drop-before', 'drop-after')));
const pagesStrip = $('[data-tray="pages"] [data-strip]');
const dropSide = (e, pt) => { const r = pt.getBoundingClientRect(); return e.clientX < r.left + r.width / 2 ? 'before' : 'after'; };
pagesStrip.addEventListener('dragover', e => {
  const pt = e.target.closest('[data-goto]');
  if (!pt || ![...e.dataTransfer.types].includes(PAGE_MIME)) return;
  e.preventDefault(); e.dataTransfer.dropEffect = 'move';
  $$('.drop-before, .drop-after', pagesStrip).forEach(x => x.classList.remove('drop-before', 'drop-after'));
  pt.classList.add('drop-' + dropSide(e, pt));
});
pagesStrip.addEventListener('drop', e => {
  const pt = e.target.closest('[data-goto]'), from = e.dataTransfer.getData(PAGE_MIME);
  if (!pt || from === '') return;
  e.preventDefault();
  const f = +from, t = +pt.dataset.goto, after = dropSide(e, pt) === 'after';
  let to = t + (after ? 1 : 0); if (f < to) to--;
  movePage(f, to);
});
$$('[data-strip]').forEach(strip => strip.addEventListener('wheel', e => {
  if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { strip.scrollLeft += e.deltaY; e.preventDefault(); }
}, { passive: false }));

/* ---------- top bar & buttons ---------- */
el.undo.addEventListener('click', () => doUndo(false));
el.redo.addEventListener('click', () => doUndo(true));
function doUndo(redo) {
  clearTimeout(commitT);
  if (redo ? hist.fwd() : hist.back()) { inspKey = ''; save(); refresh(); }
}
el.prev.addEventListener('click', () => goSpread(-1));
el.next.addEventListener('click', () => goSpread(1));
$('#btnAddPage').addEventListener('click', () => addPage(P.pages.length));
el.pageCount.addEventListener('change', () => setPageCount(el.pageCount.value));
$('#btnZoomIn').addEventListener('click', () => { ui.zoom = clamp(ui.zoom * 1.2, 0.4, 4); refresh({ trays: false }); });
$('#btnZoomOut').addEventListener('click', () => { ui.zoom = clamp(ui.zoom / 1.2, 0.4, 4); refresh({ trays: false }); });
$('#btnZoomFit').addEventListener('click', () => { ui.zoom = 1; refresh({ trays: false }); });
$('#btnAdd').addEventListener('click', () => el.filePhotos.click());
$('#btnAdd2').addEventListener('click', () => el.filePhotos.click());
el.filePhotos.addEventListener('change', () => { const f = el.filePhotos.files; if (f && f.length) importFiles(f); el.filePhotos.value = ''; });
$('#selTrayGroup').addEventListener('change', e => { ui.trayGroup = e.target.value; refresh(); });
$('#btnAddGroup').addEventListener('click', () => openGroupModal(null));
$('#gTitleTiles').addEventListener('click', e => {
  const b = e.target.closest('[data-gtitle]'); if (!b) return;
  S().groupTitle = b.dataset.gtitle; commit(); refresh();
});

/* ---------- create / edit a group by picking photos ---------- */
const gm = { gid: null, sel: new Set(), last: null, order: [] };
const gmEl = { box: $('#grpModal'), title: $('#grpModalTitle'), name: $('#grpName'), grid: $('#grpGrid'), count: $('#grpCount'),
  ok: $('#grpOk'), err: $('#grpErr'), rebuild: $('#grpRebuild') };
function openGroupModal(gid) {
  if (!P.photos.length) { toast('Hãy thêm ảnh trước khi tạo nhóm.'); return; }
  const g = gid ? P.groups.find(x => x.id === gid) : null;
  gm.gid = g ? g.id : null; gm.last = null;
  gm.sel = new Set(P.photos.filter(p => g && p.group === g.id).map(p => p.id));
  const sorted = FA.sortPhotos(P.photos, S().sortBy);
  const free = sorted.filter(p => !p.group || p.group === gm.gid), taken = sorted.filter(p => p.group && p.group !== gm.gid);
  gm.order = [...free, ...taken].map(p => p.id);
  gmEl.title.textContent = g ? 'Chọn lại ảnh cho nhóm' : 'Tạo nhóm';
  gmEl.ok.textContent = g ? 'Lưu nhóm' : 'Tạo nhóm';
  gmEl.name.value = g ? g.name : `Nhóm ${P.groups.length + 1}`;
  gmEl.err.hidden = true;
  const pick = p => {
    const id = p.id, other = p.group && p.group !== gm.gid ? FA.groupName(P, p.group) : '';
    return `<button type="button" class="pick" data-pick="${id}" aria-pressed="false" title="${esc(p.name)}${other ? ' (đang ở nhóm ' + esc(other) + ')' : ''}"><img src="${urls.thumb[id] || ''}" alt="${esc(p.name)}" loading="lazy">${other ? `<span class="gtag">${esc(other.length > 8 ? other.slice(0, 8) + '…' : other)}</span>` : ''}<span class="tick" aria-hidden="true">✓</span></button>`;
  };
  gmEl.grid.innerHTML = (free.length ? free.map(pick).join('') : '<p class="pick-sep">Mọi ảnh đều đã thuộc một nhóm.</p>') +
    (taken.length ? `<p class="pick-sep">Ảnh đã thuộc nhóm khác (${taken.length}); chọn ảnh nào thì ảnh đó chuyển sang nhóm này</p>` + taken.map(pick).join('') : '');
  syncPicks();
  gmEl.box.hidden = false;
  setTimeout(() => { gmEl.name.focus(); gmEl.name.select(); }, 30);
}
function syncPicks() {
  $$('[data-pick]', gmEl.grid).forEach(b => b.setAttribute('aria-pressed', String(gm.sel.has(b.dataset.pick))));
  const moving = [...gm.sel].filter(id => { const p = photoById(id); return p.group && p.group !== gm.gid; }).length;
  gmEl.count.textContent = gm.sel.size ? `Đã chọn ${gm.sel.size} ảnh` + (moving ? `, ${moving} ảnh sẽ chuyển từ nhóm khác` : '') : 'Chưa chọn ảnh nào';
}
const closeGroupModal = () => { gmEl.box.hidden = true; };
gmEl.grid.addEventListener('click', e => {
  const b = e.target.closest('[data-pick]'); if (!b) return;
  const id = b.dataset.pick, on = !gm.sel.has(id);
  if (e.shiftKey && gm.last) {
    const a = gm.order.indexOf(gm.last), c = gm.order.indexOf(id);
    gm.order.slice(Math.min(a, c), Math.max(a, c) + 1).forEach(x => (on ? gm.sel.add(x) : gm.sel.delete(x)));
  } else on ? gm.sel.add(id) : gm.sel.delete(id);
  gm.last = id; gmEl.err.hidden = true; syncPicks();
});
$('#grpPickFree').addEventListener('click', () => { P.photos.forEach(p => { if (!p.group) gm.sel.add(p.id); }); syncPicks(); });
$('#grpPickNone').addEventListener('click', () => { gm.sel.clear(); syncPicks(); });
$('#grpCancel').addEventListener('click', closeGroupModal);
gmEl.box.addEventListener('click', e => { if (e.target === gmEl.box) closeGroupModal(); });
gmEl.box.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); closeGroupModal(); } });
gmEl.ok.addEventListener('click', () => {
  const name = gmEl.name.value.trim();
  const fail = m => { gmEl.err.textContent = m; gmEl.err.hidden = false; };
  if (!name) return fail('Hãy đặt tên cho nhóm.');
  if (P.groups.some(g => g.id !== gm.gid && g.name.toLowerCase() === name.toLowerCase())) return fail('Đã có nhóm trùng tên.');
  if (!gm.sel.size && !gm.gid) return fail('Hãy chọn ít nhất một ảnh cho nhóm.');
  let g = gm.gid ? P.groups.find(x => x.id === gm.gid) : null;
  if (!g) g = addGroup(name);
  const before = esc(g.name); g.name = name;
  P.pages.forEach(pg => { if (pg.role === 'group-title' && pg.group === g.id && (pg.texts.title || '') === before) pg.texts.title = esc(name); });
  P.photos.forEach(p => { if (gm.sel.has(p.id)) p.group = g.id; else if (p.group === g.id) p.group = null; });
  const gone = pruneGroups();
  closeGroupModal();
  if (gmEl.rebuild.checked) rebuild(gone);
  else { commit(); refresh(); toast((gm.sel.size ? `Đã lưu nhóm “${name}” với ${gm.sel.size} ảnh.` : '') + gone); }
});
$('#btnRebuild').addEventListener('click', () => {
  if (!P.photos.length) { toast('Chưa có ảnh để dàn trang.'); return; }
  if (confirm('Dàn lại các trang ảnh theo nhóm? Bìa và các trang chữ được giữ; chú thích và cách cắt ảnh được giữ. Có thể hoàn tác.')) rebuild();
});
const groupList = $('#groupList');
groupList.addEventListener('input', e => {
  const id = e.target.dataset.gname; if (!id) return;
  const g = P.groups.find(x => x.id === id); if (!g) return;
  const before = esc(g.name);
  g.name = e.target.value;
  // keep the group's title page in step, unless its title was edited by hand
  P.pages.forEach(pg => { if (pg.role === 'group-title' && pg.group === id && (pg.texts.title || '') === before) pg.texts.title = esc(g.name); });
  refresh({ trays: false }); commitSoon();
});
groupList.addEventListener('change', e => { if (e.target.dataset.gname) { commit(); refresh(); } });
groupList.addEventListener('click', e => {
  const go = e.target.closest('[data-gogroup]'), del = e.target.closest('[data-delgroup]'), ed = e.target.closest('[data-editgroup]');
  if (ed) { openGroupModal(ed.dataset.editgroup); return; }
  if (go) { const i = P.pages.findIndex(p => p.group === go.dataset.gogroup); if (i >= 0) select(i, null); else toast('Nhóm này chưa có trang nào.'); }
  if (del) {
    const id = del.dataset.delgroup, g = P.groups.find(x => x.id === id);
    if (!confirm(`Xoá nhóm “${g.name}”? Ảnh và trang vẫn giữ nguyên, chỉ bỏ gắn nhóm.`)) return;
    removeGroup(id);
    commit(); refresh();
  }
});
groupList.addEventListener('dragover', e => {
  const row = e.target.closest('[data-group-drop]');
  if (row && [...e.dataTransfer.types].includes('text/x-fa-photo')) { e.preventDefault(); row.classList.add('drop-ok'); }
});
groupList.addEventListener('dragleave', e => { const row = e.target.closest('[data-group-drop]'); if (row) row.classList.remove('drop-ok'); });
groupList.addEventListener('drop', e => {
  const row = e.target.closest('[data-group-drop]'), id = e.dataTransfer.getData('text/x-fa-photo');
  if (!row || !id) return;
  e.preventDefault(); e.stopPropagation(); row.classList.remove('drop-ok');
  setPhotoGroup(id, row.dataset.groupDrop);
});
const exifAll = on => {
  let n = 0;
  P.pages.forEach(pg => pg.items.forEach(it => { if (it.photo) { const ph = photoById(it.photo); if (ph && ph.exif) { it.exif = on; n++; } } }));
  commit(); refresh({ trays: false });
  toast(on ? `Đã bật thông số chụp cho ${n} ảnh.` : 'Đã tắt thông số chụp cho mọi ảnh.');
};
$('#btnExifAllOn').addEventListener('click', () => exifAll(true));
$('#btnExifAllOff').addEventListener('click', () => exifAll(false));

$('#btnSaveProject').addEventListener('click', () => saveProject());
async function saveProject() {
  busy.show('Đang lưu file dự án');
  try { const b = await FA.saveProjectFile(P, (i, n, t) => busy.step(i, n, t)); FA.download(b, FA.slug(P.title) + '.album.zip'); markSaved(); toast('Đã lưu file dự án.'); }
  catch (e) { toast('Không lưu được: ' + e.message, true); }
  finally { busy.hide(); }
}
$('#btnOpenProject').addEventListener('click', () => el.fileProject.click());
el.fileProject.addEventListener('change', async () => {
  const f = el.fileProject.files && el.fileProject.files[0]; el.fileProject.value = '';
  if (!f) return;
  if ((P.photos.length || P.pages.length) && !confirm('Mở dự án này sẽ thay thế album hiện tại trên máy. Tiếp tục? (Nên lưu file dự án hiện tại trước.)')) return;
  busy.show('Đang mở dự án');
  try {
    const { project, blobs } = await FA.readProjectFile(f);
    await FA.store.clear('blobs'); dropUrls();
    const missing = [];
    for (let i = 0; i < project.photos.length; i++) {
      const p = project.photos[i], b = blobs.get(p.id);
      busy.step(i, project.photos.length, p.name);
      if (!b) { missing.push(p.name); continue; }
      const v = await FA.makeVariants(b);
      p.w = v.w; p.h = v.h;
      await FA.store.put('blobs', FA.blobKey(p.id, 'orig'), b);
      await FA.store.put('blobs', FA.blobKey(p.id, 'prev'), v.prev);
      await FA.store.put('blobs', FA.blobKey(p.id, 'thumb'), v.thumb);
      urls.prev[p.id] = URL.createObjectURL(v.prev); urls.thumb[p.id] = URL.createObjectURL(v.thumb);
    }
    P = project; P.photos = P.photos.filter(p => blobs.has(p.id));
    P.pages.forEach(pg => pg.items.forEach(it => { if (it.photo && !photoById(it.photo)) it.photo = null; }));
    hist.reset(); ui.page = 0; ui.slot = null; inspKey = ''; markSaved();
    save(); refresh(); storageStat();
    toast(`Đã mở “${FA.plainText(P.title)}”: ${P.pages.length} trang, ${P.photos.length} ảnh.` + (missing.length ? ` Thiếu ${missing.length} ảnh trong file.` : ''), !!missing.length);
  } catch (e) { toast(e.message, true); }
  finally { busy.hide(); }
});
$('#btnNewProject').addEventListener('click', async () => {
  if (!confirm('Bỏ album hiện tại và bắt đầu album mới? Thao tác này không hoàn tác được. Hãy lưu file dự án trước nếu cần.')) return;
  await FA.store.clear('blobs'); dropUrls();
  P = FA.newProject(); hist.reset(); ui.page = 0; ui.slot = null; inspKey = ''; markSaved();
  save(); refresh(); storageStat(); toast('Đã bắt đầu album mới.');
});

$('#btnExport').addEventListener('click', runExport);
async function runExport() {
  const s = S(), fmt = s.export.format, dpi = +s.export.dpi || 300;
  if (fmt === 'album') return saveProject();
  if (!P.pages.length) { toast('Album chưa có trang nào để xuất.', true); return; }
  const name = FA.slug(P.title);
  const titles = { 'pdf-print': 'Chuẩn bị bản in', 'pdf-direct': 'Đang tạo PDF', docx: 'Đang tạo file Word', 'png-zip': 'Đang vẽ các trang' };
  busy.show(titles[fmt]);
  const step = (i, n, t) => busy.step(i, n, t);
  try {
    if (fmt === 'pdf-print') { await FA.printAlbum(P, dpi, step); }
    else if (fmt === 'pdf-direct') { FA.download(await FA.exportPdfDirect(P, dpi, step), name + '.pdf'); toast('Đã tạo PDF.'); }
    else if (fmt === 'docx') { FA.download(await FA.exportDocx(P, dpi, step), name + '.docx'); toast('Đã tạo file Word.'); }
    else if (fmt === 'png-zip') { FA.download(await FA.exportPngZip(P, dpi, step), name + '-trang.zip'); toast('Đã tạo ZIP ảnh trang.'); }
  } catch (e) {
    console.error(e);
    const tainted = /tainted|SecurityError|insecure/i.test(String(e && (e.name + e.message)));
    toast(tainted ? 'Trình duyệt này chặn vẽ trang thành ảnh. Hãy dùng Chrome, Edge hoặc Firefox, hoặc chọn PDF qua hộp thoại in.' : 'Xuất file thất bại: ' + (e.message || e), true);
  } finally { busy.hide(); }
}

/* ---------- leaving the page ----------
   The album is deleted when the tab closes, so warn if there is work that
   has not been saved to a project file (or exported) since the last change. */
let savedSnap = '';
const markSaved = () => { savedSnap = JSON.stringify(P); syncSavedLabel(); };
window.addEventListener('beforeunload', e => {
  if (!P.photos.length || JSON.stringify(P) === savedSnap) return;
  e.preventDefault(); e.returnValue = '';
});

/* ---------- keyboard ---------- */
document.addEventListener('keydown', e => {
  const tag = (e.target.tagName || '').toLowerCase(), typing = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable;
  const mod = e.ctrlKey || e.metaKey;
  if (!el.busy.hidden || !gmEl.box.hidden || !pickEl.box.hidden) return;
  if (mod && !typing && e.key.toLowerCase() === 'z') { e.preventDefault(); doUndo(e.shiftKey); return; }
  if (mod && !typing && e.key.toLowerCase() === 'y') { e.preventDefault(); doUndo(true); return; }
  if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); saveProject(); return; }
  if (typing) return;
  if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); goSpread(-1); }
  else if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); goSpread(1); }
  else if (e.key === 'Escape') { if (ui.slot != null) select(ui.page, null); }
  else if ((e.key === 'Delete' || e.key === 'Backspace') && ui.slot != null && !e.target.closest('#dock')) { e.preventDefault(); frameAction('remove'); }
});

/* ---------- drop files anywhere ---------- */
let dragDepth = 0;
const hasFiles = e => e.dataTransfer && [...e.dataTransfer.types].includes('Files');
window.addEventListener('dragenter', e => { if (hasFiles(e)) { dragDepth++; document.body.classList.add('drag-files'); } });
window.addEventListener('dragleave', e => { if (hasFiles(e) && --dragDepth <= 0) { dragDepth = 0; document.body.classList.remove('drag-files'); } });
window.addEventListener('dragover', e => { if (hasFiles(e)) e.preventDefault(); });
window.addEventListener('drop', e => {
  if (!hasFiles(e)) return;
  e.preventDefault(); dragDepth = 0; document.body.classList.remove('drag-files');
  const files = [...e.dataTransfer.files];
  const proj = files.find(f => /\.zip$/i.test(f.name));
  if (proj && files.length === 1) { const dt = new DataTransfer(); dt.items.add(proj); el.fileProject.files = dt.files; el.fileProject.dispatchEvent(new Event('change')); }
  else importFiles(files);
});

new ResizeObserver(() => refresh({ trays: false })).observe(el.stage);

/* ---------- start ---------- */
(async function start() {
  fillSelects();
  try { await FA.sessionInit(); }
  catch (e) { toast('Không mở được bộ nhớ tạm của trình duyệt: ' + e.message, true); }
  hist = new FA.History(() => P, v => { P = FA.normalizeProject(v); });
  savedSnap = JSON.stringify(P);
  storageStat();
  refresh();
})();

window.FA_DEBUG = { get project() { return P; }, ui, refresh, commit };
})();
