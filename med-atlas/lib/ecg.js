/* =====================================================================
   Trình xem điện tâm đồ 12 chuyển đạo (3-ecg.html).
   Dữ liệu do tools/prepare_ecg.py tạo trong lib/data/ecg/ (xem README-ecg.md):
     cases.json            thứ tự tab; mỗi ca bệnh có một người thường đi kèm (control)
     <ca>/signal.i16.gz    12 chuyển đạo x N mẫu, int16 µV, xếp theo chuyển đạo
     <ca>/meta.json        tuổi, giới, nhãn PTB-XL, đỉnh R, nhịp trung bình, mốc sóng, số đo
     <ca>/case.json        chữ hiển thị: tiêu đề, tóm tắt, các điểm cần tìm (sửa tay được)
   Ba cách xem: 12 chuyển đạo (khổ giấy 3 x 4 + dải nhịp DII), 1 chuyển đạo, nhịp trung bình.
   Giấy ECG chuẩn: 25 mm/s, 10 mm/mV (nhịp trung bình vẽ ở 50 mm/s cho dễ nhìn).
   Kéo trên một ô để đo khoảng thời gian và biên độ (thước đo, caliper); nhấp hoặc Esc để xóa.
   ===================================================================== */
(() => {
'use strict';
const LEADS = ['I', 'II', 'III', 'aVR', 'aVL', 'aVF', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6'];
const GRID = [['I', 'aVR', 'V1', 'V4'], ['II', 'aVL', 'V2', 'V5'], ['III', 'aVF', 'V3', 'V6']];
const COL = {
  paper: '#FFF8F6', minor: '#F6D5CF', major: '#E9A499', ink: '#1B1920', ctl: '#3787c4', caseC: '#d8312a',
  label: '#7a2a22', hl: 'rgba(242,194,48,.16)', hlLine: '#C99A00', cal: '#0b6b3a',
  P: 'rgba(123,205,232,.30)', QRS: 'rgba(55,135,196,.18)', T: 'rgba(242,194,48,.28)',
};
const MM_S = 25, MM_MV = 10;          // giấy chuẩn
const MED_MM_S = 50;                  // nhịp trung bình phóng gấp đôi theo trục thời gian
const CAL_MM = 10;                    // lề trái có xung chuẩn 1 mV
const $ = id => document.getElementById(id);
const nf = (v, d = 2) => v == null || Number.isNaN(v) ? '–' : (Math.abs(v) < 0.5 * 10 ** -d ? 0 : Number(v)).toLocaleString('vi-VN', { maximumFractionDigits: d });
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const MIN_SVG = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3 8h10" stroke="currentColor" stroke-width="2.2"/></svg>';
const MAX_SVG = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M2.5 2.5h11v11h-11z" fill="none" stroke="currentColor" stroke-width="2"/></svg>';

const S = {
  base: 'lib/data/ecg/', list: [], cache: new Map(), cur: null,
  mode: '12', who: 'case', lead: 'II', win: 10, start: 0, marks: true,
  hl: new Set(), hlIdx: -1, cal: null, drag: null, panels: [], k: 1,
};

/* ---------- tải dữ liệu ---------- */
async function bytes(url) {
  const r = await fetch(url, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  let b = new Uint8Array(await r.arrayBuffer());
  if (b[0] === 0x1f && b[1] === 0x8b) {         // server có thể đã giải nén sẵn
    if (!('DecompressionStream' in window)) throw new Error('Trình duyệt quá cũ: thiếu DecompressionStream để giải nén dữ liệu.');
    b = new Uint8Array(await new Response(new Blob([b]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
  }
  return b;
}
const json = url => fetch(url, { cache: 'no-cache' }).then(r => { if (!r.ok) throw new Error(`${r.status} ${url}`); return r.json(); });

async function loadRec(key) {
  if (S.cache.has(key)) return S.cache.get(key);
  const p = (async () => {
    const [meta, raw, text] = await Promise.all([
      json(S.base + key + '/meta.json'),
      bytes(S.base + key + '/signal.i16.gz'),
      key.endsWith('-ctl') ? null : json(S.base + key + '/case.json').catch(() => null),
    ]);
    const all = new Int16Array(raw.buffer, raw.byteOffset, raw.byteLength >> 1);
    const sig = {};
    meta.leads.forEach((L, i) => { sig[L] = all.subarray(i * meta.n, (i + 1) * meta.n); });
    const med = {};
    meta.leads.forEach((L, i) => { med[L] = meta.median.data[i]; });
    return { key, meta, text, sig, med };
  })();
  S.cache.set(key, p);
  try { return await p; } catch (e) { S.cache.delete(key); throw e; }
}

/* ---------- dựng khung vẽ ---------- */
const cv = () => $('ecgCanvas');
function subjects() {
  const c = S.cur;
  if (!c.ctl || S.who === 'case') return [['case', c.rec]];
  if (S.who === 'ctl') return [['ctl', c.ctl]];
  return [['case', c.rec], ['ctl', c.ctl]];
}
function whoText(who, rec) {
  const m = rec.meta, sx = m.sex === 'female' ? 'nữ' : 'nam';
  return (who === 'ctl' ? 'Người thường' : (S.cur.isNormal ? 'Người khỏe' : 'Người bệnh')) + `: ${sx}, ${m.age} tuổi`;
}

/* bố cục tính bằng mm; trả về các khối {who, rec, panels:[...]} rồi nhân với S.k (px/mm) khi vẽ */
function layout() {
  const subs = subjects(), blocks = [];
  let y = 0, W = 0;
  const HEAD = 7;
  if (S.mode === '12') {
    const ROW = 25, colW = 2.5 * MM_S;
    W = CAL_MM + 4 * colW;
    for (const [who, rec] of subs) {
      const b = { who, rec, y, h: HEAD + 4 * ROW, panels: [] };
      GRID.forEach((row, r) => row.forEach((L, c) => b.panels.push({
        lead: L, x: CAL_MM + c * colW, y: y + HEAD + r * ROW, w: colW, h: ROW, t0: c * 2.5, dur: 2.5, mmS: MM_S, kind: 'raw', calRow: c === 0,
      })));
      b.panels.push({ lead: 'II', x: CAL_MM, y: y + HEAD + 3 * ROW, w: 4 * colW, h: ROW, t0: 0, dur: 10, mmS: MM_S, kind: 'raw', calRow: true, rhythm: true });
      blocks.push(b); y += b.h + 3;
    }
  } else if (S.mode === '1') {
    const H = 40, w = S.win * MM_S;
    W = CAL_MM + w;
    for (const [who, rec] of subs) {
      const b = { who, rec, y, h: HEAD + H, panels: [] };
      b.panels.push({ lead: S.lead, x: CAL_MM, y: y + HEAD, w, h: H, t0: S.start, dur: S.win, mmS: MM_S, kind: 'raw', calRow: true, rhythm: true });
      blocks.push(b); y += b.h + 3;
    }
  } else {
    const rec0 = subs[0][1], dur = rec0.meta.median.data[0].length / rec0.meta.fs;
    const colW = dur * MED_MM_S, ROW = 32;
    W = 4 * colW + 3 * 2;
    const overlay = subs.length > 1;
    const list = overlay ? [['both', null]] : subs;
    for (const [who, rec] of list) {
      const b = { who, rec, y, h: HEAD + 3 * ROW, panels: [] };
      GRID.forEach((row, r) => row.forEach((L, c) => b.panels.push({
        lead: L, x: c * (colW + 2), y: y + HEAD + r * ROW, w: colW, h: ROW, t0: 0, dur, mmS: MED_MM_S, kind: 'median',
      })));
      blocks.push(b); y += b.h + 3;
    }
  }
  return { blocks, W, H: y - 3 };
}

function draw() {
  if (!S.cur) return;
  const c = cv(), wrap = $('ecgWrap');
  const L = layout();
  const minW = S.mode === '1' ? 0 : 720;
  const cssW = Math.max(minW, wrap.clientWidth);
  const k = cssW / L.W;
  S.k = k;
  const cssH = Math.round(L.H * k);
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  c.style.width = cssW + 'px'; c.style.height = cssH + 'px';
  c.width = Math.round(cssW * dpr); c.height = Math.round(cssH * dpr);
  const g = c.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = '#fff'; g.fillRect(0, 0, cssW, cssH);
  S.panels = [];
  for (const b of L.blocks) drawBlock(g, b, k, L.W);
  if (S.cal) drawCal(g);
  legend();
}

function grid(g, x, y, w, h, k) {
  g.fillStyle = COL.paper; g.fillRect(x, y, w, h);
  const step = k, minorOk = k >= 2.4;
  g.beginPath();
  for (let i = 0, X = x; X <= x + w + .1; i++, X = x + i * step) {
    if (i % 5 === 0) continue;
    if (minorOk) { g.moveTo(Math.round(X) + .5, y); g.lineTo(Math.round(X) + .5, y + h); }
  }
  for (let i = 0, Y = y; Y <= y + h + .1; i++, Y = y + i * step) {
    if (i % 5 === 0) continue;
    if (minorOk) { g.moveTo(x, Math.round(Y) + .5); g.lineTo(x + w, Math.round(Y) + .5); }
  }
  g.strokeStyle = COL.minor; g.lineWidth = 1; g.stroke();
  g.beginPath();
  for (let i = 0, X = x; X <= x + w + .1; i += 5, X = x + i * step) { g.moveTo(Math.round(X) + .5, y); g.lineTo(Math.round(X) + .5, y + h); }
  for (let i = 0, Y = y; Y <= y + h + .1; i += 5, Y = y + i * step) { g.moveTo(x, Math.round(Y) + .5); g.lineTo(x + w, Math.round(Y) + .5); }
  g.strokeStyle = COL.major; g.lineWidth = 1; g.stroke();
}

function drawBlock(g, b, k, Wmm) {
  const top = b.y * k, H = b.h * k;
  // tiêu đề khối
  g.fillStyle = COL.ink; g.font = `600 ${Math.max(12, Math.min(15, 4.2 * k))}px "Be Vietnam Pro", system-ui, sans-serif`;
  g.textBaseline = 'middle';
  if (b.who === 'both') {
    const t1 = whoText('case', S.cur.rec), t2 = whoText('ctl', S.cur.ctl);
    const sw = (x, col) => { g.fillStyle = col; g.fillRect(x, top + 3.4 * k - 1.5, 18, 3); };
    sw(2, COL.caseC); g.fillStyle = COL.caseC; g.fillText(t1, 26, top + 3.4 * k);
    const x2 = 26 + g.measureText(t1).width + 24;
    sw(x2, COL.ctl); g.fillStyle = COL.ctl; g.fillText(t2, x2 + 24, top + 3.4 * k);
  } else {
    g.fillText(whoText(b.who, b.rec), 2, top + 3.4 * k);
  }
  const gx = 0, gy = top + 7 * k;
  if (S.mode !== 'med') grid(g, gx, gy, Wmm * k, H - 7 * k, k);
  for (const p of b.panels) {
    const P = { ...p, X: p.x * k, Y: p.y * k, W: p.w * k, Hh: p.h * k, who: b.who, rec: b.rec };
    if (S.mode === 'med') grid(g, P.X, P.Y, P.W, P.Hh, k);
    S.panels.push(P);
    if (S.hl.has(p.lead) && !(p.rhythm && S.mode === '12' && !S.hl.has('II'))) {
      g.fillStyle = COL.hl; g.fillRect(P.X, P.Y, P.W, P.Hh);
      g.strokeStyle = COL.hlLine; g.lineWidth = 2; g.strokeRect(P.X + 1, P.Y + 1, P.W - 2, P.Hh - 2);
    }
    if (p.kind === 'median') drawMedian(g, P, k); else drawRaw(g, P, k);
    // nhãn chuyển đạo
    g.fillStyle = COL.label; g.font = `700 ${Math.max(11, Math.min(15, 3.6 * k))}px "Be Vietnam Pro", system-ui, sans-serif`;
    g.textBaseline = 'top';
    g.fillText(p.lead, P.X + (p.calRow && S.mode === '12' && p.x === CAL_MM ? 1.2 * k : 1.2 * k), P.Y + 1 * k);
    if (S.mode === '12' && p.x > CAL_MM && !p.rhythm) {     // vạch ngăn cột như trên giấy in
      const yc = P.Y + P.Hh / 2;
      g.strokeStyle = COL.ink; g.lineWidth = 1.2; g.beginPath(); g.moveTo(P.X, yc - 3 * k); g.lineTo(P.X, yc + 3 * k); g.stroke();
    }
  }
}

function calPulse(g, P, k) {
  const y0 = P.Y + P.Hh * 0.62, x = P.X - CAL_MM * k + 2 * k;
  g.strokeStyle = COL.ink; g.lineWidth = 1.3; g.beginPath();
  g.moveTo(x, y0); g.lineTo(x + 1 * k, y0); g.lineTo(x + 1 * k, y0 - MM_MV * k); g.lineTo(x + 6 * k, y0 - MM_MV * k);
  g.lineTo(x + 6 * k, y0); g.lineTo(x + 7 * k, y0); g.stroke();
}

function drawRaw(g, P, k) {
  const rec = P.rec, fs = rec.meta.fs, s = rec.sig[P.lead];
  if (P.calRow && P.x === CAL_MM) calPulse(g, P, k);
  const y0 = P.Y + P.Hh * 0.62, pxS = P.mmS * k, pxMv = MM_MV * k;
  P.y0 = y0; P.pxS = pxS; P.pxMv = pxMv;
  const i0 = Math.max(0, Math.floor(P.t0 * fs)), i1 = Math.min(s.length - 1, Math.ceil((P.t0 + P.dur) * fs));
  const step = Math.max(1, Math.floor((i1 - i0) / (P.W * 2)));
  g.save(); g.beginPath(); g.rect(P.X, P.Y - P.Hh * 0.6, P.W, P.Hh * 2.2); g.clip();
  g.strokeStyle = P.who === 'ctl' ? COL.ctl : COL.ink; g.lineWidth = 1.35; g.lineJoin = 'round';
  g.beginPath();
  for (let i = i0; i <= i1; i += step) {
    const X = P.X + (i / fs - P.t0) * pxS, Y = y0 - s[i] / 1000 * pxMv;
    i === i0 ? g.moveTo(X, Y) : g.lineTo(X, Y);
  }
  g.stroke();
  g.restore();
  if (S.marks && P.rhythm) rrMarks(g, P, k);
}

function rrMarks(g, P, k) {
  const m = P.rec.meta, fs = m.fs, rp = m.rpeaks;
  g.fillStyle = COL.label; g.strokeStyle = COL.label; g.lineWidth = 1;
  g.font = `500 ${Math.max(10, Math.min(12.5, 3 * k))}px "Be Vietnam Pro", system-ui, sans-serif`;
  g.textBaseline = 'bottom'; g.textAlign = 'center';
  const yT = P.Y + 3.2 * k;
  let prev = null;
  for (const r of rp) {
    const t = r / fs;
    if (t < P.t0 || t > P.t0 + P.dur) { prev = r; continue; }
    const X = P.X + (t - P.t0) * P.pxS;
    g.beginPath(); g.moveTo(X - 3, yT + 6); g.lineTo(X + 3, yT + 6); g.lineTo(X, yT + 11); g.closePath(); g.fill();
    if (prev != null && prev / fs >= P.t0) {
      const Xp = P.X + (prev / fs - P.t0) * P.pxS;
      if (X - Xp > 34) g.fillText(Math.round((r - prev) * 1000 / fs), (X + Xp) / 2, yT + 9);
    }
    prev = r;
  }
  g.textAlign = 'left';
}

function drawMedian(g, P, k) {
  const pxS = P.mmS * k, pxMv = MM_MV * k, y0 = P.Y + P.Hh * 0.6;
  P.y0 = y0; P.pxS = pxS; P.pxMv = pxMv;
  const recs = P.who === 'both' ? [['ctl', S.cur.ctl], ['case', S.cur.rec]] : [[P.who, P.rec]];   // người bệnh vẽ sau, nằm trên
  const fidRec = P.who === 'ctl' ? S.cur.ctl : S.cur.rec;
  P.rec = fidRec; P.pre = fidRec.meta.median.pre_ms;
  if (S.marks) bands(g, P, k, fidRec);
  // đường đẳng điện
  g.strokeStyle = 'rgba(27,25,32,.35)'; g.lineWidth = 1; g.setLineDash([3, 3]);
  g.beginPath(); g.moveTo(P.X, Math.round(y0) + .5); g.lineTo(P.X + P.W, Math.round(y0) + .5); g.stroke(); g.setLineDash([]);
  g.save(); g.beginPath(); g.rect(P.X, P.Y, P.W, P.Hh); g.clip();
  for (const [who, rec] of recs) {
    const d = rec.med[P.lead], fs = rec.meta.median.fs, off = (P.pre - rec.meta.median.pre_ms) / 1000;   // căn đỉnh R
    g.strokeStyle = P.who === 'both' ? (who === 'ctl' ? COL.ctl : COL.caseC) : (who === 'ctl' ? COL.ctl : COL.ink);
    g.lineWidth = P.who === 'both' && who === 'ctl' ? 1.6 : 1.7; g.lineJoin = 'round';
    g.beginPath();
    for (let i = 0; i < d.length; i++) {
      const X = P.X + (i / fs + off) * pxS, Y = y0 - d[i] / 1000 * pxMv;
      i ? g.lineTo(X, Y) : g.moveTo(X, Y);
    }
    g.stroke();
  }
  g.restore();
}

function bands(g, P, k, rec) {
  const f = rec.meta.measures.fid_ms, pre = P.pre;
  const X = ms => P.X + (ms + pre) / 1000 * P.pxS;
  const band = (a, b, col, lab) => {
    if (a == null || b == null) return;
    g.fillStyle = col; g.fillRect(X(a), P.Y, X(b) - X(a), P.Hh);
    g.fillStyle = COL.label; g.font = `600 ${Math.max(9.5, Math.min(12, 2.6 * k))}px "Be Vietnam Pro", system-ui, sans-serif`;
    g.textBaseline = 'bottom'; g.textAlign = 'center'; g.fillText(lab, (X(a) + X(b)) / 2, P.Y + P.Hh - 2); g.textAlign = 'left';
  };
  const pEnd = f.p_peak != null && f.p_on != null ? f.p_peak + (f.p_peak - f.p_on) : null;
  band(f.p_on, pEnd, COL.P, 'P');
  band(f.qrs_on, f.qrs_off, COL.QRS, 'QRS');
  const tStart = f.t_peak != null && f.t_end != null ? f.t_peak - (f.t_end - f.t_peak) : null;
  band(tStart, f.t_end, COL.T, 'T');
}

/* ---------- thước đo (caliper) ---------- */
function hit(mx, my) {
  return S.panels.find(p => mx >= p.X && mx <= p.X + p.W && my >= p.Y && my <= p.Y + p.Hh) || null;
}
function sampleAt(P, mx) {
  const t = P.t0 + (mx - P.X) / P.pxS;
  if (P.kind === 'median') {
    const ms = Math.round(t * 1000 - P.pre);
    const fs = P.rec.meta.median.fs, i = Math.round((t) * fs);
    const rec = P.who === 'both' ? S.cur.rec : P.rec;
    const d = rec.med[P.lead];
    return { t, label: (ms > 0 ? '+' : '') + ms + ' ms so với đỉnh R', mv: d[Math.max(0, Math.min(d.length - 1, i))] / 1000 };
  }
  const s = P.rec.sig[P.lead], fs = P.rec.meta.fs, i = Math.max(0, Math.min(s.length - 1, Math.round(t * fs)));
  return { t, label: nf(t, 3) + ' s', mv: s[i] / 1000 };
}
function drawCal(g) {
  const c = S.cal, P = c.P;
  g.save(); g.beginPath(); g.rect(P.X, P.Y, P.W, P.Hh); g.clip();
  g.strokeStyle = COL.cal; g.lineWidth = 1.6;
  g.beginPath();
  g.moveTo(c.x1, P.Y); g.lineTo(c.x1, P.Y + P.Hh); g.moveTo(c.x2, P.Y); g.lineTo(c.x2, P.Y + P.Hh);
  g.stroke();
  g.setLineDash([4, 3]); g.beginPath(); g.moveTo(c.x1, c.y1); g.lineTo(c.x2, c.y1); g.lineTo(c.x2, c.y2); g.stroke(); g.setLineDash([]);
  g.restore();
  const m = calText();
  if (m) {
    g.font = '600 12.5px "Be Vietnam Pro", system-ui, sans-serif';
    const w = g.measureText(m.short).width + 10, x = Math.min(Math.max(c.x1, c.x2) + 6, P.X + P.W - w), y = Math.max(P.Y + 2, Math.min(c.y1, c.y2) - 22);
    g.fillStyle = 'rgba(255,255,255,.92)'; g.fillRect(x, y, w, 18);
    g.strokeStyle = COL.cal; g.lineWidth = 1; g.strokeRect(x + .5, y + .5, w - 1, 17);
    g.fillStyle = COL.cal; g.textBaseline = 'middle'; g.fillText(m.short, x + 5, y + 9.5);
  }
}
function calText() {
  const c = S.cal; if (!c) return null;
  const P = c.P, dt = Math.abs(c.x2 - c.x1) / P.pxS * 1000, dv = (c.y1 - c.y2) / P.pxMv;
  if (dt < 1 && Math.abs(dv) < .01) return null;
  const bpm = dt > 150 ? Math.round(60000 / dt) : null;
  return {
    short: `${Math.round(dt)} ms${bpm ? ` (${bpm}/ph)` : ''}, ${nf(dv, 2)} mV`,
    long: `<span class="q">Thước đo (${esc(P.lead)})</span> <b>${Math.round(dt)} ms</b>${bpm ? ` <span class="q">tương ứng</span> <b>${bpm} lần/phút</b>` : ''} <span class="q">chênh</span> <b>${nf(dv, 2)} mV</b> <span class="q">(${nf(Math.abs(dt) / (1000 / P.mmS), 1)} ô nhỏ ngang)</span>`,
  };
}

function readout(html) { $('ecgReadout').innerHTML = html || '<span class="q">Rê chuột lên sóng để đọc thời gian và biên độ. Kéo để đo khoảng cách.</span>'; }

function bindCanvas() {
  const c = cv(), pos = e => { const r = c.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  c.addEventListener('pointerdown', e => {
    const [x, y] = pos(e), P = hit(x, y); if (!P) return;
    S.drag = { P, x1: x, y1: y, x2: x, y2: y, moved: false };
    c.setPointerCapture(e.pointerId);
  });
  c.addEventListener('pointermove', e => {
    const [x, y] = pos(e);
    if (S.drag) {
      const d = S.drag, P = d.P;
      d.x2 = Math.max(P.X, Math.min(P.X + P.W, x)); d.y2 = Math.max(P.Y, Math.min(P.Y + P.Hh, y));
      if (Math.abs(d.x2 - d.x1) + Math.abs(d.y2 - d.y1) > 4) d.moved = true;
      if (d.moved) { S.cal = d; draw(); const m = calText(); readout(m && m.long); }
      return;
    }
    const P = hit(x, y);
    if (!P) { if (!S.cal) readout(); return; }
    const s = sampleAt(P, x);
    let extra = '';
    if (P.kind === 'median') {
      const st = (P.who === 'both' ? S.cur.rec : P.rec).meta.measures.st60[P.lead];
      extra = ` <span class="q">ST tại J+60 ms</span> <b>${nf(st, 2)} mV</b>`;
      if (P.who === 'both') extra += ` <span class="q">(người thường ${nf(S.cur.ctl.meta.measures.st60[P.lead], 2)})</span>`;
    }
    if (!S.cal) readout(`<span class="q">Chuyển đạo</span> <b>${esc(P.lead)}</b> <span class="q">thời điểm</span> <b>${esc(s.label)}</b> <span class="q">biên độ</span> <b>${nf(s.mv, 2)} mV</b>${extra}`);
  });
  const end = () => {
    if (!S.drag) return;
    if (!S.drag.moved) { S.cal = null; draw(); readout(); }
    S.drag = null;
  };
  c.addEventListener('pointerup', end); c.addEventListener('pointercancel', end);
  c.addEventListener('pointerleave', () => { if (!S.drag && !S.cal) readout(); });
  addEventListener('keydown', e => { if (e.key === 'Escape' && S.cal) { S.cal = null; draw(); readout(); } });
}

/* ---------- chú giải dưới khung ---------- */
function legend() {
  const both = S.cur.ctl && S.who === 'both';
  const parts = [];
  parts.push(S.mode === 'med' ? '<span>Nhịp trung bình: <b>50 mm/s</b>, <b>10 mm/mV</b>; ô lớn = 100 ms × 0,5 mV</span>'
    : '<span>Tốc độ <b>25 mm/s</b>, biên độ <b>10 mm/mV</b>; ô lớn = 200 ms × 0,5 mV</span>');
  if (both && S.mode === 'med') parts.push(`<span><i class="sw" style="border-color:${COL.caseC}"></i>${S.cur.isNormal ? 'người khỏe' : 'người bệnh'}</span><span><i class="sw" style="border-color:${COL.ctl}"></i>người thường</span>`);
  if (S.marks && S.mode !== 'med') parts.push('<span>▼ đỉnh R, số giữa hai đỉnh là khoảng RR (ms)</span>');
  if (S.marks && S.mode === 'med') parts.push('<span>Dải màu P, QRS, T: ước lượng tự động</span>');
  $('ecgLegend').innerHTML = parts.join('');
}

/* ---------- khung thông tin ---------- */
const RANGES = {
  hr: { lab: 'Tần số tim', unit: 'lần/phút', ok: v => v >= 60 && v <= 100, norm: '60–100' },
  rr: { lab: 'Độ lệch RR', unit: 'ms', ok: v => v < 80, norm: 'nhỏ, nhịp đều' },
  pr: { lab: 'Khoảng PR', unit: 'ms', ok: v => v >= 120 && v <= 200, norm: '120–200' },
  qrs: { lab: 'Thời gian QRS', unit: 'ms', ok: v => v < 120, norm: 'dưới 120' },
  qtc: { lab: 'QTc (Bazett)', unit: 'ms', ok: (v, f) => v < (f ? 460 : 450), norm: 'dưới 450 (nam), 460 (nữ)' },
  axis: { lab: 'Trục QRS', unit: '°', ok: v => v >= -30 && v <= 90, norm: '−30 đến +90' },
  sok: { lab: 'Sokolow–Lyon', unit: 'mV', ok: v => v < 3.5, norm: 'dưới 3,5' },
  cor: { lab: 'Cornell', unit: 'mV', ok: (v, f) => v <= (f ? 2.0 : 2.8), norm: '≤ 2,8 (nam), 2,0 (nữ)' },
};
function mrow(key, m, female) {
  const x = m.measures;
  return { hr: x.hr, rr: x.rr_sd, pr: x.pr, qrs: x.qrs, qtc: x.qtc_b, axis: x.axis, sok: x.sokolow, cor: x.cornell }[key];
}
function cell(key, m) {
  if (!m) return '<td></td>';
  const f = m.meta.sex === 'female', v = mrow(key, m.meta, f);
  if (v == null) return '<td class="na">không đo được</td>';
  const off = !RANGES[key].ok(v, f);
  return `<td class="${off ? 'off' : ''}">${nf(v, 2)}</td>`;
}

function info() {
  const c = S.cur, m = c.rec.meta, t = c.rec.text || {};
  const title = t.title || { vi: c.key, en: '' };
  $('ecgInfoName').textContent = title.vi;
  const sex = m.sex === 'female' ? 'nữ' : 'nam';
  const codes = m.codes.filter(x => x.kind !== 'form' || x.lik >= 100);
  let h = `<h3>${esc(title.vi)}</h3><p class="sub-vi">${esc(title.en)}</p>`;
  h += `<div class="chips"><span class="chip">${sex}, ${m.age} tuổi</span><span class="chip">PTB-XL #${m.ecg_id}</span>${m.stadium.map(s => `<span class="chip">${esc(s)}</span>`).join('')}</div>`;
  if (t.summary) h += `<p class="para">${esc(t.summary)}</p>`;
  if (t.finds && t.finds.length) {
    h += '<h4 class="ih">Cần tìm trên điện tâm đồ</h4><ul class="ecg-finds">';
    t.finds.forEach((f, i) => {
      const on = S.hlIdx === i;
      h += `<li><button type="button" class="find${on ? ' on' : ''}" data-i="${i}" aria-pressed="${on}">${esc(f.text)}${f.leads && f.leads.length ? `<span class="leads">${f.leads.map(esc).join(', ')}</span>` : ''}</button></li>`;
    });
    h += '</ul><p class="note-s">Bấm một dòng để tô các chuyển đạo liên quan.</p>';
  }
  if (t.reviewed === false) h += '<p class="src-note ai"><span class="src-tag ai">AI</span> Phần chữ ở trên do AI soạn, chưa được bác sĩ duyệt.</p>';
  h += '<hr class="sep"><h4 class="ih">Chẩn đoán trong bộ dữ liệu</h4><ul class="ecg-codes">';
  for (const x of codes) h += `<li><b>${esc(x.vi || x.en)}</b> <span class="en">${esc(x.en)}${x.kind === 'diagnostic' && x.lik ? `, độ tin cậy ${x.lik}%` : ''}</span></li>`;
  h += '</ul><p class="src-note expert"><span class="src-tag expert">Bác sĩ</span> Nhãn do bác sĩ tim mạch gán khi xây dựng bộ PTB-XL.</p>';
  // số đo
  const ctl = c.ctl;
  h += '<hr class="sep"><h4 class="ih">Số đo</h4><div class="mtab-wrap"><table class="mtab"><thead><tr><th></th>';
  h += `<th>${c.isNormal ? 'Người này' : 'Ca này'}</th>${ctl ? '<th>Người thường</th>' : ''}<th>Bình thường</th></tr></thead><tbody>`;
  for (const key of Object.keys(RANGES)) {
    const R = RANGES[key];
    h += `<tr><th>${R.lab} <span class="u">${R.unit}</span></th>${cell(key, c.rec)}${ctl ? cell(key, ctl) : ''}<td class="nr">${R.norm}</td></tr>`;
  }
  h += '</tbody></table></div>';
  h += '<p class="src-note ai"><span class="src-tag ai">Tự động</span> Số đo và dải P, QRS, T tính bằng thuật toán đơn giản trên nhịp trung bình, chưa được bác sĩ duyệt; có thể lệch vài chục ms. Ô tô đỏ: ngoài khoảng bình thường.</p>';
  h += `<p class="where"><a href="${esc(m.source)}" rel="noopener">Bản ghi gốc trên PhysioNet</a>${ctl ? `, <a href="${esc(ctl.meta.source)}" rel="noopener">người thường</a>` : ''}</p>`;
  $('ecgInfo').innerHTML = h;
  $('ecgInfo').querySelectorAll('button.find').forEach(b => b.addEventListener('click', () => {
    const i = +b.dataset.i;
    if (S.hlIdx === i) { S.hlIdx = -1; S.hl = new Set(); }
    else {
      S.hlIdx = i; S.hl = new Set(t.finds[i].leads || []);
      if (S.mode === '1' && S.hl.size && !S.hl.has(S.lead)) { S.mode = '12'; syncControls(); }
    }
    info(); draw();
  }));
}

/* ---------- điều khiển ---------- */
function setPressed(groupId, val, attr) {
  $(groupId).querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset[attr] === val)));
}
function syncControls() {
  setPressed('ecgMode', S.mode, 'mode');
  setPressed('ecgWho', S.who, 'who');
  $('ecgWhoRow').hidden = !S.cur || !S.cur.ctl;
  $('ecgLeadRow').hidden = S.mode !== '1';
  $('ecgPosRow').hidden = S.mode !== '1' || S.win >= 10;
  $('ecgLead').value = S.lead;
  $('ecgWin').value = String(S.win);
  const pos = $('ecgPos'); pos.max = String(10 - S.win); pos.step = '0.1';
  S.start = Math.min(S.start, 10 - S.win); pos.value = String(S.start);
  $('ecgPosOut').textContent = `${nf(S.start, 1)}–${nf(S.start + S.win, 1)} s`;
  $('ecgMarks').checked = S.marks;
}
function bindControls() {
  $('ecgMode').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; S.mode = b.dataset.mode; S.cal = null; syncControls(); draw(); readout(); });
  $('ecgWho').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; S.who = b.dataset.who; S.cal = null; syncControls(); draw(); readout(); });
  const sel = $('ecgLead');
  sel.innerHTML = LEADS.map(L => `<option value="${L}">${L}</option>`).join('');
  sel.addEventListener('change', () => { S.lead = sel.value; S.cal = null; draw(); });
  $('ecgWin').addEventListener('change', e => { S.win = +e.target.value; S.cal = null; syncControls(); draw(); });
  $('ecgPos').addEventListener('input', e => { S.start = +e.target.value; S.cal = null; $('ecgPosOut').textContent = `${nf(S.start, 1)}–${nf(S.start + S.win, 1)} s`; draw(); });
  $('ecgMarks').addEventListener('change', e => { S.marks = e.target.checked; draw(); });
  const setBtn = (b, min, what) => { b.innerHTML = min ? MAX_SVG : MIN_SVG; b.setAttribute('aria-expanded', String(!min)); b.title = (min ? 'Mở ' : 'Thu gọn ') + what; b.setAttribute('aria-label', b.title); };
  const infoMin = v => { $('ecgViewer').classList.toggle('info-min', v); setBtn($('ecgInfoMin'), v, 'khung thông tin'); requestAnimationFrame(draw); };
  const ctlMin = v => { $('ecgControls').classList.toggle('min', v); setBtn($('ecgCtlMin'), v, 'bảng điều khiển'); };
  $('ecgInfoMin').addEventListener('click', () => infoMin(!$('ecgViewer').classList.contains('info-min')));
  $('ecgCtlMin').addEventListener('click', () => ctlMin(!$('ecgControls').classList.contains('min')));
  infoMin(false); ctlMin(matchMedia('(max-width: 700px)').matches);
}

function tabs() {
  const box = $('ecgTabs');
  box.innerHTML = '';
  S.list.forEach((e, i) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'btn'; b.dataset.i = i;
    b.innerHTML = `<span class="t-vi">${esc(e.title.vi)}</span><span class="t-en">${esc(e.title.en)}</span>`;
    b.addEventListener('click', () => select(i));
    box.appendChild(b);
  });
}

