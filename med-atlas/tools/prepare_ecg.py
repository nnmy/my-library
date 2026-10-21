#!/usr/bin/env python3
"""
Chuẩn bị dữ liệu cho trang Điện tâm đồ (3-ecg.html) từ bộ PTB-XL (PhysioNet, CC BY 4.0).

Script làm 4 việc:
  1. Tải ptbxl_database.csv và scp_statements.csv (một lần, lưu vào --src).
  2. Chọn mỗi bệnh một ca rõ ràng, cùng một người thường (ECG bình thường) cùng giới, tuổi gần nhất để đối chiếu.
  3. Tải đúng các file .hea/.dat 500 Hz của những ca đã chọn (mỗi ca khoảng 120 KB).
  4. Lọc trôi đường nền, tìm đỉnh R, tính nhịp trung bình và các số đo, rồi ghi vào --out:
       cases.json                 danh sách tab, thứ tự hiển thị, cặp ca bệnh / người thường
       <ca>/signal.i16.gz         12 chuyển đạo x N mẫu, int16, đơn vị µV, xếp theo chuyển đạo
       <ca>/meta.json             tuổi, giới, nhãn PTB-XL, đỉnh R, nhịp trung bình, mốc sóng, số đo
       <ca>/case.json             chữ hiển thị (tiêu đề, điểm cần tìm). CHỈ ghi khi chưa có, để giữ phần bạn đã sửa.

Cách chạy (cần numpy, scipy):
  python tools/prepare_ecg.py --src ../_ptbxl --out lib/data/ecg
  python tools/prepare_ecg.py --src ../_ptbxl --out lib/data/ecg --pick inferior-mi=12345 --pick afib=2345
  python tools/prepare_ecg.py --list inferior-mi --src ../_ptbxl      # in 15 ứng viên của một ca để tự chọn

Mốc sóng (P, QRS, T) và các số đo đều tính tự động bằng thuật toán đơn giản, chưa được bác sĩ duyệt.
"""
import argparse, ast, csv, gzip, json, math, os, sys, time, urllib.request
import numpy as np
from scipy import ndimage, signal

