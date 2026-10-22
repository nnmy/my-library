# Trang Phình mạch não (`med-atlas/4-brain-aneurysm.html`)

Trang học về ảnh chụp mạch não (DSA) và phình mạch. Không phụ thuộc `cxr.js` hay `compare.js`; chỉ dùng `lib/aneurysm.js`, `lib/aneurysm.css` (cùng `atlas.css`, `fonts`, `scroll-btns.js` có sẵn).

## Việc CẦN LÀM trước khi đưa lên mạng

1. **Điền nguồn và giấy phép của 3 ảnh** (trường `credit` trong `case.json` của `dsa-vert-ap`, `dsa-ica-lat`, `angio-ica-lat-nosub`). Hiện đang ghi "CẦN ĐIỀN". Ghi tác giả, giấy phép kèm phiên bản, link trang nguồn. Ảnh đã được cắt và chuyển sang thang xám, đây là chỉnh sửa nên phải ghi rõ (đã có sẵn câu này). Không dùng ảnh có điều khoản ND.

   | Thư mục | File gốc | Đã chỉnh |
   |---|---|---|
   | `dsa-vert-ap` | `vertebralis_angiographie_links.png` | cắt (100,220)–(710,892), bỏ chữ "A.vert" |
   | `dsa-ica-lat` | `arteria_carotis_interna_angiographie.png` | cắt (40,40)–(900,690), bỏ chữ "links" |
   | `angio-ica-lat-nosub` | `ica_angiographie_knochen.png` | cắt (0,0)–(989,830), bỏ chữ "ACI rechts" |

   Bên trái/phải lấy theo tên file gốc ("links" = trái, "rechts" = phải); cần đối chiếu với chú thích ảnh gốc.
2. **Nhờ bác sĩ chẩn đoán hình ảnh duyệt** nội dung chữ trong `case.json` và trang HTML. Nội dung do AI soạn; các cấu trúc ghi "Dự đoán" (SCA, nhánh tiểu não, nhánh xa) cần xác nhận hoặc sửa. Viền khoanh vùng là AI tự vẽ bằng tay, chưa được duyệt.
3. **Thêm ca phình mạch thật.** Chưa có ảnh DSA phình mạch có giấy phép phù hợp trong gói này (xem bên dưới). Nút "Phình mạch (DSA)" đang xám, ghi "Chưa mần".

## Mô hình 3D (mục 2 của trang)

Dữ liệu từ bộ **IntrA** (Yang X, Xia D, Kin T, Igarashi T., CVPR 2020; github.com/intra3d2019/IntrA). Mô hình dựng từ MRA; nhãn 0 = mạch, 1 = túi phình, 2 = vùng cổ túi, do chuyên gia của nhóm tác giả vẽ.

- **Giấy phép chưa được công bố rõ trong repo IntrA.** Trang đang có khóa (`gate.js`), nhưng trước khi mở công khai nên email hỏi nhóm tác giả.
- Trình xem: `lib/aneurysm3d.js` (WebGL thuần, không thư viện ngoài). Dữ liệu: `lib/data/aneurysm3d/` gồm `cases.json` (chữ viết tay, sửa được), `cases-auto.json` và các file `.bin` (do script tạo, không sửa tay).
- Lưu ý dữ liệu: các đoạn `AN42-1`, `AN42-2`, `AN42-3` là **cùng một túi phình** cắt ở ba phạm vi khác nhau, không phải ba túi. Một số đoạn có chú giải (ví dụ AN23, AN25, AN27...) đã bị đổi tỷ lệ (kích thước ~200 đơn vị) và không khớp tọa độ với mô hình toàn bộ; số đo mm của các đoạn đó sẽ sai. Chỉ chọn đoạn có kích thước khoảng 10–30 đơn vị.
- Số đo (kích thước túi, độ rộng cổ) do máy tính, đơn vị giả định là mm, chưa xác minh.

### Đổi hoặc thêm ca 3D

1. Sửa danh sách `CASES` ở đầu `tools/prepare_intra.py` (`segment` = đoạn có chú giải; `complete` = toàn bộ mạch não, kèm `segments` để tô nhãn; `healthy` = đoạn mạch khỏe trong `generated/vessel/obj`).
2. Chạy (cần `pip install numpy scipy`):
   ```bash
   cd my-library/med-atlas/tools
   python3 prepare_intra.py --intra đường/dẫn/IntrA --out ../lib/data/aneurysm3d
   ```
