#!/usr/bin/env python3
"""
Chuyển mô hình 3D từ bộ IntrA sang định dạng nhị phân gọn cho trang 4-brain-aneurysm.html.

    python3 prepare_intra.py --intra đường/dẫn/IntrA --out ../lib/data/aneurysm3d

Mỗi ca tạo một file <id>.bin (little-endian):
    uint32 nV, uint32 nF
    float32[nV*3]  tọa độ (đã dời về tâm, giữ nguyên đơn vị gốc)
    uint8[nV]      nhãn: 0 mạch, 1 túi phình, 2 cổ túi (vùng ranh giới chuyên gia vẽ)
    (đệm tới bội số 4)
    uint32[nF*3]   chỉ số tam giác
và ghi thông số (kích thước ước tính...) vào cases-auto.json. Nội dung chữ viết tay nằm ở cases.json.

Cần: pip install numpy scipy
"""
import argparse, json, os, struct
import numpy as np
from scipy.spatial import cKDTree, ConvexHull

# Danh sách ca. kind: segment = đoạn có chú giải; complete = toàn bộ mạch não, tô nhãn bằng các đoạn cùng bệnh nhân;
# healthy = đoạn mạch khỏe sinh tự động.
CASES = [
    # Lưu ý: AN42-1, AN42-2, AN42-3 là CÙNG MỘT túi phình được cắt ở ba phạm vi khác nhau (tâm túi trùng nhau),
    # không phải ba túi phình. Chỉ dùng AN42-3 (phạm vi rộng nhất, thấy cả nhánh mạch).
    {"id": "an42-full", "kind": "complete", "src": "complete/ArteryObjAN42.obj", "segments": ["AN42-3"]},
    {"id": "an42", "kind": "segment", "src": "AN42-3"},
    {"id": "an9", "kind": "segment", "src": "AN9-1"},
    {"id": "an204", "kind": "segment", "src": "AN204"},
    {"id": "an212", "kind": "segment", "src": "AN212"},
    {"id": "healthy-42", "kind": "healthy", "src": "generated/vessel/obj/ArteryObjAN42-15.obj"},
]


def load_obj(p):
    V, F = [], []
    with open(p) as fh:
        for l in fh:
            if l.startswith('v '):
                V.append([float(x) for x in l.split()[1:4]])
            elif l.startswith('f '):
                idx = [int(x.split('/')[0]) - 1 for x in l.split()[1:]]
                for k in range(1, len(idx) - 1):          # đa giác -> tam giác
                    F.append([idx[0], idx[k], idx[k + 1]])
    return np.asarray(V, np.float64), np.asarray(F, np.int64)


def seg_paths(root, name):
    return (os.path.join(root, 'annotated', 'obj', f'{name}_full.obj'),
            os.path.join(root, 'annotated', 'ad', f'{name}-_norm.ad'))


def max_extent(P):
    if len(P) < 2:
        return 0.0
    if len(P) > 4:
        try:
            P = P[ConvexHull(P).vertices]
        except Exception:
            pass
    d = np.sqrt(((P[:, None, :] - P[None, :, :]) ** 2).sum(-1))
    return float(d.max())


def write_bin(path, V, F, L):
    with open(path, 'wb') as fh:
        fh.write(struct.pack('<II', len(V), len(F)))
        fh.write(V.astype('<f4').tobytes())
        fh.write(L.astype(np.uint8).tobytes())
        fh.write(b'\0' * ((4 - len(V) % 4) % 4))
        fh.write(F.astype('<u4').tobytes())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--intra', required=True, help='thư mục IntrA (chứa annotated/, complete/, generated/)')
    ap.add_argument('--out', required=True)
    ap.add_argument('--snap', type=float, default=0.6, help='khoảng cách tối đa để gán nhãn lên mô hình toàn bộ')
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    auto = {}
    for c in CASES:
        if c['kind'] == 'segment':
            o, ad = seg_paths(a.intra, c['src'])
            V, F = load_obj(os.path.join(a.intra, o) if not os.path.isabs(o) else o)
            D = np.loadtxt(ad)
            if len(D) != len(V) or np.abs(D[:, :3] - V).max() > 1e-3:
                raise SystemExit(f'{c["src"]}: file .ad không khớp thứ tự đỉnh của .obj')
            L = D[:, 6].astype(np.uint8)
        elif c['kind'] == 'complete':
            V, F = load_obj(os.path.join(a.intra, c['src']))
            SV, SL = [], []
            for s in c['segments']:
                D = np.loadtxt(seg_paths(a.intra, s)[1]); SV.append(D[:, :3]); SL.append(D[:, 6])
            SV, SL = np.vstack(SV), np.concatenate(SL).astype(np.uint8)
            dist, idx = cKDTree(SV).query(V)
            L = np.where(dist <= a.snap, SL[idx], 0).astype(np.uint8)
        else:
            V, F = load_obj(os.path.join(a.intra, c['src']))
            L = np.zeros(len(V), np.uint8)
        ctr = (V.min(0) + V.max(0)) / 2
        V = V - ctr
        info = {'vertices': int(len(V)), 'triangles': int(len(F)), 'extent': round(float(np.ptp(V, 0).max()), 1)}
        if c['kind'] == 'segment':
            info['sac_max'] = round(max_extent(V[L > 0]), 1)      # túi + cổ
            info['neck_width'] = round(max_extent(V[L == 2]), 1)
        write_bin(os.path.join(a.out, c['id'] + '.bin'), V, F, L)
        info['bytes'] = os.path.getsize(os.path.join(a.out, c['id'] + '.bin'))
        auto[c['id']] = info
        print(c['id'], info)
    with open(os.path.join(a.out, 'cases-auto.json'), 'w', encoding='utf-8') as fh:
        json.dump(auto, fh, ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main()
