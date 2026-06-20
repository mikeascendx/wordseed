// render.js — everything that puts pixels on a canvas.
//
// Plants are authored in normalized local space (see plant.js). Here we map
// that space to the screen. Two key ideas:
//
//  1) Crispness: we never trust CSS to scale a bitmap. We render at the
//     device pixel ratio so a phone's 3x screen gets 3x the pixels.
//  2) Wind without re-simulating: once a plant finishes growing we "bake"
//     it into a small offscreen image, then each frame we just redraw that
//     image with a tiny rotation around its base. Because the base is the
//     pivot, the tips sway most — exactly like a real plant in a breeze.

import { TAU, clamp, lerp, hslStr, hsla, lerpHSL, easeOut } from './rng.js';

// ----- coordinate mapping (local up-is-+y -> screen up-is-−y) -----
const mapX = (ox, scale, lx) => ox + lx * scale;
const mapY = (oy, scale, ly) => oy - ly * scale;

// =====================================================================
//  BACKGROUND  (sky, stars, moon, ground glow, vignette) — drawn once
//  per size into an offscreen canvas, then blitted every frame.
// =====================================================================
export function buildBackground(c, W, H, ground) {
  c.clearRect(0, 0, W, H);

  const sky = c.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#05050b');
  sky.addColorStop(0.5, '#0a0913');
  sky.addColorStop(0.82, '#0d0b18');
  sky.addColorStop(1, '#120d1f');
  c.fillStyle = sky;
  c.fillRect(0, 0, W, H);

  // a soft moon, upper-right
  const mx = W * 0.82, my = H * 0.2, mr = clamp(H * 0.05, 22, 46);
  const halo = c.createRadialGradient(mx, my, 0, mx, my, mr * 4);
  halo.addColorStop(0, 'rgba(226,222,240,0.22)');
  halo.addColorStop(1, 'rgba(226,222,240,0)');
  c.fillStyle = halo; c.beginPath(); c.arc(mx, my, mr * 4, 0, TAU); c.fill();
  c.fillStyle = 'rgba(232,230,244,0.9)'; c.beginPath(); c.arc(mx, my, mr, 0, TAU); c.fill();
  c.fillStyle = 'rgba(13,11,24,0.5)'; c.beginPath(); c.arc(mx + mr * 0.42, my - mr * 0.3, mr * 0.92, 0, TAU); c.fill();

  // stars (only above the horizon)
  const stars = Math.min(180, Math.round((W * H) / 8500));
  for (let i = 0; i < stars; i++) {
    const x = Math.random() * W, y = Math.random() * ground * 0.92;
    const r = Math.random() * 1.2 + 0.2;
    c.fillStyle = `rgba(255,255,255,${0.05 + Math.random() * 0.3})`;
    c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
  }

  // ground plane below the horizon — darker than the sky so the land reads
  // as solid earth and the horizon line is clearly defined (not a pale wash)
  const gp = c.createLinearGradient(0, ground, 0, H);
  gp.addColorStop(0, '#0a0912');
  gp.addColorStop(0.4, '#08070f');
  gp.addColorStop(1, '#05040c');
  c.fillStyle = gp; c.fillRect(0, ground, W, H - ground);

  // a tight, dim glow hugging the horizon — concentrated, so it reads as a
  // band of light at the skyline instead of a big oval bleeding up the sky
  const r = Math.min(W * 0.42, 540);
  const gg = c.createRadialGradient(W / 2, ground, 6, W / 2, ground, r);
  gg.addColorStop(0, 'rgba(170,134,150,0.18)');
  gg.addColorStop(0.4, 'rgba(126,100,150,0.06)');
  gg.addColorStop(1, 'rgba(126,100,150,0)');
  c.fillStyle = gg; c.fillRect(0, ground - r, W, r * 1.4);

  // a defined horizon line
  const hl = c.createLinearGradient(0, 0, W, 0);
  hl.addColorStop(0, 'rgba(255,255,255,0)');
  hl.addColorStop(0.5, 'rgba(212,202,228,0.22)');
  hl.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = hl; c.fillRect(0, ground, W, 1);

  // vignette to focus the eye
  const vg = c.createRadialGradient(W / 2, H * 0.42, H * 0.3, W / 2, H * 0.5, Math.max(W, H) * 0.7);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.55)');
  c.fillStyle = vg; c.fillRect(0, 0, W, H);
}

