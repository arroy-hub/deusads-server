import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { RESET_COOKIE, resetValid, unseal } from "../../../lib/session-policy";
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
  // Arrived from a password-reset link: a new password can be set without the old one for a while.
  const fromResetLink = resetValid(await unseal((await cookies()).get(RESET_COOKIE)?.value), me.user.id);
  return <AccountPage view={{ ...view, fromResetLink }} countries={countryOptions()} initialTab={tab} />;
}
