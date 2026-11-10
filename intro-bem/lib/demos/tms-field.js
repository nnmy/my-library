/* =====================================================================
   Bioelectromagnetics: minh họa "TMS: điện trường sơ cấp, thứ cấp và dòng điện" (id: tms-field, trang 5-do-lieu.html)
   Nhúng vào trang: <div class="demo" id="demoTms" data-demo="tms-field"></div> + lib/bem.js
   Chạy độc lập:    lib/demos/run.html?demo=tms-field

   Mô hình: một lát mô mỏng nằm ngang, song song với mặt cuộn dây và cách cuộn dây một khoảng h.
   - Lát gồm bốn vòng (não, dịch não tủy, xương sọ, da đầu; cùng bán kính và σ với demo fem), có thể thêm
     các rãnh não chứa dịch não tủy. Chọn "Đồng nhất" thì σ = 0,33 S/m ở mọi nơi.
   - Cuộn dây nằm ngang nên thế vector A, và trường sơ cấp E_p = −∂A/∂t, luôn nằm trong mặt lát cắt
     (và ∇·E_p = 0 trong mặt đó). E_p tính bằng Biot–Savart cho thế vector:
         E_p(r) = −(µ0/4π)(dI/dt) Σ_vòng ∮ dl'/|r − r'|,   dI/dt = 100 A/µs.
     Cuộn số 8 sơ đồ: mỗi cánh 9 vòng dây, bán kính 2,8–4,35 cm (tính gộp thành 5 vòng), tâm hai cánh cách nhau 8,8 cm.
     "Cuộn tròn" là một cánh đặt riêng.
   - Giải ∇·(σ∇φ) = ∇·(σE_p) với J·n = 0 ở mép lát (điều kiện tự nhiên của dạng yếu
     ∫σ∇φ·∇v = ∫σE_p·∇v) bằng phần tử tam giác tuyến tính trên lưới cực bám theo các vòng mô.
     Cố định φ = 0 ở nút tâm rồi trừ giá trị trung bình; CG với tiền điều kiện IC(0), khởi động từ nghiệm trước.
   - E = E_p − ∇φ, J = σE: hằng số trên mỗi phần tử.
   - Đường dòng J = đường đồng mức của hàm dòng ψ (∇ψ = (−J_y, J_x), ψ = 0 ở mép), tìm bằng bình phương
     tối thiểu trên cùng lưới; các mức cách đều nhau nên đường dày ở chỗ dòng mạnh.
   - Mô hình 2D đúng cho một lát mỏng; bỏ qua dòng đi lên xuống giữa các lát.
   ===================================================================== */
