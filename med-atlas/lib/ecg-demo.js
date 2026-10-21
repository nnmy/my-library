/* =====================================================================
   Hai minh họa trên trang Điện tâm đồ (3-ecg.html), vẽ bằng SVG, không cần dữ liệu ngoài.

   1. #ccDemo  Chu kỳ tim: sơ đồ tim (khử cực, co bóp, van) chạy đồng bộ với ECG DII
               và sơ đồ Wiggers (áp suất thất trái, động mạch chủ, nhĩ trái, thể tích thất trái).
               Một chu kỳ 800 ms (75 lần/phút). t = 0 là lúc nút xoang phát xung.
   2. #ldDemo  Hướng nhìn của chuyển đạo: vectơ điện tim trên mặt phẳng trán và mặt phẳng ngang,
               chiếu lên 12 chuyển đạo để ra hình dạng P, QRS, T. Kéo mũi tên để tự đặt vectơ.

   Mọi đường cong là đường vẽ minh họa theo số liệu sinh lý điển hình, không phải số đo của một người.
   File này chỉ được tải khi người xem mở minh họa (xem lib/ecg-demo-ui.js).
   ===================================================================== */
(() => {
'use strict';
const NS = 'http://www.w3.org/2000/svg';
const C = { ink: '#1B1920', sea: '#3787c4', sky: '#7bcde8', gold: '#f2c230', red: '#d8312a', muted: '#59606B', line: '#DCE6EC',
  rest: '#F4E3E0', dep: '#8CC9EA', path: '#C9B8B4', lv: '#d8312a', ao: '#1B1920', la: '#3787c4', vol: '#2f8a57' };
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const lerp = (a, b, f) => a + (b - a) * f;
const mix = (c1, c2, f) => {
  const p = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
  const a = p(c1), b = p(c2);
  return 'rgb(' + a.map((v, i) => Math.round(lerp(v, b[i], f))).join(',') + ')';
};
const G = (t, mu, s) => Math.exp(-0.5 * ((t - mu) / s) ** 2);
const el = (tag, attrs = {}, parent) => {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
};
/* đường cong trơn qua các điểm mốc (Catmull-Rom), trả về hàm f(t) */
function spline(pts, period) {
  const P = period ? [[pts[pts.length - 2][0] - period, pts[pts.length - 2][1]], ...pts, [pts[1][0] + period, pts[1][1]]] : [pts[0], ...pts, pts[pts.length - 1]];
  return t => {
    if (period) t = ((t % period) + period) % period;
    let i = 1;
    while (i < P.length - 2 && t > P[i + 1][0]) i++;
    const [t0, y0] = P[i - 1], [t1, y1] = P[i], [t2, y2] = P[i + 1], [t3, y3] = P[i + 2];
    const u = clamp((t - t1) / ((t2 - t1) || 1));
    const m1 = (y2 - y0) / ((t2 - t0) || 1) * (t2 - t1), m2 = (y3 - y1) / ((t3 - t1) || 1) * (t2 - t1);
    const u2 = u * u, u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * y1 + (u3 - 2 * u2 + u) * m1 + (-2 * u3 + 3 * u2) * y2 + (u3 - u2) * m2;
  };
}
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
function visible(node, cb) {
  if (!('IntersectionObserver' in window)) { cb(true); return; }
  new IntersectionObserver(es => es.forEach(e => cb(e.isIntersecting)), { threshold: 0.05 }).observe(node);
}

/* =====================================================================
   1. CHU KỲ TIM
   ===================================================================== */
const T = 800;
const ECG2 = t => 0.15 * G(t, 50, 18) - 0.08 * G(t, 178, 6) + 1.05 * G(t, 200, 9) - 0.22 * G(t, 226, 8) + 0.28 * G(t, 440, 42);
const LVP = spline([[0, 4], [70, 5], [150, 9], [205, 10], [240, 40], [270, 80], [330, 115], [380, 121], [460, 108], [515, 92], [560, 40], [600, 6], [700, 3], [800, 4]], T);
const AOP = spline([[0, 86], [150, 82], [270, 80], [330, 113], [380, 119], [460, 107], [515, 98], [528, 91], [545, 98], [650, 91], [800, 86]], T);
const LAP = spline([[0, 6], [60, 7], [115, 11], [170, 6], [215, 7], [245, 9], [300, 4], [420, 8], [575, 13], [620, 7], [680, 5], [800, 6]], T);
const LVV = spline([[0, 106], [70, 110], [170, 122], [205, 122], [270, 121], [330, 96], [420, 63], [515, 50], [600, 50], [650, 85], [700, 100], [800, 106]], T);
const AV_OPEN = t => t < 205 || t >= 600;
const SL_OPEN = t => t >= 270 && t < 515;

const PHASES = [
  { a: 0, b: 70, name: 'Đổ đầy', key: 'fill' },
  { a: 70, b: 205, name: 'Nhĩ co', key: 'asys' },
  { a: 205, b: 270, name: 'Co đồng thể tích', key: 'ivc' },
  { a: 270, b: 515, name: 'Tống máu', key: 'eject' },
  { a: 515, b: 600, name: 'Giãn đồng thể tích', key: 'ivr' },
  { a: 600, b: 800, name: 'Đổ đầy', key: 'fill' },
];
const WAVES = [
  { a: 0, b: 100, name: 'P' }, { a: 100, b: 160, name: 'PR' }, { a: 160, b: 250, name: 'QRS' },
  { a: 250, b: 350, name: 'ST' }, { a: 350, b: 520, name: 'T' }, { a: 520, b: 800, name: 'TP' },
];
/* các mốc để nút "Mốc sau / Mốc trước" nhảy tới, kèm lời giải thích */
const EVENTS = [
  { t: 0, h: 'Nút xoang phát xung', e: 'Nút xoang ở thành nhĩ phải tự phát một xung điện. Xung lan ra hai tâm nhĩ, khử cực lần lượt nhĩ phải rồi nhĩ trái; đây là phần đầu sóng P.', m: 'Tim đang trong kỳ tâm trương: van hai lá, ba lá mở, máu từ tĩnh mạch chảy qua nhĩ xuống thất.' },
  { t: 60, h: 'Sóng P, nhĩ bắt đầu co', e: 'Hai tâm nhĩ đã khử cực gần hết (đỉnh và cuối sóng P).', m: 'Khoảng 50–100 ms sau khi khử cực, cơ nhĩ co lại, đẩy thêm khoảng 20–30% lượng máu xuống thất. Áp suất nhĩ tăng tạo sóng a.' },
  { t: 120, h: 'Đoạn PR: xung bị giữ ở nút nhĩ thất', e: 'Xung đi chậm qua nút nhĩ thất (khoảng 0,1 giây). Trên ECG là đoạn phẳng giữa P và QRS.', m: 'Khoảng chậm này cho tâm nhĩ co xong, thất nhận đủ máu trước khi thất co.' },
  { t: 175, h: 'Đầu QRS: khử cực vách liên thất', e: 'Xung đi nhanh theo bó His, hai nhánh bó và mạng Purkinje. Vách liên thất khử cực trước, từ trái sang phải, tạo sóng q nhỏ ở DII.', m: 'Tâm nhĩ đang giãn ra. Tái cực của tâm nhĩ xảy ra lúc này nhưng bị QRS che khuất.' },
  { t: 205, h: 'Đỉnh R tới hết QRS: khử cực thất, van nhĩ thất đóng', e: 'Khử cực lan từ mỏm tim lên đáy tim, từ lớp trong ra lớp ngoài, qua khối cơ thất trái lớn: sóng R cao rồi sóng S.', m: 'Thất bắt đầu co. Áp suất thất vượt áp suất nhĩ nên van hai lá, ba lá đóng lại; đây là tiếng tim thứ nhất (T1).' },
  { t: 240, h: 'Co đồng thể tích', e: 'QRS vừa kết thúc; toàn bộ cơ thất đã khử cực.', m: 'Cả bốn van đều đóng. Thất co mạnh nhưng chưa tống được máu, thể tích không đổi, áp suất thất tăng vọt.' },
  { t: 300, h: 'Đoạn ST: tống máu', e: 'Đoạn ST nằm ngang trên đường đẳng điện: mọi tế bào cơ thất đang ở cùng một trạng thái (bình nguyên của điện thế hoạt động), nên không có dòng điện giữa các vùng.', m: 'Áp suất thất trái vượt áp suất động mạch chủ (khoảng 80 mmHg): van động mạch chủ và van động mạch phổi mở, máu được tống ra. Thể tích thất giảm nhanh.' },
  { t: 440, h: 'Sóng T: tái cực thất', e: 'Cơ thất tái cực. Lớp ngoài tái cực trước lớp trong, nên sóng T cùng chiều với QRS ở hầu hết chuyển đạo.', m: 'Thất vẫn đang tống máu nhưng chậm dần; áp suất đã qua đỉnh (khoảng 120 mmHg ở thất trái).' },
  { t: 515, h: 'Cuối T: van động mạch đóng', e: 'Sóng T kết thúc; thất đã tái cực xong. Khoảng QT (từ đầu QRS tới cuối T) gần trùng với thời gian thất co.', m: 'Áp suất thất tụt xuống dưới áp suất động mạch chủ: van động mạch đóng (tiếng tim thứ hai, T2), tạo khuyết nhỏ trên đường áp suất động mạch chủ.' },
  { t: 560, h: 'Giãn đồng thể tích', e: 'Đường đẳng điện: không có hoạt động điện.', m: 'Cả bốn van lại đóng. Cơ thất giãn ra, áp suất thất giảm nhanh nhưng thể tích chưa đổi (khoảng 50 ml còn lại trong thất).' },
  { t: 620, h: 'Đổ đầy nhanh', e: 'Đoạn TP: đường đẳng điện, tim nghỉ về điện.', m: 'Áp suất thất xuống dưới áp suất nhĩ: van hai lá, ba lá mở, máu dồn nhanh xuống thất. Phần lớn máu vào thất ở giai đoạn này, trước cả khi nhĩ co.' },
  { t: 720, h: 'Đổ đầy chậm', e: 'Vẫn là đoạn TP. Nhịp càng nhanh, đoạn TP càng ngắn: thời gian đổ đầy bị cắt bớt trước tiên.', m: 'Máu tiếp tục chảy chậm từ nhĩ xuống thất cho tới khi nút xoang phát xung tiếp theo.' },
];

function buildCycle(root) {
  root.innerHTML = '';
  const grid = document.createElement('div'); grid.className = 'cc-grid'; root.appendChild(grid);
  /* ---------- sơ đồ tim ---------- */
  const heartBox = document.createElement('div'); heartBox.className = 'cc-heart'; grid.appendChild(heartBox);
  const H = el('svg', { viewBox: '0 0 300 330', role: 'img', 'aria-label': 'Sơ đồ tim nhìn từ phía trước: bốn buồng tim, hệ thống dẫn truyền và van nhĩ thất. Bên trái hình là tim phải.' }, heartBox);
  const defs = el('defs', {}, H);
  const gA = el('linearGradient', { id: 'ccGA', gradientUnits: 'userSpaceOnUse', x1: 55, y1: 45, x2: 245, y2: 140 }, defs);
  const gAs = [0, 1, 2, 3].map(() => el('stop', {}, gA));
  const gV = el('linearGradient', { id: 'ccGV', gradientUnits: 'userSpaceOnUse', x1: 0, y1: 305, x2: 0, y2: 145 }, defs);
  const gVs = [0, 1, 2, 3].map(() => el('stop', {}, gV));
  const atria = el('g', {}, H);
  const RA = el('rect', { x: 50, y: 40, width: 93, height: 98, rx: 24, fill: 'url(#ccGA)', stroke: C.ink, 'stroke-width': 2 }, atria);
  const LA = el('rect', { x: 157, y: 40, width: 93, height: 98, rx: 24, fill: 'url(#ccGA)', stroke: C.ink, 'stroke-width': 2 }, atria);
  const vent = el('g', {}, H);
  const RV = el('path', { d: 'M50,147 L144,147 Q150,232 170,298 Q92,282 50,217 Z', fill: 'url(#ccGV)', stroke: C.ink, 'stroke-width': 2 }, vent);
  const LV = el('path', { d: 'M160,147 L250,147 L250,202 Q250,272 178,303 Q166,232 160,147 Z', fill: 'url(#ccGV)', stroke: C.ink, 'stroke-width': 2 }, vent);
  const SEP = el('path', { d: 'M144,147 L160,147 Q166,232 178,303 L170,298 Q150,232 144,147 Z', stroke: C.ink, 'stroke-width': 1.2 }, vent);
  // nhãn buồng tim
  const lab = (x, y, s) => { const t = el('text', { x, y, class: 'cc-lab', 'text-anchor': 'middle' }, H); t.textContent = s; return t; };
  lab(97, 100, 'Nhĩ phải'); lab(203, 100, 'Nhĩ trái'); lab(98, 205, 'Thất phải'); lab(205, 215, 'Thất trái');
  // van nhĩ thất: mỗi bên hai lá van
  const valves = [];
  for (const [cx, name] of [[96, 'ba lá'], [203, 'hai lá']]) {
    const g = el('g', {}, H);
    const l1 = el('line', { stroke: C.ink, 'stroke-width': 3.2, 'stroke-linecap': 'round' }, g);
    const l2 = el('line', { stroke: C.ink, 'stroke-width': 3.2, 'stroke-linecap': 'round' }, g);
    valves.push({ cx, l1, l2, name });
  }
  // hệ thống dẫn truyền
  const cond = el('g', { fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, H);
  const path = (d, w = 3) => el('path', { d, 'stroke-width': w }, cond);
  const P_INTER = path('M72,56 Q100,90 136,128 M72,56 Q120,48 186,60');
  const P_HIS = path('M139,132 L151,150 L152,170', 3.4);
  const P_RBB = path('M150,168 Q147,220 160,268 M160,268 Q120,262 82,226 M160,268 Q178,282 168,293', 2.6);
  const P_LBB = path('M154,168 Q162,215 172,270 M172,270 Q222,252 240,200 M172,270 Q200,220 232,160', 2.6);
  const SA = el('circle', { cx: 72, cy: 56, r: 7, stroke: C.ink, 'stroke-width': 1.5 }, H);
  const AVN = el('circle', { cx: 138, cy: 131, r: 6, stroke: C.ink, 'stroke-width': 1.5 }, H);
  const tag = (x, y, s, anchor = 'start') => { const t = el('text', { x, y, class: 'cc-tag', 'text-anchor': anchor }, H); t.textContent = s; };
  tag(82, 30, 'nút xoang'); el('line', { x1: 80, y1: 33, x2: 74, y2: 49, stroke: C.muted, 'stroke-width': 1 }, H);
  tag(4, 146, 'nút nhĩ thất'); el('line', { x1: 66, y1: 142, x2: 132, y2: 133, stroke: C.muted, 'stroke-width': 1 }, H);
  tag(299, 166, 'mạng', 'end'); tag(299, 178, 'Purkinje', 'end'); el('line', { x1: 280, y1: 182, x2: 240, y2: 198, stroke: C.muted, 'stroke-width': 1 }, H);
  tag(176, 325, 'bó His và hai nhánh', 'middle');
  // trạng thái van
  const vlist = document.createElement('ul'); vlist.className = 'cc-valves'; heartBox.appendChild(vlist);
  vlist.innerHTML = '<li data-v="av"><i></i><span>Van ba lá, hai lá</span><b></b></li><li data-v="sl"><i></i><span>Van động mạch phổi, động mạch chủ</span><b></b></li>';
  const legend = document.createElement('p'); legend.className = 'cc-key';
  legend.innerHTML = `<span><i style="background:${C.dep}"></i>cơ đang khử cực</span><span><i style="background:${C.gold}"></i>xung đang chạy trên đường dẫn truyền</span>`;
  heartBox.appendChild(legend);

  /* ---------- các đường theo thời gian ---------- */
  const plotBox = document.createElement('div'); plotBox.className = 'cc-plots'; grid.appendChild(plotBox);
  const W = 600, X0 = 92, X1 = 588, PX = (X1 - X0) / T;
  const ROWS = { ph: [0, 26], ecg: [30, 118], p: [128, 262], v: [272, 338], s: [346, 366] };
  const P = el('svg', { viewBox: `0 0 ${W} 388`, class: 'cc-svg', role: 'img', 'aria-label': 'Sơ đồ Wiggers: ECG DII, áp suất thất trái, động mạch chủ, nhĩ trái, thể tích thất trái và tiếng tim theo thời gian một chu kỳ.' }, plotBox);
  const X = t => X0 + t * PX;
  // nền các pha
  PHASES.forEach((ph, i) => {
    el('rect', { x: X(ph.a), y: 0, width: X(ph.b) - X(ph.a), height: 370, class: 'cc-band ' + ph.key }, P);
    const cx = (X(ph.a) + X(ph.b)) / 2;
    if (ph.b - ph.a >= 120) { const t = el('text', { x: cx, y: 17, class: 'cc-ph', 'text-anchor': 'middle' }, P); t.textContent = ph.name; }
    else if (ph.b - ph.a >= 60) {                      // pha hẹp: tên chia hai dòng
      const w = ph.name.split(' '), h = Math.ceil(w.length / 2);
      const t = el('text', { x: cx, y: 10, class: 'cc-ph sm', 'text-anchor': 'middle' }, P);
      [w.slice(0, h).join(' '), w.slice(h).join(' ')].forEach((s, k) => { const u = el('tspan', { x: cx, dy: k ? 11 : 0 }, t); u.textContent = s; });
    }
  });
  const yl = (y, s, sub) => { const t = el('text', { x: 4, y, class: 'cc-axis' }, P); t.textContent = s; if (sub) { const u = el('tspan', { x: 4, dy: 13, class: 'cc-sub' }, t); u.textContent = sub; } };
  // ECG
  const eMid = 100, eK = 50;
  el('line', { x1: X0, y1: eMid, x2: X1, y2: eMid, class: 'cc-base' }, P);
  WAVES.forEach(w => { if (w.b - w.a < 200) { const t = el('text', { x: X((w.a + w.b) / 2), y: 116, class: 'cc-wave', 'text-anchor': 'middle' }, P); t.textContent = w.name; } });
  yl(70, 'ECG DII');
  const poly = (fn, ymap, attrs) => {
    let d = '';
    for (let t = 0; t <= T; t += 2) d += (t ? 'L' : 'M') + X(t).toFixed(1) + ',' + ymap(fn(t)).toFixed(1);
    return el('path', { d, fill: 'none', ...attrs }, P);
  };
  poly(ECG2, v => eMid - v * eK, { stroke: C.ink, 'stroke-width': 1.8 });
  // áp suất 0..130 mmHg
  const [pa, pb] = ROWS.p, pY = v => pb - v / 130 * (pb - pa);
  [0, 40, 80, 120].forEach(v => {
    el('line', { x1: X0, y1: pY(v), x2: X1, y2: pY(v), class: 'cc-gl' }, P);
    const t = el('text', { x: X0 - 4, y: pY(v) + 4, class: 'cc-tick', 'text-anchor': 'end' }, P); t.textContent = v;
  });
  yl(170, 'Áp suất', 'mmHg');
  poly(AOP, pY, { stroke: C.ao, 'stroke-width': 1.8, 'stroke-dasharray': '5 3' });
  poly(LVP, pY, { stroke: C.lv, 'stroke-width': 2.2 });
  poly(LAP, pY, { stroke: C.la, 'stroke-width': 1.8 });
  const pl = (x, y, s, col) => { const t = el('text', { x, y, class: 'cc-cl', fill: col }, P); t.textContent = s; };
  pl(X(560) + 4, pY(104), 'động mạch chủ', C.ao); pl(X(332) - 2, pY(124), 'thất trái', C.lv); pl(X(640), pY(14), 'nhĩ trái', C.la);
  // thể tích 40..130 ml
  const [va, vb] = ROWS.v, vY = v => vb - (v - 40) / 90 * (vb - va);
  [50, 120].forEach(v => {
    el('line', { x1: X0, y1: vY(v), x2: X1, y2: vY(v), class: 'cc-gl' }, P);
    const t = el('text', { x: X0 - 4, y: vY(v) + 4, class: 'cc-tick', 'text-anchor': 'end' }, P); t.textContent = v;
  });
  yl(300, 'Thể tích', 'thất trái, ml');
  poly(LVV, vY, { stroke: C.vol, 'stroke-width': 2 });
  // tiếng tim
  yl(360, 'Tiếng tim');
  for (const [t0, s] of [[210, 'T1'], [517, 'T2']]) {
    for (let k = 0; k < 7; k++) el('line', { x1: X(t0 + k * 5), y1: 356 - (k % 2 ? 7 : 3), x2: X(t0 + k * 5), y2: 356 + (k % 2 ? 7 : 3), stroke: C.ink, 'stroke-width': 1.4 }, P);
    const tx = el('text', { x: X(t0 + 45), y: 361, class: 'cc-tick' }, P); tx.textContent = s;
  }
  // con trỏ thời gian
  const cur = el('line', { y1: 24, y2: 372, class: 'cc-cursor' }, P);
  const dots = [[C.ink, ECG2, v => eMid - v * eK], [C.lv, LVP, pY], [C.ao, AOP, pY], [C.la, LAP, pY], [C.vol, LVV, vY]].map(([col, fn, ym]) =>
    ({ c: el('circle', { r: 4, fill: col, stroke: '#fff', 'stroke-width': 1.5 }, P), fn, ym }));
  const tLab = el('text', { y: 385, class: 'cc-tlab', 'text-anchor': 'middle' }, P);
  // kéo trên đồ thị để tua
  const scrub = e => {
    const r = P.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * W;
    state.t = clamp((x - X0) / PX, 0, T - 0.01); pause(); render();
  };
  P.addEventListener('pointerdown', e => { P.setPointerCapture(e.pointerId); scrub(e); P.onpointermove = scrub; });
  P.addEventListener('pointerup', () => { P.onpointermove = null; });

  /* ---------- điều khiển và lời giải thích ---------- */
  const bar = document.createElement('div'); bar.className = 'cc-bar'; root.appendChild(bar);
  bar.innerHTML = `
    <button type="button" class="btn primary cc-play" aria-pressed="false">Phát</button>
    <div class="seg-btns cc-speed" role="group" aria-label="Tốc độ">
      <button class="btn" type="button" data-s="0.125">0,125×</button><button class="btn" type="button" data-s="0.25">0,25×</button><button class="btn" type="button" data-s="1">1×</button>
    </div>
    <div class="btnrow cc-step"><button type="button" class="btn" data-d="-1">Mốc trước</button><button type="button" class="btn" data-d="1">Mốc sau</button></div>
    <output class="cc-time"></output>`;
  const card = document.createElement('div'); card.className = 'cc-card'; card.setAttribute('aria-live', 'polite'); root.appendChild(card);

  const state = { t: 0, speed: 0.25, playing: false, last: 0, seen: false, ev: -1 };
  const playBtn = bar.querySelector('.cc-play');
  const pause = () => { state.playing = false; playBtn.textContent = 'Phát'; playBtn.setAttribute('aria-pressed', 'false'); };
  const play = () => { state.playing = true; state.last = performance.now(); playBtn.textContent = 'Dừng'; playBtn.setAttribute('aria-pressed', 'true'); requestAnimationFrame(tick); };
  playBtn.addEventListener('click', () => state.playing ? pause() : play());
  const sp = bar.querySelector('.cc-speed');
  const setSpeed = s => { state.speed = s; sp.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.s === s))); };
  sp.addEventListener('click', e => { const b = e.target.closest('button'); if (b) setSpeed(+b.dataset.s); });
  setSpeed(0.25);
  bar.querySelector('.cc-step').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    pause();
    const d = +b.dataset.d, i = EVENTS.findIndex(x => x.t > state.t + 0.5);
    let j = d > 0 ? (i < 0 ? 0 : i) : ((i < 0 ? EVENTS.length : i) - 2);
    if (j < 0) j += EVENTS.length;
    state.t = EVENTS[j % EVENTS.length].t; render();
  });

  function tick(now) {
    if (!state.playing) return;
    const dt = Math.min(100, now - state.last); state.last = now;
    state.t = (state.t + dt * state.speed) % T;
    render();
    requestAnimationFrame(tick);
  }

  function render() {
    const t = state.t;
    /* khử cực nhĩ: lan từ nút xoang 0–100 ms, tái cực (ẩn trong QRS) 160–250 ms */
    const pa = clamp(t / 100), fa = t < 160 ? 1 : 1 - clamp((t - 160) / 90);
    const depA = mix(C.rest, C.dep, fa);
    const on = t <= 250;
    setStops(gAs, on ? pa : 0, on ? depA : C.rest);
    /* thất: vách 160–185, thành thất từ mỏm lên đáy 180–250; tái cực 350–520 */
    const fv = t < 350 ? 1 : 1 - clamp((t - 350) / 170);
    const depV = mix(C.rest, C.dep, fv);
    const pv = t >= 180 && t < 520 ? clamp((t - 180) / 70) : 0;
    setStops(gVs, pv, depV);
    SEP.setAttribute('fill', t >= 160 && t < 520 ? mix(C.rest, C.dep, fv * clamp((t - 160) / 25)) : C.rest);
    /* co bóp: nhĩ co 70–170, thất co theo thể tích */
    const sa = 1 - 0.07 * Math.sin(Math.PI * clamp((t - 70) / 120)) ** 2;
    atria.setAttribute('transform', `translate(150 90) scale(${sa.toFixed(3)}) translate(-150 -90)`);
    const sv = 0.86 + 0.14 * clamp((LVV(t) - 50) / 72);
    vent.setAttribute('transform', `translate(150 147) scale(${(0.94 + 0.06 * sv).toFixed(3)} ${sv.toFixed(3)}) translate(-150 -147)`);
    /* dẫn truyền */
    const act = (a, b) => t >= a && t < b;
    SA.setAttribute('fill', act(0, 30) ? C.gold : '#fff');
    AVN.setAttribute('fill', act(55, 165) ? (Math.floor(t / 25) % 2 ? C.gold : '#FBE7A2') : '#fff');
    P_INTER.setAttribute('stroke', act(0, 70) ? C.gold : C.path);
    P_HIS.setAttribute('stroke', act(158, 178) ? C.gold : C.path);
    P_RBB.setAttribute('stroke', act(165, 205) ? C.gold : C.path);
    P_LBB.setAttribute('stroke', act(165, 205) ? C.gold : C.path);
    /* van nhĩ thất */
    const open = AV_OPEN(t);
    for (const v of valves) {
      const y = 140, w = 22, a = open ? 1.1 : 0.1;
      v.l1.setAttribute('x1', v.cx - w); v.l1.setAttribute('y1', y); v.l1.setAttribute('x2', v.cx - w + w * Math.cos(a)); v.l1.setAttribute('y2', y + w * Math.sin(a));
      v.l2.setAttribute('x1', v.cx + w); v.l2.setAttribute('y1', y); v.l2.setAttribute('x2', v.cx + w - w * Math.cos(a)); v.l2.setAttribute('y2', y + w * Math.sin(a));
    }
    vlist.querySelector('[data-v=av]').className = open ? 'open' : '';
    vlist.querySelector('[data-v=av] b').textContent = open ? 'mở' : 'đóng';
    const sl = SL_OPEN(t);
    vlist.querySelector('[data-v=sl]').className = sl ? 'open' : '';
    vlist.querySelector('[data-v=sl] b').textContent = sl ? 'mở' : 'đóng';
    /* con trỏ */
    const x = X(t);
    cur.setAttribute('x1', x); cur.setAttribute('x2', x);
    for (const d of dots) { d.c.setAttribute('cx', x); d.c.setAttribute('cy', d.ym(d.fn(t))); }
    tLab.setAttribute('x', clamp(x, X0 + 24, X1 - 24)); tLab.textContent = Math.round(t) + ' ms';
    const ph = PHASES.find(p => t >= p.a && t < p.b), wv = WAVES.find(w => t >= w.a && w.b > t);
    bar.querySelector('.cc-time').innerHTML = `<b>${Math.round(t)} ms</b> ${wv.name === 'TP' ? 'đoạn TP' : (wv.name.length > 1 && wv.name !== 'QRS' ? 'đoạn ' + wv.name : (wv.name === 'QRS' ? 'phức bộ QRS' : 'sóng ' + wv.name))}, ${ph.name.toLowerCase()}`;
    /* lời giải thích: mốc gần nhất phía trước */
    let k = 0; for (let i = 0; i < EVENTS.length; i++) if (EVENTS[i].t <= t + 0.5) k = i;
    if (k !== state.ev) {
      state.ev = k; const E = EVENTS[k];
      card.innerHTML = `<h4>${E.h}</h4><p><span class="cc-k el">Điện</span>${E.e}</p><p><span class="cc-k me">Cơ học</span>${E.m}</p>`;
    }
  }
  function setStops(stops, p, col) {
    const q = clamp(p + 0.02);
    [[0, col], [p, col], [q, C.rest], [1, C.rest]].forEach(([o, c], i) => { stops[i].setAttribute('offset', o); stops[i].setAttribute('stop-color', c); });
  }
  render();
  visible(root, v => { if (!v && state.playing) { pause(); state.autoPaused = true; } else if (v && state.autoPaused) { state.autoPaused = false; play(); } else if (v && !state.seen && !reduce) { state.seen = true; play(); } });
}

