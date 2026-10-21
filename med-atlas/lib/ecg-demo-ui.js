/* =====================================================================
   Vỏ thu gọn cho hai minh họa của trang Điện tâm đồ (3-ecg.html).

   - Lúc tải trang, mỗi minh họa chỉ là một khung tiêu đề với nút "Mở minh họa" (.demo-shell).
   - Bấm mở lần đầu: tải lib/ecg-demo.js (đường dẫn lấy từ data-demo-src của thẻ <script> này),
     rồi dựng đúng minh họa đó. Mở lần sau chỉ hiện lại, không tải hay dựng lại.
   - Bấm "Thu gọn": ẩn minh họa; minh họa tự dừng chạy khi bị ẩn.
   - Nút cuộn nổi ↑ ↓ (.demo-float): hiện khi giữa màn hình nằm trong một minh họa đang mở,
     tính rộng thêm 25% chiều cao của minh họa ở phía trên và phía dưới. Hai nút dùng data-vscroll,
     nên lib/scroll-btns.js lo phần cuộn (bấm một đoạn, giữ để cuộn liên tục).
   ===================================================================== */
(() => {
'use strict';
const me = document.currentScript;
const SRC = (me && me.dataset.demoSrc) || 'lib/ecg-demo.js';
let loading = null;
function loadDemo() {
  if (window.ECGDemo) return Promise.resolve();
  if (!loading) loading = new Promise((ok, fail) => {
    const s = document.createElement('script');
    s.src = SRC; s.onload = ok;
    s.onerror = () => { loading = null; fail(new Error('Không tải được ' + SRC)); };
    document.body.appendChild(s);
  });
  return loading;
}

const ARROW = d => `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="2"/></svg>`;
const float = document.createElement('div');
float.className = 'demo-float'; float.hidden = true;
float.setAttribute('role', 'group'); float.setAttribute('aria-label', 'Cuộn trang');
float.innerHTML = `<button class="btn" type="button" data-vscroll="up" title="Cuộn lên (giữ để cuộn liên tục)" aria-label="Cuộn lên">${ARROW('M8 13V3M3.5 7.5 8 3l4.5 4.5')}</button>`
  + `<button class="btn" type="button" data-vscroll="down" title="Cuộn xuống (giữ để cuộn liên tục)" aria-label="Cuộn xuống">${ARROW('M8 3v10M3.5 8.5 8 13l4.5-4.5')}</button>`;
document.body.appendChild(float);

const shells = [...document.querySelectorAll('.demo-shell')];
let raf = 0;
function updateFloat() {
  raf = 0;
  const mid = innerHeight / 2;
  const show = shells.some(sh => {
    if (!sh.classList.contains('open')) return false;
    const r = sh.getBoundingClientRect(), pad = r.height * 0.25;
    return mid >= r.top - pad && mid <= r.bottom + pad;
  });
  if (float.hidden === show) float.hidden = !show;
}
const schedule = () => { if (!raf) raf = requestAnimationFrame(updateFloat); };
addEventListener('scroll', schedule, { passive: true });
addEventListener('resize', schedule);

for (const sh of shells) {
  const btn = sh.querySelector('.demo-toggle'), box = sh.querySelector('.demo');
  let built = false;
  btn.addEventListener('click', async () => {
    const open = !sh.classList.contains('open');
    if (!open) {
      sh.classList.remove('open'); box.hidden = true;
      btn.textContent = 'Mở minh họa'; btn.setAttribute('aria-expanded', 'false');
      schedule(); return;
    }
    sh.classList.add('open'); box.hidden = false;
    btn.textContent = 'Thu gọn'; btn.setAttribute('aria-expanded', 'true');
    if (!built) {
      box.innerHTML = '<p class="demo-msg">Đang tải minh họa…</p>';
      try {
        await loadDemo();
        box.innerHTML = '';
        window.ECGDemo.build(sh.dataset.demo, box);
        built = true;
      } catch (err) {
        box.innerHTML = `<p class="demo-msg err">${err.message}. Kiểm tra kết nối rồi bấm Thu gọn và mở lại.</p>`;
      }
    }
    schedule();
  });
}
})();