(() => {
const { COLORS: C, fmt, num, range, arrow, watchCanvas } = BEM;

/* ---------- lõi tính toán (không dùng DOM) ---------- */
const MU0_4PI = 1e-7, DIDT = 1e8;                        // µ0/4π (T·m/A); dI/dt = 100 A/µs
const RB = 0.076, RC = 0.079, RS = 0.085, RH = 0.090;     // bán kính các mặt phân cách (m)
const TIS = [
  { name: 'Não', sig: 0.276, col: '#EBC6CE' },
  { name: 'Dịch não tủy', sig: 1.654, col: '#A8D9EF' },
  { name: 'Xương sọ', sig: 0.010, col: '#EFE8D4' },
  { name: 'Da đầu', sig: 0.465, col: '#F1C9A6' },
];
const SIG_H = 0.33, NS = 180;
const SULCUS_DEPTH = [0.012, 0.018, 0.009, 0.015, 0.011];  // m, lặp lại quanh vỏ não
const WING = { r0: 0.028, r1: 0.0435, turns: 9, loops: 5, gap: 0.044, nseg: 36 };   // 9 vòng dây gộp thành 5 vòng tính toán

function buildMesh() {
  const radii = [];
  for (let k = 1; k <= 7; k++) radii.push(0.050 * Math.pow(k / 7, 0.85));
  const seg = (a, b, n) => { for (let k = 1; k <= n; k++) radii.push(a + (b - a) * k / n); };
  seg(0.050, RB, 13); seg(RB, RC, 2); seg(RC, RS, 3); seg(RS, RH, 3);
  const K = radii.length, nn = 1 + NS * K, X = new Float64Array(nn), Y = new Float64Array(nn);
  radii.forEach((r, k) => { for (let s = 0; s < NS; s++) { const a = 2 * Math.PI * s / NS, n = 1 + k * NS + s; X[n] = r * Math.sin(a); Y[n] = -r * Math.cos(a); } });
  const id = (k, s) => 1 + (k - 1) * NS + ((s % NS) + NS) % NS;      // k = 1..K
  const T = [], elS = [], elK = [];
  for (let s = 0; s < NS; s++) { T.push([0, id(1, s), id(1, s + 1)]); elS.push(s); elK.push(0); }
  for (let k = 1; k < K; k++) for (let s = 0; s < NS; s++) {
    const a = id(k, s), b = id(k + 1, s), c = id(k + 1, s + 1), d = id(k, s + 1);
    if ((s + k) % 2) { T.push([a, b, c], [a, c, d]); } else { T.push([a, b, d], [b, c, d]); }
    elS.push(s, s); elK.push(k, k);
  }
  const ne = T.length, gb = new Float64Array(3 * ne), gc = new Float64Array(3 * ne), area = new Float64Array(ne);
  const cx = new Float64Array(ne), cy = new Float64Array(ne), cr = new Float64Array(ne), tis = new Int8Array(ne);
  T.forEach((t, e) => {
    const [i, j, k] = t;
    const b = [Y[j] - Y[k], Y[k] - Y[i], Y[i] - Y[j]], c = [X[k] - X[j], X[i] - X[k], X[j] - X[i]];
    const D = b[0] * c[1] - b[1] * c[0];                  // = 2 × diện tích có dấu
    for (let p = 0; p < 3; p++) { gb[3 * e + p] = b[p] / D; gc[3 * e + p] = c[p] / D; }   // ∇λ_p
    area[e] = Math.abs(D) / 2;
    cx[e] = (X[i] + X[j] + X[k]) / 3; cy[e] = (Y[i] + Y[j] + Y[k]) / 3; cr[e] = Math.hypot(cx[e], cy[e]);
    tis[e] = cr[e] < RB ? 0 : cr[e] < RC ? 1 : cr[e] < RS ? 2 : 3;
  });
  // rãnh não: một quạt 2° mỗi 12°, sâu vào não theo SULCUS_DEPTH
  const sulci = [];
  for (let j = 0, s = 3; s < NS; s += 6, j++) {
    const want = RB - SULCUS_DEPTH[j % SULCUS_DEPTH.length];
    let kin = K; for (let k = 1; k <= K; k++) if (radii[k - 1] >= want - 1e-9) { kin = k; break; }
    sulci.push({ s, rIn: radii[kin - 1] });
  }
  const sulcEl = new Uint8Array(ne), sulcSet = new Map(sulci.map(q => [q.s, q.rIn]));
  for (let e = 0; e < ne; e++) if (tis[e] === 0 && sulcSet.has(elS[e]) && cr[e] > sulcSet.get(elS[e])) sulcEl[e] = 1;
  // ma trận thưa: cấu trúc CSR chung cho mọi bộ σ
  const nb = [...Array(nn)].map(() => new Set());
  T.forEach(t => { for (const p of t) for (const q of t) nb[p].add(q); });
  const rowPtr = new Int32Array(nn + 1), cols = [];
  for (let i = 0; i < nn; i++) { const l = [...nb[i]].sort((a, b) => a - b); rowPtr[i + 1] = rowPtr[i] + l.length; cols.push(...l); }
  const colIdx = Int32Array.from(cols), slot = new Int32Array(9 * ne), diagPos = new Int32Array(nn);
  const find = (i, j) => { let lo = rowPtr[i], hi = rowPtr[i + 1] - 1; while (lo <= hi) { const m = (lo + hi) >> 1; if (colIdx[m] === j) return m; if (colIdx[m] < j) lo = m + 1; else hi = m - 1; } return -1; };
  T.forEach((t, e) => { for (let p = 0; p < 3; p++) for (let q = 0; q < 3; q++) slot[9 * e + 3 * p + q] = find(t[p], t[q]); });
  for (let i = 0; i < nn; i++) diagPos[i] = find(i, i);
  const outer = new Uint8Array(nn); for (let s = 0; s < NS; s++) outer[id(K, s)] = 1;
  const pin = new Uint8Array(nn); pin[0] = 1;
  return { X, Y, T, ne, nn, K, radii, elS, elK, gb, gc, area, cx, cy, cr, tis, sulci, sulcEl, rowPtr, colIdx, slot, diagPos, outer, pin };
}

/* σ của từng phần tử và mã mô dùng để hiển thị (rãnh não là dịch não tủy) */
function elementSigma(M, model) {
  const sig = new Float64Array(M.ne), lab = new Int8Array(M.ne);
  for (let e = 0; e < M.ne; e++) {
    lab[e] = model === 'sulci' && M.sulcEl[e] ? 1 : M.tis[e];
    sig[e] = model === 'hom' ? SIG_H : TIS[lab[e]].sig;
  }
  return { sig, lab };
}
function assemble(M, sig) {
  const vals = new Float64Array(M.colIdx.length);
  for (let e = 0; e < M.ne; e++) {
    const s = sig ? sig[e] : 1, A = M.area[e];
    for (let p = 0; p < 3; p++) for (let q = 0; q < 3; q++)
      vals[M.slot[9 * e + 3 * p + q]] += s * A * (M.gb[3 * e + p] * M.gb[3 * e + q] + M.gc[3 * e + p] * M.gc[3 * e + q]);
  }
  return vals;
}
/* Phân tích Cholesky không đầy đủ IC(0) trên đúng cấu trúc thưa của K (hàng/cột của nút cố định thay bằng đơn vị).
   Dùng làm tiền điều kiện: số vòng lặp CG giảm khoảng 4 lần so với Jacobi. */
function icFactor(M, vals, fixed) {
  const n = M.nn, { rowPtr, colIdx, diagPos } = M, a = Float64Array.from(vals);
  for (let i = 0; i < n; i++) for (let q = rowPtr[i]; q < rowPtr[i + 1]; q++) { const j = colIdx[q]; if (fixed[i] || fixed[j]) a[q] = i === j ? 1 : 0; }
  const pos = (i, j) => { let lo = rowPtr[i], hi = rowPtr[i + 1] - 1; while (lo <= hi) { const m = (lo + hi) >> 1; if (colIdx[m] === j) return m; if (colIdx[m] < j) lo = m + 1; else hi = m - 1; } return -1; };
  for (let i = 0; i < n; i++) {
    for (let q = rowPtr[i]; q < diagPos[i]; q++) {
      const j = colIdx[q]; let s = a[q];
      for (let q2 = rowPtr[i]; q2 < q; q2++) { const pj = pos(j, colIdx[q2]); if (pj >= 0) s -= a[q2] * a[pj]; }
      a[q] = s / a[diagPos[j]];
    }
    let s = a[diagPos[i]]; for (let q = rowPtr[i]; q < diagPos[i]; q++) s -= a[q] * a[q];
    a[diagPos[i]] = Math.sqrt(Math.max(s, 1e-30 * Math.abs(vals[diagPos[i]] || 1)));
  }
  return a;
}
/* CG có tiền điều kiện IC(0); các nút có fixed[i] = 1 được giữ bằng 0 (Dirichlet thuần nhất). */
function pcg(M, vals, fixed, Lf, rhs, x0, tol = 1e-6, maxIt = 3000) {
  const n = M.nn, { rowPtr, colIdx, diagPos } = M, x = x0 ? Float64Array.from(x0) : new Float64Array(n);
  const mul = (u, y) => {
    for (let i = 0; i < n; i++) {
      if (fixed[i]) { y[i] = u[i]; continue; }
      let s = 0; for (let q = rowPtr[i]; q < rowPtr[i + 1]; q++) { const j = colIdx[q]; if (!fixed[j]) s += vals[q] * u[j]; }
      y[i] = s;
    }
  };
  const w = new Float64Array(n);
  const prec = (r, z) => {                              // giải L·w = r rồi Lᵀ·z = w
    for (let i = 0; i < n; i++) { let s = r[i]; for (let q = rowPtr[i]; q < diagPos[i]; q++) s -= Lf[q] * w[colIdx[q]]; w[i] = s / Lf[diagPos[i]]; }
    for (let i = n - 1; i >= 0; i--) { const zi = w[i] / Lf[diagPos[i]]; z[i] = zi; for (let q = rowPtr[i]; q < diagPos[i]; q++) w[colIdx[q]] -= Lf[q] * zi; }
  };
  const b = Float64Array.from(rhs); for (let i = 0; i < n; i++) if (fixed[i]) { b[i] = 0; x[i] = 0; }
  const r = new Float64Array(n), z = new Float64Array(n), p = new Float64Array(n), Ap = new Float64Array(n);
  mul(x, Ap); let bn = 0; for (let i = 0; i < n; i++) { r[i] = b[i] - Ap[i]; bn += b[i] * b[i]; }
  bn = Math.sqrt(bn) || 1; prec(r, z); p.set(z);
  let rz = 0; for (let i = 0; i < n; i++) rz += r[i] * z[i];
  let it = 0;
  for (; it < maxIt; it++) {
    let rn = 0; for (let i = 0; i < n; i++) rn += r[i] * r[i];
    if (Math.sqrt(rn) / bn < tol) break;
    mul(p, Ap); let pAp = 0; for (let i = 0; i < n; i++) pAp += p[i] * Ap[i];
    const al = rz / pAp;
    for (let i = 0; i < n; i++) { x[i] += al * p[i]; r[i] -= al * Ap[i]; }
    prec(r, z); let rz2 = 0; for (let i = 0; i < n; i++) rz2 += r[i] * z[i];
    const be = rz2 / rz; rz = rz2; for (let i = 0; i < n; i++) p[i] = z[i] + be * p[i];
  }
  return { x, it };
}

/* Các đoạn dây của cuộn: {x, y, dx, dy} (trung điểm và vector dl), đã xoay và tịnh tiến.
   ang: hướng của E sơ cấp ngay dưới tâm cuộn số 8 (rad, trên canvas: 0 = sang phải, π/2 = xuống). */
function coilSegments(type, x0, y0, ang) {
  const segs = [], ca = Math.cos(ang), sa = Math.sin(ang), n = WING.nseg;
  const wings = type === 'fig8' ? [[0, -WING.gap, 1], [0, WING.gap, -1]] : [[0, 0, 1]];
  for (const [wx, wy, dir] of wings) for (let t = 0; t < WING.loops; t++) {
    const r = WING.r0 + (WING.r1 - WING.r0) * t / (WING.loops - 1);
    for (let k = 0; k < n; k++) {
      const a = 2 * Math.PI * (k + 0.5) / n, da = 2 * Math.PI / n * dir * WING.turns / WING.loops;
      const lx = wx + r * Math.cos(a), ly = wy + r * Math.sin(a), ldx = -r * Math.sin(a) * da, ldy = r * Math.cos(a) * da;
      segs.push({ x: x0 + lx * ca - ly * sa, y: y0 + lx * sa + ly * ca, dx: ldx * ca - ldy * sa, dy: ldx * sa + ldy * ca });
    }
  }
  return segs;
}
/* E sơ cấp (V/m) tại các điểm (px, py) trong mặt cách cuộn dây h */
function primaryField(segs, h, px, py) {
  const n = px.length, ex = new Float64Array(n), ey = new Float64Array(n), h2 = h * h, k = -MU0_4PI * DIDT;
  const S = segs.length, sx = new Float64Array(S), sy = new Float64Array(S), sdx = new Float64Array(S), sdy = new Float64Array(S);
  segs.forEach((g, i) => { sx[i] = g.x; sy[i] = g.y; sdx[i] = g.dx; sdy[i] = g.dy; });
  for (let i = 0; i < n; i++) {
    let ax = 0, ay = 0; const x = px[i], y = py[i];
    for (let q = 0; q < S; q++) { const dx = x - sx[q], dy = y - sy[q], w = 1 / Math.sqrt(dx * dx + dy * dy + h2); ax += sdx[q] * w; ay += sdy[q] * w; }
    ex[i] = k * ax; ey[i] = k * ay;
  }
  return { ex, ey };
}

/* Một lần giải đầy đủ: E_p ở tâm phần tử → φ → E, J → ψ */
function solveAll(M, S, Ep, prev) {
  const { ne, nn, T, gb, gc, area } = M, sig = S.sig, rhs = new Float64Array(nn);
  for (let e = 0; e < ne; e++) {
    const w = sig[e] * area[e], ex = Ep.ex[e], ey = Ep.ey[e];
    for (let p = 0; p < 3; p++) rhs[T[e][p]] += w * (ex * gb[3 * e + p] + ey * gc[3 * e + p]);
  }
  const sp = pcg(M, S.K, M.pin, S.Kf, rhs, prev && prev.phi);
  const phi = sp.x;
  let mean = 0, atot = 0;
  for (let e = 0; e < ne; e++) { const t = T[e]; mean += area[e] * (phi[t[0]] + phi[t[1]] + phi[t[2]]) / 3; atot += area[e]; }
  mean /= atot; for (let i = 0; i < nn; i++) phi[i] -= mean;
  const Esx = new Float64Array(ne), Esy = new Float64Array(ne), Ex = new Float64Array(ne), Ey = new Float64Array(ne), Jx = new Float64Array(ne), Jy = new Float64Array(ne);
  for (let e = 0; e < ne; e++) {
    const t = T[e]; let gx = 0, gy = 0;
    for (let p = 0; p < 3; p++) { gx += phi[t[p]] * gb[3 * e + p]; gy += phi[t[p]] * gc[3 * e + p]; }
    Esx[e] = -gx; Esy[e] = -gy; Ex[e] = Ep.ex[e] - gx; Ey[e] = Ep.ey[e] - gy; Jx[e] = sig[e] * Ex[e]; Jy[e] = sig[e] * Ey[e];
  }
  const r2 = new Float64Array(nn);
  for (let e = 0; e < ne; e++) {
    const a = area[e], vx = -Jy[e], vy = Jx[e];
    for (let p = 0; p < 3; p++) r2[T[e][p]] += a * (vx * gb[3 * e + p] + vy * gc[3 * e + p]);
  }
  const ps = pcg(M, S.L, M.outer, S.Lf, r2, prev && prev.psi, 1e-5);
  return { phi, Esx, Esy, Ex, Ey, Jx, Jy, psi: ps.x, it: sp.it };
}

/* Tìm phần tử chứa điểm (x, y) trên lưới cực; trả về [e, λ0, λ1, λ2] hoặc null */
function locate(M, x, y) {
  const r = Math.hypot(x, y); if (r >= RH) return null;
  let a = Math.atan2(x, -y); if (a < 0) a += 2 * Math.PI;
  const s = Math.min(NS - 1, Math.floor(a / (2 * Math.PI) * NS));
  let k = 0; while (k < M.K && M.radii[k] <= r) k++;
  const cands = k === 0 ? [s] : [NS + 2 * NS * (k - 1) + 2 * s, NS + 2 * NS * (k - 1) + 2 * s + 1];
  let best = null, bm = -Infinity;
  for (const e of cands) {
    if (e >= M.ne) continue;
    const t = M.T[e], l = [0, 0, 0];
    // λ_p(x) = λ_p(đỉnh p) + ∇λ_p·(x − đỉnh p) = 1 + ∇λ_p·(x − x_p)
    for (let p = 0; p < 3; p++) l[p] = 1 + M.gb[3 * e + p] * (x - M.X[t[p]]) + M.gc[3 * e + p] * (y - M.Y[t[p]]);
    const mn = Math.min(...l); if (mn > bm) { bm = mn; best = [e, l[0], l[1], l[2]]; }
  }
  return best;
}

/* ---------- giao diện ---------- */
BEM.demo('tms-field', {
  domId: 'demoTms',
  title: 'TMS: điện trường sơ cấp, thứ cấp và dòng điện',
  page: '5-do-lieu.html',
  html: `<div class="demo-title"><h4>TMS: điện trường sơ cấp, thứ cấp và dòng điện</h4><span>Kéo cuộn dây (ô trắng) và điểm dò (ô vàng)</span></div>
  <div class="demo-body">
    <div class="stagebox"><canvas id="cvTms" class="ar tall-m grab" tabindex="0" role="img" aria-label="Lát cắt ngang đầu gồm não có rãnh, dịch não tủy, xương sọ và da đầu, bên trên là cuộn dây TMS; màu chỉ độ lớn điện trường, mật độ dòng hoặc điện thế, đường mảnh là đường dòng."></canvas><span class="hint">Phím mũi tên: dời cuộn dây</span></div>
    <div class="panel">
      <div class="btnrow" role="group" aria-label="Cuộn dây">
        <button class="btn" type="button" data-tc="fig8" aria-pressed="true">Cuộn số 8</button>
        <button class="btn" type="button" data-tc="round" aria-pressed="false">Cuộn tròn</button>
        <button class="btn" type="button" id="tmCenter">Đặt cuộn vào tâm</button>
      </div>
      <div class="btnrow" role="group" aria-label="Mô hình mô">
        <button class="btn" type="button" data-tm="hom" aria-pressed="false">Đồng nhất</button>
        <button class="btn" type="button" data-tm="layers" aria-pressed="false">4 lớp</button>
        <button class="btn" type="button" data-tm="sulci" aria-pressed="true">4 lớp + rãnh não</button>
      </div>
      <div class="btnrow" role="group" aria-label="Màu nền">
        <button class="btn" type="button" data-tv="E" aria-pressed="true">|E|</button>
        <button class="btn" type="button" data-tv="J" aria-pressed="false">|J|</button>
        <button class="btn" type="button" data-tv="phi" aria-pressed="false">Điện thế φ</button>
        <button class="btn" type="button" data-tv="Ep" aria-pressed="false">E sơ cấp</button>
        <button class="btn" type="button" data-tv="Es" aria-pressed="false">E thứ cấp</button>
        <button class="btn" type="button" data-tv="sig" aria-pressed="false">σ</button>
      </div>
      <div class="checks"><label><input type="checkbox" id="tmStream" checked> Đường dòng J</label><label><input type="checkbox" id="tmArrow"> Mũi tên</label></div>
      <div class="ctrl"><label for="tmAng">Hướng E dưới tâm cuộn số 8</label><output for="tmAng"></output><input type="range" id="tmAng" min="0" max="180" step="5" value="0"></div>
      <div class="ctrl"><label for="tmH">Cuộn dây cách lát mô</label><output for="tmH"></output><input type="range" id="tmH" min="1" max="5" step="0.1" value="2.5"></div>
      <dl class="readout" aria-live="polite">
        <dt>Điểm dò: mô</dt><dd id="tmTis">—</dd>
        <dt>σ</dt><dd id="tmSig">—</dd>
        <dt>|E sơ cấp|</dt><dd id="tmEp">—</dd>
        <dt>|E thứ cấp| = |∇φ|</dt><dd id="tmEs">—</dd>
        <dt>|E| tổng</dt><dd class="big" id="tmE">—</dd>
        <dt>|J| = σ|E|</dt><dd class="big" id="tmJ">—</dd>
        <dt>Điện thế φ</dt><dd id="tmPhi">—</dd>
        <dt>|E| lớn nhất trong não</dt><dd id="tmEmax">—</dd>
      </dl>
      <p class="note-s">dI/dt = 100 A/µs; mọi giá trị tỉ lệ thuận với dI/dt. Mô hình 2D: một lát mô mỏng song song với mặt cuộn dây, bỏ qua dòng đi lên xuống giữa các lát.</p>
    </div>
  </div>`,
  init(root) {
    const cv = document.getElementById('cvTms'), st = {};
    const M = buildMesh(), L = assemble(M, null), Lf = icFactor(M, L, M.outer);
    const cache = {};
    const sigmaFor = model => cache[model] || (cache[model] = (() => {
      const s = elementSigma(M, model); s.K = assemble(M, s.sig); s.Kf = icFactor(M, s.K, M.pin); s.L = L; s.Lf = Lf; return s;
    })());
    let coil = 'fig8', model = 'sulci', view = 'E', showStream = true, showArrow = false;
    let cx0 = 0, cy0 = -0.052, probe = { x: 0.004, y: -0.069 }, R = null, Ep = null, pending = false, drag = null, segs = null;
    const rAng = range('tmAng', { show: v => v + '°', onInput: () => request() });
    const rH = range('tmH', { show: v => num(v, 2) + ' cm', onInput: () => request() });
    const group = (sel, fn) => { const bs = [...root.querySelectorAll(sel)]; bs.forEach(b => b.addEventListener('click', () => { bs.forEach(x => x.setAttribute('aria-pressed', x === b)); fn(b); })); };
    group('[data-tc]', b => { coil = b.dataset.tc; rAng.el.disabled = coil !== 'fig8'; request(); });
    group('[data-tm]', b => { model = b.dataset.tm; request(); });
    group('[data-tv]', b => { view = b.dataset.tv; draw(); });
    document.getElementById('tmCenter').addEventListener('click', () => { cx0 = 0; cy0 = 0; request(); });
    document.getElementById('tmStream').addEventListener('change', e => { showStream = e.target.checked; draw(); });
    document.getElementById('tmArrow').addEventListener('change', e => { showArrow = e.target.checked; draw(); });

    function request() { if (pending) return; pending = true; requestAnimationFrame(() => { pending = false; solve(); }); }
    function solve() {
      const S = sigmaFor(model);
      segs = coilSegments(coil, cx0, cy0, rAng.get() * Math.PI / 180);
      Ep = primaryField(segs, rH.get() / 100, M.cx, M.cy);
      R = solveAll(M, S, Ep, R);
      R.S = S;
      let em = 0, ref = 0;
      for (let e = 0; e < M.ne; e++) { if (S.lab[e] === 0) em = Math.max(em, Math.hypot(R.Ex[e], R.Ey[e])); ref = Math.max(ref, Math.hypot(Ep.ex[e], Ep.ey[e])); }
      R.Emax = em; R.tiny = 1e-6 * ref;              // dưới mức này coi là 0 (sai số làm tròn)
      draw(); readout();
    }
    function readout() {
      if (!R) return;
      const set = (id, t) => { document.getElementById(id).textContent = t; };
      const loc = locate(M, probe.x, probe.y);
      if (!loc) { ['tmTis', 'tmSig', 'tmEp', 'tmEs', 'tmE', 'tmJ', 'tmPhi'].forEach(i => set(i, '—')); set('tmTis', 'ngoài đầu'); }
      else {
        const [e, l0, l1, l2] = loc, t = M.T[e], S = R.S;
        set('tmTis', model === 'hom' ? 'Mô đồng nhất' : TIS[S.lab[e]].name);
        set('tmSig', num(S.sig[e], 3) + ' S/m');
        const f = (v, u, tiny) => Math.abs(v) < tiny ? '≈ 0 ' + u : fmt(v, u);
        set('tmEp', f(Math.hypot(Ep.ex[e], Ep.ey[e]), 'V/m', R.tiny));
        set('tmEs', f(Math.hypot(R.Esx[e], R.Esy[e]), 'V/m', R.tiny));
        set('tmE', f(Math.hypot(R.Ex[e], R.Ey[e]), 'V/m', R.tiny));
        set('tmJ', f(Math.hypot(R.Jx[e], R.Jy[e]), 'A/m²', R.tiny * S.sig[e]));
        set('tmPhi', f(l0 * R.phi[t[0]] + l1 * R.phi[t[1]] + l2 * R.phi[t[2]], 'V', R.tiny * RH));
      }
      set('tmEmax', fmt(R.Emax, 'V/m'));
    }

    /* ----- vẽ -----
       Nền màu được tô theo từng điểm ảnh: mỗi điểm ảnh biết nó nằm trong phần tử nào (bảng tra dựng lại khi đổi
       kích thước canvas); giá trị được nội suy từ giá trị ở nút, lấy trung bình RIÊNG cho từng mô, nên màu mượt bên
       trong một mô mà vẫn nhảy bậc đúng chỗ ở mặt phân cách. */
    const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
    const heat = v => {                   // 0..1 → trắng, vàng, đỏ, đỏ sẫm (như demo fem)
      if (v < 0.5) { const t = v / 0.5; return [255, 255 - 61 * t, 240 - 192 * t]; }
      const t = (v - 0.5) / 0.5; return [242 - 103 * t, 194 - 165 * t, 48 - 26 * t];
    };
    const diverge = v => { const a = Math.min(1, Math.abs(v)); return v > 0 ? [251 - 35 * a, 252 - 203 * a, 253 - 211 * a] : [251 - 196 * a, 252 - 117 * a, 253 - 57 * a]; };
    const LUT_HEAT = new Uint8ClampedArray(3 * 256), LUT_DIV = new Uint8ClampedArray(3 * 256);
    for (let i = 0; i < 256; i++) { LUT_HEAT.set(heat(i / 255), 3 * i); LUT_DIV.set(diverge(i / 127.5 - 1), 3 * i); }
    const TIS_RGB = TIS.map(t => rgb(t.col)), HOM_RGB = rgb('#E7D9E8'), PAPER = rgb(C.paper);
    const VIEW = {
      E: { name: '|E| tổng', unit: 'V/m', v: e => [R.Ex[e], R.Ey[e]], ax: () => [R.Ex, R.Ey] },
      J: { name: '|J| = σ|E|', unit: 'A/m²', v: e => [R.Jx[e], R.Jy[e]], ax: () => [R.Jx, R.Jy] },
      Ep: { name: '|E sơ cấp| = |∂A/∂t|', unit: 'V/m', v: e => [Ep.ex[e], Ep.ey[e]], ax: () => [Ep.ex, Ep.ey] },
      Es: { name: '|E thứ cấp| = |∇φ|', unit: 'V/m', v: e => [R.Esx[e], R.Esy[e]], ax: () => [R.Esx, R.Esy] },
      phi: { name: 'Điện thế φ', unit: 'V', v: e => [R.Esx[e], R.Esy[e]] },
      sig: { name: 'Độ dẫn điện σ', unit: 'S/m', v: e => [R.Ex[e], R.Ey[e]] },
    };
    function geom() { const { W, H } = st, s = Math.min(W / (W < 520 ? 0.205 : 0.25), H / 0.215); return { s, ox: W / 2, oy: H / 2 + 8 }; }
    let pix = null;                       // bảng tra điểm ảnh → (phần tử, λ0, λ1)
    function pixelMap() {
      const dpr = st.dpr || 1, w = Math.round(st.W * dpr), h = Math.round(st.H * dpr), { s, ox, oy } = geom();
      if (pix && pix.w === w && pix.h === h) return pix;
      const el = new Int32Array(w * h).fill(-1), l0 = new Float32Array(w * h), l1 = new Float32Array(w * h);
      const x0 = Math.max(0, Math.floor((ox - RH * s) * dpr)), x1 = Math.min(w, Math.ceil((ox + RH * s) * dpr));
      const y0 = Math.max(0, Math.floor((oy - RH * s) * dpr)), y1 = Math.min(h, Math.ceil((oy + RH * s) * dpr));
      for (let py = y0; py < y1; py++) for (let px = x0; px < x1; px++) {
        const loc = locate(M, ((px + 0.5) / dpr - ox) / s, ((py + 0.5) / dpr - oy) / s); if (!loc) continue;
        const i = py * w + px; el[i] = loc[0]; l0[i] = loc[1]; l1[i] = loc[2];
      }
      return (pix = { w, h, el, l0, l1, img: new ImageData(w, h) });
    }
    function nodal(vx, lab, nl) {          // trung bình theo diện tích của giá trị phần tử, riêng cho từng nhãn mô
      const nn = M.nn, acc = new Float64Array(nl * nn), ws = new Float64Array(nl * nn);
      for (let e = 0; e < M.ne; e++) { const o = lab[e] * nn, w = M.area[e], t = M.T[e]; for (let p = 0; p < 3; p++) { acc[o + t[p]] += w * vx[e]; ws[o + t[p]] += w; } }
      for (let i = 0; i < acc.length; i++) if (ws[i]) acc[i] /= ws[i];
      return acc;
    }
    function paintField(S, V) {
      const P = pixelMap(), { w, h, el, l0, l1, img } = P, d = img.data, nn = M.nn, T = M.T;
      const recLab = model === 'hom' ? new Int8Array(M.ne) : S.lab;
      let scaleTxt = '', colorAt;
      if (view === 'sig') colorAt = e => model === 'hom' ? HOM_RGB : TIS_RGB[S.lab[e]];
      else if (view === 'phi') {
        let m = 0; for (let i = 0; i < nn; i++) m = Math.max(m, Math.abs(R.phi[i]));
        if (m < R.tiny * RH) { scaleTxt = '≈ 0 ở mọi nơi'; m = Infinity; } else scaleTxt = `±${fmt(m, 'V', 2)}`;
        const k = 127.5 / m, tmp = [0, 0, 0];
        colorAt = (e, a, b) => { const t = T[e], v = a * R.phi[t[0]] + b * R.phi[t[1]] + (1 - a - b) * R.phi[t[2]], q = 3 * Math.max(0, Math.min(255, Math.round(127.5 + v * k))); tmp[0] = LUT_DIV[q]; tmp[1] = LUT_DIV[q + 1]; tmp[2] = LUT_DIV[q + 2]; return tmp; };
      } else {
        const [ax, ay] = V.ax(), mags = new Float64Array(M.ne);
        for (let e = 0; e < M.ne; e++) mags[e] = Math.hypot(ax[e], ay[e]);
        let top = Float64Array.from(mags).sort()[Math.floor(0.98 * (M.ne - 1))];
        if (!(top > R.tiny * (view === 'J' ? 0.01 : 1))) { scaleTxt = '≈ 0 ở mọi nơi'; top = Infinity; } else scaleTxt = `0 … ${fmt(top, V.unit, 2)}`;
        const NX = nodal(ax, recLab, 4), NY = nodal(ay, recLab, 4), k = 255 / top, tmp = [0, 0, 0];
        colorAt = (e, a, b) => {
          const t = T[e], o = recLab[e] * nn, c = 1 - a - b;
          const vx = a * NX[o + t[0]] + b * NX[o + t[1]] + c * NX[o + t[2]], vy = a * NY[o + t[0]] + b * NY[o + t[1]] + c * NY[o + t[2]];
          const q = 3 * Math.min(255, Math.round(Math.hypot(vx, vy) * k)); tmp[0] = LUT_HEAT[q]; tmp[1] = LUT_HEAT[q + 1]; tmp[2] = LUT_HEAT[q + 2]; return tmp;
        };
      }
      for (let i = 0, n = w * h; i < n; i++) {
        const e = el[i], c = e < 0 ? PAPER : colorAt(e, l0[i], l1[i]), j = 4 * i;
        d[j] = c[0]; d[j + 1] = c[1]; d[j + 2] = c[2]; d[j + 3] = 255;
      }
      st.ctx.putImageData(img, 0, 0);
      return scaleTxt;
    }
    function draw() {
      if (!st.ctx || !R) return;
      const { ctx } = st, { s, ox, oy } = geom(), P = (x, y) => [ox + x * s, oy + y * s];
      const S = R.S, V = VIEW[view];
      const scaleTxt = paintField(S, V);
      drawOutlines(ctx, P, s);
      if (showStream) drawStream(ctx, P, s);
      if (showArrow) drawArrows(ctx, P, s, V);
      drawCoil(ctx, P, s);
      // điểm dò
      const [qx, qy] = P(probe.x, probe.y);
      ctx.fillStyle = C.gold; ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.fillRect(qx - 6, qy - 6, 12, 12); ctx.strokeRect(qx - 6, qy - 6, 12, 12);
      // nhãn
      ctx.font = '600 12px "Be Vietnam Pro", system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      const lab1 = 'Màu: ' + V.name + (scaleTxt ? '  (' + scaleTxt + ')' : '');
      const lab2 = view === 'sig' ? (model === 'hom' ? 'σ = 0,33 S/m ở mọi nơi' : 'Da đầu 0,465 | Xương sọ 0,01 | Dịch não tủy 1,654 | Não 0,276 S/m') : (showStream ? 'Đường mảnh: đường dòng J (càng dày, dòng càng mạnh)' : '');
      [lab1, lab2].forEach((t, i) => { if (!t) return; const w = ctx.measureText(t).width; ctx.fillStyle = 'rgba(251,252,253,.88)'; ctx.fillRect(6, 6 + 18 * i, w + 8, 17); ctx.fillStyle = i ? C.muted : C.ink; ctx.fillText(t, 10, 8 + 18 * i); });
    }
    function drawOutlines(ctx, P, s) {
      const { ox, oy } = geom();
      ctx.strokeStyle = model === 'hom' ? 'rgba(27,25,32,.25)' : C.ink; ctx.lineWidth = 1.1;
      if (model === 'hom') ctx.setLineDash([3, 4]);
      [RC, RS].forEach(r => { ctx.beginPath(); ctx.arc(ox, oy, r * s, 0, 2 * Math.PI); ctx.stroke(); });
      // mặt não: bỏ qua chỗ miệng rãnh
      const da = 2 * Math.PI / NS, gaps = model === 'sulci' ? M.sulci.map(q => q.s) : [];
      for (let k = 0; k < NS; k++) {
        if (gaps.includes(k)) continue;
        ctx.beginPath(); ctx.arc(ox, oy, RB * s, k * da - Math.PI / 2, (k + 1) * da - Math.PI / 2 + 0.002); ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.lineWidth = 1.8; ctx.strokeStyle = C.ink; ctx.beginPath(); ctx.arc(ox, oy, RH * s, 0, 2 * Math.PI); ctx.stroke();
      if (model === 'sulci') {
        ctx.lineWidth = 1; ctx.strokeStyle = C.ink;
        M.sulci.forEach(q => {
          const a0 = q.s * da, a1 = (q.s + 1) * da, pt = (r, a) => P(r * Math.sin(a), -r * Math.cos(a));
          ctx.beginPath(); ctx.moveTo(...pt(RB, a0)); ctx.lineTo(...pt(q.rIn, a0));
          ctx.arc(ox, oy, q.rIn * s, a0 - Math.PI / 2, a1 - Math.PI / 2); ctx.lineTo(...pt(RB, a1)); ctx.stroke();
        });
      }
    }
    function drawStream(ctx, P, s) {
      const { T, X, Y, ne } = M, psi = R.psi;
      let mx = 0, mn = 0; for (let i = 0; i < M.nn; i++) { mx = Math.max(mx, psi[i]); mn = Math.min(mn, psi[i]); }
      const big = Math.max(mx, -mn); if (!(big > 0)) return;
      const step = big / 9, seen = new Set(), cell = 46;
      ctx.strokeStyle = 'rgba(27,25,32,.72)'; ctx.lineWidth = 1; ctx.beginPath();
      const heads = [];
      for (let e = 0; e < ne; e++) {
        const t = T[e], v = [psi[t[0]], psi[t[1]], psi[t[2]]];
        const lo = Math.min(...v), hi = Math.max(...v);
        for (let lev = Math.ceil(lo / step) * step; lev <= hi; lev += step) {
          if (Math.abs(lev) < step * 0.5) continue;              // bỏ mức 0 (chính là mép lát)
          const pts = [];
          for (let p = 0; p < 3; p++) {
            const a = t[p], b = t[(p + 1) % 3], va = psi[a], vb = psi[b];
            if ((va - lev) * (vb - lev) < 0) { const f = (lev - va) / (vb - va); pts.push([X[a] + f * (X[b] - X[a]), Y[a] + f * (Y[b] - Y[a])]); }
          }
          if (pts.length === 2) {
            const [a0, a1] = [P(...pts[0]), P(...pts[1])];
            ctx.moveTo(...a0); ctx.lineTo(...a1);
            const mxp = (a0[0] + a1[0]) / 2, myp = (a0[1] + a1[1]) / 2, key = Math.round(lev / step) + ':' + Math.floor(mxp / cell) + ':' + Math.floor(myp / cell);
            if (!seen.has(key)) { seen.add(key); heads.push([mxp, myp, R.Jx[e], R.Jy[e]]); }
          }
        }
      }
      ctx.stroke();
      ctx.fillStyle = 'rgba(27,25,32,.8)';
      heads.forEach(([x, y, jx, jy]) => {
        const L = Math.hypot(jx, jy); if (!L) return; const ux = jx / L, uy = jy / L, h = 5;
        ctx.beginPath(); ctx.moveTo(x + ux * h, y + uy * h); ctx.lineTo(x - ux * h - uy * h * 0.6, y - uy * h + ux * h * 0.6); ctx.lineTo(x - ux * h + uy * h * 0.6, y - uy * h - ux * h * 0.6); ctx.closePath(); ctx.fill();
      });
    }
    function drawArrows(ctx, P, s, V) {
      const { W, H } = st, { ox, oy } = geom(), gap = 24, pts = [];
      let mx = 0;
      for (let py = gap / 2; py < H; py += gap) for (let px = gap / 2; px < W; px += gap) {
        const loc = locate(M, (px - ox) / s, (py - oy) / s); if (!loc) continue;
        const [vx, vy] = V.v(loc[0]), m = Math.hypot(vx, vy); mx = Math.max(mx, m); pts.push([px, py, vx, vy, m]);
      }
      if (!mx) return;
      pts.forEach(([px, py, vx, vy, m]) => {
        if (!m) return; const L = Math.max(4, gap * 0.85 * Math.sqrt(m / mx)), ux = vx / m, uy = vy / m;
        arrow(ctx, px - ux * L / 2, py - uy * L / 2, px + ux * L / 2, py + uy * L / 2, C.sea, 1.4, 5);
      });
    }
    function drawCoil(ctx, P, s) {
      const ang = rAng.get() * Math.PI / 180, ca = Math.cos(ang), sa = Math.sin(ang);
      const wings = coil === 'fig8' ? [[0, -WING.gap, 1], [0, WING.gap, -1]] : [[0, 0, 1]];
      ctx.save();
      wings.forEach(([wx, wy, dir]) => {
        const gx = cx0 + wx * ca - wy * sa, gy = cy0 + wx * sa + wy * ca, [px, py] = P(gx, gy);
        ctx.fillStyle = 'rgba(55,135,196,.12)'; ctx.beginPath(); ctx.arc(px, py, WING.r1 * s, 0, 2 * Math.PI); ctx.arc(px, py, WING.r0 * s, 0, 2 * Math.PI, true); ctx.fill();
        [WING.r0, WING.r1].forEach(r => {          // viền trắng bên dưới nét đứt để nổi trên mọi nền màu
          ctx.setLineDash([]); ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 3.2; ctx.beginPath(); ctx.arc(px, py, r * s, 0, 2 * Math.PI); ctx.stroke();
          ctx.setLineDash([6, 4]); ctx.strokeStyle = C.sea; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(px, py, r * s, 0, 2 * Math.PI); ctx.stroke();
        });
        ctx.setLineDash([]);
        // chiều dòng trong cuộn dây (khi dòng đang tăng)
        const rm = (WING.r0 + WING.r1) / 2 * s;
        for (let k = 0; k < 4; k++) {
          const a = Math.PI / 4 + k * Math.PI / 2 + ang, x = px + rm * Math.cos(a), y = py + rm * Math.sin(a), tx = -Math.sin(a) * dir, ty = Math.cos(a) * dir;
          arrow(ctx, x - tx * 7, y - ty * 7, x + tx * 7, y + ty * 7, '#fff', 4, 8);
          arrow(ctx, x - tx * 7, y - ty * 7, x + tx * 7, y + ty * 7, C.sea, 1.8, 6);
        }
      });
      const [hx, hy] = P(cx0, cy0);
      if (coil === 'fig8') {                        // hướng E sơ cấp ngay dưới tâm cuộn
        arrow(ctx, hx - ca * 26, hy - sa * 26, hx + ca * 32, hy + sa * 32, '#fff', 6.5, 15);
        arrow(ctx, hx - ca * 26, hy - sa * 26, hx + ca * 30, hy + sa * 30, C.pos, 3, 11);
      }
      ctx.fillStyle = '#fff'; ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.fillRect(hx - 7, hy - 7, 14, 14); ctx.strokeRect(hx - 7, hy - 7, 14, 14);
      ctx.restore();
    }

    /* ----- kéo thả ----- */
    const toWorld = e => { const r = cv.getBoundingClientRect(), { s, ox, oy } = geom(); return [(e.clientX - r.left - ox) / s, (e.clientY - r.top - oy) / s]; };
    const clampHead = (x, y, lim) => { const r = Math.hypot(x, y); return r > lim ? [x * lim / r, y * lim / r] : [x, y]; };
    cv.addEventListener('pointerdown', e => {
      const [x, y] = toWorld(e), { s } = geom();
      const dp = Math.hypot(x - probe.x, y - probe.y) * s, dc = Math.hypot(x - cx0, y - cy0) * s;
      if (dp < 14 && dp <= dc) drag = 'probe'; else if (dc < 18) drag = 'coil';
      else { drag = 'probe'; [probe.x, probe.y] = clampHead(x, y, RH * 0.995); readout(); draw(); }
      cv.setPointerCapture(e.pointerId); cv.classList.add('grabbing');
    });
    cv.addEventListener('pointermove', e => {
      if (!drag) return;
      const [x, y] = toWorld(e);
      if (drag === 'probe') { [probe.x, probe.y] = clampHead(x, y, RH * 0.995); readout(); draw(); }
      else { [cx0, cy0] = clampHead(x, y, 0.11); request(); }
    });
    const end = () => { drag = null; cv.classList.remove('grabbing'); };
    cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
    cv.addEventListener('keydown', e => {
      const d = 0.002, mv = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, -d], ArrowDown: [0, d] }[e.key];
      if (!mv) return; e.preventDefault(); [cx0, cy0] = clampHead(cx0 + mv[0], cy0 + mv[1], 0.11); request();
    });

    watchCanvas(cv, st, draw);
    rAng.upd(); rH.upd(); solve();
  },
});
})();
