import Link from "next/link";
import { userClient } from "../../lib/supabase-server";
import { createGame } from "./actions";

export const dynamic = "force-dynamic";

export default async function GamesPage() {
  const db = await userClient();

  const { data: games } = await db
    .from("games")
    .select("id, name, api_key, created_at, placements(count)")
    .order("created_at", { ascending: true });

  return (
    <>
      <div className="main-head">
        <h1>Games</h1>
      </div>
      <p className="lede">
        Each game gets its own key. Paste it into the DeusADS settings in Unity and the
        SDK will report its placements here.
      </p>

      {games?.length ? (
        <ul className="game-list">
          {games.map((game) => (
            <li key={game.id} className="game-item">
              <div>
                <Link href={`/dashboard/g/${game.id}`} className="game-name">
                  {game.name}
                </Link>
                <div className="game-meta">
                  {game.placements?.[0]?.count ?? 0} placements
                </div>
              </div>
              <code className="key">{game.api_key}</code>
            </li>
          ))}
        </ul>
      ) : (
        <div className="empty">
          <p style={{ margin: "0 auto 1rem" }}>
            Add your first game to get a key for the Unity SDK.
          </p>
        </div>
      )}

      <form action={createGame} className="row" style={{ marginTop: "1.5rem" }}>
        <input className="field" name="name" placeholder="Game name" required />
        <button className="button" type="submit">
          Add game
        </button>
      </form>
    </>
  );
}
