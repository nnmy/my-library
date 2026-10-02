FOTO BATCH - công cụ ảnh hàng loạt (một file HTML)

Cấu trúc (cùng kiểu với nes-pixelator):
  foto-batch/
    index.html                 Công cụ
    README.txt
    lib/
      piexif.js                piexifjs 1.0.6 (MIT) - đọc/ghi EXIF cho JPEG
      LICENSE-piexifjs.txt

Chạy: mở index.html bằng trình duyệt hiện đại (Chrome, Edge, Firefox, Safari). Không cần máy chủ cục bộ
nhưng chạy qua http://localhost (python -m http.server 8000 trong thư mục my-tools) vẫn được.
Mọi xử lý diễn ra trong trình duyệt, ảnh không bị gửi đi đâu.

Tính năng
  - Chọn thư mục / nhiều ảnh / kéo-thả (giữ Shift khi thả để thêm vào danh sách hiện có).
  - Đặt metadata: Tác giả, liên hệ, nơi chụp (địa điểm, thành phố, quốc gia), điều khoản sử dụng
    (mặc định "Phải ghi danh tác giả khi sử dụng."). Ô trống thì không ghi.
    JPEG: ghi XMP (hợp nhất với XMP cũ, không nén lại ảnh) và EXIF Artist. PNG: ghi XMP. Định dạng khác bị bỏ qua.
  - Chèn watermark: văn bản (font, cỡ chữ, màu, đậm/nghiêng/đổ bóng) / ảnh / URL ảnh.
    Mỗi lần chạy xử lý một nhóm: ảnh ngang HOẶC ảnh đứng (chọn ở "Áp dụng cho"), mỗi nhóm có thiết lập riêng
    (lề phải/dưới, độ trong suốt, resize %, kích thước với watermark ảnh). EXIF gốc luôn được giữ (kể cả GPS).
    Ảnh xuất ra giữ định dạng gốc (GIF/BMP/AVIF không mã hóa lại được nên xuất PNG).
  - Thông số watermark: "Lưu ra file" tạo file JSON (nhóm ngang/đứng, nguồn văn bản/ảnh/URL, lề, độ trong suốt,
    resize, bộ lọc, hậu tố). "Nạp từ file" tự chuyển đúng nhóm và đúng nguồn. Nguồn "ảnh" được nhúng trong JSON
    (thu nhỏ tối đa 800 px); nguồn "URL" chỉ lưu địa chỉ và tải lại khi nạp; font tải từ file không lưu được.
  - Bộ lọc ảnh (watermark và collage): Đen trắng, Sepia, Cổ điển, Phim, Rực rỡ, Ấm, Lạnh, Matte, Kịch tính,
    kèm thanh cường độ. Tự xử lý từng pixel nên chạy ở mọi trình duyệt; ảnh rất lớn sẽ xử lý chậm hơn.
    Trong collage, bộ lọc áp dụng cho từng ảnh (viền và màu nền không đổi).
  - Collage: lưới, ảnh chính + ảnh phụ, giữ nguyên tỷ lệ; chọn kích thước, số lượng ảnh (lấy từ đầu danh sách),
    số cột, viền, màu nền, khoảng cách, bo góc.
  - JPEG xuất ra có chất lượng cố định 90%.
  - Nhiều file được đóng gói thành ZIP (giữ cấu trúc thư mục); một file thì tải thẳng.

Thêm vào trang chủ (my-tools/index.html): dán mục sau vào mảng TOOLS
  {
    name: "Foto Batch",
    href: "foto-batch/index.html",
    desc: "Đặt metadata, chèn watermark, lọc màu và tạo collage cho cả thư mục ảnh.",
    tags: ["Ảnh", "Hàng loạt", "Metadata"],
    iconColors: { o: "#1d1d21", g: "#6b7280", l: "#cfd3da", b: "#3b82c4", r: "#d8312a" },
    icon: [
      "...oooo.....",
      "oooooooooooo",
      "oggggggggrgo",
      "ogggoooogggo",
      "oggolllloggo",
      "oggolbbloggo",
      "ogggoooogggo",
      "oggggggggggo",
      "oooooooooooo",
    ],
  },

Giới hạn cần biết
  - Ảnh được xử lý ở không gian màu sRGB (canvas): không chuyển đổi hồ sơ ICC/CMYK, không hỗ trợ ảnh RAW/HEIC.
  - Ảnh watermark từ URL chỉ tải được nếu máy chủ cho phép CORS.
  - Chỉ chèn metadata XMP/EXIF; chưa ghi IPTC-IIM. WebP xuất ra chưa có metadata.
  - ZIP không nén (ảnh vốn đã nén), tổng dưới ~4 GB mỗi lần.
