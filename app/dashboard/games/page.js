import Link from "next/link";
import { userClient, currentUser } from "../../../lib/supabase-server";
import { serviceClient } from "../../../lib/api";
import { connection } from "../../../lib/connection";
import { loadDigest, registerVisit } from "../../../lib/overview-data";
import { formatCount } from "../../../lib/analytics";
import { dayLabel } from "../../../lib/campaigns-view";
import Digest from "./digest";
import AddGameDialog from "../add-game-dialog";
import GameIcon from "../game-icon";
import SetupPanel from "./setup-panel";
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

  // Impressions in the last 7 days for each card (migration 0022); a card without the figure shows a dash.
  const week = windowOf(7);
  const views = new Map(
    await Promise.all(
      withConnection.map(async (game) => {
        const { data, error } = await db.rpc("game_performance", {
          p_game_id: game.id, p_from: week.from, p_to: week.to, p_scopes: [{ key: "all", all: true }], p_by_day: false,
        });
        const row = error ? null : (data ?? []).find((entry) => !entry.day);
        return [game.id, row ? Number(row.adv ?? 0) + Number(row.own ?? 0) : null];
      })
    ).catch(() => [])
  );

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

  return (
    <div className="mg">
      <div className="mg-head">
        <div>
          <h1>My games</h1>
          <p>
            {tab === "performance"
              ? "How often ads were shown across your games, and whose they were."
              : "Open a game to manage its placements and see how its ads perform."}
          </p>
        </div>
        <AddGameDialog />
      </div>

      <div role="tablist" aria-label="My games sections" className="mg-tabs">
        <Link href="/dashboard/games" role="tab" aria-selected={tab === "games"} className="mg-tab">
          Games<span className="mg-tab-count">{withConnection.length}</span>
        </Link>
        <Link href="/dashboard/games?tab=performance" role="tab" aria-selected={tab === "performance"} className="mg-tab">
          Performance
        </Link>
      </div>

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
        (games?.length ? (
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
              {withConnection.map((game) => {
                const mode = game.connection?.mode ?? "ok";
                const week7 = views.get(game.id);
                const placements = game.placements?.[0]?.count ?? 0;
                const url = iconOf(game);
                return (
                  <article key={game.id} className="mg-card">
                    <Link href={`/dashboard/g/${game.id}`} aria-label={`Open ${game.name}`} className="mg-card-link" />
                    <div className="mg-card-top">
                      <div className="mg-icon">
                        <GameIcon name={game.name} url={url} />
                        {game.connection && <span className="mg-dot" style={{ background: DOT[mode] }} role="img" aria-label={`SDK: ${game.connection.label}`} />}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <h2>{game.name}</h2>
                        {game.connection && (
                          <div className="mg-state">
                            <b style={{ color: WORD[mode] }}>{game.connection.label}</b> · {game.connection.line}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="mg-stats">
                      <div>
                        <div className="mg-num" data-zero={placements === 0}>{placements}</div>
                        <div className="mg-cap">Placements</div>
                      </div>
                      <div>
                        <div className="mg-num" data-zero={!week7}>{week7 == null ? "—" : formatCount(week7)}</div>
                        <div className="mg-cap">Views, 7 days</div>
                      </div>
                    </div>
                    {mode === "new" ? (
                      <div className="mg-foot mg-foot-setup">
                        <SetupPanel gameId={game.id} gameName={game.name} iconUrl={url} />
                      </div>
                    ) : (
                      <div className="mg-foot">
                        <span>Open game</span>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M9 6l6 6-6 6" />
                        </svg>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </>
        ) : (
          <div className="empty">
            <p style={{ margin: "0 auto 1rem" }}>Add your first game to connect the Unity SDK: press “Add game” at the top.</p>
          </div>
        ))}
    </div>
  );
}
