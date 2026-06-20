// share.js — make a garden portable: a link you can send, and a copy that
// survives a reload. No backend; the words ARE the save file.
//
// Because a word deterministically regrows the exact same plant, we never
// need to store geometry or colors — just the list of words. The URL hash
// becomes a tiny, shareable seed string, e.g.  #g=aurora.wildfire.frost

const KEY = 'wordseed.garden.v1';

// words -> "#g=word1.word2" (dots are rare in words; we still encode each)
export function encodeHash(words) {
  if (!words.length) return '';
  return '#g=' + words.map((w) => encodeURIComponent(w)).join('.');
}

export function decodeHash(hash) {
  const m = /[#&]g=([^&]*)/.exec(hash || '');
  if (!m) return [];
  return m[1].split('.').map((s) => decodeURIComponent(s)).filter(Boolean);
}

export function shareUrl(words) {
  return location.origin + location.pathname + encodeHash(words);
}

// Reflect current garden in the address bar without adding history entries.
export function syncHash(words) {
  const h = encodeHash(words);
  history.replaceState(null, '', h || location.pathname);
}

// localStorage autosave (best-effort; private mode may throw)
export function save(words) {
  try { localStorage.setItem(KEY, JSON.stringify(words)); } catch { /* ignore */ }
}
export function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; }
}

// Clipboard with a graceful fallback for older / insecure contexts.
export async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }
}

// Download the current canvas as a PNG.
export function downloadCanvas(canvas, name = 'wordseed.png') {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, 'image/png');
}
