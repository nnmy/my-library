/* =====================================================================
   TRANG PHÌNH MẠCH NÃO  (med-atlas/lib/aneurysm.js, dùng cho 4-brain-aneurysm.html)
   Gồm 3 phần độc lập:
     AnViewer  : trình xem ảnh DSA, rê/chạm để nhận diện mạch (dữ liệu lib/data/aneurysm/)
     AnSites   : sơ đồ đa giác Willis, bấm số để xem vị trí phình mạch thường gặp
     AnPhases  : minh họa cách tính điểm PHASES (Greving 2014), chỉ để học
   Hình dạng khoanh vùng trong case.json: line (đường gấp khúc + width), ellipse [cx,cy,rx,ry], poly.
   Nhận diện: tại một điểm, chọn cấu trúc có diện tích nhỏ nhất trong các cấu trúc chứa điểm đó ("top": true trong case.json = luôn ưu tiên).
   ===================================================================== */
'use strict';
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const getJSON = u => fetch(u).then(r => { if (!r.ok) throw new Error(r.status + ' ' + u); return r.json(); });

/* ---------- hình học ---------- */
function distSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0; t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
function inPoly(px, py, pts) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
}
function polyArea(p) { let a = 0; for (let i = 0, j = p.length - 1; i < p.length; j = i++) a += p[j][0] * p[i][1] - p[i][0] * p[j][1]; return Math.abs(a) / 2; }
function shapeArea(s) {
  if (s.ellipse) return Math.PI * s.ellipse[2] * s.ellipse[3];
  if (s.poly) return polyArea(s.poly);
  if (s.line) { let L = 0; for (let i = 1; i < s.line.length; i++) L += Math.hypot(s.line[i][0] - s.line[i - 1][0], s.line[i][1] - s.line[i - 1][1]); return L * (s.width || 10); }
  return 1e12;
}
/* tol = dung sai theo điểm ảnh của ảnh gốc (để chạm bằng ngón tay vẫn trúng mạch mảnh) */
function hitShape(s, x, y, tol) {
  if (s.ellipse) { const [cx, cy, rx, ry] = s.ellipse; return ((x - cx) / (rx + tol)) ** 2 + ((y - cy) / (ry + tol)) ** 2 <= 1; }
  if (s.poly) return inPoly(x, y, s.poly);
  if (s.line) { const w = (s.width || 10) / 2 + tol; for (let i = 1; i < s.line.length; i++) if (distSeg(x, y, ...s.line[i - 1], ...s.line[i]) <= w) return true; return false; }
  return false;
}
function pick(structs, x, y, tol) {
  let best = null, ba = Infinity;
  for (const st of structs) for (const s of st.shapes) if (hitShape(s, x, y, tol)) { const a = st._area; if (a < ba) { ba = a; best = st; } }
  return best;
}

