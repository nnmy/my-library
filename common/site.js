/* =====================================================================
   Shared site chrome for My Library: footer mini game (two sketched roosters).
   Usage: include site.css, the <footer class="site-foot"> markup, then
   <script src="../common/site.js" defer></script>.
   Pixel-art line drawings only (no fill), coloured lines.

   - Idle (random): each rooster stays in its own territory, pecks grain,
     wanders back and forth, stops, looks around, pecks again.
     Eating slowly refills its health bar.
   - Press and HOLD play: if both health bars are full, both flap their wings,
     stretch their necks and walk briskly towards each other. If play is still
     held when they meet in the middle, they fight: flap up and rake the
     opponent's face and chest with their feet, sometimes peck. They may cross
     over each other's side so their bodies touch. Releasing play before they
     meet calls it off. Once fighting, the button becomes Stop.
   - The fight ends when one rooster runs out of health (it flaps away and
     runs home; nobody dies) or when Stop is pressed. Both then return to
     their territory and go back to idling.
   Markup (ids kept from the earlier cat game):
     <canvas id="catCanvas">, <button id="catBtn"> inside <footer class="site-foot">.
   EDIT: line colours in PALS, damage in HIT, regeneration in REGEN.
   ===================================================================== */
(() => {
const canvas = document.getElementById('catCanvas');
const btn = document.getElementById('catBtn');
if (!canvas || !btn) return;
const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp01 = v => Math.max(0, Math.min(1, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rnd = (a, b) => a + Math.random() * (b - a);
const ctx = canvas.getContext('2d');
const S = { W: 0, H: 0, dpr: 1, visible: false, last: null };
function fit() {
  const r = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  S.W = r.width; S.H = r.height; S.dpr = dpr;
  canvas.width = Math.max(1, Math.round(r.width * dpr)); canvas.height = Math.max(1, Math.round(r.height * dpr));
}

/* ---------------- settings ---------------- */
const PALS = [                                   // EDIT: line colours of the two roosters
  { line: '#1B1920', comb: '#d8312a', beak: '#C9781A' },
  { line: '#3787c4', comb: '#d8312a', beak: '#C9781A' },
];
const HIT = { rake: [8, 14], peck: [4, 8] };     // EDIT: damage per hit (random in range)
const REGEN = 7;                                 // EDIT: health gained per peck while eating (double on a grain)
const MAXHP = 100;

/* ---------------- sketch sprite ----------------
   Each body part is filled with its own key colour on a tiny canvas, then only the
   outline pixels are kept: the edge of every part (against empty space or a part drawn
   before it) is drawn in that part's line colour. Scaled ×2 without smoothing. */
const PIX = 2, SW = 46, SH = 38, OX = 23, OY = 35;
const PARTS = ['tail', 'legs', 'body', 'neck', 'wing', 'comb', 'beak', 'eye'];      // draw order = z order
const KEY = PARTS.map((_, i) => [20 + i * 29, 240 - i * 27, (i * 83) % 255]);
const spr = document.createElement('canvas'); spr.width = SW; spr.height = SH;
const sctx = spr.getContext('2d', { willReadFrequently: true });
const keyCss = n => { const c = KEY[PARTS.indexOf(n)]; return `rgb(${c[0]},${c[1]},${c[2]})`; };
function ell(c, n, x, y, rx, ry, rot = 0) { c.fillStyle = keyCss(n); c.beginPath(); c.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); c.fill(); }
function line(c, n, w, pts) { c.strokeStyle = keyCss(n); c.lineWidth = w; c.lineCap = 'round'; c.lineJoin = 'round'; c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.stroke(); }

// pose: peck 0..1 (head to the ground), lunge 0..1 (head forward), flap 0..1 (wings up), kick 0..1 (feet forward/up),
//       rake -1..1 (scratching motion), puff 0..1 (neck hackles), step, walk 0..1, bob (head bob), crouch
function drawRooster(c, p) {
  const by = -10 + (p.crouch || 0);
  for (let k = 0; k < 3; k++)
    line(c, 'tail', 2.2, [[-5, by - 1], [-9 - k, by - 6 + k * 2], [-11 - k * 0.5, by - 12 + k * 4 + p.flap * 2], [-9 - k, by - 15 + k * 5 + p.flap * 2]]);
  const sw = Math.sin(p.step) * 2.4 * p.walk, rk = (p.rake || 0) * 2.5;
  const f1 = [lerp(0.8 + sw, 8, p.kick), lerp(0, by - 3 + rk, p.kick)];
  const f2 = [lerp(-1.6 - sw, 6.5, p.kick), lerp(0, by + 1 - rk, p.kick)];
  line(c, 'legs', 1.2, [[-1.5, by + 4], [lerp(-1.6, 2.5, p.kick), lerp(-3, by + 4, p.kick)], f2, [f2[0] + 2.2, f2[1] + (p.kick ? -1 : 0)]]);
  line(c, 'legs', 1.2, [[0, by + 4], [lerp(0.6, 4.5, p.kick), lerp(-3, by + 2, p.kick)], f1, [f1[0] + 2.2, f1[1] + (p.kick ? -1 : 0)]]);
  ell(c, 'body', -0.5, by, 6.6, 4.8, -0.12 * p.peck);
  const hx = lerp(5.2, 8.6, p.peck) + p.lunge * 4 + p.puff * 0.8 + (p.bob || 0), hy = lerp(by - 7.5, -0.6, p.peck) + p.lunge * 1.5 - p.flap * 0.5;   // peck = 1: beak touches the ground line
  line(c, 'neck', 4.2 + p.puff * 2.4, [[2.8, by - 2], [hx - 0.6, hy + 0.6]]);
  ell(c, 'neck', hx, hy, 2.6, 2.4);
  ell(c, 'wing', -1.6, by - 0.5 - p.flap * 3.4, 4.2 + p.flap * 1.8, 2.4 + p.flap * 0.7, -p.flap * 0.95);
  ell(c, 'comb', hx - 1.2, hy - 2.7, 1.3, 1.3); ell(c, 'comb', hx + 0.2, hy - 3.1, 1.3, 1.4); ell(c, 'comb', hx + 1.5, hy - 2.5, 1.1, 1.1);
  ell(c, 'comb', hx + lerp(1.8, 0.4, p.peck), hy + lerp(2.4, 0.6, p.peck), 1, 1.2);
  c.fillStyle = keyCss('beak'); c.beginPath(); c.moveTo(hx + 1.6, hy - 1); c.lineTo(hx + 4.8, hy + 0.2); c.lineTo(hx + 1.6, hy + 1.2); c.closePath(); c.fill();
  c.fillStyle = keyCss('eye'); c.fillRect(Math.round(hx + 0.2), Math.round(hy - 1.3), 1, 1);
}
const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
function sketch(pal, pose, dir) {
  sctx.setTransform(1, 0, 0, 1, 0, 0); sctx.clearRect(0, 0, SW, SH);
  sctx.setTransform(dir, 0, 0, 1, OX, OY);
  drawRooster(sctx, pose);
  const img = sctx.getImageData(0, 0, SW, SH), d = img.data, cls = new Int8Array(SW * SH).fill(-1);
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    if (d[i + 3] < 120) continue;
    let best = 0, bd = 1e9;
    KEY.forEach((c, k) => { const dd = (c[0] - d[i]) ** 2 + (c[1] - d[i + 1]) ** 2 + (c[2] - d[i + 2]) ** 2; if (dd < bd) { bd = dd; best = k; } });
    cls[p] = best;
  }
  const lineCol = [pal.line, '#1B1920', pal.line, pal.line, pal.line, pal.comb, pal.beak, pal.line].map(hex);   // legs always black
  const at = (x, y) => (x < 0 || y < 0 || x >= SW || y >= SH) ? -1 : cls[y * SW + x];
  for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) {
    const p = y * SW + x, i = p * 4, c = cls[p];
    d[i + 3] = 0;
    if (c < 0) continue;
    const nb = [at(x - 1, y), at(x + 1, y), at(x, y - 1), at(x, y + 1)];
    // outline: edge against empty space, or against a part that lies underneath (drawn earlier)
    if (c === 7 || c === 1 || nb.some(v => v < 0 || v < c)) { const col = lineCol[c]; d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255; }
  }
  sctx.putImageData(img, 0, 0);
  return spr;
}

/* ---------------- state ---------------- */
const mkR = i => ({ i, x: null, dir: i ? -1 : 1, hp: MAXHP, mode: 'idle',
  pose: { peck: 0, lunge: 0, flap: 0, kick: 0, rake: 0, puff: 0, step: 0, walk: 0, bob: 0, crouch: 0 },
  lift: 0, xo: 0, act: null, next: 0, task: null, grains: [], flash: 0 });
const R = [mkR(0), mkR(1)];
let phase = 'idle', holding = false, feathers = [], sparks = [], blink = 0;   // phase: idle | approach | fight
const territory = i => { const m = S.W / 2; return i ? [m + 70, S.W - 40] : [40, m - 70]; };
const fightX = i => S.W / 2 + (i ? 22 : -22);
const homeX = i => { const [a, b] = territory(i); return (a + b) / 2; };

/* ---------------- button: hold play to approach and fight, click stop to end ---------------- */
const icon = btn.querySelector('path');
const ready = () => R.every(r => r.hp >= MAXHP && r.mode === 'idle');
function setButton() {
  const fighting = phase === 'fight', ok = ready();
  if (icon) icon.setAttribute('d', fighting ? 'M8.6 8.6h6.8v6.8H8.6z' : 'M9.6 7.4 17 12l-7.4 4.6z');
  btn.setAttribute('aria-label', fighting ? 'Dừng' : phase === 'approach' ? 'Giữ nút để hai chú gà so tài' : ok ? 'Nhấn giữ để hai chú gà so tài' : 'Gà đang ăn để hồi sức');
  btn.title = fighting ? 'Dừng' : ok || phase === 'approach' ? 'Nhấn giữ để hai chú gà so tài' : 'Gà đang ăn để hồi sức';
  btn.style.opacity = fighting || ok || phase === 'approach' ? '' : '.45';
}
function press() {
  if (phase === 'fight') { endFight(null); return; }
  if (phase === 'approach') { holding = true; return; }
  if (!ready()) { blink = 1.2; return; }
  phase = 'approach'; holding = true;
  R.forEach(r => { r.mode = 'approach'; r.act = null; r.task = null; });
  setButton();
}
function release() {
  holding = false;
  if (phase === 'approach') endFight(null);                         // let go before they met: called off
}
btn.addEventListener('pointerdown', e => { e.preventDefault(); btn.setPointerCapture && btn.setPointerCapture(e.pointerId); press(); });
btn.addEventListener('pointerup', release);
btn.addEventListener('pointercancel', release);
btn.addEventListener('lostpointercapture', () => { if (holding) release(); });
btn.addEventListener('contextmenu', e => e.preventDefault());
btn.addEventListener('keydown', e => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); press(); } });
btn.addEventListener('keyup', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); release(); } });
btn.addEventListener('click', e => e.preventDefault());
function endFight(loser) {
  phase = 'idle'; holding = false;
  R.forEach(r => {
    r.act = null; r.xo = 0;
    if (r === loser) { r.mode = 'flee'; r.fleeT = 0; } else { r.mode = 'return'; r.waitT = loser ? 0.8 : 0; }
  });
  setButton();
}