BASE = 'https://physionet.org/files/ptb-xl/1.0.3/'
LEADS = ['I', 'II', 'III', 'aVR', 'aVL', 'aVF', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6']
FS = 500

# ---------------------------------------------------------------------------------------------
# Các ca hiển thị, theo thứ tự tab. need: mã PTB-XL bắt buộc (độ tin cậy 100 với mã chẩn đoán).
# allow: mã chẩn đoán khác được phép có mặt (ngoài need). rhythm: mã nhịp bắt buộc.
# ---------------------------------------------------------------------------------------------
CASES = [
    dict(key='normal', need=['NORM'], allow=[], rhythm='SR', age=(25, 50), control=False),
    dict(key='inferior-mi', need=['IMI'], allow=[], rhythm='SR', control=True),
    dict(key='anterior-mi', need_any=['AMI', 'ASMI'], allow=['AMI', 'ASMI'], rhythm='SR', control=True),
    dict(key='afib', need=[], allow=['NORM', 'NDT', 'NST_'], rhythm='AFIB', control=True),
    dict(key='lbbb', need=['CLBBB'], allow=[], rhythm='SR', control=True),
    dict(key='lvh', need=['LVH'], allow=['ISC_', 'NDT', 'NST_'], rhythm='SR', control=True),
]

# Tên tiếng Việt cho các mã PTB-XL hay gặp; mã khác dùng mô tả tiếng Anh của scp_statements.csv.
SCP_VI = {
    'NORM': 'ECG bình thường', 'SR': 'nhịp xoang', 'AFIB': 'rung nhĩ', 'AFLT': 'cuồng nhĩ',
    'STACH': 'nhịp nhanh xoang', 'SBRAD': 'nhịp chậm xoang', 'SARRH': 'loạn nhịp xoang',
    'IMI': 'nhồi máu cơ tim thành dưới', 'AMI': 'nhồi máu cơ tim thành trước', 'ASMI': 'nhồi máu cơ tim trước vách',
    'ALMI': 'nhồi máu cơ tim trước bên', 'ILMI': 'nhồi máu cơ tim dưới bên', 'LMI': 'nhồi máu cơ tim thành bên',
    'IPMI': 'nhồi máu cơ tim dưới sau', 'IPLMI': 'nhồi máu cơ tim dưới sau bên', 'PMI': 'nhồi máu cơ tim thành sau',
    'CLBBB': 'block nhánh trái hoàn toàn', 'CRBBB': 'block nhánh phải hoàn toàn', 'ILBBB': 'block nhánh trái không hoàn toàn',
    'IRBBB': 'block nhánh phải không hoàn toàn', 'LAFB': 'block phân nhánh trái trước', 'LPFB': 'block phân nhánh trái sau',
    '1AVB': 'block nhĩ thất độ 1', 'IVCD': 'rối loạn dẫn truyền trong thất', 'WPW': 'hội chứng WPW',
    'LVH': 'phì đại thất trái', 'RVH': 'phì đại thất phải', 'LAO/LAE': 'lớn nhĩ trái', 'RAO/RAE': 'lớn nhĩ phải',
    'SEHYP': 'phì đại vách', 'NDT': 'biến đổi sóng T không đặc hiệu', 'NST_': 'biến đổi ST không đặc hiệu',
    'ISC_': 'thiếu máu cơ tim không đặc hiệu', 'ISCAL': 'thiếu máu cơ tim trước bên', 'ISCIN': 'thiếu máu cơ tim thành dưới',
    'ISCAS': 'thiếu máu cơ tim trước vách', 'ISCLA': 'thiếu máu cơ tim thành bên', 'ISCAN': 'thiếu máu cơ tim thành trước',
    'DIG': 'ảnh hưởng của digitalis', 'LNGQT': 'QT kéo dài', 'ABQRS': 'QRS bất thường', 'QWAVE': 'sóng Q bất thường',
    'LVOLT': 'điện thế thấp', 'HVOLT': 'điện thế cao', 'LOWT': 'sóng T thấp', 'INVT': 'sóng T âm', 'NT_': 'biến đổi sóng T',
    'TAB_': 'sóng T bất thường', 'STD_': 'ST chênh xuống', 'STE_': 'ST chênh lên', 'VCLVH': 'tiêu chuẩn điện thế phì đại thất trái',
    'PVC': 'ngoại tâm thu thất', 'PAC': 'ngoại tâm thu nhĩ', 'BIGU': 'nhịp đôi', 'TRIGU': 'nhịp ba', 'PACE': 'máy tạo nhịp',
}

# Chữ hiển thị mặc định của từng ca (ghi vào case.json nếu chưa có). Bạn sửa thẳng trong case.json.
TEXT = {
    'normal': dict(
        title={'vi': 'Bình thường', 'en': 'Normal ECG'},
        summary='Điện tâm đồ của một người lớn khỏe mạnh, nhịp xoang. Dùng tab này để làm quen hình dạng sóng P, phức bộ QRS, sóng T và cách đọc 12 chuyển đạo.',
        finds=[
            {'text': 'Nhịp xoang: mỗi QRS có một sóng P đi trước, P dương ở I, II, aVF và âm ở aVR; tần số 60–100 lần/phút.', 'leads': ['I', 'II', 'aVF', 'aVR']},
            {'text': 'Khoảng PR 120–200 ms; phức bộ QRS hẹp, dưới 120 ms.', 'leads': ['II']},
            {'text': 'Sóng R cao dần từ V1 tới V5 (tiến triển sóng R), chỗ R bằng S thường ở V3–V4.', 'leads': ['V1', 'V2', 'V3', 'V4', 'V5', 'V6']},
            {'text': 'Đoạn ST nằm ngang trên đường đẳng điện; sóng T cùng chiều QRS ở hầu hết chuyển đạo (T âm ở aVR là bình thường).', 'leads': ['I', 'II', 'V5', 'V6', 'aVR']},
        ]),
    'inferior-mi': dict(
        title={'vi': 'Nhồi máu cơ tim thành dưới', 'en': 'Inferior myocardial infarction'},
        summary='Vùng cơ tim ở mặt dưới của tim bị hoại tử, thường do tắc động mạch vành phải. Các chuyển đạo nhìn vào mặt dưới là II, III và aVF.',
        finds=[
            {'text': 'Sóng Q bệnh lý (rộng từ 40 ms, hoặc sâu hơn 1/4 sóng R) ở II, III, aVF.', 'leads': ['II', 'III', 'aVF']},
            {'text': 'Giai đoạn cấp: ST chênh lên ở II, III, aVF, kèm ST chênh xuống "soi gương" ở I, aVL. Giai đoạn sau: ST về đường đẳng điện, T có thể âm.', 'leads': ['II', 'III', 'aVF', 'I', 'aVL']},
            {'text': 'So với người thường: ở người thường, III có thể có sóng Q nhỏ đơn độc; sóng Q có ý nghĩa khi xuất hiện ở cả nhóm II, III, aVF.', 'leads': ['III']},
        ]),
    'anterior-mi': dict(
        title={'vi': 'Nhồi máu cơ tim thành trước', 'en': 'Anterior myocardial infarction'},
        summary='Vùng cơ tim mặt trước và vách liên thất bị hoại tử, thường do tắc động mạch liên thất trước (LAD). Các chuyển đạo nhìn vào vùng này là V1–V4.',
        finds=[
            {'text': 'Sóng Q hoặc dạng QS ở V1–V3 (có khi tới V4).', 'leads': ['V1', 'V2', 'V3', 'V4']},
            {'text': 'Mất tiến triển sóng R: R không cao dần từ V1 sang V4 như ở người thường.', 'leads': ['V1', 'V2', 'V3', 'V4', 'V5']},
            {'text': 'Giai đoạn cấp: ST chênh lên ở V1–V4; giai đoạn sau: T âm ở các chuyển đạo này.', 'leads': ['V1', 'V2', 'V3', 'V4']},
        ]),
    'afib': dict(
        title={'vi': 'Rung nhĩ', 'en': 'Atrial fibrillation'},
        summary='Tâm nhĩ không co bóp đều mà rung hỗn loạn, xung động xuống thất lúc nhanh lúc chậm. Đây là rối loạn nhịp kéo dài hay gặp nhất, làm tăng nguy cơ đột quỵ.',
        finds=[
            {'text': 'Khoảng RR không đều hoàn toàn, không theo quy luật nào. Dải nhịp DII ở cuối bản ghi cho thấy rõ nhất.', 'leads': ['II']},
            {'text': 'Không có sóng P; đường nền giữa các QRS lăn tăn (sóng f), thường rõ ở V1 và II.', 'leads': ['V1', 'II']},
            {'text': 'Phức bộ QRS thường vẫn hẹp vì dẫn truyền trong thất bình thường.', 'leads': ['V5', 'V6']},
        ]),
    'lbbb': dict(
        title={'vi': 'Block nhánh trái', 'en': 'Left bundle branch block'},
        summary='Nhánh trái của hệ dẫn truyền bị nghẽn nên thất trái được kích hoạt chậm, đi vòng qua thất phải. Phức bộ QRS vì vậy rộng ra.',
        finds=[
            {'text': 'QRS rộng từ 120 ms trở lên.', 'leads': ['V1', 'V6']},
            {'text': 'V1: dạng QS hoặc rS sâu và rộng. I, aVL, V5, V6: sóng R rộng, đỉnh có khía hoặc bằng, không có sóng q nhỏ.', 'leads': ['V1', 'I', 'aVL', 'V5', 'V6']},
            {'text': 'Đoạn ST và sóng T ngược chiều với phần chính của QRS (biến đổi thứ phát). Vì vậy không dùng ST theo cách thông thường để chẩn đoán nhồi máu khi có block nhánh trái.', 'leads': ['V1', 'V2', 'V5', 'V6']},
        ]),
    'lvh': dict(
        title={'vi': 'Phì đại thất trái', 'en': 'Left ventricular hypertrophy'},
        summary='Thành thất trái dày lên, thường do tăng huyết áp kéo dài hoặc hẹp van động mạch chủ. Khối cơ lớn hơn tạo ra điện thế QRS cao hơn.',
        finds=[
            {'text': 'Tiêu chuẩn Sokolow–Lyon: biên độ S ở V1 cộng R ở V5 hoặc V6 từ 3,5 mV (35 mm) trở lên. Số đo của ca này nằm trong bảng Số đo.', 'leads': ['V1', 'V5', 'V6']},
            {'text': 'Tiêu chuẩn Cornell: R ở aVL cộng S ở V3 trên 2,8 mV ở nam, trên 2,0 mV ở nữ.', 'leads': ['aVL', 'V3']},
            {'text': 'Có thể kèm ST chênh xuống và T âm không đối xứng ở V5, V6, I, aVL (dạng tăng gánh).', 'leads': ['V5', 'V6', 'I', 'aVL']},
        ]),
}


# ---------------------------------------------------------------------------------------------
def fetch(url, dest):
    if os.path.exists(dest) and os.path.getsize(dest) > 0:
        return dest
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    for k in range(4):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'my-library-ecg/1.0'})
            with urllib.request.urlopen(req, timeout=60) as r, open(dest + '.part', 'wb') as f:
                f.write(r.read())
            os.replace(dest + '.part', dest)
            return dest
        except Exception as e:
            print(f'  lỗi tải {url} ({e}), thử lại...', file=sys.stderr)
            time.sleep(2 + 3 * k)
    sys.exit(f'Không tải được {url}. Kiểm tra mạng, hoặc tải tay file đó vào {dest}.')


