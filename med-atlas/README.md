# Dữ liệu MRI não (`med-atlas/lib/data/brain-mri/`)

> Trang X-quang ngực (`2-chest-xray.html`) có hướng dẫn riêng: `README-chest-xray.md`.
>
> Trang Điện tâm đồ (`3-ecg.html`, trình xem `lib/ecg.js`, dữ liệu trong `lib/data/ecg/`) có hướng dẫn riêng: `README-ecg.md`.
>
> Trang MRI đầu: mô và độ dẫn điện (`head-mri.html`) có hướng dẫn riêng: `README-head-mri.md`.
>
> Trang phân vùng mô đầu (`head-seg.html`, không liệt kê, chỉ dùng trên máy) có hướng dẫn riêng: `README-head-seg.md`.
>
> Trang Xem ảnh NIfTI (`view_nifti.html`, mục Tiện ích; trình xem `lib/niftiview.js` + `lib/niftiview.css`) không cần dữ liệu hay công cụ Python: người dùng tự chọn file trên máy. Ghi chú định dạng và cách hoạt động nằm ở đầu `lib/niftiview.js`.
>
> Trang Xem file VTK/PLY (`view_mesh.html`, mục Tiện ích; trình xem `lib/meshview.js` + `lib/meshview.css`, dùng lại khung của `lib/niftiview.css`) cũng không cần dữ liệu hay Python: người dùng tự chọn file lưới .vtk (VTK legacy) / .ply trên máy. Các định dạng đọc được, quy ước hệ tọa độ (RAS / LPS từ header của 3D Slicer) và cách tính số đo ghi ở đầu `lib/meshview.js`. Mô hình minh họa hiện lúc mở trang là `lib/data/mesh-demo/head-surface-demo.ply` (bề mặt đầu, LPS, đã giảm còn khoảng 8 000 tam giác); muốn đổi hoặc tắt, sửa tham số `demo` trong `view_mesh.html`. Minh họa cần chạy qua web server như các trang khác; mở bằng `file://` thì trang chỉ chờ người dùng chọn file.
>
> Mục "Bệnh não" (trình xem `lib/compare.js`, dữ liệu trong `lib/data/brain-disease/`) có hướng dẫn riêng: `README-brain-disease.md`.

Thư mục này chứa dữ liệu cho trang `med-atlas/1-brain-mri.html`. Hướng dẫn gồm hai phần:

1. **Tạo lại dữ liệu bằng Python.** Chỉ cần khi đổi template, đổi atlas hoặc sửa cách xử lý. Bình thường không phải làm.
2. **Chạy web server để xem trang trên máy.** Cần mỗi lần muốn xem thử trước khi đưa lên GitHub.

## Các file trong thư mục

| File | Nội dung | Tạo bởi |
|---|---|---|
| `t1.u8.gz` | Ảnh T1, mỗi voxel 1 byte (0..255), nén gzip | `prepare_brain_mri.py` |
| `t2.u8.gz` | Ảnh T2, cùng định dạng | `prepare_brain_mri.py` |
| `seg.u8.gz` | Nhãn phân vùng (0..107), cùng định dạng | `prepare_brain_mri.py` |
| `meta.json` | Kích thước khối, gốc tọa độ MNI, mức tham chiếu chất trắng/xám/dịch, cửa sổ hiển thị, điểm đại diện mỗi nhãn, dung lượng file | `prepare_brain_mri.py` |
| `labels.json` | Tên tiếng Việt/Anh, màu, đặc điểm, chức năng, ý nghĩa lâm sàng của từng cấu trúc | **Viết tay**, sửa trực tiếp |
| `COPYING-ICBM2009c.txt` | Ghi chú bản quyền gốc của template ICBM 2009c (giấy phép yêu cầu giữ kèm mọi bản sao) | Chép từ gói ICBM |
| `README.md` | File này | |

