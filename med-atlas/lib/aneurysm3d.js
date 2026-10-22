/* =====================================================================
   TRÌNH XEM 3D PHÌNH MẠCH  (med-atlas/lib/aneurysm3d.js, dùng cho 4-brain-aneurysm.html)
   Dữ liệu: lib/data/aneurysm3d/
     cases.json        nội dung chữ viết tay (tên ca, mô tả, gợi ý, nguồn)
     cases-auto.json   số đo tự động (tools/prepare_intra.py), không sửa tay
     <id>.bin          lưới tam giác + nhãn (0 mạch, 1 túi phình, 2 cổ túi); định dạng ghi ở đầu prepare_intra.py
   WebGL thuần, không cần thư viện. Kéo = xoay, Shift+kéo hoặc chuột phải = dời, cuộn hoặc chụm hai ngón = phóng to.
   Phím: mũi tên xoay, + / - phóng, 0 về góc ban đầu.
   ===================================================================== */
const An3D = (() => {
'use strict';
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const PAL = [[0.74, 0.78, 0.84], [0.86, 0.22, 0.17], [0.96, 0.76, 0.12]];
const CSSCOL = ['#BDC7D6', '#DB3830', '#F5C21F'];
const FOV = 35 * Math.PI / 180;
const S = { base: '', idx: null, auto: {}, cache: {}, cur: null, mesh: null, R: [1, 0, 0, 0, 1, 0, 0, 0, 1], dist: 50, pan: [0, 0], target: [0, 0, 0],
  show: true, spin: false, hover: -1, ptrs: new Map(), last: null, pinch: 0, raf: 0, need: true, pickReq: null };
let host, cv, gl, prog, loc = {}, buf = {}, info, read, uint32 = false;

/* ---------- toán 3x3 (cột trước, như WebGL) ---------- */
const m3mul = (a, b) => { const o = new Array(9); for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++) o[c * 3 + r] = a[r] * b[c * 3] + a[3 + r] * b[c * 3 + 1] + a[6 + r] * b[c * 3 + 2]; return o; };
function rot(ax, ay, az, t) {
  const c = Math.cos(t), s = Math.sin(t), k = 1 - c;
  return [c + ax * ax * k, ay * ax * k + az * s, az * ax * k - ay * s,
          ax * ay * k - az * s, c + ay * ay * k, az * ay * k + ax * s,
          ax * az * k + ay * s, ay * az * k - ax * s, c + az * az * k];
}
function ortho(R) { /* Gram-Schmidt để ma trận không méo dần sau nhiều lần xoay */
  let x = R.slice(0, 3), y = R.slice(3, 6);
  const n = v => { const l = Math.hypot(...v) || 1; return v.map(q => q / l); };
  x = n(x); const d = x[0] * y[0] + x[1] * y[1] + x[2] * y[2]; y = n(y.map((q, i) => q - d * x[i]));
  const z = [x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0]];
  return [...x, ...y, ...z];
}
const tmul = (R, v) => [R[0] * v[0] + R[1] * v[1] + R[2] * v[2], R[3] * v[0] + R[4] * v[1] + R[5] * v[2], R[6] * v[0] + R[7] * v[1] + R[8] * v[2]];  // Rᵀv
const mulv = (R, v) => [R[0] * v[0] + R[3] * v[1] + R[6] * v[2], R[1] * v[0] + R[4] * v[1] + R[7] * v[2], R[2] * v[0] + R[5] * v[1] + R[8] * v[2]];  // Rv
function trans() { const t = mulv(S.R, S.target); return [S.pan[0] - t[0], S.pan[1] - t[1], -S.dist - t[2]]; }

/* ---------- WebGL ---------- */
const VS = `attribute vec3 aP; attribute vec3 aN; attribute float aL;
uniform mat4 uMV; uniform mat4 uPr; uniform mat3 uNm; uniform vec3 uC0; uniform vec3 uC1; uniform vec3 uC2; uniform float uHl; uniform float uShow;
varying vec3 vN; varying vec3 vC; varying vec3 vV;
void main(){ vec4 p = uMV * vec4(aP, 1.0); vV = p.xyz; vN = uNm * aN;
  vec3 c = uC0;
  if (uShow > 0.5) { if (aL > 1.5) c = uC2; else if (aL > 0.5) c = uC1; }
  if (uHl > -0.5 && abs(aL - uHl) < 0.5) c = min(c * 1.18 + 0.10, vec3(1.0));
  vC = c; gl_Position = uPr * p; }`;
