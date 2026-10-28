// Outer glow and gradient values of the approved Home variant C, as tuned by Anton in the mockup (Copy settings, 28 Oct).
// These are the defaults; the Glow & gradients panel (?tune) changes them.
export const GD0 = {
  all: { o: 0.12, b: 16, y: 24 },
  na: { o: 0.12, b: 16, y: 24 },
  st: { o: 0.07, b: 8, y: 0 },
  ra: { o: 0.12, b: 16, y: 24 },
  gp: { o: 0.12, b: 16, y: 24 },
  gs: { o: 0.18, b: 28, y: 12 },
  wn: { o: 0.12, b: 16, y: 24, c1: "#f9fafa", c2: "#ffffff", a: 286, s: 100 },
  tp: { o: 0.12, b: 16, y: 24, c1: "#fffaf5", c2: "#ffffff", a: 329, s: 100 },
  rl: { o: 0.16, b: 12, x: 3 },
  ar: { bg: "#fcf7f7", o: 0.12, b: 8, y: 4 },
  mh: { bg: "#eff2f5", l: 0.08 },
  ap: { bg: "#fcfcfc", o: 0.1, b: 8, y: 3 },
  ai: { bg: "#ffffff", o: 0.1, b: 8, y: 3 },
};
export const PLATES = ["na", "ra", "gp", "wn", "tp"];
const SH = [["o", "Strength", 0, 0.4, 0.01], ["b", "Blur", 0, 70, 1], ["y", "Drop", 0, 40, 1]];
const GR = [["c1", "Colour 1", "c"], ["c2", "Colour 2", "c"], ["a", "Angle", 0, 360, 1], ["s", "Colour 2 at", 20, 100, 1]];
export const GSPEC = {
  all: ["All block plates, together", SH],
  na: ["Needs attention plate", SH],
  st: ["Needs attention items", SH],
  ra: ["Recent activity plate", SH],
  gp: ["Guides plate", SH],
  gs: ["Guide sheets", SH],
  wn: ["What’s new plate", SH.concat(GR)],
  tp: ["Tip plate", SH.concat(GR)],
  rl: ["Side panel", [["o", "Strength", 0, 0.5, 0.01], ["b", "Blur", 0, 60, 1], ["x", "Reach", 0, 30, 1]]],
  mh: ["Patch header band", [["bg", "Colour", "c"], ["l", "Line", 0, 0.5, 0.01]]],
  ap: ["Opened patch note plate", [["bg", "Background", "c"], ["o", "Strength", 0, 0.4, 0.01], ["b", "Blur", 0, 24, 1], ["y", "Drop", 0, 12, 1]]],
  ai: ["Opened important plate", [["bg", "Background", "c"], ["o", "Strength", 0, 0.4, 0.01], ["b", "Blur", 0, 24, 1], ["y", "Drop", 0, 12, 1]]],
  ar: ["Opened news plate", [["bg", "Background", "c"], ["o", "Strength", 0, 0.4, 0.01], ["b", "Blur", 0, 24, 1], ["y", "Drop", 0, 12, 1]]],
};
const UNIT = { o: "", b: "px", y: "px", x: "px", a: "deg", s: "%", bg: "", c1: "", c2: "", l: "" };

/** The same values as an inline style object, so the first paint already has them. */
export function glowStyle(values) {
  const out = {};
  for (const key in values) for (const field in values[key]) out[`--${key}-${field}`] = values[key][field] + UNIT[field];
  return out;
}

/** Writes every value as a CSS custom property on the Home root, as the mockup did on the document. */
export function applyGlow(values, el) {
  if (!el) return;
  for (const key in values) for (const field in values[key]) el.style.setProperty(`--${key}-${field}`, values[key][field] + UNIT[field]);
}
