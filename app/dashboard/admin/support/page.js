import { notFound } from "next/navigation";
import { getAdmin } from "../../../../lib/admin";
import { loadAdminRequests } from "../../../../lib/support-data";
import AdminSupport from "./admin-support";

export const dynamic = "force-dynamic";
export const metadata = { title: "Support" };

export default async function AdminSupportPage({ searchParams }) {
  const admin = await getAdmin();
  if (!admin) notFound();
  const { tab, open } = await searchParams;
  const loaded = await loadAdminRequests(admin.service);
  return (
    <AdminSupport
      requests={loaded.requests}
      outdated={loaded.outdated}
      serverNow={Date.now()}
      initialTab={tab === "all" ? "all" : "queue"}
      initialOpen={typeof open === "string" ? open : null}
    />
  );
}
