/* =====================================================================
   Tiếng Hoa: tiện ích dùng chung cho mọi trang của nhóm (chép từ tieng-nhat/lib/tn.js, đổi phần đọc).
   - Nhóm tình huống: <details class="grp" id="...">; mọi nhóm thu gọn khi tải trang.
     Vào trang bằng link có #id thì tự mở nhóm đó.
   - Mục lục nổi (như các trang intro-…): thu gọn khi tải trang; liệt kê các nhóm và mục con (h3.sub);
     bấm vào một mục thì mở nhóm đó và cuộn tới.
     Cuối mục lục có link trang trước / trang sau, lấy từ <nav class="pager">.
   - Nút loa (🔊) cạnh mỗi câu / từ tiếng Hoa: đọc bằng giọng tiếng Hoa của trình duyệt (Web Speech API),
     ưu tiên giọng Đài Loan (zh-TW), không có thì dùng giọng zh khác; tự ẩn nếu máy không có giọng tiếng Hoa.
   ===================================================================== */
(() => {
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const groups = () => $$('details.grp');

/* ---------- mở nhóm theo #hash ---------- */
function openFromHash() {
  const id = decodeURIComponent(location.hash.slice(1)); if (!id) return;
  const el = document.getElementById(id); if (!el) return;
  const d = el.closest('details.grp') || (el.matches('details.grp') ? el : null);
  if (d) { d.open = true; requestAnimationFrame(() => d.scrollIntoView({ block: 'start' })); }
}

/* ---------- mục lục nổi ---------- */
function floatingToc() {
  const gs = groups(); if (!gs.length) return;
  const nav = document.createElement('nav'); nav.className = 'ftoc'; nav.setAttribute('aria-label', 'Mục lục trang');
  const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'ftoc-btn'; btn.setAttribute('aria-controls', 'ftocPanel');
  const panel = document.createElement('div'); panel.className = 'ftoc-panel'; panel.id = 'ftocPanel';
  const homeA = document.createElement('a'); homeA.className = 'ftoc-home'; homeA.href = 'index.html'; homeA.textContent = 'Trang chủ Tiếng Hoa';
  const ol = document.createElement('ol'), links = [];
  gs.forEach(d => {
    const li = document.createElement('li'), a = document.createElement('a');
    a.href = '#' + d.id; a.textContent = $('summary .t', d).textContent.trim();
    a.addEventListener('click', () => { d.open = true; });
    li.appendChild(a); ol.appendChild(li); links.push([d, a]);
    const subs = $$('h3.sub', d);
    if (subs.length) {
      const sub = document.createElement('ol');
      subs.forEach((h, i) => {
        if (!h.id) h.id = d.id + '-' + (i + 1);
        const l2 = document.createElement('li'), a2 = document.createElement('a');
        a2.href = '#' + h.id; a2.textContent = h.textContent.trim();
        a2.addEventListener('click', () => { d.open = true; });
        l2.appendChild(a2); sub.appendChild(l2);
      });
      li.appendChild(sub);
    }
  });
  panel.append(homeA, ol);
  const pg = $$('main .pager a[href]');
  if (pg.length) {
    const box = document.createElement('div'); box.className = 'ftoc-pager';
    pg.forEach(p => {
      const next = p.classList.contains('next'), a = document.createElement('a');
      a.href = p.getAttribute('href'); a.className = next ? 'next' : 'prev';
      a.innerHTML = '<small>' + (next ? 'Trang sau →' : '← Trang trước') + '</small>';
      a.appendChild(document.createTextNode(($('b', p) || p).textContent.trim())); box.appendChild(a);
    });
    panel.appendChild(box);
  }
  nav.append(btn, panel); document.body.appendChild(nav);
  const ICON_MIN = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3 8h10" stroke="currentColor" stroke-width="2.2"/></svg>';
  const ICON_MAX = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M2 3h12M2 8h12M2 13h8" stroke="currentColor" stroke-width="2" fill="none"/></svg>';
  let open = false;   // luôn thu gọn khi tải trang
  const setOpen = v => {
    open = v; nav.classList.toggle('open', v); btn.setAttribute('aria-expanded', v);
    btn.innerHTML = v ? ICON_MIN + '<span>Thu gọn</span>' : ICON_MAX + '<span>Mục lục</span>';
    btn.title = v ? 'Thu gọn mục lục' : 'Mở mục lục';
  };
  btn.addEventListener('click', () => setOpen(!open));
  setOpen(false);
  const io = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting) links.forEach(([d, a]) => a.classList.toggle('active', d === e.target));
  }), { rootMargin: '-35% 0px -60% 0px' });
  links.forEach(([d]) => io.observe(d));
}

