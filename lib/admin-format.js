// Small text helpers shared by the admin screens. Pure.
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-10-18" or an ISO time -> "18 Oct". */
export function fdt(iso) {
  if (!iso) return "";
  const p = String(iso).slice(0, 10).split("-");
  return `${Number(p[2])} ${MON[Number(p[1]) - 1]}`;
}

/** An ISO time -> "18 Oct, 09:12" (UTC). */
export function fdtTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getUTCDate()} ${MON[d.getUTCMonth()]}, ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

export const addDays = (iso, n) => new Date(Date.parse(iso) + n * 864e5).toISOString().slice(0, 10);

/** Impressions with a thin space between thousands, as the mockup writes them: 12 480. */
export const spaced = (n) => (n == null ? "—" : Number(n).toLocaleString("en-US").replace(/,/g, " "));

/** A short id for a card title: the first six characters of a uuid. */
export const shortId = (id) => String(id ?? "").slice(0, 6);
