import Link from "next/link";
import { userClient, currentUser } from "../../../lib/supabase-server";
import { serviceClient } from "../../../lib/api";
import { connection } from "../../../lib/connection";
import { loadDigest, newByGame, registerVisit } from "../../../lib/overview-data";
import { formatCount } from "../../../lib/analytics";
import { dayLabel } from "../../../lib/campaigns-view";
import Digest from "./digest";
import { gapWords, profileGaps } from "../../../lib/targeting";
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
  const fresh = await newByGame(service, withConnection.map((game) => game.id)).catch(() => new Map());
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

  const count = (list, mode) => list.filter((game) => game.connection?.mode === mode).length;

  return (
    <>
      <div className="main-head">
        <h1>My games</h1>
        <AddGameDialog />
      </div>

      {lines.length > 0 && <Digest since={dayLabel(String(visit.since_at).slice(0, 10))} lines={lines} />}

      <nav className="tabs" aria-label="My games sections">
        <Link href="/dashboard/games" className="tab" aria-current={tab === "games" ? "page" : undefined}>
          Games
          <span className="cp-count" style={{ marginLeft: "0.5rem" }}>{withConnection.length}</span>
        </Link>
        <Link href="/dashboard/games?tab=performance" className="tab" aria-current={tab === "performance" ? "page" : undefined}>
          Performance
        </Link>
      </nav>

      {tab === "performance" && (
        <>
          <p className="lede">
            How often ads were shown across all your games, and whose they were. A view counts when a player had the placement on screen.
          </p>
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

      {tab === "games" && (games?.length ? (
        <>
          <p className="gc-legend">
            {count(withConnection, "ok")} connected · {count(withConnection, "silent")} out of sync · {count(withConnection, "new")} not connected
          </p>
          <ul className="gc-grid">
            {withConnection.map((game) => {
              const news = fresh.get(game.id) ?? { campaigns: 0, creatives: 0 };
              const tag = [
                news.campaigns ? `${news.campaigns} new ${news.campaigns === 1 ? "campaign" : "campaigns"}` : "",
                news.creatives ? `${news.creatives} new ${news.creatives === 1 ? "creative" : "creatives"}` : "",
              ].filter(Boolean).join(" · ");
              const gaps = profileGaps(game);
              const week7 = views.get(game.id);
              return (
                <li key={game.id} className="gc-card">
                  <div className="gc-top">
                    <GameIcon name={game.name} url={iconOf(game)}>
                      {game.connection && (
                        <span className={`conn-dot conn-${game.connection.mode}`} role="img" aria-label={`SDK: ${game.connection.label}`}>
                          <b />
                        </span>
                      )}
                    </GameIcon>
                    <div className="game-main">
                      <Link href={`/dashboard/g/${game.id}`} className="game-name gc-link">
                        {game.name}
                      </Link>
                      {game.connection && (
                        <div className="game-meta">
                          {game.connection.label} · {game.connection.line}
                        </div>
                      )}
                    </div>
                  </div>
                  <dl className="gc-stats">
                    <div>
                      <dt>Placements</dt>
                      <dd>{game.placements?.[0]?.count ?? 0}</dd>
                    </div>
                    <div>
                      <dt>Views 7 days</dt>
                      <dd>{week7 == null ? "—" : formatCount(week7)}</dd>
                    </div>
                  </dl>
                  {tag && (
                    <div className="game-badges gc-above">
                      <Link href={`/dashboard/g/${game.id}?tab=campaigns`} className="cp-tag">{tag}</Link>
                    </div>
                  )}
                  {gaps.known && gaps.missing.length > 0 && (
                    <div className="game-warn gc-above">
                      Not described yet.{" "}
                      <Link href={`/dashboard/g/${game.id}?tab=settings`}>Add its {gapWords(gaps.missing)}</Link>{" "}
                      so ads aimed at them can show here.
                    </div>
                  )}
                  {game.connection?.mode === "new" && (
                    <div className="gc-above">
                      <SetupPanel gameId={game.id} gameName={game.name} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <div className="empty">
          <p style={{ margin: "0 auto 1rem" }}>
            Add your first game to connect the Unity SDK: press “Add game” at the top.
          </p>
        </div>
      ))}
    </>
  );
}
