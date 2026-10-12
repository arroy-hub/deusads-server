// How the Performance tab slices a game's views: which placements a filter picks, how they group,
// which sets of views to ask the database for (migration 0022), and how the answers become rows.
// Pure functions over plain data, so the rules are tested without a browser or a database
// (test/performance-view.test.mjs). The database calls themselves live in lib/performance-data.js.
//
// An item is what the page knows about one live placement (the same shape as the Placements tab):
//   { id, externalId, label, shared, enabled, folderId, tags, placeType, suggestedType, format,
//     places: [{ id, scene, path }] }
// ctx is the game's folders and the scenes switched off:
//   { folders: [{ id, name, enabled, parentId? }], offScenes: Set<string> }
//
// Words used here:
//   source   which views count: "all", "adv" (advertisers') or "own" (the developer's own pictures)
//   scope    a set of views to count: everything in the game, or a list of members
//   member   { placement } (every view of it), { placement, place } (views from one place of it) or
//            { placement, unplaced: true } (views whose place was not recorded)
//   cell     the figures of one scope: views per source, distinct sessions per source, visible time

import { NO_SCENE, effectiveType, stateOf, typeLabel } from "./placement-view.js";

export const PERIODS = [7, 30, 90];
export const DEFAULT_DAYS = 30;
export const SOURCES = ["all", "adv", "own"];

export const BREAKDOWNS = [
  ["placement", "Placement"],
  ["folder", "Folder"],
  ["scene", "Scene"],
  ["tag", "Tag"],
  ["type", "Place type"],
  ["format", "Format"],
];

export const FACETS = [
  ["folder", "Folder"],
  ["scene", "Scene"],
  ["tag", "Tag"],
  ["type", "Place type"],
  ["format", "Format"],
];

export const NONE = "__none"; // a value nothing was set for: no folder, no tag, no type
export const UNKNOWN = "__unknown"; // views whose place was not recorded
export const REMOVED = "__removed"; // placements no longer in the game
export const CUSTOM_FORMAT = "custom";

const LIST_MAX = 60;
const VALUE_MAX = 200;
const DAY_MS = 86_400_000;

// ---------------------------------------------------------------- the address

function asList(value) {
  const raw = Array.isArray(value) ? value : value == null ? [] : [value];
  return [...new Set(raw.map((entry) => String(entry).trim().slice(0, VALUE_MAX)).filter(Boolean))].slice(0, LIST_MAX);
}

const first = (value) => (Array.isArray(value) ? value[0] : value);

/**
 * What the address asks for. Nothing in it is trusted: unknown values fall back to the defaults.
 *   ?days=7|30|90  ?src=adv|own  ?by=folder|…  ?q=text  ?folder=a&folder=b (also scene, tag, type, format)
 *   ?p=id1,id2 (ticked placements)  ?placement=id (one placement)
 */
export function parseParams(sp = {}) {
  const days = Number(first(sp.days));
  return {
    days: PERIODS.includes(days) ? days : DEFAULT_DAYS,
    source: SOURCES.includes(first(sp.src)) ? first(sp.src) : "all",
    by: BREAKDOWNS.some(([key]) => key === first(sp.by)) ? first(sp.by) : null, // null: the page picks
    q: String(first(sp.q) ?? "").trim().slice(0, 100),
    filters: Object.fromEntries(FACETS.map(([key]) => [key, asList(sp[key])])),
    ticked: asList([].concat(sp.p ?? []).flatMap((value) => String(value).split(","))),
    focus: String(first(sp.placement) ?? "").trim().slice(0, VALUE_MAX),
  };
}

/** The address for a state; defaults are left out so addresses stay short. */
export function toQuery(state, { defaultBy = "folder" } = {}) {
  const query = new URLSearchParams({ tab: "performance" });
  if (state.days !== DEFAULT_DAYS) query.set("days", String(state.days));
  if (state.source !== "all") query.set("src", state.source);
  if (state.by && state.by !== defaultBy) query.set("by", state.by);
  if (state.q) query.set("q", state.q);
  for (const [key] of FACETS) for (const value of state.filters[key]) query.append(key, value);
  if (state.ticked.length) query.set("p", state.ticked.join(","));
  if (state.focus) query.set("placement", state.focus);
  return query.toString();
}

