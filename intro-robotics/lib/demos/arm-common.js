/* =====================================================================
   Robotics: tiện ích vẽ cánh tay phẳng nhiều khâu (dùng chung cho arm-fk, arm-ik, ik-gradient).
   Nạp qua def.deps = ['arm-common']. Đơn vị thế giới: mét; gốc tọa độ ở khớp đầu tiên; y hướng lên.
   ===================================================================== */
(() => {
const { COLORS: C } = TFG;
/* Động học thuận: trả về mảng điểm [gốc, khớp 2, …, đầu tay] */
function fk(th, L) {
  const pts = [[0, 0]]; let a = 0, x = 0, y = 0;
  for (let i = 0; i < L.length; i++) { a += th[i]; x += L[i] * Math.cos(a); y += L[i] * Math.sin(a); pts.push([x, y]); }
  return pts;
}
/* Hệ tọa độ màn hình: R = bán kính thế giới cần thấy; cy = vị trí gốc theo chiều dọc (0..1) */
function view(W, H, R, cy = 0.5) {
  const s = Math.min(W / (2 * R), H / (2 * R)) * 0.94, ox = W / 2, oy = H * cy;
  return { s, ox, oy, X: x => ox + x * s, Y: y => oy - y * s, inv: (px, py) => [(px - ox) / s, (oy - py) / s] };
}
function grid(ctx, v, W, H, step = 0.5) {
  ctx.save(); ctx.lineWidth = 1; ctx.strokeStyle = C.line;
  const [x0, y1] = v.inv(0, 0), [x1, y0] = v.inv(W, H);
  ctx.beginPath();
  for (let x = Math.ceil(x0 / step) * step; x <= x1; x += step) { ctx.moveTo(v.X(x), 0); ctx.lineTo(v.X(x), H); }
  for (let y = Math.ceil(y0 / step) * step; y <= y1; y += step) { ctx.moveTo(0, v.Y(y)); ctx.lineTo(W, v.Y(y)); }
  ctx.stroke();
  ctx.strokeStyle = '#9DA4AD'; ctx.lineWidth = 1.4; ctx.beginPath();
  ctx.moveTo(0, v.Y(0)); ctx.lineTo(W, v.Y(0)); ctx.moveTo(v.X(0), 0); ctx.lineTo(v.X(0), H); ctx.stroke();
  ctx.fillStyle = C.muted; ctx.font = '11.5px "Be Vietnam Pro", sans-serif'; ctx.textAlign = 'left';
  ctx.fillText('x (m)', W - 40, v.Y(0) - 6); ctx.fillText('y (m)', v.X(0) + 6, 14);
  ctx.restore();
}
/* Vẽ cánh tay. opt: { ghost (bool), colors (mảng màu khâu), width } */
function draw(ctx, v, pts, opt = {}) {
  ctx.save();
  const cols = opt.colors || [C.sea, C.sky, C.sea, C.sky];
  if (opt.ghost) { ctx.globalAlpha = 0.35; ctx.setLineDash([6, 5]); }
  ctx.lineCap = 'round';
  for (let i = 0; i + 1 < pts.length; i++) {
    const w = (opt.width || 14) - i * 2.5;
    if (!opt.ghost) { ctx.strokeStyle = C.ink; ctx.lineWidth = w + 3; ctx.beginPath(); ctx.moveTo(v.X(pts[i][0]), v.Y(pts[i][1])); ctx.lineTo(v.X(pts[i + 1][0]), v.Y(pts[i + 1][1])); ctx.stroke(); }
    ctx.strokeStyle = cols[i % cols.length]; ctx.lineWidth = opt.ghost ? 3 : w;
    ctx.beginPath(); ctx.moveTo(v.X(pts[i][0]), v.Y(pts[i][1])); ctx.lineTo(v.X(pts[i + 1][0]), v.Y(pts[i + 1][1])); ctx.stroke();
  }
  ctx.setLineDash([]);
  if (!opt.ghost) {
    // đế
    ctx.fillStyle = C.muted; ctx.strokeStyle = C.ink; ctx.lineWidth = 2;
    ctx.fillRect(v.X(0) - 18, v.Y(0) - 8, 36, 16); ctx.strokeRect(v.X(0) - 18, v.Y(0) - 8, 36, 16);
    for (let i = 0; i < pts.length - 1; i++) { ctx.fillStyle = C.gold; ctx.beginPath(); ctx.arc(v.X(pts[i][0]), v.Y(pts[i][1]), 7.5, 0, 7); ctx.fill(); ctx.stroke(); }
    const e = pts[pts.length - 1]; ctx.fillStyle = C.ink; ctx.beginPath(); ctx.arc(v.X(e[0]), v.Y(e[1]), 6, 0, 7); ctx.fill();
  }
  ctx.restore();
}
function target(ctx, v, p, color = C.pos) {
  const x = v.X(p[0]), y = v.Y(p[1]);
  ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(x, y, 11, 0, 7); ctx.moveTo(x - 16, y); ctx.lineTo(x + 16, y); ctx.moveTo(x, y - 16); ctx.lineTo(x, y + 16); ctx.stroke();
  ctx.restore();
}
const deg = r => r * 180 / Math.PI, rad = d => d * Math.PI / 180;
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
TFG.ARM = { fk, view, grid, draw, target, deg, rad, wrap };
})();
