// Days as "YYYY-MM-DD" (UTC, like the bookings) and the colour of each campaign status, shared by the cabinet screens.
const D = 86400000;
export const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
export const todayISO = () => iso(Date.now());
export const addD = (isoDate, n) => iso(Date.parse(`${isoDate}T00:00:00Z`) + n * D);
export const diff = (a, b) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / D);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export function fmtDay(isoDate, weekday = false) {
  if (!isoDate) return "";
  const [y, m, d] = isoDate.split("-").map(Number);
  const w = WD[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${weekday ? w + " " : ""}${d} ${MONTHS[m - 1]}`;
}
export const TONE = {
  live: "#1b8a50", limited: "#c98a14", paused: "#c98a14", stopped: "#b3361b", scheduled: "#3b6fb5", waiting: "#3b6fb5", draft: "#8c7f73", ended: "#8c7f73",
};
