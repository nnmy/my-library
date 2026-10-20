/* =====================================================================
   AI: ảnh pixel dùng chung cho các minh họa (không phải demo riêng).
   Mỗi hình được vẽ bằng hàm hình học trên hệ tọa độ 0..1, nên dựng được ở mọi độ phân giải.
     TFG.SPR.render(name, N)  -> { N, data: Float32Array(N*N*3) giá trị 0..1 }
     TFG.SPR.scene(N)         -> { N, data, masks: { ten: Float32Array(N*N) } } (cảnh có nhiều vật)
     TFG.SPR.draw(ctx, img, x, y, size)  vẽ ảnh lên canvas, pixel sắc nét
     TFG.SPR.LIST             -> [{ id, name }]
   EDIT: thêm hình mới vào SHAPES (hàm (x, y) -> [r,g,b] hoặc null = nền).
   ===================================================================== */
(() => {
const hex = h => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
const P = { ink: hex('#1B1920'), white: hex('#FFFFFF'), sky: hex('#BFE6F4'), sea: hex('#3787c4'), deep: hex('#245F8F'), orange: hex('#E88C28'),
  cream: hex('#F4E2C4'), red: hex('#D8312A'), brown: hex('#8A5A34'), green: hex('#3F9D6A'), leaf: hex('#6CC48A'), yellow: hex('#F2C230'),
  pink: hex('#F2A0A8'), gray: hex('#9DA4AD'), dark: hex('#59606B'), grass: hex('#8CCB6B'), wall: hex('#F1E3C8') };
const inEll = (x, y, cx, cy, rx, ry) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
const inRect = (x, y, x0, y0, x1, y1) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
const inTri = (x, y, ax, ay, bx, by, cx, cy) => {
  const s = (px, py, qx, qy, rx, ry) => (px - rx) * (qy - ry) - (qx - rx) * (py - ry);
  const d1 = s(x, y, ax, ay, bx, by), d2 = s(x, y, bx, by, cx, cy), d3 = s(x, y, cx, cy, ax, ay);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
};

const SHAPES = {
  meo: { name: 'mèo', bg: P.sky, f(x, y) {
    if (inEll(x, y, 0.38, 0.6, 0.035, 0.05) || inEll(x, y, 0.62, 0.6, 0.035, 0.05)) return P.ink;
    if (inTri(x, y, 0.47, 0.68, 0.53, 0.68, 0.5, 0.73)) return P.pink;
    if (inEll(x, y, 0.5, 0.64, 0.32, 0.26)) return P.orange;
    if (inTri(x, y, 0.2, 0.52, 0.22, 0.16, 0.42, 0.42) || inTri(x, y, 0.8, 0.52, 0.78, 0.16, 0.58, 0.42)) return P.orange;
    return null; } },
  cho: { name: 'chó', bg: P.sky, f(x, y) {
    if (inEll(x, y, 0.4, 0.5, 0.035, 0.05) || inEll(x, y, 0.6, 0.5, 0.035, 0.05)) return P.ink;
    if (inEll(x, y, 0.5, 0.66, 0.07, 0.05)) return P.ink;
    if (inEll(x, y, 0.5, 0.7, 0.16, 0.12)) return P.cream;
    if (inEll(x, y, 0.2, 0.52, 0.1, 0.22) || inEll(x, y, 0.8, 0.52, 0.1, 0.22)) return P.brown;
    if (inEll(x, y, 0.5, 0.55, 0.27, 0.3)) return hex('#C98A55');
    return null; } },
  ca: { name: 'cá', bg: hex('#9FD3EC'), f(x, y) {
    if (inEll(x, y, 0.36, 0.46, 0.03, 0.04)) return P.ink;
    if (inEll(x, y, 0.45, 0.5, 0.3, 0.2)) return inRect(x, y, 0.5, 0, 0.56, 1) ? P.white : P.yellow;
    if (inTri(x, y, 0.68, 0.5, 0.92, 0.28, 0.92, 0.72)) return P.orange;
    return null; } },
  nha: { name: 'nhà', bg: P.sky, f(x, y) {
    if (inRect(x, y, 0.44, 0.66, 0.58, 0.9)) return P.brown;
    if (inRect(x, y, 0.26, 0.6, 0.38, 0.72)) return P.sea;
    if (inRect(x, y, 0.2, 0.5, 0.8, 0.9)) return P.wall;
    if (inTri(x, y, 0.1, 0.52, 0.9, 0.52, 0.5, 0.14)) return P.red;
    if (y > 0.9) return P.grass;
    return null; } },
  cay: { name: 'cây', bg: P.sky, f(x, y) {
    if (inRect(x, y, 0.44, 0.58, 0.56, 0.92)) return P.brown;
    if (inEll(x, y, 0.5, 0.4, 0.32, 0.3)) return inEll(x, y, 0.4, 0.32, 0.1, 0.08) ? P.leaf : P.green;
    if (y > 0.9) return P.grass;
    return null; } },
  xe: { name: 'xe', bg: P.sky, f(x, y) {
    if (inEll(x, y, 0.3, 0.72, 0.1, 0.1) || inEll(x, y, 0.72, 0.72, 0.1, 0.1)) return inEll(x, y, 0.3, 0.72, 0.04, 0.04) || inEll(x, y, 0.72, 0.72, 0.04, 0.04) ? P.gray : P.ink;
    if (inRect(x, y, 0.34, 0.38, 0.48, 0.5) || inRect(x, y, 0.52, 0.38, 0.66, 0.5)) return hex('#DCEFF8');
    if (inRect(x, y, 0.1, 0.52, 0.9, 0.72) || inRect(x, y, 0.28, 0.32, 0.72, 0.54)) return P.red;
    if (y > 0.82) return P.gray;
    return null; } },
  troi: { name: 'mặt trời', bg: hex('#9FD3EC'), f(x, y) {
    if (inEll(x, y, 0.5, 0.5, 0.22, 0.22)) return P.yellow;
    const a = Math.atan2(y - 0.5, x - 0.5), r = Math.hypot(x - 0.5, y - 0.5);
    if (r > 0.28 && r < 0.42 && Math.abs(((a / (Math.PI / 4)) % 1 + 1) % 1 - 0.5) > 0.38) return P.orange;
    return null; } },
};

function render(name, N = 16) {
  const s = SHAPES[name], data = new Float32Array(N * N * 3);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const c = s.f((i + 0.5) / N, (j + 0.5) / N) || s.bg, k = (j * N + i) * 3;
    data[k] = c[0]; data[k + 1] = c[1]; data[k + 2] = c[2];
  }
  return { N, data };
}

/* Cảnh: bầu trời, mặt trời, cỏ, ngôi nhà, cái cây, con mèo. masks dùng cho minh họa cross-attention. */
const SCENE = [
  { id: 'troi', name: 'mặt trời', box: [0.66, 0.04, 0.96, 0.34] },
  { id: 'nha', name: 'ngôi nhà', box: [0.04, 0.3, 0.44, 0.78] },
  { id: 'cay', name: 'cái cây', box: [0.56, 0.36, 0.9, 0.8] },
  { id: 'meo', name: 'con mèo', box: [0.36, 0.64, 0.62, 0.92] },
];
function scene(N = 64) {
  const data = new Float32Array(N * N * 3), masks = { troi: new Float32Array(N * N), nha: new Float32Array(N * N), cay: new Float32Array(N * N), meo: new Float32Array(N * N), bau: new Float32Array(N * N), co: new Float32Array(N * N) };
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = (i + 0.5) / N, y = (j + 0.5) / N, k = j * N + i;
    let c = y > 0.74 ? P.grass : [0.62 + 0.25 * y, 0.84 + 0.1 * y, 0.95], who = y > 0.74 ? 'co' : 'bau';
    for (let o = SCENE.length - 1; o >= 0; o--) {
      const ob = SCENE[o], [x0, y0, x1, y1] = ob.box;
      if (x < x0 || x > x1 || y < y0 || y > y1) continue;
      const cc = SHAPES[ob.id].f((x - x0) / (x1 - x0), (y - y0) / (y1 - y0));
      if (cc && !(ob.id !== 'meo' && cc === P.grass)) { c = cc; who = ob.id; break; }
    }
    masks[who][k] = 1;
    data[k * 3] = c[0]; data[k * 3 + 1] = c[1]; data[k * 3 + 2] = c[2];
  }
  return { N, data, masks };
}

function draw(ctx, img, x, y, size) {
  const { N, data } = img, cell = size / N;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = (j * N + i) * 3, f = v => Math.round(Math.max(0, Math.min(1, v)) * 255);
    ctx.fillStyle = `rgb(${f(data[k])},${f(data[k + 1])},${f(data[k + 2])})`;
    const x0 = Math.floor(x + i * cell), y0 = Math.floor(y + j * cell);
    ctx.fillRect(x0, y0, Math.floor(x + (i + 1) * cell) - x0, Math.floor(y + (j + 1) * cell) - y0);
  }
}

TFG.SPR = { render, scene, draw, SCENE, LIST: Object.entries(SHAPES).map(([id, s]) => ({ id, name: s.name })) };
})();
