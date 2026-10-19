// Pure helpers behind the admin widgets. Each widget builder returns a plain description
// ({ type: "bars" | "ring" | "stats" | "cols" | "funnel" | "note", … }) that the client draws.

export const RED = "#c2391b", ORANGE = "#c94a24", AMBER = "#b87400", GREEN = "#1b8a50", BLUE = "#3b6fb0", GREY = "#8c7f73", PLUM = "#7a4fb0";

/** [[label, count], …] sorted by count (then label), biggest first. */
export function countBy(items, pick) {
  const m = new Map();
  for (const item of items) {
    const key = pick(item);
    if (key == null || key === "") continue;
    m.set(key, (m.get(key) ?? 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]), "en"));
}

export function median(values) {
  const s = [...values].sort((a, b) => a - b);
  return s.length ? s[Math.floor((s.length - 1) / 2)] : 0;
}

/** The value at or below which `p` (0..1) of the values fall. */
export function percentile(values, p) {
  const s = [...values].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : 0;
}

/** Counts per week for the last `weeks` weeks, oldest first. `ageDays` is how many days ago each item happened. */
export function weekly(items, ageDays, weeks = 13) {
  const out = Array.from({ length: weeks }, () => 0);
  for (const item of items) {
    const i = Math.floor(ageDays(item) / 7);
    if (i >= 0 && i < weeks) out[weeks - 1 - i] += 1;
  }
  return out;
}

export const hours = (h) => (h == null ? "—" : h < 48 ? `${h < 10 ? h.toFixed(1) : Math.round(h)} h` : `${(h / 24).toFixed(1)} d`);
export const pct = (v) => (v > 0 && v < 0.1 ? `${(v * 100).toFixed(1)}%` : `${Math.round(v * 100)}%`);

export const bars = (rows, color = ORANGE, empty = "Nothing yet.") => ({ type: "bars", color, empty, rows: rows.map(([label, value, text]) => ({ label: String(label), value, text: text ?? String(value) })) });
export const ring = (parts, center = "total") => ({ type: "ring", center, parts: parts.map(([label, value, color]) => ({ label, value, color })) });
export const stats = (items) => ({ type: "stats", items: items.map(([label, value, warn]) => ({ label, value: String(value), warn: Boolean(warn) })) });
export const cols = (values, last = "now", unit = "w") => ({ type: "cols", values, labels: values.map((_, i) => (i === values.length - 1 ? last : `-${values.length - 1 - i}${unit}`)) });
export const funnel = (rows) => ({ type: "funnel", rows: rows.map(([label, value, color]) => ({ label, value, color })) });
export const note = (text) => ({ type: "note", text });
