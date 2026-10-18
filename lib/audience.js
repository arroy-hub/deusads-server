// Who the players are: platform, device, system, language, country (migration 0034).
// The SDK (0.11+) sends the first four when a session starts; the country is worked out here from the request
// (Vercel's x-vercel-ip-country header). The IP address itself is never stored, and there is no city.
// Pure, so the rules are tested without a database (test/audience.test.mjs).

export const DIMENSIONS = [
  { id: "platform", label: "Platform" },
  { id: "device", label: "Device" },
  { id: "os", label: "System" },
  { id: "language", label: "Language" },
  { id: "country", label: "Country" },
];

export const DIMENSION_IDS = DIMENSIONS.map((item) => item.id);

const PLATFORM_LABELS = {
  quest: "Meta Quest",
  pico: "Pico",
  vive: "HTC Vive",
  android: "Android",
  windows: "Windows",
  mac: "macOS",
  linux: "Linux",
  ios: "iOS",
  webgl: "WebGL",
  editor: "Unity Editor",
  other: "Other",
};

/** Text from a client: trimmed, no control characters, at most `max` characters; null when nothing is left. */
export function cleanText(value, max = 64) {
  if (typeof value !== "string") return null;
  const text = value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max);
  return text === "" ? null : text;
}

/** A family the dashboards group by, from Unity's Application.platform and the device model. */
export function platformFamily(platform, model) {
  const raw = (cleanText(platform, 40) ?? "").toLowerCase();
  if (raw === "") return null;
  if (raw.includes("editor")) return "editor";
  const device = (cleanText(model, 80) ?? "").toLowerCase();
  if (raw === "android") {
    if (/quest|oculus|meta/.test(device)) return "quest";
    if (/pico/.test(device)) return "pico";
    if (/vive|htc/.test(device)) return "vive";
    return "android";
  }
  if (raw === "windowsplayer") return "windows";
  if (raw === "osxplayer") return "mac";
  if (raw === "linuxplayer") return "linux";
  if (raw === "iphoneplayer") return "ios";
  if (raw === "webglplayer") return "webgl";
  return "other";
}

/** Two-letter country code from the request headers, or null (unknown, or Vercel's placeholder XX). */
export function countryFrom(headers) {
  const code = (headers?.get?.("x-vercel-ip-country") ?? "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) && code !== "XX" ? code : null;
}

/** The columns of game_sessions that describe the player, only the ones that have a value. */
export function playerContext(body, headers) {
  const context = {
    platform: platformFamily(body?.platform, body?.deviceModel),
    device_model: cleanText(body?.deviceModel, 64),
    os: cleanText(body?.os, 64),
    language: cleanText(body?.language, 32),
    app_version: cleanText(body?.appVersion, 32),
    country: countryFrom(headers),
  };
  return Object.fromEntries(Object.entries(context).filter(([, value]) => value != null));
}

const regionNames = typeof Intl !== "undefined" && Intl.DisplayNames ? new Intl.DisplayNames(["en"], { type: "region" }) : null;

/** What the table shows for a stored value. */
export function valueLabel(dimension, value) {
  if (value == null || value === "") return "Unknown";
  if (dimension === "platform") return PLATFORM_LABELS[value] ?? value;
  if (dimension === "country") {
    try {
      return regionNames?.of(value) ?? value;
    } catch {
      return value;
    }
  }
  return value;
}

const number = (value) => Number(value ?? 0) || 0;

/**
 * Rows of one dimension ready to draw, biggest first, the tail folded into one "Other" row.
 *   kind "developer"  rows of game_audience(): every announced session of the game; the share is of sessions,
 *                     and "per session" is the advertisers' views in those sessions.
 *   kind "advertiser" rows of advertiser_audience(): only what the advertiser's ads reached; the share is of
 *                     impressions, and "per session" is over the sessions where the ad was seen.
 * { value, label, sessions, players, views, perSession, avgView, share }; share is 0..1 of the table's total.
 */
export function audienceTable(rows, dimension, kind, { top = 8 } = {}) {
  const items = (rows ?? []).map((row) => ({
    value: row.value ?? null,
    sessions: number(row.sessions),
    players: number(row.players),
    views: number(row.views),
    visible: number(row.visible_seconds),
    visibleN: number(row.visible_n),
  }));
  const weight = (item) => (kind === "developer" ? item.sessions : item.views);
  items.sort((a, b) => weight(b) - weight(a) || (a.value ?? "").localeCompare(b.value ?? ""));

  const head = items.slice(0, top);
  const tail = items.slice(top);
  if (tail.length > 0) {
    head.push(
      tail.reduce(
        (sum, item) => ({
          value: "__other__",
          sessions: sum.sessions + item.sessions,
          players: sum.players + item.players,
          views: sum.views + item.views,
          visible: sum.visible + item.visible,
          visibleN: sum.visibleN + item.visibleN,
        }),
        { value: "__other__", sessions: 0, players: 0, views: 0, visible: 0, visibleN: 0 }
      )
    );
  }

  const total = items.reduce((sum, item) => sum + weight(item), 0);
  return head.map((item) => ({
    value: item.value,
    label: item.value === "__other__" ? "Other" : valueLabel(dimension, item.value),
    sessions: item.sessions,
    players: item.players,
    views: item.views,
    perSession: item.sessions > 0 ? item.views / item.sessions : null,
    avgView: item.visibleN > 0 ? item.visible / item.visibleN : null,
    share: total > 0 ? weight(item) / total : 0,
  }));
}

/** One rpc per dimension, in parallel. { dimensions: { platform: rows, ... }, missing } ; missing = migration 0034 not run. */
export async function loadAudience(call) {
  const results = await Promise.all(DIMENSION_IDS.map((id) => call(id)));
  const failed = results.find((result) => result.error);
  if (failed) return { dimensions: {}, missing: true, error: failed.error };
  return { dimensions: Object.fromEntries(DIMENSION_IDS.map((id, index) => [id, results[index].data ?? []])), missing: false };
}
