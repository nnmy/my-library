/* =====================================================================
   Không dây: minh họa "Nhận chìm tín hiệu: nhiễu nền và phá sóng"
   (id: jam, trang 8-suy-hao-pha-song.html)
   Nhúng:  <div class="demo" id="demoJam" data-demo="jam"></div> + lib/wl.js
   Chạy riêng: lib/demos/run.html?demo=jam

   Ý tưởng: một máy thu đang nghe một kênh. Nền nhiễu N (dBm) là mức "ồn"
   sẵn có. Một máy phá sóng ở cách d (m) dội thêm công suất J vào băng tần;
   J tới nơi được tính bằng đúng mô hình suy hao của phần 1 (càng gần càng mạnh).
   Máy thu đọc được tín hiệu khi tỉ số tín hiệu trên (nhiễu + phá) đủ lớn:
       SINR = P_tín / (N + J)      (cộng ở dạng tuyến tính, rồi đổi ra dB)
   Một số hệ (GPS, trải phổ) có "độ lợi xử lý" G_p cộng thêm vào SINR, nên
   nghe được cả khi tín hiệu chìm dưới nhiễu — nhưng phá đủ mạnh vẫn nhận chìm.

   Mọi con số là giá trị tiêu biểu, đủ để thấy xu hướng, không để thiết kế.
   ===================================================================== */
