// plant.js — grow a genome into actual geometry.
//
// This is a tiny L-system / recursive brancher. Starting from the base we
// repeatedly split into child branches, each shorter and thinner, until we
// run out of depth and place a flower. Along the way we drop leaves.
//
// IMPORTANT: everything here is built in a LOCAL, normalized coordinate
// space — base at (0,0), "up" is +y, and the whole plant is scaled so its
// height is exactly 1.0. That makes the plant resolution-independent: the
// renderer can drop it onto any size canvas just by multiplying by a scale.
// (Screen y grows downward, so the renderer flips y when drawing.)

import { TAU } from './rng.js';

export function buildPlant(g, rng) {
  const segs = [];
  const leaves = [];
  const blooms = [];
  let totalLen = 0.0001;
  let minX = 0, maxX = 0, maxY = 0;

  // accum = path length travelled so far; we normalize it later into a
  // 0..1 "grow clock" so the plant unfurls base-first like a real sprout.
  function grow(x, y, angle, len, width, depth, accum) {
    const x2 = x + Math.sin(angle) * len;
    const y2 = y + Math.cos(angle) * len; // +y is up in local space
    // curved control point so stems arc instead of going ruler-straight
    const mx = (x + x2) / 2, my = (y + y2) / 2;
    const perp = angle + Math.PI / 2, off = g.curl * len;
    const cx = mx + Math.sin(perp) * off, cy = my + Math.cos(perp) * off;

    const end = accum + len;
    if (end > totalLen) totalLen = end;
    minX = Math.min(minX, x2, cx); maxX = Math.max(maxX, x2, cx);
    maxY = Math.max(maxY, y2);

    segs.push({ x, y, cx, cy, x2, y2, width, depth, bs: accum, be: end });

    // leaves ride on the mid-to-upper branches
    if (g.hasLeaves && depth > 0 && depth <= g.depth - 1) {
      const side = g.leafEvery === 'pairs' ? [1, -1] : [rng() < 0.5 ? 1 : -1];
      for (const s of side) {
        if (g.leafEvery === 'alt' || rng() < 0.85) {
          leaves.push({
            x: mx, y: my,
            angle: angle + s * (0.7 + rng() * 0.5),
            size: g.leafSize * (0.7 + rng() * 0.6) * (depth / g.depth + 0.4),
            b: accum + len * 0.5,
          });
        }
      }
    }

    if (depth <= 0) {
      blooms.push({
        x: x2, y: y2, b: end,
        size: g.bloomSize * (0.85 + rng() * 0.5),
        ci: Math.floor(rng() * g.bloomsHSL.length),
        rot: rng() * TAU,
      });
      return;
    }

    // scatter a few extra blooms mid-plant for "many-flowered" genomes
    if (g.bloomEvery === 'many' && depth <= 2 && rng() < 0.32) {
      blooms.push({
        x: x2, y: y2, b: end,
        size: g.bloomSize * 0.6,
        ci: Math.floor(rng() * g.bloomsHSL.length),
        rot: rng() * TAU,
      });
    }

    const n = g.children;
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0 : i / (n - 1) - 0.5;
      const a2 = angle + t * g.spread * 2 + (rng() - 0.5) * g.jitter;
      grow(x2, y2, a2, len * g.decay, width * 0.7, depth - 1, end);
    }
  }

  grow(0, 0, g.sway + (rng() - 0.5) * 0.16, g.len0, g.width0, g.depth, 0);

  // Normalize so the plant is exactly 1.0 tall. Now every coordinate is a
  // fraction of plant height — multiply by a pixel-height to place it.
  const H = maxY || 1;
  for (const s of segs) {
    s.x /= H; s.y /= H; s.cx /= H; s.cy /= H; s.x2 /= H; s.y2 /= H;
    s.width /= H; s.bs /= totalLen; s.be /= totalLen;
  }
  for (const l of leaves) { l.x /= H; l.y /= H; l.size /= H; l.b /= totalLen; }
  for (const b of blooms) { b.x /= H; b.y /= H; b.size /= H; b.bn = b.b / totalLen; }

  return {
    segs, leaves, blooms,
    bbox: { minX: minX / H, maxX: maxX / H, height: 1 },
    vigor: g.vigor,
  };
}