const FS = `precision mediump float; varying vec3 vN; varying vec3 vC; varying vec3 vV;
void main(){ vec3 n = normalize(vN); vec3 v = normalize(-vV); if (dot(n, v) < 0.0) n = -n;
  vec3 l = normalize(vec3(0.35, 0.5, 1.0)); float d = max(dot(n, l), 0.0);
  float s = pow(max(dot(n, normalize(l + v)), 0.0), 36.0);
  gl_FragColor = vec4(vC * (0.30 + 0.70 * d) + 0.16 * s, 1.0); }`;
function initGL() {
  gl = cv.getContext('webgl2', { antialias: true }) || cv.getContext('webgl', { antialias: true });
  if (!gl) return false;
  uint32 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext || !!gl.getExtension('OES_element_index_uint');
  const sh = (t, src) => { const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  prog = gl.createProgram(); gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  gl.useProgram(prog);
  ['aP', 'aN', 'aL'].forEach(k => loc[k] = gl.getAttribLocation(prog, k));
  ['uMV', 'uPr', 'uNm', 'uC0', 'uC1', 'uC2', 'uHl', 'uShow'].forEach(k => loc[k] = gl.getUniformLocation(prog, k));
  PAL.forEach((c, i) => gl.uniform3fv(loc['uC' + i], c));
  ['p', 'n', 'l', 'i'].forEach(k => buf[k] = gl.createBuffer());
  gl.enable(gl.DEPTH_TEST); gl.clearColor(0.07, 0.07, 0.09, 1);
  return true;
}
function upload(m) {
  const put = (b, data, l, size) => { gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, size, gl.FLOAT, false, 0, 0); };
  put(buf.p, m.V, loc.aP, 3); put(buf.n, m.N, loc.aN, 3); put(buf.l, m.Lf, loc.aL, 1);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buf.i);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, m.big ? m.F : new Uint16Array(m.F), gl.STATIC_DRAW);
}
function draw() {
  const m = S.mesh; if (!m) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2), r = cv.getBoundingClientRect();
  const W = Math.max(1, Math.round(r.width * dpr)), H = Math.max(1, Math.round(r.height * dpr));
  if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
  gl.viewport(0, 0, W, H); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  const R = S.R, t = trans(), a = W / H, f = 1 / Math.tan(FOV / 2), n = Math.max(S.dist - m.rad * 1.5, S.dist * 0.01), fa = S.dist + m.rad * 2;
  gl.uniformMatrix4fv(loc.uMV, false, [R[0], R[1], R[2], 0, R[3], R[4], R[5], 0, R[6], R[7], R[8], 0, t[0], t[1], t[2], 1]);
  gl.uniformMatrix4fv(loc.uPr, false, [f / a, 0, 0, 0, 0, f, 0, 0, 0, 0, (fa + n) / (n - fa), -1, 0, 0, 2 * fa * n / (n - fa), 0]);
  gl.uniformMatrix3fv(loc.uNm, false, R);
  gl.uniform1f(loc.uHl, S.hover); gl.uniform1f(loc.uShow, S.show ? 1 : 0);
  gl.drawElements(gl.TRIANGLES, m.F.length, m.big ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT, 0);
}
function loop() {
  S.raf = 0;
  if (S.spin) { S.R = ortho(m3mul(rot(0, 1, 0, 0.006), S.R)); S.need = true; }
  if (S.pickReq) { const [x, y] = S.pickReq; S.pickReq = null; setHover(pick(x, y)); }
  if (S.need) { S.need = false; draw(); }
  if (S.spin) kick();
}
const kick = () => { if (!S.raf) S.raf = requestAnimationFrame(loop); };
const redraw = () => { S.need = true; kick(); };

