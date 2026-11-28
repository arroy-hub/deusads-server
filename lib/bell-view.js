// Which side of the platform a notification belongs to, read from where it leads. An admin has all three sides in one
// account and looks at one of them at a time (the role under the logo): the bell follows that choice. Pure.

const ADVERTISER = ["/dashboard/advertising", "/dashboard/creatives", "/dashboard/overview"];
const DEVELOPER = ["/dashboard/g/", "/dashboard/games", "/dashboard/wallet/earnings"];

/** "admin" | "advertiser" | "developer", or "any" for what concerns the account whatever the side (support replies, sign-in). */
export function sideOfLink(link) {
  const href = String(link ?? "");
  if (href.startsWith("/dashboard/admin")) return "admin";
  if (DEVELOPER.some((start) => href.startsWith(start))) return "developer";
  // a developer's report on a creative lives under My requests
  if (href.startsWith("/dashboard/support") && href.includes("report=")) return "developer";
  if (ADVERTISER.some((start) => href.startsWith(start))) return "advertiser";
  if (href === "/dashboard/wallet" || href.startsWith("/dashboard/wallet?")) return "advertiser";
  return "any";
}

/** The notifications a view shows: its own side and what belongs to no side. */
export function forView(items, view) {
  return (items ?? []).filter((item) => {
    const side = sideOfLink(item?.link);
    return side === "any" || side === view;
  });
}
