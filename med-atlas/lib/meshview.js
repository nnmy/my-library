/* =====================================================================
   Xem file VTK / PLY (view_mesh.html). Không dùng thư viện hay dịch vụ ngoài; file chỉ đọc trên máy người dùng.
   Cách dùng trên trang:  MESHVIEW.start({ printHeader: "My N. Nguyen's Library" })
   Giao diện: lib/meshview.css, dùng lại khung chung của lib/niftiview.css (ô chọn file, trình xem, cột thông tin, phần xuất).

   Đọc được (có thể nén .gz):
     VTK legacy (.vtk)  ASCII hoặc BINARY, bản 2.0 … 5.1 (cả kiểu OFFSETS / CONNECTIVITY mới)
                        POLYDATA (VERTICES, LINES, POLYGONS, TRIANGLE_STRIPS)
                        UNSTRUCTURED_GRID (ô 2D vẽ thẳng; ô 3D tetra / hexa / voxel / wedge / pyramid, kể cả bậc hai, lấy mặt ngoài)
                        STRUCTURED_GRID (lấy mặt ngoài)
                        POINT_DATA / CELL_DATA: SCALARS, COLOR_SCALARS, VECTORS, NORMALS, TEXTURE_COORDINATES, TENSORS, FIELD, GLOBAL_IDS
     PLY (.ply)         ascii, binary_little_endian, binary_big_endian; vertex (x y z, nx ny nz, red green blue, thuộc tính khác),
                        face (vertex_indices / vertex_index + thuộc tính), edge, tristrips
   Không đọc: VTK XML (.vtp, .vtu), ảnh voxel (STRUCTURED_POINTS, RECTILINEAR_GRID: dùng view_nifti.html).

   Hệ tọa độ: 3D Slicer ghi "SPACE=LPS" hoặc "SPACE=RAS" trong dòng tiêu đề VTK / comment PLY; nếu có thì dùng, không thì coi là
   X Y Z chưa rõ hướng. Người dùng đổi được. LPS được lật x, y khi vẽ để màn hình luôn theo RAS; số đo trong bảng giữ tọa độ gốc của file.
   Ba hình chiếu là phép chiếu song song theo ba trục, cùng một tỉ lệ (có thước đo), theo quy ước thần kinh như view_nifti.html.
   Lúc mở trang: nạp mô hình minh họa (cfg.demo, mặc định lib/data/mesh-demo/head-surface-demo.ply) chỉ để xem thử;
   chưa hiện thông tin, chưa cho xuất file cho tới khi người dùng chọn file của họ. Mở trang bằng file:// thì bỏ qua minh họa.

   Mục lục file:
     1. tiện ích, bảng màu
     2. đọc VTK legacy, PLY
     3. dựng lưới: tam giác hóa, mặt ngoài của ô 3D, số đo (diện tích, thể tích, cạnh hở, số mảnh)
     4. tô màu theo dữ liệu
     5. WebGL: vẽ lên màn hình hoặc vào ảnh (framebuffer)
     6. trình xem: camera, chuột, hình chiếu, trục
     7. bảng thông tin
     8. xuất PNG / PDF (3D + ba hình chiếu + thông tin, nền trắng)
     9. nạp file, mô hình minh họa, nút cuộn nổi, khởi động
   ===================================================================== */
