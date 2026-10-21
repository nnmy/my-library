/* =====================================================================
   Phân vùng mô đầu từ MRI T1 + T2 (head-seg.html).
   Mô hình: mạng phân vùng (Kubota, 2025) ở dạng ONNX, chạy bằng onnxruntime-web (lib/vendor/onnxruntime-web/).
   Ảnh không rời khỏi máy người dùng.

   Các bước:
     1. đọc NIfTI (.nii, .nii.gz): affine "tốt nhất" như nibabel (sform, rồi qform, rồi affine gốc), có scl_slope
     2. conform: lấy mẫu lại từng ảnh lên lưới 1 mm thẳng trục RAS (nội suy tam tuyến, ngoài khối = 0)
     3. đăng ký T2 -> T1: chỉ dời nguyên voxel; tâm khối trùng nhau, tìm theo z ±40, rồi khối ±5 quanh đó,
        theo thông tin tương hỗ chuẩn hoá (NMI, 64 mức xám)
     4. khung 256 × 256 (đệm / cắt giữa, theo T1), chuẩn hoá min–max về 0..255 cho từng ảnh
     5. mạng chạy từng lát ngang (axial), đầu vào (T1, T2)/255, đầu ra nhãn 0..14
     6. đưa nhãn về lưới 1 mm, rồi về lưới gốc của T1 (láng giềng gần nhất)
   Đầu ra tải về (.nii.gz): phân vùng trên lưới T1 gốc, phân vùng 1 mm, T1 1 mm, T2 1 mm đã đăng ký; bảng thể tích (.csv).
   Mục lục: 1. NIfTI  2. conform  3. đăng ký  4. khung + chuẩn hoá  5. mạng  6. đầu ra  7. giao diện
   ===================================================================== */