/* ---------------- idle behaviour (random) ---------------- */
function spawnGrain(r) { const [a, b] = territory(r.i); if (r.grains.length < 8) r.grains.push(rnd(a + 6, b - 6)); }
function pickTask(r, t) {
  const [a, b] = territory(r.i), u = Math.random();
  if (u < 0.45) {                                                    // walk somewhere, often towards grain
    let tx = rnd(a, b);
    if (r.grains.length && Math.random() < 0.6) { const g = r.grains[Math.floor(Math.random() * r.grains.length)]; tx = Math.max(a, Math.min(b, g - (g > r.x ? 12 : -12))); }
    r.task = { type: 'walk', tx, speed: rnd(26, 42) };
  } else if (u < 0.8) r.task = { type: 'peck', start: t, n: 2 + Math.floor(Math.random() * 4), done: 0 };
  else r.task = { type: 'stand', until: t + rnd(0.7, 2.2), look: Math.random() < 0.4 ? t + rnd(0.3, 0.8) : 0 };
}
function idle(r, t, dt) {
  const P = r.pose;
  P.flap = lerp(P.flap, 0, Math.min(1, dt * 8)); P.kick = lerp(P.kick, 0, Math.min(1, dt * 8)); P.lunge = lerp(P.lunge, 0, Math.min(1, dt * 8));
  P.puff = lerp(P.puff, 0, Math.min(1, dt * 3)); r.lift = 0; r.xo = 0; P.crouch = 0;
  if (REDUCED) { P.peck = 0.5; P.walk = 0; return; }
  if (!r.task) pickTask(r, t);
  const k = r.task;
  if (k.type === 'walk') {
    P.peck = lerp(P.peck, 0, Math.min(1, dt * 10));
    if (moveTo(r, k.tx, dt, k.speed)) r.task = null;
  } else if (k.type === 'peck') {
    P.walk = 0; P.bob = 0;
    const u = (t - k.start) * 2.6, n = Math.floor(u);
    P.peck = 0.5 - 0.5 * Math.cos(2 * Math.PI * u);
    if (n > k.done) {                                                  // one peck: eat a grain if one is under the beak
      k.done = n;
      const bx = r.x + r.dir * 26, gi = r.grains.findIndex(g => Math.abs(g - bx) < 9);
      if (gi >= 0) r.grains.splice(gi, 1);
      r.hp = Math.min(MAXHP, r.hp + (gi >= 0 ? REGEN * 2 : REGEN));
    }
    if (u >= k.n) r.task = null;
  } else {
    P.walk = 0; P.peck = lerp(P.peck, 0, Math.min(1, dt * 10)); P.bob = 0;
    if (k.look && t > k.look) { r.dir *= -1; k.look = 0; }
    if (t > k.until) r.task = null;
  }
}
function moveTo(r, tx, dt, speed) {
  const d = tx - r.x, P = r.pose;
  if (Math.abs(d) < 1.5) { r.x = tx; P.walk = lerp(P.walk, 0, Math.min(1, dt * 10)); P.bob = 0; return true; }
  r.dir = Math.sign(d); r.x += Math.sign(d) * Math.min(Math.abs(d), speed * dt);
  P.walk = 1; P.step += dt * speed * 0.33; P.bob = Math.sin(P.step * 2) * 0.9;
  return false;
}