const MESHVIEW = (() => {
'use strict';

/* ---------------- 1. tiện ích, bảng màu ---------------- */
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const tick = () => new Promise(r => setTimeout(r, 0));
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const num = v => Number(v).toLocaleString('en-US');
const numVi = v => num(v).replace(/,/g, ' ');           // số nguyên trong câu tiếng Việt: 8 002
/* số thực kiểu Anh, có dấu phẩy hàng nghìn, tối đa d chữ số thập phân, dấu trừ thật */
const fmtX = (v, d = 2) => (Number.isFinite(v) ? v.toLocaleString('en-US', { maximumFractionDigits: d }).replace(/^-/, '−') : '—');
/* số chữ số thập phân hợp với độ lớn ref (thường là kích thước vật) */
const decFor = ref => { const a = Math.abs(ref); return a >= 1000 ? 0 : a >= 100 ? 1 : a >= 1 ? 2 : a >= 0.01 ? 4 : 6; };
const fmtV = v => { const a = Math.abs(v); return fmtX(v, a === 0 || a >= 1000 ? 0 : a >= 100 ? 1 : a >= 1 ? 2 : 4); };
const baseName = n => n.replace(/\.gz$/i, '').replace(/\.(vtk|ply)$/i, '');
const latin = b => { let s = ''; for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode.apply(null, b.subarray(i, i + 8192)); return s; };
const cvOf = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const FONT = '"Be Vietnam Pro", "Segoe UI", system-ui, sans-serif';

const CMAP_B64 = {
  viridis: 'RAFURAJWRQRXRQVZRgdaRghcRgpdRgteRw1gRw5hRxBjRxFkRxNlSBRnSBZoSBdpSBhqSBpsSBttSBxuSB1vSB9wSCBxSCFzSCN0SCR1SCV2SCZ3SCh4SCl5Ryp6Ryx6Ry17Ry58Ry99RjB+RjJ+RjN/RjSARTWBRTeBRTiCRDmDRDqDRDuEQz2EQz6FQj+FQkCGQkGGQUKHQUSHQEWIQEaIP0eIP0iJPkmJPkqJPkyKPU2KPU6KPE+KPFCLO1GLO1KLOlOLOlSMOVWMOVaMOFiMOFmMN1qMN1uNNlyNNl2NNV6NNV+NNGCNNGGNM2KNM2ONMmSOMmWOMWaOMWeOMWiOMGmOMGqOL2uOL2yOLm2OLm6OLm+OLXCOLXGOLHGOLHKOLHOOK3SOK3WOKnaOKneOKniOKXmOKXqOKXuOKHyOKH2OJ36OJ3+OJ4COJoGOJoKOJoKOJYOOJYSOJYWOJIaOJIeOI4iOI4mOI4qNIouNIoyNIo2NIY6NIY+NIZCNIZGMIJKMIJKMIJOMH5SMH5WLH5aLH5eLH5iLH5mKH5qKHpuKHpyJHp2JH56JH5+IH6CIH6GIH6GHH6KHIKOGIKSGIaWFIaaFIqeFIqiEI6mDJKqDJauCJayCJq2BJ62BKK6AKa9/KrB/LLF+LbJ9LrN8L7R8MbV7MrZ6NLZ5Nbd5N7h4OLl3Orp2O7t1Pbx0P7xzQL1yQr5xRL9wRsBvSMFuSsFtTMJsTsNrUMRqUsVpVMVoVsZnWMdlWshkXMhjXsliYMpgY8tfZcteZ8xcac1bbM1abs5YcM9Xc9BWddBUd9FTetFRfNJQf9NOgdNNhNRLhtVJidVIi9ZGjtZFkNdDk9dBldhAmNg+m9k8ndk7oNo5oto3pds2qNs0qtwyrdwwsN0vst0ttd4ruN4put4ovd8mwN8lwt8jxeAhyOAgyuEfzeEd0OEc0uIb1eIa2OIZ2uMZ3eMY3+MY4uQY5eQZ5+QZ6uUa7OUb7+Uc8eUd9OYe9uYg+OYh++cj/ecl',
  inferno: 'AAAEAQAFAQEGAQEIAgEKAgIMAgIOAwIQBAMSBAMUBQQXBgQZBwUbCAUdCQYfCgciCwckDAgmDQgpDgkrEAktEQowEgoyFAs0FQs3Fgs5GAw8GQw+GwxBHAxDHgxFHwxIIQxKIwxMJAxPJgxRKAtTKQtVKwtXLQtZLwpbMQpcMgpeNApfNglhOAliOQljOwlkPQllPglmQApnQgpoRApoRQppRwtqSQtqSgxrTAxrTQ1sTw1sUQ5sUg5tVA9tVQ9tVxBuWRBuWhFuXBJuXRJuXxNuYRNuYhRuZBVuZRVuZxZuaRZuahdubBhubRhubxlucRluchpudBpudRtudxxteBxteh1tfB1tfR5tfx5sgB9sgiBshCBrhSFrhyFriCJqiiJqjCNpjSNpjyRpkCVokiVokyZnlSZnlydmmCdmmihlmylknSlknypjoCpjoitioyxhpSxgpi1gqC5fqS5eqy9erTBdrjBcsDFbsTJaszJatDNZtjRYtzVXuTVWujZVvDdUvThTvzlSwDpRwTpQwztPxDxOxj1Nxz5MyD9LykBKy0FJzEJIzkNHz0RG0EVF0kZE00dD1EhC1UpB10s/2Ew+2U092k4821A73VE63lI431M34FU24VY14lc041kz5Fox5Vww5l0v514u6GAt6WEr6mMq62Qp62Yo7Gcm7Wkl7mok72wj724h8G8g8XEf8XMd8nQc83Yb83gZ9HkY9XsX9X0V9n4U9oAT94IS94QQ+IUP+IcO+IkM+YsL+YwK+Y4J+pAI+pIH+pQH+5YG+5cG+5kG+5sG+50H/J8H/KEI/KMJ/KUK/KYM/KgN/KoP/KwR/K4S/LAU/LIW/LQY+7Ya+7gd+7of+7wh+74j+sAm+sIo+sQq+sYt+ccv+cky+cs1+M03+M8699E999NA9tVD9tdG9dlJ9dtM9N1P9N9T9OFW8+Na8+Vd8uZh8uhl8upp8ext8e1x8e918fF58vJ98vSC8/WG8/aK9PiO9fmS9vqW+Pua+fyd+v2h/P+k',
  plasma: 'DQiHEAeIEweJFgeKGQaMGwaNHQaOIAaPIgaQJAaRJgWRKAWSKgWTLAWULgWVLwWWMQWXMwWXNQSYNwSZOASaOgSaPASbPgScPwScQQSdQwOeRAOeRgOfSAOfSQOgSwOhTAKhTgKiUAKiUQKjUwKjVQKkVgGkWAGkWQGlWwGlXAGmXgGmYAGmYQCnYwCnZACnZgCnZwCoaQCoagCobACobgCobwCocQCocgGodAGodQGodwGoeAGoegKoewKofQOofgOogASogQSngwWnhAWnhgamhwemiAimigmliwqljQuljgykjw2kkQ6jkg+jlBCilRGhlhOhmBSgmRWfmhafnBeenRidnhmdoBqcoRuboh2aox6apR+ZpiCYpyGXqCKWqiOVqySUrCaUrSeTriiSsCmRsSqQsiuPsyyOtC6NtS+MtjCLtzGKuDKJujOIuzSIvDWHvTeGvjiFvzmEwDqDwTuCwjyBwz2AxD5/xUB+xkF9x0J8yEN7yUR6ykV6y0Z5zEd4zEl3zUp2zkt1z0x00E1z0U5y0k9x01Fx1FJw1VNv1VRu1lVt11Zs2Fdr2Vhq2lpq2ltp21xo3F1n3V5m3l9l3mFk32Jj4GNj4WRi4mVh4mZg42hf5Gle5Wpd5Wtd5mxc525b529a6HBZ6XFY6XJX6nRX63VW63ZV7HdU7XlT7XpS7ntR73xR735Q8H9P8IBO8YFN8YNM8oRL84VL84dK9IhJ9IlI9YtH9YxG9o1F9o9E95BE95FD95NC+JRB+JVA+Zc/+Zg++Zo++ps9+pw8+p47+586+6E5+6I4/KM4/KU3/KY2/Kg1/Kk0/asz/awz/a4y/a8x/bEw/bIv/bQv/bUu/rct/rgs/ros/rsr/r0q/r4q/sAp/cIp/cMo/cUn/cYn/cgn/com/csm/M0l/M4l/NAl/NIl+9Mk+9Uk+9ck+tgk+tok+dwk+d0l+N8l+OEl9+Il9+Ql9uYm9ugm9ekm9esn9O0n8+4n8/An8vIn8fQm8fUl8Pck8Pkh',
  turbo: 'MBI7MhVDMxhKNBtRNR5YNiFfNyRmOCdtOSpzOi15Oy+APDKGPTWLPjiRPzuXPz6cQECiQUOnQUasQkmxQku1Q066RFG/RFTDRFbHRVnLRVzPRV7TRmHWRmTaRmbdRmngRmvjR27mR3HpR3PrR3buR3jwR3vyRn30RoD2RoL4RoX6Rof7RYr8RYz9RI/+Q5H+QpT/QZb/QJn/Ppv+PZ7+O6D9OqP8OKX7N6j6Nav4M633Ma/1L7L0LrTyLLfwKrnuKLzrJ77pJcDnI8PkIsXiIMffH8ndHsvaHM3YG9DVGtLSGtTQGdXNGNfKGNnIGNvFGN3CGN7AGOC9GeK7GeO5GuS2HOa0HeeyH+mvIOqsIuuqJeynJ+6kKu+hLPCeL/GbMvKYNfOUOPSRPPWOP/aKQ/eHRviESviATvl9Uvp6Vfp2WftzXfxvYfxsZf1paf1mbf5icf5fdf5cef5Zff9WgP9ThP9RiP9Oi/9Lj/9Jkv9Hlv5Emf5CnP5An/0/of09pPw8p/w6qfs5rPs4r/o3sfk2tPg2t/c1ufY1vPU0vvQ0wfM0w/E0xvA0yO80y+00zew00Oo00uk11Oc11+U12eQ22+I23eA339834d0349s45dk459c56dU569M57NE67s8678068cs68sk69Mc69cU69sM698E6+L45+bw5+ro5+7g4+7Y3/LM2/LE2/a41/aw0/qkz/qcy/qQx/qEw/p4v/pst/pks/pYr/pMq/pAp/Y0n/Yom/Icl/IQj+4Ei+34h+nsf+Xge+XUd+HIc928a9mwZ9WkY9GYX82MV8mAU8V0T8FsS71gR7VUQ7FMP61AO6k4N6EsM50kM5UcL5EUK4kMK4UEJ3z8I3T0I3DsH2jkH2DcG1jUG1DMF0jEF0C8Fzi0EzCsEyioEyCgDxSYDwyUDwSMCviECvCACuR4Ctx0CtBsBshoBrxgBrBcBqRYBpxQBpBMBoRIBnhABmw8BmA4BlQ0BkgsBjgoBiwkCiAgChQcCgQYCfgUCegQD',
  jet: 'AACAAACEAACJAACNAACSAACWAACbAACfAACkAACoAACtAACyAAC2AAC7AAC/AADEAADIAADNAADRAADWAADaAADfAADjAADoAADtAADxAAD2AAD6AAD/AAD/AAD/AAD/AAD/AAT/AAj/AAz/ABD/ABT/ABj/ABz/ACD/ACT/ACj/ACz/ADD/ADT/ADj/ADz/AED/AET/AEj/AEz/AFD/AFT/AFj/AFz/AGD/AGT/AGj/AGz/AHD/AHT/AHj/AHz/AID/AIT/AIj/AIz/AJD/AJT/AJj/AJz/AKD/AKT/AKj/AKz/ALD/ALT/ALj/ALz/AMD/AMT/AMj/AMz/AND/ANT/ANj/ANz+AOD7AOT4Auj0BuzxCfDuDPTrD/jnE/zkFv/hGf/eHP/bH//XI//UJv/RKf/OLP/KMP/HM//ENv/BOf++PP+6QP+3Q/+0Rv+xSf+tTf+qUP+nU/+kVv+gWv+dXf+aYP+XY/+UZv+Qav+Nbf+KcP+Hc/+Dd/+Aev99ff96gP93g/9zh/9wiv9tjf9qkP9mlP9jl/9gmv9dnf9aoP9WpP9Tp/9Qqv9Nrf9Jsf9GtP9Dt/9Auv88vv85wf82xP8zx/8wyv8szv8p0f8m1P8j1/8f2/8c3v8Z4f8W5P8T5/8P6/8M7v8J8fwG9PgC+PUA+/EA/u0A/+oA/+YA/+IA/94A/9sA/9cA/9MA/9AA/8wA/8gA/8QA/8EA/70A/7kA/7YA/7IA/64A/6sA/6cA/6MA/58A/5wA/5gA/5QA/5EA/40A/4kA/4YA/4IA/34A/3oA/3cA/3MA/28A/2wA/2gA/2QA/2AA/10A/1kA/1UA/1IA/04A/0oA/0cA/0MA/z8A/zsA/zgA/zQA/zAA/y0A/ykA/yUA/yIA/x4A/xoA/xYA/xMA+g8A9gsA8QgA7QQA6AAA5AAA3wAA2gAA1gAA0QAAzQAAyAAAxAAAvwAAuwAAtgAAsgAArQAAqAAApAAAnwAAmwAAlgAAkgAAjQAAiQAAhAAAgAAA',
  coolwarm: 'O0zAPE7CPVDDPlHFP1PGQFXIQlfJQ1jLRFrMRVzORl7PSF/RSWHSSmPTS2TVTGbWTmjYT2nZUGvaUW3bU27dVHDeVXLfVnPgWHXhWXfjWnjkW3rlXXzmXn3nX3/oYYDpYoLqY4TrZIXsZoftZ4juaIrvaovva43wbI/xbpDyb5LzcJPzcpX0c5b1dZf2dpn2d5r3eZz4ep34e5/5faD5fqH6gKP6gaT7gqb7hKf8haj8hqn8iKv9iaz9i639jK/+jbD+j7H+kLL+krT+k7X+lLb/lrf/l7j/mLn/mrv/m7z/nb3/nr7/n7//ocD/osH/o8L+pcP+psT+p8X+qcb9qsf9q8j9rcn9rsn8r8r8scv8ssz7s837tc36ts76t8/5udD5utD4u9H4vNL3vtL2v9P2wNT1wdT0w9X0xNXzxdbyxtbxx9fwydfwytjvy9juzNntzdnsztrrz9rq0drp0tvo09vn1Nvm1dvl1tzk19zj2Nzi2dzh2tzg29ze3N3d3dzc3tzb39vZ4NvY4drW4trV49nT5NnS5djR5tfP59fO6NbM6dXL6tXJ6tTI69PG7NPF7dLD7dHC7tDA78+/78698M278c268cy48su38sq18sm088iy88ex9Mav9MWt9cSs9cKq9cGp9cCn9r+m9r6k9r2i97yh97qf97me97ic97eb97WZ97SX97OW97GU97CT96+R962Q96yO96qM96mL96iJ96aI9qWG9qOF9qKD9aCB9Z+A9Z1+9Zx99Jp79Jh685d485V385R18pJ08pBy8Y9x8Y1v8Itu8Ips74hr7oZp7oRo7YNm7IFl7H9j631i6ntg6Xpf6Xhd6HZc53Rb5nJZ5XBY5G5W42xV42tU4mlS4WdR4GVP32NO3mFN3V9L3F1K2lpJ2VhH2FZG11RF1lJE1VBC1E5B0ktA0Uk/0Ec9z0U8zUI7zEA6yz44yjs3yDg2xzY1xTM0xDAywy4xwSswwCgvviQuvR8tuxssuhYruBIqtw0otQkntAQm',
  hot: 'CwAADQAAEAAAEgAAFQAAGAAAGgAAHQAAIAAAIgAAJQAAJwAAKgAALQAALwAAMgAANQAANwAAOgAAPAAAPwAAQgAARAAARwAASgAATAAATwAAUQAAVAAAVwAAWQAAXAAAXwAAYQAAZAAAZgAAaQAAbAAAbgAAcQAAdAAAdgAAeQAAewAAfgAAgQAAgwAAhgAAiQAAiwAAjgAAkAAAkwAAlgAAmAAAmwAAngAAoAAAowAApQAAqAAAqwAArQAAsAAAswAAtQAAuAAAugAAvQAAwAAAwgAAxQAAyAAAygAAzQAAzwAA0gAA1QAA1wAA2gAA3QAA3wAA4gAA5AAA5wAA6gAA7AAA7wAA8gAA9AAA9wAA+QAA/AAA/wAA/wIA/wUA/wgA/woA/w0A/xAA/xIA/xUA/xcA/xoA/x0A/x8A/yIA/yUA/ycA/yoA/ywA/y8A/zIA/zQA/zcA/zoA/zwA/z8A/0EA/0QA/0cA/0kA/0wA/08A/1EA/1QA/1YA/1kA/1wA/14A/2EA/2QA/2YA/2kA/2sA/24A/3EA/3MA/3YA/3kA/3sA/34A/4AA/4MA/4YA/4gA/4sA/44A/5AA/5MA/5UA/5gA/5sA/50A/6AA/6IA/6UA/6gA/6oA/60A/7AA/7IA/7UA/7cA/7oA/70A/78A/8IA/8UA/8cA/8oA/8wA/88A/9IA/9QA/9cA/9oA/9wA/98A/+EA/+QA/+cA/+kA/+wA/+8A//EA//QA//YA//kA//wA//4A//8D//8H//8L//8P//8T//8X//8b//8f//8i//8m//8q//8u//8y//82//86//8+//9C//9G//9K//9O//9S//9W//9a//9e//9h//9l//9p//9t//9x//91//95//99//+B//+F//+J//+N//+R//+V//+Z//+d//+g//+k//+o//+s//+w//+0//+4//+8///A///E///I///M///Q///U///Y///c///f///j///n///r///v///z///3///7////',
  gray: 'AAAAAQEBAgICAwMDBAQEBQUFBgYGBwcHCAgICQkJCgoKCwsLDAwMDQ0NDg4ODw8PEBAQEREREhISExMTFBQUFRUVFhYWFxcXGBgYGRkZGhoaGxsbHBwcHR0dHh4eHx8fICAgISEhIiIiIyMjJCQkJSUlJiYmJycnKCgoKSkpKioqKysrLCwsLS0tLi4uLy8vMDAwMTExMjIyMzMzNDQ0NTU1NjY2Nzc3ODg4OTk5Ojo6Ozs7PDw8PT09Pj4+Pz8/QEBAQUFBQkJCQ0NDRERERUVFRkZGR0dHSEhISUlJSkpKS0tLTExMTU1NTk5OT09PUFBQUVFRUlJSU1NTVFRUVVVVVlZWV1dXWFhYWVlZWlpaW1tbXFxcXV1dXl5eX19fYGBgYWFhYmJiY2NjZGRkZWVlZmZmZ2dnaGhoaWlpampqa2trbGxsbW1tbm5ub29vcHBwcXFxcnJyc3NzdHR0dXV1dnZ2d3d3eHh4eXl5enp6e3t7fHx8fX19fn5+f39/gICAgYGBgoKCg4ODhISEhYWFhoaGh4eHiIiIiYmJioqKi4uLjIyMjY2Njo6Oj4+PkJCQkZGRkpKSk5OTlJSUlZWVlpaWl5eXmJiYmZmZmpqam5ubnJycnZ2dnp6en5+foKCgoaGhoqKio6OjpKSkpaWlpqamp6enqKioqampqqqqq6urrKysra2trq6ur6+vsLCwsbGxsrKys7OztLS0tbW1tra2t7e3uLi4ubm5urq6u7u7vLy8vb29vr6+v7+/wMDAwcHBwsLCw8PDxMTExcXFxsbGx8fHyMjIycnJysrKy8vLzMzMzc3Nzs7Oz8/P0NDQ0dHR0tLS09PT1NTU1dXV1tbW19fX2NjY2dnZ2tra29vb3Nzc3d3d3t7e39/f4ODg4eHh4uLi4+Pj5OTk5eXl5ubm5+fn6Ojo6enp6urq6+vr7Ozs7e3t7u7u7+/v8PDw8fHx8vLy8/Pz9PT09fX19vb29/f3+Pj4+fn5+vr6+/v7/Pz8/f39/v7+////',
};
const CMAPS = [['viridis', 'Viridis'], ['inferno', 'Inferno'], ['plasma', 'Plasma'], ['turbo', 'Turbo'], ['jet', 'Jet'], ['coolwarm', 'Cool–warm'], ['hot', 'Hot'], ['gray', 'Gray']];
const LUTS = {};
function lutOf(id, rev) {
  const key = id + (rev ? '_r' : '');
  if (LUTS[key]) return LUTS[key];
  const s = atob(CMAP_B64[id] || CMAP_B64.viridis), u = new Uint8Array(768);
  for (let i = 0; i < 256; i++) { const j = rev ? 255 - i : i; for (let c = 0; c < 3; c++) u[3 * i + c] = s.charCodeAt(3 * j + c); }
  return (LUTS[key] = u);
}
const lutCss = (id, rev) => {
  const u = lutOf(id, rev), st = [];
  for (let i = 0; i <= 16; i++) { const k = Math.min(255, i * 16); st.push(`rgb(${u[3 * k]},${u[3 * k + 1]},${u[3 * k + 2]}) ${(i / 16 * 100).toFixed(1)}%`); }
  return `linear-gradient(90deg, ${st.join(', ')})`;
};
const hex = c => '#' + c.map(x => x.toString(16).padStart(2, '0')).join('');
const unhex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const NAN_RGB = [110, 110, 110];                 // giá trị NaN / ô không có dữ liệu

/* mảng số nguyên tự giãn */
class Grow {
  constructor(TA = Uint32Array, cap = 4096) { this.TA = TA; this.a = new TA(cap); this.n = 0; }
  room(k) { if (this.n + k > this.a.length) { const b = new this.TA(Math.max(this.a.length * 2, this.n + k)); b.set(this.a); this.a = b; } }
  push(v) { this.room(1); this.a[this.n++] = v; }
  push2(a, b) { this.room(2); this.a[this.n++] = a; this.a[this.n++] = b; }
  push3(a, b, c) { this.room(3); this.a[this.n++] = a; this.a[this.n++] = b; this.a[this.n++] = c; }
  arr() { return this.a.slice(0, this.n); }
}

/* ---------------- 2. đọc file ---------------- */
async function gunzipIfNeeded(b) {
  if (b[0] !== 0x1f || b[1] !== 0x8b) return b;
  if (!('DecompressionStream' in window)) throw new Error('Trình duyệt quá cũ: không giải nén được .gz. Hãy dùng Chrome, Edge, Firefox hoặc Safari bản mới.');
  const st = new Blob([b]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(st).arrayBuffer());
}
const GET = {
  i8: (v, o) => v.getInt8(o), u8: (v, o) => v.getUint8(o), i16: (v, o, le) => v.getInt16(o, le), u16: (v, o, le) => v.getUint16(o, le),
  i32: (v, o, le) => v.getInt32(o, le), u32: (v, o, le) => v.getUint32(o, le), f32: (v, o, le) => v.getFloat32(o, le), f64: (v, o, le) => v.getFloat64(o, le),
  i64: (v, o, le) => Number(v.getBigInt64(o, le)), u64: (v, o, le) => Number(v.getBigUint64(o, le)),
};
const TY = {   // [số byte, typed array chứa kết quả, hàm đọc]
  i8: [1, Int8Array, GET.i8], u8: [1, Uint8Array, GET.u8], i16: [2, Int16Array, GET.i16], u16: [2, Uint16Array, GET.u16],
  i32: [4, Int32Array, GET.i32], u32: [4, Uint32Array, GET.u32], f32: [4, Float32Array, GET.f32], f64: [8, Float64Array, GET.f64],
  i64: [8, Float64Array, GET.i64], u64: [8, Float64Array, GET.u64],
};
const VTK_T = {
  bit: null, char: 'i8', signed_char: 'i8', unsigned_char: 'u8', short: 'i16', unsigned_short: 'u16', int: 'i32', unsigned_int: 'u32',
  long: 'i64', unsigned_long: 'u64', vtkidtype: 'i32', float: 'f32', double: 'f64',
  vtktypeint8: 'i8', vtktypeuint8: 'u8', vtktypeint16: 'i16', vtktypeuint16: 'u16', vtktypeint32: 'i32', vtktypeuint32: 'u32',
  vtktypeint64: 'i64', vtktypeuint64: 'u64', vtktypefloat32: 'f32', vtktypefloat64: 'f64',
};
const PLY_T = {
  char: 'i8', int8: 'i8', uchar: 'u8', uint8: 'u8', short: 'i16', int16: 'i16', ushort: 'u16', uint16: 'u16',
  int: 'i32', int32: 'i32', uint: 'u32', uint32: 'u32', float: 'f32', float32: 'f32', double: 'f64', float64: 'f64',
};
const vtkType = t => {
  const k = VTK_T[String(t || '').toLowerCase()];
  if (!k) throw new Error(/string|variant/i.test(t) ? `Mảng chuỗi (kiểu "${t}") chưa hỗ trợ.` : `Kiểu dữ liệu VTK "${t}" chưa hỗ trợ.`);
  return k;
};
const plyType = t => { const k = PLY_T[String(t || '').toLowerCase()]; if (!k) throw new Error(`Kiểu dữ liệu PLY "${t}" chưa hỗ trợ.`); return k; };
const EOF = () => new Error('File kết thúc sớm: ngắn hơn số phần tử khai báo trong header.');

/* đọc tuần tự trên mảng byte: dòng chữ (từ khóa) và số (chữ hoặc nhị phân) */
function byteReader(b) {
  const L = b.length, dv = new DataView(b.buffer, b.byteOffset, L);
  const R = { p: 0, binary: false, le: false, dv };
  R.rawLine = () => {
    if (R.p >= L) return null;
    let e = b.indexOf(10, R.p); if (e < 0) e = L;
    const s = latin(b.subarray(R.p, Math.min(e, R.p + 65536))); R.p = e + 1;
    return s.replace(/\r$/, '');
  };
  /* dòng có chữ kế tiếp; tự bỏ khối METADATA (VTK 9) kết thúc bằng một dòng trống */
  R.line = () => {
    for (;;) {
      const s = R.rawLine(); if (s === null) return null;
      const t = s.trim(); if (!t) continue;
      if (/^METADATA$/i.test(t)) { for (;;) { const m = R.rawLine(); if (m === null || !m.trim()) break; } continue; }
      return t;
    }
  };
  R.peek = () => { const p = R.p, s = R.line(); R.p = p; return s; };
  /* một số dạng chữ */
  R.num = () => {
    let p = R.p;
    while (p < L && b[p] <= 32) p++;
    if (p >= L) throw EOF();
    const s = p; let q = p, neg = false, v = 0;
    if (b[q] === 45) { neg = true; q++; } else if (b[q] === 43) q++;
    const d0 = q;
    while (q < L && b[q] >= 48 && b[q] <= 57) { v = v * 10 + (b[q] - 48); q++; }
    if (q > d0 && (q >= L || b[q] <= 32)) { R.p = q; return neg ? -v : v; }
    while (q < L && b[q] > 32) q++;
    R.p = q;
    const t = latin(b.subarray(s, q)), x = Number(t);
    if (x === x) return x;
    const lt = t.toLowerCase();
    if (lt.includes('nan')) return NaN;
    if (lt.includes('inf')) return lt[0] === '-' ? -Infinity : Infinity;
    throw new Error(`Không đọc được số "${t.slice(0, 30)}" (vị trí byte ${s}).`);
  };
  /* n giá trị kiểu k (khóa của TY) */
  R.nums = (n, k) => {
    const [sz, TA, get] = TY[k], out = new TA(n);
    if (R.binary) {
      if (R.p + n * sz > L) throw EOF();
      for (let i = 0, o = R.p; i < n; i++, o += sz) out[i] = get(dv, o, R.le);
      R.p += n * sz;
    } else for (let i = 0; i < n; i++) out[i] = R.num();
    return out;
  };
  /* một giá trị (cho PLY: đọc xen kẽ nhiều thuộc tính) */
  R.one = k => {
    if (!R.binary) return R.num();
    const [sz, , get] = TY[k];
    if (R.p + sz > L) throw EOF();
    const v = get(dv, R.p, R.le); R.p += sz; return v;
  };
  return R;
}
const toF32 = a => (a instanceof Float32Array ? a : Float32Array.from(a));
const decName = s => String(s || '').replace(/%([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
const spaceOf = s => { const m = /SPACE\s*=\s*(RAS|LPS)/i.exec(s || ''); return m ? m[1].toUpperCase() : null; };

/* ô (cells) đọc về một dạng chung: { n, start, cnt, ids } */
function readCells(R, t) {
  const a = +t[1], sz = +t[2];
  const nx = R.peek();
  if (nx && /^OFFSETS\b/i.test(nx)) {                          // VTK 5.1: a = số offset (= số ô + 1), sz = số chỉ số
    const ot = R.line().split(/\s+/)[1], off = R.nums(a, vtkType(ot));
    const cl = R.line() || ''; if (!/^CONNECTIVITY\b/i.test(cl)) throw new Error('VTK 5.1: thiếu khối CONNECTIVITY sau OFFSETS.');
    const ids = R.nums(sz, vtkType(cl.split(/\s+/)[1])), n = Math.max(0, a - 1);
    const start = new Float64Array(n), cnt = new Uint32Array(n);
    for (let i = 0; i < n; i++) { start[i] = off[i]; cnt[i] = off[i + 1] - off[i]; }
    return { n, start, cnt, ids };
  }
  const ids = R.nums(sz, 'i32'), start = new Float64Array(a), cnt = new Uint32Array(a);   // kiểu cũ: k i1 … ik
  let q = 0;
  for (let i = 0; i < a; i++) {
    const k = ids[q]; if (!(k >= 0) || q + k >= sz) throw new Error('Danh sách ô VTK bị hỏng (số đỉnh vượt kích thước khai báo).');
    start[i] = q + 1; cnt[i] = k; q += k + 1;
  }
  return { n: a, start, cnt, ids };
}

function parseVtk(b, name) {
  const head = latin(b.subarray(0, Math.min(b.length, 400)));
  if (/^\s*<\?xml|<VTKFile/i.test(head)) throw new Error(`${name} là VTK dạng XML (.vtp / .vtu). Trang này đọc VTK legacy (.vtk): trong 3D Slicer hoặc ParaView hãy lưu lại thành .vtk.`);
  const R = byteReader(b);
  const l1 = R.rawLine() || '', m = /#\s*vtk\s+DataFile\s+Version\s+([\d.]+)/i.exec(l1);
  if (!m) throw new Error(`${name} không phải file VTK legacy (dòng đầu phải là "# vtk DataFile Version …").`);
  const title = (R.rawLine() || '').trim(), enc = (R.line() || '').toUpperCase();
  if (enc !== 'ASCII' && enc !== 'BINARY') throw new Error(`${name}: dòng thứ ba phải là ASCII hoặc BINARY.`);
  R.binary = enc === 'BINARY'; R.le = false;                   // VTK legacy nhị phân luôn big-endian
  const dl = R.line() || '', dm = /^DATASET\s+(\S+)/i.exec(dl);
  if (!dm) throw new Error(`${name}: thiếu dòng DATASET.`);
  const ds = dm[1].toUpperCase();
  if (ds === 'STRUCTURED_POINTS' || ds === 'RECTILINEAR_GRID') throw new Error(`${name} là ảnh voxel (${ds}), không phải lưới bề mặt. Hãy chuyển sang .nrrd / .nii rồi mở bằng trang Xem ảnh NIfTI.`);
  if (!['POLYDATA', 'UNSTRUCTURED_GRID', 'STRUCTURED_GRID'].includes(ds)) throw new Error(`${name}: kiểu dữ liệu ${ds} chưa hỗ trợ.`);
  const out = { name, format: 'VTK', version: m[1], encoding: enc, dataset: ds, title, comments: [], P: null, sec: {}, cellTypes: null, dims: null,
    pointData: [], cellData: [], fieldData: [], warn: [], space: spaceOf(title) };
  let where = null, nW = 0;
  const add = (kind, nm, nc, type, data, loc = where) => {
    const a = { name: decName(nm), kind, nc, type: String(type).toLowerCase(), data: toF32(data), loc };
    if (loc === 'point') out.pointData.push(a); else if (loc === 'cell') out.cellData.push(a); else out.fieldData.push(a);
  };
  const need = k => { if (!where) throw new Error(`${name}: gặp ${k} trước POINT_DATA / CELL_DATA.`); };
  for (;;) {
    const ln = R.line(); if (ln === null) break;
    const t = ln.split(/\s+/), K = t[0].toUpperCase();
    switch (K) {
      case 'POINTS': { const n = +t[1]; out.P = Float64Array.from(R.nums(3 * n, vtkType(t[2]))); break; }
      case 'VERTICES': case 'LINES': case 'POLYGONS': case 'TRIANGLE_STRIPS': case 'CELLS': out.sec[K] = readCells(R, t); break;
      case 'CELL_TYPES': out.cellTypes = R.nums(+t[1], 'i32'); break;
      case 'DIMENSIONS': out.dims = [+t[1], +t[2], +t[3]]; break;
      case 'POINT_DATA': case 'CELL_DATA':
        where = K === 'POINT_DATA' ? 'point' : 'cell'; nW = +t[1];
        if (where === 'point' && out.P && nW !== out.P.length / 3) out.warn.push(`POINT_DATA khai báo ${numVi(nW)} điểm, khác số điểm (${numVi(out.P.length / 3)}).`);
        break;
      case 'FIELD': {
        const na = +t[2];
        for (let i = 0; i < na; i++) {
          const al = R.line(); if (al === null) throw EOF();
          if (/^NULL_ARRAY$/i.test(al)) continue;
          const f = al.split(/\s+/), nc = +f[1], nt = +f[2], ty = vtkType(f[3]);
          const data = R.nums(nc * nt, ty);
          add('field', f[0], nc, f[3], data, where && nt === nW ? where : null);
        }
        break;
      }
      case 'SCALARS': {
        need(K); const nc = +t[3] || 1;
        const pk = R.peek(); if (pk && /^LOOKUP_TABLE\b/i.test(pk)) R.line();
        add('scalars', t[1], nc, t[2], R.nums(nW * nc, vtkType(t[2]))); break;
      }
      case 'COLOR_SCALARS': {
        need(K); const nc = +t[2] || 3;
        const d = R.binary ? R.nums(nW * nc, 'u8') : R.nums(nW * nc, 'f32');
        const f = new Float32Array(d.length); for (let i = 0; i < d.length; i++) f[i] = R.binary ? d[i] / 255 : d[i];
        add('color', t[1], nc, R.binary ? 'unsigned_char' : 'float', f); break;
      }
      case 'LOOKUP_TABLE': R.nums(+t[2] * 4, R.binary ? 'u8' : 'f32'); break;
      case 'VECTORS': case 'NORMALS': need(K); add(K === 'NORMALS' ? 'normals' : 'vectors', t[1], 3, t[2], R.nums(nW * 3, vtkType(t[2]))); break;
      case 'TEXTURE_COORDINATES': need(K); add('tcoords', t[1], +t[2], t[3], R.nums(nW * +t[2], vtkType(t[3]))); break;
      case 'TENSORS': case 'TENSORS6': { need(K); const nc = K === 'TENSORS' ? 9 : 6; add('tensors', t[1], nc, t[2], R.nums(nW * nc, vtkType(t[2]))); break; }
      case 'GLOBAL_IDS': case 'PEDIGREE_IDS': need(K); add('ids', t[1], 1, t[2], R.nums(nW, vtkType(t[2]))); break;
      default: throw new Error(`${name}: từ khóa VTK "${t[0].slice(0, 40)}" chưa hỗ trợ.`);
    }
  }
  if (!out.P) throw new Error(`${name}: không có khối POINTS.`);
  return out;
}

function parsePly(b, name) {
  const hs = latin(b.subarray(0, Math.min(b.length, 1 << 20)));
  if (!/^ply\s/.test(hs)) throw new Error(`${name} không phải file PLY (dòng đầu phải là "ply").`);
  const ei = hs.search(/end_header[ \t]*\r?\n/);
  if (ei < 0) throw new Error(`${name}: không tìm thấy dòng end_header.`);
  const lines = hs.slice(0, ei).split(/\r?\n/).slice(1), els = [], comments = [];
  let fmt = '', ver = '';
  for (const raw of lines) {
    const ln = raw.trim(); if (!ln) continue;
    const t = ln.split(/\s+/);
    if (t[0] === 'format') { fmt = t[1]; ver = t[2] || ''; }
    else if (t[0] === 'comment' || t[0] === 'obj_info') comments.push(ln.replace(/^(comment|obj_info)\s?/, ''));
    else if (t[0] === 'element') els.push({ name: t[1], count: +t[2], props: [] });
    else if (t[0] === 'property') {
      if (!els.length) throw new Error(`${name}: property đứng trước element.`);
      els[els.length - 1].props.push(t[1] === 'list' ? { list: true, c: plyType(t[2]), i: plyType(t[3]), name: t[4] } : { t: plyType(t[1]), type: t[1], name: t[2] });
    }
  }
  if (!['ascii', 'binary_little_endian', 'binary_big_endian'].includes(fmt)) throw new Error(`${name}: định dạng PLY "${fmt}" chưa hỗ trợ.`);
  const R = byteReader(b);
  R.p = hs.indexOf('\n', ei) + 1; R.binary = fmt !== 'ascii'; R.le = fmt === 'binary_little_endian';
  let V = null, F = null, E = null, Ts = null;
  const skipList = p => { const k = R.one(p.c); for (let q = 0; q < k; q++) R.one(p.i); };
  for (const el of els) {
    const nm = el.name.toLowerCase(), P = el.props, N = el.count;
    if (nm === 'vertex') {
      const cols = P.map(p => (p.list ? null : new (/^[xyz]$/.test(p.name) ? Float64Array : Float32Array)(N)));
      for (let i = 0; i < N; i++) for (let j = 0; j < P.length; j++) { const p = P[j]; if (p.list) skipList(p); else cols[j][i] = R.one(p.t); }
      V = { P, cols, N };
    } else if (nm === 'face' || nm === 'tristrips') {
      let L = P.findIndex(p => p.list && /^vertex_ind(ex|ices)$/i.test(p.name)); if (L < 0) L = P.findIndex(p => p.list);
      const cols = P.map(p => (p.list ? null : new Float32Array(N))), ids = new Grow(Int32Array), start = new Float64Array(N), cnt = new Uint32Array(N);
      for (let i = 0; i < N; i++) for (let j = 0; j < P.length; j++) {
        const p = P[j];
        if (j === L) { const k = R.one(p.c); start[i] = ids.n; cnt[i] = k; ids.room(k); for (let q = 0; q < k; q++) ids.a[ids.n++] = R.one(p.i); }
        else if (p.list) skipList(p); else cols[j][i] = R.one(p.t);
      }
      if (L < 0) throw new Error(`${name}: element ${el.name} không có danh sách đỉnh.`);
      const rec = { P, cols, N, sec: { n: N, start, cnt, ids: ids.arr() } };
      if (nm === 'face') F = rec; else Ts = rec;
    } else if (nm === 'edge') {
      const i1 = P.findIndex(p => p.name === 'vertex1'), i2 = P.findIndex(p => p.name === 'vertex2'), ids = new Int32Array(2 * N);
      for (let i = 0; i < N; i++) for (let j = 0; j < P.length; j++) {
        const p = P[j]; if (p.list) { skipList(p); continue; }
        const v = R.one(p.t); if (j === i1) ids[2 * i] = v; else if (j === i2) ids[2 * i + 1] = v;
      }
      if (i1 >= 0 && i2 >= 0) E = { n: N, start: Float64Array.from({ length: N }, (_, i) => 2 * i), cnt: new Uint32Array(N).fill(2), ids };
    } else {
      for (let i = 0; i < N; i++) for (const p of P) { if (p.list) skipList(p); else R.one(p.t); }
    }
  }
  if (!V) throw new Error(`${name}: không có element vertex.`);
  const col = n => V.P.findIndex(p => p.name === n);
  const ix = col('x'), iy = col('y'), iz = col('z');
  if (ix < 0 || iy < 0) throw new Error(`${name}: vertex thiếu tọa độ x, y.`);
  const n = V.N, Pt = new Float64Array(3 * n);
  for (let i = 0; i < n; i++) { Pt[3 * i] = V.cols[ix][i]; Pt[3 * i + 1] = V.cols[iy][i]; Pt[3 * i + 2] = iz >= 0 ? V.cols[iz][i] : 0; }
  /* thuộc tính -> mảng dữ liệu (gom nx ny nz thành pháp tuyến, red green blue thành màu) */
  const arrays = (rec, loc, skip) => {
    const out = [], used = new Set(skip), find = n => rec.P.findIndex(p => !p.list && p.name.toLowerCase() === n);
    const group = (names, kind, label) => {
      const j = names.map(find); if (j.some(x => x < 0)) return;
      const k = j.length, N = rec.N, d = new Float32Array(k * N);
      for (let c = 0; c < k; c++) { const s = rec.cols[j[c]]; for (let i = 0; i < N; i++) d[k * i + c] = s[i]; }
      if (kind === 'color') {
        let mx = 0; for (let i = 0; i < d.length; i++) if (d[i] > mx) mx = d[i];
        const intType = /int|char|short/.test(rec.P[j[0]].type || '');
        if (intType || mx > 1.0001) for (let i = 0; i < d.length; i++) d[i] /= 255;
      }
      out.push({ name: label, kind, nc: k, type: rec.P[j[0]].type, data: d, loc });
      j.forEach(x => used.add(x));
    };
    group(['nx', 'ny', 'nz'], 'normals', 'Normals');
    for (const pre of ['', 'diffuse_']) if (!out.some(a => a.kind === 'color')) group(['red', 'green', 'blue'].map(c => pre + c), 'color', 'RGB');
    rec.P.forEach((p, j) => { if (!p.list && !used.has(j)) out.push({ name: p.name, kind: 'scalars', nc: 1, type: p.type, data: rec.cols[j], loc }); });
    return out;
  };
  const sec = {};
  if (F) sec.POLYGONS = F.sec;
  if (E) sec.LINES = E;
  if (Ts) {                                                       // tristrips: -1 ngắt dải
    const ids = Ts.sec.ids, st = [], ct = [];
    for (let i = 0; i < Ts.N; i++) {
      let s = Ts.sec.start[i]; const e = s + Ts.sec.cnt[i];
      for (let q = s; q <= e; q++) if (q === e || ids[q] < 0) { if (q - s >= 3) { st.push(s); ct.push(q - s); } s = q + 1; }
    }
    sec.TRIANGLE_STRIPS = { n: st.length, start: Float64Array.from(st), cnt: Uint32Array.from(ct), ids };
  }
  const elsTxt = els.map(e => `${e.name} ${num(e.count)}`).join(', ');
  return {
    name, format: 'PLY', version: ver, encoding: fmt, dataset: F ? 'mesh' : E ? 'lines' : 'point cloud', title: '', comments, elements: elsTxt,
    P: Pt, sec, cellTypes: null, dims: null, pointData: arrays(V, 'point', [ix, iy, iz].filter(x => x >= 0)),
    cellData: F ? arrays(F, 'cell', []) : [], fieldData: [], warn: [], space: spaceOf(comments.join('\n')),
  };
}

async function readMeshFile(file) {
  const b = await gunzipIfNeeded(new Uint8Array(await file.arrayBuffer()));
  const h = latin(b.subarray(0, 64));
  try {
    if (/^ply\s/.test(h)) return parsePly(b, file.name);
    if (/^\s*#\s*vtk/i.test(h) || /^\s*<\?xml|<VTKFile/i.test(h)) return parseVtk(b, file.name);
  } catch (e) {
    if (e instanceof RangeError) throw new Error(`${file.name}: file ngắn hơn số phần tử khai báo trong header.`);
    throw e;
  }
  throw new Error(`${file.name} không phải file VTK legacy hay PLY.`);
}

/* ---------------- 3. dựng lưới ---------------- */
const CELL_NAME = { 1: 'vertex', 2: 'poly-vertex', 3: 'line', 4: 'polyline', 5: 'triangle', 6: 'triangle strip', 7: 'polygon', 8: 'pixel', 9: 'quad',
  10: 'tetra', 11: 'voxel', 12: 'hexahedron', 13: 'wedge', 14: 'pyramid', 15: 'pentagonal prism', 16: 'hexagonal prism',
  21: 'quadratic edge', 22: 'quadratic triangle', 23: 'quadratic quad', 24: 'quadratic tetra', 25: 'quadratic hexahedron', 42: 'polyhedron' };
/* mặt của ô 3D theo thứ tự điểm của VTK (bậc hai: chỉ dùng các đỉnh góc) */
const FACES = {
  10: [[0, 1, 3], [1, 2, 3], [2, 0, 3], [0, 2, 1]],
  12: [[0, 4, 7, 3], [1, 2, 6, 5], [0, 1, 5, 4], [3, 7, 6, 2], [0, 3, 2, 1], [4, 5, 6, 7]],
  11: [[0, 2, 6, 4], [1, 5, 7, 3], [0, 4, 5, 1], [2, 3, 7, 6], [0, 1, 3, 2], [4, 6, 7, 5]],
  13: [[0, 1, 2], [3, 5, 4], [0, 3, 4, 1], [1, 4, 5, 2], [2, 5, 3, 0]],
  14: [[0, 3, 2, 1], [0, 1, 4], [1, 2, 4], [2, 3, 4], [3, 0, 4]],
};
FACES[24] = FACES[10]; FACES[25] = FACES[12];
const NONE = 0xFFFFFFFF;
/* bảng băm mặt: mặt chỉ thuộc một ô là mặt ngoài */
function faceTable(cap) {
  let size = 1024; while (size < cap * 2) size *= 2;
  const mask = size - 1, keys = new Uint32Array(4 * size), cnt = new Uint8Array(size), rec = new Uint32Array(size);
  const fv = new Grow(Uint32Array, Math.max(64, cap * 4)), fc = new Grow(Uint32Array, Math.max(16, cap)), s = [0, 0, 0, 0];
  return {
    add(vs, c) {
      s[0] = vs[0]; s[1] = vs[1]; s[2] = vs[2]; s[3] = vs.length > 3 ? vs[3] : NONE;
      s.sort((a, b) => a - b);
      let h = Math.imul(s[0], 0x9E3779B1) ^ Math.imul(s[1], 0x85EBCA77) ^ Math.imul(s[2], 0xC2B2AE3D) ^ Math.imul(s[3], 0x27D4EB2F);
      h ^= h >>> 15; h = Math.imul(h, 0x2C1B3C6D); h ^= h >>> 12; h &= mask;
      while (cnt[h]) {
        const k = 4 * h;
        if (keys[k] === s[0] && keys[k + 1] === s[1] && keys[k + 2] === s[2] && keys[k + 3] === s[3]) { if (cnt[h] < 255) cnt[h]++; return; }
        h = (h + 1) & mask;
      }
      keys.set(s, 4 * h); cnt[h] = 1; rec[h] = fc.n;
      fv.push2(vs[0], vs[1]); fv.push2(vs[2], vs.length > 3 ? vs[3] : NONE); fc.push(c);
    },
    each(fn) {
      const v = fv.a, c = fc.a, q = [0, 0, 0, 0];
      for (let h = 0; h < size; h++) if (cnt[h] === 1) {
        const r = rec[h], k = 4 * r; q[0] = v[k]; q[1] = v[k + 1]; q[2] = v[k + 2]; q[3] = v[k + 3];
        fn(q[3] === NONE ? q.slice(0, 3) : q.slice(), c[r]);
      }
    },
  };
}

function buildMesh(raw) {
  const P = raw.P, n = P.length / 3;
  const tris = new Grow(), triCell = new Grow(), segs = new Grow(), segCell = new Grow(), vtx = new Grow(), vtxCell = new Grow(), wire = new Grow();
  const types = new Map(), skipped = new Map();
  let bad = 0, outer = false;
  const addT = (m, k, c = 1) => m.set(k, (m.get(k) || 0) + c);
  const used = new Uint8Array(n);                // điểm thuộc ít nhất một ô (tính theo ô gốc, cả điểm bên trong khối)
  const okIds = (ids, s, k) => {
    for (let j = 0; j < k; j++) { const v = ids[s + j]; if (!(v >= 0 && v < n)) { bad++; return false; } }
    for (let j = 0; j < k; j++) used[ids[s + j]] = 1;
    return true;
  };
  const poly = (ids, s, k, c) => {
    if (!okIds(ids, s, k)) return;
    if (k === 1) { vtx.push(ids[s]); vtxCell.push(c); return; }
    if (k === 2) { segs.push2(ids[s], ids[s + 1]); segCell.push(c); return; }
    const a = ids[s];
    for (let j = 1; j < k - 1; j++) { tris.push3(a, ids[s + j], ids[s + j + 1]); triCell.push(c); }
    for (let j = 0; j < k; j++) wire.push2(ids[s + j], ids[s + (j + 1) % k]);
  };
  const strip = (ids, s, k, c) => {
    if (k < 3 || !okIds(ids, s, k)) return;
    for (let j = 0; j < k - 2; j++) {
      const a = ids[s + j], b = ids[s + j + 1], d = ids[s + j + 2];
      if (j & 1) tris.push3(b, a, d); else tris.push3(a, b, d);
      triCell.push(c); wire.push2(a, b); wire.push2(a, d);
    }
    wire.push2(ids[s + k - 2], ids[s + k - 1]);
  };
  const pline = (ids, s, k, c) => { if (!okIds(ids, s, k)) return; for (let j = 0; j < k - 1; j++) { segs.push2(ids[s + j], ids[s + j + 1]); segCell.push(c); } };
  const verts = (ids, s, k, c) => { if (!okIds(ids, s, k)) return; for (let j = 0; j < k; j++) { vtx.push(ids[s + j]); vtxCell.push(c); } };
  const sec = raw.sec;

  if (raw.dataset === 'UNSTRUCTURED_GRID') {
    const C = sec.CELLS, T = raw.cellTypes;
    if (C) {
      if (!T || T.length < C.n) throw new Error('UNSTRUCTURED_GRID thiếu CELL_TYPES (hoặc ít hơn số ô).');
      let cap = 0; for (let i = 0; i < C.n; i++) if (FACES[T[i]]) cap += FACES[T[i]].length;
      const ft = cap ? faceTable(cap) : null, fv = [];
      for (let i = 0; i < C.n; i++) {
        const t = T[i], s = C.start[i], k = C.cnt[i], ids = C.ids;
        addT(types, CELL_NAME[t] || `type ${t}`);
        switch (t) {
          case 1: case 2: verts(ids, s, k, i); break;
          case 3: case 4: pline(ids, s, k, i); break;
          case 21: pline(ids, s, Math.min(k, 2), i); break;
          case 5: case 22: poly(ids, s, 3, i); break;
          case 6: strip(ids, s, k, i); break;
          case 7: poly(ids, s, k, i); break;
          case 8: if (okIds(ids, s, 4)) poly([ids[s], ids[s + 1], ids[s + 3], ids[s + 2]], 0, 4, i); break;
          case 9: case 23: poly(ids, s, 4, i); break;
          default:
            if (FACES[t] && k >= (t === 14 ? 5 : t === 13 ? 6 : t === 10 || t === 24 ? 4 : 8)) {
              if (!okIds(ids, s, k)) break;
              for (const f of FACES[t]) { fv.length = f.length; for (let j = 0; j < f.length; j++) fv[j] = ids[s + f[j]]; ft.add(fv, i); }
            } else addT(skipped, CELL_NAME[t] || `type ${t}`);
        }
      }
      if (ft) { ft.each((vs, c) => poly(vs, 0, vs.length, c)); outer = true; }
    }
  } else if (raw.dataset === 'STRUCTURED_GRID') {
    const d = raw.dims; if (!d || d[0] * d[1] * d[2] !== n) throw new Error('STRUCTURED_GRID: DIMENSIONS không khớp số điểm.');
    const pid = (i, j, k) => i + d[0] * (j + d[1] * k), cd = d.map(x => Math.max(1, x - 1)), cid = (i, j, k) => i + cd[0] * (j + cd[1] * k);
    const act = [0, 1, 2].filter(a => d[a] > 1);
    const face = (a, side, cs) => {               // mặt vuông góc trục a tại lớp side; ô ở lớp cs
      const [u, v] = [0, 1, 2].filter(x => x !== a), q = [0, 0, 0], r = [0, 0, 0];
      for (let y = 0; y < d[v] - 1; y++) for (let x = 0; x < d[u] - 1; x++) {
        const corner = (du, dv) => { q[a] = side; q[u] = x + du; q[v] = y + dv; return pid(q[0], q[1], q[2]); };
        r[a] = cs; r[u] = x; r[v] = y;
        const f = [corner(0, 0), corner(1, 0), corner(1, 1), corner(0, 1)];
        if ((side === 0) !== (a === 1)) f.reverse();              // pháp tuyến hướng ra ngoài ở cả hai phía
        poly(f, 0, 4, cid(r[0], r[1], r[2]));
      }
    };
    used.fill(1);
    if (act.length === 3) { for (const a of act) { face(a, 0, 0); face(a, d[a] - 1, d[a] - 2); } outer = true; addT(types, 'hexahedron', cd[0] * cd[1] * cd[2]); }
    else if (act.length === 2) { face([0, 1, 2].find(a => d[a] === 1), 0, 0); addT(types, 'quad', cd[0] * cd[1] * cd[2]); }
    else if (act.length === 1) { const ids = Array.from({ length: n }, (_, i) => i); pline(ids, 0, n, 0); addT(types, 'line', n - 1); }
  } else {                                         // POLYDATA (VTK) hoặc PLY; thứ tự ô theo vtkPolyData: điểm, đường, đa giác, dải
    let c0 = 0;
    const run = (S, fn, label) => {
      if (!S) return;
      for (let i = 0; i < S.n; i++) {
        fn(S.ids, S.start[i], S.cnt[i], c0 + i);
        if (label) addT(types, label(S.cnt[i]));
      }
      c0 += S.n;
    };
    const ply = raw.format === 'PLY';
    run(sec.VERTICES, verts, () => 'vertex');
    run(sec.LINES, pline, () => (ply ? 'edge' : 'polyline'));
    run(sec.POLYGONS, poly, k => (k === 3 ? 'triangle' : k === 4 ? 'quad' : k > 4 ? 'polygon' : k === 2 ? 'line (2-point polygon)' : 'point (1-point polygon)'));
    run(sec.TRIANGLE_STRIPS, strip, () => 'triangle strip');
  }

  /* hộp bao, tâm, tọa độ đã trừ tâm (Float64 cho số đo, Float32 cho GPU) */
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  let nonFinite = 0;
  for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) {
    const v = P[3 * i + c]; if (!Number.isFinite(v)) { nonFinite++; continue; }
    if (v < mn[c]) mn[c] = v; if (v > mx[c]) mx[c] = v;
  }
  if (!(mx[0] >= mn[0])) for (let c = 0; c < 3; c++) { mn[c] = 0; mx[c] = 0; }
  const ctr = [0, 1, 2].map(c => (mn[c] + mx[c]) / 2), size = [0, 1, 2].map(c => mx[c] - mn[c]);
  const Pd = new Float64Array(3 * n), Pf = new Float32Array(3 * n);
  for (let i = 0; i < 3 * n; i++) { const v = Number.isFinite(P[i]) ? P[i] - ctr[i % 3] : 0; Pd[i] = v; Pf[i] = v; }
  const rad = Math.hypot(...size) / 2 || Math.max(...size.map(Math.abs)) || 1;

  const T = tris.arr(), S2 = segs.arr(), Vx = vtx.arr();
  const M = {
    raw, n, Pf, tris: T, triCell: triCell.arr(), segs: S2, segCell: segCell.arr(), vtx: Vx, vtxCell: vtxCell.arr(),
    types, skipped, bad, outer, nonFinite, bbox: { min: mn, max: mx, size, center: ctr }, rad,
    pointCloud: !T.length && !S2.length && !Vx.length,
  };
  /* điểm không thuộc ô nào */
  let u = 0; for (let i = 0; i < n; i++) u += used[i];
  M.unused = M.pointCloud ? 0 : n - u;

  /* pháp tuyến tại đỉnh: lấy từ file nếu có, không thì cộng pháp tuyến mặt (trọng số theo diện tích) */
  const fileN = raw.pointData.find(a => a.kind === 'normals' && a.nc === 3 && a.data.length === 3 * n);
  M.fileNormals = !!fileN;
  if (fileN) M.N = fileN.data;
  else if (T.length) {
    const N = new Float32Array(3 * n);
    for (let t = 0; t < T.length; t += 3) {
      const a = 3 * T[t], b = 3 * T[t + 1], c = 3 * T[t + 2];
      const ux = Pd[b] - Pd[a], uy = Pd[b + 1] - Pd[a + 1], uz = Pd[b + 2] - Pd[a + 2], vx = Pd[c] - Pd[a], vy = Pd[c + 1] - Pd[a + 1], vz = Pd[c + 2] - Pd[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      N[a] += nx; N[a + 1] += ny; N[a + 2] += nz; N[b] += nx; N[b + 1] += ny; N[b + 2] += nz; N[c] += nx; N[c + 1] += ny; N[c + 2] += nz;
    }
    for (let i = 0; i < N.length; i += 3) { const l = Math.hypot(N[i], N[i + 1], N[i + 2]); if (l) { N[i] /= l; N[i + 1] /= l; N[i + 2] /= l; } }
    M.N = N;
  } else M.N = null;

  /* khung dây: cạnh của đa giác gốc (không có đường chéo khi tam giác hóa), bỏ trùng */
  const W = wire.arr();
  if (W.length && n * n < 2 ** 52) {
    const K = new Float64Array(W.length / 2);
    for (let i = 0; i < K.length; i++) { const a = W[2 * i], b = W[2 * i + 1]; K[i] = a < b ? a * n + b : b * n + a; }
    K.sort();
    const out = new Uint32Array(W.length); let m = 0;
    for (let i = 0; i < K.length; i++) if (i === 0 || K[i] !== K[i - 1]) { const a = Math.floor(K[i] / n); out[m++] = a; out[m++] = K[i] - a * n; }
    M.wire = out.slice(0, m);
  } else M.wire = W;

  measure(M, Pd);
  M.arrays = [...raw.pointData, ...raw.cellData];
  [...M.arrays, ...raw.fieldData].forEach(a => {
    a.count = Math.floor(a.data.length / a.nc);
    let lo = Infinity, hi = -Infinity, nan = 0;
    for (let i = 0; i < a.count; i++) {
      if (a.kind === 'color') {                         // màu: khoảng chung của các kênh (0..1)
        for (let c = 0; c < a.nc; c++) { const x = a.data[a.nc * i + c]; if (x < lo) lo = x; if (x > hi) hi = x; }
        continue;
      }
      let v;
      if (a.nc === 1) v = a.data[i];
      else { let s = 0; for (let c = 0; c < a.nc; c++) s += a.data[a.nc * i + c] ** 2; v = Math.sqrt(s); }
      if (!Number.isFinite(v)) { nan++; continue; }
      if (v < lo) lo = v; if (v > hi) hi = v;
    }
    a.range = lo <= hi ? [lo, hi] : [NaN, NaN]; a.nan = nan;
  });
  return M;
}

/* diện tích, thể tích, cạnh hở / không đa tạp / ngược chiều, số mảnh, đặc trưng Euler */
function measure(M, Pd) {
  const T = M.tris, n = M.n, nT = T.length / 3;
  M.topo = null; M.area = 0; M.volume = NaN;
  if (!nT) return;
  let area = 0, vol = 0, degen = 0, F = 0;
  const parent = new Int32Array(n); for (let i = 0; i < n; i++) parent[i] = i;
  const find = x => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  const unite = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[a] = b; };
  const big = n * n * 2 >= 2 ** 52, keys = big ? null : new Float64Array(3 * nT);
  let k = 0;
  const used = new Uint8Array(n);
  for (let t = 0; t < 3 * nT; t += 3) {
    const a = T[t], b = T[t + 1], c = T[t + 2];
    if (a === b || b === c || a === c) { degen++; continue; }
    F++;
    const A = 3 * a, B = 3 * b, C = 3 * c;
    const ux = Pd[B] - Pd[A], uy = Pd[B + 1] - Pd[A + 1], uz = Pd[B + 2] - Pd[A + 2], vx = Pd[C] - Pd[A], vy = Pd[C + 1] - Pd[A + 1], vz = Pd[C + 2] - Pd[A + 2];
    area += Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
    vol += (Pd[A] * (Pd[B + 1] * Pd[C + 2] - Pd[B + 2] * Pd[C + 1]) - Pd[A + 1] * (Pd[B] * Pd[C + 2] - Pd[B + 2] * Pd[C]) + Pd[A + 2] * (Pd[B] * Pd[C + 1] - Pd[B + 1] * Pd[C])) / 6;
    unite(a, b); unite(b, c); used[a] = used[b] = used[c] = 1;
    if (keys) for (const [u, v] of [[a, b], [b, c], [c, a]]) keys[k++] = (u < v ? u * n + v : v * n + u) * 2 + (u < v ? 0 : 1);
  }
  let C = 0, Vu = 0; for (let i = 0; i < n; i++) if (used[i]) { Vu++; if (find(i) === i) C++; }
  M.area = area; M.degen = degen;
  const topo = { components: C, faces: F, verts: Vu, measured: !!keys };
  if (keys) {
    const K = keys.subarray(0, k); K.sort();
    let E = 0, bnd = 0, nm = 0, inc = 0;
    for (let i = 0; i < K.length;) {
      const base = Math.floor(K[i] / 2); let n0 = 0, n1 = 0;
      while (i < K.length && Math.floor(K[i] / 2) === base) { if (K[i] % 2) n1++; else n0++; i++; }
      E++; const c = n0 + n1;
      if (c === 1) bnd++; else if (c > 2) nm++; else if (n0 !== 1) inc++;
    }
    Object.assign(topo, { edges: E, boundary: bnd, nonManifold: nm, flipped: inc, euler: Vu - E + F });
    topo.closed = bnd === 0 && nm === 0;
    if (topo.closed) topo.genus = (2 * C - topo.euler) / 2;
    if (topo.closed && inc === 0) M.volume = Math.abs(vol);
  }
  M.topo = topo;
}

/* ---------------- 4. tô màu ---------------- */
/* các lựa chọn "Tô màu theo" */
function colorOptions(M) {
  const o = [{ id: 'solid', label: 'Màu đơn' }];
  for (const a of M.arrays) {
    if (a.kind === 'normals' || a.kind === 'tcoords') continue;
    const where = a.loc === 'point' ? 'điểm' : 'ô';
    if (a.kind === 'color' || (a.type === 'unsigned_char' && (a.nc === 3 || a.nc === 4))) o.push({ a, mode: 'rgb', label: `${a.name} (màu gốc, ${where})` });
    if (a.kind === 'color') continue;
    if (a.nc === 1) o.push({ a, mode: 0, label: `${a.name} (${where})` });
    else {
      o.push({ a, mode: 'mag', label: `${a.name} |độ lớn| (${where})` });
      if (a.nc <= 4) for (let c = 0; c < a.nc; c++) o.push({ a, mode: c, label: `${a.name} [${'xyzw'[c]}] (${where})` });
    }
  }
  return o;
}
/* giá trị vô hướng theo lựa chọn src (một số mỗi điểm / ô) */
function scalarOf(src) {
  const a = src.a, n = a.count, out = new Float32Array(n);
  if (a.nc === 1) out.set(a.data.subarray(0, n));
  else if (src.mode === 'mag') for (let i = 0; i < n; i++) { let s = 0; for (let c = 0; c < a.nc; c++) s += a.data[a.nc * i + c] ** 2; out[i] = Math.sqrt(s); }
  else for (let i = 0; i < n; i++) out[i] = a.data[a.nc * i + src.mode];
  return out;
}
function autoRange(vals) {
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < vals.length; i++) { const v = vals[i]; if (Number.isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; } }
  if (!(lo <= hi)) return [0, 1];
  if (lo === hi) return [lo - 0.5, hi + 0.5];
  return [lo, hi];
}
/* src -> Uint8Array RGB cho m phần tử (điểm hoặc ô) */
function colorize(src, m) {
  const out = new Uint8Array(3 * m);
  if (src.id === 'solid') { for (let i = 0; i < m; i++) out.set(S.solid, 3 * i); return out; }
  const a = src.a;
  if (src.mode === 'rgb') {
    const k = a.kind === 'color' ? 255 : 1;
    for (let i = 0; i < m; i++) {
      if (i >= a.count) { out.set(NAN_RGB, 3 * i); continue; }
      for (let c = 0; c < 3; c++) { const v = a.data[a.nc * i + Math.min(c, a.nc - 1)] * k; out[3 * i + c] = v > 0 ? (v < 255 ? Math.round(v) : 255) : 0; }
    }
    return out;
  }
  const v = S.vals, lut = lutOf(S.cmap, S.rev), lo = S.lo, inv = S.hi > S.lo ? 255 / (S.hi - S.lo) : 0;
  for (let i = 0; i < m; i++) {
    const x = i < v.length ? v[i] : NaN;
    if (!Number.isFinite(x)) { out.set(NAN_RGB, 3 * i); continue; }
    let q = (x - lo) * inv; q = q > 0 ? (q < 255 ? (q + 0.5) | 0 : 255) : 0;
    out[3 * i] = lut[3 * q]; out[3 * i + 1] = lut[3 * q + 1]; out[3 * i + 2] = lut[3 * q + 2];
  }
  return out;
}
/* màu tại điểm: dữ liệu ô thì lấy trung bình màu các ô quanh điểm (cho khung dây, điểm, đường) */
function pointColors() {
  const M = S.M, src = S.src;
  if (src.id === 'solid' || src.a.loc === 'point') return colorize(src, M.n);
  const cc = S.cellRGB, acc = new Float32Array(3 * M.n), cnt = new Uint32Array(M.n);
  const spread = (ids, cells, per) => {
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i], k = 3 * c, ok = k + 2 < cc.length;
      for (let j = 0; j < per; j++) {
        const p = ids[per * i + j];
        acc[3 * p] += ok ? cc[k] : NAN_RGB[0]; acc[3 * p + 1] += ok ? cc[k + 1] : NAN_RGB[1]; acc[3 * p + 2] += ok ? cc[k + 2] : NAN_RGB[2]; cnt[p]++;
      }
    }
  };
  spread(M.tris, M.triCell, 3); spread(M.segs, M.segCell, 2); spread(M.vtx, M.vtxCell, 1);
  const out = new Uint8Array(3 * M.n);
  for (let i = 0; i < M.n; i++) for (let c = 0; c < 3; c++) out[3 * i + c] = cnt[i] ? Math.round(acc[3 * i + c] / cnt[i]) : NAN_RGB[c];
  return out;
}

/* ---------------- 5. WebGL ---------------- */
const FOV = 30 * Math.PI / 180;
const VS = `attribute vec3 aP; attribute vec3 aN; attribute vec3 aC;
uniform mat4 uMV; uniform mat4 uPr; uniform mat3 uNm; uniform vec3 uFlip; uniform float uPs;
varying vec3 vN; varying vec3 vC; varying vec3 vV;
void main(){ vec4 p = uMV * vec4(aP * uFlip, 1.0); vV = p.xyz; vN = uNm * (aN * uFlip); vC = aC; gl_Position = uPr * p; gl_PointSize = uPs; }`;
const FS = `precision mediump float; varying vec3 vN; varying vec3 vC; varying vec3 vV;
uniform float uLit; uniform float uOrtho; uniform float uRound;
void main(){
  if (uRound > 0.5) { vec2 d = gl_PointCoord - 0.5; if (dot(d, d) > 0.25) discard; }
  float ln = length(vN);
  if (uLit < 0.5 || ln < 1e-6) { gl_FragColor = vec4(vC, 1.0); return; }
  vec3 n = vN / ln; vec3 v = uOrtho > 0.5 ? vec3(0.0, 0.0, 1.0) : normalize(-vV); if (dot(n, v) < 0.0) n = -n;
  vec3 l = normalize(vec3(0.35, 0.5, 1.0)); float d = max(dot(n, l), 0.0);
  float s = pow(max(dot(n, normalize(l + v)), 0.0), 36.0);
  gl_FragColor = vec4(vC * (0.28 + 0.72 * d) + 0.14 * s, 1.0); }`;
let gl = null, prog = null, uint32 = false, maxDim = 4096;
const U = {}, A = {}, B = {}, G = { nTri: 0, nWire: 0, nSeg: 0, nVtx: 0, nPts: 0, nFlat: 0, flat: false, idx: 0 };
let fbo = null;
function initGL(canvas) {
  gl = canvas.getContext('webgl2', { antialias: true }) || canvas.getContext('webgl', { antialias: true });
  if (!gl) return false;
  uint32 = (typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext) || !!gl.getExtension('OES_element_index_uint');
  const sh = (t, src) => { const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  prog = gl.createProgram(); gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  gl.useProgram(prog);
  ['aP', 'aN', 'aC'].forEach(k => (A[k] = gl.getAttribLocation(prog, k)));
  ['uMV', 'uPr', 'uNm', 'uFlip', 'uPs', 'uLit', 'uOrtho', 'uRound'].forEach(k => (U[k] = gl.getUniformLocation(prog, k)));
  ['pos', 'nrm', 'col', 'tri', 'wire', 'seg', 'vtx', 'fpos', 'fnrm', 'fcol'].forEach(k => (B[k] = gl.createBuffer()));
  const v = gl.getParameter(gl.MAX_VIEWPORT_DIMS);
  maxDim = Math.min(gl.getParameter(gl.MAX_RENDERBUFFER_SIZE), gl.getParameter(gl.MAX_TEXTURE_SIZE), v[0], v[1], 8192);
  gl.enable(gl.DEPTH_TEST);
  return true;
}
const putArr = (b, data) => { gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW); };
const putIdx = (b, data) => { gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, G.idx === gl.UNSIGNED_INT ? data : new Uint16Array(data), gl.STATIC_DRAW); };
function uploadGeometry(M) {
  if (M.n > 65535 && !uint32 && !M.pointCloud) throw new Error('Trình duyệt không vẽ được lưới hơn 65 535 điểm (thiếu WebGL2 / OES_element_index_uint).');
  G.idx = M.n > 65535 ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
  putArr(B.pos, M.Pf); putArr(B.nrm, M.N || new Float32Array(3 * M.n));
  putIdx(B.tri, M.tris); putIdx(B.wire, M.wire); putIdx(B.seg, M.segs); putIdx(B.vtx, M.vtx);
  G.nTri = M.tris.length; G.nWire = M.wire.length; G.nSeg = M.segs.length; G.nVtx = M.vtx.length; G.nPts = M.n;
}
/* màu (và bản tam giác tách rời khi đổ bóng phẳng hoặc tô theo ô) */
function uploadColors() {
  const M = S.M, src = S.src;
  S.cellRGB = src.id !== 'solid' && src.a.loc === 'cell' ? colorize(src, src.a.count) : null;
  const pc = pointColors(); S.ptRGB = pc;
  putArr(B.col, pc);
  G.flat = !!M.tris.length && !!S.cellRGB;                       // tô theo ô: tam giác tách rời để mỗi ô một màu
  if (!G.flat) { G.nFlat = 0; putArr(B.fpos, new Float32Array(3)); return; }
  const T = M.tris, nT = T.length / 3, P = M.Pf, N = M.N, cc = S.cellRGB, flat = false;
  const pos = new Float32Array(9 * nT), nrm = new Float32Array(9 * nT), col = new Uint8Array(9 * nT);
  for (let t = 0; t < nT; t++) {
    const a = 3 * T[3 * t], b = 3 * T[3 * t + 1], c = 3 * T[3 * t + 2], o = 9 * t;
    pos[o] = P[a]; pos[o + 1] = P[a + 1]; pos[o + 2] = P[a + 2]; pos[o + 3] = P[b]; pos[o + 4] = P[b + 1]; pos[o + 5] = P[b + 2]; pos[o + 6] = P[c]; pos[o + 7] = P[c + 1]; pos[o + 8] = P[c + 2];
    if (flat || !N) {
      const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      for (let j = 0; j < 9; j += 3) { nrm[o + j] = nx; nrm[o + j + 1] = ny; nrm[o + j + 2] = nz; }
    } else for (let j = 0; j < 3; j++) { nrm[o + j] = N[a + j]; nrm[o + 3 + j] = N[b + j]; nrm[o + 6 + j] = N[c + j]; }
    if (cc) {
      const k = 3 * M.triCell[t], ok = k + 2 < cc.length;
      for (let j = 0; j < 9; j += 3) for (let q = 0; q < 3; q++) col[o + j + q] = ok ? cc[k + q] : NAN_RGB[q];
    } else for (let q = 0; q < 3; q++) { col[o + q] = pc[a + q]; col[o + 3 + q] = pc[b + q]; col[o + 6 + q] = pc[c + q]; }
  }
  putArr(B.fpos, pos); putArr(B.fnrm, nrm); putArr(B.fcol, col); G.nFlat = 3 * nT;
}
function bindSet(p, n, c) {
  gl.bindBuffer(gl.ARRAY_BUFFER, p); gl.enableVertexAttribArray(A.aP); gl.vertexAttribPointer(A.aP, 3, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, n); gl.enableVertexAttribArray(A.aN); gl.vertexAttribPointer(A.aN, 3, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, c); gl.enableVertexAttribArray(A.aC); gl.vertexAttribPointer(A.aC, 3, gl.UNSIGNED_BYTE, true, 0, 0);
}
/* ma trận (cột trước như WebGL). R: 3x3 theo hàng = trục phải, trục lên, trục hướng về người xem (tọa độ hiển thị) */
const mvOf = (R, t) => new Float32Array([R[0], R[3], R[6], 0, R[1], R[4], R[7], 0, R[2], R[5], R[8], 0, t[0], t[1], t[2], 1]);
const nmOf = R => new Float32Array([R[0], R[3], R[6], R[1], R[4], R[7], R[2], R[5], R[8]]);
function persp(a, n, f) { const k = 1 / Math.tan(FOV / 2); return new Float32Array([k / a, 0, 0, 0, 0, k, 0, 0, 0, 0, (f + n) / (n - f), -1, 0, 0, 2 * f * n / (n - f), 0]); }
function orthoM(hw, hh, n, f) { return new Float32Array([1 / hw, 0, 0, 0, 0, 1 / hh, 0, 0, 0, 0, -2 / (f - n), 0, 0, 0, -(f + n) / (f - n), 1]); }
/* cam: { R, pan, dist } (phối cảnh) hoặc { R, hw, hh } (song song). o: { bg: [r,g,b] 0..1, ps: cỡ điểm (px thật) } */
function drawScene(W, H, cam, o) {
  const M = S.M, rad = M.rad;
  gl.viewport(0, 0, W, H); gl.clearColor(o.bg[0], o.bg[1], o.bg[2], 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  let mv, pr;
  if (cam.hw) { const D = rad * 4; mv = mvOf(cam.R, [0, 0, -D]); pr = orthoM(cam.hw, cam.hh, D - rad * 1.5, D + rad * 1.5); }
  else {
    mv = mvOf(cam.R, [cam.pan[0], cam.pan[1], -cam.dist]);
    pr = persp(W / H, Math.max(cam.dist - rad * 1.5, cam.dist * 0.01), cam.dist + rad * 1.5);
  }
  gl.uniformMatrix4fv(U.uMV, false, mv); gl.uniformMatrix4fv(U.uPr, false, pr); gl.uniformMatrix3fv(U.uNm, false, nmOf(cam.R));
  gl.uniform3fv(U.uFlip, S.sys === 'LPS' ? [-1, -1, 1] : [1, 1, 1]); gl.uniform1f(U.uOrtho, cam.hw ? 1 : 0);
  gl.uniform1f(U.uPs, Math.max(1, o.ps)); gl.uniform1f(U.uRound, 0);
  const mode = M.pointCloud ? 'points' : S.mode;
  if (mode === 'surface' && G.nTri) {
    gl.uniform1f(U.uLit, 1);
    if (G.flat) { bindSet(B.fpos, B.fnrm, B.fcol); gl.drawArrays(gl.TRIANGLES, 0, G.nFlat); }
    else { bindSet(B.pos, B.nrm, B.col); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, B.tri); gl.drawElements(gl.TRIANGLES, G.nTri, G.idx, 0); }
  }
  bindSet(B.pos, B.nrm, B.col);
  if (mode === 'wire' && G.nWire) { gl.uniform1f(U.uLit, 0); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, B.wire); gl.drawElements(gl.LINES, G.nWire, G.idx, 0); }
  if (mode === 'points') { gl.uniform1f(U.uLit, M.N ? 1 : 0); gl.uniform1f(U.uRound, 1); gl.drawArrays(gl.POINTS, 0, G.nPts); gl.uniform1f(U.uRound, 0); }
  if (G.nSeg) { gl.uniform1f(U.uLit, 0); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, B.seg); gl.drawElements(gl.LINES, G.nSeg, G.idx, 0); }
  if (G.nVtx && mode !== 'points') { gl.uniform1f(U.uLit, 0); gl.uniform1f(U.uRound, 1); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, B.vtx); gl.drawElements(gl.POINTS, G.nVtx, G.idx, 0); gl.uniform1f(U.uRound, 0); }
}
/* vẽ vào framebuffer rồi đọc ra canvas 2D cỡ w × h; ss > 1: vẽ to hơn rồi thu nhỏ để mịn cạnh */
function renderCanvas(w, h, cam, o) {
  let W = Math.round(w * (o.ss || 1)), H = Math.round(h * (o.ss || 1));
  if (W > maxDim || H > maxDim) { const k = Math.min(maxDim / W, maxDim / H); W = Math.floor(W * k); H = Math.floor(H * k); }
  if (!fbo || fbo.w !== W || fbo.h !== H) {
    if (fbo) { gl.deleteFramebuffer(fbo.fb); gl.deleteTexture(fbo.tex); gl.deleteRenderbuffer(fbo.rb); }
    const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const rb = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, rb); gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, W, H);
    const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rb);
    fbo = { fb, tex, rb, w: W, h: H };
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo.fb);
  drawScene(W, H, cam, { bg: o.bg, ps: o.ps * W / w });
  const px = new Uint8Array(W * H * 4); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  const c = cvOf(W, H), cx = c.getContext('2d'), id = cx.createImageData(W, H), row = 4 * W;
  for (let y = 0; y < H; y++) id.data.set(px.subarray((H - 1 - y) * row, (H - y) * row), y * row);
  cx.putImageData(id, 0, 0);
  if (W === w && H === h) return c;
  const d = cvOf(w, h), dc = d.getContext('2d'); dc.imageSmoothingEnabled = true; dc.imageSmoothingQuality = 'high'; dc.drawImage(c, 0, 0, w, h);
  return d;
}

