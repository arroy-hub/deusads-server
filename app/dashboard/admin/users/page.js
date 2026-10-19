import { notFound } from "next/navigation";
import { getAdmin } from "../../../../lib/admin";
import { isSchemaOutdated } from "../../../../lib/api";
import { activeAccountIds } from "../../../../lib/admin-rules";
import { userRows, userWidgets, USER_GROUPS, USER_DEFAULTS } from "../../../../lib/admin-users";
import { userClient } from "../../../../lib/supabase-server";
import { loadDeckLayout } from "../../../../lib/deck-layout-data";
import UsersView from "./users-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Users" };

export default async function UsersPage() {
  const admin = await getAdmin();
  if (!admin) notFound();

  // suspended_at comes with migration 0015.
  const list = (columns) => admin.service.from("accounts").select(columns).order("created_at", { ascending: true });
  // avatar_path comes with migration 0030.
  let { data: accounts, error } = await list("id, email, company, role, created_at, suspended_at, avatar_path");
  if (isSchemaOutdated(error)) ({ data: accounts, error } = await list("id, email, company, role, created_at, suspended_at"));
  if (isSchemaOutdated(error)) ({ data: accounts } = await list("id, email, company, role, created_at"));

  // Active: owns a game, or has a campaign running now. Checked against all games and approved bookings.
  const today = new Date().toISOString().slice(0, 10);
  const [{ data: games }, { data: campaigns }, firstBookings, layout] = await Promise.all([
    admin.service.from("games").select("owner_id"),
    admin.service.from("campaigns").select("advertiser_id"),
    admin.service.from("bookings").select("advertiser_id, status, starts_on, ends_on").eq("status", "approved"),
    userClient().then((db) => loadDeckLayout(db, "admin_users")),
  ]);
  // starts_on / ends_on come with migration 0013; without them a booking has no dates.
  let bookings = firstBookings.data;
  if (isSchemaOutdated(firstBookings.error)) {
    ({ data: bookings } = await admin.service.from("bookings").select("advertiser_id, status").eq("status", "approved"));
  }
  const active = activeAccountIds((games ?? []).map((game) => game.owner_id), bookings, today);
  const tally = (rows, key) => rows.reduce((m, row) => m.set(row[key], (m.get(row[key]) ?? 0) + 1), new Map());

  const withAvatars = (accounts ?? []).map((account) => ({
    ...account,
    avatarUrl: account.avatar_path ? admin.service.storage.from("creatives").getPublicUrl(account.avatar_path).data.publicUrl : null,
  }));
  const rows = userRows({ accounts: withAvatars, gamesOf: tally(games ?? [], "owner_id"), campaignsOf: tally(campaigns ?? [], "advertiser_id"), active, selfId: admin.user.id });

  return <UsersView rows={rows} widgets={userWidgets(rows)} groups={USER_GROUPS} defaults={USER_DEFAULTS} layout={layout} />;
}