/* ---------------- fight ---------------- */
function startAct(r, t) {
  const type = Math.random() < 0.68 ? 'rake' : 'peck';
  r.act = { type, t0: t, dur: type === 'rake' ? rnd(0.62, 0.8) : 0.36, hit: false };
}
function hit(att, def, type, t) {
  const [a, b] = HIT[type], dmg = Math.round(rnd(a, b));
  def.hp = Math.max(0, def.hp - dmg); def.flash = 0.18; def.recoil = 0.2;
  const hx = def.x + def.dir * 10, hy = S.H - 24 - def.lift - (type === 'rake' ? rnd(26, 40) : rnd(20, 30));
  sparks.push({ x: (att.x + def.x) / 2, y: hy, t });
  const n = type === 'rake' ? 2 + Math.floor(Math.random() * 4) : 1 + Math.floor(Math.random() * 2);
  for (let k = 0; k < n && feathers.length < 140; k++) {
    const ang = -Math.PI / 2 + rnd(-1.3, 1.3), v = rnd(50, 140);
    feathers.push({ x: hx, y: hy, vx: Math.cos(ang) * v - def.dir * 30, vy: Math.sin(ang) * v, rot: rnd(0, 6), vr: rnd(-8, 8), col: PALS[def.i].line, landed: 0, seed: rnd(0, 10) });
  }
  if (def.hp <= 0) endFight(def);
}
function fightStep(r, o, t, dt) {
  const P = r.pose;
  r.dir = r.i ? -1 : 1; P.walk = 0; P.peck = 0; P.bob = 0;
  if (r.recoil > 0) r.recoil -= dt;
  const rec = r.recoil > 0 ? -r.dir * 5 * (r.recoil / 0.2) : 0;
  if (!r.act) {                                                      // squared up: hackles raised, bobbing, waiting
    P.puff = lerp(P.puff, 1, Math.min(1, dt * 6)); P.flap = lerp(P.flap, 0.15, Math.min(1, dt * 6));
    P.kick = lerp(P.kick, 0, Math.min(1, dt * 10)); P.lunge = lerp(P.lunge, 0.2 + 0.2 * Math.sin(t * 9 + r.i), Math.min(1, dt * 8));
    P.crouch = 1 + Math.sin(t * 7 + r.i * 2) * 0.6; r.lift = lerp(r.lift, 0, Math.min(1, dt * 12)); r.xo = rec;
    if (t > r.next) startAct(r, t);
    return;
  }
  const a = r.act, u = clamp01((t - a.t0) / a.dur);
  if (a.type === 'rake') {                                           // flap up, feet forward, rake face and chest
    const hop = Math.sin(Math.PI * u);
    r.lift = hop * 28; P.flap = 0.5 + 0.5 * Math.sin(u * Math.PI * 8);
    P.kick = clamp01((hop - 0.25) / 0.5); P.rake = Math.sin(u * Math.PI * 10);
    P.lunge = 0.3; P.crouch = (1 - hop) * 1.5; r.xo = hop * 26 * r.dir + rec;   // flies over the middle into the other's side
    if (!a.hit && u > 0.5) { a.hit = true; hit(r, o, 'rake', t); }
  } else {                                                           // quick peck at the opponent's head
    const s = Math.sin(Math.PI * u);
    P.lunge = 0.3 + s * 0.9; P.flap = 0.15; P.kick = 0; r.lift = 0; r.xo = s * 16 * r.dir + rec; P.crouch = 0.5;
    if (!a.hit && u > 0.5) { a.hit = true; hit(r, o, 'peck', t); }
  }
  if (u >= 1 && phase === 'fight') { r.act = null; r.next = t + rnd(0.15, 0.7); P.rake = 0; }
}