/* ---------- đọc tiếng Hoa ----------
   - Gom mọi giọng tiếng Hoa có trên máy, xếp ưu tiên: Đài Loan (zh-TW, zh-Hant, cmn-Hant-TW) → phổ thông khác
     (zh-CN, cmn) → Hồng Kông / Quảng Đông (zh-HK, yue) sau cùng. Mã ngôn ngữ được chuẩn hóa ("zh_TW" → "zh-TW").
   - Mỗi lần bấm: dừng câu đang đọc, đợi một nhịp rồi mới đọc câu mới (Chrome bỏ qua speak() gọi ngay sau cancel()),
     gọi resume() phòng trường hợp bộ đọc bị kẹt ở trạng thái tạm dừng.
   - Nếu giọng đang chọn báo lỗi hoặc không bắt đầu đọc sau 2,5 giây (giọng có tên nhưng chưa tải về máy, giọng mạng
     không phản hồi), tự thử giọng kế tiếp, cuối cùng để trình duyệt tự chọn theo lang="zh-TW".
   - Giữ tham chiếu tới utterance đang đọc để không bị thu gom bộ nhớ giữa chừng (lỗi đã biết của Chrome).
   - Nút loa ẩn nếu trình duyệt không có Web Speech API, hoặc đã có danh sách giọng mà không có giọng tiếng Hoa nào. */
function speech() {
  if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) return;
  const synth = window.speechSynthesis;
  const norm = l => String(l || '').replace(/_/g, '-');
  const rank = v => {
    const l = norm(v.lang).toLowerCase();
    if (/^(zh|cmn)-(tw|hant)/.test(l)) return 0;
    if (/^(zh|cmn)(-|$)/.test(l) && !/^zh-(hk|mo)/.test(l)) return 1;
    if (/^(zh|yue)(-|$)/.test(l)) return 2;
    return -1;
  };
  let voices = [], listed = false;
  const pick = () => {
    const all = synth.getVoices() || [];
    if (all.length) listed = true;
    voices = all.filter(v => rank(v) >= 0)
      .sort((a, b) => rank(a) - rank(b) || (b.localService === true) - (a.localService === true));
    document.body.classList.toggle('tn-tts', voices.length > 0 || !listed);
  };
  pick();
  if (synth.addEventListener) synth.addEventListener('voiceschanged', pick);
  else synth.onvoiceschanged = pick;
  setTimeout(pick, 1500);

  let current = null, timer = 0, playing = null;
  const stopUI = () => { if (playing) playing.classList.remove('is-speaking'); playing = null; };
  function attempt(text, list, i, btn) {
    clearTimeout(timer);
    const v = list[i];                                   // undefined = để trình duyệt tự chọn giọng
    const u = new SpeechSynthesisUtterance(text);
    u.lang = v ? norm(v.lang) : 'zh-TW';
    if (v) u.voice = v;
    u.rate = 0.9;
    let started = false;
    const next = () => { if (current !== u) return; current = null; synth.cancel(); if (i < list.length) setTimeout(() => attempt(text, list, i + 1, btn), 80); else stopUI(); };
    u.onstart = () => { started = true; clearTimeout(timer); };
    u.onend = () => { if (current === u) { current = null; stopUI(); } };
    u.onerror = e => { if (e && (e.error === 'interrupted' || e.error === 'canceled')) return; next(); };
    current = u;
    synth.resume();
    synth.speak(u);
    timer = setTimeout(() => { if (!started && current === u) next(); }, 2500);
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('.say'); if (!b) return;
    e.preventDefault();
    const box = b.closest('.ph, .vw, td, li'); if (!box) return;
    const el = box.querySelector('[lang|="zh"]'); if (!el) return;
    const text = el.textContent.replace(/[＿_]+/g, '').trim(); if (!text) return;
    if (!voices.length) pick();
    clearTimeout(timer); current = null; stopUI();
    playing = b; b.classList.add('is-speaking');
    const busy = synth.speaking || synth.pending;
    synth.cancel();
    if (busy) setTimeout(() => attempt(text, voices.slice(), 0, b), 120);
    else attempt(text, voices.slice(), 0, b);           // gọi ngay trong sự kiện bấm (Safari iOS cần vậy)
  });
}

const safe = fn => { try { fn(); } catch (err) { console.error(err); } };   // lỗi ở một phần không chặn các phần khác
const go = () => { safe(floatingToc); safe(openFromHash); safe(speech); };
document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', go) : go();
addEventListener('hashchange', openFromHash);
})();
