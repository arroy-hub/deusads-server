import { redirect } from "next/navigation";
import { getMember } from "../../../lib/admin";
import { userClient } from "../../../lib/supabase-server";
import { loadAccountView } from "../../../lib/account-data";
import { countryOptions } from "../../../lib/account-rules";
import AccountPage from "./account-page";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your account" };

export default async function OwnAccountPage({ searchParams }) {
  const me = await getMember();
  if (!me) redirect("/login");
  const view = await loadAccountView({ service: me.service, db: await userClient(), id: me.user.id, self: true });
  if (!view) redirect("/dashboard");
  const { tab } = await searchParams;
  return <AccountPage view={view} countries={countryOptions()} initialTab={tab} />;
}