/* ---------------- update ---------------- */
function update(t, dt) {
  R.forEach(r => { if (r.x === null) { r.x = homeX(r.i); r.grains = []; for (let k = 0; k < 5; k++) spawnGrain(r); } });
  if (Math.random() < dt * 0.5) R.forEach(spawnGrain);                // new grain falls now and then
  R.forEach(r => { if (r.flash > 0) r.flash -= dt; });
  if (blink > 0) blink -= dt;
  if (phase !== 'idle') {
    if (phase === 'approach') {                                       // flap, stretch the neck, walk briskly to the middle
      R.forEach(r => {
        const P = r.pose; P.flap = 0.45 + 0.35 * Math.sin(t * 22 + r.i); P.lunge = lerp(P.lunge, 0.9, Math.min(1, dt * 6)); P.puff = lerp(P.puff, 1, Math.min(1, dt * 6));
        P.peck = lerp(P.peck, 0, Math.min(1, dt * 10)); r.lift = 0; r.xo = 0; P.kick = 0;
        if (moveTo(r, fightX(r.i), dt, 75)) { r.mode = 'ready'; r.dir = r.i ? -1 : 1; P.walk = 0; }
      });
      if (R.every(r => r.mode === 'ready') && holding) {
        phase = 'fight'; R.forEach(r => { r.mode = 'fight'; r.next = t + rnd(0.1, 0.4); });
      }
    } else { fightStep(R[0], R[1], t, dt); if (phase === 'fight') fightStep(R[1], R[0], t, dt); }
  } else {
    R.forEach(r => {
      const P = r.pose, [a, b] = territory(r.i);
      if (r.mode === 'flee') {                                        // flap away, then run home
        r.fleeT += dt;
        if (r.fleeT < 0.55) { const u = r.fleeT / 0.55; r.lift = Math.sin(Math.PI * u) * 30; P.flap = 0.5 + 0.5 * Math.sin(u * 20); r.dir = r.i ? 1 : -1; r.x += r.dir * 120 * dt; P.kick = 0; P.puff = 0; P.lunge = 0; }
        else { r.lift = 0; P.flap = 0.6; if (moveTo(r, homeX(r.i), dt, 140)) { r.mode = 'idle'; r.task = null; } }
      } else if (r.mode === 'return' || r.mode === 'approach' || r.mode === 'ready' || r.mode === 'fight') {
        r.lift = lerp(r.lift, 0, Math.min(1, dt * 12)); r.xo = 0; P.kick = lerp(P.kick, 0, dt * 8); P.lunge = lerp(P.lunge, 0, dt * 8); P.flap = lerp(P.flap, 0, dt * 8);
        if (r.waitT > 0) { r.waitT -= dt; return; }
        const tx = Math.max(a, Math.min(b, r.x));
        if (moveTo(r, tx === r.x ? r.x : tx, dt, 55)) { r.mode = 'idle'; r.task = null; }
      } else idle(r, t, dt);
    });
  }
  // feathers and sparks
  const ground = S.H - 24;
  for (let k = feathers.length - 1; k >= 0; k--) {
    const f = feathers[k];
    if (!f.landed) {
      f.vy += 240 * dt; if (f.vy > 40) f.vy = 40 + (f.vy - 40) * 0.9;
      f.vx *= Math.pow(0.4, dt); if (f.vy > 0) f.vx += Math.sin(t * 5 + f.seed) * 55 * dt;
      f.x += f.vx * dt; f.y += f.vy * dt; f.rot += f.vr * dt;
      if (f.y >= ground - 2) { f.y = ground - 2; f.landed = t; f.rot = Math.random() < 0.5 ? 0.15 : -0.15; }
    } else if (t - f.landed > 4) feathers.splice(k, 1);
  }
  sparks = sparks.filter(s => t - s.t < 0.18);
  setButton();
}

