/* =====================================================================
   Toán học & ứng dụng: tiện ích đại số tuyến tính dùng chung cho các minh họa
   của trang 8-dai-so-tuyen-tinh.html (nạp qua def.deps = ['la2']).
   LT.la.eig2(a, b, c, d)   : trị riêng, vector riêng, bội đại số / hình học của [[a, b], [c, d]]
   LT.la.plane(st, view)    : hệ trục toán học trên canvas, view = { cx, cy, half }
   LT.la.grid(ctx, G)       : nền, lưới, trục, nhãn số (bước lưới tự chọn theo tỉ lệ)
   LT.la.lattice(...)       : lưới sinh bởi hai vector u, w (ảnh của lưới ô vuông, hoặc lưới trục riêng)
   LT.la.n(x), LT.la.vec(v) : định dạng số kiểu Việt (dấu phẩy thập phân, tọa độ ngăn bằng dấu chấm phẩy)
   LT.la.matHTML(rows)      : hiển thị ma trận có ngoặc vuông (class .mat trong tm.css)
   LT.la.bindMat(root, ids, onInput): gắn 4 ô nhập phần tử ma trận 2×2
   ===================================================================== */
(() => {
const { COLORS: C } = LT;
const COL = { c1: C.pos, c2: '#3f9d6a', v: '#8f63c9', grid: '#E3EAF0', tgrid: 'rgba(55,135,196,.40)' };
let FONT = null;
const font = () => FONT || (FONT = getComputedStyle(document.body).fontFamily);

/* số: tối đa `dec` chữ số thập phân, bỏ số 0 thừa, dấu phẩy thập phân, dấu trừ thật */
const n = (v, dec = 2) => {
  if (!isFinite(v)) return '—';
  let r = +(+v).toFixed(dec);
  if (Math.abs(r) < Math.pow(10, -dec) / 2) r = 0;
  return String(r).replace('.', ',').replace('-', '−');
};
const np = (v, dec = 2) => (v < 0 && n(v, dec) !== '0' ? '(' + n(v, dec) + ')' : n(v, dec));   // số âm trong ngoặc khi đứng sau dấu ·
const vec = (v, dec = 2) => '(' + v.map(x => n(x, dec)).join('; ') + ')';

/* vector chỉ phương "đẹp": thành phần lớn nhất có trị tuyệt đối 1, thành phần khác 0 đầu tiên dương */
const nice = v => {
  const m = Math.max(Math.abs(v[0]), Math.abs(v[1]));
  if (m < 1e-12) return [0, 0];
  let r = [v[0] / m, v[1] / m];
  if (r[0] < -1e-9 || (Math.abs(r[0]) <= 1e-9 && r[1] < 0)) r = [-r[0], -r[1]];
  return r.map(x => (Math.abs(x) < 1e-12 ? 0 : x));
};

/* trị riêng, vector riêng của ma trận 2×2 [[a, b], [c, d]] */
function eig2(a, b, c, d) {
  const tr = a + d, det = a * d - b * c, disc = tr * tr - 4 * det;
  const tol = 1e-9 * Math.max(1, tr * tr, Math.abs(det));
  const R = { tr, det, disc, sym: Math.abs(b - c) < 1e-9 };
  /* (A − λI)v = 0: lấy hàng có độ lớn lớn hơn, vector vuông góc với hàng đó */
  const evec = l => {
    const r1 = [a - l, b], r2 = [c, d - l];
    const n1 = Math.hypot(r1[0], r1[1]), n2 = Math.hypot(r2[0], r2[1]);
    if (Math.max(n1, n2) < 1e-9) return null;
    const r = n1 >= n2 ? r1 : r2;
    return nice([-r[1], r[0]]);
  };
  if (disc < -tol) { R.kind = 'complex'; R.re = tr / 2; R.im = Math.sqrt(-disc) / 2; return R; }
  if (Math.abs(disc) <= tol) {
    R.kind = 'repeated'; R.l1 = R.l2 = tr / 2;
    R.scalar = Math.abs(b) < 1e-9 && Math.abs(c) < 1e-9 && Math.abs(a - d) < 1e-9;
    R.am = 2; R.gm = R.scalar ? 2 : 1;
    R.v1 = R.scalar ? [1, 0] : evec(R.l1); R.v2 = R.scalar ? [0, 1] : null;
    return R;
  }
  const s = Math.sqrt(disc);
  R.kind = 'distinct'; R.l1 = (tr + s) / 2; R.l2 = (tr - s) / 2;
  R.v1 = evec(R.l1); R.v2 = evec(R.l2);
  return R;
}
/* giá trị kỳ dị lớn nhất (độ giãn lớn nhất) */
const smax = (a, b, c, d) => {
  const p = a * a + c * c, q = a * b + c * d, r = b * b + d * d;
  return Math.sqrt(Math.max(0, (p + r) / 2 + Math.sqrt(((p - r) / 2) ** 2 + q * q)));
};

/* hệ trục: tâm khung (cx, cy), nửa cạnh ngắn của khung = half đơn vị */
function plane(st, { cx = 0, cy = 0, half = 5 } = {}) {
  const { W, H } = st, s = Math.min(W, H) / (2 * half + 0.35), ox = W / 2, oy = H / 2;
  const G = { s, W, H,
    X: x => ox + (x - cx) * s, Y: y => oy - (y - cy) * s,
    ix: px => cx + (px - ox) / s, iy: py => cy - (py - oy) / s };
  G.x0 = G.ix(0); G.x1 = G.ix(W); G.y0 = G.iy(H); G.y1 = G.iy(0);
  return G;
}
const STEPS = [0.05, 0.1, 0.2, 0.25, 0.5, 1, 2, 5];
function grid(ctx, G, { labels = true } = {}) {
  const step = STEPS.find(v => v * G.s >= 26) || 10;
  const lstep = step * G.s >= 40 ? step : step * 2;
  ctx.fillStyle = C.paper; ctx.fillRect(0, 0, G.W, G.H);
  ctx.strokeStyle = COL.grid; ctx.lineWidth = 1; ctx.beginPath();
  for (let x = Math.ceil(G.x0 / step) * step; x <= G.x1; x += step) { const p = Math.round(G.X(x)) + .5; ctx.moveTo(p, 0); ctx.lineTo(p, G.H); }
  for (let y = Math.ceil(G.y0 / step) * step; y <= G.y1; y += step) { const p = Math.round(G.Y(y)) + .5; ctx.moveTo(0, p); ctx.lineTo(G.W, p); }
  ctx.stroke();
  ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5; ctx.beginPath();
  ctx.moveTo(0, G.Y(0)); ctx.lineTo(G.W, G.Y(0)); ctx.moveTo(G.X(0), 0); ctx.lineTo(G.X(0), G.H); ctx.stroke();
  if (!labels) return;
  ctx.font = '12px ' + font(); ctx.fillStyle = C.muted; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  const yAx = Math.min(G.H - 16, Math.max(2, G.Y(0) + 4)), xAx = Math.min(G.W - 4, Math.max(26, G.X(0) - 5));
  for (let x = Math.ceil(G.x0 / lstep) * lstep; x <= G.x1; x += lstep) if (Math.abs(x) > 1e-9) ctx.fillText(n(x), G.X(x), yAx);
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (let y = Math.ceil(G.y0 / lstep) * lstep; y <= G.y1; y += lstep) if (Math.abs(y) > 1e-9) ctx.fillText(n(y), xAx, G.Y(y));
}
/* lưới { i·u + t·w } và { t·u + j·w }; hai họ đường thẳng có thể khác màu */
function lattice(ctx, G, u, w, colU, colW = colU, width = 1, step = 1) {
  const det = u[0] * w[1] - u[1] * w[0];
  let i0 = -12, i1 = 12, j0 = -12, j1 = 12;
  if (Math.abs(det) > 1e-6) {
    const corners = [[G.x0, G.y0], [G.x1, G.y0], [G.x0, G.y1], [G.x1, G.y1]]
      .map(([x, y]) => [(x * w[1] - y * w[0]) / det / step, (u[0] * y - u[1] * x) / det / step]);
    const lim = v => Math.max(-80, Math.min(80, v));
    i0 = lim(Math.floor(Math.min(...corners.map(p => p[0])))); i1 = lim(Math.ceil(Math.max(...corners.map(p => p[0]))));
    j0 = lim(Math.floor(Math.min(...corners.map(p => p[1])))); j1 = lim(Math.ceil(Math.max(...corners.map(p => p[1]))));
  }
  const P = (a, b) => [G.X((a * u[0] + b * w[0]) * step), G.Y((a * u[1] + b * w[1]) * step)];
  ctx.lineWidth = width;
  ctx.strokeStyle = colU; ctx.beginPath();   // các đường song song với u (j cố định)
  for (let j = j0; j <= j1; j++) { const p = P(i0, j), q = P(i1, j); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); }
  ctx.stroke();
  ctx.strokeStyle = colW; ctx.beginPath();   // các đường song song với w (i cố định)
  for (let i = i0; i <= i1; i++) { const p = P(i, j0), q = P(i, j1); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); }
  ctx.stroke();
}
/* đường thẳng qua gốc theo phương d, kéo dài hết khung */
function line(ctx, G, d, color, width = 2, dash = [7, 5]) {
  const L = Math.hypot(G.x1 - G.x0, G.y1 - G.y0) * 2, m = Math.hypot(d[0], d[1]) || 1;
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash(dash); ctx.beginPath();
  ctx.moveTo(G.X(-d[0] / m * L), G.Y(-d[1] / m * L)); ctx.lineTo(G.X(d[0] / m * L), G.Y(d[1] / m * L)); ctx.stroke(); ctx.setLineDash([]);
}
function handle(ctx, x, y, color, hollow = false, r = 7) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI);
  ctx.fillStyle = hollow ? '#fff' : color; ctx.fill();
  ctx.lineWidth = hollow ? 2.5 : 1.5; ctx.strokeStyle = hollow ? color : C.ink; ctx.stroke();
}
/* chữ có viền nền để đọc được trên lưới */
function label(ctx, s, x, y, color = C.ink, align = 'left', base = 'bottom', size = 14, weight = 600) {
  ctx.font = `${weight} ${size}px ${font()}`; ctx.textAlign = align; ctx.textBaseline = base;
  ctx.lineJoin = 'round'; ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(251,252,253,.92)'; ctx.strokeText(s, x, y);
  ctx.fillStyle = color; ctx.fillText(s, x, y);
}
/* đặt nhãn cạnh đầu mũi tên, đẩy ra ngoài theo hướng mũi tên và giữ trong khung */
function tipLabel(ctx, G, p, s, color) {
  const px = G.X(p[0]), py = G.Y(p[1]), m = Math.hypot(p[0], p[1]) || 1;
  let x = px + (p[0] / m) * 12, y = py - (p[1] / m) * 12;
  x = Math.max(14, Math.min(G.W - 14, x)); y = Math.max(16, Math.min(G.H - 6, y));
  label(ctx, s, x, y, color, p[0] / m < -0.3 ? 'right' : p[0] / m > 0.3 ? 'left' : 'center', p[1] / m > 0.3 ? 'bottom' : p[1] / m < -0.3 ? 'top' : 'middle');
}

const cell = x => `<span>${typeof x === 'number' ? n(x) : x}</span>`;
const matHTML = (rows, cls = '') => `<span class="mat c${rows[0].length}${cls ? ' ' + cls : ''}">${rows.flat().map(cell).join('')}</span>`;

function bindMat(root, ids, onInput) {
  const els = ids.map(id => root.querySelector('#' + id));
  const get = () => els.map(e => { const v = parseFloat(String(e.value).replace(',', '.')); return isFinite(v) ? v : 0; });
  const set = m => els.forEach((e, i) => { e.value = String(+(+m[i]).toFixed(2)); });
  els.forEach(e => e.addEventListener('input', () => onInput(get())));
  return { get, set, els };
}

LT.la = { COL, font, n, np, vec, nice, eig2, smax, plane, grid, lattice, line, handle, label, tipLabel, matHTML, bindMat };
})();
