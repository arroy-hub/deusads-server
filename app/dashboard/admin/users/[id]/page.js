import { notFound, redirect } from "next/navigation";
import { getAdmin } from "../../../../../lib/admin";
import { userClient } from "../../../../../lib/supabase-server";
import { loadAccountView } from "../../../../../lib/account-data";
import { countryOptions } from "../../../../../lib/account-rules";
import AccountPage from "../../../account/account-page";

export const dynamic = "force-dynamic";
export const metadata = { title: "Account" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Someone else's account page, for an admin: the one the owner sees, with the admin strip on top. */
export default async function UserAccountPage({ params, searchParams }) {
  const admin = await getAdmin();
  if (!admin) notFound();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  // Your own account is the ordinary page, without the admin strip.
  if (id === admin.user.id) redirect("/dashboard/account");
  const view = await loadAccountView({ service: admin.service, db: await userClient(), id, self: false });
  if (!view) notFound();
  const { tab } = await searchParams;
  return <AccountPage view={view} admin countries={countryOptions()} initialTab={tab} />;
}
