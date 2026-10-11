import Link from "next/link";
import { userClient } from "../../../lib/supabase-server";
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
  let iconsKnown = false;
  for (const [skipRemoved, withProfile, withIcon] of [
    [true, true, true],
    [true, true, false],
    [true, false, false],
    [false, false, false],
  ]) {
    let error;
    ({ data: games, error } = await listGames(skipRemoved, withProfile, withIcon));
    iconsKnown = withIcon;
    if (!(error && ["42703", "PGRST204", "PGRST100"].includes(error.code))) break;
  }

  return (
    <>
      <div className="main-head">
        <h1>My games</h1>
        <AddGameDialog />
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
                <GameIcon
                  gameId={game.id}
                  name={game.name}
                  url={game.icon_path ? db.storage.from("creatives").getPublicUrl(game.icon_path).data.publicUrl : ""}
                  editable={iconsKnown}
                />
                <div className="game-main">
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
