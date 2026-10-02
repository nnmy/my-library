/* =====================================================================
   Shared site chrome for My Library: footer mini game (pixel-art cat).
   Same game as the profile page (https://nnmy.github.io/):
   tap play = jump, hold = charge a longer jump, walking into the button
   knocks the cat over.
   Usage: include site.css, the <footer class="site-foot"> markup, then
   <script src="../common/site.js" defer></script>.
   ===================================================================== */
(() => {
const canvasEl = document.getElementById('catCanvas');
if (!canvasEl) return;
const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp01 = v => Math.max(0, Math.min(1, v));
const easeInOut = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
const lerp = (a, b, t) => a + (b - a) * t;
function fitCanvas(canvas, state) {
  const r = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  state.W = r.width; state.H = r.height; state.dpr = dpr;
  canvas.width = Math.max(1, Math.round(r.width * dpr));
  canvas.height = Math.max(1, Math.round(r.height * dpr));
}

/* =====================================================================
   FOOTER MINI GAME: pixel-art cat
   Each frame the cat is drawn with simple filled shapes on a tiny canvas
   (1 unit = 1 pixel), snapped to a 6-color palette, outlined, then
   scaled up without smoothing. Tap play = jump, hold = charge a longer jump.
   ===================================================================== */
const cat = { canvas: document.getElementById('catCanvas'), W: 0, H: 0, dpr: 1, visible: false,
  x: 60, dir: 1, speed: 40, step: 0, last: null,
  crouch: 0, charging: false, chargeStart: 0,
  jump: null,          // { start, dur, dist, height }
  land: -1, turnAfterLanding: false,
  hurt: null };        // { start } while knocked over by the button
cat.ctx = cat.canvas.getContext('2d');

const PIX = 2;                                      // css px per sprite pixel
const SPR_W = 46, SPR_H = 32, OX = 23, OY = 28;      // sprite canvas and ground origin
const CAT_COLORS = {
  ink:   [27, 25, 32],
  body:  [141, 147, 155],
  dark:  [92, 98, 106],
  light: [226, 229, 232],
  pink:  [232, 150, 150],
  tear:  [55, 135, 196],
};
const CAT_LIST = Object.values(CAT_COLORS);
const css = c => `rgb(${c[0]},${c[1]},${c[2]})`;
const spr = document.createElement('canvas');
spr.width = SPR_W; spr.height = SPR_H;
const sctx = spr.getContext('2d', { willReadFrequently: true });

function leg(c, color, pts, w) {
  c.strokeStyle = color; c.lineWidth = w; c.lineCap = 'round'; c.lineJoin = 'round';
  c.beginPath(); c.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
  c.stroke();
}
function ellipse(c, color, x, y, rx, ry) { c.fillStyle = color; c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); c.fill(); }
function poly(c, color, pts) { c.fillStyle = color; c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.closePath(); c.fill(); }

// Side view, facing right, feet at y = 0. pose: step, crouch (0..1), air (0..1), tilt (rad), t
function drawCatShapes(c, pose) {
  const B = css(CAT_COLORS.body), D = css(CAT_COLORS.dark), L = css(CAT_COLORS.light), P = css(CAT_COLORS.pink), K = css(CAT_COLORS.ink);
  const low = pose.crouch * 3.2, air = pose.air, flip = pose.flip || 0, tailAir = Math.max(air, flip);
  const walk = (1 - air) * (1 - pose.crouch);
  const sw = Math.sin(pose.step) * 2.6 * walk, sw2 = Math.sin(pose.step + Math.PI) * 2.6 * walk;
  const bodyY = -10.5 + low;
  const hip = [-6, bodyY + 1.5], sh = [6, bodyY + 1.8];
  // leg end points: walking, or stretched out in the air
  const backFoot = (s) => [lerp(hip[0] - 0.5 + s, hip[0] - 7, air), lerp(0, hip[1] + 4, air)];
  const backHock = (s) => [lerp(hip[0] - 2.4 + s * 0.4, hip[0] - 4, air), lerp(-3 + low * 0.3, hip[1] + 2.5, air)];
  const frontFoot = (s) => [lerp(sh[0] + 0.5 + s, sh[0] + 7, air), lerp(0, sh[1] + 3.5, air)];

  const dropY = pose.dropY || 0;
  c.save();
  c.translate(0, bodyY + dropY); c.rotate(pose.tilt); c.translate(0, -bodyY);

  // far legs (darker so they read as behind the body)
  leg(c, D, [hip, backHock(sw2), backFoot(sw2)], 2.2);
  leg(c, D, [sh, frontFoot(sw2)], 2);
  // tail: curls up while walking, streams back in a leap, twitches while crouching
  const tw = Math.sin(pose.t * 2.2) * 1.2 + (pose.crouch > 0.3 ? Math.sin(pose.t * 18) * 0.8 : 0);
  c.strokeStyle = B; c.lineWidth = 2.3; c.lineCap = 'round';
  c.beginPath(); c.moveTo(-9, bodyY - 1);
  c.bezierCurveTo(lerp(-14, -15, tailAir), lerp(bodyY - 1, bodyY - 1, tailAir),
                  lerp(-16 + tw, -19, tailAir), lerp(bodyY - 8, bodyY - 2, tailAir),
                  lerp(-13.5 + tw, -21, tailAir), lerp(bodyY - 11, bodyY - 4, tailAir));
  c.stroke();
  // body: torso, haunch, chest
  ellipse(c, B, 0, bodyY, 9.2, 3.9);
  ellipse(c, B, -5.2, bodyY + 0.3, 4.4, 4.3);
  ellipse(c, B, 5.4, bodyY + 0.2, 3.7, 3.9);
  // neck and head (head dips forward when crouching)
  // when knocked over (flip), the head tucks down to body level and the ears flatten
  const hx = 10 + pose.crouch * 1.2, hy = lerp(bodyY - 4.6 + pose.crouch * 2.2, bodyY + 0.8, flip);
  const ear = lerp(1, 0.55, flip);
  poly(c, B, [[4.5, bodyY - 2.5], [hx - 2.5, hy - 1.5], [hx + 1.5, hy + 2.2], [7.5, bodyY + 2.5]]);
  ellipse(c, B, hx, hy, 3.6, 3.3);
  ellipse(c, B, hx + 2.9, hy + 0.9, 1.9, 1.5);                     // muzzle
  poly(c, B, [[hx - 3.1, hy - 1.4], [hx - 2.4, hy - 1.4 - 4.8 * ear], [hx - 0.2, hy - 2.8]]);   // ears
  poly(c, B, [[hx + 0.2, hy - 2.9], [hx + 2.2, hy - 1.4 - 4.9 * ear], [hx + 2.9, hy - 1.3]]);
  // near legs
  leg(c, B, [hip, backHock(sw), backFoot(sw)], 2.4);
  leg(c, B, [sh, frontFoot(sw)], 2.1);

  // eye only; everything else is left unfilled (squeezed shut while crying)
  c.fillStyle = K; c.fillRect(hx + 0.9, hy - 0.9, 1.05, pose.blink || pose.cry ? 0.6 : 1.1);
  c.restore();

  // tears squirt from the eye in arcs
  if (pose.cry) {
    const ex = hx + 1.4, ey = hy - 0.4, ca = Math.cos(pose.tilt), sa = Math.sin(pose.tilt);
    const wx = ca * ex - sa * (ey - bodyY), wy = bodyY + dropY + sa * ex + ca * (ey - bodyY);
    c.fillStyle = css(CAT_COLORS.tear);
    for (let k = 0; k < 4; k++) {
      const ph = (pose.t * 1.8 + k / 4) % 1, side = k % 2 ? 1 : -1;
      c.fillRect(wx + side * ph * 6 - 0.6, wy - 3 * ph + 8 * ph * ph - 0.6, 1.2, 1.4);
    }
  }
}

function catSprite(pose, dir) {
  sctx.setTransform(1, 0, 0, 1, 0, 0);
  sctx.clearRect(0, 0, SPR_W, SPR_H);
  sctx.setTransform(dir, 0, 0, 1, OX, OY);
  drawCatShapes(sctx, pose);
  const img = sctx.getImageData(0, 0, SPR_W, SPR_H), d = img.data;
  // classify each pixel: 0 empty, 1 far legs, 2 near body, 3 eye
  const cls = new Uint8Array(SPR_W * SPR_H);
  const ref = [[1, CAT_COLORS.dark], [2, CAT_COLORS.body], [3, CAT_COLORS.ink], [4, CAT_COLORS.tear]];
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    if (d[i + 3] < 110) continue;
    let best = 0, bd = 1e9;
    for (const [k, c] of ref) {
      const dd = (c[0] - d[i]) ** 2 + (c[1] - d[i + 1]) ** 2 + (c[2] - d[i + 2]) ** 2;
      if (dd < bd) { bd = dd; best = k; }
    }
    cls[p] = best;
  }
  // outline only: around the whole silhouette, between far legs and the body, plus the eye
  const at = (x, y) => (x < 0 || y < 0 || x >= SPR_W || y >= SPR_H) ? 0 : cls[y * SPR_W + x];
  for (let y = 0; y < SPR_H; y++) for (let x = 0; x < SPR_W; x++) {
    const c = at(x, y), n = [at(x - 1, y), at(x + 1, y), at(x, y - 1), at(x, y + 1)];
    const ink = c === 3 || (c === 0 && n.some(v => v > 0 && v < 4)) || (c === 1 && n.some(v => v === 2 || v === 3));
    const i = (y * SPR_W + x) * 4;
    if (c === 4) { d[i] = 55; d[i + 1] = 135; d[i + 2] = 196; d[i + 3] = 255; continue; }
    d[i] = 27; d[i + 1] = 25; d[i + 2] = 32; d[i + 3] = ink ? 255 : 0;
  }
  sctx.putImageData(img, 0, 0);
  return spr;
}

