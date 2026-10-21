/* =====================================================================
   Bioelectromagnetics: minh họa "Mô phỏng FDTD: sóng phẳng chiếu vào mô" (id: fdtd, trang 5-do-lieu.html)
   Nhúng vào trang: <div class="demo" id="demoFdtd" data-demo="fdtd"></div> + lib/bem.js
   Chạy độc lập:    lib/demos/run.html?demo=fdtd
   Cần: lib/demos/gabriel-data.js (εr, σ của mô ở tần số đang chọn)

   FDTD 2D, phân cực TMz (Ez, Hx, Hy), lưới Yee Δx = 1 mm, 240 × 180 ô (24 × 18 cm).
   - Nguồn: một cột "mềm" (soft source) Ez trên toàn chiều cao → sóng phẳng đi theo trục x.
   - Biên trái/phải: lớp tổn hao khớp trở kháng (σ_m = σ·µ0/ε0, profile bậc 3), sau đó là PEC.
   - Biên trên/dưới: tuần hoàn (sóng phẳng vô hạn; vật thể lặp lại theo chiều y).
   - Vật liệu: εr, σ cố định ở một tần số (đúng cho sóng sin ổn định).
   - SAR = σ⟨Ez²⟩/ρ, lấy trung bình theo thời gian sau khi sóng đã ổn định. Hiển thị tương đối.
   ===================================================================== */
