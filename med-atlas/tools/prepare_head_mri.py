#!/usr/bin/env python3
"""Tạo dữ liệu cho trang med-atlas/head-mri.html (MRI đầu: mô và độ dẫn điện).

Nguồn: một kết quả chạy CondNetTART (Model10) ở 10 kHz trên một người của bộ IXI, ví dụ
IXI258_condnettart_10kHz.zip. Cần các file (tiền tố <case>_condnettart_10kHz_):
    input_T1_1mm.nii.gz, input_T2_1mm.nii.gz    T1, T2 trên lưới 1 mm, RAS, uint8
    conductivity_map_1mm.nii.gz                 độ dẫn điện dự đoán (S/m), cùng lưới
    segmentation.nii.gz                         nhãn mô 0..14 trên lưới gốc của IXI
    tissue_conductivity_10khz.csv               giá trị tham chiếu của từng mô (S/m)

Nhãn mô được đưa sang lưới 1 mm bằng nội suy láng giềng gần nhất (theo ma trận affine).
Nhiễu nền ngoài đầu được xoá, rồi khối được cắt bỏ vùng trống quanh đầu. Đầu ra (ghi đè), x nhanh nhất, RAS, 1 mm:
    t1.u8.gz, t2.u8.gz, seg.u8.gz   mỗi voxel 1 byte
    cond.u16.gz                     độ dẫn điện × 1000 (uint16 little-endian), tức bước 0,001 S/m
    meta.json                       kích thước, gốc tọa độ, cửa sổ hiển thị, thống kê từng mô

Cách chạy (dữ liệu gốc để ngoài my-library):
    pip install nibabel numpy scipy
    python prepare_head_mri.py --src ~/mri-source/IXI258_condnettart_10kHz.zip --out ../lib/data/head-mri
--src nhận file .zip hoặc thư mục đã giải nén.
"""
import argparse
import csv
import gzip
import json
import tempfile
import zipfile
from pathlib import Path

import nibabel as nib
import numpy as np
from scipy import ndimage

COND_SCALE = 1000           # cond.u16 = round(S/m * COND_SCALE): bước 0,001 S/m
MARGIN = 3


def find(src: Path, suffix: str) -> Path:
    hits = sorted(src.rglob('*' + suffix))
    if not hits:
        raise SystemExit(f'Không tìm thấy *{suffix} trong {src}')
    return hits[0]


def to_ras(img):
    return nib.as_closest_canonical(img)


def seg_on_grid(seg_img, ref_img) -> np.ndarray:
    """Nhãn của seg_img lấy mẫu tại tâm mỗi voxel của ref_img (láng giềng gần nhất)."""
    seg = np.asanyarray(seg_img.dataobj).astype(np.uint8)
    m = np.linalg.inv(seg_img.affine) @ ref_img.affine
    return ndimage.affine_transform(seg, m[:3, :3], offset=m[:3, 3], output_shape=ref_img.shape[:3],
                                    order=0, mode='constant', cval=0).astype(np.uint8)


def window(v: np.ndarray, mask: np.ndarray):
    lo, hi = np.percentile(v[mask & (v > 0)], [0.5, 99.5])
    return [int(lo), int(max(hi, lo + 1))]