/* ===================================================================== */
const AnViewer = (() => {
  const CONF = { chac: ['sure', 'Nhận diện khá chắc'], 'du-doan': ['guess', 'Dự đoán'] };
  const LEVELS = [{ n: 'Tắt', t: 0 }, { n: 'Viền mảnh', t: 1.5 }, { n: 'Viền dày', t: 4 }, { n: 'Tô màu', t: 2, fill: true }];
  const S = { base: '', cases: [], cur: null, data: null, img: null, hover: null, lock: null, level: 1, W: 1, H: 1 };
  let host, cv, ctx, imgEl, readout, info, list, tabs;

  function build() {
    host.innerHTML = `
    <div class="an-tabs" role="group" aria-label="Chọn ca" id="anTabs"></div>
    <div class="an-viewer">
      <div class="an-stage">
        <div class="an-film" id="anFilm"><img id="anImg" alt="" draggable="false"><canvas id="anCv" tabindex="0" aria-label="Ảnh DSA. Rê chuột hoặc chạm để nhận diện mạch, nhấp để khóa, Esc để bỏ khóa. Có thể dùng danh sách nút bên cạnh thay thế."></canvas></div>
        <div class="an-readout" id="anRead" aria-live="polite"></div>
        <div class="an-controls">
          <div class="an-ctl"><span class="lab" id="lbLv">Khoanh vùng</span><div class="seg" id="anLv" role="group" aria-labelledby="lbLv"></div></div>
          <div class="an-ctl"><span class="lab"><label for="anCon">Tương phản</label></span><input type="range" id="anCon" min="60" max="220" value="100"><span class="lab" style="min-width:0"><label for="anBri">Sáng</label></span><input type="range" id="anBri" min="60" max="160" value="100"></div>
        </div>
      </div>
      <div class="an-info" id="anInfo" aria-live="polite"></div>
    </div>
    <p class="an-credit" id="anCredit"></p>`;
    cv = $('anCv'); ctx = cv.getContext('2d'); imgEl = $('anImg'); readout = $('anRead'); info = $('anInfo'); tabs = $('anTabs');
    const lv = $('anLv');
    LEVELS.forEach((l, i) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn'; b.textContent = l.n; b.setAttribute('aria-pressed', i === S.level); b.onclick = () => { S.level = i; [...lv.children].forEach((c, j) => c.setAttribute('aria-pressed', j === i)); draw(); }; lv.appendChild(b); });
    $('anCon').oninput = e => imgEl.style.setProperty('--an-contrast', e.target.value / 100);
    $('anBri').oninput = e => imgEl.style.setProperty('--an-bright', e.target.value / 100);
    cv.addEventListener('pointermove', e => { if (S.lock) return; setHover(at(e)); });
    cv.addEventListener('pointerleave', () => { if (!S.lock) setHover(null); });
    cv.addEventListener('pointerdown', e => { const st = at(e); if (e.pointerType !== 'mouse') { S.lock = st; setHover(st); return; } S.lock = (S.lock && S.lock === st) ? null : st; setHover(S.lock || st); });
    cv.addEventListener('keydown', e => { if (e.key === 'Escape') { S.lock = null; setHover(null); } });
    window.addEventListener('resize', size);
  }
  function at(e) {
    const r = cv.getBoundingClientRect(), x = (e.clientX - r.left) * S.W / r.width, y = (e.clientY - r.top) * S.H / r.height;
    return pick(S.data.structures, x, y, 10 * S.W / Math.max(r.width, 1));
  }
  function size() {
    if (!S.data) return;
    const r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr); draw();
  }
  function draw() {
    if (!S.data) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
    const k = cv.width / S.W, u = S.W / Math.max(cv.getBoundingClientRect().width, 1), L = LEVELS[S.level], cur = S.lock || S.hover, col = '#f2c230';
    ctx.setTransform(k, 0, 0, k, 0, 0); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const st of S.data.structures) {
      const on = st === cur;
      if (!L.t && !on) continue;
      for (const s of st.shapes) {
        ctx.beginPath();
        if (s.line) s.line.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
        else if (s.ellipse) ctx.ellipse(s.ellipse[0], s.ellipse[1], s.ellipse[2], s.ellipse[3], 0, 0, 2 * Math.PI);
        else { s.poly.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); }
        ctx.save();
        if (L.fill || on) {                      /* tô màu mờ: dải rộng đúng khẩu kính với mạch, vùng kín với hình còn lại */
          ctx.globalAlpha = on ? .45 : .22;
          if (s.line) { ctx.strokeStyle = col; ctx.lineWidth = s.width || 10; ctx.stroke(); } else { ctx.fillStyle = col; ctx.fill(); }
          ctx.globalAlpha = 1;
        }
        if (!L.fill || on) {                     /* nét đứt vàng = AI tự vẽ */
          ctx.setLineDash([9 * u, 6 * u]); ctx.strokeStyle = col; ctx.lineWidth = Math.max(on ? 3 : L.t, 1.5) * u;
          if (s.line) ctx.stroke(); else ctx.stroke();
        }
        ctx.restore();
      }
    }
  }
  function setHover(st) {
    S.hover = st; draw(); renderRead(); renderInfo();
    [...list.querySelectorAll('button')].forEach(b => b.setAttribute('aria-pressed', (S.lock || S.hover) && b.dataset.id === (S.lock || S.hover).id));
  }
  function renderRead() {
    const st = S.lock || S.hover;
    readout.innerHTML = st ? `<span>${S.lock ? '<span class="lock" title="Đã khóa">🔒</span> ' : ''}<b>${esc(st.vi)}</b></span><span>${esc(st.en)}</span>` : '<span>Rê chuột lên mạch, hoặc chạm vào ảnh, hoặc chọn từ danh sách.</span>';
  }
  function renderInfo() {
    const st = S.lock || S.hover, d = S.data;
    let h = '';
    if (st) {
      const [cls, txt] = CONF[st.conf] || CONF['du-doan'];
      h += `<h3>${esc(st.vi)}</h3><p class="en">${esc(st.en)}</p>
        <p><span class="src ${cls}">${txt}</span><span class="src ai">Viền do AI vẽ, chưa được bác sĩ duyệt</span></p>
        <p>${esc(st.desc)}</p><p><span class="k">Ý nghĩa lâm sàng: </span>${esc(st.clin)}</p>`;
    } else {
      h += `<h3>${esc(d.title)}</h3><p class="en">${esc(d.en)}</p><p>${esc(d.intro)}</p><p class="note-s" style="color:var(--muted);font-size:13.5px">${esc(d.legend_note)}</p>`;
    }
    info.innerHTML = h + '<ul class="an-list" id="anList"></ul>';
    list = $('anList');
    d.structures.forEach(s => { const li = document.createElement('li'), b = document.createElement('button'); b.type = 'button'; b.className = 'btn'; b.dataset.id = s.id; b.textContent = s.vi.replace(/\s*\(.*?\)/, '').replace(/, dự đoán/, ''); b.setAttribute('aria-pressed', st === s); b.onclick = () => { S.lock = (S.lock === s) ? null : s; setHover(S.lock); }; li.appendChild(b); list.appendChild(li); });
  }
  async function load(id) {
    const dir = S.base + id + '/';
    S.data = await getJSON(dir + 'case.json');
    S.data.structures.forEach(st => st._area = st.top ? 0 : Math.min(...st.shapes.map(shapeArea)));
    [S.W, S.H] = S.data.size; S.lock = null; S.hover = null; S.cur = id;
    await new Promise((ok, bad) => { imgEl.onload = ok; imgEl.onerror = () => bad(new Error('Không tải được ảnh ' + dir + 'image.jpg')); imgEl.src = dir + 'image.jpg'; });
    imgEl.alt = S.data.title; $('anCredit').textContent = 'Nguồn ảnh: ' + S.data.credit;
    cv.style.aspectRatio = S.W + ' / ' + S.H;
    [...tabs.children].forEach(b => b.setAttribute('aria-pressed', b.dataset.id === id));
    renderRead(); renderInfo(); size();
  }
  async function start(opts) {
    host = opts.host; S.base = opts.data;
    if (location.protocol === 'file:') { host.innerHTML = '<p class="an-note">Trình xem cần chạy qua web server (không mở trực tiếp bằng file://). Xem README-aneurysm.md, mục "Chạy web server".</p>'; return; }
    build();
    try {
      const idx = await getJSON(S.base + 'cases.json'); S.cases = idx.cases;
      S.cases.forEach(c => {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'btn'; b.dataset.id = c.id;
        b.innerHTML = `<span>${esc(c.label)}${c.soon ? ' <span class="soon">· Chưa mần</span>' : ''}</span><span class="en">${esc(c.en || '')}</span>`;
        if (c.soon) b.disabled = true; else b.onclick = () => load(c.id);
        tabs.appendChild(b);
      });
      await load(S.cases.find(c => !c.soon).id);
    } catch (e) { host.insertAdjacentHTML('afterbegin', `<p class="an-note">Lỗi tải dữ liệu: ${esc(e.message)}</p>`); }
  }
  return { start };
})();

