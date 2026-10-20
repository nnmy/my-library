/* =====================================================================
   AI: minh họa "Học tương phản kiểu CLIP" (id: clip, trang 4-multimodal.html)
   HUẤN LUYỆN THẬT trong trình duyệt: 6 cặp (ảnh, chú thích); mỗi ảnh và mỗi chú thích có một
   vector 2D tự do (thay cho encoder), chuẩn hóa lên đường tròn đơn vị.
   Hàm mất mát InfoNCE đối xứng: L = ½[CE(hàng) + CE(cột)] trên ma trận S = (z_ảnh · z_chữ)/τ.
   Tối ưu bằng gradient descent có momentum, gradient tính tay.
   Chạy độc lập: lib/demos/run.html?demo=clip
   ===================================================================== */
(() => {
const { COLORS: C, range, watchCanvas, setTxt, rng, heat, num, softmax, loopWhenVisible, xy, REDUCED } = TFG;
const IDS = ['meo', 'cho', 'ca', 'nha', 'cay', 'xe'];
const CAP = ['"một con mèo"', '"một con chó"', '"một con cá"', '"một ngôi nhà"', '"một cái cây"', '"một chiếc xe"'];
const n = IDS.length;

TFG.demo('clip', {
  deps: ['sprites'],
  html: `<div class="demo-title"><h4>Học tương phản kiểu CLIP</h4><span>Bấm Huấn luyện; chỉnh nhiệt độ τ; bấm một hàng của ma trận</span></div>
    <div class="demo-body">
      <div class="stagebox"><canvas id="cvCl" class="ar tall" role="img" aria-label="Bên trái: vector embedding của ảnh và chú thích trên đường tròn đơn vị. Bên phải: ma trận tương đồng 6×6."></canvas></div>
      <div class="panel">
        <div class="btnrow">
          <button class="btn" type="button" id="clGo">▶ Huấn luyện</button>
          <button class="btn" type="button" id="clRe">Khởi tạo lại</button>
        </div>
        <div class="ctrl"><label for="clT">Nhiệt độ τ</label><output for="clT"></output>
          <input type="range" id="clT" min="-1.3" max="0" step="0.01" value="-0.7"></div>
        <dl class="readout">
          <dt>Bước</dt><dd id="clS">0</dd>
          <dt>Loss InfoNCE</dt><dd class="big" id="clL">—</dd>
          <dt>Ghép đúng (ảnh → chữ)</dt><dd id="clA">—</dd>
        </dl>
        <div>
          <div class="note-s" style="margin-bottom:4px">Zero-shot: ảnh <b id="clQ">—</b> được gán chú thích nào?</div>
          <div class="bars" id="clB"></div>
        </div>
        <p class="note-s">Mũi tên liền: embedding ảnh; mũi tên nét đứt (có nhãn chữ): embedding chú thích. Cùng màu là một cặp đúng. Loss kéo chúng lại gần nhau và đẩy các cặp sai ra xa. Trong CLIP thật, vector do encoder ảnh (ViT) và encoder văn bản (Transformer) tạo ra, có 512–1024 chiều, và mỗi batch có tới 32 768 cặp.</p>
      </div>
    </div>`,
  init() {
    const cv = document.getElementById('cvCl'); const st = {};
    const imgs = IDS.map(id => TFG.SPR.render(id, 12));
    const COL = ['#E88C28', '#8A5A34', '#C9A400', '#D8312A', '#3F9D6A', '#3787c4'];
    const tR = range('clT', { map: v => 10 ** v, show: v => num(v, 3), onInput: () => { if (!run) draw(); } });
    let U, V, mU, mV, step, run = false, q = 0, R = rng(4), lossHist = [];
    function reset() {
      const a = () => { const t = R() * 2 * Math.PI; return [Math.cos(t), Math.sin(t)]; };
      U = IDS.map(a); V = IDS.map(a); mU = IDS.map(() => [0, 0]); mV = IDS.map(() => [0, 0]); step = 0; lossHist = [];
    }
    const norm = v => { const L = Math.hypot(v[0], v[1]) || 1e-9; return [v[0] / L, v[1] / L]; };
    function forward() {
      const z = U.map(norm), w = V.map(norm), tau = tR.get();
      const S = z.map(a => w.map(b => (a[0] * b[0] + a[1] * b[1]) / tau));
      const Pr = S.map(r => softmax(r)), Pc = S[0].map((_, j) => softmax(S.map(r => r[j])));   // Pc[j][i]
      let loss = 0; for (let i = 0; i < n; i++) loss += -Math.log(Pr[i][i] + 1e-12) - Math.log(Pc[i][i] + 1e-12);
      return { z, w, tau, S, Pr, Pc, loss: loss / (2 * n) };
    }
    function trainStep() {
      const { z, w, tau, Pr, Pc } = forward(), lr = 0.08, mom = 0.85;
      const gz = z.map(() => [0, 0]), gw = w.map(() => [0, 0]);
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        const G = ((Pr[i][j] - (i === j)) + (Pc[j][i] - (i === j))) / (2 * n) / tau;
        gz[i][0] += G * w[j][0]; gz[i][1] += G * w[j][1]; gw[j][0] += G * z[i][0]; gw[j][1] += G * z[i][1];
      }
      const upd = (P, M, g, zz) => P.forEach((p, i) => {
        const L = Math.hypot(p[0], p[1]), d = g[i][0] * zz[i][0] + g[i][1] * zz[i][1];
        const gx = (g[i][0] - d * zz[i][0]) / L, gy = (g[i][1] - d * zz[i][1]) / L;   // chiếu lên tiếp tuyến của chuẩn hóa
        M[i][0] = mom * M[i][0] - lr * gx; M[i][1] = mom * M[i][1] - lr * gy;
        p[0] += M[i][0]; p[1] += M[i][1]; const L2 = Math.hypot(p[0], p[1]); p[0] /= L2; p[1] /= L2;
      });
      upd(U, mU, gz, z); upd(V, mV, gw, w); step++;
    }
    reset();
    const go = document.getElementById('clGo');
    go.addEventListener('click', () => { run = !run; go.textContent = run ? '⏸ Tạm dừng' : '▶ Huấn luyện'; if (REDUCED && run) { for (let k = 0; k < 300; k++) trainStep(); run = false; go.textContent = '▶ Huấn luyện'; } draw(); });
    document.getElementById('clRe').addEventListener('click', () => { R = rng(Math.floor(Math.random() * 1e6)); reset(); draw(); });
    let geo = null;
    cv.addEventListener('pointerdown', e => { if (!geo) return; const [x, y] = xy(cv, e); const i = Math.floor((y - geo.my) / geo.mc); if (x > geo.mx - 60 && x < geo.mx + n * geo.mc && i >= 0 && i < n) { q = i; draw(); } });
    watchCanvas(cv, st, draw);
    loopWhenVisible(cv, () => { if (!run) return; for (let k = 0; k < 2; k++) trainStep(); if (step > 600) { run = false; go.textContent = '▶ Huấn luyện'; } draw(); });
    function draw() {
      const { ctx, W, H } = st; if (!ctx) return;
      const f = forward(); if (run || !lossHist.length) lossHist.push(f.loss); if (lossHist.length > 400) lossHist.shift();
      ctx.clearRect(0, 0, W, H);
      const wide = W > 540;
      const r = wide ? Math.min(H * 0.36, W * 0.22) : Math.min(W * 0.3, H * 0.2), cx = wide ? r + 50 : W / 2, cy = wide ? H / 2 : r + 56;
      ctx.strokeStyle = C.line; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = C.muted; ctx.font = '12px "Be Vietnam Pro", sans-serif'; ctx.fillText('không gian embedding chung', cx - r, cy - r - 36);
      for (let i = 0; i < n; i++) {
        const [ax, ay] = f.z[i], [bx, by] = f.w[i];
        TFG.arrow(ctx, cx, cy, cx + ax * r, cy - ay * r, COL[i], 2.5, 8);
        ctx.setLineDash([4, 3]); TFG.arrow(ctx, cx, cy, cx + bx * r, cy - by * r, COL[i], 1.5, 7); ctx.setLineDash([]);
        const s = 22; TFG.SPR.draw(ctx, imgs[i], cx + ax * (r + 16) - s / 2, cy - ay * (r + 16) - s / 2, s);
        ctx.strokeStyle = COL[i]; ctx.lineWidth = 2; ctx.strokeRect(cx + ax * (r + 16) - s / 2, cy - ay * (r + 16) - s / 2, s, s);
        const lab = CAP[i].replace(/"/g, '').replace('một ', ''), tx = cx + bx * r * 0.72, ty = cy - by * r * 0.72;
        ctx.font = '600 11.5px "Be Vietnam Pro", sans-serif'; const tw = ctx.measureText(lab).width;
        ctx.fillStyle = 'rgba(251,252,253,.9)'; ctx.fillRect(tx - tw / 2 - 3, ty - 8, tw + 6, 15);
        ctx.fillStyle = COL[i]; ctx.textAlign = 'center'; ctx.fillText(lab, tx, ty + 4); ctx.textAlign = 'left';
      }
      // ma trận
      const mc = wide ? Math.min(32, (W - cx - r - 140) / n, (H - 120) / n) : Math.min(30, (W - 90) / n), mx = wide ? cx + r + 110 : 70, my = wide ? (H - mc * n) / 2 : cy + r + 70;
      geo = { mx, my, mc };
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        const sim = f.S[i][j] * f.tau; ctx.fillStyle = heat((sim + 1) / 2); ctx.fillRect(mx + j * mc, my + i * mc, mc, mc);
      }
      ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.strokeRect(mx, my, mc * n, mc * n);
      ctx.strokeStyle = C.pos; ctx.lineWidth = 2.5; ctx.strokeRect(mx - 1, my + q * mc, mc * n + 2, mc);
      for (let i = 0; i < n; i++) { TFG.SPR.draw(ctx, imgs[i], mx - mc - 4, my + i * mc + 2, mc - 4); ctx.fillStyle = COL[i]; ctx.fillRect(mx + i * mc + 3, my - 9, mc - 6, 5); }
      ctx.fillStyle = C.ink; ctx.font = '12px "Be Vietnam Pro", sans-serif'; ctx.fillText('cos(ảnh, chữ)', mx, my - 16);
      ctx.fillStyle = C.muted; ctx.fillText('hàng: ảnh · cột: chú thích', mx, my + mc * n + 16);
      // đường loss
      const lx = mx, ly = my + mc * n + 30, lw = Math.max(80, mc * n), lh = 40;
      if (ly + lh < H - 4 && lossHist.length > 1) {
        const mxL = Math.max(...lossHist, 0.1);
        ctx.strokeStyle = C.line; ctx.strokeRect(lx, ly, lw, lh); ctx.strokeStyle = C.sea; ctx.lineWidth = 1.5; ctx.beginPath();
        lossHist.forEach((v, k) => { const x = lx + k / (lossHist.length - 1) * lw, y = ly + lh - v / mxL * lh; k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke();
        ctx.fillStyle = C.muted; ctx.fillText('loss', lx + lw + 4, ly + 10);
      }
      setTxt('clS', step); setTxt('clL', num(f.loss, 3));
      const acc = f.S.filter((row, i) => row.indexOf(Math.max(...row)) === i).length; setTxt('clA', acc + ' / ' + n);
      setTxt('clQ', CAP[q].replace(/"/g, '').replace('một ', ''));
      const pr = f.Pr[q];
      document.getElementById('clB').innerHTML = pr.map((p, j) => `<span class="lab">${CAP[j]}</span><div class="bar"><i style="width:${(p * 100).toFixed(1)}%;background:${COL[j]}"></i></div><span class="v">${(p * 100).toFixed(0)}%</span>`).join('');
    }
    tR.upd();
  },
});
})();