/* ---------------- draw ---------------- */
function draw(t) {
  const { dpr, W, H } = S;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
  const ground = H - 24, gap = 15, mid = W / 2;
  ctx.fillStyle = '#1B1920';
  ctx.fillRect(0, ground - 1, mid - gap, 2); ctx.fillRect(mid + gap, ground - 1, W - mid - gap, 2);
  ctx.fillStyle = '#C9781A';
  R.forEach(r => r.grains.forEach(x => ctx.fillRect(Math.round(x), ground - 3, 2, 2)));
  ctx.imageSmoothingEnabled = false;
  R.forEach(r => {
    if (r.flash > 0 && Math.floor(r.flash * 40) % 2) return;         // blink when hit
    if (r.hp < MAXHP * 0.25 && Math.floor(t * 5) % 2) return;        // very low health: whole body blinks
    const sp = sketch(PALS[r.i], r.pose, r.dir), x = Math.round(r.x + r.xo - OX * PIX), y = Math.round(ground + 1 - r.lift - OY * PIX);
    ctx.drawImage(sp, x, y, SW * PIX, SH * PIX);
  });
  // health: a row of small squares, softer than the sketch lines; "!" blinks while not full
  R.forEach(r => {
    const n = 10, sq = 3, gp = 1, w = n * (sq + gp) - gp, x = Math.round(r.x - w / 2), y = Math.round(ground - r.lift - 62);
    const full = Math.ceil(r.hp / MAXHP * n - 1e-6);
    if (blink > 0 && Math.floor(blink * 8) % 2 && r.hp < MAXHP) return;
    ctx.fillStyle = PALS[r.i].line;
    for (let k = 0; k < n; k++) { ctx.globalAlpha = k < full ? (r.hp < MAXHP * 0.25 ? 0.75 : 0.45) : 0.1; if (k < full && r.hp < MAXHP * 0.25) ctx.fillStyle = '#d8312a'; ctx.fillRect(x + k * (sq + gp), y, sq, sq); }
    ctx.globalAlpha = 1;
    if (r.hp < MAXHP && Math.floor(t * 3) % 2 === 0) { ctx.fillStyle = '#d8312a'; const ex = x + w + 4; ctx.fillRect(ex, y - 3, 2, 4); ctx.fillRect(ex, y + 2, 2, 2); }
  });
  // hit sparks: short sketch lines
  ctx.fillStyle = '#d8312a';
  sparks.forEach(s => [[0, -1], [1, 0], [0, 1], [-1, 0], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]].forEach(([dx, dy]) => {
    ctx.fillRect(Math.round(s.x + dx * 7), Math.round(s.y + dy * 7), 2, 2);
  }));
  // feathers: a small sketched quill
  feathers.forEach(f => {
    const a = f.landed ? clamp01(1 - (t - f.landed - 2.5) / 1.5) : 1;
    ctx.save(); ctx.globalAlpha = a; ctx.translate(Math.round(f.x), Math.round(f.y)); ctx.rotate(f.landed ? f.rot : Math.round(f.rot / 0.8) * 0.8);
    ctx.fillStyle = f.col; ctx.fillRect(-3, 0, 7, 1); ctx.fillRect(-2, -1, 1, 1); ctx.fillRect(0, -1, 1, 1); ctx.fillRect(-2, 1, 1, 1); ctx.fillRect(0, 1, 1, 1);
    ctx.restore();
  });
}

const io = new IntersectionObserver(es => es.forEach(e => { S.visible = e.isIntersecting; S.last = null; }), { threshold: 0.2 });
io.observe(canvas);
new ResizeObserver(() => { fit(); if (phase === 'idle') R.forEach(r => { r.x = null; r.task = null; }); }).observe(canvas);
fit(); setButton();
(function loop(now) {
  if (S.visible) {
    const t = now / 1000, dt = S.last === null ? 0 : Math.min(0.05, t - S.last); S.last = t;
    update(t, dt); draw(t);
  }
  requestAnimationFrame(loop);
})(performance.now());
})();
