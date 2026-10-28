// Outer glow and gradient values of the approved Home variant C. These are the defaults; the Glow & gradients panel changes them.
export const GD0 = {
  all: { o: 0.18, b: 34, y: 14 },
  na: { o: 0.18, b: 34, y: 14 },
  st: { o: 0.07, b: 8, y: 2 },
  ra: { o: 0.18, b: 34, y: 14 },
  gp: { o: 0.18, b: 34, y: 14 },
  gs: { o: 0.18, b: 28, y: 12 },
  wn: { o: 0.18, b: 34, y: 14, c1: "#fdeee6", c2: "#ffffff", a: 160, s: 62 },
  tp: { o: 0.18, b: 34, y: 14, c1: "#f6efe7", c2: "#fffdfb", a: 150, s: 70 },
  rl: { o: 0.16, b: 12, x: 3 },
  ar: { bg: "#fdf8f6", o: 0.1, b: 8, y: 3 },
  mh: { bg: "#eff4fa", l: 0.16 },
  ap: { bg: "#fdf8f6", o: 0.1, b: 8, y: 3 },
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

/** Writes every value as a CSS custom property on the Home root, as the mockup did on the document. */
export function applyGlow(values, el) {
  if (!el) return;
  for (const key in values) for (const field in values[key]) el.style.setProperty(`--${key}-${field}`, values[key][field] + UNIT[field]);
}
