import { notFound } from "next/navigation";
import { getAdmin } from "../../../../lib/admin";
import { isSchemaOutdated } from "../../../../lib/api";
import { activeAccountIds } from "../../../../lib/admin-rules";
import AddUserDialog from "./add-user-dialog";
import UsersTable from "./users-table";

export const dynamic = "force-dynamic";
export const metadata = { title: "Users" };

export default async function UsersPage() {
  const admin = await getAdmin();
  if (!admin) notFound();

  // suspended_at comes with migration 0015.
  const list = (columns) => admin.service.from("accounts").select(columns).order("created_at", { ascending: true });
  let { data: accounts, error } = await list("id, email, company, role, created_at, suspended_at");
  if (isSchemaOutdated(error)) ({ data: accounts } = await list("id, email, company, role, created_at"));

  // Active: owns a game, or has a campaign running now. Checked against all games and approved bookings.
  const today = new Date().toISOString().slice(0, 10);
  const [{ data: games }, firstBookings] = await Promise.all([
    admin.service.from("games").select("owner_id"),
    admin.service.from("bookings").select("advertiser_id, status, starts_on, ends_on").eq("status", "approved"),
  ]);
  // starts_on / ends_on come with migration 0013; without them a booking has no dates.
  let bookings = firstBookings.data;
  if (isSchemaOutdated(firstBookings.error)) {
    ({ data: bookings } = await admin.service.from("bookings").select("advertiser_id, status").eq("status", "approved"));
  }
  const active = activeAccountIds((games ?? []).map((game) => game.owner_id), bookings, today);

  const rows = (accounts ?? []).map((account) => ({
    id: account.id,
    company: account.company ?? "",
    email: account.email ?? "",
    role: account.role,
    joined: String(account.created_at).slice(0, 10),
    active: active.has(account.id),
    suspended: Boolean(account.suspended_at),
  }));

  return (
    <>
      <div className="main-head">
        <h1>Users</h1>
        <AddUserDialog />
      </div>
      <p className="lede">
        Every account on the platform. Click a column title to sort. Status is <strong>active</strong> for an account
        that has a game or a campaign running now, <strong>inactive</strong> otherwise. Here you can add a user, give
        the admin role (not to yourself) or suspend an account, which signs it out of the dashboard and stops its ads.
      </p>

      <UsersTable rows={rows} selfId={admin.user.id} />
    </>
  );
}
