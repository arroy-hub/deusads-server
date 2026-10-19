import { notFound } from "next/navigation";
import { getAdmin } from "../../../../lib/admin";
import { isSchemaOutdated } from "../../../../lib/api";
import { loadDisputeRows } from "../../../../lib/admin-cards-data";
import { disputeWidgets, DISPUTE_GROUPS, DISPUTE_DEFAULTS } from "../../../../lib/admin-disputes";
import { userClient } from "../../../../lib/supabase-server";
import { loadDeckLayout } from "../../../../lib/deck-layout-data";
import { Band } from "../ui";
import DisputesView from "./disputes-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Disputes" };

export default async function DisputesPage() {
  const admin = await getAdmin();
  if (!admin) notFound();

  const [{ rows, error }, layout] = await Promise.all([loadDisputeRows(admin.service), userClient().then((db) => loadDeckLayout(db, "admin_disputes"))]);
  if (error) {
    return (
      <>
        <Band title="Disputes" />
        <p className="notice">
          {isSchemaOutdated(error) || error.code === "42P01" ? (
            <>Run <code>supabase/migrations/0024_digest_signal_disputes.sql</code> in the Supabase SQL editor to turn disputes on.</>
          ) : (
            "The reports could not be read just now. Reload the page."
          )}
        </p>
      </>
    );
  }
  return <DisputesView rows={rows} widgets={disputeWidgets(rows)} groups={DISPUTE_GROUPS} defaults={DISPUTE_DEFAULTS} layout={layout} />;
}
