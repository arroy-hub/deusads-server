import Link from "next/link";
import { userClient, currentUser } from "../../../lib/supabase-server";
import { serviceClient } from "../../../lib/api";
import { connection } from "../../../lib/connection";
import { loadDigest, registerVisit } from "../../../lib/overview-data";
import { dayLabel } from "../../../lib/campaigns-view";
import Digest from "./digest";
import AddGameDialog from "../add-game-dialog";
import GameCard from "./game-card";
import { coverBackground, parseCover } from "../../../lib/game-cover";
import { agoText } from "../../../lib/connection";
import GamesPerformance from "./games-performance";
import { loadGamesPerformance } from "../../../lib/games-performance";
import { windowOf } from "../../../lib/performance-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "My games" };

export default async function GamesPage({ searchParams }) {
  const query = (await searchParams) ?? {};
  const tab = query.tab === "performance" ? "performance" : "games";
  const db = await userClient();

  // Count only placements still in the game (migration 0002); fall back to all.
  // What each game is (genres, platforms, languages) comes with migration 0018, its icon with 0019.
  const listGames = (skipRemoved, withProfile, withIcon) => {
    let query = db
      .from("games")
      .select(
        `id, name, created_at${withProfile ? ", genres, platforms, languages" : ""}${withIcon ? ", icon_path" : ""}, placements(count)`
      )
      .order("created_at", { ascending: true });
    if (skipRemoved) query = query.is("placements.removed_at", null);
    return query;
  };

  let games;
  for (const [skipRemoved, withProfile, withIcon] of [
    [true, true, true],
    [true, true, false],
    [true, false, false],
    [false, false, false],
  ]) {
    let error;
    ({ data: games, error } = await listGames(skipRemoved, withProfile, withIcon));
    if (!(error && ["42703", "PGRST204", "PGRST100"].includes(error.code))) break;
  }

  // When the SDK last asked (migration 0024), what is new in each game, and the summary of the visit before this one.
  const user = await currentUser();
  const service = serviceClient();
  const signals = await db.from("games").select("id, last_signal_at");
  const signalOf = new Map(signals.error ? [] : (signals.data ?? []).map((row) => [row.id, row.last_signal_at]));
  const now = Date.now();
  const withConnection = (games ?? []).map((game) => ({ ...game, connection: signals.error ? null : connection(signalOf.get(game.id) ?? null, now) }));
  const visit = await registerVisit(service, user?.id, now).catch(() => null);
  const lines = await loadDigest({ service, userId: user?.id, games: withConnection.filter((game) => game.connection), visit, now }).catch(() => []);

  const iconOf = (game) => (game.icon_path ? db.storage.from("creatives").getPublicUrl(game.icon_path).data.publicUrl : "");

  // What each card shows besides the name: its header (migration 0029), key, placements, campaigns and first impression.
  const coverRows = await db.from("games").select("id, cover");
  const coverOf = new Map(coverRows.error ? [] : (coverRows.data ?? []).map((row) => [row.id, row.cover]));
  const keyRows = await db.from("games").select("id, api_key");
  const keyOf = new Map(keyRows.error ? [] : (keyRows.data ?? []).map((row) => [row.id, row.api_key]));
  const placementRows = await db.from("placements").select("id, game_id").is("removed_at", null);
  const placementsOf = new Map();
  const gameOfPlacement = new Map();
  for (const row of placementRows.error ? [] : (placementRows.data ?? [])) {
    placementsOf.set(row.game_id, (placementsOf.get(row.game_id) ?? 0) + 1);
    gameOfPlacement.set(row.id, row.game_id);
  }
  // Campaigns that have an approved booking on one of the game's placements.
  const bookingRows = await db.from("bookings").select("campaign_id, placement_id").eq("status", "approved");
  const campaignsOf = new Map();
  for (const row of bookingRows.error ? [] : (bookingRows.data ?? [])) {
    const gameId = gameOfPlacement.get(row.placement_id);
    if (!gameId) continue;
    if (!campaignsOf.has(gameId)) campaignsOf.set(gameId, new Set());
    campaignsOf.get(gameId).add(row.campaign_id);
  }
  const firstOf = new Map(
    await Promise.all(
      withConnection.map(async (game) => {
        const { data } = await db.from("impressions").select("occurred_at").eq("game_id", game.id).order("occurred_at", { ascending: true }).limit(1);
        return [game.id, data?.[0]?.occurred_at ?? null];
      })
    ).catch(() => [])
  );
  const day = (at) => (at ? new Date(at).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }) : "");
  const coverUrl = (path) => db.storage.from("creatives").getPublicUrl(path).data.publicUrl;

  const performance =
    tab === "performance" && withConnection.length > 0
      ? await loadGamesPerformance({
          db,
          games: withConnection.map((game) => ({ id: game.id, name: game.name, iconUrl: iconOf(game) })),
          searchParams: query,
        })
      : null;

  const count = (mode) => withConnection.filter((game) => game.connection?.mode === mode).length;
  const DOT = { ok: "#3fb577", silent: "#e0a23a", new: "#9aa0a6" };
  const WORD = { ok: "#1f6b3a", silent: "#8a5a00", new: "#5b524a" };
  const legend = [["ok", "connected"], ["silent", "out of sync"], ["new", "not connected"]];

  const cards = withConnection.map((game, index) => {
    const mode = game.connection?.mode ?? "ok";
    const lastSignal = signalOf.get(game.id) ?? null;
    const cover = parseCover(coverOf.get(game.id));
    const sub = mode === "ok" ? agoText(lastSignal, now) : mode === "silent" ? agoText(lastSignal, now) : "waiting for the SDK";
    return {
      id: game.id,
      name: game.name,
      iconUrl: iconOf(game),
      mode,
      label: game.connection?.label ?? "Connected",
      sub,
      dot: DOT[mode],
      word: WORD[mode],
      placements: placementsOf.get(game.id) ?? 0,
      placementsTotal: placementsOf.get(game.id) ?? 0,
      campaigns: campaignsOf.get(game.id)?.size ?? 0,
      coverCss: coverBackground(coverOf.get(game.id), index, coverUrl),
      defaultCss: coverBackground(null, index),
      coverKind: cover.kind,
      coverId: cover.id ?? null,
      apiKey: keyOf.get(game.id) ?? "",
      createdText: day(game.created_at),
      signalText: lastSignal ? agoText(lastSignal, now) : "No signal yet",
      firstText: day(firstOf.get(game.id)),
    };
  });

  return (
    <div className="mg">
      <div className="mg-top hd-top">
        <div className="mg-head">
          <div>
            <h1>My games</h1>
            <p>Your games, their connection and how their ads perform.</p>
          </div>
        </div>

        <nav className="tabs" aria-label="My games sections">
          <Link href="/dashboard/games" className="tab" aria-current={tab === "games" ? "page" : undefined}>
            Games
            <span className="cp-count" style={{ marginLeft: "0.5rem" }}>{withConnection.length}</span>
          </Link>
          <Link href="/dashboard/games?tab=performance" className="tab" aria-current={tab === "performance" ? "page" : undefined}>
            Performance
          </Link>
        </nav>
      </div>

      <div className="mg-work">
        {lines.length > 0 && <Digest since={dayLabel(String(visit.since_at).slice(0, 10))} lines={lines} />}

        {tab === "performance" && (
          <>
            {performance?.model && <GamesPerformance model={performance.model} />}
            {performance?.error === "migration" && (
              <p className="notice">
                Run <code>supabase/migrations/0022_game_performance.sql</code> in the Supabase SQL editor to turn Performance on.
              </p>
            )}
            {performance?.error === "failed" && <p className="notice">Performance could not be loaded. Try again in a moment.</p>}
            {!performance && <div className="empty"><p style={{ margin: "0 auto" }}>Add a game to see its performance here.</p></div>}
          </>
        )}

        {tab === "games" &&
          (cards.length ? (
            <>
              <ul className="mg-legend">
                {legend.map(([mode, word]) => (
                  <li key={mode}>
                    <span style={{ background: DOT[mode] }} />
                    {count(mode)} {word}
                  </li>
                ))}
              </ul>
              <div className="mg-grid">
                {cards.map((game) => (
                  <GameCard key={game.id} game={game} />
                ))}
              </div>
              <div>
                <AddGameDialog gamesCount={withConnection.length} />
              </div>
            </>
          ) : (
            <div className="mg-empty">
              <div className="mg-empty-cover" />
              <div className="mg-empty-body">
                <span className="mg-empty-icon">
                  <span>
                    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#b8421d" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M3 7h18v11H3zM8 11v3M6.5 12.5h3" />
                    </svg>
                  </span>
                </span>
                <h2>Add your first game</h2>
                <p>Connect a game with the Unity SDK, and its placements, campaigns and results will show up here.</p>
                <div>
                  <AddGameDialog gamesCount={withConnection.length} />
                </div>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}