/* ===================================================================== */
const AnSites = (() => {
  const SITES = [
    { n: 1, x: 200, y: 82, t: 'Động mạch thông trước (ACom) và đoạn gần ĐM não trước', d: 'Một trong những vị trí thường gặp nhất, cùng với ICA–PCom và MCA. Vỡ ở đây hay gây xuất huyết dưới nhện kèm máu trong khe liên bán cầu. Điểm PHASES cho vị trí ACA/PCom là 4.' },
    { n: 2, x: 143, y: 205, t: 'Chỗ ĐM thông sau xuất phát từ ĐM cảnh trong (ICA–PCom)', d: 'Vị trí thường gặp. Túi phình hướng ra sau–ngoài và có thể đè dây thần kinh sọ III, gây sụp mi, giãn đồng tử và nhìn đôi, đây là dấu hiệu cần xử trí khẩn.' },
    { n: 3, x: 150, y: 165, t: 'Chỗ tận của ĐM cảnh trong (carotid terminus)', d: 'ĐM cảnh trong chia thành ĐM não trước và não giữa. Phình mạch ở đây ít hơn các vị trí trên nhưng thường lớn và phức tạp.' },
    { n: 4, x: 96, y: 146, t: 'Chỗ chia đôi ĐM não giữa (MCA bifurcation)', d: 'Vị trí thường gặp. Túi phình thường nằm ở chỗ chia đôi trong rãnh bên (rãnh Sylvius), hay đi kèm máu tụ trong nhu mô thùy thái dương khi vỡ. Điểm PHASES cho MCA là 2.' },
    { n: 5, x: 150, y: 236, t: 'ĐM cảnh trong đoạn cạnh yên / ĐM mắt (paraclinoid / ophthalmic)', d: 'Gần xoang hang và hố yên. Túi phình lớn ở đây có thể đè thần kinh thị gây giảm thị lực. Điểm PHASES cho ICA là 0.' },
    { n: 6, x: 200, y: 312, t: 'Đỉnh động mạch nền (basilar apex)', d: 'Vị trí phổ biến nhất của phình mạch tuần hoàn sau, mà tuần hoàn sau chỉ chiếm một phần nhỏ (khoảng 10% phình mạch). Vỡ ở đây thường nặng. Điểm PHASES cho vị trí tuần hoàn sau là 4.' },
    { n: 7, x: 178, y: 414, t: 'Chỗ ĐM tiểu não sau dưới (PICA) xuất phát từ ĐM đốt sống', d: 'Phình mạch tuần hoàn sau gặp ở đoạn này. Vị trí có thể thay đổi nhiều do PICA có nhiều biến thể.' },
    { n: 8, x: 215, y: 38, t: 'ĐM não trước đoạn xa (quanh thể chai, pericallosal)', d: 'Ít gặp hơn nhưng thường nhỏ và khó thấy trên ảnh không đủ độ phân giải.' },
  ];
  function start(host, panel) {
    const v = (x1, y1, x2, y2, w) => `<path class="vessel" d="M${x1} ${y1} L${x2} ${y2}" stroke-width="${w}"/>`;
    let s = `<svg viewBox="0 0 400 450" role="group" aria-label="Sơ đồ đa giác Willis nhìn từ phía dưới, phía trước ở trên">
      <text class="lbl" x="200" y="12" text-anchor="middle">Trước</text>
      <text class="lbl" x="200" y="446" text-anchor="middle">Sau</text>
      ${v(150, 250, 150, 165, 11)}${v(250, 250, 250, 165, 11)}
      ${v(150, 165, 185, 80, 8)}${v(250, 165, 215, 80, 8)}${v(185, 80, 215, 80, 6)}
      ${v(185, 80, 185, 25, 7)}${v(215, 80, 215, 25, 7)}
      ${v(150, 165, 60, 138, 8)}${v(250, 165, 340, 138, 8)}
      ${v(150, 205, 168, 292, 4)}${v(250, 205, 232, 292, 4)}
      ${v(168, 292, 200, 312, 7)}${v(232, 292, 200, 312, 7)}
      ${v(168, 292, 100, 305, 7)}${v(232, 292, 300, 305, 7)}
      ${v(200, 312, 200, 395, 11)}${v(200, 395, 165, 440, 9)}${v(200, 395, 235, 440, 9)}
      ${v(178, 412, 140, 425, 4)}
      <text class="lbl" x="40" y="128">MCA</text><text class="lbl" x="344" y="128">MCA</text>
      <text class="lbl" x="97" y="318">PCA</text><text class="lbl" x="288" y="318">PCA</text>
      <text class="lbl" x="214" y="360">ĐM nền</text><text class="lbl" x="108" y="222">ICA</text><text class="lbl" x="262" y="222">ICA</text>
      <text class="lbl" x="174" y="262">PCom</text><text class="lbl" x="250" y="440">ĐM đốt sống</text>`;
    SITES.forEach(p => { s += `<g class="site" tabindex="0" role="button" aria-pressed="false" aria-label="Vị trí ${p.n}: ${esc(p.t)}" data-n="${p.n}"><circle cx="${p.x}" cy="${p.y}" r="11"/><text x="${p.x}" y="${p.y}">${p.n}</text></g>`; });
    host.innerHTML = s + '</svg>';
    const show = n => {
      const p = SITES.find(q => q.n === n);
      [...host.querySelectorAll('.site')].forEach(g => g.setAttribute('aria-pressed', +g.dataset.n === n));
      panel.innerHTML = `<h3>${p.n}. ${esc(p.t)}</h3><p>${esc(p.d)}</p><p class="an-foot">Sơ đồ minh họa tự vẽ, không theo tỷ lệ. Các vị trí có ở cả hai bên (trừ ACom và đỉnh nền).</p>`;
    };
    host.querySelectorAll('.site').forEach(g => { const n = +g.dataset.n; g.addEventListener('click', () => show(n)); g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); show(n); } }); });
    panel.innerHTML = '<h3>Các vị trí thường gặp</h3><p>Bấm vào số trên sơ đồ để xem từng vị trí. Ba vị trí hay gặp nhất là ACom, ICA–PCom và chỗ chia đôi MCA; tuần hoàn trước chiếm đa số, tuần hoàn sau chiếm khoảng 10%.</p><p class="an-foot">Tỷ lệ chỉ mang tính ước lượng và khác nhau giữa các nghiên cứu.</p>';
  }
  return { start };
})();