def load_tables(src):
    fetch(BASE + 'ptbxl_database.csv', os.path.join(src, 'ptbxl_database.csv'))
    fetch(BASE + 'scp_statements.csv', os.path.join(src, 'scp_statements.csv'))
    scp = {}
    with open(os.path.join(src, 'scp_statements.csv'), newline='', encoding='utf-8') as f:
        rd = csv.reader(f)
        head = next(rd)
        for row in rd:
            d = dict(zip(head, row))
            code = row[0]
            scp[code] = dict(desc=d.get('description', code), diagnostic=d.get('diagnostic') in ('1', '1.0'),
                             rhythm=d.get('rhythm') in ('1', '1.0'), form=d.get('form') in ('1', '1.0'),
                             cls=d.get('diagnostic_class', ''))
    rows = []
    with open(os.path.join(src, 'ptbxl_database.csv'), newline='', encoding='utf-8') as f:
        for d in csv.DictReader(f):
            try:
                d['codes'] = ast.literal_eval(d['scp_codes'])
                d['age_n'] = float(d['age']) if d['age'] else float('nan')
                d['fold'] = int(float(d['strat_fold']))
            except Exception:
                continue
            rows.append(d)
    return rows, scp


def clean(d):
    """Bản ghi sạch: đã có người duyệt, không ghi nhận nhiễu, trôi nền, lỗi điện cực, ngoại tâm thu hay máy tạo nhịp."""
    for k in ('baseline_drift', 'static_noise', 'burst_noise', 'electrodes_problems', 'extra_beats', 'pacemaker'):
        if (d.get(k) or '').strip():
            return False
    return d.get('validated_by_human') == 'True' and 18 <= d['age_n'] <= 89


