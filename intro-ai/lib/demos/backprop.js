/* =====================================================================
   AI: minh họa "Lan truyền ngược từng bước" (id: backprop, trang 1-cnn.html)
   Mạng tí hon: z = w1·x + b1 -> h = ReLU(z) -> ŷ = w2·h + b2 -> L = (ŷ − t)²
   Chạy tới để có giá trị (xanh), lan ngược từng bước để có gradient (đỏ) theo quy tắc dây chuyền,
   rồi cập nhật: w <- w − lr·∂L/∂w.
   Chạy độc lập: lib/demos/run.html?demo=backprop
   ===================================================================== */
(() => {
const { COLORS: C, watchCanvas, setTxt, num, range, arrow } = TFG;
const INIT = { w1: 0.8, b1: 0.1, w2: -0.5, b2: 0.2 };
// vị trí: col 0..4 (x, z, h, ŷ, L), row 0 = tham số phía trên, row 1 = dòng tính
const NODES = {
  x: { col: 0, row: 1, name: 'x', sub: 'đầu vào' },
  z: { col: 1, row: 1, name: 'z', sub: 'w1·x + b1' },
  h: { col: 2, row: 1, name: 'h', sub: 'ReLU(z)' },
  y: { col: 3, row: 1, name: 'ŷ', sub: 'w2·h + b2' },
  L: { col: 4, row: 1, name: 'L', sub: '(ŷ − t)²' },
  w1: { col: 0.68, row: 0, name: 'w1', sub: 'trọng số' },
  b1: { col: 1.32, row: 0, name: 'b1', sub: 'độ lệch' },
  w2: { col: 2.62, row: 0, name: 'w2', sub: 'trọng số' },
  b2: { col: 3.24, row: 0, name: 'b2', sub: 'độ lệch' },
  t: { col: 4.12, row: 0, name: 't', sub: 'đáp án' },
};
const EDGES = [['x', 'z'], ['w1', 'z'], ['b1', 'z'], ['z', 'h'], ['h', 'y'], ['w2', 'y'], ['b2', 'y'], ['y', 'L'], ['t', 'L']];

TFG.demo('backprop', {
  html: `<div class="demo-title"><h4>Lan truyền ngược từng bước</h4><span>Chạy tới, lan ngược, cập nhật, lặp lại</span></div>
    <div class="demo-body">
      <div class="stagebox">
        <canvas id="bpCv" role="img" aria-label="Đồ thị tính toán của một mạng tí hon, với giá trị (xanh) và gradient (đỏ) ở mỗi nút."></canvas>
        <div class="pad" style="border-top:2px solid var(--ink)"><p id="bpExp" style="margin:0;font-size:15.5px;min-height:3.2em"></p></div>
      </div>
      <div class="panel">
        <div class="btnrow">
          <button class="btn" type="button" id="bpFwd">1. Chạy tới</button>
          <button class="btn" type="button" id="bpBack">2. Lan ngược 1 bước</button>
          <button class="btn" type="button" id="bpAll">Lan ngược hết</button>
          <button class="btn" type="button" id="bpUpd">3. Cập nhật trọng số</button>
        </div>
        <div class="btnrow">
          <button class="btn" type="button" id="bpTrain">Huấn luyện 20 vòng</button>
          <button class="btn" type="button" id="bpReset">Làm lại</button>
        </div>
        <div class="ctrl"><label for="bpX">Đầu vào x</label><output for="bpX"></output>
          <input type="range" id="bpX" min="-2" max="2" step="0.1" value="1.5"></div>
        <div class="ctrl"><label for="bpT">Đáp án t</label><output for="bpT"></output>
          <input type="range" id="bpT" min="-2" max="3" step="0.1" value="2"></div>
        <div class="ctrl"><label for="bpLr">Tốc độ học</label><output for="bpLr"></output>
          <input type="range" id="bpLr" min="0.01" max="0.3" step="0.01" value="0.05"></div>
        <dl class="readout">
          <dt>Độ lỗi L lúc này</dt><dd id="bpL" class="big">—</dd>
          <dt>Độ lỗi lần trước</dt><dd id="bpL0">—</dd>
          <dt>Số lần cập nhật</dt><dd id="bpN">0</dd>
        </dl>
      </div>
    </div>`,
  init() {
    const cv = document.getElementById('bpCv'), st = {};
    let P = { ...INIT }, phase = 0, bstep = 0, prevL = null, updates = 0;
    const xs = range('bpX', { show: v => num(v, 2), onInput: () => { phase = 0; bstep = 0; draw(); } });
    const ts = range('bpT', { show: v => num(v, 2), onInput: () => { phase = 0; bstep = 0; draw(); } });
    const lr = range('bpLr', { show: v => num(v, 2) });
    const reset = () => { P = { ...INIT }; phase = 0; bstep = 0; prevL = null; updates = 0; draw(); };

    function fwd() {
      const x = xs.get(), t = ts.get();
      const z = P.w1 * x + P.b1, h = Math.max(0, z), y = P.w2 * h + P.b2, L = (y - t) ** 2;
      const gL = 1, gy = 2 * (y - t), gw2 = gy * h, gb2 = gy, gh = gy * P.w2, gz = gh * (z > 0 ? 1 : 0), gw1 = gz * x, gb1 = gz;
      return { v: { x, t, z, h, y, L, ...P }, g: { L: gL, y: gy, w2: gw2, b2: gb2, h: gh, z: gz, w1: gw1, b1: gb1 } };
    }
    // các bước lan ngược: nút được lộ gradient + lời giải thích
    const BSTEPS = [
      { nodes: ['L'], text: s => `Bắt đầu ở cuối: L thay đổi bao nhiêu khi chính L đổi 1 đơn vị? Đương nhiên là 1. Vậy ∂L/∂L = 1.` },
      { nodes: ['y'], text: s => `L = (ŷ − t)², nên ∂L/∂ŷ = 2(ŷ − t) = 2·(${num(s.v.y, 3)} − ${num(s.v.t, 3)}) = ${num(s.g.y, 3)}. ${s.g.y < 0 ? 'Số âm: ŷ đang thấp hơn đáp án, tăng ŷ thì lỗi giảm.' : s.g.y > 0 ? 'Số dương: ŷ đang cao hơn đáp án, giảm ŷ thì lỗi giảm.' : 'Bằng 0: đoán trúng boong rồi.'}` },
      { nodes: ['w2', 'b2'], text: s => `ŷ = w2·h + b2. Quy tắc dây chuyền: ∂L/∂w2 = ∂L/∂ŷ · h = ${num(s.g.y, 3)} · ${num(s.v.h, 3)} = ${num(s.g.w2, 3)}, còn ∂L/∂b2 = ∂L/∂ŷ · 1 = ${num(s.g.b2, 3)}.` },
      { nodes: ['h'], text: s => `Lỗi tiếp tục chảy ngược qua w2: ∂L/∂h = ∂L/∂ŷ · w2 = ${num(s.g.y, 3)} · ${num(s.v.w2, 3)} = ${num(s.g.h, 3)}. Trọng số càng lớn thì “gánh” lỗi về phía trước càng nhiều.` },
      { nodes: ['z'], text: s => s.v.z > 0 ? `ReLU cho số dương đi thẳng qua, nên độ dốc của nó là 1: ∂L/∂z = ∂L/∂h · 1 = ${num(s.g.z, 3)}.` : `z âm nên ReLU chặn lại, độ dốc bằng 0: ∂L/∂z = 0. Lỗi hổng chảy về được nữa, w1 và b1 sẽ hổng được sửa lần này (chuyện “neuron chết”).` },
      { nodes: ['w1', 'b1'], text: s => `Cuối cùng: ∂L/∂w1 = ∂L/∂z · x = ${num(s.g.z, 3)} · ${num(s.v.x, 3)} = ${num(s.g.w1, 3)}, và ∂L/∂b1 = ${num(s.g.b1, 3)}. Xong! Giờ mình biết mỗi trọng số nên chỉnh theo hướng nào.` },
    ];
    const shownG = () => new Set(BSTEPS.slice(0, bstep).flatMap(b => b.nodes));

    document.getElementById('bpFwd').onclick = () => { phase = 1; bstep = 0; draw(); };
    document.getElementById('bpBack').onclick = () => { if (phase === 0) phase = 1; else bstep = Math.min(BSTEPS.length, bstep + 1); draw(); };
    document.getElementById('bpAll').onclick = () => { phase = 1; bstep = BSTEPS.length; draw(); };
    const update = () => {
      const s = fwd(); prevL = s.v.L; const a = lr.get();
      ['w1', 'b1', 'w2', 'b2'].forEach(k => { P[k] -= a * s.g[k]; }); updates++;
    };
    document.getElementById('bpUpd').onclick = () => {
      if (bstep < BSTEPS.length) { phase = 1; bstep = BSTEPS.length; draw(); setTxt('bpExp', 'Cần lan ngược xong để có đủ gradient. Mình vừa lan ngược hết giùm bạn, bấm “Cập nhật” lần nữa nha.'); return; }
      update(); phase = 1; bstep = 0; draw(true);
    };
    document.getElementById('bpTrain').onclick = () => { for (let i = 0; i < 20; i++) update(); phase = 1; bstep = 0; draw(true); };
    document.getElementById('bpReset').onclick = reset;
    watchCanvas(cv, st, () => {
      const need = st.W < 560 ? 300 : 280;
      if (Math.abs(st.H - need) > 1) { cv.style.height = need + 'px'; return; }
      draw();
    });
    xs.upd(); ts.upd(); lr.upd(); reset();

    function draw(justUpdated) {
      const s = fwd(), G = shownG();
      // lời giải thích
      let msg;
      if (phase === 0) msg = 'Mạng tí hon này có 4 trọng số (w1, b1, w2, b2). Bấm “1. Chạy tới” để đẩy x qua mạng và coi nó đoán ra gì.';
      else if (justUpdated) msg = `Mỗi trọng số vừa bị trừ đi (tốc độ học × gradient của nó). Lỗi đi từ ${num(prevL, 4)} xuống ${num(s.v.L, 4)}. Lặp lại vòng này đủ nhiều lần, mạng sẽ đoán trúng t.`;
      else if (bstep === 0) msg = `Chạy tới xong: ŷ = ${num(s.v.y, 3)} trong khi đáp án t = ${num(s.v.t, 3)}, lỗi L = ${num(s.v.L, 4)}. Giờ bấm “2. Lan ngược” để coi lỗi này đổ lên đầu ai.`;
      else msg = BSTEPS[bstep - 1].text(s);
      setTxt('bpExp', msg);
      setTxt('bpL', phase ? num(s.v.L, 4) : '(chưa chạy)'); setTxt('bpL0', prevL === null ? '—' : num(prevL, 4)); setTxt('bpN', updates);
      if (!st.ctx) return;
      const { ctx, W, H } = st; ctx.clearRect(0, 0, W, H);
      const colW = (W - 20) / 5, bwMain = Math.min(118, colW - 12), bwTop = Math.min(104, colW * 0.58), bw = bwMain, bh = 70;
      const pos = k => { const n = NODES[k]; return { x: 10 + (n.col + 0.5) * colW, y: n.row ? H - bh / 2 - 22 : bh / 2 + 16 }; };
      const cur = new Set(bstep ? BSTEPS[bstep - 1].nodes : []);
      // cạnh
      EDGES.forEach(([a, b]) => {
        const p = pos(a), q = pos(b);
        const sx = NODES[a].row === NODES[b].row ? p.x + bw / 2 : p.x, sy = NODES[a].row === NODES[b].row ? p.y : p.y + bh / 2;
        const ex = NODES[a].row === NODES[b].row ? q.x - bw / 2 - 2 : q.x + (p.x - q.x) * 0.25, ey = NODES[a].row === NODES[b].row ? q.y : q.y - bh / 2 - 2;
        arrow(ctx, sx, sy, ex, ey, phase ? C.ink : '#B9C1CA', 1.6, 7);
        if (G.has(a) && G.has(b) || (G.has(a) && b === 'L')) {
          const o = NODES[a].row === NODES[b].row ? 8 : 0;
          ctx.setLineDash([5, 4]); arrow(ctx, ex + (o ? 0 : 6), ey + o, sx + (o ? 0 : 6), sy + o, C.pos, 2, 8); ctx.setLineDash([]);
        }
      });
      // nút
      Object.keys(NODES).forEach(k => {
        const n = NODES[k], p = pos(k), isParam = ['w1', 'b1', 'w2', 'b2'].includes(k), bw = n.row ? bwMain : bwTop;
        const known = phase || isParam || k === 'x' || k === 't';
        ctx.fillStyle = isParam ? '#F6E3B0' : k === 'L' ? '#F6D6D2' : k === 'x' || k === 't' ? '#DCEFF8' : '#fff';
        ctx.fillRect(p.x - bw / 2, p.y - bh / 2, bw, bh);
        ctx.strokeStyle = cur.has(k) ? C.gold : C.ink; ctx.lineWidth = cur.has(k) ? 4 : 1.8;
        ctx.strokeRect(p.x - bw / 2, p.y - bh / 2, bw, bh);
        ctx.textAlign = 'center'; ctx.fillStyle = C.ink;
        const tiny = bw < 64;   // ô rất hẹp (điện thoại): bỏ dòng phụ, chữ nhỏ lại
        ctx.font = `700 ${tiny ? 12 : bw < 80 ? 13 : 15}px "Be Vietnam Pro", sans-serif`; ctx.fillText(n.name, p.x, p.y - 17);
        if (!tiny) { ctx.font = `${bw < 80 ? 10 : 11.5}px "Be Vietnam Pro", sans-serif`; ctx.fillStyle = C.muted; ctx.fillText(n.sub, p.x, p.y - 3); }
        ctx.font = `600 ${tiny ? 10.5 : bw < 80 ? 11.5 : 13}px ui-monospace, monospace`;
        ctx.fillStyle = C.sea; ctx.fillText(known ? (tiny ? '' : '= ') + num(s.v[k], 3) : (tiny ? '?' : '= ?'), p.x, p.y + (tiny ? 2 : 14));
        if (G.has(k)) { ctx.fillStyle = C.pos; ctx.fillText((bw < 64 ? '' : bw < 100 ? '∂ ' : '∂L/∂' + n.name + ' = ') + num(s.g[k], 3), p.x, p.y + (bw < 64 ? 20 : 29)); }
      });
      ctx.textAlign = 'left'; ctx.font = '12px "Be Vietnam Pro", sans-serif'; ctx.fillStyle = C.muted;
      ctx.fillText(W < 480 ? 'xanh: giá trị   đỏ: gradient' : 'xanh: giá trị khi chạy tới   đỏ: gradient khi lan ngược', 10, H - 4);
    }
  },
});
})();
