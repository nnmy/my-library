/* =====================================================================
   Linh tinh: minh họa "So sánh nơi sống" (id: country-compare, trang noi-song.html)
   SỐ LIỆU (xem mục Cơ sở trên trang):
   - net: lương ròng trung bình/tháng (mọi ngành), USD — Numbeo, cập nhật 12/10/2026.
   - col, rent: Cost of Living Index, Rent Index — Numbeo, giữa năm 2026 (New York = 100).
   - Chi phí 1 người (không tính nhà) và tiền mướn căn 1 phòng ngủ ngoài trung tâm: QUY ĐỔI theo chỉ số từ mốc Đức
     (Numbeo 10/2026: 1 người 1 111,4 USD/tháng; căn 1 PN ngoài trung tâm 628,14 € ≈ 700,9 USD):
     chi_phí = 1111,4 × col / 68,0 ; tiền_mướn = 700,9 × rent / 22,0. Đây là ước lượng thô, mức trung bình cả nước.
   - p2i: giá căn hộ 90 m² / thu nhập khả dụng hộ gia đình trung vị (số năm) — Numbeo giữa năm 2026.
   - qol, safety, health, pollution: Numbeo giữa năm 2026 (dữ liệu do người dùng đóng góp).
   - gpi: Global Peace Index 2026 (IEP), hạng/163 và điểm (thấp = hòa bình hơn).
   - wri: WorldRiskIndex 2025 (càng cao rủi ro thiên tai càng lớn); Đài Loan không có trong chỉ số.
   - gdp: GDP danh nghĩa/người 2026, USD — IMF WEO 4/2026.
   - ef: EF English Proficiency Index 2025 (nước nói tiếng Anh bản ngữ không xếp hạng).
   - pen: tỉ lệ thay thế lương hưu ròng, hệ thống bắt buộc, người thu nhập trung bình / gấp đôi trung bình —
     OECD Pensions at a Glance 2025 (Đài Loan, Việt Nam không có trong OECD).
   - nat: số năm cư trú tối thiểu để xin nhập tịch theo đường thông thường (chi tiết trên trang).
   - Việt Nam và Nhật Bản là hai mốc tham chiếu (tô màu riêng); Nhật Bản không cho người nhập tịch giữ quốc tịch cũ.
     Nhật: WorldRiskIndex 2025 = 24,81; EF EPI 2025 = 446 (hạng 96); OECD tỉ lệ thay thế ròng (TB) = 42,4%;
     nhập tịch: luật ghi 5 năm, từ 1/4/2026 Bộ Tư pháp xét theo chuẩn thực tế khoảng 10 năm.
   EDIT: mảng C.
   ===================================================================== */