const HEADSEG = (() => {
'use strict';
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const tick = () => new Promise(r => setTimeout(r, 0));           // nhường trình duyệt vẽ lại thanh tiến trình
const f32 = Math.fround;

/* ---------------- 1. NIfTI ---------------- */
async function gunzipIfNeeded(b) {
  if (b[0] !== 0x1f || b[1] !== 0x8b) return b;
  const st = new Blob([b]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(st).arrayBuffer());
}
async function gzip(bytes) {
  const st = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(st).arrayBuffer());
}
const READ = {     // datatype -> [số byte, hàm đọc DataView]
  2: [1, (v, o) => v.getUint8(o)], 256: [1, (v, o) => v.getInt8(o)],
  4: [2, (v, o, le) => v.getInt16(o, le)], 512: [2, (v, o, le) => v.getUint16(o, le)],
  8: [4, (v, o, le) => v.getInt32(o, le)], 768: [4, (v, o, le) => v.getUint32(o, le)],
  16: [4, (v, o, le) => v.getFloat32(o, le)], 64: [8, (v, o, le) => v.getFloat64(o, le)],
};
/* affine 4×4 (mảng 16 số, theo hàng) -> như nibabel get_best_affine */
function bestAffine(v, le, dims, pix) {
  const sform = v.getInt16(254, le), qform = v.getInt16(252, le);
  if (sform > 0) {
    const a = []; for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) a.push(v.getFloat32(280 + 16 * r + 4 * c, le));
    return [...a, 0, 0, 0, 1];
  }
  if (qform > 0) {
    let b = v.getFloat32(256, le), c = v.getFloat32(260, le), d = v.getFloat32(264, le);
    const qx = v.getFloat32(268, le), qy = v.getFloat32(272, le), qz = v.getFloat32(276, le);
    // nibabel quat2mat: a = sqrt(1 - b² - c² - d²), cắt về 0 khi âm do sai số làm tròn
    const w2 = 1 - (b * b + c * c + d * d), a = w2 < 0 ? 0 : Math.sqrt(w2);
    const R = [
      [a * a + b * b - c * c - d * d, 2 * (b * c - a * d), 2 * (b * d + a * c)],
      [2 * (b * c + a * d), a * a + c * c - b * b - d * d, 2 * (c * d - a * b)],
      [2 * (b * d - a * c), 2 * (c * d + a * b), a * a + d * d - b * b - c * c]];
    const qfac = pix[0] < 0 ? -1 : 1, z = [pix[1], pix[2], pix[3] * qfac];
    return [R[0][0] * z[0], R[0][1] * z[1], R[0][2] * z[2], qx, R[1][0] * z[0], R[1][1] * z[1], R[1][2] * z[2], qy,
            R[2][0] * z[0], R[2][1] * z[1], R[2][2] * z[2], qz, 0, 0, 0, 1];
  }
  const [nx, ny, nz] = dims, [zx, zy, zz] = [pix[1], pix[2], pix[3]];
  return [-zx, 0, 0, (nx - 1) / 2 * zx, 0, zy, 0, -(ny - 1) / 2 * zy, 0, 0, zz, -(nz - 1) / 2 * zz, 0, 0, 0, 1];
}
/* -> { dims [nx, ny, nz], affine, data: Float32Array (x nhanh nhất) } */
async function readNifti(file) {
  const b = await gunzipIfNeeded(new Uint8Array(await file.arrayBuffer()));
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let le = true;
  if (v.getInt32(0, true) !== 348) {
    if (v.getInt32(0, false) === 348) le = false;
    else if (v.getInt32(0, true) === 540 || v.getInt32(0, false) === 540) throw new Error(`${file.name}: NIfTI-2 chưa được hỗ trợ, hãy lưu lại dạng NIfTI-1.`);
    else throw new Error(`${file.name} không phải file NIfTI (.nii / .nii.gz).`);
  }
  const ndim = v.getInt16(40, le), dims = [1, 2, 3].map(i => Math.max(1, v.getInt16(40 + 2 * i, le)));
  if (ndim < 3 || dims.some(d => d < 2)) throw new Error(`${file.name}: cần một khối 3D.`);
  const dt = v.getInt16(70, le), rd = READ[dt];
  if (!rd) throw new Error(`${file.name}: kiểu dữ liệu NIfTI ${dt} chưa được hỗ trợ.`);
  const pix = [0, 1, 2, 3].map(i => v.getFloat32(76 + 4 * i, le));
  const off = Math.round(v.getFloat32(108, le)) || 352;
  let slope = v.getFloat32(112, le), inter = v.getFloat32(116, le);
  if (!slope || !Number.isFinite(slope)) { slope = 1; inter = 0; }       // như nibabel: slope 0 hoặc NaN = không co giãn
  if (!Number.isFinite(inter)) inter = 0;
  const n = dims[0] * dims[1] * dims[2], [sz, get] = rd;
  if (off + n * sz > b.length) throw new Error(`${file.name}: file bị thiếu dữ liệu.`);
  const data = new Float32Array(n);                                       // khối đầu tiên nếu là 4D
  for (let i = 0; i < n; i++) data[i] = get(v, off + i * sz, le) * slope + inter;
  return { name: file.name, dims, affine: bestAffine(v, le, dims, pix), data };
}
/* NIfTI-1 uint8, sform_code 2 (như nibabel khi lưu Nifti1Image(data, affine)) -> .nii.gz */
async function writeNifti(dims, affine, u8, pix = [1, 1, 1]) {
  const hdr = new ArrayBuffer(352), v = new DataView(hdr), le = true;
  v.setInt32(0, 348, le);
  v.setInt16(40, 3, le); dims.forEach((d, i) => v.setInt16(42 + 2 * i, d, le)); v.setInt16(48, 1, le); v.setInt16(50, 1, le); v.setInt16(52, 1, le); v.setInt16(54, 1, le);
  v.setInt16(70, 2, le); v.setInt16(72, 8, le);                           // uint8, 8 bit
  v.setFloat32(76, 1, le); pix.forEach((p, i) => v.setFloat32(80 + 4 * i, p, le));
  v.setFloat32(108, 352, le); v.setFloat32(112, 1, le); v.setFloat32(116, 0, le);
  v.setUint8(123, 10);                                                    // mm, giây
  v.setInt16(252, 0, le); v.setInt16(254, 2, le);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) v.setFloat32(280 + 16 * r + 4 * c, affine[4 * r + c], le);
  [0x6e, 0x2b, 0x31, 0].forEach((c, i) => v.setUint8(344 + i, c));      // "n+1\0"
  const out = new Uint8Array(352 + u8.length); out.set(new Uint8Array(hdr)); out.set(u8, 352);
  return gzip(out);
}
/* nghịch đảo affine 4×4 (phần 3×4) */
function invAffine(A) {
  const [a, b, c, d, e, f, g, h, i] = [A[0], A[1], A[2], A[4], A[5], A[6], A[8], A[9], A[10]];
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  const m = [(e * i - f * h) / det, (c * h - b * i) / det, (b * f - c * e) / det,
             (f * g - d * i) / det, (a * i - c * g) / det, (c * d - a * f) / det,
             (d * h - e * g) / det, (b * g - a * h) / det, (a * e - b * d) / det];
  const t = [A[3], A[7], A[11]];
  return [m[0], m[1], m[2], -(m[0] * t[0] + m[1] * t[1] + m[2] * t[2]),
          m[3], m[4], m[5], -(m[3] * t[0] + m[4] * t[1] + m[5] * t[2]),
          m[6], m[7], m[8], -(m[6] * t[0] + m[7] * t[1] + m[8] * t[2]), 0, 0, 0, 1];
}