export function isFiltered(state) {
  return Boolean(state.q) || FACETS.some(([key]) => state.filters[key].length > 0);
}

/** What the table groups by when the address does not say: folders when there are some, else scenes. */
export function defaultBreakdown(items, folders) {
  if ((folders ?? []).length > 0 && items.some((item) => item.folderId)) return "folder";
  const scenes = new Set(items.flatMap((item) => sceneKeys(item)));
  scenes.delete(NONE);
  return scenes.size > 1 ? "scene" : "placement";
}

// ---------------------------------------------------------------- values of a placement

/** The scenes a placement stands in, as keys; NONE when it reports none. */
export function sceneKeys(item) {
  const keys = [...new Set(item.places.map((place) => place.scene || NONE))];
  return keys.length > 0 ? keys : [NONE];
}

/** The values of a placement for one dimension (a placement can have several: scenes, tags). */
export function valuesOf(item, dim) {
  if (dim === "folder") return [item.folderId || NONE];
  if (dim === "tag") return item.tags.length > 0 ? item.tags : [NONE];
  if (dim === "type") return [effectiveType(item) || NONE];
  if (dim === "format") return [item.format || CUSTOM_FORMAT];
  return sceneKeys(item);
}

export function labelOf(dim, value, ctx) {
  if (value === REMOVED) return "Removed placements";
  if (value === UNKNOWN) return "Location not recorded";
  if (value === NONE) {
    return { folder: "Not in a folder", scene: NO_SCENE, tag: "No tags", type: typeLabel(null), format: "Custom shape" }[dim] ?? "None";
  }
  if (dim === "folder") return (ctx.folders ?? []).find((folder) => folder.id === value)?.name ?? "Deleted folder";
  if (dim === "type") return typeLabel(value);
  if (dim === "format" && value === CUSTOM_FORMAT) return "Custom shape";
  return value;
}

