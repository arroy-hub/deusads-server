// Filtering and sorting for the developer's "Now showing" list. Pure, so it can be tested.

export const SORTS = {
  newest: "Newest first",
  advertiser: "Advertiser A–Z",
  category: "Category",
  game: "Game",
};

/** Only live/scheduled/waiting bookings show by default; "all" adds the closed ones. */
const OPEN = new Set(["approved", "pending"]);

export function filterBookings(bookings, { category = "", advertiser = "", status = "open" } = {}) {
  return bookings.filter((booking) => {
    if (category && booking.category !== category) return false;
    if (advertiser && booking.advertiserId !== advertiser) return false;
    if (status === "open" && !OPEN.has(booking.status)) return false;
    if (status === "closed" && OPEN.has(booking.status)) return false;
    return true;
  });
}

export function sortBookings(bookings, sort = "newest") {
  const copy = [...bookings];
  const text = (a, b) => String(a).localeCompare(String(b));
  if (sort === "advertiser") copy.sort((a, b) => text(a.advertiser, b.advertiser) || text(b.created, a.created));
  else if (sort === "category") copy.sort((a, b) => text(a.category, b.category) || text(a.advertiser, b.advertiser));
  else if (sort === "game") copy.sort((a, b) => text(a.game, b.game) || text(a.placement, b.placement));
  else copy.sort((a, b) => text(b.created, a.created));
  return copy;
}

/** Distinct advertisers in the list, for the filter. */
export function advertisersOf(bookings) {
  const seen = new Map();
  for (const booking of bookings) if (!seen.has(booking.advertiserId)) seen.set(booking.advertiserId, booking.advertiser);
  return [...seen].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
}