def diag_codes(d, scp):
    return {c for c in d['codes'] if scp.get(c, {}).get('diagnostic')}


def candidates(cd, rows, scp):
    out = []
    for d in rows:
        if not clean(d):
            continue
        c = d['codes']
        if cd['rhythm'] not in c:
            continue
        dg = diag_codes(d, scp)
        need = set(cd.get('need', []))
        if not need <= dg or any(c.get(x, 0) < 100 for x in need):
            continue
        if cd.get('need_any') and not any(c.get(x, 0) >= 100 for x in cd['need_any']):
            continue
        if not dg <= need | set(cd.get('allow', [])):
            continue
        if cd['key'] == 'normal' and set(c) - {'NORM', 'SR'}:
            continue
        lo, hi = cd.get('age', (18, 89))
        if not lo <= d['age_n'] <= hi:
            continue
        # ưu tiên: fold 9-10 (nhãn kỹ nhất), ít mã kèm theo, có ý kiến bác sĩ thứ hai
        score = (0 if d['fold'] >= 9 else 1, len(c), 0 if d.get('second_opinion') == 'True' else 1, int(d['ecg_id']))
        out.append((score, d))
    out.sort(key=lambda t: t[0])
    return [d for _, d in out]


def pick_control(case, rows, used_pat):
    best = None
    for d in rows:
        if not clean(d) or set(d['codes']) - {'NORM', 'SR'} or d['codes'].get('NORM', 0) < 100 or 'SR' not in d['codes']:
            continue
        if d['sex'] != case['sex'] or d['patient_id'] in used_pat:
            continue
        s = (abs(d['age_n'] - case['age_n']), 0 if d['fold'] >= 9 else 1, int(d['ecg_id']))
        if best is None or s < best[0]:
            best = (s, d)
    return best[1] if best else None