function haystack(item, ctx) {
  const folder = (ctx.folders ?? []).find((entry) => entry.id === item.folderId);
  return [
    item.label,
    item.externalId,
    item.format,
    folder?.name,
    typeLabel(effectiveType(item)),
    ...item.tags,
    ...item.places.flatMap((place) => [place.scene, place.path]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

/** Does a placement pass the filters and the search? `skip` leaves one filter out (for the counts beside it). */
export function passes(item, state, ctx, skip = null) {
  for (const [dim] of FACETS) {
    if (dim === skip) continue;
    const wanted = state.filters[dim];
    if (wanted.length > 0 && !valuesOf(item, dim).some((value) => wanted.includes(value))) return false;
  }
  return !state.q || haystack(item, ctx).includes(state.q.toLowerCase());
}

/**
 * The views of a placement to count, as members, when a scene filter may be on (`sel`: a set of scene keys).
 * A placement with one place (or none known) counts as a whole: every view of it belongs to that place.
 * One that stands in several scenes records which place each view came from (SDK 0.6+), so with a scene
 * filter only the views from the chosen scenes count. Null when nothing of it is in the chosen scenes.
 */
export function membersOf(item, sel) {
  if (item.places.length <= 1) {
    if (sel && !sceneKeys(item).some((key) => sel.has(key))) return null;
    return [{ placement: item.id }];
  }
  if (!sel) return [{ placement: item.id }];
  const chosen = item.places.filter((place) => sel.has(place.scene || NONE));
  return chosen.length > 0 ? chosen.map((place) => ({ placement: item.id, place: place.id })) : null;
}

// ---------------------------------------------------------------- scopes

const signature = (member) => `${member.placement}|${member.place ?? ""}|${member.unplaced ? 1 : 0}`;

function uniqueMembers(members) {
  const seen = new Map();
  for (const member of members) seen.set(signature(member), member);
  return [...seen.values()];
}

/** A list of scopes with no repeats: the same set of views asked for twice is one scope. */
export function createScopes() {
  const list = [];
  const index = new Map();
  const register = (sig, scope) => {
    if (!index.has(sig)) {
      const key = `s${list.length}`;
      index.set(sig, key);
      list.push({ key, ...scope });
    }
    return index.get(sig);
  };
  return {
    list,
    all: () => register("*", { all: true }),
    add(members) {
      const unique = uniqueMembers(members);
      return register(unique.map(signature).sort().join(";"), { members: unique });
    },
  };
}

// ---------------------------------------------------------------- the plan

/**
 * What to ask the database for, given the placements and the state. Returns the scopes (one list,
 * no repeats) and where each answer goes:
 *   list mode: tableScope (what the table counts: the filters), chartScope (the filters and the ticks),
 *              cells (a scope per placement, and per scene of one that stands in several, for the
 *              counts beside the filter options), groups (with their kids), rows, removed.
 *   focus mode: one placement, whatever the filters say.
 */
export function buildPlan({ items, removedIds = [], state, ctx }) {
  const scopes = createScopes();
  const byId = new Map(items.map((item) => [item.id, item]));

  if (state.focus && byId.has(state.focus)) {
    const item = byId.get(state.focus);
    const whole = scopes.add([{ placement: item.id }]);
    const several = item.places.length > 1;
    return {
      mode: "focus",
      scopes: scopes.list,
      item,
      tableScope: whole,
      chartScope: whole,
      spots: several ? item.places.map((place) => ({ place, scope: scopes.add([{ placement: item.id, place: place.id }]) })) : [],
      unknownScope: several ? scopes.add([{ placement: item.id, unplaced: true }]) : null,
      creativeMembers: [{ placement: item.id }],
    };
  }

  const sel = state.filters.scene.length > 0 ? new Set(state.filters.scene) : null;
  const filtered = isFiltered(state);
  const eligible = [];
  for (const item of items) {
    if (!passes(item, state, ctx)) continue;
    const members = membersOf(item, sel);
    if (members) eligible.push({ item, members });
  }
  const eligibleIds = new Set(eligible.map((entry) => entry.item.id));
  const ticked = state.ticked.filter((id) => eligibleIds.has(id));

  // The table counts what passes the filters; the figures and the chart also follow the ticks.
  const tableScope = filtered ? scopes.add(eligible.flatMap((entry) => entry.members)) : scopes.all();
  const tickedSet = new Set(ticked);
  const chartScope =
    ticked.length > 0 ? scopes.add(eligible.filter((entry) => tickedSet.has(entry.item.id)).flatMap((entry) => entry.members)) : tableScope;

  const cells = new Map();
  for (const item of items) {
    const entry = { whole: scopes.add([{ placement: item.id }]), scenes: new Map() };
    if (item.places.length > 1) {
      const perScene = new Map();
      for (const place of item.places) {
        const key = place.scene || NONE;
        if (!perScene.has(key)) perScene.set(key, []);
        perScene.get(key).push({ placement: item.id, place: place.id });
      }
      for (const [key, members] of perScene) entry.scenes.set(key, scopes.add(members));
    }
    cells.set(item.id, entry);
  }

  const groups = new Map();
  const group = (key) => {
    if (!groups.has(key)) groups.set(key, { key, kids: [] });
    return groups.get(key);
  };
  const rows = [];
  for (const { item, members } of eligible) {
    if (state.by === "placement") {
      rows.push({ item, scope: scopes.add(members) });
    } else if (state.by === "scene") {
      if (item.places.length <= 1) {
        group(sceneKeys(item)[0]).kids.push({ item, members, scene: sceneKeys(item)[0] });
      } else {
        const perScene = new Map();
        for (const place of item.places) {
          const key = place.scene || NONE;
          if (sel && !sel.has(key)) continue;
          if (!perScene.has(key)) perScene.set(key, []);
          perScene.get(key).push({ placement: item.id, place: place.id });
        }
        for (const [key, memberList] of perScene) group(key).kids.push({ item, members: memberList, scene: key });
        // Views without a place are not in any scene we can name; with a scene filter they are left out.
        if (!sel) group(UNKNOWN).kids.push({ item, members: [{ placement: item.id, unplaced: true }], scene: UNKNOWN });
      }
    } else {
      for (const key of valuesOf(item, state.by)) group(key).kids.push({ item, members });
    }
  }
  for (const entry of groups.values()) {
    for (const kid of entry.kids) kid.scope = scopes.add(kid.members);
    entry.scope = scopes.add(entry.kids.flatMap((kid) => kid.members));
  }

  // Placements since removed from the game keep their views: one row, only while nothing is filtered.
  const removed = !filtered && removedIds.length > 0 ? scopes.add(removedIds.map((id) => ({ placement: id }))) : null;

  return {
    mode: "list",
    scopes: scopes.list,
    sel,
    filtered,
    eligible,
    ticked,
    tableScope,
    chartScope,
    cells,
    groups: [...groups.values()],
    rows,
    removed,
  };
}

// ---------------------------------------------------------------- the figures

export function emptyCell() {
  return { adv: 0, own: 0, sessions: 0, advSessions: 0, ownSessions: 0, advVisible: 0, advVisibleN: 0, ownVisible: 0, ownVisibleN: 0 };
}

/** One row of game_performance() as a cell. */
export function cellFrom(row) {
  if (!row) return emptyCell();
  const number = (value) => Number(value ?? 0) || 0;
  return {
    adv: number(row.adv),
    own: number(row.own),
    sessions: number(row.sessions),
    advSessions: number(row.adv_sessions),
    ownSessions: number(row.own_sessions),
    advVisible: number(row.adv_visible),
    advVisibleN: number(row.adv_visible_n),
    ownVisible: number(row.own_visible),
    ownVisibleN: number(row.own_visible_n),
  };
}

/** The figures of a cell for the chosen source: views, sessions, mean visible seconds (null when unknown). */
export function figures(cell, source) {
  const c = cell ?? emptyCell();
  const views = source === "adv" ? c.adv : source === "own" ? c.own : c.adv + c.own;
  const sessions = source === "adv" ? c.advSessions : source === "own" ? c.ownSessions : c.sessions;
  const visible = source === "adv" ? c.advVisible : source === "own" ? c.ownVisible : c.advVisible + c.ownVisible;
  const counted = source === "adv" ? c.advVisibleN : source === "own" ? c.ownVisibleN : c.advVisibleN + c.ownVisibleN;
  return { views, sessions, avgVisible: counted > 0 ? visible / counted : null };
}

/** Share of advertisers' views among all views, 0–100 (0 when there are none). */
export function advShare(cell) {
  const total = (cell?.adv ?? 0) + (cell?.own ?? 0);
  return total > 0 ? (cell.adv / total) * 100 : 0;
}

// ---------------------------------------------------------------- the chart's axis

/** The top of the axis: three equal steps, each a round number (0 / 500 / 1,000 / 1,500), never below 3. */
export function niceTop(peak) {
  if (!(peak > 3)) return 3;
  const raw = peak / 3;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  // Finer steps from 10 up (12, 15, 25…) keep the empty room small; below that a step stays a whole number.
  const steps = magnitude >= 10 ? [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10] : [1, 2, 3, 4, 5, 6, 8, 10];
  const step = steps.find((candidate) => raw / magnitude <= candidate + 1e-9);
  return step * magnitude * 3;
}

/** 950 -> "950", 1,500 -> "1.5K", 12,000 -> "12K": for axis labels. */
export function compactCount(value) {
  if (value < 1000) return String(value);
  const thousands = value / 1000;
  return `${Number.isInteger(thousands) ? thousands : thousands.toFixed(1).replace(/\.0$/, "")}K`;
}

// ---------------------------------------------------------------- dates

const iso = (ms) => new Date(ms).toISOString().slice(0, 10);

/** The last `days` UTC days, today included. */
export function windowOf(days, now = new Date()) {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return { days, from: iso(today - (days - 1) * DAY_MS), to: iso(today) };
}

/** One entry per day of the window, quiet days as zeros. `rows` are the by-day rows of one scope. */
export function dayCells(win, rows) {
  const byDay = new Map((rows ?? []).filter((row) => row.day).map((row) => [String(row.day).slice(0, 10), cellFrom(row)]));
  const start = Date.parse(`${win.from}T00:00:00Z`);
  return Array.from({ length: win.days }, (_, index) => {
    const date = iso(start + index * DAY_MS);
    return { date, ...(byDay.get(date) ?? emptyCell()) };
  });
}

// ---------------------------------------------------------------- the answer

const NATURAL = { numeric: true, sensitivity: "base" };
const views = (cell) => cell.adv + cell.own;

function optionOrder(dim) {
  return (a, b) => {
    if ((a.value === NONE) !== (b.value === NONE)) return a.value === NONE ? 1 : -1;
    return String(a.label).localeCompare(String(b.label), undefined, NATURAL);
  };
}

/**
 * The lists behind the filter pills, each value with the views it would show in the period:
 * { key, label, options: [{ value, label, adv, own }] }. A count follows the other filters and the search
 * (but not its own list, so a chosen value does not hide the others).
 */
export function facetOptions(items, state, ctx, cellOf) {
  return FACETS.map(([key, label]) => {
    const found = new Map();
    for (const item of items) for (const value of valuesOf(item, key)) if (!found.has(value)) found.set(value, { value, label: labelOf(key, value, ctx), adv: 0, own: 0 });
    for (const item of items) {
      if (!passes(item, state, ctx, key)) continue;
      const entry = cellOf.get(item.id);
      for (const value of valuesOf(item, key)) {
        const option = found.get(value);
        let cell = entry?.whole;
        // A placement in several scenes shows each scene's views under that scene.
        if (key === "scene" && entry?.scenes.has(value)) cell = entry.scenes.get(value);
        if (cell) {
          option.adv += cell.adv;
          option.own += cell.own;
        }
      }
    }
    return { key, label, options: [...found.values()].sort(optionOrder(key)) };
  });
}

const sceneText = (item, only) => {
  const keys = only ? [only] : sceneKeys(item).filter((key) => key !== NONE);
  return keys.map((key) => labelOf("scene", key, {})).join(", ");
};

function placementRow(item, cell, ctx, scene) {
  const where = scene === UNKNOWN ? "" : sceneText(item, scene);
  return {
    id: item.id,
    label: item.label || item.externalId,
    sub: [item.format || "Custom shape", where].filter(Boolean).join(" · "),
    shared: item.shared !== false && item.places.length > 1,
    spots: item.places.length,
    off: stateOf({ ...item, hasAds: true }, ctx) === "off",
    cell,
  };
}

/**
 * The list view as plain data for the page: figures, chart days, filter lists and the table.
 *   cellOf: Map scopeKey -> cell      dayRows: by-day rows of the chart scope
 */
export function assembleList({ plan, items, state, ctx, win, cellOf, dayRows }) {
  const cell = (key) => cellOf.get(key) ?? emptyCell();
  const unfilteredCount = plan.eligible.length;
  const chartCount = plan.ticked.length > 0 ? plan.ticked.length : unfilteredCount;

  const placementCells = new Map([...plan.cells].map(([id, entry]) => [id, { whole: cell(entry.whole), scenes: new Map([...entry.scenes].map(([k, v]) => [k, cell(v)])) }]));

  // Most viewed first; the page re-sorts when the person picks a column. "Nothing set" groups go last.
  const byViews = (a, b) => views(b.cell) - views(a.cell) || String(a.label).localeCompare(String(b.label), undefined, NATURAL);
  const groups = plan.groups
    .map((entry) => ({
      key: entry.key,
      label: labelOf(state.by, entry.key, ctx),
      count: new Set(entry.kids.map((kid) => kid.item.id)).size,
      cell: cell(entry.scope),
      kids: entry.kids.map((kid) => placementRow(kid.item, cell(kid.scope), ctx, state.by === "scene" ? kid.scene : null)).sort(byViews),
      special: entry.key === NONE || entry.key === UNKNOWN,
    }))
    .sort((a, b) => (a.special !== b.special ? (a.special ? 1 : -1) : a.key === UNKNOWN ? 1 : b.key === UNKNOWN ? -1 : byViews(a, b)));
  const rows = plan.rows.map((row) => placementRow(row.item, cell(row.scope), ctx, null)).sort(byViews);

  const removedCell = plan.removed ? cell(plan.removed) : null;
  const hasRemoved = Boolean(removedCell) && removedCell.adv + removedCell.own > 0;

  return {
    mode: "list",
    state,
    win,
    filtered: plan.filtered,
    ticked: plan.ticked,
    kpi: { cell: cell(plan.chartScope), placements: chartCount },
    totalPlacements: items.length,
    chart: { days: dayCells(win, dayRows) },
    table: {
      by: state.by,
      total: { cell: cell(plan.tableScope), placements: unfilteredCount, hasRemoved },
      groups: state.by === "placement" ? [] : groups,
      rows: state.by === "placement" ? rows : [],
      removed: hasRemoved ? { cell: removedCell } : null,
    },
    facets: facetOptions(items, state, ctx, placementCells),
  };
}

/**
 * One placement as plain data: figures, chart days, what was shown (per creative) and where it stood.
 *   creativeRows: rows of game_performance_creatives()
 *   creativeInfo: Map creativeId -> { name, company, url }
 */
export function assembleFocus({ plan, state, ctx, win, cellOf, dayRows, creativeRows, creativeInfo, folderName }) {
  const cell = (key) => cellOf.get(key) ?? emptyCell();
  const item = plan.item;
  const whole = cell(plan.tableScope);

  const creative = (row) => {
    const info = creativeInfo.get(row.creative_id) ?? {};
    return {
      id: row.creative_id ?? "unknown",
      name: info.name || (row.own ? "Your picture" : "Creative no longer available"),
      company: row.own ? "Your picture" : info.company || "",
      url: info.url || "",
      views: Number(row.impressions),
    };
  };
  const mapped = (own) => (creativeRows ?? []).filter((row) => Boolean(row.own) === own).map(creative).sort((a, b) => b.views - a.views);

  const spots = plan.spots
    .map((spot) => ({ id: spot.place.id, label: spot.place.scene || NO_SCENE, path: spot.place.path, cell: cell(spot.scope) }))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, NATURAL) || a.path.localeCompare(b.path));
  const unknown = plan.unknownScope ? cell(plan.unknownScope) : null;

  return {
    mode: "focus",
    state,
    win,
    kpi: { cell: whole, placements: 1 },
    chart: { days: dayCells(win, dayRows) },
    placement: {
      id: item.id,
      externalId: item.externalId,
      label: item.label || item.externalId,
      shared: item.shared !== false && item.places.length > 1,
      spots: item.places.length,
      format: item.format || "Custom shape",
      folder: folderName ?? "",
      type: typeLabel(effectiveType(item)),
      tags: item.tags,
      off: stateOf({ ...item, hasAds: true }, ctx) === "off",
    },
    shown: { adv: mapped(false), own: mapped(true) },
    where: { spots, unknown: unknown && unknown.adv + unknown.own > 0 ? unknown : null },
  };
}

// ---------------------------------------------------------------- calls

/**
 * The scopes split into calls of reasonable size (an `all` scope and many members in one call would make a
 * heavy request body). Each part is a list of scopes.
 */
export function chunkScopes(scopes, { maxScopes = 250, maxMembers = 2500 } = {}) {
  const parts = [];
  let current = [];
  let members = 0;
  for (const scope of scopes) {
    const weight = scope.members ? scope.members.length : 1;
    if (current.length > 0 && (current.length >= maxScopes || members + weight > maxMembers)) {
      parts.push(current);
      current = [];
      members = 0;
    }
    current.push(scope);
    members += weight;
  }
  if (current.length > 0) parts.push(current);
  return parts;
}
