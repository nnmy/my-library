/* =====================================================================
   AI: minh họa "Tích chập tận tay" (id: conv2d, trang 1-cnn.html)
   Ảnh 16×16 vẽ được -> tích chập 3×3 (không đệm, ra 14×14) -> ReLU (tùy chọn) -> max pooling 2×2 (ra 7×7).
   Rê chuột / chạm lên bản đồ đặc trưng để coi phép tính của một ô.
   Chạy độc lập: lib/demos/run.html?demo=conv2d
   EDIT: ảnh mẫu ở PICS, bộ lọc mẫu ở KERNELS.
   ===================================================================== */
(() => {
const { COLORS: C, watchCanvas, diverge, setTxt, num, xy, pressGroup } = TFG;
const N = 16, M = N - 2, P = M / 2;
const PICS = {
  'Con mèo': [
    '................', '...#........#...', '...##......##...', '...###....###...',
    '...##########...', '..############..', '..##..####..##..', '..##..####..##..',
    '..############..', '..#####..#####..', '..############..', '...##########...',
    '....########....', '................', '................', '................'],
  'Số 7': [
    '................', '................', '...##########...', '...##########...',
    '..........###...', '.........###....', '........###.....', '.......###......',
    '......###.......', '......###.......', '.....###........', '.....###........',
    '.....###........', '.....###........', '................', '................'],
  'Khung + chéo': [...Array(N)].map((_, i) => [...Array(N)].map((_, j) =>
    ((i === 2 || i === 13) && j >= 2 && j <= 13) || ((j === 2 || j === 13) && i >= 2 && i <= 13) || (i === j && i > 2 && i < 13) ? '#' : '.').join('')),
};
const KERNELS = {
  'Cạnh dọc': [[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]],
  'Cạnh ngang': [[-1, -2, -1], [0, 0, 0], [1, 2, 1]],
  'Đường chéo': [[2, -1, -1], [-1, 2, -1], [-1, -1, 2]],
  'Làm mờ': [[1 / 9, 1 / 9, 1 / 9], [1 / 9, 1 / 9, 1 / 9], [1 / 9, 1 / 9, 1 / 9]],
  'Làm nét': [[0, -1, 0], [-1, 5, -1], [0, -1, 0]],
};

TFG.demo('conv2d', {
  html: `<div class="demo-title"><h4>Tích chập tận tay</h4><span>Vẽ lên ảnh, chọn bộ lọc, rê chuột lên bản đồ đặc trưng</span></div>
    <div class="demo-body">
      <div class="stagebox">
        <canvas id="cvConv" role="img" aria-label="Ba bảng ô vuông: ảnh vô 16×16, bản đồ đặc trưng 14×14 sau tích chập, và kết quả 7×7 sau max pooling."></canvas>
        <span class="hint">Bấm và kéo trên ảnh để vẽ hoặc xóa</span>
      </div>
      <div class="panel">
        <div><b style="font-size:15px">Ảnh mẫu</b><div class="btnrow" id="cvPics" style="margin-top:6px"></div></div>
        <div><b style="font-size:15px">Bộ lọc (kernel 3×3)</b><div class="btnrow" id="cvKers" style="margin-top:6px"></div></div>
        <div id="cvKgrid" style="display:grid;grid-template-columns:repeat(3,64px);gap:4px" aria-label="Chín trọng số của bộ lọc, sửa được"></div>
        <div class="checks"><label><input type="checkbox" id="cvRelu" checked> ReLU (số âm thành 0)</label></div>
        <div>
          <b style="font-size:15px">Phép tính ở ô đang chọn <span id="cvPos" style="font-weight:400;color:var(--muted)"></span></b>
          <div id="cvCalc" style="display:grid;grid-template-columns:repeat(3,1fr);gap:3px;margin-top:6px;font:600 12.5px var(--mono)"></div>
        </div>
        <dl class="readout">
          <dt>Tổng 9 tích</dt><dd id="cvSum" class="big">—</dd>
          <dt>Sau ReLU</dt><dd id="cvRel">—</dd>
          <dt>Max pooling của khối 2×2</dt><dd id="cvPool">—</dd>
        </dl>
        <p class="note-s" id="cvTie" style="margin-top:-6px"></p>
        <p class="note-s">Bộ lọc trượt qua từng vị trí. Ở mỗi chỗ, nhân 9 điểm ảnh với 9 trọng số rồi cộng lại. Xanh = số dương (bộ lọc “thấy” thứ nó tìm), đỏ = số âm. Pooling lấy số lớn nhất trong mỗi khối 2×2 cho ảnh gọn lại. Khung vàng liền: ô đang chọn và cửa sổ 3×3 tạo ra nó; khung vàng đứt: khối 2×2 được gom thành một ô pooling, và vùng 4×4 của ảnh mà ô pooling đó “nhìn thấy”.</p>
      </div>
    </div>`,
  init() {
    const cv = document.getElementById('cvConv'), st = {};
    let img = [], K = KERNELS['Cạnh dọc'].map(r => r.slice()), sel = { r: 6, c: 2 }, box = null;
    const loadPic = name => { img = PICS[name].map(row => [...row].map(ch => (ch === '#' ? 1 : 0))); };
    loadPic('Con mèo');
    const relu = document.getElementById('cvRelu');

    // nút ảnh mẫu
    const picBtns = Object.keys(PICS).map(name => {
      const b = document.createElement('button'); b.className = 'btn'; b.type = 'button'; b.textContent = name;
      b.onclick = () => { loadPic(name); pressGroup(picBtns, b); draw(); };
      document.getElementById('cvPics').appendChild(b); return b;
    });
    const clr = document.createElement('button'); clr.className = 'btn'; clr.type = 'button'; clr.textContent = 'Xóa trắng';
    clr.onclick = () => { img = [...Array(N)].map(() => Array(N).fill(0)); pressGroup(picBtns, null); draw(); };
    document.getElementById('cvPics').appendChild(clr);
    pressGroup(picBtns, picBtns[0]);

    // nút bộ lọc + ô sửa trọng số
    const kGrid = document.getElementById('cvKgrid');
    const kIn = [];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      const e = document.createElement('input'); e.type = 'number'; e.step = '0.5'; e.className = 'inp';
      e.style.cssText = 'padding:4px 6px;font:600 14px var(--mono);text-align:center';
      e.setAttribute('aria-label', `Trọng số hàng ${i + 1}, cột ${j + 1}`);
      e.addEventListener('input', () => { const v = parseFloat(e.value); if (isFinite(v)) { K[i][j] = v; pressGroup(kerBtns, null); draw(); } });
      kGrid.appendChild(e); kIn.push(e);
    }
    const showK = () => kIn.forEach((e, n) => { const v = K[Math.floor(n / 3)][n % 3]; e.value = Math.abs(v - Math.round(v)) < 1e-9 ? v : v.toFixed(2); });
    const kerBtns = Object.keys(KERNELS).map(name => {
      const b = document.createElement('button'); b.className = 'btn'; b.type = 'button'; b.textContent = name;
      b.onclick = () => { K = KERNELS[name].map(r => r.slice()); pressGroup(kerBtns, b); showK(); draw(); };
      document.getElementById('cvKers').appendChild(b); return b;
    });
    pressGroup(kerBtns, kerBtns[0]); showK();
    relu.addEventListener('change', () => draw());

    function compute() {
      const F = [...Array(M)].map((_, r) => [...Array(M)].map((_, c) => {
        let s = 0; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) s += img[r + i][c + j] * K[i][j]; return s;
      }));
      const A = relu.checked ? F.map(row => row.map(v => Math.max(0, v))) : F;
      const Pm = [...Array(P)].map((_, r) => [...Array(P)].map((_, c) =>
        Math.max(A[2 * r][2 * c], A[2 * r][2 * c + 1], A[2 * r + 1][2 * c], A[2 * r + 1][2 * c + 1])));
      return { F, A, Pm };
    }

    // bố cục: một hàng (rộng) hoặc hai hàng (hẹp); chiều cao canvas tính theo bề ngang
    function layout(W) {
      const two = W < 900;
      if (!two) {
        const c = Math.min(26, (W - 28 - 2 * 40) / 44);
        const y = 30, x0 = 14 + Math.max(0, (W - 28 - 2 * 40 - 44 * c) / 2);
        return { c, H: y + 16 * c + 44, g: [{ x: x0, y }, { x: x0 + 16 * c + 40, y: y + c }, { x: x0 + 30 * c + 80, y: y + c }] };
      }
      const c = Math.min(22, (W - 28 - 30) / 30), y = 30, x0 = 14;
      return { c, H: y + 16 * c + 30 + 14 * c + 40, g: [{ x: x0, y }, { x: x0 + 16 * c + 30, y: y + c }, { x: x0 + c, y: y + 16 * c + 34 }] };
    }

    let painting = null;
    const hit = (x, y) => {
      if (!box) return null; const { c, g } = box;
      const gi = Math.floor((x - g[0].x) / c), gj = Math.floor((y - g[0].y) / c);
      if (gi >= 0 && gi < N && gj >= 0 && gj < N) return { k: 0, r: gj, c: gi };
      const fi = Math.floor((x - g[1].x) / c), fj = Math.floor((y - g[1].y) / c);
      if (fi >= 0 && fi < M && fj >= 0 && fj < M) return { k: 1, r: fj, c: fi };
      const pi = Math.floor((x - g[2].x) / (2 * c)), pj = Math.floor((y - g[2].y) / (2 * c));
      if (pi >= 0 && pi < P && pj >= 0 && pj < P) return { k: 2, r: pj, c: pi };
      return null;
    };
    const selectFrom = h => {
      if (!h) return;
      if (h.k === 0) sel = { r: Math.min(M - 1, Math.max(0, h.r - 1)), c: Math.min(M - 1, Math.max(0, h.c - 1)) };
      else if (h.k === 1) sel = { r: h.r, c: h.c };
      else { // chọn ô thắng trong 2×2
        const { A } = compute(); let best = { r: 2 * h.r, c: 2 * h.c };
        for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) if (A[2 * h.r + a][2 * h.c + b] > A[best.r][best.c]) best = { r: 2 * h.r + a, c: 2 * h.c + b };
        sel = best;
      }
    };
    cv.addEventListener('pointerdown', e => {
      const h = hit(...xy(cv, e)); if (!h) return;
      if (h.k === 0) { painting = img[h.r][h.c] ? 0 : 1; img[h.r][h.c] = painting; cv.setPointerCapture(e.pointerId); pressGroup(picBtns, null); }
      selectFrom(h); draw(); e.preventDefault();
    });
    cv.addEventListener('pointermove', e => {
      const h = hit(...xy(cv, e)); if (!h) return;
      if (painting !== null && h.k === 0) img[h.r][h.c] = painting;
      selectFrom(h); draw();
    });
    const stop = () => { painting = null; };
    cv.addEventListener('pointerup', stop); cv.addEventListener('pointercancel', stop);

    watchCanvas(cv, st, () => {
      const L = layout(st.W); if (Math.abs(st.H - L.H) > 1) { cv.style.height = L.H + 'px'; return; }
      draw();
    });

    function draw() {
      if (!st.ctx) return;
      const { ctx, W, H } = st; const L = layout(W); box = L; const { c, g } = L;
      const { F, A, Pm } = compute();
      ctx.clearRect(0, 0, W, H);
      const mx = Math.max(1e-6, ...F.flat().map(Math.abs));
      ctx.font = '600 13px "Be Vietnam Pro", sans-serif'; ctx.fillStyle = C.ink; ctx.textAlign = 'left';
      const sh = 14 * c < 175;   // màn hình hẹp: nhãn ngắn
      ctx.font = `600 ${sh ? 12 : 13}px "Be Vietnam Pro", sans-serif`;
      ctx.fillText(sh ? 'Ảnh 16×16' : 'Ảnh vô (16×16)', g[0].x, g[0].y - 10);
      ctx.fillText(sh ? 'Đặc trưng 14×14' : 'Bản đồ đặc trưng (14×14)', g[1].x, g[1].y - 10);
      ctx.fillText(sh ? 'Pooling 7×7' : 'Sau pooling (7×7)', g[2].x, g[2].y - 10);
      // ảnh
      for (let r = 0; r < N; r++) for (let q = 0; q < N; q++) { ctx.fillStyle = img[r][q] ? C.ink : '#fff'; ctx.fillRect(g[0].x + q * c, g[0].y + r * c, c, c); }
      // bản đồ đặc trưng
      for (let r = 0; r < M; r++) for (let q = 0; q < M; q++) { ctx.fillStyle = diverge(A[r][q] / mx); ctx.fillRect(g[1].x + q * c, g[1].y + r * c, c, c); }
      // pooling
      for (let r = 0; r < P; r++) for (let q = 0; q < P; q++) { ctx.fillStyle = diverge(Pm[r][q] / mx); ctx.fillRect(g[2].x + q * 2 * c, g[2].y + r * 2 * c, 2 * c, 2 * c); }
      // lưới mảnh
      ctx.strokeStyle = 'rgba(157,164,173,.45)'; ctx.lineWidth = 0.6;
      const grid = (x, y, n, s) => { ctx.beginPath(); for (let i = 1; i < n; i++) { ctx.moveTo(x + i * s, y); ctx.lineTo(x + i * s, y + n * s); ctx.moveTo(x, y + i * s); ctx.lineTo(x + n * s, y + i * s); } ctx.stroke(); };
      grid(g[0].x, g[0].y, N, c); grid(g[1].x, g[1].y, M, c); grid(g[2].x, g[2].y, P, 2 * c);
      ctx.strokeStyle = C.ink; ctx.lineWidth = 2;
      ctx.strokeRect(g[0].x, g[0].y, N * c, N * c); ctx.strokeRect(g[1].x, g[1].y, M * c, M * c); ctx.strokeRect(g[2].x, g[2].y, P * 2 * c, P * 2 * c);
      // khối 2×2 chứa ô đang chọn, ô pooling tương ứng, và vùng 4×4 của ảnh mà ô pooling nhìn thấy
      const pr = Math.floor(sel.r / 2), pc = Math.floor(sel.c / 2);
      ctx.setLineDash([4, 3]); ctx.lineWidth = 2; ctx.strokeStyle = C.gold;
      ctx.strokeRect(g[0].x + 2 * pc * c, g[0].y + 2 * pr * c, 4 * c, 4 * c);
      ctx.strokeRect(g[1].x + 2 * pc * c, g[1].y + 2 * pr * c, 2 * c, 2 * c);
      ctx.strokeRect(g[2].x + pc * 2 * c, g[2].y + pr * 2 * c, 2 * c, 2 * c);
      ctx.setLineDash([]);
      // ô đang chọn + cửa sổ 3×3 tạo ra nó
      ctx.strokeStyle = C.gold; ctx.lineWidth = 3;
      ctx.strokeRect(g[0].x + sel.c * c, g[0].y + sel.r * c, 3 * c, 3 * c);
      ctx.strokeRect(g[1].x + sel.c * c, g[1].y + sel.r * c, c, c);
      // dây nối: cửa sổ -> ô đặc trưng, khối 2×2 -> ô pooling
      ctx.strokeStyle = 'rgba(242,194,48,.85)'; ctx.lineWidth = 1.5; ctx.beginPath();
      ctx.moveTo(g[0].x + (sel.c + 3) * c, g[0].y + (sel.r + 1.5) * c); ctx.lineTo(g[1].x + sel.c * c, g[1].y + (sel.r + 0.5) * c);
      ctx.moveTo(g[1].x + (2 * pc + 1) * c, g[1].y + (2 * pr + 2) * c); ctx.lineTo(g[2].x + (2 * pc + 1) * c, g[2].y + 2 * pr * c);
      ctx.stroke();
      // phép tính
      const calc = document.getElementById('cvCalc'); calc.innerHTML = '';
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
        const xv = img[sel.r + i][sel.c + j], w = K[i][j], p = xv * w;
        const d = document.createElement('div');
        d.style.cssText = `padding:3px 4px;border:1px solid var(--line);text-align:center;background:${p > 0 ? '#DCEFF8' : p < 0 ? '#F6D6D2' : '#fff'}`;
        d.textContent = `${xv}×${num(w, 2)}`; calc.appendChild(d);
      }
      setTxt('cvPos', `(hàng ${sel.r + 1}, cột ${sel.c + 1})`);
      {
        const pr = Math.floor(sel.r / 2), pc = Math.floor(sel.c / 2);
        const blk = [[2 * pr, 2 * pc], [2 * pr, 2 * pc + 1], [2 * pr + 1, 2 * pc], [2 * pr + 1, 2 * pc + 1]].map(([r, q]) => A[r][q]);
        const m = Math.max(...blk), nWin = blk.filter(v => v === m).length;
        setTxt('cvPool', `max(${blk.map(v => num(v, 3)).join('; ')}) = ${num(m, 3)}`);
        setTxt('cvTie', nWin > 1
          ? `Ô pooling (hàng ${pr + 1}, cột ${pc + 1}): ${nWin} ô trong khối 2×2 bằng nhau (${num(m, 3)}), nên ô nào cũng là “ô thắng”; minh họa chọn ô đầu tiên.`
          : `Ô pooling (hàng ${pr + 1}, cột ${pc + 1}) lấy giá trị từ đúng một ô thắng trong khối 2×2.`);
      }
      setTxt('cvSum', num(F[sel.r][sel.c], 3)); setTxt('cvRel', relu.checked ? num(Math.max(0, F[sel.r][sel.c]), 3) : '(đang tắt)');
    }
  },
});
})();
