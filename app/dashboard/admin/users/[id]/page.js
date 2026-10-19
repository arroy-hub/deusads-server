import { notFound, redirect } from "next/navigation";
import { getAdmin } from "../../../../../lib/admin";
import { loadUserCard } from "../../../../../lib/admin-cards-data";
import AdminAccountPage from "./account-page";

export const dynamic = "force-dynamic";
export const metadata = { title: "Account" };

/** Someone else's account page, for an admin (mockup userA). */
export default async function UserAccountPage({ params, searchParams }) {
  const admin = await getAdmin();
  if (!admin) notFound();
  const { id } = await params;
  // Your own account is the ordinary page, without the admin strip.
  if (id === admin.user.id) redirect("/dashboard/account");
  const u = await loadUserCard(admin.service, id, admin.user.id);
  if (!u) notFound();
  const { tab } = await searchParams;
  return <AdminAccountPage u={u} initialTab={tab} />;
}
