import { notFound } from "next/navigation";
import { getAdmin } from "../../../../lib/admin";
import { loadAppliedVersions } from "../../../../lib/schema-versions";
import { migrationStatus, unknownVersions } from "../../../../lib/migrations";
import SystemView from "./system-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "System" };

export default async function SystemPage() {
  const admin = await getAdmin();
  if (!admin) notFound();
  const applied = await loadAppliedVersions(admin.service);
  return <SystemView rows={migrationStatus(applied)} tracked={applied !== null} ahead={unknownVersions(applied)} />;
}
