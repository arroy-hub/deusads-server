import Link from "next/link";
import { userClient, currentUser } from "../../lib/supabase-server";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }) {
  const user = await currentUser();
  const db = await userClient();
  const { data: games } = await db
    .from("games")
    .select("id, name")
    .order("created_at", { ascending: true });

  return (
    <div className="shell">
      <nav className="rail">
        <Link href="/dashboard" className="rail-mark">
          Deus<span>ADS</span>
        </Link>

        <div className="rail-group">
          <div className="rail-heading">Games</div>
          {(games ?? []).map((game) => (
            <Link key={game.id} href={`/dashboard/g/${game.id}`} className="rail-link">
              {game.name}
            </Link>
          ))}
          <Link href="/dashboard" className="rail-link">
            All games
          </Link>
        </div>

        <div className="rail-group">
          <div className="rail-heading">Library</div>
          <Link href="/dashboard/creatives" className="rail-link">
            Creatives
          </Link>
        </div>

        <div className="rail-foot">{user?.email}</div>
      </nav>

      <main className="main">{children}</main>
    </div>
  );
}