// =====================================================================
//  LEAVES & BLOOMS
// =====================================================================
function drawLeaf(c, sx, sy, dirX, dirY, size, color) {
  const ang = Math.atan2(dirY, dirX);
  c.save();
  c.translate(sx, sy); c.rotate(ang);
  const len = size, w = size * 0.46;
  const grd = c.createLinearGradient(0, 0, len, 0);
  grd.addColorStop(0, hsla(color, 0.95));
  grd.addColorStop(1, hsla({ h: color.h, s: color.s, l: Math.min(70, color.l + 14) }, 0.95));
  c.fillStyle = grd;
  c.beginPath();
  c.moveTo(0, 0);
  c.quadraticCurveTo(len * 0.5, -w, len, 0);
  c.quadraticCurveTo(len * 0.5, w, 0, 0);
  c.fill();
  c.strokeStyle = hsla({ h: color.h, s: color.s, l: Math.max(12, color.l - 12) }, 0.5);
  c.lineWidth = Math.max(0.4, size * 0.04);
  c.beginPath(); c.moveTo(len * 0.06, 0); c.lineTo(len * 0.9, 0); c.stroke();
  c.restore();
}

function drawBloom(c, x, y, r, col, shape, petals, rot, glow, glowAmt) {
  if (r <= 0.2) return;
  if (glow) {
    const g = c.createRadialGradient(x, y, 0, x, y, r * 2.6);
    g.addColorStop(0, hsla(col, 0.55 * glowAmt));
    g.addColorStop(1, hsla(col, 0));
    c.fillStyle = g; c.beginPath(); c.arc(x, y, r * 2.6, 0, TAU); c.fill();
  }
  c.save();
  c.translate(x, y); c.rotate(rot);
  c.fillStyle = hslStr(col);

  if (shape === 'disc' || shape === 'fan') {
    const arc = shape === 'fan' ? Math.PI : TAU;
    const start = shape === 'fan' ? -Math.PI : 0;
    for (let i = 0; i < petals; i++) {
      const a = start + (i / petals) * arc;
      const px = Math.cos(a) * r * 0.6, py = Math.sin(a) * r * 0.6;
      c.beginPath(); c.ellipse(px, py, r * 0.6, r * 0.32, a, 0, TAU); c.fill();
    }
  } else if (shape === 'star') {
    for (let i = 0; i < petals; i++) {
      const a = (i / petals) * TAU;
      c.beginPath();
      c.moveTo(0, 0);
      c.quadraticCurveTo(Math.cos(a - 0.18) * r, Math.sin(a - 0.18) * r,
        Math.cos(a) * r * 1.25, Math.sin(a) * r * 1.25);
      c.quadraticCurveTo(Math.cos(a + 0.18) * r, Math.sin(a + 0.18) * r, 0, 0);
      c.fill();
    }
  } else if (shape === 'bell') {
    c.beginPath();
    c.moveTo(-r * 0.7, -r * 0.5);
    c.quadraticCurveTo(-r * 0.95, r * 0.7, 0, r);
    c.quadraticCurveTo(r * 0.95, r * 0.7, r * 0.7, -r * 0.5);
    c.quadraticCurveTo(0, -r * 0.1, -r * 0.7, -r * 0.5);
    c.fill();
  } else if (shape === 'spire') {
    for (let i = 0; i < 4; i++) {
      const yy = (i - 1.5) * r * 0.5;
      c.beginPath(); c.ellipse(0, yy, r * (0.7 - i * 0.1), r * 0.34, 0, 0, TAU); c.fill();
    }
  } else { // orb
    c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fill();
  }

  // center pistil — a lighter dot for a touch of depth
  c.fillStyle = hsla({ h: col.h, s: Math.max(0, col.s - 30), l: Math.min(100, col.l + 24) }, 0.92);
  c.beginPath(); c.arc(0, 0, Math.max(1, r * 0.28), 0, TAU); c.fill();
  c.restore();
}