/* ---------------- 6. trình xem ---------------- */
const S = {
  cfg: {}, M: null, sys: 'XYZ', sysFile: null, radio: false,
  mode: 'surface', userMode: 'surface', opts: [], src: { id: 'solid' }, solid: [221, 208, 184], cmap: 'viridis', rev: false, lo: 0, hi: 1, vals: null,
  cellRGB: null, ptRGB: null, ps: 3, spin: false,
  R: [1, 0, 0, 0, 1, 0, 0, 0, 1], dist: 1, pan: [0, 0], ptrs: new Map(), pinch: 0, raf: 0,
};
const m3mul = (a, b) => { const o = new Array(9); for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) o[3 * r + c] = a[3 * r] * b[c] + a[3 * r + 1] * b[3 + c] + a[3 * r + 2] * b[6 + c]; return o; };
function rot(ax, ay, az, t) {          // quay quanh trục đơn vị (ax, ay, az) góc t, theo hàng
  const c = Math.cos(t), s = Math.sin(t), k = 1 - c;
  return [c + ax * ax * k, ax * ay * k - az * s, ax * az * k + ay * s,
          ay * ax * k + az * s, c + ay * ay * k, ay * az * k - ax * s,
          az * ax * k - ay * s, az * ay * k + ax * s, c + az * az * k];
}
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
function ortho(R) {                    // Gram-Schmidt theo hàng để ma trận không méo dần
  const n = v => { const l = Math.hypot(...v) || 1; return v.map(q => q / l); };
  const x = n(R.slice(0, 3)); let y = R.slice(3, 6); const d = x[0] * y[0] + x[1] * y[1] + x[2] * y[2]; y = n(y.map((q, i) => q - d * x[i]));
  return [...x, ...y, ...cross(x, y)];
}
const rowsOf = (right, up) => [...right, ...up, ...cross(right, up)];
const medical = () => S.sys !== 'XYZ';
const upAxis = () => (medical() ? 2 : 1);
/* chữ cho một hướng trục (vectơ đơn vị dọc trục) */
function labOf(v) {
  const i = [0, 1, 2].reduce((b, k) => (Math.abs(v[k]) > Math.abs(v[b]) ? k : b), 0), pos = v[i] > 0;
  return medical() ? (pos ? 'RAS' : 'LPI')[i] : (pos ? '+' : '−') + 'XYZ'[i];
}
/* ba hình chiếu: trục phải, trục lên trên màn hình (tọa độ hiển thị: RAS khi biết hệ trục) */
function projViews() {
  const r = S.radio && medical() ? -1 : 1;
  const V = medical()
    ? [{ name: 'Axial', right: [r, 0, 0], up: [0, 1, 0] }, { name: 'Coronal', right: [r, 0, 0], up: [0, 0, 1] }, { name: 'Sagittal', right: [0, -1, 0], up: [0, 0, 1] }]
    : [{ name: 'XY', right: [1, 0, 0], up: [0, 1, 0] }, { name: 'XZ', right: [1, 0, 0], up: [0, 0, 1] }, { name: 'YZ', right: [0, 1, 0], up: [0, 0, 1] }];
  return V.map(v => {
    const R = rowsOf(v.right, v.up), back = R.slice(6, 9), neg = x => x.map(q => -q);
    return { ...v, R, from: labOf(back), edge: [labOf(neg(v.right)), labOf(v.right), labOf(v.up), labOf(neg(v.up))] };
  });
}
/* tỉ lệ chung (px mỗi đơn vị) cho ba hình chiếu trong ô w × h */
function projScale(w, h) {
  const e = S.M.bbox.size, emax = Math.max(...e), eps = Math.max(emax * 1e-3, 1e-9);
  if (!(emax > 0)) return Math.min(w, h) / 4;
  let s = Infinity;
  for (const v of projViews()) {
    const ax = x => [0, 1, 2].reduce((b, k) => (Math.abs(x[k]) > Math.abs(x[b]) ? k : b), 0);
    s = Math.min(s, 0.84 * w / Math.max(e[ax(v.right)], eps), 0.84 * h / Math.max(e[ax(v.up)], eps));
  }
  return s;
}
function defaultR() {
  const base = medical() ? rowsOf([-1, 0, 0], [0, 0, 1]) : rowsOf([1, 0, 0], [0, 1, 0]);   // nhìn từ trước (A) / từ +Z
  return ortho(m3mul(rot(1, 0, 0, 0.32), m3mul(rot(0, 1, 0, -0.62), base)));
}
const fitDist = () => S.M.rad / Math.sin(FOV / 2) * 1.08;
function resetView() { S.R = defaultR(); S.pan = [0, 0]; S.dist = fitDist(); }

