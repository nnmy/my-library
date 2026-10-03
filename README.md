# my-library

(Tên cũ: my-tools.) Bộ sưu tập các tiện ích nhỏ và sáng tác, mỗi mục là một trang HTML chạy trong trình duyệt.
Trang chủ chia thành hai mục: **Các tiện ích** và **Sáng tác**.

```
my-library/
├── index.html                 Trang chủ: hai mục "Các tiện ích" và "Sáng tác"
├── common/                    Navbar + footer dùng chung (không phải thư viện của công cụ)
│   ├── site.css               Navbar + footer, cùng giao diện với https://nnmy.github.io/
│   └── site.js                Minigame chú mèo ở footer (dùng chung cho index.html và luu-niem/)
├── foto-batch/                Tiện ích: metadata, watermark, collage
├── luu-niem/                  Sáng tác: Lưu niệm (thơ, giải thưởng, hình vẽ, hình chụp)
│   ├── index.html
│   └── lib/                   Ảnh của trang: awards/, drawings/, photos/
├── chuyen-hoi-do/             Sáng tác: Chuyện hồi đó, một hồi ức qua ảnh (một file, tự chứa)
│   └── index.html
└── nes-pixelator/             Một thư mục cho mỗi công cụ
    ├── index.html
    └── lib/                   Thư viện và model riêng của công cụ này
        ├── transformers.min.js
        ├── ort-wasm-simd-threaded.jsep.mjs
        ├── ort-wasm-simd-threaded.jsep.wasm
        ├── LICENSE-transformers.js.txt
        ├── README.txt
        └── models/briaai/RMBG-1.4/onnx/model_quantized.onnx
```

## Chạy

Mở bằng máy chủ cục bộ (cần cho phần khử nền AI vì trình duyệt chặn đọc file trong `lib/` khi mở bằng `file://`):

```
cd my-library
python -m http.server 8000
```

Rồi mở http://localhost:8000

## Thêm công cụ mới

1. Tạo thư mục con, ví dụ `my-new-tool/`, với file `index.html` bên trong.
2. Nếu công cụ cần thư viện riêng, đặt trong `my-new-tool/lib/` (mỗi công cụ tự chứa, không dùng chung).
3. Thêm một phần tử vào `items` của mục phù hợp trong mảng `SECTIONS` (đầu phần `<script>` của `index.html` ở thư mục gốc). Link ra trang bên ngoài (http/https) tự có dấu ↗.
4. (Tùy chọn) Trong công cụ mới, thêm link quay về trang chủ: `<a href="../index.html">← Trang chủ</a>`.
5. Navbar và footer (minigame) nằm trong `common/`, dùng cho `index.html` và các trang sáng tác muốn có minigame (ví dụ `luu-niem/`):
   thêm `<link rel="stylesheet" href="../common/site.css">`, markup `<nav class="site-nav">` và `<footer class="site-foot">` (chép từ `luu-niem/index.html`),
   rồi `<script src="../common/site.js" defer></script>`. Các công cụ giữ giao diện tối riêng. Mỗi trang chỉ cần thêm icon: `<link rel="icon" type="image/svg+xml" href="https://nnmy.github.io/lib/logo-my.svg">`.

## Lưu niệm: cập nhật nội dung

Xem khối chú thích "HOW TO EDIT" ở đầu `luu-niem/index.html`. Tóm tắt:
- Giải thưởng: thêm một `<article class="award">` vào `#awardList`; tab tự tạo.
- Hình vẽ / hình chụp: sửa mảng `DRAWINGS` / `PHOTOS` ở cuối file; ảnh đặt trong `luu-niem/lib/`.
- Ngày chụp, máy ảnh, ống kính được đọc từ EXIF của ảnh JPEG (cần mở qua máy chủ, không phải `file://`).

## Giấy phép

- Transformers.js: Apache-2.0 (`nes-pixelator/lib/LICENSE-transformers.js.txt`). ONNX Runtime Web: MIT.
- Model RMBG-1.4 (BRIA AI): giấy phép `bria-rmbg-1.4`, **chỉ dùng phi thương mại**.
