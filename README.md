# 🌱 Wordseed

**Plant a word. Grow its nature.**

Wordseed is a generative garden. Type any word and it grows into a one‑of‑a‑kind
plant on an animated nighttime canvas. The trick: every word carries a hidden
**genome**. The same word always grows the *same* plant, and no two words grow
alike — because the word itself is the random seed.

> _Deploys as a static site — see [Deploy](#deploy) (Cloudflare Pages)._

---

## How it works

A word is turned into a number (a hash), and that number seeds a tiny
pseudo‑random generator. From that single deterministic stream we derive a full
**genome** — branching depth, spread, curl, color harmony, bloom shape, leaf
style, wind flexibility, vigor — and then *grow* the plant from it with a small
recursive L‑system. Same seed → same sequence → same plant, every time.

```
"aurora"  ──hash──▶  seed  ──PRNG──▶  genome  ──L-system──▶  🌿
```

Nothing is stored but the words. A whole garden is just a list of words, which
is why a garden fits in a URL and can be shared with a link.

## Features

- **Deterministic generative plants** — recursive brancher with six bloom
  silhouettes (disc, star, bell, orb, spire, fan), leaves, and color‑harmony
  palettes (mono, analogous, complementary, triad, split).
- **Truly responsive & crisp** — the canvas renders at the device pixel ratio
  and re‑grows its plants at the right size on resize. Cinematic and wide on
  desktop, portrait with fewer, larger plants on phones.
- **Alive after it grows** — finished plants are baked to bitmaps and swayed by
  a layered‑sine **wind field**; fireflies drift, sparks burst on bloom, and a
  rare meteor crosses the sky.
- **Tap to inspect** — every plant opens a **specimen card** with its field note
  and a readout of its genome (side panel on desktop, bottom sheet on phone).
- **Shareable & persistent** — gardens autosave to `localStorage` and encode
  into the URL hash, so **Share** copies a link that regrows the exact garden
  anywhere.
- **Save image** — export the current scene as a high‑resolution PNG.
- **Offline poetry** — each plant gets a short, deterministic lyrical "field
  note" generated locally (no network, no API key).
- **Accessible & considerate** — keyboard friendly, live‑region announcements,
  honors `prefers-reduced-motion`, and respects mobile safe‑area insets.

## Run it locally

It's a zero‑dependency static site, but it uses ES modules, so it must be served
over HTTP (opening `index.html` directly via `file://` will be blocked by the
browser). Any static server works:

```bash
# Python (already on most machines)
python -m http.server 8080
# then open http://localhost:8080

# or Node
npx serve .
```

## Deploy

It's a static site with **no build step**, so any static host works. For
**Cloudflare Pages**:

1. Connect this GitHub repo in the Cloudflare dashboard
   (**Workers & Pages → Create → Pages → Connect to Git**).
2. **Framework preset:** None
3. **Build command:** _(leave empty)_
4. **Build output directory:** `/` (the repo root — `index.html` lives there)

Or deploy straight from your machine with Wrangler:

```bash
npx wrangler pages deploy . --project-name wordseed
```

## Project structure

```
wordseed/
├─ index.html          # markup + meta, loads the ES-module entry point
├─ css/styles.css      # design system + responsive layout
├─ js/
│  ├─ main.js          # bootstrap
│  ├─ ui.js            # DOM wiring: controls, specimen card, share/save
│  ├─ garden.js        # scene controller: layout, loop, hit-testing, resize
│  ├─ render.js        # canvas drawing: background, plants, blooms, particles, wind
│  ├─ plant.js         # genome → geometry (the L-system)
│  ├─ genome.js        # word stream → plant DNA
│  ├─ fieldnote.js     # deterministic offline poem generator
│  ├─ rng.js           # seeded PRNG + math/color helpers
│  └─ share.js         # URL-hash + localStorage + clipboard + PNG export
└─ assets/favicon.svg
```

Each module is small and single‑purpose; the engine (`rng`/`genome`/`plant`/
`render`) is pure and DOM‑free, while `garden`/`ui` own all the imperative glue.

## Credits

Built as a creative coding experiment. Fonts: [Fraunces](https://fonts.google.com/specimen/Fraunces)
and [Inter](https://fonts.google.com/specimen/Inter). Licensed under
[MIT](./LICENSE).

## Support

If this project helped or delighted you, you can leave a tip. It keeps the experiments going.

<p align="center">
  <a href="https://ko-fi.com/mikeascendx"><img src="https://storage.ko-fi.com/cdn/kofi3.png?v=6" alt="Buy me a coffee at ko-fi.com" height="42"></a>
</p>
