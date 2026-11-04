// The bell's 'Needs action' items are notifications: once a person opens one it leaves the bell and the counter goes
// down (migration 0059, table attention_seen). Each item carries a signature (sig, see lib/advertiser-overview.js); an
// item is hidden while its signature was opened and comes back when the signature changes, that is when the news
// changed (another format missing, another end date). Nothing here touches the Home page: Needs attention there stays.

const KEEP_DAYS = 90;
const outdated = (error) => Boolean(error) && ["42P01", "42703", "PGRST205", "PGRST204"].includes(error.code);

/** The items whose signature has not been opened. `seen` is a Set of signatures, or null when nothing is remembered. */
export function unseen(items, seen) {
  if (!seen || seen.size === 0) return items;
  return items.filter((item) => !seen.has(item.sig ?? item.key));
}

/** The signatures this account has opened (a Set), or null when the table is missing. */
export async function loadSeen(service, accountId) {
  if (!accountId) return null;
  const result = await service.from("attention_seen").select("sig").eq("account_id", accountId).limit(2000);
  if (result.error) return null; // the table is not there yet (migration 0059): nothing is remembered
  return new Set((result.data ?? []).map((row) => row.sig));
}

/** Remembers that these signatures were opened. Old rows (90 days) are dropped on the way. Returns { ok } or { error }. */
export async function markSeen(service, accountId, sigs) {
  const clean = [...new Set((sigs ?? []).map((sig) => String(sig ?? "").slice(0, 200)).filter(Boolean))].slice(0, 50);
  if (!accountId || clean.length === 0) return { error: "Nothing to mark." };
  const stamp = new Date().toISOString();
  const saved = await service.from("attention_seen").upsert(clean.map((sig) => ({ account_id: accountId, sig, seen_at: stamp })), { onConflict: "account_id,sig" });
  if (saved.error) return { error: outdated(saved.error) ? "not-migrated" : "Could not save." };
  const cutoff = new Date(Date.now() - KEEP_DAYS * 86400000).toISOString();
  await service.from("attention_seen").delete().eq("account_id", accountId).lt("seen_at", cutoff);
  return { ok: true };
}