# ---------------------------------------------------------------------------------------------
def read_record(src, d):
    rel = d['filename_hr']
    hea = fetch(BASE + rel + '.hea', os.path.join(src, rel + '.hea'))
    dat = fetch(BASE + rel + '.dat', os.path.join(src, rel + '.dat'))
    lines = [l.split() for l in open(hea, encoding='utf-8') if l.strip() and not l.startswith('#')]
    nsig, fs, n = int(lines[0][1]), float(lines[0][2]), int(lines[0][3])
    gains, bases, names = [], [], []
    for l in lines[1:1 + nsig]:
        if l[1] != '16':
            sys.exit(f'{rel}: định dạng {l[1]} chưa hỗ trợ (chỉ hỗ trợ format 16)')
        g = l[2].split('/')[0]
        b = 0.0
        if '(' in g:
            g, b = g.split('(')
            b = float(b.rstrip(')'))
        gains.append(float(g))
        bases.append(b)
        names.append(l[-1])
    raw = np.fromfile(dat, dtype='<i2', count=n * nsig).reshape(n, nsig).T.astype(np.float64)
    mv = (raw - np.array(bases)[:, None]) / np.array(gains)[:, None]
    norm = {x.upper(): i for i, x in enumerate(names)}
    order = [norm[L.upper()] for L in LEADS]
    return mv[order], fs


def preprocess(x, fs):
    """Bỏ trôi đường nền bằng hai lớp lọc trung vị (200 ms rồi 600 ms) và lọc thông thấp 100 Hz.
    Cách này giữ được hình dạng đoạn ST tốt hơn lọc thông cao."""
    w1, w2 = int(0.2 * fs) | 1, int(0.6 * fs) | 1
    base = ndimage.median_filter(ndimage.median_filter(x, size=(1, w1), mode='nearest'), size=(1, w2), mode='nearest')
    y = x - base
    b, a = signal.butter(3, 100 / (fs / 2), 'low')
    return signal.filtfilt(b, a, y, axis=1)


def r_peaks(y, fs):
    e = np.sum(np.diff(y, axis=1) ** 2, axis=0)
    e = np.convolve(e, np.ones(int(0.08 * fs)) / int(0.08 * fs), mode='same')
    pk, _ = signal.find_peaks(e, distance=int(0.25 * fs), height=0.25 * np.percentile(e, 99))
    dom = int(np.argmax(np.percentile(np.abs(y), 99, axis=1)))   # chuyển đạo có QRS lớn nhất, dùng để căn đỉnh R
    w = int(0.06 * fs)
    out = []
    for p in pk:
        a, b = max(0, p - w), min(y.shape[1], p + w)
        out.append(a + int(np.argmax(np.abs(y[dom, a:b]))))
    return np.array(sorted(set(out))), dom


def median_beat(y, rp, fs, pre=0.35, post=0.55):
    a, b = int(pre * fs), int(post * fs)
    beats = [y[:, r - a:r + b] for r in rp if r - a >= 0 and r + b <= y.shape[1]]
    if len(beats) < 3:
        return None, a
    return np.median(np.stack(beats), axis=0), a


def walk(v, start, step, thr, limit, run=3):
    i, k = start, 0
    while 0 < i < len(v) - 1 and abs(i - start) < limit:
        k = k + 1 if v[i] < thr else 0
        if k >= run:
            return i - step * (run - 1)
        i += step
    return i


def fiducials(m, r, fs, rr, has_p):
    """Mốc sóng gần đúng trên nhịp trung bình. Trả về chỉ số mẫu (tính từ đầu nhịp trung bình) hoặc None."""
    ms = lambda t: int(round(t * fs / 1000))
    v = np.sum(np.abs(np.diff(m, axis=1)), axis=0)
    v = np.convolve(v, np.ones(5) / 5, mode='same')
    vmax = v[max(0, r - ms(60)):r + ms(60)].max()
    on = walk(v, r, -1, 0.12 * vmax, ms(130))
    off = walk(v, r, +1, 0.12 * vmax, ms(160))
    if off - on < ms(60):
        off = on + ms(60)
    iso = np.median(m[:, max(0, on - ms(30)):max(1, on - ms(8))], axis=1)
    mc = m - iso[:, None]
    mag = np.sqrt(np.sum(mc ** 2, axis=0))
    t_hi = min(m.shape[1] - 2, off + ms(min(450, 0.62 * rr)))
    t_lo = off + ms(60)
    tp = te = None
    if t_hi - t_lo > ms(60):
        tp = t_lo + int(np.argmax(mag[t_lo:t_hi]))
        seg = mag[tp:t_hi]
        if len(seg) > 4:
            d = np.diff(seg)
            j = int(np.argmin(d))
            slope = d[j]
            if slope < 0:
                te = int(round(tp + j + seg[j] / -slope))
                te = min(te, t_hi)
    p_on = pp = None
    if has_p:
        lo, hi = max(1, on - ms(300)), on - ms(40)
        if hi - lo > ms(40):
            pp = lo + int(np.argmax(mag[lo:hi]))
            if mag[pp] < 0.04:          # dưới 40 µV: coi như không thấy sóng P
                pp = None
            else:
                p_on = walk(mag, pp, -1, 0.25 * mag[pp], ms(120), run=2)
    return dict(p_on=p_on, p_peak=pp, qrs_on=on, qrs_off=off, t_peak=tp, t_end=te), mc