def write_gz(path: Path, arr: np.ndarray) -> int:
    raw = np.ascontiguousarray(arr.transpose(2, 1, 0)).tobytes()   # (x, y, z) -> x nhanh nhất
    with open(path, 'wb') as fo, gzip.GzipFile(fileobj=fo, mode='wb', compresslevel=9, mtime=0) as f:
        f.write(raw)
    return path.stat().st_size


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--src', required=True, type=Path, help='file .zip hoặc thư mục kết quả CondNetTART')
    ap.add_argument('--out', required=True, type=Path)
    ap.add_argument('--margin', type=int, default=MARGIN)
    a = ap.parse_args()

    with tempfile.TemporaryDirectory() as tmp:
        src = a.src
        if src.suffix == '.zip':
            with zipfile.ZipFile(src) as z:
                z.extractall(tmp)
            src = Path(tmp)
        t1i = to_ras(nib.load(find(src, '_input_T1_1mm.nii.gz')))
        t2i = to_ras(nib.load(find(src, '_input_T2_1mm.nii.gz')))
        ci = to_ras(nib.load(find(src, '_conductivity_map_1mm.nii.gz')))
        si = nib.load(find(src, '_segmentation.nii.gz'))
        with open(find(src, '_tissue_conductivity_10khz.csv'), newline='') as f:
            ref = {int(r['tissue_id']): (r['tissue_name'], float(r['conductivity_s_per_m'])) for r in csv.DictReader(f)}
        case = find(src, '_segmentation.nii.gz').name.split('_')[0]

        for im in (t2i, ci):
            if im.shape != t1i.shape or not np.allclose(im.affine, t1i.affine, atol=1e-3):
                raise SystemExit('T1, T2 và độ dẫn điện 1 mm phải cùng lưới voxel.')
        if not np.allclose(np.abs(np.diag(t1i.affine)[:3]), 1, atol=1e-3):
            raise SystemExit('Lưới T1 phải là 1 mm.')

        t1 = np.asanyarray(t1i.dataobj).astype(np.uint8)
        t2 = np.asanyarray(t2i.dataobj).astype(np.uint8)
        cond = np.nan_to_num(np.asanyarray(ci.dataobj).astype(np.float32))
        seg = seg_on_grid(si, t1i)

    # mặt nạ đầu = vùng có nhãn mô, nới 2 voxel và lấp lỗ; ngoài đầu (nhiễu nền) đặt về 0
    head = ndimage.binary_dilation(seg > 0, iterations=2)
    head = np.stack([ndimage.binary_fill_holes(s) for s in head])
    t1[~head] = 0
    t2[~head] = 0
    cond[~head] = 0
    # cắt vùng trống quanh đầu
    nz = np.argwhere(head)
    lo = np.maximum(nz.min(0) - a.margin, 0)
    hi = np.minimum(nz.max(0) + a.margin + 1, head.shape)
    sl = tuple(slice(l, h) for l, h in zip(lo, hi))
    t1, t2, cond, seg, head = t1[sl], t2[sl], cond[sl], seg[sl], head[sl]
    origin = (t1i.affine @ np.r_[lo, 1])[:3]
    dims = list(seg.shape)

    cond_u16 = np.clip(np.rint(cond * COND_SCALE), 0, 65535).astype('<u2')
    a.out.mkdir(parents=True, exist_ok=True)
    files = {'t1': 't1.u8.gz', 't2': 't2.u8.gz', 'seg': 'seg.u8.gz', 'cond': 'cond.u16.gz'}
    nbytes = {
        't1': write_gz(a.out / files['t1'], t1),
        't2': write_gz(a.out / files['t2'], t2),
        'seg': write_gz(a.out / files['seg'], seg),
        'cond': write_gz(a.out / files['cond'], cond_u16),
    }

    # thống kê từng mô: thể tích, độ dẫn điện dự đoán, giá trị tham chiếu, điểm đại diện
    tissues = {}
    for k, (name, sigma) in sorted(ref.items()):
        if k == 0:
            continue
        m = seg == k
        n = int(m.sum())
        e = {'name': name, 'ref': sigma, 'voxels': n}
        if n:
            v = cond[m]
            e.update(mean=round(float(v.mean()), 4), sd=round(float(v.std()), 4),
                     median=round(float(np.median(v)), 4),
                     p5=round(float(np.percentile(v, 5)), 4), p95=round(float(np.percentile(v, 95)), 4))
            # voxel của mô gần tâm khối của mô nhất (tâm có thể rơi ra ngoài mô, ví dụ hộp sọ)
            pts = np.argwhere(m)
            c = pts.mean(0)
            e['seed'] = [int(x) for x in pts[np.argmin(((pts - c) ** 2).sum(1))]]
        tissues[str(k)] = e

    meta = {
        'case': case, 'model': 'CondNetTART Model10', 'frequency_hz': 10000,
        'dims': dims, 'origin_mm': [round(float(x), 2) for x in origin], 'voxel_mm': 1,
        'window': {'t1': window(t1, head), 't2': window(t2, head)},
        'cond_scale': COND_SCALE, 'cond_max': 2.0, 'unit': 'S/m',
        'files': files, 'bytes': nbytes, 'tissues': tissues,
    }
    (a.out / 'meta.json').write_text(json.dumps(meta, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')

    print('case', case, 'dims', dims, 'origin', meta['origin_mm'], 'window', meta['window'])
    for k, n in nbytes.items():
        print(f'{k} {n // 1024} KB')
    print('mô: thể tích (mL), σ dự đoán trung vị / tham chiếu (S/m)')
    for k, e in tissues.items():
        print(f"  {k:>2} {e['name']:<30} {e['voxels'] / 1000:7.1f}  {e.get('median', float('nan')):.3f} / {e['ref']:.3f}")


if __name__ == '__main__':
    main()
