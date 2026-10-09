import Link from "next/link";
import { redirect } from "next/navigation";
import { getMember } from "../../../lib/admin";
import { isSchemaOutdated } from "../../../lib/api";
import { bookingsMissing } from "../../../lib/booking-rules";
import { loadBookings } from "../../../lib/bookings-data";
import { AD_CATEGORIES, categoryLabel } from "../../../lib/categories";
import { SORTS, advertisersOf, filterBookings, sortBookings } from "../../../lib/now-showing";
import BookingRow from "../booking-row";
import BlocksPanel from "./blocks-panel";

export const dynamic = "force-dynamic";
export const metadata = { title: "Now showing" };

export default async function NowShowingPage({ searchParams }) {
  const me = await getMember();
  if (!me) redirect("/login");

  const params = await searchParams;
  const category = String(params.category ?? "");
  const advertiser = String(params.advertiser ?? "");
  const status = ["open", "closed", "all"].includes(params.status) ? params.status : "open";
  const sort = Object.hasOwn(SORTS, params.sort) ? params.sort : "newest";

  const { bookings: all, error } = await loadBookings(me.service, (query) => query.eq("developer_id", me.user.id), { limit: 300 });
  const shown = sortBookings(filterBookings(all, { category, advertiser, status }), sort);

  // Blocks and the restricted switch come with migration 0015; without it they are simply empty.
  const blockResult = await me.service
    .from("developer_blocks")
    .select("id, kind, advertiser_id, creative_id, category")
    .eq("developer_id", me.user.id);
  const outdated = Boolean(blockResult.error) && (isSchemaOutdated(blockResult.error) || blockResult.error.code === "42P01");
  const rawBlocks = outdated ? [] : (blockResult.data ?? []);
  const names = new Map();
  const ids = [...new Set(rawBlocks.flatMap((block) => [block.advertiser_id, block.creative_id]).filter(Boolean))];
  if (ids.length) {
    const [accounts, creatives] = await Promise.all([
      me.service.from("accounts").select("id, email, company").in("id", ids),
      me.service.from("creatives").select("id, name").in("id", ids),
    ]);
    for (const row of accounts.data ?? []) names.set(row.id, row.company || row.email);
    for (const row of creatives.data ?? []) names.set(row.id, row.name);
  }
  const blocks = rawBlocks.map((block) => ({
    id: block.id,
    kindLabel: { advertiser: "Advertiser", creative: "Creative", category: "Category" }[block.kind],
    name: block.kind === "category" ? categoryLabel(block.category) : (names.get(block.advertiser_id ?? block.creative_id) ?? "Unknown"),
  }));
  const { data: account } = outdated
    ? { data: null }
    : await me.service.from("accounts").select("allow_restricted").eq("id", me.user.id).maybeSingle();

  const query = (next) => {
    const merged = { category, advertiser, status, sort, ...next };
    const search = new URLSearchParams(Object.entries(merged).filter(([, value]) => value && value !== "newest"));
    return `/dashboard/requests${search.size ? `?${search}` : ""}`;
  };

  return (
    <>
      <div className="main-head">
        <h1>Now showing</h1>
      </div>
      <p className="lede">
        Advertisers book your open placements and go live right away; several can share one placement and take
        turns, and your own creative shows when none is booked. You decide what stays: stop one ad, or block an
        advertiser or a whole category.
      </p>

      {bookingsMissing(error) && (
        <p className="notice">
          Run <code>supabase/migrations/0009_campaigns_and_bookings.sql</code> in the Supabase SQL editor to
          turn bookings on.
        </p>
      )}
      {outdated && (
        <p className="notice">
          Run <code>supabase/migrations/0015_open_marketplace.sql</code> in the Supabase SQL editor to turn on
          blocking and categories.
        </p>
      )}

      <nav className="chips" aria-label="Filter ads">
        {[["open", "Live and waiting"], ["closed", "Closed"], ["all", "All"]].map(([key, label]) => (
          <Link key={key} href={query({ status: key })} aria-current={status === key ? "page" : undefined}>
            {label}
          </Link>
        ))}
      </nav>
      <form className="row" method="get" action="/dashboard/requests" style={{ margin: "0.75rem 0" }}>
        <input type="hidden" name="status" value={status} />
        <select className="field" name="category" defaultValue={category} aria-label="Category">
          <option value="">All categories</option>
          {AD_CATEGORIES.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
        <select className="field" name="advertiser" defaultValue={advertiser} aria-label="Advertiser">
          <option value="">All advertisers</option>
          {advertisersOf(all).map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <select className="field" name="sort" defaultValue={sort} aria-label="Sort by">
          {Object.entries(SORTS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <button className="button" type="submit">
          Apply
        </button>
      </form>

      {shown.length ? (
        <div className="panel" style={{ padding: 0 }}>
          <table>
            <tbody>
              {shown.map((booking) => (
                <BookingRow key={booking.id} booking={booking} view="developer" />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty">
          <p style={{ margin: "0 auto" }}>Nothing matches. Ads appear here when advertisers book your open placements.</p>
        </div>
      )}

      <h2 style={{ margin: "2.5rem 0 0.75rem" }}>Blocks and categories</h2>
      <BlocksPanel blocks={blocks} allowRestricted={Boolean(account?.allow_restricted)} />
    </>
  );
}