def measures(mc, f, rp, fs, r):
    ms = lambda i: None if i is None else round((i - r) * 1000 / fs)
    rr = np.diff(rp) / fs
    out = dict(hr=round(60 / rr.mean()), rr_mean=round(rr.mean() * 1000), rr_sd=round(rr.std() * 1000),
               rr_cv=round(float(rr.std() / rr.mean()), 3), beats=int(len(rp)))
    on, off = f['qrs_on'], f['qrs_off']
    out['qrs'] = round((off - on) * 1000 / fs)
    out['pr'] = round((on - f['p_on']) * 1000 / fs) if f['p_on'] is not None else None
    if f['t_end'] is not None:
        qt = (f['t_end'] - on) / fs
        out['qt'] = round(qt * 1000)
        out['qtc_b'] = round(qt / math.sqrt(rr.mean()) * 1000)
        out['qtc_f'] = round(qt / rr.mean() ** (1 / 3) * 1000)
    else:
        out['qt'] = out['qtc_b'] = out['qtc_f'] = None
    L = {n: i for i, n in enumerate(LEADS)}
    q = slice(on, off + 1)
    area = mc[:, q].sum(axis=1)
    out['axis'] = round(math.degrees(math.atan2(area[L['aVF']], area[L['I']])))
    rmax = mc[:, q].max(axis=1)
    smin = mc[:, q].min(axis=1)
    out['sokolow'] = round(float(-smin[L['V1']] + max(rmax[L['V5']], rmax[L['V6']])), 2)
    out['cornell'] = round(float(rmax[L['aVL']] - smin[L['V3']]), 2)
    j60 = min(mc.shape[1] - 1, off + int(0.06 * fs))
    out['st60'] = {n: round(float(mc[L[n], j60]), 2) for n in LEADS}
    out['r_amp'] = {n: round(float(rmax[L[n]]), 2) for n in LEADS}
    out['s_amp'] = {n: round(float(-smin[L[n]]), 2) for n in LEADS}
    out['fid_ms'] = {k: ms(v) for k, v in f.items()}
    return out