/* ---------- đọc lưới ---------- */
function parse(ab) {
  const dv = new DataView(ab), nV = dv.getUint32(0, true), nF = dv.getUint32(4, true);
  let o = 8;
  const V = new Float32Array(ab.slice(o, o + nV * 12)); o += nV * 12;
  const L = new Uint8Array(ab.slice(o, o + nV)); o += nV + (4 - nV % 4) % 4;
  const F = new Uint32Array(ab.slice(o, o + nF * 12));
  const N = new Float32Array(nV * 3);
  for (let i = 0; i < F.length; i += 3) {     /* pháp tuyến đỉnh, trọng số theo diện tích */
    const a = F[i] * 3, b = F[i + 1] * 3, c = F[i + 2] * 3;
    const ux = V[b] - V[a], uy = V[b + 1] - V[a + 1], uz = V[b + 2] - V[a + 2], vx = V[c] - V[a], vy = V[c + 1] - V[a + 1], vz = V[c + 2] - V[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const k of [a, b, c]) { N[k] += nx; N[k + 1] += ny; N[k + 2] += nz; }
  }
  for (let i = 0; i < N.length; i += 3) { const l = Math.hypot(N[i], N[i + 1], N[i + 2]) || 1; N[i] /= l; N[i + 1] /= l; N[i + 2] /= l; }
  let rad = 0; const ctr = [0, 0, 0], cnt = [0, 0, 0]; let nl = 0;
  for (let i = 0; i < nV; i++) {
    rad = Math.max(rad, Math.hypot(V[i * 3], V[i * 3 + 1], V[i * 3 + 2]));
    if (L[i] > 0) { nl++; ctr[0] += V[i * 3]; ctr[1] += V[i * 3 + 1]; ctr[2] += V[i * 3 + 2]; }
    cnt[L[i]] = (cnt[L[i]] || 0) + 1;
  }
  let lrad = 0; if (nl) { ctr.forEach((q, k) => ctr[k] = q / nl); for (let i = 0; i < nV; i++) if (L[i] > 0) lrad = Math.max(lrad, Math.hypot(V[i * 3] - ctr[0], V[i * 3 + 1] - ctr[1], V[i * 3 + 2] - ctr[2])); }
  return { V, L, Lf: Float32Array.from(L), F, N, rad: rad || 1, big: nV > 65535, lab: nl ? { ctr, rad: lrad } : null, cnt };
}

/* ---------- chọn phần dưới con trỏ (tia - tam giác, Möller–Trumbore) ---------- */
function pick(cx, cy) {
  const m = S.mesh; if (!m) return -1;
  const r = cv.getBoundingClientRect(), x = (cx - r.left) / r.width * 2 - 1, y = 1 - (cy - r.top) / r.height * 2;
  if (x < -1 || x > 1 || y < -1 || y > 1) return -1;
  const th = Math.tan(FOV / 2), t = trans();
  const o = tmul(S.R, [-t[0], -t[1], -t[2]]), d = tmul(S.R, [x * th * r.width / r.height, y * th, -1]);
  const V = m.V, F = m.F; let best = Infinity, bi = -1;
  for (let i = 0; i < F.length; i += 3) {
    const a = F[i] * 3, b = F[i + 1] * 3, c = F[i + 2] * 3;
    const e1x = V[b] - V[a], e1y = V[b + 1] - V[a + 1], e1z = V[b + 2] - V[a + 2], e2x = V[c] - V[a], e2y = V[c + 1] - V[a + 1], e2z = V[c + 2] - V[a + 2];
    const px = d[1] * e2z - d[2] * e2y, py = d[2] * e2x - d[0] * e2z, pz = d[0] * e2y - d[1] * e2x;
    const det = e1x * px + e1y * py + e1z * pz; if (Math.abs(det) < 1e-12) continue;
    const inv = 1 / det, sx = o[0] - V[a], sy = o[1] - V[a + 1], sz = o[2] - V[a + 2];
    const u = (sx * px + sy * py + sz * pz) * inv; if (u < 0 || u > 1) continue;
    const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
    const v = (d[0] * qx + d[1] * qy + d[2] * qz) * inv; if (v < 0 || u + v > 1) continue;
    const tt = (e2x * qx + e2y * qy + e2z * qz) * inv;
    if (tt > 0 && tt < best) { best = tt; bi = i; }
  }
  if (bi < 0) return -1;
  return Math.max(m.L[F[bi]], m.L[F[bi + 1]], m.L[F[bi + 2]]);
}

