/* =====================================================================
   Xem ảnh NIfTI (view_nifti.html). Không dùng thư viện hay dịch vụ ngoài; file chỉ đọc trên máy người dùng.
   Cách dùng trên trang:  NIFTIVIEW.start({ printHeader: "My N. Nguyen's Library" })

   Đọc được:
     ảnh     NIfTI-1 / NIfTI-2 (.nii, .nii.gz), NRRD gắn liền (.nrrd: raw, gzip, ascii)
     nhãn    như trên; .seg.nrrd của 3D Slicer (nhiều lớp, tên + màu của từng segment)
     bảng tên nhãn (tùy chọn)  ITK-SNAP label description, FreeSurfer LUT, Slicer .ctbl, CSV "id,tên,r,g,b"

   Hình học: ảnh được đưa về lưới gần với RAS nhất (như nibabel io_orientation; ảnh xoay xiên thì làm tròn về trục gần nhất).
   Quy ước hiển thị mặc định: thần kinh (bên phải người bệnh ở bên phải màn hình), giống head-mri.html; đổi được sang X-quang.
   Nhãn khác lưới với ảnh được lấy mẫu lại (láng giềng gần nhất) theo hai ma trận affine.

   Mục lục file:
     1. tiện ích, bảng màu
     2. đọc NIfTI, NRRD, bảng tên nhãn
     3. hình học: hướng trục, lưới RAS, ghép nhãn vào lưới ảnh
     4. dựng lát cắt (ảnh + nhãn tô/viền)
     5. trình xem: vẽ, con trỏ, điều khiển
     6. bảng thông tin + danh sách nhãn
     7. ô chọn bảng màu (có xem trước)
     8. mosaic + chú thích, tải PNG
     9. nạp file, khởi động
   ===================================================================== */