// =====================================================================
//  PLANT (vector)  — draws stems (with growth reveal), leaves, blooms.
//  progress 0..1 unfurls the plant base-first.
// =====================================================================
export function drawPlant(c, plant, progress, ox, oy, scale, opts = {}) {
  const g = plant.genome, segs = plant.segs;
  const glow = opts.glow !== false;
  c.lineCap = 'round'; c.lineJoin = 'round';

  // stems
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    const span = s.be - s.bs || 0.0001;
    let a = (progress - s.bs) / span;
    if (a <= 0) continue; if (a > 1) a = 1;
    const factor = 1 - s.depth / (g.depth + 0.0001);
    c.strokeStyle = hslStr(lerpHSL(g.stemHSL, g.tipHSL, factor * 0.75));
    c.lineWidth = Math.max(0.5, s.width * scale);
    const x0 = mapX(ox, scale, s.x), y0 = mapY(oy, scale, s.y);
    const cx = mapX(ox, scale, s.cx), cy = mapY(oy, scale, s.cy);
    const x2 = mapX(ox, scale, s.x2), y2 = mapY(oy, scale, s.y2);
    c.beginPath(); c.moveTo(x0, y0);
    if (a >= 1) {
      c.quadraticCurveTo(cx, cy, x2, y2);
    } else {
      for (let k = 1; k <= 10; k++) {
        const t = (k / 10) * a, u = 1 - t;
        c.lineTo(u * u * x0 + 2 * u * t * cx + t * t * x2,
          u * u * y0 + 2 * u * t * cy + t * t * y2);
      }
    }
    c.stroke();
  }

  // leaves
  if (g.hasLeaves) {
    for (let i = 0; i < plant.leaves.length; i++) {
      const l = plant.leaves[i];
      if (progress < l.b) continue;
      const pop = easeOut(clamp((progress - l.b) / 0.05, 0, 1));
      const sx = mapX(ox, scale, l.x), sy = mapY(oy, scale, l.y);
      const dx = Math.sin(l.angle), dy = -Math.cos(l.angle); // local up -> screen
      drawLeaf(c, sx, sy, dx, dy, l.size * scale * pop, g.leafHSL);
    }
  }

  // blooms
  for (let i = 0; i < plant.blooms.length; i++) {
    const b = plant.blooms[i];
    if (progress < b.bn) continue;
    const pop = clamp((progress - b.bn) / 0.06, 0, 1);
    if (pop <= 0) continue;
    const x = mapX(ox, scale, b.x), y = mapY(oy, scale, b.y);
    drawBloom(c, x, y, b.size * scale * easeOut(pop), g.bloomsHSL[b.ci],
      g.bloomShape, g.petals, b.rot, glow, g.glow);
  }
}

// =====================================================================
//  BAKE  — render a finished plant into its own offscreen image so it can
//  be swayed cheaply every frame. Stored on plant.bmp.
// =====================================================================
export function bakePlant(plant, scale, dpr) {
  const bb = plant.bbox;
  const pad = 0.22; // normalized headroom for blooms/leaves that overflow
  const wLocal = (bb.maxX - bb.minX) + pad * 2;
  const hLocal = bb.height + pad * 2;
  const cssW = Math.max(4, wLocal * scale), cssH = Math.max(4, hLocal * scale);

  const cv = document.createElement('canvas');
  cv.width = Math.ceil(cssW * dpr); cv.height = Math.ceil(cssH * dpr);
  const c = cv.getContext('2d'); c.scale(dpr, dpr);

  const ox = (-bb.minX + pad) * scale;     // where local x=0 sits in the bitmap
  const oy = cssH - pad * scale;           // base (local y=0) sits near the bottom
  drawPlant(c, plant, 1, ox, oy, scale, { glow: true });

  plant.bmp = { cv, cssW, cssH, anchorX: ox, anchorY: oy };
}

// =====================================================================
//  WIND  — a cheap layered-sine field. Returns a small sway angle (radians)
//  for a plant standing at world-x `x` at time `t`. `breeze` is a 0..1 gust.
// =====================================================================
export function windAt(x, t, breeze) {
  const a = Math.sin(t * 0.0006 + x * 0.004);
  const b = Math.sin(t * 0.0013 + x * 0.0021);
  return (a * 0.7 + b * 0.3) * 0.05 * (0.5 + breeze);
}

