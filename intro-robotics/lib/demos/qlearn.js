/* =====================================================================
   Robotics: minh họa "Q-learning trong mê cung" (id: qlearn, trang 5-tu-hoc.html)
   Lưới 10 × 7. Mỗi bước: −0,1 điểm (để robot muốn tới lẹ). Ô đích: +10, ô vũng nước: −10 (kết thúc lượt).
   Hành động: lên, xuống, trái, phải. "Sàn trơn": 20% số lần trượt sang hướng ngẫu nhiên.
   Cập nhật: Q(s,a) ← Q(s,a) + α [ r + γ max_a′ Q(s′,a′) − Q(s,a) ]; chọn hành động ε-tham lam.
   Màu mỗi ô: max_a Q(s,a) (xanh = tốt, đỏ = tệ); mũi tên: hành động tốt nhất hiện tại.
   Chạy độc lập: lib/demos/run.html?demo=qlearn
   EDIT: bản đồ ở MAP (# tường, S đầu, G đích, X vũng nước).
   ===================================================================== */
(() => {
const { COLORS: C, watchCanvas, setTxt, num, range, rng, diverge, loopWhenVisible } = TFG;
const MAP = ['.....#...G', '.#.#.#.##.', '.#...#....', '.###.XX.#.', '...#....#.', '.#.##.#.X.', 'S#........'];
const NY = MAP.length, NX = MAP[0].length, A = [[0, -1], [0, 1], [-1, 0], [1, 0]], MAXSTEP = 200;
let S0; MAP.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === 'S') S0 = [x, y]; }));
const cellAt = (x, y) => (x < 0 || y < 0 || x >= NX || y >= NY) ? '#' : MAP[y][x];
TFG.demo('qlearn', {
  html: `<div class="demo-title"><h4>Q-learning trong mê cung</h4><span>Robot tự mò đường bằng thử và sai</span></div>
    <div class="demo-body">
      <div class="stagebox">
        <canvas id="qlCv" class="ar" role="img" aria-label="Mê cung 10 × 7 ô. Ô xanh lá: điểm đầu; ô đích có lá cờ; ô vũng nước màu đỏ. Màu nền mỗi ô là giá trị học được, mũi tên là hướng tốt nhất. Chấm vàng là robot."></canvas>
        <canvas id="qlPlot" class="profile" role="img" aria-label="Đồ thị số bước của mỗi lượt chơi."></canvas>
      </div>
      <div class="panel">
        <div class="btnrow">
          <button class="btn" type="button" id="qlRun" aria-pressed="false">Chạy</button>
          <button class="btn" type="button" id="qlFast">Học nhanh 300 lượt</button>
          <button class="btn" type="button" id="qlReset">Quên hết</button>
        </div>
        <div class="ctrl"><label for="qlSp">Tốc độ (bước mỗi khung hình)</label><output for="qlSp"></output>
          <input type="range" id="qlSp" min="0" max="2.5" step="0.1" value="0"></div>
        <div class="ctrl"><label for="qlE">ε: tò mò thử bậy</label><output for="qlE"></output>
          <input type="range" id="qlE" min="0" max="0.5" step="0.01" value="0.1"></div>
        <div class="ctrl"><label for="qlA">α: tốc độ học</label><output for="qlA"></output>
          <input type="range" id="qlA" min="0.05" max="1" step="0.05" value="0.5"></div>
        <div class="ctrl"><label for="qlG">γ: coi trọng tương lai</label><output for="qlG"></output>
          <input type="range" id="qlG" min="0.5" max="0.99" step="0.01" value="0.95"></div>
        <div class="checks"><label><input type="checkbox" id="qlSlip"> Sàn trơn (20% bước bị trượt)</label></div>
        <dl class="readout">
          <dt>Số lượt đã chơi</dt><dd id="qlEp" class="big">0</dd>
          <dt>Lượt gần nhất</dt><dd id="qlLast" style="font-family:var(--body)">—</dd>
        </dl>
      </div>
    </div>`,
  init(el) {
    const cv = document.getElementById('qlCv'), cp = document.getElementById('qlPlot'), st = {}, sp = {};
    const r = rng(3);
    const spd = range('qlSp', { map: v => Math.round(Math.pow(10, v)), show: v => v });
    const eps = range('qlE', { show: v => num(v, 2) }), alp = range('qlA', { show: v => num(v, 2) }), gam = range('qlG', { show: v => num(v, 2) });
    const slip = document.getElementById('qlSlip');
    let Q, pos, steps, ret, ep, hist, lastTxt, running = false;
    const reset = () => { Q = new Float64Array(NX * NY * 4); pos = S0.slice(); steps = 0; ret = 0; ep = 0; hist = []; lastTxt = '—'; draw(); };
    const runB = document.getElementById('qlRun');
    const setRun = v => { running = v; runB.setAttribute('aria-pressed', v); runB.textContent = v ? 'Dừng' : 'Chạy'; };
    runB.onclick = () => setRun(!running);
    document.getElementById('qlReset').onclick = reset;
    document.getElementById('qlFast').onclick = () => { const target = ep + 300; let guard = 0; while (ep < target && guard++ < 300 * MAXSTEP) step(); draw(); };
    const qi = (x, y, a) => (y * NX + x) * 4 + a;
    const best = (x, y) => { let b = 0; for (let a = 1; a < 4; a++) if (Q[qi(x, y, a)] > Q[qi(x, y, b)]) b = a; return b; };
    function step() {
      const [x, y] = pos;
      let a = r() < eps.get() ? Math.floor(r() * 4) : best(x, y);
      let am = (slip.checked && r() < 0.2) ? Math.floor(r() * 4) : a;
      let nx = x + A[am][0], ny = y + A[am][1]; if (cellAt(nx, ny) === '#') { nx = x; ny = y; }
      const c = cellAt(nx, ny), rew = c === 'G' ? 10 : c === 'X' ? -10 : -0.1, end = c === 'G' || c === 'X';
      let mq = 0; if (!end) { mq = Q[qi(nx, ny, 0)]; for (let k = 1; k < 4; k++) mq = Math.max(mq, Q[qi(nx, ny, k)]); }
      const i = qi(x, y, a); Q[i] += alp.get() * (rew + gam.get() * mq - Q[i]);
      pos = [nx, ny]; steps++; ret += rew;
      if (end || steps >= MAXSTEP) {
        ep++; hist.push([steps, c]); if (hist.length > 300) hist.shift();
        lastTxt = (c === 'G' ? 'tới đích' : c === 'X' ? 'té vũng nước' : 'hết giờ') + ' sau ' + steps + ' bước, điểm ' + num(ret, 3);
        pos = S0.slice(); steps = 0; ret = 0;
      }
    }
    loopWhenVisible(el, () => { if (!running) return; for (let k = 0; k < spd.get(); k++) step(); draw(); });
    spd.upd(); eps.upd(); alp.upd(); gam.upd(); reset();
    watchCanvas(cv, st, () => draw()); watchCanvas(cp, sp, () => draw());
    function draw() {
      setTxt('qlEp', ep); setTxt('qlLast', lastTxt);
      if (st.ctx) {
        const { ctx, W, H } = st; ctx.clearRect(0, 0, W, H);
        const c = Math.min((W - 20) / NX, (H - 20) / NY), ox = (W - c * NX) / 2, oy = (H - c * NY) / 2;
        for (let y = 0; y < NY; y++) for (let x = 0; x < NX; x++) {
          const ch = MAP[y][x], X0 = ox + x * c, Y0 = oy + y * c;
          if (ch === '#') { ctx.fillStyle = C.ink; ctx.fillRect(X0, Y0, c, c); continue; }
          if (ch === 'G') { ctx.fillStyle = '#3f9d6a'; ctx.fillRect(X0, Y0, c, c); continue; }
          if (ch === 'X') { ctx.fillStyle = C.pos; ctx.fillRect(X0, Y0, c, c); continue; }
          const b = best(x, y), v = Q[qi(x, y, b)], seen = [0, 1, 2, 3].some(a => Q[qi(x, y, a)] !== 0);
          ctx.fillStyle = seen ? diverge(Math.max(-1, Math.min(1, v / 8))) : '#fff'; ctx.fillRect(X0, Y0, c, c);
          if (seen) { const [dx, dy] = A[b]; TFG.arrow(ctx, X0 + c / 2 - dx * c * 0.25, Y0 + c / 2 - dy * c * 0.25, X0 + c / 2 + dx * c * 0.28, Y0 + c / 2 + dy * c * 0.28, C.ink, 1.8, Math.max(5, c * 0.18)); }
          if (ch === 'S') { ctx.strokeStyle = '#3f9d6a'; ctx.lineWidth = 3; ctx.strokeRect(X0 + 2, Y0 + 2, c - 4, c - 4); }
        }
        ctx.strokeStyle = 'rgba(157,164,173,.5)'; ctx.lineWidth = 0.7; ctx.beginPath();
        for (let x = 0; x <= NX; x++) { ctx.moveTo(ox + x * c, oy); ctx.lineTo(ox + x * c, oy + NY * c); }
        for (let y = 0; y <= NY; y++) { ctx.moveTo(ox, oy + y * c); ctx.lineTo(ox + NX * c, oy + y * c); } ctx.stroke();
        ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.strokeRect(ox, oy, NX * c, NY * c);
        ctx.fillStyle = '#fff'; ctx.font = `700 ${Math.round(c * 0.3)}px "Be Vietnam Pro", sans-serif`; ctx.textAlign = 'center';
        MAP.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === 'G') ctx.fillText('+10', ox + (x + 0.5) * c, oy + (y + 0.6) * c); if (ch === 'X') ctx.fillText('−10', ox + (x + 0.5) * c, oy + (y + 0.6) * c); }));
        ctx.fillStyle = C.gold; ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(ox + (pos[0] + 0.5) * c, oy + (pos[1] + 0.5) * c, c * 0.22, 0, 7); ctx.fill(); ctx.stroke();
      }
      if (sp.ctx) {
        const { ctx, W, H } = sp; ctx.clearRect(0, 0, W, H);
        const l = 46, rr = 12, t = 18, b = 20, w = W - l - rr, h = H - t - b, Y = s => t + h - s / MAXSTEP * h;
        ctx.strokeStyle = C.line; [0, 100, 200].forEach(s => { ctx.beginPath(); ctx.moveTo(l, Y(s)); ctx.lineTo(l + w, Y(s)); ctx.stroke(); });
        ctx.fillStyle = C.muted; ctx.font = '11.5px "Be Vietnam Pro", sans-serif'; ctx.textAlign = 'right'; [0, 100, 200].forEach(s => ctx.fillText(s, l - 6, Y(s) + 4));
        ctx.textAlign = 'left'; ctx.fillStyle = C.ink; ctx.fillText(W < 600 ? 'số bước mỗi lượt (xanh: tới đích, đỏ: té)' : 'số bước mỗi lượt (300 lượt gần nhất); chấm xanh: tới đích, đỏ: té, xám: hết giờ', l, t - 5);
        hist.forEach(([s, ch], i) => { ctx.fillStyle = ch === 'G' ? '#3f9d6a' : ch === 'X' ? C.pos : '#9DA4AD'; ctx.fillRect(l + i / 299 * w - 1.5, Y(s) - 1.5, 3, 3); });
      }
    }
  },
});
})();