(() => {
const { COLORS: K, num, range, watchCanvas, pressGroup } = LT;
const BASE_COST = 1111.4, BASE_COL = 68.0, BASE_RENT = 700.9, BASE_RI = 22.0;
const C = [
  { id: 'vn', name: 'Việt Nam', net: 413.53, col: 26.9, rent: 9.6, p2i: 32.7, qol: 89.4, safety: 60.2, health: 62.8, poll: 83.7, gpi: [41, 1.738], wri: 25.92, gdp: 5115, ef: '500 (hạng 64)', pen: null, nat: null, dual: '—', buy: 'Công dân: đầy đủ' },
  { id: 'jp', name: 'Nhật Bản', net: 2062.92, col: 47.6, rent: 13.6, p2i: 11.7, qol: 180.9, safety: 77.8, health: 79.9, poll: 37.4, gpi: [10, 1.489], wri: 24.81, gdp: 35703, ef: '446 (hạng 96)', pen: [42.4, null], nat: 10, dual: 'Không', buy: 'Tự do' },
  { id: 'au', name: 'Úc', net: 3973.68, col: 71.4, rent: 33.1, p2i: 8.2, qol: 186.8, safety: 52.6, health: 71.8, poll: 28.3, gpi: [20, 1.602], wri: 21.90, gdp: 75648, ef: 'bản ngữ', pen: [53.0, 38.1], nat: 4, dual: 'Có', buy: 'Hạn chế (FIRB)' },
  { id: 'nz', name: 'New Zealand', net: 2759.40, col: 60.2, rent: 24.6, p2i: 7.9, qol: 186.2, safety: 51.2, health: 68.1, poll: 26.2, gpi: [2, 1.343], wri: 15.20, gdp: 52023, ef: 'bản ngữ', pen: [43.8, 23.7], nat: 5, dual: 'Có', buy: 'Cấm (trừ người có resident visa)' },
  { id: 'tw', name: 'Đài Loan', net: 1750.02, col: 49.1, rent: 13.0, p2i: 20.5, qol: 159.9, safety: 82.9, health: 87.1, poll: 64.1, gpi: [42, 1.751], wri: null, gdp: 42103, ef: '—', pen: null, nat: 5, dual: 'Hạn chế', buy: 'Người Việt: không' },
  { id: 'de', name: 'Đức', net: 3289.37, col: 68.0, rent: 22.0, p2i: 7.8, qol: 195.0, safety: 61.0, health: 71.3, poll: 23.2, gpi: [28, 1.657], wri: 4.28, gdp: 65303, ef: '615 (hạng 4)', pen: [53.3, null], nat: 5, dual: 'Có', buy: 'Tự do' },
  { id: 'fr', name: 'Pháp', net: 2736.30, col: 66.9, rent: 20.6, p2i: 8.3, qol: 172.6, safety: 44.2, health: 76.9, poll: 35.5, gpi: [99, 2.083], wri: 7.75, gdp: 52083, ef: '539', pen: [70.0, 58.9], nat: 5, dual: 'Có', buy: 'Tự do' },
  { id: 'se', name: 'Thụy Điển', net: 3008.51, col: 65.5, rent: 20.1, p2i: 7.0, qol: 187.6, safety: 52.2, health: 68.1, poll: 17.1, gpi: [40, 1.732], wri: 3.38, gdp: 70676, ef: '609 (hạng 8)', pen: [66.3, 84.4], nat: 8, dual: 'Có', buy: 'Tự do' },
  { id: 'ie', name: 'Ireland', net: 3433.39, col: 70.8, rent: 41.4, p2i: 6.2, qol: 169.6, safety: 50.9, health: 51.3, poll: 30.7, gpi: [5, 1.371], wri: 3.25, gdp: 140186, ef: 'bản ngữ', pen: [34, null], nat: 5, dual: 'Có', buy: 'Tự do' },
  { id: 'ca', name: 'Canada', net: 2941.99, col: 61.3, rent: 29.1, p2i: 7.2, qol: 169.5, safety: 54.4, health: 68.6, poll: 29.8, gpi: [14, 1.525], wri: 19.88, gdp: 60305, ef: 'bản ngữ', pen: [45.1, 25.0], nat: 3, dual: 'Có', buy: 'Cấm tới 1/1/2027 (có ngoại lệ)' },
];
const REF = { vn: '#f2c230', jp: '#e07b39' };
const cost = c => BASE_COST * c.col / BASE_COL, rentOf = c => BASE_RENT * c.rent / BASE_RI;
const METRICS = {
  left: { name: 'Còn lại mỗi tháng (USD)', hi: true, v: (c, s) => c.net * s.k - cost(c) - (s.own ? 0 : rentOf(c)), f: v => (v < 0 ? '−' : '') + Math.round(Math.abs(v)).toLocaleString('vi-VN') },
  share: { name: 'Còn lại (% thu nhập ròng)', hi: true, v: (c, s) => (c.net * s.k - cost(c) - (s.own ? 0 : rentOf(c))) / (c.net * s.k) * 100, f: v => num(v, 3) + '%' },
  p2i: { name: 'Giá nhà / thu nhập (năm)', hi: false, v: c => c.p2i, f: v => num(v, 3) },
  qol: { name: 'Chất lượng sống (Numbeo)', hi: true, v: c => c.qol, f: v => num(v, 4) },
  safety: { name: 'An toàn (Numbeo)', hi: true, v: c => c.safety, f: v => num(v, 3) },
  gpi: { name: 'Hòa bình (GPI 2026, điểm)', hi: false, v: c => c.gpi[1], f: v => num(v, 4) },
  wri: { name: 'Rủi ro thiên tai (WorldRiskIndex)', hi: false, v: c => c.wri, f: v => v == null ? 'không có' : num(v, 4) },
  pen: { name: 'Lương hưu thay thế, thu nhập TB (%)', hi: true, v: c => c.pen ? c.pen[0] : null, f: v => v == null ? 'không có' : (v === 34 ? '< 35' : num(v, 3)) + (v == null ? '' : '%') },
  gdp: { name: 'GDP/người 2026 (USD)', hi: true, v: c => c.gdp, f: v => Math.round(v).toLocaleString('vi-VN') },
  nat: { name: 'Số năm tối thiểu để nhập tịch', hi: false, v: c => c.nat, f: v => v == null ? '—' : String(v) },
};

LT.demo('country-compare', {
  domId: 'demoCountry',
  title: 'So sánh nơi sống',
  page: 'noi-song.html',
  html: `<style>
    #demoCountry .cc-ctrl { display: flex; flex-wrap: wrap; gap: 14px 28px; align-items: end; margin-bottom: 14px; }
    #demoCountry .cc-ctrl .ctrl { min-width: 260px; flex: 1 1 260px; }
    #demoCountry .cc-wrap { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr); gap: 18px; }
    #demoCountry .stagebox { border: 2px solid var(--ink); background: #fff; }
    #demoCountry .stagebox canvas { min-height: 380px; }
    #demoCountry table.cc { border-collapse: collapse; width: 100%; font-size: 13.5px; }
    #demoCountry table.cc td, #demoCountry table.cc th { padding: 4px 6px; border-bottom: 1px solid var(--line); text-align: right; white-space: nowrap; }
    #demoCountry table.cc th:first-child, #demoCountry table.cc td:first-child { text-align: left; }
    #demoCountry table.cc thead th { background: var(--ink); color: #fff; font-weight: 600; }
    #demoCountry table.cc tr.vn td { background: #fff3c9; }
    #demoCountry table.cc tr.jp td { background: #fde3d0; }
    @media (max-width: 860px) { #demoCountry .cc-wrap { grid-template-columns: 1fr; } }
  </style>
  <div class="cc-ctrl">
    <div class="ctrl"><label for="ccK">Thu nhập ròng của bạn so với mức trung bình</label><output for="ccK"></output><input type="range" id="ccK" min="0.8" max="3" step="0.1" value="1.5"></div>
    <div class="btnrow" role="group" aria-label="Nhà ở">
      <button class="btn" type="button" data-cco="rent" aria-pressed="true">Ở mướn (căn 1 phòng ngủ)</button>
      <button class="btn" type="button" data-cco="own" aria-pressed="false">Đã có nhà</button>
    </div>
    <div class="ctrl"><label for="ccM">Xếp hạng theo</label><select id="ccM">${Object.entries(METRICS).map(([k, m]) => `<option value="${k}">${m.name}</option>`).join('')}</select></div>
  </div>
  <div class="cc-wrap">
    <div class="stagebox"><canvas id="cvCc" class="ar" role="img" aria-label="Biểu đồ thanh ngang xếp hạng các nước theo chỉ số đang chọn; hai mốc tham chiếu Việt Nam (vàng) và Nhật Bản (cam) được tô màu riêng."></canvas></div>
    <div style="overflow-x:auto"><table class="cc" id="ccTab"></table><p class="note-s" id="ccNote" style="margin-top:8px"></p></div>
  </div>`,
  init(root) {
    const cv = root.querySelector('#cvCc'), st = {}, sel = root.querySelector('#ccM');
    const s = { k: 1.5, own: false, m: 'left' };
    const rK = range('ccK', { show: v => '× ' + num(v, 2), onInput: v => { s.k = v; upd(); } });
    const bs = [...root.querySelectorAll('[data-cco]')];
    bs.forEach(b => b.addEventListener('click', () => { pressGroup(bs, b); s.own = b.dataset.cco === 'own'; upd(); }));
    sel.addEventListener('change', () => { s.m = sel.value; upd(); });
    function rows() {
      const M = METRICS[s.m];
      return C.map(c => ({ c, v: M.v(c, s) })).sort((a, b) => a.v == null ? 1 : b.v == null ? -1 : (M.hi ? b.v - a.v : a.v - b.v));
    }
    function upd() {
      const R = rows(), M = METRICS[s.m];
      root.querySelector('#ccTab').innerHTML = `<thead><tr><th>Nước</th><th>Thu nhập ròng</th><th>Sinh hoạt</th><th>${s.own ? 'Mướn nhà' : 'Mướn nhà'}</th><th>Còn lại</th></tr></thead><tbody>${
        R.map(({ c }) => { const inc = c.net * s.k, co = cost(c), re = s.own ? 0 : rentOf(c), l = inc - co - re;
          return `<tr class="${REF[c.id] ? c.id : ''}"><td>${c.name}</td><td>${Math.round(inc).toLocaleString('vi-VN')}</td><td>${Math.round(co).toLocaleString('vi-VN')}</td><td>${s.own ? '0' : Math.round(re).toLocaleString('vi-VN')}</td><td><b>${(l < 0 ? '−' : '') + Math.round(Math.abs(l)).toLocaleString('vi-VN')}</b></td></tr>`; }).join('')}</tbody>`;
      root.querySelector('#ccNote').textContent = 'USD/tháng, trung bình cả nước; thành phố lớn mắc hơn, nhất là tiền mướn nhà. Thu nhập = lương ròng trung bình (Numbeo) × hệ số. ' + (s.own ? 'Có nhà vẫn tốn phí bảo trì, thuế nhà đất, lãi vay (nếu có): chưa tính ở đây. ' : '') + 'Giỏ chi tiêu của Numbeo theo lối sống đô thị; ở Việt Nam nhiều người chi tiêu thấp hơn đáng kể. Màu vàng, cam: hai mốc tham chiếu Việt Nam, Nhật Bản.';
      draw(R, M);
    }
    function draw(R, M) {
      R = R || rows(); M = M || METRICS[s.m];
      if (!st.ctx) return;
      const { ctx, W, H } = st; ctx.clearRect(0, 0, W, H); ctx.fillStyle = K.paper; ctx.fillRect(0, 0, W, H);
      const x0 = 112, x1 = W - 64, y0 = 34, bh = Math.min(30, (H - y0 - 14) / R.length), vals = R.map(r => r.v).filter(v => v != null);
      const lo = Math.min(0, ...vals), hi = Math.max(...vals), px = v => x0 + (v - lo) / (hi - lo || 1) * (x1 - x0);
      ctx.font = '600 12.5px "Be Vietnam Pro", system-ui, sans-serif'; ctx.fillStyle = K.ink; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText(M.name + (M.hi ? ' (cao hơn tốt hơn)' : ' (thấp hơn tốt hơn)'), 10, 8);
      R.forEach(({ c, v }, i) => {
        const y = y0 + i * bh;
        ctx.fillStyle = K.ink; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.font = '600 13px "Be Vietnam Pro", system-ui, sans-serif'; ctx.fillText(c.name, x0 - 8, y + bh / 2);
        if (v == null) { ctx.fillStyle = K.muted; ctx.textAlign = 'left'; ctx.font = '500 12px "Be Vietnam Pro", system-ui, sans-serif'; ctx.fillText('không có số liệu', x0 + 4, y + bh / 2); return; }
        const a = px(Math.min(0, v)), b = px(Math.max(0, v));
        ctx.fillStyle = REF[c.id] || (v < 0 ? K.pos : K.sea); ctx.fillRect(a, y + 4, Math.max(1, b - a), bh - 8);
        ctx.fillStyle = K.ink; ctx.textAlign = 'left'; ctx.font = '600 12px "Be Vietnam Pro", system-ui, sans-serif'; ctx.fillText(M.f(v), b + 6, y + bh / 2);
      });
      if (lo < 0) { ctx.strokeStyle = K.ink; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(px(0), y0); ctx.lineTo(px(0), y0 + R.length * bh); ctx.stroke(); }
    }
    watchCanvas(cv, st, () => draw());
    rK.upd();
  },
});
})();