/* ===================================================================== */
const AnPhases = (() => {
  /* Nguồn: Greving JP et al., Lancet Neurol 2014;13:59-66. Bảng điểm và nguy cơ 5 năm. */
  const RISK = { 2: '0,4%', 3: '0,7%', 4: '0,9%', 5: '1,3%', 6: '1,7%', 7: '2,4%', 8: '3,2%', 9: '4,3%', 10: '5,3%', 11: '7,2%', 12: '17,8%' };
  const F = [
    ['P', 'Dân số (Population)', [['Bắc Mỹ, châu Âu (trừ Phần Lan)', 0], ['Nhật Bản', 3], ['Phần Lan', 5]]],
    ['H', 'Tăng huyết áp (Hypertension)', [['Không', 0], ['Có', 1]]],
    ['A', 'Tuổi (Age)', [['Dưới 70', 0], ['70 trở lên', 1]]],
    ['S1', 'Kích thước túi phình (Size)', [['Dưới 7,0 mm', 0], ['7,0–9,9 mm', 3], ['10,0–19,9 mm', 6], ['20 mm trở lên', 10]]],
    ['E', 'Từng xuất huyết dưới nhện do túi phình khác (Earlier SAH)', [['Không', 0], ['Có', 1]]],
    ['S2', 'Vị trí (Site)', [['ĐM cảnh trong (ICA)', 0], ['ĐM não giữa (MCA)', 2], ['ĐM não trước / thông sau / tuần hoàn sau', 4]]],
  ];
  function start(host) {
    host.innerHTML = '<div class="an-calc">' + F.map(([k, lab, opts]) => `<label>${esc(lab)}<select data-k="${k}">${opts.map(([t, p], i) => `<option value="${p}"${i === 0 ? ' selected' : ''}>${esc(t)} (${p} điểm)</option>`).join('')}</select></label>`).join('') + '</div><div class="an-result" id="anRes" aria-live="polite"></div>';
    const upd = () => {
      const tot = [...host.querySelectorAll('select')].reduce((a, s) => a + +s.value, 0), r = RISK[Math.min(Math.max(tot, 2), 12)];
      $('anRes').innerHTML = `<div class="big">${tot} điểm: ${tot >= 12 ? '≥ ' : tot <= 2 ? '≤ ' : ''}${r}</div><div>Nguy cơ vỡ ước tính trong 5 năm cho túi phình <b>chưa vỡ</b>, ở nhóm bệnh nhân trong nghiên cứu gốc.</div>`;
    };
    host.querySelectorAll('select').forEach(s => s.addEventListener('change', upd)); upd();
  }
  return { start };
})();