const NIFTIVIEW = (() => {
'use strict';

/* ---------------- 1. tiện ích, bảng màu ---------------- */
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const tick = () => new Promise(r => setTimeout(r, 0));
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
/* số kiểu Việt (dấu phẩy thập phân) hoặc kiểu Anh; d chữ số sau dấu thập phân, bỏ số 0 thừa nếu trim */
const fmtN = (v, d, lang = 'vi', trim = false) => {
  if (!Number.isFinite(v)) return String(v);
  let s = Math.abs(v).toFixed(d);
  if (trim && s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
  if (lang === 'vi') s = s.replace('.', ',');
  return (v < 0 && Number(s.replace(',', '.')) !== 0 ? '−' : '') + s;
};
/* giá trị cường độ: số chữ số tùy độ lớn */
const fmtV = (v, lang = 'vi') => {
  if (!Number.isFinite(v)) return String(v);
  const a = Math.abs(v);
  const d = a === 0 || a >= 1000 ? 0 : a >= 100 ? 1 : a >= 1 ? 2 : 4;
  return fmtN(v, d, lang, true);
};
const baseName = n => n.replace(/\.(nii\.gz|nii|nrrd|nhdr|gz)$/i, '');

const CMAP_B64 = {
  gray: 'AAAAAQEBAgICAwMDBAQEBQUFBgYGBwcHCAgICQkJCgoKCwsLDAwMDQ0NDg4ODw8PEBAQEREREhISExMTFBQUFRUVFhYWFxcXGBgYGRkZGhoaGxsbHBwcHR0dHh4eHx8fICAgISEhIiIiIyMjJCQkJSUlJiYmJycnKCgoKSkpKioqKysrLCwsLS0tLi4uLy8vMDAwMTExMjIyMzMzNDQ0NTU1NjY2Nzc3ODg4OTk5Ojo6Ozs7PDw8PT09Pj4+Pz8/QEBAQUFBQkJCQ0NDRERERUVFRkZGR0dHSEhISUlJSkpKS0tLTExMTU1NTk5OT09PUFBQUVFRUlJSU1NTVFRUVVVVVlZWV1dXWFhYWVlZWlpaW1tbXFxcXV1dXl5eX19fYGBgYWFhYmJiY2NjZGRkZWVlZmZmZ2dnaGhoaWlpampqa2trbGxsbW1tbm5ub29vcHBwcXFxcnJyc3NzdHR0dXV1dnZ2d3d3eHh4eXl5enp6e3t7fHx8fX19fn5+f39/gICAgYGBgoKCg4ODhISEhYWFhoaGh4eHiIiIiYmJioqKi4uLjIyMjY2Njo6Oj4+PkJCQkZGRkpKSk5OTlJSUlZWVlpaWl5eXmJiYmZmZmpqam5ubnJycnZ2dnp6en5+foKCgoaGhoqKio6OjpKSkpaWlpqamp6enqKioqampqqqqq6urrKysra2trq6ur6+vsLCwsbGxsrKys7OztLS0tbW1tra2t7e3uLi4ubm5urq6u7u7vLy8vb29vr6+v7+/wMDAwcHBwsLCw8PDxMTExcXFxsbGx8fHyMjIycnJysrKy8vLzMzMzc3Nzs7Oz8/P0NDQ0dHR0tLS09PT1NTU1dXV1tbW19fX2NjY2dnZ2tra29vb3Nzc3d3d3t7e39/f4ODg4eHh4uLi4+Pj5OTk5eXl5ubm5+fn6Ojo6enp6urq6+vr7Ozs7e3t7u7u7+/v8PDw8fHx8vLy8/Pz9PT09fX19vb29/f3+Pj4+fn5+vr6+/v7/Pz8/f39/v7+////',
  bone: 'AAAAAQEBAgICAwMEBAMFBAQGBQUHBgYJBwcKCAgLCQkMCgoNCgoPCwsQDAwRDQ0SDg4TDw8VEBAWEREXEhEYEhIaExMbFBQcFRUdFhYeFxcgGBghGBgiGRkjGholGxsmHBwnHR0oHh4pHx8rIB8sICAtISEuIiIvIyMxJCQyJSUzJiY0JiY2Jyc3KCg4KSk5Kio6Kys8LCw9LS0+Li0/Li5BLy9CMDBDMTFEMjJFMzNHNDRINDRJNTVKNjZLNzdNODhOOTlPOjpQOztSPDtTPDxUPT1VPj5WPz9YQEBZQUFaQkJbQkJdQ0NeRERfRUVgRkZhR0djSEhkSUllSklmSkpnS0tpTExqTU1rTk5sT09uUFBvUFBwUVFxUlNyU1RzVFV0VVZ1Vld2V1l2V1p3WFt4WVx5Wl16W197XGB8XWF9XmJ9XmN+X2V/YGaAYWeBYmiCY2mDZGuEZWyEZm2FZm6GZ2+HaHGIaXKJanOKa3SLbHWLbHeMbXiNbnmOb3qPcHuQcX2Rcn6Sc3+Sc4CTdIGUdYOVdoSWd4WXeIaYeYeZeomZeoqae4ubfIycfY2dfo+ef5CfgJGggZKggZShgpWig5ajhJekhZilhpqmh5uniJyniJ2oiZ6piqCqi6GrjKKsjaOtjqSuj6auj6evkKiwkamxkqqyk6yzlK20la61lq+1lrC2l7K3mLO4mbS5mrW6m7a7nLi8nbm8nbq9nru+n7y/oL7Aob/BosDCo8HDpMLDpMTEpcXFpsbGp8fHqcjIqsnJrMrKrcrKrsvLsMzMsc3Nss7OtM/PtdDQt9HRuNLRudLSu9PTvNTUvdXVv9bWwNfXwdjYw9jYxNnZxtrax9vbyNzcyt3dy97ezN/fzuDfz+Dg0eHh0uLi0+Pj1eTk1uXl1+bm2ebm2ufn2+jo3enp3urq4Ovr4ezs4u3t5O7t5e7u5u/v6PDw6fHx6vLy7PPz7fT07/T08PX18fb28/f39Pj49fn59/r6+Pv7+vz7+/z8/P39/v7+////',
  hot: 'CwAADQAAEAAAEgAAFQAAGAAAGgAAHQAAIAAAIgAAJQAAJwAAKgAALQAALwAAMgAANQAANwAAOgAAPAAAPwAAQgAARAAARwAASgAATAAATwAAUQAAVAAAVwAAWQAAXAAAXwAAYQAAZAAAZgAAaQAAbAAAbgAAcQAAdAAAdgAAeQAAewAAfgAAgQAAgwAAhgAAiQAAiwAAjgAAkAAAkwAAlgAAmAAAmwAAngAAoAAAowAApQAAqAAAqwAArQAAsAAAswAAtQAAuAAAugAAvQAAwAAAwgAAxQAAyAAAygAAzQAAzwAA0gAA1QAA1wAA2gAA3QAA3wAA4gAA5AAA5wAA6gAA7AAA7wAA8gAA9AAA9wAA+QAA/AAA/wAA/wIA/wUA/wgA/woA/w0A/xAA/xIA/xUA/xcA/xoA/x0A/x8A/yIA/yUA/ycA/yoA/ywA/y8A/zIA/zQA/zcA/zoA/zwA/z8A/0EA/0QA/0cA/0kA/0wA/08A/1EA/1QA/1YA/1kA/1wA/14A/2EA/2QA/2YA/2kA/2sA/24A/3EA/3MA/3YA/3kA/3sA/34A/4AA/4MA/4YA/4gA/4sA/44A/5AA/5MA/5UA/5gA/5sA/50A/6AA/6IA/6UA/6gA/6oA/60A/7AA/7IA/7UA/7cA/7oA/70A/78A/8IA/8UA/8cA/8oA/8wA/88A/9IA/9QA/9cA/9oA/9wA/98A/+EA/+QA/+cA/+kA/+wA/+8A//EA//QA//YA//kA//wA//4A//8D//8H//8L//8P//8T//8X//8b//8f//8i//8m//8q//8u//8y//82//86//8+//9C//9G//9K//9O//9S//9W//9a//9e//9h//9l//9p//9t//9x//91//95//99//+B//+F//+J//+N//+R//+V//+Z//+d//+g//+k//+o//+s//+w//+0//+4//+8///A///E///I///M///Q///U///Y///c///f///j///n///r///v///z///3///7////',
  copper: 'AAAAAQEAAgIBBAIBBQMCBgQCBwUDCQUDCgYECwcEDAgFDgkFDwkGEAoGEQsHEwwHFAwIFQ0IFg4JFw8JGRAKGhAKGxELHBILHhMMHxQMIBQNIRUNIxYOJBcOJRcPJhgPKBkQKRoQKhsRKxsRLBwSLh0SLx4TMB4TMR8UMyAUNCEVNSIVNiIWOCMWOSQXOiUXOyUYPSYYPicZPygZQCkaQSkaQyobRCsbRSwcRi0cSC0dSS4dSi8eSzAeTTAfTjEfTzIgUDMgUjQhUzQhVDUiVTYiVjcjWDcjWTgkWjkkWzolXTslXjsmXzwmYD0nYj4nYz4oZD8oZUApZ0EpaEIqaUIqakMra0QrbUUsbkYsb0YtcEctckguc0kudEkvdUovd0sweEwweU0xek0xfE4yfU8yflAzf1AzgFE0glI0g1M1hFQ1hVQ2h1U2iFY3iVc3ilc4jFg4jVk5jlo5j1s6kVs6klw7k107lF48lV88l189mGA9mWE+mmI+nGI/nWM/nmRAn2VAoWZBomZBo2dCpGhCpmlDp2lDqGpEqWtEqmxFrG1FrW1Grm5Gr29HsXBHsnBIs3FItHJJtnNJt3RKuHRKuXVLu3ZLvHdMvXhMvnhNv3lNwXpOwntOw3tPxHxPxn1Qx35QyH9RyX9Ry4BSzIFSzYJTzoJT0INU0YRU0oVV04ZV1IZW1odW14hX2IlX2YlY24pY3ItZ3YxZ3o1a4I1a4Y5b4o9b45Bc5ZFc5pFd55Jd6JNe6ZRe65Rf7JVf7ZZg7pdg8Jhh8Zhh8pli85pi9Ztj9ptj95xk+J1k+p5k+59l/J9l/aBm/qFm/6Jn/6Jn/6No/6Ro/6Vp/6Zp/6Zq/6dq/6hr/6lr/6ps/6ps/6tt/6xt/61u/61u/65v/69v/7Bw/7Fw/7Fx/7Jx/7Ny/7Ry/7Rz/7Vz/7Z0/7d0/7h1/7h1/7l2/7p2/7t3/7t3/7x4/714/755/795/796/8B6/8F7/8J7/8N8/8N8/8R9/8V9/8Z+/8Z+/8d/',
  inferno: 'AAAEAQAFAQEGAQEIAgEKAgIMAgIOAwIQBAMSBAMUBQQXBgQZBwUbCAUdCQYfCgciCwckDAgmDQgpDgkrEAktEQowEgoyFAs0FQs3Fgs5GAw8GQw+GwxBHAxDHgxFHwxIIQxKIwxMJAxPJgxRKAtTKQtVKwtXLQtZLwpbMQpcMgpeNApfNglhOAliOQljOwlkPQllPglmQApnQgpoRApoRQppRwtqSQtqSgxrTAxrTQ1sTw1sUQ5sUg5tVA9tVQ9tVxBuWRBuWhFuXBJuXRJuXxNuYRNuYhRuZBVuZRVuZxZuaRZuahdubBhubRhubxlucRluchpudBpudRtudxxteBxteh1tfB1tfR5tfx5sgB9sgiBshCBrhSFrhyFriCJqiiJqjCNpjSNpjyRpkCVokiVokyZnlSZnlydmmCdmmihlmylknSlknypjoCpjoitioyxhpSxgpi1gqC5fqS5eqy9erTBdrjBcsDFbsTJaszJatDNZtjRYtzVXuTVWujZVvDdUvThTvzlSwDpRwTpQwztPxDxOxj1Nxz5MyD9LykBKy0FJzEJIzkNHz0RG0EVF0kZE00dD1EhC1UpB10s/2Ew+2U092k4821A73VE63lI431M34FU24VY14lc041kz5Fox5Vww5l0v514u6GAt6WEr6mMq62Qp62Yo7Gcm7Wkl7mok72wj724h8G8g8XEf8XMd8nQc83Yb83gZ9HkY9XsX9X0V9n4U9oAT94IS94QQ+IUP+IcO+IkM+YsL+YwK+Y4J+pAI+pIH+pQH+5YG+5cG+5kG+5sG+50H/J8H/KEI/KMJ/KUK/KYM/KgN/KoP/KwR/K4S/LAU/LIW/LQY+7Ya+7gd+7of+7wh+74j+sAm+sIo+sQq+sYt+ccv+cky+cs1+M03+M8699E999NA9tVD9tdG9dlJ9dtM9N1P9N9T9OFW8+Na8+Vd8uZh8uhl8upp8ext8e1x8e918fF58vJ98vSC8/WG8/aK9PiO9fmS9vqW+Pua+fyd+v2h/P+k',
  magma: 'AAAEAQAFAQEGAQEIAgEJAgILAgINAwMPAwMSBAQUBQQWBgUYBgUaBwYcCAceCQcgCggiCwkkDAkmDQopDgsrEAstEQwvEg0xEw00FA42FQ44Fg87GA89GRA/GhBCHBBEHRFHHhFJIBFLIRFOIhFQJBJTJRJVJxJYKRFaKhFcLBFfLRFhLxFjMRFlMxBnNBBpNhBrOBBsOQ9uOw9wPQ9xPw9yQA90Qg91RA92RRB3RxB4SRB4ShB5TBF6ThF7TxJ7URJ8UhN8VBN9VhR9VxV+WRV+WhZ+XBZ/XRd/Xxh/YBiAYhmAZBqAZRqAZxuAaByBahyBax2BbR2Bbh6BcB+Bch+BcyCBdSGBdiGBeCKBeSKCeyOCfCOCfiSCgCWCgSWBgyaBhCaBhieBiCeBiSiBiymBjCmBjiqBkCqBkSuBkyuAlCyAliyAmC2AmS2Amy5/nC5/ni9/oC9/oTB+ozB+pTF+pjF9qDJ9qjN9qzN8rTR8rjR7sDV7sjV7szZ6tTZ6tzd5uDd5ujh4vDl4vTl3vzp3wDp2wjt1xDx1xTx0xz1zyD5zyj5yzD9xzUBxz0Bw0EFv0kJv00Nu1URt1kVs2EVs2UZr20dq3Ehp3klo30po4Exn4k1m405l5E9k5VBk51Jj6FNi6VRi6lZh61dg7Fhg7Vpf7lte711e8F9e8WBd8mJd8mRc82Vc9Gdc9Glc9Wtc9mxc9m5c93Bc93Jc+HRc+HZc+Xhd+Xld+Xtd+n1e+n9e+oFf+4Nf+4Vg+4dh/Ilh/Ipi/Ixj/I5k/JBl/ZJm/ZRn/ZZo/Zhp/Zpq/Ztr/p1s/p9t/qFu/qNv/qVx/qdy/qlz/qp0/qx2/q53/rB4/rJ6/rR7/rZ8/rd+/rl//ruB/r2C/r+E/sGF/sKH/sSI/saK/siM/sqN/syP/s2Q/s+S/tGU/tOV/tWX/teZ/tia/dqc/dye/d6g/eCh/eKj/eOl/eWn/eep/emq/eus/Oyu/O6w/PCy/PK0/PS2/Pa4/Pe5/Pm7/Pu9/P2/',
  plasma: 'DQiHEAeIEweJFgeKGQaMGwaNHQaOIAaPIgaQJAaRJgWRKAWSKgWTLAWULgWVLwWWMQWXMwWXNQSYNwSZOASaOgSaPASbPgScPwScQQSdQwOeRAOeRgOfSAOfSQOgSwOhTAKhTgKiUAKiUQKjUwKjVQKkVgGkWAGkWQGlWwGlXAGmXgGmYAGmYQCnYwCnZACnZgCnZwCoaQCoagCobACobgCobwCocQCocgGodAGodQGodwGoeAGoegKoewKofQOofgOogASogQSngwWnhAWnhgamhwemiAimigmliwqljQuljgykjw2kkQ6jkg+jlBCilRGhlhOhmBSgmRWfmhafnBeenRidnhmdoBqcoRuboh2aox6apR+ZpiCYpyGXqCKWqiOVqySUrCaUrSeTriiSsCmRsSqQsiuPsyyOtC6NtS+MtjCLtzGKuDKJujOIuzSIvDWHvTeGvjiFvzmEwDqDwTuCwjyBwz2AxD5/xUB+xkF9x0J8yEN7yUR6ykV6y0Z5zEd4zEl3zUp2zkt1z0x00E1z0U5y0k9x01Fx1FJw1VNv1VRu1lVt11Zs2Fdr2Vhq2lpq2ltp21xo3F1n3V5m3l9l3mFk32Jj4GNj4WRi4mVh4mZg42hf5Gle5Wpd5Wtd5mxc525b529a6HBZ6XFY6XJX6nRX63VW63ZV7HdU7XlT7XpS7ntR73xR735Q8H9P8IBO8YFN8YNM8oRL84VL84dK9IhJ9IlI9YtH9YxG9o1F9o9E95BE95FD95NC+JRB+JVA+Zc/+Zg++Zo++ps9+pw8+p47+586+6E5+6I4/KM4/KU3/KY2/Kg1/Kk0/asz/awz/a4y/a8x/bEw/bIv/bQv/bUu/rct/rgs/ros/rsr/r0q/r4q/sAp/cIp/cMo/cUn/cYn/cgn/com/csm/M0l/M4l/NAl/NIl+9Mk+9Uk+9ck+tgk+tok+dwk+d0l+N8l+OEl9+Il9+Ql9uYm9ugm9ekm9esn9O0n8+4n8/An8vIn8fQm8fUl8Pck8Pkh',
  viridis: 'RAFURAJWRQRXRQVZRgdaRghcRgpdRgteRw1gRw5hRxBjRxFkRxNlSBRnSBZoSBdpSBhqSBpsSBttSBxuSB1vSB9wSCBxSCFzSCN0SCR1SCV2SCZ3SCh4SCl5Ryp6Ryx6Ry17Ry58Ry99RjB+RjJ+RjN/RjSARTWBRTeBRTiCRDmDRDqDRDuEQz2EQz6FQj+FQkCGQkGGQUKHQUSHQEWIQEaIP0eIP0iJPkmJPkqJPkyKPU2KPU6KPE+KPFCLO1GLO1KLOlOLOlSMOVWMOVaMOFiMOFmMN1qMN1uNNlyNNl2NNV6NNV+NNGCNNGGNM2KNM2ONMmSOMmWOMWaOMWeOMWiOMGmOMGqOL2uOL2yOLm2OLm6OLm+OLXCOLXGOLHGOLHKOLHOOK3SOK3WOKnaOKneOKniOKXmOKXqOKXuOKHyOKH2OJ36OJ3+OJ4COJoGOJoKOJoKOJYOOJYSOJYWOJIaOJIeOI4iOI4mOI4qNIouNIoyNIo2NIY6NIY+NIZCNIZGMIJKMIJKMIJOMH5SMH5WLH5aLH5eLH5iLH5mKH5qKHpuKHpyJHp2JH56JH5+IH6CIH6GIH6GHH6KHIKOGIKSGIaWFIaaFIqeFIqiEI6mDJKqDJauCJayCJq2BJ62BKK6AKa9/KrB/LLF+LbJ9LrN8L7R8MbV7MrZ6NLZ5Nbd5N7h4OLl3Orp2O7t1Pbx0P7xzQL1yQr5xRL9wRsBvSMFuSsFtTMJsTsNrUMRqUsVpVMVoVsZnWMdlWshkXMhjXsliYMpgY8tfZcteZ8xcac1bbM1abs5YcM9Xc9BWddBUd9FTetFRfNJQf9NOgdNNhNRLhtVJidVIi9ZGjtZFkNdDk9dBldhAmNg+m9k8ndk7oNo5oto3pds2qNs0qtwyrdwwsN0vst0ttd4ruN4put4ovd8mwN8lwt8jxeAhyOAgyuEfzeEd0OEc0uIb1eIa2OIZ2uMZ3eMY3+MY4uQY5eQZ5+QZ6uUa7OUb7+Uc8eUd9OYe9uYg+OYh++cj/ecl',
  cividis: 'ACJOACNPACRRACVTACVUACZWACdYAChZAChbACldACpfACphACtiACxkACxmAC1oAC5qAC5sAC9tADBvADBwADFwADFxATJxBTNxCDNwDDRwDzVwEjVwFDZwFjdwGDdvGjhvHDlvHjpvIDpvITtuIzxuJDxuJj1uJz5uKT9uKj9tK0BtLUFtLkFtL0JtMUNtMkNtM0RtNEVsNUVsNkZsOEdsOUhsOkhsO0lsPEpsPUpsPktsP0xsQExsQU1sQk5sQ05sRE9sRVBsRlFsR1FsSFJsSVNsSlNsS1RsTFVsTVVsTlZsT1dsUFdsUVhtUlltU1ptVFptVVttVVxtVlxtV11tWF5tWV5uWl9uW2BuXGFuXWFuXmJuXmNvX2NvYGRvYWVvYmVvY2ZwZGdwZWhwZWhwZmlwZ2pxaGpxaWtxamxxa21ybG1ybG5ybW9ybm9zb3BzcHFzcXJ0cnJ0cnN0c3R1dHR1dXV1dnZ2d3d2d3d3eHh3eXl3enp4e3p4fHt4fXx4fnx4fn14f354gH94gX94goB5g4F5hIJ5hYJ5hoN5h4R4iIV4iYV4ioZ4i4d4jIh4jYh4jol4j4p4kIt4kYt4kox4ko14k454lI53lY93lpB3l5F3mJJ3mZJ3mpN2m5R2nJV2nZV2npZ2n5d1oJh1oZl1opl1o5p0pJt0pZx0ppx0p51zqJ5zqZ9zqqBzq6ByrKFyraJyrqNxr6RxsKVxsaVws6ZwtKdvtahvtqlvt6luuKpuuattuqxtu61tvK5sva5svq9rv7BrwLFqwbJqwrNpw7NpxLRoxbVoxrZnx7dnyLhmyblly7llzLpkzbtjzrxjz71i0L5i0b9h0sBg08Bf1MFf1cJe1sNd18Rc2cVc2sZb28da3MhZ3chY3slY38pX4MtW4cxV4s1U5M5T5c9S5tBR59FQ6NJP6dNO6tNM69RL7dVK7tZJ79dI8NhG8dlF8tpE89tC9dxB9t0/994++N88+eA6++E4/OI2/eM0/uQ0/uU1/uY2/ug4',
  turbo: 'MBI7MhVDMxhKNBtRNR5YNiFfNyRmOCdtOSpzOi15Oy+APDKGPTWLPjiRPzuXPz6cQECiQUOnQUasQkmxQku1Q066RFG/RFTDRFbHRVnLRVzPRV7TRmHWRmTaRmbdRmngRmvjR27mR3HpR3PrR3buR3jwR3vyRn30RoD2RoL4RoX6Rof7RYr8RYz9RI/+Q5H+QpT/QZb/QJn/Ppv+PZ7+O6D9OqP8OKX7N6j6Nav4M633Ma/1L7L0LrTyLLfwKrnuKLzrJ77pJcDnI8PkIsXiIMffH8ndHsvaHM3YG9DVGtLSGtTQGdXNGNfKGNnIGNvFGN3CGN7AGOC9GeK7GeO5GuS2HOa0HeeyH+mvIOqsIuuqJeynJ+6kKu+hLPCeL/GbMvKYNfOUOPSRPPWOP/aKQ/eHRviESviATvl9Uvp6Vfp2WftzXfxvYfxsZf1paf1mbf5icf5fdf5cef5Zff9WgP9ThP9RiP9Oi/9Lj/9Jkv9Hlv5Emf5CnP5An/0/of09pPw8p/w6qfs5rPs4r/o3sfk2tPg2t/c1ufY1vPU0vvQ0wfM0w/E0xvA0yO80y+00zew00Oo00uk11Oc11+U12eQ22+I23eA339834d0349s45dk459c56dU569M57NE67s8678068cs68sk69Mc69cU69sM698E6+L45+bw5+ro5+7g4+7Y3/LM2/LE2/a41/aw0/qkz/qcy/qQx/qEw/p4v/pst/pks/pYr/pMq/pAp/Y0n/Yom/Icl/IQj+4Ei+34h+nsf+Xge+XUd+HIc928a9mwZ9WkY9GYX82MV8mAU8V0T8FsS71gR7VUQ7FMP61AO6k4N6EsM50kM5UcL5EUK4kMK4UEJ3z8I3T0I3DsH2jkH2DcG1jUG1DMF0jEF0C8Fzi0EzCsEyioEyCgDxSYDwyUDwSMCviECvCACuR4Ctx0CtBsBshoBrxgBrBcBqRYBpxQBpBMBoRIBnhABmw8BmA4BlQ0BkgsBjgoBiwkCiAgChQcCgQYCfgUCegQD',
  jet: 'AACAAACEAACJAACNAACSAACWAACbAACfAACkAACoAACtAACyAAC2AAC7AAC/AADEAADIAADNAADRAADWAADaAADfAADjAADoAADtAADxAAD2AAD6AAD/AAD/AAD/AAD/AAD/AAT/AAj/AAz/ABD/ABT/ABj/ABz/ACD/ACT/ACj/ACz/ADD/ADT/ADj/ADz/AED/AET/AEj/AEz/AFD/AFT/AFj/AFz/AGD/AGT/AGj/AGz/AHD/AHT/AHj/AHz/AID/AIT/AIj/AIz/AJD/AJT/AJj/AJz/AKD/AKT/AKj/AKz/ALD/ALT/ALj/ALz/AMD/AMT/AMj/AMz/AND/ANT/ANj/ANz+AOD7AOT4Auj0BuzxCfDuDPTrD/jnE/zkFv/hGf/eHP/bH//XI//UJv/RKf/OLP/KMP/HM//ENv/BOf++PP+6QP+3Q/+0Rv+xSf+tTf+qUP+nU/+kVv+gWv+dXf+aYP+XY/+UZv+Qav+Nbf+KcP+Hc/+Dd/+Aev99ff96gP93g/9zh/9wiv9tjf9qkP9mlP9jl/9gmv9dnf9aoP9WpP9Tp/9Qqv9Nrf9Jsf9GtP9Dt/9Auv88vv85wf82xP8zx/8wyv8szv8p0f8m1P8j1/8f2/8c3v8Z4f8W5P8T5/8P6/8M7v8J8fwG9PgC+PUA+/EA/u0A/+oA/+YA/+IA/94A/9sA/9cA/9MA/9AA/8wA/8gA/8QA/8EA/70A/7kA/7YA/7IA/64A/6sA/6cA/6MA/58A/5wA/5gA/5QA/5EA/40A/4kA/4YA/4IA/34A/3oA/3cA/3MA/28A/2wA/2gA/2QA/2AA/10A/1kA/1UA/1IA/04A/0oA/0cA/0MA/z8A/zsA/zgA/zQA/zAA/y0A/ykA/yUA/yIA/x4A/xoA/xYA/xMA+g8A9gsA8QgA7QQA6AAA5AAA3wAA2gAA1gAA0QAAzQAAyAAAxAAAvwAAuwAAtgAAsgAArQAAqAAApAAAnwAAmwAAlgAAkgAAjQAAiQAAhAAAgAAA',
  coolwarm: 'O0zAPE7CPVDDPlHFP1PGQFXIQlfJQ1jLRFrMRVzORl7PSF/RSWHSSmPTS2TVTGbWTmjYT2nZUGvaUW3bU27dVHDeVXLfVnPgWHXhWXfjWnjkW3rlXXzmXn3nX3/oYYDpYoLqY4TrZIXsZoftZ4juaIrvaovva43wbI/xbpDyb5LzcJPzcpX0c5b1dZf2dpn2d5r3eZz4ep34e5/5faD5fqH6gKP6gaT7gqb7hKf8haj8hqn8iKv9iaz9i639jK/+jbD+j7H+kLL+krT+k7X+lLb/lrf/l7j/mLn/mrv/m7z/nb3/nr7/n7//ocD/osH/o8L+pcP+psT+p8X+qcb9qsf9q8j9rcn9rsn8r8r8scv8ssz7s837tc36ts76t8/5udD5utD4u9H4vNL3vtL2v9P2wNT1wdT0w9X0xNXzxdbyxtbxx9fwydfwytjvy9juzNntzdnsztrrz9rq0drp0tvo09vn1Nvm1dvl1tzk19zj2Nzi2dzh2tzg29ze3N3d3dzc3tzb39vZ4NvY4drW4trV49nT5NnS5djR5tfP59fO6NbM6dXL6tXJ6tTI69PG7NPF7dLD7dHC7tDA78+/78698M278c268cy48su38sq18sm088iy88ex9Mav9MWt9cSs9cKq9cGp9cCn9r+m9r6k9r2i97yh97qf97me97ic97eb97WZ97SX97OW97GU97CT96+R962Q96yO96qM96mL96iJ96aI9qWG9qOF9qKD9aCB9Z+A9Z1+9Zx99Jp79Jh685d485V385R18pJ08pBy8Y9x8Y1v8Itu8Ips74hr7oZp7oRo7YNm7IFl7H9j631i6ntg6Xpf6Xhd6HZc53Rb5nJZ5XBY5G5W42xV42tU4mlS4WdR4GVP32NO3mFN3V9L3F1K2lpJ2VhH2FZG11RF1lJE1VBC1E5B0ktA0Uk/0Ec9z0U8zUI7zEA6yz44yjs3yDg2xzY1xTM0xDAywy4xwSswwCgvviQuvR8tuxssuhYruBIqtw0otQkntAQm',
};

const CMAPS = [
  ['gray', 'Gray'], ['bone', 'Bone'], ['hot', 'Hot'], ['copper', 'Copper'], ['inferno', 'Inferno'], ['magma', 'Magma'],
  ['plasma', 'Plasma'], ['viridis', 'Viridis'], ['cividis', 'Cividis'], ['turbo', 'Turbo'], ['jet', 'Jet'], ['coolwarm', 'Cool–warm'],
];
const LUTS = {};
function lutOf(id, rev) {
  const key = id + (rev ? '_r' : '');
  if (LUTS[key]) return LUTS[key];
  const s = atob(CMAP_B64[id] || CMAP_B64.gray), u = new Uint8Array(768);
  for (let i = 0; i < 256; i++) { const j = rev ? 255 - i : i; for (let c = 0; c < 3; c++) u[3 * i + c] = s.charCodeAt(3 * j + c); }
  return (LUTS[key] = u);
}
const lutCss = (id, rev) => {
  const u = lutOf(id, rev), st = [];
  for (let i = 0; i <= 16; i++) { const k = Math.min(255, i * 16); st.push(`rgb(${u[3 * k]},${u[3 * k + 1]},${u[3 * k + 2]}) ${(i / 16 * 100).toFixed(1)}%`); }
  return `linear-gradient(90deg, ${st.join(', ')})`;
};
/* màu nhãn mặc định, theo số nhãn để cùng số luôn cùng màu */
const PAL = [
  [230, 25, 75], [60, 180, 75], [255, 225, 25], [0, 130, 200], [245, 130, 48], [145, 30, 180], [70, 240, 240], [240, 50, 230],
  [210, 245, 60], [250, 190, 212], [0, 128, 128], [220, 190, 255], [170, 110, 40], [255, 250, 200], [128, 0, 0], [170, 255, 195],
  [128, 128, 0], [255, 215, 180], [0, 0, 128], [128, 128, 128],
];
function idColor(id) {
  const n = Math.abs(Math.round(id));
  if (n >= 1 && n <= PAL.length) return PAL[n - 1].slice();
  const h = (n * 137.508) % 360, s = .72, l = .55;                    // góc vàng: màu cách xa nhau
  const f = k => { const a = s * Math.min(l, 1 - l), t = (k + h / 30) % 12; return Math.round(255 * (l - a * Math.max(-1, Math.min(t - 3, 9 - t, 1)))); };
  return [f(0), f(8), f(4)];
}
const hex = c => '#' + c.map(x => x.toString(16).padStart(2, '0')).join('');
const unhex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));

/* ---------------- 2. đọc file ---------------- */
async function gunzipIfNeeded(b) {
  if (b[0] !== 0x1f || b[1] !== 0x8b) return b;
  return gunzip(b);
}
async function gunzip(b) {
  if (!('DecompressionStream' in window)) throw new Error('Trình duyệt quá cũ: không giải nén được .gz. Hãy dùng Chrome, Edge, Firefox hoặc Safari bản mới.');
  const st = new Blob([b]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(st).arrayBuffer());
}
const DT = {        // mã kiểu NIfTI -> [tên, số byte, typed array đọc nhanh, hàm DataView]
  2: ['uint8', 1, Uint8Array, (v, o) => v.getUint8(o)],
  256: ['int8', 1, Int8Array, (v, o) => v.getInt8(o)],
  4: ['int16', 2, Int16Array, (v, o, le) => v.getInt16(o, le)],
  512: ['uint16', 2, Uint16Array, (v, o, le) => v.getUint16(o, le)],
  8: ['int32', 4, Int32Array, (v, o, le) => v.getInt32(o, le)],
  768: ['uint32', 4, Uint32Array, (v, o, le) => v.getUint32(o, le)],
  16: ['float32', 4, Float32Array, (v, o, le) => v.getFloat32(o, le)],
  64: ['float64', 8, Float64Array, (v, o, le) => v.getFloat64(o, le)],
  1024: ['int64', 8, null, (v, o, le) => Number(v.getBigInt64(o, le))],
  1280: ['uint64', 8, null, (v, o, le) => Number(v.getBigUint64(o, le))],
};
const HOST_LE = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;
/* đọc n giá trị kiểu dt từ byte off -> Float32Array (đã nhân slope + inter); stride/phase: lấy 1 trong mỗi stride giá trị */
function readValues(b, off, n, dt, le, slope = 1, inter = 0, stride = 1, phase = 0) {
  const [, sz, TA, get] = DT[dt], out = new Float32Array(n);
  if (off + (n * stride) * sz > b.length) throw new Error('File bị thiếu dữ liệu (ngắn hơn kích thước khai báo trong header).');
  if (TA && le === HOST_LE) {
    const src = new TA(b.buffer.slice(b.byteOffset + off, b.byteOffset + off + n * stride * sz));
    if (slope === 1 && inter === 0) for (let i = 0; i < n; i++) out[i] = src[i * stride + phase];
    else for (let i = 0; i < n; i++) out[i] = src[i * stride + phase] * slope + inter;
  } else {
    const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
    for (let i = 0; i < n; i++) out[i] = get(v, off + (i * stride + phase) * sz, le) * slope + inter;
  }
  return out;
}
const str = (b, off, n) => { let s = ''; for (let i = 0; i < n && b[off + i]; i++) s += String.fromCharCode(b[off + i]); return s.trim(); };

/* NIfTI-1 / NIfTI-2 -> vol (xem cuối hàm) */
function parseNifti(b, name) {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let le = true, n2 = false;
  const h1 = v.getInt32(0, true), h1b = v.getInt32(0, false);
  if (h1 === 348) le = true; else if (h1b === 348) le = false;
  else if (h1 === 540) { n2 = true; le = true; } else if (h1b === 540) { n2 = true; le = false; }
  else throw new Error(`${name} không phải file NIfTI (.nii / .nii.gz).`);
  const I16 = o => v.getInt16(o, le), I32 = o => v.getInt32(o, le), F32 = o => v.getFloat32(o, le), F64 = o => v.getFloat64(o, le),
        I64 = o => Number(v.getBigInt64(o, le));
  let dim, dt, pix, voxOff, slope, inter, descrip, qcode, scode, quat, qoff, srow, units, magic;
  if (!n2) {
    dim = [0, 1, 2, 3, 4, 5, 6, 7].map(i => I16(40 + 2 * i)); dt = I16(70);
    pix = [0, 1, 2, 3, 4, 5, 6, 7].map(i => F32(76 + 4 * i)); voxOff = Math.round(F32(108));
    slope = F32(112); inter = F32(116); units = v.getUint8(123); descrip = str(b, 148, 80);
    qcode = I16(252); scode = I16(254); quat = [F32(256), F32(260), F32(264)]; qoff = [F32(268), F32(272), F32(276)];
    srow = [0, 1, 2].map(r => [0, 1, 2, 3].map(c => F32(280 + 16 * r + 4 * c))); magic = str(b, 344, 4);
    if (magic === 'ni1') throw new Error(`${name} là cặp .hdr/.img. Hãy lưu lại thành một file .nii hoặc .nii.gz.`);
    if (!voxOff) voxOff = 352;
  } else {
    dim = [0, 1, 2, 3, 4, 5, 6, 7].map(i => I64(16 + 8 * i)); dt = I16(12);
    pix = [0, 1, 2, 3, 4, 5, 6, 7].map(i => F64(104 + 8 * i)); voxOff = I64(168);
    slope = F64(176); inter = F64(184); descrip = str(b, 240, 80);
    qcode = I32(344); scode = I32(348); quat = [F64(352), F64(360), F64(368)]; qoff = [F64(376), F64(384), F64(392)];
    srow = [0, 1, 2].map(r => [0, 1, 2, 3].map(c => F64(400 + 32 * r + 8 * c))); units = I32(500);
    if (!voxOff) voxOff = 544;
  }
  const nd = dim[0];
  if (nd < 2 || nd > 7) throw new Error(`${name}: header NIfTI hỏng (số chiều = ${nd}).`);
  const dims = [1, 2, 3].map(i => (i <= nd ? Math.max(1, dim[i]) : 1));
  let nt = 1; for (let i = 4; i <= nd; i++) nt *= Math.max(1, dim[i]);
  if (!DT[dt]) throw new Error(`${name}: kiểu dữ liệu NIfTI mã ${dt} chưa được hỗ trợ (chỉ đọc ảnh số nguyên / số thực một kênh).`);
  if (!slope || !Number.isFinite(slope)) { slope = 1; inter = 0; }
  if (!Number.isFinite(inter)) inter = 0;
  const sp = [1, 2, 3].map(i => Math.abs(pix[i]) || 1);
  let affine, src;
  if (scode > 0) { affine = [...srow[0], ...srow[1], ...srow[2], 0, 0, 0, 1]; src = 'sform'; }
  else if (qcode > 0) {
    const [bq, cq, dq] = quat, w2 = 1 - (bq * bq + cq * cq + dq * dq), a = w2 < 0 ? 0 : Math.sqrt(w2);
    const R = [
      [a * a + bq * bq - cq * cq - dq * dq, 2 * (bq * cq - a * dq), 2 * (bq * dq + a * cq)],
      [2 * (bq * cq + a * dq), a * a + cq * cq - bq * bq - dq * dq, 2 * (cq * dq - a * bq)],
      [2 * (bq * dq - a * cq), 2 * (cq * dq + a * bq), a * a + dq * dq - bq * bq - cq * cq]];
    const z = [sp[0], sp[1], sp[2] * (pix[0] < 0 ? -1 : 1)];
    affine = [0, 1, 2].flatMap(r => [R[r][0] * z[0], R[r][1] * z[1], R[r][2] * z[2], qoff[r]]).concat([0, 0, 0, 1]); src = 'qform';
  } else {
    affine = [-sp[0], 0, 0, (dims[0] - 1) / 2 * sp[0], 0, sp[1], 0, -(dims[1] - 1) / 2 * sp[1], 0, 0, sp[2], -(dims[2] - 1) / 2 * sp[2], 0, 0, 0, 1];
    src = 'pixdim';
  }
  const n = dims[0] * dims[1] * dims[2], bytes = DT[dt][1];
  if (voxOff + n * bytes > b.length) throw new Error(`${name}: file bị thiếu dữ liệu (ngắn hơn kích thước khai báo).`);
  const nAvail = Math.max(1, Math.min(nt, Math.floor((b.length - voxOff) / (n * bytes))));
  const U = ['', 'm', 'mm', 'µm'][units & 7] || '';
  return {
    name, format: n2 ? 'NIfTI-2' : 'NIfTI-1', dims, nt: nAvail, dtName: DT[dt][0], affine, affineSrc: src,
    qcode, scode, descrip, unit: U || 'mm', unitDeclared: !!U, slope, inter, noSpace: false, meta: null,
    read: t => readValues(b, voxOff + t * n * bytes, n, dt, le, slope, inter),
  };
}

/* NRRD gắn liền -> vol (cùng dạng parseNifti) */
const NRRD_T = {
  'signed char': 256, int8: 256, int8_t: 256, uchar: 2, 'unsigned char': 2, uint8: 2, uint8_t: 2,
  short: 4, 'short int': 4, 'signed short': 4, 'signed short int': 4, int16: 4, int16_t: 4,
  ushort: 512, 'unsigned short': 512, 'unsigned short int': 512, uint16: 512, uint16_t: 512,
  int: 8, 'signed int': 8, int32: 8, int32_t: 8, uint: 768, 'unsigned int': 768, uint32: 768, uint32_t: 768,
  longlong: 1024, 'long long': 1024, 'long long int': 1024, 'signed long long': 1024, 'signed long long int': 1024, int64: 1024, int64_t: 1024,
  ulonglong: 1280, 'unsigned long long': 1280, 'unsigned long long int': 1280, uint64: 1280, uint64_t: 1280,
  float: 16, double: 64,
};
async function parseNrrd(raw, name) {
  let end = -1, skip = 0;
  for (let i = 0; i < Math.min(raw.length - 1, 1 << 20); i++) {
    if (raw[i] === 10 && raw[i + 1] === 10) { end = i; skip = 2; break; }
    if (raw[i] === 10 && raw[i + 1] === 13 && raw[i + 2] === 10) { end = i; skip = 3; break; }
  }
  if (end < 0) throw new Error(`${name}: không tìm thấy cuối header NRRD.`);
  const lines = new TextDecoder('utf-8').decode(raw.subarray(0, end)).split(/\r?\n/);
  if (!/^NRRD000\d/.test(lines[0])) throw new Error(`${name} không phải file NRRD.`);
  const F = {}, KV = {};
  for (const ln of lines.slice(1)) {
    if (!ln || ln[0] === '#') continue;
    let i = ln.indexOf(':=');
    if (i > 0) { KV[ln.slice(0, i)] = ln.slice(i + 2); continue; }
    i = ln.indexOf(': ');
    if (i > 0) F[ln.slice(0, i).trim().toLowerCase()] = ln.slice(i + 2).trim();
  }
  if (F['data file'] || F.datafile) throw new Error(`${name}: NRRD tách rời (.nhdr + file dữ liệu) chưa hỗ trợ. Hãy lưu lại thành một file .nrrd.`);
  const dt = NRRD_T[(F.type || '').toLowerCase()];
  if (!dt) throw new Error(`${name}: kiểu NRRD "${F.type}" chưa hỗ trợ.`);
  const nd = +F.dimension, sizes = (F.sizes || '').split(/\s+/).map(Number);
  if (!nd || sizes.length !== nd) throw new Error(`${name}: header NRRD thiếu "dimension" hoặc "sizes".`);
  const kinds = (F.kinds || '').split(/\s+/).map(s => s.toLowerCase());
  const dirs = F['space directions'] ? (F['space directions'].match(/\([^)]*\)|none/g) || []).map(t => t === 'none' ? null : t.slice(1, -1).split(',').map(Number)) : null;
  const spat = [];
  for (let a = 0; a < nd; a++) {
    const nonSpatialKind = ['list', 'vector', 'covariant-vector', 'point', 'rgb-color', 'rgba-color', 'complex', 'time', '3-color', '4-color', 'scalar'].includes(kinds[a]);
    if (dirs ? dirs[a] : !nonSpatialKind) spat.push(a);
  }
  if (spat.length < 2 || spat.length > 3) throw new Error(`${name}: cần ảnh 2D hoặc 3D (có ${spat.length} trục không gian).`);
  const other = [...Array(nd).keys()].filter(a => !spat.includes(a));
  if (other.length > 1 || (other.length === 1 && other[0] !== 0 && other[0] !== nd - 1)) throw new Error(`${name}: bố cục trục NRRD này chưa hỗ trợ.`);
  const comp = other.length ? sizes[other[0]] : 1, compFirst = other.length ? other[0] === 0 : false;
  const dims = spat.map(a => sizes[a]); while (dims.length < 3) dims.push(1);
  const n = dims[0] * dims[1] * dims[2];
  // affine (RAS)
  const space = (F.space || '').toLowerCase();
  const lps = /left-posterior|^lps/.test(space), noSpace = !dirs && !F['space origin'];
  const org = F['space origin'] ? F['space origin'].replace(/[()]/g, '').split(',').map(Number) : [0, 0, 0];
  const A = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1];
  const spc = (F.spacings || '').split(/\s+/).map(Number);
  spat.forEach((a, c) => {
    const d = dirs ? dirs[a] : null;
    for (let r = 0; r < 3; r++) A[4 * r + c] = d ? (d[r] || 0) : (r === c ? (Number.isFinite(spc[a]) && spc[a] ? Math.abs(spc[a]) : 1) : 0);
  });
  if (spat.length === 2) A[10] = 1;
  for (let r = 0; r < 3; r++) A[4 * r + 3] = org[r] || 0;
  if (lps) for (let c = 0; c < 4; c++) { A[c] = -A[c]; A[4 + c] = -A[4 + c]; }
  // dữ liệu
  const enc = (F.encoding || 'raw').toLowerCase(), le = (F.endian || 'little').toLowerCase() !== 'big';
  let data = raw.subarray(end + skip), bskip = +(F['byte skip'] || F.byteskip || 0);
  const lskip = +(F['line skip'] || F.lineskip || 0);
  for (let k = 0; k < lskip; k++) { const j = data.indexOf(10); data = data.subarray(j + 1); }
  let vals = null, b = null;
  if (enc === 'gzip' || enc === 'gz') b = await gunzip(data);
  else if (enc === 'raw') b = data;
  else if (enc === 'ascii' || enc === 'text' || enc === 'txt') {
    const toks = new TextDecoder().decode(data).trim().split(/[\s,]+/);
    vals = new Float32Array(toks.length); for (let i = 0; i < toks.length; i++) vals[i] = +toks[i];
  } else throw new Error(`${name}: mã hóa NRRD "${enc}" chưa hỗ trợ (dùng raw, gzip hoặc ascii).`);
  const sz = DT[dt][1];
  if (b) { if (bskip === -1) bskip = b.length - n * comp * sz; b = b.subarray(Math.max(0, bskip)); }
  const read = t => {
    if (vals) { const out = new Float32Array(n); for (let i = 0; i < n; i++) out[i] = vals[compFirst ? i * comp + t : t * n + i] || 0; return out; }
    return compFirst ? readValues(b, 0, n, dt, le, 1, 0, comp, t) : readValues(b, t * n * sz, n, dt, le);
  };
  // segment của 3D Slicer (.seg.nrrd)
  const segs = [];
  for (let i = 0; KV[`Segment${i}_ID`] != null || KV[`Segment${i}_Name`] != null; i++) {
    const col = (KV[`Segment${i}_Color`] || '').split(/\s+/).map(Number);
    segs.push({ name: KV[`Segment${i}_Name`] || `Segment ${i + 1}`, value: +(KV[`Segment${i}_LabelValue`] || i + 1), layer: +(KV[`Segment${i}_Layer`] || 0),
      color: col.length >= 3 && col.every(Number.isFinite) ? col.slice(0, 3).map(x => Math.round(clamp(x, 0, 1) * 255)) : null });
  }
  return {
    name, format: 'NRRD', dims, nt: comp, dtName: DT[dt][0], affine: A, affineSrc: noSpace ? 'spacings' : (lps ? 'LPS → RAS' : 'space directions'),
    qcode: null, scode: null, descrip: F.content || '', unit: 'mm', unitDeclared: false, slope: 1, inter: 0, noSpace, read,
    meta: segs.length ? { segs } : null,
  };
}

