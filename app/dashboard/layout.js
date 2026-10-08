import Link from "next/link";
import { userClient, currentUser } from "../../lib/supabase-server";
import { currentRole } from "../../lib/admin";
import { serviceClient } from "../../lib/api";
import { loadAppliedVersions } from "../../lib/schema-versions";
import { schemaVerdict } from "../../lib/migrations";

export const dynamic = "force-dynamic";

/** Booking requests waiting for this user as a developer; 0 before migration 0009. */
async function waitingRequests(db, userId) {
  if (!userId) return 0;
  const { count, error } = await db
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("developer_id", userId)
    .eq("status", "pending")
    .eq("developer_decision", "pending");
  return error ? 0 : (count ?? 0);
}

export default async function DashboardLayout({ children }) {
  const user = await currentUser();
  const db = await userClient();
  const role = await currentRole(db, user?.id);
  const pendingRequests = await waitingRequests(db, user?.id);
  // Admins see at a glance when the database is behind the code.
  const schemaBehind = role === "admin" && !schemaVerdict(await loadAppliedVersions(serviceClient())).ok;
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
          <div className="rail-heading">Requests</div>
          <Link href="/dashboard/requests" className="rail-link">
            Ad requests{pendingRequests > 0 ? ` (${pendingRequests})` : ""}
          </Link>
        </div>

        {(role === "advertiser" || role === "admin") && (
          <div className="rail-group">
            <div className="rail-heading">Advertising</div>
            <Link href="/dashboard/advertising" className="rail-link">
              Campaigns
            </Link>
            <Link href="/dashboard/advertising/new" className="rail-link">
              New booking
            </Link>
            <Link href="/dashboard/advertising/reports" className="rail-link">
              Reports
            </Link>
          </div>
        )}

        <div className="rail-group">
          <div className="rail-heading">Library</div>
          <Link href="/dashboard/creatives" className="rail-link">
            Creatives
          </Link>
        </div>

        {role === "admin" && (
          <div className="rail-group">
            <div className="rail-heading">Admin</div>
            <Link href="/dashboard/admin" className="rail-link">
              Moderation
            </Link>
            <Link href="/dashboard/admin/users" className="rail-link">
              Users
            </Link>
            <Link href="/dashboard/admin/system" className="rail-link">
              System{schemaBehind ? " (!)" : ""}
            </Link>
          </div>
        )}

        <div className="rail-foot">{user?.email}</div>
      </nav>

      <main className="main">{children}</main>
    </div>
  );
}