Khối ảnh có kích thước 193 × 225 × 188 voxel (sau khi cắt bỏ vùng trống), 1 mm mỗi voxel, hướng RAS: x tăng sang phải người bệnh, y tăng ra trước, z tăng lên trên. Voxel được xếp theo thứ tự x nhanh nhất, nghĩa là chỉ số = `x + nx*(y + ny*z)`. Chi tiết về các số nhãn nằm ở đầu file `tools/prepare_brain_mri.py`.

**Sửa nội dung chữ (tên, chức năng...) chỉ cần sửa `labels.json`, không cần chạy Python.** Script không đụng tới file này.

---

## 1. Tạo lại dữ liệu bằng Python

### Cài đặt (một lần)

Cần Python 3.9 trở lên.

```bash
pip install nibabel numpy scipy
```

Trên Windows, nếu lệnh `python` không chạy, hãy dùng `py`:

```powershell
py -m pip install nibabel numpy scipy
```

Nếu dùng bản ICBM định dạng **MINC2** (file `.mnc` thế hệ mới), cài thêm `h5py`. Bản MINC1 và NIfTI không cần.

### Tải dữ liệu gốc

| Gói | Nguồn | Cần những file |
|---|---|---|
| ICBM 2009c Nonlinear Symmetric (MINC1 hoặc NIfTI) | https://nist.mni.mcgill.ca/ (mục *ICBM 152 Nonlinear atlases 2009*) | `mni_icbm152_t1_tal_nlin_sym_09c`, `..._t2_...`, `..._t1_..._mask`, `..._wm_...`, `..._gm_...`, `..._csf_...` |
| CerebrA | https://gin.g-node.org/anamanera/CerebrA | `CerebrA.nii` |

Giải nén vào một thư mục bất kỳ **nằm ngoài** `my-library` để không đưa file gốc (vài trăm MB) lên GitHub. Ví dụ:

```
D:\mri-source\
  icbm\        (giải nén gói ICBM vào đây; có thư mục con cũng được, script tự tìm)
  CerebrA\CerebrA.nii
```

### Chạy script

Mở terminal tại `my-library/med-atlas/tools/` rồi chạy.

macOS / Linux:

```bash
python3 prepare_brain_mri.py --icbm ~/mri-source/icbm --cerebra ~/mri-source/CerebrA/CerebrA.nii --out ../lib/data/brain-mri
```

Windows (PowerShell):

```powershell
py prepare_brain_mri.py --icbm D:\mri-source\icbm --cerebra D:\mri-source\CerebrA\CerebrA.nii --out ..\lib\data\brain-mri
```

Các tham số:

| Tham số | Ý nghĩa |
|---|---|
| `--icbm` | Thư mục chứa các file ICBM (`.mnc`, `.nii` hoặc `.nii.gz`); tìm cả trong thư mục con |
| `--cerebra` | Đường dẫn tới `CerebrA.nii` |
| `--out` | Thư mục ghi kết quả; ghi đè `t1.u8.gz`, `t2.u8.gz`, `seg.u8.gz`, `meta.json` |
| `--margin` | Số voxel chừa lại quanh đầu khi cắt bỏ vùng trống (mặc định 3) |

Script chạy khoảng một phút. Khi xong, nó in ra kích thước khối và dung lượng các file, tương tự:

```
dims [193, 225, 188] origin [-96.0, -128.0, -78.0]
ref {'t1': {'wm': 238.0, 'gm': 180.0, 'csf': 66.0}, 't2': {'wm': 105.0, 'gm': 143.0, 'csf': 254.0}} window {...}
t1 3907 KB
t2 3569 KB
seg 329 KB
```

Kiểm tra nhanh rằng kết quả hợp lý:

- Ở mục `ref`, T1 phải có chất trắng (`wm`) > chất xám (`gm`) > dịch não tủy (`csf`).
- T2 thì ngược lại: `csf` > `gm` > `wm`.

Nếu thứ tự sai, có thể đã chọn nhầm file T1 và T2.

Sau khi chạy lại script, nhớ tải lại trang bằng **Ctrl+F5** (macOS: **Cmd+Shift+R**). Nếu không, trình duyệt có thể vẫn dùng bản cũ trong cache.

### Lỗi thường gặp