/* ---------------- 2. conform (input_format.conform, 1 mm, order = 1) ---------------- */
/* np.round: làm tròn nửa về số chẵn */
const roundEven = x => { const r = Math.round(x); return (Math.abs(x % 1) === 0.5 && r % 2 !== 0) ? r - 1 : r; };
async function conform(img, progress) {
  const [nx, ny, nz] = img.dims, A = img.affine, lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const i of [0, nx - 1]) for (const j of [0, ny - 1]) for (const k of [0, nz - 1])
    for (let r = 0; r < 3; r++) { const w = A[4 * r] * i + A[4 * r + 1] * j + A[4 * r + 2] * k + A[4 * r + 3]; lo[r] = Math.min(lo[r], w); hi[r] = Math.max(hi[r], w); }
  const o = lo.map(roundEven), dims = hi.map((h, r) => roundEven(h) - o[r] + 1);
  const [X, Y, Z] = dims, M = invAffine(A), src = img.data, out = new Float32Array(X * Y * Z), sxy = nx * ny;
  for (let z = 0; z < Z; z++) {
    for (let y = 0; y < Y; y++) {
      const wy = y + o[1], wz = z + o[2];
      for (let x = 0; x < X; x++) {
        const wx = x + o[0];
        const ci = M[0] * wx + M[1] * wy + M[2] * wz + M[3], cj = M[4] * wx + M[5] * wy + M[6] * wz + M[7], ck = M[8] * wx + M[9] * wy + M[10] * wz + M[11];
        // scipy map_coordinates(mode='constant'): ngoài [0, n-1] ở bất kỳ trục nào -> 0
        if (!(ci >= 0 && ci <= nx - 1 && cj >= 0 && cj <= ny - 1 && ck >= 0 && ck <= nz - 1)) continue;
        const i0 = Math.min(Math.floor(ci), nx - 2), j0 = Math.min(Math.floor(cj), ny - 2), k0 = Math.min(Math.floor(ck), nz - 2);
        const fi = ci - i0, fj = cj - j0, fk = ck - k0, p = i0 + nx * j0 + sxy * k0;
        const c00 = src[p] * (1 - fi) + src[p + 1] * fi, c10 = src[p + nx] * (1 - fi) + src[p + nx + 1] * fi;
        const c01 = src[p + sxy] * (1 - fi) + src[p + sxy + 1] * fi, c11 = src[p + sxy + nx] * (1 - fi) + src[p + sxy + nx + 1] * fi;
        out[x + X * (y + Y * z)] = (c00 * (1 - fj) + c10 * fj) * (1 - fk) + (c01 * (1 - fj) + c11 * fj) * fk;
      }
    }
    if (z % 16 === 0) { progress(z / Z); await tick(); }
  }
  return { dims, origin: o, data: out };          // affine = diag(1, 1, 1) + o; chỉ số x + X*(y + Y*z)
}

