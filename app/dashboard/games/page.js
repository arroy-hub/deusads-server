import Link from "next/link";
import { userClient } from "../../../lib/supabase-server";
import { gapWords, profileGaps } from "../../../lib/targeting";
import AddGameForm from "../add-game-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "My games" };

export default async function GamesPage() {
  const db = await userClient();

  // Count only placements still in the game (migration 0002); fall back to all.
  // What each game is (genres, platforms, languages) comes with migration 0018.
  const listGames = (skipRemoved, withProfile) => {
    let query = db
      .from("games")
      .select(`id, name, api_key, created_at${withProfile ? ", genres, platforms, languages" : ""}, placements(count)`)
      .order("created_at", { ascending: true });
    if (skipRemoved) query = query.is("placements.removed_at", null);
    return query;
  };

  let games;
  for (const [skipRemoved, withProfile] of [[true, true], [true, false], [false, false]]) {
    let error;
    ({ data: games, error } = await listGames(skipRemoved, withProfile));
    if (!(error && ["42703", "PGRST204", "PGRST100"].includes(error.code))) break;
  }

  return (
    <>
      <div className="main-head">
        <h1>My games</h1>
      </div>
      <p className="lede">
        Each game gets its own key. Paste it into the DeusADS settings in Unity and the
        SDK will report its placements here.
      </p>

      {games?.length ? (
        <ul className="game-list">
          {games.map((game) => {
            const gaps = profileGaps(game);
            return (
              <li key={game.id} className="game-item">
                <div>
                  <Link href={`/dashboard/g/${game.id}`} className="game-name">
                    {game.name}
                  </Link>
                  <div className="game-meta">
                    {game.placements?.[0]?.count ?? 0} placements
                  </div>
                  {gaps.known && gaps.missing.length > 0 && (
                    <div className="game-warn">
                      Not described yet.{" "}
                      <Link href={`/dashboard/g/${game.id}?tab=settings`}>Add its {gapWords(gaps.missing)}</Link>{" "}
                      so ads aimed at them can show here.
                    </div>
                  )}
                </div>
                <code className="key">{game.api_key}</code>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="empty">
          <p style={{ margin: "0 auto 1rem" }}>
            Add your first game to get a key for the Unity SDK.
          </p>
        </div>
      )}

      <AddGameForm />
    </>
  );
}
