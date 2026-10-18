// The saved layout of a widget board ("Advanced Data"): is it open, which widgets are on it (in order) and how
// big each one is. Whatever comes from the browser is cleaned before it is stored or used.

export const DECK_KINDS = ["developer", "advertiser"];
const KEY = /^[a-z0-9_-]{1,12}$/;
const MAX_WIDGETS = 40;

/** A layout fit to store: `{ open, sel, sizes }`; `sel` is null for "the default set". */
export function cleanLayout(raw) {
  const out = { open: false, sel: null, sizes: {} };
  if (!raw || typeof raw !== "object") return out;
  out.open = raw.open === true;
  if (Array.isArray(raw.sel)) {
    const seen = new Set();
    out.sel = raw.sel.filter((k) => typeof k === "string" && KEY.test(k) && !seen.has(k) && seen.add(k)).slice(0, MAX_WIDGETS);
  }
  if (raw.sizes && typeof raw.sizes === "object") {
    for (const [k, v] of Object.entries(raw.sizes).slice(0, MAX_WIDGETS)) {
      if (!KEY.test(k) || !v || typeof v !== "object") continue;
      const size = {};
      if (Number.isFinite(v.w)) size.w = Math.min(12, Math.max(3, Math.round(v.w)));
      if (Number.isFinite(v.h)) size.h = Math.min(1200, Math.max(60, Math.round(v.h)));
      if (Object.keys(size).length) out.sizes[k] = size;
    }
  }
  return out;
}