def build(src, out_dir, d, key, scp, text_key, force_text):
    x, fs = read_record(src, d)
    if fs != FS:
        sys.exit(f'{d["ecg_id"]}: tần số {fs} Hz, cần {FS} Hz')
    y = preprocess(x, fs)
    rp, dom = r_peaks(y, fs)
    mb, r = median_beat(y, rp, fs)
    if mb is None:
        raise RuntimeError('quá ít nhịp')
    has_p = 'AFIB' not in d['codes'] and 'AFLT' not in d['codes']
    f, mc = fiducials(mb, r, fs, float(np.mean(np.diff(rp))) * 1000 / fs, has_p)
    meas = measures(mc, f, rp, fs, r)

    folder = os.path.join(out_dir, key)
    os.makedirs(folder, exist_ok=True)
    uv = np.clip(np.round(y * 1000), -32767, 32767).astype('<i2')
    with gzip.open(os.path.join(folder, 'signal.i16.gz'), 'wb', compresslevel=9) as g:
        g.write(uv.tobytes())
    codes = []
    for c, lik in sorted(d['codes'].items(), key=lambda t: -t[1]):
        s = scp.get(c, {})
        codes.append(dict(code=c, vi=SCP_VI.get(c, ''), en=s.get('desc', c), lik=lik,
                          kind='rhythm' if s.get('rhythm') else ('diagnostic' if s.get('diagnostic') else 'form')))
    meta = dict(
        ecg_id=int(d['ecg_id']), age=int(d['age_n']), sex='female' if d['sex'] == '1' else 'male',
        fs=FS, n=int(uv.shape[1]), leads=LEADS, units='uV',
        codes=codes, stadium=[s for s in (d.get('infarction_stadium1'), d.get('infarction_stadium2')) if s],
        second_opinion=d.get('second_opinion') == 'True', fold=d['fold'],
        rpeaks=[int(i) for i in rp],
        median=dict(pre_ms=round(r * 1000 / fs), fs=FS, data=[[int(round(v * 1000)) for v in row] for row in mc]),
        measures=meas,
        source='https://physionet.org/content/ptb-xl/1.0.3/' + d['filename_hr'],
    )
    with open(os.path.join(folder, 'meta.json'), 'w', encoding='utf-8') as fo:
        json.dump(meta, fo, ensure_ascii=False, separators=(',', ':'))
    cpath = os.path.join(folder, 'case.json')
    if text_key and (force_text or not os.path.exists(cpath)):
        t = dict(TEXT[text_key])
        t['reviewed'] = False
        with open(cpath, 'w', encoding='utf-8') as fo:
            json.dump(t, fo, ensure_ascii=False, indent=2)
    size = sum(os.path.getsize(os.path.join(folder, n)) for n in os.listdir(folder))
    print(f'  {key:<18} ecg_id {d["ecg_id"]:>5}  {meta["sex"]:<6} {meta["age"]:>2} tuổi  '
          f'HR {meas["hr"]}  QRS {meas["qrs"]} ms  PR {meas["pr"]}  QTc {meas["qtc_b"]}  trục {meas["axis"]}°  '
          f'{"+".join(c["code"] for c in codes)}  ({size / 1024:.0f} KB)')
    return meta


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--src', required=True, help='thư mục chứa file PTB-XL tải về (nằm ngoài my-library)')
    ap.add_argument('--out', default='lib/data/ecg', help='thư mục dữ liệu của trang')
    ap.add_argument('--pick', action='append', default=[], help='chọn tay: <ca>=<ecg_id> hoặc <ca>-ctl=<ecg_id>')
    ap.add_argument('--list', metavar='CA', help='chỉ in danh sách ứng viên của một ca rồi thoát')
    ap.add_argument('--force-text', action='store_true', help='ghi đè case.json bằng chữ mặc định')
    a = ap.parse_args()

    rows, scp = load_tables(a.src)
    by_id = {d['ecg_id']: d for d in rows}
    picks = dict(p.split('=', 1) for p in a.pick)
    for k, v in picks.items():
        if v not in by_id:
            sys.exit(f'--pick {k}={v}: không có ecg_id {v} trong ptbxl_database.csv')

    if a.list:
        cd = next((c for c in CASES if c['key'] == a.list), None)
        if not cd:
            sys.exit('ca không có: ' + ', '.join(c['key'] for c in CASES))
        for d in candidates(cd, rows, scp)[:15]:
            print(f'{d["ecg_id"]:>6}  {d["sex"]=="1" and "nữ " or "nam"} {int(d["age_n"]):>2}  fold {d["fold"]:>2}  '
                  f'{d.get("infarction_stadium1") or "":<12} {d["scp_codes"]}')
        return

    os.makedirs(a.out, exist_ok=True)
    index, used = [], set()
    for cd in CASES:
        key = cd['key']
        cands = [by_id[picks[key]]] if key in picks else candidates(cd, rows, scp)
        meta = None
        for d in cands[:10]:
            if d['patient_id'] in used:
                continue
            try:
                meta = build(a.src, a.out, d, key, scp, key, a.force_text)
                used.add(d['patient_id'])
                case_row = d
                break
            except RuntimeError as e:
                print(f'  bỏ qua {d["ecg_id"]}: {e}')
        if meta is None:
            print(f'! không tìm được ca cho {key}')
            continue
        entry = dict(key=key, control=None)
        if cd['control']:
            ck = key + '-ctl'
            c = by_id[picks[ck]] if ck in picks else pick_control(case_row, rows, used)
            if c is None:
                print(f'! không tìm được người thường cho {key}')
            else:
                build(a.src, a.out, c, ck, scp, None, False)
                used.add(c['patient_id'])
                entry['control'] = ck
        index.append(entry)

    with open(os.path.join(a.out, 'cases.json'), 'w', encoding='utf-8') as fo:
        json.dump(dict(version=1, dataset='PTB-XL 1.0.3', cases=index), fo, ensure_ascii=False, indent=2)
    print(f'Xong: {len(index)} ca, ghi vào {a.out}')


if __name__ == '__main__':
    main()
