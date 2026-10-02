Thư mục lib/ của công cụ nes-pixelator (dùng cho tính năng "Khử nền (AI)")

  nes-pixelator/
    index.html
    lib/
      transformers.min.js                  Transformers.js 3.8.1 (Apache-2.0)
      ort-wasm-simd-threaded.jsep.mjs      ONNX Runtime Web (MIT)
      ort-wasm-simd-threaded.jsep.wasm
      models/briaai/RMBG-1.4/onnx/model_quantized.onnx
                                           Model RMBG-1.4 của BRIA AI, ~44 MB
                                           Giấy phép bria-rmbg-1.4: CHỈ PHI THƯƠNG MẠI

Nguồn model:
  https://huggingface.co/briaai/RMBG-1.4/resolve/main/onnx/model_quantized.onnx

Lưu ý: đường dẫn models/briaai/RMBG-1.4/onnx/ là bắt buộc, vì Transformers.js tự
ghép đường dẫn theo tên model. Nếu thiếu file, công cụ sẽ tự tải từ Hugging Face.

Chạy bằng web server cục bộ (xem README.md ở thư mục my-tools).