/* ---------- giao diện ---------- */
function build() {
  host.innerHTML = `
  <div class="an-tabs" role="group" aria-label="Chọn mô hình" id="a3Tabs"></div>
  <div class="an-viewer">
    <div class="an-stage">
      <div class="a3-film"><canvas id="a3Cv" tabindex="0" aria-label="Mô hình 3D. Kéo để xoay, cuộn hoặc chụm hai ngón để phóng to, Shift kéo để dời. Phím mũi tên xoay, cộng trừ phóng to, số 0 về góc ban đầu."></canvas><div class="a3-msg" id="a3Msg">Đang tải…</div></div>
      <div class="an-readout" id="a3Read" aria-live="polite"></div>
      <div class="an-controls">
        <div class="an-ctl"><span class="lab">Hiển thị</span><div class="seg">
          <button class="btn" type="button" id="a3Lab" aria-pressed="true">Tô màu theo nhãn</button>
          <button class="btn" type="button" id="a3Spin" aria-pressed="false">Tự xoay</button>
          <button class="btn" type="button" id="a3Focus" hidden>Phóng tới túi phình</button>
          <button class="btn" type="button" id="a3Reset">Về góc ban đầu</button></div></div>
        <div class="a3-legend" id="a3Leg"></div>
      </div>
    </div>
    <div class="an-info" id="a3Info" aria-live="polite"></div>
  </div>
  <p class="an-credit" id="a3Credit"></p>`;
  cv = $('a3Cv'); info = $('a3Info'); read = $('a3Read');
  $('a3Lab').onclick = e => { S.show = !S.show; e.currentTarget.setAttribute('aria-pressed', S.show); renderLegend(); redraw(); };
  $('a3Spin').onclick = e => { S.spin = !S.spin; e.currentTarget.setAttribute('aria-pressed', S.spin); kick(); };
  $('a3Reset').onclick = () => { resetView(); redraw(); };
  $('a3Focus').onclick = () => { const l = S.mesh && S.mesh.lab; if (!l) return; S.target = l.ctr.slice(); S.pan = [0, 0]; S.dist = Math.max(l.rad, 1.5) * 4.5; redraw(); };
  cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); S.ptrs.set(e.pointerId, [e.clientX, e.clientY]); S.last = null; S.pinch = 0; cv.focus({ preventScroll: true }); });
  cv.addEventListener('pointermove', e => {
    if (!S.ptrs.has(e.pointerId)) { if (e.pointerType === 'mouse') { S.pickReq = [e.clientX, e.clientY]; kick(); } return; }
    const prev = S.ptrs.get(e.pointerId); S.ptrs.set(e.pointerId, [e.clientX, e.clientY]);
    const dx = e.clientX - prev[0], dy = e.clientY - prev[1];
    if (S.ptrs.size >= 2) {
      const [p, q] = [...S.ptrs.values()], dd = Math.hypot(p[0] - q[0], p[1] - q[1]);
      if (S.pinch) zoom(S.pinch / dd); S.pinch = dd;
    } else if (e.shiftKey || (e.buttons & 2)) panBy(dx, dy);
    else rotBy(dx, dy);
    redraw();
  });
  const up = e => { const tap = S.ptrs.size === 1 && e.pointerType !== 'mouse'; S.ptrs.delete(e.pointerId); S.pinch = 0; if (tap) { S.pickReq = [e.clientX, e.clientY]; kick(); } };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && !S.ptrs.size) setHover(-1); });
  cv.addEventListener('contextmenu', e => e.preventDefault());
  cv.addEventListener('wheel', e => { e.preventDefault(); zoom(Math.exp(e.deltaY * 0.0012)); redraw(); }, { passive: false });
  cv.addEventListener('keydown', e => {
    const k = e.key, st = 0.12;
    if (k === 'ArrowLeft') S.R = ortho(m3mul(rot(0, 1, 0, -st), S.R)); else if (k === 'ArrowRight') S.R = ortho(m3mul(rot(0, 1, 0, st), S.R));
    else if (k === 'ArrowUp') S.R = ortho(m3mul(rot(1, 0, 0, -st), S.R)); else if (k === 'ArrowDown') S.R = ortho(m3mul(rot(1, 0, 0, st), S.R));
    else if (k === '+' || k === '=') zoom(0.85); else if (k === '-') zoom(1.18); else if (k === '0') resetView(); else return;
    e.preventDefault(); redraw();
  });
  window.addEventListener('resize', redraw);
}
function rotBy(dx, dy) { const l = Math.hypot(dx, dy); if (!l) return; S.R = ortho(m3mul(rot(dy / l, dx / l, 0, l * 0.008), S.R)); }
function panBy(dx, dy) { const r = cv.getBoundingClientRect(), k = 2 * S.dist * Math.tan(FOV / 2) / r.height; S.pan[0] += dx * k; S.pan[1] -= dy * k; }
function zoom(f) { const m = S.mesh; if (!m) return; S.dist = Math.min(Math.max(S.dist * f, m.rad * 0.05), m.rad * 12); }
function resetView() {
  const m = S.mesh; if (!m) return;
  S.R = ortho(m3mul(rot(1, 0, 0, -0.35), rot(0, 1, 0, 0.5))); S.pan = [0, 0]; S.target = [0, 0, 0];
  S.dist = m.rad / Math.sin(FOV / 2) * 1.05;
}
function setHover(l) {
  if (l === S.hover) return; S.hover = l; redraw();
  const P = S.idx.parts;
  read.innerHTML = l >= 0 ? `<span><span class="a3-sw" style="background:${CSSCOL[l]}"></span><b>${esc(P[l].vi)}</b></span><span>${esc(P[l].en)}</span><span class="a3-dim">${esc(P[l].desc)}</span>` : '<span>Rê chuột hoặc chạm vào mô hình để xem tên từng phần. Kéo để xoay.</span>';
}
function renderLegend() {
  const P = S.idx.parts, c = S.mesh ? S.mesh.cnt : [1, 1, 1];
  $('a3Leg').innerHTML = S.show ? P.map((p, i) => c[i] ? `<span><span class="a3-sw" style="background:${CSSCOL[i]}"></span>${esc(p.vi)}</span>` : '').join('') : '<span>Đang tắt tô màu: nhìn thử xem có tự nhận ra túi phình không.</span>';
}
function renderInfo(c) {
  const a = S.auto[c.id] || {};
  let h = `<h3>${esc(c.label)}</h3><p class="en">${esc(c.en)}</p><p>${esc(c.text)}</p>`;
  if (a.sac_max) {
    const ratio = a.neck_width ? (a.sac_max / a.neck_width).toFixed(1).replace('.', ',') : '–';
    h += `<table class="a3-num"><tr><th>Kích thước lớn nhất của túi</th><td>${String(a.sac_max).replace('.', ',')} mm</td></tr><tr><th>Độ rộng vùng cổ</th><td>${String(a.neck_width).replace('.', ',')} mm</td></tr><tr><th>Tỷ lệ túi / cổ</th><td>${ratio}</td></tr></table>
      <p class="an-foot">Số đo do máy tính từ mô hình (khoảng cách lớn nhất giữa các điểm mang nhãn), không phải số đo lâm sàng. Đơn vị giả định là mm theo tọa độ của bộ dữ liệu, chưa xác minh.</p>`;
  }
  h += `<p><span class="k">Gợi ý: </span>${esc(c.tip)}</p>`;
  if (c.kind !== 'healthy') h += `<p><span class="src ai" style="color:#5b4a99;background:#EFEBFA">Nhãn của chuyên gia (bộ IntrA)</span></p>`;
  info.innerHTML = h;
}
async function load(id) {
  const c = S.idx.cases.find(q => q.id === id); if (!c) return;
  S.cur = id; [...$('a3Tabs').children].forEach(b => b.setAttribute('aria-pressed', b.dataset.id === id));
  const msg = $('a3Msg'); msg.hidden = false; msg.textContent = 'Đang tải…';
  try {
    if (!S.cache[id]) {
      const r = await fetch(S.base + id + '.bin'); if (!r.ok) throw new Error(r.status + ' ' + id + '.bin');
      S.cache[id] = parse(await r.arrayBuffer());
    }
    if (S.cur !== id) return;
    const m = S.cache[id];
    if (m.big && !uint32) throw new Error('Trình duyệt không hỗ trợ lưới lớn (thiếu OES_element_index_uint).');
    S.mesh = m; upload(m); resetView(); S.hover = -2; setHover(-1);
    $('a3Focus').hidden = !(c.kind === 'complete' && m.lab);
    renderInfo(c); renderLegend(); msg.hidden = true; redraw();
  } catch (e) { msg.textContent = 'Lỗi tải mô hình: ' + e.message; }
}
async function start(opts) {
  host = opts.host; S.base = opts.data;
  if (location.protocol === 'file:') { host.innerHTML = '<p class="an-note">Trình xem 3D cần chạy qua web server. Xem README-aneurysm.md.</p>'; return; }
  build();
  try { if (!initGL()) { $('a3Msg').textContent = 'Trình duyệt không hỗ trợ WebGL nên không hiển thị được mô hình 3D.'; return; } }
  catch (e) { $('a3Msg').textContent = 'Lỗi khởi tạo WebGL: ' + e.message; return; }
  try {
    const [idx, auto] = await Promise.all([fetch(S.base + 'cases.json').then(r => r.json()), fetch(S.base + 'cases-auto.json').then(r => r.ok ? r.json() : {})]);
    S.idx = idx; S.auto = auto; $('a3Credit').textContent = 'Nguồn: ' + idx.credit;
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) S.spin = false;
    idx.cases.forEach(c => { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn'; b.dataset.id = c.id; b.innerHTML = `<span>${esc(c.label)}</span><span class="en">${esc(c.en)}</span>`; b.onclick = () => load(c.id); $('a3Tabs').appendChild(b); });
    await load(opts.first || idx.cases[0].id);
  } catch (e) { $('a3Msg').textContent = 'Lỗi tải dữ liệu: ' + e.message; }
}
return { start };
})();