async function readVolumeFile(file) {
  const b = await gunzipIfNeeded(new Uint8Array(await file.arrayBuffer()));
  if (b.length > 8 && String.fromCharCode(...b.subarray(0, 4)) === 'NRRD') return parseNrrd(b, file.name);
  if (/\.(nrrd|nhdr)$/i.test(file.name)) throw new Error(`${file.name}: không đọc được header NRRD.`);
  return parseNifti(b, file.name);
}

/* bảng tên nhãn -> Map(id -> { name, color }) */
function parseLabelTable(text) {
  const M = new Map();
  for (let ln of text.split(/\r?\n/)) {
    ln = ln.replace(/^\ufeff/, '').trim(); if (!ln || ln[0] === '#') continue;
    if (/^-?\d+\s*,/.test(ln)) {                                 // CSV: id,tên,r,g,b (tên có thể trong ngoặc kép)
      const f = []; let cur = '', inq = false;
      for (let i = 0; i < ln.length; i++) {
        const ch = ln[i];
        if (inq) { if (ch === '"' && ln[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') inq = false; else cur += ch; }
        else if (ch === '"') inq = true; else if (ch === ',') { f.push(cur.trim()); cur = ''; } else cur += ch;
      }
      f.push(cur.trim());
      const rgb = f.slice(2, 5).map(x => (x === '' ? NaN : Number(x)));
      M.set(Number(f[0]), { name: f[1] || '', color: rgb.length === 3 && rgb.every(Number.isFinite) ? rgb : null });
      continue;
    }
    const q = ln.match(/"([^"]*)"/);
    if (q) {                                                     // ITK-SNAP: IDX R G B A VIS MSH "TÊN"
      const nums = ln.slice(0, q.index).trim().split(/\s+/).map(Number);
      if (!Number.isFinite(nums[0])) continue;
      M.set(nums[0], { name: q[1], color: nums.length >= 4 && nums.slice(1, 4).every(Number.isFinite) ? nums.slice(1, 4) : null });
      continue;
    }
    const t = ln.split(/\s*[,;\t]\s*|\s+/).filter(Boolean), id = Number(t[0]);
    if (!Number.isFinite(id) || t.length < 2) continue;
    if (!Number.isFinite(Number(t[1]))) {                        // FreeSurfer / Slicer / CSV: id tên r g b [a]
      const rgb = t.slice(2, 5).map(Number);
      M.set(id, { name: t[1], color: rgb.length === 3 && rgb.every(Number.isFinite) ? rgb : null });
    } else if (t.length >= 5) {                                  // id r g b tên
      M.set(id, { name: t.slice(4).join(' ').replace(/^[\d.\s]+/, '') || String(id), color: t.slice(1, 4).map(Number) });
    }
  }
  return M;
}

/* ---------------- 3. hình học ---------------- */
const mat3inv = m => {   // m: 3x3 theo hàng (mảng 9)
  const [a, b, c, d, e, f, g, h, i] = m, A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g, det = a * A + b * B + c * C;
  if (!det) return null;
  return [A / det, -(b * i - c * h) / det, (b * f - c * e) / det, B / det, (a * i - c * g) / det, -(a * f - c * d) / det, C / det, -(a * h - b * g) / det, (a * e - b * d) / det];
};
function affInv(A) {
  const R = mat3inv([A[0], A[1], A[2], A[4], A[5], A[6], A[8], A[9], A[10]]);
  if (!R) return null;
  const t = [A[3], A[7], A[11]], o = [];
  for (let r = 0; r < 3; r++) o.push(R[3 * r], R[3 * r + 1], R[3 * r + 2], -(R[3 * r] * t[0] + R[3 * r + 1] * t[1] + R[3 * r + 2] * t[2]));
  return o.concat([0, 0, 0, 1]);
}
const affMul = (A, B) => { const o = []; for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) { let s = 0; for (let k = 0; k < 4; k++) s += A[4 * r + k] * B[4 * k + c]; o.push(s); } return o; };
const colNorm = (A, c) => Math.hypot(A[c], A[4 + c], A[8 + c]);
/* trục voxel a -> { w: trục thế giới (0 x/R, 1 y/A, 2 z/S), flip } (giống nibabel io_orientation, chọn tham lam) */
function orientation(A) {
  const M = [0, 1, 2].map(c => { const n = colNorm(A, c) || 1; return [0, 1, 2].map(r => A[4 * r + c] / n); });
  const out = [null, null, null], usedW = new Set();
  for (let it = 0; it < 3; it++) {
    let best = -1, ba = 0, bw = 0;
    for (let a = 0; a < 3; a++) if (!out[a]) for (let w = 0; w < 3; w++) if (!usedW.has(w) && Math.abs(M[a][w]) > best) { best = Math.abs(M[a][w]); ba = a; bw = w; }
    out[ba] = { w: bw, flip: M[ba][bw] < 0 }; usedW.add(bw);
  }
  return out;
}
const orientCode = o => o.map(x => (x.flip ? 'LPI' : 'RAS')[x.w]).join('');
const isOblique = A => [0, 1, 2].some(c => { const n = colNorm(A, c) || 1; return Math.max(...[0, 1, 2].map(r => Math.abs(A[4 * r + c]))) / n < 0.999; });

/* nhãn -> Uint16Array (chỉ số gọn k, 0 = nền) trên lưới voxel của ảnh + bảng nhãn */
async function buildLabels(L, img, onProg) {
  const [nx, ny, nz] = img.dims, n = nx * ny * nz;
  const sameDims = L.dims.every((d, i) => d === img.dims[i]);
  const sameAff = L.affine.every((x, i) => Math.abs(x - img.affine[i]) <= 1e-3 * Math.max(1, Math.abs(x)));
  let map = null, resampled = false;                                   // map[i] = chỉ số voxel trong file nhãn, -1 = ngoài
  if (!(sameDims && (sameAff || L.noSpace || img.noSpace))) {
    const Li = affInv(L.affine); if (!Li) throw new Error('Ma trận affine của file nhãn không khả nghịch.');
    const M = affMul(Li, img.affine), [lx, ly, lz] = L.dims;
    map = new Int32Array(n); resampled = true;
    let i = 0;
    for (let k = 0; k < nz; k++) {
      for (let j = 0; j < ny; j++) {
        let fx = M[1] * j + M[2] * k + M[3], fy = M[5] * j + M[6] * k + M[7], fz = M[9] * j + M[10] * k + M[11];
        for (let x = 0; x < nx; x++, i++) {
          const a = Math.round(fx), b = Math.round(fy), c = Math.round(fz);
          map[i] = a < 0 || b < 0 || c < 0 || a >= lx || b >= ly || c >= lz ? -1 : a + lx * (b + ly * c);
          fx += M[0]; fy += M[4]; fz += M[8];
        }
      }
      if (onProg && (k & 15) === 0) { onProg(k / nz); await tick(); }
    }
  }
  const layers = []; for (let t = 0; t < L.nt; t++) layers.push(L.read(t));
  const multi = layers.length > 1;
  const segBy = new Map(); if (L.meta && L.meta.segs) L.meta.segs.forEach((s, i) => segBy.set((multi ? s.layer * 65536 : 0) + s.value, i));
  const out = new Uint16Array(n), keyK = new Map(), info = [null];
  let nonInt = 0, nz0 = 0, lastKey = NaN, lastK = 0;
  for (let i = 0; i < n; i++) {
    const li = map ? map[i] : i; if (li < 0) continue;
    let key = 0;
    for (let t = 0; t < layers.length; t++) {
      const v = layers[t][li];
      if (v !== 0 && v === v) { const r = Math.round(v); if (r !== v) nonInt++; if (r !== 0) key = (multi ? t * 65536 : 0) + r; }
    }
    if (!key) continue;
    nz0++;
    let k;
    if (key === lastKey) k = lastK;
    else {
      k = keyK.get(key);
      if (k === undefined) {
        k = info.length;
        if (k > 65535) throw new Error('File nhãn có hơn 65 535 giá trị khác nhau; có thể đây là ảnh thường, không phải ảnh nhãn.');
        keyK.set(key, k);
        const si = segBy.get(key), sg = si != null ? L.meta.segs[si] : null;
        const id = multi ? (sg ? sg.value : key % 65536) : key;
        info.push({ k, key, id, layer: multi ? Math.floor(key / 65536) : 0, name: sg ? sg.name : '', color: sg && sg.color ? sg.color : idColor(multi ? k : id), count: 0, sum: [0, 0, 0] });
      }
      lastKey = key; lastK = k;
    }
    out[i] = k;
    const e = info[k]; e.count++;
    const x = i % nx, yz = (i - x) / nx, y = yz % ny, z = (yz - y) / ny;
    e.sum[0] += x; e.sum[1] += y; e.sum[2] += z;
  }
  // sắp theo số nhãn, đổi lại chỉ số k cho gọn
  const sorted = info.slice(1).sort((a, b) => a.layer - b.layer || a.id - b.id);
  const remap = new Uint16Array(info.length);
  sorted.forEach((e, i) => { remap[e.k] = i + 1; e.k = i + 1; });
  for (let i = 0; i < n; i++) if (out[i]) out[i] = remap[out[i]];
  return { vol: out, table: [null, ...sorted], resampled, suspicious: nz0 > 0 && nonInt / nz0 > 0.01, multi };
}

/* ---------------- trạng thái ---------------- */
const OV_MAX = 9;                  // thanh Nhãn: 0 tắt, 1..8 độ dày viền (px), 9 tô đầy
const OV_FILL_ALPHA = 0.45, OV_LINE_ALPHA = 0.9;
const S = {
  cfg: {}, img: null, data: null, t: 0, lab: null, labFile: null, table: [null], names: null,
  ornt: null, R: [1, 1, 1], step: [0, 0, 0], base: 0, sp: [1, 1, 1],
  dataMin: 0, dataMax: 1, lo: 0, hi: 1, bbox: null,
  orient: 'ax', slice: { ax: 0, cor: 0, sag: 0 }, radio: false, smooth: true,
  cmap: 'gray', rev: false,
  ov: { on: true, mode: 'fill', thick: 2, alpha: 0.45 }, ovLevel: OV_MAX,   // ovLevel: 0 tắt, 1..OV_MAX-1 viền (px), OV_MAX tô đầy
  bri: 0, con: 0, lo0: 0, hi0: 1,   // sáng tối, tương phản (−100..100) quanh cửa sổ tự động lo0..hi0
  vis: null, cols: null,        // Uint8Array(K+1) bật/tắt, Uint8Array(3*(K+1)) màu
  hover: null, sl: null,
};
/* lưới RAS: chỉ số r (theo R, A, S) -> chỉ số mảng dữ liệu */
function setupGrid() {
  const img = S.img, o = orientation(img.affine), d = img.dims, stride = [1, d[0], d[0] * d[1]];
  S.ornt = o; S.base = 0;
  for (let a = 0; a < 3; a++) {
    const w = o[a].w; S.R[w] = d[a]; S.sp[w] = colNorm(img.affine, a) || 1;
    S.step[w] = o[a].flip ? -stride[a] : stride[a];
    if (o[a].flip) S.base += (d[a] - 1) * stride[a];
  }
}
const ijkOfR = r => S.ornt.map((o, a) => (o.flip ? S.img.dims[a] - 1 - r[o.w] : r[o.w]));
const rOfIjk = p => { const r = [0, 0, 0]; S.ornt.forEach((o, a) => { r[o.w] = o.flip ? S.img.dims[a] - 1 - p[a] : p[a]; }); return r; };
const mmOf = p => [0, 1, 2].map(r => S.img.affine[4 * r] * p[0] + S.img.affine[4 * r + 1] * p[1] + S.img.affine[4 * r + 2] * p[2] + S.img.affine[4 * r + 3]);

/* hướng xem: trục cắt (RAS), trục u (ngang) và v (dọc), có lật hay không, chữ ở mép [trái, phải, trên, dưới] */
function view(o) {
  const rad = S.radio;
  if (o === 'ax') return { axis: 2, ua: 0, uf: rad, va: 1, vf: true, edge: rad ? ['R', 'L', 'A', 'P'] : ['L', 'R', 'A', 'P'], name: 'Axial', ax: 'z' };
  if (o === 'cor') return { axis: 1, ua: 0, uf: rad, va: 2, vf: true, edge: rad ? ['R', 'L', 'S', 'I'] : ['L', 'R', 'S', 'I'], name: 'Coronal', ax: 'y' };
  return { axis: 0, ua: 1, uf: true, va: 2, vf: true, edge: ['A', 'P', 'S', 'I'], name: 'Sagittal', ax: 'x' };
}
const nSlices = o => S.R[view(o).axis];
/* lát s theo hướng o -> { a: chữ trục voxel gốc (i/j/k), idx: chỉ số voxel gốc, mm: tọa độ thế giới dọc trục cắt } */
function sliceCoord(o, s) {
  const D = view(o), r = [0, 1, 2].map(w => Math.floor(S.R[w] / 2)); r[D.axis] = s;
  const p = ijkOfR(r), a = S.ornt.findIndex(x => x.w === D.axis);
  return { a: 'ijk'[a], idx: p[a], mm: mmOf(p)[D.axis] };
}
const rOfUV = (D, u, v, s) => { const r = [0, 0, 0]; r[D.axis] = s; r[D.ua] = D.uf ? S.R[D.ua] - 1 - u : u; r[D.va] = D.vf ? S.R[D.va] - 1 - v : v; return r; };

/* ---------------- 4. dựng lát cắt ---------------- */
function sliceOf(o, s) {
  const D = view(o), W = S.R[D.ua], H = S.R[D.va];
  const r0 = rOfUV(D, 0, 0, s);
  let i0 = S.base + r0[0] * S.step[0] + r0[1] * S.step[1] + r0[2] * S.step[2];
  const du = (D.uf ? -1 : 1) * S.step[D.ua], dv = (D.vf ? -1 : 1) * S.step[D.va];
  const val = new Float32Array(W * H), lab = S.lab ? new Uint16Array(W * H) : null;
  for (let v = 0, p = 0; v < H; v++) {
    let i = i0 + v * dv;
    for (let u = 0; u < W; u++, p++, i += du) { val[p] = S.data[i]; if (lab) lab[p] = S.lab[i]; }
  }
  return { o, s, W, H, val, lab, pw: S.sp[D.ua], ph: S.sp[D.va] };
}
const cvOf = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
/* vẽ lát sl vào khung rect (pixel nguyên) trên ctx, theo cài đặt hiện tại (opt có thể ghi đè) */
function drawSlice(ctx, sl, rect, opt = {}) {
  const lo = opt.lo ?? S.lo, hi = opt.hi ?? S.hi, lut = lutOf(opt.cmap ?? S.cmap, opt.rev ?? S.rev);
  const { W, H, val } = sl, a = cvOf(W, H), ac = a.getContext('2d'), id = ac.createImageData(W, H), px = id.data;
  const inv = hi > lo ? 255 / (hi - lo) : 0;
  for (let p = 0, q = 0; p < W * H; p++, q += 4) {
    const x = val[p]; let k = (x - lo) * inv; k = k > 0 ? (k < 255 ? (k + 0.5) | 0 : 255) : 0;
    if (x !== x) k = 0;
    px[q] = lut[3 * k]; px[q + 1] = lut[3 * k + 1]; px[q + 2] = lut[3 * k + 2]; px[q + 3] = 255;
  }
  ac.putImageData(id, 0, 0);
  ctx.imageSmoothingEnabled = opt.smooth ?? S.smooth; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(a, rect.x, rect.y, rect.w, rect.h);
  const ov = opt.ov ?? S.ov;
  if (!sl.lab || !ov.on || ov.alpha <= 0) return;
  const TW = Math.max(1, Math.round(rect.w)), TH = Math.max(1, Math.round(rect.h)), N = TW * TH;
  const kd = new Uint16Array(N), vis = S.vis, any = { v: false };
  const ux = new Int32Array(TW); for (let x = 0; x < TW; x++) ux[x] = Math.min(W - 1, Math.floor((x + 0.5) * W / TW));
  for (let y = 0, p = 0; y < TH; y++) {
    const row = Math.min(H - 1, Math.floor((y + 0.5) * H / TH)) * W;
    for (let x = 0; x < TW; x++, p++) { const k = sl.lab[row + ux[x]]; if (k && vis[k]) { kd[p] = k; any.v = true; } }
  }
  if (!any.v) return;
  let draw = kd;
  if (ov.mode === 'line') {
    // khoảng cách (chamfer 3-4) tới điểm khác nhãn, chỉ lan trong cùng nhãn
    const INF = 65000, d = new Uint16Array(N), lim = 3 * ov.thick;
    for (let y = 0, p = 0; y < TH; y++) for (let x = 0; x < TW; x++, p++) {
      const k = kd[p]; if (!k) continue;
      const edge = x === 0 || y === 0 || x === TW - 1 || y === TH - 1 || kd[p - 1] !== k || kd[p + 1] !== k || kd[p - TW] !== k || kd[p + TW] !== k;
      d[p] = edge ? 3 : INF;
    }
    if (ov.thick > 1) {
      for (let y = 1; y < TH - 1; y++) for (let x = 1, p = y * TW + 1; x < TW - 1; x++, p++) {
        const k = kd[p]; if (!k || d[p] === 3) continue; let m = d[p];
        if (kd[p - 1] === k && d[p - 1] + 3 < m) m = d[p - 1] + 3;
        if (kd[p - TW] === k && d[p - TW] + 3 < m) m = d[p - TW] + 3;
        if (kd[p - TW - 1] === k && d[p - TW - 1] + 4 < m) m = d[p - TW - 1] + 4;
        if (kd[p - TW + 1] === k && d[p - TW + 1] + 4 < m) m = d[p - TW + 1] + 4;
        d[p] = m;
      }
      for (let y = TH - 2; y > 0; y--) for (let x = TW - 2, p = y * TW + x; x > 0; x--, p--) {
        const k = kd[p]; if (!k || d[p] === 3) continue; let m = d[p];
        if (kd[p + 1] === k && d[p + 1] + 3 < m) m = d[p + 1] + 3;
        if (kd[p + TW] === k && d[p + TW] + 3 < m) m = d[p + TW] + 3;
        if (kd[p + TW + 1] === k && d[p + TW + 1] + 4 < m) m = d[p + TW + 1] + 4;
        if (kd[p + TW - 1] === k && d[p + TW - 1] + 4 < m) m = d[p + TW - 1] + 4;
        d[p] = m;
      }
    }
    draw = new Uint16Array(N);
    for (let p = 0; p < N; p++) if (kd[p] && d[p] <= lim) draw[p] = kd[p];
  }
  const b = cvOf(TW, TH), bc = b.getContext('2d'), bd = bc.createImageData(TW, TH), bp = bd.data, A = Math.round(255 * ov.alpha), C = S.cols;
  for (let p = 0, q = 0; p < N; p++, q += 4) { const k = draw[p]; if (k) { bp[q] = C[3 * k]; bp[q + 1] = C[3 * k + 1]; bp[q + 2] = C[3 * k + 2]; bp[q + 3] = A; } }
  bc.putImageData(bd, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(b, Math.round(rect.x), Math.round(rect.y));
}
/* khung vừa khít lát (theo kích thước thật mm) trong vùng cw × ch, chừa lề pad */
function fitRect(sl, cw, ch, pad = 0) {
  const pw = sl.W * sl.pw, ph = sl.H * sl.ph, sc = Math.min((cw - 2 * pad) / pw, (ch - 2 * pad) / ph);
  const w = Math.max(1, Math.round(pw * sc)), h = Math.max(1, Math.round(ph * sc));
  return { x: Math.round((cw - w) / 2), y: Math.round((ch - h) / 2), w, h };
}

/* ---------------- 5. trình xem ---------------- */
let cv, ctx, rafId = 0;
const req = () => { if (!rafId) rafId = requestAnimationFrame(() => { rafId = 0; draw(); }); };
function draw() {
  if (!S.data) return;
  const dpr = window.devicePixelRatio || 1, r = cv.getBoundingClientRect();
  const cw = Math.max(1, Math.round(r.width * dpr)), ch = Math.max(1, Math.round(r.height * dpr));
  if (cv.width !== cw || cv.height !== ch) { cv.width = cw; cv.height = ch; }
  const s = S.slice[S.orient];
  if (!S.sl || S.sl.o !== S.orient || S.sl.s !== s || S.sl.stale) S.sl = sliceOf(S.orient, s);
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, cw, ch);
  const rect = fitRect(S.sl, cw, ch, Math.round(22 * dpr)); S.rect = rect;
  drawSlice(ctx, S.sl, rect);
  // chữ hướng ở mép, số lát
  const D = view(S.orient), fs = Math.round(13 * dpr);
  ctx.font = `600 ${fs}px ${getComputedStyle(document.body).fontFamily}`; ctx.fillStyle = '#f2c230';
  ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.fillText(D.edge[0], 6 * dpr, ch / 2);
  ctx.textAlign = 'right'; ctx.fillText(D.edge[1], cw - 6 * dpr, ch / 2);
  ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(D.edge[2], cw / 2, 4 * dpr);
  ctx.textBaseline = 'bottom'; ctx.fillText(D.edge[3], cw / 2, ch - 4 * dpr);
  // chữ thập nhỏ tại điểm trỏ
  if (S.hover) {
    const { u, v } = S.hover, X = rect.x + (u + 0.5) * rect.w / S.sl.W, Y = rect.y + (v + 0.5) * rect.h / S.sl.H, g = 5 * dpr, L = 14 * dpr;
    ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = Math.max(1, dpr);
    ctx.beginPath(); ctx.moveTo(X - g - L, Y); ctx.lineTo(X - g, Y); ctx.moveTo(X + g, Y); ctx.lineTo(X + g + L, Y);
    ctx.moveTo(X, Y - g - L); ctx.lineTo(X, Y - g); ctx.moveTo(X, Y + g); ctx.lineTo(X, Y + g + L); ctx.stroke();
  }
}
function readout() {
  const el = $('nvReadout');
  if (!S.data) { el.innerHTML = ''; return; }
  const D = view(S.orient), s = S.slice[S.orient];
  const sc = sliceCoord(S.orient, s);
  let h = `<span><span class="q">${D.name}</span> <b>${s + 1}</b><span class="q"> / ${nSlices(S.orient)}</span> <span class="q">(${sc.a} = ${sc.idx}, ${D.ax} = ${fmtN(sc.mm, 1)} ${esc(S.img.unit)})</span></span>`;
  if (S.hover) {
    const r = rOfUV(D, S.hover.u, S.hover.v, s), p = ijkOfR(r), mm = mmOf(p), i = S.base + r[0] * S.step[0] + r[1] * S.step[1] + r[2] * S.step[2];
    h += `<span><span class="q">voxel</span> <b>${p.join(', ')}</b></span>`;
    h += `<span><span class="q">${esc(S.img.unit)}</span> <b>${mm.map(x => fmtN(x, 1)).join('; ')}</b></span>`;
    h += `<span><span class="q">giá trị</span> <b>${fmtV(S.data[i])}</b></span>`;
    if (S.lab) {
      const k = S.lab[i], e = S.table[k];
      h += k ? `<span><span class="nv-sw" style="background:${hex(Array.from(S.cols.subarray(3 * k, 3 * k + 3)))}"></span><b>${e.id}</b> ${esc(labelName(e))}${S.vis[k] ? '' : ' <span class="q">(đang ẩn)</span>'}</span>`
             : '<span class="q">nền (0)</span>';
    }
  } else h += '<span class="q">Rê chuột trên ảnh để đọc giá trị. Lăn chuột hoặc phím ↑ ↓ để đổi lát.</span>';
  el.innerHTML = h;
}
function hoverAt(e) {
  if (!S.rect || !S.sl) return;
  const r = cv.getBoundingClientRect(), dpr = cv.width / r.width, x = (e.clientX - r.left) * dpr, y = (e.clientY - r.top) * dpr;
  const u = Math.floor((x - S.rect.x) / S.rect.w * S.sl.W), v = Math.floor((y - S.rect.y) / S.rect.h * S.sl.H);
  S.hover = u >= 0 && v >= 0 && u < S.sl.W && v < S.sl.H ? { u, v } : null;
  req(); readout();
}
function setSlice(v) {
  const max = nSlices(S.orient) - 1;
  S.slice[S.orient] = clamp(Math.round(v), 0, max);
  $('nvSlice').value = S.slice[S.orient]; $('nvSliceOut').textContent = `${S.slice[S.orient] + 1} / ${max + 1}`;
  const sc = sliceCoord(S.orient, S.slice[S.orient]); $('nvSlice').setAttribute('aria-valuetext', `lát ${S.slice[S.orient] + 1}, ${view(S.orient).ax} = ${fmtN(sc.mm, 1)} mm`);
  req(); readout();
}
function setOrient(o) {
  S.orient = o; S.hover = null;
  document.querySelectorAll('[data-orient]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.orient === o)));
  $('nvSlice').max = nSlices(o) - 1; setSlice(S.slice[o]);
  mosaicSoon();
}
function bindViewer() {
  cv = $('nvCanvas'); ctx = cv.getContext('2d');
  new ResizeObserver(req).observe(cv);
  cv.addEventListener('pointermove', hoverAt);
  cv.addEventListener('pointerdown', e => { hoverAt(e); cv.focus({ preventScroll: true }); });
  cv.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') { S.hover = null; req(); readout(); } });
  let acc = 0;
  cv.addEventListener('wheel', e => {
    if (!S.data) return; e.preventDefault();
    acc += e.deltaMode === 1 ? e.deltaY * 40 : e.deltaY;
    const step = Math.trunc(acc / 40); if (step) { acc -= step * 40; setSlice(S.slice[S.orient] - step); }
  }, { passive: false });
  cv.addEventListener('keydown', e => {
    if (!S.data) return; const n = e.shiftKey ? 5 : 1, k = e.key;
    if (k === 'ArrowUp' || k === 'PageUp' || k === 'ArrowRight') { setSlice(S.slice[S.orient] + n); e.preventDefault(); }
    else if (k === 'ArrowDown' || k === 'PageDown' || k === 'ArrowLeft') { setSlice(S.slice[S.orient] - n); e.preventDefault(); }
    else if (k === 'Home') { setSlice(0); e.preventDefault(); } else if (k === 'End') { setSlice(1e9); e.preventDefault(); }
  });
  document.querySelectorAll('[data-orient]').forEach(b => b.addEventListener('click', () => setOrient(b.dataset.orient)));
  $('nvSlice').addEventListener('input', e => setSlice(+e.target.value));
  // sáng tối / tương phản: dời và co giãn cửa sổ tự động
  const win = () => {
    const w0 = (S.hi0 - S.lo0) || 1, c = (S.lo0 + S.hi0) / 2 - S.bri / 200 * w0, w = w0 * Math.pow(2, -S.con / 50);
    S.lo = c - w / 2; S.hi = c + w / 2;
    $('nvBri').value = S.bri; $('nvCon').value = S.con;
    $('nvBriOut').textContent = (S.bri > 0 ? '+' : S.bri < 0 ? '−' : '') + Math.abs(S.bri);
    $('nvConOut').textContent = (S.con > 0 ? '+' : S.con < 0 ? '−' : '') + Math.abs(S.con);
    req(); mosaicSoon();
  };
  $('nvBri').addEventListener('input', e => { S.bri = +e.target.value; win(); });
  $('nvCon').addEventListener('input', e => { S.con = +e.target.value; win(); });
  $('nvBri').addEventListener('dblclick', () => { S.bri = 0; win(); });
  $('nvCon').addEventListener('dblclick', () => { S.con = 0; win(); });
  $('nvWinReset').addEventListener('click', () => { S.bri = 0; S.con = 0; win(); });
  S.win = win;
  $('nvVol').addEventListener('input', e => { $('nvVolOut').textContent = `${+e.target.value + 1} / ${S.img.nt}`; });
  $('nvVol').addEventListener('change', e => { S.t = +e.target.value; S.data = S.img.read(S.t); stats(); autoWindow(); win(); S.sl = null; req(); readout(); });
  // nhãn: một thanh trượt
  $('nvOv').addEventListener('input', e => { setOvLevel(+e.target.value); req(); readout(); mosaicSoon(); });
}
function setOvLevel(L) {
  S.ovLevel = clamp(L, 0, OV_MAX);
  S.ov.on = S.ovLevel > 0;
  S.ov.mode = S.ovLevel >= OV_MAX ? 'fill' : 'line';
  S.ov.thick = clamp(S.ovLevel, 1, OV_MAX - 1);
  S.ov.alpha = S.ov.mode === 'fill' ? OV_FILL_ALPHA : OV_LINE_ALPHA;
  ovUi();
}
function ovUi() {
  const L = S.ovLevel;
  $('nvOv').value = L;
  $('nvOvOut').textContent = L === 0 ? 'Tắt' : L >= OV_MAX ? 'Tô đầy' : `Viền ${L} px`;
  $('nvOv').setAttribute('aria-valuetext', $('nvOvOut').textContent);
}

/* thống kê cường độ: min, max, cửa sổ mặc định (bách phân vị 0,5–99,5 trên mẫu; bỏ số 0 nếu nền 0 chiếm nhiều) */
function stats() {
  const d = S.data, n = d.length; let mn = Infinity, mx = -Infinity, zeros = 0;
  for (let i = 0; i < n; i++) { const v = d[i]; if (v < mn) mn = v; if (v > mx) mx = v; if (v === 0) zeros++; }
  if (!Number.isFinite(mn)) { mn = 0; mx = 1; }
  if (mx === mn) mx = mn + 1;
  S.dataMin = mn; S.dataMax = mx; S.zeroBg = zeros / n > 0.3;
}
function autoWindow() {
  const d = S.data, n = d.length, st = Math.max(1, Math.floor(n / 400000)), smp = [];
  for (let i = 0; i < n; i += st) { const v = d[i]; if (v === v && (!S.zeroBg || v !== 0)) smp.push(v); }
  if (smp.length < 10) { S.lo0 = S.lo = S.dataMin; S.hi0 = S.hi = S.dataMax; return; }
  smp.sort((a, b) => a - b);
  S.lo = smp[Math.floor(smp.length * 0.005)]; S.hi = smp[Math.min(smp.length - 1, Math.floor(smp.length * 0.995))];
  if (S.zeroBg && S.dataMin >= 0) S.lo = Math.min(S.lo, 0);
  if (S.hi <= S.lo) { S.lo = S.dataMin; S.hi = S.dataMax; }
  S.lo0 = S.lo; S.hi0 = S.hi;
}
/* khung bao vùng có tín hiệu (trên lưới RAS), cho khoảng lát mặc định của mosaic */
function computeBBox() {
  const d = S.data, [nx, ny, nz] = S.img.dims, th = S.lo + (S.hi - S.lo) * 0.05;
  const mn = [Infinity, Infinity, Infinity], mx = [-1, -1, -1];
  for (let k = 0, i = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let x = 0; x < nx; x++, i++) {
    if (!(d[i] > th) && !(S.lab && S.lab[i])) continue;
    if (x < mn[0]) mn[0] = x; if (x > mx[0]) mx[0] = x; if (j < mn[1]) mn[1] = j; if (j > mx[1]) mx[1] = j; if (k < mn[2]) mn[2] = k; if (k > mx[2]) mx[2] = k;
  }
  if (mx[0] < 0) { S.bbox = null; return; }
  const a = rOfIjk(mn), b = rOfIjk(mx);
  S.bbox = [0, 1, 2].map(w => [Math.min(a[w], b[w]), Math.max(a[w], b[w])]);
}

/* ---------------- 6. bảng thông tin + danh sách nhãn ---------------- */
const labelName = e => (e.user != null ? e.user : e.name) || (S.names && S.names.get(e.id) && S.names.get(e.id).name) || '';
function affineRows(A, lang) {
  const rows = [0, 1, 2, 3].map(r => [0, 1, 2, 3].map(c => fmtN(A[4 * r + c], 2, lang, false)));
  const w = Math.max(...rows.flat().map(s => s.length));
  return rows.map(r => r.map(s => s.padStart(w)).join('  '));
}
function infoFacts(lang = 'en') {
  const I = S.img, T = TXT[lang], d = I.dims, sp = [0, 1, 2].map(c => colNorm(I.affine, c));
  const f = [
    [T.dim, d.join(' × ') + (I.nt > 1 ? ` × ${I.nt}` : '')],
    [T.vox, sp.map(x => fmtN(x, 3, lang, true)).join(' × ') + ' ' + I.unit],
    [T.fov, d.map((x, i) => fmtN(x * sp[i], 1, lang, true)).join(' × ') + ' ' + I.unit],
    [T.dtype, `${I.dtName} (${I.format})`],
    [T.orient, orientCode(S.ornt) + (isOblique(I.affine) ? T.oblique : '')],
    [T.affsrc, I.affineSrc + (I.qcode != null ? ` (qform ${I.qcode}, sform ${I.scode})` : '')],
    [T.range, `${fmtV(S.dataMin, lang)} … ${fmtV(S.dataMax, lang)}`],
  ];
  if (I.slope !== 1 || I.inter !== 0) f.push([T.scale, `× ${fmtN(I.slope, 4, lang, true)} + ${fmtN(I.inter, 4, lang, true)}`]);
  if (I.nt > 1) f.push([T.vol, `${S.t + 1} / ${I.nt}`]);
  if (I.descrip) f.push([T.desc, I.descrip]);
  return f;
}
function renderInfo() {
  const I = S.img;
  let h = `<p class="nv-fname">${esc(I.name)}</p><dl class="nv-dl">`;
  for (const [k, v] of infoFacts('en')) h += `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`;
  h += `</dl><p class="nv-sub">Affine matrix (voxel → ${esc(I.unit)})</p><pre class="nv-aff">${esc(affineRows(I.affine, 'en').join('\n'))}</pre>`;
  if (I.unitDeclared === false && I.format !== 'NRRD') h += '<p class="nv-note">No spatial unit in header; assuming mm.</p>';
  $('nvInfo').innerHTML = h;
}
function renderLabels() {
  const box = $('nvLabels');
  if (!S.lab) { box.hidden = true; return; }
  box.hidden = false;
  const K = S.table.length - 1, vv = S.sp[0] * S.sp[1] * S.sp[2] / 1000;
  $('nvLabHead').textContent = `Nhãn (${K})`;
  $('nvLabFile').textContent = S.labFile.name + (S.labResampled ? ' (lấy mẫu lại theo lưới ảnh)' : '');
  $('nvLabFilter').hidden = K < 10;
  const ul = $('nvLabList'); ul.innerHTML = '';
  const seen = new Map(); for (let k = 1; k <= K; k++) seen.set(S.table[k].id, (seen.get(S.table[k].id) || 0) + 1);
  if (!K) { ul.innerHTML = '<li class="nv-empty">File nhãn không có voxel nào khác 0 nằm trong vùng ảnh.</li>'; return; }
  for (let k = 1; k <= K; k++) {
    const e = S.table[k], li = document.createElement('li'), c = hex(Array.from(S.cols.subarray(3 * k, 3 * k + 3)));
    li.dataset.k = k;
    li.innerHTML = `<input type="checkbox" ${S.vis[k] ? 'checked' : ''} aria-label="Hiện nhãn ${e.id}">`
      + `<input type="color" value="${c}" aria-label="Màu nhãn ${e.id}" title="Đổi màu">`
      + `<button type="button" class="nv-lab-id" title="Tới lát giữa của nhãn">${e.id}${seen.get(e.id) > 1 ? `<small>L${e.layer}</small>` : ''}</button>`
      + `<input type="text" class="nv-lab-txt" value="${esc(labelName(e))}" placeholder="Đặt tên" aria-label="Tên nhãn ${e.id}" spellcheck="false">`
      + `<span class="nv-lab-vol">${fmtN(e.count * vv, e.count * vv < 10 ? 2 : 1)} mL</span>`;
    ul.appendChild(li);
  }
  filterLabels();
}
function filterLabels() {
  const q = $('nvLabFilter').value.trim().toLowerCase();
  $('nvLabList').querySelectorAll('li[data-k]').forEach(li => {
    const e = S.table[+li.dataset.k];
    li.hidden = !!q && !(String(e.id).includes(q) || labelName(e).toLowerCase().includes(q));
  });
}
function bindLabels() {
  const ul = $('nvLabList');
  ul.addEventListener('change', e => {
    const li = e.target.closest('li[data-k]'); if (!li) return; const k = +li.dataset.k;
    if (e.target.type === 'checkbox') S.vis[k] = e.target.checked ? 1 : 0;
    req(); readout(); mosaicSoon();
  });
  ul.addEventListener('input', e => {
    const li = e.target.closest('li[data-k]'); if (!li) return; const k = +li.dataset.k, en = S.table[k];
    if (e.target.type === 'color') S.cols.set(unhex(e.target.value), 3 * k);
    else if (e.target.classList.contains('nv-lab-txt')) {
      en.user = e.target.value.trim();
      if (!S.names) S.names = new Map();
      S.names.set(en.id, { name: en.user, color: Array.from(S.cols.subarray(3 * k, 3 * k + 3)) });
    } else return;
    req(); readout(); mosaicSoon();
  });
  ul.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.classList.contains('nv-lab-txt')) e.target.blur(); });
  ul.addEventListener('click', e => {
    const b = e.target.closest('.nv-lab-id'); if (!b) return;
    const e2 = S.table[+b.closest('li').dataset.k], c = e2.sum.map(x => Math.round(x / e2.count)), r = rOfIjk(c);
    setSlice(r[view(S.orient).axis]);
  });
  const all = on => { ul.querySelectorAll('li[data-k]').forEach(li => { if (li.hidden) return; S.vis[+li.dataset.k] = on ? 1 : 0; li.querySelector('input[type=checkbox]').checked = on; }); req(); readout(); mosaicSoon(); };
  $('nvLabAll').addEventListener('click', () => all(true));
  $('nvLabNone').addEventListener('click', () => all(false));
  $('nvLabInv').addEventListener('click', () => { ul.querySelectorAll('li[data-k]').forEach(li => { if (li.hidden) return; const k = +li.dataset.k; S.vis[k] ^= 1; li.querySelector('input[type=checkbox]').checked = !!S.vis[k]; }); req(); readout(); mosaicSoon(); });
  $('nvLabFilter').addEventListener('input', filterLabels);
  $('nvLabCsv').addEventListener('click', exportNames);
}
/* bảng tên nhãn -> CSV "id,name,r,g,b" (đọc lại được bằng ô Tên nhãn) */
function exportNames() {
  if (!S.lab) return;
  const q = t => (/[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t), rows = ['id,name,r,g,b'];
  for (let k = 1; k < S.table.length; k++) {
    const e = S.table[k]; rows.push([e.id, q(labelName(e)), S.cols[3 * k], S.cols[3 * k + 1], S.cols[3 * k + 2]].join(','));
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['\ufeff' + rows.join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' }));
  a.download = baseName(S.labFile ? S.labFile.name : 'labels').replace(/\.seg$/i, '') + '_labels.csv';
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
function applyNames() {         // bảng tên nhãn: đổi màu mặc định theo bảng (nếu có), không đè màu của segment Slicer
  if (!S.lab) return;
  for (let k = 1; k < S.table.length; k++) {
    const e = S.table[k], t = S.names && S.names.get(e.id);
    if (t && t.name) e.user = t.name;
    const c = t && t.color ? t.color : (e.name ? e.color : idColor(S.labMulti ? k : e.id));
    S.cols.set(c.map(x => clamp(Math.round(x), 0, 255)), 3 * k);
  }
}

/* ---------------- 7. ô chọn bảng màu ---------------- */
const cmapPicker = (() => {
  let btn, list, open = false, act = 0;
  const idx = () => CMAPS.findIndex(c => c[0] === S.cmap);
  function refresh() {
    const [id, nm] = CMAPS[idx()];
    btn.querySelector('.nv-grad').style.background = lutCss(id, S.rev);
    btn.querySelector('.nv-cm-name').textContent = nm;
    list.querySelectorAll('li').forEach((li, i) => {
      li.querySelector('.nv-grad').style.background = lutCss(CMAPS[i][0], S.rev);
      li.setAttribute('aria-selected', String(i === idx()));
    });
  }
  function choose(i) { S.cmap = CMAPS[i][0]; refresh(); req(); mosaicSoon(); }
  function setAct(i) { act = (i + CMAPS.length) % CMAPS.length; list.querySelectorAll('li').forEach((li, j) => li.classList.toggle('act', j === act)); list.setAttribute('aria-activedescendant', 'nvCm-' + act); list.children[act].scrollIntoView({ block: 'nearest' }); }
  function show(on) {
    open = on; list.hidden = !on; btn.setAttribute('aria-expanded', String(on));
    if (on) { setAct(idx()); list.focus(); } else btn.focus();
  }
  function init() {
    btn = $('nvCmBtn'); list = $('nvCmList');
    list.innerHTML = CMAPS.map(([id, nm], i) => `<li role="option" id="nvCm-${i}" data-i="${i}"><span class="nv-grad"></span><span>${nm}</span></li>`).join('');
    btn.addEventListener('click', () => show(!open));
    btn.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (e.altKey) show(true); else choose((idx() + (e.key === 'ArrowDown' ? 1 : -1) + CMAPS.length) % CMAPS.length); }
    });
    list.addEventListener('click', e => { const li = e.target.closest('li'); if (li) { choose(+li.dataset.i); show(false); } });
    list.addEventListener('mousemove', e => { const li = e.target.closest('li'); if (li && +li.dataset.i !== act) setAct(+li.dataset.i); });
    list.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { setAct(act + 1); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { setAct(act - 1); e.preventDefault(); }
      else if (e.key === 'Home') { setAct(0); e.preventDefault(); } else if (e.key === 'End') { setAct(-1); e.preventDefault(); }
      else if (e.key === 'Enter' || e.key === ' ') { choose(act); show(false); e.preventDefault(); }
      else if (e.key === 'Escape' || e.key === 'Tab') { show(false); if (e.key === 'Escape') e.preventDefault(); }
    });
    document.addEventListener('pointerdown', e => { if (open && !e.target.closest('#nvCm')) { open = false; list.hidden = true; btn.setAttribute('aria-expanded', 'false'); } });
    refresh();
  }
  return { init, refresh };
})();

