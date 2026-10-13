// The address of the Performance tab of "My games": what it asks for and how it is written. Pure, so the page
// (client) and the loader (server) share it.

import { DEFAULT_DAYS, PERIODS, SOURCES } from "./performance-view.js";

const VALUE_MAX = 200;

const first = (value) => (Array.isArray(value) ? value[0] : value);
const asList = (value) => {
  const raw = Array.isArray(value) ? value : value == null ? [] : [value];
  return [...new Set(raw.map((entry) => String(entry).trim().slice(0, VALUE_MAX)).filter(Boolean))].slice(0, 60);
};

/** ?days=7|30|90  ?src=adv|own  ?game=id (repeat)  ?type=…  ?format=… — nothing is trusted. */
export function parseGamesParams(sp = {}) {
  const days = Number(first(sp.days));
  return {
    days: PERIODS.includes(days) ? days : DEFAULT_DAYS,
    source: SOURCES.includes(first(sp.src)) ? first(sp.src) : "all",
    games: asList(sp.game),
    types: asList(sp.type),
    formats: asList(sp.format),
  };
}

/** The address of a state, defaults left out. */
export function gamesQuery(state) {
  const query = new URLSearchParams({ tab: "performance" });
  if (state.days !== DEFAULT_DAYS) query.set("days", String(state.days));
  if (state.source !== "all") query.set("src", state.source);
  for (const id of state.games) query.append("game", id);
  for (const value of state.types) query.append("type", value);
  for (const value of state.formats) query.append("format", value);
  return query.toString();
}

