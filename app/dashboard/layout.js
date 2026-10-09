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

export default async function DashboardLayout({ children }) {
  const user = await currentUser();
  const db = await userClient();
  const role = (await currentRole(db, user?.id)) ?? "developer";
  // A suspended account sees only this notice (column from migration 0015; absent before it).
  const { data: standing } = user
    ? await db.from("accounts").select("suspended_at").eq("id", user.id).maybeSingle()
    : { data: null };
  if (standing?.suspended_at) {
    return (
      <main className="main">
        <h1>Account suspended</h1>
        <p className="lede">This account has been switched off by DeusADS. Contact support if you think this is a mistake.</p>
      </main>
    );
  }
  const requests = 0; // bookings approve themselves: nothing waits for the developer
  const notifications = await unreadCount(db, user?.id);
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
        <div className="rail-brand">
          <div className="rail-logo" aria-hidden="true">
            D
          </div>
          <div>
            <Link href={homeFor(role)} className="rail-mark">
              Deus<span>ADS</span>
            </Link>
            <div className="rail-role">{ROLE_LABEL[role] ?? "Developer"}</div>
          </div>
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
          <div className="rail-foot">{user?.email}</div>
        </div>
      </nav>

      <main className="main">{children}</main>
    </div>
  );
}
