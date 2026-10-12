import Link from "next/link";
import { userClient, currentUser } from "../../../lib/supabase-server";
import { serviceClient } from "../../../lib/api";
import { connection } from "../../../lib/connection";
import { loadDigest, newByGame, registerVisit } from "../../../lib/overview-data";
import { dayLabel } from "../../../lib/campaigns-view";
import Digest from "./digest";
import { gapWords, profileGaps } from "../../../lib/targeting";
import AddGameDialog from "../add-game-dialog";
import GameIcon from "../game-icon";
import GameKey from "../game-key";

export const dynamic = "force-dynamic";
export const metadata = { title: "My games" };

export default async function GamesPage() {
  const db = await userClient();

  // Count only placements still in the game (migration 0002); fall back to all.
  // What each game is (genres, platforms, languages) comes with migration 0018, its icon with 0019.
  const listGames = (skipRemoved, withProfile, withIcon) => {
    let query = db
      .from("games")
      .select(
        `id, name, api_key, created_at${withProfile ? ", genres, platforms, languages" : ""}${withIcon ? ", icon_path" : ""}, placements(count)`
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

  return (
    <>
      <div className="main-head">
        <h1>My games</h1>
        <AddGameDialog />
      </div>
      <p className="lede">
        All your games. Open one to manage its placements, see how its ads perform and edit its settings. Each game
        has its own API key: show it here and paste it into the DeusADS settings in Unity so the SDK can report the
        game&apos;s placements.
      </p>

      {lines.length > 0 && <Digest since={dayLabel(String(visit.since_at).slice(0, 10))} lines={lines} />}

      {games?.length ? (
        <ul className="game-list">
          {withConnection.map((game) => {
            const news = fresh.get(game.id) ?? { campaigns: 0, creatives: 0 };
            const tag = [
              news.campaigns ? `${news.campaigns} new ${news.campaigns === 1 ? "campaign" : "campaigns"}` : "",
              news.creatives ? `${news.creatives} new ${news.creatives === 1 ? "creative" : "creatives"}` : "",
            ].filter(Boolean).join(" · ");
            const gaps = profileGaps(game);
            return (
              <li key={game.id} className="game-item">
                <GameIcon
                  name={game.name}
                  url={game.icon_path ? db.storage.from("creatives").getPublicUrl(game.icon_path).data.publicUrl : ""}
                />
                <div className="game-main">
                  <Link href={`/dashboard/g/${game.id}`} className="game-name">
                    {game.name}
                  </Link>
                  <div className="game-meta">
                    {game.placements?.[0]?.count ?? 0} placements
                  </div>
                  <div className="game-badges">
                    {game.connection && (
                      <Link href={`/dashboard/g/${game.id}?tab=settings`} className={`conn-dot conn-${game.connection.mode}`} aria-label={`SDK: ${game.connection.chip}`}>
                        <b />
                      </Link>
                    )}
                    {tag && <Link href={`/dashboard/g/${game.id}?tab=campaigns`} className="cp-tag">{tag}</Link>}
                  </div>
                  {gaps.known && gaps.missing.length > 0 && (
                    <div className="game-warn">
                      Not described yet.{" "}
                      <Link href={`/dashboard/g/${game.id}?tab=settings`}>Add its {gapWords(gaps.missing)}</Link>{" "}
                      so ads aimed at them can show here.
                    </div>
                  )}
                </div>
                <GameKey value={game.api_key} />
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="empty">
          <p style={{ margin: "0 auto 1rem" }}>
            Add your first game to get a key for the Unity SDK: press “Add game” at the top.
          </p>
        </div>
      )}
    </>
  );
}
