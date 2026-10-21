/* =====================================================================
   NAVBAR DÙNG CHUNG cho mọi trang của my-library.
   Sửa tên, link, thêm/bớt mục: CHỈ sửa NAV bên dưới; mọi trang tự cập nhật.

   Cách gắn vào một trang (đặt ngay sau thẻ <body> / <noscript>):
       <nav class="site-nav" aria-label="Site"></nav>
       <script src="../common/nav.js"></script>      (đường dẫn tương đối tới common/; trang ở gốc: common/nav.js)
   Script chạy đồng bộ, điền nội dung vào thẻ <nav> đứng ngay trước nó, nên không bị chớp.
   Giao diện: common/site.css (.site-nav, .site-mark).
   Link nội bộ (home: true) tự tính theo thư mục gốc của site (thư mục cha của common/),
   nên dùng được ở mọi độ sâu thư mục, cả trên máy (localhost) lẫn GitHub Pages.
   ===================================================================== */
(() => {
  'use strict';
  const NAV = {
    logo: 'https://nnmy.github.io/lib/logo-my.svg',
    mark: 'My N. Nguyen - Library',          // chữ cạnh logo (bấm vào về trang chủ my-library)
    items: [
      { text: 'Profile', href: 'https://nnmy.github.io/' },
      { text: 'Library', home: true },     // trang chủ my-library; được đánh dấu khi đang ở trang chủ
      { text: 'Collection', href: 'https://nnmy.github.io/my-collection' },
    ],
  };

  const me = document.currentScript;
  const root = new URL('../', me ? me.src : location.href);          // thư mục gốc my-library/
  const homeUrl = new URL('index.html', root).href;
  const here = location.href.split('#')[0].split('?')[0];
  const atHome = here === homeUrl || here === root.href;
  const prev = me && me.previousElementSibling;
  const nav = prev && prev.matches('nav.site-nav') ? prev : document.querySelector('nav.site-nav');
  if (!nav) return;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  nav.innerHTML =
    `<a class="site-mark" href="${homeUrl}"><img src="${NAV.logo}" alt="" width="30" height="30"><span>${esc(NAV.mark)}</span></a>` +
    '<ul>' + NAV.items.map(it => {
      const href = it.home ? homeUrl : it.href, cur = it.home && atHome;
      return `<li><a href="${href}"${cur ? ' class="active" aria-current="page"' : ''}>${esc(it.text)}</a></li>`;
    }).join('') + '</ul>';
})();
