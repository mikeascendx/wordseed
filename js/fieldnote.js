// fieldnote.js — write a short, lyrical "field note" for each plant.
//
// The original prototype fetched this sentence from a live AI endpoint. That
// can't work from a static page (no API key, blocked by CORS) so it silently
// failed every time. We replace it with an OFFLINE generator: a small grammar
// filled from word-banks, all driven by the word's own seeded RNG. Result:
// always works, never needs a network, and stays deterministic — the same
// word always earns the same poem, which is the whole spirit of Wordseed.

import { seededRng, rangeFrom, pick } from './rng.js';
import { hueName } from './genome.js';

const HABIT = {
  wild: ['a tangle of', 'a riot of', 'a thicket of', 'a sprawl of'],
  poised: ['a poised arc of', 'a slow curl of', 'a quiet spire of', 'a lean of'],
  spare: ['a single stem of', 'one spare blade of', 'a lone reach of', 'a thin vein of'],
};
const FORM = {
  tree: 'branches', shrub: 'thicket', vine: 'tendrils',
  grass: 'blades', herb: 'stems', fern: 'fronds',
};
const VERB = ['reaching for', 'leaning toward', 'breathing in', 'listening for',
  'drifting past', 'turning to', 'remembering', 'straining after', 'unfolding into'];
const TARGET = ['the moon', 'first light', 'the dark', 'a far star', 'the cold air',
  'some lost noon', 'the long night', 'the last of the wind', 'rain that never came'];
const SCENT = ['salt', 'smoke', 'cold rain', 'crushed honey', 'iron', 'frost',
  'old paper', 'pollen', 'river silt', 'green wood'];
const TRAIT = ['restless', 'patient', 'half-asleep', 'feverish', 'sure of itself',
  'unhurried', 'storm-bent', 'tender', 'sharp-edged'];

function habitOf(g) {
  return g.spread > 0.5 ? 'wild' : g.spread < 0.38 ? 'spare' : 'poised';
}

// Build one sentence (<= ~14 words). Deterministic per word.
export function fieldNote(word, g) {
  const rng = seededRng(word, '~note'); // separate stream, won't disturb the plant
  const r = rangeFrom(rng);
  const hue = hueName(g.h0);
  const habit = habitOf(g);
  const form = FORM[g.archetype] || 'stems';
  const w = (word || 'seed').trim().toLowerCase();

  const templates = [
    () => `${cap(pick(rng, HABIT[habit]))} ${hue} ${form}, ${pick(rng, VERB)} ${pick(rng, TARGET)}.`,
    () => `The ${w} grows ${hue} and ${pick(rng, TRAIT)}, ${pick(rng, VERB)} ${pick(rng, TARGET)}.`,
    () => `${cap(hue)} ${form} that open at dusk, scented with ${pick(rng, SCENT)}.`,
    () => `It comes up ${pick(rng, TRAIT)} — ${hue}, ${pick(rng, VERB)} ${pick(rng, TARGET)}.`,
    () => `A ${w}-plant: ${hue} ${form}, ${pick(rng, TRAIT)} and ${pick(rng, VERB)} ${pick(rng, TARGET)}.`,
  ];
  // bias toward the 0.x'th template deterministically
  const idx = Math.floor(r(0, templates.length));
  return tidy(templates[idx]());
}

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function tidy(s) { return s.replace(/\s+/g, ' ').replace(/\s+([.,])/g, '$1').trim(); }
