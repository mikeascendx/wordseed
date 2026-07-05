// garden.js — the scene controller. Owns the canvas, the planted specimens,
// the animation loop, layout, and hit-testing. Everything responsive lives
// here: the garden re-measures itself and re-grows its plants at the right
// size whenever the window changes.
//
// Layout model: plants live in one ordered list (oldest → newest). Their x
// positions are spread evenly across the *current* count, so a single plant
// sits centered and the garden always looks composed. When a new plant is
// added the others glide to make room (we lerp each baseX toward a targetX).

import { seededRng, clamp, lerp } from './rng.js';
import { makeGenome, algoLabel } from './genome.js';
import { buildPlant } from './plant.js';
import { fieldNote } from './fieldnote.js';
import {
  buildBackground, drawPlant, bakePlant, windAt, drawBaked,
  makeFireflies, drawFireflies, emitBurst, drawSparks, maybeMeteor, drawMeteors,
} from './render.js';
import * as share from './share.js';

const GROW_MS = 1500;

export class Garden {
  constructor(canvas, { onPlant, onChange } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.bg = document.createElement('canvas');
    this.bgc = this.bg.getContext('2d');

    this.onPlant = onPlant || (() => {});
    this.onChange = onChange || (() => {});

    this.order = [];        // plant objects, oldest first
    this.maxSlots = 7;
    this.growing = null;
    this.selected = null;   // plant reference
    this.sparks = [];
    this.meteors = [];
    this.flies = [];
    this.breeze = 0.5;

    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.resize();
    this._loop = this._loop.bind(this);
    this._raf = requestAnimationFrame(this._loop);

    // pause the loop while the tab is hidden (battery); resume in place on
    // return, never reseed/regrow. Cancel the pending frame on hide so the
    // held callback can't fire on return and spawn a second, doubled loop.
    this.hiddenPaused = false;
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (this._raf) { cancelAnimationFrame(this._raf); this._raf = null; }
        this.hiddenPaused = true;
      } else if (this.hiddenPaused) {
        this.hiddenPaused = false;
        this._raf = requestAnimationFrame(this._loop);
      }
    });
  }

  // ---- responsive geometry ----
  _measure() {
    const rect = this.canvas.getBoundingClientRect();
    this.W = Math.max(320, rect.width);
    this.H = Math.max(320, rect.height);
    this.dpr = Math.min(window.devicePixelRatio || 1, 2.5);

    this.canvas.width = Math.round(this.W * this.dpr);
    this.canvas.height = Math.round(this.H * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    this.bg.width = this.canvas.width; this.bg.height = this.canvas.height;
    this.bgc.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    this.ground = Math.min(this.H * 0.8, this.H - 96);
    this.topMargin = this.H * 0.1;
    this.areaH = this.ground - this.topMargin;
    this.pad = clamp(this.W * 0.06, 22, 80);

    // fewer, larger plants on small screens so each stays legible
    this.maxSlots = this.W <= 560 ? 3 : this.W <= 900 ? 5 : 7;
  }

  // Cell-center placement: each plant gets the middle of an equal-width cell.
  // Keeps plants off the canvas edges and balanced for any count.
  _cellW(n) { return (this.W - this.pad * 2) / Math.max(1, n); }
  _xFor(i, n) {
    if (n <= 1) return this.W / 2;
    return this.pad + (i + 0.5) * this._cellW(n);
  }
  _layout(snap = false) {
    const n = this.order.length;
    this.order.forEach((p, i) => {
      p.targetX = this._xFor(i, n);
      if (snap || p.baseX == null) p.baseX = p.targetX;
    });
  }

  resize() {
    const words = this.words();
    this._measure();
    buildBackground(this.bgc, this.W, this.H, this.ground);
    this.flies = makeFireflies(this.W, this.H);
    // rebuild every plant at the new size (geometry is normalized, so this is
    // just a re-bake) — keep the most recent if the slot count shrank
    this.order = []; this.growing = null;
    const keep = words.slice(-this.maxSlots);
    for (const w of keep) this.plant(w, { instant: true, silent: true });
  }

  // ---- planting ----
  plant(word, { instant = false, silent = false } = {}) {
    word = (word || '').trim();
    if (!word) return;
    if (this.growing) this._complete(); // finish whatever is mid-grow

    const rng = seededRng(word);
    const g = makeGenome(rng);
    const built = buildPlant(g, rng);
    const heightPx = this.areaH * g.vigor;

    const p = {
      word, genome: g, segs: built.segs, leaves: built.leaves,
      blooms: built.blooms, bbox: built.bbox,
      baseX: null, baseY: this.ground, targetX: 0, scale: heightPx,
      progress: 0, done: false, start: performance.now(),
      bmp: null, note: fieldNote(word, g), label: algoLabel(g),
    };

    this.order.push(p);
    while (this.order.length > this.maxSlots) {
      const gone = this.order.shift();
      if (this.selected === gone) this.selected = null;
    }
    this._layout(instant || this.reduced); // new plant snaps; others glide
    p.baseX = p.targetX; // the freshly planted one grows in its final spot

    if (instant || this.reduced) {
      p.progress = 1; p.done = true;
      bakePlant(p, p.scale, this.dpr);
    } else {
      this.growing = p;
    }

    if (!silent) { this.onPlant(word); this.onChange(this.words()); }
    return p;
  }

  _complete() {
    const p = this.growing; if (!p) return;
    this.growing = null; p.progress = 1; p.done = true;
    bakePlant(p, p.scale, this.dpr);
    if (!this.reduced) {
      emitBurst(this.sparks, p.baseX, p.baseY - p.scale * 0.55, p.genome.bloomsHSL);
    }
  }

  clear() {
    this.order = []; this.growing = null;
    this.sparks = []; this.selected = null;
    this.onChange(this.words());
  }

  words() { return this.order.map((p) => p.word); }
  plantAt(i) { return this.order[i] || null; }

  // ---- hit-testing for taps/clicks (topmost / newest wins) ----
  hitTest(cssX, cssY) {
    for (let i = this.order.length - 1; i >= 0; i--) {
      const p = this.order[i];
      if (!p || !p.bmp) continue;
      const left = p.baseX - p.bmp.anchorX, top = p.baseY - p.bmp.anchorY;
      if (cssX >= left && cssX <= left + p.bmp.cssW &&
          cssY >= top && cssY <= top + p.bmp.cssH) return i;
    }
    return -1;
  }
  select(i) { this.selected = i >= 0 ? this.order[i] : null; }

  // ---- labels under each plant ----
  _labels(c) {
    c.textAlign = 'center';
    const wordSize = clamp(this.W / 72, 12, 17);
    const noteSize = clamp(this.W / 96, 9.5, 12);
    const n = this.order.length;
    const maxW = (n > 1 ? this._cellW(n) : this.W * 0.7) * 0.94;
    const wordY = this.ground + wordSize + 18;          // clear gap below the soil
    const noteY = wordY + noteSize + 8;
    for (const p of this.order) {
      const sel = p === this.selected;
      c.fillStyle = sel ? 'rgba(216,178,122,0.96)' : 'rgba(236,239,244,0.94)';
      c.font = `600 ${wordSize}px Fraunces, Georgia, serif`;
      c.fillText(p.word, p.baseX, wordY);
      c.fillStyle = 'rgba(154,160,180,0.82)';
      c.font = `italic ${noteSize}px Fraunces, Georgia, serif`;
      c.fillText(this._trim(c, p.note, maxW), p.baseX, noteY);
    }
  }
  _trim(c, text, maxW) {
    if (c.measureText(text).width <= maxW) return text;
    let t = text;
    while (t.length > 1 && c.measureText(t + '…').width > maxW) t = t.slice(0, -1);
    return t.replace(/\s+$/, '') + '…';
  }

  // ---- the frame loop ----
  _loop(t) {
    if (document.hidden) return; // stop scheduling; visibilitychange resumes us

    const c = this.ctx;
    this.breeze = lerp(this.breeze, 0.5 + 0.5 * Math.sin(t * 0.00037), 0.05);

    // glide plants toward their target x (makes room smoothly)
    for (const p of this.order) {
      if (p.baseX == null) p.baseX = p.targetX;
      else if (Math.abs(p.targetX - p.baseX) > 0.4) p.baseX = lerp(p.baseX, p.targetX, 0.16);
      else p.baseX = p.targetX;
    }

    if (this.growing) {
      this.growing.progress = clamp((t - this.growing.start) / GROW_MS, 0, 1);
      if (this.growing.progress >= 1) this._complete();
    }

    c.clearRect(0, 0, this.W, this.H);
    c.drawImage(this.bg, 0, 0, this.W, this.H);

    // finished plants, swaying
    for (const p of this.order) {
      if (!p.done || !p.bmp) continue;
      const sway = this.reduced ? p.genome.sway
        : p.genome.sway + windAt(p.baseX, t, this.breeze) * p.genome.flex;
      drawBaked(c, p, p.baseX, p.baseY, sway, p === this.selected ? 1 : 0);
    }

    // the one currently growing (vector, no sway yet)
    if (this.growing) {
      const p = this.growing;
      drawPlant(c, p, p.progress, p.baseX, p.baseY, p.scale, { glow: true });
    }

    this._labels(c);

    drawFireflies(c, this.flies, t, this.H, this.reduced);
    if (!this.reduced) {
      drawSparks(c, this.sparks);
      if (this.meteors.length === 0 && Math.random() < 0.0009) maybeMeteor(this.meteors, this.W, this.H);
      drawMeteors(c, this.meteors);
    }

    this._raf = requestAnimationFrame(this._loop);
  }

  exportPNG() { share.downloadCanvas(this.canvas, 'wordseed.png'); }
}