/* ---------- controls: press = start charging, release = jump ---------- */
const MAX_CHARGE = 1.1;   // seconds of holding for a full-power jump
const catBtn = document.getElementById('catBtn');
const nowS = () => performance.now() / 1000;
function chargeStart() {
  if (cat.jump || cat.charging || cat.hurt) return;
  cat.charging = true; cat.chargeStart = nowS();
  catBtn.classList.add('charging');
}
function chargeRelease() {
  if (!cat.charging) return;
  cat.charging = false; catBtn.classList.remove('charging');
  const p = clamp01((nowS() - cat.chargeStart) / MAX_CHARGE);
  cat.jump = { start: nowS(), dur: 0.5 + 0.45 * p, dist: 45 + 230 * p, power: p };
}
catBtn.addEventListener('pointerdown', e => { e.preventDefault(); catBtn.setPointerCapture && catBtn.setPointerCapture(e.pointerId); chargeStart(); });
catBtn.addEventListener('pointerup', chargeRelease);
catBtn.addEventListener('pointercancel', chargeRelease);
catBtn.addEventListener('lostpointercapture', chargeRelease);
catBtn.addEventListener('contextmenu', e => e.preventDefault());
catBtn.addEventListener('keydown', e => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); chargeStart(); } });
catBtn.addEventListener('keyup', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); chargeRelease(); } });

