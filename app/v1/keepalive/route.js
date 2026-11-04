import { guarded, json, logDbError, preflight, serviceClient } from "../../../lib/api";

export const dynamic = "force-dynamic";

export const OPTIONS = preflight;

// A few small reads on different tables count as real database activity for Supabase's inactivity check
// (a Free project with no queries for 7 days is paused). Nothing is written and nothing is returned beyond
// "ok", so the route can stay public: Vercel Cron and the GitHub Actions backup call it without a secret.
const TABLES = ["games", "campaigns", "accounts"];

// Repeated calls within a minute are answered from the last result, so the route cannot be used to hammer the database.
const REUSE_MS = 60 * 1000;
let last = null;

/**
 * GET /v1/keepalive
 * Keeps the Supabase Free project awake. 200 {ok:true} when the database answered, 503 when it did not,
 * so a scheduled caller that expects success fails visibly (GitHub e-mails the owner about a failed run).
 */
export const GET = guarded(async function GET() {
  if (last && Date.now() - last.at < REUSE_MS) return json({ ok: true, checkedAt: new Date(last.at).toISOString() });

  const db = serviceClient();
  const answers = await Promise.all(TABLES.map((table) => db.from(table).select("id").limit(1)));
  const failed = answers.find((a) => a.error);
  if (failed) {
    logDbError("keepalive", failed.error);
    return json({ ok: false, error: "The database did not answer." }, 503);
  }

  last = { at: Date.now() };
  return json({ ok: true, checkedAt: new Date(last.at).toISOString() });
});
