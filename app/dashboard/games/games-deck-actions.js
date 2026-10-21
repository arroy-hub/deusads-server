"use server";

import { userClient } from "../../../lib/supabase-server";
import { loadGamesDeckModel } from "../../../lib/games-deck";
import { DEFAULT_DAYS, PERIODS, windowOf } from "../../../lib/performance-view";

const MAX_GAMES = 40;

/** The widgets' figures for the Performance tab of My games: the chosen games added up, fetched after the page is shown. */
export async function loadGamesDeck({ days, games }) {
  try {
    const db = await userClient();
    const { data, error } = await db.from("games").select("id, name").order("created_at", { ascending: true });
    if (error || !data?.length) return null;
    const wanted = Array.isArray(games) ? games.map(String) : [];
    const chosen = (wanted.length > 0 ? data.filter((game) => wanted.includes(game.id)) : data).slice(0, MAX_GAMES);
    if (chosen.length === 0) return null;
    const period = PERIODS.includes(Number(days)) ? Number(days) : DEFAULT_DAYS;
    return await loadGamesDeckModel({ db, games: chosen, win: windowOf(period, new Date()) });
  } catch {
    return null;
  }
}