/* ---------------- 3. đăng ký T2 -> T1 (input_format.model8_translation) ---------------- */
/* percentile kiểu numpy (linear) trên mọi voxel, kể cả số 0 */
function percentiles(data, ps) {
  const s = Float32Array.from(data).sort(), n = s.length;
  return ps.map(p => { const x = p / 100 * (n - 1), i = Math.floor(x), f = x - i; return i + 1 < n ? s[i] + (s[i + 1] - s[i]) * f : s[i]; });
}
function quantize(data, bins = 64) {
  const [lo, hi] = percentiles(data, [0.5, 99.5]).map(f32), den = f32(hi - lo + 1e-8), q = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) {
    let v = data[i]; if (Number.isNaN(v)) v = lo;
    const t = f32(f32(f32(v - lo) / den) * (bins - 1));
    q[i] = t <= 0 ? 0 : t >= bins - 1 ? bins - 1 : Math.trunc(t);
  }
  return q;
}
const ENT = x => (x > 0 ? x * Math.log(x + 1e-12) : 0);
/* NMI = (Ha + Hb) / Hab trên phần chồng lấn khi T2 dời (dz, dy, dx); a = T1, b = T2; mảng (Z, Y, X) */
function nmi(fq, fd, mq, md, d, joint) {
  const r0 = [], m0 = [], L = [];
  for (let a = 0; a < 3; a++) {
    r0[a] = Math.max(0, d[a]); m0[a] = Math.max(0, -d[a]); L[a] = Math.min(fd[a] - r0[a], md[a] - m0[a]);
    if (L[a] <= 0) return -Infinity;
  }
  joint.fill(0);
  const [FZ, FY, FX] = fd, [MZ, MY, MX] = md;
  for (let z = 0; z < L[0]; z++) for (let y = 0; y < L[1]; y++) {
    let pf = (r0[2]) + FX * ((r0[1] + y) + FY * (r0[0] + z)), pm = (m0[2]) + MX * ((m0[1] + y) + MY * (m0[0] + z));
    for (let x = 0; x < L[2]; x++) joint[fq[pf++] * 64 + mq[pm++]]++;
  }
  const ha = new Float64Array(64), hb = new Float64Array(64); let sum = 0;
  for (let i = 0; i < 64; i++) for (let j = 0; j < 64; j++) { const c = joint[i * 64 + j]; ha[i] += c; hb[j] += c; sum += c; }
  const den = sum + 1e-8; let Ha = 0, Hb = 0, Hab = 0;
  for (let i = 0; i < 64; i++) { Ha -= ENT(ha[i] / den); Hb -= ENT(hb[i] / den); }
  for (let i = 0; i < 4096; i++) Hab -= ENT(joint[i] / den);
  return (Ha + Hb) / (Hab + 1e-8);
}
async function register(t1, t2, progress, zWin = 40, refine = 5) {
  const fd = [t1.dims[2], t1.dims[1], t1.dims[0]], md = [t2.dims[2], t2.dims[1], t2.dims[0]];
  const fq = quantize(t1.data), mq = quantize(t2.data), joint = new Float64Array(4096);
  const d0 = [0, 1, 2].map(a => (fd[a] >> 1) - (md[a] >> 1));
  const total = 2 * zWin + 1 + (2 * refine + 1) ** 3; let done = 0;
  let best = -Infinity, bz = d0[0];
  for (let dz = d0[0] - zWin; dz <= d0[0] + zWin; dz++) {
    const s = nmi(fq, fd, mq, md, [dz, d0[1], d0[2]], joint);
    if (s > best) { best = s; bz = dz; }
    if (++done % 4 === 0) { progress(done / total); await tick(); }
  }
  let shift = [bz, d0[1], d0[2]], bestAll = best;
  for (let a = bz - refine; a <= bz + refine; a++) for (let b = d0[1] - refine; b <= d0[1] + refine; b++) {
    for (let c = d0[2] - refine; c <= d0[2] + refine; c++) {
      const s = nmi(fq, fd, mq, md, [a, b, c], joint);
      if (s > bestAll) { bestAll = s; shift = [a, b, c]; }                // chỉ nhận khi lớn hơn hẳn
    }
    done += 2 * refine + 1; progress(done / total); await tick();
  }
  return shift;                                                           // (dz, dy, dx)
}
/* apply_integer_shift_to_ref: T2 voxel i -> T1 voxel i + d, phần thiếu = 0 */
function applyShift(t1, t2, d) {
  const [X, Y, Z] = t1.dims, [MX, MY, MZ] = t2.dims, out = new Float32Array(X * Y * Z), res = { dims: t1.dims, origin: t1.origin, data: out };
  const fd = [Z, Y, X], md = [MZ, MY, MX], r0 = [], m0 = [], L = [];
  for (let a = 0; a < 3; a++) { r0[a] = Math.max(0, d[a]); m0[a] = Math.max(0, -d[a]); L[a] = Math.min(fd[a] - r0[a], md[a] - m0[a]); if (L[a] <= 0) return res; }
  for (let z = 0; z < L[0]; z++) for (let y = 0; y < L[1]; y++) {
    const pf = r0[2] + X * ((r0[1] + y) + Y * (r0[0] + z)), pm = m0[2] + MX * ((m0[1] + y) + MY * (m0[0] + z));
    out.set(t2.data.subarray(pm, pm + L[2]), pf);
  }
  return res;
}

