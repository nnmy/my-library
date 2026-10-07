Thư mục lib/ của công cụ foto-album (dàn trang album ảnh để in)

  foto-album/
    index.html
    lib/
      album.css             Giao diện
      album-core.js         Dữ liệu, khổ trang, mẫu trang, cắt/xoay ảnh, lọc HTML chú thích,
                            EXIF, lưu IndexedDB, hoàn tác
      album-render.js       Vẽ trang (dùng chung cho trình chỉnh sửa và mọi định dạng xuất)
      album-export.js       PDF (hộp thoại in / tải trực tiếp), DOCX, PNG ZIP, file dự án
      album-ui.js           Điều khiển giao diện
      fflate.umd.js         fflate 0.8.3 (MIT)       nén / giải nén ZIP
      exifr.lite.umd.js     exifr 7.1.3 (MIT)        đọc EXIF
      pdf-lib.min.js        pdf-lib 1.17.1 (MIT)     tạo PDF trực tiếp
      docx.iife.js          docx 9.9.0 (MIT)         tạo file Word
      licenses/             Giấy phép các thư viện trên

Album chỉ tồn tại khi trang đang mở (không tải lên đâu cả):
- Ảnh được giữ tạm trong IndexedDB trong lúc trang mở; không lưu bố cục.
- Đóng tab, đóng cửa sổ hoặc tải lại trang: album mất, lần mở sau là album mới.
  Ảnh tạm của trang đã đóng được dọn khi công cụ được mở lần sau.
- Nhiều tab mở cùng lúc là các album riêng, không xoá lẫn nhau (Web Locks).
- Khi rời trang mà chưa lưu file dự án, trình duyệt sẽ hỏi lại.
Muốn giữ album: "Lưu file dự án" (Ctrl+S) để có bản .album.zip, sau này dùng
"Mở file dự án…" để tiếp tục.

Nhóm ảnh: tạo bằng nút "Tạo nhóm…" rồi bấm chọn từng ảnh đã thêm; mỗi ảnh thuộc
tối đa một nhóm. "Dàn lại trang theo nhóm" xếp trang mở đầu + trang ảnh cho mỗi nhóm.

Chạy: mở bằng máy chủ cục bộ như các công cụ khác (python -m http.server 8000),
hoặc mở trực tiếp index.html. Không cần Internet.

Giới hạn hiện tại:
- Ảnh HEIC chưa đọc được; hãy chuyển sang JPEG.
- DOCX không có bleed; Word có thể hiển thị khác PDF đôi chút.
- Không có dấu cắt (crop marks), không xuất CMYK.
- Kích thước giấy khi in qua hộp thoại chính xác nhất trên Chrome/Edge.
