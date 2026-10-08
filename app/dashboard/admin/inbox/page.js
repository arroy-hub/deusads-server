import Link from "next/link";
import { notFound } from "next/navigation";
import { getAdmin } from "../../../../lib/admin";
import { loadBookings } from "../../../../lib/bookings-data";
import ReviewRow from "../review-row";
import BookingRow from "../../booking-row";
import ApplicationRow from "../applications/application-row";

export const dynamic = "force-dynamic";
export const metadata = { title: "Inbox" };

const SHOWN = 10;

export default async function InboxPage({ searchParams }) {
  const admin = await getAdmin();
  if (!admin) notFound();
  const { service } = admin;
  const { show = "all" } = await searchParams;

  const [creativeResult, { bookings }, applicationResult] = await Promise.all([
    service
      .from("creatives")
      .select("id, name, storage_path, width_px, height_px, status, created_at, accounts(email, company)")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(SHOWN),
    loadBookings(service, (query) => query.eq("status", "pending").eq("admin_decision", "pending"), { limit: SHOWN }),
    service
      .from("role_requests")
      .select("id, company, message, status, review_note, created_at, accounts(email)")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(SHOWN),
  ]);

  const creatives = (creativeResult.data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    url: service.storage.from("creatives").getPublicUrl(row.storage_path).data.publicUrl,
    size: row.width_px && row.height_px ? `${row.width_px} × ${row.height_px}` : "—",
    status: row.status,
    note: "",
    owner: row.accounts?.company || row.accounts?.email || "Unknown",
    email: row.accounts?.email ?? "",
    created: String(row.created_at).slice(0, 10),
  }));
  const applications = (applicationResult.data ?? []).map((row) => ({
    id: row.id,
    company: row.company,
    message: row.message ?? "",
    status: row.status,
    note: row.review_note ?? "",
    email: row.accounts?.email ?? "",
    created: String(row.created_at).slice(0, 10),
  }));

  const sections = [
    { key: "creatives", title: "Creatives", items: creatives, all: "/dashboard/admin", render: (item) => <ReviewRow key={item.id} creative={item} canNote /> },
    { key: "bookings", title: "Bookings", items: bookings, all: "/dashboard/admin/bookings", render: (item) => <BookingRow key={item.id} booking={item} view="admin" /> },
    { key: "applications", title: "Advertiser applications", items: applications, all: "/dashboard/admin/applications", render: (item) => <ApplicationRow key={item.id} application={item} /> },
  ];
  const total = sections.reduce((sum, section) => sum + section.items.length, 0);
  const visible = sections.filter((section) => show === "all" || show === section.key);

  return (
    <>
      <div className="main-head">
        <h1>Inbox</h1>
      </div>
      <p className="lede">Everything waiting for a decision from DeusADS, in one place.</p>

      <nav className="chips" aria-label="Filter inbox">
        <Link href="/dashboard/admin/inbox" aria-current={show === "all" ? "page" : undefined}>
          All · {total}
        </Link>
        {sections.map((section) => (
          <Link key={section.key} href={`/dashboard/admin/inbox?show=${section.key}`} aria-current={show === section.key ? "page" : undefined}>
            {section.title} · {section.items.length}
          </Link>
        ))}
      </nav>

      {total === 0 ? (
        <div className="empty">
          <p style={{ margin: "0 auto" }}>
            All clear. Nothing is waiting. <Link href="/dashboard/admin/bookings">See all bookings</Link>
          </p>
        </div>
      ) : (
        visible.map((section) =>
          section.items.length ? (
            <section key={section.key} style={{ marginBottom: "2rem" }}>
              <h2 style={{ marginBottom: "0.75rem" }}>{section.title}</h2>
              <div className="panel" style={{ padding: 0 }}>
                <table>
                  <tbody>{section.items.map(section.render)}</tbody>
                </table>
              </div>
              {section.items.length >= SHOWN && (
                <p className="todo-sub" style={{ marginTop: "0.5rem" }}>
                  Showing the oldest {SHOWN}. <Link href={section.all}>Open the full list</Link>
                </p>
              )}
            </section>
          ) : null
        )
      )}
    </>
  );
}