let cv, ax2d, rafMain = 0;
const redraw = () => { if (!rafMain) rafMain = requestAnimationFrame(loop); };
function loop() {
  rafMain = 0;
  if (S.spin) { const a = [0, 0, 0]; a[upAxis()] = 1; S.R = ortho(m3mul(S.R, rot(a[0], a[1], a[2], 0.006))); }
  drawMain();
  if (S.spin) redraw();
}
function drawMain() {
  if (!S.M || !gl) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2), r = cv.getBoundingClientRect();
  const W = Math.max(1, Math.round(r.width * dpr)), H = Math.max(1, Math.round(r.height * dpr));
  if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
  if (ax2d.width !== W || ax2d.height !== H) { ax2d.width = W; ax2d.height = H; }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  drawScene(W, H, { R: S.R, pan: S.pan, dist: S.dist }, { bg: [0, 0, 0], ps: S.ps * dpr });
  const g = ax2d.getContext('2d'); g.clearRect(0, 0, W, H);
  drawTriad(g, 44 * dpr, H - 44 * dpr, 30 * dpr, S.R, 12 * dpr);
}
/* trục hướng ở góc ảnh 3D */
function drawTriad(g, cx, cy, len, R, fs) {
  const cols = ['#E5484D', '#46A758', '#3E8ED0'], L = medical() ? ['R', 'A', 'S'] : ['X', 'Y', 'Z'];
  const ax = [0, 1, 2].map(i => ({ i, x: R[i], y: -R[3 + i], z: R[6 + i] })).sort((a, b) => a.z - b.z);
  g.save(); g.lineCap = 'round'; g.font = `700 ${Math.round(fs)}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (const a of ax) {
    const ex = cx + a.x * len, ey = cy + a.y * len;
    g.strokeStyle = cols[a.i]; g.lineWidth = Math.max(1.5, fs / 6); g.globalAlpha = a.z < -0.2 ? 0.55 : 1;
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(ex, ey); g.stroke();
    g.fillStyle = cols[a.i]; g.fillText(L[a.i], cx + a.x * (len + fs * 0.8), cy + a.y * (len + fs * 0.8));
  }
  g.restore();
}
/* chữ hướng ở mép, nhãn, thước đo trên một hình chiếu */
function decorate(g, x, y, w, h, v, s, o) {
  const fs = o.fs, m = Math.round(fs * 0.45);
  g.save();
  g.font = `600 ${Math.round(fs)}px ${FONT}`; g.fillStyle = o.letter;
  g.textBaseline = 'middle'; g.textAlign = 'left'; g.fillText(v.edge[0], x + m, y + h / 2);
  g.textAlign = 'right'; g.fillText(v.edge[1], x + w - m, y + h / 2);
  g.textAlign = 'center'; g.textBaseline = 'top'; g.fillText(v.edge[2], x + w / 2, y + m);
  g.textBaseline = 'bottom'; g.fillText(v.edge[3], x + w / 2, y + h - m);
  if (o.tag) {
    const t = o.tag; g.font = `600 ${Math.round(fs * 0.95)}px ${FONT}`; g.textAlign = 'left'; g.textBaseline = 'top';
    g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(x, y, g.measureText(t).width + fs * 0.9, fs * 1.55);
    g.fillStyle = '#fff'; g.fillText(t, x + fs * 0.45, y + fs * 0.3);
  }
  if (o.bar && s > 0) {
    const target = w * 0.22 / s, p = 10 ** Math.floor(Math.log10(target)), q = target / p, len = (q >= 5 ? 5 : q >= 2 ? 2 : 1) * p, L = len * s;
    const bx = x + w - m - L, by = y + h - m - fs * 0.2, tk = fs * 0.35;
    g.strokeStyle = o.bar; g.lineWidth = Math.max(1, fs / 9);
    g.beginPath(); g.moveTo(bx, by - tk); g.lineTo(bx, by); g.lineTo(bx + L, by); g.lineTo(bx + L, by - tk); g.stroke();
    g.font = `500 ${Math.round(fs * 0.82)}px ${FONT}`; g.fillStyle = o.bar; g.textAlign = 'center'; g.textBaseline = 'bottom';
    g.fillText(`${fmtX(len, 6)}${S.sys === 'XYZ' ? '' : ' mm'}`, bx + L / 2, by - tk * 0.6);
  }
  g.restore();
}
/* ba ô hình chiếu trong trình xem */
let rafProj = 0;
const projSoon = () => { if (!rafProj) rafProj = requestAnimationFrame(() => { rafProj = 0; drawProjs(); }); };
function drawProjs() {
  if (!S.M || !gl) return;
  const views = projViews(), dpr = Math.min(window.devicePixelRatio || 1, 2), boxes = [...document.querySelectorAll('.mv-proj')];
  const r0 = boxes[0].querySelector('canvas').getBoundingClientRect(), w = Math.max(1, Math.round(r0.width * dpr)), h = Math.max(1, Math.round(r0.height * dpr)), s = projScale(w, h);
  boxes.forEach((b, i) => {
    const v = views[i], c = b.querySelector('canvas');
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    const img = renderCanvas(w, h, { R: v.R, hw: w / 2 / s, hh: h / 2 / s }, { bg: [0, 0, 0], ss: dpr >= 2 ? 1 : 2, ps: S.ps * dpr });
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    decorate(g, 0, 0, w, h, v, s, { fs: clamp(w / 24, 9 * dpr, 13 * dpr), letter: '#f2c230', bar: 'rgba(255,255,255,.85)' });
    b.querySelector('.mv-tag').textContent = v.name;
    b.title = `${v.name}: nhìn từ ${v.from}. Bấm để xoay ảnh 3D về hướng này.`;
    b.setAttribute('aria-label', b.title);
  });
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}
function rotBy(dx, dy) { const l = Math.hypot(dx, dy); if (!l) return; S.R = ortho(m3mul(rot(dy / l, dx / l, 0, l * 0.008), S.R)); }
function panBy(dx, dy) { const r = cv.getBoundingClientRect(), k = 2 * S.dist * Math.tan(FOV / 2) / r.height; S.pan[0] += dx * k; S.pan[1] -= dy * k; }
function zoom(f) { if (!S.M) return; S.dist = clamp(S.dist * f, S.M.rad * 0.05, S.M.rad * 20); }
function setSpin(on) { S.spin = on; $('mvSpin').setAttribute('aria-pressed', String(on)); if (on) redraw(); }
function bindViewer() {
  cv = $('mvCanvas'); ax2d = $('mvAxes');
  new ResizeObserver(() => { redraw(); }).observe(cv);
  new ResizeObserver(projSoon).observe(document.querySelector('.mv-projs'));
  const moved = () => { redraw(); };
  cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); S.ptrs.set(e.pointerId, [e.clientX, e.clientY]); S.pinch = 0; cv.focus({ preventScroll: true }); });
  cv.addEventListener('pointermove', e => {
    if (!S.ptrs.has(e.pointerId) || !S.M) return;
    const prev = S.ptrs.get(e.pointerId); S.ptrs.set(e.pointerId, [e.clientX, e.clientY]);
    const dx = e.clientX - prev[0], dy = e.clientY - prev[1];
    if (S.ptrs.size >= 2) { const [p, q] = [...S.ptrs.values()], d = Math.hypot(p[0] - q[0], p[1] - q[1]); if (S.pinch && d) zoom(S.pinch / d); S.pinch = d; }
    else if (e.shiftKey || (e.buttons & 2)) panBy(dx, dy);
    else rotBy(dx, dy);
    redraw();
  });
  const up = e => { if (S.ptrs.delete(e.pointerId)) { S.pinch = 0; } };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('contextmenu', e => e.preventDefault());
  cv.addEventListener('wheel', e => { if (!S.M) return; e.preventDefault(); zoom(Math.exp((e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY) * 0.0012)); moved(); }, { passive: false });
  cv.addEventListener('dblclick', () => { if (!S.M) return; resetView(); moved(); });
  cv.addEventListener('keydown', e => {
    if (!S.M) return; const k = e.key, st = e.shiftKey ? 0.4 : 0.12;
    if (k === 'ArrowLeft') S.R = ortho(m3mul(rot(0, 1, 0, -st), S.R)); else if (k === 'ArrowRight') S.R = ortho(m3mul(rot(0, 1, 0, st), S.R));
    else if (k === 'ArrowUp') S.R = ortho(m3mul(rot(1, 0, 0, -st), S.R)); else if (k === 'ArrowDown') S.R = ortho(m3mul(rot(1, 0, 0, st), S.R));
    else if (k === '+' || k === '=') zoom(0.85); else if (k === '-' || k === '_') zoom(1.18); else if (k === '0') resetView(); else return;
    e.preventDefault(); moved();
  });
  document.querySelectorAll('.mv-proj').forEach((b, i) => b.addEventListener('click', () => {
    if (!S.M) return; S.R = projViews()[i].R.slice(); S.pan = [0, 0]; S.dist = fitDist(); setSpin(false); moved();
  }));
  $('mvSpin').addEventListener('click', () => setSpin(!S.spin));
  $('mvReset').addEventListener('click', () => { resetView(); moved(); });
  const seg = (attr, key, after) => document.querySelectorAll(`[${attr}]`).forEach(b => b.addEventListener('click', () => {
    S[key] = b.getAttribute(attr); segUi(); after();
  }));
  const recolor = () => { uploadColors(); redraw(); projSoon(); };
  seg('data-mode', 'mode', () => { S.userMode = S.mode; redraw(); projSoon(); });
  $('mvColor').addEventListener('change', e => { setSource(+e.target.value); recolor(); });
  $('mvSolid').addEventListener('input', e => { S.solid = unhex(e.target.value); recolor(); });
  $('mvCmap').addEventListener('change', e => { S.cmap = e.target.value; cmapUi(); recolor(); });
  $('mvRev').addEventListener('change', e => { S.rev = e.target.checked; cmapUi(); recolor(); });
  const rng = () => {
    const a = parseFloat($('mvLo').value), b = parseFloat($('mvHi').value);
    if (Number.isFinite(a)) S.lo = a; if (Number.isFinite(b)) S.hi = b;
    rangeUi(); recolor();
  };
  $('mvLo').addEventListener('change', rng); $('mvHi').addEventListener('change', rng);
  $('mvAuto').addEventListener('click', () => { [S.lo, S.hi] = autoRange(S.vals); rangeUi(); recolor(); });
  $('mvSys').addEventListener('change', e => { S.sys = e.target.value; resetView(); sysUi(); redraw(); projSoon(); renderInfo(); });
  $('mvPs').addEventListener('input', e => { S.ps = +e.target.value; $('mvPsOut').textContent = `${S.ps} px`; redraw(); projSoon(); });
}
function segUi() {
  const M = S.M;
  document.querySelectorAll('[data-mode]').forEach(b => {
    const m = b.dataset.mode;
    b.setAttribute('aria-pressed', String((M && M.pointCloud ? 'points' : S.mode) === m));
    b.disabled = !!M && (M.pointCloud ? m !== 'points' : m !== 'points' && !M.tris.length);
  });
}
function sysUi() { $('mvSys').value = S.sys; segUi(); }
function setSource(i) {
  const o = S.opts[i] || S.opts[0]; S.src = o; S.vals = null;
  if (o.id !== 'solid' && o.mode !== 'rgb') { S.vals = scalarOf(o); [S.lo, S.hi] = autoRange(S.vals); }
  $('mvColor').value = String(S.opts.indexOf(o));
  const scalar = !!S.vals;
  $('mvSolidRow').hidden = o.id !== 'solid'; $('mvCmapRow').hidden = !scalar; $('mvRangeRow').hidden = !scalar;
  rangeUi(); cmapUi();
}
function rangeUi() {
  if (!S.vals) return;
  const d = decFor(S.hi - S.lo) + 1;
  $('mvLo').value = +S.lo.toFixed(d); $('mvHi').value = +S.hi.toFixed(d);
}
function cmapUi() { $('mvBar').style.background = lutCss(S.cmap, S.rev); }
function readout() {
  const M = S.M, el = $('mvReadout');
  if (!M) { el.innerHTML = ''; return; }
  const parts = [];
  if (M.pointCloud) parts.push(`<b>${numVi(M.n)}</b><span class="q"> điểm</span>`);
  else {
    if (M.tris.length) parts.push(`<b>${numVi(M.tris.length / 3)}</b><span class="q"> tam giác</span>`);
    if (M.segs.length) parts.push(`<b>${numVi(M.segs.length / 2)}</b><span class="q"> đoạn thẳng</span>`);
    if (M.vtx.length) parts.push(`<b>${numVi(M.vtx.length)}</b><span class="q"> điểm rời</span>`);
  }
  el.innerHTML = `<span>${parts.join(', ')}</span><span class="q">Kéo để xoay, Shift + kéo hoặc chuột phải để dời, lăn chuột để phóng to, nhấp đúp để về góc đầu. Bấm vào một hình chiếu để xoay ảnh 3D về hướng đó.</span>`;
}

/* ---------------- 7. bảng thông tin ---------------- */
const TXT = {
  en: { format: 'Format', dataset: 'Dataset', points: 'Points', unused: 'not used by any cell', cells: 'Cells', drawn: 'Rendered', outer: 'outer surface of 3D cells',
        range: a => `${a} range`, size: 'Size', center: 'Center', area: 'Surface area', volume: 'Enclosed volume', topo: 'Topology', comp: 'Components',
        euler: 'Euler χ', genus: 'genus', coords: 'Coordinates', conv: c => (c ? 'radiological convention' : 'neurological convention'),
        color: 'Color', arrays: 'Data arrays', made: 'Exported', from: 'from', views: 'Projections', proj: 'orthographic, shared scale' },
  vi: { format: 'Định dạng', dataset: 'Kiểu dữ liệu', points: 'Số điểm', unused: 'không thuộc ô nào', cells: 'Ô', drawn: 'Đã vẽ', outer: 'mặt ngoài của ô 3D',
        range: a => `Khoảng ${a}`, size: 'Kích thước', center: 'Tâm', area: 'Diện tích mặt', volume: 'Thể tích bao', topo: 'Cấu trúc', comp: 'Số mảnh',
        euler: 'Euler χ', genus: 'genus', coords: 'Hệ tọa độ', conv: c => (c ? 'quy ước X-quang' : 'quy ước thần kinh'),
        color: 'Màu', arrays: 'Mảng dữ liệu', made: 'Xuất ngày', from: 'từ', views: 'Hình chiếu', proj: 'song song, cùng tỉ lệ' },
};
const LANG = 'en';
const unitS = () => (S.sys === 'XYZ' ? '' : ' mm');
function typesTxt(m) { return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${num(v)} ${k}`).join(', '); }
function infoFacts(lang = LANG) {
  const T = TXT[lang], M = S.M, R = M.raw, b = M.bbox, u = unitS(), d = decFor(Math.max(...b.size));
  const f = [[T.format, R.format === 'VTK' ? `VTK legacy ${R.version}, ${R.encoding.toLowerCase()}` : `PLY ${R.version}, ${R.encoding}`]];
  f.push([T.dataset, R.dataset + (R.elements ? ` (${R.elements})` : '')]);
  f.push([T.points, num(M.n) + (M.unused ? `, ${num(M.unused)} ${T.unused}` : '')]);
  let nCells = 0; M.types.forEach(v => { nCells += v; });
  if (nCells) f.push([T.cells, M.types.size === 1 ? `${num(nCells)} (${[...M.types.keys()][0]})` : `${num(nCells)} (${typesTxt(M.types)})`]);
  const dr = [];
  if (M.pointCloud) dr.push(`${num(M.n)} points`);
  if (M.tris.length) dr.push(`${num(M.tris.length / 3)} triangles` + (M.outer ? ` (${T.outer})` : ''));
  if (M.segs.length) dr.push(`${num(M.segs.length / 2)} line segments`);
  if (M.vtx.length) dr.push(`${num(M.vtx.length)} vertices`);
  if (dr.length) f.push([T.drawn, dr.join(', ')]);
  ['x', 'y', 'z'].forEach((a, i) => f.push([T.range(a), `${fmtX(b.min[i], d)} … ${fmtX(b.max[i], d)}`]));
  f.push([T.size, b.size.map(x => fmtX(x, d)).join(' × ') + u]);
  f.push([T.center, b.center.map(x => fmtX(x, d)).join(', ')]);
  if (M.tris.length) {
    const tp = M.topo;
    f.push([T.area, `${fmtX(M.area, decFor(M.area))}${u ? u + '²' : ''}`]);
    let vol;
    if (Number.isFinite(M.volume)) vol = `${fmtX(M.volume, decFor(M.volume))}${u ? u + '³' : ''}` + (u ? ` (${fmtX(M.volume / 1000, 2)} mL)` : '');
    else if (!tp.measured) vol = 'not computed (mesh too large)';
    else vol = tp.closed ? 'n/a: inconsistent face orientation' : 'n/a: surface is not closed';
    f.push([T.volume, vol]);
    if (tp.measured) {
      const t = [];
      if (tp.closed) t.push('closed', tp.flipped ? `${num(tp.flipped)} edges with flipped orientation` : 'consistently oriented');
      else { if (tp.boundary) t.push(`open, ${num(tp.boundary)} boundary edges`); if (tp.nonManifold) t.push(`${num(tp.nonManifold)} non-manifold edges`); if (tp.flipped) t.push(`${num(tp.flipped)} flipped edges`); }
      if (M.degen) t.push(`${num(M.degen)} degenerate triangles`);
      f.push([T.topo, t.join(', ')]);
      f.push([T.comp, num(tp.components)]);
      f.push([T.euler, `${tp.euler}` + (tp.closed && Number.isInteger(tp.genus) ? `, ${T.genus} ${tp.genus}` : '')]);
    } else f.push([T.comp, num(tp.components)]);
  }
  const sysTxt = S.sys === 'XYZ' ? 'X, Y, Z (orientation unknown)' : `${S.sys}, ${T.conv(S.radio)}`;
  f.push([T.coords, sysTxt + (S.sysFile ? (S.sysFile === S.sys ? ' (from file header)' : ` (file header says ${S.sysFile})`) : S.sys !== 'XYZ' ? ' (set by user; units assumed mm)' : '')]);
  return f;
}
const KIND = { scalars: 'scalars', vectors: 'vectors', normals: 'normals', color: 'color', tcoords: 'texture coords', tensors: 'tensor', field: 'field', ids: 'ids' };
function arrayLine(a) {
  return `${a.loc === 'point' ? 'point' : a.loc === 'cell' ? 'cell' : 'field'}, ${KIND[a.kind] || a.kind}, ${a.nc} × ${a.type}`;
}
function arrayRange(a) {
  if (!Number.isFinite(a.range[0])) return 'no finite values';
  if (a.kind === 'color') return `${fmtV(a.range[0] * 255)} … ${fmtV(a.range[1] * 255)} per channel (0 … 255)`;
  return `${a.nc > 1 ? '|v| ' : ''}${fmtV(a.range[0])} … ${fmtV(a.range[1])}${a.nan ? `, ${num(a.nan)} NaN` : ''}`;
}
function renderInfo() {
  if (S.demo) { $('mvInfo').innerHTML = '<p class="nv-note">Mô hình minh họa. Chọn file .vtk / .ply ở trên để xem thông tin của file.</p>'; return; }
  const M = S.M, R = M.raw;
  let h = `<p class="nv-fname">${esc(R.name)}</p><dl class="nv-dl">`;
  for (const [k, v] of infoFacts('en')) h += `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`;
  h += '</dl>';
  const arrs = [...M.arrays, ...R.fieldData];
  h += `<h2 class="nv-h mv-sec">Data arrays (${arrs.length})</h2>`;
  h += arrs.length ? '<ul class="mv-arrs">' + arrs.map(a => `<li><b>${esc(a.name)}</b><span>${esc(arrayLine(a))}</span><span class="mv-rng">${esc(arrayRange(a))}</span></li>`).join('') + '</ul>'
                   : '<p class="nv-note">No point or cell data in this file.</p>';
  const head = R.format === 'VTK' ? R.title : R.comments.join('\n');
  if (head) h += `<h2 class="nv-h mv-sec">${R.format === 'VTK' ? 'Header title' : 'Header comments'}</h2><pre class="nv-aff mv-head">${esc(head)}</pre>`;
  const notes = [...R.warn];
  if (M.skipped.size) notes.push(`Skipped cells (type not supported): ${typesTxt(M.skipped)}.`);
  if (M.bad) notes.push(`${num(M.bad)} cells refer to point indices outside the file and were skipped.`);
  if (M.nonFinite) notes.push(`${num(M.nonFinite)} coordinates are NaN / infinite.`);
  if (M.n > 0 && M.tris.length && !M.topo.measured) notes.push('Too many points to check edges; topology and volume were not computed.');
  notes.forEach(t => { h += `<p class="nv-note">${esc(t)}</p>`; });
  $('mvInfo').innerHTML = h;
}

