// genome.js — turn a word's random stream into a plant's "DNA".
//
// A genome is just a bag of numbers (and a few labels) that fully describe
// how a plant looks and grows. Nothing here touches the canvas — it's pure
// data. render/plant code reads this genome and obeys it. Because every
// value is drawn from the seeded RNG, the genome is identical for the same
// word every time.

import { seededRng, rangeFrom, pick, shiftHue, TAU } from './rng.js';

// Human-readable hue buckets — used for poems and the specimen card.
export function hueName(h) {
  if (h < 18 || h >= 345) return 'ember';
  if (h < 45) return 'amber';
  if (h < 70) return 'gold';
  if (h < 90) return 'chartreuse';
  if (h < 150) return 'verdant';
  if (h < 195) return 'glacial';
  if (h < 255) return 'cobalt';
  if (h < 290) return 'dusk';
  if (h < 320) return 'orchid';
  return 'fuchsia';
}

// Bloom silhouettes the renderer knows how to draw.
export const BLOOMS = ['disc', 'star', 'bell', 'orb', 'spire', 'fan'];

// Build a palette of 3 bloom colors using a real color-harmony scheme,
// so each plant reads as intentional rather than random confetti.
function buildPalette(rng, h0) {
  const r = rangeFrom(rng);
  const scheme = pick(rng, ['mono', 'analogous', 'complementary', 'triad', 'split']);
  const base = { h: h0, s: Math.round(r(70, 90)), l: Math.round(r(54, 64)) };
  let hues;
  switch (scheme) {
    case 'mono':         hues = [0, 0, 0]; break;
    case 'analogous':    hues = [0, r(20, 38), -r(20, 38)]; break;
    case 'complementary':hues = [0, 180, r(150, 168)]; break;
    case 'triad':        hues = [0, 120, 240]; break;
    default:             hues = [0, r(150, 170), -r(150, 170)]; // split-complementary
  }
  const blooms = hues.map((d, i) => ({
    h: ((h0 + d) % 360 + 360) % 360,
    s: Math.round(r(62, 88)),
    l: Math.round(r(52 + i * 2, 64)),
  }));
  return { scheme, blooms };
}

// Decide an overall growth habit ("archetype") from the structural genes.
// This is what makes one word a wispy grass and another a stout little tree.
function classify(g) {
  if (g.width0 > 0.016 && g.decay > 0.79 && g.depth >= 5) return 'tree';
  if (g.spread > 0.5 && g.children >= 3) return 'shrub';
  if (Math.abs(g.curl) > 0.2 && g.decay > 0.8) return 'vine';
  if (g.width0 < 0.012 && g.depth <= 4) return 'grass';
  if (g.bloomSize > 0.05 && g.spread < 0.4) return 'herb';
  return 'fern';
}

export function makeGenome(rng) {
  const r = rangeFrom(rng);
  const h0 = Math.floor(rng() * 360);

  // structural genes
  const g = {
    h0,
    depth: Math.round(r(4, 6)),
    children: rng() < 0.5 ? 2 : 3,
    spread: r(0.3, 0.62),
    jitter: r(0.05, 0.22),
    len0: r(0.16, 0.24),          // first segment length as fraction of plant height
    decay: r(0.72, 0.84),         // how much each generation shrinks
    width0: r(0.009, 0.02),       // base stem width as fraction of plant height
    curl: r(-0.26, 0.26),
    sway: r(-0.05, 0.05),         // base lean of the whole plant
    vigor: r(0.62, 1.0),          // overall size multiplier within its slot
  };

  // bloom genes
  g.bloomType = pick(rng, BLOOMS.map((_, i) => i));
  g.bloomShape = BLOOMS[g.bloomType];
  g.bloomSize = r(0.03, 0.07);    // fraction of plant height
  g.petals = 4 + Math.floor(rng() * 5); // 4..8, used by star/fan/disc
  g.bloomEvery = rng() < 0.5 ? 'many' : 'tips';
  g.glow = r(0.25, 0.8);

  // foliage genes
  g.hasLeaves = rng() < 0.78;
  g.leafSize = r(0.04, 0.085);
  g.leafEvery = rng() < 0.6 ? 'pairs' : 'alt';
  const greenLeaves = rng() < 0.6;
  g.leafHSL = greenLeaves
    ? { h: Math.round(r(95, 145)), s: Math.round(r(22, 42)), l: Math.round(r(26, 40)) }
    : { h: h0, s: Math.round(r(20, 38)), l: Math.round(r(24, 38)) };

  // color
  g.stemHSL = { h: h0, s: Math.round(r(16, 36)), l: Math.round(r(18, 30)) };
  g.tipHSL = { h: h0, s: Math.round(r(30, 50)), l: Math.round(r(42, 58)) };
  const pal = buildPalette(rng, h0);
  g.scheme = pal.scheme;
  g.bloomsHSL = pal.blooms;
  g.rootHSL = shiftHue(g.stemHSL, 6);

  // derived traits
  g.archetype = classify(g);
  // Thin, tall plants bend more in the wind; stout trees barely move.
  g.flex = clamp01(1.5 - g.width0 * 60 - (g.archetype === 'tree' ? 0.5 : 0));
  g.flowerCount = g.bloomEvery === 'many' ? 'many-flowered' : 'tip-blooming';

  return g;
}

function clamp01(v) { return Math.max(0.08, Math.min(1, v)); }

// A short structural caption used as a fallback label and in the card.
export function algoLabel(g) {
  const habit = g.spread > 0.5 ? 'wild' : g.spread < 0.38 ? 'spare' : 'poised';
  return `${habit} ${g.archetype}, ${g.flowerCount}, ${hueName(g.h0)} tones`;
}

// Structured rows for the specimen card. Pure formatting of the genome.
export function genomeReadout(g) {
  const habit = g.spread > 0.5 ? 'wild' : g.spread < 0.38 ? 'spare' : 'poised';
  return [
    ['Form', g.archetype],
    ['Habit', habit],
    ['Bloom', `${g.bloomShape}${g.bloomEvery === 'many' ? ', clustered' : ''}`],
    ['Palette', `${g.scheme}, ${hueName(g.h0)}`],
    ['Branching', `depth ${g.depth} · ${g.children}-way`],
    ['Vigor', `${Math.round(g.vigor * 100)}%`],
    ['Foliage', g.hasLeaves ? 'leafed' : 'bare'],
  ];
}

export { TAU };
