/* =====================================================================
   Robotics: minh họa "Tìm đường trên lưới" (id: astar-grid, trang 4-tim-duong.html)
   Lưới 32 × 20, đi 4 hướng, mỗi bước tốn 1. Ba thuật toán:
     - Loang đều (BFS): xét ô theo thứ tự cách điểm đầu gần tới xa. Luôn ra đường ngắn nhất.
     - Tham lam (greedy best-first): luôn xét ô có h nhỏ nhất (gần đích nhất theo đường chim bay kiểu ô bàn cờ).
       Nhanh nhưng không bảo đảm ngắn nhất.
     - A*: xét ô có f = g + h nhỏ nhất (g: đã đi, h: khoảng cách Manhattan tới đích). Ngắn nhất và ít ô hơn BFS.
   Kéo ô xanh (đầu) / ô đỏ (đích); bấm-kéo chỗ khác để vẽ hoặc xóa tường. Kết quả cập nhật liền; "Chạy hoạt hình" để coi từng bước.
   Chạy độc lập: lib/demos/run.html?demo=astar-grid
   ===================================================================== */
(() => {
const { COLORS: C, watchCanvas, setTxt, num, range, pressGroup, loopWhenVisible, xy } = TFG;
const NX = 32, NY = 20;
const ALGOS = { bfs: 'Loang đều (BFS)', greedy: 'Tham lam', astar: 'A*' };

function search(walls, S, G, algo) {
  const id = (x, y) => y * NX + x, h = (x, y) => Math.abs(x - G[0]) + Math.abs(y - G[1]);
  const g = new Map([[id(...S), 0]]), prev = new Map(), closed = new Set(), order = [];
  let open = [[...S]];
  while (open.length) {
    let bi = 0;
    if (algo !== 'bfs') {
      for (let i = 1; i < open.length; i++) {
        const [ax, ay] = open[i], [bx, by] = open[bi];
        const fa = (algo === 'astar' ? g.get(id(ax, ay)) : 0) + h(ax, ay), fb = (algo === 'astar' ? g.get(id(bx, by)) : 0) + h(bx, by);
        if (fa < fb || (fa === fb && h(ax, ay) < h(bx, by))) bi = i;
      }
    }
    const [cx, cy] = open.splice(bi, 1)[0], ci = id(cx, cy);
    if (closed.has(ci)) continue;
    closed.add(ci); order.push([cx, cy]);
    if (cx === G[0] && cy === G[1]) break;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy, ni = id(nx, ny);
      if (nx < 0 || ny < 0 || nx >= NX || ny >= NY || walls[ni] || closed.has(ni)) continue;
      const ng = g.get(ci) + 1;
      if (!g.has(ni) || ng < g.get(ni)) { g.set(ni, ng); prev.set(ni, ci); open.push([nx, ny]); }
    }
  }
  const path = []; let k = id(...G);
  if (closed.has(k)) { while (k !== undefined) { path.push([k % NX, Math.floor(k / NX)]); k = prev.get(k); } path.reverse(); }
  return { order, path, open };
}

TFG.demo('astar-grid', {
  html: `<div class="demo-title"><h4>Tìm đường trên lưới</h4><span>Vẽ tường, kéo điểm đầu và đích, so ba cách tìm</span></div>
    <div class="demo-body">
      <div class="stagebox"><canvas id="agCv" role="img" aria-label="Lưới ô vuông có tường đen; ô xanh lá là điểm đầu, ô đỏ là đích; các ô tô xanh nhạt là ô thuật toán đã xét; đường vàng là đường đi tìm được."></canvas>
        <span class="hint">Kéo ô đầu / ô đích; bấm-kéo chỗ khác để vẽ tường</span></div>
      <div class="panel">
        <div class="btnrow" id="agAlg" role="group" aria-label="Thuật toán"></div>
        <div class="btnrow">
          <button class="btn" type="button" id="agAnim">Chạy hoạt hình</button>
          <button class="btn" type="button" id="agU">Bức tường chữ U</button>
          <button class="btn" type="button" id="agMaze">Lối đi ngẫu nhiên</button>
          <button class="btn" type="button" id="agClear">Xóa hết tường</button>
        </div>
        <div class="ctrl"><label for="agSp">Tốc độ hoạt hình</label><output for="agSp"></output>
          <input type="range" id="agSp" min="1" max="20" step="1" value="4"></div>
        <dl class="readout">
          <dt>Số ô đã xét</dt><dd id="agN" class="big">—</dd>
          <dt>Độ dài đường đi</dt><dd id="agL">—</dd>
          <dt>Ngắn nhất có thể</dt><dd id="agOpt">—</dd>
        </dl>
        <p class="note-s">Ô xanh nhạt: đã xét (càng đậm càng xét sớm). Ô vàng nhạt: đang chờ xét. Đổi qua lại ba nút thuật toán với cùng một bản đồ, coi số ô đã xét và độ dài đường thay đổi ra sao.</p>
      </div>
    </div>`,
  init(el) {
    const cv = document.getElementById('agCv'), st = {};
    let walls = new Uint8Array(NX * NY), S = [3, 10], G = [28, 10], algo = 'astar', res = null, best = null, shown = Infinity, anim = false, acc = 0, box = null;
    const sp = range('agSp', { show: v => v + ' ô/khung' });
    const setU = () => { walls.fill(0); for (let y = 4; y <= 15; y++) walls[y * NX + 20] = 1; for (let x = 13; x <= 20; x++) { walls[4 * NX + x] = 1; walls[15 * NX + x] = 1; } };
    const setMaze = () => { walls.fill(0); const r = TFG.rng(Math.floor(Math.random() * 1e6)); for (let i = 0; i < NX * NY; i++) walls[i] = r() < 0.28 ? 1 : 0; walls[S[1] * NX + S[0]] = 0; walls[G[1] * NX + G[0]] = 0; };
    setU();
    const btns = Object.entries(ALGOS).map(([k, name]) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn'; b.textContent = name;
      b.onclick = () => { algo = k; pressGroup(btns, b); recompute(true); }; document.getElementById('agAlg').appendChild(b); return [k, b]; }).map(x => x[1]);
    pressGroup(btns, btns[2]);
    document.getElementById('agAnim').onclick = () => { shown = 0; anim = true; };
    document.getElementById('agU').onclick = () => { setU(); recompute(); };
    document.getElementById('agMaze').onclick = () => { setMaze(); recompute(); };
    document.getElementById('agClear').onclick = () => { walls.fill(0); recompute(); };
    function recompute(animate) { res = search(walls, S, G, algo); best = search(walls, S, G, 'bfs'); shown = animate ? 0 : Infinity; anim = !!animate; draw(); }
    // chuột: kéo đầu/đích hoặc vẽ tường
    let drag = null;
    const cell = e => { if (!box) return null; const [x, y] = xy(cv, e); const cx = Math.floor((x - box.ox) / box.c), cy = Math.floor((y - box.oy) / box.c); return cx >= 0 && cy >= 0 && cx < NX && cy < NY ? [cx, cy] : null; };
    cv.addEventListener('pointerdown', e => {
      const c = cell(e); if (!c) return; cv.setPointerCapture(e.pointerId); e.preventDefault();
      if (c[0] === S[0] && c[1] === S[1]) drag = 'S'; else if (c[0] === G[0] && c[1] === G[1]) drag = 'G';
      else { drag = walls[c[1] * NX + c[0]] ? 'erase' : 'wall'; walls[c[1] * NX + c[0]] = drag === 'wall' ? 1 : 0; recompute(); }
    });
    cv.addEventListener('pointermove', e => {
      if (!drag) return; const c = cell(e); if (!c) return; const i = c[1] * NX + c[0];
      if (drag === 'S' || drag === 'G') { if (walls[i]) return; const P = drag === 'S' ? S : G; if (P[0] !== c[0] || P[1] !== c[1]) { P[0] = c[0]; P[1] = c[1]; recompute(); } }
      else { const v = drag === 'wall' ? 1 : 0; if ((drag === 'wall' && (i === S[1] * NX + S[0] || i === G[1] * NX + G[0])) || walls[i] === v) return; walls[i] = v; recompute(); }
    });
    const up = () => { drag = null; }; cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    loopWhenVisible(el, () => { if (!anim) return; shown += sp.get(); if (shown >= res.order.length) { shown = Infinity; anim = false; } draw(); });
    watchCanvas(cv, st, () => { const need = Math.round((st.W - 20) / NX * NY + (st.W < 520 ? 64 : 44)); if (Math.abs(st.H - need) > 1) { cv.style.height = need + 'px'; return; } draw(); });
    sp.upd(); recompute();
    function draw() {
      if (!res) return;
      const n = Math.min(shown, res.order.length), done = n >= res.order.length;
      setTxt('agN', n); setTxt('agL', done ? (res.path.length ? (res.path.length - 1) + ' bước' : 'hổng có đường') : '…');
      setTxt('agOpt', best.path.length ? (best.path.length - 1) + ' bước' + (done && res.path.length && res.path.length !== best.path.length ? ' (đường này dài hơn!)' : '') : 'hổng có đường');
      if (!st.ctx) return;
      const { ctx, W, H } = st; ctx.clearRect(0, 0, W, H);
      const c = Math.min((W - 20) / NX, (H - 20) / NY), ox = (W - c * NX) / 2, oy = 10; box = { c, ox, oy };
      ctx.fillStyle = '#fff'; ctx.fillRect(ox, oy, c * NX, c * NY);
      // ô chờ xét (chỉ khi xong)
      if (done) { ctx.fillStyle = '#FCEFC4'; res.open.forEach(([x, y]) => ctx.fillRect(ox + x * c, oy + y * c, c, c)); }
      for (let i = 0; i < n; i++) { const [x, y] = res.order[i]; ctx.fillStyle = TFG.heat(0.55 - 0.35 * i / Math.max(1, res.order.length)); ctx.fillRect(ox + x * c, oy + y * c, c, c); }
      ctx.fillStyle = C.ink; for (let i = 0; i < NX * NY; i++) if (walls[i]) ctx.fillRect(ox + (i % NX) * c, oy + Math.floor(i / NX) * c, c, c);
      ctx.strokeStyle = 'rgba(157,164,173,.35)'; ctx.lineWidth = 0.6; ctx.beginPath();
      for (let x = 0; x <= NX; x++) { ctx.moveTo(ox + x * c, oy); ctx.lineTo(ox + x * c, oy + NY * c); }
      for (let y = 0; y <= NY; y++) { ctx.moveTo(ox, oy + y * c); ctx.lineTo(ox + NX * c, oy + y * c); } ctx.stroke();
      if (done && res.path.length) { ctx.strokeStyle = C.gold; ctx.lineWidth = Math.max(3, c * 0.35); ctx.lineJoin = 'round'; ctx.beginPath();
        res.path.forEach(([x, y], i) => i ? ctx.lineTo(ox + (x + 0.5) * c, oy + (y + 0.5) * c) : ctx.moveTo(ox + (x + 0.5) * c, oy + (y + 0.5) * c)); ctx.stroke(); }
      const dot = (P, col) => { ctx.fillStyle = col; ctx.fillRect(ox + P[0] * c + 1, oy + P[1] * c + 1, c - 2, c - 2); ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.strokeRect(ox + P[0] * c + 1, oy + P[1] * c + 1, c - 2, c - 2); };
      dot(S, '#3f9d6a'); dot(G, C.pos);
      ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.strokeRect(ox, oy, c * NX, c * NY);
    }
  },
});
})();