/* ---------------- 8. xuất ảnh ---------------- */
const E = { fmt: 'png', busy: false, W3: 1024 };          // ảnh 3D rộng W3 px; nền trắng, luôn có thước đo và trục hướng
/* cột thông tin bên phải; vẽ thật nếu doDraw, trả về chiều cao cần */
function legend(c, x0, y0, W, sc, doDraw) {
  const T = TXT[LANG], M = S.M, dark = false;
  const ink = dark ? '#F2F4F7' : '#1B1920', mute = dark ? '#A9B4C0' : '#59606B', rule = dark ? '#3a3742' : '#DCE6EC';
  const F = (w, s) => `${w} ${Math.round(s * sc)}px ${FONT}`;
  let y = y0;
  const fit = (t, w) => { if (c.measureText(t).width <= w) return t; while (t.length > 1 && c.measureText(t + '…').width > w) t = t.slice(0, -1); return t + '…'; };
  const text = (t, x, font, col, w = W) => { c.font = font; if (doDraw) { c.fillStyle = col; c.fillText(fit(t, w), x, y); } };
  const para = (t, x, font, col, w, lh) => {
    c.font = font; let ln = ''; const out = [];
    for (const wd of String(t).split(' ')) { const tt = ln ? ln + ' ' + wd : wd; if (c.measureText(tt).width > w && ln) { out.push(ln); ln = wd; } else ln = tt; }
    out.push(ln);
    out.forEach((tt, i) => { if (i) y += lh * sc; text(tt, x, font, col, w); });
  };
  const line = () => { y += 10 * sc; if (doDraw) { c.fillStyle = rule; c.fillRect(x0, y, W, Math.max(1, sc)); } y += 12 * sc; };
  c.textBaseline = 'top'; c.textAlign = 'left';
  text(M.raw.name, x0, F(700, 17), ink); y += 26 * sc;
  line();
  const facts = infoFacts(LANG);
  const pv = projViews();
  facts.push([T.views, `${T.proj}; ` + pv.map(v => `${v.name} from ${v.from}`).join(', ')]);
  const kw = 120 * sc;
  for (const [k, v] of facts) { text(k, x0, F(400, 12.5), mute, kw - 6 * sc); para(v, x0 + kw, F(600, 12.5), ink, W - kw, 17); y += 19 * sc; }
  line();
  const src = S.src;
  if (src.id === 'solid') {
    text(`${T.color}:`, x0, F(600, 12.5), ink);
    if (doDraw) { const sw = 14 * sc; c.fillStyle = hex(S.solid); c.fillRect(x0 + 52 * sc, y, sw * 2, sw); c.strokeStyle = mute; c.lineWidth = Math.max(1, sc * .8); c.strokeRect(x0 + 52 * sc + .5, y + .5, sw * 2 - 1, sw - 1); }
    y += 20 * sc;
  } else if (src.mode === 'rgb') { text(`${T.color}: ${src.a.name} (RGB from file, ${src.a.loc} data)`, x0, F(600, 12.5), ink); y += 20 * sc; }
  else {
    const what = src.a.nc === 1 ? src.a.name : src.mode === 'mag' ? `|${src.a.name}|` : `${src.a.name} [${'xyzw'[src.mode]}]`;
    text(`${T.color}: ${what} (${src.a.loc} data), ${CMAPS.find(x => x[0] === S.cmap)[1]}${S.rev ? ' reversed' : ''}`, x0, F(600, 12.5), ink); y += 20 * sc;
    const bh = 14 * sc;
    if (doDraw) {
      const lut = lutOf(S.cmap, S.rev), g = c.createLinearGradient(x0, 0, x0 + W, 0);
      for (let i = 0; i <= 32; i++) { const k = Math.min(255, i * 8); g.addColorStop(i / 32, `rgb(${lut[3 * k]},${lut[3 * k + 1]},${lut[3 * k + 2]})`); }
      c.fillStyle = g; c.fillRect(x0, y, W, bh); c.strokeStyle = mute; c.lineWidth = Math.max(1, sc); c.strokeRect(x0 + .5, y + .5, W - 1, bh - 1);
    }
    y += bh + 4 * sc; c.font = F(400, 12);
    if (doDraw) { c.fillStyle = mute; c.textAlign = 'left'; c.fillText(fmtV(S.lo), x0, y); c.textAlign = 'right'; c.fillText(fmtV(S.hi), x0 + W, y); c.textAlign = 'left'; }
    y += 18 * sc;
  }
  const arrs = [...M.arrays, ...M.raw.fieldData];
  if (arrs.length) {
    line();
    text(`${T.arrays} (${arrs.length})`, x0, F(600, 12.5), ink); y += 20 * sc;
    const MAX = 14;
    arrs.slice(0, MAX).forEach(a => {
      text(a.name, x0, F(600, 12), ink, kw - 6 * sc);
      para(`${arrayLine(a)}; ${arrayRange(a)}`, x0 + kw, F(400, 12), mute, W - kw, 16); y += 18 * sc;
    });
    if (arrs.length > MAX) { text(`and ${arrs.length - MAX} more`, x0, F(400, 12), mute); y += 18 * sc; }
  }
  line();
  const dt = new Date(), ds = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  para(`${T.made} ${ds}${S.cfg.printHeader ? ` ${T.from} ${S.cfg.printHeader}` : ''}`, x0, F(400, 11.5), mute, W, 16); y += 16 * sc;
  return y - y0;
}
async function renderExport() {
  if (!S.M || !gl) return null;
  try { await Promise.all(['400', '500', '600', '700'].map(w => document.fonts.load(`${w} 16px "Be Vietnam Pro"`, 'Việt'))); } catch (e) { /* dùng font dự phòng */ }
  const W3 = E.W3, sc = Math.max(0.85, W3 / 768), gap = Math.round(6 * sc), pad = Math.round(18 * sc), LW = Math.round(clamp(330 * sc, 330, 620));
  const fr = cv.getBoundingClientRect(), aspect = clamp(fr.width ? fr.height / fr.width : 0.75, 0.55, 1);
  const H3 = Math.round(W3 * aspect), pw = Math.floor((W3 - 2 * gap) / 3), gh = H3 + gap + pw;
  const lh = legend(cvOf(10, 10).getContext('2d'), 0, 0, LW, sc, false);
  const W = pad + W3 + pad + LW + pad, H = pad + Math.max(gh, lh) + pad;
  if (W * H > 120e6) throw new Error('Ảnh quá lớn; hãy chọn cỡ nhỏ hơn.');
  const dark = false, bg = dark ? [0, 0, 0] : [1, 1, 1], fs = 13 * sc;
  const c = cvOf(W, H), g = c.getContext('2d');
  g.fillStyle = dark ? '#000' : '#fff'; g.fillRect(0, 0, W, H);
  const frame = (x, y, w, h) => { g.strokeStyle = dark ? '#3a3742' : '#DCE6EC'; g.lineWidth = 1; g.strokeRect(x - .5, y - .5, w + 1, h + 1); };
  const tag = (t, x, y) => {
    g.save(); g.font = `600 ${Math.round(fs * 0.95)}px ${FONT}`; g.textAlign = 'left'; g.textBaseline = 'top';
    g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(x, y, g.measureText(t).width + fs * 0.9, fs * 1.55);
    g.fillStyle = '#fff'; g.fillText(t, x + fs * 0.45, y + fs * 0.3); g.restore();
  };
  const ps = S.ps * sc, wire = S.mode === 'wire' && !S.M.pointCloud;
  // ảnh 3D theo góc nhìn hiện tại
  const img3 = renderCanvas(W3, H3, { R: S.R, pan: S.pan, dist: S.dist }, { bg, ss: wire ? 1 : 2, ps });
  g.drawImage(img3, pad, pad); frame(pad, pad, W3, H3); tag('3D', pad, pad);
  drawTriad(g, pad + 46 * sc, pad + H3 - 46 * sc, 32 * sc, S.R, fs);
  await tick();
  // ba hình chiếu, cùng tỉ lệ
  const views = projViews(), s = projScale(pw, pw), y2 = pad + H3 + gap;
  views.forEach((v, i) => {
    const x = pad + i * (pw + gap);
    const im = renderCanvas(pw, pw, { R: v.R, hw: pw / 2 / s, hh: pw / 2 / s }, { bg, ss: wire ? 1 : 2, ps });
    g.drawImage(im, x, y2); frame(x, y2, pw, pw);
    decorate(g, x, y2, pw, pw, v, s, { fs, letter: dark ? '#f2c230' : '#9a6b00', bar: '#1B1920', tag: v.name });
  });
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  legend(g, pad + W3 + pad, pad, LW, sc, true);
  return c;
}
/* PDF một trang A4 ngang, ảnh nằm giữa. Ảnh nén Flate (giữ nét chữ); trình duyệt không có CompressionStream thì dùng JPEG. */
async function pdfOf(c, title) {
  const W = c.width, H = c.height, enc = new TextEncoder();
  let img, filter;
  if ('CompressionStream' in window) {
    const px = c.getContext('2d').getImageData(0, 0, W, H).data, rgb = new Uint8Array(W * H * 3);
    for (let i = 0, j = 0; i < px.length; i += 4, j += 3) { rgb[j] = px[i]; rgb[j + 1] = px[i + 1]; rgb[j + 2] = px[i + 2]; }
    img = new Uint8Array(await new Response(new Blob([rgb]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());
    filter = 'FlateDecode';
  } else {
    img = new Uint8Array(await (await new Promise(r => c.toBlob(r, 'image/jpeg', 0.95))).arrayBuffer());
    filter = 'DCTDecode';
  }
  const PW = 841.89, PH = 595.28, m = 24, k = Math.min((PW - 2 * m) / W, (PH - 2 * m) / H);
  const iw = W * k, ih = H * k, f2 = x => x.toFixed(2);
  const content = enc.encode(`q ${f2(iw)} 0 0 ${f2(ih)} ${f2((PW - iw) / 2)} ${f2((PH - ih) / 2)} cm /Im0 Do Q`);
  const u16 = t => '<FEFF' + Array.from({ length: t.length }, (_, i) => t.charCodeAt(i).toString(16).padStart(4, '0')).join('') + '>';
  const d = new Date(), p2 = x => String(x).padStart(2, '0');
  const parts = [], offs = []; let len = 0;
  const put = x => { const b = typeof x === 'string' ? enc.encode(x) : x; parts.push(b); len += b.length; };
  const obj = (i, body, stream) => { offs[i] = len; put(`${i} 0 obj\n${body}\n`); if (stream) { put('stream\n'); put(stream); put('\nendstream\n'); } put('endobj\n'); };
  put('%PDF-1.4\n'); put(new Uint8Array([37, 226, 227, 207, 211, 10]));
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PW} ${PH}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
  obj(4, `<< /Type /XObject /Subtype /Image /Width ${W} /Height ${H} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /${filter} /Length ${img.length} >>`, img);
  obj(5, `<< /Length ${content.length} >>`, content);
  obj(6, `<< /Title ${u16(title)} /Producer ${u16(S.cfg.printHeader || 'view_mesh.html')} /CreationDate (D:${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}) >>`);
  const xref = len;
  put('xref\n0 7\n0000000000 65535 f \n' + offs.slice(1).map(o => String(o).padStart(10, '0') + ' 00000 n \n').join(''));
  put(`trailer\n<< /Size 7 /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(parts, { type: 'application/pdf' });
}
function save(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
function bindExport() {
  $('mvEFmt').addEventListener('change', e => { E.fmt = e.target.value; $('mvEDown').textContent = `Tải ${E.fmt.toUpperCase()}`; });
  $('mvEDown').addEventListener('click', async () => {
    if (!S.M || S.demo || E.busy) return;
    const btn = $('mvEDown'), info = $('mvEInfo');
    E.busy = true; btn.disabled = true; info.textContent = 'Đang dựng ảnh…';
    try {
      await tick();
      const c = await renderExport(); if (!c) throw new Error('Không dựng được ảnh.');
      const base = `${baseName(S.M.raw.name)}_3d`;
      if (E.fmt === 'pdf') { info.textContent = 'Đang tạo PDF…'; save(await pdfOf(c, S.M.raw.name), base + '.pdf'); }
      else save(await new Promise(r => c.toBlob(r, 'image/png')), base + '.png');
      info.textContent = `Đã tải ${base}.${E.fmt} (${c.width} × ${c.height} px).`;
    } catch (e) { console.error(e); info.textContent = e.message || String(e); }
    finally { E.busy = false; btn.disabled = false; }
  });
}

/* ---------------- 9. nạp file ---------------- */
function msg(t, err) { const m = $('mvMsg'); m.hidden = !t; m.className = 'nv-msg' + (err ? ' err' : ''); m.textContent = t || ''; }
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
async function loadFile(file, demo = false) {
  if (!gl) { msg('Trình duyệt không hỗ trợ WebGL nên không vẽ được mô hình 3D.', true); return; }
  if (!demo) msg('Đang đọc ' + file.name + '…');
  try {
    await tick();
    const raw = await readMeshFile(file); if (!demo) { msg('Đang dựng lưới…'); await tick(); }
    const M = buildMesh(raw);
    if (!M.n) throw new Error(`${file.name} không có điểm nào.`);
    S.M = M; S.demo = demo; S.sysFile = raw.space; S.sys = raw.space || 'XYZ';
    S.mode = M.pointCloud ? 'points' : M.tris.length ? S.userMode : 'surface';          // chỉ có đường: luôn vẽ đường
    uploadGeometry(M);
    S.opts = colorOptions(M);
    $('mvColor').innerHTML = S.opts.map((o, i) => `<option value="${i}">${esc(o.label)}</option>`).join('');
    let rgb = S.opts.findIndex(o => o.mode === 'rgb' && o.a.loc === 'point');            // có màu trong file thì tô theo màu đó
    if (rgb < 0) rgb = S.opts.findIndex(o => o.mode === 'rgb');
    setSource(rgb > 0 ? rgb : 0);
    uploadColors(); resetView(); sysUi();
    $('mvViewerWrap').hidden = false; $('mvExportWrap').hidden = demo;
    renderInfo(); readout(); redraw(); projSoon(); floatSoon();
    if (demo) { msg(`Đang hiển thị mô hình minh họa (bề mặt đầu, ${numVi(M.tris.length / 3)} tam giác). Chọn file .vtk / .ply của bạn để xem thông tin và xuất file.`); return; }
    const warn = [];
    if (!raw.space) warn.push('File không ghi hệ tọa độ (SPACE=RAS / LPS); đang vẽ theo trục X, Y, Z. Nếu là mô hình từ 3D Slicer, chọn RAS hoặc LPS ở mục Hệ tọa độ để có tên các hướng giải phẫu.');
    if (M.skipped.size) warn.push(`Bỏ qua ${typesTxt(M.skipped)} (loại ô chưa hỗ trợ).`);
    if (M.bad) warn.push(`Bỏ qua ${numVi(M.bad)} ô trỏ tới điểm không có trong file.`);
    msg(warn.join(' '));
  } catch (e) { console.error(e); msg(e.message || String(e), true); }
}

/* mô hình minh họa lúc mở trang; lỗi (không có file, chạy offline…) thì bỏ qua, không báo */
async function loadDemo(url) {
  if (S.M) return;
  try {
    const r = await fetch(url); if (!r.ok) return;
    const ab = await r.arrayBuffer(), name = url.split('/').pop();
    if (!S.M) await loadFile({ name, arrayBuffer: async () => ab }, true);
  } catch (e) { /* bỏ qua */ }
}
/* nút cuộn trang nổi (↑ ↓, xử lý bấm / giữ trong scroll-btns.js): hiện khi màn hình chạm vùng trình xem nới thêm 25% chiều cao ở trên và dưới */
let rafFloat = 0;
function floatUpdate() {
  rafFloat = 0;
  const f = $('mvFloat'), v = $('mvViewerWrap');
  let on = false;
  if (!v.hidden) { const r = v.getBoundingClientRect(), e = r.height * 0.25; on = r.top - e < innerHeight && r.bottom + e > 0; }
  f.classList.toggle('on', on);
  f.querySelectorAll('button').forEach(b => { b.tabIndex = on ? 0 : -1; });
}
const floatSoon = () => { if (!rafFloat) rafFloat = requestAnimationFrame(floatUpdate); };
function bindFloat() {
  addEventListener('scroll', floatSoon, { passive: true });
  addEventListener('resize', floatSoon);
  floatSoon();
}
function start(cfg = {}) {
  S.cfg = cfg;
  $('mvCmap').innerHTML = CMAPS.map(([id, nm]) => `<option value="${id}">${nm}</option>`).join('');
  $('mvSolid').value = hex(S.solid);
  bindViewer(); bindExport(); segUi(); cmapUi();
  try { if (!initGL($('mvCanvas'))) msg('Trình duyệt không hỗ trợ WebGL nên không vẽ được mô hình 3D.', true); }
  catch (e) { gl = null; msg('Lỗi khởi tạo WebGL: ' + e.message, true); }
  if (gl) $('mvCanvas').addEventListener('webglcontextlost', e => { e.preventDefault(); msg('Mất ngữ cảnh WebGL (thiếu bộ nhớ đồ họa?). Hãy tải lại trang.', true); });
  dropZone('mvDrop', 'mvFile', 'mvName', f => queue(() => loadFile(f)));
  bindFloat();
  const demo = cfg.demo === undefined ? 'lib/data/mesh-demo/head-surface-demo.ply' : cfg.demo;
  if (demo && gl && location.protocol !== 'file:') queue(() => loadDemo(demo));
  if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) S.spin = false;
}
return { start, _test: { parseVtk, parsePly, buildMesh, colorOptions } };
})();