(() => {
const { COLORS: C, fmt, num, range, watchCanvas, loopWhenVisible } = BEM;
const MATS = [null, 'skinw', 'fat', 'muscle', 'bone', 'csf', 'grey'];
const NAMES = ['Không khí', 'Da', 'Mỡ', 'Cơ', 'Xương', 'Dịch não tủy', 'Não (chất xám)'];
const FREQS = [3e8, 9e8, 2.45e9, 5.8e9];

BEM.demo('fdtd', {
  domId: 'demoFdtd',
  title: 'Mô phỏng FDTD: sóng phẳng chiếu vào mô',
  page: '5-do-lieu.html',
  deps: ['gabriel-data'],
  html: `<div class="demo-title"><h4>Mô phỏng FDTD: sóng phẳng chiếu vào mô</h4><span>Lưới 1 mm</span></div>
  <div class="demo-body">
    <div class="stagebox"><canvas id="cvFd" class="ar" role="img" aria-label="Mô phỏng FDTD hai chiều: bản đồ điện trường hoặc SAR khi sóng phẳng chiếu từ trái sang vào mô."></canvas></div>
    <div class="panel">
      <div class="btnrow" role="group" aria-label="Mô hình">
        <button class="btn" type="button" data-fph="slab" aria-pressed="true">Lớp da–mỡ–cơ</button>
        <button class="btn" type="button" data-fph="head" aria-pressed="false">Mặt cắt đầu</button>
      </div>
      <div class="btnrow" role="group" aria-label="Tần số">
        ${FREQS.map((f, i) => `<button class="btn" type="button" data-ff="${i}" aria-pressed="${i === 2}">${fmt(f, 'Hz')}</button>`).join('')}
      </div>
      <div class="ctrl" id="fdFatBox"><label for="fdFat">Bề dày lớp mỡ</label><output for="fdFat"></output><input type="range" id="fdFat" min="2" max="40" step="1" value="10"></div>
      <div class="btnrow" role="group" aria-label="Hiển thị">
        <button class="btn" type="button" data-fv="E" aria-pressed="true">Trường E<sub>z</sub></button>
        <button class="btn" type="button" data-fv="SAR" aria-pressed="false">SAR</button>
        <button class="btn" type="button" id="fdRun">Tạm dừng</button>
        <button class="btn" type="button" id="fdReset">Chạy lại</button>
      </div>
      <dl class="readout" aria-live="polite">
        <dt>Thời gian mô phỏng</dt><dd id="fdT">—</dd>
        <dt>Trạng thái</dt><dd id="fdSt">—</dd>
        <dt>λ trong không khí</dt><dd id="fdL0">—</dd>
        <dt>λ trong mô chính</dt><dd id="fdL1">—</dd>
        <dt>Bước Δt; số bước / chu kỳ</dt><dd id="fdDt">—</dd>
      </dl>
      <table class="mini"><thead><tr><th>Mô</th><th>SAR TB</th><th>SAR max</th></tr></thead><tbody id="fdTab"></tbody></table>
      <p class="note-s">SAR hiển thị tương đối (giá trị lớn nhất = 1), vì sóng tới không được chuẩn hóa theo công suất. Biên trên–dưới tuần hoàn: vật thể được lặp lại theo chiều dọc.</p>
    </div>
  </div>`,
  init() {
    const G = BEM.GABRIEL, cv = document.getElementById('cvFd'), st = {};
    const EPS0 = 8.8541878128e-12, MU0 = 1.25663706e-6, C0 = 299792458;
    const DX = 1e-3, NX = 240, NY = 180, NP = 24, N = NX * NY, SRC = NP + 4;
    const dt = 0.99 * DX / (C0 * Math.SQRT2);
    const Ez = new Float32Array(N), Hx = new Float32Array(N), Hy = new Float32Array(N);
    const Ca = new Float32Array(N), Cb = new Float32Array(N), Da = new Float32Array(N), Db = new Float32Array(N);
    const mat = new Uint8Array(N), acc = new Float64Array(N), edge = new Uint8Array(N);
    const img = document.createElement('canvas'); img.width = NX; img.height = NY;
    const ictx = img.getContext('2d'), idata = ictx.createImageData(NX, NY);
    let frame = 0, fi = 2, phantom = 'slab', view = 'E', running = true, step = 0, nAcc = 0, warm = 0, spp = 1, spf = 10, eMax = 1e-6, props = [];
    const rFat = range('fdFat', { show: v => v + ' mm', onInput: () => rebuild() });
    const group = (sel, fn) => { const bs = [...document.querySelectorAll(sel)]; bs.forEach(b => b.addEventListener('click', () => { bs.forEach(x => x.setAttribute('aria-pressed', x === b)); fn(b); })); };
    group('#demoFdtd [data-fph]', b => { phantom = b.dataset.fph; document.getElementById('fdFatBox').hidden = phantom !== 'slab'; rebuild(); });
    group('#demoFdtd [data-ff]', b => { fi = +b.dataset.ff; rebuild(); });
    group('#demoFdtd [data-fv]', b => { view = b.dataset.fv; render(); });
    const runBtn = document.getElementById('fdRun');
    runBtn.addEventListener('click', () => { running = !running; runBtn.textContent = running ? 'Tạm dừng' : 'Chạy tiếp'; });
    document.getElementById('fdReset').addEventListener('click', () => rebuild());

    function geometry() {
      mat.fill(0);
      if (phantom === 'slab') {
        const x0 = 100, fat = Math.round(rFat.get());
        for (let j = 0; j < NY; j++) for (let i = x0; i < NX; i++) mat[j * NX + i] = i < x0 + 2 ? 1 : i < x0 + 2 + fat ? 2 : 3;
      } else {
        const cx = 132, cy = NY / 2;
        for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
          const r = Math.hypot(i - cx, j - cy);
          mat[j * NX + i] = r > 80 ? 0 : r > 77 ? 1 : r > 71 ? 4 : r > 69 ? 5 : 6;
        }
      }
      for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
        const k = j * NX + i, m = mat[k];
        edge[k] = (i > 0 && mat[k - 1] !== m) || (j > 0 && mat[k - NX] !== m) ? 1 : 0;
      }
    }
    function rebuild() {
      const f = FREQS[fi], w = 2 * Math.PI * f;
      geometry();
      props = MATS.map((k, m) => {
        if (!k) return { er: 1, sig: 0, rho: 1 };
        const e = G.eps(k, f); return { er: e.re, sig: e.sigma, rho: G.T[k].rho };
      });
      const smax = 0.8 * 4 / (376.73 * DX);
      for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
        const k = j * NX + i, p = props[mat[k]];
        const d = i < NP ? (NP - i) / NP : i >= NX - NP ? (i - (NX - NP - 1)) / NP : 0;
        const ss = smax * d ** 3, sigE = p.sig + ss, eps = EPS0 * p.er, sm = ss * MU0 / EPS0;
        const a = sigE * dt / (2 * eps); Ca[k] = (1 - a) / (1 + a); Cb[k] = dt / eps / (1 + a) / DX;
        const b = sm * dt / (2 * MU0); Da[k] = (1 - b) / (1 + b); Db[k] = dt / MU0 / (1 + b) / DX;
      }
      Ez.fill(0); Hx.fill(0); Hy.fill(0); acc.fill(0); nAcc = 0; step = 0; eMax = 1e-6;
      spp = Math.round(1 / (f * dt)); spf = Math.max(8, Math.min(160, Math.round(spp / 6)));
      warm = Math.max(8 * spp, Math.round(3 * NX * DX / C0 / dt) + 4 * spp);
      const main = phantom === 'slab' ? 'muscle' : 'grey';
      document.getElementById('fdL0').textContent = fmt(C0 / f, 'm');
      document.getElementById('fdL1').textContent = fmt(G.wave(main, f).lambda, 'm') + ' (' + G.T[main].vi.toLowerCase() + ')';
      document.getElementById('fdDt').textContent = fmt(dt, 's') + '; ' + spp;
      render();
    }
    function advance(n) {
      const w = 2 * Math.PI * FREQS[fi];
      for (let s = 0; s < n; s++) {
        for (let j = 0; j < NY; j++) {
          const jp = (j + 1) % NY, r = j * NX, rp = jp * NX;
          for (let i = 0; i < NX; i++) { const k = r + i; Hx[k] = Da[k] * Hx[k] - Db[k] * (Ez[rp + i] - Ez[k]); }
          for (let i = 0; i < NX - 1; i++) { const k = r + i; Hy[k] = Da[k] * Hy[k] + Db[k] * (Ez[k + 1] - Ez[k]); }
        }
        for (let j = 0; j < NY; j++) {
          const jm = (j - 1 + NY) % NY, r = j * NX, rm = jm * NX;
          for (let i = 1; i < NX - 1; i++) { const k = r + i; Ez[k] = Ca[k] * Ez[k] + Cb[k] * ((Hy[k] - Hy[k - 1]) - (Hx[k] - Hx[rm + i])); }
        }
        step++;
        const t = step * dt, ramp = Math.min(1, step / (3 * spp));
        const src = Math.sin(w * t) * ramp;
        for (let j = 0; j < NY; j++) Ez[j * NX + SRC] += src;
        if (step > warm) { for (let k = 0; k < N; k++) acc[k] += Ez[k] * Ez[k]; nAcc++; }
      }
    }
    function sarField() {
      const S = new Float32Array(N); let mx = 0;
      if (!nAcc) return { S, mx };
      for (let k = 0; k < N; k++) { const m = mat[k]; if (!m) continue; const i = k % NX; if (i >= NX - NP) continue; const p = props[m]; S[k] = p.sig * acc[k] / nAcc / p.rho; if (S[k] > mx) mx = S[k]; }
      return { S, mx };
    }
    function render() {
      if (!st.ctx) return;
      const d = idata.data; let { S, mx } = view === 'SAR' ? sarField() : { S: null, mx: 0 };
      let m = 0; for (let k = 0; k < N; k++) { const a = Math.abs(Ez[k]); if (a > m) m = a; }
      eMax = Math.max(m, eMax * 0.98, 1e-6);
      for (let k = 0; k < N; k++) {
        let r, g, b;
        if (view === 'E') {
          const v = Math.max(-1, Math.min(1, Ez[k] / eMax)), a = Math.abs(v);
          [r, g, b] = v > 0 ? [251 - 35 * a, 252 - 203 * a, 253 - 211 * a] : [251 - 196 * a, 252 - 117 * a, 253 - 57 * a];
          if (mat[k] && a < 0.08) { r -= 10; g -= 10; b -= 6; }
        } else {
          const v = mx ? Math.sqrt(S[k] / mx) : 0;
          if (!mat[k]) { r = 238; g = 246; b = 250; }
          else if (v < 0.5) { const t = v / 0.5; r = 255; g = 255 - 61 * t; b = 240 - 192 * t; }
          else { const t = (v - 0.5) / 0.5; r = 242 - 103 * t; g = 194 - 165 * t; b = 48 - 26 * t; }
        }
        if (edge[k]) { r = (r + 27) / 2; g = (g + 25) / 2; b = (b + 32) / 2; }     // viền mặt phân cách, pha 50%
        const q = k * 4; d[q] = r; d[q + 1] = g; d[q + 2] = b; d[q + 3] = 255;
      }
      ictx.putImageData(idata, 0, 0);
      const { ctx, W, H } = st, sc = Math.min(W / NX, H / NY), w = NX * sc, h = NY * sc, ox = (W - w) / 2, oy = (H - h) / 2;
      ctx.clearRect(0, 0, W, H); ctx.fillStyle = C.paper; ctx.fillRect(0, 0, W, H);
      ctx.imageSmoothingEnabled = true; ctx.drawImage(img, ox, oy, w, h);
      ctx.fillStyle = 'rgba(89,96,107,.18)'; ctx.fillRect(ox, oy, NP * sc, h); ctx.fillRect(ox + w - NP * sc, oy, NP * sc, h);
      ctx.strokeStyle = C.pos; ctx.setLineDash([4, 4]); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(ox + SRC * sc, oy); ctx.lineTo(ox + SRC * sc, oy + h); ctx.stroke(); ctx.setLineDash([]);
      ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.strokeRect(ox, oy, w, h);
      ctx.font = '600 12.5px "Be Vietnam Pro", system-ui, sans-serif'; ctx.fillStyle = C.ink; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText('nguồn', ox + SRC * sc + 4, oy + 4);
      ctx.fillStyle = C.muted; ctx.fillText('lớp hấp thụ', ox + 4, oy + h - 18);
      const T = step * dt * FREQS[fi];
      document.getElementById('fdT').textContent = num(T, 3) + ' chu kỳ (' + fmt(step * dt, 's') + ')';
      document.getElementById('fdSt').textContent = step <= warm ? 'chờ sóng ổn định… ' + Math.round(step / warm * 100) + '%' : 'đang lấy trung bình SAR (' + num(nAcc / spp, 3) + ' chu kỳ)';
      if (view === 'SAR') table({ S, mx }); else if (++frame % 15 === 0) table(sarField());
    }
    function table({ S, mx }) {
      const sum = new Float64Array(7), cnt = new Float64Array(7), pk = new Float64Array(7);
      for (let k = 0; k < N; k++) { const m = mat[k]; if (!m || k % NX >= NX - NP) continue; sum[m] += S[k]; cnt[m]++; if (S[k] > pk[m]) pk[m] = S[k]; }
      const rows = [];
      for (let m = 1; m < 7; m++) if (cnt[m]) rows.push(`<tr><td>${NAMES[m]}</td><td>${mx ? num(sum[m] / cnt[m] / mx, 2) : '—'}</td><td>${mx ? num(pk[m] / mx, 2) : '—'}</td></tr>`);
      document.getElementById('fdTab').innerHTML = rows.join('');
    }
    watchCanvas(cv, st, render);
    rFat.upd(); rebuild();
    loopWhenVisible(cv, () => { if (running) { advance(spf); render(); } });
  },
});
})();
