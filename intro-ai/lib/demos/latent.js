/* =====================================================================
   AI: minh họa "Không gian ẩn 2D" (id: latent, trang 3-generative.html)
   MÔ PHỎNG KHÁI NIỆM: "decoder" ở đây là phép trộn mềm các ảnh mẫu theo khoảng cách
   tới tâm từng lớp trong không gian ẩn, không phải mạng nơ-ron đã huấn luyện.
   - Chế độ VAE: mã ẩn của dữ liệu trải rộng, phủ kín phân phối N(0, I) -> mọi điểm đều giải mã ra ảnh hợp lý.
   - Chế độ AE thường: mã ẩn co thành cụm nhỏ rời rạc -> vùng giữa các cụm giải mã ra "rác".
   Chạy độc lập: lib/demos/run.html?demo=latent
   ===================================================================== */
(() => {
const { COLORS: C, watchCanvas, drag, setTxt, pressGroup, rng, num } = TFG;
const CLS = [
  { id: 'meo', c: [-1.1, 0.75], col: '#E88C28' },
  { id: 'cho', c: [-1.05, -0.85], col: '#8A5A34' },
  { id: 'ca', c: [1.1, -0.8], col: '#C9A400' },
  { id: 'nha', c: [1.05, 0.85], col: '#D8312A' },
  { id: 'cay', c: [0.0, 0.05], col: '#3F9D6A' },
];
const N = 16;

TFG.demo('latent', {
  deps: ['sprites'],
  html: `<div class="demo-title"><h4>Không gian ẩn 2D</h4><span>Kéo con trỏ z trong không gian ẩn; so sánh AE và VAE</span></div>
    <div class="demo-body">
      <div class="stagebox"><canvas id="cvLat" class="ar tall" role="img" aria-label="Bên trái: mặt phẳng ẩn với các đám điểm theo lớp và con trỏ z. Bên phải: ảnh giải mã từ z."></canvas>
        <div class="hint">Kéo ô vuông đen (z). Vòng nét đứt: vùng 1σ, 2σ của N(0, I).</div></div>
      <div class="panel">
        <div class="btnrow" role="group" aria-label="Loại mô hình">
          <button class="btn" type="button" data-m="ae" aria-pressed="false">Autoencoder thường</button>
          <button class="btn" type="button" data-m="vae" aria-pressed="true">VAE</button>
        </div>
        <div class="btnrow">
          <button class="btn" type="button" id="ltS">Lấy mẫu z ~ N(0, I)</button>
          <button class="btn" type="button" id="ltI">Nội suy mèo → cá</button>
        </div>
        <dl class="readout">
          <dt>z</dt><dd class="big" id="ltZ">—</dd>
          <dt>Giống nhất với</dt><dd id="ltC">—</dd>
          <dt>Độ "hợp lệ"</dt><dd id="ltV">—</dd>
        </dl>
        <p class="note-s">AE thường chỉ học nén rồi giải nén, nên mã ẩn nằm thành cụm rời rạc ở chỗ tùy ý; lấy một điểm ngẫu nhiên thường rơi vào khoảng trống và ra ảnh vô nghĩa. VAE thêm số hạng KL ép mã ẩn bám phân phối N(0, I), nên không gian ẩn liền mạch: lấy mẫu hay nội suy đều ra ảnh hợp lý.</p>
        <p class="note-s"><b>Lưu ý:</b> đây là mô phỏng khái niệm; "decoder" là phép trộn các ảnh mẫu, không phải mạng đã huấn luyện.</p>
      </div>
    </div>`,
  init(root) {
    const cv = document.getElementById('cvLat'); const st = {};
    const imgs = CLS.map(k => TFG.SPR.render(k.id, N));
    const names = TFG.SPR.LIST.reduce((o, s) => (o[s.id] = s.name, o), {});
    let mode = 'vae'; const z = { k: [0.5, 0.4] }; let anim = null;
    // điểm dữ liệu (mã ẩn của tập huấn luyện)
    const R = rng(3);
    const AEC = [[-1.9, 1.6], [-0.6, -2.1], [2.0, -0.2], [0.9, 2.0], [0.2, 0.35]];   // tâm cụm của AE: chỗ tùy ý
    const pts = { vae: [], ae: [] };
    CLS.forEach((k, i) => { for (let n = 0; n < 40; n++) {
      pts.vae.push({ i, x: k.c[0] + R.gauss() * 0.42, y: k.c[1] + R.gauss() * 0.42 });
      pts.ae.push({ i, x: AEC[i][0] + R.gauss() * 0.09, y: AEC[i][1] + R.gauss() * 0.09 });
    } });
    const centers = () => (mode === 'vae' ? CLS.map(k => k.c) : AEC);
    const noise = TFG.SPR.render('meo', N); { const R2 = rng(11); for (let k = 0; k < noise.data.length; k++) noise.data[k] = R2(); }
    function decode([x, y]) {
      const cs = centers(), s2 = mode === 'vae' ? 0.35 : 0.06;
      const d2 = cs.map(c => (x - c[0]) ** 2 + (y - c[1]) ** 2);
      const lw = d2.map(d => -d / (2 * s2)), m = Math.max(...lw), w = lw.map(v => Math.exp(v - m)), sw = w.reduce((a, b) => a + b, 0);
      const wn = w.map(v => v / sw);
      const dmin = Math.sqrt(Math.min(...d2));
      const junk = mode === 'vae' ? Math.max(0, Math.min(1, (Math.hypot(x, y) - 2.6) / 1.2)) : Math.max(0, Math.min(1, (dmin - 0.18) / 0.35));
      const out = new Float32Array(N * N * 3);
      for (let p = 0; p < out.length; p++) { let v = 0; for (let k = 0; k < CLS.length; k++) v += wn[k] * imgs[k].data[p]; out[p] = (1 - junk) * v + junk * (0.5 * v + 0.5 * noise.data[p] + 0.25 * Math.sin(p * 0.7 + x * 3)); }
      return { img: { N, data: out }, wn, junk };
    }
    const btns = [...root.querySelectorAll('[data-m]')];
    btns.forEach(b => b.addEventListener('click', () => { mode = b.dataset.m; pressGroup(btns, b); draw(); }));
    document.getElementById('ltS').addEventListener('click', () => { const R3 = rng(Math.floor(Math.random() * 1e9)); z.k = [R3.gauss(), R3.gauss()]; draw(); });
    document.getElementById('ltI').addEventListener('click', () => {
      const a = centers()[0], b = centers()[2], t0 = performance.now();
      cancelAnimationFrame(anim);
      const step = now => { const t = Math.min(1, (now - t0) / 2600); z.k = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; draw(); if (t < 1) anim = requestAnimationFrame(step); };
      anim = requestAnimationFrame(step);
    });
    let geo = null;
    watchCanvas(cv, st, draw);
    drag(cv, {
      pick: (x, y) => { if (!geo) return null; const [px, py] = geo.toPx(z.k); return Math.hypot(px - x, py - y) < 18 || (x < geo.L.x + geo.L.w && x > geo.L.x) ? z : null; },
      move: (o, x, y) => { cancelAnimationFrame(anim); const w = geo.toW(x, y); o.k = w.map(v => Math.max(-3, Math.min(3, v))); draw(); },
    });
    function draw() {
      const { ctx, W, H } = st; if (!ctx) return;
      ctx.clearRect(0, 0, W, H);
      const wide = W > 520, sz = wide ? Math.min(H - 40, W * 0.56) : Math.min(W - 20, H * 0.5);
      const L = wide ? { x: 14, y: (H - sz) / 2, w: sz, h: sz } : { x: (W - sz) / 2, y: 10, w: sz, h: sz };
      if (sz < 80) return;
      const S = L.w / 6.4, ox = L.x + L.w / 2, oy = L.y + L.h / 2;
      const toPx = ([a, b]) => [ox + a * S, oy - b * S], toW = (px, py) => [(px - ox) / S, (oy - py) / S];
      geo = { toPx, toW, L };
      ctx.fillStyle = '#fff'; ctx.fillRect(L.x, L.y, L.w, L.h);
      ctx.strokeStyle = C.line; ctx.beginPath(); ctx.moveTo(ox, L.y); ctx.lineTo(ox, L.y + L.h); ctx.moveTo(L.x, oy); ctx.lineTo(L.x + L.w, oy); ctx.stroke();
      ctx.setLineDash([4, 4]); ctx.strokeStyle = '#9DA4AD'; [1, 2].forEach(r => { ctx.beginPath(); ctx.arc(ox, oy, r * S, 0, Math.PI * 2); ctx.stroke(); }); ctx.setLineDash([]);
      pts[mode].forEach(p => { const [x, y] = toPx([p.x, p.y]); ctx.fillStyle = CLS[p.i].col; ctx.globalAlpha = 0.7; ctx.beginPath(); ctx.arc(x, y, 3.2, 0, Math.PI * 2); ctx.fill(); });
      ctx.globalAlpha = 1;
      centers().forEach((c, i) => { const [x, y] = toPx(c); ctx.fillStyle = C.ink; ctx.font = '600 13px "Be Vietnam Pro", sans-serif'; ctx.fillText(names[CLS[i].id], x + 8, y - 8); });
      ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.strokeRect(L.x, L.y, L.w, L.h);
      ctx.fillStyle = C.muted; ctx.font = '12px "Be Vietnam Pro", sans-serif'; ctx.fillText('không gian ẩn (z₁, z₂)', L.x + 6, L.y + 16);
      const [zx, zy] = toPx(z.k); ctx.fillStyle = C.ink; ctx.fillRect(zx - 7, zy - 7, 14, 14); ctx.fillStyle = '#fff'; ctx.fillRect(zx - 3, zy - 3, 6, 6);
      // ảnh giải mã
      const { img, wn, junk } = decode(z.k);
      const isz = wide ? Math.min(W - L.w - 60, L.h * 0.75) : Math.min(W * 0.5, H - L.h - 75);
      const ix = wide ? L.x + L.w + (W - L.x - L.w - isz) / 2 : (W - isz) / 2, iy = wide ? (H - isz) / 2 : L.y + L.h + 30;
      TFG.SPR.draw(ctx, img, ix, iy, isz);
      ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.strokeRect(ix, iy, isz, isz);
      ctx.fillStyle = C.ink; ctx.font = '600 14px "Be Vietnam Pro", sans-serif'; ctx.textAlign = 'center'; ctx.fillText('decoder(z)', ix + isz / 2, iy - 10); ctx.textAlign = 'left';
      if (wide) { TFG.arrow(ctx, L.x + L.w + 6, H / 2, ix - 8, H / 2, C.muted, 2, 9); }
      setTxt('ltZ', '(' + num(z.k[0], 2) + '; ' + num(z.k[1], 2) + ')');
      const bi = wn.indexOf(Math.max(...wn)); setTxt('ltC', names[CLS[bi].id] + ' (' + Math.round(wn[bi] * 100) + '%)');
      setTxt('ltV', junk > 0.6 ? 'rác' : junk > 0.15 ? 'nhòe, lẫn nhiễu' : wn[bi] > 0.8 ? 'rõ ràng' : 'pha trộn giữa các lớp');
    }
  },
});
})();