/* =====================================================================
   2. HƯỚNG NHÌN CỦA CÁC CHUYỂN ĐẠO
   Hệ trục: x hướng sang trái người bệnh, y hướng xuống dưới, z hướng ra trước ngực.
   ===================================================================== */
const LIMB = { I: 0, II: 60, III: 120, aVR: -150, aVL: -30, aVF: 90 };
const HC = [150, 150];   // tâm tim trên mặt phẳng ngang (tọa độ SVG)
const ELEC = { V1: [108, 64], V2: [138, 60], V3: [170, 68], V4: [200, 82], V5: [233, 110], V6: [252, 147] };
const PREC = {}; for (const k in ELEC) { const dx = ELEC[k][0] - HC[0], dz = HC[1] - ELEC[k][1]; const n = Math.hypot(dx, dz); PREC[k] = [dx / n, dz / n]; }
const ORDER = [['I', 'aVR', 'V1', 'V4'], ['II', 'aVL', 'V2', 'V5'], ['III', 'aVF', 'V3', 'V6']];
const ALL = ['I', 'II', 'III', 'aVR', 'aVL', 'aVF', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6'];
const WALL = { II: 'inf', III: 'inf', aVF: 'inf', I: 'lat', aVL: 'lat', V5: 'lat', V6: 'lat', V1: 'sep', V2: 'sep', V3: 'ant', V4: 'ant', aVR: 'cav' };
const LEAD_TXT = {
  I: 'Cực dương ở tay trái, hướng 0°. Nhìn thành bên (phần cao) của thất trái.',
  II: 'Cực dương ở chân trái, hướng +60°, gần trùng hướng lan của xung trong tim bình thường. Nhìn thành dưới; sóng P thường rõ nhất ở đây nên hay dùng làm dải nhịp.',
  III: 'Hướng +120°. Nhìn thành dưới.',
  aVR: 'Hướng −150°, từ vai phải nhìn vào trong lòng các buồng tim. Ở người thường, xung đi ra xa chuyển đạo này nên P, QRS, T đều âm.',
  aVL: 'Hướng −30°. Nhìn thành bên cao của thất trái.',
  aVF: 'Hướng +90°, nhìn thẳng từ dưới lên. Nhìn thành dưới.',
  V1: 'Liên sườn 4, bờ phải xương ức. Nhìn vách liên thất và thất phải: sóng r nhỏ (vách khử cực) rồi sóng S sâu (thất trái ở phía sau, xa điện cực).',
  V2: 'Liên sườn 4, bờ trái xương ức. Nhìn vách liên thất.',
  V3: 'Giữa V2 và V4. Nhìn thành trước; R và S thường gần bằng nhau ở V3 hoặc V4 (vùng chuyển tiếp).',
  V4: 'Liên sườn 5, đường giữa đòn trái, gần mỏm tim. Nhìn thành trước.',
  V5: 'Đường nách trước, ngang V4. Nhìn thành bên.',
  V6: 'Đường nách giữa, ngang V4. Nhìn thành bên: sóng q nhỏ rồi R cao.',
};
const WALL_TXT = { inf: 'thành dưới', lat: 'thành bên', sep: 'vách liên thất', ant: 'thành trước', cav: 'lòng buồng tim' };
const proj = (L, v) => L in LIMB ? v[0] * Math.cos(LIMB[L] * Math.PI / 180) + v[1] * Math.sin(LIMB[L] * Math.PI / 180) : v[0] * PREC[L][0] + v[2] * PREC[L][1];
/* vectơ điện tim theo thời gian (0–600 ms): P, vòng QRS, T */
const QK = [[160, [0, 0, 0]], [172, [-0.18, 0.08, 0.32]], [184, [0.15, 0.35, 0.45]], [198, [0.85, 0.75, 0.15]], [210, [1.15, 0.85, -0.15]], [224, [0.85, 0.45, -0.6]], [238, [0.3, 0, -0.45]], [250, [0, 0, 0]]];
const QS = [0, 1, 2].map(i => spline(QK.map(([t, v]) => [t, v[i]])));
const BEAT = 600;
function vecAt(t) {
  const p = G(t, 50, 22) * 0.26, tw = G(t, 440, 55) * 0.38;
  const v = [0.55 * p + 0.62 * tw, 0.72 * p + 0.5 * tw, 0.15 * p + 0.28 * tw];
  if (t > 160 && t < 250) for (let i = 0; i < 3; i++) v[i] += QS[i](t);
  return v;
}
const PHASE_LAB = t => t < 110 ? 'sóng P' : t < 160 ? 'đoạn PR' : t < 182 ? 'đầu QRS: vách liên thất' : t < 218 ? 'giữa QRS: thành thất trái' : t < 250 ? 'cuối QRS: đáy thất' : t < 340 ? 'đoạn ST' : t < 540 ? 'sóng T' : 'sau sóng T';

function buildLeads(root) {
  root.innerHTML = '';
  const S = { t: 196, playing: false, speed: 0.12, last: 0, free: null, sel: 'II', seen: false };
  const grid = document.createElement('div'); grid.className = 'ld-grid'; root.appendChild(grid);

  /* ---------- mặt phẳng trán ---------- */
  const fBox = document.createElement('figure'); fBox.className = 'ld-plane'; grid.appendChild(fBox);
  const F = el('svg', { viewBox: '0 0 300 300', role: 'img', 'aria-label': 'Mặt phẳng trán: sáu chuyển đạo chi xếp quanh tim theo các góc 0°, 60°, 120°, −150°, −30°, 90°.' }, fBox);
  const fc = document.createElement('figcaption'); fc.innerHTML = '<b>Mặt phẳng trán</b>: nhìn từ phía trước, bên phải hình là bên trái người bệnh.'; fBox.appendChild(fc);
  const FC = [150, 150], FR = 118;
  el('circle', { cx: 150, cy: 150, r: FR, class: 'ld-ring' }, F);
  // tim nhỏ ở giữa: các vùng để tô khi chọn chuyển đạo
  const fHeart = el('g', { transform: 'translate(150 150) rotate(-40) translate(-150 -150)' }, F);
  el('ellipse', { cx: 150, cy: 150, rx: 30, ry: 42, class: 'ld-heart' }, fHeart);
  const fWall = {
    inf: el('path', { d: 'M126,170 A30,42 0 0 0 174,170', class: 'ld-wall' }, fHeart),
    lat: el('path', { d: 'M175,168 A30,42 0 0 0 175,132', class: 'ld-wall' }, fHeart),
    cav: el('ellipse', { cx: 150, cy: 150, rx: 13, ry: 22, class: 'ld-wall fill' }, fHeart),
  };
  const fAxes = {};
  for (const L in LIMB) {
    const a = LIMB[L] * Math.PI / 180, x = Math.cos(a), y = Math.sin(a);
    const g = el('g', { class: 'ld-axis', 'data-l': L, tabindex: 0, role: 'button', 'aria-label': 'Chuyển đạo ' + L }, F);
    el('line', { x1: 150 - x * FR, y1: 150 - y * FR, x2: 150 + x * FR, y2: 150 + y * FR, class: 'neg' }, g);
    el('line', { x1: 150, y1: 150, x2: 150 + x * FR, y2: 150 + y * FR, class: 'pos' }, g);
    el('circle', { cx: 150 + x * FR, cy: 150 + y * FR, r: 4 }, g);
    const t = el('text', { x: 150 + x * (FR + 16), y: 150 + y * (FR + 16) + 5, 'text-anchor': 'middle' }, g); t.textContent = L;
    const d = el('text', { x: 150 + x * (FR - 18), y: 150 + y * (FR - 18) + 4, 'text-anchor': 'middle', class: 'deg' }, g); d.textContent = (LIMB[L] > 0 ? '+' : '') + LIMB[L] + '°';
    fAxes[L] = g;
  }
  const fTrail = el('path', { class: 'ld-trail' }, F);
  const fArrow = el('line', { x1: 150, y1: 150, class: 'ld-vec', 'marker-end': 'url(#ldHead)' }, F);
  const fHandle = el('circle', { r: 11, class: 'ld-handle', tabindex: 0, 'aria-label': 'Đầu mũi tên vectơ, kéo để đổi hướng' }, F);
  const mk = el('marker', { id: 'ldHead', viewBox: '0 0 10 10', refX: 8, refY: 5, markerWidth: 5, markerHeight: 5, orient: 'auto-start-reverse' }, el('defs', {}, F));
  el('path', { d: 'M0,0 L10,5 L0,10 z', fill: C.red }, mk);

  /* ---------- mặt phẳng ngang ---------- */
  const hBox = document.createElement('figure'); hBox.className = 'ld-plane'; grid.appendChild(hBox);
  const Hs = el('svg', { viewBox: '0 0 300 300', role: 'img', 'aria-label': 'Mặt phẳng ngang: lát cắt ngang lồng ngực nhìn từ chân lên, sáu điện cực V1 tới V6 xếp từ bờ phải xương ức sang nách trái.' }, hBox);
  const hc = document.createElement('figcaption'); hc.innerHTML = '<b>Mặt phẳng ngang</b>: lát cắt ngực nhìn từ chân lên, phía trước ngực ở trên.'; hBox.appendChild(hc);
  el('ellipse', { cx: 140, cy: 150, rx: 128, ry: 96, class: 'ld-chest' }, Hs);
  el('rect', { x: 117, y: 46, width: 20, height: 14, rx: 3, class: 'ld-bone' }, Hs);           // xương ức
  el('circle', { cx: 127, cy: 228, r: 15, class: 'ld-bone' }, Hs);                              // cột sống
  const lt = (x, y, s, cls = 'ld-note') => { const t = el('text', { x, y, class: cls, 'text-anchor': 'middle' }, Hs); t.textContent = s; };
  lt(127, 76, 'xương ức'); lt(127, 260, 'cột sống'); lt(26, 155, 'phải'); lt(262, 200, 'trái');
  // tim cắt ngang: thất phải ở trước phải, thất trái tròn
  el('path', { d: 'M108,138 Q120,104 158,108 Q146,128 146,150 Q136,166 112,160 Z', class: 'ld-rv' }, Hs);
  el('circle', { cx: 168, cy: 152, r: 30, class: 'ld-heart' }, Hs);
  el('circle', { cx: 168, cy: 152, r: 15, class: 'ld-cavity' }, Hs);
  const arc = (a1, a2) => { const r = 30, c = [168, 152], p = a => [c[0] + r * Math.cos(a * Math.PI / 180), c[1] + r * Math.sin(a * Math.PI / 180)]; const [x1, y1] = p(a1), [x2, y2] = p(a2); return `M${x1},${y1} A${r},${r} 0 0 1 ${x2},${y2}`; };
  const hWall = { sep: el('path', { d: arc(170, 235), class: 'ld-wall' }, Hs), ant: el('path', { d: arc(235, 300), class: 'ld-wall' }, Hs), lat: el('path', { d: arc(300, 380), class: 'ld-wall' }, Hs) };
  const hAxes = {};
  for (const L in ELEC) {
    const [ex, ey] = ELEC[L];
    const g = el('g', { class: 'ld-axis', 'data-l': L, tabindex: 0, role: 'button', 'aria-label': 'Chuyển đạo ' + L }, Hs);
    el('line', { x1: HC[0], y1: HC[1], x2: ex, y2: ey, class: 'pos' }, g);
    el('circle', { cx: ex, cy: ey, r: 6 }, g);
    const dx = ex - HC[0], dy = ey - HC[1], n = Math.hypot(dx, dy);
    const t = el('text', { x: ex + dx / n * 16, y: ey + dy / n * 16 + 5, 'text-anchor': 'middle' }, g); t.textContent = L;
    hAxes[L] = g;
  }
  const hTrail = el('path', { class: 'ld-trail' }, Hs);
  const hArrow = el('line', { x1: HC[0], y1: HC[1], class: 'ld-vec', 'marker-end': 'url(#ldHead2)' }, Hs);
  const hHandle = el('circle', { r: 11, class: 'ld-handle', tabindex: 0, 'aria-label': 'Đầu mũi tên vectơ, kéo để đổi hướng' }, Hs);
  const mk2 = el('marker', { id: 'ldHead2', viewBox: '0 0 10 10', refX: 8, refY: 5, markerWidth: 5, markerHeight: 5, orient: 'auto-start-reverse' }, el('defs', {}, Hs));
  el('path', { d: 'M0,0 L10,5 L0,10 z', fill: C.red }, mk2);

  /* ---------- 12 ô sóng ---------- */
  const side = document.createElement('div'); side.className = 'ld-side'; grid.appendChild(side);
  const tiles = document.createElement('div'); tiles.className = 'ld-tiles'; side.appendChild(tiles);
  const TW = 120, TH = 78, mid = 44, K = 22, PXT = TW / BEAT;
  const traces = {};
  for (const L of ALL) traces[L] = Array.from({ length: BEAT / 2 + 1 }, (_, i) => proj(L, vecAt(i * 2)));
  const tile = {};
  ORDER.flat().forEach(L => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'ld-tile'; b.dataset.l = L;
    b.style.setProperty('--m', ALL.indexOf(L));      // thứ tự trên điện thoại: I, II, III, aVR… V6
    const s = el('svg', { viewBox: `0 0 ${TW} ${TH}` }, b);
    el('line', { x1: 0, y1: mid, x2: TW, y2: mid, class: 'ld-base' }, s);
    let d = ''; traces[L].forEach((v, i) => { d += (i ? 'L' : 'M') + (i * 2 * PXT).toFixed(1) + ',' + (mid - v * K).toFixed(1); });
    const full = el('path', { d, class: 'ld-full' }, s);
    const done = el('path', { class: 'ld-done' }, s);
    const barR = el('rect', { x: TW / 2 - 8, width: 16, class: 'ld-bar' }, s);
    const dot = el('circle', { r: 3, class: 'ld-dot' }, s);
    const t = el('text', { x: 4, y: 13, class: 'ld-name' }, s); t.textContent = L;
    tiles.appendChild(b);
    tile[L] = { b, full, done, dot, barR };
    b.addEventListener('click', () => select(L));
  });
  const info = document.createElement('div'); info.className = 'ld-info'; info.setAttribute('aria-live', 'polite'); side.appendChild(info);

  /* ---------- điều khiển ---------- */
  const bar = document.createElement('div'); bar.className = 'cc-bar'; root.appendChild(bar);
  bar.innerHTML = `
    <button type="button" class="btn primary ld-play" aria-pressed="false">Phát một nhịp</button>
    <label class="ld-scrub"><span>Thời điểm</span><input type="range" min="0" max="${BEAT}" step="1" value="196" aria-label="Thời điểm trong nhịp tim (ms)"></label>
    <div class="btnrow ld-pre">
      <button type="button" class="btn" data-t="50">Sóng P</button><button type="button" class="btn" data-t="172">Đầu QRS</button><button type="button" class="btn" data-t="207">Giữa QRS</button><button type="button" class="btn" data-t="230">Cuối QRS</button><button type="button" class="btn" data-t="440">Sóng T</button>
    </div>
    <output class="cc-time ld-time"></output>`;
  const range = bar.querySelector('input'), playBtn = bar.querySelector('.ld-play');
  const pause = () => { S.playing = false; playBtn.textContent = 'Phát một nhịp'; playBtn.setAttribute('aria-pressed', 'false'); };
  const play = () => { S.free = null; S.playing = true; S.last = performance.now(); if (S.t >= BEAT - 1) S.t = 0; playBtn.textContent = 'Dừng'; playBtn.setAttribute('aria-pressed', 'true'); requestAnimationFrame(tick); };
  playBtn.addEventListener('click', () => S.playing ? pause() : play());
  range.addEventListener('input', () => { pause(); S.free = null; S.t = +range.value; render(); });
  bar.querySelector('.ld-pre').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; pause(); S.free = null; S.t = +b.dataset.t; render(); });
  function tick(now) {
    if (!S.playing) return;
    const dt = Math.min(100, now - S.last); S.last = now;
    S.t += dt * S.speed;
    if (S.t >= BEAT) { S.t = BEAT; render(); pause(); return; }
    render(); requestAnimationFrame(tick);
  }

  /* kéo mũi tên: đặt vectơ tự do */
  const drag = (svg, handle, plane) => {
    const move = e => {
      const r = svg.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * 300, y = (e.clientY - r.top) / r.height * 300;
      const base = S.free || vecAt(S.t).slice();
      if (plane === 'f') { base[0] = (x - 150) / 95; base[1] = (y - 150) / 95; }
      else { base[0] = (x - HC[0]) / 95; base[2] = (HC[1] - y) / 95; }
      const n = Math.hypot(...base); if (n > 1.3) base.forEach((v, i) => { base[i] = v / n * 1.3; });
      S.free = base; render();
    };
    handle.addEventListener('pointerdown', e => { e.preventDefault(); pause(); handle.setPointerCapture(e.pointerId); handle.onpointermove = move; move(e); });
    handle.addEventListener('pointerup', () => { handle.onpointermove = null; });
    handle.addEventListener('keydown', e => {
      const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key]; if (!step) return;
      e.preventDefault(); pause();
      const v = S.free || vecAt(S.t).slice();
      v[0] += step[0] * 0.08; if (plane === 'f') v[1] += step[1] * 0.08; else v[2] -= step[1] * 0.08;
      S.free = v; render();
    });
  };
  drag(F, fHandle, 'f'); drag(Hs, hHandle, 'h');

  const select = L => { S.sel = L; render(); };
  [...Object.values(fAxes), ...Object.values(hAxes)].forEach(g => {
    g.addEventListener('click', () => select(g.dataset.l));
    g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(g.dataset.l); } });
  });

  // vết vòng QRS (vectơ tâm đồ) để người xem thấy đầu mũi tên đi đâu
  let fd = '', hd = '';
  for (let t = 160; t <= 250; t += 2) { const v = vecAt(t); fd += (t > 160 ? 'L' : 'M') + (150 + v[0] * 95).toFixed(1) + ',' + (150 + v[1] * 95).toFixed(1); hd += (t > 160 ? 'L' : 'M') + (HC[0] + v[0] * 95).toFixed(1) + ',' + (HC[1] - v[2] * 95).toFixed(1); }
  fTrail.setAttribute('d', fd); hTrail.setAttribute('d', hd);

  function render() {
    const v = S.free || vecAt(S.t);
    const fx = 150 + v[0] * 95, fy = 150 + v[1] * 95, hx = HC[0] + v[0] * 95, hy = HC[1] - v[2] * 95;
    const small = Math.hypot(v[0], v[1]) < 0.06, smallH = Math.hypot(v[0], v[2]) < 0.06;
    fArrow.setAttribute('x2', fx); fArrow.setAttribute('y2', fy); fArrow.style.display = small ? 'none' : '';
    hArrow.setAttribute('x2', hx); hArrow.setAttribute('y2', hy); hArrow.style.display = smallH ? 'none' : '';
    fHandle.setAttribute('cx', fx); fHandle.setAttribute('cy', fy);
    hHandle.setAttribute('cx', hx); hHandle.setAttribute('cy', hy);
    range.value = String(Math.round(S.t));
    for (const L of ALL) {
      const T1 = tile[L], p = proj(L, v);
      T1.b.classList.toggle('on', L === S.sel);
      T1.b.classList.toggle('pos', p > 0.05); T1.b.classList.toggle('neg', p < -0.05);
      if (S.free) {
        T1.done.setAttribute('d', ''); T1.dot.style.display = 'none';
        T1.barR.style.display = ''; const h = Math.min(34, Math.abs(p) * K);
        T1.barR.setAttribute('y', p > 0 ? mid - h : mid); T1.barR.setAttribute('height', Math.max(1, h));
        T1.barR.setAttribute('class', 'ld-bar ' + (p >= 0 ? 'up' : 'down'));
        T1.full.style.opacity = 0.25;
      } else {
        T1.barR.style.display = 'none'; T1.full.style.opacity = '';
        const n = Math.floor(S.t / 2); let d = '';
        for (let i = 0; i <= n; i++) d += (i ? 'L' : 'M') + (i * 2 * PXT).toFixed(1) + ',' + (mid - traces[L][i] * K).toFixed(1);
        T1.done.setAttribute('d', d);
        T1.dot.style.display = ''; T1.dot.setAttribute('cx', S.t * PXT); T1.dot.setAttribute('cy', mid - p * K);
      }
    }
    for (const L in fAxes) fAxes[L].classList.toggle('on', L === S.sel);
    for (const L in hAxes) hAxes[L].classList.toggle('on', L === S.sel);
    const w = WALL[S.sel];
    for (const k in fWall) fWall[k].classList.toggle('on', k === w);
    for (const k in hWall) hWall[k].classList.toggle('on', k === w);
    const p = proj(S.sel, v);
    const dir = Math.abs(p) < 0.05 ? 'vuông góc với trục chuyển đạo, nên gần như không ghi được gì (đường đẳng điện)'
      : p > 0 ? 'hướng về phía cực dương, nên chuyển đạo ghi được sóng dương (đi lên)' : 'hướng ra xa cực dương, nên chuyển đạo ghi được sóng âm (đi xuống)';
    info.innerHTML = `<h4>${S.sel} <span>nhìn ${WALL_TXT[w]}</span></h4><p>${LEAD_TXT[S.sel]}</p><p class="ld-now">${S.free ? 'Vectơ bạn đặt' : 'Lúc này (' + PHASE_LAB(S.t) + '), vectơ'} ${dir}.</p>`;
    bar.querySelector('.ld-time').innerHTML = S.free ? '<b>Vectơ tự đặt</b>: bấm một mốc hoặc Phát để quay lại nhịp mẫu' : `<b>${Math.round(S.t)} ms</b> ${PHASE_LAB(S.t)}`;
  }
  render();
  visible(root, v => { if (v && !S.seen && !reduce) { S.seen = true; S.t = 0; play(); } else if (!v && S.playing) pause(); });
}

/* Không tự dựng khi tải trang: lib/ecg-demo-ui.js chỉ tải file này khi người xem mở một minh họa,
   rồi gọi ECGDemo.build('cc' | 'ld', phần tử). */
window.ECGDemo = { build: (kind, node) => (kind === 'cc' ? buildCycle : buildLeads)(node) };
})();
