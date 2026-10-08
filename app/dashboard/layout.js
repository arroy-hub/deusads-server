import Link from "next/link";
import { userClient, currentUser } from "../../lib/supabase-server";
import { currentRole } from "../../lib/admin";
import { serviceClient } from "../../lib/api";
import { loadAppliedVersions } from "../../lib/schema-versions";
import { schemaVerdict } from "../../lib/migrations";
import { adminCounts, unreadCount } from "../../lib/counts";
import { menuFor, homeFor, ROLE_LABEL } from "../../lib/nav";
import NavLink from "./nav-link";

export const dynamic = "force-dynamic";

export const metadata = { title: { template: "%s · DeusADS", default: "DeusADS" } };

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
  const role = (await currentRole(db, user?.id)) ?? "developer";
  const [requests, notifications] = await Promise.all([waitingRequests(db, user?.id), unreadCount(db, user?.id)]);
  const waitingAdmin = role === "admin" ? await adminCounts(serviceClient()) : null;
  const schemaBehind = role === "admin" && !schemaVerdict(await loadAppliedVersions(serviceClient())).ok;
  const { data: games } = await db
    .from("games")
    .select("id, name")
    .order("created_at", { ascending: true });

  const groups = menuFor(
    role,
    { requests, notifications, inbox: waitingAdmin?.total ?? 0, system: schemaBehind ? "!" : 0 },
    (games ?? []).map((game) => ({ href: `/dashboard/g/${game.id}`, label: game.name }))
  );

  return (
    <div className="shell">
      <nav className="rail" aria-label="Main">
        <div>
          <Link href={homeFor(role)} className="rail-mark">
            Deus<span>ADS</span>
          </Link>
          <div className="rail-role">{ROLE_LABEL[role] ?? "Developer"}</div>
        </div>

        {groups.map((group, index) => (
          <div className="rail-group" key={group.heading ?? index}>
            {group.heading && <div className="rail-heading">{group.heading}</div>}
            {group.items.map((item) => (
              <NavLink key={item.key + item.href} item={item} />
            ))}
          </div>
        ))}

        <div className="rail-group rail-switch">
          {role === "developer" && (
            <Link href="/dashboard/become-advertiser" className="rail-link">
              Advertise your own game
            </Link>
          )}
          <div className="rail-foot">{user?.email}</div>
        </div>
      </nav>

      <main className="main">{children}</main>
    </div>
  );
}
