import Link from "next/link";
import { Suspense } from "react";
import { userClient, currentUser } from "../../lib/supabase-server";
import { currentRole, getMember } from "../../lib/admin";
import { loadAttention } from "../../lib/advertiser-data";
import { isSchemaOutdated, serviceClient } from "../../lib/api";
import { registerVisit } from "../../lib/overview-data";
import { loadAppliedVersions } from "../../lib/schema-versions";
import { schemaVerdict } from "../../lib/migrations";
import { adminCounts, openDisputes, unreadCount } from "../../lib/counts";
import { menuFor, homeFor, ROLE_LABEL } from "../../lib/nav";
import { avatarUrlOf } from "../../lib/account-data";
import { initials as initialsOf, needsAttention } from "../../lib/account-rules";
import AccountMenu from "./account-menu";
import NavLink from "./nav-link";
import { RoleMenu, RoleSwitch } from "./role-view";
import NotificationsBell from "./notifications-bell";
import NavFade from "./nav-fade";
import EnterReveal from "./enter-reveal";

export const dynamic = "force-dynamic";

export const metadata = { title: { template: "%s · DeusADS", default: "DeusADS" } };

/**
 * The bell: unread count, the latest notifications and (for an advertiser) what needs action. It is the slowest part
 * of the frame, so it fills in after the page has started to show instead of holding everything back.
 */
async function Bell({ db, user, role }) {
  const [unread, latest, attention] = await Promise.all([
    unreadCount(db, user?.id),
    // The notifications table comes with migration 0013; without it: none.
    user ? db.from("notifications").select("id, text, link, created_at, read_at").order("created_at", { ascending: false }).limit(15) : { data: null },
    // An advertiser's bell also lists what needs action (rejected creatives, format gaps, limited campaigns, reports).
    role === "advertiser"
      ? getMember().then((me) => (me ? loadAttention(me.service, me) : [])).catch(() => [])
      : [],
  ]);
  return <NotificationsBell items={latest?.data ?? []} unread={unread} attention={attention} />;
}

/** The signed-in person's row for the frame; the picture column (0030) is left out when the database lacks it. */
async function ownAccount(db, id) {
  const first = await db.from("accounts").select("suspended_at, company, avatar_path").eq("id", id).maybeSingle();
  if (!isSchemaOutdated(first.error)) return first;
  return db.from("accounts").select("suspended_at, company").eq("id", id).maybeSingle();
}

export default async function DashboardLayout({ children }) {
  const user = await currentUser();
  const db = await userClient();
  // What the frame needs at once: asked together, not one after the other (each is a round trip to the database).
  const [roleRow, { data: standing }, gamesResult] = await Promise.all([
    currentRole(db, user?.id),
    // A suspended account sees only a notice (column from migration 0015; absent before it). The company
    // and picture for the account block come with it (picture: migration 0030).
    user ? ownAccount(db, user.id) : { data: null },
    // The icon of a game (migration 0019) shows in the menu; without it the plain list still loads.
    db.from("games").select("id, name, icon_path").order("created_at", { ascending: true }).then(async (result) => (result.error ? db.from("games").select("id, name").order("created_at", { ascending: true }) : result)),
  ]);
  const role = roleRow ?? "developer";
  if (standing?.suspended_at) {
    return (
      <main className="main">
        <h1>Account suspended</h1>
        <p className="lede">This account has been switched off by DeusADS. Contact support if you think this is a mistake.</p>
      </main>
    );
  }
  const admin = role === "admin";
  const [, waitingAdmin, disputes, applied] = await Promise.all([
    // Opening any page keeps the visit alive (My games works out "since your last visit" from it).
    registerVisit(serviceClient(), user?.id).catch(() => null),
    admin ? adminCounts(serviceClient()) : null,
    admin ? openDisputes(serviceClient()) : 0,
    admin ? loadAppliedVersions(serviceClient()) : null,
  ]);
  const requests = 0; // bookings approve themselves: nothing waits for the developer
  const schemaBehind = admin && !schemaVerdict(applied).ok;
  const games = gamesResult.data;

  const groups = menuFor(
    role,
    { requests, disputes, inbox: waitingAdmin?.total ?? 0, system: schemaBehind ? "!" : 0 },
    (games ?? []).map((game) => ({
      href: `/dashboard/g/${game.id}`,
      label: game.name,
      icon: game.icon_path ? db.storage.from("creatives").getPublicUrl(game.icon_path).data.publicUrl : null,
    }))
  );

  return (
    <div className={`shell${role === "advertiser" ? " is-adv" : ""}${admin ? " is-admin" : ""}`} translate="no">
      <nav className="rail" aria-label="Main">
        <div className="rail-brand">
          <div>
            <Link href={homeFor(role)} className="rail-mark">
              Deus<span>ADS</span>
            </Link>
            {admin ? <RoleSwitch /> : <div className="rail-role">{ROLE_LABEL[role] ?? "Developer"}</div>}
          </div>
          <div className="rail-bell">
            <Suspense fallback={<span className="bell-button bell-wait" aria-hidden="true" />}>
              <Bell db={db} user={user} role={role} />
            </Suspense>
          </div>
        </div>

        <AccountMenu
          company={standing?.company ?? ""}
          email={user?.email ?? ""}
          avatarUrl={avatarUrlOf(db, standing?.avatar_path)}
          initials={initialsOf({ company: standing?.company, email: user?.email })}
          attention={needsAttention({ company: standing?.company, pendingEmail: user?.new_email })}
        />

        {admin && (
          <RoleMenu
            views={{
              admin: groups.filter((group) => !group.heading?.startsWith("As a")),
              advertiser: groups.filter((group) => group.heading === "As an advertiser").map((group) => ({ ...group, heading: null })),
              developer: groups.filter((group) => group.heading === "As a developer").map((group) => ({ ...group, heading: null })),
            }}
          />
        )}
        {!admin && groups.map((group, index) => (
          <div className={`rail-group${group.heading?.startsWith("As a") ? " is-dim" : ""}`} key={group.heading ?? index}>
            {group.heading && <div className="rail-heading">{group.heading}</div>}
            {group.items.map((item) => (
              <NavLink key={item.key + item.href} item={item} />
            ))}
          </div>
        ))}

      </nav>

      <div className="content">
        <main className="main">{children}</main>
        <NavFade />
        <EnterReveal />
      </div>
    </div>
  );
}