async function select(i) {
  const e = S.list[i];
  $('ecgTabs').querySelectorAll('button').forEach((b, j) => b.setAttribute('aria-pressed', String(i === j)));
  const ld = $('ecgLoader'); ld.hidden = false; ld.classList.remove('err'); ld.innerHTML = '<div>Đang tải bản ghi…</div>';
  try {
    const [rec, ctl] = await Promise.all([loadRec(e.key), e.control ? loadRec(e.control) : null]);
    S.cur = { key: e.key, rec, ctl, isNormal: !e.control };
    if (!ctl) S.who = 'case';
    else if (S.who === 'ctl' && !ctl) S.who = 'case';
    S.hl = new Set(); S.hlIdx = -1; S.cal = null;
    ld.hidden = true;
    syncControls(); info(); draw(); readout();
    if (location.hash.slice(1) !== e.key) history.replaceState(null, '', '#' + e.key);
  } catch (err) {
    ld.classList.add('err');
    ld.innerHTML = `<div>Không tải được bản ghi <code>${esc(e.key)}</code>.<br>${esc(err.message)}</div>`;
  }
}

async function start(opt = {}) {
  if (opt.data) S.base = opt.data;
  bindControls(); bindCanvas();
  new ResizeObserver(() => { if (S.cur) draw(); }).observe($('ecgWrap'));
  const ld = $('ecgLoader');
  try {
    const idx = await json(S.base + 'cases.json');
    const texts = await Promise.all(idx.cases.map(c => json(S.base + c.key + '/case.json').catch(() => null)));
    S.list = idx.cases.map((c, i) => ({ ...c, title: (texts[i] && texts[i].title) || { vi: c.key, en: '' } }));
    tabs();
    const h = location.hash.slice(1), j = S.list.findIndex(c => c.key === h);
    await select(j >= 0 ? j : 0);
    addEventListener('hashchange', () => {          // liên kết #normal, #afib… trong trang: chọn tab và cuộn lên trình xem
      const k = S.list.findIndex(c => c.key === location.hash.slice(1));
      if (k < 0) return;
      if (!S.cur || S.cur.key !== S.list[k].key) select(k);
      $('ecgTabs').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    });
  } catch (err) {
    ld.classList.add('err');
    ld.innerHTML = '<div>Chưa có dữ liệu điện tâm đồ.<br>Chạy <code>python tools/prepare_ecg.py --src ../_ptbxl --out lib/data/ecg</code> trong thư mục <code>med-atlas</code> (hướng dẫn trong <code>README-ecg.md</code>).</div>';
    console.error(err);
  }
}

window.ECG = { start };
})();