/* ---------------- 4. khung 256 × 256 + chuẩn hoá (pad_crop_xy_like_ref, normalize_volume_to_uint8) ---------------- */
const S256 = 256;
const frameOf = (Y, X) => ({ yo: Math.max((Y - S256) >> 1, 0), xo: Math.max((X - S256) >> 1, 0) });
/* (Z, Y, X) -> (Z, 256, 256): cắt giữa nếu >= 256, đệm 0 hai bên nếu < 256 */
function frame(vol, fr) {
  const [X, Y, Z] = vol.dims, out = new Float32Array(Z * S256 * S256);
  const ya = Y >= S256 ? [fr.yo, 0, S256] : [0, (S256 - Y) >> 1, Y];        // [nguồn từ, đích từ, số hàng]
  const xa = X >= S256 ? [fr.xo, 0, S256] : [0, (S256 - X) >> 1, X];
  for (let z = 0; z < Z; z++) for (let r = 0; r < ya[2]; r++) {
    const ps = xa[0] + X * (ya[0] + r + Y * z), pd = xa[1] + S256 * (ya[1] + r + S256 * z);
    out.set(vol.data.subarray(ps, ps + xa[2]), pd);
  }
  return out;
}
function toU8(x) {
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < x.length; i++) { const v = x[i]; if (v < lo) lo = v; if (v > hi) hi = v; }
  const out = new Uint8Array(x.length); if (!(hi > lo)) return out;
  const den = f32(hi - lo);
  for (let i = 0; i < x.length; i++) {
    let t = f32(f32(x[i] - lo) / den); t = t < 0 ? 0 : t > 1 ? 1 : t;
    out[i] = Math.trunc(f32(f32(t * 255) + 0.5));
  }
  return out;
}
/* unframe: (Z, 256, 256) -> (Z, Y, X) trên lưới 1 mm của T1; phần đã bị cắt = 0 */
function unframe(m, dims, fr) {
  const [X, Y, Z] = dims, out = new Uint8Array(X * Y * Z);
  const ya = Y >= S256 ? [0, fr.yo, S256] : [(S256 - Y) >> 1, 0, Y];        // [khung từ, lưới từ, số hàng]
  const xa = X >= S256 ? [0, fr.xo, S256] : [(S256 - X) >> 1, 0, X];
  for (let z = 0; z < Z; z++) for (let r = 0; r < ya[2]; r++) {
    const ps = xa[0] + S256 * (ya[0] + r + S256 * z), pd = xa[1] + X * (ya[1] + r + Y * z);
    out.set(m.subarray(ps, ps + xa[2]), pd);
  }
  return out;
}

/* ---------------- 5. mạng ---------------- */
let session = null, backend = '';
/* File lớn có hai dạng: nguyên file (dùng trên máy), hoặc các phần nhỏ <= 20 MB trong thư mục khác
   (tools/split_large_files.py; cho nơi giới hạn dung lượng mỗi file). Tìm nguyên file trước, không có thì ghép các phần. */
async function readBody(res, onBytes) {
  const rd = res.body.getReader(), parts = []; let got = 0;
  for (;;) { const { done, value } = await rd.read(); if (done) break; parts.push(value); got += value.length; onBytes(value.length); }
  const buf = new Uint8Array(got); let o = 0; parts.forEach(p => { buf.set(p, o); o += p.length; });
  return buf;
}
const exists = url => fetch(url, { method: 'HEAD' }).then(r => r.ok, () => false);
async function fetchBig(src, progress) {
  const whole = await fetch(src.file).catch(() => null);
  if (whole && whole.ok) {
    const total = +whole.headers.get('content-length') || 0; let got = 0;
    return readBody(whole, k => { got += k; if (total) progress(got / total); });
  }
  const mres = await fetch(src.split).catch(() => null);
  if (!mres || !mres.ok) throw new Error(`Không tìm thấy ${src.file} hay các phần của nó (${src.split}). Xem README-head-seg.md.`);
  const man = await mres.json(), base = new URL(src.split, location.href), out = new Uint8Array(man.size);
  let got = 0, off = 0;
  const offs = man.parts.map(p => { const o = off; off += p.size; return o; });
  await Promise.all(man.parts.map(async (p, i) => {
    const r = await fetch(new URL(p.file, base));
    if (!r.ok) throw new Error(`Thiếu phần ${p.file} (HTTP ${r.status}).`);
    const b = await readBody(r, k => { got += k; progress(got / man.size); });
    if (b.length !== p.size) throw new Error(`Phần ${p.file} có ${b.length} byte, cần ${p.size}.`);
    out.set(b, offs[i]);
  }));
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', out))].map(x => x.toString(16).padStart(2, '0')).join('');
  if (hash !== man.sha256) throw new Error(`Ghép các phần của ${man.name} không khớp (SHA-256 sai). Hãy chạy lại tools/split_large_files.py.`);
  return out;
}
/* nạp onnxruntime-web (ort.webgpu.min.js) từ thư mục đầu tiên trong cfg.ort có nó; trả về thư mục đó
   (file .mjs đi kèm phải nằm cùng thư mục). Thư mục -split có sẵn bản sao các file nhỏ này. */