function drawCatScene(now) {
  const t = now / 1000;
  const dt = cat.last === null ? 0 : Math.min(0.05, t - cat.last);
  cat.last = t;
  const { ctx, dpr, W, H } = cat;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const ground = H - 24, gap = 15, mid = W / 2, margin = 44;
  ctx.fillStyle = '#1B1920';
  ctx.fillRect(0, ground - 1, mid - gap, 2);
  ctx.fillRect(mid + gap, ground - 1, W - mid - gap, 2);

  // highest point that keeps the whole cat inside the footer
  const maxLift = Math.max(12, ground - (OY - 2) * PIX - 4);
  let lift = 0, air = 0, tilt = 0;
  const targetCrouch = cat.charging ? 0.35 + 0.65 * clamp01((t - cat.chargeStart) / MAX_CHARGE) : (t < cat.land ? 0.6 : 0);
  cat.crouch += (targetCrouch - cat.crouch) * Math.min(1, dt * 14);

  // bumping into the play button: knocked over, cries, gets up, walks the other way
  const BTN_R = 12, NOSE = 16 * PIX, TAIL = 11 * PIX;
  const hitsButton = () => {
    const a = cat.x - (cat.dir > 0 ? TAIL : NOSE), b = cat.x + (cat.dir > 0 ? NOSE : TAIL);
    return b > mid - BTN_R && a < mid + BTN_R;
  };
  const startHurt = () => {
    cat.hurt = { start: t };
    cat.x = mid - cat.dir * (BTN_R + NOSE + 1);
    cat.turnAfterLanding = false;
  };
  let hurtPose = null;

  if (cat.hurt) {
    const a = t - cat.hurt.start, DUR = 2.7;
    if (a >= DUR) { cat.hurt = null; cat.dir *= -1; cat.land = t + 0.1; }
    else {
      if (a < 0.2) { cat.x -= cat.dir * 80 * dt; lift = Math.sin(a / 0.2 * Math.PI) * 7; }
      const fall = clamp01((a - 0.1) / 0.3), rise = clamp01((a - 2.15) / 0.45);
      const k = easeInOut(fall) * (1 - easeInOut(rise));
      const crying = a > 0.45 && a < 2.15;
      if (rise > 0 && rise < 1) lift = Math.sin(rise * Math.PI) * 10;
      // flipped onto its back, legs kicking while it cries
      hurtPose = { tilt: -Math.PI * k, dropY: 6.6 * k + (crying && Math.sin(t * 16) > 0 ? 0.6 : 0), air: 0, flip: k, cry: crying,
                   step: cat.step + (crying ? Math.sin(t * 13) * 1.3 : 0) };
    }
  } else if (cat.jump) {
    const j = cat.jump, p = (t - j.start) / j.dur;
    if (p >= 1) {
      cat.jump = null; cat.land = t + 0.14;
      if (cat.turnAfterLanding) { cat.dir *= -1; cat.turnAfterLanding = false; }
      if (hitsButton()) startHurt();              // landed on the button
    } else {
      lift = 4 * p * (1 - p) * maxLift * (0.45 + 0.55 * j.power);
      air = Math.min(1, Math.sin(Math.PI * p) * 1.6);
      tilt = lerp(-0.28, 0.32, p) * air;
      cat.x += cat.dir * (j.dist / j.dur) * dt;
      if (cat.x > W - margin || cat.x < margin) { cat.x = Math.min(W - margin, Math.max(margin, cat.x)); cat.turnAfterLanding = true; }
    }
  } else if (!cat.charging && t >= cat.land && !REDUCED) {
    cat.x += cat.dir * cat.speed * dt;
    cat.step += dt * 8;
    if (cat.x > W - margin) { cat.x = W - margin; cat.dir = -1; }
    if (cat.x < margin) { cat.x = margin; cat.dir = 1; }
    if (hitsButton()) startHurt();                // walked into the button
  }

  // charge meter above the button while holding
  if (cat.charging) {
    const p = clamp01((t - cat.chargeStart) / MAX_CHARGE), n = 6, bw = 6, bg = 2;
    const x0 = Math.round(mid - (n * bw + (n - 1) * bg) / 2), y0 = ground - 24;
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = (i + 1) / n <= p + 0.001 ? '#3787c4' : '#DCE6EC';
      ctx.fillRect(x0 + i * (bw + bg), y0, bw, 5);
    }
  }

  const blink = (t % 4.2) < 0.12;
  const pose = Object.assign({ step: cat.step, crouch: cat.crouch, air, tilt, t, blink }, hurtPose || {});
  const sprite = catSprite(pose, cat.dir);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sprite, Math.round(cat.x - OX * PIX), Math.round(ground + 1 - lift - OY * PIX), SPR_W * PIX, SPR_H * PIX);
}


const io = new IntersectionObserver(entries => entries.forEach(e => { cat.visible = e.isIntersecting; cat.last = null; }), { threshold: 0.2 });
io.observe(cat.canvas);
new ResizeObserver(() => fitCanvas(cat.canvas, cat)).observe(cat.canvas);
fitCanvas(cat.canvas, cat);
(function loop(now) { if (cat.visible) drawCatScene(now); requestAnimationFrame(loop); })(performance.now());
})();