3. Thêm mục chữ tương ứng (cùng `id`) vào `lib/data/aneurysm3d/cases.json`.
4. Mô hình toàn bộ (`complete`) nặng khoảng 2 MB mỗi ca; đoạn có chú giải chỉ 30–80 KB.

Không đưa thư mục IntrA gốc (~750 MB) lên GitHub.

## Cấu trúc file

| File | Nội dung |
|---|---|
| `4-brain-aneurysm.html` | Trang chính (6 mục: DSA, mô hình 3D, vị trí, chẩn đoán, PHASES, đột quỵ thiếu máu) |
| `lib/aneurysm.js` | `AnViewer` (trình xem ảnh), `AnSites` (sơ đồ đa giác Willis), `AnPhases` (tính điểm PHASES) |
| `lib/aneurysm.css` | Giao diện, mọi lớp bắt đầu bằng `an-` |
| `lib/data/aneurysm/cases.json` | Danh sách ca theo thứ tự nút (`soon: true` = chưa có ảnh) |
| `lib/data/aneurysm/<ca>/image.jpg` | Ảnh xám |
| `lib/data/aneurysm/<ca>/case.json` | Tên, mô tả, ý nghĩa lâm sàng, hình dạng khoanh vùng từng cấu trúc |
| `lib/aneurysm3d.js` | Trình xem 3D (WebGL) |
| `lib/data/aneurysm3d/` | Mô hình 3D và nội dung chữ |
| `tools/prepare_intra.py` | Chuyển dữ liệu IntrA sang `.bin` |
| `index.html` | Đã thêm thẻ số 4 vào danh sách `PAGES` |

## Thêm một ca mới

1. Tạo thư mục `lib/data/aneurysm/<id>/` có `image.jpg` và `case.json` (copy `dsa-vert-ap/case.json` làm mẫu).
2. Trong `case.json`: `size` = [rộng, cao] của ảnh (điểm ảnh); mỗi cấu trúc có `shapes` là danh sách hình theo tọa độ ảnh:
   - `{"line": [[x,y],...], "width": w}`: đường gấp khúc có độ dày w (dùng cho mạch)
   - `{"ellipse": [cx, cy, rx, ry]}`
   - `{"poly": [[x,y],...]}`
   - `"conf"`: `"chac"` hoặc `"du-doan"`. `"top": true` = luôn ưu tiên khi chồng lên cấu trúc khác.
3. Thêm một dòng vào `cases.json` (bỏ `soon`).
4. Muốn lấy tọa độ: mở ảnh trong trình vẽ có thước điểm ảnh, hoặc dùng script PIL vẽ lưới như khi làm ca đầu tiên.

## Nguồn ảnh mở có thể dùng cho ca phình mạch

Phải đọc giấy phép ngay trên trang tải trước khi dùng; điều khoản "ND" (NoDerivatives) cấm khoanh vùng/chỉnh sửa lên ảnh.

| Nguồn | Nội dung | Ghi chú |
|---|---|---|
| CADA (cerebral aneurysm detection and analysis) | Chụp mạch xoay 3D có phân đoạn | Ghi CC BY-NC-ND 4.0, chỉ hiển thị nguyên bản |
| TOF-MRA phình mạch (Scientific Data, 63 bệnh nhân) | Ảnh MRA có mặt nạ phình mạch | Kiểm tra giấy phép |
| DIAS, DSCA | DSA não, nhãn phân đoạn động mạch | Chủ yếu mạch bình thường; kiểm tra giấy phép |
| Wikimedia Commons | Ảnh DSA phình mạch lẻ | Giấy phép từng ảnh khác nhau |

## Nguồn của nội dung chữ

- Điểm PHASES và bảng nguy cơ 5 năm: Greving JP et al., Lancet Neurol 2014;13:59-66 (đối chiếu với bảng trên PMC4471401 và Radiopaedia).
- DSA là tiêu chuẩn vàng mô tả hình thái phình mạch: các tổng quan hệ thống về hình ảnh phình mạch trong sọ.
- Điểm PHASES dự đoán cả sự lớn lên của túi phình: Backes D et al., Stroke 2015;46:1221-6.

## Chạy web server để xem thử

Trang đọc dữ liệu bằng `fetch()` nên không mở được bằng double-click. Mở terminal tại thư mục `my-library` (gốc, không phải `med-atlas`):

```bash
python3 -m http.server 8000
```

Rồi mở `http://localhost:8000/med-atlas/4-brain-aneurysm.html`. Sau khi sửa, tải lại bằng Ctrl+F5.
