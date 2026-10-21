/* =====================================================================
   Robotics: minh họa "Học bắt chước bị trôi, DAgger sửa" (id: dagger, trang 5-tu-hoc.html)
   Xe chạy thẳng 5 m/s trong làn rộng 2 m (lệch ngang |y| ≤ 1 m), lề đường ở |y| = 2,2 m (văng ra thì đặt lại giữa làn).
   Trạng thái: y (lệch ngang, m), ψ (hướng xe, rad). Gió ngang là nhiễu ngẫu nhiên có quán tính.
   Người lái mẫu: góc lái = −2·y − 3,5·ψ (giới hạn ±1,5).
   Robot học bắt chước: tra 3 mẫu gần nhất trong dữ liệu (k-nearest neighbors) rồi lấy trung bình góc lái.
   Dữ liệu ban đầu: người lái mẫu chạy 30 s trong ngày gió nhẹ (0,15).
   DAgger: robot tự lái 30 s; mỗi trạng thái nó đi qua được người lái mẫu "chấm" góc lái đúng, thêm vào dữ liệu.
   Chạy độc lập: lib/demos/run.html?demo=dagger
   ===================================================================== */
(() => {
const { COLORS: C, watchCanvas, setTxt, num, range, rng } = TFG;
const V = 5, DT = 0.05, T = 30, SMAX = 1.5, LANE = 1, EDGE = 2.2;
const expert = (y, p) => Math.max(-SMAX, Math.min(SMAX, -2 * y - 3.5 * p));
function knn(D, y, p) {
  const b = [[Infinity, 0], [Infinity, 0], [Infinity, 0]];
  for (const d of D) { const dd = ((d[0] - y) / 0.3) ** 2 + ((d[1] - p) / 0.1) ** 2; if (dd < b[2][0]) { b[2] = [dd, d[2]]; b.sort((u, v) => u[0] - v[0]); } }
  return (b[0][1] + b[1][1] + b[2][1]) / 3;
}
function run(pol, wind, seed, rec) {
  const r = rng(seed); let y = 0, p = 0, g = 0, out = 0; const tr = [], crashes = [];
  for (let i = 0, t = 0; t < T; i++, t = i * DT) {
    g += -g * 0.5 * DT + wind * Math.sqrt(DT) * r.gauss();
    const s = pol(y, p); p += s * DT; y += V * Math.sin(p) * DT + g * DT;
    tr.push([t, y, p]); if (rec) rec.push([y, p]);
    if (Math.abs(y) > LANE) out++;
    if (Math.abs(y) > EDGE) { crashes.push([t, Math.sign(y) * EDGE]); y = 0; p = 0; g = 0; }
  }
  return { tr, crashes, out: out / (T / DT) };
}
TFG.demo('dagger', {
  html: `<div class="demo-title"><h4>Học bắt chước bị trôi, DAgger sửa</h4><span>Robot học lái xe từ người lái mẫu</span></div>
    <div class="demo-body">
      <div class="stagebox">
        <canvas id="dgRoad" class="ar" role="img" aria-label="Con đường nhìn từ trên xuống theo thời gian 30 giây: vạch làn, lề đường, và vệt chạy của xe; dấu X đỏ là chỗ xe văng khỏi đường."></canvas>
        <canvas id="dgState" class="profile" style="height:180px" role="img" aria-label="Bản đồ dữ liệu: trục ngang là độ lệch ngang, trục dọc là hướng xe; chấm xám là dữ liệu mẫu, chấm vàng là dữ liệu DAgger, vệt xanh là những trạng thái robot vừa đi qua."></canvas>
      </div>
      <div class="panel">
        <div class="ctrl"><label for="dgW">Gió ngang lúc chạy thử</label><output for="dgW"></output>
          <input type="range" id="dgW" min="0" max="1.5" step="0.05" value="1"></div>
        <div class="btnrow">
          <button class="btn" type="button" id="dgExp">Người lái mẫu chạy</button>
          <button class="btn" type="button" id="dgBc">Robot bắt chước chạy</button>
        </div>
        <div class="btnrow">
          <button class="btn" type="button" id="dgAgg">DAgger: thêm 1 vòng sửa</button>
          <button class="btn" type="button" id="dgReset">Làm lại dữ liệu</button>
        </div>
        <dl class="readout">
          <dt>Số mẫu dữ liệu</dt><dd id="dgN">—</dd>
          <dt>Số vòng DAgger</dt><dd id="dgK">0</dd>
          <dt>Lần chạy vừa rồi</dt><dd id="dgWho" style="font-family:var(--body)">—</dd>
          <dt>Thời gian ra khỏi làn</dt><dd id="dgOut" class="big">—</dd>
          <dt>Số lần văng khỏi đường</dt><dd id="dgCr" class="big">—</dd>
        </dl>
        <p class="note-s">Dữ liệu ban đầu: người lái mẫu chạy 30 giây trong ngày gió nhẹ, nên chỉ toàn trạng thái sát giữa làn (cụm chấm xám nhỏ). Gió mạnh đẩy robot ra chỗ nó chưa từng thấy, nó hổng biết phải lái sao.</p>
      </div>
    </div>`,
  init() {
    const cr = document.getElementById('dgRoad'), cs = document.getElementById('dgState'), sr = {}, ss = {};
    const W = range('dgW', { show: v => num(v, 2) });
    let D, rounds, seed = 7, last = null, who = '', demoRun;
    function resetData() { D = []; demoRun = run((y, p) => { const s = expert(y, p); D.push([y, p, s, 0]); return s; }, 0.15, 1); rounds = 0; last = null; who = ''; draw(); }
    const show = (name, res) => { last = res; who = name; draw(); };
    document.getElementById('dgExp').onclick = () => show('Người lái mẫu', run(expert, W.get(), seed++));
    document.getElementById('dgBc').onclick = () => show('Robot bắt chước', run((y, p) => knn(D, y, p), W.get(), seed++));
    document.getElementById('dgAgg').onclick = () => {
      const vis = []; run((y, p) => knn(D, y, p), Math.max(W.get(), 0.5), 100 + rounds, vis);
      vis.filter((_, i) => i % 3 === 0).forEach(([y, p]) => D.push([y, p, expert(y, p), 1])); rounds++;
      show('Robot bắt chước (sau ' + rounds + ' vòng DAgger)', run((y, p) => knn(D, y, p), W.get(), seed++));
    };
    document.getElementById('dgReset').onclick = resetData;
    W.upd(); resetData();
    watchCanvas(cr, sr, () => draw()); watchCanvas(cs, ss, () => draw());
    function draw() {
      setTxt('dgN', D.length); setTxt('dgK', rounds); setTxt('dgWho', who || '—');
      setTxt('dgOut', last ? num(last.out * 100, 3) + ' %' : '—'); setTxt('dgCr', last ? last.crashes.length : '—');
      if (sr.ctx) {
        const { ctx, W: w0, H } = sr; ctx.clearRect(0, 0, w0, H);
        const l = 44, r = 12, t = 24, b = 28, w = w0 - l - r, h = H - t - b, X = tt => l + tt / T * w, Y = y => t + h / 2 - y / 2.6 * h / 2;
        ctx.fillStyle = '#C9D3BC'; ctx.fillRect(l, t, w, h);
        ctx.fillStyle = '#E6EAEE'; ctx.fillRect(l, Y(EDGE), w, Y(-EDGE) - Y(EDGE));
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.setLineDash([14, 10]); [LANE, -LANE].forEach(q => { ctx.beginPath(); ctx.moveTo(l, Y(q)); ctx.lineTo(l + w, Y(q)); ctx.stroke(); }); ctx.setLineDash([]);
        ctx.strokeStyle = '#59606B'; ctx.lineWidth = 2.5; [EDGE, -EDGE].forEach(q => { ctx.beginPath(); ctx.moveTo(l, Y(q)); ctx.lineTo(l + w, Y(q)); ctx.stroke(); });
        ctx.fillStyle = C.muted; ctx.font = '11.5px "Be Vietnam Pro", sans-serif'; ctx.textAlign = 'right';
        [['làn', LANE], ['lề', EDGE]].forEach(([s, q]) => { ctx.fillText(s, l - 6, Y(q) + 4); ctx.fillText(s, l - 6, Y(-q) + 4); });
        ctx.textAlign = 'center'; ctx.fillText('thời gian (30 giây) →', l + w / 2, H - 8);
        ctx.textAlign = 'left'; ctx.fillStyle = C.ink; ctx.fillText(last ? who + ', gió ' + num(W.get(), 2) : 'Bấm một nút để chạy thử', l, 16);
        if (last) {
          ctx.strokeStyle = who.startsWith('Người') ? '#3f9d6a' : C.sea; ctx.lineWidth = 2.4; ctx.beginPath();
          let prev = null; last.tr.forEach(([tt, y]) => { if (prev !== null && Math.abs(y - prev) > 1) ctx.moveTo(X(tt), Y(y)); else if (prev === null) ctx.moveTo(X(tt), Y(y)); else ctx.lineTo(X(tt), Y(y)); prev = y; }); ctx.stroke();
          ctx.strokeStyle = C.pos; ctx.lineWidth = 3; last.crashes.forEach(([tt, y]) => { const x = X(tt), yy = Y(y); ctx.beginPath(); ctx.moveTo(x - 7, yy - 7); ctx.lineTo(x + 7, yy + 7); ctx.moveTo(x + 7, yy - 7); ctx.lineTo(x - 7, yy + 7); ctx.stroke(); });
        }
      }
      if (ss.ctx) {
        const { ctx, W: w0, H } = ss; ctx.clearRect(0, 0, w0, H);
        const l = 44, r = 12, t = 22, b = 26, w = w0 - l - r, h = H - t - b, X = y => l + (y + 2.4) / 4.8 * w, Y = p => t + h / 2 - p / 0.6 * h / 2;
        ctx.strokeStyle = C.line; ctx.beginPath(); ctx.moveTo(l, Y(0)); ctx.lineTo(l + w, Y(0)); ctx.moveTo(X(0), t); ctx.lineTo(X(0), t + h); ctx.stroke();
        ctx.fillStyle = C.muted; ctx.font = '11.5px "Be Vietnam Pro", sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('lệch ngang y (−2,4 → 2,4 m)', l + w / 2, H - 6);
        ctx.textAlign = 'left'; ctx.fillStyle = C.ink; ctx.fillText(w0 < 600 ? 'dữ liệu (xám: mẫu, vàng: DAgger), xanh: robot' : 'dữ liệu đã có (xám: mẫu, vàng: DAgger) và trạng thái robot vừa đi qua (xanh)', l, 14);
        if (last) { ctx.strokeStyle = 'rgba(55,135,196,.45)'; ctx.lineWidth = 1.2; ctx.beginPath(); let pr = null; last.tr.forEach(([, y, p]) => { if (pr && Math.abs(y - pr) > 1) ctx.moveTo(X(y), Y(p)); else if (!pr) ctx.moveTo(X(y), Y(p)); else ctx.lineTo(X(y), Y(p)); pr = y; }); ctx.stroke(); }
        D.forEach(([y, p, , src]) => { ctx.fillStyle = src ? 'rgba(242,194,48,.9)' : 'rgba(89,96,107,.7)'; ctx.fillRect(X(y) - 1.5, Y(Math.max(-0.6, Math.min(0.6, p))) - 1.5, 3, 3); });
      }
    }
  },
});
})();
