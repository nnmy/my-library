/* =====================================================================
   Robotics: tiện ích dùng chung (chép từ intro-ai/lib/tfg.js) (dựa trên intro-bem/lib/bem.js).
   Nạp file này TRƯỚC thẻ <script> của MathJax (để cấu hình có hiệu lực)
   và trước script riêng của từng trang.
   ===================================================================== */

/* ---------- cấu hình MathJax 3: \( ... \) inline, \[ ... \] display ---------- */
window.MathJax = {
  tex: { inlineMath: [['\\(', '\\)']], displayMath: [['\\[', '\\]']] },
  svg: { fontCache: 'global' },
  options: { skipHtmlTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code', 'canvas'] },
};

const TFG = (() => {
  const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const COLORS = {
    ink: '#1B1920', paper: '#FBFCFD', mist: '#EEF6FA', line: '#DCE6EC', muted: '#59606B',
    sky: '#7bcde8', sea: '#3787c4', pos: '#d8312a', neg: '#3787c4', gold: '#f2c230',
  };

  /* Canvas sắc nét trên màn hình HiDPI. Gọi lại khi đổi kích thước.
     Trả về {ctx, W, H} với W, H tính bằng CSS px; ctx đã scale sẵn. */
  function fitCanvas(canvas, st) {
    const r = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    st.W = r.width; st.H = r.height; st.dpr = dpr;
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
    st.ctx = canvas.getContext('2d');
    st.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return st;
  }
  /* Theo dõi kích thước canvas, gọi onResize khi thay đổi. */
  function watchCanvas(canvas, st, onResize) {
    const go = () => { fitCanvas(canvas, st); onResize && onResize(); };
    new ResizeObserver(go).observe(canvas);
    go();
  }

  /* Định dạng số theo tiền tố SI: fmt(0.00123, 'A') -> "1,23 mA" (dấu phẩy thập phân kiểu Việt). */
  const PREFIX = [[1e18, 'E'], [1e15, 'P'], [1e12, 'T'], [1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p'], [1e-15, 'f']];
  function num(v, digits = 3) {
    if (!isFinite(v)) return '—';
    let s = Number(v).toPrecision(digits);
    if (s.includes('e')) s = Number(s).toString();
    if (s.includes('.') && !s.includes('e')) s = s.replace(/\.?0+$/, '');
    return s.replace('.', ',').replace('-', '−');
  }
  function fmt(v, unit = '', digits = 3) {
    if (!isFinite(v)) return '—';
    if (v === 0) return '0 ' + unit;
    const a = Math.abs(v);
    for (const [f, p] of PREFIX) if (a >= f * 0.9995) return num(v / f, digits) + ' ' + p + unit;
    return sci(v, digits) + ' ' + unit;
  }
  /* Dạng khoa học: 5,96 × 10⁷ */
  const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
  function sci(v, digits = 3) {
    if (!isFinite(v)) return '—';
    if (v === 0) return '0';
    const e = Math.floor(Math.log10(Math.abs(v)));
    if (e >= -2 && e <= 3) return num(v, digits);
    const m = v / Math.pow(10, e);
    return num(m, digits) + ' × 10' + String(e).split('').map(c => SUP[c]).join('');
  }

  /* Gắn slider với ô hiển thị giá trị. map: giá trị slider -> giá trị thực (ví dụ thang log). */
  function range(id, { map = v => v, show, onInput } = {}) {
    const el = document.getElementById(id), out = document.querySelector(`output[for="${id}"]`);
    const get = () => map(parseFloat(el.value));
    const upd = () => { if (out && show) out.textContent = show(get()); onInput && onInput(get()); };
    el.addEventListener('input', upd);
    return { el, get, upd, set(v) { el.value = v; upd(); } };
  }

  /* Mũi tên trên canvas. */
  function arrow(ctx, x0, y0, x1, y1, color, width = 2, head = 8) {
    const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy);
    if (L < 0.5) return;
    const ux = dx / L, uy = dy / L, h = Math.min(head, L * 0.6);
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1 - ux * h * 0.8, y1 - uy * h * 0.8); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1 - ux * h - uy * h * 0.5, y1 - uy * h + ux * h * 0.5);
    ctx.lineTo(x1 - ux * h + uy * h * 0.5, y1 - uy * h - ux * h * 0.5);
    ctx.closePath(); ctx.fill();
  }

  /* Chỉ chạy vòng lặp animation khi phần tử đang hiện trên màn hình. */
  function loopWhenVisible(el, frame) {
    let vis = false, last = null;
    new IntersectionObserver(es => es.forEach(e => { vis = e.isIntersecting; last = null; }), { threshold: 0.05 }).observe(el);
    (function tick(now) {
      if (vis) { const dt = last === null ? 0 : Math.min(0.05, (now - last) / 1000); last = now; frame(dt, now / 1000); }
      requestAnimationFrame(tick);
    })(performance.now());
  }

  /* ---------- tiện ích riêng cho AI ---------- */
  /* softmax ổn định số học; temp: nhiệt độ (chia logit cho temp) */
  function softmax(xs, temp = 1) {
    const m = Math.max(...xs.map(x => x / temp)); const e = xs.map(x => Math.exp(x / temp - m));
    const s = e.reduce((a, b) => a + b, 0); return e.map(v => v / s);
  }
  /* bộ sinh số ngẫu nhiên có seed (mulberry32), để demo tái lập được */
  function rng(seed = 1) {
    let a = seed >>> 0;
    const r = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    r.gauss = () => { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
    return r;
  }
  /* thang màu tuần tự cho heatmap: 0 -> giấy, 1 -> sea đậm */
  function heat(t) {
    t = Math.max(0, Math.min(1, t));
    const a = [251, 252, 253], b = [123, 205, 232], c = [55, 135, 196], d = [27, 25, 32];
    const mix = (p, q, u) => p.map((v, i) => Math.round(v + (q[i] - v) * u));
    const col = t < 0.45 ? mix(a, b, t / 0.45) : t < 0.85 ? mix(b, c, (t - 0.45) / 0.4) : mix(c, d, (t - 0.85) / 0.15 * 0.6);
    return `rgb(${col[0]},${col[1]},${col[2]})`;
  }
  /* thang màu phân kỳ: -1 -> đỏ, 0 -> trắng, +1 -> xanh */
  function diverge(t) {
    t = Math.max(-1, Math.min(1, t));
    const w = [251, 252, 253], p = t < 0 ? [216, 49, 42] : [55, 135, 196], u = Math.abs(t);
    return `rgb(${w.map((v, i) => Math.round(v + (p[i] - v) * u)).join(',')})`;
  }
  const xy = (cv, e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const setTxt = (id, t) => { const el = document.getElementById(id); if (el) el.textContent = t; };
  function pressGroup(btns, active) { btns.forEach(b => b.setAttribute('aria-pressed', b === active)); }
  /* kéo rê bằng pointer events: pick(x,y) trả về đối tượng hoặc null; move(obj,x,y) */
  function drag(cv, { pick, move, end }) {
    let cur = null;
    cv.addEventListener('pointerdown', e => { const [x, y] = xy(cv, e); cur = pick(x, y); if (cur) { cv.setPointerCapture(e.pointerId); cv.classList.add('grabbing'); move(cur, x, y); e.preventDefault(); } });
    cv.addEventListener('pointermove', e => { const [x, y] = xy(cv, e); if (cur) move(cur, x, y); else cv.classList.toggle('grab', !!pick(x, y)); });
    const up = () => { if (cur) { cur = null; cv.classList.remove('grabbing'); end && end(); } };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  }

  return { REDUCED, COLORS, fitCanvas, watchCanvas, fmt, num, sci, range, arrow, loopWhenVisible,
    softmax, rng, heat, diverge, xy, setTxt, pressGroup, drag };
})();

/* =====================================================================
   MINH HỌA TẢI KHI CẦN (lazy loading)
   Mỗi minh họa là một file lib/demos/<id>.js gọi TFG.demo(id, def):
     def.html  : giao diện (thanh tiêu đề + canvas + bảng điều khiển)
     def.deps  : (tùy chọn) các file phụ trong lib/demos/ cần nạp trước
     def.init(): chạy minh họa sau khi giao diện đã được chèn
   Trên trang: <div class="demo" id="..." data-demo="<id>"> chỉ là chỗ giữ chỗ;
   file JS chỉ được tải và chạy khi khung này cách màn hình dưới 600px.
   Chạy riêng lẻ: lib/demos/run.html?demo=<id>
   ===================================================================== */
(() => {
  const SRC = document.currentScript ? document.currentScript.src : location.href;
  const DEMO_BASE = new URL('demos/', SRC).href;
  TFG.FIG_BASE = new URL('figures/', SRC).href;
  const reg = {}, waiting = {}, scripts = {};
  TFG.demo = (id, def) => { reg[id] = def; (waiting[id] || []).forEach(f => f(def)); delete waiting[id]; };
  TFG.loadScript = name => scripts[name] || (scripts[name] = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = DEMO_BASE + name + '.js'; s.onload = res; s.onerror = () => rej(new Error('Không tải được lib/demos/' + name + '.js'));
    document.head.appendChild(s);
  }));
  TFG.loadDemo = id => reg[id] ? Promise.resolve(reg[id]) : new Promise((res, rej) => {
    (waiting[id] = waiting[id] || []).push(res);
    TFG.loadScript(id).catch(rej);
  });
  /* ---------- minh họa dùng DỊCH VỤ BÊN NGOÀI ----------
     def.external = { name, note, check: () => Promise }  (check: kiểm tra dịch vụ còn hoạt động)
     - Thanh tiêu đề được gắn huy hiệu cảnh báo (TFG.extBadge).
     - Trước khi chạy, gọi check() (có thời hạn); nếu lỗi -> ẩn minh họa, hiện thông báo.
     - Trong lúc chạy, nếu gọi dịch vụ thất bại, demo gọi TFG.externalDown(el, def.external). */
  const EXT_ICON = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M8 1.5 15 14H1z" fill="#f2c230" stroke="#1B1920" stroke-width="1.4" stroke-linejoin="round"/><path d="M8 6v4" stroke="#1B1920" stroke-width="1.6"/><circle cx="8" cy="12" r=".9" fill="#1B1920"/></svg>';
  TFG.EXT_ICON = EXT_ICON;
  TFG.extBadge = name => `<b class="ext-badge" title="Minh họa này gọi dịch vụ bên ngoài: ${name}. Nếu dịch vụ ngừng hoạt động, minh họa sẽ tự ẩn.">${EXT_ICON}Dịch vụ ngoài: ${name}</b>`;
  TFG.withTimeout = (p, ms, msg = 'Hết thời gian chờ') => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(msg)), ms))]);
  TFG.externalDown = (el, ext, err) => {
    if (el.classList.contains('ext-off')) return;
    if (err) console.warn('[' + ext.name + ']', err);
    const title = el.querySelector('.demo-title h4');
    el.classList.add('ext-off'); el.classList.remove('ext-pending');
    el.innerHTML = `<div class="ext-off-msg" role="status">${EXT_ICON}<div><b>Minh họa "${title ? title.textContent : ''}" đang tạm ẩn.</b> Minh họa này cần dịch vụ bên ngoài (${ext.name}) nhưng hiện không kết nối được, có thể do dịch vụ ngừng hoạt động, mạng bị chặn hoặc đang ngoại tuyến. Nội dung còn lại của trang không bị ảnh hưởng; hãy tải lại trang sau.</div></div>`;
  };
  function mountExternal(el, def) {
    el.innerHTML = def.html; el.classList.add('ready', 'ext-pending');
    const t = el.querySelector('.demo-title'); if (t && !t.querySelector('.ext-badge')) t.insertAdjacentHTML('beforeend', TFG.extBadge(def.external.name));
    const body = el.querySelector('.demo-body'); if (body) body.insertAdjacentHTML('beforebegin', '<div class="demo-loading ext-wait">Đang kết nối dịch vụ bên ngoài…</div>');
    return TFG.withTimeout(Promise.resolve().then(def.external.check), def.external.timeout || 10000)
      .then(() => { el.classList.remove('ext-pending'); const w = el.querySelector('.ext-wait'); if (w) w.remove(); def.init(el); })
      .catch(err => TFG.externalDown(el, def.external, err));
  }
  TFG.mountDemo = (el, id) => {
    if (el._mounting) return Promise.resolve();   // tránh khởi tạo hai lần (tải lười + gọi trực tiếp)
    el._mounting = true;
    return TFG.loadDemo(id)
    .then(def => Promise.all((def.deps || []).map(TFG.loadScript)).then(() => def))
    .then(def => {
      if (def.external) return mountExternal(el, def);
      el.innerHTML = def.html; el.classList.add('ready'); def.init(el);
      if (window.MathJax && MathJax.typesetPromise) MathJax.typesetPromise([el]).catch(() => {});
    })
    .catch(err => { const m = el.querySelector('.demo-loading'); if (m) m.textContent = err.message; console.error(err); })
  };
  TFG.lazyDemos = (root = document) => {
    const els = [...root.querySelectorAll('[data-demo]:not(.ready)')];
    if (!('IntersectionObserver' in window)) { els.forEach(el => TFG.mountDemo(el, el.dataset.demo)); return; }
    const io = new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting) { io.unobserve(e.target); TFG.mountDemo(e.target, e.target.dataset.demo); }
    }), { rootMargin: '600px 0px' });
    els.forEach(el => io.observe(el));
  };

  /* ---------- mục lục nổi: tự dựng từ <section class="part" id> và h2, h3 bên trong ---------- */
  TFG.floatingToc = () => {
    const parts = [...document.querySelectorAll('main section.part[id]')];
    if (!parts.length) return;
    const home = document.body.dataset.home || 'index.html';
    const nav = document.createElement('nav'); nav.className = 'ftoc'; nav.setAttribute('aria-label', 'Mục lục trang');
    const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'ftoc-btn'; btn.setAttribute('aria-controls', 'ftocPanel');
    const panel = document.createElement('div'); panel.className = 'ftoc-panel'; panel.id = 'ftocPanel';
    const homeA = document.createElement('a'); homeA.className = 'ftoc-home'; homeA.href = home; homeA.textContent = 'Trang chủ Robotics';
    const ol = document.createElement('ol'); const links = [];
    parts.forEach(sec => {
      const h2 = sec.querySelector('h2'); if (!h2) return;
      const li = document.createElement('li'), a = document.createElement('a');
      a.href = '#' + sec.id; a.textContent = h2.textContent.trim(); li.appendChild(a); links.push([sec, a]);
      const h3s = [...sec.querySelectorAll('h3')].filter(h => !h.closest('.demo'));
      if (h3s.length) {
        const sub = document.createElement('ol');
        h3s.forEach((h, i) => {
          if (!h.id) h.id = sec.id + '-' + (i + 1);
          const l2 = document.createElement('li'), a2 = document.createElement('a');
          a2.href = '#' + h.id; a2.textContent = h.textContent.trim(); l2.appendChild(a2); sub.appendChild(l2);
        });
        li.appendChild(sub);
      }
      ol.appendChild(li);
    });
    panel.append(homeA, ol);
    // link trang trước / trang sau ở cuối mục lục, lấy từ khối <nav class="pager"> cuối trang
    const pg = [...document.querySelectorAll('main .pager a[href]')];
    if (pg.length) {
      const box = document.createElement('div'); box.className = 'ftoc-pager';
      pg.forEach(p => {
        const isNext = p.classList.contains('next');
        const a = document.createElement('a'); a.href = p.getAttribute('href'); a.className = isNext ? 'next' : 'prev';
        const t = (p.querySelector('b') || p).textContent.trim();
        a.innerHTML = '<small>' + (isNext ? 'Trang sau →' : '← Trang trước') + '</small>';
        a.appendChild(document.createTextNode(t)); box.appendChild(a);
      });
      panel.appendChild(box);
    }
    nav.append(btn, panel); document.body.appendChild(nav);
    // Mặc định THU GỌN mỗi khi tải trang; chỉ nút này mới mở ra / thu gọn lại.
    const ICON_MIN = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3 8h10" stroke="currentColor" stroke-width="2.2"/></svg>';
    const ICON_MAX = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M2 3h12M2 8h12M2 13h8" stroke="currentColor" stroke-width="2" fill="none"/></svg>';
    let open = false;
    const setOpen = v => {
      open = v; nav.classList.toggle('open', v); btn.setAttribute('aria-expanded', v);
      btn.innerHTML = v ? ICON_MIN + '<span>Thu gọn</span>' : ICON_MAX + '<span>Mục lục</span>';
      btn.title = v ? 'Thu gọn mục lục' : 'Mở mục lục';
    };
    btn.addEventListener('click', () => setOpen(!open));
    setOpen(open);
    // đánh dấu mục đang xem
    const io = new IntersectionObserver(es => es.forEach(e => {
      if (!e.isIntersecting) return;
      links.forEach(([s, a]) => a.classList.toggle('active', s === e.target));
    }), { rootMargin: '-35% 0px -60% 0px' });
    links.forEach(([s]) => io.observe(s));
  };

  const go = () => { TFG.lazyDemos(); if (!document.body.hasAttribute('data-no-toc')) TFG.floatingToc(); };
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', go) : go();
})();