/* ---------------- 8. mosaic ---------------- */
const TXT = {
  vi: { dim: 'Kích thước', vox: 'Kích thước voxel', fov: 'Vùng ảnh', dtype: 'Kiểu dữ liệu', orient: 'Hướng trục', oblique: ' (xoay xiên)', affsrc: 'Nguồn affine',
        range: 'Khoảng giá trị', scale: 'Hệ số co giãn', vol: 'Khối (t)', desc: 'Mô tả', slices: 'Lát cắt', win: 'Cửa sổ', cmap: 'Bảng màu',
        aff: 'Ma trận affine (voxel → mm)', labels: 'Nhãn', labfile: 'Nhãn', more: n => `và ${n} nhãn khác`, ov: m => (m === 'line' ? 'viền' : 'tô'),
        nsl: n => `${n} lát`, made: 'Xuất ngày', step: 'cách', conv: c => (c ? 'quy ước X-quang' : 'quy ước thần kinh'), hidden: n => `${n} nhãn đang ẩn` },
  en: { dim: 'Dimensions', vox: 'Voxel size', fov: 'Field of view', dtype: 'Data type', orient: 'Orientation', oblique: ' (oblique)', affsrc: 'Affine source',
        range: 'Value range', scale: 'Scaling', vol: 'Volume (t)', desc: 'Description', slices: 'Slices', win: 'Window', cmap: 'Colormap',
        aff: 'Affine matrix (voxel → mm)', labels: 'Labels', labfile: 'Labels', more: n => `and ${n} more`, ov: m => (m === 'line' ? 'outline' : 'fill'),
        nsl: n => `${n} slices`, made: 'Exported', step: 'every', conv: c => (c ? 'radiological convention' : 'neurological convention'), hidden: n => `${n} labels hidden` },
};
const M = { rows: 4, cols: 4, tile: 256, bg: 'black', lang: 'en', num: true, timer: 0, canvas: null };
/* rows × cols lát cách đều trong vùng có tín hiệu theo hướng đang xem */
function mosaicSlices() {
  const N = nSlices(S.orient), bb = S.bbox ? S.bbox[view(S.orient).axis] : [0, N - 1];
  const a = bb[0], b = bb[1], len = b - a + 1, n = Math.min(M.rows * M.cols, len);
  if (n <= 0) return [];
  if (n === 1) return [Math.round((a + b) / 2)];
  const out = []; for (let i = 0; i < n; i++) out.push(a + Math.round(i * (len - 1) / (n - 1)));
  return [...new Set(out)];
}
/* chú thích bên phải; vẽ thật nếu doDraw, trả về chiều cao cần */
function legend(c, x0, y0, W, sc, doDraw, info) {
  const T = TXT[M.lang], lang = M.lang, dark = M.bg === 'black';
  const ink = dark ? '#F2F4F7' : '#1B1920', mute = dark ? '#A9B4C0' : '#59606B', rule = dark ? '#3a3742' : '#DCE6EC';
  const F = (w, s) => `${w} ${Math.round(s * sc)}px "Be Vietnam Pro", "Segoe UI", system-ui, sans-serif`, MONO = s => `${Math.round(s * sc)}px ui-monospace, Menlo, Consolas, monospace`;
  let y = y0;
  const fit = (t, w) => { if (c.measureText(t).width <= w) return t; while (t.length > 1 && c.measureText(t + '…').width > w) t = t.slice(0, -1); return t + '…'; };
  const text = (t, x, font, col, w = W) => { c.font = font; if (doDraw) { c.fillStyle = col; c.fillText(fit(t, w), x, y); } };
  /* đoạn chữ tự xuống dòng; y dừng ở dòng cuối */
  const para = (t, x, font, col, w, lh) => {
    c.font = font; let ln = ''; const out = [];
    for (const wd of String(t).split(' ')) { const tt = ln ? ln + ' ' + wd : wd; if (c.measureText(tt).width > w && ln) { out.push(ln); ln = wd; } else ln = tt; }
    out.push(ln);
    out.forEach((tt, i) => { if (i) y += lh * sc; text(tt, x, font, col, w); });
  };
  const line = () => { y += 10 * sc; if (doDraw) { c.fillStyle = rule; c.fillRect(x0, y, W, Math.max(1, sc)); } y += 12 * sc; };
  c.textBaseline = 'top'; c.textAlign = 'left';
  text(S.img.name, x0, F(700, 17), ink); y += 24 * sc;
  if (S.lab) { text(`${T.labfile}: ${S.labFile.name}`, x0, F(400, 12.5), mute); y += 18 * sc; }
  line();
  // bảng thông tin
  const facts = infoFacts(lang);
  const D = view(S.orient), sl = info.slices;
  const c0 = sliceCoord(S.orient, sl[0]), c1 = sliceCoord(S.orient, sl[sl.length - 1]);
  facts.push([T.slices, `${D.name}, ${T.nsl(sl.length)}, voxel ${c0.a} ${c0.idx}–${c1.idx} (${D.ax} ${fmtN(c0.mm, 1, lang, true)} … ${fmtN(c1.mm, 1, lang, true)} ${S.img.unit}), ${T.conv(S.radio)}`]);
  facts.push([T.win, `${fmtV(S.lo, lang)} … ${fmtV(S.hi, lang)}`]);
  const kw = 128 * sc;
  for (const [k, v] of facts) {
    text(k, x0, F(400, 12.5), mute, kw - 6 * sc);
    // giá trị có thể dài: xuống dòng
    para(v, x0 + kw, F(600, 12.5), ink, W - kw, 17); y += 19 * sc;
  }
  line();
  text(T.aff, x0, F(600, 12.5), ink); y += 20 * sc;
  for (const r of affineRows(S.img.affine, lang)) { text(r, x0, MONO(12), ink); y += 17 * sc; }
  line();
  // thang màu
  text(`${T.cmap}: ${CMAPS.find(x => x[0] === S.cmap)[1]}${S.rev ? (lang === 'vi' ? ' (đảo)' : ' (reversed)') : ''}`, x0, F(600, 12.5), ink); y += 20 * sc;
  const bh = 14 * sc;
  if (doDraw) {
    const lut = lutOf(S.cmap, S.rev), g = c.createLinearGradient(x0, 0, x0 + W, 0);
    for (let i = 0; i <= 32; i++) { const k = Math.min(255, i * 8); g.addColorStop(i / 32, `rgb(${lut[3 * k]},${lut[3 * k + 1]},${lut[3 * k + 2]})`); }
    c.fillStyle = g; c.fillRect(x0, y, W, bh); c.strokeStyle = mute; c.lineWidth = Math.max(1, sc); c.strokeRect(x0 + .5, y + .5, W - 1, bh - 1);
  }
  y += bh + 4 * sc;
  c.font = F(400, 12);
  if (doDraw) { c.fillStyle = mute; c.textAlign = 'left'; c.fillText(fmtV(S.lo, lang), x0, y); c.textAlign = 'right'; c.fillText(fmtV(S.hi, lang), x0 + W, y); c.textAlign = 'left'; }
  y += 18 * sc;
  // nhãn
  if (S.lab && S.ov.on) {
    const K = S.table.length - 1, shown = [];
    for (let k = 1; k <= K; k++) if (S.vis[k]) shown.push(k);
    line();
    text(`${T.labels} (${S.ov.mode === 'line' ? T.ov('line') + ' ' + S.ov.thick + ' px' : T.ov('fill')})`, x0, F(600, 12.5), ink); y += 20 * sc;
    const named = shown.some(k => labelName(S.table[k]));
    const ncol = named ? 1 : Math.max(1, Math.min(4, Math.floor(W / (90 * sc)))), cw = W / ncol, MAX = named ? 40 : 80;
    const list = shown.slice(0, MAX), rh = 18 * sc, sw = 11 * sc;
    list.forEach((k, i) => {
      const cx = x0 + (i % ncol) * cw, cy = y + Math.floor(i / ncol) * rh, e = S.table[k];
      if (doDraw) {
        c.fillStyle = `rgb(${S.cols[3 * k]},${S.cols[3 * k + 1]},${S.cols[3 * k + 2]})`; c.fillRect(cx, cy + 2 * sc, sw, sw);
        c.strokeStyle = mute; c.lineWidth = Math.max(1, sc * .8); c.strokeRect(cx + .5, cy + 2 * sc + .5, sw - 1, sw - 1);
        c.font = F(600, 12); c.fillStyle = ink; const idt = String(e.id); c.fillText(idt, cx + sw + 6 * sc, cy);
        const nm = labelName(e);
        if (nm) { const iw = c.measureText(idt).width; c.font = F(400, 12); c.fillText(fit(nm, cw - sw - 16 * sc - iw), cx + sw + 12 * sc + iw, cy); }
      }
    });
    y += Math.ceil(list.length / ncol) * rh;
    if (shown.length > MAX) { text(T.more(shown.length - MAX), x0, F(400, 12), mute); y += 18 * sc; }
    if (shown.length < K) { text(T.hidden(K - shown.length), x0, F(400, 12), mute); y += 18 * sc; }
  }
  line();
  const dt = new Date(), ds = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  para(`${T.made} ${ds}${S.cfg.printHeader ? (lang === 'vi' ? ' từ ' : ' from ') + S.cfg.printHeader : ''}`, x0, F(400, 11.5), mute, W, 16); y += 16 * sc;
  return y - y0;
}
async function renderMosaic() {
  if (!S.data) return null;
  try { await Promise.all(['400', '600', '700'].map(w => document.fonts.load(`${w} 16px "Be Vietnam Pro"`, 'Việt'))); } catch (e) { /* dùng font dự phòng */ }
  const slices = mosaicSlices();
  if (!slices.length) return null;
  const s0 = sliceOf(S.orient, slices[0]), pw = s0.W * s0.pw, ph = s0.H * s0.ph, k = M.tile / Math.max(pw, ph);
  const tw = Math.max(16, Math.round(pw * k)), th = Math.max(16, Math.round(ph * k));
  const n = slices.length, cols = Math.min(M.cols, n), rows = Math.ceil(n / cols);
  const sc = Math.max(1, M.tile / 256), gap = Math.round(4 * sc), pad = Math.round(18 * sc), LW = Math.round(clamp(300 * sc, 300, 560));
  const gw = cols * tw + (cols - 1) * gap, gh = rows * th + (rows - 1) * gap;
  const probe = cvOf(10, 10).getContext('2d');
  const lh = legend(probe, 0, 0, LW, sc, false, { slices });
  const W = pad + gw + pad + LW + pad, H = pad + Math.max(gh, lh) + pad;
  if (W * H > 120e6) throw new Error('Ảnh mosaic quá lớn; hãy giảm cỡ ô hoặc số ô.');
  const c = cvOf(W, H), g = c.getContext('2d');
  g.fillStyle = M.bg === 'black' ? '#000' : '#fff'; g.fillRect(0, 0, W, H);
  const D = view(S.orient);
  for (let i = 0; i < n; i++) {
    const s = slices[i], sl = i === 0 ? s0 : sliceOf(S.orient, s), x = pad + (i % cols) * (tw + gap), y = pad + Math.floor(i / cols) * (th + gap);
    g.save(); g.fillStyle = '#000'; g.fillRect(x, y, tw, th);
    g.beginPath(); g.rect(x, y, tw, th); g.clip();
    drawSlice(g, sl, { x, y, w: tw, h: th }); g.restore();
    const fs = Math.round(clamp(11 * sc, 10, 22));
    g.font = `600 ${fs}px "Be Vietnam Pro", system-ui, sans-serif`; g.textBaseline = 'top';
    if (M.num) {
      const t = `${D.ax} = ${fmtN(sliceCoord(S.orient, s).mm, 1, M.lang, true)}`; g.textAlign = 'left';
      g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(x, y, g.measureText(t).width + 10, fs + 6);
      g.fillStyle = '#fff'; g.fillText(t, x + 5, y + 3);
    }
    if (i === 0) {
      g.fillStyle = '#f2c230'; const m = 4 * sc;
      g.textBaseline = 'middle'; g.textAlign = 'left'; g.fillText(D.edge[0], x + m, y + th / 2); g.textAlign = 'right'; g.fillText(D.edge[1], x + tw - m, y + th / 2);
      g.textAlign = 'center'; g.textBaseline = 'top'; g.fillText(D.edge[2], x + tw / 2, y + m);
      g.textBaseline = 'bottom'; g.fillText(D.edge[3], x + tw / 2, y + th - m);
    }
    if ((i & 7) === 7) await tick();
  }
  legend(g, pad + gw + pad, pad, LW, sc, true, { slices });
  return c;
}
async function updateMosaic() {
  const box = $('nvMPrev'), info = $('nvMInfo');
  try {
    const c = await renderMosaic();
    M.canvas = c;
    box.innerHTML = '';
    if (!c) { info.textContent = 'Không có lát nào để xuất.'; $('nvMDown').disabled = true; return; }
    c.className = 'nv-mprev'; c.setAttribute('role', 'img'); c.setAttribute('aria-label', 'Xem trước ảnh mosaic');
    box.appendChild(c);
    info.textContent = `${c.width} × ${c.height} px`;
    $('nvMDown').disabled = false;
  } catch (e) { info.textContent = e.message; $('nvMDown').disabled = true; }
}
function mosaicSoon() { if (!S.data) return; clearTimeout(M.timer); M.timer = setTimeout(updateMosaic, 350); }
function bindMosaic() {
  const n = (id, f) => $(id).addEventListener('change', e => { f(e.target); mosaicSoon(); });
  n('nvMRows', t => { M.rows = clamp(Math.round(+t.value || 1), 1, 20); t.value = M.rows; });
  n('nvMCols', t => { M.cols = clamp(Math.round(+t.value || 1), 1, 20); t.value = M.cols; });
  n('nvMTile', t => { M.tile = +t.value; });
  n('nvMBg', t => { M.bg = t.value; });
  n('nvMNum', t => { M.num = t.checked; });
  $('nvMDown').addEventListener('click', async () => {
    clearTimeout(M.timer); await updateMosaic(); const c = M.canvas; if (!c) return;
    c.toBlob(b => {
      const a = document.createElement('a'); a.href = URL.createObjectURL(b);
      a.download = `${baseName(S.img.name)}_mosaic_${S.orient}${S.lab ? '_nhan' : ''}.png`;
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }, 'image/png');
  });
}