let ortDir = null;
async function loadOrt() {
  if (ortDir) return ortDir;
  for (const dir of S.cfg.ort) {
    const ok = await new Promise(res => {
      const s = document.createElement('script');
      s.src = dir + 'ort.webgpu.min.js'; s.onload = () => res(true); s.onerror = () => { s.remove(); res(false); };
      document.head.appendChild(s);
    });
    if (ok && window.ort) return (ortDir = dir);
  }
  throw new Error(`Không tìm thấy onnxruntime-web (ort.webgpu.min.js) trong ${S.cfg.ort.join(' hay ')}.`);
}
async function loadModel(progress) {
  if (session) return session;
  const dir = await loadOrt();
  ort.env.wasm.wasmPaths = new URL(dir, location.href).href;            // phải là URL đầy đủ (import động)
  ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(8, navigator.hardwareConcurrency || 4) : 1;
  // bộ chạy WebAssembly: nguyên file trong thư mục onnxruntime-web; không có thì ghép các phần và giao thẳng cho onnxruntime
  const W = { file: dir + S.cfg.ortWasm.name, split: S.cfg.ortWasm.split };
  if (!(await exists(W.file))) ort.env.wasm.wasmBinary = (await fetchBig(W, f => progress(0.2 * f))).buffer;
  const buf = await fetchBig(S.cfg.model, f => progress(0.2 + 0.8 * f));
  // GPU (WebGPU) nếu có; không thì CPU (WebAssembly) chạy trong worker riêng (proxy) để trang không bị đứng
  let gpu = false;
  if ('gpu' in navigator) { try { gpu = !!(await navigator.gpu.requestAdapter()); } catch (e) { gpu = false; } }
  ort.env.wasm.proxy = !gpu;
  for (const ep of gpu ? ['webgpu', 'wasm'] : ['wasm']) {
    try { session = await ort.InferenceSession.create(buf, { executionProviders: [ep] }); backend = ep; break; }
    catch (e) { console.warn('Không dùng được ' + ep, e); }
  }
  if (!session) throw new Error('Trình duyệt không chạy được mô hình (cần WebAssembly).');
  return session;
}
async function infer(t1u8, t2u8, Z, progress) {
  const n2 = S256 * S256, out = new Uint8Array(Z * n2), B = backend === 'webgpu' ? 8 : 2;
  for (let z0 = 0; z0 < Z; z0 += B) {
    const n = Math.min(B, Z - z0), a = new Float32Array(n * n2), b = new Float32Array(n * n2);
    for (let i = 0; i < n * n2; i++) { a[i] = f32(t1u8[z0 * n2 + i] / 255); b[i] = f32(t2u8[z0 * n2 + i] / 255); }
    const r = await session.run({ t1: new ort.Tensor('float32', a, [n, 1, S256, S256]), t2: new ort.Tensor('float32', b, [n, 1, S256, S256]) });
    out.set(r.label.data, z0 * n2);
    progress((z0 + n) / Z);
  }
  return out;
}

/* ---------------- 6. đầu ra ---------------- */
/* nhãn 1 mm -> lưới gốc của T1 (resample_from_to, order = 0) */
function toNative(seg, g, img) {
  const [nx, ny, nz] = img.dims, A = img.affine, [X, Y, Z] = g.dims, o = g.origin, out = new Uint8Array(nx * ny * nz);
  let p = 0;
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++, p++) {
    const cx = A[0] * i + A[1] * j + A[2] * k + A[3] - o[0], cy = A[4] * i + A[5] * j + A[6] * k + A[7] - o[1], cz = A[8] * i + A[9] * j + A[10] * k + A[11] - o[2];
    if (!(cx >= 0 && cx <= X - 1 && cy >= 0 && cy <= Y - 1 && cz >= 0 && cz <= Z - 1)) continue;
    out[p] = seg[Math.floor(cx + 0.5) + X * (Math.floor(cy + 0.5) + Y * Math.floor(cz + 0.5))];
  }
  return out;
}
const affine1mm = o => [1, 0, 0, o[0], 0, 1, 0, o[1], 0, 0, 1, o[2], 0, 0, 0, 1];

