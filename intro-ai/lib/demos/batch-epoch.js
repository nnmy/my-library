/* =====================================================================
   AI: minh họa "Batch, iteration và epoch" (id: batch-epoch, trang 1-cnn.html)
   Kho dữ liệu N = 64 điểm, mô hình đường thẳng ŷ = w·x + b, độ lỗi MSE.
   Mỗi epoch xáo trộn kho rồi cắt thành các lô (batch) cỡ B; mỗi lô cho một bước cập nhật.
   Trái: bản đồ độ lỗi theo (w, b) và đường đi. Phải: kho dữ liệu, lô vừa dùng, đường thẳng hiện tại.
   Dưới: độ lỗi trên cả kho theo số epoch (vạch mờ là lần chạy trước để so sánh).
   Tự chạy: mọi cỡ lô "xem" cùng một số hình mỗi giây (cùng khối lượng tính toán).
   Chạy độc lập: lib/demos/run.html?demo=batch-epoch
   ===================================================================== */
(() => {
const { COLORS: C, watchCanvas, setTxt, num, range, rng, heat, loopWhenVisible } = TFG;
const N = 64, BS = [1, 2, 4, 8, 16, 32, 64], EMAX = 30;
const W0 = -2, W1 = 3.5, B0 = -2.5, B1 = 2.5, START = [-1.5, 2.0];
const GREY = '#9DA4AD';

// kho dữ liệu (cố định, có seed): y = 1,2x − 0,4 + nhiễu
const r = rng(5), X = [], Y = [];
for (let i = 0; i < N; i++) { const x = -0.2 + 2 * (i + r()) / N; X.push(x); Y.push(1.2 * x - 0.4 + 0.3 * r.gauss()); }
// các trung bình để tính độ lỗi trên cả kho thật nhanh
const m = (f) => X.reduce((s, x, i) => s + f(x, Y[i]), 0) / N;
const Sx = m(x => x), Sy = m((x, y) => y), Sxx = m(x => x * x), Sxy = m((x, y) => x * y), Syy = m((x, y) => y * y);
const loss = (w, b) => w * w * Sxx + 2 * w * b * Sx + b * b - 2 * w * Sxy - 2 * b * Sy + Syy;
const det = Sxx - Sx * Sx, WOPT = (Sxy - Sx * Sy) / det, BOPT = Sy - WOPT * Sx, LOPT = loss(WOPT, BOPT);
const LSTART = loss(...START);

TFG.demo('batch-epoch', {
  html: `<div class="demo-title"><h4>Batch, iteration và epoch</h4><span>Chọn cỡ lô, cho chạy, rồi đổi cỡ lô để so với lần trước</span></div>
    <div class="demo-body">
      <div class="stagebox">
        <canvas id="beCv" class="ar" role="img" aria-label="Bên trái: bản đồ độ lỗi theo hai trọng số w và b, với đường đi của các bước cập nhật. Bên phải: 64 điểm dữ liệu, các điểm thuộc lô vừa dùng được tô vàng, đường thẳng mô hình hiện tại."></canvas>
        <canvas id="beLoss" class="profile" role="img" aria-label="Độ lỗi trên cả kho dữ liệu theo số epoch, của lần chạy hiện tại và lần chạy trước."></canvas>
      </div>
      <div class="panel">
        <div class="ctrl"><label for="beB">Cỡ lô (batch size) B</label><output for="beB"></output>
          <input type="range" id="beB" min="0" max="6" step="1" value="3"></div>
        <div class="ctrl"><label for="beLr">Tốc độ học</label><output for="beLr"></output>
          <input type="range" id="beLr" min="-1.7" max="-0.25" step="0.01" value="-0.82"></div>
        <div class="btnrow">
          <button class="btn" type="button" id="beStep">1 bước</button>
          <button class="btn" type="button" id="beEpoch">1 epoch</button>
          <button class="btn" type="button" id="beRun" aria-pressed="false">Tự chạy</button>
          <button class="btn" type="button" id="beReset">Làm lại</button>
        </div>
        <dl class="readout">
          <dt>Bước mỗi epoch</dt><dd id="beSpe">—</dd>
          <dt>Số bước đã đi</dt><dd id="beN">0</dd>
          <dt>Epoch</dt><dd id="beEp">0</dd>
          <dt>Độ lỗi trên cả kho</dt><dd id="beL" class="big">—</dd>
        </dl>
        <div class="legend"><span><i style="background:${C.gold}"></i>lô vừa dùng</span><span><i style="background:${C.sky}"></i>đã dùng trong epoch này</span><span><i style="background:#fff"></i>chưa tới lượt</span></div>
        <p class="note-s">Mỗi bước chỉ nhìn B điểm nên hướng đi lệch chút đỉnh so với hướng “thật” tính trên cả kho. Lô nhỏ: nhiều bước mỗi epoch, đường đi lắc lư. Lô to: ít bước, đường đi mượt. Khi tự chạy, mọi cỡ lô xem cùng số điểm mỗi giây, nên trục epoch ở dưới so sánh công bằng về khối lượng tính.</p>
      </div>
    </div>`,
  init(el) {
    const cv = document.getElementById('beCv'), cl = document.getElementById('beLoss'), st = {}, sl = {};
    let w, b, steps, seen, perm, pos, used, last, trail, hist, running = false, ghost = null, blown = false;
    const shuffle = () => { const p = [...Array(N).keys()], rr = rng(1 + Math.floor(seen / N) * 7919 + runSeed); for (let i = N - 1; i > 0; i--) { const j = Math.floor(rr() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; } return p; };
    let runSeed = 1;
    const bSize = () => BS[parseInt(document.getElementById('beB').value, 10)];
    const B = range('beB', { map: v => BS[v], show: v => v + (v === 1 ? ' (SGD thuần)' : v === N ? ' (cả kho)' : ''), onInput: () => reset(true) });
    const lr = range('beLr', { map: v => Math.pow(10, v), show: v => num(v, 2), onInput: () => reset(true) });
    const runBtn = document.getElementById('beRun');
    const setRun = v => { running = v; runBtn.setAttribute('aria-pressed', v); runBtn.textContent = v ? 'Dừng' : 'Tự chạy'; };

    function reset(keepGhost) {
      if (keepGhost && hist && hist.length > 1) ghost = { trail, hist, B: last && last.B };
      setRun(false); runSeed++;
      [w, b] = START; steps = 0; seen = 0; pos = 0; used = new Set(); last = null; blown = false;
      perm = shuffle(); trail = [[w, b]]; hist = [[0, loss(w, b)]];
      draw();
    }
    function step() {
      if (blown) return;
      const Bv = bSize();
      if (pos >= N) { pos = 0; used = new Set(); perm = shuffle(); }
      const idx = perm.slice(pos, pos + Bv);
      let gw = 0, gb = 0;
      idx.forEach(i => { const e = w * X[i] + b - Y[i]; gw += 2 * e * X[i]; gb += 2 * e; });
      gw /= idx.length; gb /= idx.length;
      w -= lr.get() * gw; b -= lr.get() * gb;
      if (!isFinite(w) || !isFinite(b) || Math.abs(w) > 60 || Math.abs(b) > 60) { blown = true; setRun(false); }
      pos += idx.length; seen += idx.length; steps++;
      idx.forEach(i => used.add(i)); last = { idx, B: Bv };
      trail.push([w, b]); hist.push([seen / N, Math.min(loss(w, b), 1e6)]);
      if (trail.length > 4000) trail.splice(1, 1);
    }
    document.getElementById('beStep').onclick = () => { setRun(false); step(); draw(); };
    document.getElementById('beEpoch').onclick = () => {
      setRun(false);
      if (pos >= N) step();                       // bắt đầu epoch mới bằng bước đầu tiên
      while (pos < N && !blown) step();
      draw();
    };
    runBtn.onclick = () => { if (!running && seen / N >= EMAX) reset(true); setRun(!running); };
    document.getElementById('beReset').onclick = () => reset(true);

    // tự chạy: một epoch mỗi 0,8 giây cho mọi cỡ lô (cùng số hình mỗi giây)
    let acc = 0;
    loopWhenVisible(el, dt => {
      if (!running) return;
      acc += dt * N / 0.8;
      let k = 0;
      while (acc >= bSize() && k < 200) { acc -= bSize(); step(); k++; if (seen / N >= EMAX || blown) { setRun(false); break; } }
      if (k) draw();
    });

    // ảnh nền bản đồ độ lỗi (vẽ một lần)
    const GW = 120, GH = 110, off = document.createElement('canvas'); off.width = GW; off.height = GH;
    (() => {
      const o = off.getContext('2d'), img = o.createImageData(GW, GH), lo = Math.log(LOPT), hi = Math.log(loss(W0, B1) * 1.2), NB = 12;
      const band = (i, j) => { const ww = W0 + (i + .5) / GW * (W1 - W0), bb = B1 - (j + .5) / GH * (B1 - B0); return Math.min(NB - 1, Math.floor((Math.log(loss(ww, bb)) - lo) / (hi - lo) * NB)); };
      const bands = []; for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) bands.push(band(i, j));
      for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
        const k = j * GW + i, bd = bands[k];
        const edge = (i + 1 < GW && bands[k + 1] !== bd) || (j + 1 < GH && bands[k + GW] !== bd);
        const col = heat(0.04 + 0.62 * bd / (NB - 1)).match(/\d+/g).map(Number);
        const f = edge ? 0.8 : 1;
        img.data[k * 4] = col[0] * f; img.data[k * 4 + 1] = col[1] * f; img.data[k * 4 + 2] = col[2] * f; img.data[k * 4 + 3] = 255;
      }
      o.putImageData(img, 0, 0);
    })();

    watchCanvas(cv, st, () => draw());
    watchCanvas(cl, sl, () => draw());
    B.upd(); lr.upd(); reset(false);

    function draw() {
      if (!st.ctx || !sl.ctx || !trail) return;
      const font = '"Be Vietnam Pro", sans-serif';
      // ---------- khung trên: bản đồ độ lỗi + dữ liệu ----------
      {
        const { ctx, W, H } = st; ctx.clearRect(0, 0, W, H);
        const gap = 18, pad = 12, lw = Math.min((W - gap - 2 * pad) * 0.52, H - 46), top = 12;
        const mx = pad + 30, mw = lw - 30, mh = H - top - 34;
        const MX = v => mx + (v - W0) / (W1 - W0) * mw, MY = v => top + (B1 - v) / (B1 - B0) * mh;
        ctx.imageSmoothingEnabled = false; ctx.drawImage(off, mx, top, mw, mh);
        ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5; ctx.strokeRect(mx + .5, top + .5, mw - 1, mh - 1);
        ctx.fillStyle = C.muted; ctx.font = '12px ' + font; ctx.textAlign = 'center';
        ctx.fillText('trọng số w', mx + mw / 2, top + mh + 26);
        for (let v = -2; v <= 3; v++) ctx.fillText(v, MX(v), top + mh + 13);
        ctx.save(); ctx.translate(pad + 4, top + mh / 2); ctx.rotate(-Math.PI / 2); ctx.fillText('độ lệch b', 0, 0); ctx.restore();
        ctx.textAlign = 'right'; for (let v = -2; v <= 2; v += 2) ctx.fillText(v, mx - 4, MY(v) + 4);
        ctx.save(); ctx.beginPath(); ctx.rect(mx, top, mw, mh); ctx.clip();
        const poly = (tr, col, wdt, dash) => { ctx.strokeStyle = col; ctx.lineWidth = wdt; ctx.setLineDash(dash || []); ctx.beginPath(); tr.forEach(([a, c], i) => i ? ctx.lineTo(MX(a), MY(c)) : ctx.moveTo(MX(a), MY(c))); ctx.stroke(); ctx.setLineDash([]); };
        if (ghost) poly(ghost.trail, GREY, 1.6, [4, 3]);
        poly(trail, C.sea, 1.8);
        if (trail.length < 160) { ctx.fillStyle = C.sea; trail.forEach(([a, c]) => { ctx.beginPath(); ctx.arc(MX(a), MY(c), 2, 0, 7); ctx.fill(); }); }
        // điểm tối ưu và vị trí hiện tại
        ctx.strokeStyle = C.ink; ctx.lineWidth = 2; const ox = MX(WOPT), oy = MY(BOPT);
        ctx.beginPath(); ctx.moveTo(ox - 6, oy - 6); ctx.lineTo(ox + 6, oy + 6); ctx.moveTo(ox + 6, oy - 6); ctx.lineTo(ox - 6, oy + 6); ctx.stroke();
        ctx.fillStyle = C.gold; ctx.beginPath(); ctx.arc(MX(w), MY(b), 6, 0, 7); ctx.fill(); ctx.stroke();
        ctx.restore();
        ctx.fillStyle = C.ink; ctx.font = '600 12.5px ' + font; ctx.textAlign = 'left';
        ctx.fillText('Bản đồ độ lỗi', mx + 6, top + 16);
        if (blown) { ctx.fillStyle = C.pos; ctx.font = '600 13px ' + font; ctx.fillText('Văng ra ngoài: tốc độ học quá lớn.', mx + 6, top + 34); }

        // dữ liệu
        const dx = pad + lw + gap, dw = W - dx - pad, dh = mh;
        const DX = v => dx + (v + 0.4) / 2.4 * dw, ylo = Math.min(...Y) - 0.3, yhi = Math.max(...Y) + 0.3, DY = v => top + (yhi - v) / (yhi - ylo) * dh;
        ctx.fillStyle = '#fff'; ctx.fillRect(dx, top, dw, dh); ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5; ctx.strokeRect(dx + .5, top + .5, dw - 1, dh - 1);
        ctx.fillStyle = C.muted; ctx.font = '12px ' + font; ctx.textAlign = 'center'; ctx.fillText('đầu vào x', dx + dw / 2, top + dh + 26);
        ctx.save(); ctx.beginPath(); ctx.rect(dx, top, dw, dh); ctx.clip();
        ctx.strokeStyle = GREY; ctx.setLineDash([5, 4]); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(DX(-0.4), DY(WOPT * -0.4 + BOPT)); ctx.lineTo(DX(2), DY(WOPT * 2 + BOPT)); ctx.stroke(); ctx.setLineDash([]);
        const inLast = new Set(last ? last.idx : []);
        X.forEach((x, i) => {
          ctx.fillStyle = inLast.has(i) ? C.gold : used.has(i) ? C.sky : '#fff';
          ctx.strokeStyle = C.ink; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(DX(x), DY(Y[i]), inLast.has(i) ? 5 : 3.6, 0, 7); ctx.fill(); ctx.stroke();
        });
        ctx.strokeStyle = C.sea; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(DX(-0.4), DY(w * -0.4 + b)); ctx.lineTo(DX(2), DY(w * 2 + b)); ctx.stroke();
        ctx.restore();
        ctx.fillStyle = C.ink; ctx.font = '600 12.5px ' + font; ctx.textAlign = 'left';
        ctx.fillText('Kho dữ liệu (64 điểm)', dx + 6, top + 16);
      }
      // ---------- khung dưới: độ lỗi theo epoch ----------
      {
        const { ctx, W, H } = sl; ctx.clearRect(0, 0, W, H); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
        const l = 52, rr = 14, t = 14, bt = 30, pw = W - l - rr, ph = H - t - bt;
        const maxEp = Math.max(seen / N, ghost ? ghost.hist[ghost.hist.length - 1][0] : 0);
        const xmax = Math.min(EMAX, Math.max(2, Math.ceil(maxEp)));
        const lo = Math.log(LOPT * 0.85), hi = Math.log(LSTART * 1.15);
        const PX = e => l + Math.min(e, xmax) / xmax * pw, PY = L => t + (hi - Math.log(Math.max(L, LOPT * 0.85))) / (hi - lo) * ph;
        ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.fillStyle = C.muted; ctx.font = '12px "Be Vietnam Pro", sans-serif'; ctx.textAlign = 'center';
        const every = xmax <= 10 ? 1 : xmax <= 20 ? 2 : 5;
        for (let e = 0; e <= xmax; e++) { ctx.beginPath(); ctx.moveTo(PX(e), t); ctx.lineTo(PX(e), t + ph); ctx.stroke(); if (e % every === 0) ctx.fillText(e, PX(e), t + ph + 14); }
        ctx.fillText('epoch (số lượt đi qua hết kho)', l + pw / 2, H - 3);
        ctx.save(); ctx.translate(13, t + ph / 2); ctx.rotate(-Math.PI / 2); ctx.fillText('độ lỗi (log)', 0, 0); ctx.restore();
        ctx.strokeStyle = C.ink; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(l, PY(LOPT)); ctx.lineTo(l + pw, PY(LOPT)); ctx.stroke(); ctx.setLineDash([]);
        ctx.textAlign = 'right'; ctx.fillText('đáy', l - 4, PY(LOPT) + 4);
        ctx.save(); ctx.beginPath(); ctx.rect(l, t - 2, pw + 2, ph + 4); ctx.clip();
        const line = (h, col, wdt) => { ctx.strokeStyle = col; ctx.lineWidth = wdt; ctx.beginPath(); h.forEach(([e, L], i) => { if (e > xmax) return; i ? ctx.lineTo(PX(e), PY(L)) : ctx.moveTo(PX(e), PY(L)); }); ctx.stroke(); };
        if (ghost) line(ghost.hist, GREY, 1.6);
        line(hist, C.sea, 2);
        ctx.restore();
        ctx.textAlign = 'right'; ctx.font = '600 12.5px "Be Vietnam Pro", sans-serif';
        ctx.fillStyle = C.sea; ctx.fillText('lần này: B = ' + bSize(), l + pw - 8, t + 14);
        if (ghost && ghost.B) { ctx.fillStyle = C.muted; ctx.fillText('lần trước: B = ' + ghost.B, l + pw - 8, t + 30); }
      }
      const spe = Math.ceil(N / bSize());
      setTxt('beSpe', spe + (spe === 1 ? ' bước' : ' bước') + ' (64 ÷ ' + bSize() + ')');
      setTxt('beN', steps); setTxt('beEp', num(seen / N, 3)); setTxt('beL', blown ? '—' : num(loss(w, b), 3));
    }
  },
});
})();
