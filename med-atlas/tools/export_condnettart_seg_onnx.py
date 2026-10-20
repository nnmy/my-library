#!/usr/bin/env python3
"""Chuyển mạng phân vùng của CondNetTART (Model10) sang ONNX cho trang med-atlas/head-seg.html.

Đầu vào: APP_BRAINE/vendor/isocond/nets/condnet_tart_model10.py (định nghĩa UNet_2D)
         APP_BRAINE/vendor/isocond/models/condnettart_seg.pth  (trọng số phân vùng, 15 lớp)
Đầu ra:  lib/models/condnettart_seg.onnx
         vào: t1, t2 float32 [n, 1, 256, 256] (giá trị 0..1); ra: label uint8 [n, 256, 256] (argmax của 15 lớp)

Script so kết quả ONNX với PyTorch trên vài lát ngẫu nhiên và báo tỉ lệ nhãn trùng (phải là 1.0).

Cách chạy (Python có torch; cài thêm onnx và onnxruntime):
    pip install onnx onnxruntime
    python export_condnettart_seg_onnx.py \
        --net ~/Documents/APP_BRAINE/vendor/isocond/nets/condnet_tart_model10.py \
        --ckpt ~/Documents/APP_BRAINE/vendor/isocond/models/condnettart_seg.pth \
        --out ../lib/models/condnettart_seg.onnx

File mô hình chỉ để dùng trên máy: KHÔNG đưa lên GitHub.
"""
import argparse
import importlib.util
import time

import numpy as np
import torch


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--net', required=True, help='condnet_tart_model10.py')
    ap.add_argument('--ckpt', required=True, help='condnettart_seg.pth')
    ap.add_argument('--out', required=True)
    a = ap.parse_args()

    spec = importlib.util.spec_from_file_location('m10', a.net)
    m10 = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m10)
    net = m10.UNet_2D(num_classes=15, transformer_count=6)
    net.load_state_dict(torch.load(a.ckpt, map_location='cpu'))
    net.eval()

    class Seg(torch.nn.Module):
        def __init__(self, n):
            super().__init__()
            self.n = n

        def forward(self, t1, t2):
            return torch.argmax(self.n.segment(t1, t2), dim=1).to(torch.uint8)

    seg = Seg(net).eval()
    x = torch.rand(2, 1, 256, 256)
    torch.onnx.export(seg, (x, x), a.out, input_names=['t1', 't2'], output_names=['label'], opset_version=17,
                      dynamic_axes={'t1': {0: 'n'}, 't2': {0: 'n'}, 'label': {0: 'n'}}, dynamo=False)

    import onnxruntime as ort
    s = ort.InferenceSession(a.out, providers=['CPUExecutionProvider'])
    rng = np.random.default_rng(0)
    smooth = lambda: torch.nn.functional.avg_pool2d(torch.tensor(rng.random((4, 1, 256, 256)), dtype=torch.float32), 9, 1, 4)
    t1, t2 = smooth(), smooth()
    with torch.no_grad():
        ref = seg(t1, t2).numpy()
    t = time.time()
    got = s.run(None, {'t1': t1.numpy(), 't2': t2.numpy()})[0]
    print(f'nhãn trùng với PyTorch: {(ref == got).mean():.4f}; ONNX CPU {(time.time() - t) / 4:.3f} s/lát')


if __name__ == '__main__':
    main()
