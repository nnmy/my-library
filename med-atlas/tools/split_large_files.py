#!/usr/bin/env python3
"""Cắt một file lớn thành nhiều phần nhỏ (mặc định <= 20 MB) để đưa lên nơi giới hạn dung lượng mỗi file (ví dụ 25 MB).
File gốc được giữ nguyên. Trang head-seg.html tìm file gốc trước; không thấy thì tải các phần và ghép lại.

Đầu ra trong --out:
    <tên>.part000, <tên>.part001, ...
    <tên>.json   danh sách phần: {"name", "size", "sha256", "parts": [{"file", "size"}]}
                 (trang kiểm tra kích thước và SHA-256 sau khi ghép)

Cách chạy (sau mỗi lần tạo lại mô hình hoặc đổi bản onnxruntime-web):
    cd my-library/med-atlas/tools
    python split_large_files.py ../lib/models/condnettart_seg.onnx --out ../lib/models-split
    python split_large_files.py ../lib/vendor/onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm \\
        --out ../lib/vendor/onnxruntime-web-split \\
        --with ../lib/vendor/onnxruntime-web/ort.webgpu.min.js ../lib/vendor/onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs \\
               ../lib/vendor/onnxruntime-web/LICENSE
--with: các file nhỏ chép nguyên vào --out, để thư mục phần nhỏ tự đủ (onnxruntime-web cần .js và .mjs nằm cùng chỗ).
"""
import argparse
import hashlib
import json
import shutil
from pathlib import Path


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('file', type=Path)
    ap.add_argument('--out', required=True, type=Path)
    ap.add_argument('--part-mb', type=float, default=20, help='dung lượng tối đa mỗi phần, MB (10^6 byte)')
    ap.add_argument('--with', dest='extra', nargs='*', type=Path, default=[], help='file nhỏ chép nguyên vào --out')
    a = ap.parse_args()

    data = a.file.read_bytes()
    step = int(a.part_mb * 1e6)
    a.out.mkdir(parents=True, exist_ok=True)
    for old in a.out.glob(a.file.name + '.part*'):          # xoá các phần cũ (số phần có thể đổi)
        old.unlink()
    parts = []
    for i in range(0, len(data), step):
        name = f'{a.file.name}.part{i // step:03d}'
        (a.out / name).write_bytes(data[i:i + step])
        parts.append({'file': name, 'size': len(data[i:i + step])})
    manifest = {'name': a.file.name, 'size': len(data), 'sha256': hashlib.sha256(data).hexdigest(), 'parts': parts}
    (a.out / (a.file.name + '.json')).write_text(json.dumps(manifest, indent=1) + '\n', encoding='utf-8')
    for f in a.extra:
        shutil.copy2(f, a.out / f.name)
    print(f'{a.file.name}: {len(data) / 1e6:.1f} MB -> {len(parts)} phần trong {a.out}'
          + (f"; chép thêm {', '.join(f.name for f in a.extra)}" if a.extra else ''))


if __name__ == '__main__':
    main()