(() => {
const { COLORS: C, num, fmt, range, watchCanvas, loopWhenVisible, FONT, dB, unDB } = WL;
const c0 = 299792458;

// [tên, f (Hz), P_tín nhận (dBm), N nền (dBm), G_p độ lợi xử lý (dB),
//  ngưỡng SINR hiệu dụng (dB), bề rộng kênh w (Hz)]
const TECH = [
  ['Wi-Fi 2,4 GHz', 2.44e9, -55, -90, 0,  10, 20e6],
  ['Bluetooth LE',  2.44e9, -70, -95, 0,   5,  2e6],
  ['4G (xuống máy)',1.8e9,  -85, -98, 0,   7, 10e6],
  ['GPS L1',        1.57542e9, -127, -111, 43, 6, 2e6],
];
// kiểu phá sóng: [tên, mô tả bề rộng]
const KIND = [
  ['Đúng kênh (spot)', 'dồn hết công suất vào một kênh hẹp'],
  ['Phủ băng (barrage)', 'rải đều khắp băng, loãng hơn nhưng không cần nhắm'],
  ['Quét (sweep)', 'một khối hẹp lia qua lại khắp băng'],
];

WL.demo('jam', {
  html: `<div class="demo-title"><h4>Nhận chìm tín hiệu: nhiễu nền và phá sóng</h4><span>Kéo công suất và khoảng cách của máy phá</span></div>
  <div class="demo-body">
    <div class="stagebox"><canvas id="cvJam" role="img" aria-label="Phổ công suất trong một băng tần: khối tín hiệu cần thu, đường nền nhiễu, và khối công suất của máy phá sóng. Khi khối phá trùm lên kênh của tín hiệu và đủ mạnh thì mất kết nối."></canvas><div class="hint" id="jamHint"></div></div>
    <div class="panel">
      <div class="ctrl"><label for="jT">Tín hiệu cần thu</label><select id="jT">${TECH.map((t, i) => `<option value="${i}"${i === 0 ? ' selected' : ''}>${t[0]}</option>`).join('')}</select></div>
      <div class="ctrl"><label for="jK">Kiểu phá sóng</label><select id="jK">${KIND.map((k, i) => `<option value="${i}">${k[0]}</option>`).join('')}</select></div>
      <div class="ctrl"><label for="jP">Công suất máy phá (EIRP)</label><output for="jP"></output><input type="range" id="jP" min="-30" max="40" step="0.5" value="0"></div>
      <div class="ctrl"><label for="jD">Máy phá cách máy thu</label><output for="jD"></output><input type="range" id="jD" min="0" max="1" step="0.001" value="0.5"></div>
      <div class="checks"><label><input type="checkbox" id="jHop"> Tín hiệu nhảy tần</label><label><input type="checkbox" id="jOn" checked> Bật máy phá</label></div>
      <dl class="readout" aria-live="polite">
        <dt>Công suất tín hiệu</dt><dd id="jS">—</dd>
        <dt>Nhiễu nền + phá (trong kênh)</dt><dd id="jN">—</dd>
        <dt>SINR hiệu dụng</dt><dd class="big" id="jSINR">—</dd>
        <dt>Tình trạng</dt><dd id="jStat">—</dd>
      </dl>
      <p class="note-s" id="jNote"></p>
    </div>
  </div>`,
  init(root) {
    const cv = root.querySelector('#cvJam'), st = {};
    const selT = root.querySelector('#jT'), selK = root.querySelector('#jK');
    const cbHop = root.querySelector('#jHop'), cbOn = root.querySelector('#jOn');
    const hint = root.querySelector('#jamHint');
    let t = TECH[0];

    // khoảng cách máy phá: 1 m … 2000 m, thang log
    const DMIN = 1, DMAX = 2000;
    const dOf = v => Math.pow(10, Math.log10(DMIN) + v * (Math.log10(DMAX) - Math.log10(DMIN)));
    const rP = range('jP', { show: v => num(v, 3) + ' dBm (' + fmt(1e-3 * Math.pow(10, v / 10), 'W', 2) + ')' });
    const rD = range('jD', { map: dOf, show: d => fmt(d, 'm', 3) });

    // trạng thái động cho quét / nhảy tần
    let tAnim = 0;                 // thời gian (s), dùng cho sweep
    let hopSlot = 0, hopT = 0;     // kênh hiện tại khi nhảy tần
    const NSLOT = 8;               // số khe nhảy tần (minh họa)

    selT.addEventListener('change', () => { t = TECH[+selT.value]; });

    // suy hao tự do (phần 1): L = 20 log10(4π d f / c)
    const pathLoss = d => 20 * Math.log10(4 * Math.PI * d * t[1] / c0);

    // phần công suất máy phá rơi đúng vào kênh của tín hiệu (0..1)
    // (overlap bề rộng khối phá ∩ kênh tín hiệu) / bề rộng khối phá
    function overlapFrac(kind, jc, jw, vc, vw) {
      const a = Math.max(jc - jw / 2, vc - vw / 2), b = Math.min(jc + jw / 2, vc + vw / 2);
      const ov = Math.max(0, b - a);
      return jw > 0 ? ov / jw : 0;
    }

    function calc() {
      const B = Math.max(80e6, t[6] * 6);          // bề rộng cửa sổ phổ đang vẽ
      const vw = t[6];                              // bề rộng kênh tín hiệu
      const vc = cbHop.checked ? (hopSlot - (NSLOT - 1) / 2) * (B / NSLOT) : 0; // tâm kênh tín hiệu
      const kind = +selK.value;
      let jw, jc;
      if (kind === 1) { jw = B; jc = 0; }                         // barrage: phủ cả băng
      else if (kind === 2) { jw = vw; jc = Math.sin(tAnim * 1.1) * (B / 2 - vw / 2); } // sweep: lia
      else { jw = vw; jc = 0; }                                   // spot: đứng giữa băng
      const d = rD.get();
      const Jr = cbOn.checked ? rP.get() - pathLoss(d) : -Infinity; // công suất phá tới máy thu (toàn khối)
      const frac = cbOn.checked ? overlapFrac(kind, jc, jw, vc, vw) : 0;
      const Jin = frac > 0 ? Jr + 10 * Math.log10(frac) : -Infinity; // phần phá lọt vào kênh
      // cộng nhiễu nền và phá ở dạng tuyến tính
      const nLin = unDB(t[3]) + (isFinite(Jin) ? unDB(Jin) : 0);
      const Ntot = dB(nLin);
      const sinrRaw = t[2] - Ntot;                 // SINR thô (dB)
      const sinrEff = sinrRaw + t[4];              // cộng độ lợi xử lý
      return { B, vw, vc, jw, jc, d, Jr, Jin, Ntot, sinrRaw, sinrEff, kind, ok: sinrEff >= t[5] };
    }

    const setTxt = (id, v, cls) => { const el = root.querySelector('#' + id); el.textContent = v; if (cls !== undefined) el.className = cls; };

    function readout(r) {
      setTxt('jS', num(t[2], 3) + ' dBm');
      setTxt('jN', num(r.Ntot, 3) + ' dBm' + (r.Ntot - t[3] > 0.05 ? ' (phá nâng +' + num(r.Ntot - t[3], 2) + ' dB)' : ''));
      setTxt('jSINR', num(r.sinrEff, 3) + ' dB', 'big ' + (r.ok ? 'ok' : 'bad'));
      setTxt('jStat', r.ok ? 'Đọc được' : 'Mất kết nối', r.ok ? 'ok' : 'bad');
      let note;
      if (!cbOn.checked) note = 'Chưa bật máy phá: chỉ còn nhiễu nền. Bật lên rồi kéo công suất / khoảng cách để xem SINR tụt.';
      else if (!r.ok) note = 'Nhiễu + phá đã vượt tín hiệu: SINR rớt dưới ngưỡng ' + num(t[5], 2) + ' dB. ' + (cbHop.checked ? 'Nhảy tần giúp né bớt, nhưng lúc này vẫn trúng khe đang dùng.' : 'Thử bật nhảy tần, hoặc đưa máy phá ra xa.');
      else if (t[4] > 0) note = 'Tín hiệu ' + t[0] + ' chìm ' + num(t[3] - t[2], 2) + ' dB dưới nhiễu nền, nhưng độ lợi xử lý ' + num(t[4], 2) + ' dB kéo SINR hiệu dụng lên trên ngưỡng. Đây cũng là lý do GPS vừa bền vừa dễ bị phá.';
      else note = 'Còn đọc được: tín hiệu vẫn trội hơn nhiễu + phá đủ ' + num(r.sinrEff - t[5], 2) + ' dB so với ngưỡng.';
      setTxt('jNote', note);
      hint.textContent = (r.kind === 2 ? 'khối phá đang lia qua lại' : r.kind === 1 ? 'khối phá phủ cả băng' : 'khối phá đứng giữa băng') + (cbHop.checked ? ' · tín hiệu đang nhảy khe' : '');
    }

    function draw() {
      const r = calc();
      readout(r);
      if (!st.ctx) return;
      const { ctx, W, H } = st;
      ctx.clearRect(0, 0, W, H); ctx.fillStyle = C.paper; ctx.fillRect(0, 0, W, H);
      const x0 = 46, x1 = W - 14, y0 = 16, y1 = H - 34;
      const top = -40, bot = -130;                 // trục công suất dBm
      const X = f => x0 + (f + r.B / 2) / r.B * (x1 - x0);
      const Y = p => y0 + (top - Math.max(bot, Math.min(top, p))) / (top - bot) * (y1 - y0);

      // lưới ngang (dBm)
      ctx.font = FONT(11.5); ctx.fillStyle = C.muted; ctx.strokeStyle = C.line; ctx.lineWidth = 1;
      for (let p = top; p >= bot; p -= 20) {
        ctx.beginPath(); ctx.moveTo(x0, Y(p)); ctx.lineTo(x1, Y(p)); ctx.stroke();
        ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(String(p).replace('-', '−'), x0 - 5, Y(p));
      }
      ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillStyle = C.ink; ctx.font = FONT(12, 600);
      ctx.fillText('công suất (dBm)', x0 + 4, y0 + 1);
      ctx.textAlign = 'center'; ctx.fillStyle = C.muted; ctx.font = FONT(11.5);
      ctx.fillText('tần số trong băng →', (x0 + x1) / 2, y1 + 16);

      // nền nhiễu
      ctx.strokeStyle = C.muted; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.moveTo(x0, Y(t[3])); ctx.lineTo(x1, Y(t[3])); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = C.muted; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
      ctx.fillText('nhiễu nền', x0 + 4, Y(t[3]) - 2);

      // khối công suất máy phá. Vẽ ở mức "công suất trên mỗi bề rộng kênh tín hiệu":
      // spot (khối hẹp) dồn cao; barrage (phủ cả băng) bị dàn loãng nên thấp hơn.
      if (cbOn.checked && isFinite(r.Jr)) {
        const lvl = r.Jr + 10 * Math.log10(Math.min(r.vw, r.jw) / r.jw);
        const jx0 = X(r.jc - r.jw / 2), jx1 = X(r.jc + r.jw / 2), yj = Y(lvl);
        ctx.fillStyle = 'rgba(216,49,42,.16)'; ctx.strokeStyle = C.pos; ctx.lineWidth = 2;
        ctx.fillRect(jx0, yj, jx1 - jx0, y1 - yj); ctx.strokeRect(jx0, yj, jx1 - jx0, y1 - yj);
        ctx.fillStyle = C.pos; ctx.font = FONT(11.5, 700); ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        ctx.fillText('máy phá', Math.min(x1 - 24, Math.max(x0 + 24, (jx0 + jx1) / 2)), yj - 2);
      }

      // kênh tín hiệu cần thu
      const vx0 = X(r.vc - r.vw / 2), vx1 = X(r.vc + r.vw / 2), vy = Y(t[2]);
      ctx.fillStyle = r.ok ? 'rgba(55,135,196,.22)' : 'rgba(55,135,196,.12)';
      ctx.strokeStyle = r.ok ? C.sea : '#9DB3C2'; ctx.lineWidth = 2.5;
      ctx.fillRect(vx0, vy, vx1 - vx0, y1 - vy); ctx.strokeRect(vx0, vy, vx1 - vx0, y1 - vy);
      ctx.fillStyle = r.ok ? C.sea : C.muted; ctx.font = FONT(12, 700); ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText('tín hiệu', (vx0 + vx1) / 2, vy - 2);

      // nhãn SINR góc phải
      ctx.textAlign = 'right'; ctx.textBaseline = 'top'; ctx.font = FONT(12.5, 700);
      ctx.fillStyle = r.ok ? '#2e9d4f' : C.pos;
      ctx.fillText('SINR ' + num(r.sinrEff, 3) + ' dB · ' + (r.ok ? 'đọc được' : 'mất kết nối'), x1 - 2, y0 + 1);
    }

    selK.addEventListener('change', draw);
    cbHop.addEventListener('change', draw);
    cbOn.addEventListener('change', draw);
    rP.el.addEventListener('input', draw);
    rD.el.addEventListener('input', draw);

    watchCanvas(cv, st, draw);
    rP.upd(); rD.upd();

    // vòng lặp: chỉ cần chạy khi quét hoặc nhảy tần
    loopWhenVisible(cv, (dt) => {
      const sweeping = +selK.value === 2, hopping = cbHop.checked;
      if (!sweeping && !hopping) return;
      tAnim += dt;
      if (hopping) { hopT += dt; if (hopT > 0.45) { hopT = 0; hopSlot = (hopSlot + 1 + ((Math.random() * (NSLOT - 1)) | 0)) % NSLOT; } }
      draw();
    });
  },
});
})();
