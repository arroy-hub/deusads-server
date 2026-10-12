import { notFound } from "next/navigation";
import Link from "next/link";
import { getAdmin } from "../../../../lib/admin";
import { isSchemaOutdated } from "../../../../lib/api";
import { categoryLabel } from "../../../../lib/categories";
import DisputeRow from "./dispute-row";

export const dynamic = "force-dynamic";
export const metadata = { title: "Disputes" };

const who = (account) => account?.company || account?.email || "Unknown";

export default async function DisputesPage({ searchParams }) {
  const admin = await getAdmin();
  if (!admin) notFound();
  const params = await searchParams;
  const tab = params.status === "done" ? "done" : "open";

  const read = (status) =>
    admin.service
      .from("creative_disputes")
      .select("id, game_id, developer_id, creative_id, campaign_id, reason, comment, status, outcome, created_at, resolved_at")
      .eq("status", status)
      .order(status === "open" ? "created_at" : "resolved_at", { ascending: false })
      .limit(200);
  const [open, done] = await Promise.all([read("open"), read("resolved")]);
  const failure = open.error ?? done.error;
  if (failure) {
    return (
      <>
        <div className="main-head"><h1>Disputes</h1></div>
        <p className="notice">
          {isSchemaOutdated(failure) || failure.code === "42P01" ? (
            <>Run <code>supabase/migrations/0024_digest_signal_disputes.sql</code> in the Supabase SQL editor to turn disputes on.</>
          ) : (
            "The reports could not be read just now. Reload the page."
          )}
        </p>
      </>
    );
  }

  const rows = tab === "open" ? open.data : done.data;
  const ids = (key) => [...new Set(rows.map((row) => row[key]).filter(Boolean))];
  const [creatives, games, accounts, campaigns] = await Promise.all([
    admin.service.from("creatives").select("id, name, storage_path, ad_category, owner_id, width_px, height_px").in("id", ids("creative_id")),
    admin.service.from("games").select("id, name").in("id", ids("game_id")),
    admin.service.from("accounts").select("id, email, company").in("id", ids("developer_id")),
    admin.service.from("campaigns").select("id, name").in("id", ids("campaign_id")),
  ]);
  const owners = await admin.service.from("accounts").select("id, email, company").in("id", [...new Set((creatives.data ?? []).map((row) => row.owner_id).filter(Boolean))]);
  const by = (result) => new Map((result.data ?? []).map((row) => [row.id, row]));
  const creativeOf = by(creatives);
  const gameOf = by(games);
  const developerOf = by(accounts);
  const campaignOf = by(campaigns);
  const ownerOf = by(owners);
  const when = (iso) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC";

  const items = rows.map((row) => {
    const creative = creativeOf.get(row.creative_id);
    return {
      id: row.id,
      creative: creative?.name ?? "Creative",
      url: creative?.storage_path ? admin.service.storage.from("creatives").getPublicUrl(creative.storage_path).data.publicUrl : "",
      advertiser: who(ownerOf.get(creative?.owner_id)),
      campaign: campaignOf.get(row.campaign_id)?.name ?? "—",
      category: categoryLabel(creative?.ad_category ?? "other"),
      game: gameOf.get(row.game_id)?.name ?? "Game",
      developer: who(developerOf.get(row.developer_id)),
      when: when(row.created_at),
      reason: row.reason,
      comment: row.comment ?? "",
      open: row.status === "open",
      outcome: row.outcome === "removed" ? "Creative removed · bookings unchanged · developer notified" : row.outcome === "dismissed" ? "Dismissed · developer notified" : "",
    };
  });

  return (
    <>
      <div className="main-head"><h1>Disputes</h1></div>
      <p className="lede">
        Reports from developers about creatives running in their games. You can remove a creative that breaks platform rules. Bookings are never
        changed here: that stays between the advertiser and the developer. The developer is notified of the outcome.
      </p>
      <div className="cp-seg" role="group" aria-label="Status" style={{ marginBottom: 12 }}>
        <Link href="/dashboard/admin/disputes" className="cp-seg-link" aria-current={tab === "open" ? "page" : undefined}>Open ({open.data.length})</Link>
        <Link href="/dashboard/admin/disputes?status=done" className="cp-seg-link" aria-current={tab === "done" ? "page" : undefined}>Resolved ({done.data.length})</Link>
      </div>
      {items.length ? (
        <div className="panel" style={{ padding: 0 }}>
          <table>
            <tbody>
              {items.map((item) => <DisputeRow key={item.id} item={item} />)}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty"><p style={{ margin: "0 auto" }}>Nothing here.</p></div>
      )}
    </>
  );
}
