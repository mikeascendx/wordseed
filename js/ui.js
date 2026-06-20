// ui.js — the bridge between the DOM (buttons, input, the specimen card) and
// the Garden engine. Keeps all the imperative wiring in one place so the
// engine stays pure and testable.

import { Garden } from './garden.js';
import { genomeReadout } from './genome.js';
import * as share from './share.js';

const WORDS = [
  'wildfire', 'lullaby', 'vertigo', 'monsoon', 'ember', 'glacier', 'fever', 'hush',
  'riot', 'nectar', 'rust', 'aurora', 'thorn', 'mirage', 'tempest', 'velvet', 'static',
  'ache', 'dusk', 'frost', 'wander', 'gravity', 'echo', 'saffron', 'cobalt', 'thunder',
  'willow', 'venom', 'halcyon', 'bloom', 'cinder', 'tidal', 'lantern', 'marrow', 'solace',
  'quartz', 'feral', 'meadow', 'eclipse', 'whisper', 'brine', 'kindling', 'reverie',
];

const $ = (id) => document.getElementById(id);

export function start() {
  const els = {
    canvas: $('stage'), input: $('seed'),
    plant: $('plantBtn'), surprise: $('surpriseBtn'), clear: $('clearBtn'),
    shareBtn: $('shareBtn'), saveBtn: $('saveBtn'),
    hint: $('hint'), toast: $('toast'), live: $('live'),
    card: $('card'), backdrop: $('backdrop'), cardClose: $('cardClose'),
    cWord: $('cWord'), cNote: $('cNote'), cRows: $('cRows'),
    cSeed: $('cSeed'), cCopy: $('cCopySeed'),
  };

  const garden = new Garden(els.canvas, {
    onPlant: (w) => announce(els.live, `Planted ${w}.`),
    onChange: (words) => {
      share.save(words); share.syncHash(words);
      els.hint.classList.toggle('show', words.length === 0);
    },
  });

  // ---- embed mode: running inside an <iframe> (or ?embed) -> full-bleed,
  // no page chrome, a self-running showcase. Skip all interactive wiring.
  const inFrame = (() => { try { return window.self !== window.top; } catch { return true; } })();
  if (inFrame || new URLSearchParams(location.search).has('embed')) {
    runEmbed(garden);
    return;
  }

  // ---- controls ----
  const plant = () => {
    const w = els.input.value;
    if (!w.trim()) { els.input.focus(); return; }
    garden.plant(w); els.input.select();
  };
  els.plant.addEventListener('click', plant);
  els.input.addEventListener('keydown', (e) => { if (e.key === 'Enter') plant(); });
  els.surprise.addEventListener('click', () => {
    const planted = new Set(garden.words());
    const pool = WORDS.filter((w) => !planted.has(w));
    const w = (pool.length ? pool : WORDS)[Math.floor(Math.random() * (pool.length || WORDS.length))];
    els.input.value = w; garden.plant(w);
  });
  els.clear.addEventListener('click', () => {
    garden.clear(); closeCard(); toast(els.toast, 'Garden cleared'); els.input.focus();
  });
  els.shareBtn.addEventListener('click', async () => {
    const words = garden.words();
    if (!words.length) { toast(els.toast, 'Plant something first'); return; }
    const ok = await share.copy(share.shareUrl(words));
    toast(els.toast, ok ? 'Share link copied' : 'Copy failed');
  });
  els.saveBtn.addEventListener('click', () => {
    if (!garden.words().length) { toast(els.toast, 'Plant something first'); return; }
    garden.exportPNG(); toast(els.toast, 'Image saved');
  });

  // ---- pick a plant on the canvas ----
  const localXY = (e) => {
    const r = els.canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  els.canvas.addEventListener('click', (e) => {
    const [x, y] = localXY(e);
    const i = garden.hitTest(x, y);
    if (i >= 0) { garden.select(i); openCard(garden.plantAt(i)); }
    else { garden.select(-1); closeCard(); }
  });
  // pointer affordance on desktop
  els.canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    const [x, y] = localXY(e);
    els.canvas.style.cursor = garden.hitTest(x, y) >= 0 ? 'pointer' : 'default';
  });

  // ---- specimen card ----
  function openCard(p) {
    if (!p) return;
    els.cWord.textContent = p.word;
    els.cNote.textContent = p.note;
    els.cRows.replaceChildren();
    for (const [k, v] of genomeReadout(p.genome)) {
      const row = document.createElement('div'); row.className = 'row';
      const dt = document.createElement('dt'); dt.textContent = k;
      const dd = document.createElement('dd'); dd.textContent = v;
      row.append(dt, dd);
      els.cRows.appendChild(row);
    }
    els.cSeed.textContent = p.word;
    els.card.classList.add('open'); els.backdrop.classList.add('open');
    els.card.setAttribute('aria-hidden', 'false');
    els.cardClose.focus();
  }
  function closeCard() {
    els.card.classList.remove('open'); els.backdrop.classList.remove('open');
    els.card.setAttribute('aria-hidden', 'true');
    garden.select(-1);
  }
  els.cardClose.addEventListener('click', closeCard);
  els.backdrop.addEventListener('click', closeCard);
  els.cCopy.addEventListener('click', async () => {
    const ok = await share.copy(els.cSeed.textContent);
    toast(els.toast, ok ? 'Seed copied' : 'Copy failed');
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeCard(); });

  // ---- responsive: rebuild on resize / orientation change ----
  let rt;
  const onResize = () => { clearTimeout(rt); rt = setTimeout(() => garden.resize(), 160); };
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);

  // ---- restore a shared / saved garden, or grow a gentle starter ----
  const fromHash = share.decodeHash(location.hash);
  const saved = fromHash.length ? fromHash : share.load();
  if (saved.length) {
    saved.slice(-garden.maxSlots).forEach((w) => garden.plant(w, { instant: true, silent: true }));
    garden.onChange(garden.words());
  } else {
    garden.plant('aurora');
    setTimeout(() => garden.plant('ember'), 1700);
  }

  els.input.focus({ preventScroll: true });
}

// ---- embed showcase: full-bleed, self-running, no controls ----
function runEmbed(garden) {
  document.body.classList.add('embed');
  const seeds = share.decodeHash(location.hash);
  const list = seeds.length ? seeds : ['aurora', 'ember', 'frost'];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (reduced) {
    list.forEach((w) => garden.plant(w, { instant: true, silent: true }));
    return;
  }
  // grow the seed words in one at a time, then keep the garden alive by
  // planting a fresh surprise word every few seconds (ring buffer cycles old)
  let i = 0;
  garden.plant(list[i++], { silent: true });
  const seedTimer = setInterval(() => {
    if (i < list.length) { garden.plant(list[i++], { silent: true }); return; }
    clearInterval(seedTimer);
    setInterval(() => {
      garden.plant(WORDS[Math.floor(Math.random() * WORDS.length)], { silent: true });
    }, 7000);
  }, 1800);
}

// ---- tiny helpers ----
let toastTimer;
function toast(el, msg) {
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1900);
}
function announce(el, msg) { el.textContent = msg; }