/* ---------------- 7. giao diện ---------------- */
const S = { cfg: null, T: null, files: { t1: null, t2: null }, urls: [] };
/* tiến trình: một hàng ô ngang, mỗi bước một ô; ô đang chạy tô dần theo phần trăm (--p) */
const STEPS = [['read', 'Đọc'], ['conform', '1 mm'], ['reg', 'Đăng ký'], ['model', 'Mô hình'], ['infer', 'Phân vùng'], ['out', 'Lưu']];
function stepsHtml() {
  return STEPS.map(([k, t]) => `<li id="st-${k}"><span>${t}</span><span class="hs-p" id="sp-${k}"></span></li>`).join('');
}
function step(k, frac, note) {
  const li = $('st-' + k); if (!li) return;
  const i = STEPS.findIndex(s => s[0] === k);
  STEPS.forEach(([q], j) => { const e = $('st-' + q); e.classList.toggle('done', j < i); e.classList.toggle('now', j === i); if (j < i) $('sp-' + q).textContent = ''; });
  li.style.setProperty('--p', frac != null ? frac : 0);
  $('sp-' + k).textContent = note != null ? note : frac != null ? Math.round(frac * 100) + '%' : '';
}
function setFile(m, f) {
  S.files[m] = f || null;
  $('hs-name-' + m).textContent = f ? `${f.name} (${(f.size / 1e6).toFixed(1).replace('.', ',')} MB)` : 'Chưa chọn file';
  $('hs-drop-' + m).classList.toggle('has', !!f);
  $('hsRun').disabled = !(S.files.t1 && S.files.t2);
}
function bindDrop(m) {
  const box = $('hs-drop-' + m), inp = $('hs-file-' + m);
  inp.addEventListener('change', () => setFile(m, inp.files[0]));
  box.addEventListener('dragover', e => { e.preventDefault(); box.classList.add('over'); });
  box.addEventListener('dragleave', () => box.classList.remove('over'));
  box.addEventListener('drop', e => { e.preventDefault(); box.classList.remove('over'); if (e.dataTransfer.files[0]) setFile(m, e.dataTransfer.files[0]); });
}
function fail(err) {
  console.error(err);
  $('hsMsg').hidden = false; $('hsMsg').className = 'hs-msg err'; $('hsMsg').innerHTML = esc(err.message || err);
  $('hsRun').disabled = !(S.files.t1 && S.files.t2);
}
const baseName = n => n.replace(/\.nii(\.gz)?$/i, '').replace(/[^\w.-]+/g, '_');
async function run() {
  $('hsRun').disabled = true; $('hsMsg').hidden = true;
  $('hsSteps').innerHTML = stepsHtml(); $('hsProg').hidden = false; $('hsOut').hidden = true;
  const t0 = performance.now();
  try {
    step('read');
    const [r1, r2] = await Promise.all([readNifti(S.files.t1), readNifti(S.files.t2)]);
    step('conform', 0);
    const c1 = await conform(r1, f => step('conform', f / 2)), c2 = await conform(r2, f => step('conform', 0.5 + f / 2));
    step('reg', 0);
    const d = await register(c1, c2, f => step('reg', f));
    const c2r = applyShift(c1, c2, d);
    const [X, Y, Z] = c1.dims, fr = frameOf(Y, X);
    const u1 = toU8(frame(c1, fr)), u2 = toU8(frame(c2r, fr));
    step('model', 0);
    await loadModel(f => step('model', f));
    step('infer', 0);
    const lab = await infer(u1, u2, Z, f => step('infer', f));
    step('out');
    await tick();
    const seg = unframe(lab, c1.dims, fr), t1v = unframe(u1, c1.dims, fr), t2v = unframe(u2, c1.dims, fr);
    const native = toNative(seg, c1, r1);
    const A1 = affine1mm(c1.origin), base = baseName(S.files.t1.name);
    const counts = new Array(16).fill(0); for (let i = 0; i < seg.length; i++) counts[seg[i]]++;
    const nat = new Array(16).fill(0); for (let i = 0; i < native.length; i++) nat[native[i]]++;
    const vox = Math.abs(r1.affine[0] * (r1.affine[5] * r1.affine[10] - r1.affine[6] * r1.affine[9]) - r1.affine[1] * (r1.affine[4] * r1.affine[10] - r1.affine[6] * r1.affine[8]) + r1.affine[2] * (r1.affine[4] * r1.affine[9] - r1.affine[5] * r1.affine[8]));
    const csv = ['tissue_id,tissue_name_en,voxels_1mm,volume_ml_1mm,voxels_native,volume_ml_native',
      ...Object.keys(S.T.tissues).map(Number).sort((a, b) => a - b).map(l => [l, `"${S.T.tissues[l].en}"`, counts[l], (counts[l] / 1000).toFixed(2), nat[l], (nat[l] * vox / 1000).toFixed(2)].join(','))].join('\n') + '\n';
    const zooms = [0, 1, 2].map(c => Math.hypot(r1.affine[c], r1.affine[4 + c], r1.affine[8 + c]));
    const files = [
      // [tên ngắn hiện trên trang, đuôi tên file (file tải về = <tên T1>_<đuôi>), nội dung, chú thích khi rê chuột]
      ['seg', 'seg.nii.gz', await writeNifti(r1.dims, r1.affine, native, zooms), 'Phân vùng mô, lưới gốc của T1'],
      ['seg 1 mm', 'seg_1mm.nii.gz', await writeNifti(c1.dims, A1, seg), 'Phân vùng mô, lưới 1 mm'],
      ['T1 1 mm', 'T1_1mm.nii.gz', await writeNifti(c1.dims, A1, t1v), 'T1 đầu vào mô hình (1 mm, 0–255)'],
      ['T2 1 mm', 'T2_1mm_registered.nii.gz', await writeNifti(c1.dims, A1, t2v), 'T2 đã đăng ký vào T1 (1 mm, 0–255)'],
      ['thể tích .csv', 'tissue_volumes.csv', new TextEncoder().encode(csv), 'Thể tích từng mô (mL)'],
    ];
    S.urls.forEach(u => URL.revokeObjectURL(u)); S.urls = [];
    const size = n => n < 1e5 ? Math.max(1, Math.round(n / 1e3)) + ' KB' : (n / 1e6).toFixed(1).replace('.', ',') + ' MB';
    $('hsLinks').innerHTML = files.map(([lab, suf, b, t]) => {
      const n = `${base}_${suf}`, u = URL.createObjectURL(new Blob([b], { type: n.endsWith('.csv') ? 'text/csv' : 'application/gzip' })); S.urls.push(u);
      return `<li><a href="${u}" download="${esc(n)}" title="${esc(t)}: ${esc(n)}">${esc(lab)}</a><span>${size(b.length)}</span></li>`;
    }).join('');
    const secs = Math.round((performance.now() - t0) / 1000);
    $('hsSummary').textContent = `Xong trong ${secs} giây (${backend === 'webgpu' ? 'GPU' : 'CPU'}). T2 dời (${d.join(', ')}) voxel. Tải về:`;
    STEPS.forEach(([q]) => { const e = $('st-' + q); e.classList.add('done'); e.classList.remove('now'); });
    $('hsOut').hidden = false; $('hsViewerWrap').hidden = false;
    window.HEADSEG_LAST = { shift: d, dims: c1.dims, origin: c1.origin, counts, files: files.map(f => `${base}_${f[1]}`) };   // để kiểm tra tự động
    // khung hiển thị: phân vị trong đầu, như tools/prepare_head_mri.py
    const win = v => { const h = new Uint32Array(256); for (let i = 0; i < v.length; i++) if (seg[i] && v[i]) h[v[i]]++;
      const n = h.reduce((a, b) => a + b, 0), q = p => { let c = 0; for (let k = 0; k < 256; k++) { c += h[k]; if (c >= p * n) return k; } return 255; };
      return [q(0.005), Math.max(q(0.995), q(0.005) + 1)]; };
    const meta = { dims: c1.dims, origin_mm: c1.origin, window: { t1: win(t1v), t2: win(t2v) },
      tissues: Object.fromEntries(Object.keys(S.T.tissues).map(l => [l, { voxels: counts[+l] }])) };
    HEADMRI.show(Object.assign({ mods: ['t1', 't2', 'seg'], organ: 'head-seg', compact: true }, S.cfg.viewer), { meta, T: S.T, vol: { t1: t1v, t2: t2v, seg } });
    $('hsViewerWrap').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) { fail(err); }
  $('hsRun').disabled = !(S.files.t1 && S.files.t2);
}
async function start(cfg) {
  S.cfg = cfg;
  if (location.protocol === 'file:') { fail(new Error('Trang cần mở qua server tĩnh (python -m http.server trong thư mục my-library), không mở trực tiếp từ ổ đĩa.')); return; }
  if (!('DecompressionStream' in window) || !('CompressionStream' in window)) { fail(new Error('Trình duyệt quá cũ: thiếu CompressionStream. Hãy dùng Chrome, Edge hoặc Firefox bản mới.')); return; }
  bindDrop('t1'); bindDrop('t2');
  $('hsRun').addEventListener('click', run);
  try { S.T = await fetch(cfg.tissues).then(r => r.json()); } catch (e) { fail(new Error('Không tải được ' + cfg.tissues)); }
}
return { start };
})();
