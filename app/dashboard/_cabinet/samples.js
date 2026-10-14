// Pictures drawn in the browser, to try the flow with when no file is at hand. They go through the same upload and
// review as any other picture.

export const SAMPLES = [
  { id: "banner", label: "Summer banner", w: 1920, h: 1080, from: "#f4a259", to: "#c8461f" },
  { id: "teaser", label: "Night teaser", w: 1080, h: 1920, from: "#3b4a7a", to: "#161a33" },
  { id: "square", label: "Square", w: 1080, h: 1080, from: "#5fb49c", to: "#1f6f5c" },
];

/** A PNG blob: a gradient with two soft discs and the label in the middle. */
export function drawSample({ w, h, from, to, label }) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext("2d");
  const fill = g.createLinearGradient(0, 0, w, h);
  fill.addColorStop(0, from);
  fill.addColorStop(1, to);
  g.fillStyle = fill;
  g.fillRect(0, 0, w, h);
  g.fillStyle = "rgba(255,255,255,.14)";
  g.beginPath();
  g.arc(w * 0.78, h * 0.28, Math.min(w, h) * 0.28, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.arc(w * 0.18, h * 0.86, Math.min(w, h) * 0.2, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#fff";
  g.font = `700 ${Math.round(Math.min(w, h) * 0.12)}px system-ui, sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(label, w / 2, h / 2);
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), "image/png"));
}

/** A sample picture made for one ad shape (its exact proportions), as a File ready to be uploaded for that shape. */
export async function sampleForShape(formatId, aspect, label) {
  const long = 1600;
  const w = aspect >= 1 ? long : Math.round(long * aspect);
  const h = aspect >= 1 ? Math.round(long / aspect) : long;
  const blob = await drawSample({ w, h, from: "#e0673a", to: "#7a2a12", label });
  return { file: new File([blob], `sample-${formatId}.png`, { type: "image/png" }), width: w, height: h };
}