// Draw a baked plant with sway. base = world position of the stem foot.
export function drawBaked(c, plant, baseX, baseY, sway, highlight) {
  const b = plant.bmp; if (!b) return;
  if (highlight > 0) {
    const r = b.cssH * 0.5;
    const g = c.createRadialGradient(baseX, baseY - r * 0.7, 0, baseX, baseY - r * 0.7, r);
    g.addColorStop(0, `rgba(216,178,122,${0.16 * highlight})`);
    g.addColorStop(1, 'rgba(216,178,122,0)');
    c.fillStyle = g;
    c.beginPath(); c.ellipse(baseX, baseY - r * 0.7, b.cssW * 0.6, r, 0, 0, TAU); c.fill();
  }
  c.save();
  c.translate(baseX, baseY);
  c.rotate(sway);
  if (highlight > 0) c.globalAlpha = 1; // (kept simple; highlight is the glow above)
  c.drawImage(b.cv, -b.anchorX, -b.anchorY, b.cssW, b.cssH);
  c.restore();
}

// =====================================================================
//  PARTICLES  — fireflies (ambient), sparks (bloom bursts), meteors (rare).
// =====================================================================
export function makeFireflies(W, H) {
  const n = Math.min(64, Math.round((W * H) / 24000));
  const f = [];
  for (let i = 0; i < n; i++) {
    f.push({
      x: Math.random() * W, y: Math.random() * H,
      sp: 0.1 + Math.random() * 0.4, drift: Math.random() * TAU,
      dsp: 0.004 + Math.random() * 0.01, amp: 6 + Math.random() * 18,
      r: 0.7 + Math.random() * 1.6, ph: Math.random() * TAU,
    });
  }
  return f;
}

export function drawFireflies(c, flies, t, H, still) {
  for (const f of flies) {
    if (!still) { f.y -= f.sp; f.drift += f.dsp; if (f.y < -12) { f.y = H + 12; f.x = Math.random() * (c.canvas.width); } }
    const x = f.x + Math.sin(f.drift) * f.amp;
    const alpha = 0.16 + 0.5 * (0.5 + 0.5 * Math.sin(t * 0.002 + f.ph));
    const g = c.createRadialGradient(x, f.y, 0, x, f.y, f.r * 4);
    g.addColorStop(0, `rgba(232,210,150,${alpha})`);
    g.addColorStop(1, 'rgba(232,210,150,0)');
    c.fillStyle = g; c.beginPath(); c.arc(x, f.y, f.r * 4, 0, TAU); c.fill();
  }
}

export function emitBurst(sparks, x, y, colors) {
  for (let i = 0; i < 18; i++) {
    const ang = Math.random() * TAU, sp = 0.6 + Math.random() * 2.4;
    sparks.push({
      x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 0.6,
      life: 1, size: 1.4 + Math.random() * 2,
      col: colors[Math.floor(Math.random() * colors.length)],
    });
  }
}

export function drawSparks(c, sparks) {
  for (let i = sparks.length - 1; i >= 0; i--) {
    const p = sparks[i];
    p.x += p.vx; p.y += p.vy; p.vy += 0.04; p.life -= 0.016;
    if (p.life <= 0) { sparks.splice(i, 1); continue; }
    c.fillStyle = hsla(p.col, clamp(p.life, 0, 1) * 0.85);
    c.beginPath(); c.arc(p.x, p.y, p.size, 0, TAU); c.fill();
  }
}

export function maybeMeteor(meteors, W, H) {
  // a rare shooting star — long, diagonal, gone in a blink
  meteors.push({
    x: Math.random() * W * 0.7, y: Math.random() * H * 0.3,
    vx: 5 + Math.random() * 4, vy: 2 + Math.random() * 2, life: 1,
  });
}

export function drawMeteors(c, meteors) {
  for (let i = meteors.length - 1; i >= 0; i--) {
    const m = meteors[i];
    m.x += m.vx; m.y += m.vy; m.life -= 0.02;
    if (m.life <= 0) { meteors.splice(i, 1); continue; }
    const tailX = m.x - m.vx * 6, tailY = m.y - m.vy * 6;
    const g = c.createLinearGradient(tailX, tailY, m.x, m.y);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(1, `rgba(255,255,255,${m.life * 0.8})`);
    c.strokeStyle = g; c.lineWidth = 1.6; c.lineCap = 'round';
    c.beginPath(); c.moveTo(tailX, tailY); c.lineTo(m.x, m.y); c.stroke();
  }
}