| Thông báo | Cách xử lý |
|---|---|
| `Không tìm thấy mni_icbm152_... trong ...` | Sai đường dẫn `--icbm`, hoặc thiếu file. Kiểm tra tên file có đúng dạng `..._tal_nlin_sym_09c` (bản **sym**, không phải asym). |
| `Các ảnh không cùng lưới voxel` | Dùng lẫn bản symmetric với asymmetric. CerebrA chỉ khớp với bản **symmetric 2009c**. |
| `ModuleNotFoundError: nibabel` | Chưa cài thư viện, hoặc `pip` cài cho một bản Python khác. Dùng `python -m pip install ...` (hoặc `py -m pip ...`) để chắc chắn cùng một Python. |

---

## 2. Chạy web server để xem trang trên máy

### Tại sao cần server

Trang đọc dữ liệu bằng `fetch()`. Khi mở file HTML bằng double-click (địa chỉ bắt đầu bằng `file://`), trình duyệt chặn `fetch()` vì lý do bảo mật. Trang sẽ hiện thông báo hướng dẫn thay vì ảnh.

Server ở đây chỉ là một server tĩnh trên chính máy bạn: không cài đặt gì cố định, không cần mạng, tắt terminal là dừng.

### Cách 1: Python (có sẵn nếu đã cài Python)

Mở terminal tại thư mục **`my-library`** (thư mục gốc, không phải `med-atlas`). Phải đứng ở đây vì trang dùng `../common/` cho navbar và footer.

macOS / Linux:

```bash
cd đường/dẫn/tới/my-library
python3 -m http.server 8000
```

Windows (PowerShell hoặc Command Prompt):

```powershell
cd D:\đường\dẫn\tới\my-library
py -m http.server 8000
```

Sau đó mở trình duyệt tại:

- Trang tra cứu: http://localhost:8000/med-atlas/1-brain-mri.html
- Trang chủ module: http://localhost:8000/med-atlas/index.html
- Trang chủ Library: http://localhost:8000/

Dừng server: nhấn **Ctrl+C** trong terminal.

Nếu cổng 8000 đang bận (lỗi `Address already in use`), đổi sang số khác, ví dụ `py -m http.server 8080`, rồi mở `http://localhost:8080/...`.

### Cách 2: Live Server trong VS Code

1. Cài extension **Live Server** (tác giả Ritwick Dey).
2. Mở thư mục `my-library` bằng *File > Open Folder*.
3. Bấm **Go Live** ở thanh trạng thái dưới cùng, rồi vào `med-atlas/1-brain-mri.html`.

Live Server tự tải lại trang khi bạn lưu file, tiện khi đang sửa `labels.json` hay CSS.

### Cách 3: Node.js (nếu đã có Node)

```bash
cd my-library
npx serve .        # lần đầu cần mạng để tải gói serve
```

---

## 3. Đưa lên GitHub Pages

Không cần thiết lập gì thêm: commit và push cả thư mục `med-atlas` như các module khác.

- GitHub Pages phục vụ file `.gz` nguyên trạng, và `atlas.js` tự giải nén trên trình duyệt. Code cũng tự nhận biết khi server đã giải nén sẵn.
- Mỗi file dữ liệu dưới 5 MB, xa giới hạn 100 MB của GitHub, nên không cần Git LFS.
- Không đưa thư mục dữ liệu gốc (ICBM, CerebrA) vào repo.

## 4. Giấy phép và trích dẫn

- **ICBM 2009c:** © 1993-2004 Louis Collins, McConnell Brain Imaging Centre, Montreal Neurological Institute, McGill University. Được phép sử dụng, sao chép, sửa đổi và phân phối, với điều kiện giữ ghi chú bản quyền kèm theo. Ghi chú nằm trong `COPYING-ICBM2009c.txt` cạnh dữ liệu; đừng xóa file này.
- **CerebrA:** CC0 1.0 (Public Domain).

Trích dẫn:

- Fonov et al., NeuroImage 2009;47:S102.
- Fonov et al., NeuroImage 2011;54(1):313-327.
- Manera et al., Scientific Data 2020;7(1).