/* ---------------- 9. nạp file ---------------- */
function msg(t, err) { const m = $('nvMsg'); m.hidden = !t; m.className = 'nv-msg' + (err ? ' err' : ''); m.textContent = t || ''; }
function dropZone(zoneId, inputId, nameId, onFile) {
  const z = $(zoneId), inp = $(inputId);
  const take = f => { if (!f) return; $(nameId).textContent = f.name; z.classList.add('has'); onFile(f); };
  inp.addEventListener('change', () => take(inp.files[0]));
  z.addEventListener('dragover', e => { e.preventDefault(); z.classList.add('over'); });
  z.addEventListener('dragleave', () => z.classList.remove('over'));
  z.addEventListener('drop', e => { e.preventDefault(); z.classList.remove('over'); take(e.dataTransfer.files[0]); });
}
let busy = Promise.resolve();
const queue = f => (busy = busy.then(f, f));
async function loadImage(file) {
  msg('Đang đọc ' + file.name + '…');
  try {
    const img = await readVolumeFile(file); await tick();
    S.img = img; S.t = 0; S.data = img.read(0); S.lab = null; S.sl = null;
    setupGrid(); stats(); autoWindow(); S.bri = 0; S.con = 0;
    // giữ nhãn cũ nếu cùng lưới; không thì bỏ
    if (S.labFile && S.labSrc) {
      try { await attachLabels(S.labSrc, true); }
      catch (e) { S.lab = null; S.labFile = S.labSrc = null; $('nvLabName').textContent = 'Chưa chọn file'; $('nvLabDrop').classList.remove('has'); $('nvOvRow').hidden = true; }
    }
    computeBBox();
    for (const o of ['ax', 'cor', 'sag']) S.slice[o] = Math.floor(nSlices(o) / 2);
    if (S.bbox) for (const o of ['ax', 'cor', 'sag']) { const a = view(o).axis; S.slice[o] = Math.round((S.bbox[a][0] + S.bbox[a][1]) / 2); }
    $('nvVolRow').hidden = img.nt <= 1; $('nvVol').max = img.nt - 1; $('nvVol').value = 0; $('nvVolOut').textContent = `1 / ${img.nt}`;
    $('nvViewerWrap').hidden = false; $('nvMosaicWrap').hidden = false; $('nvLabDrop').classList.remove('dis');
    S.sl = null; S.win(); renderInfo(); renderLabels(); setOrient(S.orient);
    const warn = [];
    if (isOblique(img.affine)) warn.push('Ảnh xoay xiên: đang hiển thị theo trục gần nhất, chưa nội suy lại.');
    msg(warn.join(' '));
  } catch (e) { console.error(e); msg(e.message || String(e), true); }
}
async function attachLabels(L, silent) {
  const r = await buildLabels(L, S.img, p => msg(`Đang ghép nhãn vào lưới ảnh… ${Math.round(p * 100)}%`));
  S.lab = r.vol; S.table = r.table; S.labResampled = r.resampled; S.labMulti = r.multi;
  const K = S.table.length - 1;
  S.vis = new Uint8Array(K + 1).fill(1); S.vis[0] = 0; S.cols = new Uint8Array(3 * (K + 1));
  applyNames();
  if (!silent) msg(r.suspicious ? 'Lưu ý: file nhãn có nhiều giá trị không nguyên; có thể đây là ảnh thường chứ không phải ảnh nhãn.' : (r.resampled ? 'File nhãn khác lưới voxel với ảnh nên đã được lấy mẫu lại theo hai ma trận affine.' : ''));
}
async function loadLabels(file) {
  if (!S.img) { msg('Hãy chọn ảnh trước, rồi mới chọn file nhãn.', true); return; }
  msg('Đang đọc ' + file.name + '…');
  try {
    const L = await readVolumeFile(file); await tick();
    S.labFile = file; S.labSrc = L;
    await attachLabels(L, false);
    $('nvOvRow').hidden = false; ovUi();
    computeBBox(); S.sl = null; renderLabels(); req(); readout(); mosaicSoon();
  } catch (e) { console.error(e); msg(e.message || String(e), true); }
}
async function loadNames(file) {
  try {
    S.names = parseLabelTable(await file.text());
    if (!S.names.size) { msg('Không đọc được dòng nào trong bảng tên nhãn. Mỗi dòng cần dạng "số tên r g b" hoặc định dạng ITK-SNAP.', true); return; }
    applyNames(); renderLabels(); req(); readout(); mosaicSoon();
    msg(`Đã đọc ${S.names.size} tên nhãn.`);
  } catch (e) { msg(e.message || String(e), true); }
}

function start(cfg = {}) {
  S.cfg = cfg;
  if (!('DecompressionStream' in window)) msg('Trình duyệt này không giải nén được .gz; chỉ đọc được file .nii / .nrrd không nén.', true);
  bindViewer(); bindLabels(); bindMosaic(); cmapPicker.init(); setOvLevel(OV_MAX);
  dropZone('nvImgDrop', 'nvImgFile', 'nvImgName', f => queue(() => loadImage(f)));
  dropZone('nvLabDrop', 'nvLabFileIn', 'nvLabName', f => queue(() => loadLabels(f)));
  dropZone('nvNameDrop', 'nvNameFile', 'nvNameName', f => queue(() => loadNames(f)));
  readout();
}
return { start, _test: { parseNifti, parseNrrd, parseLabelTable, orientation, buildLabels } };
})();
