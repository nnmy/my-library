/* =====================================================================
   AI: minh họa "Attention trên mặt phẳng" (id: attn-2d, trang 2-transformer.html)
   Một query q và 5 key k_i là vector 2D (kéo rê được). Trọng số a_i = softmax(q·k_i / τ).
   Mỗi token mang một value v_i là một MÀU; đầu ra Σ a_i v_i là màu trộn.
   Chạy độc lập: lib/demos/run.html?demo=attn-2d
   EDIT: các token ở TOKENS (tên, màu value, vị trí key ban đầu).
   ===================================================================== */
(() => {
const { COLORS: C, range, watchCanvas, softmax, drag, setTxt, arrow, num } = TFG;
const TOKENS = [
  { name: 'mèo',   rgb: [232, 140, 40],  k: [1.3, 1.7] },
  { name: 'chuột', rgb: [130, 130, 140], k: [1.4, -1.2] },
  { name: 'đuổi',  rgb: [55, 135, 196],  k: [-1.5, 0.6] },
  { name: 'vì',    rgb: [63, 157, 106],  k: [-0.6, -1.7] },
  { name: 'đói',   rgb: [216, 49, 42],   k: [0.2, 1.9] },
];
const Q0 = [1.5, 0.5];
const rgbCss = c => `rgb(${c.map(Math.round).join(',')})`;

TFG.demo('attn-2d', {
  html: `<div class="demo-title"><h4>Attention trên mặt phẳng</h4><span>Kéo query (mũi tên đen) hoặc các key; chỉnh nhiệt độ</span></div>
    <div class="demo-body">
      <div class="stagebox">
        <canvas id="cvA2" class="ar" role="img" aria-label="Mặt phẳng 2D với một vector query và năm vector key; độ đậm thể hiện trọng số attention."></canvas>
        <div class="hint">Query của token "nó". Kéo đầu mũi tên.</div>
      </div>
      <div class="panel">
        <div class="ctrl"><label for="a2T">Nhiệt độ τ (mặc định √d)</label><output for="a2T"></output>
          <input type="range" id="a2T" min="-1.3" max="1.3" step="0.01" value="0.15"></div>
        <div>
          <div class="note-s" style="margin-bottom:4px">Điểm số q·kᵢ và trọng số aᵢ</div>
          <div class="bars" id="a2Bars"></div>
        </div>
        <div style="display:flex;gap:12px;align-items:center">
          <div id="a2Sw" style="width:64px;height:64px;border:2px solid var(--ink);flex:none"></div>
          <p class="note-s" style="margin:0">Đầu ra = Σ aᵢ·vᵢ. Mỗi value vᵢ là màu của token; đầu ra là màu trộn theo trọng số. Đây là thông tin token "nó" lấy về từ các token khác.</p>
        </div>
        <dl class="readout">
          <dt>Entropy (đạt / tối đa)</dt><dd id="a2H">—</dd>
          <dt>Token được chú ý nhất</dt><dd class="big" id="a2Top">—</dd>
        </dl>
        <p class="note-s">τ nhỏ: softmax gần như chọn đúng một token (attention "cứng"). τ lớn: trọng số gần đều, đầu ra thành màu xám trung bình. Trong Transformer, τ = √d giữ cho q·k không phình to khi số chiều d lớn.</p>
      </div>
    </div>`,
  init() {
    const cv = document.getElementById('cvA2'); const st = {};
    const toks = TOKENS.map(t => ({ ...t, k: [...t.k] })); const q = { name: 'q', k: [...Q0] };
    const tau = range('a2T', { map: v => 10 ** v, show: v => num(v, 3), onInput: () => draw() });
    const bars = document.getElementById('a2Bars');
    bars.innerHTML = toks.map((t, i) => `<span class="lab"><i style="display:inline-block;width:10px;height:10px;background:${rgbCss(t.rgb)};border:1px solid var(--ink);margin-right:5px"></i>${t.name}</span><div class="bar"><i id="a2b${i}"></i></div><span class="v" id="a2v${i}"></span>`).join('');
    let S = 60, ox = 0, oy = 0;
    const toPx = ([x, y]) => [ox + x * S, oy - y * S];
    const toW = (px, py) => [(px - ox) / S, (oy - py) / S];
    watchCanvas(cv, st, () => { S = Math.min(st.W, st.H) / 5.4; ox = st.W / 2; oy = st.H / 2; draw(); });
    drag(cv, {
      pick: (x, y) => [q, ...toks].find(o => { const [px, py] = toPx(o.k); return Math.hypot(px - x, py - y) < 16; }) || null,
      move: (o, x, y) => { const w = toW(x, y); const L = Math.hypot(...w), M = 2.5; o.k = L > M ? w.map(v => v * M / L) : w; draw(); },
    });
    function draw() {
      const { ctx, W, H } = st; if (!ctx) return;
      const scores = toks.map(t => t.k[0] * q.k[0] + t.k[1] * q.k[1]);
      const a = softmax(scores, tau.get());
      ctx.clearRect(0, 0, W, H);
      ctx.strokeStyle = C.line; ctx.lineWidth = 1;
      for (let g = -3; g <= 3; g++) { const [x] = toPx([g, 0]); const [, y] = toPx([0, g]); ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
      ctx.strokeStyle = '#B9C1CA'; ctx.beginPath(); ctx.moveTo(0, oy); ctx.lineTo(W, oy); ctx.moveTo(ox, 0); ctx.lineTo(ox, H); ctx.stroke();
      // đường vuông góc với q: q·k = 0
      const qL = Math.hypot(...q.k) || 1, n = [-q.k[1] / qL, q.k[0] / qL];
      ctx.setLineDash([5, 5]); ctx.strokeStyle = '#9DA4AD';
      const p1 = toPx([n[0] * 4, n[1] * 4]), p2 = toPx([-n[0] * 4, -n[1] * 4]); ctx.beginPath(); ctx.moveTo(...p1); ctx.lineTo(...p2); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = C.muted; ctx.font = '12px "Be Vietnam Pro", sans-serif'; ctx.fillText('q·k = 0', p1[0] + 4, p1[1] + 12);
      toks.forEach((t, i) => {
        const [x, y] = toPx(t.k);
        ctx.globalAlpha = 0.25 + 0.75 * a[i];
        arrow(ctx, ox, oy, x, y, rgbCss(t.rgb), 2 + 5 * a[i], 10);
        ctx.globalAlpha = 1;
        ctx.beginPath(); ctx.arc(x, y, 7 + 9 * a[i], 0, Math.PI * 2); ctx.fillStyle = rgbCss(t.rgb); ctx.fill(); ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = C.ink; ctx.font = '600 14px "Be Vietnam Pro", sans-serif';
        ctx.fillText(`k(${t.name})  ${Math.round(a[i] * 100)}%`, x + 12 + 9 * a[i], y - 6);
      });
      const [qx, qy] = toPx(q.k);
      arrow(ctx, ox, oy, qx, qy, C.ink, 4, 14);
      ctx.fillStyle = C.ink; ctx.fillRect(qx - 6, qy - 6, 12, 12);
      ctx.font = '700 15px "Be Vietnam Pro", sans-serif'; ctx.fillText('q(nó)', qx + 10, qy + 18);
      // bảng
      toks.forEach((t, i) => { document.getElementById('a2b' + i).style.width = (a[i] * 100).toFixed(1) + '%'; setTxt('a2v' + i, num(scores[i], 2) + ' → ' + (a[i] * 100).toFixed(0) + '%'); });
      const out = [0, 1, 2].map(c => toks.reduce((s, t, i) => s + a[i] * t.rgb[c], 0));
      document.getElementById('a2Sw').style.background = rgbCss(out);
      const Hh = -a.reduce((s, p) => s + (p > 0 ? p * Math.log2(p) : 0), 0);
      setTxt('a2H', num(Hh, 3) + ' / ' + num(Math.log2(toks.length), 3) + ' bit');
      const ti = a.indexOf(Math.max(...a)); setTxt('a2Top', toks[ti].name);
    }
    tau.upd();
  },
});
})();
