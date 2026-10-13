// Performance across all of a developer's games (the Performance tab of "My games").
// The same figures as a game's own Performance tab (game_performance(), migration 0022), asked once per game
// and added up here. Sessions are counted per game, so their sum is the number of (game, session) pairs.
// The pure part (parameters, rows, facets) is tested without a database in test/games-performance.test.mjs.

import { loadPlacementItems } from "./performance-data.js";
import { parseGamesParams } from "./games-query.js";

export { gamesQuery, parseGamesParams } from "./games-query.js";
import {
  CUSTOM_FORMAT,
  NONE,
  cellFrom,
  dayCells,
  emptyCell,
  labelOf,
  valuesOf,
  windowOf,
} from "./performance-view.js";

export const MAX_GAMES = 40;
/** Add cells together. */
export function sumCells(cells) {
  const total = emptyCell();
  for (const cell of cells) for (const key of Object.keys(total)) total[key] += cell?.[key] ?? 0;
  return total;
}

/** Add the by-day rows of several games into one list of rows per day. */
export function mergeDays(win, perGameRows) {
  const lists = perGameRows.map((rows) => dayCells(win, rows));
  return Array.from({ length: win.days }, (_, index) => {
    const { date } = lists[0]?.[index] ?? dayCells(win, [])[index];
    return { date, ...sumCells(lists.map((list) => list[index])) };
  });
}

/** Does a placement pass the place type and format filters? */
export function passesFilters(item, state) {
  const ok = (dim, wanted) => wanted.length === 0 || valuesOf(item, dim).some((value) => wanted.includes(value));
  return ok("type", state.types) && ok("format", state.formats);
}

/** Options for the Place type and Format filters, from the placements of all games. */
export function facetsOf(itemLists) {
  const collect = (dim) => {
    const counts = new Map();
    for (const items of itemLists) for (const item of items) for (const value of valuesOf(item, dim)) counts.set(value, (counts.get(value) ?? 0) + 1);
    return [...counts]
      .map(([value, count]) => ({ value, count, label: labelOf(dim, value, { folders: [] }) }))
      .sort((a, b) => (a.value === NONE || a.value === CUSTOM_FORMAT ? 1 : b.value === NONE || b.value === CUSTOM_FORMAT ? -1 : a.label.localeCompare(b.label, undefined, { numeric: true })));
  };
  return { types: collect("type"), formats: collect("format") };
}

/**
 * Everything the page shows. Returns { model } or { error: "migration" | "failed" }.
 *   games: [{ id, name, icon? }] (the developer's games)
 */
export async function loadGamesPerformance({ db, games, searchParams, now = new Date() }) {
  const parsed = parseGamesParams(searchParams);
  const known = new Set(games.map((game) => game.id));
  const state = { ...parsed, games: parsed.games.filter((id) => known.has(id)) };
  const win = windowOf(state.days, now);
  const chosen = (state.games.length > 0 ? games.filter((game) => state.games.includes(game.id)) : games).slice(0, MAX_GAMES);

  const loaded = await Promise.all(games.slice(0, MAX_GAMES).map((game) => loadPlacementItems(db, game.id)));
  if (loaded.some((entry) => entry.error)) return { error: "failed" };
  const itemsOf = new Map(games.slice(0, MAX_GAMES).map((game, index) => [game.id, loaded[index].items]));
  const filtered = state.types.length > 0 || state.formats.length > 0;

  const perGame = [];
  let failure = null;
  await Promise.all(
    chosen.map(async (game) => {
      const eligible = (itemsOf.get(game.id) ?? []).filter((item) => passesFilters(item, state));
      const gameScope = filtered
        ? { key: "g", members: eligible.map((item) => ({ placement: item.id })) }
        : { key: "g", all: true };
      const perPlacement = eligible.slice(0, 250).map((item) => ({ key: `p${item.id}`, members: [{ placement: item.id }] }));
      const base = { p_game_id: game.id, p_from: win.from, p_to: win.to };
      if (filtered && eligible.length === 0) {
        perGame.push({ game, eligible, cell: emptyCell(), cells: new Map(), dayRows: [] });
        return;
      }
      const [totals, days] = await Promise.all([
        db.rpc("game_performance", { ...base, p_scopes: [gameScope, ...perPlacement], p_by_day: false }),
        db.rpc("game_performance", { ...base, p_scopes: [gameScope], p_by_day: true }),
      ]);
      const error = totals.error ?? days.error;
      if (error) {
        failure = error;
        return;
      }
      const cells = new Map();
      for (const row of totals.data ?? []) if (!row.day) cells.set(row.scope_key, cellFrom(row));
      perGame.push({ game, eligible, cell: cells.get("g") ?? emptyCell(), cells, dayRows: (days.data ?? []).filter((row) => row.day) });
    })
  );
  if (failure) {
    const missing = failure.code === "PGRST202" || failure.code === "42883";
    if (!missing) console.error("[DeusADS] games performance failed:", failure.code, failure.message);
    return { error: missing ? "migration" : "failed" };
  }

  const order = new Map(chosen.map((game, index) => [game.id, index]));
  perGame.sort((a, b) => order.get(a.game.id) - order.get(b.game.id));
  const rows = perGame.map(({ game, eligible, cell, cells }) => ({
    id: game.id,
    name: game.name,
    iconUrl: game.iconUrl ?? "",
    cell,
    placements: eligible
      .map((item) => ({ id: item.id, label: item.label, cell: cells.get(`p${item.id}`) ?? emptyCell() }))
      .sort((a, b) => b.cell.adv + b.cell.own - (a.cell.adv + a.cell.own) || String(a.label).localeCompare(String(b.label), undefined, { numeric: true })),
  }));

  return {
    model: {
      state,
      win,
      filtered,
      kpi: { cell: sumCells(rows.map((row) => row.cell)), games: rows.length, totalGames: games.length },
      days: mergeDays(win, perGame.map((entry) => entry.dayRows)),
      rows,
      gameOptions: games.map((game) => ({ value: game.id, label: game.name })),
      facets: facetsOf([...itemsOf.values()]),
    },
  };
}
